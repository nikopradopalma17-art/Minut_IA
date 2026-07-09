mod clustering;
mod download;
mod embedding;
mod features;
mod types;

use anyhow::anyhow;
use log::info;
use sqlx::Connection;
use std::path::Path;
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::audio::decoder::decode_audio_file;
use crate::database::models::{MeetingModel, Transcript};
use crate::database::repositories::speaker_name::SpeakerNamesRepository;
use crate::state::AppState;

pub use clustering::{assign_speaker_labels, cluster_embeddings};
pub use features::{extract_fbank_features, FeatureExtractionConfig};
pub use types::{DiarizationAssignment, DiarizationSample, SpeakerNameEntry};

const DEFAULT_CLUSTER_DISTANCE_THRESHOLD: f32 = 0.40;
const MIC_LABEL: &str = "speaker_0";

#[tauri::command]
pub async fn diarize_meeting<R: Runtime>(
    app: AppHandle<R>,
    meeting_id: String,
) -> Result<usize, String> {
    info!("Starting diarization for meeting {}", meeting_id);

    let app_state = app
        .try_state::<AppState>()
        .ok_or_else(|| "App state not available".to_string())?;

    let pool = app_state.db_manager.pool();

    let meeting: MeetingModel = sqlx::query_as(
        "SELECT id, title, created_at, updated_at, folder_path FROM meetings WHERE id = ?",
    )
    .bind(&meeting_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Failed to load meeting metadata: {}", e))?
    .ok_or_else(|| format!("Meeting '{}' not found", meeting_id))?;

    let folder_path = meeting
        .folder_path
        .clone()
        .ok_or_else(|| format!("Meeting '{}' has no folder_path", meeting_id))?;

    let audio_path = find_audio_file(Path::new(&folder_path))
        .map_err(|e| format!("Failed to locate audio file: {}", e))?;

    let transcripts: Vec<Transcript> = sqlx::query_as(
        "SELECT * FROM transcripts WHERE meeting_id = ? ORDER BY audio_start_time ASC, timestamp ASC",
    )
    .bind(&meeting_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to load meeting transcripts: {}", e))?;

    if transcripts.is_empty() {
        return Err("No transcripts found for meeting".to_string());
    }

    let slices = build_transcript_slices(&transcripts);
    if slices.is_empty() {
        return Err("No diarizable transcript slices found".to_string());
    }

    let model_path = download::ensure_wespeaker_model(&app)
        .await
        .map_err(|e| e.to_string())?;

    let assignments = tokio::task::spawn_blocking(move || {
        let decoded = decode_audio_file(&audio_path)
            .map_err(|e| anyhow!("Failed to decode audio file: {}", e))?;

        let whisper_audio = decoded.to_whisper_format();
        if whisper_audio.is_empty() {
            return Err(anyhow!("Decoded audio is empty"));
        }

        let feature_config = FeatureExtractionConfig::default();
        let mut model = embedding::SpeakerEmbeddingModel::load(&model_path)?;

        let candidates = build_speaker_candidates(&whisper_audio, &slices, &feature_config, &mut model)?;
        let assignments = assign_speaker_labels(&candidates, DEFAULT_CLUSTER_DISTANCE_THRESHOLD);
        Ok::<_, anyhow::Error>(assignments)
    })
    .await
    .map_err(|e| format!("Diarization task panicked: {}", e))?
    .map_err(|e| e.to_string())?;

    let mut conn = pool
        .acquire()
        .await
        .map_err(|e| format!("Failed to open diarization connection: {}", e))?;
    let mut tx = conn
        .begin()
        .await
        .map_err(|e| format!("Failed to start diarization transaction: {}", e))?;

    for assignment in &assignments {
        sqlx::query("UPDATE transcripts SET speaker = ? WHERE id = ?")
            .bind(&assignment.speaker)
            .bind(&assignment.id)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("Failed to update speaker label for {}: {}", assignment.id, e))?;
    }

    let canonical_speakers = collect_canonical_speakers(&assignments);
    SpeakerNamesRepository::upsert_defaults(&mut *tx, &meeting_id, &canonical_speakers)
        .await
        .map_err(|e| format!("Failed to seed speaker names: {}", e))?;

    tx.commit()
        .await
        .map_err(|e| format!("Failed to commit diarization transaction: {}", e))?;

    let speaker_count = assignments
        .iter()
        .filter_map(|assignment| assignment.cluster_index)
        .max()
        .map(|max_cluster| max_cluster + 1)
        .unwrap_or(0);

    let _ = app.emit(
        "diarization-complete",
        serde_json::json!({
            "meeting_id": meeting_id,
            "speaker_count": speaker_count,
            "segments_updated": assignments.len(),
        }),
    );

    Ok(speaker_count)
}

#[tauri::command]
pub async fn rename_speaker<R: Runtime>(
    app: AppHandle<R>,
    meeting_id: String,
    speaker_id: String,
    display_name: String,
) -> Result<(), String> {
    let app_state = app
        .try_state::<AppState>()
        .ok_or_else(|| "App state not available".to_string())?;

    let pool = app_state.db_manager.pool();
    SpeakerNamesRepository::upsert_display_name(pool, &meeting_id, &speaker_id, &display_name)
        .await
        .map_err(|e| format!("Failed to rename speaker: {}", e))?;

    let _ = app.emit(
        "speaker-name-updated",
        serde_json::json!({
            "meeting_id": meeting_id,
            "speaker_id": speaker_id,
            "display_name": display_name,
        }),
    );

    Ok(())
}

#[tauri::command]
pub async fn list_speaker_names<R: Runtime>(
    app: AppHandle<R>,
    meeting_id: String,
) -> Result<Vec<SpeakerNameEntry>, String> {
    let app_state = app
        .try_state::<AppState>()
        .ok_or_else(|| "App state not available".to_string())?;

    let pool = app_state.db_manager.pool();
    let rows = SpeakerNamesRepository::list_for_meeting(pool, &meeting_id)
        .await
        .map_err(|e| format!("Failed to list speaker names: {}", e))?;

    Ok(rows
        .into_iter()
        .map(|row| SpeakerNameEntry {
            speaker_id: row.speaker_id,
            display_name: row.display_name,
        })
        .collect())
}

fn build_speaker_candidates(
    whisper_audio: &[f32],
    slices: &[TranscriptSlice],
    feature_config: &FeatureExtractionConfig,
    model: &mut embedding::SpeakerEmbeddingModel,
) -> anyhow::Result<Vec<DiarizationSample>> {
    let mut samples = Vec::with_capacity(slices.len());

    for slice in slices {
        let speaker_hint = slice.speaker_hint.clone();
        if is_mic_label(speaker_hint.as_deref()) {
            samples.push(DiarizationSample {
                id: slice.id.clone(),
                speaker_hint,
                embedding: Vec::new(),
            });
            continue;
        }

        let Some((start_index, end_index)) = slice_to_sample_range(
            slice.audio_start_time,
            slice.audio_end_time,
            16_000,
            whisper_audio.len(),
        ) else {
            samples.push(DiarizationSample {
                id: slice.id.clone(),
                speaker_hint,
                embedding: Vec::new(),
            });
            continue;
        };

        let audio_slice = &whisper_audio[start_index..end_index];
        let features = extract_fbank_features(audio_slice, feature_config)?;
        let embedding = model.embed(&features)?;

        samples.push(DiarizationSample {
            id: slice.id.clone(),
            speaker_hint,
            embedding,
        });
    }

    Ok(samples)
}

fn collect_canonical_speakers(assignments: &[DiarizationAssignment]) -> Vec<String> {
    let mut labels = vec![MIC_LABEL.to_string()];
    let mut seen = std::collections::BTreeSet::new();

    for assignment in assignments {
        if let Some(speaker) = &assignment.speaker {
            if speaker == MIC_LABEL {
                continue;
            }

            if seen.insert(speaker.clone()) {
                labels.push(speaker.clone());
            }
        }
    }

    labels
}

#[derive(Debug, Clone)]
struct TranscriptSlice {
    id: String,
    audio_start_time: f64,
    audio_end_time: f64,
    speaker_hint: Option<String>,
}

fn build_transcript_slices(transcripts: &[Transcript]) -> Vec<TranscriptSlice> {
    transcripts
        .iter()
        .filter_map(|transcript| {
            let (Some(start), Some(end)) = (transcript.audio_start_time, transcript.audio_end_time) else {
                return None;
            };

            if end <= start {
                return None;
            }

            Some(TranscriptSlice {
                id: transcript.id.clone(),
                audio_start_time: start,
                audio_end_time: end,
                speaker_hint: transcript.speaker.clone(),
            })
        })
        .collect()
}

fn find_audio_file(folder: &Path) -> anyhow::Result<std::path::PathBuf> {
    let candidates = [
        "audio.mp4",
        "audio.m4a",
        "audio.wav",
        "audio.mp3",
        "audio.flac",
        "audio.ogg",
        "recording.mp4",
        "audio.mkv",
        "audio.webm",
        "audio.wma",
    ];

    for candidate in candidates {
        let path = folder.join(candidate);
        if path.exists() {
            return Ok(path);
        }
    }

    if let Ok(entries) = std::fs::read_dir(folder) {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(ext) = path.extension().and_then(|value| value.to_str()) {
                let ext = ext.to_lowercase();
                if crate::audio::constants::AUDIO_EXTENSIONS.contains(&ext.as_str()) {
                    return Ok(path);
                }
            }
        }
    }

    Err(anyhow!("No audio file found in {}", folder.display()))
}

fn slice_to_sample_range(
    start_seconds: f64,
    end_seconds: f64,
    sample_rate: u32,
    max_len: usize,
) -> Option<(usize, usize)> {
    if !start_seconds.is_finite() || !end_seconds.is_finite() || end_seconds <= start_seconds {
        return None;
    }

    let start = (start_seconds.max(0.0) * sample_rate as f64).floor() as usize;
    let end = (end_seconds.max(0.0) * sample_rate as f64).ceil() as usize;

    if start >= max_len {
        return None;
    }

    let end = end.min(max_len);
    if end <= start {
        return None;
    }

    Some((start, end))
}

fn is_mic_label(label: Option<&str>) -> bool {
    matches!(
        label.map(|value| value.trim().to_lowercase()),
        Some(ref value) if value == "mic" || value == "microphone" || value == MIC_LABEL
    )
}

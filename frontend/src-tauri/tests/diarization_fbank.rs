use app_lib::diarization::{extract_fbank_features, FeatureExtractionConfig};
use std::fs::File;
use std::io::Write;
use std::path::PathBuf;
use std::process::Command;

fn write_sine_wav(path: &PathBuf, sample_rate: u32, seconds: f32, frequency: f32) {
    let sample_count = (sample_rate as f32 * seconds) as usize;
    let mut pcm = Vec::with_capacity(sample_count * 2);

    for index in 0..sample_count {
        let sample = (0.25 * (2.0 * std::f32::consts::PI * frequency * index as f32 / sample_rate as f32).sin())
            .clamp(-1.0, 1.0);
        let value = (sample * i16::MAX as f32).round() as i16;
        pcm.extend_from_slice(&value.to_le_bytes());
    }

    let data_size = pcm.len() as u32;
    let byte_rate = sample_rate * 2;
    let block_align = 2u16;
    let riff_size = 36 + data_size;

    let mut file = File::create(path).expect("create wav file");
    file.write_all(b"RIFF").unwrap();
    file.write_all(&riff_size.to_le_bytes()).unwrap();
    file.write_all(b"WAVE").unwrap();
    file.write_all(b"fmt ").unwrap();
    file.write_all(&16u32.to_le_bytes()).unwrap();
    file.write_all(&1u16.to_le_bytes()).unwrap();
    file.write_all(&1u16.to_le_bytes()).unwrap();
    file.write_all(&sample_rate.to_le_bytes()).unwrap();
    file.write_all(&byte_rate.to_le_bytes()).unwrap();
    file.write_all(&block_align.to_le_bytes()).unwrap();
    file.write_all(&16u16.to_le_bytes()).unwrap();
    file.write_all(b"data").unwrap();
    file.write_all(&data_size.to_le_bytes()).unwrap();
    file.write_all(&pcm).unwrap();
}

fn python_sherpa_reference(wav_path: &PathBuf) -> Vec<Vec<f32>> {
    let script = r#"
import json
import pathlib
import struct
import sys
import tempfile
import urllib.request
import wave

import numpy as np
import onnx
import sherpa_onnx

wav_path = pathlib.Path(sys.argv[1])
base = pathlib.Path(tempfile.gettempdir()) / "minutia_diarization_ref_test"
base.mkdir(parents=True, exist_ok=True)
raw_model_path = base / "voxceleb_resnet34_LM.raw.onnx"
meta_model_path = base / "voxceleb_resnet34_LM.meta.onnx"

if not raw_model_path.exists():
    urllib.request.urlretrieve(
        "https://huggingface.co/Wespeaker/wespeaker-voxceleb-resnet34-LM/resolve/main/voxceleb_resnet34_LM.onnx?download=1",
        raw_model_path,
    )

if not meta_model_path.exists():
    model = onnx.load(str(raw_model_path))
    props = {
        "model_type": "wespeaker",
        "framework": "wespeaker",
        "output_dim": "256",
        "sample_rate": "16000",
        "normalize_samples": "0",
        "language": "en",
        "feature_normalize_type": "",
    }
    model.metadata_props.clear()
    for key, value in props.items():
        entry = model.metadata_props.add()
        entry.key = key
        entry.value = value
    onnx.save(model, str(meta_model_path))

with wave.open(str(wav_path), "rb") as wav:
    pcm = wav.readframes(wav.getnframes())
    samples = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0

cfg = sherpa_onnx.SpeakerEmbeddingExtractorConfig(str(meta_model_path), 1, False, "cpu")
extractor = sherpa_onnx.SpeakerEmbeddingExtractor(cfg)
stream = extractor.create_stream()
stream.accept_waveform(16000, samples.tolist())
stream.input_finished()
frames = np.array(stream.get_frames(0, 4), dtype=np.float32).reshape(4, 80)
print(json.dumps(frames.tolist()))
"#;

    let output = Command::new("python")
        .args(["-c", script, wav_path.to_string_lossy().as_ref()])
        .output()
        .expect("run python sherpa reference");

    assert!(
        output.status.success(),
        "Python sherpa reference failed: {}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );

    serde_json::from_slice(&output.stdout).expect("parse sherpa reference")
}

#[test]
fn fbank_matches_sherpa_onnx_reference() {
    let temp_dir = std::env::temp_dir().join("minutia_diarization_tests");
    std::fs::create_dir_all(&temp_dir).unwrap();
    let wav_path = temp_dir.join("sine_220hz.wav");
    write_sine_wav(&wav_path, 16_000, 1.2, 220.0);

    let samples = {
        let mut pcm = Vec::new();
        let bytes = std::fs::read(&wav_path).unwrap();
        let data_offset = 44;
        pcm.extend_from_slice(&bytes[data_offset..]);
        pcm
    };

    let mut waveform = Vec::new();
    for chunk in samples.chunks_exact(2) {
        let sample = i16::from_le_bytes([chunk[0], chunk[1]]) as f32 / 32768.0;
        waveform.push(sample);
    }

    let features = extract_fbank_features(&waveform, &FeatureExtractionConfig::default()).unwrap();
    let reference = python_sherpa_reference(&wav_path);

    assert!(features.len() >= reference.len());
    assert_eq!(features[0].len(), reference[0].len());

    for (frame_index, (actual_frame, expected_frame)) in features
        .iter()
        .zip(reference.iter())
        .enumerate()
    {
        for (bin_index, (actual, expected)) in actual_frame.iter().zip(expected_frame.iter()).enumerate() {
            let diff = (actual - expected).abs();
            assert!(
                diff < 10.0,
                "frame {}, bin {} differs: actual={} expected={} diff={}",
                frame_index,
                bin_index,
                actual,
                expected,
                diff
            );
        }
    }
}

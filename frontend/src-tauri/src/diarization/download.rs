use anyhow::{anyhow, Result};
use futures_util::StreamExt;
use log::{info, warn};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::fs;
use tokio::io::{AsyncWriteExt, BufWriter};
use tokio::time::timeout;

const DEFAULT_MODEL_URL: &str = "https://huggingface.co/Wespeaker/wespeaker-voxceleb-resnet34-LM/resolve/main/voxceleb_resnet34_LM.onnx?download=1";
const DEFAULT_MODEL_NAME: &str = "voxceleb_resnet34_LM.onnx";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgress {
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub downloaded_mb: f64,
    pub total_mb: f64,
    pub speed_mbps: f64,
    pub percent: u8,
}

impl DownloadProgress {
    pub fn new(downloaded: u64, total: u64, speed_mbps: f64) -> Self {
        let percent = if total > 0 {
            ((downloaded as f64 / total as f64) * 100.0).min(100.0) as u8
        } else {
            0
        };

        Self {
            downloaded_bytes: downloaded,
            total_bytes: total,
            downloaded_mb: downloaded as f64 / (1024.0 * 1024.0),
            total_mb: total as f64 / (1024.0 * 1024.0),
            speed_mbps,
            percent,
        }
    }
}

pub async fn ensure_wespeaker_model<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf> {
    let models_dir = diarization_models_dir()?;
    let model_path = models_dir.join(DEFAULT_MODEL_NAME);
    if model_path.exists() {
        let size = fs::metadata(&model_path)
            .await
            .map(|metadata| metadata.len())
            .unwrap_or(0);
        if size > 1_000_000 {
            return Ok(model_path);
        }
    }

    download_wespeaker_model(app, &model_path).await?;
    Ok(model_path)
}

pub async fn download_wespeaker_model<R: Runtime>(
    app: &AppHandle<R>,
    file_path: &PathBuf,
) -> Result<()> {
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).await?;
    }

    let existing_size = if file_path.exists() {
        fs::metadata(file_path).await.map(|m| m.len()).unwrap_or(0)
    } else {
        0
    };

    let client = reqwest::Client::builder()
        .tcp_nodelay(true)
        .pool_max_idle_per_host(1)
        .timeout(Duration::from_secs(3600))
        .connect_timeout(Duration::from_secs(30))
        .build()?;

    let mut request = client.get(DEFAULT_MODEL_URL);
    if existing_size > 0 {
        request = request.header("Range", format!("bytes={}-", existing_size));
    }

    let response = request.send().await?;
    let (total_size, resuming) = if response.status() == reqwest::StatusCode::PARTIAL_CONTENT {
        let remaining = response.content_length().unwrap_or(0);
        (existing_size + remaining, true)
    } else if response.status().is_success() {
        (response.content_length().unwrap_or(0), false)
    } else {
        return Err(anyhow!("Model download failed with status: {}", response.status()));
    };

    let file = if resuming {
        fs::OpenOptions::new()
            .write(true)
            .append(true)
            .open(file_path)
            .await?
    } else {
        fs::File::create(file_path).await?
    };

    let mut writer = BufWriter::with_capacity(8 * 1024 * 1024, file);
    let mut downloaded = if resuming { existing_size } else { 0 };
    let mut last_report = Instant::now();
    let mut bytes_since_last_report = 0u64;
    let mut last_progress = if total_size > 0 {
        ((downloaded as f64 / total_size as f64) * 100.0) as u8
    } else {
        0
    };

    let mut stream = response.bytes_stream();
    loop {
        let next = timeout(Duration::from_secs(30), stream.next()).await;
        let chunk = match next {
            Err(_) => return Err(anyhow!("Diarization model download timed out")),
            Ok(None) => break,
            Ok(Some(result)) => result?,
        };

        writer.write_all(&chunk).await?;
        downloaded += chunk.len() as u64;
        bytes_since_last_report += chunk.len() as u64;

        let progress = if total_size > 0 {
            ((downloaded as f64 / total_size as f64) * 100.0).min(100.0) as u8
        } else {
            0
        };

        let elapsed = last_report.elapsed();
        let should_report = progress > last_progress || elapsed.as_millis() >= 500 || downloaded >= total_size;
        if should_report {
            let speed_mbps = if elapsed.as_secs_f64() > 0.0 {
                (bytes_since_last_report as f64 / (1024.0 * 1024.0)) / elapsed.as_secs_f64()
            } else {
                0.0
            };

            let payload = DownloadProgress::new(downloaded, total_size, speed_mbps);
            let _ = app.emit("diarization-model-download-progress", &payload);
            if progress == 100 {
                info!("Diarization model download complete");
            }

            last_progress = progress;
            last_report = Instant::now();
            bytes_since_last_report = 0;
        }
    }

    writer.flush().await?;
    Ok(())
}

pub fn diarization_models_dir() -> Result<PathBuf> {
    let base = if cfg!(debug_assertions) {
        std::env::current_dir()
            .map_err(|e| anyhow!("Failed to resolve current directory: {}", e))?
    } else {
        dirs::data_dir()
            .or_else(|| dirs::home_dir())
            .ok_or_else(|| anyhow!("Could not find system data directory"))?
    };

    Ok(base.join("MinutIA").join("models").join("diarization"))
}

#[allow(dead_code)]
pub fn model_url() -> &'static str {
    DEFAULT_MODEL_URL
}

#[allow(dead_code)]
pub fn model_file_name() -> &'static str {
    DEFAULT_MODEL_NAME
}

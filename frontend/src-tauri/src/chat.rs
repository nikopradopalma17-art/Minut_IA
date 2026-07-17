use crate::database::repositories::{meeting::MeetingsRepository, setting::SettingsRepository};
use crate::state::AppState;
use crate::summary::llm_client::{generate_summary, LLMProvider};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{command, AppHandle, Manager, Runtime};

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AskTranscriptRequest {
    pub meeting_id: String,
    pub question: String,
    pub history: Vec<ChatMessage>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AskTranscriptResponse {
    pub answer: String,
}

/// Approximate token limit for the transcript context we send to the LLM.
/// This is intentionally conservative to leave room for the question,
/// instructions, and the model's answer.
const MAX_CONTEXT_CHARS: usize = 120_000;

fn format_history(history: &[ChatMessage]) -> String {
    history
        .iter()
        .map(|m| format!("{}: {}", m.role, m.content))
        .collect::<Vec<_>>()
        .join("\n")
}

async fn fetch_transcript_text(pool: &sqlx::SqlitePool, meeting_id: &str) -> Result<String, String> {
    let mut all_text = String::new();
    let mut offset = 0i64;
    let limit = 1000i64;

    loop {
        let (transcripts, total) = MeetingsRepository::get_meeting_transcripts_paginated(
            pool,
            meeting_id,
            limit,
            offset,
        )
        .await
        .map_err(|e| format!("Failed to load transcripts: {}", e))?;

        for t in transcripts {
            if !all_text.is_empty() {
                all_text.push('\n');
            }
            all_text.push_str(&t.transcript);
        }

        if (offset + limit) >= total {
            break;
        }
        offset += limit;
    }

    if all_text.is_empty() {
        return Err("No transcripts found for this meeting.".to_string());
    }

    // Truncate to a safe context window.
    if all_text.chars().count() > MAX_CONTEXT_CHARS {
        let truncated: String = all_text.chars().take(MAX_CONTEXT_CHARS).collect();
        all_text = format!(
            "{}\n\n[Nota: la transcripción fue truncada para ajustarse al límite de contexto del modelo.]",
            truncated
        );
    }

    Ok(all_text)
}

fn app_data_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))
}

#[command]
pub async fn api_ask_transcript<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, AppState>,
    request: AskTranscriptRequest,
) -> Result<AskTranscriptResponse, String> {
    let pool = state.db_manager.pool();

    // Load configured model.
    let config = SettingsRepository::get_model_config(pool)
        .await
        .map_err(|e| format!("Failed to load model config: {}", e))?
        .ok_or_else(|| "No AI model configured. Please set one up in Settings > AI Model.".to_string())?;

    let provider = config.provider.clone();
    let model = config.model.clone();
    let ollama_endpoint = config.ollama_endpoint.clone();

    let llm_provider = LLMProvider::from_str(&provider)?;

    // Get the API key for the configured provider.
    let api_key = SettingsRepository::get_api_key(pool, &provider)
        .await
        .map_err(|e| format!("Failed to get API key: {}", e))?
        .unwrap_or_default();

    // Cloud providers require an API key.
    if !matches!(
        llm_provider,
        LLMProvider::Ollama | LLMProvider::BuiltInAI
    ) && api_key.trim().is_empty()
    {
        return Err(format!(
            "Provider {} requires an API key. Please configure it in Settings > AI Model.",
            provider
        ));
    }

    // Fetch transcript text.
    let transcript = fetch_transcript_text(pool, &request.meeting_id).await?;

    // Build system and user prompts.
    let system_prompt = "Eres un asistente útil que responde preguntas sobre una reunión basándote únicamente en su transcripción. Responde en español, de forma concisa y precisa. Si la respuesta no está en la transcripción, indícalo claramente.";

    let history_text = format_history(&request.history);

    let user_prompt = format!(
        "A continuación está la transcripción de una reunión:\n\n---\n{}\n---\n\nHistorial de la conversación:\n{}\n\nPregunta del usuario: {}\n\nResponde la pregunta basándote en la transcripción.",
        transcript,
        if history_text.is_empty() {
            "(sin historial)".to_string()
        } else {
            history_text
        },
        request.question
    );

    let client = Client::new();
    let app_data_dir = app_data_dir(&app).ok();

    let answer = generate_summary(
        &client,
        &llm_provider,
        &model,
        &api_key,
        system_prompt,
        &user_prompt,
        ollama_endpoint.as_deref(),
        None,
        None,
        None,
        None,
        app_data_dir.as_ref(),
        None,
    )
    .await
    .map_err(|e| format!("Failed to get answer from AI: {}", e))?;

    Ok(AskTranscriptResponse { answer })
}

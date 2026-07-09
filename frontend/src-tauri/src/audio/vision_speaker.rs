use std::path::Path;
use std::fs;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use serde_json::json;
use log::{info, error, warn};
use sqlx::SqlitePool;
use crate::database::repositories::setting::SettingsRepository;

/// Query settings to fetch the API key and provider, read the screenshot,
/// send it to the Vision LLM, and return the identified speaker name.
pub async fn identify_active_speaker(
    pool: &SqlitePool,
    image_path: &Path,
) -> Result<Option<String>, String> {
    // 1. Fetch current settings from database
    let settings = match SettingsRepository::get_model_config(pool).await {
        Ok(Some(s)) => s,
        _ => {
            warn!("No settings found in database; using Ollama fallback");
            // Return empty settings with default ollama provider
            return identify_active_speaker_with_params(
                "ollama",
                None,
                None,
                image_path,
            ).await;
        }
    };

    // We can also allow speaker provider to be custom/different, but since the user requested
    // "Que se pueda seleccionar entre OpenAI/Openrouter que soporte visión o local(Ollama)"
    // we can check which provider is set for the main model or create a fallback logic based on active provider.
    // If the active summary/general provider is OpenAI/OpenRouter/Ollama, we'll use that!
    let provider = settings.provider.to_lowercase();
    let api_key = match provider.as_str() {
        "openai" => settings.openai_api_key.clone(),
        "openrouter" => settings.open_router_api_key.clone(),
        "ollama" => None,
        _ => None,
    };

    let ollama_endpoint = settings.ollama_endpoint.clone();

    identify_active_speaker_with_params(
        &provider,
        api_key,
        ollama_endpoint,
        image_path,
    ).await
}

/// Identifies speaker using explicit provider parameters
pub async fn identify_active_speaker_with_params(
    provider: &str,
    api_key: Option<String>,
    ollama_endpoint: Option<String>,
    image_path: &Path,
) -> Result<Option<String>, String> {
    // 1. Read the image and encode as base64
    let img_bytes = fs::read(image_path)
        .map_err(|e| format!("Failed to read image at {:?}: {}", image_path, e))?;
    
    let base64_image = BASE64_STANDARD.encode(&img_bytes);
    
    // Prompt instructing the Vision model to ONLY return the name of the speaker or None
    let prompt = "Analiza esta captura de pantalla de una videollamada (Zoom, Teams o Google Meet). \
                  Identifica quién está hablando en este momento. El hablante activo suele estar indicado \
                  por un recuadro de color verde/azul/amarillo alrededor de su avatar o video, un icono \
                  de micrófono parpadeante, o su nombre destacado en un panel lateral. \
                  Devuelve ÚNICAMENTE el nombre de la persona que habla (ej. 'Claudia', 'Jimena', 'Nikolas'). \
                  Si no puedes identificar a nadie hablando, responde con 'None'. \
                  No agregues ninguna explicación, saludo ni puntuación adicional.";

    let client = reqwest::Client::new();

    if provider == "openai" {
        let key = api_key.ok_or_else(|| "OpenAI API Key is missing in settings".to_string())?;
        
        let payload = json!({
            "model": "gpt-4o-mini",
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": prompt
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": format!("data:image/png;base64,{}", base64_image)
                            }
                        }
                    ]
                }
            ],
            "max_tokens": 50,
            "temperature": 0.0
        });

        let res = client.post("https://api.openai.com/v1/chat/completions")
            .header("Authorization", format!("Bearer {}", key))
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("HTTP request to OpenAI failed: {}", e))?;

        if !res.status().is_success() {
            let status = res.status();
            let err_text = res.text().await.unwrap_or_default();
            error!("OpenAI API error response: {}", err_text);
            return Err(format!("OpenAI returned status {}: {}", status, err_text));
        }

        let json_res: serde_json::Value = res.json()
            .await
            .map_err(|e| format!("Failed to parse OpenAI JSON: {}", e))?;

        let text = json_res["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("None")
            .trim()
            .to_string();

        return parse_speaker_name(&text);

    } else if provider == "openrouter" {
        let key = api_key.ok_or_else(|| "OpenRouter API Key is missing in settings".to_string())?;
        
        let payload = json!({
            "model": "google/gemini-flash-1.5",
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": prompt
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": format!("data:image/png;base64,{}", base64_image)
                            }
                        }
                    ]
                }
            ],
            "max_tokens": 50,
            "temperature": 0.0
        });

        let res = client.post("https://openrouter.ai/api/v1/chat/completions")
            .header("Authorization", format!("Bearer {}", key))
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("HTTP request to OpenRouter failed: {}", e))?;

        if !res.status().is_success() {
            let status = res.status();
            let err_text = res.text().await.unwrap_or_default();
            error!("OpenRouter API error response: {}", err_text);
            return Err(format!("OpenRouter returned status {}: {}", status, err_text));
        }

        let json_res: serde_json::Value = res.json()
            .await
            .map_err(|e| format!("Failed to parse OpenRouter JSON: {}", e))?;

        let text = json_res["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("None")
            .trim()
            .to_string();

        return parse_speaker_name(&text);

    } else {
        // Fallback to Ollama (local)
        let endpoint = ollama_endpoint.unwrap_or_else(|| "http://localhost:11434".to_string());
        let url = format!("{}/api/generate", endpoint.trim_end_matches('/'));

        let payload = json!({
            "model": "llava",
            "prompt": prompt,
            "images": [base64_image],
            "stream": false,
            "options": {
                "temperature": 0.0
            }
        });

        let res = client.post(&url)
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("HTTP request to Ollama failed: {}", e))?;

        if !res.status().is_success() {
            let status = res.status();
            let err_text = res.text().await.unwrap_or_default();
            error!("Ollama API error response: {}", err_text);
            return Err(format!("Ollama returned status {}: {}", status, err_text));
        }

        let json_res: serde_json::Value = res.json()
            .await
            .map_err(|e| format!("Failed to parse Ollama JSON: {}", e))?;

        let text = json_res["response"]
            .as_str()
            .unwrap_or("None")
            .trim()
            .to_string();

        return parse_speaker_name(&text);
    }
}

fn parse_speaker_name(text: &str) -> Result<Option<String>, String> {
    let clean = text.trim().replace("\"", "").replace("'", "");
    if clean.to_lowercase() == "none" || clean.is_empty() {
        Ok(None)
    } else {
        info!("Identified active speaker: {}", clean);
        Ok(Some(clean))
    }
}

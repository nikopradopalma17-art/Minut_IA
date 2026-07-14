use serde::{Deserialize, Serialize};
use tauri::command;
use reqwest::Client;
use std::sync::RwLock;
use std::time::{Duration, Instant};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenRouterModel {
    pub id: String,
    pub name: String,
    pub context_length: Option<u32>,
    pub prompt_price: Option<String>,
    pub completion_price: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenRouterApiModel {
    id: String,
    name: Option<String>,
    context_length: Option<u32>,
    #[serde(default)]
    top_provider: Option<TopProvider>,
    #[serde(default)]
    pricing: Option<Pricing>,
}

#[derive(Debug, Deserialize, Default)]
struct TopProvider {
    context_length: Option<u32>,
}

#[derive(Debug, Deserialize, Default)]
struct Pricing {
    prompt: Option<String>,
    completion: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenRouterResponse {
    data: Vec<OpenRouterApiModel>,
}

struct CacheEntry {
    models: Vec<OpenRouterModel>,
    fetched_at: Instant,
}

static MODELS_CACHE: RwLock<Option<CacheEntry>> = RwLock::new(None);
const CACHE_TTL_SECS: u64 = 300;
/// Per-request timeout (seconds) so a stalled OpenRouter endpoint can't hang the
/// model picker indefinitely.
const REQUEST_TIMEOUT_SECS: u64 = 15;

#[command]
pub async fn get_openrouter_models() -> Result<Vec<OpenRouterModel>, String> {
    fetch_openrouter_models(String::new()).await
}

/// Dynamic-only OpenRouter discovery with a five-minute cache. Catalog callers pass
/// the stored credential; an empty key is still supported by the legacy command.
pub async fn fetch_openrouter_models(api_key: String) -> Result<Vec<OpenRouterModel>, String> {
    if let Some(entry) = MODELS_CACHE.read().map_err(|e| e.to_string())?.as_ref() {
        if entry.fetched_at.elapsed() < Duration::from_secs(CACHE_TTL_SECS) {
            return Ok(entry.models.clone());
        }
    }
    let client = Client::builder()
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;
    let mut request = client.get("https://openrouter.ai/api/v1/models");
    if !api_key.trim().is_empty() {
        request = request.header("Authorization", format!("Bearer {}", api_key.trim()));
    }
    let response = request
        .send()
        .await
        .map_err(|e| format!("Failed to make HTTP request: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP request failed with status: {}", response.status()));
    }

    let api_response: OpenRouterResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse JSON response: {}", e))?;

    let models: Vec<OpenRouterModel> = api_response
        .data
        .into_iter()
        .map(|m| OpenRouterModel {
            id: m.id,
            name: m.name.unwrap_or_else(|| "Unknown".to_string()),
            context_length: m.top_provider
                .as_ref()
                .and_then(|tp| tp.context_length)
                .or(m.context_length),
            prompt_price: m.pricing.as_ref().and_then(|p| p.prompt.clone()),
            completion_price: m.pricing.as_ref().and_then(|p| p.completion.clone()),
        })
        .collect();

    let mut cache = MODELS_CACHE.write().map_err(|e| e.to_string())?;
    *cache = Some(CacheEntry { models: models.clone(), fetched_at: Instant::now() });
    Ok(models)
}

pub fn clear_cache() {
    if let Ok(mut cache) = MODELS_CACHE.write() {
        *cache = None;
    }
}

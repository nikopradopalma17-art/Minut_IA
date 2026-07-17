use crate::database::models::{Setting, TranscriptSetting};
use crate::summary::CustomOpenAIConfig;
use sqlx::SqlitePool;

#[derive(serde::Deserialize, Debug)]
pub struct SaveModelConfigRequest {
    pub provider: String,
    pub model: String,
    #[serde(rename = "whisperModel")]
    pub whisper_model: String,
    #[serde(rename = "apiKey")]
    pub api_key: Option<String>,
    #[serde(rename = "ollamaEndpoint")]
    pub ollama_endpoint: Option<String>,
}

#[derive(serde::Deserialize, Debug)]
pub struct SaveTranscriptConfigRequest {
    pub provider: String,
    pub model: String,
    #[serde(rename = "apiKey")]
    pub api_key: Option<String>,
}

pub struct SettingsRepository;

// Transcript providers: localWhisper, deepgram, elevenLabs, groq, openai
// Summary providers: openai, claude, ollama, groq, added openrouter
// NOTE: Handle data exclusion in the higher layer as this is database abstraction layer(using SELECT *)

// API keys are stored in the OS keychain (Windows Credential Manager / macOS Keychain /
// Secret Service on Linux) rather than as plaintext columns in SQLite. The `settings` and
// `transcript_settings` tables still track provider/model bookkeeping, but their api-key
// columns are left unused going forward.
const KEYRING_SERVICE: &str = "com.minutia.app";

impl SettingsRepository {
    fn keyring_set(account: &str, value: &str) -> std::result::Result<(), sqlx::Error> {
        let entry = keyring::Entry::new(KEYRING_SERVICE, account).map_err(|e| {
            sqlx::Error::Protocol(format!("Keyring error for {}: {}", account, e).into())
        })?;
        entry.set_password(value).map_err(|e| {
            sqlx::Error::Protocol(format!("Failed to store credential for {}: {}", account, e).into())
        })
    }

    fn keyring_get(account: &str) -> Option<String> {
        keyring::Entry::new(KEYRING_SERVICE, account)
            .ok()?
            .get_password()
            .ok()
    }

    fn keyring_delete(account: &str) {
        if let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, account) {
            let _ = entry.delete_credential();
        }
    }

    pub async fn get_model_config(
        pool: &SqlitePool,
    ) -> std::result::Result<Option<Setting>, sqlx::Error> {
        let setting = sqlx::query_as::<_, Setting>("SELECT * FROM settings LIMIT 1")
            .fetch_optional(pool)
            .await?;
        Ok(setting)
    }

    pub async fn save_model_config(
        pool: &SqlitePool,
        provider: &str,
        model: &str,
        whisper_model: &str,
        ollama_endpoint: Option<&str>,
    ) -> std::result::Result<(), sqlx::Error> {
        // Using id '1' for backward compatibility
        sqlx::query(
            r#"
            INSERT INTO settings (id, provider, model, whisperModel, ollamaEndpoint)
            VALUES ('1', $1, $2, $3, $4)
            ON CONFLICT(id) DO UPDATE SET
                provider = excluded.provider,
                model = excluded.model,
                whisperModel = excluded.whisperModel,
                ollamaEndpoint = excluded.ollamaEndpoint
            "#,
        )
        .bind(provider)
        .bind(model)
        .bind(whisper_model)
        .bind(ollama_endpoint)
        .execute(pool)
        .await?;

        Ok(())
    }

    fn summary_keyring_account(provider: &str) -> std::result::Result<&'static str, sqlx::Error> {
        match provider {
            "openai" => Ok("summary-openai"),
            "claude" => Ok("summary-claude"),
            "ollama" => Ok("summary-ollama"),
            "groq" => Ok("summary-groq"),
            "openrouter" => Ok("summary-openrouter"),
            _ => Err(sqlx::Error::Protocol(
                format!("Invalid provider: {}", provider).into(),
            )),
        }
    }

    pub async fn save_api_key(
        pool: &SqlitePool,
        provider: &str,
        api_key: &str,
    ) -> std::result::Result<(), sqlx::Error> {
        // Custom OpenAI uses JSON config (customOpenAIConfig) instead of a separate API key column
        if provider == "custom-openai" {
            return Err(sqlx::Error::Protocol(
                "custom-openai provider should use save_custom_openai_config() instead of save_api_key()".into(),
            ));
        }
        if provider == "builtin-ai" {
            return Ok(()); // No API key needed
        }
        let account = Self::summary_keyring_account(provider)?;

        // Ensure a settings row exists so provider/model bookkeeping keeps working,
        // without touching an existing row's provider/model (mirrors prior upsert behavior).
        sqlx::query(
            r#"
            INSERT INTO settings (id, provider, model, whisperModel)
            VALUES ('1', 'openai', 'gpt-4o-2024-11-20', 'large-v3')
            ON CONFLICT(id) DO NOTHING
            "#,
        )
        .execute(pool)
        .await?;

        Self::keyring_set(account, api_key)?;
        Ok(())
    }

    pub async fn get_api_key(
        pool: &SqlitePool,
        provider: &str,
    ) -> std::result::Result<Option<String>, sqlx::Error> {
        // Custom OpenAI uses JSON config - extract API key from there
        if provider == "custom-openai" {
            let config = Self::get_custom_openai_config(pool).await?;
            return Ok(config.and_then(|c| c.api_key));
        }
        if provider == "builtin-ai" {
            return Ok(None); // No API key needed
        }
        let account = Self::summary_keyring_account(provider)?;
        Ok(Self::keyring_get(account))
    }

    pub async fn get_transcript_config(
        pool: &SqlitePool,
    ) -> std::result::Result<Option<TranscriptSetting>, sqlx::Error> {
        let setting =
            sqlx::query_as::<_, TranscriptSetting>("SELECT * FROM transcript_settings LIMIT 1")
                .fetch_optional(pool)
                .await?;
        Ok(setting)

    }

    pub async fn save_transcript_config(
        pool: &SqlitePool,
        provider: &str,
        model: &str,
    ) -> std::result::Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO transcript_settings (id, provider, model)
            VALUES ('1', $1, $2)
            ON CONFLICT(id) DO UPDATE SET
                provider = excluded.provider,
                model = excluded.model
            "#,
        )
        .bind(provider)
        .bind(model)
        .execute(pool)
        .await?;

        Ok(())
    }

    fn transcript_keyring_account(provider: &str) -> std::result::Result<&'static str, sqlx::Error> {
        match provider {
            "localWhisper" => Ok("transcript-localWhisper"),
            "deepgram" => Ok("transcript-deepgram"),
            "elevenLabs" => Ok("transcript-elevenLabs"),
            "groq" => Ok("transcript-groq"),
            "openai" => Ok("transcript-openai"),
            _ => Err(sqlx::Error::Protocol(
                format!("Invalid provider: {}", provider).into(),
            )),
        }
    }

    pub async fn save_transcript_api_key(
        pool: &SqlitePool,
        provider: &str,
        api_key: &str,
    ) -> std::result::Result<(), sqlx::Error> {
        if provider == "parakeet" {
            return Ok(()); // Parakeet doesn't need an API key
        }
        let account = Self::transcript_keyring_account(provider)?;

        sqlx::query(
            r#"
            INSERT INTO transcript_settings (id, provider, model)
            VALUES ('1', 'parakeet', $1)
            ON CONFLICT(id) DO NOTHING
            "#,
        )
        .bind(crate::config::DEFAULT_PARAKEET_MODEL)
        .execute(pool)
        .await?;

        Self::keyring_set(account, api_key)?;
        Ok(())
    }

    pub async fn get_transcript_api_key(
        _pool: &SqlitePool,
        provider: &str,
    ) -> std::result::Result<Option<String>, sqlx::Error> {
        if provider == "parakeet" {
            return Ok(None); // Parakeet doesn't need an API key
        }
        let account = Self::transcript_keyring_account(provider)?;
        Ok(Self::keyring_get(account))
    }

    pub async fn delete_api_key(
        pool: &SqlitePool,
        provider: &str,
    ) -> std::result::Result<(), sqlx::Error> {
        // Custom OpenAI uses JSON config - clear the keyring credential AND
        // null out the customOpenAIConfig column so no residual data remains.
        if provider == "custom-openai" {
            Self::keyring_delete("summary-custom-openai");
            sqlx::query("UPDATE settings SET customOpenAIConfig = NULL WHERE id = '1'")
                .execute(pool)
                .await?;
            return Ok(());
        }
        if provider == "builtin-ai" {
            return Ok(()); // No API key needed
        }
        let account = Self::summary_keyring_account(provider)?;
        Self::keyring_delete(account);
        Ok(())
    }

    // ===== CUSTOM OPENAI CONFIG METHODS =====

    /// Gets the custom OpenAI configuration from JSON
    ///
    /// # Returns
    /// * `Ok(Some(CustomOpenAIConfig))` - Config exists and is valid JSON
    /// * `Ok(None)` - No config stored
    /// * `Err(sqlx::Error)` - Database error
    pub async fn get_custom_openai_config(
        pool: &SqlitePool,
    ) -> std::result::Result<Option<CustomOpenAIConfig>, sqlx::Error> {
        use sqlx::Row;

        let row = sqlx::query(
            r#"
            SELECT customOpenAIConfig
            FROM settings
            WHERE id = '1'
            LIMIT 1
            "#
        )
        .fetch_optional(pool)
        .await?;

        match row {
            Some(record) => {
                let config_json: Option<String> = record.get("customOpenAIConfig");

                if let Some(json) = config_json {
                    // Parse JSON into CustomOpenAIConfig (stored without the API key)
                    let mut config: CustomOpenAIConfig = serde_json::from_str(&json)
                        .map_err(|e| sqlx::Error::Protocol(
                            format!("Invalid JSON in customOpenAIConfig: {}", e).into()
                        ))?;
                    config.api_key = Self::keyring_get("summary-custom-openai");

                    Ok(Some(config))
                } else {
                    Ok(None)
                }
            }
            None => Ok(None),
        }
    }

    /// Saves the custom OpenAI configuration as JSON
    ///
    /// # Arguments
    /// * `pool` - Database connection pool
    /// * `config` - CustomOpenAIConfig to save (includes endpoint, apiKey, model, maxTokens, temperature, topP)
    ///
    /// # Returns
    /// * `Ok(())` - Config saved successfully
    /// * `Err(sqlx::Error)` - Database or JSON serialization error
    pub async fn save_custom_openai_config(
        pool: &SqlitePool,
        config: &CustomOpenAIConfig,
    ) -> std::result::Result<(), sqlx::Error> {
        // Store the API key in the OS keychain rather than embedding it in the JSON blob.
        match config.api_key.as_deref().filter(|k| !k.is_empty()) {
            Some(api_key) => Self::keyring_set("summary-custom-openai", api_key)?,
            None => Self::keyring_delete("summary-custom-openai"),
        }

        // Serialize the rest of the config to JSON (api_key left as None on disk)
        let mut config_for_storage = config.clone();
        config_for_storage.api_key = None;
        let config_json = serde_json::to_string(&config_for_storage)
            .map_err(|e| sqlx::Error::Protocol(
                format!("Failed to serialize config to JSON: {}", e).into()
            ))?;

        // Upsert into settings table
        sqlx::query(
            r#"
            INSERT INTO settings (id, provider, model, whisperModel, customOpenAIConfig)
            VALUES ('1', 'custom-openai', $1, 'large-v3', $2)
            ON CONFLICT(id) DO UPDATE SET
                customOpenAIConfig = excluded.customOpenAIConfig
            "#,
        )
        .bind(&config.model)
        .bind(config_json)
        .execute(pool)
        .await?;

        Ok(())
    }

    /// One-shot migration: move any plaintext API keys still lingering in
    /// SQLite columns into the OS keyring, then NULL out the columns.
    ///
    /// This runs at startup and is guarded by the `keyringMigrationDone`
    /// flag in the `settings` table so it only executes once per database.
    /// It also fixes the regression where existing users lost their keys
    /// after the keyring migration because the old plaintext values were
    /// never copied over.
    pub async fn migrate_plaintext_api_keys_to_keyring(
        pool: &SqlitePool,
    ) -> std::result::Result<(), sqlx::Error> {
        use sqlx::Row;

        // Check if migration already ran.
        let row = sqlx::query("SELECT keyringMigrationDone FROM settings WHERE id = '1' LIMIT 1")
            .fetch_optional(pool)
            .await?;

        let already_done = match row {
            Some(record) => {
                let val: i64 = record.get("keyringMigrationDone");
                val != 0
            }
            None => return Ok(()), // no settings row yet — nothing to migrate
        };

        if already_done {
            log::debug!("Keyring migration already done — skipping");
            return Ok(());
        }

        log::info!("Running one-shot migration: plaintext API keys → keyring");

        // If any key fails to reach the keyring we must NOT mark the
        // migration as done, or that key would stay in SQLite as plaintext
        // forever with no retry.
        let mut had_failures = false;

        // --- settings table ---
        // Map column name → keyring account name.
        let settings_keys: &[(&str, &str)] = &[
            ("groqApiKey", "summary-groq"),
            ("openaiApiKey", "summary-openai"),
            ("anthropicApiKey", "summary-claude"),
            ("ollamaApiKey", "summary-ollama"),
            ("openRouterApiKey", "summary-openrouter"),
            ("geminiApiKey", "summary-gemini"),
        ];

        for (col, account) in settings_keys {
            let row = sqlx::query(&format!(
                "SELECT {} FROM settings WHERE id = '1' LIMIT 1",
                col
            ))
            .fetch_optional(pool)
            .await?;

            if let Some(record) = row {
                let val: Option<String> = record.get(col);
                if let Some(key) = val.filter(|k| !k.trim().is_empty()) {
                    log::info!("Migrating {} from SQLite to keyring", col);
                    if let Err(e) = Self::keyring_set(account, &key) {
                        log::warn!("Failed to migrate {} to keyring: {} — leaving column intact", col, e);
                        // Don't NULL the column if keyring failed — retried on next startup.
                        had_failures = true;
                        continue;
                    }
                    // NULL out the column.
                    sqlx::query(&format!(
                        "UPDATE settings SET {} = NULL WHERE id = '1'",
                        col
                    ))
                    .execute(pool)
                    .await?;
                }
            }
        }

        // --- customOpenAIConfig JSON: extract apiKey if present ---
        let row = sqlx::query(
            "SELECT customOpenAIConfig FROM settings WHERE id = '1' LIMIT 1"
        )
        .fetch_optional(pool)
        .await?;

        if let Some(record) = row {
            let config_json: Option<String> = record.get("customOpenAIConfig");
            if let Some(json) = config_json {
                if let Ok(mut config) = serde_json::from_str::<CustomOpenAIConfig>(&json) {
                    if let Some(key) = config.api_key.take().filter(|k| !k.trim().is_empty()) {
                        log::info!("Migrating customOpenAIConfig apiKey to keyring");
                        if let Err(e) = Self::keyring_set("summary-custom-openai", &key) {
                            log::warn!("Failed to migrate customOpenAIConfig apiKey to keyring: {}", e);
                            had_failures = true;
                        } else {
                            // Re-serialize without the API key and update the column.
                            config.api_key = None;
                            if let Ok(json_without_key) = serde_json::to_string(&config) {
                                sqlx::query(
                                    "UPDATE settings SET customOpenAIConfig = $1 WHERE id = '1'"
                                )
                                .bind(json_without_key)
                                .execute(pool)
                                .await?;
                            }
                        }
                    }
                }
            }
        }

        // --- transcript_settings table ---
        let transcript_keys: &[(&str, &str)] = &[
            ("whisperApiKey", "transcript-localWhisper"),
            ("deepgramApiKey", "transcript-deepgram"),
            ("elevenLabsApiKey", "transcript-elevenLabs"),
            ("groqApiKey", "transcript-groq"),
            ("openaiApiKey", "transcript-openai"),
        ];

        for (col, account) in transcript_keys {
            let row = sqlx::query(&format!(
                "SELECT {} FROM transcript_settings WHERE id = '1' LIMIT 1",
                col
            ))
            .fetch_optional(pool)
            .await?;

            if let Some(record) = row {
                let val: Option<String> = record.get(col);
                if let Some(key) = val.filter(|k| !k.trim().is_empty()) {
                    log::info!("Migrating transcript {} from SQLite to keyring", col);
                    if let Err(e) = Self::keyring_set(account, &key) {
                        log::warn!("Failed to migrate {} to keyring: {} — leaving column intact", col, e);
                        had_failures = true;
                        continue;
                    }
                    sqlx::query(&format!(
                        "UPDATE transcript_settings SET {} = NULL WHERE id = '1'",
                        col
                    ))
                    .execute(pool)
                    .await?;
                }
            }
        }

        if had_failures {
            // Leave the flag unset so the migration retries on next startup;
            // the keys that failed are still in SQLite and must eventually
            // reach the keyring.
            log::warn!(
                "Keyring migration incomplete (some keys could not be stored) — will retry on next startup"
            );
            return Ok(());
        }

        // Mark migration as done.
        sqlx::query("UPDATE settings SET keyringMigrationDone = 1 WHERE id = '1'")
            .execute(pool)
            .await?;

        log::info!("Keyring migration completed successfully");
        Ok(())
    }
}

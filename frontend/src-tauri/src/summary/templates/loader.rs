use super::defaults;
use super::types::Template;
use std::fs;
use std::path::PathBuf;
use tracing::{debug, info, warn};
use once_cell::sync::Lazy;
use std::sync::RwLock;

// Global storage for the bundled templates directory path
static BUNDLED_TEMPLATES_DIR: Lazy<RwLock<Option<PathBuf>>> = Lazy::new(|| RwLock::new(None));

/// Set the bundled templates directory path (called once at app startup)
pub fn set_bundled_templates_dir(path: PathBuf) {
    info!("Bundled templates directory set to: {:?}", path);
    if let Ok(mut dir) = BUNDLED_TEMPLATES_DIR.write() {
        *dir = Some(path);
    }
}

/// Get the user's custom templates directory path
///
/// Returns the platform-specific application data directory for custom templates:
/// - macOS: ~/Library/Application Support/MinutIA/templates/
/// - Windows: %APPDATA%\MinutIA\templates\
/// - Linux: ~/.config/MinutIA/templates/
pub fn get_custom_templates_dir() -> Option<PathBuf> {
    let mut path = dirs::data_dir()?;
    path.push("MinutIA");
    path.push("templates");
    Some(path)
}

fn validate_template_id(template_id: &str) -> Result<(), String> {
    let trimmed = template_id.trim();
    if trimmed.is_empty() {
        return Err("Template id cannot be empty".to_string());
    }

    if trimmed.contains('/') || trimmed.contains('\\') || trimmed.contains("..") {
        return Err("Template id contains invalid path characters".to_string());
    }

    if !trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Err(
            "Template id must contain only ASCII letters, numbers, underscores, or hyphens"
                .to_string(),
        );
    }

    Ok(())
}

fn custom_template_path(template_id: &str) -> Option<PathBuf> {
    let mut dir = get_custom_templates_dir()?;
    dir.push(format!("{template_id}.json"));
    Some(dir)
}

/// Load a template from the bundled resources directory
///
/// # Arguments
/// * `template_id` - Template identifier (without .json extension)
///
/// # Returns
/// The template JSON content if found, None otherwise
fn load_bundled_template(template_id: &str) -> Option<String> {
    let bundled_dir = BUNDLED_TEMPLATES_DIR.read().ok()?.clone()?;
    let template_path = bundled_dir.join(format!("{}.json", template_id));

    debug!("Checking for bundled template at: {:?}", template_path);

    match std::fs::read_to_string(&template_path) {
        Ok(content) => {
            info!("Loaded bundled template '{}' from {:?}", template_id, template_path);
            Some(content)
        }
        Err(e) => {
            debug!("No bundled template '{}' found: {}", template_id, e);
            None
        }
    }
}

/// Load a template from the user's custom templates directory
///
/// # Arguments
/// * `template_id` - Template identifier (without .json extension)
///
/// # Returns
/// The template JSON content if found, None otherwise
fn load_custom_template(template_id: &str) -> Option<String> {
    let template_path = custom_template_path(template_id)?;

    debug!("Checking for custom template at: {:?}", template_path);

    match std::fs::read_to_string(&template_path) {
        Ok(content) => {
            info!("Loaded custom template '{}' from {:?}", template_id, template_path);
            Some(content)
        }
        Err(e) => {
            debug!("No custom template '{}' found: {}", template_id, e);
            None
        }
    }
}

/// Returns the full path for a custom template if the app data directory can be resolved.
pub fn get_custom_template_path(template_id: &str) -> Option<PathBuf> {
    custom_template_path(template_id)
}

/// Returns true when a custom template file exists for the provided identifier.
pub fn is_custom_template(template_id: &str) -> bool {
    // Reject ids that could escape the templates directory (path separators,
    // `..`, non-alphanumeric chars) before touching the filesystem.
    if validate_template_id(template_id).is_err() {
        return false;
    }
    custom_template_path(template_id)
        .as_ref()
        .is_some_and(|path| path.exists())
}

/// Persist a validated template as a custom template JSON file.
pub fn save_custom_template(template_id: &str, template: &Template) -> Result<(), String> {
    validate_template_id(template_id)?;

    let dir = get_custom_templates_dir()
        .ok_or_else(|| "Unable to resolve the custom templates directory".to_string())?;
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create custom templates directory: {e}"))?;

    let path = dir.join(format!("{template_id}.json"));
    let json = serde_json::to_string_pretty(template)
        .map_err(|e| format!("Failed to serialize template JSON: {e}"))?;
    fs::write(&path, json)
        .map_err(|e| format!("Failed to write template file '{}': {e}", path.display()))?;

    info!("Saved custom template '{}' to {:?}", template_id, path);
    Ok(())
}

/// Delete a custom template JSON file if it exists.
pub fn delete_custom_template(template_id: &str) -> Result<(), String> {
    validate_template_id(template_id)?;

    let path = custom_template_path(template_id)
        .ok_or_else(|| "Unable to resolve the custom templates directory".to_string())?;

    if !path.exists() {
        return Err(format!("Custom template '{}' does not exist", template_id));
    }

    fs::remove_file(&path)
        .map_err(|e| format!("Failed to delete template file '{}': {e}", path.display()))?;

    info!("Deleted custom template '{}' from {:?}", template_id, path);
    Ok(())
}

/// Load and parse a template by identifier
///
/// This function implements a fallback strategy:
/// 1. Check user's custom templates directory
/// 2. Check bundled resources directory (app templates)
/// 3. Fall back to built-in embedded templates
/// 4. Return error if not found in any location
///
/// # Arguments
/// * `template_id` - Template identifier (e.g., "reunion_diaria")
///
/// # Returns
/// Parsed and validated Template struct
pub fn get_template(template_id: &str) -> Result<Template, String> {
    // Reject path separators / `..` / non-alphanumeric ids before resolving a
    // filesystem path, matching the validation already applied on save/delete.
    // Without this, a crafted template_id could traverse out of the templates
    // directory and disclose arbitrary JSON files that parse as a template.
    validate_template_id(template_id)?;

    info!("Loading template: {}", template_id);

    // Try custom template first, then bundled, then built-in
    let json_content = if let Some(custom_content) = load_custom_template(template_id) {
        debug!("Using custom template for '{}'", template_id);
        custom_content
    } else if let Some(bundled_content) = load_bundled_template(template_id) {
        debug!("Using bundled template for '{}'", template_id);
        bundled_content
    } else if let Some(builtin_content) = defaults::get_builtin_template(template_id) {
        debug!("Using built-in template for '{}'", template_id);
        builtin_content.to_string()
    } else {
        return Err(format!(
            "Template '{}' not found. Available templates: {}",
            template_id,
            list_template_ids().join(", ")
        ));
    };

    // Parse and validate
    validate_and_parse_template(&json_content)
}

/// Validate and parse template JSON
///
/// # Arguments
/// * `json_content` - Raw JSON string
///
/// # Returns
/// Parsed and validated Template struct
pub fn validate_and_parse_template(json_content: &str) -> Result<Template, String> {
    let template: Template = serde_json::from_str(json_content)
        .map_err(|e| format!("Failed to parse template JSON: {}", e))?;

    template.validate()?;

    Ok(template)
}

/// List all available template identifiers
///
/// Returns a combined list of:
/// - Built-in template IDs (the fixed, curated set embedded in the binary)
/// - Custom template IDs (from user's data directory)
///
/// NOTE: We intentionally do NOT scan the bundled resources directory for
/// arbitrary `*.json` files. Doing so surfaced stale templates left over in the
/// resource/app-data folders from older builds (e.g. `project_sync`,
/// `retrospective`). The built-in set is owned by `defaults.rs`; only genuine
/// user-created templates in the custom directory are added on top.
pub fn list_template_ids() -> Vec<String> {
    let mut ids: Vec<String> = defaults::list_builtin_template_ids()
        .into_iter()
        .map(|s| s.to_string())
        .collect();

    // Add custom templates if directory exists
    if let Some(custom_dir) = get_custom_templates_dir() {
        if custom_dir.exists() {
            match fs::read_dir(&custom_dir) {
                Ok(entries) => {
                    for entry in entries.flatten() {
                        if let Some(filename) = entry.file_name().to_str() {
                            if filename.ends_with(".json") {
                                let id = filename.trim_end_matches(".json").to_string();
                                if !ids.contains(&id) {
                                    ids.push(id);
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    warn!("Failed to read custom templates directory: {}", e);
                }
            }
        }
    }

    ids.sort();
    ids
}

/// List all available templates with their metadata
///
/// Returns a list of (id, name, description, system_prompt, is_custom) tuples
pub fn list_templates() -> Vec<(String, String, String, Option<String>, bool)> {
    let mut templates = Vec::new();

    for id in list_template_ids() {
        match get_template(&id) {
            Ok(template) => {
                templates.push((
                    id.clone(),
                    template.name,
                    template.description,
                    template.system_prompt,
                    is_custom_template(&id),
                ));
            }
            Err(e) => {
                warn!("Failed to load template '{}': {}", id, e);
            }
        }
    }

    templates
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_builtin_template() {
        let template = get_template("reunion_estandar");
        assert!(template.is_ok());

        let template = template.unwrap();
        assert_eq!(template.name, "Reunión estándar");
        assert!(!template.sections.is_empty());
    }

    #[test]
    fn test_get_nonexistent_template() {
        let result = get_template("nonexistent_template");
        assert!(result.is_err());
    }

    #[test]
    fn test_list_template_ids() {
        let ids = list_template_ids();
        assert_eq!(
            ids,
            vec![
                "comite_interno".to_string(),
                "minuta_corporativa".to_string(),
                "reunion_cliente".to_string(),
                "reunion_estandar".to_string(),
            ]
        );
    }

    #[test]
    fn test_validate_invalid_json() {
        let result = validate_and_parse_template("invalid json");
        assert!(result.is_err());
    }
}

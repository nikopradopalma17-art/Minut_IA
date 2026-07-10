/// Embedded default templates using compile-time inclusion
///
/// These templates are bundled into the binary and serve as fallbacks
/// when custom templates are not available.

/// Reunión diaria para seguimiento corto del equipo
pub const REUNION_DIARIA: &str = include_str!("../../../templates/reunion_diaria.json");

/// Presentación a clientes o prospects
pub const PRESENTACION_CLIENTES: &str =
    include_str!("../../../templates/presentacion_clientes.json");

/// Comité interno / revisión de proyectos
pub const COMITE_INTERNO: &str = include_str!("../../../templates/comite_interno.json");

/// Reunión estándar para minutas generales
pub const REUNION_ESTANDAR: &str = include_str!("../../../templates/reunion_estandar.json");

/// Registry of all built-in templates
///
/// Maps template identifiers to their embedded JSON content
pub fn get_builtin_templates() -> Vec<(&'static str, &'static str)> {
    vec![
        ("reunion_diaria", REUNION_DIARIA),
        ("presentacion_clientes", PRESENTACION_CLIENTES),
        ("comite_interno", COMITE_INTERNO),
        ("reunion_estandar", REUNION_ESTANDAR),
    ]
}

/// Get a built-in template by identifier
///
/// # Arguments
/// * `id` - Template identifier (e.g., "daily_standup", "standard_meeting")
///
/// # Returns
/// The template JSON content if found, None otherwise
pub fn get_builtin_template(id: &str) -> Option<&'static str> {
    match id {
        "reunion_diaria" | "daily_standup" => Some(REUNION_DIARIA),
        "presentacion_clientes" | "sales_marketing_client_call" => Some(PRESENTACION_CLIENTES),
        "comite_interno" | "project_sync" => Some(COMITE_INTERNO),
        "reunion_estandar" | "standard_meeting" | "minuta_corporativa" => Some(REUNION_ESTANDAR),
        _ => None,
    }
}

/// List all built-in template identifiers
pub fn list_builtin_template_ids() -> Vec<&'static str> {
    vec![
        "reunion_diaria",
        "presentacion_clientes",
        "comite_interno",
        "reunion_estandar",
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_builtin_templates_valid_json() {
        for (id, content) in get_builtin_templates() {
            let result = serde_json::from_str::<serde_json::Value>(content);
            assert!(
                result.is_ok(),
                "Built-in template '{}' contains invalid JSON: {:?}",
                id,
                result.err()
            );
        }
    }

    #[test]
    fn test_get_builtin_template() {
        assert!(get_builtin_template("reunion_diaria").is_some());
        assert!(get_builtin_template("daily_standup").is_some());
        assert!(get_builtin_template("presentacion_clientes").is_some());
        assert!(get_builtin_template("comite_interno").is_some());
        assert!(get_builtin_template("reunion_estandar").is_some());
        assert!(get_builtin_template("minuta_corporativa").is_some());
        assert!(get_builtin_template("nonexistent").is_none());
    }
}

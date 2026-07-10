/// Embedded default templates using compile-time inclusion
///
/// These templates are bundled into the binary and serve as fallbacks
/// when custom templates are not available.

/// Reunión diaria para seguimiento corto del equipo
pub const REUNION_DIARIA: &str = include_str!("../../../templates/reunion_diaria.json");

/// Minuta ejecutiva para reuniones corporativas
pub const MINUTA_CORPORATIVA: &str = include_str!("../../../templates/minuta_corporativa.json");

/// Reunión comercial con clientes
pub const REUNION_CLIENTE: &str = include_str!("../../../templates/reunion_cliente.json");

/// Registry of all built-in templates
///
/// Maps template identifiers to their embedded JSON content
pub fn get_builtin_templates() -> Vec<(&'static str, &'static str)> {
    vec![
        ("reunion_diaria", REUNION_DIARIA),
        ("minuta_corporativa", MINUTA_CORPORATIVA),
        ("reunion_cliente", REUNION_CLIENTE),
    ]
}

/// Get a built-in template by identifier
///
/// # Arguments
/// * `id` - Template identifier (e.g., "reunion_diaria")
///
/// # Returns
/// The template JSON content if found, None otherwise
pub fn get_builtin_template(id: &str) -> Option<&'static str> {
    match id {
        "reunion_diaria" => Some(REUNION_DIARIA),
        "minuta_corporativa" => Some(MINUTA_CORPORATIVA),
        "reunion_cliente" => Some(REUNION_CLIENTE),
        _ => None,
    }
}

/// List all built-in template identifiers
pub fn list_builtin_template_ids() -> Vec<&'static str> {
    vec![
        "reunion_diaria",
        "minuta_corporativa",
        "reunion_cliente",
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
    fn builtins_are_exactly_the_three_supported_templates() {
        let ids = list_builtin_template_ids();
        assert_eq!(
            ids,
            vec!["reunion_diaria", "minuta_corporativa", "reunion_cliente"]
        );

        for id in &ids {
            assert!(get_builtin_template(id).is_some(), "missing built-in {id}");
        }

        for removed_id in [
            "daily_standup",
            "presentacion_clientes",
            "sales_marketing_client_call",
            "comite_interno",
            "project_sync",
            "reunion_estandar",
            "standard_meeting",
        ] {
            assert!(
                get_builtin_template(removed_id).is_none(),
                "removed template alias {removed_id} must not resolve"
            );
        }
    }
}

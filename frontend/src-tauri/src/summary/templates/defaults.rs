/// Embedded default templates using compile-time inclusion
///
/// These templates are bundled into the binary and serve as fallbacks
/// when custom templates are not available.

/// Reunión estándar para minutas corporativas y reuniones mixtas
pub const REUNION_ESTANDAR: &str = include_str!("../../../templates/reunion_estandar.json");

/// Minuta ejecutiva para reuniones corporativas
pub const MINUTA_CORPORATIVA: &str = include_str!("../../../templates/minuta_corporativa.json");

/// Comité interno / revisiones operativas y coordinación
pub const COMITE_INTERNO: &str = include_str!("../../../templates/comite_interno.json");

/// Reunión comercial con clientes
pub const REUNION_CLIENTE: &str = include_str!("../../../templates/reunion_cliente.json");

/// Registry of all built-in templates
///
/// Maps template identifiers to their embedded JSON content
pub fn get_builtin_templates() -> Vec<(&'static str, &'static str)> {
    vec![
        ("reunion_estandar", REUNION_ESTANDAR),
        ("minuta_corporativa", MINUTA_CORPORATIVA),
        ("comite_interno", COMITE_INTERNO),
        ("reunion_cliente", REUNION_CLIENTE),
    ]
}

/// Get a built-in template by identifier
///
/// # Arguments
/// * `id` - Template identifier (e.g., "reunion_estandar")
///
/// # Returns
/// The template JSON content if found, None otherwise
pub fn get_builtin_template(id: &str) -> Option<&'static str> {
    match id {
        "reunion_estandar" => Some(REUNION_ESTANDAR),
        "minuta_corporativa" => Some(MINUTA_CORPORATIVA),
        "comite_interno" => Some(COMITE_INTERNO),
        "reunion_cliente" => Some(REUNION_CLIENTE),
        _ => None,
    }
}

/// List all built-in template identifiers
pub fn list_builtin_template_ids() -> Vec<&'static str> {
    vec![
        "reunion_estandar",
        "minuta_corporativa",
        "comite_interno",
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
    fn builtin_template_ids_keep_their_visible_names() {
        for (id, expected_name) in [
            ("reunion_estandar", "Reunión estándar"),
            ("minuta_corporativa", "Minuta Corporativa"),
            ("comite_interno", "Comité interno"),
            ("reunion_cliente", "Reunión con cliente"),
        ] {
            let content = get_builtin_template(id).expect("supported built-in template");
            let template = serde_json::from_str::<crate::summary::templates::Template>(content)
                .expect("valid built-in template JSON");
            assert_eq!(template.name, expected_name, "unexpected visible name for {id}");
        }
    }

    #[test]
    fn builtins_are_exactly_the_four_supported_templates() {
        let ids = list_builtin_template_ids();
        assert_eq!(
            ids,
            vec![
                "reunion_estandar",
                "minuta_corporativa",
                "comite_interno",
                "reunion_cliente"
            ]
        );

        for id in &ids {
            assert!(get_builtin_template(id).is_some(), "missing built-in {id}");
        }

        for removed_id in [
            "reunion_diaria",
            "daily_standup",
            "presentacion_clientes",
            "sales_marketing_client_call",
            "project_sync",
            "retrospective",
            "psychatric_session",
            "standard_meeting",
        ] {
            assert!(
                get_builtin_template(removed_id).is_none(),
                "removed template alias {removed_id} must not resolve"
            );
        }
    }
}

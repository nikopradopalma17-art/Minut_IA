use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CommitmentDraft {
    pub responsible: Option<String>,
    pub description: String,
    pub due_date: Option<String>,
}

const TARGET_SECTION_TITLES: &[&str] = &[
    "compromisos",
    "action items",
    "commitments",
    "tasks",
    "tareas",
    "acciones",
    "next steps",
    "proximas acciones",
    "acciones pendientes",
];

fn fold_accents(value: &str) -> String {
    value
        .chars()
        .map(|ch| match ch {
            'á' | 'à' | 'ä' | 'â' | 'ã' | 'å' | 'Á' | 'À' | 'Ä' | 'Â' | 'Ã' | 'Å' => 'a',
            'é' | 'è' | 'ë' | 'ê' | 'É' | 'È' | 'Ë' | 'Ê' => 'e',
            'í' | 'ì' | 'ï' | 'î' | 'Í' | 'Ì' | 'Ï' | 'Î' => 'i',
            'ó' | 'ò' | 'ö' | 'ô' | 'õ' | 'Ó' | 'Ò' | 'Ö' | 'Ô' | 'Õ' => 'o',
            'ú' | 'ù' | 'ü' | 'û' | 'Ú' | 'Ù' | 'Ü' | 'Û' => 'u',
            'ñ' | 'Ñ' => 'n',
            'ç' | 'Ç' => 'c',
            _ => ch.to_ascii_lowercase(),
        })
        .collect()
}

fn normalize_text(value: &str) -> String {
    fold_accents(value)
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn normalize_heading_title(value: &str) -> String {
    let trimmed = value
        .trim()
        .trim_matches('*')
        .trim_matches('_')
        .trim_matches(':')
        .trim();
    normalize_text(trimmed)
}

fn is_heading(line: &str) -> Option<(usize, String)> {
    let trimmed = line.trim_start();
    let level = trimmed.chars().take_while(|ch| *ch == '#').count();
    if level == 0 {
        return None;
    }

    let title = trimmed[level..].trim();
    if title.is_empty() {
        return None;
    }

    Some((level, title.to_string()))
}

fn clean_inline_cell(value: &str) -> String {
    let mut cleaned = value.trim().trim_matches('|').trim().to_string();

    for marker in ["**", "__", "`"] {
        if cleaned.starts_with(marker) && cleaned.ends_with(marker) && cleaned.len() > marker.len() * 2
        {
            cleaned = cleaned[marker.len()..cleaned.len() - marker.len()].trim().to_string();
        }
    }

    cleaned = cleaned
        .replace("**", "")
        .replace("__", "")
        .replace('`', "")
        .trim()
        .to_string();

    cleaned
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn optional_cell_value(value: &str) -> Option<String> {
    let cleaned = clean_inline_cell(value);
    if cleaned.is_empty() {
        return None;
    }

    match normalize_text(&cleaned).as_str() {
        "-" | "—" | "–" | "n/a" | "na" | "none" | "sin asignar" => None,
        _ => Some(cleaned),
    }
}

fn parse_table_row(line: &str) -> Option<CommitmentDraft> {
    if !line.trim_start().starts_with('|') {
        return None;
    }

    let cells: Vec<String> = line
        .trim()
        .trim_matches('|')
        .split('|')
        .map(clean_inline_cell)
        .collect();

    if cells.len() < 3 {
        return None;
    }

    let first = normalize_text(&cells[0]);
    let second = normalize_text(&cells[1]);
    if first == "responsable" || first == "responsible" || second == "compromiso" || second == "commitment"
    {
        return None;
    }

    if cells
        .iter()
        .take(3)
        .all(|cell| normalize_text(cell).starts_with('-') || normalize_text(cell).is_empty())
    {
        return None;
    }

    let responsible = optional_cell_value(&cells[0]);
    let description = clean_inline_cell(&cells[1]);
    let due_date = optional_cell_value(&cells[2]);

    if description.is_empty() {
        return None;
    }

    Some(CommitmentDraft {
        responsible,
        description,
        due_date,
    })
}

pub fn extract_commitments_from_markdown(markdown: &str) -> Vec<CommitmentDraft> {
    let mut commitments = Vec::new();
    let mut capture_level: Option<usize> = None;

    for line in markdown.lines() {
        if let Some((level, title)) = is_heading(line) {
            let normalized = normalize_heading_title(&title);
            if TARGET_SECTION_TITLES.contains(&normalized.as_str()) {
                capture_level = Some(level);
                continue;
            }

            if let Some(active_level) = capture_level {
                if level <= active_level {
                    capture_level = None;
                }
            }
        }

        if capture_level.is_some() {
            if let Some(commitment) = parse_table_row(line) {
                commitments.push(commitment);
            }
        }
    }

    commitments
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_spanish_commitments_table() {
        let markdown = r#"
## Compromisos

| Responsable | Compromiso | Fecha límite |
| --- | --- | --- |
| **Ana** | Enviar minuta final | 2026-07-10 |
| Luis | Coordinar sala | - |
"#;

        let result = extract_commitments_from_markdown(markdown);
        assert_eq!(
            result,
            vec![
                CommitmentDraft {
                    responsible: Some("Ana".to_string()),
                    description: "Enviar minuta final".to_string(),
                    due_date: Some("2026-07-10".to_string()),
                },
                CommitmentDraft {
                    responsible: Some("Luis".to_string()),
                    description: "Coordinar sala".to_string(),
                    due_date: None,
                },
            ]
        );
    }

    #[test]
    fn parses_english_commitments_table() {
        let markdown = r#"
### Action Items

| Responsible | Commitment | Due Date |
| --- | --- | --- |
| Maria | Share deck | 2026-07-11 |
"#;

        let result = extract_commitments_from_markdown(markdown);
        assert_eq!(
            result,
            vec![CommitmentDraft {
                responsible: Some("Maria".to_string()),
                description: "Share deck".to_string(),
                due_date: Some("2026-07-11".to_string()),
            }]
        );
    }
}

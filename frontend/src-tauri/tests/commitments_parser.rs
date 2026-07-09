use app_lib::summary::commitments::{extract_commitments_from_markdown, CommitmentDraft};

#[test]
fn extracts_commitments_from_spanish_section() {
    let markdown = r#"
# Minuta

## Compromisos

| Responsable | Compromiso | Fecha límite |
| --- | --- | --- |
| **Ana** | Enviar minuta final | 2026-07-10 |
| Luis | Coordinar sala | - |
"#;

    let commitments = extract_commitments_from_markdown(markdown);

    assert_eq!(
        commitments,
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
fn extracts_commitments_from_english_section() {
    let markdown = r#"
# Summary

### Action Items

| Responsible | Commitment | Due Date |
| --- | --- | --- |
| Maria | Share deck | 2026-07-11 |
"#;

    let commitments = extract_commitments_from_markdown(markdown);

    assert_eq!(
        commitments,
        vec![CommitmentDraft {
            responsible: Some("Maria".to_string()),
            description: "Share deck".to_string(),
            due_date: Some("2026-07-11".to_string()),
        }]
    );
}

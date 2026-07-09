//! Lightweight intent extraction for the smart search box.
//!
//! Turns natural queries like "¿Qué compromisos vencen esta semana?" or
//! "¿Qué acuerdos tiene Juan?" into structured filters (responsible person,
//! due-date window) plus cleaned free-text terms for FTS/LIKE matching.

use regex::Regex;
use std::sync::OnceLock;

#[derive(Debug, Clone, Default, PartialEq)]
pub struct SearchIntent {
    /// Cleaned content terms for full-text / LIKE matching (may be empty)
    pub text_terms: Vec<String>,
    /// Person name to filter commitments by responsible
    pub responsible: Option<String>,
    /// Query asks for items due within the current week
    pub due_this_week: bool,
    /// Query asks for items due today
    pub due_today: bool,
}

impl SearchIntent {
    pub fn has_due_filter(&self) -> bool {
        self.due_this_week || self.due_today
    }

    /// Terms joined for LIKE fallback matching
    pub fn terms_joined(&self) -> String {
        self.text_terms.join(" ")
    }

    /// Build a safe FTS5 MATCH expression: each term quoted, last term
    /// gets prefix matching. Returns None when there are no terms.
    pub fn fts_match_expression(&self) -> Option<String> {
        if self.text_terms.is_empty() {
            return None;
        }

        let last = self.text_terms.len() - 1;
        let expr = self
            .text_terms
            .iter()
            .enumerate()
            .map(|(i, term)| {
                let escaped = term.replace('"', "");
                if i == last {
                    format!("\"{}\"*", escaped)
                } else {
                    format!("\"{}\"", escaped)
                }
            })
            .collect::<Vec<_>>()
            .join(" ");

        Some(expr)
    }
}

const STOPWORDS: &[&str] = &[
    // Spanish question/filler words
    "que", "qué", "cuales", "cuáles", "cual", "cuál", "quien", "quién", "como", "cómo",
    "de", "del", "la", "las", "el", "los", "un", "una", "unos", "unas", "en", "y", "o",
    "a", "al", "se", "su", "sus", "con", "por", "para", "sobre", "este", "esta", "esto",
    "hay", "es", "son", "está", "están", "esta", "estas", "estos", "semana", "hoy", "mañana",
    "tiene", "tienen", "tengo", "vence", "vencen", "pendiente", "pendientes",
    "reunion", "reunión", "reuniones", "minuta", "minutas", "acuerdo", "acuerdos",
    "compromiso", "compromisos", "hablaron", "hablo", "habló", "mencionan", "menciona",
    "mencionaron", "dijeron", "dijo", "trataron", "trato", "trató",
    // English
    "what", "which", "who", "how", "the", "a", "an", "of", "in", "on", "and", "or",
    "to", "for", "by", "with", "about", "this", "week", "today", "tomorrow", "due",
    "meeting", "meetings", "minutes", "commitment", "commitments", "agreement",
    "agreements", "mention", "mentions", "mentioned", "talked", "said", "have", "has",
    "is", "are",
];

fn is_stopword(word: &str) -> bool {
    let lower = word.to_lowercase();
    STOPWORDS.contains(&lower.as_str())
}

fn responsible_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        // "de Juan", "tiene Juan", "asignados a Juan", "para Juan", "of Juan", "by Juan"
        Regex::new(
            r"(?:\bde\b|\btiene[n]?\b|\ba\b|\bpara\b|\bof\b|\bfor\b|\bby\b)\s+([A-ZÁÉÍÓÚÑÜ][a-záéíóúñü]+(?:\s+[A-ZÁÉÍÓÚÑÜ][a-záéíóúñü]+)?)",
        )
        .expect("valid responsible regex")
    })
}

fn due_week_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"(?i)\besta\s+semana\b|\bthis\s+week\b|\bpróxima\s+semana\b|\bmañana\b|\btomorrow\b")
            .expect("valid due-week regex")
    })
}

fn due_today_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)\bhoy\b|\btoday\b").expect("valid due-today regex"))
}

pub fn parse_search_intent(query: &str) -> SearchIntent {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return SearchIntent::default();
    }

    let due_this_week = due_week_regex().is_match(trimmed);
    let due_today = due_today_regex().is_match(trimmed);

    let responsible = responsible_regex()
        .captures(trimmed)
        .map(|caps| caps[1].trim().to_string());

    // Strip punctuation, then keep meaningful terms (drop stopwords and the
    // captured responsible name so it doesn't double as a text term).
    let responsible_lower = responsible.as_deref().map(|r| r.to_lowercase());
    let text_terms: Vec<String> = trimmed
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty())
        .filter(|w| w.chars().count() > 1)
        .filter(|w| !is_stopword(w))
        .filter(|w| {
            responsible_lower
                .as_deref()
                .map(|r| !r.split_whitespace().any(|part| part == w.to_lowercase()))
                .unwrap_or(true)
        })
        .map(|w| w.to_string())
        .collect();

    SearchIntent {
        text_terms,
        responsible,
        due_this_week,
        due_today,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_responsible_from_spanish_question() {
        let intent = parse_search_intent("¿Qué acuerdos tiene Juan?");
        assert_eq!(intent.responsible.as_deref(), Some("Juan"));
        assert!(!intent.has_due_filter());
        assert!(intent.text_terms.is_empty());
    }

    #[test]
    fn detects_due_this_week() {
        let intent = parse_search_intent("¿Qué compromisos vencen esta semana?");
        assert!(intent.due_this_week);
        assert!(intent.text_terms.is_empty());
    }

    #[test]
    fn keeps_topic_terms_like_acronyms() {
        let intent = parse_search_intent("¿Qué reuniones mencionan IPERC?");
        assert_eq!(intent.text_terms, vec!["IPERC".to_string()]);
        assert!(intent.responsible.is_none());
    }

    #[test]
    fn plain_topic_search_passes_through() {
        let intent = parse_search_intent("plan SST");
        assert_eq!(intent.text_terms, vec!["plan".to_string(), "SST".to_string()]);
    }

    #[test]
    fn builds_prefix_match_expression() {
        let intent = parse_search_intent("plan SST");
        assert_eq!(intent.fts_match_expression().as_deref(), Some("\"plan\" \"SST\"*"));
    }

    #[test]
    fn compound_responsible_name() {
        let intent = parse_search_intent("compromisos de Juan Pérez");
        assert_eq!(intent.responsible.as_deref(), Some("Juan Pérez"));
    }

    #[test]
    fn due_today_detection() {
        let intent = parse_search_intent("qué vence hoy");
        assert!(intent.due_today);
    }
}

//! Smart search over meetings, transcripts, summaries and commitments.
//!
//! Uses the FTS5 `search_fts` index when available (see
//! `DatabaseManager::init_search_index`) and degrades to LIKE otherwise.

use crate::database::models::CommitmentWithMeetingModel;
use crate::database::search_intent::{parse_search_intent, SearchIntent};
use chrono::{Datelike, Duration, Local};
use serde::Serialize;
use sqlx::SqlitePool;

const MEETING_LIMIT: i64 = 8;
const CONTENT_LIMIT: i64 = 12;
const COMMITMENT_LIMIT: i64 = 20;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct MeetingHit {
    pub id: String,
    pub title: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ContentHit {
    pub meeting_id: String,
    pub meeting_title: String,
    pub snippet: String,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SmartSearchResults {
    pub meetings: Vec<MeetingHit>,
    pub transcripts: Vec<ContentHit>,
    pub summaries: Vec<ContentHit>,
    pub commitments: Vec<CommitmentWithMeetingModel>,
    /// Whether FTS5 powered the content sections (LIKE fallback otherwise)
    pub used_fts: bool,
}

pub struct SearchRepository;

impl SearchRepository {
    pub async fn smart_search(
        pool: &SqlitePool,
        query: &str,
        fts_available: bool,
    ) -> Result<SmartSearchResults, sqlx::Error> {
        let intent = parse_search_intent(query);
        let terms = intent.terms_joined();
        let free_text = if terms.is_empty() { query.trim().to_string() } else { terms };

        let mut results = SmartSearchResults {
            used_fts: false,
            ..Default::default()
        };

        if free_text.is_empty() && intent.responsible.is_none() && !intent.has_due_filter() {
            return Ok(results);
        }

        if !free_text.is_empty() {
            results.meetings = Self::search_meetings(pool, &free_text).await?;

            let fts_expr = intent.fts_match_expression();
            if fts_available && fts_expr.is_some() {
                let expr = fts_expr.unwrap();
                results.transcripts =
                    Self::search_content_fts(pool, &expr, "transcript").await?;
                results.summaries = Self::search_content_fts(pool, &expr, "summary").await?;
                results.used_fts = true;
            } else {
                results.transcripts = Self::search_transcripts_like(pool, &free_text).await?;
                results.summaries = Self::search_summaries_like(pool, &free_text).await?;
            }
        }

        results.commitments = Self::search_commitments(pool, &intent, &free_text).await?;

        Ok(results)
    }

    async fn search_meetings(
        pool: &SqlitePool,
        text: &str,
    ) -> Result<Vec<MeetingHit>, sqlx::Error> {
        sqlx::query_as::<_, MeetingHit>(
            r#"SELECT id, title, created_at
               FROM meetings
               WHERE LOWER(title) LIKE '%' || LOWER(?1) || '%'
               ORDER BY created_at DESC
               LIMIT ?2"#,
        )
        .bind(text)
        .bind(MEETING_LIMIT)
        .fetch_all(pool)
        .await
    }

    async fn search_content_fts(
        pool: &SqlitePool,
        match_expr: &str,
        source: &str,
    ) -> Result<Vec<ContentHit>, sqlx::Error> {
        sqlx::query_as::<_, ContentHit>(
            r#"SELECT s.meeting_id AS meeting_id,
                      m.title AS meeting_title,
                      snippet(search_fts, 0, '<b>', '</b>', '…', 12) AS snippet
               FROM search_fts s
               JOIN meetings m ON m.id = s.meeting_id
               WHERE search_fts MATCH ?1 AND s.source = ?2
               LIMIT ?3"#,
        )
        .bind(match_expr)
        .bind(source)
        .bind(CONTENT_LIMIT)
        .fetch_all(pool)
        .await
    }

    async fn search_transcripts_like(
        pool: &SqlitePool,
        text: &str,
    ) -> Result<Vec<ContentHit>, sqlx::Error> {
        sqlx::query_as::<_, ContentHit>(
            r#"SELECT t.meeting_id AS meeting_id,
                      m.title AS meeting_title,
                      substr(
                        t.transcript,
                        max(1, instr(LOWER(t.transcript), LOWER(?1)) - 60),
                        160
                      ) AS snippet
               FROM transcripts t
               JOIN meetings m ON m.id = t.meeting_id
               WHERE LOWER(t.transcript) LIKE '%' || LOWER(?1) || '%'
               ORDER BY t.timestamp DESC
               LIMIT ?2"#,
        )
        .bind(text)
        .bind(CONTENT_LIMIT)
        .fetch_all(pool)
        .await
    }

    async fn search_summaries_like(
        pool: &SqlitePool,
        text: &str,
    ) -> Result<Vec<ContentHit>, sqlx::Error> {
        sqlx::query_as::<_, ContentHit>(
            r#"SELECT sp.meeting_id AS meeting_id,
                      m.title AS meeting_title,
                      substr(
                        json_extract(sp.result, '$.markdown'),
                        max(1, instr(LOWER(json_extract(sp.result, '$.markdown')), LOWER(?1)) - 60),
                        160
                      ) AS snippet
               FROM summary_processes sp
               JOIN meetings m ON m.id = sp.meeting_id
               WHERE sp.status = 'completed'
                 AND json_extract(sp.result, '$.markdown') IS NOT NULL
                 AND LOWER(json_extract(sp.result, '$.markdown')) LIKE '%' || LOWER(?1) || '%'
               LIMIT ?2"#,
        )
        .bind(text)
        .bind(CONTENT_LIMIT)
        .fetch_all(pool)
        .await
    }

    async fn search_commitments(
        pool: &SqlitePool,
        intent: &SearchIntent,
        free_text: &str,
    ) -> Result<Vec<CommitmentWithMeetingModel>, sqlx::Error> {
        let mut sql = String::from(
            r#"SELECT c.id, c.meeting_id, m.title AS meeting_title, c.responsible,
                      c.description, c.due_date, c.status, c.created_at, c.updated_at
               FROM commitments c
               JOIN meetings m ON m.id = c.meeting_id
               WHERE 1 = 1"#,
        );

        let mut binds: Vec<String> = Vec::new();

        if let Some(responsible) = &intent.responsible {
            sql.push_str(" AND LOWER(c.responsible) LIKE '%' || LOWER(?) || '%'");
            binds.push(responsible.clone());
        }

        if intent.has_due_filter() {
            let today = Local::now().date_naive();
            let (from, to) = if intent.due_today && !intent.due_this_week {
                (today, today)
            } else {
                let monday = today - Duration::days(today.weekday().num_days_from_monday() as i64);
                (monday, monday + Duration::days(6))
            };
            sql.push_str(
                " AND c.due_date IS NOT NULL AND c.due_date != '' \
                  AND date(c.due_date) BETWEEN date(?) AND date(?) \
                  AND LOWER(c.status) != 'completed'",
            );
            binds.push(from.format("%Y-%m-%d").to_string());
            binds.push(to.format("%Y-%m-%d").to_string());
        }

        // Free text matches description (or responsible) when it's the only signal
        if intent.responsible.is_none() && !intent.has_due_filter() {
            if free_text.is_empty() {
                return Ok(Vec::new());
            }
            sql.push_str(
                " AND (LOWER(c.description) LIKE '%' || LOWER(?) || '%' \
                   OR LOWER(c.responsible) LIKE '%' || LOWER(?) || '%')",
            );
            binds.push(free_text.to_string());
            binds.push(free_text.to_string());
        } else if !free_text.is_empty() {
            sql.push_str(" AND LOWER(c.description) LIKE '%' || LOWER(?) || '%'");
            binds.push(free_text.to_string());
        }

        sql.push_str(" ORDER BY c.due_date ASC, c.created_at DESC LIMIT ?");

        let mut query = sqlx::query_as::<_, CommitmentWithMeetingModel>(&sql);
        for bind in &binds {
            query = query.bind(bind);
        }
        query = query.bind(COMMITMENT_LIMIT);

        query.fetch_all(pool).await
    }

    /// Upsert the completed summary markdown into the FTS index.
    /// Silently no-ops when the index does not exist (FTS5 unavailable).
    pub async fn index_summary(pool: &SqlitePool, meeting_id: &str, markdown: &str) {
        let delete = sqlx::query(
            "DELETE FROM search_fts WHERE source = 'summary' AND source_id = ?1",
        )
        .bind(meeting_id)
        .execute(pool)
        .await;

        if delete.is_err() {
            // Table missing → FTS unavailable; nothing to index
            return;
        }

        if let Err(e) = sqlx::query(
            "INSERT INTO search_fts(content, meeting_id, source, source_id) \
             VALUES (?1, ?2, 'summary', ?2)",
        )
        .bind(markdown)
        .bind(meeting_id)
        .execute(pool)
        .await
        {
            log::warn!("Failed to index summary for search ({}): {}", meeting_id, e);
        }
    }
}

use crate::api::{TranscriptSearchResult, TranscriptSegment};
use chrono::Utc;
use sqlx::{Connection, Error as SqlxError, SqlitePool};
use tracing::{error, info};
use uuid::Uuid;

pub struct TranscriptsRepository;

impl TranscriptsRepository {
    /// Saves a new meeting and its associated transcript segments.
    /// This function uses a transaction to ensure that either both the meeting
    /// and all its transcripts are saved, or none of them are.
    pub async fn save_transcript(
        pool: &SqlitePool,
        meeting_title: &str,
        transcripts: &[TranscriptSegment],
        folder_path: Option<String>,
    ) -> Result<String, SqlxError> {
        let meeting_id = format!("meeting-{}", Uuid::new_v4());

        let mut conn = pool.acquire().await?;
        let mut transaction = conn.begin().await?;

        let now = Utc::now();

        // 1. Create the new meeting
        let result = sqlx::query(
            "INSERT INTO meetings (id, title, created_at, updated_at, folder_path) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(&meeting_id)
        .bind(meeting_title)
        .bind(now)
        .bind(now)
        .bind(&folder_path)
        .execute(&mut *transaction)
        .await;

        if let Err(e) = result {
            error!("Failed to create meeting '{}': {}", meeting_title, e);
            transaction.rollback().await?;
            return Err(e);
        }

        info!("Successfully created meeting with id: {}", meeting_id);

        // 2. Save each transcript segment with audio timing fields
        for segment in transcripts {
            let transcript_id = format!("transcript-{}", Uuid::new_v4());
            let result = sqlx::query(
                "INSERT INTO transcripts (id, meeting_id, transcript, timestamp, audio_start_time, audio_end_time, duration, speaker)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
            )
            .bind(&transcript_id)
            .bind(&meeting_id)
            .bind(&segment.text)
            .bind(&segment.timestamp)
            .bind(segment.audio_start_time)
            .bind(segment.audio_end_time)
            .bind(segment.duration)
            .bind(&segment.speaker)
            .execute(&mut *transaction)
            .await;

            if let Err(e) = result {
                error!(
                    "Failed to save transcript segment for meeting {}: {}",
                    meeting_id, e
                );
                transaction.rollback().await?;
                return Err(e);
            }
        }

        info!(
            "Successfully saved {} transcript segments for meeting {}",
            transcripts.len(),
            meeting_id
        );

        // Commit the transaction
        transaction.commit().await?;

        Ok(meeting_id)
    }

    /// Searches for a query string within the transcripts.
    /// It returns a list of matching transcripts with context.
    pub async fn search_transcripts(
        pool: &SqlitePool,
        query: &str,
    ) -> Result<Vec<TranscriptSearchResult>, SqlxError> {
        if query.trim().is_empty() {
            return Ok(Vec::new());
        }

        // SQLite's built-in LOWER/NOCASE only handles ASCII. Scan deterministic
        // pages in Rust so older Unicode matches are not hidden by newer rows,
        // while still bounding the public result set.
        let query_lower = query.to_lowercase();
        let mut results = Vec::new();
        let mut offset = 0_i64;
        const PAGE_SIZE: i64 = 500;
        const RESULT_LIMIT: usize = 100;

        loop {
            let rows = sqlx::query_as::<_, (String, String, String, String)>(
                "SELECT m.id, m.title, t.transcript, t.timestamp
                 FROM meetings m
                 JOIN transcripts t ON m.id = t.meeting_id
                 ORDER BY m.created_at DESC, t.timestamp ASC
                 LIMIT ? OFFSET ?",
            )
            .bind(PAGE_SIZE)
            .bind(offset)
            .fetch_all(pool)
            .await?;
            let row_count = rows.len();

            for (id, title, transcript, timestamp) in rows {
                if !transcript.to_lowercase().contains(&query_lower) {
                    continue;
                }
                let match_context = Self::get_match_context(&transcript, query);
                results.push(TranscriptSearchResult {
                    id,
                    title,
                    match_context,
                    timestamp,
                });
                if results.len() == RESULT_LIMIT {
                    break;
                }
            }

            if results.len() == RESULT_LIMIT || row_count < PAGE_SIZE as usize {
                break;
            }
            offset += PAGE_SIZE;
        }

        Ok(results)
    }

    /// Helper function to extract a snippet of text around the first match of a query.
    fn get_match_context(transcript: &str, query: &str) -> String {
        let query_lower = query.to_lowercase();
        if query_lower.is_empty() {
            return transcript.chars().take(200).collect();
        }

        // Lowercasing can change both byte length and scalar count (for example,
        // `İ` becomes `i` + combining dot). Keep an explicit map from each
        // lowercased source scalar back to valid byte boundaries in the original.
        let mut transcript_lower = String::new();
        let mut lower_to_source = Vec::new();
        for (source_start, ch) in transcript.char_indices() {
            let source_end = source_start + ch.len_utf8();
            let lower_start = transcript_lower.len();
            transcript_lower.extend(ch.to_lowercase());
            let lower_end = transcript_lower.len();
            lower_to_source.push((lower_start, lower_end, source_start, source_end));
        }

        match transcript_lower.find(&query_lower) {
            Some(lower_match_start) => {
                let lower_match_end = lower_match_start + query_lower.len();
                let source_match_start = lower_to_source
                    .iter()
                    .find(|(start, end, _, _)| lower_match_start >= *start && lower_match_start < *end)
                    .map(|(_, _, source_start, _)| *source_start)
                    .unwrap_or(0);
                let source_match_end = lower_to_source
                    .iter()
                    .find(|(start, end, _, _)| lower_match_end - 1 >= *start && lower_match_end - 1 < *end)
                    .map(|(_, _, _, source_end)| *source_end)
                    .unwrap_or(transcript.len());

                let mut boundaries: Vec<usize> = transcript.char_indices().map(|(index, _)| index).collect();
                boundaries.push(transcript.len());
                let match_start_char = boundaries.binary_search(&source_match_start).unwrap_or(0);
                let match_end_char = boundaries
                    .binary_search(&source_match_end)
                    .unwrap_or(boundaries.len() - 1);
                let context_start_char = match_start_char.saturating_sub(100);
                let context_end_char = (match_end_char + 100).min(boundaries.len() - 1);
                let start_index = boundaries[context_start_char];
                let end_index = boundaries[context_end_char];

                let mut context = String::new();
                if start_index > 0 {
                    context.push_str("...");
                }
                context.push_str(&transcript[start_index..end_index]);
                if end_index < transcript.len() {
                    context.push_str("...");
                }
                context
            }
            None => transcript.chars().take(200).collect(), // Fallback to the start of the transcript
        }
    }
}

#[cfg(test)]
mod tests {
    use super::TranscriptsRepository;
    use sqlx::sqlite::SqlitePoolOptions;

    #[test]
    fn match_context_is_utf8_safe_near_multibyte_boundaries() {
        let transcript = format!("{} objetivo Español 🚀 {}", "界".repeat(50), "á".repeat(80));
        let context = TranscriptsRepository::get_match_context(&transcript, "español 🚀");

        assert!(context.contains("Español 🚀"));
        assert!(context.chars().count() <= 220);
    }

    #[test]
    fn match_context_maps_unicode_lowercase_expansion_to_source_boundaries() {
        let transcript = "Inicio İSTANBUL y cierre";
        let context = TranscriptsRepository::get_match_context(transcript, "İS");

        assert!(context.contains("İSTANBUL"));
    }

    #[tokio::test]
    async fn search_transcripts_is_unicode_case_insensitive() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::query("CREATE TABLE meetings (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL)")
            .execute(&pool).await.unwrap();
        sqlx::query("CREATE TABLE transcripts (id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL, transcript TEXT NOT NULL, timestamp TEXT NOT NULL)")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO meetings (id, title, created_at) VALUES ('m1', 'Plan', '2026-07-12T12:00:00Z')")
            .execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO transcripts (id, meeting_id, transcript, timestamp) VALUES ('t1', 'm1', 'ACUERDO EN ESPAÑOL 🚀', '00:12')")
            .execute(&pool).await.unwrap();

        let results = TranscriptsRepository::search_transcripts(&pool, "español").await.unwrap();

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "m1");
        assert!(results[0].match_context.contains("ESPAÑOL 🚀"));
    }
}

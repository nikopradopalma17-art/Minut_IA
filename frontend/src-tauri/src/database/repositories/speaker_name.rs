use crate::database::models::SpeakerNameModel;
use chrono::Utc;
use sqlx::{SqliteConnection, SqlitePool};
use tracing::info;

pub struct SpeakerNamesRepository;

fn default_display_name_for_speaker_id(speaker_id: &str) -> String {
    if let Some(index) = speaker_id.strip_prefix("speaker_").and_then(|value| value.parse::<usize>().ok()) {
        return format!("Hablante {}", index + 1);
    }

    speaker_id.to_string()
}

impl SpeakerNamesRepository {
    pub async fn list_for_meeting(
        pool: &SqlitePool,
        meeting_id: &str,
    ) -> Result<Vec<SpeakerNameModel>, sqlx::Error> {
        sqlx::query_as::<_, SpeakerNameModel>(
            r#"
            SELECT meeting_id, speaker_id, display_name, created_at, updated_at
            FROM speaker_names
            WHERE meeting_id = ?
            ORDER BY speaker_id ASC
            "#,
        )
        .bind(meeting_id)
        .fetch_all(pool)
        .await
    }

    pub async fn upsert_display_name(
        pool: &SqlitePool,
        meeting_id: &str,
        speaker_id: &str,
        display_name: &str,
    ) -> Result<(), sqlx::Error> {
        let mut tx = pool.begin().await?;
        Self::upsert_display_name_in_transaction(&mut tx, meeting_id, speaker_id, display_name)
            .await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn upsert_defaults(
        transaction: &mut SqliteConnection,
        meeting_id: &str,
        speaker_ids: &[String],
    ) -> Result<(), sqlx::Error> {
        let now = Utc::now();

        for speaker_id in speaker_ids {
            sqlx::query(
                r#"
                INSERT INTO speaker_names (
                    meeting_id,
                    speaker_id,
                    display_name,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(meeting_id, speaker_id) DO NOTHING
                "#,
            )
            .bind(meeting_id)
                .bind(speaker_id)
                .bind(default_display_name_for_speaker_id(speaker_id))
                .bind(now)
                .bind(now)
            .execute(&mut *transaction)
            .await?;
        }

        info!(
            "Seeded {} speaker name(s) for meeting {}",
            speaker_ids.len(),
            meeting_id
        );
        Ok(())
    }

    async fn upsert_display_name_in_transaction(
        transaction: &mut SqliteConnection,
        meeting_id: &str,
        speaker_id: &str,
        display_name: &str,
    ) -> Result<(), sqlx::Error> {
        let now = Utc::now();

        sqlx::query(
            r#"
            INSERT INTO speaker_names (
                meeting_id,
                speaker_id,
                display_name,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(meeting_id, speaker_id) DO UPDATE SET
                display_name = excluded.display_name,
                updated_at = excluded.updated_at
            "#,
        )
        .bind(meeting_id)
        .bind(speaker_id)
        .bind(display_name)
        .bind(now)
        .bind(now)
        .execute(&mut *transaction)
        .await?;

        Ok(())
    }
}

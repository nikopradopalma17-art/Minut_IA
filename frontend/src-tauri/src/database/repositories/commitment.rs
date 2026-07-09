use crate::database::models::CommitmentWithMeetingModel;
use crate::summary::commitments::CommitmentDraft;
use chrono::Utc;
use sqlx::SqlitePool;
use tracing::info;

pub struct CommitmentsRepository;

fn normalise_status(status: &str) -> String {
    status.trim().to_lowercase()
}

impl CommitmentsRepository {
    pub async fn replace_meeting_commitments(
        pool: &SqlitePool,
        meeting_id: &str,
        commitments: &[CommitmentDraft],
    ) -> Result<(), sqlx::Error> {
        let mut transaction = pool.begin().await?;
        let now = Utc::now();

        sqlx::query("DELETE FROM commitments WHERE meeting_id = ?")
            .bind(meeting_id)
            .execute(&mut *transaction)
            .await?;

        for commitment in commitments {
            let status = "pending".to_string();
            sqlx::query(
                r#"
                INSERT INTO commitments (
                    id,
                    meeting_id,
                    responsible,
                    description,
                    due_date,
                    status,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                "#,
            )
            .bind(uuid::Uuid::new_v4().to_string())
            .bind(meeting_id)
            .bind(commitment.responsible.as_deref())
            .bind(&commitment.description)
            .bind(commitment.due_date.as_deref())
            .bind(&status)
            .bind(now)
            .bind(now)
            .execute(&mut *transaction)
            .await?;
        }

        transaction.commit().await?;
        info!(
            "Replaced commitments for meeting_id {} with {} item(s)",
            meeting_id,
            commitments.len()
        );
        Ok(())
    }

    pub async fn list_commitments(
        pool: &SqlitePool,
    ) -> Result<Vec<CommitmentWithMeetingModel>, sqlx::Error> {
        sqlx::query_as::<_, CommitmentWithMeetingModel>(
            r#"
            SELECT
                c.id,
                c.meeting_id,
                m.title AS meeting_title,
                c.responsible,
                c.description,
                c.due_date,
                c.status,
                c.created_at,
                c.updated_at
            FROM commitments c
            JOIN meetings m ON m.id = c.meeting_id
            ORDER BY
                CASE
                    WHEN c.status = 'completed' THEN 1
                    WHEN c.due_date IS NULL OR c.due_date = '' THEN 2
                    ELSE 0
                END,
                c.due_date ASC,
                c.created_at DESC
            "#,
        )
        .fetch_all(pool)
        .await
    }

    pub async fn list_commitments_for_meeting(
        pool: &SqlitePool,
        meeting_id: &str,
    ) -> Result<Vec<CommitmentWithMeetingModel>, sqlx::Error> {
        sqlx::query_as::<_, CommitmentWithMeetingModel>(
            r#"
            SELECT
                c.id,
                c.meeting_id,
                m.title AS meeting_title,
                c.responsible,
                c.description,
                c.due_date,
                c.status,
                c.created_at,
                c.updated_at
            FROM commitments
            AS c
            JOIN meetings m ON m.id = c.meeting_id
            WHERE c.meeting_id = ?
            ORDER BY
                CASE
                    WHEN c.status = 'completed' THEN 1
                    WHEN c.due_date IS NULL OR c.due_date = '' THEN 2
                    ELSE 0
                END,
                c.due_date ASC,
                c.created_at ASC
            "#,
        )
        .bind(meeting_id)
        .fetch_all(pool)
        .await
    }

    pub async fn update_commitment_status(
        pool: &SqlitePool,
        commitment_id: &str,
        status: &str,
    ) -> Result<bool, sqlx::Error> {
        let status = normalise_status(status);
        let now = Utc::now();

        let result = sqlx::query("UPDATE commitments SET status = ?, updated_at = ? WHERE id = ?")
            .bind(&status)
            .bind(now)
            .bind(commitment_id)
            .execute(pool)
            .await?;

        Ok(result.rows_affected() > 0)
    }

    pub async fn count_pending_commitments(pool: &SqlitePool) -> Result<i64, sqlx::Error> {
        let (count,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM commitments WHERE LOWER(status) != 'completed'",
        )
        .fetch_one(pool)
        .await?;

        Ok(count)
    }

    #[allow(dead_code)]
    pub async fn count_due_this_week(pool: &SqlitePool) -> Result<i64, sqlx::Error> {
        let (count,): (i64,) = sqlx::query_as(
            r#"
            SELECT COUNT(*)
            FROM commitments
            WHERE due_date IS NOT NULL
              AND due_date != ''
              AND LOWER(status) != 'completed'
              AND date(due_date) BETWEEN date('now') AND date('now', '+7 days')
            "#,
        )
        .fetch_one(pool)
        .await?;

        Ok(count)
    }

    #[allow(dead_code)]
    pub async fn count_open_commitments(pool: &SqlitePool) -> Result<(i64, i64, i64), sqlx::Error> {
        let pending: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM commitments WHERE LOWER(status) = 'pending'",
        )
        .fetch_one(pool)
        .await?;

        let in_progress: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM commitments WHERE LOWER(status) = 'in_progress'",
        )
        .fetch_one(pool)
        .await?;

        let completed: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM commitments WHERE LOWER(status) = 'completed'",
        )
        .fetch_one(pool)
        .await?;

        Ok((pending.0, in_progress.0, completed.0))
    }
}

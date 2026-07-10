use app_lib::database::repositories::speaker_name::SpeakerNamesRepository;
use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};

async fn speaker_name_pool() -> SqlitePool {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("create in-memory SQLite pool");

    sqlx::query(
        r#"
        CREATE TABLE speaker_names (
            meeting_id TEXT NOT NULL,
            speaker_id TEXT NOT NULL,
            display_name TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (meeting_id, speaker_id)
        )
        "#,
    )
    .execute(&pool)
    .await
    .expect("create speaker_names table");

    pool
}

#[tokio::test]
async fn persists_reloads_and_updates_a_speaker_display_name() {
    let pool = speaker_name_pool().await;

    SpeakerNamesRepository::upsert_display_name(&pool, "meeting-1", "speaker_1", "Speaker 2")
        .await
        .expect("save initial display name");

    let initial = SpeakerNamesRepository::list_for_meeting(&pool, "meeting-1")
        .await
        .expect("reload initial display name");
    assert_eq!(initial.len(), 1);
    assert_eq!(initial[0].speaker_id, "speaker_1");
    assert_eq!(initial[0].display_name, "Speaker 2");

    SpeakerNamesRepository::upsert_display_name(&pool, "meeting-1", "speaker_1", "Ada")
        .await
        .expect("rename speaker");

    let reloaded = SpeakerNamesRepository::list_for_meeting(&pool, "meeting-1")
        .await
        .expect("reload renamed display name");
    assert_eq!(reloaded.len(), 1);
    assert_eq!(reloaded[0].speaker_id, "speaker_1");
    assert_eq!(reloaded[0].display_name, "Ada");
}

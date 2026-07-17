-- Migration: Add flag to track one-shot migration of plaintext API keys to OS keyring.
-- The actual migration is performed in Rust (setting.rs::migrate_plaintext_api_keys_to_keyring)
-- because it needs to call the keyring crate.  This column just records that the
-- migration has already run so we don't repeat it on every startup.

ALTER TABLE settings ADD COLUMN keyringMigrationDone INTEGER NOT NULL DEFAULT 0;
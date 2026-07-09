CREATE TABLE IF NOT EXISTS commitments (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL,
    responsible TEXT,
    description TEXT NOT NULL,
    due_date TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_commitments_meeting_id
    ON commitments(meeting_id);

CREATE INDEX IF NOT EXISTS idx_commitments_status
    ON commitments(status);

CREATE INDEX IF NOT EXISTS idx_commitments_responsible
    ON commitments(responsible);

CREATE INDEX IF NOT EXISTS idx_commitments_due_date
    ON commitments(due_date);

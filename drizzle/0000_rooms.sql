CREATE TABLE IF NOT EXISTS rooms (
 id TEXT PRIMARY KEY,
 host_hash TEXT NOT NULL,
 guest_hash TEXT,
 invite_hash TEXT NOT NULL,
 data TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 0,
 expires INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS rooms_expires ON rooms(expires);

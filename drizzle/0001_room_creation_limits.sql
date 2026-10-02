CREATE TABLE IF NOT EXISTS room_creation_limits (
 ip_hash TEXT PRIMARY KEY,
 count INTEGER NOT NULL,
 expires INTEGER NOT NULL,
 last_room_id TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS room_creation_limits_expires ON room_creation_limits(expires);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS rooms_host_expires ON rooms(host_hash, expires);

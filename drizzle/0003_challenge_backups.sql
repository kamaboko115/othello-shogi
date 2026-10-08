CREATE TABLE IF NOT EXISTS challenge_win_backups (hour INTEGER PRIMARY KEY, created INTEGER NOT NULL, total INTEGER NOT NULL, last_ordinal INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS challenge_wins_created ON challenge_wins(created);
CREATE TABLE IF NOT EXISTS challenge_win_proofs (proof_hash TEXT PRIMARY KEY, match_key TEXT NOT NULL UNIQUE);
INSERT OR IGNORE INTO challenge_win_backups (hour,created,total,last_ordinal) SELECT CAST(strftime('%s','now') AS INTEGER)/3600,CAST(strftime('%s','now') AS INTEGER)*1000,COUNT(*),COALESCE(MAX(ordinal),0) FROM challenge_wins;

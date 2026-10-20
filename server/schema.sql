-- One row per player. Only a random id, a nickname and an all-time token total are kept.
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  nickname_key TEXT NOT NULL UNIQUE, -- lowercase, so "Migs" and "migs" can't both exist
  tokens REAL NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,       -- ms; at most one submit per minute
  hour_start INTEGER NOT NULL,       -- ms; start of the current cheating-cap hour
  hour_tokens REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS players_by_tokens ON players (tokens DESC);

-- How many players joined from one network today (the IP is hashed together with the day).
CREATE TABLE IF NOT EXISTS joins (
  ip_hash TEXT NOT NULL,
  day TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip_hash, day)
);

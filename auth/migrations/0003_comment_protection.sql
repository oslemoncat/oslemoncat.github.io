CREATE TABLE IF NOT EXISTS comment_mutes (
  author_id TEXT PRIMARY KEY CHECK(author_id GLOB 'github:[0-9]*'),
  author_login TEXT NOT NULL,
  moderator_id TEXT NOT NULL CHECK(moderator_id GLOB 'github:[0-9]*'),
  created_at INTEGER NOT NULL
);

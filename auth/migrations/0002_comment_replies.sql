CREATE TABLE IF NOT EXISTS comment_links (
  comment_id TEXT PRIMARY KEY,
  parent_id TEXT NOT NULL,
  root_id TEXT NOT NULL,
  CHECK(comment_id <> parent_id AND comment_id <> root_id)
);
CREATE INDEX IF NOT EXISTS comment_links_root ON comment_links(root_id,comment_id);
CREATE INDEX IF NOT EXISTS comment_links_parent ON comment_links(parent_id,comment_id);
CREATE TABLE IF NOT EXISTS comment_deletions (
  comment_id TEXT PRIMARY KEY,
  deleted_at INTEGER NOT NULL
);

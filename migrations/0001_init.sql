CREATE TABLE IF NOT EXISTS news (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
  pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS news_order_idx
  ON news (pinned DESC, id DESC);

CREATE TABLE IF NOT EXISTS signups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 30),
  class_name TEXT NOT NULL CHECK (length(class_name) BETWEEN 1 AND 30),
  contact TEXT NOT NULL DEFAULT '' CHECK (length(contact) <= 60),
  direction TEXT NOT NULL DEFAULT '' CHECK (length(direction) <= 20),
  note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 300),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS signups_duplicate_check_idx
  ON signups (name, class_name, created_at);

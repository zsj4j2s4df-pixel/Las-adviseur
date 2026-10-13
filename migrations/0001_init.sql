CREATE TABLE IF NOT EXISTS inventory (
  id TEXT PRIMARY KEY,
  world TEXT NOT NULL CHECK (world IN ('tig','migmag','shared')),
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  spec TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  available INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS inventory_world_category ON inventory(world, category);

CREATE TABLE IF NOT EXISTS trials (
  id TEXT PRIMARY KEY,
  world TEXT NOT NULL CHECK (world IN ('tig','migmag')),
  material TEXT NOT NULL,
  thickness TEXT NOT NULL,
  joint TEXT NOT NULL,
  fitup TEXT NOT NULL DEFAULT '',
  result TEXT NOT NULL DEFAULT '',
  settings TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS trials_world_material ON trials(world, material, thickness);

CREATE TABLE IF NOT EXISTS daily_usage (
  day TEXT PRIMARY KEY,
  requests INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_usd REAL NOT NULL DEFAULT 0
);

-- Hosti metadata. Applied on boot when the database is empty.
-- Words come from CONTEXT.md: bundle, revision, collection, share link, push token.

CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- One static site. The unit a person opens, shares and deletes.
-- A bundle carries its whole sharing state: one mode, one share slug, one pin.
--   share_mode  'private' answers nothing, 'link' opens, 'pin' asks first
--   share_slug  the slug the share URL uses, the bundle slug until a rotate
--   pin_hash    the scrypt hash, and only ever set while share_mode is 'pin'
CREATE TABLE bundles (
  id                  INTEGER PRIMARY KEY,
  slug                TEXT    NOT NULL UNIQUE,
  title               TEXT    NOT NULL,
  collection          TEXT,
  current_revision_id INTEGER REFERENCES revisions (id),
  share_mode          TEXT    NOT NULL DEFAULT 'private',
  share_slug          TEXT    NOT NULL DEFAULT '',
  pin_hash            TEXT,
  created_at          TEXT    NOT NULL,
  updated_at          TEXT    NOT NULL
);

CREATE INDEX bundles_collection_idx ON bundles (collection);
CREATE UNIQUE INDEX bundles_share_slug_idx ON bundles (share_slug);

-- One push of a bundle. seq counts from 1 and names the directory on disk (r1, r2, ...).
--   pushed_by  the push token's name when the revision came through the push API,
--              NULL when the owner dropped an archive on the catalog. It records
--              who wrote, never who read: Hosti keeps no record of who opens a link.
CREATE TABLE revisions (
  id         INTEGER PRIMARY KEY,
  bundle_id  INTEGER NOT NULL REFERENCES bundles (id) ON DELETE CASCADE,
  seq        INTEGER NOT NULL,
  byte_size  INTEGER NOT NULL,
  file_count INTEGER NOT NULL,
  pushed_by  TEXT,
  created_at TEXT    NOT NULL,
  UNIQUE (bundle_id, seq)
);

-- A bearer secret an agent or the CLI uses to write. Stored as a SHA-256 hex digest.
--   scopes  the powers the token carries: a sorted, comma-separated list drawn from
--           delete, publish and share, for example 'publish,share'
CREATE TABLE push_tokens (
  id           INTEGER PRIMARY KEY,
  name         TEXT    NOT NULL,
  token_hash   TEXT    NOT NULL UNIQUE,
  created_at   TEXT    NOT NULL,
  last_used_at TEXT,
  scopes       TEXT    NOT NULL
);

INSERT INTO meta (key, value) VALUES ('schema_version', '4');

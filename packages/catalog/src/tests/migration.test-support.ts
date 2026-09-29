import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import Database from "better-sqlite3";
import { Effect, FileSystem, Layer, Path } from "effect";
import { openDatabaseAt } from "../index";

const platformLayer = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);
export const NOW = "2026-09-17T10:00:00.000Z";

const VERSION_1_SCHEMA = `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE bundles (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  collection TEXT,
  current_revision_id INTEGER REFERENCES revisions (id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX bundles_collection_idx ON bundles (collection);
CREATE TABLE revisions (
  id INTEGER PRIMARY KEY,
  bundle_id INTEGER NOT NULL REFERENCES bundles (id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  byte_size INTEGER NOT NULL,
  file_count INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (bundle_id, seq)
);
CREATE TABLE share_links (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  bundle_id INTEGER NOT NULL REFERENCES bundles (id) ON DELETE CASCADE,
  pin_hash TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX share_links_bundle_idx ON share_links (bundle_id);
CREATE TABLE push_tokens (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);
INSERT INTO meta (key, value) VALUES ('schema_version', '1');
`;

const VERSION_2_SCHEMA = `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE bundles (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  collection TEXT,
  current_revision_id INTEGER REFERENCES revisions (id),
  share_mode TEXT NOT NULL DEFAULT 'private',
  share_slug TEXT NOT NULL DEFAULT '',
  pin_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX bundles_collection_idx ON bundles (collection);
CREATE UNIQUE INDEX bundles_share_slug_idx ON bundles (share_slug);
CREATE TABLE revisions (
  id INTEGER PRIMARY KEY,
  bundle_id INTEGER NOT NULL REFERENCES bundles (id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  byte_size INTEGER NOT NULL,
  file_count INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (bundle_id, seq)
);
CREATE TABLE push_tokens (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);
INSERT INTO meta (key, value) VALUES ('schema_version', '2');
`;

const VERSION_3_SCHEMA = `${VERSION_2_SCHEMA.replace(
  "  created_at TEXT NOT NULL,\n  UNIQUE (bundle_id, seq)",
  "  pushed_by TEXT,\n  created_at TEXT NOT NULL,\n  UNIQUE (bundle_id, seq)",
).replace("'schema_version', '2'", "'schema_version', '3'")}`;

export function withTempDirectory<A, E>(
  test: (dataDir: string, schemaSql: string) => Effect.Effect<A, E>,
) {
  return Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dataDir = yield* fs.makeTempDirectoryScoped({ prefix: "hosti-migration-" });
      const schemaSql = yield* fs.readFileString(
        path.resolve(import.meta.dirname, "../../schema.sql"),
      );
      return yield* test(dataDir, schemaSql);
    }).pipe(Effect.provide(platformLayer)),
  );
}

export function withDatabase<A, E>(
  file: string,
  schemaSql: string,
  test: (database: Database.Database) => Effect.Effect<A, E>,
) {
  return Effect.scoped(
    Effect.acquireUseRelease(openDatabaseAt(file, schemaSql), test, (database) =>
      Effect.sync(() => database.close()),
    ),
  );
}

export function seedVersion1(file: string): void {
  const database = new Database(file);
  database.exec(VERSION_1_SCHEMA);
  for (const [id, slug] of [
    [1, "squad-2026"],
    [2, "garmin-q3"],
  ] as const) {
    database
      .prepare(
        `INSERT INTO bundles (id, slug, title, collection, created_at, updated_at)
         VALUES (?, ?, ?, 'reports', ?, ?)`,
      )
      .run(id, slug, slug, NOW, NOW);
  }
  for (const [id, bundleId, seq] of [
    [1, 1, 1],
    [2, 1, 2],
    [3, 2, 1],
  ] as const) {
    database
      .prepare(
        `INSERT INTO revisions (id, bundle_id, seq, byte_size, file_count, created_at)
         VALUES (?, ?, ?, 100, 3, ?)`,
      )
      .run(id, bundleId, seq, NOW);
  }
  database.prepare("UPDATE bundles SET current_revision_id = 2 WHERE id = 1").run();
  database.prepare("UPDATE bundles SET current_revision_id = 3 WHERE id = 2").run();
  for (const [slug, bundleId, pinHash] of [
    ["squad-2026", 1, null],
    ["squad-2026-k7f3n9qp", 1, "scrypt$16384$8$1$salt$key"],
    ["garmin-q3", 2, null],
  ] as const) {
    database
      .prepare(
        `INSERT INTO share_links (slug, bundle_id, pin_hash, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(slug, bundleId, pinHash, NOW);
  }
  database
    .prepare(
      "INSERT INTO push_tokens (name, token_hash, created_at) VALUES ('laptop', 'abc123', ?)",
    )
    .run(NOW);
  database.close();
}

export function seedVersion2(file: string): void {
  const database = new Database(file);
  database.exec(VERSION_2_SCHEMA);
  database
    .prepare(
      `INSERT INTO bundles (id, slug, title, collection, share_mode, share_slug, created_at, updated_at)
       VALUES (1, 'squad-2026', 'Squad 2026', 'reports', 'link', 'squad-2026', ?, ?)`,
    )
    .run(NOW, NOW);
  database
    .prepare(
      `INSERT INTO bundles (id, slug, title, collection, share_mode, share_slug, pin_hash, created_at, updated_at)
       VALUES (2, 'garmin-q3', 'Garmin Q3', NULL, 'pin', 'kmqbwxz23456', 'scrypt$16384$8$1$salt$key', ?, ?)`,
    )
    .run(NOW, NOW);
  for (const [id, bundleId, seq] of [
    [1, 1, 1],
    [2, 1, 2],
    [3, 2, 1],
  ] as const) {
    database
      .prepare(
        `INSERT INTO revisions (id, bundle_id, seq, byte_size, file_count, created_at)
         VALUES (?, ?, ?, 100, 3, ?)`,
      )
      .run(id, bundleId, seq, NOW);
  }
  database.prepare("UPDATE bundles SET current_revision_id = 2 WHERE id = 1").run();
  database.prepare("UPDATE bundles SET current_revision_id = 3 WHERE id = 2").run();
  for (const [name, hash] of [
    ["laptop", "abc123"],
    ["ci", "def456"],
  ] as const) {
    database
      .prepare("INSERT INTO push_tokens (name, token_hash, created_at) VALUES (?, ?, ?)")
      .run(name, hash, NOW);
  }
  database.close();
}

export function tableNames(database: Database.Database): string[] {
  return (
    database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as {
      name: string;
    }[]
  ).map((row) => row.name);
}

export function seedVersion3(file: string): void {
  const database = new Database(file);
  database.exec(VERSION_3_SCHEMA);
  database
    .prepare(
      `INSERT INTO bundles (id, slug, title, collection, share_mode, share_slug, created_at, updated_at)
       VALUES (1, 'squad-2026', 'Squad 2026', 'reports', 'link', 'squad-2026', ?, ?)`,
    )
    .run(NOW, NOW);
  database
    .prepare(
      `INSERT INTO revisions (id, bundle_id, seq, byte_size, file_count, pushed_by, created_at)
       VALUES (1, 1, 1, 100, 3, 'laptop', ?)`,
    )
    .run(NOW);
  database.prepare("UPDATE bundles SET current_revision_id = 1 WHERE id = 1").run();
  for (const [id, name, hash, lastUsed] of [
    [7, "laptop", "abc123", NOW],
    [9, "ci", "def456", null],
  ] as const) {
    database
      .prepare(
        "INSERT INTO push_tokens (id, name, token_hash, created_at, last_used_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(id, name, hash, NOW, lastUsed);
  }
  database.close();
}

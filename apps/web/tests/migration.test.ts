/**
 * Schema 1 to 2: sharing moves onto the bundle and `share_links` goes.
 * Schema 2 to 3: a revision records which push token wrote it.
 *
 * The test builds a version 1 database by hand, then opens it the way the app
 * does and checks what survived. Bundles, revisions and push tokens keep every
 * row. Every bundle lands private, because the old rows held slugs and pins
 * nobody can map onto a single link.
 *
 * The old `share_links` also carried two columns this fixture leaves out. They
 * held no behaviour, and the migration drops the whole table, so no assertion
 * here depends on them.
 */
import Database from "better-sqlite3";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const { openDatabase } = await import("@/server/db/open.mjs");

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

/**
 * Version 2, which is version 1 with sharing on the bundle row and no
 * `share_links`. `revisions` has no `pushed_by` yet: version 3 adds it.
 */
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

const NOW = "2026-09-17T10:00:00.000Z";

let dataDir: string | null = null;

/** A version 1 file with two bundles, three revisions, three links, one token. */
async function makeVersion1(): Promise<string> {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "hosti-migration-"));
  const file = path.join(dataDir, "hosti.db");
  const db = new Database(file);
  db.exec(VERSION_1_SCHEMA);
  for (const [id, slug] of [
    [1, "squad-2026"],
    [2, "garmin-q3"],
  ] as const) {
    db.prepare(
      `INSERT INTO bundles (id, slug, title, collection, created_at, updated_at)
       VALUES (?, ?, ?, 'reports', ?, ?)`,
    ).run(id, slug, slug, NOW, NOW);
  }
  for (const [id, bundleId, seq] of [
    [1, 1, 1],
    [2, 1, 2],
    [3, 2, 1],
  ] as const) {
    db.prepare(
      `INSERT INTO revisions (id, bundle_id, seq, byte_size, file_count, created_at)
       VALUES (?, ?, ?, 100, 3, ?)`,
    ).run(id, bundleId, seq, NOW);
  }
  db.prepare("UPDATE bundles SET current_revision_id = 2 WHERE id = 1").run();
  db.prepare("UPDATE bundles SET current_revision_id = 3 WHERE id = 2").run();
  for (const [slug, bundleId, pinHash] of [
    ["squad-2026", 1, null],
    ["squad-2026-k7f3n9qp", 1, "scrypt$16384$8$1$salt$key"],
    ["garmin-q3", 2, null],
  ] as const) {
    db.prepare(
      `INSERT INTO share_links (slug, bundle_id, pin_hash, created_at)
       VALUES (?, ?, ?, ?)`,
    ).run(slug, bundleId, pinHash, NOW);
  }
  db.prepare(
    "INSERT INTO push_tokens (name, token_hash, created_at) VALUES ('laptop', 'abc123', ?)",
  ).run(NOW);
  db.close();
  return file;
}

/** A version 2 file with two bundles, three revisions, two tokens, one pin. */
async function makeVersion2(): Promise<string> {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "hosti-migration-2-"));
  const file = path.join(dataDir, "hosti.db");
  const db = new Database(file);
  db.exec(VERSION_2_SCHEMA);
  db.prepare(
    `INSERT INTO bundles (id, slug, title, collection, share_mode, share_slug, created_at, updated_at)
     VALUES (1, 'squad-2026', 'Squad 2026', 'reports', 'link', 'squad-2026', ?, ?)`,
  ).run(NOW, NOW);
  db.prepare(
    `INSERT INTO bundles (id, slug, title, collection, share_mode, share_slug, pin_hash, created_at, updated_at)
     VALUES (2, 'garmin-q3', 'Garmin Q3', NULL, 'pin', 'kmqbwxz23456', 'scrypt$16384$8$1$salt$key', ?, ?)`,
  ).run(NOW, NOW);
  for (const [id, bundleId, seq] of [
    [1, 1, 1],
    [2, 1, 2],
    [3, 2, 1],
  ] as const) {
    db.prepare(
      `INSERT INTO revisions (id, bundle_id, seq, byte_size, file_count, created_at)
       VALUES (?, ?, ?, 100, 3, ?)`,
    ).run(id, bundleId, seq, NOW);
  }
  db.prepare("UPDATE bundles SET current_revision_id = 2 WHERE id = 1").run();
  db.prepare("UPDATE bundles SET current_revision_id = 3 WHERE id = 2").run();
  for (const [name, hash] of [
    ["laptop", "abc123"],
    ["ci", "def456"],
  ] as const) {
    db.prepare("INSERT INTO push_tokens (name, token_hash, created_at) VALUES (?, ?, ?)").run(
      name,
      hash,
      NOW,
    );
  }
  db.close();
  return file;
}

function tableNames(db: Database.Database): string[] {
  return (
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as {
      name: string;
    }[]
  ).map((row) => row.name);
}

afterEach(async () => {
  if (dataDir) await fs.rm(dataDir, { recursive: true, force: true });
  dataDir = null;
});

describe("the move from schema 1 to 2", () => {
  it("keeps every bundle, revision and push token", async () => {
    const file = await makeVersion1();
    const db = openDatabase(file);

    expect(db.prepare("SELECT COUNT(*) AS n FROM bundles").get()).toEqual({ n: 2 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM revisions").get()).toEqual({ n: 3 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM push_tokens").get()).toEqual({ n: 1 });

    const bundle = db.prepare("SELECT * FROM bundles WHERE slug = 'squad-2026'").get() as Record<
      string,
      unknown
    >;
    expect(bundle.title).toBe("squad-2026");
    expect(bundle.collection).toBe("reports");
    expect(bundle.current_revision_id).toBe(2);
    expect(bundle.created_at).toBe(NOW);
    db.close();
  });

  it("drops share_links and every link in it", async () => {
    const file = await makeVersion1();
    const db = openDatabase(file);
    expect(tableNames(db)).toEqual(["bundles", "meta", "push_tokens", "revisions"]);
    db.close();
  });

  it("lands every bundle private, on its own slug, with no pin", async () => {
    const file = await makeVersion1();
    const db = openDatabase(file);
    const rows = db
      .prepare("SELECT slug, share_mode, share_slug, pin_hash FROM bundles ORDER BY slug")
      .all();
    expect(rows).toEqual([
      { slug: "garmin-q3", share_mode: "private", share_slug: "garmin-q3", pin_hash: null },
      { slug: "squad-2026", share_mode: "private", share_slug: "squad-2026", pin_hash: null },
    ]);
    db.close();
  });

  it("writes the new version and runs only once", async () => {
    const file = await makeVersion1();
    const first = openDatabase(file);
    expect(first.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get()).toEqual({
      value: "3",
    });
    // Prove a second open is a no-op rather than a second attempt to add columns.
    first.prepare("UPDATE bundles SET share_mode = 'link' WHERE slug = 'squad-2026'").run();
    first.close();

    const second = openDatabase(file);
    expect(
      second.prepare("SELECT share_mode FROM bundles WHERE slug = 'squad-2026'").get(),
    ).toEqual({ share_mode: "link" });
    second.close();
  });

  it("keeps two share slugs from colliding", async () => {
    const file = await makeVersion1();
    const db = openDatabase(file);
    expect(() =>
      db.prepare("UPDATE bundles SET share_slug = 'garmin-q3' WHERE slug = 'squad-2026'").run(),
    ).toThrow(/UNIQUE/);
    db.close();
  });
});

describe("the move from schema 2 to 3", () => {
  it("keeps every bundle, revision and push token", async () => {
    const file = await makeVersion2();
    const db = openDatabase(file);

    expect(db.prepare("SELECT COUNT(*) AS n FROM bundles").get()).toEqual({ n: 2 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM revisions").get()).toEqual({ n: 3 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM push_tokens").get()).toEqual({ n: 2 });

    expect(
      db
        .prepare("SELECT slug, title, collection, share_mode, share_slug FROM bundles ORDER BY id")
        .all(),
    ).toEqual([
      {
        slug: "squad-2026",
        title: "Squad 2026",
        collection: "reports",
        share_mode: "link",
        share_slug: "squad-2026",
      },
      {
        slug: "garmin-q3",
        title: "Garmin Q3",
        collection: null,
        share_mode: "pin",
        share_slug: "kmqbwxz23456",
      },
    ]);
    expect(db.prepare("SELECT name FROM push_tokens ORDER BY name").all()).toEqual([
      { name: "ci" },
      { name: "laptop" },
    ]);
    db.close();
  });

  it("leaves pushed_by NULL on every revision that was already there", async () => {
    const file = await makeVersion2();
    const db = openDatabase(file);
    expect(db.prepare("SELECT id, seq, pushed_by FROM revisions ORDER BY id").all()).toEqual([
      { id: 1, seq: 1, pushed_by: null },
      { id: 2, seq: 2, pushed_by: null },
      { id: 3, seq: 1, pushed_by: null },
    ]);
    expect(db.prepare("SELECT current_revision_id FROM bundles ORDER BY id").all()).toEqual([
      { current_revision_id: 2 },
      { current_revision_id: 3 },
    ]);
    db.close();
  });

  it("writes the new version and runs only once", async () => {
    const file = await makeVersion2();
    const first = openDatabase(file);
    expect(first.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get()).toEqual({
      value: "3",
    });
    // Prove a second open is a no-op rather than a second ALTER, which would throw.
    first.prepare("UPDATE revisions SET pushed_by = 'laptop' WHERE id = 1").run();
    first.close();

    const second = openDatabase(file);
    expect(second.prepare("SELECT pushed_by FROM revisions WHERE id = 1").get()).toEqual({
      pushed_by: "laptop",
    });
    second.close();
  });
});

describe("a database made from scratch", () => {
  it("starts at the same version with the same columns", async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "hosti-fresh-"));
    const db = openDatabase(path.join(dataDir, "hosti.db"));
    expect(db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get()).toEqual({
      value: "3",
    });
    expect(tableNames(db)).toEqual(["bundles", "meta", "push_tokens", "revisions"]);
    const columns = (db.prepare("PRAGMA table_info(bundles)").all() as { name: string }[]).map(
      (row) => row.name,
    );
    expect(columns).toContain("share_mode");
    expect(columns).toContain("share_slug");
    expect(columns).toContain("pin_hash");
    const revisionColumns = (
      db.prepare("PRAGMA table_info(revisions)").all() as { name: string }[]
    ).map((row) => row.name);
    expect(revisionColumns).toContain("pushed_by");
    db.close();
  });

  it("leaves nothing behind when the schema cannot be written", async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "hosti-partial-"));
    const file = path.join(dataDir, "hosti.db");

    // A file with `revisions` already in it and no `meta`. The open reads that
    // as empty and runs the whole schema, which trips on the table that is
    // already there. Everything the run had written up to then must go with it.
    const seeded = new Database(file);
    seeded.exec("CREATE TABLE revisions (id INTEGER PRIMARY KEY);");
    seeded.close();

    expect(() => openDatabase(file)).toThrow(/revisions/);

    const after = new Database(file);
    expect(tableNames(after)).toEqual(["revisions"]);
    after.close();
  });
});

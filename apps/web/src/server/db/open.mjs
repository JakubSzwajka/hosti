import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const SCHEMA_CANDIDATES = ["src/server/db/schema.sql", "apps/web/src/server/db/schema.sql"];

function readSchemaSql() {
  for (const candidate of SCHEMA_CANDIDATES) {
    const full = path.resolve(process.cwd(), candidate);
    if (existsSync(full)) return readFileSync(full, "utf8");
  }
  throw new Error(
    `Cannot find schema.sql. Looked for ${SCHEMA_CANDIDATES.join(", ")} under ${process.cwd()}`,
  );
}

export function openDatabase(databaseFile) {
  mkdirSync(path.dirname(databaseFile), { recursive: true });
  const db = new Database(databaseFile);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  const hasMeta = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'meta'")
    .get();
  if (hasMeta) migrate(db);
  else createSchema(db);
  repairReservedCollection(db);
  return db;
}

function createSchema(db) {
  const sql = readSchemaSql();
  db.transaction(() => db.exec(sql))();
}

const SCHEMA_VERSION = 3;

function setSchemaVersion(db, version) {
  db.prepare("UPDATE meta SET value = ? WHERE key = 'schema_version'").run(String(version));
}

function schemaVersion(db) {
  const row = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get();
  const parsed = Number.parseInt(row?.value ?? "0", 10);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

function migrate(db) {
  if (schemaVersion(db) < 2) db.transaction(toVersion2)(db);
  if (schemaVersion(db) < SCHEMA_VERSION) db.transaction(toVersion3)(db);
}

function toVersion2(db) {
  db.exec(`
    ALTER TABLE bundles ADD COLUMN share_mode TEXT NOT NULL DEFAULT 'private';
    ALTER TABLE bundles ADD COLUMN share_slug TEXT NOT NULL DEFAULT '';
    ALTER TABLE bundles ADD COLUMN pin_hash TEXT;
    UPDATE bundles SET share_slug = slug;
    CREATE UNIQUE INDEX IF NOT EXISTS bundles_share_slug_idx ON bundles (share_slug);
    DROP TABLE IF EXISTS share_links;
  `);
  setSchemaVersion(db, 2);
}

function toVersion3(db) {
  db.exec("ALTER TABLE revisions ADD COLUMN pushed_by TEXT;");
  setSchemaVersion(db, SCHEMA_VERSION);
}

function repairReservedCollection(db) {
  db.prepare("UPDATE bundles SET collection = NULL WHERE collection = '-'").run();
}

// Plain JS so that `scripts/new-token.mjs` and the Next app share one
// implementation of "open the database, apply the schema if it is empty".
// Types live next to it in open.d.mts.
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

/**
 * Open the Hosti database, creating the file and the schema when missing.
 */
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

/**
 * Write the whole schema or none of it. A failure part way used to leave a few
 * tables and no `meta` row, and the next open then read that as an old database
 * and tried to migrate it.
 */
function createSchema(db) {
  const sql = readSchemaSql();
  db.transaction(() => db.exec(sql))();
}

/** The schema version this code expects. schema.sql writes the same number. */
const SCHEMA_VERSION = 2;

function schemaVersion(db) {
  const row = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get();
  const parsed = Number.parseInt(row?.value ?? "0", 10);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

/**
 * Bring an older database up to SCHEMA_VERSION. Each step runs in its own
 * transaction, so a failure leaves the version it started from rather than
 * half a step.
 */
function migrate(db) {
  if (schemaVersion(db) < 2) db.transaction(toVersion2)(db);
}

/**
 * Version 2 moves sharing onto the bundle. A bundle used to carry any number
 * of share_links rows, each with its own slug, pin and expiry; now it carries
 * one mode, one share slug and one pin. Every existing link is dropped and
 * every bundle lands on 'private', which is the only honest default: the old
 * rows held slugs and pins nobody can map onto a single link.
 *
 * Bundles, revisions and push tokens keep every row they had.
 */
function toVersion2(db) {
  db.exec(`
    ALTER TABLE bundles ADD COLUMN share_mode TEXT NOT NULL DEFAULT 'private';
    ALTER TABLE bundles ADD COLUMN share_slug TEXT NOT NULL DEFAULT '';
    ALTER TABLE bundles ADD COLUMN pin_hash TEXT;
    UPDATE bundles SET share_slug = slug;
    CREATE UNIQUE INDEX IF NOT EXISTS bundles_share_slug_idx ON bundles (share_slug);
    DROP TABLE IF EXISTS share_links;
  `);
  db.prepare("UPDATE meta SET value = ? WHERE key = 'schema_version'").run(String(SCHEMA_VERSION));
}

/**
 * `-` is the catalog's path for bundles in no collection, so it can never name
 * one. A push used to be able to set it through X-Hosti-Collection, and such a
 * bundle answered to no chip: not to `-`, which lists bundles with a NULL
 * collection, and not to a chip of its own, because none is drawn for a name
 * the UI reads as "none". Moving it to no collection puts it exactly where its
 * own chip link already pointed. Idempotent, so it may run on every open.
 */
function repairReservedCollection(db) {
  db.prepare("UPDATE bundles SET collection = NULL WHERE collection = '-'").run();
}

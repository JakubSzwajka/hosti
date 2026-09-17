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
  if (!hasMeta) {
    db.exec(readSchemaSql());
  }
  return db;
}

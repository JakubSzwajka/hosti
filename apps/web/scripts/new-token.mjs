#!/usr/bin/env node
import Database from "better-sqlite3";
import { catalogSchemaSql, catalogSchemaVersion } from "@hosti/catalog/schema";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const nameFlag = args.indexOf("--name");
const name = nameFlag === -1 ? "unnamed" : (args[nameFlag + 1] ?? "unnamed");
const scopes = args.includes("--allow-delete") ? "delete,publish,share" : "publish,share";
const dataDir = path.resolve(process.env.HOSTI_DATA_DIR ?? "./data");
const databaseFile = path.join(dataDir, "hosti.db");
let db;
try {
  mkdirSync(dataDir, { recursive: true });
  db = new Database(databaseFile);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  const hasMeta = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'meta'")
    .get();
  if (!hasMeta) {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all();
    if (tables.length > 0) {
      throw new Error(
        "Database schema version is missing. Start the server once so it can migrate the database.",
      );
    }
    db.transaction(() => db.exec(catalogSchemaSql))();
  }

  const versionRow = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get();
  const schemaVersion = Number.parseInt(versionRow?.value ?? "0", 10);
  if (!Number.isSafeInteger(schemaVersion) || schemaVersion < catalogSchemaVersion) {
    throw new Error(
      `Database schema version ${schemaVersion} is older than ${catalogSchemaVersion}. Start the server once so it migrates the database, then retry.`,
    );
  }

  const secret = `hosti_${randomBytes(24).toString("base64url")}`;
  const hash = createHash("sha256").update(secret, "utf8").digest("hex");
  db.prepare(
    "INSERT INTO push_tokens (name, token_hash, created_at, scopes) VALUES (?, ?, ?, ?)",
  ).run(name, hash, new Date().toISOString(), scopes);

  process.stdout.write(`push token "${name}" created in ${dataDir}, scopes ${scopes}\n`);
  process.stdout.write(`${secret}\n`);
  process.stdout.write("Store it now. Hosti keeps only the digest.\n");
  process.stdout.write(
    "An agent can get its own token instead: run `hosti login <url>` and approve it in the browser.\n",
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
} finally {
  db?.close();
}

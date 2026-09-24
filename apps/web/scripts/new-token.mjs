#!/usr/bin/env node
import Database from "better-sqlite3";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const nameFlag = args.indexOf("--name");
const name = nameFlag === -1 ? "unnamed" : (args[nameFlag + 1] ?? "unnamed");
const dataDir = path.resolve(process.env.HOSTI_DATA_DIR ?? "./data");
const databaseFile = path.join(dataDir, "hosti.db");
const schemaFile = new URL("../../../packages/catalog/schema.sql", import.meta.url);
const schemaSql = readFileSync(schemaFile, "utf8");
const versionMatch = schemaSql.match(/\('schema_version',\s*'(\d+)'\)/);

if (!versionMatch) throw new Error("Could not read the current catalog schema version");
const currentSchemaVersion = Number(versionMatch[1]);

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
    db.transaction(() => db.exec(schemaSql))();
  }

  const versionRow = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get();
  const schemaVersion = Number.parseInt(versionRow?.value ?? "0", 10);
  if (!Number.isSafeInteger(schemaVersion) || schemaVersion < currentSchemaVersion) {
    throw new Error(
      `Database schema version ${schemaVersion} is older than ${currentSchemaVersion}. Start the server once so it migrates the database, then retry.`,
    );
  }

  const secret = `hosti_${randomBytes(24).toString("base64url")}`;
  const hash = createHash("sha256").update(secret, "utf8").digest("hex");
  db.prepare("INSERT INTO push_tokens (name, token_hash, created_at) VALUES (?, ?, ?)").run(
    name,
    hash,
    new Date().toISOString(),
  );

  process.stdout.write(`push token "${name}" created in ${dataDir}\n`);
  process.stdout.write(`${secret}\n`);
  process.stdout.write("Store it now. Hosti keeps only the digest.\n");
  process.stdout.write("The catalog mints one too, at /tokens, with the agent prompt beside it.\n");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
} finally {
  db?.close();
}

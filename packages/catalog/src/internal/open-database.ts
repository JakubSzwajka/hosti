import Database from "better-sqlite3";
import { Effect } from "effect";
import { tryCatalog } from "./catalog-errors";

export const openDatabaseAt = Effect.fn("openDatabaseAt")(function* (
  databaseFile: string,
  schemaSql: string,
) {
  const database = yield* tryCatalog("openDatabase", () => new Database(databaseFile));

  return yield* tryCatalog("initializeDatabase", () => {
    database.pragma("journal_mode = WAL");
    database.pragma("foreign_keys = ON");
    database.pragma("busy_timeout = 5000");

    const hasMeta = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'meta'")
      .get();
    if (hasMeta) migrate(database);
    else createSchema(database, schemaSql);
    repairReservedCollection(database);
    return database;
  }).pipe(Effect.tapError(() => Effect.sync(() => database.close())));
});

function createSchema(database: Database.Database, schemaSql: string): void {
  database.transaction(() => database.exec(schemaSql))();
}

const SCHEMA_VERSION = 3;

function setSchemaVersion(database: Database.Database, version: number): void {
  database.prepare("UPDATE meta SET value = ? WHERE key = 'schema_version'").run(String(version));
}

function schemaVersion(database: Database.Database): number {
  const row = database.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as
    | { value?: string }
    | undefined;
  const parsed = Number.parseInt(row?.value ?? "0", 10);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

function migrate(database: Database.Database): void {
  if (schemaVersion(database) < 2) database.transaction(toVersion2)(database);
  if (schemaVersion(database) < SCHEMA_VERSION) database.transaction(toVersion3)(database);
}

function toVersion2(database: Database.Database): void {
  database.exec(`
    ALTER TABLE bundles ADD COLUMN share_mode TEXT NOT NULL DEFAULT 'private';
    ALTER TABLE bundles ADD COLUMN share_slug TEXT NOT NULL DEFAULT '';
    ALTER TABLE bundles ADD COLUMN pin_hash TEXT;
    UPDATE bundles SET share_slug = slug;
    CREATE UNIQUE INDEX IF NOT EXISTS bundles_share_slug_idx ON bundles (share_slug);
    DROP TABLE IF EXISTS share_links;
  `);
  setSchemaVersion(database, 2);
}

function toVersion3(database: Database.Database): void {
  database.exec("ALTER TABLE revisions ADD COLUMN pushed_by TEXT;");
  setSchemaVersion(database, SCHEMA_VERSION);
}

function repairReservedCollection(database: Database.Database): void {
  database.prepare("UPDATE bundles SET collection = NULL WHERE collection = '-'").run();
}

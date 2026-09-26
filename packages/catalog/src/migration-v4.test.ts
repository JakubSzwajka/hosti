import { expect, it } from "@effect/vitest";
import type Database from "better-sqlite3";
import { Effect } from "effect";
import { NOW, seedVersion3, withDatabase, withTempDirectory } from "./migration.test-support";

it.effect("gives every push token from schema 3 all three scopes", () =>
  withTempDirectory((dataDir, schemaSql) => {
    const file = `${dataDir}/hosti.db`;
    return Effect.gen(function* () {
      yield* Effect.sync(() => seedVersion3(file));
      yield* withDatabase(file, schemaSql, (database) =>
        Effect.gen(function* () {
          const version = yield* Effect.sync(() =>
            database.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get(),
          );
          const tokens = yield* Effect.sync(() =>
            database
              .prepare(
                "SELECT id, name, token_hash, created_at, last_used_at, scopes FROM push_tokens ORDER BY id",
              )
              .all(),
          );
          const revisions = yield* Effect.sync(() =>
            database.prepare("SELECT id, pushed_by FROM revisions").all(),
          );

          expect(version).toEqual({ value: "4" });
          expect(tokens).toEqual([
            {
              id: 7,
              name: "laptop",
              token_hash: "abc123",
              created_at: NOW,
              last_used_at: NOW,
              scopes: "delete,publish,share",
            },
            {
              id: 9,
              name: "ci",
              token_hash: "def456",
              created_at: NOW,
              last_used_at: null,
              scopes: "delete,publish,share",
            },
          ]);
          expect(revisions).toEqual([{ id: 1, pushed_by: "laptop" }]);
        }),
      );
    });
  }),
);

it.effect("leaves a migrated push_tokens table shaped like a fresh one", () =>
  withTempDirectory((dataDir, schemaSql) => {
    const migrated = `${dataDir}/migrated.db`;
    const fresh = `${dataDir}/fresh.db`;
    const columns = (database: Database.Database) =>
      database.prepare("PRAGMA table_info(push_tokens)").all();
    return Effect.gen(function* () {
      yield* Effect.sync(() => seedVersion3(migrated));
      const after = yield* withDatabase(migrated, schemaSql, (database) =>
        Effect.sync(() => columns(database)),
      );
      const expected = yield* withDatabase(fresh, schemaSql, (database) =>
        Effect.sync(() => columns(database)),
      );

      expect(after).toEqual(expected);
      expect(after).toContainEqual(
        expect.objectContaining({ name: "scopes", notnull: 1, dflt_value: null }),
      );
    });
  }),
);

it.effect("refuses a push token row with no scopes", () =>
  withTempDirectory((dataDir, schemaSql) => {
    const file = `${dataDir}/hosti.db`;
    return withDatabase(file, schemaSql, (database) =>
      Effect.sync(() =>
        expect(() =>
          database
            .prepare("INSERT INTO push_tokens (name, token_hash, created_at) VALUES ('x', 'y', ?)")
            .run(NOW),
        ).toThrow(/NOT NULL/),
      ),
    );
  }),
);

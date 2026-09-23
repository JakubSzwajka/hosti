import type Database from "better-sqlite3";
import { Context, DateTime, Effect, Layer } from "effect";
import * as Crypto from "effect/Crypto";
import * as PlatformPath from "effect/Path";
import type { CatalogError } from "./catalog-error";
import { tryCatalog } from "./internal/catalog-errors";
import { openDatabaseAt } from "./internal/open-database";
import { makeCatalogReadOperations } from "./internal/catalog-read-operations";
import { makeCatalogWriteOperations } from "./internal/catalog-write-operations";
import type { CatalogMethods } from "./types";

export class Catalog extends Context.Service<Catalog, CatalogMethods>()("@hosti/catalog/Catalog") {
  static readonly layer = (
    initialDataDir: string,
    schemaSql: string,
  ): Layer.Layer<Catalog, never, PlatformPath.Path | Crypto.Crypto> =>
    Layer.effect(
      Catalog,
      Effect.gen(function* () {
        const path = yield* PlatformPath.Path;
        const crypto = yield* Crypto.Crypto;
        let activeDataDir = initialDataDir;
        let openedDatabase: Database.Database | undefined;

        const makeDatabaseEffect = (
          dataDir: string,
        ): Effect.Effect<Effect.Effect<Database.Database, CatalogError>> =>
          Effect.cached(
            openDatabaseAt(path.join(dataDir, "hosti.db"), schemaSql).pipe(
              Effect.tap((database) =>
                Effect.sync(() => {
                  openedDatabase = database;
                }),
              ),
            ),
          );

        let databaseEffect = yield* makeDatabaseEffect(activeDataDir);
        yield* Effect.acquireRelease(Effect.void, () =>
          Effect.sync(() => {
            if (openedDatabase !== undefined) openedDatabase.close();
          }),
        );

        const database = Effect.suspend(() => databaseEffect);
        const nowIso = DateTime.now.pipe(Effect.map(DateTime.formatIso));
        const setDataDir = Effect.fn("Catalog.setDataDir")(function* (dataDir: string) {
          if (dataDir === activeDataDir) return;
          const previousDatabase = openedDatabase;
          if (previousDatabase !== undefined) {
            yield* tryCatalog("closeDatabase", () => previousDatabase.close());
          }
          openedDatabase = undefined;
          activeDataDir = dataDir;
          databaseEffect = yield* makeDatabaseEffect(dataDir);
        });

        return Catalog.of({
          database,
          nowIso,
          setDataDir,
          ...makeCatalogReadOperations(database),
          ...makeCatalogWriteOperations({ database, nowIso, crypto }),
        });
      }),
    );
}

export type CatalogService = Catalog["Service"];

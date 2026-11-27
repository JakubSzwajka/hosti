import { Context, DateTime, Effect, Layer } from "effect";
import * as Crypto from "effect/Crypto";
import * as PlatformPath from "effect/Path";
import { makeCatalogReadOperations } from "./internal/catalog-read-operations";
import { makeCatalogWriteOperations } from "./internal/catalog-write-operations";
import { makeWriterControl, type WriterControl } from "./internal/writer-control";
import type { CatalogMethods } from "./types";
import { WRITER_LEASE_FILE, WriterStateStore, type WriterPermit } from "./writer";

export type CatalogLayerOptions = {
  readonly writerEpoch?: () => string | undefined;
};

export class Catalog extends Context.Service<Catalog, CatalogMethods>()("@hosti/catalog/Catalog") {
  static readonly layer = (
    initialDataDir: string,
    schemaSql: string,
    options: CatalogLayerOptions = {},
  ): Layer.Layer<Catalog, never, PlatformPath.Path | Crypto.Crypto | WriterStateStore> =>
    Layer.effect(
      Catalog,
      Effect.gen(function* () {
        const path = yield* PlatformPath.Path;
        const crypto = yield* Crypto.Crypto;
        const store = yield* WriterStateStore;
        let activeDataDir = initialDataDir;

        const makeControl = (dataDir: string): WriterControl =>
          makeWriterControl({
            dataDir,
            databaseFile: path.join(dataDir, "hosti.db"),
            leaseFile: path.join(dataDir, WRITER_LEASE_FILE),
            schemaSql,
            store,
            writerEpoch: options.writerEpoch?.(),
          });

        let control = makeControl(activeDataDir);
        yield* Effect.acquireRelease(Effect.void, () => Effect.suspend(() => control.close));

        const database = Effect.suspend(() => control.database);
        const nowIso = DateTime.now.pipe(Effect.map(DateTime.formatIso));
        const setDataDir = Effect.fn("Catalog.setDataDir")(function* (dataDir: string) {
          if (dataDir === activeDataDir) return;
          yield* control.close;
          activeDataDir = dataDir;
          control = makeControl(dataDir);
        });

        return Catalog.of({
          database,
          nowIso,
          setDataDir,
          writerStatus: Effect.suspend(() => control.status),
          observeWriter: Effect.suspend(() =>
            control.observe(
              (handle) => makeCatalogReadOperations(Effect.succeed(handle)).listCatalog,
            ),
          ).pipe(Effect.map(({ status, value }) => ({ ...status, bundles: value?.length ?? 0 }))),
          admitWriter: Effect.suspend(() => control.admit),
          releaseWriter: (permit: WriterPermit) => Effect.suspend(() => control.release(permit)),
          whenWriter: (run) => Effect.suspend(() => control.whenWriter(run)),
          fenceOn: (epoch) => Effect.suspend(() => control.fenceOn(epoch)),
          fenceOff: (epoch) => Effect.suspend(() => control.fenceOff(epoch)),
          ...makeCatalogReadOperations(database),
          ...makeCatalogWriteOperations({ database, nowIso, crypto }),
        });
      }),
    );
}

export type CatalogService = Catalog["Service"];

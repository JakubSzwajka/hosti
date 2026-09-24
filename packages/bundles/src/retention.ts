import { Catalog } from "@hosti/catalog";
import { Effect, FileSystem, Option, Path } from "effect";
import { Storage } from "@hosti/storage";
import { catalogBundlesError, internalBundlesError } from "./internal/errors";

export type Pruned = {
  kept: number[];
  removed: number[];
};

export type PruneRevisionsInput = {
  bundleSlug: string;
  bundlesRoot: string;
  keep?: number;
};

export const pruneRevisions = Effect.fn("Bundles.pruneRevisions")(function* ({
  bundleSlug,
  bundlesRoot,
  keep = 5,
}: PruneRevisionsInput) {
  const catalog = yield* Catalog;
  const storage = yield* Storage;
  const bundle = yield* catalog.findBundle(bundleSlug).pipe(Effect.mapError(catalogBundlesError));
  if (!bundle) return { kept: [], removed: [] } satisfies Pruned;

  const records = yield* catalog
    .revisionRecords(bundle.id)
    .pipe(Effect.mapError(catalogBundlesError));
  const newest = records.slice(0, Math.max(1, keep));
  const newestIds = new Set(newest.map((record) => record.id));
  const doomed = records.filter((record) => !record.current && !newestIds.has(record.id));
  if (doomed.length === 0) {
    return { kept: records.map((record) => record.seq), removed: [] } satisfies Pruned;
  }

  yield* catalog
    .deleteRevisionRows(
      bundle.id,
      doomed.map((record) => record.id),
    )
    .pipe(Effect.mapError(catalogBundlesError));

  const removed: number[] = [];
  for (const record of doomed) {
    if (yield* removeRevisionDir(storage, bundlesRoot, bundle.slug, record.seq)) {
      removed.push(record.seq);
    }
  }

  const remaining = yield* catalog
    .revisionRecords(bundle.id)
    .pipe(Effect.mapError(catalogBundlesError));
  return { kept: remaining.map((record) => record.seq), removed } satisfies Pruned;
});

function removeRevisionDir(
  storage: Storage["Service"],
  bundlesRoot: string,
  bundleSlug: string,
  seq: number,
) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* storage.bundleDir(bundlesRoot, bundleSlug);
    const dir = yield* storage.revisionDir(bundlesRoot, bundleSlug, seq);
    if (path.dirname(dir) !== root) return false;

    const symlink = yield* fs.readLink(dir).pipe(Effect.option);
    if (Option.isSome(symlink)) return false;

    const exists = yield* fs.exists(dir).pipe(Effect.mapError(internalBundlesError));
    if (!exists) return true;

    const info = yield* fs.stat(dir).pipe(Effect.mapError(internalBundlesError));
    if (info.type !== "Directory") return false;

    yield* fs
      .remove(dir, { recursive: true, force: true })
      .pipe(Effect.mapError(internalBundlesError));
    return true;
  });
}

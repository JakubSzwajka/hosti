import { Catalog } from "@hosti/catalog";
import { Effect, FileSystem, Path } from "effect";
import { Storage } from "@hosti/storage";
import { catalogBundlesError, internalBundlesError } from "./internal/errors";

export type RemoveBundleInput = {
  slug: string;
  bundlesRoot: string;
};

export const removeBundle = Effect.fn("Bundles.removeBundle")(function* ({
  slug,
  bundlesRoot,
}: RemoveBundleInput) {
  const catalog = yield* Catalog;
  const storage = yield* Storage;
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const bundle = yield* catalog.findBundle(slug).pipe(Effect.mapError(catalogBundlesError));
  if (!bundle) return false;

  yield* catalog.deleteBundle(bundle.id).pipe(Effect.mapError(catalogBundlesError));

  const root = path.resolve(bundlesRoot);
  const dir = yield* storage.bundleDir(bundlesRoot, bundle.slug);
  const target = path.resolve(dir);
  const relative = path.relative(root, target);
  if (path.dirname(target) !== root || relative === "" || path.isAbsolute(relative)) return true;
  if (relative === ".." || relative.startsWith(`..${path.sep}`)) return true;

  yield* fs
    .remove(target, { recursive: true, force: true })
    .pipe(Effect.mapError(internalBundlesError));
  return true;
});

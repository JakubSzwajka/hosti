import { Catalog } from "@hosti/catalog";
import { Effect } from "effect";

export const setCollection = Effect.fn("setCollection")(function* (
  slug: string,
  collection: string | null,
) {
  const catalog = yield* Catalog;
  const bundle = yield* catalog.findBundle(slug);
  if (!bundle) return false;
  yield* catalog.setBundleCollection(bundle.id, collection);
  return true;
});

import { rotateShareSlug } from "@hosti/bundles";
import { Catalog } from "@hosti/catalog";
import { Effect } from "effect";

export const rotateShare = Effect.fn("rotateShare")(function* (slug: string) {
  const catalog = yield* Catalog;
  const bundle = yield* catalog.findBundle(slug);
  if (!bundle) return null;
  yield* rotateShareSlug(bundle.id);
  return yield* catalog.findBundle(slug);
});

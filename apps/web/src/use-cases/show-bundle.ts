import { Catalog } from "@hosti/catalog";
import { Effect } from "effect";

export const showBundle = Effect.fn("showBundle")(function* (slug: string) {
  const catalog = yield* Catalog;
  const record = yield* catalog.findBundle(slug);
  if (!record) return null;
  return { record, bundle: yield* catalog.describeBundle(record) };
});

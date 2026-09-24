import { Catalog } from "@hosti/catalog";
import { Effect } from "effect";

export const listRevisions = Effect.fn("listRevisions")(function* (bundleId: number) {
  const catalog = yield* Catalog;
  return yield* catalog.listRevisions(bundleId);
});

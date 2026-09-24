import { Catalog } from "@hosti/catalog";
import { Effect } from "effect";

export const listCollections = Effect.fn("listCollections")(function* () {
  const catalog = yield* Catalog;
  return yield* catalog.listCollections;
});

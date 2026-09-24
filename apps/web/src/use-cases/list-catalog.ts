import { Catalog } from "@hosti/catalog";
import { Effect } from "effect";

export const listCatalog = Effect.fn("listCatalog")(function* () {
  const catalog = yield* Catalog;
  return yield* catalog.listCatalog;
});

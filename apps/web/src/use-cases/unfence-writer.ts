import { Catalog } from "@hosti/catalog";
import { Effect } from "effect";

export const unfenceWriter = Effect.fn("unfenceWriter")(function* (epoch: string) {
  const catalog = yield* Catalog;
  return yield* catalog.fenceOff(epoch);
});

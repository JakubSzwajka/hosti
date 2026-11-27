import { Catalog } from "@hosti/catalog";
import { Effect } from "effect";

export const fenceWriter = Effect.fn("fenceWriter")(function* (epoch: string) {
  const catalog = yield* Catalog;
  return yield* catalog.fenceOn(epoch);
});

import { Catalog } from "@hosti/catalog";
import { Effect } from "effect";

export const readWriterReadiness = Effect.fn("readWriterReadiness")(function* () {
  const catalog = yield* Catalog;
  return yield* catalog.writerStatus;
});

import { Catalog } from "@hosti/catalog";
import { Effect } from "effect";

export const runDeploySmoke = Effect.fn("runDeploySmoke")(function* () {
  const catalog = yield* Catalog;
  const observed = yield* catalog.observeWriter;
  return {
    ok: observed.ready,
    writer: observed.writer,
    schema: observed.schema,
    bundles: observed.bundles,
  };
});

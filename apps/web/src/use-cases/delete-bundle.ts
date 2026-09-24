import { removeBundle } from "@hosti/bundles";
import { Effect } from "effect";

export const deleteBundle = Effect.fn("deleteBundle")(function* (input: {
  slug: string;
  bundlesRoot: string;
}) {
  return yield* removeBundle(input);
});

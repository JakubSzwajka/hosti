import { pruneRevisions } from "@hosti/bundles";
import { Effect } from "effect";

export const pruneBundle = Effect.fn("pruneBundle")(function* (input: {
  bundleSlug: string;
  bundlesRoot: string;
  keep: number;
}) {
  return yield* pruneRevisions(input);
});

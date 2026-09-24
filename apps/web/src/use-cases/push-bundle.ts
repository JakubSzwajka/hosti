import { acceptPush, type StoreRevisionInput } from "@hosti/bundles";
import { Effect } from "effect";

export const pushBundle = Effect.fn("pushBundle")(function* (input: StoreRevisionInput) {
  return yield* acceptPush(input);
});

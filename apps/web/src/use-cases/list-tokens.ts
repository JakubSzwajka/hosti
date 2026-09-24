import { Identity } from "@hosti/identity";
import { Effect } from "effect";

export const listTokens = Effect.fn("listTokens")(function* () {
  const identity = yield* Identity;
  return yield* identity.listPushTokens;
});

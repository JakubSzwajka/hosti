import { Identity } from "@hosti/identity";
import { Effect } from "effect";

export const revokeToken = Effect.fn("revokeToken")(function* (id: number) {
  const identity = yield* Identity;
  return yield* identity.deletePushToken(id);
});

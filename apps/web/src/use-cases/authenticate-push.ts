import { bearerSecret, Identity } from "@hosti/identity";
import { Effect } from "effect";

export const authenticatePush = Effect.fn("authenticatePush")(function* (
  authorization: string | null,
) {
  const identity = yield* Identity;
  return yield* identity.authenticatePush(bearerSecret(authorization));
});

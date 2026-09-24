import { Identity } from "@hosti/identity";
import { Effect } from "effect";

export const authenticatePush = Effect.fn("authenticatePush")(function* (
  authorization: string | null,
) {
  const identity = yield* Identity;
  if (!authorization?.startsWith("Bearer ")) return null;
  const secret = authorization.slice("Bearer ".length).trim();
  if (!secret) return null;
  return yield* identity.authenticatePush(secret);
});

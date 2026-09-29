import { LoginThrottle } from "@hosti/identity";
import { Effect } from "effect";

export const checkLoginAttempt = Effect.fn("checkLoginAttempt")(function* (caller: string) {
  const limiter = yield* LoginThrottle;
  return yield* limiter.check(caller);
});

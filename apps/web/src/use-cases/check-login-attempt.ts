import { Effect } from "effect";
import { LoginThrottle } from "./login";

export const checkLoginAttempt = Effect.fn("checkLoginAttempt")(function* (caller: string) {
  const limiter = yield* LoginThrottle;
  return yield* limiter.check(caller);
});

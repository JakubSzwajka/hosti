import { Context, Effect, Layer } from "effect";
import type { EffectLoginLimiter } from "./auth/rate-limit";
import { Identity } from "./identity";

export class LoginThrottle extends Context.Service<LoginThrottle, EffectLoginLimiter>()(
  "@hosti/identity/LoginThrottle",
) {
  static readonly layer = Layer.effect(
    LoginThrottle,
    Effect.gen(function* () {
      const identity = yield* Identity;
      return LoginThrottle.of(yield* identity.createLoginLimiter());
    }),
  );
}

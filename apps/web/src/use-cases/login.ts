import {
  Identity,
  type EffectLoginLimiter,
  type IdentityCryptoError,
  type Verdict,
} from "@hosti/identity";
import { Context, Effect, Layer } from "effect";

export class LoginThrottle extends Context.Service<LoginThrottle, EffectLoginLimiter>()(
  "@hosti/web/LoginThrottle",
) {
  static readonly layer = Layer.effect(
    LoginThrottle,
    Effect.gen(function* () {
      const identity = yield* Identity;
      return LoginThrottle.of(yield* identity.createLoginLimiter());
    }),
  );
}

export type LoginResult =
  | { status: "unconfigured" | "locked" | "bad" }
  | { status: "authenticated"; session: string };

function failureStatus(verdict: Verdict): "bad" | "locked" {
  return verdict.allowed ? "bad" : "locked";
}

export const login = Effect.fn("login")(function* (
  caller: string,
  password: unknown,
): Effect.fn.Return<LoginResult, IdentityCryptoError, Identity | LoginThrottle> {
  const identity = yield* Identity;
  const limiter = yield* LoginThrottle;
  const secrets = yield* identity.adminSecrets;
  if (!secrets) return { status: "unconfigured" };
  if (
    typeof password !== "string" ||
    !(yield* identity.constantTimeEquals(secrets.password, password))
  ) {
    return { status: failureStatus(yield* limiter.fail(caller)) };
  }

  yield* limiter.succeed(caller);
  return { status: "authenticated", session: yield* identity.signSession(secrets.secret) };
});

import { Identity, LoginThrottle, type IdentityCryptoError, type Verdict } from "@hosti/identity";
import { Effect } from "effect";

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

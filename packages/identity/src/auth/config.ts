import { Config, Effect, Option } from "effect";
import { isOwnerPasswordHash } from "../owner-password";

export type AdminSecrets = {
  passwordHash: string;
  secret: string;
};

export const OWNER_PASSWORD_HASH_VAR = "HOSTI_OWNER_PASSWORD_HASH";
export const SECRET_VAR = "HOSTI_SECRET";

function configured(name: string): Effect.Effect<string | null> {
  return Config.option(Config.String(name)).pipe(
    Effect.orElseSucceed(() => Option.none()),
    Effect.map((value) => Option.getOrNull(value)?.trim() || null),
  );
}

function configuredHash(): Effect.Effect<string | null> {
  return configured(OWNER_PASSWORD_HASH_VAR).pipe(
    Effect.map((value) => (value !== null && isOwnerPasswordHash(value) ? value : null)),
  );
}

export function missingAdminVars(): Effect.Effect<string[]> {
  return Effect.gen(function* () {
    const passwordHash = yield* configuredHash();
    const secret = yield* configured(SECRET_VAR);
    const missing: string[] = [];
    if (!passwordHash) missing.push(OWNER_PASSWORD_HASH_VAR);
    if (!secret) missing.push(SECRET_VAR);
    return missing;
  });
}

export function signingSecret(): Effect.Effect<string | null> {
  return configured(SECRET_VAR);
}

export function adminSecrets(): Effect.Effect<AdminSecrets | null> {
  return Effect.gen(function* () {
    const passwordHash = yield* configuredHash();
    const secret = yield* configured(SECRET_VAR);
    if (!passwordHash || !secret) return null;
    return { passwordHash, secret };
  });
}

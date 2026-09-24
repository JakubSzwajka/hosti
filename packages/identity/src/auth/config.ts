import { Config, Effect, Option } from "effect";

export type AdminSecrets = {
  password: string;
  secret: string;
};

export const OWNER_PASSWORD_VAR = "HOSTI_OWNER_PASSWORD";
export const SECRET_VAR = "HOSTI_SECRET";

function configured(name: string): Effect.Effect<string | null> {
  return Config.option(Config.String(name)).pipe(
    Effect.orElseSucceed(() => Option.none()),
    Effect.map((value) => Option.getOrNull(value)?.trim() || null),
  );
}

export function missingAdminVars(): Effect.Effect<string[]> {
  return Effect.gen(function* () {
    const password = yield* configured(OWNER_PASSWORD_VAR);
    const secret = yield* configured(SECRET_VAR);
    const missing: string[] = [];
    if (!password) missing.push(OWNER_PASSWORD_VAR);
    if (!secret) missing.push(SECRET_VAR);
    return missing;
  });
}

export function signingSecret(): Effect.Effect<string | null> {
  return configured(SECRET_VAR);
}

export function adminSecrets(): Effect.Effect<AdminSecrets | null> {
  return Effect.gen(function* () {
    const password = yield* configured(OWNER_PASSWORD_VAR);
    const secret = yield* configured(SECRET_VAR);
    if (!password || !secret) return null;
    return { password, secret };
  });
}

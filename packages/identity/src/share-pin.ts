import { isValidPin, PIN_RULE } from "@hosti/shared";
import { Effect } from "effect";
import { SECRET_VAR } from "./auth/config";
import type { IdentityCrypto } from "./crypto";
import { IdentityInputError } from "./errors";

const COST = { N: 16384, r: 8, p: 1 };
const KEY_BYTES = 32;
const SALT_BYTES = 16;
const SEPARATOR = "$";

function badPin(): IdentityInputError {
  return new IdentityInputError({ code: "bad_pin", message: PIN_RULE, status: 400 });
}

export function makeSharePinOperations(dependencies: {
  crypto: IdentityCrypto["Service"];
  signingSecret: Effect.Effect<string | null>;
}) {
  const { crypto, signingSecret } = dependencies;

  const hashPin = Effect.fn("Identity.hashPin")(function* (pin: string) {
    const salt = yield* crypto.randomBytesBase64Url(SALT_BYTES);
    const key = yield* crypto.deriveScryptBase64Url(pin, salt, COST, KEY_BYTES);
    return ["scrypt", COST.N, COST.r, COST.p, salt, key].join(SEPARATOR);
  });

  const verifyPin = Effect.fn("Identity.verifyPin")(function* (pin: string, stored: string) {
    const parts = stored.split(SEPARATOR);
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;

    const [, n, r, p, salt, key] = parts as [string, string, string, string, string, string];
    const cost = { N: Number(n), r: Number(r), p: Number(p) };
    if (!Number.isInteger(cost.N) || !Number.isInteger(cost.r) || !Number.isInteger(cost.p)) {
      return false;
    }
    if (key.length !== 43) return false;

    return yield* crypto.deriveScryptBase64Url(pin, salt, cost, KEY_BYTES).pipe(
      Effect.flatMap((derived) => crypto.constantTimeEquals(derived, key)),
      Effect.orElseSucceed(() => false),
    );
  });

  const readJsonPin = (value: unknown): Effect.Effect<string | null, IdentityInputError> => {
    if (value === undefined) return Effect.succeed(null);
    if (typeof value !== "string") return Effect.fail(badPin());
    const pin = value.trim();
    return isValidPin(pin) ? Effect.succeed(pin) : Effect.fail(badPin());
  };

  const readFormPin = (value: unknown): Effect.Effect<string | null, IdentityInputError> => {
    if (value === null) return Effect.succeed(null);
    if (typeof value !== "string") return Effect.fail(badPin());
    const pin = value.trim();
    if (!pin) return Effect.succeed(null);
    return isValidPin(pin) ? Effect.succeed(pin) : Effect.fail(badPin());
  };

  const requireSigningSecret = Effect.fn("Identity.requireSigningSecret")(function* () {
    if (yield* signingSecret) return;
    return yield* new IdentityInputError({
      code: "not_configured",
      message: `${SECRET_VAR} must be set before a bundle can carry a pin`,
      status: 503,
    });
  });

  return { hashPin, verifyPin, readJsonPin, readFormPin, requireSigningSecret };
}

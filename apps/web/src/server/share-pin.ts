/**
 * Hashing the pin on a bundle. A pin stops a forwarded link; it is not a
 * password and Hosti does not treat it as one. Four to eight digits is a small
 * space, so the cost here comes from scrypt and from the rate limit on the
 * gate, not from the length of what the owner typed.
 *
 * The typed pin is never stored, never logged and never returned by any
 * endpoint. Once it is set, the owner sees `pin set` and nothing more.
 */
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { isValidPin, PIN_RULE } from "@hosti/shared";
import { SECRET_VAR, signingSecret } from "@/server/auth/config";
import { PushError } from "@/server/errors";

type ScryptCost = { N: number; r: number; p: number };

/** scrypt cost. 128 * N * r is 16 MB, inside Node's default maxmem. */
const COST: ScryptCost = { N: 16384, r: 8, p: 1 };
const KEY_BYTES = 32;
const SALT_BYTES = 16;

/** `scrypt$N$r$p$salt$key`, so the cost can move without orphaning old rows. */
const SEPARATOR = "$";

function derive(pin: string, salt: Buffer, cost: ScryptCost): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(pin, salt, KEY_BYTES, { ...cost }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

/** Hash a pin with a fresh salt. The caller has already validated the digits. */
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(pin, salt, COST);
  return [
    "scrypt",
    COST.N,
    COST.r,
    COST.p,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join(SEPARATOR);
}

/**
 * Does this pin open that hash? False for anything malformed, so a row written
 * by a future format cannot be opened by accident.
 */
export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const parts = stored.split(SEPARATOR);
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, n, r, p, salt, key] = parts as [string, string, string, string, string, string];
  const cost = { N: Number(n), r: Number(r), p: Number(p) };
  if (!Number.isInteger(cost.N) || !Number.isInteger(cost.r) || !Number.isInteger(cost.p)) {
    return false;
  }

  const expected = Buffer.from(key, "base64url");
  if (expected.length !== KEY_BYTES) return false;

  const actual = await derive(pin, Buffer.from(salt, "base64url"), cost).catch(() => null);
  if (!actual) return false;
  return timingSafeEqual(actual, expected);
}

/**
 * Read a pin out of a JSON body. Leaving the key out means "no pin", which is
 * how a caller asks to keep the pin a bundle already holds. Sending the key
 * means sending digits: `""`, `null` and `"12ab"` are all refused, because a
 * caller who sent a pin field meant something by it and dropping it in silence
 * would answer 200 to a request Hosti did not carry out.
 */
export function readJsonPin(value: unknown): string | null {
  if (value === undefined) return null;
  if (typeof value !== "string") throw new PushError("bad_pin", PIN_RULE);
  const pin = value.trim();
  if (!isValidPin(pin)) throw new PushError("bad_pin", PIN_RULE);
  return pin;
}

/**
 * Read a pin off a form field. The bundle page always sends the field, so an
 * empty one is the owner typing nothing rather than asking for anything.
 * Anything else must be four to eight digits or the form is refused.
 */
export function readFormPin(value: FormDataEntryValue | null): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new PushError("bad_pin", PIN_RULE);
  const pin = value.trim();
  if (!pin) return null;
  if (!isValidPin(pin)) throw new PushError("bad_pin", PIN_RULE);
  return pin;
}

/**
 * The unlock cookie is signed with the same key as the admin session, so a box
 * without that key could take a pin and then never let anybody through. Refuse
 * up front rather than leave a link nobody can open.
 */
export function requireSigningSecret(): void {
  if (signingSecret()) return;
  throw new PushError(
    "not_configured",
    `${SECRET_VAR} must be set before a bundle can carry a pin`,
    503,
  );
}

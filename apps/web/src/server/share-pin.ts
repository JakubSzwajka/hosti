import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { isValidPin, PIN_RULE } from "@hosti/shared";
import { SECRET_VAR, signingSecret } from "@/server/auth/config";
import { PushError } from "@/server/errors";

type ScryptCost = { N: number; r: number; p: number };

const COST: ScryptCost = { N: 16384, r: 8, p: 1 };
const KEY_BYTES = 32;
const SALT_BYTES = 16;

const SEPARATOR = "$";

function derive(pin: string, salt: Buffer, cost: ScryptCost): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(pin, salt, KEY_BYTES, { ...cost }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

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

export function readJsonPin(value: unknown): string | null {
  if (value === undefined) return null;
  if (typeof value !== "string") throw new PushError("bad_pin", PIN_RULE);
  const pin = value.trim();
  if (!isValidPin(pin)) throw new PushError("bad_pin", PIN_RULE);
  return pin;
}

export function readFormPin(value: FormDataEntryValue | null): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new PushError("bad_pin", PIN_RULE);
  const pin = value.trim();
  if (!pin) return null;
  if (!isValidPin(pin)) throw new PushError("bad_pin", PIN_RULE);
  return pin;
}

export function requireSigningSecret(): void {
  if (signingSecret()) return;
  throw new PushError(
    "not_configured",
    `${SECRET_VAR} must be set before a bundle can carry a pin`,
    503,
  );
}

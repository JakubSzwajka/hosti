import { PIN_RULE } from "@hosti/shared";
import { SECRET_VAR } from "@hosti/identity";
import { runIdentityPromise, runIdentitySync } from "@/server/runtime";

export { PIN_RULE };

export function hashPin(pin: string): Promise<string> {
  return runIdentityPromise((identity) => identity.hashPin(pin));
}

export function verifyPin(pin: string, stored: string): Promise<boolean> {
  return runIdentityPromise((identity) => identity.verifyPin(pin, stored));
}

export function readJsonPin(value: unknown): string | null {
  return runIdentitySync((identity) => identity.readJsonPin(value));
}

export function readFormPin(value: FormDataEntryValue | null): string | null {
  return runIdentitySync((identity) => identity.readFormPin(value));
}

export function requireSigningSecret(): void {
  runIdentitySync((identity) => identity.requireSigningSecret);
}

export { SECRET_VAR };

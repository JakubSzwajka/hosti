import { isPushScope, PUSH_SCOPES, type PushScope } from "@hosti/shared";
import { Effect } from "effect";
import { IdentityInputError } from "./errors";

export const ALL_SCOPES: readonly PushScope[] = PUSH_SCOPES;

export const DEFAULT_SCOPES: readonly PushScope[] = ["publish", "share"];

export const SCOPES_RULE = `Scopes are a list drawn from ${PUSH_SCOPES.join(", ")}, and must include publish`;

export function orderScopes(scopes: Iterable<PushScope>): PushScope[] {
  const wanted = new Set(scopes);
  return PUSH_SCOPES.filter((scope) => wanted.has(scope));
}

export function formatScopes(scopes: Iterable<PushScope>): string {
  return [...new Set(scopes)].sort().join(",");
}

export function parseStoredScopes(text: string): PushScope[] {
  // An unknown name in the column is dropped, never granted.
  return orderScopes(text.split(",").filter(isPushScope));
}

export function readRequestedScopes(
  value: unknown,
): Effect.Effect<PushScope[], IdentityInputError> {
  const refuse = Effect.fail(
    new IdentityInputError({ code: "bad_scopes", message: SCOPES_RULE, status: 400 }),
  );
  if (!Array.isArray(value) || value.length === 0) return refuse;
  if (!value.every(isPushScope)) return refuse;
  const scopes = orderScopes(value);
  if (!scopes.includes("publish")) return refuse;
  return Effect.succeed(scopes);
}

import { CONNECTION_ID_PATTERN } from "@hosti/identity";

export function safeReturnPath(value: unknown): string | null {
  // Only a relative /connect/<id> path, so the login form can never become an open redirect.
  if (typeof value !== "string") return null;
  const match = /^\/connect\/([^/?#]+)$/.exec(value);
  if (!match?.[1] || !CONNECTION_ID_PATTERN.test(match[1])) return null;
  return value;
}

export function connectPath(id: string): string | null {
  return CONNECTION_ID_PATTERN.test(id) ? `/connect/${id}` : null;
}

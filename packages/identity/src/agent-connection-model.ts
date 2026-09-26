import type { PushScope } from "@hosti/shared";
import { DateTime } from "effect";

export const CONNECTION_LIFETIME_MS = 10 * 60 * 1000;
export const CONNECTION_RETAIN_MS = 10 * 60 * 1000;
export const MAX_PENDING_CONNECTIONS = 20;
export const POLL_AFTER_SECONDS = 2;
export const USER_CODE_ALPHABET = "BCDFGHJKMNPQRSTVWXZ23456789";
export const USER_CODE_PATTERN = new RegExp(
  `^[${USER_CODE_ALPHABET}]{4}-[${USER_CODE_ALPHABET}]{4}$`,
);
export const CONNECTION_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
export const DIGEST_RULE =
  "tokenDigest and pollingDigest are two different 64-character lowercase hex SHA-256 digests";

export type AgentConnectionStatus = "pending" | "approved" | "denied" | "expired";

export type Held = {
  id: string;
  userCode: string;
  tokenName: string;
  tokenDigest: string;
  pollingDigest: string;
  requestedScopes: PushScope[];
  grantedScopes: PushScope[] | null;
  status: "pending" | "activating" | "approved" | "denied";
  expiresAt: number;
};

export type AgentConnectionView = {
  id: string;
  userCode: string;
  tokenName: string;
  requestedScopes: PushScope[];
  grantedScopes: PushScope[] | null;
  status: AgentConnectionStatus;
  expiresAt: string;
};

export type AgentConnectionPoll =
  | { status: "pending"; expiresAt: string; pollAfterSeconds: number }
  | { status: "approved"; scopes: PushScope[]; name: string }
  | { status: "denied" }
  | { status: "expired" };

export type AgentConnectionCreated = {
  id: string;
  userCode: string;
  expiresAt: string;
  pollAfterSeconds: number;
};

export type AgentConnectionRequest = {
  tokenName: unknown;
  tokenDigest: unknown;
  pollingDigest: unknown;
  scopes: unknown;
};

export function isoFromMillis(ms: number): string {
  return DateTime.formatIso(DateTime.makeUnsafe(ms));
}

export function statusAt(held: Held, now: number): AgentConnectionStatus {
  // An approval mid-write reports as "pending" so a second approval sees it as unsettled.
  if (held.status === "activating") return "pending";
  if (held.status === "pending" && now >= held.expiresAt) return "expired";
  return held.status;
}

export function view(held: Held, now: number): AgentConnectionView {
  return {
    id: held.id,
    userCode: held.userCode,
    tokenName: held.tokenName,
    requestedScopes: held.requestedScopes,
    grantedScopes: held.grantedScopes,
    status: statusAt(held, now),
    expiresAt: isoFromMillis(held.expiresAt),
  };
}

export function pollView(held: Held, now: number): AgentConnectionPoll {
  const status = statusAt(held, now);
  if (status === "pending") {
    return {
      status,
      expiresAt: isoFromMillis(held.expiresAt),
      pollAfterSeconds: POLL_AFTER_SECONDS,
    };
  }
  if (status === "approved") {
    return { status, scopes: held.grantedScopes ?? [], name: held.tokenName };
  }
  return { status };
}

export function withoutDropped(stored: ReadonlyMap<string, Held>, now: number): Map<string, Held> {
  return new Map([...stored].filter(([, held]) => now < held.expiresAt + CONNECTION_RETAIN_MS));
}

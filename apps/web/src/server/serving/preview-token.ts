import { createHmac } from "node:crypto";
import { signingSecret } from "@/server/auth/config";
import { constantTimeEquals } from "@/server/auth/session";

export const PREVIEW_TOKEN_TTL_MS = 30 * 60 * 1000;

export const TOKEN_MARK = "~";

function signature(secret: string, bundleSlug: string, expiresAt: number): string {
  return createHmac("sha256", secret)
    .update(`hosti-preview:${bundleSlug}:${expiresAt}`)
    .digest("base64url");
}

export function signPreviewToken(secret: string, bundleSlug: string, now = Date.now()): string {
  const expiresAt = now + PREVIEW_TOKEN_TTL_MS;
  return `${expiresAt.toString(36)}.${signature(secret, bundleSlug, expiresAt)}`;
}

export type PreviewGrant = {
  src: string;

  expiresAt: number | null;
};

export function verifyPreviewToken(
  secret: string,
  bundleSlug: string,
  token: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [stamp, supplied] = parts as [string, string];
  const expiresAt = Number.parseInt(stamp, 36);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return false;
  return constantTimeEquals(signature(secret, bundleSlug, expiresAt), supplied);
}

export function previewGrant(bundleSlug: string, now = Date.now()): PreviewGrant {
  const slug = encodeURIComponent(bundleSlug);
  // The sandboxed preview cannot send the admin cookie, so its grant travels in the path.
  const secret = signingSecret();
  if (!secret) return { src: `/b/${slug}/preview/`, expiresAt: null };
  return {
    src: `/b/${slug}/preview/${TOKEN_MARK}${signPreviewToken(secret, bundleSlug, now)}/`,
    expiresAt: now + PREVIEW_TOKEN_TTL_MS,
  };
}

export function previewUrl(bundleSlug: string): string {
  return previewGrant(bundleSlug).src;
}

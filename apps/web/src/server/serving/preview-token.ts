import { createHmac } from "node:crypto";
import { signingSecret } from "@/server/auth/config";
import { constantTimeEquals } from "@/server/auth/session";

/**
 * A short-lived grant that opens one bundle's preview, carried in the URL path.
 *
 * Why a token exists at all, when the owner already holds a cookie: the preview
 * frame is sandboxed without `allow-same-origin`, so the bundle inside it runs
 * in an opaque origin. That is the whole point of the sandbox, and it costs
 * something. A request the sandboxed document makes for its own `styles.css`
 * has no site-for-cookies, so the browser treats it as cross-site and withholds
 * the `SameSite=Lax` admin cookie. Measured in Chrome: the frame's first load
 * answers 200 and every asset under it answers 404.
 *
 * Dropping the sandbox would fix the assets and hand a forgotten bundle's
 * script the owner's session. So the sandbox stays and the grant travels in the
 * path instead, where a relative asset URL inherits it.
 *
 * What it can do, stated plainly: anyone holding the URL can read that one
 * bundle's current revision until the stamp runs out. It is the same power as
 * an unlisted share link with a short expiry. It cannot be bound to the admin
 * session's nonce, because the nonce lives in the cookie the sandbox strips,
 * so logging out does not kill an outstanding token. Changing `HOSTI_SECRET`
 * does.
 */

/** How long one grant lives. Long enough to scroll a catalog, short enough to forget. */
export const PREVIEW_TOKEN_TTL_MS = 30 * 60 * 1000;

/**
 * The first path segment of a token URL starts with this, so a token is never
 * confused with a file inside the bundle.
 */
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
  /** Where the frame points. */
  src: string;
  /**
   * When the grant dies, epoch milliseconds, or null when the URL carries no
   * grant at all. The catalog hands this to the browser so a card can decline
   * to mount a frame that would only be refused: a refused frame still fires
   * `load`, and would then paint a blank box over the placeholder.
   */
  expiresAt: number | null;
};

/** True only for a live, untampered grant on this exact bundle. */
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

/**
 * Where the catalog points a preview frame. Falls back to the plain path when
 * no signing key is set, which only happens on an install whose admin pages
 * refuse to render anyway.
 */
export function previewGrant(bundleSlug: string, now = Date.now()): PreviewGrant {
  const slug = encodeURIComponent(bundleSlug);
  const secret = signingSecret();
  if (!secret) return { src: `/b/${slug}/preview/`, expiresAt: null };
  return {
    src: `/b/${slug}/preview/${TOKEN_MARK}${signPreviewToken(secret, bundleSlug, now)}/`,
    expiresAt: now + PREVIEW_TOKEN_TTL_MS,
  };
}

/** The preview URL on its own, for a caller that does not care when it dies. */
export function previewUrl(bundleSlug: string): string {
  return previewGrant(bundleSlug).src;
}

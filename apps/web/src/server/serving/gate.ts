/**
 * Deciding whether a guest gets through, and taking the pin when they do not.
 *
 * Two rules shape everything here:
 *
 * 1. The gate is served at the URL the guest was sent. No redirect, because the
 *    link in the address bar is the link somebody forwarded, and a guest who
 *    reloads must land back on the same link.
 * 2. Only a page request gets a gate. An asset gets the same 404 as any other
 *    miss, so a script or a stylesheet under a locked link tells a prober
 *    nothing and no half-rendered bundle appears.
 */

import { signingSecret } from "@/server/auth/config";
import { isSecureRequest, readCookie } from "@/server/auth/cookie";
import { pinKey, pinLimiter } from "@/server/auth/rate-limit";
import { verifyPin } from "@/server/share-pin";
import { type GateFault, gatePageHtml } from "@/server/serving/gate-page";
import { hostiNotFound, hostiPage } from "@/server/serving/respond";
import {
  signUnlock,
  type UnlockBinding,
  unlockCookie,
  unlockCookieName,
  verifyUnlock,
} from "@/server/serving/unlock";

/** The one path under a share link that Hosti answers itself. */
export const UNLOCK_PATH = "/unlock";

export type ShareRequest = { shareSlug: string; requestPath: string; sharePrefix: string };

/**
 * A page request, meaning a browser navigating. `Sec-Fetch-Mode` says so
 * outright in every current browser; `Accept` covers the rest and lets a curl
 * with `-H 'Accept: text/html'` see the gate on purpose. An image, a stylesheet
 * or a `fetch()` matches neither, which is what keeps assets on the 404 path.
 */
export function wantsPage(request: Request): boolean {
  if (request.headers.get("sec-fetch-mode") === "navigate") return true;
  return (request.headers.get("accept") ?? "").includes("text/html");
}

/** Does the caller already hold a live grant for this link on this bundle? */
export function isUnlocked(request: Request, shareSlug: string, binding: UnlockBinding): boolean {
  const secret = signingSecret();
  if (!secret) return false;
  const cookie = readCookie(request.headers, unlockCookieName(shareSlug));
  return verifyUnlock(secret, shareSlug, binding, cookie);
}

/** Where the guest lands once the PIN is right, and what the gate posts back. */
function landingPath(parsed: ShareRequest): string {
  const path = parsed.requestPath || "/";
  return `${parsed.sharePrefix}${path}`;
}

/**
 * The host as the guest typed it, echoed on the gate so they can see they are
 * at the right link. Falls back to the prefix alone when there is no Host
 * header, which is only ever a test calling the handler directly.
 */
function displayPath(request: Request, parsed: ShareRequest): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  return host ? `${host}${parsed.sharePrefix}` : parsed.sharePrefix;
}

/** `?pin=wrong` and `?pin=locked` are how the refused POST talks to the gate. */
function faultFromQuery(url: string): GateFault | undefined {
  const value = new URL(url).searchParams.get("pin");
  if (value === "wrong" || value === "locked" || value === "unavailable") return value;
  return undefined;
}

/**
 * The gate, or a 404. Called only when the bundle carries a pin and the caller
 * holds no grant for this link.
 */
export function lockedResponse(request: Request, parsed: ShareRequest): Response {
  if (!wantsPage(request)) return hostiNotFound();
  const fault = signingSecret() ? faultFromQuery(request.url) : "unavailable";
  return hostiPage(
    gatePageHtml({
      sharePath: displayPath(request, parsed),
      sharePrefix: parsed.sharePrefix,
      next: landingPath(parsed),
      ...(fault ? { fault } : {}),
    }),
  );
}

/** Back to the gate at the guest's own URL, one error line showing. */

function backToGate(next: string, fault: GateFault): Response {
  const separator = next.includes("?") ? "&" : "?";
  return new Response(null, {
    status: 303,
    headers: { Location: `${next}${separator}pin=${fault}`, "Cache-Control": "no-store" },
  });
}

/**
 * Keep the guest inside the link they came from. A `next` that points anywhere
 * else is thrown away rather than argued with, so the gate can never be turned
 * into an open redirect.
 */
function safeNext(parsed: ShareRequest, supplied: FormDataEntryValue | null): string {
  const fallback = `${parsed.sharePrefix}/`;
  if (typeof supplied !== "string") return fallback;
  if (!supplied.startsWith(`${parsed.sharePrefix}/`) || supplied.startsWith("//")) return fallback;
  if (supplied.includes("\\") || supplied.includes("\n") || supplied.includes("\r")) {
    return fallback;
  }
  return supplied;
}

/**
 * `POST /v/<share-slug>/unlock`. Right pin, a cookie scoped to this link and a
 * 303 onward, so a reload does not repost. Wrong pin, the gate again. The rate
 * limit is checked before the hash, so a locked caller is refused even when the
 * pin they typed is the right one.
 */
export async function unlockResponse(
  request: Request,
  parsed: ShareRequest,
  share: { bundleId: number; pinHash: string | null },
): Promise<Response> {
  const form = await request.formData().catch(() => null);
  if (!form) return hostiNotFound();
  const next = safeNext(parsed, form.get("next"));

  const pinHash = share.pinHash;
  if (!pinHash) return redirectTo(next);

  const secret = signingSecret();
  if (!secret) return backToGate(next, "unavailable");

  const limiter = pinLimiter();
  const key = pinKey(request.headers, parsed.shareSlug);
  if (!limiter.check(key).allowed) return backToGate(next, "locked");

  const supplied = form.get("pin");
  const right = typeof supplied === "string" && (await verifyPin(supplied, pinHash));
  if (!right) {
    const verdict = limiter.fail(key);
    return backToGate(next, verdict.allowed ? "wrong" : "locked");
  }

  limiter.succeed(key);
  const response = redirectTo(next);
  response.headers.append(
    "Set-Cookie",
    unlockCookie(
      parsed.shareSlug,
      signUnlock(secret, parsed.shareSlug, { bundleId: share.bundleId, pinHash }),
      { secure: isSecureRequest(request) },
    ),
  );
  return response;
}

function redirectTo(location: string): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: location, "Cache-Control": "no-store" },
  });
}

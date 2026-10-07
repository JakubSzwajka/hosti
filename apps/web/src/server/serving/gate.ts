import { PIN_LIMITS, type EffectLoginLimiter } from "@hosti/identity";
import { baseUrlFromHeaders } from "@/server/config";
import { signingSecret } from "@/server/auth/config";
import { isSecureRequest, readCookie } from "@/server/auth/cookie";
import { runIdentityPromise, runIdentitySync } from "@/server/runtime";
import { type GateFault, gatePageHtml } from "@/server/serving/gate-page";
import { hostiNotFound, hostiPage } from "@/server/serving/respond";
import {
  signUnlock,
  type UnlockBinding,
  unlockCookie,
  unlockCookieName,
  verifyUnlock,
} from "@/server/serving/unlock";

export const UNLOCK_PATH = "/unlock";

type PinLimiterHolder = { __hostiPinLimiter?: EffectLoginLimiter };

function pinLimiter(): EffectLoginLimiter {
  const holder = globalThis as PinLimiterHolder;
  holder.__hostiPinLimiter ??= runIdentitySync((identity) =>
    identity.createLoginLimiter(PIN_LIMITS),
  );
  return holder.__hostiPinLimiter;
}

function pinKey(headers: Headers, shareSlug: string): string {
  return `${callerKey(headers)}|${shareSlug}`;
}

function callerKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return headers.get("x-real-ip")?.trim() || "unknown";
}

export type ShareRequest = { shareSlug: string; requestPath: string; sharePrefix: string };

const LINK_PREVIEW_BOTS =
  /discordbot|slackbot|twitterbot|facebookexternalhit|whatsapp|telegrambot|linkedinbot|mastodon|skypeuripreview|embedly/i;

export function wantsPage(request: Request): boolean {
  if (request.headers.get("sec-fetch-mode") === "navigate") return true;
  if ((request.headers.get("accept") ?? "").includes("text/html")) return true;
  // Unfurlers ask with Accept: */* and no Sec-Fetch headers, so they would never reach the card.
  return LINK_PREVIEW_BOTS.test(request.headers.get("user-agent") ?? "");
}

export function isUnlocked(request: Request, shareSlug: string, binding: UnlockBinding): boolean {
  const secret = signingSecret();
  if (!secret) return false;
  const cookie = readCookie(request.headers, unlockCookieName(shareSlug));
  return verifyUnlock(secret, shareSlug, binding, cookie);
}

function landingPath(parsed: ShareRequest): string {
  const path = parsed.requestPath || "/";
  return `${parsed.sharePrefix}${path}`;
}

function displayPath(request: Request, parsed: ShareRequest): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  return host ? `${host}${parsed.sharePrefix}` : parsed.sharePrefix;
}

function faultFromQuery(url: string): GateFault | undefined {
  const value = new URL(url).searchParams.get("pin");
  if (value === "wrong" || value === "locked" || value === "unavailable") return value;
  return undefined;
}

export function lockedResponse(request: Request, parsed: ShareRequest): Response {
  if (!wantsPage(request)) return hostiNotFound();
  const fault = signingSecret() ? faultFromQuery(request.url) : "unavailable";
  return hostiPage(
    gatePageHtml({
      sharePath: displayPath(request, parsed),
      sharePrefix: parsed.sharePrefix,
      next: landingPath(parsed),
      baseUrl: baseUrlFromHeaders(request.headers),
      ...(fault ? { fault } : {}),
    }),
  );
}

function backToGate(next: string, fault: GateFault): Response {
  const separator = next.includes("?") ? "&" : "?";
  return new Response(null, {
    status: 303,
    headers: { Location: `${next}${separator}pin=${fault}`, "Cache-Control": "no-store" },
  });
}

function safeNext(parsed: ShareRequest, supplied: FormDataEntryValue | null): string {
  const fallback = `${parsed.sharePrefix}/`;
  if (typeof supplied !== "string") return fallback;
  if (!supplied.startsWith(`${parsed.sharePrefix}/`) || supplied.startsWith("//")) return fallback;
  if (supplied.includes("\\") || supplied.includes("\n") || supplied.includes("\r")) {
    return fallback;
  }
  return supplied;
}

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
  if (!runIdentitySync(() => limiter.check(key)).allowed) return backToGate(next, "locked");

  const supplied = form.get("pin");
  const right =
    typeof supplied === "string" &&
    (await runIdentityPromise((identity) => identity.verifyPin(supplied, pinHash)));
  if (!right) {
    const verdict = runIdentitySync(() => limiter.fail(key));
    return backToGate(next, verdict.allowed ? "wrong" : "locked");
  }

  runIdentitySync(() => limiter.succeed(key));
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

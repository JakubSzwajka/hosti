import type { IdentityCrypto, IdentityCryptoError } from "@hosti/identity";
import { Clock, Effect } from "effect";
import { PREVIEW_TOKEN_TTL_MS, TOKEN_MARK, type PreviewGrant } from "./types";

type PreviewTokenOperations = {
  signPreviewToken(
    secret: string,
    bundleSlug: string,
    suppliedNow?: number,
  ): Effect.Effect<string, IdentityCryptoError>;
  verifyPreviewToken(
    secret: string,
    bundleSlug: string,
    token: string | null | undefined,
    suppliedNow?: number,
  ): Effect.Effect<boolean, IdentityCryptoError>;
  previewGrant(
    bundleSlug: string,
    secret: string | null,
    suppliedNow?: number,
  ): Effect.Effect<PreviewGrant, IdentityCryptoError>;
  previewUrl(bundleSlug: string, secret: string | null): Effect.Effect<string, IdentityCryptoError>;
};

export function makePreviewTokenOperations(
  crypto: IdentityCrypto["Service"],
): PreviewTokenOperations {
  const signPreviewToken = Effect.fn("Serving.signPreviewToken")(function* (
    secret: string,
    bundleSlug: string,
    suppliedNow?: number,
  ) {
    const now = suppliedNow ?? (yield* Clock.currentTimeMillis);
    const expiresAt = now + PREVIEW_TOKEN_TTL_MS;
    const signature = yield* crypto.hmacSha256Base64Url(
      secret,
      `hosti-preview:${bundleSlug}:${expiresAt}`,
    );
    return `${expiresAt.toString(36)}.${signature}`;
  });

  const verifyPreviewToken = Effect.fn("Serving.verifyPreviewToken")(function* (
    secret: string,
    bundleSlug: string,
    token: string | null | undefined,
    suppliedNow?: number,
  ) {
    const now = suppliedNow ?? (yield* Clock.currentTimeMillis);
    if (!token) return false;
    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const stamp = parts[0];
    const supplied = parts[1];
    if (stamp === undefined || supplied === undefined) return false;
    const expiresAt = Number.parseInt(stamp, 36);
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return false;
    const expected = yield* crypto.hmacSha256Base64Url(
      secret,
      `hosti-preview:${bundleSlug}:${expiresAt}`,
    );
    return yield* crypto.constantTimeEquals(expected, supplied);
  });

  const previewGrant = Effect.fn("Serving.previewGrant")(function* (
    bundleSlug: string,
    secret: string | null,
    suppliedNow?: number,
  ): Effect.fn.Return<PreviewGrant, IdentityCryptoError> {
    const slug = encodeURIComponent(bundleSlug);
    if (!secret) return { src: `/b/${slug}/preview/`, expiresAt: null };
    const now = suppliedNow ?? (yield* Clock.currentTimeMillis);
    const token = yield* signPreviewToken(secret, bundleSlug, now);
    return {
      src: `/b/${slug}/preview/${TOKEN_MARK}${token}/`,
      expiresAt: now + PREVIEW_TOKEN_TTL_MS,
    };
  });

  const previewUrl = Effect.fn("Serving.previewUrl")(function* (
    bundleSlug: string,
    secret: string | null,
  ) {
    return (yield* previewGrant(bundleSlug, secret)).src;
  });

  return { signPreviewToken, verifyPreviewToken, previewGrant, previewUrl };
}

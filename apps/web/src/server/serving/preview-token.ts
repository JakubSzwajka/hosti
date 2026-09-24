import { PREVIEW_TOKEN_TTL_MS, TOKEN_MARK, type PreviewGrant } from "@hosti/serving";
import { signingSecret } from "@/server/auth/config";
import { runServingSync } from "@/server/runtime";

export { PREVIEW_TOKEN_TTL_MS, TOKEN_MARK };
export type { PreviewGrant };

export function signPreviewToken(secret: string, bundleSlug: string, now?: number): string {
  return runServingSync((serving) => serving.signPreviewToken(secret, bundleSlug, now));
}

export function verifyPreviewToken(
  secret: string,
  bundleSlug: string,
  token: string | null | undefined,
  now?: number,
): boolean {
  return runServingSync((serving) => serving.verifyPreviewToken(secret, bundleSlug, token, now));
}

export function previewGrant(bundleSlug: string, now?: number): PreviewGrant {
  return runServingSync((serving) => serving.previewGrant(bundleSlug, signingSecret(), now));
}

export function previewUrl(bundleSlug: string): string {
  return runServingSync((serving) => serving.previewUrl(bundleSlug, signingSecret()));
}

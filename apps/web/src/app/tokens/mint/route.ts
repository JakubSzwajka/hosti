import { backTo, guardMutation } from "@/server/auth/admin";
import { PushError } from "@/server/errors";
import { holdMintedSecret } from "@/server/minted-secret";
import { createPushToken } from "@/server/push-tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mint a push token from the catalog. Cookie plus mutation token, never a
 * bearer: minting is a change the catalog makes, so it is gated exactly like
 * setting a sharing state from the bundle page. A push token cannot reach it,
 * and it does not live under `/api/v1/`.
 *
 * The secret the mint returns goes into the one-time store and the redirect
 * carries only its id. Nothing here ever puts the secret in a URL, in a log
 * or in the database.
 */
export async function POST(request: Request): Promise<Response> {
  const form = await request.formData();
  const guard = guardMutation(request, form);
  if (!guard.ok) return guard.response;

  try {
    const minted = createPushToken(String(form.get("name") ?? ""));
    return backTo(`/tokens?shown=${holdMintedSecret(minted.secret)}`);
  } catch (error) {
    if (error instanceof PushError) return backTo(`/tokens?token=${error.code}`);
    throw error;
  }
}

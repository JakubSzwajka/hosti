import { backTo, guardMutation } from "@/server/auth/admin";
import { PushError } from "@/server/errors";
import { holdMintedSecret } from "@/server/minted-secret";
import { createPushToken } from "@/server/push-tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

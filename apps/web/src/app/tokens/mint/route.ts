import { runAppUseCase } from "@/app/_http/run-use-case";
import { backTo, guardMutation } from "@/server/auth/admin";
import { PushError } from "@/server/errors";
import { mintToken } from "@/use-cases/mint-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const form = await request.formData();
  const guard = guardMutation(request, form);
  if (!guard.ok) return guard.response;

  try {
    const minted = await runAppUseCase(mintToken(String(form.get("name") ?? "")));
    return backTo(`/tokens?shown=${minted.shown}`);
  } catch (error) {
    if (error instanceof PushError) return backTo(`/tokens?token=${error.code}`);
    throw error;
  }
}

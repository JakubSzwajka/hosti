import { runAppUseCase } from "@/app/_http/run-use-case";
import { backTo, guardMutation } from "@/server/auth/admin";
import { revokeToken } from "@/use-cases/revoke-token";
import { writerRoute } from "@/app/_http/writer-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function post(request: Request): Promise<Response> {
  const form = await request.formData();
  const guard = guardMutation(request, form);
  if (!guard.ok) return guard.response;

  const typed = String(form.get("id") ?? "").trim();
  const id = /^[0-9]{1,15}$/.test(typed) ? Number(typed) : 0;
  if (id <= 0) return backTo("/tokens?token=bad_token_id");
  if (!(await runAppUseCase(revokeToken(id)))) {
    return new Response("No such push token", { status: 404 });
  }
  return backTo("/tokens");
}

export const POST = writerRoute(post);

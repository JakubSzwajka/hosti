import { backTo, guardMutation } from "@/server/auth/admin";
import { deletePushToken } from "@/server/push-tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const form = await request.formData();
  const guard = guardMutation(request, form);
  if (!guard.ok) return guard.response;

  const typed = String(form.get("id") ?? "").trim();
  const id = /^[0-9]{1,15}$/.test(typed) ? Number(typed) : 0;
  if (id <= 0) return backTo("/tokens?token=bad_token_id");
  if (!deletePushToken(id)) return new Response("No such push token", { status: 404 });
  return backTo("/tokens");
}

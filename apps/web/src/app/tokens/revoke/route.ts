import { backTo, guardMutation } from "@/server/auth/admin";
import { deletePushToken } from "@/server/push-tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Revoke a push token from the catalog. Same gate as every other catalog
 * write: the admin session cookie and the mutation token.
 *
 * The digest goes with the row, so the secret stops opening `/api/v1/` from
 * the next request on. Revisions the token already wrote keep its name: they
 * record what happened, not what is still allowed.
 */
export async function POST(request: Request): Promise<Response> {
  const form = await request.formData();
  const guard = guardMutation(request, form);
  if (!guard.ok) return guard.response;

  // Digits and nothing else. `parseInt` reads "1.5e400" as 1, so a typo or a
  // tampered field would otherwise revoke whichever token holds that row.
  const typed = String(form.get("id") ?? "").trim();
  const id = /^[0-9]{1,15}$/.test(typed) ? Number(typed) : 0;
  if (id <= 0) return backTo("/tokens?token=bad_token_id");
  if (!deletePushToken(id)) return new Response("No such push token", { status: 404 });
  return backTo("/tokens");
}

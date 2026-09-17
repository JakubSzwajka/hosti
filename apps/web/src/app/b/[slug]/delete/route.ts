import { backTo, guardMutation } from "@/server/auth/admin";
import { removeBundle } from "@/server/remove-bundle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Forget the bundle: rows, files and every share link. Then back to the catalog. */
export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const form = await request.formData();
  const guard = guardMutation(request, form);
  if (!guard.ok) return guard.response;

  const { slug } = await context.params;
  const gone = await removeBundle(slug);
  if (!gone) return new Response("No such bundle", { status: 404 });
  return backTo("/");
}

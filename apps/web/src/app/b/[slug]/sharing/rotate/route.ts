import { backTo, guardMutation } from "@/server/auth/admin";
import { findBundle } from "@/server/catalog";
import { rotateShareSlug } from "@/server/sharing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const form = await request.formData();
  const guard = guardMutation(request, form);
  if (!guard.ok) return guard.response;

  const { slug } = await context.params;
  const bundle = findBundle(slug);
  if (!bundle) return new Response("No such bundle", { status: 404 });

  rotateShareSlug(bundle.id);
  return backTo(`/b/${slug}`);
}

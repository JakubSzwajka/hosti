import { backTo, guardMutation } from "@/server/auth/admin";
import { findBundle } from "@/server/catalog";
import { listShareLinks, revokeShareLink } from "@/server/share-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Revoke one share link. The share slug must belong to this bundle, so a
 * stale form cannot revoke a link on some other bundle.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const form = await request.formData();
  const guard = guardMutation(request, form);
  if (!guard.ok) return guard.response;

  const { slug } = await context.params;
  const shareSlug = form.get("shareSlug");
  const bundle = findBundle(slug);
  if (!bundle || typeof shareSlug !== "string") {
    return new Response("No such share link", { status: 404 });
  }
  const mine = listShareLinks(bundle.id, "").some((link) => link.slug === shareSlug);
  if (!mine) return new Response("No such share link", { status: 404 });

  revokeShareLink(shareSlug);
  return backTo(`/b/${slug}`);
}

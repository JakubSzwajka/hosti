import { backTo, guardMutation } from "@/server/auth/admin";
import { findBundle } from "@/server/catalog";
import { PushError } from "@/server/errors";
import { listShareLinks, setSharePin } from "@/server/share-links";
import { hashPin, requirePin, requireSigningSecret } from "@/server/share-pin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Set, replace or remove the PIN on one link. A POST like every other change
 * the catalog makes: no GET moves a PIN, so a link pasted into a chat window
 * cannot lock or unlock anything.
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

  try {
    if (form.get("remove") === "1") {
      setSharePin(shareSlug, null);
    } else {
      requireSigningSecret();
      setSharePin(shareSlug, await hashPin(requirePin(form.get("pin"))));
    }
  } catch (error) {
    if (error instanceof PushError) return backTo(`/b/${slug}?share=${error.code}`);
    throw error;
  }
  return backTo(`/b/${slug}`);
}

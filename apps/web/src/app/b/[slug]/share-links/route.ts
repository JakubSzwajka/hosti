import { backTo, guardMutation } from "@/server/auth/admin";
import { findBundle } from "@/server/catalog";
import { PushError } from "@/server/errors";
import { createShareLink } from "@/server/share-links";
import { hashPin, readPin, requireSigningSecret } from "@/server/share-pin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Create a share link on this bundle. Cookie plus mutation token, never a bearer:
 * this is the catalog's own form, not the push API, and the two never swap keys.
 */
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

  try {
    const pin = readPin(form.get("pin"));
    if (pin) requireSigningSecret();
    createShareLink(bundle, {
      unlisted: form.get("unlisted") === "1",
      pinHash: pin ? await hashPin(pin) : null,
    });
  } catch (error) {
    if (error instanceof PushError) {
      return backTo(`/b/${slug}?share=${error.code}`);
    }
    throw error;
  }
  return backTo(`/b/${slug}`);
}

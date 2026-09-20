import { backTo, guardMutation } from "@/server/auth/admin";
import { findBundle } from "@/server/catalog";
import { PushError } from "@/server/errors";
import { hashPin, readFormPin, requireSigningSecret } from "@/server/share-pin";
import { queueSharingWrite, readSharingMode, setSharing } from "@/server/sharing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Set this bundle's sharing state from the bundle page. Cookie plus mutation
 * token, never a bearer: this is the catalog's own form, not the push API, and
 * the two never swap keys.
 *
 * The pin field sits under the pin radio, so digits typed next to another mode
 * are a mistake. The form says so rather than dropping them, because a saved
 * form that did less than the owner typed is a form they will not check.
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
    const mode = readSharingMode(form.get("mode"));
    const pin = readFormPin(form.get("pin"));
    if (pin && mode !== "pin") {
      throw new PushError("pin_not_wanted", 'A pin only belongs on mode "pin"');
    }
    if (pin) requireSigningSecret();
    // One write per bundle at a time, so a slow hash cannot land after a later
    // private and put the pin back.
    await queueSharingWrite(bundle.id, async () => {
      const pinHash = pin ? await hashPin(pin) : undefined;
      setSharing(bundle.id, { mode, ...(pinHash ? { pinHash } : {}) });
    });
  } catch (error) {
    if (error instanceof PushError) return backTo(`/b/${slug}?share=${error.code}`);
    throw error;
  }
  return backTo(`/b/${slug}`);
}

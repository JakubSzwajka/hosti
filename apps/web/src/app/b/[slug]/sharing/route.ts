import { backTo, guardMutation } from "@/server/auth/admin";
import { findBundle } from "@/server/catalog";
import { PushError } from "@/server/errors";
import { hashPin, readFormPin, requireSigningSecret } from "@/server/share-pin";
import { queueSharingWrite, readSharingMode, setSharing } from "@/server/sharing";

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

  try {
    const mode = readSharingMode(form.get("mode"));
    const pin = readFormPin(form.get("pin"));
    if (pin && mode !== "pin") {
      throw new PushError("pin_not_wanted", 'A pin only belongs on mode "pin"');
    }
    if (pin) requireSigningSecret();
    // Serialize writes so a slow pin hash cannot overwrite a later private write.
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

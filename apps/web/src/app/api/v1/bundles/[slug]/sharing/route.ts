import { errorResponse, failureResponse, jsonResponse, unauthorized } from "@/server/api-responses";
import { publicBaseUrl } from "@/server/config";
import { findBundle } from "@/server/catalog";
import { PushError } from "@/server/errors";
import { authenticatePush } from "@/server/push-tokens";
import { hashPin, readJsonPin, requireSigningSecret } from "@/server/share-pin";
import { queueSharingWrite, readSharingMode, setSharing, sharingBody } from "@/server/sharing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

export async function PUT(request: Request, context: Context): Promise<Response> {
  if (!authenticatePush(request)) return unauthorized();
  const { slug } = await context.params;
  try {
    const bundle = findBundle(slug);
    if (!bundle) return noSuchBundle(slug);

    const text = await request.text().catch(() => "");
    const body = text.trim() ? (JSON.parse(text) as { mode?: unknown; pin?: unknown }) : {};
    const mode = readSharingMode(body.mode);
    const pin = readJsonPin(body.pin);
    if (pin && mode !== "pin") {
      throw new PushError("pin_not_wanted", 'A pin only belongs on mode "pin"');
    }
    if (pin) requireSigningSecret();

    // Serialize writes so a slow pin hash cannot overwrite a later private write.
    const fresh = await queueSharingWrite(bundle.id, async () => {
      const pinHash = pin ? await hashPin(pin) : undefined;
      setSharing(bundle.id, { mode, ...(pinHash ? { pinHash } : {}) });
      return findBundle(slug);
    });
    if (!fresh) return noSuchBundle(slug);
    return jsonResponse(sharingBody(fresh, publicBaseUrl(request)));
  } catch (error) {
    return failureResponse(error);
  }
}

function noSuchBundle(slug: string): Response {
  return errorResponse("no_such_bundle", `No bundle is called "${slug}"`, 404);
}

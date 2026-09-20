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

/**
 * Put a bundle into one of the three sharing states.
 *
 *   { "mode": "private" }              nothing answers at the share URL
 *   { "mode": "link" }                 anyone holding the URL opens it
 *   { "mode": "pin", "pin": "4821" }   the URL asks for the digits first
 *
 * Going private or going to a plain link clears the stored pin hash. Asking
 * for `pin` with no pin stored and none in the body is a refusal, not a quiet
 * downgrade to an open link. A pin sent with any other mode is a refusal too,
 * and so is a `pin` key that is empty or not four to eight digits.
 */
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

    // Hash and write as one turn, so a slow pin cannot land after a later
    // private and put the pin back. Read the row back inside the same turn, so
    // the body is the state on disk and not what the caller asked for.
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

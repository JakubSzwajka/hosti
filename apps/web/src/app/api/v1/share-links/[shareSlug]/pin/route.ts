import type { SharePinResponse } from "@hosti/shared";
import { errorResponse, failureResponse, jsonResponse, unauthorized } from "@/server/api-responses";
import { authenticatePush } from "@/server/push-tokens";
import { setSharePin } from "@/server/share-links";
import { hashPin, requirePin, requireSigningSecret } from "@/server/share-pin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ shareSlug: string }> };

const noSuchLink = (shareSlug: string): Response =>
  errorResponse("no_such_share_link", `No share link is called "${shareSlug}"`, 404);

/**
 * Put a PIN on one link, or replace the one it carries. The digits are hashed
 * here and never read back, so replacing is the only way to change a PIN and
 * removing is the only way out.
 */
export async function PUT(request: Request, context: Context): Promise<Response> {
  if (!authenticatePush(request)) return unauthorized();
  const { shareSlug } = await context.params;
  try {
    requireSigningSecret();
    const text = await request.text().catch(() => "");
    const body = text.trim() ? (JSON.parse(text) as { pin?: unknown }) : {};
    const pin = requirePin(body.pin);
    if (!setSharePin(shareSlug, await hashPin(pin))) return noSuchLink(shareSlug);
    return jsonResponse({ shareSlug, hasPin: true } satisfies SharePinResponse);
  } catch (error) {
    return failureResponse(error);
  }
}

/** Take the PIN off. The link stays; the gate goes. */
export async function DELETE(request: Request, context: Context): Promise<Response> {
  if (!authenticatePush(request)) return unauthorized();
  const { shareSlug } = await context.params;
  try {
    if (!setSharePin(shareSlug, null)) return noSuchLink(shareSlug);
    return jsonResponse({ shareSlug, hasPin: false } satisfies SharePinResponse);
  } catch (error) {
    return failureResponse(error);
  }
}

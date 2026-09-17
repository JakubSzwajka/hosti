import type { RevokedShareLinkResponse } from "@hosti/shared";
import { errorResponse, failureResponse, jsonResponse, unauthorized } from "@/server/api-responses";
import { authenticatePush } from "@/server/push-tokens";
import { revokeShareLink } from "@/server/share-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ shareSlug: string }> };

/** Kill one share link. The bundle and its other links carry on. */
export async function DELETE(request: Request, context: Context): Promise<Response> {
  if (!authenticatePush(request)) return unauthorized();
  const { shareSlug } = await context.params;
  try {
    if (!revokeShareLink(shareSlug)) {
      return errorResponse("no_such_share_link", `No share link is called "${shareSlug}"`, 404);
    }
    return jsonResponse({ shareSlug, revoked: true } satisfies RevokedShareLinkResponse);
  } catch (error) {
    return failureResponse(error);
  }
}

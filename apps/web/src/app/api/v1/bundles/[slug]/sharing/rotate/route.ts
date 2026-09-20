import { errorResponse, failureResponse, jsonResponse, unauthorized } from "@/server/api-responses";
import { findBundle } from "@/server/catalog";
import { publicBaseUrl } from "@/server/config";
import { authenticatePush } from "@/server/push-tokens";
import { rotateShareSlug, sharingBody } from "@/server/sharing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

/**
 * Mint a fresh share slug. The old URL stops answering at once, which is the
 * only way to cut off somebody who already has the address. The sharing state
 * and the pin are left exactly as they were, so a rotate on a private bundle
 * changes the address it will use and nothing else.
 */
export async function POST(request: Request, context: Context): Promise<Response> {
  if (!authenticatePush(request)) return unauthorized();
  const { slug } = await context.params;
  try {
    const bundle = findBundle(slug);
    if (!bundle) {
      return errorResponse("no_such_bundle", `No bundle is called "${slug}"`, 404);
    }
    rotateShareSlug(bundle.id);
    const fresh = findBundle(slug);
    if (!fresh) return errorResponse("no_such_bundle", `No bundle is called "${slug}"`, 404);
    return jsonResponse(sharingBody(fresh, publicBaseUrl(request)));
  } catch (error) {
    return failureResponse(error);
  }
}

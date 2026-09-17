import type { DeletedBundleResponse } from "@hosti/shared";
import { errorResponse, failureResponse, jsonResponse, unauthorized } from "@/server/api-responses";
import { authenticatePush } from "@/server/push-tokens";
import { removeBundle } from "@/server/remove-bundle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

/** Delete a bundle with every revision and share link it holds. */
export async function DELETE(request: Request, context: Context): Promise<Response> {
  if (!authenticatePush(request)) return unauthorized();
  const { slug } = await context.params;
  try {
    if (!(await removeBundle(slug))) {
      return errorResponse("no_such_bundle", `No bundle is called "${slug}"`, 404);
    }
    return jsonResponse({ bundle: slug, deleted: true } satisfies DeletedBundleResponse);
  } catch (error) {
    return failureResponse(error);
  }
}

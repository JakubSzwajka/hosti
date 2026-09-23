import type { PrunedRevisionsResponse } from "@hosti/shared";
import { errorResponse, failureResponse, jsonResponse, unauthorized } from "@/server/api-responses";
import { findBundle } from "@/server/catalog";
import { keepRevisions } from "@/server/config";
import { authenticatePush } from "@/server/push-tokens";
import { pruneRevisions } from "@/server/retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  if (!authenticatePush(request)) return unauthorized();
  const { slug } = await context.params;
  if (!findBundle(slug)) {
    return errorResponse("no_such_bundle", `No bundle is called "${slug}"`, 404);
  }
  try {
    const pruned = await pruneRevisions(slug);
    return jsonResponse({
      bundle: slug,
      keep: keepRevisions(),
      kept: pruned.kept,
      removed: pruned.removed,
    } satisfies PrunedRevisionsResponse);
  } catch (error) {
    return failureResponse(error);
  }
}

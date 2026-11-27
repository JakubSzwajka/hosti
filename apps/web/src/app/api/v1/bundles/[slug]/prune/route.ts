import type { PrunedRevisionsResponse } from "@hosti/shared";
import { requirePushScope } from "@/app/_http/push-access";
import { runAppUseCase } from "@/app/_http/run-use-case";
import { errorResponse, failureResponse, jsonResponse } from "@/server/api-responses";
import { bundlesDir, keepRevisions } from "@/server/config";
import { pruneBundle } from "@/use-cases/prune-bundle";
import { showBundle } from "@/use-cases/show-bundle";
import { writerRoute } from "@/app/_http/writer-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

async function post(request: Request, context: Context): Promise<Response> {
  const access = await requirePushScope(request, "publish");
  if (!access.ok) return access.response;
  const { slug } = await context.params;
  if (!(await runAppUseCase(showBundle(slug)))) {
    return errorResponse("no_such_bundle", `No bundle is called "${slug}"`, 404);
  }
  try {
    const pruned = await runAppUseCase(
      pruneBundle({ bundleSlug: slug, bundlesRoot: bundlesDir(), keep: keepRevisions() }),
    );
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

export const POST = writerRoute(post);

import type { PrunedRevisionsResponse } from "@hosti/shared";
import { runAppUseCase } from "@/app/_http/run-use-case";
import { errorResponse, failureResponse, jsonResponse, unauthorized } from "@/server/api-responses";
import { bundlesDir, keepRevisions } from "@/server/config";
import { authenticatePush } from "@/use-cases/authenticate-push";
import { pruneBundle } from "@/use-cases/prune-bundle";
import { showBundle } from "@/use-cases/show-bundle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  if (!(await runAppUseCase(authenticatePush(request.headers.get("authorization"))))) {
    return unauthorized();
  }
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

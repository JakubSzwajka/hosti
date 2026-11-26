import { requirePushScope } from "@/app/_http/push-access";
import { runAppUseCase } from "@/app/_http/run-use-case";
import { errorResponse, failureResponse } from "@/server/api-responses";
import { revisionArchiveResponse } from "@/server/serving/revision-archive";
import { resolveRevisionArchive } from "@/use-cases/resolve-revision-archive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string; revision: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  const access = await requirePushScope(request, "publish");
  if (!access.ok) return access.response;

  const { slug, revision } = await context.params;
  try {
    const resolved = await runAppUseCase(resolveRevisionArchive(slug, revision));
    if (!resolved) return errorResponse("no_such_bundle", `No bundle is called "${slug}"`, 404);
    const { seq, kept } = resolved;
    if (seq === undefined || !kept.includes(seq)) {
      return missingRevision(slug, seq === undefined ? revision : String(seq), kept);
    }
    const response = await revisionArchiveResponse(slug, seq);
    return response ?? missingRevision(slug, String(seq), kept);
  } catch (error) {
    return failureResponse(error);
  }
}

function missingRevision(slug: string, requested: string, kept: number[]): Response {
  const sequences = kept.length > 0 ? kept.join(", ") : "none";
  return errorResponse(
    "no_such_revision",
    `Revision "${requested}" for bundle "${slug}" does not exist or was pruned. Kept revisions: ${sequences}.`,
    404,
  );
}

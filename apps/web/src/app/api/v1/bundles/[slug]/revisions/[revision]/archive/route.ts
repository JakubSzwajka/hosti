import { requirePushScope } from "@/app/_http/push-access";
import { runAppUseCase } from "@/app/_http/run-use-case";
import { errorResponse, failureResponse } from "@/server/api-responses";
import { revisionArchiveResponse } from "@/server/serving/revision-archive";
import { listRevisions } from "@/use-cases/list-revisions";
import { showBundle } from "@/use-cases/show-bundle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string; revision: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  const access = await requirePushScope(request, "publish");
  if (!access.ok) return access.response;

  const { slug, revision } = await context.params;
  try {
    const shown = await runAppUseCase(showBundle(slug));
    if (!shown) return errorResponse("no_such_bundle", `No bundle is called "${slug}"`, 404);

    const revisions = await runAppUseCase(listRevisions(shown.record.id));
    const seq =
      revision === "current"
        ? revisions.find((item) => item.current)?.seq
        : parseRevision(revision);
    if (seq === undefined) {
      if (revision !== "current" && parseRevision(revision) === undefined) {
        return errorResponse(
          "bad_revision",
          "Revision must be current or a positive safe integer",
          400,
        );
      }
      return missingRevision(
        slug,
        revision,
        revisions.map((item) => item.seq),
      );
    }
    if (!revisions.some((item) => item.seq === seq)) {
      return missingRevision(
        slug,
        String(seq),
        revisions.map((item) => item.seq),
      );
    }

    const response = await revisionArchiveResponse(slug, seq);
    return (
      response ??
      missingRevision(
        slug,
        String(seq),
        revisions.map((item) => item.seq),
      )
    );
  } catch (error) {
    return failureResponse(error);
  }
}

function parseRevision(value: string): number | undefined {
  if (!/^[1-9]\d*$/.test(value)) return undefined;
  const seq = Number(value);
  return Number.isSafeInteger(seq) ? seq : undefined;
}

function missingRevision(slug: string, requested: string, kept: number[]): Response {
  const sequences = kept.length > 0 ? kept.join(", ") : "none";
  return errorResponse(
    "no_such_revision",
    `Revision "${requested}" for bundle "${slug}" does not exist or was pruned. Kept revisions: ${sequences}.`,
    404,
  );
}

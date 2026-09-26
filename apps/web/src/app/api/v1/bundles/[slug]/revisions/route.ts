import { Readable } from "node:stream";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import { archiveSource } from "@/app/_http/archive";
import { requirePushScope } from "@/app/_http/push-access";
import { runAppUseCase } from "@/app/_http/run-use-case";
import { failureResponse, jsonResponse } from "@/server/api-responses";
import { bundlesDir, keepRevisions, publicBaseUrl } from "@/server/config";
import { PushError } from "@/server/errors";
import { pushBundle } from "@/use-cases/push-bundle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  const access = await requirePushScope(request, "publish");
  if (!access.ok) return access.response;
  const pushedBy = access.identity;
  const { slug } = await context.params;
  if (!request.body) {
    return failureResponse(
      new PushError("empty_body", "Push a gzipped tarball as the request body"),
    );
  }
  try {
    const stored = await runAppUseCase(
      pushBundle({
        slug,
        source: archiveSource(
          Readable.fromWeb(request.body as unknown as NodeWebReadableStream<Uint8Array>),
          "bad_tarball",
          "Cannot read the pushed archive",
        ),
        title: headerText(request, "x-hosti-title"),
        collection: headerText(request, "x-hosti-collection"),
        bundlesRoot: bundlesDir(),
        baseUrl: publicBaseUrl(request),
        pushedBy,
        keep: keepRevisions(),
      }),
    );
    return jsonResponse(stored, 201);
  } catch (error) {
    return failureResponse(error);
  }
}

const MAX_HEADER_TEXT = 200;

function headerText(request: Request, name: string): string | null {
  const raw = request.headers.get(name);
  if (!raw) return null;
  const trimmed = raw.trim().slice(0, MAX_HEADER_TEXT);
  return trimmed || null;
}

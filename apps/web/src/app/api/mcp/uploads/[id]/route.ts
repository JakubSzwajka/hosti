import { Readable } from "node:stream";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import { archiveSource } from "@/app/_http/archive";
import {
  admittedTransfer,
  verifyTransferRequest,
  transferFailure,
} from "@/app/_http/mcp-capability";
import { runAppUseCase } from "@/app/_http/run-use-case";
import { bundlesDir, dataDir, keepRevisions, publicBaseUrl } from "@/server/config";
import { jsonResponse } from "@/server/api-responses";
import { PushError } from "@/server/errors";
import { reserveMcpUpload } from "@/use-cases/reserve-mcp-upload";
import { pushBundle } from "@/use-cases/push-bundle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context): Promise<Response> {
  let source: Readable | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const { id } = await context.params;
    if (!verifyTransferRequest(request, "upload", id))
      throw new PushError("not_found", "Transfer unavailable", 404);
    const grant = await runAppUseCase(reserveMcpUpload(dataDir(), id));
    if (!admittedTransfer(grant.input.subject))
      throw new PushError("forbidden", "Transfer unavailable", 403);
    if (!request.body) throw new PushError("empty_body", "Archive required", 400);
    const length = request.headers.get("content-length");
    if (length && (!/^\d+$/.test(length) || Number(length) > grant.input.maxBytes)) {
      throw new PushError("too_large", "Archive exceeds compressed byte limit", 413);
    }
    source = Readable.fromWeb(request.body as unknown as NodeWebReadableStream<Uint8Array>);
    const activeSource = source;
    timer = setTimeout(() => activeSource.destroy(new Error("Upload timed out")), 120_000);
    const result = await runAppUseCase(
      pushBundle({
        slug: grant.input.slug,
        title: grant.input.title,
        collection: grant.input.collection,
        pushedBy: { kind: "mcp", name: `mcp:${grant.input.clientName}` },
        source: archiveSource(source, "bad_tarball", "Cannot read archive"),
        bundlesRoot: bundlesDir(),
        baseUrl: publicBaseUrl(request),
        limits: { maxCompressedBytes: grant.input.maxBytes },
        keep: keepRevisions(),
      }),
    );
    return jsonResponse(result, 201, {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    });
  } catch (error) {
    return transferFailure(error);
  } finally {
    if (timer) clearTimeout(timer);
    source?.destroy();
  }
}

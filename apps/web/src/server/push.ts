import { type PushResponse, isValidSlug } from "@hosti/shared";
import { Readable } from "node:stream";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import { publicBaseUrl } from "@/server/config";
import {
  createBundle,
  findBundle,
  nextRevisionSeq,
  recordRevision,
  updateBundleMeta,
} from "@/server/catalog";
import { PushError } from "@/server/errors";
import { writeRevision } from "@/server/storage/revisions";

const MAX_HEADER_TEXT = 200;

function headerText(request: Request, name: string): string | null {
  const raw = request.headers.get(name);
  if (!raw) return null;
  const trimmed = raw.trim().slice(0, MAX_HEADER_TEXT);
  return trimmed || null;
}

/**
 * Take one push: unpack to disk first, then write metadata. A push that fails
 * leaves no bundle row, no revision row and no directory.
 */
export async function acceptPush(request: Request, slug: string): Promise<PushResponse> {
  if (!isValidSlug(slug)) {
    throw new PushError(
      "bad_slug",
      "A bundle slug is lowercase letters, digits and dashes, 1 to 64 characters",
    );
  }
  if (!request.body) {
    throw new PushError("empty_body", "Push a gzipped tarball as the request body");
  }

  const existing = findBundle(slug);
  const seq = existing ? nextRevisionSeq(existing.id) : 1;
  const body = Readable.fromWeb(request.body as unknown as NodeWebReadableStream<Uint8Array>);

  const stats = await writeRevision({ bundleSlug: slug, seq, body });

  const title = headerText(request, "x-hosti-title");
  const collection = headerText(request, "x-hosti-collection");
  const bundle = existing ?? createBundle({ slug, title, collection });
  if (existing) updateBundleMeta(existing.id, { title, collection });

  const revision = recordRevision({
    bundleId: bundle.id,
    seq,
    byteSize: stats.byteSize,
    fileCount: stats.fileCount,
  });

  return {
    bundle: slug,
    revision: revision.seq,
    url: `${publicBaseUrl(request)}/v/${slug}/`,
  };
}

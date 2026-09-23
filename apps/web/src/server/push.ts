import { COLLECTION_RULE, type PushResponse, isValidSlug, readCollection } from "@hosti/shared";
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
import type { CATALOG_UPLOAD, PushIdentity } from "@/server/push-tokens";
import { pruneRevisions } from "@/server/retention";
import { describeSharing, shareUrl } from "@/server/sharing";
import { type ArchiveFormat, writeRevision } from "@/server/storage/revisions";

const MAX_HEADER_TEXT = 200;

function headerText(request: Request, name: string): string | null {
  const raw = request.headers.get(name);
  if (!raw) return null;
  const trimmed = raw.trim().slice(0, MAX_HEADER_TEXT);
  return trimmed || null;
}

function collectionHeader(request: Request): string | null {
  const raw = headerText(request, "x-hosti-collection");
  if (raw === null) return null;
  const wanted = readCollection(raw);
  if (!wanted) throw new PushError("bad_collection", `${COLLECTION_RULE}`);
  return wanted;
}

export type RevisionInput = {
  slug: string;

  body: Readable;

  format?: ArchiveFormat;

  title: string | null;

  collection: string | null;

  baseUrl: string;

  pushedBy: RevisionSource;
};

export type RevisionSource = PushIdentity | typeof CATALOG_UPLOAD;

function writerName(source: RevisionSource): string {
  return typeof source === "string" ? source : source.name;
}

export async function storeRevision(input: RevisionInput): Promise<PushResponse> {
  const { slug, title, collection } = input;
  if (!isValidSlug(slug)) {
    throw new PushError(
      "bad_slug",
      "A bundle slug is lowercase letters, digits and dashes, 1 to 64 characters",
    );
  }

  const existing = findBundle(slug);
  const seq = existing ? nextRevisionSeq(existing.id) : 1;

  const stats = await writeRevision({
    bundleSlug: slug,
    seq,
    body: input.body,
    ...(input.format ? { format: input.format } : {}),
  });

  const bundle = existing ?? createBundle({ slug, title, collection });
  if (existing) updateBundleMeta(existing.id, { title, collection });

  const revision = recordRevision({
    bundleId: bundle.id,
    seq,
    byteSize: stats.byteSize,
    fileCount: stats.fileCount,
    pushedBy: writerName(input.pushedBy),
  });

  try {
    await pruneRevisions(slug);
  } catch (error) {
    console.error(`hosti: pruning ${slug} failed`, error);
  }

  const { baseUrl } = input;

  const sharing = describeSharing(findBundle(slug) ?? bundle);
  return {
    bundle: slug,
    revision: revision.seq,
    adminUrl: `${baseUrl}/b/${slug}`,
    sharing,
    shareUrl: shareUrl(sharing, baseUrl),
  };
}

export async function acceptPush(
  request: Request,
  slug: string,
  pushedBy: PushIdentity,
): Promise<PushResponse> {
  if (!request.body) {
    throw new PushError("empty_body", "Push a gzipped tarball as the request body");
  }
  const title = headerText(request, "x-hosti-title");
  const collection = collectionHeader(request);
  return storeRevision({
    slug,
    body: Readable.fromWeb(request.body as unknown as NodeWebReadableStream<Uint8Array>),
    title,
    collection,
    baseUrl: publicBaseUrl(request),
    pushedBy,
  });
}

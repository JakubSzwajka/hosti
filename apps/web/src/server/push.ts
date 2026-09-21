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

/**
 * The collection a push asks for, held to the same rule the catalog's own
 * field is held to. Without this a push could file a bundle under `-`, which
 * is the path the catalog reserves for bundles in no collection, and the
 * bundle would then answer to no chip at all. An absent header means "leave
 * the collection alone", so only a header that is there is judged.
 */
function collectionHeader(request: Request): string | null {
  const raw = headerText(request, "x-hosti-collection");
  if (raw === null) return null;
  const wanted = readCollection(raw);
  if (!wanted) throw new PushError("bad_collection", `${COLLECTION_RULE}`);
  return wanted;
}

export type RevisionInput = {
  slug: string;
  /** The archive's bytes. */
  body: Readable;
  /** How they are wrapped. The push API speaks gzipped tar; an upload may be zip. */
  format?: ArchiveFormat;
  /** The bundle's title, or null to leave whatever is there. */
  title: string | null;
  /** The collection, already held to `readCollection`, or null to leave it. */
  collection: string | null;
  /** The origin the returned links hang off. */
  baseUrl: string;
  /** How this revision arrived. Every way in names one. */
  pushedBy: RevisionSource;
};

/**
 * How a revision arrived: the push token that carried it, or the catalog's own
 * upload. There is no third option and no absent one, because a revision that
 * records nothing is a revision written before Hosti kept this, and only the
 * migration may leave that.
 */
export type RevisionSource = PushIdentity | typeof CATALOG_UPLOAD;

/** The name a revision row stores for one way in. Never null. */
function writerName(source: RevisionSource): string {
  return typeof source === "string" ? source : source.name;
}

/**
 * Take one revision, whether it came from `hosti push` or from the catalog's
 * drop zone: unpack to disk first, then write metadata. A revision that fails
 * leaves no bundle row, no revision row and no directory. It never changes the
 * sharing state either: a new bundle lands private and an existing one keeps
 * the state it had.
 */
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

  // Retention runs after the pointer has moved, so the revision this push just
  // made is the one that is safe. A failure here is not the push's failure:
  // the bundle is live and the worst case is disk that gets reclaimed next time.
  try {
    await pruneRevisions(slug);
  } catch (error) {
    console.error(`hosti: pruning ${slug} failed`, error);
  }

  const { baseUrl } = input;
  // Read the row back rather than reusing `bundle`: an existing bundle's row
  // was fetched before this push and the sharing state is what it already was.
  const sharing = describeSharing(findBundle(slug) ?? bundle);
  return {
    bundle: slug,
    revision: revision.seq,
    adminUrl: `${baseUrl}/b/${slug}`,
    sharing,
    shareUrl: shareUrl(sharing, baseUrl),
  };
}

/**
 * `POST /api/v1/bundles/<slug>/revisions`: a gzipped tarball on a push token,
 * with the title and the collection riding on headers. The headers are judged
 * before a byte hits the disk, so a refused one leaves no revision directory.
 */
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

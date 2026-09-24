import type { PushIdentity } from "@hosti/identity";
import {
  acceptPush as acceptPushEffect,
  storeRevision as storeRevisionEffect,
  type RevisionSource,
} from "@hosti/bundles";
import type { PushResponse } from "@hosti/shared";
import type { ArchiveFormat } from "@hosti/storage";
import { effectReadable } from "@/server/storage/compat";
import { bundlesDir, keepRevisions, publicBaseUrl } from "@/server/config";
import { PushError } from "@/server/errors";
import { runBundlesPromise } from "@/server/runtime";
import type { Readable } from "node:stream";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import { Readable as NodeReadable } from "node:stream";

const MAX_HEADER_TEXT = 200;

function headerText(request: Request, name: string): string | null {
  const raw = request.headers.get(name);
  if (!raw) return null;
  const trimmed = raw.trim().slice(0, MAX_HEADER_TEXT);
  return trimmed || null;
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

export type { RevisionSource };

function effectInput(input: RevisionInput) {
  return {
    slug: input.slug,
    source: effectReadable(input.body, "bad_tarball", "Cannot read the pushed archive"),
    ...(input.format === undefined ? {} : { format: input.format }),
    title: input.title,
    collection: input.collection,
    bundlesRoot: bundlesDir(),
    baseUrl: input.baseUrl,
    pushedBy: input.pushedBy,
    keep: keepRevisions(),
  };
}

export function storeRevision(input: RevisionInput): Promise<PushResponse> {
  return runBundlesPromise(storeRevisionEffect(effectInput(input)));
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
  const collection = headerText(request, "x-hosti-collection");
  const input: RevisionInput = {
    slug,
    body: NodeReadable.fromWeb(request.body as unknown as NodeWebReadableStream<Uint8Array>),
    title,
    collection,
    baseUrl: publicBaseUrl(request),
    pushedBy,
  };
  return runBundlesPromise(acceptPushEffect(effectInput(input)));
}

import type { CATALOG_UPLOAD, PushIdentity } from "@hosti/identity";
import {
  COLLECTION_RULE,
  SLUG_RULE,
  type PushResponse,
  isValidSlug,
  readCollection,
} from "@hosti/shared";
import { Catalog } from "@hosti/catalog";
import { Effect, type Stream } from "effect";
import { Storage, type ArchiveFormat, type StorageError } from "@hosti/storage";
import { BundlesError } from "./bundles-error";
import { describeSharing, shareUrl } from "./sharing";
import { catalogBundlesError, storageBundlesError } from "./internal/errors";
import { pruneRevisions } from "./retention";

export type RevisionSource = PushIdentity | typeof CATALOG_UPLOAD;

export type StoreRevisionInput = {
  slug: string;
  source: Stream.Stream<Uint8Array, StorageError>;
  format?: ArchiveFormat;
  title: string | null;
  collection: string | null;
  bundlesRoot: string;
  baseUrl: string;
  pushedBy: RevisionSource;
  keep?: number;
};

function validatedCollection(value: string | null): Effect.Effect<string | null, BundlesError> {
  if (value === null) return Effect.succeed(null);
  const parsed = readCollection(value);
  return parsed === undefined
    ? Effect.fail(
        new BundlesError({ code: "bad_collection", message: COLLECTION_RULE, status: 400 }),
      )
    : Effect.succeed(parsed);
}

function writerName(source: RevisionSource): string {
  return typeof source === "string" ? source : source.name;
}

export const storeRevision = Effect.fn("Bundles.storeRevision")(function* (
  input: StoreRevisionInput,
) {
  if (!isValidSlug(input.slug)) {
    return yield* new BundlesError({ code: "bad_slug", message: SLUG_RULE, status: 400 });
  }
  const collection = yield* validatedCollection(input.collection);

  const catalog = yield* Catalog;
  const storage = yield* Storage;
  const existing = yield* catalog.findBundle(input.slug).pipe(Effect.mapError(catalogBundlesError));
  const seq = existing
    ? yield* catalog.nextRevisionSeq(existing.id).pipe(Effect.mapError(catalogBundlesError))
    : 1;
  const stats = yield* storage
    .writeRevision({
      bundlesRoot: input.bundlesRoot,
      bundleSlug: input.slug,
      seq,
      source: input.source,
      ...(input.format === undefined ? {} : { format: input.format }),
    })
    .pipe(Effect.mapError(storageBundlesError));

  const bundle =
    existing ??
    (yield* catalog
      .createBundle({ slug: input.slug, title: input.title, collection })
      .pipe(Effect.mapError(catalogBundlesError)));
  if (existing) {
    yield* catalog
      .updateBundleMeta(existing.id, { title: input.title, collection })
      .pipe(Effect.mapError(catalogBundlesError));
  }

  const revision = yield* catalog
    .recordRevision({
      bundleId: bundle.id,
      seq,
      byteSize: stats.byteSize,
      fileCount: stats.fileCount,
      pushedBy: writerName(input.pushedBy),
    })
    .pipe(Effect.mapError(catalogBundlesError));

  yield* pruneRevisions({
    bundleSlug: input.slug,
    bundlesRoot: input.bundlesRoot,
    ...(input.keep === undefined ? {} : { keep: input.keep }),
  }).pipe(
    Effect.tapError((error) =>
      Effect.logError(`hosti: pruning ${input.slug} failed: ${error.message}`),
    ),
    Effect.ignore,
  );

  const latest = yield* catalog.findBundle(input.slug).pipe(Effect.mapError(catalogBundlesError));
  const sharing = describeSharing(latest ?? bundle);
  return {
    bundle: input.slug,
    revision: revision.seq,
    adminUrl: `${input.baseUrl}/b/${input.slug}`,
    sharing,
    shareUrl: shareUrl(sharing, input.baseUrl),
  } satisfies PushResponse;
});

export const acceptPush = Effect.fn("Bundles.acceptPush")(function* (input: StoreRevisionInput) {
  const collection = yield* validatedCollection(input.collection);
  return yield* storeRevision({ ...input, collection });
});

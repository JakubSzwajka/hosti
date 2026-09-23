import type { Crypto } from "effect/Crypto";
import { Effect } from "effect";
import { isSharingMode, ROTATED_ALPHABET, ROTATED_LENGTH } from "@hosti/shared";
import type { Bundle, Revision, SharingState } from "@hosti/shared";
import { CatalogError } from "../catalog-error";
import type Database from "better-sqlite3";
import { catalogError, tryCatalog } from "./catalog-errors";
import type { BundleRecord, RevisionRow } from "../types";

const ROTATE_TRIES = 5;

export function toRevision(row: RevisionRow): Revision {
  return {
    seq: row.seq,
    byteSize: row.byte_size,
    fileCount: row.file_count,
    pushedBy: row.pushed_by,
    createdAt: row.created_at,
  };
}

export function describeSharing(bundle: BundleRecord): SharingState {
  return {
    mode: isSharingMode(bundle.share_mode) ? bundle.share_mode : "private",
    shareSlug: bundle.share_slug,
    hasPin: bundle.pin_hash !== null,
  };
}

export function describeBundleRecord(bundle: BundleRecord, revisions: RevisionRow[]): Bundle {
  const current = revisions.find((revision) => revision.id === bundle.current_revision_id);
  return {
    slug: bundle.slug,
    title: bundle.title,
    collection: bundle.collection,
    createdAt: bundle.created_at,
    updatedAt: bundle.updated_at,
    currentRevision: current ? toRevision(current) : null,
    revisionCount: revisions.length,
    sharing: describeSharing(bundle),
  };
}

export function initialShareSlug(
  database: Database.Database,
  bundleSlug: string,
  crypto: Crypto,
): Effect.Effect<string, CatalogError> {
  return Effect.gen(function* () {
    const taken = yield* tryCatalog("initialShareSlug", () =>
      database.prepare("SELECT id FROM bundles WHERE share_slug = ?").get(bundleSlug),
    );
    if (taken === undefined) return bundleSlug;

    for (let attempt = 0; attempt < ROTATE_TRIES; attempt += 1) {
      const characters: string[] = [];
      for (let index = 0; index < ROTATED_LENGTH; index += 1) {
        const characterIndex = yield* crypto
          .randomIntBetween(0, ROTATED_ALPHABET.length - 1)
          .pipe(Effect.mapError((cause) => catalogError("initialShareSlug", cause)));
        characters.push(ROTATED_ALPHABET.charAt(characterIndex));
      }
      const candidate = characters.join("");
      const candidateTaken = yield* tryCatalog("initialShareSlug", () =>
        database
          .prepare("SELECT id FROM bundles WHERE share_slug = ? AND id != ?")
          .get(candidate, 0),
      );
      if (candidateTaken === undefined) return candidate;
    }

    return yield* new CatalogError({
      operation: "initialShareSlug",
      message: "Could not find a free share slug",
    });
  });
}

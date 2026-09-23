import type { Bundle } from "@hosti/shared";
import type Database from "better-sqlite3";
import { Effect } from "effect";
import type { CatalogError } from "../catalog-error";
import { tryCatalog } from "./catalog-errors";
import { describeBundleRecord, describeSharing, toRevision } from "./catalog-helpers";
import type { BundleRecord, CatalogMethods, ResolvedShare, RevisionRow } from "../types";

export type CatalogReadOperations = Pick<
  CatalogMethods,
  | "findBundle"
  | "listCollections"
  | "nextRevisionSeq"
  | "revisionRecords"
  | "listRevisions"
  | "resolveShare"
  | "describeBundle"
  | "listCatalog"
>;

export function makeCatalogReadOperations(
  database: Effect.Effect<Database.Database, CatalogError>,
): CatalogReadOperations {
  const findBundle = Effect.fn("Catalog.findBundle")(function* (slug: string) {
    const db = yield* database;
    return yield* tryCatalog(
      "findBundle",
      () =>
        (db.prepare("SELECT * FROM bundles WHERE slug = ?").get(slug) as
          | BundleRecord
          | undefined) ?? null,
    );
  });

  const listCollections = Effect.gen(function* () {
    const db = yield* database;
    return yield* tryCatalog("listCollections", () => {
      const rows = db
        .prepare(
          "SELECT DISTINCT collection FROM bundles WHERE collection IS NOT NULL ORDER BY collection",
        )
        .all() as { collection: string }[];
      return rows.map((row) => row.collection);
    });
  }).pipe(Effect.withSpan("Catalog.listCollections"));

  const nextRevisionSeq = Effect.fn("Catalog.nextRevisionSeq")(function* (bundleId: number) {
    const db = yield* database;
    return yield* tryCatalog("nextRevisionSeq", () => {
      const row = db
        .prepare("SELECT COALESCE(MAX(seq), 0) AS max_seq FROM revisions WHERE bundle_id = ?")
        .get(bundleId) as { max_seq: number };
      return row.max_seq + 1;
    });
  });

  const revisionRecords = Effect.fn("Catalog.revisionRecords")(function* (bundleId: number) {
    const db = yield* database;
    return yield* tryCatalog("revisionRecords", () => {
      const bundle = db
        .prepare("SELECT current_revision_id FROM bundles WHERE id = ?")
        .get(bundleId) as { current_revision_id: number | null } | undefined;
      const rows = db
        .prepare("SELECT id, seq FROM revisions WHERE bundle_id = ? ORDER BY seq DESC")
        .all(bundleId) as { id: number; seq: number }[];
      return rows.map((row) => ({
        id: row.id,
        seq: row.seq,
        current: row.id === bundle?.current_revision_id,
      }));
    });
  });

  const listRevisions = Effect.fn("Catalog.listRevisions")(function* (bundleId: number) {
    const db = yield* database;
    return yield* tryCatalog("listRevisions", () => {
      const bundle = db
        .prepare("SELECT current_revision_id FROM bundles WHERE id = ?")
        .get(bundleId) as { current_revision_id: number | null } | undefined;
      const rows = db
        .prepare("SELECT * FROM revisions WHERE bundle_id = ? ORDER BY seq DESC")
        .all(bundleId) as RevisionRow[];
      return rows.map((row) => ({
        ...toRevision(row),
        current: row.id === bundle?.current_revision_id,
      }));
    });
  });

  const resolveShare = Effect.fn("Catalog.resolveShare")(function* (shareSlug: string) {
    const db = yield* database;
    return yield* tryCatalog("resolveShare", () => {
      const row = db
        .prepare(
          `SELECT b.id AS bundle_id, b.share_slug AS share_slug, b.pin_hash AS pin_hash,
                  b.slug AS bundle_slug, r.seq AS seq
             FROM bundles b
             JOIN revisions r ON r.id = b.current_revision_id
            WHERE b.share_slug = ?
              AND (b.share_mode = 'link' OR (b.share_mode = 'pin' AND b.pin_hash IS NOT NULL))`,
        )
        .get(shareSlug) as
        | {
            bundle_id: number;
            share_slug: string;
            pin_hash: string | null;
            bundle_slug: string;
            seq: number;
          }
        | undefined;
      if (!row) return null;
      const result: ResolvedShare = {
        shareSlug: row.share_slug,
        bundleSlug: row.bundle_slug,
        bundleId: row.bundle_id,
        currentSeq: row.seq,
        pinHash: row.pin_hash,
      };
      return result;
    });
  });

  const describeBundle = Effect.fn("Catalog.describeBundle")(function* (bundle: BundleRecord) {
    const db = yield* database;
    return yield* tryCatalog("describeBundle", () => {
      const rows = db
        .prepare("SELECT * FROM revisions WHERE bundle_id = ?")
        .all(bundle.id) as RevisionRow[];
      return describeBundleRecord(bundle, rows);
    });
  });

  const listCatalog = Effect.gen(function* () {
    const db = yield* database;
    return yield* tryCatalog("listCatalog", () => {
      const bundles = db
        .prepare("SELECT * FROM bundles ORDER BY updated_at DESC, id DESC")
        .all() as BundleRecord[];
      const revisions = db.prepare("SELECT * FROM revisions").all() as RevisionRow[];
      return bundles.map((bundle): Bundle => {
        const mine = revisions.filter((revision) => revision.bundle_id === bundle.id);
        const current = mine.find((revision) => revision.id === bundle.current_revision_id);
        return {
          slug: bundle.slug,
          title: bundle.title,
          collection: bundle.collection,
          createdAt: bundle.created_at,
          updatedAt: bundle.updated_at,
          currentRevision: current ? toRevision(current) : null,
          revisionCount: mine.length,
          sharing: describeSharing(bundle),
        };
      });
    });
  }).pipe(Effect.withSpan("Catalog.listCatalog"));

  return {
    findBundle,
    listCollections,
    nextRevisionSeq,
    revisionRecords,
    listRevisions,
    resolveShare,
    describeBundle,
    listCatalog,
  };
}

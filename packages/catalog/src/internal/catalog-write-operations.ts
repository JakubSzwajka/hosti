import { Effect } from "effect";
import { CatalogError } from "../catalog-error";
import { tryCatalog } from "./catalog-errors";
import { initialShareSlug, toRevision } from "./catalog-helpers";
import type { BundleRecord, CatalogMethods, CatalogWriteDependencies, RevisionRow } from "../types";

export type CatalogWriteOperations = Pick<
  CatalogMethods,
  | "createBundle"
  | "deleteBundle"
  | "updateBundleMeta"
  | "setBundleCollection"
  | "recordRevision"
  | "deleteRevisionRows"
>;

export function makeCatalogWriteOperations({
  database,
  nowIso,
  crypto,
}: CatalogWriteDependencies): CatalogWriteOperations {
  const createBundle = Effect.fn("Catalog.createBundle")(function* (input: {
    slug: string;
    title?: string | null;
    collection?: string | null;
  }) {
    const db = yield* database;
    const now = yield* nowIso;
    const shareSlug = yield* initialShareSlug(db, input.slug, crypto);
    const id = yield* tryCatalog("createBundle", () => {
      const result = db
        .prepare(
          `INSERT INTO bundles (slug, title, collection, share_mode, share_slug, created_at, updated_at)
           VALUES (?, ?, ?, 'private', ?, ?, ?)`,
        )
        .run(
          input.slug,
          input.title?.trim() || input.slug,
          input.collection ?? null,
          shareSlug,
          now,
          now,
        );
      return Number(result.lastInsertRowid);
    });
    const row = yield* tryCatalog(
      "createBundle",
      () => db.prepare("SELECT * FROM bundles WHERE id = ?").get(id) as BundleRecord | undefined,
    );
    if (row === undefined) {
      return yield* new CatalogError({
        operation: "createBundle",
        message: "Inserted bundle could not be read",
      });
    }
    return row;
  });

  const deleteBundle = Effect.fn("Catalog.deleteBundle")(function* (bundleId: number) {
    const db = yield* database;
    yield* tryCatalog("deleteBundle", () => {
      const forget = db.transaction(() => {
        db.prepare("UPDATE bundles SET current_revision_id = NULL WHERE id = ?").run(bundleId);
        db.prepare("DELETE FROM revisions WHERE bundle_id = ?").run(bundleId);
        db.prepare("DELETE FROM bundles WHERE id = ?").run(bundleId);
      });
      forget();
    });
  });

  const updateBundleMeta = Effect.fn("Catalog.updateBundleMeta")(function* (
    bundleId: number,
    input: { title?: string | null; collection?: string | null },
  ) {
    const db = yield* database;
    const title = input.title?.trim();
    const collection = input.collection?.trim();
    yield* tryCatalog("updateBundleMeta", () => {
      if (title) db.prepare("UPDATE bundles SET title = ? WHERE id = ?").run(title, bundleId);
      if (collection) {
        db.prepare("UPDATE bundles SET collection = ? WHERE id = ?").run(collection, bundleId);
      }
    });
  });

  const setBundleCollection = Effect.fn("Catalog.setBundleCollection")(function* (
    bundleId: number,
    collection: string | null,
  ) {
    const db = yield* database;
    yield* tryCatalog("setBundleCollection", () =>
      db
        .prepare("UPDATE bundles SET collection = ? WHERE id = ?")
        .run(collection ?? null, bundleId),
    );
  });

  const recordRevision = Effect.fn("Catalog.recordRevision")(function* (input: {
    bundleId: number;
    seq: number;
    byteSize: number;
    fileCount: number;
    pushedBy: string;
  }) {
    const db = yield* database;
    const now = yield* nowIso;
    const id = yield* tryCatalog("recordRevision", () => {
      const record = db.transaction(() => {
        const result = db
          .prepare(
            `INSERT INTO revisions (bundle_id, seq, byte_size, file_count, pushed_by, created_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(input.bundleId, input.seq, input.byteSize, input.fileCount, input.pushedBy, now);
        db.prepare("UPDATE bundles SET current_revision_id = ?, updated_at = ? WHERE id = ?").run(
          result.lastInsertRowid,
          now,
          input.bundleId,
        );
        return Number(result.lastInsertRowid);
      });
      return record();
    });
    const row = yield* tryCatalog(
      "recordRevision",
      () => db.prepare("SELECT * FROM revisions WHERE id = ?").get(id) as RevisionRow | undefined,
    );
    if (row === undefined) {
      return yield* new CatalogError({
        operation: "recordRevision",
        message: "Inserted revision could not be read",
      });
    }
    return toRevision(row);
  });

  const deleteRevisionRows = Effect.fn("Catalog.deleteRevisionRows")(function* (
    bundleId: number,
    ids: number[],
  ) {
    if (ids.length === 0) return;
    const db = yield* database;
    yield* tryCatalog("deleteRevisionRows", () => {
      const drop = db.transaction(() => {
        const statement = db.prepare(
          `DELETE FROM revisions
              WHERE id = ? AND bundle_id = ?
                AND id IS NOT (SELECT current_revision_id FROM bundles WHERE id = ?)`,
        );
        for (const id of ids) statement.run(id, bundleId, bundleId);
      });
      drop();
    });
  });

  return {
    createBundle,
    deleteBundle,
    updateBundleMeta,
    setBundleCollection,
    recordRevision,
    deleteRevisionRows,
  };
}

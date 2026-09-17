import type { Bundle, Revision } from "@hosti/shared";
import { db, nowIso } from "@/server/db";

type BundleRow = {
  id: number;
  slug: string;
  title: string;
  collection: string | null;
  current_revision_id: number | null;
  created_at: string;
  updated_at: string;
};

type RevisionRow = {
  id: number;
  bundle_id: number;
  seq: number;
  byte_size: number;
  file_count: number;
  created_at: string;
};

export type BundleRecord = BundleRow;

function toRevision(row: RevisionRow): Revision {
  return {
    seq: row.seq,
    byteSize: row.byte_size,
    fileCount: row.file_count,
    createdAt: row.created_at,
  };
}

export function findBundle(slug: string): BundleRecord | null {
  return (db().prepare("SELECT * FROM bundles WHERE slug = ?").get(slug) as BundleRow) ?? null;
}

/**
 * Create the bundle. A push to an unknown slug lands here: the spec chose
 * create-on-push. No share link is minted, because a bundle is private until
 * someone asks for one.
 */
export function createBundle(input: {
  slug: string;
  title?: string | null;
  collection?: string | null;
}): BundleRecord {
  const now = nowIso();
  const result = db()
    .prepare(
      `INSERT INTO bundles (slug, title, collection, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(input.slug, input.title?.trim() || input.slug, input.collection ?? null, now, now);
  return db()
    .prepare("SELECT * FROM bundles WHERE id = ?")
    .get(result.lastInsertRowid as number) as BundleRow;
}

/**
 * Forget a bundle: its revisions and every share link go with it. The caller
 * removes the files. `current_revision_id` is cleared first, because that
 * column points back at a row the delete is about to take away.
 */
export function deleteBundle(bundleId: number): void {
  const forget = db().transaction(() => {
    db().prepare("UPDATE bundles SET current_revision_id = NULL WHERE id = ?").run(bundleId);
    db().prepare("DELETE FROM share_links WHERE bundle_id = ?").run(bundleId);
    db().prepare("DELETE FROM revisions WHERE bundle_id = ?").run(bundleId);
    db().prepare("DELETE FROM bundles WHERE id = ?").run(bundleId);
  });
  forget();
}

/** Push headers may rename a bundle or move it between collections. */
export function updateBundleMeta(
  bundleId: number,
  input: { title?: string | null; collection?: string | null },
): void {
  const title = input.title?.trim();
  const collection = input.collection?.trim();
  if (title) {
    db().prepare("UPDATE bundles SET title = ? WHERE id = ?").run(title, bundleId);
  }
  if (collection) {
    db().prepare("UPDATE bundles SET collection = ? WHERE id = ?").run(collection, bundleId);
  }
}

/**
 * Move a bundle between collections, or out of every one. Unlike the push
 * headers above, `null` here means what it says: clear it. The catalog is the
 * only place a collection can be taken away, because a push that sets nothing
 * must leave the label the owner chose alone.
 */
export function setBundleCollection(bundleId: number, collection: string | null): void {
  db()
    .prepare("UPDATE bundles SET collection = ? WHERE id = ?")
    .run(collection ?? null, bundleId);
}

/** Every collection in use, sorted, for offering the ones that already exist. */
export function listCollections(): string[] {
  const rows = db()
    .prepare(
      "SELECT DISTINCT collection FROM bundles WHERE collection IS NOT NULL ORDER BY collection",
    )
    .all() as { collection: string }[];
  return rows.map((row) => row.collection);
}

export function nextRevisionSeq(bundleId: number): number {
  const row = db()
    .prepare("SELECT COALESCE(MAX(seq), 0) AS max_seq FROM revisions WHERE bundle_id = ?")
    .get(bundleId) as { max_seq: number };
  return row.max_seq + 1;
}

/** Record the revision and make it the current one. Called after the disk flip. */
export function recordRevision(input: {
  bundleId: number;
  seq: number;
  byteSize: number;
  fileCount: number;
}): Revision {
  const now = nowIso();
  const record = db().transaction(() => {
    const result = db()
      .prepare(
        `INSERT INTO revisions (bundle_id, seq, byte_size, file_count, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(input.bundleId, input.seq, input.byteSize, input.fileCount, now);
    db()
      .prepare("UPDATE bundles SET current_revision_id = ?, updated_at = ? WHERE id = ?")
      .run(result.lastInsertRowid, now, input.bundleId);
    return result.lastInsertRowid as number;
  });
  const id = record();
  return toRevision(db().prepare("SELECT * FROM revisions WHERE id = ?").get(id) as RevisionRow);
}

/** A revision as retention sees it: which row, which directory, and is it live. */
export type StoredRevision = { id: number; seq: number; current: boolean };

/** Every revision of one bundle, newest first, for deciding what to prune. */
export function revisionRecords(bundleId: number): StoredRevision[] {
  const bundle = db()
    .prepare("SELECT current_revision_id FROM bundles WHERE id = ?")
    .get(bundleId) as { current_revision_id: number | null } | undefined;
  const rows = db()
    .prepare("SELECT id, seq FROM revisions WHERE bundle_id = ? ORDER BY seq DESC")
    .all(bundleId) as { id: number; seq: number }[];
  return rows.map((row) => ({
    id: row.id,
    seq: row.seq,
    current: row.id === bundle?.current_revision_id,
  }));
}

/**
 * Drop revision rows. The caller removes the directories afterwards, so a
 * crash in between leaves files nobody can reach rather than rows pointing at
 * files that are gone. The current revision is refused outright: retention
 * decides how many to keep, never whether the live one survives.
 */
export function deleteRevisionRows(bundleId: number, ids: number[]): void {
  if (ids.length === 0) return;
  const drop = db().transaction(() => {
    const statement = db().prepare(
      `DELETE FROM revisions
        WHERE id = ? AND bundle_id = ?
          AND id IS NOT (SELECT current_revision_id FROM bundles WHERE id = ?)`,
    );
    for (const id of ids) statement.run(id, bundleId, bundleId);
  });
  drop();
}

/** Every push of one bundle, newest first, with the current one marked. */
export function listRevisions(bundleId: number): (Revision & { current: boolean })[] {
  const bundle = db()
    .prepare("SELECT current_revision_id FROM bundles WHERE id = ?")
    .get(bundleId) as { current_revision_id: number | null } | undefined;
  const rows = db()
    .prepare("SELECT * FROM revisions WHERE bundle_id = ? ORDER BY seq DESC")
    .all(bundleId) as RevisionRow[];
  return rows.map((row) => ({
    ...toRevision(row),
    current: row.id === bundle?.current_revision_id,
  }));
}

export type ResolvedShareLink = {
  shareSlug: string;
  bundleSlug: string;
  currentSeq: number;
  /** The scrypt hash guarding this link, or null when anyone holding it may look. */
  pinHash: string | null;
};

/**
 * Resolve a share slug to the bundle's current revision. Returns null when the
 * share link is unknown or its bundle has never had a successful push, so that
 * a caller cannot tell those two cases apart.
 */
export function resolveShareLink(shareSlug: string): ResolvedShareLink | null {
  const row = db()
    .prepare(
      `SELECT s.slug AS share_slug, s.pin_hash AS pin_hash, b.slug AS bundle_slug, r.seq AS seq
         FROM share_links s
         JOIN bundles b ON b.id = s.bundle_id
         JOIN revisions r ON r.id = b.current_revision_id
        WHERE s.slug = ?`,
    )
    .get(shareSlug) as
    | { share_slug: string; pin_hash: string | null; bundle_slug: string; seq: number }
    | undefined;
  if (!row) return null;
  return {
    shareSlug: row.share_slug,
    bundleSlug: row.bundle_slug,
    currentSeq: row.seq,
    pinHash: row.pin_hash,
  };
}

/** The catalog: every bundle, newest push first. */
export function listCatalog(): Bundle[] {
  const bundles = db()
    .prepare("SELECT * FROM bundles ORDER BY updated_at DESC, id DESC")
    .all() as BundleRow[];
  const revisions = db().prepare("SELECT * FROM revisions").all() as RevisionRow[];
  const shares = db().prepare("SELECT slug, bundle_id FROM share_links ORDER BY id").all() as {
    slug: string;
    bundle_id: number;
  }[];

  return bundles.map((bundle) => {
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
      shareSlugs: shares.filter((s) => s.bundle_id === bundle.id).map((s) => s.slug),
    };
  });
}

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
 * Create the bundle and its default share link, whose slug is the bundle slug.
 * A push to an unknown slug lands here: the spec chose create-on-push.
 */
export function createBundle(input: {
  slug: string;
  title?: string | null;
  collection?: string | null;
}): BundleRecord {
  const now = nowIso();
  const create = db().transaction(() => {
    const result = db()
      .prepare(
        `INSERT INTO bundles (slug, title, collection, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(input.slug, input.title?.trim() || input.slug, input.collection ?? null, now, now);
    db()
      .prepare("INSERT INTO share_links (slug, bundle_id, created_at) VALUES (?, ?, ?)")
      .run(input.slug, result.lastInsertRowid, now);
    return result.lastInsertRowid as number;
  });
  const id = create();
  return db().prepare("SELECT * FROM bundles WHERE id = ?").get(id) as BundleRow;
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

export type ResolvedShareLink = {
  shareSlug: string;
  bundleSlug: string;
  currentSeq: number;
};

/**
 * Resolve a share slug to the bundle's current revision. Returns null when the
 * share link is unknown or its bundle has never had a successful push, so that
 * a caller cannot tell those two cases apart.
 */
export function resolveShareLink(shareSlug: string): ResolvedShareLink | null {
  const row = db()
    .prepare(
      `SELECT s.slug AS share_slug, b.slug AS bundle_slug, r.seq AS seq
         FROM share_links s
         JOIN bundles b ON b.id = s.bundle_id
         JOIN revisions r ON r.id = b.current_revision_id
        WHERE s.slug = ?`,
    )
    .get(shareSlug) as { share_slug: string; bundle_slug: string; seq: number } | undefined;
  if (!row) return null;
  return { shareSlug: row.share_slug, bundleSlug: row.bundle_slug, currentSeq: row.seq };
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

import fs from "node:fs/promises";
import path from "node:path";
import { deleteRevisionRows, findBundle, revisionRecords } from "@/server/catalog";
import { keepRevisions } from "@/server/config";
import { bundleDir, revisionDir } from "@/server/storage/paths";

/**
 * Keeping the last few pushes of a bundle and throwing the rest away.
 *
 * Old revisions are the one thing here that grows without bound: an agent that
 * regenerates a report nightly leaves a year of dead copies on the disk. The
 * spec left this as an open question and the answer is the last five, with the
 * count set by `HOSTI_KEEP_REVISIONS`.
 *
 * One rule outranks the count: the current revision never goes, whatever the
 * number says. A bundle that answers a link must keep answering it.
 */

export type Pruned = {
  /** Revision numbers still on disk, newest first. */
  kept: number[];
  /** Revision numbers this call removed. */
  removed: number[];
};

/**
 * Prune one bundle down to `keep` revisions. Safe to call on a bundle that has
 * fewer than that, on one nobody has pushed, and twice in a row.
 */
export async function pruneRevisions(
  bundleSlug: string,
  keep: number = keepRevisions(),
): Promise<Pruned> {
  const bundle = findBundle(bundleSlug);
  if (!bundle) return { kept: [], removed: [] };

  const records = revisionRecords(bundle.id);
  const newest = records.slice(0, Math.max(1, keep));
  // The current revision may be older than the newest few, if a push landed
  // while something else held the pointer. It stays either way.
  const doomed = records.filter(
    (record) => !record.current && !newest.some((held) => held.id === record.id),
  );
  if (doomed.length === 0) {
    return { kept: records.map((record) => record.seq), removed: [] };
  }

  deleteRevisionRows(
    bundle.id,
    doomed.map((record) => record.id),
  );

  const removed: number[] = [];
  for (const record of doomed) {
    if (await removeRevisionDir(bundle.slug, record.seq)) removed.push(record.seq);
  }

  return {
    kept: revisionRecords(bundle.id).map((record) => record.seq),
    removed,
  };
}

/**
 * Take one revision directory off the disk.
 *
 * Two guards, because this is the only code in Hosti that deletes inside a
 * bundle. The path must sit directly under the bundle's own directory, and it
 * must be a real directory rather than a link: `current` is a symlink into a
 * sibling, and following one out of the bundle would delete something that was
 * never a revision.
 */
async function removeRevisionDir(bundleSlug: string, seq: number): Promise<boolean> {
  const root = bundleDir(bundleSlug);
  const dir = revisionDir(bundleSlug, seq);
  if (path.dirname(dir) !== root) return false;

  const stat = await fs.lstat(dir).catch(() => null);
  if (!stat) return true; // already gone, and the row went with it
  if (!stat.isDirectory()) return false;

  await fs.rm(dir, { recursive: true, force: true });
  return true;
}

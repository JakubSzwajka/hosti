import fs from "node:fs/promises";
import path from "node:path";
import { deleteRevisionRows, findBundle, revisionRecords } from "@/server/catalog";
import { keepRevisions } from "@/server/config";
import { bundleDir, revisionDir } from "@/server/storage/paths";

export type Pruned = {
  kept: number[];

  removed: number[];
};

export async function pruneRevisions(
  bundleSlug: string,
  keep: number = keepRevisions(),
): Promise<Pruned> {
  const bundle = findBundle(bundleSlug);
  if (!bundle) return { kept: [], removed: [] };

  const records = revisionRecords(bundle.id);
  const newest = records.slice(0, Math.max(1, keep));

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

async function removeRevisionDir(bundleSlug: string, seq: number): Promise<boolean> {
  const root = bundleDir(bundleSlug);
  const dir = revisionDir(bundleSlug, seq);
  if (path.dirname(dir) !== root) return false;

  // Refuse symlinks so pruning never follows `current` outside the revision tree.
  const stat = await fs.lstat(dir).catch(() => null);
  if (!stat) return true;
  if (!stat.isDirectory()) return false;

  await fs.rm(dir, { recursive: true, force: true });
  return true;
}

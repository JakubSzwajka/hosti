import fs from "node:fs/promises";
import path from "node:path";
import { bundlesDir } from "@/server/config";
import { deleteBundle, findBundle } from "@/server/catalog";

/**
 * Forget a bundle completely: metadata, every revision on disk, and the share
 * link it had. Returns false when no bundle has that slug. The rows go first, so a
 * failure halfway through leaves files nobody can reach rather than a bundle
 * whose files have vanished.
 */
export async function removeBundle(slug: string): Promise<boolean> {
  const bundle = findBundle(slug);
  if (!bundle) return false;

  deleteBundle(bundle.id);

  const root = bundlesDir();
  const dir = path.join(root, bundle.slug);
  if (dir.startsWith(root + path.sep)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
  return true;
}

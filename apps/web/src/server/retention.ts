import { pruneRevisions as pruneRevisionsEffect, type Pruned } from "@hosti/bundles";
import { bundlesDir, keepRevisions } from "@/server/config";
import { runBundlesPromise } from "@/server/runtime";

export type { Pruned };

export function pruneRevisions(
  bundleSlug: string,
  keep: number = keepRevisions(),
): Promise<Pruned> {
  return runBundlesPromise(pruneRevisionsEffect({ bundleSlug, bundlesRoot: bundlesDir(), keep }));
}

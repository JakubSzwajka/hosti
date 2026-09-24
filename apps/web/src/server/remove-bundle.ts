import { removeBundle as removeBundleEffect } from "@hosti/bundles";
import { bundlesDir } from "@/server/config";
import { runBundlesPromise } from "@/server/runtime";

export async function removeBundle(slug: string): Promise<boolean> {
  return runBundlesPromise(removeBundleEffect({ slug, bundlesRoot: bundlesDir() }));
}

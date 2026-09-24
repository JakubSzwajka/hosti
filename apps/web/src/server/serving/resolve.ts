import type { Resolution } from "@hosti/serving";
import { runServingPromise } from "@/server/runtime";

export type { Resolution };

export async function resolveBundleRequest(
  root: string,
  sharePrefix: string,
  requestPath: string,
): Promise<Resolution> {
  return runServingPromise((serving) =>
    serving.resolveBundleRequest(root, sharePrefix, requestPath),
  );
}

export async function bundleNotFoundFile(root: string): Promise<string | null> {
  return runServingPromise((serving) => serving.bundleNotFoundFile(root));
}

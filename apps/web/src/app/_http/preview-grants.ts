import type { Bundle } from "@hosti/shared";
import type { PreviewGrant } from "@hosti/serving";
import { runAppUseCase } from "@/app/_http/run-use-case";
import { createPreviewGrant } from "@/use-cases/create-preview-grant";

export async function previewGrants(
  bundles: readonly Bundle[],
): Promise<Map<string, PreviewGrant>> {
  const grants = new Map<string, PreviewGrant>();
  for (const bundle of bundles) {
    if (!bundle.currentRevision) continue;
    grants.set(bundle.slug, await runAppUseCase(createPreviewGrant(bundle.slug)));
  }
  return grants;
}

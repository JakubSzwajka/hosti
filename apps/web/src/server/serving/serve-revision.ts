import { bundleNotFoundFile, resolveBundleRequest } from "@/server/serving/resolve";
import {
  bundleRedirect,
  fileResponse,
  hostiNotFound,
  type ServeOptions,
} from "@/server/serving/respond";

export async function serveFromRevision(
  request: Request,
  root: string,
  target: { prefix: string; requestPath: string },
  options: ServeOptions = {},
): Promise<Response> {
  const search = new URL(request.url).search;
  const resolution = await resolveBundleRequest(root, target.prefix, target.requestPath);

  if (resolution.kind === "redirect") {
    return bundleRedirect(resolution.to + search, options);
  }
  if (resolution.kind === "file") {
    const response = await fileResponse(request, root, resolution.absolutePath, options);
    if (response) return response;
  }

  const own = await bundleNotFoundFile(root);
  if (own) {
    const response = await fileResponse(request, root, own, { ...options, status: 404 });
    if (response) return response;
  }
  return hostiNotFound(options);
}

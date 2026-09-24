import type { ContentSecurityPolicyKind, ServingOutcome } from "@hosti/serving";
import { runServingPromise } from "@/server/runtime";
import {
  bundleRedirect,
  fileResponse,
  hostiNotFound,
  type ServeOptions,
} from "@/server/serving/respond";

function cspKind(options: ServeOptions): ContentSecurityPolicyKind {
  return options.embeddable ? "preview" : "bundle";
}

export async function serveFromRevision(
  request: Request,
  root: string,
  target: { prefix: string; requestPath: string },
  options: ServeOptions = {},
): Promise<Response> {
  const search = new URL(request.url).search;
  const csp = cspKind(options);
  const outcome = await runServingPromise((serving) =>
    serving.decideRevision({
      root,
      prefix: target.prefix,
      requestPath: target.requestPath,
      csp,
      ...(options.status === undefined ? {} : { status: options.status }),
    }),
  );

  if (outcome.kind === "redirect") {
    return bundleRedirect(outcome.to + search, options);
  }

  if (outcome.kind === "file") {
    const response = await respondToFile(request, root, outcome, options);
    if (response) return response;
  }

  const notFound = await runServingPromise((serving) => serving.decideNotFound(root, csp));
  if (notFound.kind === "file") {
    const response = await respondToFile(request, root, notFound, options);
    if (response) return response;
  }
  return hostiNotFound(options);
}

async function respondToFile(
  request: Request,
  root: string,
  outcome: Extract<ServingOutcome, { kind: "file" }>,
  options: ServeOptions,
): Promise<Response | null> {
  return fileResponse(request, root, outcome.absolutePath, { ...options, status: outcome.status });
}

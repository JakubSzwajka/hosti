import { Effect, type FileSystem, type Path } from "effect";
import { contentTypeFor } from "./content-type";
import { bundleNotFoundFile, resolveBundleRequest } from "./resolve";
import type {
  BundleAccessDecision,
  BundleAccessInput,
  ContentSecurityPolicyKind,
  PreviewAccessDecision,
  RevisionDecisionInput,
  ServingOutcome,
} from "./types";

export function decideBundleAccess(input: BundleAccessInput): Effect.Effect<BundleAccessDecision> {
  if (!input.shareExists) return Effect.succeed<BundleAccessDecision>({ kind: "not-found" });
  if (input.pinProtected && !input.unlocked) {
    const decision: BundleAccessDecision = input.canRenderGate
      ? { kind: "gate-required" }
      : { kind: "not-found" };
    return Effect.succeed(decision);
  }
  return Effect.succeed<BundleAccessDecision>({ kind: "serve" });
}

export function decidePreviewAccess(authorized: boolean): Effect.Effect<PreviewAccessDecision> {
  const decision: PreviewAccessDecision = authorized ? { kind: "serve" } : { kind: "not-found" };
  return Effect.succeed(decision);
}

export function decideRevision(
  fs: FileSystem.FileSystem,
  path: Path.Path,
  input: RevisionDecisionInput,
): Effect.Effect<ServingOutcome> {
  return Effect.gen(function* () {
    const resolution = yield* resolveBundleRequest(
      fs,
      path,
      input.root,
      input.prefix,
      input.requestPath,
    );

    if (resolution.kind === "redirect") {
      return { kind: "redirect", to: resolution.to, csp: input.csp };
    }
    if (resolution.kind === "file") {
      return {
        kind: "file",
        absolutePath: resolution.absolutePath,
        contentType: contentTypeFor(path, resolution.absolutePath),
        csp: input.csp,
        status: input.status ?? 200,
      };
    }
    return { kind: "not-found", csp: input.csp };
  });
}

export function decideNotFound(
  fs: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
  csp: ContentSecurityPolicyKind,
): Effect.Effect<ServingOutcome> {
  return bundleNotFoundFile(fs, path, root).pipe(
    Effect.map(
      (absolutePath): ServingOutcome =>
        absolutePath
          ? {
              kind: "file",
              absolutePath,
              contentType: contentTypeFor(path, absolutePath),
              csp,
              status: 404,
            }
          : { kind: "not-found", csp },
    ),
  );
}

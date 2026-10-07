import { IdentityCrypto, type IdentityCryptoError } from "@hosti/identity";
import { Context, Effect, FileSystem, Layer, Path } from "effect";
import { contentTypeFor } from "./content-type";
import {
  decideBundleAccess,
  decideNotFound,
  decidePreviewAccess,
  decideRevision,
} from "./decisions";
import { gatePageHtml } from "./gate-page";
import { makePreviewTokenOperations } from "./preview-token";
import { bundleNotFoundFile, resolveBundleRequest } from "./resolve";
import { makeUnlockOperations } from "./unlock";
import type {
  BundleAccessDecision,
  BundleAccessInput,
  ContentSecurityPolicyKind,
  PreviewAccessDecision,
  PreviewGrant,
  Resolution,
  RevisionDecisionInput,
  ServingOutcome,
  UnlockBinding,
} from "./types";
import type { GatePageInput } from "./gate-page";

export class Serving extends Context.Service<
  Serving,
  {
    contentTypeFor(filePath: string): Effect.Effect<string>;
    gatePageHtml(input: GatePageInput): Effect.Effect<string>;
    signPreviewToken(
      secret: string,
      bundleSlug: string,
      suppliedNow?: number,
    ): Effect.Effect<string, IdentityCryptoError>;
    verifyPreviewToken(
      secret: string,
      bundleSlug: string,
      token: string | null | undefined,
      suppliedNow?: number,
    ): Effect.Effect<boolean, IdentityCryptoError>;
    previewGrant(
      bundleSlug: string,
      secret: string | null,
      suppliedNow?: number,
    ): Effect.Effect<PreviewGrant, IdentityCryptoError>;
    previewUrl(
      bundleSlug: string,
      secret: string | null,
    ): Effect.Effect<string, IdentityCryptoError>;
    unlockCookieName(shareSlug: string): Effect.Effect<string>;
    signUnlock(
      secret: string,
      shareSlug: string,
      binding: UnlockBinding,
      options?: { now?: number; maxAgeSeconds?: number },
    ): Effect.Effect<string, IdentityCryptoError>;
    verifyUnlock(
      secret: string,
      shareSlug: string,
      binding: UnlockBinding,
      value: string | null | undefined,
      suppliedNow?: number,
    ): Effect.Effect<boolean, IdentityCryptoError>;
    resolveBundleRequest(
      root: string,
      sharePrefix: string,
      requestPath: string,
    ): Effect.Effect<Resolution>;
    bundleNotFoundFile(root: string): Effect.Effect<string | null>;
    decideBundleAccess(input: BundleAccessInput): Effect.Effect<BundleAccessDecision>;
    decidePreviewAccess(authorized: boolean): Effect.Effect<PreviewAccessDecision>;
    decideRevision(input: RevisionDecisionInput): Effect.Effect<ServingOutcome>;
    decideNotFound(root: string, csp: ContentSecurityPolicyKind): Effect.Effect<ServingOutcome>;
  }
>()("@hosti/serving/Serving") {
  static readonly layer: Layer.Layer<
    Serving,
    never,
    FileSystem.FileSystem | Path.Path | IdentityCrypto
  > = Layer.effect(
    Serving,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const crypto = yield* IdentityCrypto;
      const previewTokens = makePreviewTokenOperations(crypto);
      const unlock = makeUnlockOperations(crypto);

      return Serving.of({
        contentTypeFor: (filePath) => Effect.succeed(contentTypeFor(path, filePath)),
        gatePageHtml: (input) => Effect.succeed(gatePageHtml(input)),
        ...previewTokens,
        ...unlock,
        resolveBundleRequest: (root, sharePrefix, requestPath) =>
          resolveBundleRequest(fs, path, root, sharePrefix, requestPath),
        bundleNotFoundFile: (root) => bundleNotFoundFile(fs, path, root),
        decideBundleAccess,
        decidePreviewAccess: (authorized) => decidePreviewAccess(authorized),
        decideRevision: (input) => decideRevision(fs, path, input),
        decideNotFound: (root, csp) => decideNotFound(fs, path, root, csp),
      });
    }),
  );
}

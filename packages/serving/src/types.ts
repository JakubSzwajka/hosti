export const PREVIEW_TOKEN_TTL_MS = 30 * 60 * 1000;
export const TOKEN_MARK = "~";
export const UNLOCK_MAX_AGE_SECONDS = 12 * 60 * 60;
export const UNLOCK_COOKIE_PREFIX = "hosti_pin_";

export type PreviewGrant = {
  src: string;
  expiresAt: number | null;
};

export type UnlockBinding = { bundleId: number; pinHash: string };

export type Resolution =
  | { kind: "redirect"; to: string }
  | { kind: "file"; absolutePath: string }
  | { kind: "not-found" };

export type ContentSecurityPolicyKind = "bundle" | "preview";

export type ServingOutcome =
  | {
      kind: "redirect";
      to: string;
      csp: ContentSecurityPolicyKind;
    }
  | {
      kind: "file";
      absolutePath: string;
      contentType: string;
      csp: ContentSecurityPolicyKind;
      status: number;
    }
  | {
      kind: "not-found";
      csp: ContentSecurityPolicyKind;
    };

export type BundleAccessDecision =
  | { kind: "serve" }
  | { kind: "gate-required" }
  | { kind: "not-found" };

export type PreviewAccessDecision = { kind: "serve" } | { kind: "not-found" };

export type RevisionDecisionInput = {
  root: string;
  prefix: string;
  requestPath: string;
  csp: ContentSecurityPolicyKind;
  status?: number;
};

export type BundleAccessInput = {
  shareExists: boolean;
  pinProtected: boolean;
  unlocked: boolean;
  canRenderGate: boolean;
};

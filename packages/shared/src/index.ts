/**
 * Types and constants shared by the Hosti web app and the Hosti CLI.
 * The words here are the ones from CONTEXT.md: bundle, revision, catalog,
 * collection, share link, push token.
 */

export type PushLimits = {
  /** Largest gzipped request body a push may carry. */
  maxCompressedBytes: number;
  /** Largest number of files one revision may hold. */
  maxFiles: number;
  /** Largest single file inside a revision. */
  maxFileBytes: number;
};

export const PUSH_LIMITS: PushLimits = {
  maxCompressedBytes: 50 * 1024 * 1024,
  maxFiles: 2000,
  maxFileBytes: 20 * 1024 * 1024,
};

export const ENTRY_FILE = "index.html";
export const NOT_FOUND_FILE = "404.html";

/** One push of a bundle. */
export type Revision = {
  /** Sequence number inside its bundle, starting at 1. */
  seq: number;
  byteSize: number;
  fileCount: number;
  createdAt: string;
};

/** One static site: the unit a person opens, shares and deletes. */
export type Bundle = {
  slug: string;
  title: string;
  collection: string | null;
  createdAt: string;
  updatedAt: string;
  currentRevision: Revision | null;
  revisionCount: number;
  /** Share slugs pointing at this bundle. Empty while the bundle is private. */
  shareSlugs: string[];
};

/** A public path granting access to one bundle. Revoking it leaves the bundle alone. */
export type ShareLink = {
  slug: string;
  /** The absolute URL a guest opens, trailing slash included. */
  url: string;
  createdAt: string;
  /**
   * Whether a guest must type a PIN first. The PIN itself is hashed, so it is
   * never readable and never travels back out of Hosti.
   */
  hasPin: boolean;
};

/** Body of `GET /api/v1/bundles`: the catalog as JSON. */
export type CatalogResponse = {
  bundles: Bundle[];
};

/**
 * Body of a successful `POST /api/v1/bundles/:slug/revisions`. A push never
 * creates a share link, so `shareUrls` is empty until someone asks for one.
 */
export type PushResponse = {
  bundle: string;
  revision: number;
  /** Where the owner manages the bundle: `/b/<slug>`. */
  adminUrl: string;
  /** Every live share link of this bundle. Empty means private. */
  shareUrls: string[];
};

/** Body of `POST /api/v1/bundles/:slug/share-links`. */
export type ShareLinkResponse = {
  bundle: string;
  link: ShareLink;
};

/** Body of `GET /api/v1/bundles/:slug/share-links`. */
export type ShareLinksResponse = {
  bundle: string;
  links: ShareLink[];
};

/** Body of `DELETE /api/v1/share-links/:shareSlug`. */
export type RevokedShareLinkResponse = {
  shareSlug: string;
  revoked: true;
};

/** Body of `PUT` and `DELETE` on `/api/v1/share-links/:shareSlug/pin`. */
export type SharePinResponse = {
  shareSlug: string;
  hasPin: boolean;
};

/** Body of `DELETE /api/v1/bundles/:slug`. */
export type DeletedBundleResponse = {
  bundle: string;
  deleted: true;
};

/**
 * Body of `POST /api/v1/bundles/:slug/prune`. A push prunes on its own, so
 * this endpoint is for a bundle nobody is pushing any more.
 */
export type PrunedRevisionsResponse = {
  bundle: string;
  /** How many revisions this server keeps, from `HOSTI_KEEP_REVISIONS`. */
  keep: number;
  /** Revision numbers still on disk, newest first. */
  kept: number[];
  /** Revision numbers this call removed. */
  removed: number[];
};

export type ErrorResponse = {
  error: string;
  message: string;
};

/** Slugs live in a URL path segment, so keep them to this shape. */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$|^[a-z0-9]$/;

export function isValidSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}

/**
 * A collection is a flat label on a bundle, never a directory, so the only
 * shapes it cannot take are the ones a URL path segment cannot carry.
 */
export const COLLECTION_MAX_LENGTH = 64;

/** The catalog's path for bundles in no collection, so it cannot name one. */
export const NO_COLLECTION_PATH = "-";

/** What the owner is told when a collection name will not do. */
export const COLLECTION_RULE = `A collection is up to ${COLLECTION_MAX_LENGTH} characters, with no slash, and "${NO_COLLECTION_PATH}" is taken`;

/**
 * Trim a typed collection to what gets stored. Empty means no collection,
 * which is how clearing one arrives. Returns `undefined` for a name Hosti
 * refuses, so a caller can tell "clear it" apart from "that name is wrong".
 */
export function readCollection(value: string): string | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > COLLECTION_MAX_LENGTH) return undefined;
  if (trimmed === NO_COLLECTION_PATH) return undefined;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are exactly what this refuses.
  if (/[/\\\u0000-\u001f\u007f]/.test(trimmed)) return undefined;
  return trimmed;
}

/**
 * A PIN is four to eight digits, always typed by the owner. Hosti never makes
 * one up: a PIN the owner did not choose is a PIN the owner cannot pass on.
 */
export const PIN_PATTERN = /^[0-9]{4,8}$/;

/** What the owner is told when the digits are wrong. Never quotes the PIN. */
export const PIN_RULE = "A pin is four to eight digits and nothing else";

export function isValidPin(value: string): boolean {
  return PIN_PATTERN.test(value);
}

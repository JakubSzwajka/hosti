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
  /** Share slugs pointing at this bundle. The first one defaults to the bundle slug. */
  shareSlugs: string[];
};

/** Body of `GET /api/v1/bundles`: the catalog as JSON. */
export type CatalogResponse = {
  bundles: Bundle[];
};

/** Body of a successful `POST /api/v1/bundles/:slug/revisions`. */
export type PushResponse = {
  bundle: string;
  revision: number;
  url: string;
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

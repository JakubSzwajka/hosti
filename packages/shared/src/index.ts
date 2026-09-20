/**
 * Types and constants shared by the Hosti web app and the Hosti CLI.
 * The words here are the ones from CONTEXT.md: bundle, revision, catalog,
 * collection, share link, sharing state, pin, push token.
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

/**
 * How a bundle is shared. One bundle, one sharing state, at most one link.
 *
 *   private  nothing answers at the share URL, the same 404 as any other miss
 *   link     anyone holding the URL opens the bundle
 *   pin      the URL shows the pin gate, then opens the bundle
 */
export type SharingMode = "private" | "link" | "pin";

export const SHARING_MODES: readonly SharingMode[] = ["private", "link", "pin"] as const;

export function isSharingMode(value: unknown): value is SharingMode {
  return typeof value === "string" && (SHARING_MODES as readonly string[]).includes(value);
}

/** What the caller is told when the mode is not one of the three. */
export const SHARING_MODE_RULE = `A sharing mode is one of ${SHARING_MODES.join(", ")}`;

/** The whole sharing state of one bundle. */
export type SharingState = {
  mode: SharingMode;
  /**
   * The slug the share URL uses. It is the bundle slug until a rotate mints a
   * fresh random one. It is reported whatever the mode, because the owner
   * asking over a push token already knows the bundle.
   */
  shareSlug: string;
  /**
   * Whether a guest must type a pin first. The pin itself is hashed, so it is
   * never readable and never travels back out of Hosti.
   */
  hasPin: boolean;
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
  sharing: SharingState;
};

/** Body of `GET /api/v1/bundles`: the catalog as JSON. */
export type CatalogResponse = {
  bundles: Bundle[];
};

/**
 * Body of a successful `POST /api/v1/bundles/:slug/revisions`. A push never
 * changes the sharing state, so `shareUrl` is null on a bundle that is
 * private, however that bundle arrived.
 */
export type PushResponse = {
  bundle: string;
  revision: number;
  /** Where the owner manages the bundle: `/b/<slug>`. */
  adminUrl: string;
  sharing: SharingState;
  /** The absolute share URL, or null while the bundle is private. */
  shareUrl: string | null;
};

/**
 * Body of `PUT /api/v1/bundles/:slug/sharing` and of
 * `POST /api/v1/bundles/:slug/sharing/rotate`.
 */
export type SharingResponse = {
  bundle: string;
  sharing: SharingState;
  /** The absolute share URL, or null while the bundle is private. */
  shareUrl: string | null;
};

/** Body of `GET /api/v1/bundles/:slug`. */
export type BundleResponse = {
  bundle: Bundle;
  /** The absolute share URL, or null while the bundle is private. */
  shareUrl: string | null;
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

/** How long a slug may be, which is also where a suggested one is cut. */
export const SLUG_MAX_LENGTH = 64;

/** What the owner is told when a typed slug will not do. */
export const SLUG_RULE = `A bundle slug is lowercase letters, digits and dashes, 1 to ${SLUG_MAX_LENGTH} characters`;

/** The file name endings the catalog's drop zone takes. Longest first. */
export const ARCHIVE_EXTENSIONS = [".tar.gz", ".tgz", ".zip"] as const;

export function isArchiveName(name: string): boolean {
  const lower = name.toLowerCase();
  return ARCHIVE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/**
 * The slug a dropped archive suggests: its file name, without the archive
 * extension, cleaned down to what a URL path segment takes. It is only a
 * suggestion, and the owner corrects it before the upload goes anywhere.
 * An empty answer means the file name held nothing usable.
 */
export function slugFromFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const lower = base.toLowerCase();
  const stem = ARCHIVE_EXTENSIONS.reduce(
    (text, extension) => (text.endsWith(extension) ? text.slice(0, -extension.length) : text),
    lower,
  );
  return stem
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/^-+|-+$/g, "");
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
 * A pin is four to eight digits, always typed by the owner. Hosti never makes
 * one up: a pin the owner did not choose is a pin the owner cannot pass on.
 */
export const PIN_PATTERN = /^[0-9]{4,8}$/;

/** What the owner is told when the digits are wrong. Never quotes the pin. */
export const PIN_RULE = "A pin is four to eight digits and nothing else";

export function isValidPin(value: string): boolean {
  return PIN_PATTERN.test(value);
}

/**
 * A rotated share slug. Lowercase letters with the vowels taken out, plus
 * digits that read clearly, so the slug spells nothing and reads back over a
 * phone. It carries no part of the bundle slug: a rotate exists to cut off
 * whoever held the old URL, and a slug that names the bundle hands that back.
 */
export const ROTATED_ALPHABET = "bcdfghjkmnpqrstvwxz23456789";
export const ROTATED_LENGTH = 12;

/** Does this look like a slug a rotate minted rather than a bundle slug? */
export const ROTATED_PATTERN = new RegExp(`^[${ROTATED_ALPHABET}]{${ROTATED_LENGTH}}$`);

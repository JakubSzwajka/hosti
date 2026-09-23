export type PushLimits = {
  maxCompressedBytes: number;
  maxFiles: number;
  maxFileBytes: number;
};

export const PUSH_LIMITS: PushLimits = {
  maxCompressedBytes: 50 * 1024 * 1024,
  maxFiles: 2000,
  maxFileBytes: 20 * 1024 * 1024,
};

export const ENTRY_FILE = "index.html";
export const NOT_FOUND_FILE = "404.html";

export type Revision = {
  seq: number;
  byteSize: number;
  fileCount: number;
  pushedBy: string | null;
  createdAt: string;
};

export type SharingMode = "private" | "link" | "pin";

export const SHARING_MODES: readonly SharingMode[] = ["private", "link", "pin"] as const;

export function isSharingMode(value: unknown): value is SharingMode {
  return typeof value === "string" && (SHARING_MODES as readonly string[]).includes(value);
}

export const SHARING_MODE_RULE = `A sharing mode is one of ${SHARING_MODES.join(", ")}`;

export type SharingState = {
  mode: SharingMode;
  shareSlug: string;
  hasPin: boolean;
};

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

export type CatalogResponse = {
  bundles: Bundle[];
};

export type PushResponse = {
  bundle: string;
  revision: number;
  adminUrl: string;
  sharing: SharingState;
  shareUrl: string | null;
};

export type SharingResponse = {
  bundle: string;
  sharing: SharingState;
  shareUrl: string | null;
};

export type BundleResponse = {
  bundle: Bundle;
  shareUrl: string | null;
};

export type DeletedBundleResponse = {
  bundle: string;
  deleted: true;
};

export type PrunedRevisionsResponse = {
  bundle: string;
  keep: number;
  kept: number[];
  removed: number[];
};

export type ErrorResponse = {
  error: string;
  message: string;
};

export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$|^[a-z0-9]$/;

export function isValidSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}

export const SLUG_MAX_LENGTH = 64;

export const SLUG_RULE = `A bundle slug is lowercase letters, digits and dashes, 1 to ${SLUG_MAX_LENGTH} characters`;

export const ARCHIVE_EXTENSIONS = [".tar.gz", ".tgz", ".zip"] as const;

export function isArchiveName(name: string): boolean {
  const lower = name.toLowerCase();
  return ARCHIVE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

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

export const COLLECTION_MAX_LENGTH = 64;

export const NO_COLLECTION_PATH = "-";

export const COLLECTION_RULE = `A collection is up to ${COLLECTION_MAX_LENGTH} characters, with no slash, and "${NO_COLLECTION_PATH}" is taken`;

export function readCollection(value: string): string | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > COLLECTION_MAX_LENGTH) return undefined;
  if (trimmed === NO_COLLECTION_PATH) return undefined;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are exactly what this refuses.
  if (/[/\\\u0000-\u001f\u007f]/.test(trimmed)) return undefined;
  return trimmed;
}

export const PIN_PATTERN = /^[0-9]{4,8}$/;

export const PIN_RULE = "A pin is four to eight digits and nothing else";

export function isValidPin(value: string): boolean {
  return PIN_PATTERN.test(value);
}

export const ROTATED_ALPHABET = "bcdfghjkmnpqrstvwxz23456789";
export const ROTATED_LENGTH = 12;

export const ROTATED_PATTERN = new RegExp(`^[${ROTATED_ALPHABET}]{${ROTATED_LENGTH}}$`);

import type { ShareLink } from "@hosti/shared";
import { randomInt } from "node:crypto";
import { isValidSlug } from "@hosti/shared";
import { db, nowIso } from "@/server/db";
import { PushError } from "@/server/errors";

type ShareLinkRow = {
  id: number;
  slug: string;
  bundle_id: number;
  created_at: string;
};

/**
 * Lowercase letters with the vowels taken out, plus digits that read clearly.
 * An unlisted slug must not spell anything, so a reader cannot guess the next.
 */
const UNLISTED_ALPHABET = "bcdfghjkmnpqrstvwxz23456789";
const UNLISTED_LENGTH = 8;
const UNLISTED_TRIES = 5;

/** The longest a slug may be, matching SLUG_PATTERN in @hosti/shared. */
const MAX_SLUG_LENGTH = 64;

export function unlistedSuffix(): string {
  let suffix = "";
  for (let i = 0; i < UNLISTED_LENGTH; i += 1) {
    suffix += UNLISTED_ALPHABET[randomInt(UNLISTED_ALPHABET.length)];
  }
  return suffix;
}

function toShareLink(row: ShareLinkRow, baseUrl: string): ShareLink {
  return { slug: row.slug, url: `${baseUrl}/v/${row.slug}/`, createdAt: row.created_at };
}

function insert(slug: string, bundleId: number): ShareLinkRow | null {
  try {
    const result = db()
      .prepare("INSERT INTO share_links (slug, bundle_id, created_at) VALUES (?, ?, ?)")
      .run(slug, bundleId, nowIso());
    return db()
      .prepare("SELECT * FROM share_links WHERE id = ?")
      .get(result.lastInsertRowid as number) as ShareLinkRow;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "SQLITE_CONSTRAINT_UNIQUE" || code === "SQLITE_CONSTRAINT_PRIMARYKEY") return null;
    throw error;
  }
}

/**
 * Open a bundle to the public. The slug defaults to the bundle slug; an
 * unlisted link carries eight random characters instead, so the URL itself is
 * the secret. A bundle may hold several links at once.
 */
export function createShareLink(
  bundle: { id: number; slug: string },
  options: { unlisted?: boolean } = {},
): ShareLinkRow {
  if (!options.unlisted) {
    const row = insert(bundle.slug, bundle.id);
    if (row) return row;
    throw new PushError(
      "share_link_exists",
      `/v/${bundle.slug}/ is already a share link; revoke it or ask for an unlisted one`,
      409,
    );
  }

  for (let attempt = 0; attempt < UNLISTED_TRIES; attempt += 1) {
    const slug = `${bundle.slug}-${unlistedSuffix()}`;
    if (slug.length > MAX_SLUG_LENGTH || !isValidSlug(slug)) {
      throw new PushError(
        "slug_too_long",
        `An unlisted link adds ${UNLISTED_LENGTH + 1} characters, which puts "${slug}" over ${MAX_SLUG_LENGTH}`,
      );
    }
    const row = insert(slug, bundle.id);
    if (row) return row;
  }
  throw new PushError("share_link_exists", "Could not find a free unlisted slug", 409);
}

export function listShareLinks(bundleId: number, baseUrl: string): ShareLink[] {
  const rows = db()
    .prepare("SELECT * FROM share_links WHERE bundle_id = ? ORDER BY id")
    .all(bundleId) as ShareLinkRow[];
  return rows.map((row) => toShareLink(row, baseUrl));
}

export function shareLinkUrls(bundleId: number, baseUrl: string): string[] {
  return listShareLinks(bundleId, baseUrl).map((link) => link.url);
}

export function describeShareLink(row: ShareLinkRow, baseUrl: string): ShareLink {
  return toShareLink(row, baseUrl);
}

/**
 * Kill one share link by its own slug. The bundle, its revisions and its other
 * links are untouched. The row goes rather than gaining a revoked_at stamp, so
 * the slug is free to hand out again; slice 2 owns access history.
 */
export function revokeShareLink(shareSlug: string): boolean {
  const result = db().prepare("DELETE FROM share_links WHERE slug = ?").run(shareSlug);
  return result.changes > 0;
}

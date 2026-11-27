import fs from "node:fs/promises";
import path from "node:path";
import type { SharingResponse } from "@hosti/shared";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tarFixture, useTempDataDir } from "./test-fixtures";

process.env.HOSTI_SECRET = "a-long-random-string-for-tests";

const { push, rotateSharing, setSharing } = await import("./api");
const { createPushToken, hashToken } = await import("./support");

const C4CF256_SCHEMA_VERSION = "4";
const C4CF256_PUSH_SCOPES = ["publish", "share", "delete"];
const C4CF256_BUNDLE_COLUMNS = [
  "id",
  "slug",
  "title",
  "collection",
  "current_revision_id",
  "share_mode",
  "share_slug",
  "pin_hash",
  "created_at",
  "updated_at",
];
const C4CF256_REVISION_COLUMNS = [
  "id",
  "bundle_id",
  "seq",
  "byte_size",
  "file_count",
  "pushed_by",
  "created_at",
];
const C4CF256_READS = {
  schemaVersion: "SELECT value FROM meta WHERE key = 'schema_version'",
  findBundle: "SELECT * FROM bundles WHERE slug = ?",
  listCollections:
    "SELECT DISTINCT collection FROM bundles WHERE collection IS NOT NULL ORDER BY collection",
  nextRevisionSeq: "SELECT COALESCE(MAX(seq), 0) AS max_seq FROM revisions WHERE bundle_id = ?",
  currentRevision: "SELECT current_revision_id FROM bundles WHERE id = ?",
  revisionRecords: "SELECT id, seq FROM revisions WHERE bundle_id = ? ORDER BY seq DESC",
  listRevisions: "SELECT * FROM revisions WHERE bundle_id = ? ORDER BY seq DESC",
  resolveShare: `SELECT b.id AS bundle_id, b.share_slug AS share_slug, b.pin_hash AS pin_hash,
                  b.slug AS bundle_slug, r.seq AS seq
             FROM bundles b
             JOIN revisions r ON r.id = b.current_revision_id
            WHERE b.share_slug = ?
              AND (b.share_mode = 'link' OR (b.share_mode = 'pin' AND b.pin_hash IS NOT NULL))`,
  describeBundle: "SELECT * FROM revisions WHERE bundle_id = ?",
  listCatalogBundles: "SELECT * FROM bundles ORDER BY updated_at DESC, id DESC",
  listCatalogRevisions: "SELECT * FROM revisions",
  pushTokenExists: "SELECT 1 AS found FROM push_tokens WHERE token_hash = ?",
  listPushTokens:
    "SELECT id, name, scopes, created_at, last_used_at FROM push_tokens ORDER BY created_at DESC, id DESC",
  authenticatePush: "SELECT id, name, scopes FROM push_tokens WHERE token_hash = ?",
};

type Row = Record<string, unknown>;

let dataDir: string;
let reader: Database.Database;
let secret: string;
let firstLinkSlug: string;
let rotatedLinkSlug: string;

async function pushed(slug: string, fixture: string, collection?: string): Promise<void> {
  const response = await push(
    secret,
    slug,
    await tarFixture(fixture),
    collection === undefined ? {} : { collection },
  );
  if (response.status !== 201) throw new Error(`push failed: ${await response.text()}`);
}

async function sharingOf(response: Response): Promise<SharingResponse> {
  if (response.status !== 200) throw new Error(`sharing failed: ${await response.text()}`);
  return (await response.json()) as SharingResponse;
}

const get = (sql: string, ...params: unknown[]) =>
  reader.prepare(sql).get(...params) as Row | undefined;
const all = (sql: string, ...params: unknown[]) => reader.prepare(sql).all(...params) as Row[];
const bundle = (slug: string) => {
  const row = get(C4CF256_READS.findBundle, slug);
  if (!row) throw new Error(`missing bundle ${slug}`);
  return row;
};

beforeAll(async () => {
  dataDir = await useTempDataDir();
  secret = createPushToken("c4cf256-reader", ["publish", "share", "delete"]).secret;
  await pushed("contract-link", "multi-page", "guides");
  await pushed("contract-link", "page-with-assets", "guides");
  await pushed("contract-pin", "single-file");
  firstLinkSlug = (await sharingOf(await setSharing(secret, "contract-link", { mode: "link" })))
    .sharing.shareSlug;
  rotatedLinkSlug = (await sharingOf(await rotateSharing(secret, "contract-link"))).sharing
    .shareSlug;
  await sharingOf(await setSharing(secret, "contract-pin", { mode: "pin", pin: "4821" }));
  reader = new Database(path.join(dataDir, "hosti.db"), { readonly: true, fileMustExist: true });
});

afterAll(async () => {
  reader.close();
  await fs.rm(dataDir, { recursive: true, force: true });
});

describe("the c4cf256 release reads what the current writer stores", () => {
  it("keeps the schema version and every bundle and revision column it maps", () => {
    expect(get(C4CF256_READS.schemaVersion)).toEqual({ value: C4CF256_SCHEMA_VERSION });
    for (const row of all(C4CF256_READS.listCatalogBundles)) {
      expect(Object.keys(row)).toEqual(expect.arrayContaining(C4CF256_BUNDLE_COLUMNS));
    }
    for (const row of all(C4CF256_READS.listCatalogRevisions)) {
      expect(Object.keys(row)).toEqual(expect.arrayContaining(C4CF256_REVISION_COLUMNS));
    }
    expect(all(C4CF256_READS.listCatalogBundles).map((row) => row.slug)).toEqual([
      "contract-pin",
      "contract-link",
    ]);
    expect(all(C4CF256_READS.listCollections)).toEqual([{ collection: "guides" }]);
  });

  it("finds the current revision and revision order of a pushed bundle", () => {
    const linked = bundle("contract-link");
    expect(linked).toMatchObject({ title: "contract-link", collection: "guides" });
    expect(get(C4CF256_READS.nextRevisionSeq, linked.id)).toEqual({ max_seq: 2 });
    const revisions = all(C4CF256_READS.revisionRecords, linked.id);
    expect(revisions.map((row) => row.seq)).toEqual([2, 1]);
    expect(get(C4CF256_READS.currentRevision, linked.id)).toEqual({
      current_revision_id: revisions[0]?.id,
    });
    const listed = all(C4CF256_READS.listRevisions, linked.id);
    expect(listed.map((row) => row.seq)).toEqual([2, 1]);
    for (const row of listed) {
      expect(row).toMatchObject({ bundle_id: linked.id, pushed_by: "c4cf256-reader" });
      expect(row.byte_size).toBeGreaterThan(0);
      expect(row.file_count).toBeGreaterThan(0);
    }
    expect(all(C4CF256_READS.describeBundle, linked.id)).toHaveLength(2);
  });

  it("resolves the rotated link and the pinned share, and drops the old link", () => {
    expect(rotatedLinkSlug).not.toBe(firstLinkSlug);
    expect(bundle("contract-link")).toMatchObject({
      share_mode: "link",
      share_slug: rotatedLinkSlug,
      pin_hash: null,
    });
    expect(get(C4CF256_READS.resolveShare, rotatedLinkSlug)).toEqual({
      bundle_id: bundle("contract-link").id,
      share_slug: rotatedLinkSlug,
      pin_hash: null,
      bundle_slug: "contract-link",
      seq: 2,
    });
    expect(get(C4CF256_READS.resolveShare, firstLinkSlug)).toBeUndefined();

    const pinned = bundle("contract-pin");
    expect(pinned.share_mode).toBe("pin");
    expect(get(C4CF256_READS.resolveShare, pinned.share_slug)).toEqual({
      bundle_id: pinned.id,
      share_slug: pinned.share_slug,
      pin_hash: pinned.pin_hash,
      bundle_slug: "contract-pin",
      seq: 1,
    });
    expect(typeof pinned.pin_hash).toBe("string");
  });

  it("authenticates the push token and parses its scopes the c4cf256 way", () => {
    const digest = hashToken(secret);
    expect(get(C4CF256_READS.pushTokenExists, digest)).toEqual({ found: 1 });
    const token = get(C4CF256_READS.authenticatePush, digest);
    expect(token).toMatchObject({ name: "c4cf256-reader" });
    const stored = String(token?.scopes).split(",");
    expect(stored.every((scope) => C4CF256_PUSH_SCOPES.includes(scope))).toBe(true);
    expect([...stored].sort()).toEqual([...C4CF256_PUSH_SCOPES].sort());
    const [listed] = all(C4CF256_READS.listPushTokens);
    expect(listed).toMatchObject({ id: token?.id, name: "c4cf256-reader", scopes: token?.scopes });
    expect(typeof listed?.last_used_at).toBe("string");
  });
});

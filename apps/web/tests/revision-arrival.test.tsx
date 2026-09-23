import fs from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { useTempDataDir } from "./helpers";

const PASSWORD = "the-owner-password";
const SECRET = "a-long-random-string-for-tests";
process.env.HOSTI_OWNER_PASSWORD = PASSWORD;
process.env.HOSTI_SECRET = SECRET;
process.env.HOSTI_PUBLIC_URL = "";

const HOST = "hosti.test";

let signedCookie: string | null = null;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (signedCookie ? { value: signedCookie } : undefined),
  }),
  headers: async () => new Headers({ host: HOST, "x-forwarded-proto": "https" }),
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: () => {} }),
}));

const { createBundle, recordRevision } = await import("@/server/catalog");
const { db } = await import("@/server/db");
const { CATALOG_UPLOAD } = await import("@/server/push-tokens");
const { signSession } = await import("@/server/auth/session");
const BundleDetail = (await import("@/app/b/[slug]/page")).default;

let dataDir: string;

async function pageFor(slug: string, pushedBy: string | null): Promise<string> {
  const bundle = createBundle({ slug, title: slug });
  recordRevision({
    bundleId: bundle.id,
    seq: 1,
    byteSize: 1024,
    fileCount: 2,
    pushedBy: pushedBy ?? "written-before-schema-3",
  });
  if (pushedBy === null) {
    db().prepare("UPDATE revisions SET pushed_by = NULL WHERE bundle_id = ?").run(bundle.id);
  }
  return renderToStaticMarkup(
    await BundleDetail({
      params: Promise.resolve({ slug }),
      searchParams: Promise.resolve({}),
    }),
  );
}

function metaLine(html: string): string {
  return (
    html.match(/<div class="detail-facts">([\s\S]*?)<\/div>\s*<(?:a|span) class="btn"/)?.[1] ?? ""
  );
}

beforeAll(async () => {
  dataDir = await useTempDataDir();
  signedCookie = signSession(SECRET);
});

afterAll(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

describe("how a revision arrived, on the bundle page", () => {
  it("names the push token that wrote it", async () => {
    const html = await pageFor("pushed-one", "laptop");
    expect(metaLine(html)).toContain("pushed by laptop");
  });

  it("says the owner uploaded it when the row holds the marker", async () => {
    const html = await pageFor("dropped-one", CATALOG_UPLOAD);
    expect(metaLine(html)).toContain("uploaded in the catalog");
  });

  it("never renders the marker as itself", async () => {
    const html = await pageFor("dropped-two", CATALOG_UPLOAD);
    expect(html).not.toContain(CATALOG_UPLOAD);
    expect(html).not.toContain("@catalog");
  });

  it("says nothing at all about a revision the migration left blank", async () => {
    const html = await pageFor("from-before", null);
    const meta = metaLine(html);
    expect(meta).toContain("r1");
    expect(meta).not.toContain("uploaded in the catalog");
    expect(meta).not.toContain("pushed by");
    expect(meta).not.toContain("unknown");
  });

  it("drops the separator with the clause, leaving no dangling dot", async () => {
    const blank = metaLine(await pageFor("from-before-two", null));
    const named = metaLine(await pageFor("pushed-two", "ci"));
    const dots = (line: string) => line.split('<span class="dot">').length - 1;
    expect(dots(named)).toBe(dots(blank) + 1);
  });
});

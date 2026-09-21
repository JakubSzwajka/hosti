import fs from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { useTempDataDir } from "./helpers";

/**
 * How the bundle page talks about the way a revision arrived. There are three
 * states and the page must not blur them:
 *
 *   a push token's name   the meta line names the token
 *   the reserved marker   the meta line says the owner uploaded it
 *   nothing on the row    the meta line says nothing at all
 *
 * The third is a revision written before Hosti recorded this, which the
 * migration leaves blank on purpose. The owner's own database holds those, and
 * claiming they were uploaded in the catalog would be a guess dressed as a
 * fact.
 *
 * The page is a server component, so these tests call it the way Next does and
 * read the markup back. `next/headers` only exists inside a request, so it is
 * mocked with the one cookie and the one host the page reads.
 */

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

/**
 * One bundle whose current revision arrived the given way. Returns its HTML.
 * `recordRevision` will not write NULL, so a pre-schema-3 row is made the only
 * way one can exist now: the column is blanked afterwards, which is the state
 * the migration leaves behind.
 */
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

/** The meta line, which is where the arrival clause sits. */
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

import fs from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tarFixture, useTempDataDir } from "./test-fixtures";

const PASSWORD = "the-owner-password";
const SECRET = "a-long-random-string-for-tests";
process.env.HOSTI_OWNER_PASSWORD = PASSWORD;
process.env.HOSTI_SECRET = SECRET;

const ORIGIN = "http://127.0.0.1:3000";

const { push } = await import("./api");
const {
  createPushToken,
  SESSION_COOKIE,
  signSession,
  signPreviewToken,
  previewGrant,
  previewUrl,
  PREVIEW_TOKEN_TTL_MS,
} = await import("./support");
const { GET: PREVIEW } = await import("@/app/b/[slug]/preview/[[...path]]/route");

let dataDir: string;
let pushToken: string;
let cookie: string;

function ask(path: string, headers: HeadersInit = {}): Promise<Response> {
  return PREVIEW(new Request(`${ORIGIN}${path}`, { headers }));
}

const asOwner = () => ({ cookie: `${SESSION_COOKIE}=${cookie}` });

function granted(slug: string, rest = ""): string {
  return `/b/${slug}/preview/~${signPreviewToken(SECRET, slug)}/${rest}`;
}

beforeAll(async () => {
  dataDir = await useTempDataDir();
  pushToken = createPushToken("test").secret;
  cookie = signSession(SECRET);
  const pushed = await push(pushToken, "previewed", await tarFixture("page-with-assets"));
  if (pushed.status !== 201) throw new Error(`push failed: ${await pushed.text()}`);
});

afterAll(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

describe("who may open a preview", () => {
  it("refuses a caller with no admin session and no grant", async () => {
    const response = await ask("/b/previewed/preview/");
    expect(response.status).toBe(404);
  });

  it("refuses a push token, which opens the API and nothing else", async () => {
    const response = await ask("/b/previewed/preview/", {
      authorization: `Bearer ${pushToken}`,
    });
    expect(response.status).toBe(404);
  });

  it("refuses a forged grant, and one signed for another bundle", async () => {
    const forged = await ask("/b/previewed/preview/~mu5t32sp.not-a-real-signature/");
    expect(forged.status).toBe(404);

    const elsewhere = `/b/previewed/preview/~${signPreviewToken(SECRET, "another-bundle")}/`;
    expect((await ask(elsewhere)).status).toBe(404);
  });

  it("refuses a grant that has run out", async () => {
    const stale = signPreviewToken(SECRET, "previewed", Date.now() - PREVIEW_TOKEN_TTL_MS - 1000);
    const response = await ask(`/b/previewed/preview/~${stale}/`);
    expect(response.status).toBe(404);
  });

  it("refuses an unknown bundle, the same way it refuses a stranger", async () => {
    const response = await ask("/b/ghost/preview/", asOwner());
    expect(response.status).toBe(404);
  });
});

describe("what the owner gets", () => {
  it("serves the current revision's entry file", async () => {
    const response = await ask("/b/previewed/preview/", asOwner());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain("<html");
  });

  it("serves the same bytes a guest would get from /v/", async () => {
    const { pushAndShare, serve } = await import("./api");
    const shareSlug = await pushAndShare(
      pushToken,
      "compared",
      await tarFixture("page-with-assets"),
    );
    const guest = await serve(`/v/${shareSlug}/styles.css`);
    const owner = await ask(`/b/compared/preview/styles.css`, asOwner());
    expect(owner.status).toBe(guest.status);
    expect(await owner.text()).toBe(await guest.text());
  });

  it("opens on the grant alone, which is what the sandboxed frame has", async () => {
    const page = await ask(granted("previewed"));
    expect(page.status).toBe(200);

    // The point of putting the grant in the path: a relative asset inherits it.
    const asset = await ask(granted("previewed", "styles.css"));
    expect(asset.status).toBe(200);
    expect(await asset.text()).toContain("body");
  });

  it("redirects the bare path so relative links resolve", async () => {
    const response = await ask("/b/previewed/preview", asOwner());
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("/b/previewed/preview/");
  });

  it("lets the catalog frame it, and only the catalog", async () => {
    const response = await ask("/b/previewed/preview/", asOwner());
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'self'");
  });

  it("leaves the guest route framed by nobody", async () => {
    const { pushAndShare, serve } = await import("./api");
    const shareSlug = await pushAndShare(pushToken, "still-boxed", await tarFixture("single-file"));
    const response = await serve(`/v/${shareSlug}/`);
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });

  it("stays inside the revision when an encoded path climbs out", async () => {
    // Encoded, so the URL parser does not flatten it before the route sees it.
    const response = await ask("/b/previewed/preview/%2e%2e/%2e%2e/hosti.db", asOwner());
    expect(response.status).toBe(404);
  });
});

describe("the url the catalog renders", () => {
  it("carries a grant that opens that bundle", async () => {
    const url = previewUrl("previewed");
    expect(url.startsWith("/b/previewed/preview/~")).toBe(true);
    expect((await ask(url)).status).toBe(200);
  });

  it("says when the grant dies, so a card can decline a frame that would fail", async () => {
    const now = Date.now();
    const grant = previewGrant("previewed", now);
    expect(grant.expiresAt).toBe(now + PREVIEW_TOKEN_TTL_MS);

    expect((await ask(grant.src, asOwner())).status).toBe(200);
    const dead = previewGrant("previewed", now - PREVIEW_TOKEN_TTL_MS - 1);
    expect((await ask(dead.src)).status).toBe(404);
  });
});

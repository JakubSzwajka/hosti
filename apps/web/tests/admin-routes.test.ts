import fs from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tarFixture, useTempDataDir } from "./helpers";

const PASSWORD = "the-owner-password";
const SECRET = "a-long-random-string-for-tests";
process.env.HOSTI_OWNER_PASSWORD = PASSWORD;
process.env.HOSTI_SECRET = SECRET;

const ORIGIN = "http://127.0.0.1:3000";

const { push } = await import("./api");
const { createPushToken } = await import("@/server/push-tokens");
const { findBundle, listRevisions } = await import("@/server/catalog");
const { listShareLinks } = await import("@/server/share-links");
const { SESSION_COOKIE, mutationToken, signSession, verifySession } = await import(
  "@/server/auth/session"
);
const { POST: LOGIN } = await import("@/app/login/submit/route");
const { POST: LOGOUT } = await import("@/app/logout/route");
const { POST: CREATE_LINK } = await import("@/app/b/[slug]/share-links/route");
const { POST: REVOKE_LINK } = await import("@/app/b/[slug]/share-links/revoke/route");
const { POST: DELETE_BUNDLE } = await import("@/app/b/[slug]/delete/route");
const { GET: LIST_BUNDLES } = await import("@/app/api/v1/bundles/route");

let dataDir: string;
let pushToken: string;
let cookie: string;
let token: string;

function form(fields: Record<string, string>): URLSearchParams {
  return new URLSearchParams(fields);
}

function post(path: string, body: URLSearchParams, withCookie = true): Request {
  const headers = new Headers({ "content-type": "application/x-www-form-urlencoded" });
  if (withCookie) headers.set("cookie", `${SESSION_COOKIE}=${cookie}`);
  return new Request(`${ORIGIN}${path}`, { method: "POST", headers, body });
}

function params(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

beforeAll(async () => {
  dataDir = await useTempDataDir();
  pushToken = createPushToken("test").secret;
  cookie = signSession(SECRET);
  const session = verifySession(SECRET, cookie);
  if (!session) throw new Error("session should verify");
  token = mutationToken(SECRET, session);
});

afterAll(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

async function pushed(slug: string, fixture = "multi-page"): Promise<void> {
  const response = await push(pushToken, slug, await tarFixture(fixture));
  if (response.status !== 201) throw new Error(`push failed: ${await response.text()}`);
}

describe("the login form", () => {
  it("sends the owner to the catalog with a signed cookie", async () => {
    const response = await LOGIN(post("/login/submit", form({ password: PASSWORD }), false));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/");
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    expect(setCookie).toContain("HttpOnly");
    const value = setCookie.slice(setCookie.indexOf("=") + 1).split(";")[0] as string;
    expect(verifySession(SECRET, value)).not.toBeNull();
  });

  it("sends a wrong password back with an error and no cookie", async () => {
    const response = await LOGIN(post("/login/submit", form({ password: "nope" }), false));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/login?error=bad");
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

describe("logging out", () => {
  it("expires the cookie and needs the mutation token", async () => {
    const refused = await LOGOUT(post("/logout", form({})));
    expect(refused.status).toBe(403);

    const response = await LOGOUT(post("/logout", form({ token })));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/login");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});

describe("creating a share link from the catalog", () => {
  it("refuses a caller with no admin session", async () => {
    await pushed("from-ui");
    const response = await CREATE_LINK(
      post("/b/from-ui/share-links", form({ token }), false),
      params("from-ui"),
    );
    expect(response.status).toBe(401);
    const bundle = findBundle("from-ui");
    expect(listShareLinks(bundle?.id ?? 0, ORIGIN)).toEqual([]);
  });

  it("refuses a session with a missing or wrong mutation token", async () => {
    const missing = await CREATE_LINK(post("/b/from-ui/share-links", form({})), params("from-ui"));
    expect(missing.status).toBe(403);
    const wrong = await CREATE_LINK(
      post("/b/from-ui/share-links", form({ token: "guessed" })),
      params("from-ui"),
    );
    expect(wrong.status).toBe(403);
    const bundle = findBundle("from-ui");
    expect(listShareLinks(bundle?.id ?? 0, ORIGIN)).toEqual([]);
  });

  it("opens the bundle slug when the token matches", async () => {
    const response = await CREATE_LINK(
      post("/b/from-ui/share-links", form({ token })),
      params("from-ui"),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/b/from-ui");
    const bundle = findBundle("from-ui");
    expect(listShareLinks(bundle?.id ?? 0, ORIGIN).map((link) => link.slug)).toEqual(["from-ui"]);
  });

  it("names an unlisted link with eight extra characters", async () => {
    await CREATE_LINK(
      post("/b/from-ui/share-links", form({ token, unlisted: "1" })),
      params("from-ui"),
    );
    const bundle = findBundle("from-ui");
    const slugs = listShareLinks(bundle?.id ?? 0, ORIGIN).map((link) => link.slug);
    expect(slugs).toHaveLength(2);
    expect(slugs[1]).toMatch(/^from-ui-[bcdfghjkmnpqrstvwxz2-9]{8}$/);
  });

  it("says so when the bundle slug is already a share link", async () => {
    const response = await CREATE_LINK(
      post("/b/from-ui/share-links", form({ token })),
      params("from-ui"),
    );
    expect(response.headers.get("location")).toBe("/b/from-ui?share=share_link_exists");
  });

  it("refuses an unknown bundle", async () => {
    const response = await CREATE_LINK(
      post("/b/ghost/share-links", form({ token })),
      params("ghost"),
    );
    expect(response.status).toBe(404);
  });
});

describe("revoking from the catalog", () => {
  it("needs the token and only touches this bundle's own links", async () => {
    await pushed("other-bundle");
    await CREATE_LINK(post("/b/other-bundle/share-links", form({ token })), params("other-bundle"));

    const refused = await REVOKE_LINK(
      post("/b/from-ui/share-links/revoke", form({ shareSlug: "from-ui" })),
      params("from-ui"),
    );
    expect(refused.status).toBe(403);

    const foreign = await REVOKE_LINK(
      post("/b/from-ui/share-links/revoke", form({ token, shareSlug: "other-bundle" })),
      params("from-ui"),
    );
    expect(foreign.status).toBe(404);
    expect(listShareLinks(findBundle("other-bundle")?.id ?? 0, ORIGIN)).toHaveLength(1);

    const response = await REVOKE_LINK(
      post("/b/from-ui/share-links/revoke", form({ token, shareSlug: "from-ui" })),
      params("from-ui"),
    );
    expect(response.status).toBe(303);
    const left = listShareLinks(findBundle("from-ui")?.id ?? 0, ORIGIN);
    expect(left.map((link) => link.slug)).not.toContain("from-ui");
  });
});

describe("deleting from the catalog", () => {
  it("needs the token, then takes the bundle off the catalog", async () => {
    await pushed("doomed");
    const refused = await DELETE_BUNDLE(post("/b/doomed/delete", form({})), params("doomed"));
    expect(refused.status).toBe(403);
    expect(findBundle("doomed")).not.toBeNull();

    const response = await DELETE_BUNDLE(
      post("/b/doomed/delete", form({ token })),
      params("doomed"),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/");
    expect(findBundle("doomed")).toBeNull();
  });
});

describe("the push API stays bearer-only", () => {
  it("refuses an admin cookie", async () => {
    const response = await LIST_BUNDLES(
      new Request(`${ORIGIN}/api/v1/bundles`, {
        headers: { cookie: `${SESSION_COOKIE}=${cookie}` },
      }),
    );
    expect(response.status).toBe(401);
  });
});

describe("the revision list a bundle page shows", () => {
  it("returns newest first and marks the current one", async () => {
    await pushed("history");
    await pushed("history", "page-with-assets");
    const bundle = findBundle("history");
    const revisions = listRevisions(bundle?.id ?? 0);
    expect(revisions.map((revision) => revision.seq)).toEqual([2, 1]);
    expect(revisions.map((revision) => revision.current)).toEqual([true, false]);
    expect(revisions[0]?.fileCount).toBeGreaterThan(0);
    expect(revisions[0]?.byteSize).toBeGreaterThan(0);
  });

  it("returns nothing for an unknown bundle", () => {
    expect(listRevisions(99_999)).toEqual([]);
  });
});

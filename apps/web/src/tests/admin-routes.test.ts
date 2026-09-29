import fs from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tarFixture, useTempDataDir } from "./test-fixtures";

const PASSWORD = "the-owner-password";
const SECRET = "a-long-random-string-for-tests";
process.env.HOSTI_OWNER_PASSWORD = PASSWORD;
process.env.HOSTI_SECRET = SECRET;

const ORIGIN = "http://127.0.0.1:3000";

const { push, serve } = await import("./api");
const { createPushToken, findBundle, listRevisions, describeSharing } = await import("./support");
const { SESSION_COOKIE, mutationToken, signSession, verifySession } = await import("./support");
const { POST: LOGIN } = await import("@/app/login/submit/route");
const { POST: LOGOUT } = await import("@/app/logout/route");
const { POST: SET_SHARING } = await import("@/app/b/[slug]/sharing/route");
const { POST: ROTATE } = await import("@/app/b/[slug]/sharing/rotate/route");
const { POST: DELETE_BUNDLE } = await import("@/app/b/[slug]/delete/route");
const { GET: LIST_BUNDLES } = await import("@/app/api/v1/bundles/route");

function sharingOf(slug: string) {
  const bundle = findBundle(slug);
  if (!bundle) throw new Error(`no bundle ${slug}`);
  return describeSharing(bundle);
}

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

describe("setting the sharing state from the catalog", () => {
  it("refuses a caller with no admin session", async () => {
    await pushed("from-ui");
    const response = await SET_SHARING(
      post("/b/from-ui/sharing", form({ token, mode: "link" }), false),
      params("from-ui"),
    );
    expect(response.status).toBe(401);
    expect(sharingOf("from-ui").mode).toBe("private");
  });

  it("refuses a session with a missing or wrong mutation token", async () => {
    const missing = await SET_SHARING(
      post("/b/from-ui/sharing", form({ mode: "link" })),
      params("from-ui"),
    );
    expect(missing.status).toBe(403);
    const wrong = await SET_SHARING(
      post("/b/from-ui/sharing", form({ token: "guessed", mode: "link" })),
      params("from-ui"),
    );
    expect(wrong.status).toBe(403);
    expect(sharingOf("from-ui").mode).toBe("private");
  });

  it("opens the bundle slug when the token matches", async () => {
    const response = await SET_SHARING(
      post("/b/from-ui/sharing", form({ token, mode: "link" })),
      params("from-ui"),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/b/from-ui");
    expect(sharingOf("from-ui")).toMatchObject({ mode: "link", shareSlug: "from-ui" });
    expect((await serve("/v/from-ui/")).status).toBe(200);
  });

  it("puts a pin on, then clears it on the way back to private", async () => {
    await SET_SHARING(
      post("/b/from-ui/sharing", form({ token, mode: "pin", pin: "4821" })),
      params("from-ui"),
    );
    expect(sharingOf("from-ui")).toMatchObject({ mode: "pin", hasPin: true });

    await SET_SHARING(
      post("/b/from-ui/sharing", form({ token, mode: "private" })),
      params("from-ui"),
    );
    expect(sharingOf("from-ui")).toMatchObject({ mode: "private", hasPin: false });
    expect((await serve("/v/from-ui/")).status).toBe(404);
  });

  it("sends a refusal back to the bundle page and changes nothing", async () => {
    const noPin = await SET_SHARING(
      post("/b/from-ui/sharing", form({ token, mode: "pin" })),
      params("from-ui"),
    );
    expect(noPin.headers.get("location")).toBe("/b/from-ui?share=pin_required");
    expect(sharingOf("from-ui").mode).toBe("private");

    const badMode = await SET_SHARING(
      post("/b/from-ui/sharing", form({ token, mode: "unlisted" })),
      params("from-ui"),
    );
    expect(badMode.headers.get("location")).toBe("/b/from-ui?share=bad_mode");
    expect(sharingOf("from-ui").mode).toBe("private");
  });

  it("says so when a pin is typed next to another mode, rather than dropping it", async () => {
    for (const mode of ["link", "private"]) {
      const response = await SET_SHARING(
        post("/b/from-ui/sharing", form({ token, mode, pin: "4821" })),
        params("from-ui"),
      );
      expect(response.headers.get("location")).toBe("/b/from-ui?share=pin_not_wanted");
    }
    expect(sharingOf("from-ui")).toMatchObject({ mode: "private", hasPin: false });
  });

  it("says so when the digits are wrong, rather than saving the mode alone", async () => {
    const response = await SET_SHARING(
      post("/b/from-ui/sharing", form({ token, mode: "link", pin: "12ab" })),
      params("from-ui"),
    );
    expect(response.headers.get("location")).toBe("/b/from-ui?share=bad_pin");
    expect(sharingOf("from-ui").mode).toBe("private");
  });

  it("still takes an empty pin field as no pin, because the form always sends it", async () => {
    const response = await SET_SHARING(
      post("/b/from-ui/sharing", form({ token, mode: "link", pin: "" })),
      params("from-ui"),
    );
    expect(response.headers.get("location")).toBe("/b/from-ui");
    expect(sharingOf("from-ui")).toMatchObject({ mode: "link", hasPin: false });
  });

  it("refuses an unknown bundle", async () => {
    const response = await SET_SHARING(
      post("/b/ghost/sharing", form({ token, mode: "link" })),
      params("ghost"),
    );
    expect(response.status).toBe(404);
  });
});

describe("rotating from the catalog", () => {
  it("needs the token, then changes the slug and only this bundle's", async () => {
    await pushed("other-bundle");
    await SET_SHARING(
      post("/b/other-bundle/sharing", form({ token, mode: "link" })),
      params("other-bundle"),
    );
    await SET_SHARING(post("/b/from-ui/sharing", form({ token, mode: "link" })), params("from-ui"));

    const refused = await ROTATE(post("/b/from-ui/sharing/rotate", form({})), params("from-ui"));
    expect(refused.status).toBe(403);
    expect(sharingOf("from-ui").shareSlug).toBe("from-ui");

    const response = await ROTATE(
      post("/b/from-ui/sharing/rotate", form({ token })),
      params("from-ui"),
    );
    expect(response.status).toBe(303);
    const rotated = sharingOf("from-ui");
    expect(rotated.shareSlug).not.toBe("from-ui");
    expect(rotated.mode).toBe("link");
    expect((await serve("/v/from-ui/")).status).toBe(404);
    expect((await serve(`/v/${rotated.shareSlug}/`)).status).toBe(200);
    // The other bundle is untouched.
    expect(sharingOf("other-bundle").shareSlug).toBe("other-bundle");
  });

  it("refuses an unknown bundle", async () => {
    const response = await ROTATE(
      post("/b/ghost/sharing/rotate", form({ token })),
      params("ghost"),
    );
    expect(response.status).toBe(404);
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

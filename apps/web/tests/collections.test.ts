import fs from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tarFixture, useTempDataDir } from "./helpers";

const PASSWORD = "the-owner-password";
const SECRET = "a-long-random-string-for-tests";
process.env.HOSTI_OWNER_PASSWORD = PASSWORD;
process.env.HOSTI_SECRET = SECRET;

const ORIGIN = "http://127.0.0.1:3000";

const { push } = await import("./api");
const { createPushToken, findBundle, listCatalog, listCollections } = await import("./support");
const { collectionChips, NO_COLLECTION } = await import("@/app/_ui/format");
const { SESSION_COOKIE, mutationToken, signSession, verifySession } = await import("./support");
const { POST: SET_COLLECTION } = await import("@/app/b/[slug]/collection/route");

let dataDir: string;
let pushToken: string;
let cookie: string;
let token: string;

function post(slug: string, fields: Record<string, string>, withCookie = true): Promise<Response> {
  const headers = new Headers({ "content-type": "application/x-www-form-urlencoded" });
  if (withCookie) headers.set("cookie", `${SESSION_COOKIE}=${cookie}`);
  const request = new Request(`${ORIGIN}/b/${slug}/collection`, {
    method: "POST",
    headers,
    body: new URLSearchParams(fields),
  });
  return SET_COLLECTION(request, { params: Promise.resolve({ slug }) });
}

const collectionOf = (slug: string) => findBundle(slug)?.collection ?? null;

function chipCount(name: string): number {
  const chip = collectionChips(listCatalog()).find((entry) => entry.name === name);
  return chip?.count ?? 0;
}

beforeAll(async () => {
  dataDir = await useTempDataDir();
  pushToken = createPushToken("test").secret;
  cookie = signSession(SECRET);
  const session = verifySession(SECRET, cookie);
  if (!session) throw new Error("session should verify");
  token = mutationToken(SECRET, session);

  const body = await tarFixture("single-file");
  for (const slug of ["filed", "loose", "also-loose"]) {
    const response = await push(pushToken, slug, body);
    if (response.status !== 201) throw new Error(`push failed: ${await response.text()}`);
  }
});

afterAll(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

describe("who may move a bundle", () => {
  it("refuses a caller with no admin session", async () => {
    const response = await post("filed", { token, collection: "reports" }, false);
    expect(response.status).toBe(401);
    expect(collectionOf("filed")).toBeNull();
  });

  it("refuses a session with no mutation token", async () => {
    const response = await post("filed", { collection: "reports" });
    expect(response.status).toBe(403);
    expect(collectionOf("filed")).toBeNull();
  });

  it("refuses an unknown bundle", async () => {
    const response = await post("ghost", { token, collection: "reports" });
    expect(response.status).toBe(404);
  });
});

describe("setting, changing and clearing", () => {
  it("puts a loose bundle in a collection", async () => {
    const response = await post("filed", { token, collection: "reports" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/b/filed");
    expect(collectionOf("filed")).toBe("reports");
  });

  it("moves it to another one", async () => {
    await post("filed", { token, collection: "garmin" });
    expect(collectionOf("filed")).toBe("garmin");
    expect(listCollections()).toEqual(["garmin"]);
  });

  it("trims what was typed", async () => {
    await post("filed", { token, collection: "  reports  " });
    expect(collectionOf("filed")).toBe("reports");
  });

  it("clears it, which is the only way out of every collection", async () => {
    const response = await post("filed", { token, clear: "1", collection: "reports" });
    expect(response.status).toBe(303);
    expect(collectionOf("filed")).toBeNull();
    expect(listCollections()).toEqual([]);
  });

  it("reads an empty field as no collection", async () => {
    await post("filed", { token, collection: "reports" });
    await post("filed", { token, collection: "   " });
    expect(collectionOf("filed")).toBeNull();
  });

  it("opens the new collection follow-up without changing the bundle", async () => {
    const response = await post("filed", { token, collection: "__new" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/b/filed?collection=new");
    expect(collectionOf("filed")).toBeNull();
  });

  it("clears from an empty field with no clear flag", async () => {
    await post("filed", { token, collection: "reports" });
    const response = await post("filed", { token, collection: "" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/b/filed");
    expect(collectionOf("filed")).toBeNull();
  });

  it("still refuses an empty field with no mutation token", async () => {
    await post("filed", { token, collection: "reports" });
    const response = await post("filed", { collection: "" });
    expect(response.status).toBe(403);
    expect(collectionOf("filed")).toBe("reports");
    await post("filed", { token, collection: "" });
  });
});

describe("names Hosti will not take", () => {
  it("refuses the path the no-collection chip already uses", async () => {
    const response = await post("filed", { token, collection: NO_COLLECTION });
    expect(response.headers.get("location")).toBe("/b/filed?collection=bad_collection");
    expect(collectionOf("filed")).toBeNull();
  });

  it("refuses a slash, which would read as a tree", async () => {
    const response = await post("filed", { token, collection: "reports/2026" });
    expect(response.headers.get("location")).toBe("/b/filed?collection=bad_collection");
    expect(collectionOf("filed")).toBeNull();
  });

  it("refuses one past the length limit", async () => {
    const response = await post("filed", { token, collection: "r".repeat(65) });
    expect(response.headers.get("location")).toBe("/b/filed?collection=bad_collection");
    expect(collectionOf("filed")).toBeNull();
  });
});

describe("what the chips say afterwards", () => {
  it("counts a filed bundle under its collection", async () => {
    await post("filed", { token, collection: "reports" });
    expect(chipCount("reports")).toBe(1);
    expect(chipCount("no collection")).toBe(2);
  });

  it("puts a cleared bundle in the no collection chip", async () => {
    await post("filed", { token, clear: "1" });
    expect(chipCount("no collection")).toBe(3);
    expect(collectionChips(listCatalog()).map((chip) => chip.name)).toEqual([
      "all bundles",
      "no collection",
    ]);
  });

  it("drops a collection's chip once nothing carries it", async () => {
    await post("loose", { token, collection: "orphaned" });
    expect(chipCount("orphaned")).toBe(1);

    await post("loose", { token, clear: "1" });
    expect(chipCount("orphaned")).toBe(0);
    expect(listCollections()).toEqual([]);
  });
});

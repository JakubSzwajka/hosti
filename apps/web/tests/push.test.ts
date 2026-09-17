import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeTar, tarFixture, useTempDataDir } from "./helpers";

const { GET } = await import("@/app/api/v1/bundles/route");
const { POST } = await import("@/app/api/v1/bundles/[slug]/revisions/route");
const { createPushToken } = await import("@/server/push-tokens");

let dataDir: string;
let token: string;

async function push(
  slug: string,
  body: Buffer,
  init: { token?: string; title?: string; collection?: string } = {},
): Promise<Response> {
  const headers = new Headers({
    Authorization: `Bearer ${init.token ?? token}`,
    "Content-Type": "application/gzip",
  });
  if (init.title) headers.set("X-Hosti-Title", init.title);
  if (init.collection) headers.set("X-Hosti-Collection", init.collection);
  const request = new Request(`http://localhost:3000/api/v1/bundles/${slug}/revisions`, {
    method: "POST",
    headers,
    body: new Uint8Array(body),
  });
  return POST(request, { params: Promise.resolve({ slug }) });
}

function exists(target: string): Promise<boolean> {
  return fs.stat(target).then(
    () => true,
    () => false,
  );
}

beforeAll(async () => {
  dataDir = await useTempDataDir();
  token = createPushToken("test").secret;
});

afterAll(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

describe("push token auth", () => {
  it("refuses a bad bearer", async () => {
    const response = await push("nope", await tarFixture("multi-page"), { token: "hosti_wrong" });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "unauthorized" });
  });

  it("refuses a missing header on the catalog", async () => {
    const response = await GET(new Request("http://localhost:3000/api/v1/bundles"));
    expect(response.status).toBe(401);
  });
});

describe("the three bundle shapes", () => {
  it("stores many pages, keeping the tree", async () => {
    const response = await push("squad-2026", await tarFixture("multi-page"), {
      title: "Squad 2026",
      collection: "reports",
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      bundle: "squad-2026",
      revision: 1,
      url: "http://localhost:3000/v/squad-2026/",
    });
    const root = path.join(dataDir, "bundles/squad-2026/r1");
    expect(await exists(path.join(root, "index.html"))).toBe(true);
    expect(await exists(path.join(root, "athletes/index.html"))).toBe(true);
    expect(await exists(path.join(root, "assets/chart.js"))).toBe(true);
  });

  it("stores one page plus its assets", async () => {
    const response = await push("garmin-q3", await tarFixture("page-with-assets"));
    expect(response.status).toBe(201);
    const root = path.join(dataDir, "bundles/garmin-q3/r1");
    expect(await exists(path.join(root, "styles.css"))).toBe(true);
    expect(await exists(path.join(root, "data/2026.json"))).toBe(true);
  });

  it("stores a lone HTML file as index.html", async () => {
    const response = await push("sleep-note", await tarFixture("single-file"));
    expect(response.status).toBe(201);
    const root = path.join(dataDir, "bundles/sleep-note/r1");
    expect(await exists(path.join(root, "index.html"))).toBe(true);
    expect(await exists(path.join(root, "sleep-note.html"))).toBe(false);
  });
});

describe("revisions", () => {
  it("numbers each push and moves current, keeping the old revision", async () => {
    await push("rev-walk", await tarFixture("multi-page"));
    const second = await push("rev-walk", await tarFixture("page-with-assets"));
    expect(await second.json()).toMatchObject({ revision: 2 });

    const bundle = path.join(dataDir, "bundles/rev-walk");
    expect(await fs.readlink(path.join(bundle, "current"))).toBe("r2");
    expect(await exists(path.join(bundle, "r1/athletes/index.html"))).toBe(true);
  });

  it("leaves current untouched when a later push is refused", async () => {
    await push("keeper", await tarFixture("multi-page"));
    const bad = await push("keeper", await tarFixture("no-entry-file"));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: "no_entry_file" });

    const bundle = path.join(dataDir, "bundles/keeper");
    expect(await fs.readlink(path.join(bundle, "current"))).toBe("r1");
    expect(await exists(path.join(bundle, "r2"))).toBe(false);
  });
});

describe("refused pushes", () => {
  it("names what it found when there is no entry file", async () => {
    const response = await push("docs-only", await tarFixture("no-entry-file"));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { message: string };
    expect(body.message).toContain("notes.txt");
    expect(await exists(path.join(dataDir, "bundles/docs-only/r1"))).toBe(false);
  });

  it("refuses a tarball that climbs out of the bundle", async () => {
    const evil = makeTar([
      { name: "index.html", content: "<h1>bait</h1>" },
      { name: "../../escape.html", content: "<h1>owned</h1>" },
    ]);
    const response = await push("traversal", evil);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "unsafe_path" });
    expect(await exists(path.join(dataDir, "bundles/traversal/r1"))).toBe(false);
    expect(await exists(path.join(dataDir, "escape.html"))).toBe(false);
  });

  it("refuses an absolute path", async () => {
    const response = await push(
      "absolute",
      makeTar([{ name: "/etc/passwd", content: "root:x:0:0" }]),
    );
    expect(await response.json()).toMatchObject({ error: "unsafe_path" });
  });

  it("refuses a symlink entry", async () => {
    const response = await push(
      "linky",
      makeTar([
        { name: "index.html", content: "<h1>hi</h1>" },
        { name: "secrets", type: "symlink", linkname: "/etc/passwd" },
      ]),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "unsafe_entry" });
  });

  it("refuses a device node", async () => {
    const response = await push(
      "device",
      makeTar([
        { name: "index.html", content: "<h1>hi</h1>" },
        { name: "urandom", type: "character-device" },
      ]),
    );
    expect(await response.json()).toMatchObject({ error: "unsafe_entry" });
  });

  it("refuses a file over the single-file limit", async () => {
    const response = await push(
      "huge",
      makeTar([
        { name: "index.html", content: "<h1>hi</h1>" },
        { name: "big.bin", content: "x", declaredSize: 21 * 1024 * 1024 },
      ]),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "file_too_large" });
    expect(await exists(path.join(dataDir, "bundles/huge/r1"))).toBe(false);
  });

  it("refuses an unusable slug", async () => {
    const response = await push("Not A Slug", await tarFixture("multi-page"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "bad_slug" });
  });
});

describe("the catalog as JSON", () => {
  it("lists bundles with their current revision", async () => {
    const response = await GET(
      new Request("http://localhost:3000/api/v1/bundles", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      bundles: { slug: string; title: string; collection: string | null; shareSlugs: string[] }[];
    };
    const squad = body.bundles.find((bundle) => bundle.slug === "squad-2026");
    expect(squad).toMatchObject({
      title: "Squad 2026",
      collection: "reports",
      shareSlugs: ["squad-2026"],
    });
  });
});

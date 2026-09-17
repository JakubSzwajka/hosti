import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeZip, tarFixture, useTempDataDir, zipFixture } from "./helpers";

/**
 * The catalog's own way in. The owner drops an archive on the grid and it
 * lands as a bundle, under the admin session and the mutation token every
 * other change the catalog makes carries. No push token, no public endpoint.
 */

const PASSWORD = "the-owner-password";
const SECRET = "a-long-random-string-for-tests";
process.env.HOSTI_OWNER_PASSWORD = PASSWORD;
process.env.HOSTI_SECRET = SECRET;

const ORIGIN = "http://127.0.0.1:3000";

const { findBundle, listRevisions } = await import("@/server/catalog");
const { SESSION_COOKIE, mutationToken, signSession, verifySession } = await import(
  "@/server/auth/session"
);
const { POST: UPLOAD } = await import("@/app/upload/route");

let dataDir: string;
let cookie: string;
let token: string;

type Fields = {
  slug?: string;
  title?: string;
  collection?: string;
  token?: string;
  file?: { name: string; bytes: Buffer };
};

function upload(fields: Fields, withCookie = true): Promise<Response> {
  const body = new FormData();
  if (fields.token !== undefined) body.set("token", fields.token);
  if (fields.slug !== undefined) body.set("slug", fields.slug);
  if (fields.title !== undefined) body.set("title", fields.title);
  if (fields.collection !== undefined) body.set("collection", fields.collection);
  if (fields.file) {
    body.set("file", new File([new Uint8Array(fields.file.bytes)], fields.file.name));
  }
  const headers = new Headers();
  if (withCookie) headers.set("cookie", `${SESSION_COOKIE}=${cookie}`);
  return UPLOAD(new Request(`${ORIGIN}/upload`, { method: "POST", headers, body }));
}

function exists(target: string): Promise<boolean> {
  return fs.stat(target).then(
    () => true,
    () => false,
  );
}

beforeAll(async () => {
  dataDir = await useTempDataDir();
  cookie = signSession(SECRET);
  const session = verifySession(SECRET, cookie);
  if (!session) throw new Error("session should verify");
  token = mutationToken(SECRET, session);
});

afterAll(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

describe("who may upload", () => {
  it("refuses a caller with no admin session", async () => {
    const response = await upload(
      { token, slug: "no-session", file: { name: "x.zip", bytes: await zipFixture("multi-page") } },
      false,
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "not_signed_in" });
    expect(findBundle("no-session")).toBeNull();
  });

  it("refuses a session with a missing or wrong mutation token", async () => {
    const bytes = await zipFixture("multi-page");
    const missing = await upload({ slug: "no-token", file: { name: "x.zip", bytes } });
    expect(missing.status).toBe(403);
    expect(await missing.json()).toMatchObject({ error: "stale_form" });

    const wrong = await upload({
      token: "guessed",
      slug: "no-token",
      file: { name: "x.zip", bytes },
    });
    expect(wrong.status).toBe(403);
    expect(findBundle("no-token")).toBeNull();
  });
});

describe("a zip becoming a bundle", () => {
  it("creates the bundle, with the tree intact", async () => {
    const response = await upload({
      token,
      slug: "dropped",
      title: "Dropped in",
      file: { name: "Dropped In.zip", bytes: await zipFixture("multi-page") },
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ bundle: "dropped", revision: 1, shareUrls: [] });

    const root = path.join(dataDir, "bundles/dropped/r1");
    expect(await exists(path.join(root, "index.html"))).toBe(true);
    expect(await exists(path.join(root, "athletes/index.html"))).toBe(true);
    expect(await exists(path.join(root, "assets/chart.js"))).toBe(true);
    expect(findBundle("dropped")?.title).toBe("Dropped in");
  });

  it("makes the next revision when the slug is already there", async () => {
    const response = await upload({
      token,
      slug: "dropped",
      file: { name: "dropped.zip", bytes: await zipFixture("page-with-assets") },
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ revision: 2 });

    const bundle = path.join(dataDir, "bundles/dropped");
    expect(await fs.readlink(path.join(bundle, "current"))).toBe("r2");
    expect(await exists(path.join(bundle, "r1/athletes/index.html"))).toBe(true);
    expect(listRevisions(findBundle("dropped")?.id ?? 0)).toHaveLength(2);
  });

  it("takes a gzipped tarball too, which is what the CLI sends", async () => {
    const response = await upload({
      token,
      slug: "dropped-tar",
      file: { name: "dropped-tar.tar.gz", bytes: await tarFixture("single-file") },
    });
    expect(response.status).toBe(201);
    expect(await exists(path.join(dataDir, "bundles/dropped-tar/r1/index.html"))).toBe(true);
  });

  it("reads the container from the bytes, not from the name", async () => {
    const response = await upload({
      token,
      slug: "liar",
      file: { name: "liar.zip", bytes: await tarFixture("single-file") },
    });
    expect(response.status).toBe(201);
    expect(await exists(path.join(dataDir, "bundles/liar/r1/index.html"))).toBe(true);
  });
});

describe("uploads Hosti refuses", () => {
  it("refuses a zip that climbs out of the bundle, leaving nothing behind", async () => {
    const response = await upload({
      token,
      slug: "zip-escape",
      file: {
        name: "zip-escape.zip",
        bytes: makeZip([
          { name: "index.html", content: "<h1>bait</h1>", deflate: true },
          { name: "../../escape.html", content: "<h1>owned</h1>" },
        ]),
      },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "unsafe_path" });
    expect(await exists(path.join(dataDir, "bundles/zip-escape/r1"))).toBe(false);
    expect(await exists(path.join(dataDir, "escape.html"))).toBe(false);
    expect(findBundle("zip-escape")).toBeNull();
  });

  it("refuses a file over the single-file limit", async () => {
    const response = await upload({
      token,
      slug: "zip-huge",
      file: {
        name: "zip-huge.zip",
        bytes: makeZip([
          { name: "index.html", content: "<h1>hi</h1>" },
          { name: "big.bin", content: "x", declaredSize: 21 * 1024 * 1024 },
        ]),
      },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "file_too_large" });
    expect(await exists(path.join(dataDir, "bundles/zip-huge/r1"))).toBe(false);
  });

  it("refuses a symlink entry", async () => {
    const response = await upload({
      token,
      slug: "zip-link",
      file: {
        name: "zip-link.zip",
        bytes: makeZip([
          { name: "index.html", content: "<h1>hi</h1>" },
          { name: "secrets", content: "/etc/passwd", symlink: true },
        ]),
      },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "unsafe_entry" });
  });

  it("refuses an archive with no entry file", async () => {
    const response = await upload({
      token,
      slug: "zip-no-entry",
      file: { name: "zip-no-entry.zip", bytes: await zipFixture("no-entry-file") },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "no_entry_file" });
  });

  it("refuses bytes that are neither a zip nor a gzipped tar", async () => {
    const response = await upload({
      token,
      slug: "not-an-archive",
      file: { name: "notes.zip", bytes: Buffer.from("just some text, honestly") },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "unknown_archive" });
  });

  it("refuses a slug a URL could not carry", async () => {
    const response = await upload({
      token,
      slug: "Not A Slug",
      file: { name: "x.zip", bytes: await zipFixture("single-file") },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "bad_slug" });
  });

  it("refuses the collection the no-collection chip already uses", async () => {
    const response = await upload({
      token,
      slug: "zip-dash",
      collection: "-",
      file: { name: "x.zip", bytes: await zipFixture("single-file") },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "bad_collection" });
    expect(findBundle("zip-dash")).toBeNull();
  });

  it("refuses an upload with no file at all", async () => {
    const response = await upload({ token, slug: "nothing" });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "empty_body" });
  });
});

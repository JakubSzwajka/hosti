import fs from "node:fs/promises";
import path from "node:path";
import { create, extract } from "tar";
import { gunzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tarFixture, useTempDataDir } from "./test-fixtures";

const { push } = await import("./api");
const { createPushToken, findBundle } = await import("./support");
const { GET } = await import("@/app/api/v1/bundles/[slug]/revisions/[revision]/archive/route");

let dataDir: string;
let token: string;
let shareOnly: string;
const previousKeep = process.env.HOSTI_KEEP_REVISIONS;

async function archive(slug: string, revision: string, auth = token): Promise<Response> {
  return GET(
    new Request(`http://localhost:3000/api/v1/bundles/${slug}/revisions/${revision}/archive`, {
      headers: { Authorization: `Bearer ${auth}` },
    }),
    { params: Promise.resolve({ slug, revision }) },
  );
}

async function publish(slug: string, fixture: string): Promise<void> {
  const response = await push(token, slug, await tarFixture(fixture));
  if (response.status !== 201) throw new Error(await response.text());
}

async function listFiles(root: string, prefix = ""): Promise<string[]> {
  const entries = await fs.readdir(path.join(root, prefix), { withFileTypes: true });
  const paths = await Promise.all(
    entries.map(async (entry) => {
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      return entry.isDirectory() ? listFiles(root, name) : [name];
    }),
  );
  return paths.flat().sort();
}

async function publishTree(slug: string, files: Record<string, Buffer | string>): Promise<void> {
  const root = path.join(dataDir, `source-${slug}`);
  for (const [name, bytes] of Object.entries(files)) {
    const file = path.join(root, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, bytes);
  }
  const chunks: Buffer[] = [];
  for await (const chunk of create({ gzip: true, cwd: root, portable: true }, ["."])) {
    chunks.push(Buffer.from(chunk));
  }
  const response = await push(token, slug, Buffer.concat(chunks));
  if (response.status !== 201) throw new Error(await response.text());
}

beforeAll(async () => {
  dataDir = await useTempDataDir();
  process.env.HOSTI_KEEP_REVISIONS = "2";
  token = createPushToken("archive-publisher").secret;
  shareOnly = createPushToken("archive-share-only", ["share"]).secret;
});

afterAll(async () => {
  if (previousKeep === undefined) delete process.env.HOSTI_KEEP_REVISIONS;
  else process.env.HOSTI_KEEP_REVISIONS = previousKeep;
  await fs.rm(dataDir, { recursive: true, force: true });
});

describe("revision archive API", () => {
  it("streams current and explicit stored revisions as gzip tar archives", async () => {
    await publish("archive-bytes", "single-file");
    await publish("archive-bytes", "multi-page");

    const current = await archive("archive-bytes", "current");
    expect(current.status, await current.clone().text()).toBe(200);
    expect(current.headers.get("content-type")).toBe("application/gzip");
    expect(current.headers.get("content-disposition")).toBe(
      'attachment; filename="archive-bytes-r2.tar.gz"',
    );
    expect(current.headers.get("x-hosti-revision")).toBe("2");
    expect(current.headers.get("cache-control")).toBe("private, no-store");
    expect(current.body).not.toBeNull();
    const currentTar = gunzipSync(Buffer.from(await current.arrayBuffer()));
    expect(currentTar.includes(Buffer.from("Squad 2026"))).toBe(true);
    expect(currentTar.includes(Buffer.from("Sleep vs"))).toBe(false);

    const explicit = await archive("archive-bytes", "1");
    expect(explicit.status).toBe(200);
    expect(explicit.headers.get("x-hosti-revision")).toBe("1");
    const explicitTar = gunzipSync(Buffer.from(await explicit.arrayBuffer()));
    expect(explicitTar.includes(Buffer.from("Sleep vs"))).toBe(true);
    expect(explicitTar.includes(Buffer.from("Squad 2026"))).toBe(false);
  });

  it("reports missing bundles, invalid revisions and pruned revisions with their correct status", async () => {
    expect((await archive("not-published", "current")).status).toBe(404);
    for (const revision of ["0", "01", "-1", "1.5", "nope", "9007199254740992"]) {
      const invalid = await archive("archive-bytes", revision);
      expect(invalid.status, revision).toBe(400);
      expect((await invalid.json()).message).toContain("positive safe integer");
    }
    const missing = await archive("archive-bytes", "99");
    expect(missing.status).toBe(404);
    expect((await missing.json()).message).toContain(
      'Revision "99" for bundle "archive-bytes" does not exist or was pruned. Kept revisions: 2, 1.',
    );

    await publish("archive-pruned", "single-file");
    await publish("archive-pruned", "multi-page");
    await publish("archive-pruned", "page-with-assets");
    const pruned = await archive("archive-pruned", "1");
    expect(pruned.status).toBe(404);
    const prunedMessage = (await pruned.json()).message as string;
    expect(prunedMessage).toContain("Kept revisions: 3, 2.");
    expect(prunedMessage.match(/Kept revisions: ([^.]+)/)?.[1]).toBe("3, 2");
  });

  it("archives the stored tree bytes and the renamed sole HTML entry", async () => {
    const binary = Buffer.from([0, 1, 2, 255]);
    await publishTree("archive-tree", {
      "index.html": "<h1>tree</h1>",
      "nested/data.bin": binary,
      "nested/page.html": "<p>nested</p>",
    });
    const response = await archive("archive-tree", "current");
    expect(response.status).toBe(200);
    const extracted = path.join(dataDir, "extracted-tree");
    await fs.mkdir(extracted);
    const archiveFile = path.join(dataDir, "tree.tar");
    await fs.writeFile(archiveFile, gunzipSync(Buffer.from(await response.arrayBuffer())));
    await extract({ cwd: extracted, file: archiveFile });
    expect(await listFiles(extracted)).toEqual([
      "index.html",
      "nested/data.bin",
      "nested/page.html",
    ]);
    expect(await fs.readFile(path.join(extracted, "index.html"), "utf8")).toBe("<h1>tree</h1>");
    expect(await fs.readFile(path.join(extracted, "nested/data.bin"))).toEqual(binary);
    expect(await fs.readFile(path.join(extracted, "nested/page.html"), "utf8")).toBe(
      "<p>nested</p>",
    );

    await publishTree("archive-single", { "only.html": "<h1>single</h1>" });
    const single = await archive("archive-single", "current");
    const singleRoot = path.join(dataDir, "extracted-single");
    await fs.mkdir(singleRoot);
    const singleArchive = path.join(dataDir, "single.tar");
    await fs.writeFile(singleArchive, gunzipSync(Buffer.from(await single.arrayBuffer())));
    await extract({ cwd: singleRoot, file: singleArchive });
    expect(await fs.readdir(singleRoot)).toEqual(["index.html"]);
    expect(await fs.readFile(path.join(singleRoot, "index.html"), "utf8")).toBe("<h1>single</h1>");
  });

  it("requires publish and leaves private sharing state unchanged", async () => {
    await publish("archive-private", "single-file");
    const before = findBundle("archive-private");
    const denied = await archive("archive-private", "current", shareOnly);
    expect(denied.status).toBe(403);
    expect((await denied.json()).message).toContain('"publish"');

    const response = await archive("archive-private", "current");
    expect(response.status, await response.clone().text()).toBe(200);
    expect(findBundle("archive-private")).toMatchObject({
      share_mode: before?.share_mode,
      share_slug: before?.share_slug,
      pin_hash: before?.pin_hash,
    });
    expect(before?.share_mode).toBe("private");
  });
});

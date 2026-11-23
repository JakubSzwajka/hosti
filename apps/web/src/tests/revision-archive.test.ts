import fs from "node:fs/promises";
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

  it("reports missing bundles and invalid or pruned revisions as 404", async () => {
    expect((await archive("not-published", "current")).status).toBe(404);
    const invalid = await archive("archive-bytes", "not-a-sequence");
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).message).toContain("positive safe integer");
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
    expect((await pruned.json()).message).toContain("Kept revisions: 3, 2");
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

import fs from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { encodeMetadataHeader } from "@hosti/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tarFixture, useTempDataDir } from "./test-fixtures";

const { MatchTitle } = await import("@/app/_ui/search-hits");
const { SearchProvider } = await import("@/app/_ui/search-state");
const { POST } = await import("@/app/api/v1/bundles/[slug]/revisions/route");
const { GET } = await import("@/app/api/v1/bundles/route");
const { createPushToken, findBundle } = await import("./support");

let dataDir: string;
let token: string;
let legacyIndex = 0;

async function push(slug: string, title?: string, collection?: string): Promise<Response> {
  const headers = new Headers({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/gzip",
  });
  if (title) {
    const encoded = [...title].some((character) => character.charCodeAt(0) > 0x7f);
    headers.set(
      encoded ? "X-Hosti-Title-UTF8" : "X-Hosti-Title",
      encoded ? encodeMetadataHeader(title) : title,
    );
  }
  if (collection) {
    const encoded = [...collection].some((character) => character.charCodeAt(0) > 0x7f);
    headers.set(
      encoded ? "X-Hosti-Collection-UTF8" : "X-Hosti-Collection",
      encoded ? encodeMetadataHeader(collection) : collection,
    );
  }
  return POST(
    new Request(`http://localhost:3000/api/v1/bundles/${slug}/revisions`, {
      method: "POST",
      headers,
      body: new Uint8Array(await tarFixture("single-file")),
    }),
    { params: Promise.resolve({ slug }) },
  );
}

beforeAll(async () => {
  dataDir = await useTempDataDir();
  token = createPushToken("metadata-test").secret;
});

afterAll(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

describe("push metadata", () => {
  it("stores and renders Unicode titles and collections exactly", async () => {
    const title = "Raport: zażółć gęślą jaźń 🚀";
    const collection = "résultats";
    const response = await push("unicode-report", title, collection);
    expect(response.status).toBe(201);
    expect(findBundle("unicode-report")).toMatchObject({ title, collection });

    const listed = await GET(
      new Request("http://localhost:3000/api/v1/bundles", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    const body = (await listed.json()) as {
      bundles: { slug: string; title: string; collection: string | null }[];
    };
    const bundle = body.bundles.find((entry) => entry.slug === "unicode-report");
    expect(bundle).toMatchObject({ title, collection });
    const html = renderToStaticMarkup(
      <SearchProvider items={bundle ? [{ slug: bundle.slug, title: bundle.title }] : []}>
        <MatchTitle slug="unicode-report" title={title} />
      </SearchProvider>,
    );
    expect(html).toContain(title);
  });

  it.each(["100%20 complete", "utf8:%41", "utf8:%FF", "utf8:100%"])(
    "keeps legacy ASCII title %s literal",
    async (title) => {
      const slug = `legacy-${legacyIndex++}`;
      const response = await push(slug, title, "reports%2F2026");
      expect(response.status).toBe(201);
      expect(findBundle(slug)?.title).toBe(title);
      expect(findBundle(slug)?.collection).toBe("reports%2F2026");
    },
  );

  it("rejects malformed encoded metadata", async () => {
    const headers = new Headers({
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/gzip",
      "X-Hosti-Title-UTF8": "%FF",
    });
    const response = await POST(
      new Request("http://localhost:3000/api/v1/bundles/bad-encoding/revisions", {
        method: "POST",
        headers,
        body: new Uint8Array(await tarFixture("single-file")),
      }),
      { params: Promise.resolve({ slug: "bad-encoding" }) },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "bad_metadata_encoding" });
    expect(findBundle("bad-encoding")).toBeNull();
  });
});

import fs from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tarFixture, useTempDataDir } from "./helpers";

const { GET } = await import("@/app/v/[slug]/[[...path]]/route");
const { POST } = await import("@/app/api/v1/bundles/[slug]/revisions/route");
const { createPushToken } = await import("@/server/push-tokens");

let dataDir: string;

function serve(url: string, headers?: HeadersInit): Promise<Response> {
  return GET(new Request(`http://localhost:3000${url}`, { headers }));
}

beforeAll(async () => {
  dataDir = await useTempDataDir();
  const token = createPushToken("test").secret;
  for (const [slug, fixture] of [
    ["x", "multi-page"],
    ["garmin-q3", "page-with-assets"],
    ["sleep-note", "single-file"],
  ] as const) {
    const body = await tarFixture(fixture);
    const response = await POST(
      new Request(`http://localhost:3000/api/v1/bundles/${slug}/revisions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: new Uint8Array(body),
      }),
      { params: Promise.resolve({ slug }) },
    );
    if (response.status !== 201) throw new Error(`fixture push failed: ${await response.text()}`);
  }
});

afterAll(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

describe("the resolution table", () => {
  it("redirects a bare share slug to its directory", async () => {
    const response = await serve("/v/x");
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("/v/x/");
  });

  it("serves index.html at the root", async () => {
    const response = await serve("/v/x/");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await response.text()).toContain("Squad 2026");
  });

  it("serves a sub-directory index", async () => {
    const response = await serve("/v/x/athletes/");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<h1>Athletes</h1>");
  });

  it("redirects a directory without its slash", async () => {
    const response = await serve("/v/x/athletes");
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("/v/x/athletes/");
  });

  it("retries a clean URL with .html", async () => {
    const response = await serve("/v/x/reports/2026-q3");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Q3 report");
  });

  it("serves an asset with its own content type", async () => {
    const response = await serve("/v/x/assets/chart.js");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
  });

  it("keeps the query string on a redirect", async () => {
    const response = await serve("/v/x/athletes?tab=all");
    expect(response.headers.get("location")).toBe("/v/x/athletes/?tab=all");
  });

  it("answers the bundle's own 404.html on a miss", async () => {
    const response = await serve("/v/x/nowhere");
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("This squad page is missing");
  });

  it("answers Hosti's 404 when the bundle has none", async () => {
    const response = await serve("/v/garmin-q3/nowhere");
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("Hosti");
  });
});

describe("bundle shapes end to end", () => {
  it("serves one page plus its assets from relative paths", async () => {
    expect((await serve("/v/garmin-q3/styles.css")).status).toBe(200);
    expect((await serve("/v/garmin-q3/app.js")).status).toBe(200);
    const data = await serve("/v/garmin-q3/data/2026.json");
    expect(data.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(await data.json()).toEqual({ runs: 142 });
  });

  it("serves a single-file bundle at its root", async () => {
    const response = await serve("/v/sleep-note/");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Sleep vs resting HR");
  });
});

describe("what a share link does not leak", () => {
  it("answers the same 404 for an unknown share slug", async () => {
    const response = await serve("/v/never-pushed/");
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("Not found");
  });

  it("refuses an encoded climb out of the revision", async () => {
    const response = await serve("/v/x/%2e%2e%2f%2e%2e%2fhosti.db");
    expect(response.status).toBe(404);
  });

  it("carries a restrictive CSP and no CORS header", async () => {
    const response = await serve("/v/x/");
    const csp = response.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
});

describe("caching", () => {
  it("answers 304 to a matching If-None-Match", async () => {
    const first = await serve("/v/x/assets/chart.js");
    const etag = first.headers.get("etag");
    expect(etag).toBeTruthy();
    const second = await serve("/v/x/assets/chart.js", { "If-None-Match": etag ?? "" });
    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
  });
});

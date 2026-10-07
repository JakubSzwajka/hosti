import fs, { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { TEST_SECRET } from "./pin-helpers";
import { FIXTURES, useTempDataDir } from "./test-fixtures";

process.env.HOSTI_SECRET = TEST_SECRET;
process.env.HOSTI_PUBLIC_URL = "https://hosti.example.test/";

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "internal.invalid:3000" }),
}));

const { navigate, push, serve, setSharing, shareSlugOf, unlock } = await import("./api");
const { createPushToken } = await import("./support");
const { tarFixture } = await import("./test-fixtures");
const { generateMetadata: rootMetadata } = await import("@/app/layout");
const { generateMetadata: loginMetadata } = await import("@/app/login/page");

const SECRET_TITLE = "Quarterly layoffs plan";
const BASE = "https://hosti.example.test";
const BOT = {
  accept: "*/*",
  "user-agent": "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
};

let dataDir: string;
let token: string;

function tags(html: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of html.matchAll(/<meta\s+(property|name)="([^"]+)"\s+content="([^"]*)"/g)) {
    if (match[2] !== undefined && match[3] !== undefined) found.set(match[2], match[3]);
  }
  return found;
}

async function pinnedLink(slug: string): Promise<string> {
  const pushed = await push(token, slug, await tarFixture("multi-page"), { title: SECRET_TITLE });
  expect(pushed.status).toBe(201);
  const shared = await setSharing(token, slug, { mode: "pin", pin: "4821" });
  expect(shared.status).toBe(200);
  return shareSlugOf(shared);
}

beforeAll(async () => {
  dataDir = await useTempDataDir();
  token = createPushToken("test").secret;
});

afterAll(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

describe("the pin gate's link card", () => {
  it("is generic, absolute and carries no bundle content", async () => {
    const link = await pinnedLink("gate-card");
    const response = await navigate(`/v/${link}/`);
    expect(response.status).toBe(200);
    const html = await response.text();
    const meta = tags(html);

    expect(meta.get("og:title")).toBe("Protected Hosti link");
    expect(meta.get("og:description")).toMatch(/protected by a pin/);
    expect(meta.get("og:image")).toBe(`${BASE}/opengraph-image.png`);
    expect(meta.get("og:url")).toBe(`${BASE}/v/${link}/`);
    expect(meta.get("twitter:card")).toBe("summary_large_image");
    expect(html).toContain('<link rel="icon" href="/icon.svg"');
    expect(html).toContain('<meta name="robots" content="noindex, nofollow" />');
    expect(html).toContain("<title>Protected link</title>");
    expect(html).not.toContain(SECRET_TITLE);
    expect(html).not.toContain("multi-page");
  });

  it("shows the card to a link-preview bot that asks for */*", async () => {
    const link = await pinnedLink("gate-bot");
    const bot = await serve(`/v/${link}/`, {
      accept: "*/*",
      "user-agent": "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
    });
    expect(bot.status).toBe(200);
    expect(tags(await bot.text()).get("og:title")).toBe("Protected Hosti link");

    const plain = await serve(`/v/${link}/`, { accept: "*/*", "user-agent": "curl/8.0" });
    expect(plain.status).toBe(404);
  });
});

describe("a link-preview bot at a gate", () => {
  it("gets the generic gate for a bundle asset path, never the bundle bytes", async () => {
    const link = await pinnedLink("gate-bot-asset");
    const asset = await readFile(path.join(FIXTURES, "multi-page/assets/chart.js"), "utf8");
    const response = await serve(`/v/${link}/assets/chart.js`, BOT);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/text\/html/);
    const body = await response.text();
    expect(tags(body).get("og:title")).toBe("Protected Hosti link");
    expect(body).not.toContain(asset.trim());
    expect(body).not.toContain(SECRET_TITLE);
  });

  it("still gets the plain 404 for a private or unknown share", async () => {
    await push(token, "bot-private", await tarFixture("multi-page"));
    const privateLink = await shareSlugOf(
      await setSharing(token, "bot-private", { mode: "private" }),
    );
    const unknown = await serve("/v/never-pushed-at-all/", BOT);
    expect(unknown.status).toBe(404);
    for (const target of [`/v/${privateLink}/`, `/v/${privateLink}/assets/chart.js`]) {
      const response = await serve(target, BOT);
      expect(response.status).toBe(404);
      expect(await response.text()).toBe(await unknown.clone().text());
    }
  });

  it("gets no unlock cookie for a wrong PIN", async () => {
    const link = await pinnedLink("gate-bot-wrong-pin");
    const response = await unlock(link, { pin: "0000", next: `/v/${link}/` }, BOT);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`/v/${link}/?pin=wrong`);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

describe("the root layout's link card", () => {
  it("builds absolute og tags from the public URL, not the request host", async () => {
    for (const [metadata, path] of [
      [await rootMetadata(), "/"],
      [await loginMetadata(), "/login"],
    ] as const) {
      expect(String(metadata.metadataBase)).toBe(`${BASE}/`);
      expect(metadata.openGraph?.title).toBe("Hosti");
      expect(metadata.openGraph?.description).toBeTruthy();
      expect(metadata.openGraph?.url).toBe(`${BASE}${path}`);
      expect(metadata.openGraph?.images).toEqual([
        expect.objectContaining({ url: "/opengraph-image.png", width: 1200, height: 630 }),
      ]);
      expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
    }
  });
});

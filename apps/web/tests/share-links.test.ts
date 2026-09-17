import fs from "node:fs/promises";
import path from "node:path";
import type { ShareLink } from "@hosti/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tarFixture, useTempDataDir } from "./helpers";

const { createShare, listShares, push, removeBundle, revokeShare, serve } = await import("./api");
const { createPushToken } = await import("@/server/push-tokens");

let dataDir: string;
let token: string;

async function pushed(slug: string, fixture = "multi-page"): Promise<void> {
  const response = await push(token, slug, await tarFixture(fixture));
  if (response.status !== 201) throw new Error(`push failed: ${await response.text()}`);
}

async function shareSlugOf(response: Response): Promise<string> {
  const body = (await response.json()) as { link: ShareLink };
  return body.link.slug;
}

beforeAll(async () => {
  dataDir = await useTempDataDir();
  token = createPushToken("test").secret;
});

afterAll(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

describe("a push leaves the bundle private", () => {
  it("returns the admin URL and no share link", async () => {
    await pushed("private-one");
    const second = await push(token, "private-one", await tarFixture("page-with-assets"));
    expect(await second.json()).toEqual({
      bundle: "private-one",
      revision: 2,
      adminUrl: "http://localhost:3000/b/private-one",
      shareUrls: [],
    });
  });

  it("reports the links a later push inherits", async () => {
    await pushed("kept-open");
    await createShare(token, "kept-open");
    const again = await push(token, "kept-open", await tarFixture("multi-page"));
    expect(await again.json()).toMatchObject({
      shareUrls: ["http://localhost:3000/v/kept-open/"],
    });
  });
});

describe("creating a share link", () => {
  it("names the link after the bundle by default", async () => {
    await pushed("plain");
    const response = await createShare(token, "plain");
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      bundle: "plain",
      link: { slug: "plain", url: "http://localhost:3000/v/plain/" },
    });
    expect((await serve("/v/plain/")).status).toBe(200);
  });

  it("hides an unlisted link behind eight characters with no vowels", async () => {
    await pushed("atlas");
    const slug = await shareSlugOf(await createShare(token, "atlas", { unlisted: true }));
    expect(slug).toMatch(/^atlas-[bcdfghjkmnpqrstvwxz2-9]{8}$/);
    expect((await serve(`/v/${slug}/`)).status).toBe(200);
    expect((await serve("/v/atlas/")).status).toBe(404);
  });

  it("gives every unlisted link its own slug", async () => {
    await pushed("many-unlisted");
    const first = await shareSlugOf(await createShare(token, "many-unlisted", { unlisted: true }));
    const second = await shareSlugOf(await createShare(token, "many-unlisted", { unlisted: true }));
    expect(first).not.toBe(second);
  });

  it("refuses a second link on the bundle slug", async () => {
    await pushed("twice");
    expect((await createShare(token, "twice")).status).toBe(201);
    const again = await createShare(token, "twice");
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ error: "share_link_exists" });
  });

  it("refuses an unknown bundle", async () => {
    const response = await createShare(token, "ghost");
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "no_such_bundle" });
  });

  it("refuses a caller with no push token", async () => {
    const response = await import("@/app/api/v1/bundles/[slug]/share-links/route").then((route) =>
      route.POST(
        new Request("http://localhost:3000/api/v1/bundles/plain/share-links", { method: "POST" }),
        { params: Promise.resolve({ slug: "plain" }) },
      ),
    );
    expect(response.status).toBe(401);
  });
});

describe("listing share links", () => {
  it("returns both links of a bundle, oldest first", async () => {
    await pushed("pair");
    const plain = await shareSlugOf(await createShare(token, "pair"));
    const unlisted = await shareSlugOf(await createShare(token, "pair", { unlisted: true }));
    const response = await listShares(token, "pair");
    expect(response.status).toBe(200);
    const body = (await response.json()) as { bundle: string; links: ShareLink[] };
    expect(body.links.map((link) => link.slug)).toEqual([plain, unlisted]);
    expect(body.links[0]?.url).toBe("http://localhost:3000/v/pair/");
  });

  it("returns nothing for a private bundle", async () => {
    await pushed("silent");
    const body = (await (await listShares(token, "silent")).json()) as { links: ShareLink[] };
    expect(body.links).toEqual([]);
  });
});

describe("revoking one link", () => {
  it("leaves the bundle and its other link serving", async () => {
    await pushed("two-doors");
    const plain = await shareSlugOf(await createShare(token, "two-doors"));
    const unlisted = await shareSlugOf(await createShare(token, "two-doors", { unlisted: true }));
    expect((await serve(`/v/${plain}/`)).status).toBe(200);
    expect((await serve(`/v/${unlisted}/`)).status).toBe(200);

    const revoked = await revokeShare(token, plain);
    expect(revoked.status).toBe(200);
    expect(await revoked.json()).toEqual({ shareSlug: plain, revoked: true });

    expect((await serve(`/v/${plain}/`)).status).toBe(404);
    expect((await serve(`/v/${unlisted}/`)).status).toBe(200);
    const body = (await (await listShares(token, "two-doors")).json()) as { links: ShareLink[] };
    expect(body.links.map((link) => link.slug)).toEqual([unlisted]);
    expect(await fs.stat(path.join(dataDir, "bundles/two-doors/r1"))).toBeTruthy();
  });

  it("refuses an unknown share slug", async () => {
    const response = await revokeShare(token, "never-existed");
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "no_such_share_link" });
  });
});

describe("deleting a bundle", () => {
  it("takes its revisions, its files and its links with it", async () => {
    await pushed("goner");
    const slug = await shareSlugOf(await createShare(token, "goner", { unlisted: true }));
    expect((await serve(`/v/${slug}/`)).status).toBe(200);

    const response = await removeBundle(token, "goner");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ bundle: "goner", deleted: true });

    expect((await serve(`/v/${slug}/`)).status).toBe(404);
    await expect(fs.stat(path.join(dataDir, "bundles/goner"))).rejects.toThrow();
    expect((await removeBundle(token, "goner")).status).toBe(404);
  });
});

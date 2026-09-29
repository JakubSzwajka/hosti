import fs from "node:fs/promises";
import path from "node:path";
import type { SharingResponse } from "@hosti/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tarFixture, useTempDataDir } from "./test-fixtures";

process.env.HOSTI_SECRET = "a-long-random-string-for-tests";

const { getBundle, push, removeBundle, rotateSharing, serve, setSharing } = await import("./api");
const { createPushToken, findBundle } = await import("./support");

let dataDir: string;
let token: string;

async function pushed(slug: string, fixture = "multi-page"): Promise<void> {
  const response = await push(token, slug, await tarFixture(fixture));
  if (response.status !== 201) throw new Error(`push failed: ${await response.text()}`);
}

async function stateOf(response: Response): Promise<SharingResponse> {
  return (await response.json()) as SharingResponse;
}

function storedPinHash(slug: string): string | null {
  return findBundle(slug)?.pin_hash ?? null;
}

beforeAll(async () => {
  dataDir = await useTempDataDir();
  token = createPushToken("test").secret;
});

afterAll(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

describe("a push leaves the sharing state alone", () => {
  it("lands a new bundle private with no share URL", async () => {
    await pushed("private-one");
    const second = await push(token, "private-one", await tarFixture("page-with-assets"));
    expect(await second.json()).toEqual({
      bundle: "private-one",
      revision: 2,
      adminUrl: "http://localhost:3000/b/private-one",
      sharing: { mode: "private", shareSlug: "private-one", hasPin: false },
      shareUrl: null,
    });
    expect((await serve("/v/private-one/")).status).toBe(404);
  });

  it("keeps a shared bundle shared, and a pinned one pinned", async () => {
    await pushed("kept-open");
    await setSharing(token, "kept-open", { mode: "link" });
    const again = await push(token, "kept-open", await tarFixture("multi-page"));
    expect(await again.json()).toMatchObject({
      sharing: { mode: "link", hasPin: false },
      shareUrl: "http://localhost:3000/v/kept-open/",
    });

    await pushed("kept-pinned");
    await setSharing(token, "kept-pinned", { mode: "pin", pin: "4821" });
    const third = await push(token, "kept-pinned", await tarFixture("multi-page"));
    expect(await third.json()).toMatchObject({ sharing: { mode: "pin", hasPin: true } });
  });

  it("does not move a rotated slug back onto the bundle slug", async () => {
    await pushed("rotated-then-pushed");
    await setSharing(token, "rotated-then-pushed", { mode: "link" });
    const rotated = await stateOf(await rotateSharing(token, "rotated-then-pushed"));
    const again = await push(token, "rotated-then-pushed", await tarFixture("multi-page"));
    expect(await again.json()).toMatchObject({
      sharing: { mode: "link", shareSlug: rotated.sharing.shareSlug },
    });
  });
});

describe("setting the sharing state", () => {
  it("opens the bundle at its own slug on mode link", async () => {
    await pushed("plain");
    const response = await setSharing(token, "plain", { mode: "link" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      bundle: "plain",
      sharing: { mode: "link", shareSlug: "plain", hasPin: false },
      shareUrl: "http://localhost:3000/v/plain/",
    });
    expect((await serve("/v/plain/")).status).toBe(200);
  });

  it("shuts the link again on mode private", async () => {
    await pushed("closable");
    await setSharing(token, "closable", { mode: "link" });
    expect((await serve("/v/closable/")).status).toBe(200);

    const response = await setSharing(token, "closable", { mode: "private" });
    expect(await response.json()).toMatchObject({
      sharing: { mode: "private" },
      shareUrl: null,
    });
    expect((await serve("/v/closable/")).status).toBe(404);
    expect(await fs.stat(path.join(dataDir, "bundles/closable/r1"))).toBeTruthy();
  });

  it("refuses mode pin with no pin stored and none in the body", async () => {
    await pushed("needs-a-pin");
    const response = await setSharing(token, "needs-a-pin", { mode: "pin" });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "pin_required" });
    // Refused means refused: the bundle is not quietly left open.
    expect((await serve("/v/needs-a-pin/")).status).toBe(404);
    const state = await stateOf(await setSharing(token, "needs-a-pin", { mode: "private" }));
    expect(state.sharing.mode).toBe("private");
  });

  it("takes mode pin again once a pin is stored, with no pin in the body", async () => {
    await pushed("pin-then-pin");
    await setSharing(token, "pin-then-pin", { mode: "pin", pin: "4821" });
    await setSharing(token, "pin-then-pin", { mode: "link" });
    // Going to link cleared the hash, so the bare retry is refused again.
    expect((await setSharing(token, "pin-then-pin", { mode: "pin" })).status).toBe(400);

    await setSharing(token, "pin-then-pin", { mode: "pin", pin: "5555" });
    const kept = await setSharing(token, "pin-then-pin", { mode: "pin" });
    expect(kept.status).toBe(200);
    expect(await kept.json()).toMatchObject({ sharing: { mode: "pin", hasPin: true } });
  });

  it("clears the stored pin hash on the way to private", async () => {
    await pushed("pin-cleared");
    await setSharing(token, "pin-cleared", { mode: "pin", pin: "4821" });
    expect(storedPinHash("pin-cleared")).not.toBeNull();

    const response = await setSharing(token, "pin-cleared", { mode: "private" });
    expect(await response.json()).toMatchObject({ sharing: { hasPin: false } });
    expect(storedPinHash("pin-cleared")).toBeNull();
  });

  it("clears the stored pin hash on the way to a plain link", async () => {
    await pushed("pin-dropped");
    await setSharing(token, "pin-dropped", { mode: "pin", pin: "4821" });
    const response = await setSharing(token, "pin-dropped", { mode: "link" });
    expect(await response.json()).toMatchObject({ sharing: { mode: "link", hasPin: false } });
    expect(storedPinHash("pin-dropped")).toBeNull();
    // No gate left behind: the link opens straight away.
    expect((await serve("/v/pin-dropped/")).status).toBe(200);
  });

  it("refuses a pin sent with any mode other than pin", async () => {
    await pushed("pin-on-link");
    for (const mode of ["link", "private"]) {
      const response = await setSharing(token, "pin-on-link", { mode, pin: "4821" });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "pin_not_wanted" });
    }
    expect(storedPinHash("pin-on-link")).toBeNull();
  });

  it("refuses a mode it does not know", async () => {
    await pushed("bad-mode");
    for (const mode of ["unlisted", "public", "", 3, null]) {
      const response = await setSharing(token, "bad-mode", { mode });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "bad_mode" });
    }
  });

  it("refuses an unknown bundle", async () => {
    const response = await setSharing(token, "ghost", { mode: "link" });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "no_such_bundle" });
  });

  it("refuses a caller with no push token", async () => {
    const { PUT } = await import("@/app/api/v1/bundles/[slug]/sharing/route");
    const response = await PUT(
      new Request("http://localhost:3000/api/v1/bundles/plain/sharing", { method: "PUT" }),
      { params: Promise.resolve({ slug: "plain" }) },
    );
    expect(response.status).toBe(401);
  });
});

describe("rotating the link", () => {
  it("mints a fresh slug and the old one stops answering", async () => {
    await pushed("rotated");
    await setSharing(token, "rotated", { mode: "link" });
    expect((await serve("/v/rotated/")).status).toBe(200);

    const response = await rotateSharing(token, "rotated");
    expect(response.status).toBe(200);
    const state = await stateOf(response);
    expect(state.sharing.shareSlug).not.toBe("rotated");
    expect(state.sharing.shareSlug).toMatch(/^[bcdfghjkmnpqrstvwxz2-9]{12}$/);
    expect(state.shareUrl).toBe(`http://localhost:3000/v/${state.sharing.shareSlug}/`);

    expect((await serve("/v/rotated/")).status).toBe(404);
    expect((await serve(`/v/${state.sharing.shareSlug}/`)).status).toBe(200);
  });

  it("keeps the state and the pin it found", async () => {
    await pushed("rotated-pin");
    await setSharing(token, "rotated-pin", { mode: "pin", pin: "4821" });
    const hash = storedPinHash("rotated-pin");

    const state = await stateOf(await rotateSharing(token, "rotated-pin"));
    expect(state.sharing).toMatchObject({ mode: "pin", hasPin: true });
    expect(storedPinHash("rotated-pin")).toBe(hash);
  });

  it("changes the address of a private bundle without opening it", async () => {
    await pushed("rotated-private");
    const state = await stateOf(await rotateSharing(token, "rotated-private"));
    expect(state.sharing.mode).toBe("private");
    expect(state.shareUrl).toBeNull();
    expect(state.sharing.shareSlug).not.toBe("rotated-private");
    expect((await serve(`/v/${state.sharing.shareSlug}/`)).status).toBe(404);
  });

  it("gives every rotate its own slug", async () => {
    await pushed("rotated-twice");
    const first = await stateOf(await rotateSharing(token, "rotated-twice"));
    const second = await stateOf(await rotateSharing(token, "rotated-twice"));
    expect(first.sharing.shareSlug).not.toBe(second.sharing.shareSlug);
  });

  it("refuses an unknown bundle and a caller with no push token", async () => {
    expect((await rotateSharing(token, "ghost")).status).toBe(404);
    const { POST } = await import("@/app/api/v1/bundles/[slug]/sharing/rotate/route");
    const response = await POST(
      new Request("http://localhost:3000/api/v1/bundles/plain/sharing/rotate", { method: "POST" }),
      { params: Promise.resolve({ slug: "plain" }) },
    );
    expect(response.status).toBe(401);
  });
});

describe("reading one bundle back", () => {
  it("reports the sharing state and the URL", async () => {
    await pushed("reported");
    await setSharing(token, "reported", { mode: "pin", pin: "4821" });
    const response = await getBundle(token, "reported");
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(JSON.parse(body)).toMatchObject({
      bundle: {
        slug: "reported",
        revisionCount: 1,
        sharing: { mode: "pin", shareSlug: "reported", hasPin: true },
      },
      shareUrl: "http://localhost:3000/v/reported/",
    });
    expect(body).not.toContain("4821");
  });

  it("refuses an unknown bundle and a caller with no push token", async () => {
    expect((await getBundle(token, "ghost")).status).toBe(404);
    const { GET } = await import("@/app/api/v1/bundles/[slug]/route");
    const response = await GET(new Request("http://localhost:3000/api/v1/bundles/reported"), {
      params: Promise.resolve({ slug: "reported" }),
    });
    expect(response.status).toBe(401);
  });
});

describe("deleting a bundle", () => {
  it("takes its revisions, its files and its link with it", async () => {
    await pushed("goner");
    await setSharing(token, "goner", { mode: "link" });
    expect((await serve("/v/goner/")).status).toBe(200);

    const response = await removeBundle(token, "goner");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ bundle: "goner", deleted: true });

    expect((await serve("/v/goner/")).status).toBe(404);
    await expect(fs.stat(path.join(dataDir, "bundles/goner"))).rejects.toThrow();
    expect((await removeBundle(token, "goner")).status).toBe(404);
  });
});

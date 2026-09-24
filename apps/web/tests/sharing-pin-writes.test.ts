import fs from "node:fs/promises";
import type { SharingResponse } from "@hosti/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tarFixture, useTempDataDir } from "./helpers";

process.env.HOSTI_SECRET = "a-long-random-string-for-tests";

const { push, serve, setSharing } = await import("./api");
const { createPushToken, findBundle } = await import("./support");

let dataDir: string;
let token: string;

async function pushed(slug: string): Promise<void> {
  const response = await push(token, slug, await tarFixture("multi-page"));
  if (response.status !== 201) throw new Error(`push failed: ${await response.text()}`);
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

describe("a pin field Hosti cannot use", () => {
  it("refuses an empty or malformed pin instead of dropping it", async () => {
    await pushed("empty-pin");
    for (const pin of ["", "   ", null, 4821, "12ab"]) {
      const response = await setSharing(token, "empty-pin", { mode: "pin", pin });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "bad_pin" });
    }
    // Refused every time, so nothing was stored and nothing opened.
    expect(storedPinHash("empty-pin")).toBeNull();
    expect((await serve("/v/empty-pin/")).status).toBe(404);
  });

  it("refuses an empty pin on another mode too, rather than reading it as none", async () => {
    await pushed("empty-pin-on-link");
    const response = await setSharing(token, "empty-pin-on-link", { mode: "link", pin: "" });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "bad_pin" });
  });

  it("still takes a body with no pin key at all", async () => {
    await pushed("no-pin-key");
    expect((await setSharing(token, "no-pin-key", { mode: "link" })).status).toBe(200);
  });
});

describe("two sharing writes at once", () => {
  it("cannot have a slow pin land after a private and put the pin back", async () => {
    await pushed("racer");
    await setSharing(token, "racer", { mode: "pin", pin: "4821" });

    const slow = setSharing(token, "racer", { mode: "pin", pin: "5555" });
    const fast = setSharing(token, "racer", { mode: "private" });
    const [first, second] = await Promise.all([slow, fast]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const state = (await second.json()) as SharingResponse;
    expect(state).toMatchObject({ sharing: { mode: "private", hasPin: false } });
    expect(storedPinHash("racer")).toBeNull();
    expect((await serve("/v/racer/")).status).toBe(404);
  });
});

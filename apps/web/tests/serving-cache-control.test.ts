import fs from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_SECRET } from "./pin-helpers";
import { tarFixture, useTempDataDir } from "./helpers";

process.env.HOSTI_SECRET = TEST_SECRET;

const { navigate, pushAndShare, serve, setSharing, unlock } = await import("./api");
const { protectedLink } = await import("./pin-helpers");
const { createPushToken } = await import("./support");

let dataDir: string;
let token: string;

const NO_STORE = "private, no-store";

beforeAll(async () => {
  dataDir = await useTempDataDir();
  token = createPushToken("test").secret;
});

afterAll(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

describe("every /v/ response carries Cache-Control: private, no-store", () => {
  it("a served file of a link bundle", async () => {
    const link = await pushAndShare(token, "cache-link-file", await tarFixture("multi-page"));
    const response = await serve(`/v/${link}/`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(NO_STORE);
  });

  it("an asset 404, answered by the bundle's own 404.html", async () => {
    const link = await pushAndShare(token, "cache-asset-404", await tarFixture("multi-page"));
    const response = await serve(`/v/${link}/nowhere`);
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("This squad page is missing");
    expect(response.headers.get("cache-control")).toBe(NO_STORE);
  });

  it("a private bundle's 404", async () => {
    const link = await pushAndShare(token, "cache-private-404", await tarFixture("multi-page"));
    await setSharing(token, "cache-private-404", { mode: "private" });
    const response = await serve(`/v/${link}/`);
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe(NO_STORE);
  });

  it("an unknown share slug's 404", async () => {
    const response = await serve("/v/never-existed-for-cache-control-test/");
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe(NO_STORE);
  });

  it("the pin gate page", async () => {
    const link = await protectedLink(token, "cache-gate-page", { pin: "4821" });
    const response = await navigate(`/v/${link}/`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("This link is protected");
    expect(response.headers.get("cache-control")).toBe(NO_STORE);
  });

  it("a wrong-pin unlock redirect", async () => {
    const link = await protectedLink(token, "cache-wrong-pin", { pin: "4821" });
    const response = await unlock(link, { pin: "0000", next: `/v/${link}/` });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("pin=wrong");
    expect(response.headers.get("cache-control")).toBe(NO_STORE);
  });

  it("a right-pin unlock redirect", async () => {
    const link = await protectedLink(token, "cache-right-pin", { pin: "4821" });
    const response = await unlock(link, { pin: "4821", next: `/v/${link}/` });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`/v/${link}/`);
    expect(response.headers.get("cache-control")).toBe(NO_STORE);
  });

  it("the trailing-slash redirect", async () => {
    const link = await pushAndShare(token, "cache-redirect", await tarFixture("multi-page"));
    const response = await serve(`/v/${link}`);
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(`/v/${link}/`);
    expect(response.headers.get("cache-control")).toBe(NO_STORE);
  });
});

import fs from "node:fs/promises";
import type { PushScope } from "@hosti/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tarFixture, useTempDataDir } from "./test-fixtures";

const { ORIGIN, getBundle, prune, push, removeBundle, rotateSharing, setSharing } = await import(
  "./api"
);
const { GET: LIST } = await import("@/app/api/v1/bundles/route");
const { GET: WHOAMI } = await import("@/app/api/v1/whoami/route");
const { createPushToken, findBundle } = await import("./support");

let dataDir: string;
let full: string;
let shareOnly: string;
let publishOnly: string;
let noDelete: string;

function list(token: string): Promise<Response> {
  return LIST(
    new Request(`${ORIGIN}/api/v1/bundles`, { headers: { Authorization: `Bearer ${token}` } }),
  );
}

function whoami(token?: string): Promise<Response> {
  const headers = new Headers();
  if (token !== undefined) headers.set("Authorization", `Bearer ${token}`);
  return WHOAMI(new Request(`${ORIGIN}/api/v1/whoami`, { headers }));
}

async function expectMissing(response: Response, scope: PushScope, secret: string) {
  expect(response.status).toBe(403);
  const text = await response.text();
  expect(text).not.toContain(secret);
  const body = JSON.parse(text) as { error: string; scope: string; message: string };
  expect(body).toEqual({ error: "missing_scope", scope, message: expect.any(String) });
  expect(body.message).toContain(`"${scope}"`);
  expect(body.message).toContain(scope === "delete" ? "hosti login --allow-delete" : "hosti login");
}

beforeAll(async () => {
  dataDir = await useTempDataDir();
  full = createPushToken("full").secret;
  shareOnly = createPushToken("share-only", ["share"]).secret;
  publishOnly = createPushToken("publish-only", ["publish"]).secret;
  noDelete = createPushToken("no-delete", ["publish", "share"]).secret;
  const pushed = await push(full, "scoped", await tarFixture("single-file"));
  if (pushed.status !== 201) throw new Error(await pushed.text());
});

afterAll(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

describe("publish", () => {
  it("guards listing, reading, pushing and pruning", async () => {
    const fixture = await tarFixture("single-file");
    await expectMissing(await list(shareOnly), "publish", shareOnly);
    await expectMissing(await getBundle(shareOnly, "scoped"), "publish", shareOnly);
    await expectMissing(await push(shareOnly, "scoped-new", fixture), "publish", shareOnly);
    await expectMissing(await prune(shareOnly, "scoped"), "publish", shareOnly);
    expect(findBundle("scoped-new")).toBeNull();
  });

  it("lets a publish token do all four", async () => {
    expect((await list(publishOnly)).status).toBe(200);
    expect((await getBundle(publishOnly, "scoped")).status).toBe(200);
    expect((await push(publishOnly, "scoped", await tarFixture("single-file"))).status).toBe(201);
    expect((await prune(publishOnly, "scoped")).status).toBe(200);
  });
});

describe("share", () => {
  it("guards every sharing change, pins and rotate included", async () => {
    const before = findBundle("scoped");
    await expectMissing(
      await setSharing(publishOnly, "scoped", { mode: "link" }),
      "share",
      publishOnly,
    );
    await expectMissing(
      await setSharing(publishOnly, "scoped", { mode: "pin", pin: "4821" }),
      "share",
      publishOnly,
    );
    await expectMissing(await rotateSharing(publishOnly, "scoped"), "share", publishOnly);
    const after = findBundle("scoped");
    expect(before?.share_mode).toBe("private");
    expect(after).toMatchObject({
      share_mode: before?.share_mode,
      share_slug: before?.share_slug,
      pin_hash: before?.pin_hash,
    });
  });

  it("lets a share token set the state and rotate", async () => {
    expect((await setSharing(noDelete, "scoped", { mode: "link" })).status).toBe(200);
    expect((await rotateSharing(noDelete, "scoped")).status).toBe(200);
  });
});

describe("delete", () => {
  it("is refused to a token without it, and the bundle stays", async () => {
    await expectMissing(await removeBundle(noDelete, "scoped"), "delete", noDelete);
    await expectMissing(await removeBundle(publishOnly, "scoped"), "delete", publishOnly);
    expect(findBundle("scoped")).not.toBeNull();
  });

  it("works for a token that carries it", async () => {
    expect((await removeBundle(full, "scoped")).status).toBe(200);
    expect(findBundle("scoped")).toBeNull();
  });

  it("checks the token before the scope, so a bad bearer still gets 401", async () => {
    const response = await removeBundle("hosti_not-a-token", "scoped");
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "unauthorized" });
  });
});

describe("GET /api/v1/whoami", () => {
  it("names the token and its scopes, whatever they are", async () => {
    const mine = await whoami(noDelete);
    expect(mine.status).toBe(200);
    expect(await mine.json()).toEqual({ name: "no-delete", scopes: ["publish", "share"] });

    const narrow = await whoami(shareOnly);
    expect(await narrow.json()).toEqual({ name: "share-only", scopes: ["share"] });
  });

  it("refuses a missing or wrong token, and never echoes it", async () => {
    expect((await whoami()).status).toBe(401);
    const wrong = await whoami("hosti_guessed-value");
    expect(wrong.status).toBe(401);
    expect(await wrong.text()).not.toContain("hosti_guessed-value");
  });
});

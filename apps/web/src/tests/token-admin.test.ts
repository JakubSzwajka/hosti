import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ownerPasswordHash, tarFixture, useTempDataDir } from "./test-fixtures";

const PASSWORD = "the-owner-password";
const SECRET = "a-long-random-string-for-tests";
process.env.HOSTI_OWNER_PASSWORD_HASH = ownerPasswordHash(PASSWORD);
process.env.HOSTI_SECRET = SECRET;

const ORIGIN = "http://127.0.0.1:3000";
const APP_DIR = path.resolve(import.meta.dirname, "../app");

const { push } = await import("./api");
const { SESSION_COOKIE, mutationToken, signSession, verifySession } = await import("./support");
const { createPushToken, hashToken, listPushTokens } = await import("./support");
const { POST: REVOKE } = await import("@/app/tokens/revoke/route");

let dataDir: string;
let cookie: string;
let token: string;

function post(urlPath: string, fields: Record<string, string>, withCookie = true): Request {
  const headers = new Headers({ "content-type": "application/x-www-form-urlencoded" });
  if (withCookie) headers.set("cookie", `${SESSION_COOKIE}=${cookie}`);
  return new Request(`${ORIGIN}${urlPath}`, {
    method: "POST",
    headers,
    body: new URLSearchParams(fields),
  });
}

function mint(name: string): { id: number; secret: string } {
  const created = createPushToken(name);
  return { id: created.id, secret: created.secret };
}

beforeAll(async () => {
  dataDir = await useTempDataDir();
  cookie = signSession(SECRET);
  const session = verifySession(SECRET, cookie);
  if (!session) throw new Error("session should verify");
  token = mutationToken(SECRET, session);
});

afterAll(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

describe("minting by hand is gone", () => {
  it("has no mint route, so POST /tokens/mint answers like any unknown path", async () => {
    const found = await fs.readdir(path.join(APP_DIR, "tokens"));
    expect(found.sort()).toEqual(["page.tsx", "revoke"]);
  });
});

describe("what a token route may say out loud", () => {
  it("lists a token with its scopes, and never its secret or digest", () => {
    const { secret } = mint("quiet");
    const digest = hashToken(secret);
    const record = listPushTokens().find((one) => one.name === "quiet");
    const listed = JSON.stringify(record);
    expect(listed).not.toContain(secret);
    expect(listed).not.toContain(digest);
    expect(Object.keys(record ?? {}).sort()).toEqual([
      "createdAt",
      "id",
      "lastUsedAt",
      "name",
      "scopes",
    ]);
    expect(record?.scopes).toEqual(["publish", "share", "delete"]);
  });

  it("says nothing about a secret when it revokes one", async () => {
    const { id, secret } = mint("gone-quiet");
    const response = await REVOKE(post("/tokens/revoke", { token, id: String(id) }));
    const seen = `${response.headers.get("location")}\n${await response.text()}`;
    expect(seen).not.toContain(secret);
    expect(seen).not.toContain(hashToken(secret));
  });
});

describe("who may revoke a push token", () => {
  it("refuses a caller with no admin session, and one with a wrong token", async () => {
    const { id, secret } = mint("survivor");

    const anonymous = await REVOKE(post("/tokens/revoke", { token, id: String(id) }, false));
    expect(anonymous.status).toBe(401);

    const wrong = await REVOKE(post("/tokens/revoke", { token: "guessed", id: String(id) }));
    expect(wrong.status).toBe(403);

    expect(listPushTokens().some((one) => one.id === id)).toBe(true);
    expect((await push(secret, "still-mine", await tarFixture("single-file"))).status).toBe(201);
  });

  it("refuses an id that is not one", async () => {
    const before = listPushTokens().length;
    for (const id of ["", "nope", "-3", "0", "1.5e400"]) {
      const response = await REVOKE(post("/tokens/revoke", { token, id }));
      expect(response.headers.get("location")).toBe("/tokens?token=bad_token_id");
    }
    expect(listPushTokens().length).toBe(before);
  });

  it("refuses a token that is not there", async () => {
    const response = await REVOKE(post("/tokens/revoke", { token, id: "99999" }));
    expect(response.status).toBe(404);
  });

  it("refuses a bearer on the revoke route, however good the token is", async () => {
    const { id, secret } = mint("bearer-try");
    const request = new Request(`${ORIGIN}/tokens/revoke`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Bearer ${secret}`,
      },
      body: new URLSearchParams({ token, id: String(id) }),
    });
    const response = await REVOKE(request);
    expect(response.status).toBe(401);
    expect(listPushTokens().some((one) => one.id === id)).toBe(true);
  });
});

describe("revoking", () => {
  it("makes a later push with that secret fail with 401", async () => {
    const { id, secret } = mint("doomed-token");
    expect((await push(secret, "wrote-once", await tarFixture("single-file"))).status).toBe(201);

    const response = await REVOKE(post("/tokens/revoke", { token, id: String(id) }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/tokens");
    expect(listPushTokens().some((one) => one.id === id)).toBe(false);

    const after = await push(secret, "wrote-once", await tarFixture("single-file"));
    expect(after.status).toBe(401);
    expect(await after.json()).toMatchObject({ error: "unauthorized" });
  });

  it("leaves the name on the revisions it already wrote", async () => {
    const { findBundle, listRevisions } = await import("./support");
    const bundle = findBundle("wrote-once");
    expect(listRevisions(bundle?.id ?? 0)[0]?.pushedBy).toBe("doomed-token");
  });
});

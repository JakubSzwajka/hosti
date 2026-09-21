import fs from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tarFixture, useTempDataDir } from "./helpers";

/**
 * Minting and revoking push tokens from the catalog.
 *
 * Both are catalog writes, so both take the admin session cookie and the
 * mutation token, exactly like setting a sharing state from the bundle page.
 * A push token opens `/api/v1/` and nothing else, so it can never reach here.
 *
 * The one thing these routes must never leak is a secret. Hosti stores only a
 * SHA-256 digest, and the single moment the owner can read a secret is the
 * one-time display that follows a mint.
 */

const PASSWORD = "the-owner-password";
const SECRET = "a-long-random-string-for-tests";
process.env.HOSTI_OWNER_PASSWORD = PASSWORD;
process.env.HOSTI_SECRET = SECRET;

const ORIGIN = "http://127.0.0.1:3000";

const { push } = await import("./api");
const { SESSION_COOKIE, mutationToken, signSession, verifySession } = await import(
  "@/server/auth/session"
);
const { createPushToken, deletePushToken, hashToken, listPushTokens, readTokenName } = await import(
  "@/server/push-tokens"
);
const { takeMintedSecret } = await import("@/server/minted-secret");
const { POST: MINT } = await import("@/app/tokens/mint/route");
const { POST: REVOKE } = await import("@/app/tokens/revoke/route");

let dataDir: string;
let cookie: string;
let token: string;

function post(path: string, fields: Record<string, string>, withCookie = true): Request {
  const headers = new Headers({ "content-type": "application/x-www-form-urlencoded" });
  if (withCookie) headers.set("cookie", `${SESSION_COOKIE}=${cookie}`);
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers,
    body: new URLSearchParams(fields),
  });
}

/** The `shown` id out of a mint redirect, or null when it carried none. */
function shownId(response: Response): string | null {
  const location = response.headers.get("location") ?? "";
  return new URL(location, ORIGIN).searchParams.get("shown");
}

/** Mint through the route and read the secret back out of the one-time store. */
async function mint(name: string): Promise<{ response: Response; secret: string }> {
  const response = await MINT(post("/tokens/mint", { token, name }));
  const id = shownId(response);
  const secret = takeMintedSecret(id);
  if (!secret) throw new Error(`mint did not hold a secret: ${response.headers.get("location")}`);
  return { response, secret };
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

describe("who may mint a push token", () => {
  it("refuses a caller with no admin session", async () => {
    const before = listPushTokens().length;
    const response = await MINT(post("/tokens/mint", { token, name: "no-session" }, false));
    expect(response.status).toBe(401);
    expect(shownId(response)).toBeNull();
    expect(listPushTokens().length).toBe(before);
  });

  it("refuses a session with a missing or wrong mutation token", async () => {
    const before = listPushTokens().length;
    const missing = await MINT(post("/tokens/mint", { name: "no-token" }));
    expect(missing.status).toBe(403);

    const wrong = await MINT(post("/tokens/mint", { token: "guessed", name: "no-token" }));
    expect(wrong.status).toBe(403);
    expect(listPushTokens().length).toBe(before);
  });

  it("refuses a bad name and mints nothing", async () => {
    const before = listPushTokens().length;
    for (const name of ["", "   ", "laptop/ci", "tab\there", "x".repeat(65), "naïve"]) {
      const response = await MINT(post("/tokens/mint", { token, name }));
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe("/tokens?token=bad_token_name");
      expect(shownId(response)).toBeNull();
    }
    expect(listPushTokens().length).toBe(before);
  });

  it("refuses a bad name at the mint itself, whoever calls it", () => {
    const before = listPushTokens().length;
    expect(() => createPushToken("laptop/ci")).toThrow(/push token name/i);
    expect(() => createPushToken(" ")).toThrow(/push token name/i);
    expect(listPushTokens().length).toBe(before);
  });

  it("trims a name and takes the characters it allows", () => {
    expect(readTokenName("  laptop  ")).toBe("laptop");
    expect(readTokenName("CI runner_2-b")).toBe("CI runner_2-b");
    expect(readTokenName("x".repeat(64))).toBe("x".repeat(64));
  });
});

describe("minting", () => {
  it("stores the trimmed name and redirects with only an id", async () => {
    const response = await MINT(post("/tokens/mint", { token, name: "  laptop  " }));
    expect(response.status).toBe(303);
    const id = shownId(response);
    expect(id).not.toBeNull();
    expect(response.headers.get("location")).toBe(`/tokens?shown=${id}`);

    const minted = listPushTokens().find((record) => record.name === "laptop");
    expect(minted).toBeDefined();
    expect(minted?.lastUsedAt).toBeNull();
    expect(typeof minted?.createdAt).toBe("string");

    const secret = takeMintedSecret(id);
    expect(secret).toMatch(/^hosti_/);
  });

  it("shows the secret exactly once", async () => {
    const response = await MINT(post("/tokens/mint", { token, name: "once-only" }));
    const id = shownId(response);
    expect(takeMintedSecret(id)).toMatch(/^hosti_/);
    // A reload, a back button or anybody replaying the URL gets nothing.
    expect(takeMintedSecret(id)).toBeNull();
  });

  it("forgets a secret nobody came back for", async () => {
    const response = await MINT(post("/tokens/mint", { token, name: "left-waiting" }));
    const id = shownId(response);
    const anHourLater = Date.now() + 60 * 60 * 1000;
    expect(takeMintedSecret(id, anHourLater)).toBeNull();
  });

  it("holds nothing for an id nobody minted", () => {
    expect(takeMintedSecret("made-up")).toBeNull();
    expect(takeMintedSecret(null)).toBeNull();
  });
});

describe("what a token route may say out loud", () => {
  it("puts no secret and no digest in any response, only the one-time value", async () => {
    const { response, secret } = await mint("quiet");
    const digest = hashToken(secret);
    const seen = [
      `${response.status} ${response.headers.get("location")}`,
      await response.text(),
    ].join("\n");
    expect(seen).not.toContain(secret);
    expect(seen).not.toContain(digest);
    // The secret is not in the URL either, which is where history and logs read.
    expect(response.headers.get("location")).not.toContain("hosti_");

    const refused = await MINT(post("/tokens/mint", { token, name: "bad/name" }));
    const refusedText = `${refused.headers.get("location")}\n${await refused.text()}`;
    expect(refusedText).not.toContain("hosti_");

    const record = listPushTokens().find((one) => one.name === "quiet");
    const listed = JSON.stringify(record);
    expect(listed).not.toContain(secret);
    expect(listed).not.toContain(digest);
    expect(Object.keys(record ?? {}).sort()).toEqual(["createdAt", "id", "lastUsedAt", "name"]);
  });

  it("says nothing about a secret when it revokes one", async () => {
    const { secret } = await mint("gone-quiet");
    const id = listPushTokens().find((one) => one.name === "gone-quiet")?.id ?? 0;
    const response = await REVOKE(post("/tokens/revoke", { token, id: String(id) }));
    const seen = `${response.headers.get("location")}\n${await response.text()}`;
    expect(seen).not.toContain(secret);
    expect(seen).not.toContain(hashToken(secret));
  });
});

describe("who may revoke a push token", () => {
  it("refuses a caller with no admin session, and one with a wrong token", async () => {
    const { secret } = await mint("survivor");
    const id = listPushTokens().find((one) => one.name === "survivor")?.id ?? 0;

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
});

describe("revoking", () => {
  it("makes a later push with that secret fail with 401", async () => {
    const { secret } = await mint("doomed-token");
    expect((await push(secret, "wrote-once", await tarFixture("single-file"))).status).toBe(201);

    const id = listPushTokens().find((one) => one.name === "doomed-token")?.id ?? 0;
    const response = await REVOKE(post("/tokens/revoke", { token, id: String(id) }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/tokens");
    expect(listPushTokens().some((one) => one.id === id)).toBe(false);

    const after = await push(secret, "wrote-once", await tarFixture("single-file"));
    expect(after.status).toBe(401);
    expect(await after.json()).toMatchObject({ error: "unauthorized" });
  });

  it("leaves the name on the revisions it already wrote", async () => {
    const { findBundle, listRevisions } = await import("@/server/catalog");
    const bundle = findBundle("wrote-once");
    expect(listRevisions(bundle?.id ?? 0)[0]?.pushedBy).toBe("doomed-token");
  });

  it("says so when there was no such token to take away", () => {
    expect(deletePushToken(99_999)).toBe(false);
  });
});

describe("a push token still cannot reach the catalog's own writes", () => {
  it("refuses a bearer on the mint route, however good the token is", async () => {
    const { secret } = await mint("bearer-try");
    const before = listPushTokens().length;
    const request = new Request(`${ORIGIN}/tokens/mint`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Bearer ${secret}`,
      },
      body: new URLSearchParams({ token, name: "sneaked-in" }),
    });
    const response = await MINT(request);
    expect(response.status).toBe(401);
    expect(listPushTokens().length).toBe(before);
  });
});

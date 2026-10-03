import fs from "node:fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { BOARD_APP_HASH, BOARD_APP_PASSWORD } from "./owner-hash-vector";
import { ownerPasswordHash, useTempDataDir } from "./test-fixtures";

const SECRET = "a-long-random-string-for-tests";
const PASSWORD = "the-owner-password";
const ORIGIN = "http://127.0.0.1:3000";

process.env.HOSTI_SECRET = SECRET;
const hash = ownerPasswordHash(PASSWORD);
process.env.HOSTI_OWNER_PASSWORD_HASH = hash;

const { POST: LOGIN } = await import("@/app/login/submit/route");
const { OWNER_PASSWORD_HASH_VAR, missingAdminVars } = await import("@/server/auth/config");
const { hashOwnerPassword, verifyOwnerPassword, verifySession } = await import("./support");

let caller = 0;
function login(password: string): Promise<Response> {
  caller += 1;
  return LOGIN(
    new Request(`${ORIGIN}/login/submit`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-forwarded-for": `203.0.113.${caller}`,
      },
      body: new URLSearchParams({ password }),
    }),
  );
}

function sessionFrom(response: Response): string | null {
  const cookie = response.headers.get("set-cookie");
  return cookie ? (cookie.slice(cookie.indexOf("=") + 1).split(";")[0] ?? null) : null;
}

let dataDir: string;

beforeAll(async () => {
  dataDir = await useTempDataDir();
  process.env.HOSTI_OWNER_PASSWORD_HASH = hash;
});

afterEach(() => {
  process.env.HOSTI_OWNER_PASSWORD_HASH = hash;
  delete process.env.HOSTI_OWNER_PASSWORD;
});

afterAll(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

describe("logging in against the owner password hash", () => {
  it("signs the owner in with the right password", async () => {
    const response = await login(PASSWORD);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/");
    const session = sessionFrom(response);
    expect(session).not.toBeNull();
    expect(verifySession(SECRET, session)).not.toBeNull();
  });

  it("refuses a wrong password, a near miss and an empty one", async () => {
    for (const password of ["nope", `${PASSWORD} `, PASSWORD.toUpperCase(), ""]) {
      const response = await login(password);
      expect(response.headers.get("location")).toBe("/login?error=bad");
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  });

  it("signs in with a hash made by board-app, and folds the password with NFKC", async () => {
    process.env.HOSTI_OWNER_PASSWORD_HASH = ` ${BOARD_APP_HASH}\n`;
    expect((await login(BOARD_APP_PASSWORD)).headers.get("location")).toBe("/");
    expect((await login("pässwörd 123 ok")).headers.get("location")).toBe("/");
    expect((await login("pässwörd 124 ok")).headers.get("location")).toBe("/login?error=bad");
  });

  it("makes hashes board-app's format and that verify both ways", async () => {
    const made = await hashOwnerPassword("a fresh password");
    expect(made).toMatch(/^scrypt:16384:8:1:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]{43}$/);
    expect(await verifyOwnerPassword("a fresh password", made)).toBe(true);
    expect(await verifyOwnerPassword("another password", made)).toBe(false);
    expect(await verifyOwnerPassword(BOARD_APP_PASSWORD, BOARD_APP_HASH)).toBe(true);
    expect(await verifyOwnerPassword("wrong", BOARD_APP_HASH)).toBe(false);
  });

  it("treats a malformed hash as not configured, with no crash and no cookie", async () => {
    const malformed = [
      PASSWORD,
      "scrypt",
      "scrypt:16384:8:1:short:short",
      "scrypt:16384:8:1",
      `${hash.slice(0, -1)}!`,
      hash.replace(":16384:", ":1024:"),
    ];
    for (const value of malformed) {
      process.env.HOSTI_OWNER_PASSWORD_HASH = value;
      expect(missingAdminVars()).toEqual([OWNER_PASSWORD_HASH_VAR]);
      const response = await login(PASSWORD);
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe("/login");
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(await verifyOwnerPassword(PASSWORD, value)).toBe(false);
    }
  });

  it("no longer reads the plain HOSTI_OWNER_PASSWORD", async () => {
    delete process.env.HOSTI_OWNER_PASSWORD_HASH;
    process.env.HOSTI_OWNER_PASSWORD = PASSWORD;
    expect(missingAdminVars()).toEqual([OWNER_PASSWORD_HASH_VAR]);
    const response = await login(PASSWORD);
    expect(response.headers.get("location")).toBe("/login");
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

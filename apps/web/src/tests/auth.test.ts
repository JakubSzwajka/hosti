import { afterEach, describe, expect, it } from "vitest";
import {
  adminSecrets,
  missingAdminVars,
  OWNER_PASSWORD_HASH_VAR,
  SECRET_VAR,
  signingSecret,
} from "@/server/auth/config";
import {
  expiredSessionCookie,
  isSecureRequest,
  readCookie,
  sessionCookie,
} from "@/server/auth/cookie";
import { SESSION_COOKIE } from "./support";
import { ownerPasswordHash } from "./test-fixtures";

const SECRET = "a-long-random-string-for-tests";
const HASH = ownerPasswordHash("hunter2-for-tests");

describe("the configured secrets", () => {
  const savedPassword = process.env[OWNER_PASSWORD_HASH_VAR];
  const savedSecret = process.env[SECRET_VAR];

  afterEach(() => {
    if (savedPassword === undefined) delete process.env[OWNER_PASSWORD_HASH_VAR];
    else process.env[OWNER_PASSWORD_HASH_VAR] = savedPassword;
    if (savedSecret === undefined) delete process.env[SECRET_VAR];
    else process.env[SECRET_VAR] = savedSecret;
  });

  it("strips the whitespace a deployment panel pastes in", () => {
    process.env[OWNER_PASSWORD_HASH_VAR] = `  ${HASH}\r\n`;
    process.env[SECRET_VAR] = ` ${SECRET} `;
    expect(adminSecrets()).toEqual({ passwordHash: HASH, secret: SECRET });
  });

  it("hands the session and the PIN gate the same signing key", () => {
    process.env[OWNER_PASSWORD_HASH_VAR] = HASH;
    process.env[SECRET_VAR] = `${SECRET}\n`;
    expect(adminSecrets()?.secret).toBe(signingSecret());
  });

  it("is null when either value is missing or only whitespace", () => {
    process.env[OWNER_PASSWORD_HASH_VAR] = "   ";
    process.env[SECRET_VAR] = SECRET;
    expect(adminSecrets()).toBeNull();
    delete process.env[SECRET_VAR];
    process.env[OWNER_PASSWORD_HASH_VAR] = HASH;
    expect(adminSecrets()).toBeNull();
  });

  it("counts a value that is not a well-formed hash as not configured", () => {
    process.env[SECRET_VAR] = SECRET;
    for (const value of ["hunter2", "scrypt:16384:8:1:short:short", HASH.slice(0, -1)]) {
      process.env[OWNER_PASSWORD_HASH_VAR] = value;
      expect(adminSecrets()).toBeNull();
      expect(missingAdminVars()).toEqual([OWNER_PASSWORD_HASH_VAR]);
    }
  });
});

describe("cookie plumbing", () => {
  it("writes an HttpOnly, SameSite=Lax cookie and adds Secure only on TLS", () => {
    const plain = sessionCookie("value", { secure: false });
    expect(plain).toContain(`${SESSION_COOKIE}=value`);
    expect(plain).toContain("HttpOnly");
    expect(plain).toContain("SameSite=Lax");
    expect(plain).not.toContain("Secure");
    expect(sessionCookie("value", { secure: true })).toContain("Secure");
  });

  it("expires the cookie on the way out", () => {
    expect(expiredSessionCookie({ secure: false })).toContain("Max-Age=0");
  });

  it("finds one cookie among several", () => {
    const headers = new Headers({ cookie: `other=1; ${SESSION_COOKIE}=abc.def; last=2` });
    expect(readCookie(headers, SESSION_COOKIE)).toBe("abc.def");
    expect(readCookie(headers, "missing")).toBeNull();
    expect(readCookie(new Headers(), SESSION_COOKIE)).toBeNull();
  });

  it("reads TLS from the proxy header or the URL", () => {
    expect(isSecureRequest(new Request("http://localhost:3000/"))).toBe(false);
    expect(isSecureRequest(new Request("https://hosti.example.com/"))).toBe(true);
    expect(
      isSecureRequest(
        new Request("http://localhost:3000/", { headers: { "x-forwarded-proto": "https" } }),
      ),
    ).toBe(true);
  });
});

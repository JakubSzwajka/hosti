import { afterEach, describe, expect, it } from "vitest";
import { adminSecrets, OWNER_PASSWORD_VAR, SECRET_VAR, signingSecret } from "@/server/auth/config";
import {
  expiredSessionCookie,
  isSecureRequest,
  readCookie,
  sessionCookie,
} from "@/server/auth/cookie";
import { createLoginLimiter } from "@/server/auth/rate-limit";
import {
  checkMutationToken,
  constantTimeEquals,
  mutationToken,
  SESSION_COOKIE,
  signSession,
  verifySession,
} from "@/server/auth/session";

const SECRET = "a-long-random-string-for-tests";

describe("the admin session cookie", () => {
  it("signs a value it can read back", () => {
    const session = verifySession(SECRET, signSession(SECRET));
    expect(session).not.toBeNull();
    expect(session?.nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(session?.exp).toBeGreaterThan(Date.now());
  });

  it("gives every session its own nonce", () => {
    const first = verifySession(SECRET, signSession(SECRET));
    const second = verifySession(SECRET, signSession(SECRET));
    expect(first?.nonce).not.toBe(second?.nonce);
  });

  it("refuses a payload someone edited", () => {
    const [payload, signature] = signSession(SECRET).split(".") as [string, string];
    const forged = Buffer.from(
      JSON.stringify({ iat: 0, exp: Date.now() + 1e6, nonce: "deadbeef" }),
    ).toString("base64url");
    expect(verifySession(SECRET, `${forged}.${signature}`)).toBeNull();
    expect(verifySession(SECRET, `${payload}.${signature}x`)).toBeNull();
  });

  it("refuses a cookie signed with another secret", () => {
    expect(verifySession(SECRET, signSession("some-other-secret"))).toBeNull();
  });

  it("refuses rubbish, an empty value and a missing one", () => {
    expect(verifySession(SECRET, undefined)).toBeNull();
    expect(verifySession(SECRET, "")).toBeNull();
    expect(verifySession(SECRET, "not-a-session")).toBeNull();
    expect(verifySession(SECRET, "a.b.c")).toBeNull();
  });

  it("refuses a session past its expiry", () => {
    const value = signSession(SECRET, { maxAgeSeconds: 60 });
    expect(verifySession(SECRET, value, Date.now() + 61_000)).toBeNull();
    expect(verifySession(SECRET, value, Date.now() + 30_000)).not.toBeNull();
  });
});

describe("comparing the owner password", () => {
  it("accepts only the exact string", () => {
    expect(constantTimeEquals("hunter2", "hunter2")).toBe(true);
    expect(constantTimeEquals("hunter2", "hunter3")).toBe(false);
    expect(constantTimeEquals("hunter2", "hunter")).toBe(false);
    expect(constantTimeEquals("hunter2", "hunter22")).toBe(false);
    expect(constantTimeEquals("hunter2", "")).toBe(false);
  });

  it("survives a length mismatch instead of throwing", () => {
    expect(() => constantTimeEquals("a", "a much longer password")).not.toThrow();
  });
});

describe("the configured secrets", () => {
  const savedPassword = process.env[OWNER_PASSWORD_VAR];
  const savedSecret = process.env[SECRET_VAR];

  afterEach(() => {
    if (savedPassword === undefined) delete process.env[OWNER_PASSWORD_VAR];
    else process.env[OWNER_PASSWORD_VAR] = savedPassword;
    if (savedSecret === undefined) delete process.env[SECRET_VAR];
    else process.env[SECRET_VAR] = savedSecret;
  });

  it("strips the whitespace a deployment panel pastes in", () => {
    process.env[OWNER_PASSWORD_VAR] = "  hunter2\r\n";
    process.env[SECRET_VAR] = ` ${SECRET} `;
    expect(adminSecrets()).toEqual({ password: "hunter2", secret: SECRET });
  });

  it("hands the session and the PIN gate the same signing key", () => {
    process.env[OWNER_PASSWORD_VAR] = "hunter2";
    process.env[SECRET_VAR] = `${SECRET}\n`;
    expect(adminSecrets()?.secret).toBe(signingSecret());
  });

  it("is null when either value is missing or only whitespace", () => {
    process.env[OWNER_PASSWORD_VAR] = "   ";
    process.env[SECRET_VAR] = SECRET;
    expect(adminSecrets()).toBeNull();
    delete process.env[SECRET_VAR];
    process.env[OWNER_PASSWORD_VAR] = "hunter2";
    expect(adminSecrets()).toBeNull();
  });
});

describe("the mutation token", () => {
  const session = verifySession(SECRET, signSession(SECRET));
  if (!session) throw new Error("session should verify");

  it("matches the value the page renders", () => {
    expect(checkMutationToken(SECRET, session, mutationToken(SECRET, session))).toBe(true);
  });

  it("rejects a missing, empty or wrong value", () => {
    expect(checkMutationToken(SECRET, session, null)).toBe(false);
    expect(checkMutationToken(SECRET, session, "")).toBe(false);
    expect(checkMutationToken(SECRET, session, "guessed")).toBe(false);
  });

  it("rejects the token from another session", () => {
    const other = verifySession(SECRET, signSession(SECRET));
    if (!other) throw new Error("session should verify");
    expect(checkMutationToken(SECRET, session, mutationToken(SECRET, other))).toBe(false);
  });
});

describe("the login rate limit", () => {
  it("allows a fresh caller", () => {
    expect(createLoginLimiter().check("1.2.3.4").allowed).toBe(true);
  });

  it("locks after the fifth wrong password and says how long", () => {
    const limiter = createLoginLimiter({ maxAttempts: 3, lockMs: 60_000 });
    expect(limiter.fail("1.2.3.4").allowed).toBe(true);
    expect(limiter.fail("1.2.3.4").allowed).toBe(true);
    const third = limiter.fail("1.2.3.4");
    expect(third.allowed).toBe(false);
    expect(third.allowed === false && third.retryAfterSeconds).toBeLessThanOrEqual(60);
    expect(limiter.check("1.2.3.4").allowed).toBe(false);
  });

  it("counts each caller on its own", () => {
    const limiter = createLoginLimiter({ maxAttempts: 2 });
    limiter.fail("1.2.3.4");
    limiter.fail("1.2.3.4");
    expect(limiter.check("1.2.3.4").allowed).toBe(false);
    expect(limiter.check("5.6.7.8").allowed).toBe(true);
  });

  it("forgets failures older than the window", () => {
    const limiter = createLoginLimiter({ maxAttempts: 2, windowMs: 1000 });
    const start = Date.now();
    limiter.fail("1.2.3.4", start);
    expect(limiter.fail("1.2.3.4", start + 2000).allowed).toBe(true);
  });

  it("opens again once the lock runs out", () => {
    const limiter = createLoginLimiter({ maxAttempts: 1, lockMs: 1000 });
    const start = Date.now();
    expect(limiter.fail("1.2.3.4", start).allowed).toBe(false);
    expect(limiter.check("1.2.3.4", start + 1001).allowed).toBe(true);
  });

  it("wipes the history on the right password", () => {
    const limiter = createLoginLimiter({ maxAttempts: 2 });
    limiter.fail("1.2.3.4");
    limiter.succeed("1.2.3.4");
    expect(limiter.fail("1.2.3.4").allowed).toBe(true);
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

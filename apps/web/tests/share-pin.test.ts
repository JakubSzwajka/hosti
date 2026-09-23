import fs from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_SECRET } from "./pin-helpers";
import { useTempDataDir } from "./helpers";

process.env.HOSTI_SECRET = TEST_SECRET;

const { navigate, push, serve, setSharing, unlock } = await import("./api");
const { grantFrom, openLink, protectedLink } = await import("./pin-helpers");
const { tarFixture } = await import("./helpers");
const { createPushToken } = await import("@/server/push-tokens");
const { hashPin, verifyPin } = await import("@/server/share-pin");
const { signUnlock, unlockCookieName, verifyUnlock } = await import("@/server/serving/unlock");
const { isValidPin } = await import("@hosti/shared");

let dataDir: string;
let token: string;

const opened = (slug: string, options?: { pin?: string }) => protectedLink(token, slug, options);

const BOUND = { bundleId: 7, pinHash: "scrypt$16384$8$1$salt$key" };

beforeAll(async () => {
  dataDir = await useTempDataDir();
  token = createPushToken("test").secret;
});

afterAll(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

describe("hashing a pin", () => {
  it("verifies the pin it was made from", async () => {
    const hash = await hashPin("4821");
    expect(await verifyPin("4821", hash)).toBe(true);
  });

  it("refuses a pin that is not the one", async () => {
    const hash = await hashPin("4821");
    expect(await verifyPin("4822", hash)).toBe(false);
    expect(await verifyPin("", hash)).toBe(false);
  });

  it("salts every pin, so the same digits never write the same row", async () => {
    const [first, second] = await Promise.all([hashPin("4821"), hashPin("4821")]);
    expect(first).not.toBe(second);
    expect(first.startsWith("scrypt$")).toBe(true);
  });

  it("never keeps the digits anywhere in the hash", async () => {
    const hash = await hashPin("13571357");
    expect(hash).not.toContain("13571357");
  });

  it("refuses a hash it cannot read", async () => {
    expect(await verifyPin("4821", "")).toBe(false);
    expect(await verifyPin("4821", "plaintext")).toBe(false);
    expect(await verifyPin("4821", "argon2$1$2$3$4$5")).toBe(false);
  });
});

describe("what counts as a pin", () => {
  it("takes four to eight digits", () => {
    expect(isValidPin("4821")).toBe(true);
    expect(isValidPin("13571357")).toBe(true);
  });

  it("refuses three digits, nine digits and letters", () => {
    expect(isValidPin("482")).toBe(false);
    expect(isValidPin("135713571")).toBe(false);
    expect(isValidPin("abcd")).toBe(false);
    expect(isValidPin("48a1")).toBe(false);
    expect(isValidPin("48 21")).toBe(false);
    expect(isValidPin("")).toBe(false);
  });

  it("says so plainly when the API is handed the wrong shape", async () => {
    await push(token, "bad-pin-bundle", await tarFixture("multi-page"));
    for (const pin of ["482", "135713571", "abcd"]) {
      const response = await setSharing(token, "bad-pin-bundle", { mode: "pin", pin });
      expect(response.status).toBe(400);
      const body = (await response.json()) as { error: string; message: string };
      expect(body.error).toBe("bad_pin");
      expect(body.message).not.toContain(pin);
    }
    // Every one of those was refused, so the bundle never opened.
    expect((await serve("/v/bad-pin-bundle/")).status).toBe(404);
  });
});

describe("the gate", () => {
  it("answers a page request with the gate, at the same URL", async () => {
    const link = await opened("gated", { pin: "4821" });
    const response = await navigate(`/v/${link}/`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("This link is protected");
    expect(html).toContain(`action="/v/${link}/unlock"`);
    expect(response.headers.get("location")).toBeNull();
  });

  it("answers an asset with the plain 404", async () => {
    const link = await opened("gated-assets", { pin: "4821" });
    const asset = await serve(`/v/${link}/assets/chart.js`);
    expect(asset.status).toBe(404);
    expect(await asset.text()).not.toContain("This link is protected");
  });

  it("answers the same 404 as an unknown slug once the bundle goes private", async () => {
    const link = await opened("gated-then-private", { pin: "4821" });
    expect((await setSharing(token, "gated-then-private", { mode: "private" })).status).toBe(200);
    const gone = await navigate(`/v/${link}/`);
    const unknown = await navigate("/v/never-pushed-at-all/");
    expect(gone.status).toBe(unknown.status);
    expect(await gone.text()).toBe(await unknown.text());
  });

  it("gives a page request for a deep path the gate too", async () => {
    const link = await opened("gated-deep", { pin: "4821" });
    const response = await navigate(`/v/${link}/athletes/`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain(`value="/v/${link}/athletes/"`);
  });

  it("leaks no bundle title, collection or revision", async () => {
    await push(token, "secret-bundle", await tarFixture("multi-page"), {
      title: "Quarterly numbers",
      collection: "reports",
    });
    const link = await openLink(token, "secret-bundle", { pin: "4821" });
    const html = await navigate(`/v/${link}/`).then((response) => response.text());
    expect(html).not.toContain("Quarterly numbers");
    expect(html).not.toContain("reports");
    expect(html).not.toContain("Squad 2026");
  });

  it("carries Hosti's own headers, not the bundle policy", async () => {
    const link = await opened("gated-headers", { pin: "4821" });
    const response = await navigate(`/v/${link}/`);
    const csp = response.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toContain("unsafe-eval");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("unlocking", () => {
  it("sets a cookie that opens the link, and keeps it open on reload", async () => {
    const link = await opened("unlockable", { pin: "4821" });
    const response = await unlock(link, { pin: "4821", next: `/v/${link}/` });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`/v/${link}/`);

    const cookie = grantFrom(response, unlockCookieName(link));
    const page = await navigate(`/v/${link}/`, { cookie });
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Squad 2026");

    const asset = await serve(`/v/${link}/assets/chart.js`, { cookie });
    expect(asset.status).toBe(200);
  });

  it("scopes the cookie to that one share link", async () => {
    const link = await opened("scoped", { pin: "4821" });
    const response = await unlock(link, { pin: "4821", next: `/v/${link}/` });
    const header = response.headers.get("set-cookie") ?? "";
    expect(header).toContain(`Path=/v/${link}`);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).not.toContain("Secure");
  });

  it("marks the cookie Secure behind TLS", async () => {
    const link = await opened("scoped-tls", { pin: "4821" });
    const response = await unlock(
      link,
      { pin: "4821", next: `/v/${link}/` },
      { "x-forwarded-proto": "https" },
    );
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  it("sends a wrong pin back to the gate with one error line", async () => {
    const link = await opened("wrong-pin", { pin: "4821" });
    const refused = await unlock(link, { pin: "1111", next: `/v/${link}/` });
    expect(refused.status).toBe(303);
    expect(refused.headers.get("location")).toBe(`/v/${link}/?pin=wrong`);
    expect(refused.headers.get("set-cookie")).toBeNull();

    const html = await navigate(`/v/${link}/?pin=wrong`).then((response) => response.text());
    expect(html).toContain("That pin is wrong");
    expect(html).toContain('data-state="wrong"');
  });

  it("asks again once the link has been rotated", async () => {
    const { rotateSharing } = await import("./api");
    const first = await opened("two-doors", { pin: "4821" });

    const response = await unlock(first, { pin: "4821", next: `/v/${first}/` });
    const cookie = grantFrom(response, unlockCookieName(first));
    expect((await navigate(`/v/${first}/`, { cookie })).status).toBe(200);

    const rotated = (await (await rotateSharing(token, "two-doors")).json()) as {
      sharing: { shareSlug: string };
    };
    const second = rotated.sharing.shareSlug;
    expect((await navigate(`/v/${first}/`, { cookie })).status).toBe(404);
    const other = await navigate(`/v/${second}/`, { cookie });
    expect(other.status).toBe(200);
    expect(await other.text()).toContain("This link is protected");
  });

  it("refuses a grant minted for another link", () => {
    const stolen = signUnlock(TEST_SECRET, "some-other-link", BOUND);
    expect(verifyUnlock(TEST_SECRET, "this-link", BOUND, stolen)).toBe(false);
    expect(verifyUnlock(TEST_SECRET, "some-other-link", BOUND, stolen)).toBe(true);
  });

  it("refuses a grant minted for another bundle on the same slug", () => {
    const grant = signUnlock(TEST_SECRET, "reused-slug", BOUND);
    expect(verifyUnlock(TEST_SECRET, "reused-slug", BOUND, grant)).toBe(true);
    const otherBundle = { bundleId: BOUND.bundleId + 1, pinHash: BOUND.pinHash };
    expect(verifyUnlock(TEST_SECRET, "reused-slug", otherBundle, grant)).toBe(false);
  });

  it("refuses a grant once the pin behind it has changed", () => {
    const grant = signUnlock(TEST_SECRET, "pin-moved", BOUND);
    const newPin = { bundleId: BOUND.bundleId, pinHash: "scrypt$16384$8$1$other$hash" };
    expect(verifyUnlock(TEST_SECRET, "pin-moved", newPin, grant)).toBe(false);
  });

  it("refuses a grant that has run out", () => {
    const grant = signUnlock(TEST_SECRET, "expiring", BOUND, { maxAgeSeconds: 60 });
    expect(verifyUnlock(TEST_SECRET, "expiring", BOUND, grant)).toBe(true);
    expect(verifyUnlock(TEST_SECRET, "expiring", BOUND, grant, Date.now() + 61_000)).toBe(false);
  });

  it("refuses a grant signed with another key, or edited", () => {
    const grant = signUnlock(TEST_SECRET, "signed", BOUND);
    expect(verifyUnlock("another-key", "signed", BOUND, grant)).toBe(false);
    expect(verifyUnlock(TEST_SECRET, "signed", BOUND, `${grant}x`)).toBe(false);
    expect(verifyUnlock(TEST_SECRET, "signed", BOUND, null)).toBe(false);
  });

  it("keeps the bundle id and the pin hash out of the cookie", () => {
    const grant = signUnlock(TEST_SECRET, "opaque", BOUND);
    const [payload] = grant.split(".") as [string];
    const claims = Buffer.from(payload, "base64url").toString("utf8");
    expect(claims).not.toContain(BOUND.pinHash);
    expect(claims).toContain("opaque");
  });

  it("will not be turned into an open redirect", async () => {
    const link = await opened("no-redirect", { pin: "4821" });
    const response = await unlock(link, { pin: "4821", next: "https://example.com/" });
    expect(response.headers.get("location")).toBe(`/v/${link}/`);
  });
});

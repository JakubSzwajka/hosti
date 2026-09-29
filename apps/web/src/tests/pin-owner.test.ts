import fs from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_SECRET } from "./pin-helpers";
import { useTempDataDir } from "./test-fixtures";

process.env.HOSTI_SECRET = TEST_SECRET;

const { getBundle, navigate, setSharing, unlock } = await import("./api");
const { openLink, protectedLink } = await import("./pin-helpers");
const { createPushToken } = await import("./support");
const { unlockCookieName } = await import("./support");

let dataDir: string;
let token: string;

const opened = (slug: string, options?: { pin?: string }) => protectedLink(token, slug, options);

beforeAll(async () => {
  dataDir = await useTempDataDir();
  token = createPushToken("test").secret;
});

afterAll(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

describe("the attempt budget", () => {
  it("locks after ten wrong pins and then refuses the right one", async () => {
    const link = await opened("brute-forced", { pin: "4821" });
    const caller = { "x-forwarded-for": "203.0.113.7" };

    for (let attempt = 0; attempt < 9; attempt += 1) {
      const refused = await unlock(link, { pin: "0000", next: `/v/${link}/` }, caller);
      expect(refused.headers.get("location")).toBe(`/v/${link}/?pin=wrong`);
    }
    const tenth = await unlock(link, { pin: "0000", next: `/v/${link}/` }, caller);
    expect(tenth.headers.get("location")).toBe(`/v/${link}/?pin=locked`);

    const eleventh = await unlock(link, { pin: "0000", next: `/v/${link}/` }, caller);
    expect(eleventh.headers.get("location")).toBe(`/v/${link}/?pin=locked`);

    const withTheRightPin = await unlock(link, { pin: "4821", next: `/v/${link}/` }, caller);
    expect(withTheRightPin.headers.get("location")).toBe(`/v/${link}/?pin=locked`);
    expect(withTheRightPin.headers.get("set-cookie")).toBeNull();
  });

  it("leaves another caller alone", async () => {
    const link = await opened("one-bad-caller", { pin: "4821" });
    const noisy = { "x-forwarded-for": "198.51.100.1" };
    for (let attempt = 0; attempt < 11; attempt += 1) {
      await unlock(link, { pin: "0000", next: `/v/${link}/` }, noisy);
    }
    const other = await unlock(
      link,
      { pin: "4821", next: `/v/${link}/` },
      { "x-forwarded-for": "198.51.100.2" },
    );
    expect(other.headers.get("location")).toBe(`/v/${link}/`);
    expect(other.headers.get("set-cookie")).toContain(unlockCookieName(link));
  });
});

describe("the owner moving a pin", () => {
  it("opens the link again once the bundle drops to a plain link", async () => {
    const link = await opened("un-pinned", { pin: "4821" });
    expect(await navigate(`/v/${link}/`).then((r) => r.text())).toContain("This link is protected");

    const dropped = await setSharing(token, "un-pinned", { mode: "link" });
    expect(dropped.status).toBe(200);
    expect(await dropped.json()).toMatchObject({ sharing: { mode: "link", hasPin: false } });

    const page = await navigate(`/v/${link}/`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Squad 2026");
  });

  it("puts a pin on a bundle that had none", async () => {
    const link = await opened("late-pin");
    expect((await navigate(`/v/${link}/`)).status).toBe(200);

    expect((await setSharing(token, "late-pin", { mode: "pin", pin: "1234" })).status).toBe(200);
    expect(await navigate(`/v/${link}/`).then((r) => r.text())).toContain("This link is protected");

    const response = await unlock(link, { pin: "1234", next: `/v/${link}/` });
    expect(response.headers.get("set-cookie")).toContain(unlockCookieName(link));
  });

  it("replaces a pin, and the old one stops working", async () => {
    const link = await opened("replaced-pin", { pin: "4821" });
    expect((await setSharing(token, "replaced-pin", { mode: "pin", pin: "5555" })).status).toBe(
      200,
    );

    const old = await unlock(link, { pin: "4821", next: `/v/${link}/` });
    expect(old.headers.get("location")).toBe(`/v/${link}/?pin=wrong`);

    const now = await unlock(link, { pin: "5555", next: `/v/${link}/` });
    expect(now.headers.get("location")).toBe(`/v/${link}/`);
  });

  it("refuses the wrong shape and quotes nothing it was sent", async () => {
    await opened("guarded-pin", { pin: "4821" });
    const response = await setSharing(token, "guarded-pin", { mode: "pin", pin: "12" });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; message: string };
    expect(body.error).toBe("bad_pin");
    expect(body.message).not.toContain("12");
  });

  it("404s on a bundle that is not there", async () => {
    expect((await setSharing(token, "nothing-here", { mode: "pin", pin: "4821" })).status).toBe(
      404,
    );
  });

  it("needs a push token", async () => {
    await opened("pin-needs-token", { pin: "4821" });
    const { PUT } = await import("@/app/api/v1/bundles/[slug]/sharing/route");
    const response = await PUT(
      new Request("http://localhost:3000/api/v1/bundles/pin-needs-token/sharing", {
        method: "PUT",
        body: JSON.stringify({ mode: "private" }),
      }),
      { params: Promise.resolve({ slug: "pin-needs-token" }) },
    );
    expect(response.status).toBe(401);
    // The refused call changed nothing.
    expect((await navigate("/v/pin-needs-token/")).status).toBe(200);
  });

  it("never reports the digits back, only that a pin is there", async () => {
    await opened("never-echoed", { pin: "4821" });
    const body = await getBundle(token, "never-echoed").then((r) => r.text());
    expect(body).toContain('"hasPin":true');
    expect(body).not.toContain("4821");
  });

  it("leaves a pushed bundle private however it arrived", async () => {
    const { push } = await import("./api");
    const { tarFixture } = await import("./test-fixtures");
    await push(token, "push-stays-private", await tarFixture("multi-page"));
    const body = (await (await getBundle(token, "push-stays-private")).json()) as {
      bundle: { sharing: { mode: string } };
    };
    expect(body.bundle.sharing.mode).toBe("private");
    expect((await navigate("/v/push-stays-private/")).status).toBe(404);

    // A second push onto a link bundle leaves that bundle on link.
    await openLink(token, "push-stays-private", { mode: "link" });
    await push(token, "push-stays-private", await tarFixture("multi-page"));
    const after = (await (await getBundle(token, "push-stays-private")).json()) as {
      bundle: { sharing: { mode: string } };
    };
    expect(after.bundle.sharing.mode).toBe("link");
  });
});

describe("a link with no pin", () => {
  it("opens straight away, no gate", async () => {
    const link = await opened("wide-open");
    const page = await navigate(`/v/${link}/`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Squad 2026");
  });

  it("swallows a POST to unlock rather than gating anything", async () => {
    const link = await opened("open-unlock");
    const response = await unlock(link, { pin: "0000", next: `/v/${link}/` });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`/v/${link}/`);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("404s a POST to any other path under /v/", async () => {
    const link = await opened("no-other-post");
    const { POST } = await import("@/app/v/[slug]/[[...path]]/route");
    const response = await POST(
      new Request(`http://localhost:3000/v/${link}/index.html`, { method: "POST" }),
    );
    expect(response.status).toBe(404);
  });
});

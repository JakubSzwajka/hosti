/**
 * What kills an unlock grant that is already out in the world.
 *
 * A grant is signed over the share slug, the bundle row it resolved to and the
 * pin hash guarding it, so three things end every grant at once: a rotate, a
 * pin change, and deleting the bundle and building it again on the same slug.
 * Hosti stores no session for a guest, so the signature is the only place this
 * can be enforced.
 */
import fs from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_SECRET } from "./pin-helpers";
import { useTempDataDir } from "./helpers";

process.env.HOSTI_SECRET = TEST_SECRET;

const { navigate, removeBundle, rotateSharing, unlock } = await import("./api");
const { grantFrom, openLink, protectedLink } = await import("./pin-helpers");
const { createPushToken } = await import("@/server/push-tokens");
const { unlockCookieName } = await import("@/server/serving/unlock");

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

/** Unlock a link and hand back the cookie a browser would keep. */
async function grantFor(link: string, pin: string): Promise<string> {
  const response = await unlock(link, { pin, next: `/v/${link}/` });
  if (response.status !== 303) throw new Error(`unlock failed: ${response.status}`);
  return grantFrom(response, unlockCookieName(link));
}

describe("what kills an outstanding grant", () => {
  it("a rotate, because the fresh link asks again", async () => {
    const link = await opened("kill-by-rotate", { pin: "4821" });
    const cookie = await grantFor(link, "4821");
    expect((await navigate(`/v/${link}/`, { cookie })).status).toBe(200);

    const rotated = (await (await rotateSharing(token, "kill-by-rotate")).json()) as {
      sharing: { shareSlug: string };
    };
    // Send the old grant at the new address under the new cookie name, which is
    // the most a leaked grant could ever manage.
    const renamed = cookie.replace(
      unlockCookieName(link),
      unlockCookieName(rotated.sharing.shareSlug),
    );
    const asked = await navigate(`/v/${rotated.sharing.shareSlug}/`, { cookie: renamed });
    expect(asked.status).toBe(200);
    expect(await asked.text()).toContain("This link is protected");
  });

  it("a new pin on the same link", async () => {
    const link = await opened("kill-by-new-pin", { pin: "4821" });
    const cookie = await grantFor(link, "4821");
    expect((await navigate(`/v/${link}/`, { cookie })).status).toBe(200);

    await openLink(token, "kill-by-new-pin", { pin: "5555" });
    const asked = await navigate(`/v/${link}/`, { cookie });
    expect(asked.status).toBe(200);
    expect(await asked.text()).toContain("This link is protected");
  });

  it("taking the pin off and putting one back on", async () => {
    const link = await opened("kill-by-pin-off", { pin: "4821" });
    const cookie = await grantFor(link, "4821");

    await openLink(token, "kill-by-pin-off", { mode: "link" });
    // The same digits again, but a fresh salt, so the old grant is worthless.
    await openLink(token, "kill-by-pin-off", { pin: "4821" });
    const asked = await navigate(`/v/${link}/`, { cookie });
    expect(await asked.text()).toContain("This link is protected");
  });

  it("deleting the bundle and building it again on the same slug", async () => {
    const link = await opened("kill-by-delete", { pin: "4821" });
    const cookie = await grantFor(link, "4821");
    expect((await navigate(`/v/${link}/`, { cookie })).status).toBe(200);

    expect((await removeBundle(token, "kill-by-delete")).status).toBe(200);
    // Same slug, same digits, a brand new bundle behind them.
    const again = await opened("kill-by-delete", { pin: "4821" });
    expect(again).toBe(link);

    const asked = await navigate(`/v/${link}/`, { cookie });
    expect(asked.status).toBe(200);
    expect(await asked.text()).toContain("This link is protected");
  });
});

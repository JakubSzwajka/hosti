import fs from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_SECRET } from "./pin-helpers";
import { tarFixture, useTempDataDir } from "./test-fixtures";

process.env.HOSTI_SECRET = TEST_SECRET;

const { push, serve, setSharing, shareSlugOf } = await import("./api");
const { createPushToken } = await import("./support");

let dataDir: string;
let token: string;

const UNKNOWN = "/v/never-pushed-at-all/missing.css";

async function pushed(slug: string): Promise<void> {
  const response = await push(token, slug, await tarFixture("multi-page"));
  if (response.status !== 201) throw new Error(`push failed: ${await response.text()}`);
}

async function share(slug: string, body: { mode: string; pin?: string }): Promise<string> {
  const response = await setSharing(token, slug, body);
  if (response.status !== 200) throw new Error(`sharing failed: ${await response.text()}`);
  return shareSlugOf(response);
}

function headerList(response: Response): [string, string][] {
  return [...response.headers.entries()].sort(([left], [right]) => left.localeCompare(right));
}

beforeAll(async () => {
  dataDir = await useTempDataDir();
  token = createPushToken("test").secret;
});

afterAll(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

describe("a bundle's own 404.html answers only where the bundle would", () => {
  it("gives a pin-locked link the same bytes and headers as an unknown slug", async () => {
    await pushed("locked-404");
    const link = await share("locked-404", { mode: "pin", pin: "4821" });

    const locked = await serve(`/v/${link}/missing.css`);
    const unknown = await serve(UNKNOWN);

    expect(locked.status).toBe(404);
    expect(unknown.status).toBe(404);
    const [lockedBody, unknownBody] = await Promise.all([locked.text(), unknown.text()]);
    expect(lockedBody).toBe(unknownBody);
    expect(lockedBody).not.toContain("This squad page is missing");
    expect(headerList(locked)).toEqual(headerList(unknown));
  });

  it("gives a private bundle the same bytes and headers as an unknown slug", async () => {
    await pushed("private-404");
    // Open it first, so the row really did hold a live link before it shut.
    const link = await share("private-404", { mode: "link" });
    await share("private-404", { mode: "private" });

    const closed = await serve(`/v/${link}/missing.css`);
    const unknown = await serve(UNKNOWN);

    expect(closed.status).toBe(404);
    const [closedBody, unknownBody] = await Promise.all([closed.text(), unknown.text()]);
    expect(closedBody).toBe(unknownBody);
    expect(closedBody).not.toContain("This squad page is missing");
    expect(headerList(closed)).toEqual(headerList(unknown));
  });

  it("still serves an open link its own 404.html, which is the point of shipping one", async () => {
    await pushed("open-404");
    const link = await share("open-404", { mode: "link" });

    const response = await serve(`/v/${link}/missing.css`);
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("This squad page is missing");
  });

  it("keeps the parity for a page request too, once the pin is on", async () => {
    await pushed("locked-404-page");
    const link = await share("locked-404-page", { mode: "pin", pin: "4821" });
    const { navigate } = await import("./api");
    const gate = await navigate(`/v/${link}/missing.css`);
    expect(gate.status).toBe(200);
    const html = await gate.text();
    expect(html).toContain("This link is protected");
    expect(html).not.toContain("This squad page is missing");
  });
});

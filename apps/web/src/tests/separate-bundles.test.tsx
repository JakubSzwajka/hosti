import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ownerPasswordHash, useTempDataDir } from "./test-fixtures";

const SECRET = "a-long-random-string-for-tests";
process.env.HOSTI_OWNER_PASSWORD_HASH = ownerPasswordHash("the-owner-password");
process.env.HOSTI_SECRET = SECRET;

const ORIGIN = "http://127.0.0.1:3000";

let signedCookie: string | null = null;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (signedCookie ? { value: signedCookie } : undefined),
  }),
  headers: async () => new Headers({ host: "hosti.test", "x-forwarded-proto": "https" }),
}));

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

let dataDir: string;

beforeAll(async () => {
  dataDir = await useTempDataDir();
  const support = await import("./support");
  signedCookie = support.signSession(SECRET);
});

afterAll(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

describe("route handlers and pages in separate bundles", () => {
  it("show the approval page for a connection the API created", async () => {
    // Next bundles the API route and the /connect page apart, so each evaluates runtime.ts.
    const { POST: CREATE } = await import("@/app/api/v1/agent-authorizations/route");
    const response = await CREATE(
      new Request(`${ORIGIN}/api/v1/agent-authorizations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tokenName: "separate-bundles",
          tokenDigest: sha256(`hosti_${randomBytes(24).toString("base64url")}`),
          pollingDigest: sha256(randomBytes(24).toString("base64url")),
          scopes: ["publish"],
        }),
      }),
    );
    expect(response.status).toBe(201);
    const { id, userCode } = (await response.json()) as { id: string; userCode: string };

    vi.resetModules();
    const ConnectPage = (await import("@/app/connect/[id]/page")).default;
    const html = renderToStaticMarkup(
      await ConnectPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) }),
    );

    expect(html).not.toContain("No such connection");
    expect(html).toContain(userCode);
  });
});

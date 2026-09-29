import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import { MAX_PENDING_CONNECTIONS } from "@hosti/identity";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { useTempDataDir } from "./test-fixtures";

const { POST: CREATE } = await import("@/app/api/v1/agent-authorizations/route");

let dataDir: string;

function digest(): string {
  return createHash("sha256").update(randomBytes(24)).digest("hex");
}

function create(name: string): Promise<Response> {
  return CREATE(
    new Request("http://127.0.0.1:3000/api/v1/agent-authorizations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tokenName: name,
        tokenDigest: digest(),
        pollingDigest: digest(),
        scopes: ["publish"],
      }),
    }),
  );
}

beforeAll(async () => {
  dataDir = await useTempDataDir();
});

afterAll(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

describe("the pending cap", () => {
  it("answers 429 once too many connections wait for the owner", async () => {
    expect(MAX_PENDING_CONNECTIONS).toBe(20);
    for (let index = 0; index < MAX_PENDING_CONNECTIONS; index += 1) {
      expect((await create(`agent ${index}`)).status).toBe(201);
    }
    const over = await create("one too many");
    expect(over.status).toBe(429);
    expect(await over.json()).toMatchObject({ error: "too_many_pending" });
  });
});

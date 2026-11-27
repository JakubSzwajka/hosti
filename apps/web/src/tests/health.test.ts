import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appCommit } from "@/app/api/health/app-commit";
import { GET } from "@/app/api/health/route";
import { privateRequest } from "./support";

const HEALTH_URL = "http://localhost:3000/api/health";
const health = () => GET(privateRequest(HEALTH_URL));

const SHA = "0123456789abcdef0123456789abcdef01234567";

beforeEach(() => {
  // An image built without the build arg; tests that need a commit stub one.
  vi.stubEnv("APP_COMMIT", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/health", () => {
  it("answers 200 ok with no-store and no login on the private channel", async () => {
    const response = await health();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ status: "ok", commit: "unknown" });
  });

  it("reports the first 12 characters of APP_COMMIT", async () => {
    vi.stubEnv("APP_COMMIT", SHA);
    expect(await (await health()).json()).toEqual({ status: "ok", commit: "0123456789ab" });
  });

  it("reads APP_COMMIT per request, not once at load", async () => {
    vi.stubEnv("APP_COMMIT", "aaaaaaaaaaaaaaaa");
    expect((await (await health()).json()).commit).toBe("aaaaaaaaaaaa");
    vi.stubEnv("APP_COMMIT", "bbbbbbbbbbbbbbbb");
    expect((await (await health()).json()).commit).toBe("bbbbbbbbbbbb");
  });

  it("answers the public 404 to a connection outside the private channel", async () => {
    const spoofed = new Request(HEALTH_URL, {
      headers: { Host: "localhost:3000", "X-Forwarded-For": "127.0.0.1" },
    });
    const response = await GET(spoofed);
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("commit");
  });
});

describe("appCommit", () => {
  it("shortens a full sha to 12 characters", () => {
    expect(appCommit(SHA)).toBe("0123456789ab");
  });

  it("keeps a sha shorter than 12 characters", () => {
    expect(appCommit("abc123")).toBe("abc123");
  });

  it("says unknown when unset or blank", () => {
    expect(appCommit(undefined)).toBe("unknown");
    expect(appCommit("")).toBe("unknown");
    expect(appCommit("  ")).toBe("unknown");
  });
});

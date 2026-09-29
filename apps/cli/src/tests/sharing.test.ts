import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeStub, ROTATED_SLUG } from "./stub-server.ts";

const stub = makeStub();
const hosti = stub.hosti;
let origin: string;

beforeAll(async () => {
  await stub.start();
  origin = stub.origin();
});

afterAll(async () => {
  await stub.stop();
});

describe("hosti share", () => {
  it("moves a bundle to link and prints the URL", async () => {
    stub.setCatalog([{ slug: "atlas", mode: "private" }]);
    const result = await hosti(["share", "atlas", "--mode", "link"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("link");
    expect(result.stdout).toContain(`${origin}/v/atlas/`);
    expect(JSON.parse(stub.lastSharingBody())).toEqual({ mode: "link" });
  });

  it("sends the pin through and never prints it back", async () => {
    stub.setCatalog([{ slug: "atlas", mode: "private" }]);
    const result = await hosti(["share", "atlas", "--mode", "pin", "--pin", "4821"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(stub.lastSharingBody())).toEqual({ mode: "pin", pin: "4821" });
    expect(result.stdout).not.toContain("4821");
    expect(result.stderr).not.toContain("4821");
  });

  it("sends mode pin alone when no digits are given", async () => {
    stub.setCatalog([{ slug: "atlas", mode: "pin" }]);
    const result = await hosti(["share", "atlas", "--mode", "pin"]);
    expect(result.code).toBe(0);
    expect(JSON.parse(stub.lastSharingBody())).toEqual({ mode: "pin" });
  });

  it("prints no URL when it goes private", async () => {
    stub.setCatalog([{ slug: "atlas", mode: "link" }]);
    const result = await hosti(["share", "atlas", "--mode", "private"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("private");
    expect(result.stdout).not.toContain("/v/");
  });

  it("passes the server's refusal on, exit 1", async () => {
    stub.setCatalog([{ slug: "atlas", mode: "private" }]);
    const result = await hosti(["share", "atlas", "--mode", "pin"]);
    expect(result.code).toBe(1);
    expect(result.stderr.trim().split("\n").at(-1)).toBe('Mode "pin" needs a pin');
  });

  it("refuses a pin under any other mode before a request leaves", async () => {
    stub.setCatalog([{ slug: "atlas", mode: "private" }]);
    const result = await hosti(["share", "atlas", "--mode", "link", "--pin", "4821"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("--pin only goes with --mode pin");
  });

  it("exits non-zero on an unknown bundle", async () => {
    stub.setCatalog([]);
    const result = await hosti(["share", "ghost", "--mode", "link"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('No bundle is called "ghost"');
  });
});

describe("hosti rotate", () => {
  it("says the old URL stopped answering and prints the new one", async () => {
    stub.setCatalog([{ slug: "atlas", mode: "link" }]);
    const result = await hosti(["rotate", "atlas"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("the old URL stopped answering");
    expect(result.stdout).toContain(`${origin}/v/${ROTATED_SLUG}/`);
    expect(result.stdout).toContain("link");
  });

  it("keeps a private bundle private and prints no URL", async () => {
    stub.setCatalog([{ slug: "atlas", mode: "private" }]);
    const result = await hosti(["rotate", "atlas"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("private");
    expect(result.stdout).not.toContain("/v/");
  });

  it("exits non-zero on an unknown bundle", async () => {
    stub.setCatalog([]);
    const result = await hosti(["rotate", "ghost"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('No bundle is called "ghost"');
  });
});

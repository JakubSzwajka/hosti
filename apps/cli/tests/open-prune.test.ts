import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * `open` and `prune` against a stand-in server, because both are about what a
 * pipe and an exit code see. The server answers the two endpoints the CLI
 * calls and nothing else.
 */

const run = promisify(execFile);
const BIN = path.resolve(import.meta.dirname, "../src/index.ts");

type Run = { code: number; stdout: string; stderr: string };

let configHome: string;
let server: Server;
let origin: string;

/** What `GET /api/v1/bundles` hands back. Tests rewrite it between cases. */
let catalog: { slug: string; shareSlugs: string[] }[] = [];
/** What `POST .../prune` answers with, or a refusal when the status is not 200. */
let pruneAnswer: { status: number; body: unknown } = { status: 200, body: {} };

function bundle(slug: string, shareSlugs: string[] = []) {
  return {
    slug,
    title: slug,
    collection: null,
    createdAt: "2026-09-17T10:00:00.000Z",
    updatedAt: "2026-09-17T10:00:00.000Z",
    currentRevision: { seq: 1, byteSize: 10, fileCount: 1, createdAt: "2026-09-17T10:00:00.000Z" },
    revisionCount: 1,
    shareSlugs,
  };
}

async function hosti(args: string[], env: NodeJS.ProcessEnv = {}): Promise<Run> {
  try {
    const { stdout, stderr } = await run(process.execPath, [BIN, ...args], {
      env: {
        PATH: process.env.PATH ?? "",
        XDG_CONFIG_HOME: configHome,
        HOSTI_URL: origin,
        HOSTI_TOKEN: "hosti_test",
        ...env,
      },
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failure.code ?? 1, stdout: failure.stdout ?? "", stderr: failure.stderr ?? "" };
  }
}

beforeAll(async () => {
  configHome = await fs.mkdtemp(path.join(os.tmpdir(), "hosti-cli-"));
  server = createServer((request, response) => {
    const url = request.url ?? "";
    if (url === "/api/v1/bundles") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({ bundles: catalog.map((one) => bundle(one.slug, one.shareSlugs)) }),
      );
      return;
    }
    if (url.endsWith("/prune")) {
      response.writeHead(pruneAnswer.status, { "content-type": "application/json" });
      response.end(JSON.stringify(pruneAnswer.body));
      return;
    }
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not_found", message: "no such route" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (typeof address === "string" || address === null) throw new Error("no port");
  origin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await fs.rm(configHome, { recursive: true, force: true });
});

describe("hosti open", () => {
  it("prints the share link, and prints it last", async () => {
    catalog = [{ slug: "squad-2026", shareSlugs: ["squad-2026-k7f3n9qp"] }];
    const result = await hosti(["open", "squad-2026"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("shared");
    expect(result.stdout.trim().split("\n").at(-1)).toBe(`${origin}/v/squad-2026-k7f3n9qp/`);
  });

  it("prints the owner-only page for a bundle nobody has shared", async () => {
    catalog = [{ slug: "atlas", shareSlugs: [] }];
    const result = await hosti(["open", "atlas"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("private");
    expect(result.stdout.trim().split("\n").at(-1)).toBe(`${origin}/b/atlas`);
  });

  it("fails on a slug the catalog does not carry", async () => {
    catalog = [{ slug: "atlas", shareSlugs: [] }];
    const result = await hosti(["open", "ghost"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('No bundle is called "ghost"');
    expect(result.stdout).toBe("");
  });

  it("wants a slug", async () => {
    const result = await hosti(["open"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("open needs a slug");
  });

  it("refuses --open anywhere else", async () => {
    const result = await hosti(["ls", "--open"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("--open means nothing to ls");
  });
});

describe("hosti prune", () => {
  it("says what it kept and what it took away", async () => {
    pruneAnswer = {
      status: 200,
      body: { bundle: "squad-2026", keep: 5, kept: [9, 8, 7, 6, 5], removed: [4, 3, 2, 1] },
    };
    const result = await hosti(["prune", "squad-2026"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("keep     5 newest");
    expect(result.stdout).toContain("kept     9, 8, 7, 6, 5");
    expect(result.stdout).toContain("removed  4, 3, 2, 1");
  });

  it("says nothing was taken away when nothing was", async () => {
    pruneAnswer = { status: 200, body: { bundle: "atlas", keep: 5, kept: [1], removed: [] } };
    const result = await hosti(["prune", "atlas"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("removed  nothing");
  });

  it("exits non-zero with the server's own message", async () => {
    pruneAnswer = {
      status: 404,
      body: { error: "no_such_bundle", message: 'No bundle is called "ghost"' },
    };
    const result = await hosti(["prune", "ghost"]);
    expect(result.code).toBe(1);
    expect(result.stderr.trim().split("\n").at(-1)).toBe('No bundle is called "ghost"');
  });

  it("wants a slug", async () => {
    const result = await hosti(["prune"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("prune needs a slug");
  });
});

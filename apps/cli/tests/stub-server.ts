/**
 * A stand-in Hosti for the CLI tests. It answers the endpoints the CLI calls
 * and nothing else, so a test can say what the server hands back and then
 * check what a pipe and an exit code see.
 */
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { createServer, type IncomingMessage, type Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const BIN = path.resolve(import.meta.dirname, "../src/index.ts");

export type Run = { code: number; stdout: string; stderr: string };
export type Mode = "private" | "link" | "pin";
export type Entry = { slug: string; mode: Mode; shareSlug?: string };

/** The slug a rotate hands back, fixed so a test can name it. */
export const ROTATED_SLUG = "k7f3n9qpbcdf";

export type Stub = {
  origin: () => string;
  /** The bundles the server knows about. Rewrite it between cases. */
  setCatalog: (entries: Entry[]) => void;
  /** What `POST .../prune` answers with, or a refusal when the status is not 200. */
  setPruneAnswer: (answer: { status: number; body: unknown }) => void;
  /** The last `PUT .../sharing` body the server saw. */
  lastSharingBody: () => string;
  hosti: (args: string[], env?: NodeJS.ProcessEnv) => Promise<Run>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

function bodyOf(request: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let text = "";
    request.on("data", (chunk) => {
      text += chunk;
    });
    request.on("end", () => resolve(text));
  });
}

export function makeStub(): Stub {
  let configHome = "";
  let server: Server | null = null;
  let origin = "";
  let catalog: Entry[] = [];
  let pruneAnswer: { status: number; body: unknown } = { status: 200, body: {} };
  let lastSharingBody = "";

  const sharingOf = (entry: Entry) => ({
    mode: entry.mode,
    shareSlug: entry.shareSlug ?? entry.slug,
    hasPin: entry.mode === "pin",
  });

  const bundle = (entry: Entry) => ({
    slug: entry.slug,
    title: entry.slug,
    collection: null,
    createdAt: "2026-09-17T10:00:00.000Z",
    updatedAt: "2026-09-17T10:00:00.000Z",
    currentRevision: { seq: 1, byteSize: 10, fileCount: 1, createdAt: "2026-09-17T10:00:00.000Z" },
    revisionCount: 1,
    sharing: sharingOf(entry),
  });

  const shareUrlOf = (entry: Entry): string | null =>
    entry.mode === "private" ? null : `${origin}/v/${entry.shareSlug ?? entry.slug}/`;

  return {
    origin: () => origin,
    setCatalog: (entries) => {
      catalog = entries;
    },
    setPruneAnswer: (answer) => {
      pruneAnswer = answer;
    },
    lastSharingBody: () => lastSharingBody,

    async hosti(args, env = {}) {
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
        const failed = error as { code?: number; stdout?: string; stderr?: string };
        return { code: failed.code ?? 1, stdout: failed.stdout ?? "", stderr: failed.stderr ?? "" };
      }
    },

    async start() {
      configHome = await fs.mkdtemp(path.join(os.tmpdir(), "hosti-cli-"));
      server = createServer(async (request, response) => {
        const url = request.url ?? "";
        const json = (status: number, body: unknown) => {
          response.writeHead(status, { "content-type": "application/json" });
          response.end(JSON.stringify(body));
        };
        const missing = (slug: string) =>
          json(404, { error: "no_such_bundle", message: `No bundle is called "${slug}"` });

        if (url === "/api/v1/bundles") {
          json(200, { bundles: catalog.map(bundle) });
          return;
        }
        if (url.endsWith("/prune")) {
          json(pruneAnswer.status, pruneAnswer.body);
          return;
        }

        const sharing = url.match(/^\/api\/v1\/bundles\/([^/]+)\/sharing(\/rotate)?$/);
        if (sharing) {
          const entry = catalog.find((one) => one.slug === sharing[1]);
          if (!entry) return missing(sharing[1] as string);
          if (sharing[2]) entry.shareSlug = ROTATED_SLUG;
          else {
            lastSharingBody = await bodyOf(request);
            const asked = JSON.parse(lastSharingBody) as { mode: Mode; pin?: string };
            // An entry already on pin is one that holds a hash, so a bare
            // retry keeps it. Anything else is refused, like the real server.
            if (asked.mode === "pin" && !asked.pin && entry.mode !== "pin") {
              return json(400, { error: "pin_required", message: 'Mode "pin" needs a pin' });
            }
            entry.mode = asked.mode;
          }
          json(200, { bundle: entry.slug, sharing: sharingOf(entry), shareUrl: shareUrlOf(entry) });
          return;
        }

        const one = url.match(/^\/api\/v1\/bundles\/([^/]+)$/);
        if (one) {
          const entry = catalog.find((each) => each.slug === one[1]);
          if (!entry) return missing(one[1] as string);
          json(200, { bundle: bundle(entry), shareUrl: shareUrlOf(entry) });
          return;
        }

        json(404, { error: "not_found", message: "no such route" });
      });
      await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (typeof address === "string" || address === null) throw new Error("no port");
      origin = `http://127.0.0.1:${address.port}`;
    },

    async stop() {
      await new Promise<void>((resolve) => {
        if (server) server.close(() => resolve());
        else resolve();
      });
      if (configHome) await fs.rm(configHome, { recursive: true, force: true });
    },
  };
}

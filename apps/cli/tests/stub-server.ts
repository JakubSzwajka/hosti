import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
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

export const ROTATED_SLUG = "k7f3n9qpbcdf";
export const CONNECTION_ID = "c0nn3ct10n1d";
export const USER_CODE = "KX4F-9QLM";

export type Answer = { status: number; body: unknown };
export type Seen = { method: string; url: string; authorization: string; body: string };

export type Stub = {
  origin: () => string;
  setCatalog: (entries: Entry[]) => void;
  setPruneAnswer: (answer: { status: number; body: unknown }) => void;
  lastSharingBody: () => string;
  configHome: () => string;
  setCreateAnswer: (answer: Answer | null) => void;
  setPollAnswers: (answers: Answer[]) => void;
  setRefusal: (answer: Answer | null) => void;
  setWhoami: (answer: { name: string; scopes: string[] }) => void;
  seen: () => Seen[];
  reset: () => Promise<void>;
  opened: () => Promise<string[]>;
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

const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export function makeStub(): Stub {
  let configHome = "";
  let binDir = "";
  let createAnswer: Answer | null = null;
  let pollAnswers: Answer[] = [];
  let refusal: Answer | null = null;
  let whoami = { name: "laptop", scopes: ["publish", "share"] };
  let seen: Seen[] = [];
  let created: { tokenDigest: string; pollingDigest: string } | null = null;
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
    configHome: () => configHome,
    setCreateAnswer: (answer) => {
      createAnswer = answer;
    },
    setPollAnswers: (answers) => {
      pollAnswers = answers;
    },
    setRefusal: (answer) => {
      refusal = answer;
    },
    setWhoami: (answer) => {
      whoami = answer;
    },
    seen: () => seen,
    async reset() {
      createAnswer = null;
      pollAnswers = [];
      refusal = null;
      seen = [];
      created = null;
      await fs.rm(path.join(configHome, "hosti.json"), { force: true });
      await fs.rm(path.join(binDir, "opened.log"), { force: true });
    },
    async opened() {
      const text = await fs.readFile(path.join(binDir, "opened.log"), "utf8").catch(() => "");
      return text.split("\n").filter(Boolean);
    },

    async hosti(args, env = {}) {
      try {
        const { stdout, stderr } = await run(process.execPath, [BIN, ...args], {
          env: {
            // The fake xdg-open and open come first, so no real browser starts.
            PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
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
      binDir = await fs.mkdtemp(path.join(os.tmpdir(), "hosti-bin-"));
      const log = path.join(binDir, "opened.log");
      for (const name of ["xdg-open", "open"]) {
        const script = `#!/bin/sh\nprintf '%s\\n' "$1" >> '${log}'\n`;
        await fs.writeFile(path.join(binDir, name), script, { mode: 0o755 });
      }
      server = createServer(async (request, response) => {
        const url = request.url ?? "";
        const method = request.method ?? "GET";
        const authorization = request.headers.authorization ?? "";
        const json = (status: number, body: unknown) => {
          response.writeHead(status, { "content-type": "application/json" });
          response.end(JSON.stringify(body));
        };

        if (url.startsWith("/api/v1/agent-authorizations") || url === "/api/v1/whoami") {
          const body = await bodyOf(request);
          seen.push({ method, url, authorization, body });
          const bearer = authorization.replace(/^Bearer /, "");

          if (url === "/api/v1/agent-authorizations" && method === "POST") {
            if (createAnswer) return json(createAnswer.status, createAnswer.body);
            created = JSON.parse(body) as { tokenDigest: string; pollingDigest: string };
            return json(201, {
              id: CONNECTION_ID,
              userCode: USER_CODE,
              approvalUrl: `${origin}/connect/${CONNECTION_ID}`,
              expiresAt: new Date(Date.now() + 600_000).toISOString(),
              pollAfterSeconds: 1,
            });
          }
          if (url === `/api/v1/agent-authorizations/${CONNECTION_ID}` && method === "GET") {
            if (!created || digest(bearer) !== created.pollingDigest) {
              return json(404, { error: "not_found", message: "No such agent connection" });
            }
            const next = pollAnswers.length > 1 ? pollAnswers.shift() : pollAnswers[0];
            if (!next)
              return json(404, { error: "not_found", message: "No such agent connection" });
            return json(next.status, next.body);
          }
          if (url === "/api/v1/whoami") {
            const known =
              bearer === "hosti_test" || (created && digest(bearer) === created.tokenDigest);
            if (!known)
              return json(401, {
                error: "unauthorized",
                message: "A valid push token is required",
              });
            return json(200, whoami);
          }
          return json(404, { error: "not_found", message: "No such agent connection" });
        }

        if (refusal && url.startsWith("/api/v1/bundles")) {
          return json(refusal.status, refusal.body);
        }
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
      if (binDir) await fs.rm(binDir, { recursive: true, force: true });
    },
  };
}

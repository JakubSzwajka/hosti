import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

describe("runtime image packaging", () => {
  const dockerfile = read("apps/web/Dockerfile");

  it("links the traced better-sqlite3 where scripts/new-token.mjs resolves it", () => {
    assert.match(dockerfile, /\.next\/node_modules\/better-sqlite3-\*/);
    assert.match(
      dockerfile,
      /ln -sfn "\$\(readlink -f "\$1"\)" \/app\/node_modules\/better-sqlite3/,
    );
  });

  it("still links @hosti/catalog and copies the scripts", () => {
    assert.match(
      dockerfile,
      /ln -sfn \/app\/packages\/catalog \/app\/node_modules\/@hosti\/catalog/,
    );
    assert.match(dockerfile, /COPY --from=build --chown=node:node \/app\/apps\/web\/scripts /);
  });

  it("new-token.mjs answers --help after its imports, so a missing module fails the smoke", () => {
    const script = read("apps/web/scripts/new-token.mjs");
    assert.ok(script.indexOf('from "better-sqlite3"') < script.indexOf('"--help"'));
  });

  it("acceptance runs the new-token smoke in the built image", () => {
    const acceptance = read("scripts/acceptance-cold-clone.sh");
    assert.match(acceptance, /node scripts\/new-token\.mjs --help/);
    assert.match(acceptance, /node scripts\/new-token\.mjs --name/);
  });
});

describe("image layer order", () => {
  const instructions = (file) =>
    read(file)
      .split("\n")
      .filter((line) => /^[A-Z]+ /.test(line))
      .map((line) => line.split(" ")[0]);
  const lineOf = (text, pattern) => text.split("\n").findIndex((line) => pattern.test(line));

  it("pins every base image by tag and digest", () => {
    for (const file of ["apps/web/Dockerfile", "landing/Dockerfile"]) {
      const from = read(file)
        .split("\n")
        .filter((line) => /^FROM [^ ]+@sha256:[0-9a-f]{64}( AS \w+)?$/.test(line));
      assert.ok(from.length > 0, `${file} has no digest-pinned FROM`);
    }
  });

  it("puts APP_COMMIT last before USER, so a code-only release moves the fewest layers", () => {
    const web = read("apps/web/Dockerfile");
    const lines = web.split("\n");
    const arg = lineOf(web, /^ARG APP_COMMIT/);
    const user = lineOf(web, /^USER /);
    assert.ok(arg > lineOf(web, /^COPY --from=build .*\/schema\.mjs/));
    assert.equal(lines[arg + 1], "ENV APP_COMMIT=$APP_COMMIT");
    assert.equal(
      lines
        .slice(arg + 2, user)
        .join("")
        .trim(),
      "",
    );
    // Landing rewrites its Caddyfile with the commit, so one RUN may follow the ARG.
    assert.deepEqual(instructions("landing/Dockerfile").slice(-5), [
      "ARG",
      "ENV",
      "RUN",
      "USER",
      "EXPOSE",
    ]);
  });

  it("copies Next's traced node_modules as its own layer before the app", () => {
    const web = read("apps/web/Dockerfile");
    assert.match(web, /mv apps\/web\/\.next\/standalone\/node_modules \/traced-node_modules/);
    assert.ok(
      lineOf(web, /^COPY --from=build .* \/traced-node_modules \/app\/node_modules/) <
        lineOf(web, /^COPY --from=build .* \/app\/apps\/web\/\.next\/standalone \/app/),
    );
  });
});

describe("docker build contexts", () => {
  const lines = (file) =>
    read(file)
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));

  it("keeps secrets, VCS data, dependencies and build or test output out of the repository root context", () => {
    const ignore = lines(".dockerignore");
    for (const entry of [
      ".git",
      "node_modules",
      "**/node_modules",
      "**/.next",
      "**/dist",
      "**/coverage",
      "**/test-results",
      "**/.env*",
    ]) {
      assert.ok(ignore.includes(entry), `.dockerignore is missing ${entry}`);
    }
    // Tracked, non-secret env schemas stay available to consumers.
    assert.ok(ignore.indexOf("!**/.env.schema") > ignore.indexOf("**/.env*"));
    assert.ok(ignore.indexOf("!**/.env.example") > ignore.indexOf("**/.env*"));
  });

  it("keeps the same baseline out of the landing context", () => {
    const ignore = lines("landing/.dockerignore");
    for (const entry of [
      ".git",
      "node_modules",
      ".next",
      "dist",
      "coverage",
      "test-results",
      ".env*",
    ]) {
      assert.ok(ignore.includes(entry), `landing/.dockerignore is missing ${entry}`);
    }
  });
});

describe("docker-compose.build.yml", () => {
  const override = read("docker-compose.build.yml");

  it("builds the web image from the repository root", () => {
    assert.match(override, /context: \./);
    assert.match(override, /dockerfile: apps\/web\/Dockerfile/);
    assert.match(override, /image: hosti:local/);
    assert.match(override, /pull_policy: build/);
  });
});

describe("acceptance-cold-clone.sh exit status", () => {
  const script = path.join(root, "scripts/acceptance-cold-clone.sh");
  const stubs = {
    git: `case "$1" in
  clone) mkdir -p "\${@: -1}/.git/hooks" ;;
  rev-parse) echo mock-head ;;
esac`,
    corepack: "exit 0",
    pnpm: `if [ "$1" = install ]; then touch .git/hooks/pre-commit; fi`,
    docker: `echo "docker $*" >> "$STUB_LOG"
case "$1" in
  volume) exit 0 ;;
  run) case "$*" in *"$FAIL_ON"*) exit "$FAIL_CODE" ;; esac ;;
esac`,
  };

  const run = (env) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hosti-acceptance-test-"));
    try {
      const bin = path.join(dir, "bin");
      fs.mkdirSync(bin);
      for (const [name, body] of Object.entries(stubs)) {
        fs.writeFileSync(path.join(bin, name), `#!/usr/bin/env bash\n${body}\n`, { mode: 0o755 });
      }
      const log = path.join(dir, "docker.log");
      const result = spawnSync("bash", [script, "mocked-source"], {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          TMPDIR: dir,
          STUB_LOG: log,
          ...env,
        },
      });
      const dockerLog = fs.existsSync(log) ? fs.readFileSync(log, "utf8") : "";
      return { result, dockerLog };
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };

  it("exits with the failing image smoke's status and still removes the smoke volume", () => {
    const { result, dockerLog } = run({ FAIL_ON: "--allow-delete", FAIL_CODE: "42" });
    assert.equal(result.status, 42, result.stderr);
    assert.match(result.stderr, /acceptance failed \[image smoke: new-token --allow-delete\]/);
    assert.match(dockerLog, /docker volume rm -f hosti-acceptance-data-\d+/);
    assert.doesNotMatch(result.stdout, /acceptance passed/);
  });

  it("exits 0 when every step passes", () => {
    const { result, dockerLog } = run({ FAIL_ON: "never-matches", FAIL_CODE: "1" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /cold-clone acceptance passed/);
    assert.match(dockerLog, /docker volume rm -f/);
  });
});

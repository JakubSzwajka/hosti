import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "apps", "cli");

let work;
let bin;
let installed;

function cleanEnv(extra = {}) {
  // pnpm runs scripts with npm_config_* set for pnpm itself; npm should not read them.
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.toLowerCase().startsWith("npm_")) env[key] = value;
  }
  return { ...env, ...extra };
}

function npm(args, cwd) {
  return execFileSync("npm", args, {
    cwd,
    encoding: "utf8",
    env: cleanEnv({
      npm_config_cache: path.join(work, "npm-cache"),
      npm_config_update_notifier: "false",
    }),
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function findPackage(fromDir, name) {
  // Node's own lookup: walk up from the package, trying node_modules/<name>.
  for (let dir = fromDir; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, "node_modules", name);
    if (fs.existsSync(path.join(candidate, "package.json"))) return fs.realpathSync(candidate);
    if (path.dirname(dir) === dir) throw new Error(`Cannot find ${name} from ${fromDir}`);
  }
}

function runtimeClosure(fromDir) {
  const found = new Map();
  const visit = (dir) => {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    for (const name of Object.keys(manifest.dependencies ?? {})) {
      const depDir = findPackage(dir, name);
      if (found.has(name)) continue;
      found.set(name, depDir);
      visit(depDir);
    }
  };
  visit(fromDir);
  return found;
}

before(() => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), "hosti-cli-package-"));
  const packed = execFileSync(process.execPath, [path.join(CLI, "scripts", "pack.mjs"), work], {
    encoding: "utf8",
    env: cleanEnv(),
  });
  const tarball = packed.trim().split("\n").at(-1);
  assert.equal(tarball, path.join(work, "hosti-cli.tgz"));

  // Offline install: tar and its dependencies come from the local pnpm store, with an empty cache.
  const deps = path.join(work, "deps");
  fs.mkdirSync(deps);
  const dependencies = { "@hosti/cli": `file:${tarball}` };
  for (const [name, dir] of runtimeClosure(CLI)) {
    // npm silently fails to pack a directory inside this pnpm workspace, so pack a copy.
    const copy = path.join(work, "copies", name);
    fs.cpSync(dir, copy, { recursive: true, dereference: true });
    const [result] = JSON.parse(
      npm(["pack", "--json", "--ignore-scripts", "--pack-destination", deps], copy),
    );
    dependencies[name] = `file:${path.join(deps, result.filename)}`;
  }

  const prefix = path.join(work, "prefix");
  fs.mkdirSync(prefix);
  fs.writeFileSync(
    path.join(prefix, "package.json"),
    JSON.stringify({ name: "hosti-package-check", private: true, dependencies }),
  );
  npm(["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund"], prefix);
  bin = path.join(prefix, "node_modules", ".bin", "hosti");
  installed = path.join(prefix, "node_modules", "@hosti", "cli");
});

after(() => {
  if (work) fs.rmSync(work, { recursive: true, force: true });
});

test("the installed CLI answers --help from node_modules", () => {
  const home = path.join(work, "home");
  fs.mkdirSync(home, { recursive: true });
  const stdout = execFileSync(bin, ["--help"], {
    cwd: work,
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", HOME: home, XDG_CONFIG_HOME: home },
  });
  assert.match(stdout, /hosti login <url>/);
  assert.match(stdout, /hosti push <path>/);
});

test("the package ships compiled JavaScript and no workspace import", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(installed, "package.json"), "utf8"));
  assert.deepEqual(manifest.bin, { hosti: "./dist/index.js" });
  assert.deepEqual(Object.keys(manifest.dependencies), ["tar"]);
  assert.equal(manifest.devDependencies, undefined);

  const files = fs.readdirSync(path.join(installed, "dist"));
  assert.ok(files.includes("index.js"));
  assert.deepEqual(
    files.filter((file) => !file.endsWith(".js")),
    [],
  );
  for (const file of files) {
    const source = fs.readFileSync(path.join(installed, "dist", file), "utf8");
    assert.doesNotMatch(source, /@hosti\//, `${file} imports a workspace package`);
    assert.doesNotMatch(source, /from "\.\/[^"]+\.ts"/, `${file} imports a .ts file`);
  }
});

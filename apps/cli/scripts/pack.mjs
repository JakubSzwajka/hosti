#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARBALL = "hosti-cli.tgz";

function pack(destination) {
  const manifest = JSON.parse(fs.readFileSync(path.join(CLI_ROOT, "package.json"), "utf8"));
  const tsc = createRequire(path.join(CLI_ROOT, "package.json")).resolve("typescript/bin/tsc");

  // Node will not strip types under node_modules, so compile into a staging dir outside the checkout.
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "hosti-cli-pack-"));
  try {
    execFileSync(
      process.execPath,
      [
        tsc,
        "-p",
        path.join(CLI_ROOT, "tsconfig.build.json"),
        "--outDir",
        path.join(staging, "dist"),
      ],
      { stdio: "inherit" },
    );

    // No devDependencies or scripts travel, and private blocks an accidental registry publish.
    const packed = {
      name: manifest.name,
      version: manifest.version,
      description: "Push static bundles to a Hosti catalog",
      private: true,
      license: "MIT",
      type: "module",
      bin: { hosti: "./dist/index.js" },
      files: ["dist"],
      dependencies: manifest.dependencies,
      engines: manifest.engines,
    };
    fs.writeFileSync(path.join(staging, "package.json"), `${JSON.stringify(packed, null, 2)}\n`);

    fs.mkdirSync(destination, { recursive: true });
    const output = execFileSync(
      "npm",
      ["pack", "--json", "--ignore-scripts", "--pack-destination", destination],
      { cwd: staging, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
    );
    const [result] = JSON.parse(output);
    const target = path.join(destination, TARBALL);
    fs.renameSync(path.join(destination, result.filename), target);
    return target;
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

process.stdout.write(`${pack(path.resolve(process.argv[2] ?? CLI_ROOT))}\n`);

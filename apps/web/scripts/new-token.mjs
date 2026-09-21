#!/usr/bin/env node
// Mint a push token from a shell. The secret is printed once and only its
// digest is stored.
//   npm run token:new -- --name laptop
//
// The catalog does the same job at /tokens, with the agent prompt beside it,
// and needs no shell on the box. This script stays for a first run, for a
// scripted setup, and for a box whose owner password is lost.
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { openDatabase } from "../src/server/db/open.mjs";

const args = process.argv.slice(2);
const nameFlag = args.indexOf("--name");
const name = nameFlag === -1 ? "unnamed" : (args[nameFlag + 1] ?? "unnamed");

const dataDir = path.resolve(process.env.HOSTI_DATA_DIR ?? "./data");
const db = openDatabase(path.join(dataDir, "hosti.db"));

const secret = `hosti_${randomBytes(24).toString("base64url")}`;
const hash = createHash("sha256").update(secret, "utf8").digest("hex");
db.prepare("INSERT INTO push_tokens (name, token_hash, created_at) VALUES (?, ?, ?)").run(
  name,
  hash,
  new Date().toISOString(),
);

process.stdout.write(`push token "${name}" created in ${dataDir}\n`);
process.stdout.write(`${secret}\n`);
process.stdout.write("Store it now. Hosti keeps only the digest.\n");
process.stdout.write("The catalog mints one too, at /tokens, with the agent prompt beside it.\n");

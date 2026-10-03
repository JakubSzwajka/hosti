#!/usr/bin/env node
import { randomBytes, scrypt } from "node:crypto";

const MIN_LENGTH = 8;
const COST = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

const CTRL_C = "\u0003";
const CTRL_D = "\u0004";
const ESCAPE = "\u001b";

class Cancelled extends Error {}

function hashOwnerPassword(password) {
  // The format is a copy of @hosti/identity's and board-app's; owner-hash.test.ts checks they agree.
  const salt = randomBytes(16);
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, 32, COST, (error, key) => {
      if (error) reject(error);
      else {
        const { N, r, p } = COST;
        resolve(`scrypt:${N}:${r}:${p}:${salt.toString("base64url")}:${key.toString("base64url")}`);
      }
    });
  });
}

function lengthError(password) {
  return password.length >= MIN_LENGTH
    ? undefined
    : `The owner password must be at least ${MIN_LENGTH} characters.`;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks)
    .toString("utf8")
    .replace(/\r?\n$/, "");
}

function splitKeys(chunk) {
  const chars = Array.from(chunk);
  const keys = [];
  let index = 0;
  while (index < chars.length) {
    let length = 1;
    if (chars[index] === ESCAPE) {
      const next = chars[index + 1];
      if (next === "O") length = Math.min(3, chars.length - index);
      else if (next !== "[") length = next === undefined ? 1 : 2;
      else {
        let end = index + 2;
        while (end < chars.length && /[0-9;]/.test(chars[end] ?? "")) end += 1;
        length = Math.min(end + 1, chars.length) - index;
      }
    }
    keys.push(chars.slice(index, index + length).join(""));
    index += length;
  }
  return keys;
}

function promptHidden(label) {
  const stdin = process.stdin;
  process.stderr.write(label);
  return new Promise((resolve, reject) => {
    let buffer = "";
    const finish = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stderr.write("\n");
    };
    const onData = (chunk) => {
      for (const key of splitKeys(chunk)) {
        if (key === CTRL_C) {
          finish();
          reject(new Cancelled());
          return;
        }
        if (key === "\r" || key === "\n" || key === CTRL_D) {
          finish();
          resolve(buffer);
          return;
        }
        if (key === "\b" || key === "\u007f") buffer = Array.from(buffer).slice(0, -1).join("");
        else if (!key.startsWith(ESCAPE) && key >= " ") buffer += key;
      }
    };
    stdin.setEncoding("utf8");
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

async function readPassword() {
  if (!process.stdin.isTTY) return readStdin();
  const password = await promptHidden("Owner password: ");
  const tooShort = lengthError(password);
  if (tooShort !== undefined) fail(tooShort);
  if (password !== (await promptHidden("Repeat: "))) fail("The passwords do not match.");
  return password;
}

async function main() {
  const password = await readPassword();
  const tooShort = lengthError(password);
  if (tooShort !== undefined) fail(`${tooShort} Type it at the prompt or pipe it on stdin.`);
  process.stdout.write(`${await hashOwnerPassword(password)}\n`);
}

main().catch((caught) => {
  if (caught instanceof Cancelled) process.exit(130);
  process.stderr.write(`${caught instanceof Error ? caught.message : String(caught)}\n`);
  process.exit(1);
});

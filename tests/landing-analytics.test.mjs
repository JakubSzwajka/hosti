import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const landing = fs.readFileSync(path.join(root, "landing", "index.html"), "utf8");
const scripts = landing.match(/<script\b[\s\S]*?<\/script>/gi) ?? [];

const expectedAttributes = {
  "data-website-id": "c80d8ffd-21f6-43b9-a57b-8b98e224988b",
  "data-domains": "hosti.kubaszwajka.com",
  "data-do-not-track": "true",
  "data-exclude-search": "true",
  "data-exclude-hash": "true",
};

function attributes(script) {
  return Object.fromEntries(
    [...script.matchAll(/\s(data-[\w-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]),
  );
}

test("landing has one privacy-scoped Umami tracker", () => {
  assert.equal(landing.match(/<script\b/gi)?.length ?? 0, 1);
  assert.equal(scripts.length, 1);
  assert.match(scripts[0], /<script\b[^>]*\bdefer(?:\s|>)/);
  assert.match(scripts[0], /\bsrc="https:\/\/analytics\.niuluc\.me\/script\.js"/);
  assert.deepEqual(attributes(scripts[0]), expectedAttributes);
});

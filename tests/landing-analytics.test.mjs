import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const landingDir = path.join(root, "landing");
const pages = ["index.html"];
const walk = (dir) => {
  for (const entry of fs.readdirSync(path.join(landingDir, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel);
    else if (entry.name === "index.html") pages.push(rel);
  }
};
walk("docs");
const read = (page) => fs.readFileSync(path.join(landingDir, page), "utf8");
const trackerTag = (html) => html.match(/<script\b[\s\S]*?<\/script>/gi) ?? [];
const landing = read("index.html");
const scripts = trackerTag(landing);

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

test("every docs page carries the exact landing tracker so the footer click is counted", () => {
  const docs = pages.filter((page) => page.startsWith("docs"));
  assert.ok(docs.length >= 5, `expected docs pages, found ${docs.join(", ")}`);
  for (const page of docs) {
    const html = read(page);
    assert.deepEqual(trackerTag(html), scripts, page);
    assert.match(html, /data-umami-event="built_by_click"/, page);
  }
});

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readLanding = (file) => fs.readFileSync(path.join(root, "landing", file), "utf8");
const landing = readLanding("index.html");
const png = fs.readFileSync(path.join(root, "landing", "og-image.png"));
const origin = "https://hosti.kubaszwajka.com/";
const imageUrl = `${origin}og-image.png`;
const title = "Hosti. Your bundles, on your VPS.";
const description =
  "Hosti is an open-source, self-hosted catalog for the static bundles coding agents push. Every bundle lands private. MIT license.";
const expected = {
  "og:title": title,
  "og:description": description,
  "og:image": imageUrl,
  "og:image:width": "1200",
  "og:image:height": "630",
  "og:image:alt":
    "Hosti. Your agents' bundles, on your VPS. A self-hosted catalog for coding agents.",
  "og:url": origin,
  "og:type": "website",
  "twitter:card": "summary_large_image",
  "twitter:title": title,
  "twitter:description": description,
  "twitter:image": imageUrl,
};

function attributes(tag) {
  return Object.fromEntries(
    [...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]),
  );
}

function assertMetadata(html) {
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1];
  assert.ok(head, "static HTML has a head");
  const tags = [...head.matchAll(/<meta\b[^>]*>/gi)].map((match) => attributes(match[0]));
  for (const [key, value] of Object.entries(expected)) {
    const attribute = key.startsWith("og:") ? "property" : "name";
    const matches = tags.filter((tag) => tag[attribute] === key);
    assert.equal(matches.length, 1, `one ${key} tag`);
    assert.equal(matches[0].content, value, key);
  }
  assert.equal(tags.find((tag) => tag.name === "description")?.content, description);
  const canonical = [...head.matchAll(/<link\b[^>]*>/gi)]
    .map((match) => attributes(match[0]))
    .filter((tag) => tag.rel === "canonical");
  assert.equal(canonical.length, 1);
  assert.equal(canonical[0].href, origin);
}

function assertPng(bytes) {
  assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.equal(bytes.toString("ascii", 12, 16), "IHDR");
  assert.equal(bytes.readUInt32BE(16), 1200);
  assert.equal(bytes.readUInt32BE(20), 630);
  assert.ok(bytes.length < 300_000, `${bytes.length} bytes must stay below 300 KB`);
  const data = [];
  let offset = 8;
  let ended = false;
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const end = offset + 12 + length;
    assert.ok(end <= bytes.length, "PNG chunk is complete");
    if (type === "IDAT") data.push(bytes.subarray(offset + 8, offset + 8 + length));
    if (type === "IEND") ended = true;
    offset = end;
  }
  assert.ok(ended, "PNG has an end chunk");
  assert.ok(inflateSync(Buffer.concat(data)).length > 1200 * 630, "pixel data inflates");
}

test("landing declares one static OG/Twitter preview at its canonical HTTPS origin", () => {
  assertMetadata(landing);
});

test("preview is a complete 1200x630 PNG below 300 KB", () => {
  assertPng(png);
});

test("preview source is local and its browser render command is documented", () => {
  const source = readLanding("og-image.html");
  assert.match(source, /width: 1200px;/);
  assert.match(source, /height: 630px;/);
  assert.match(source, /<h1>hosti<\/h1>/);
  assert.match(source, /Your agents' bundles, on your VPS\./);
  assert.match(source, /href="styles\/tokens\.css"/);
  assert.match(source, /src="icon\.svg"/);
  assert.doesNotMatch(source, /https?:\/\/|<script\b|@import/);
  const readme = readLanding("README.md");
  assert.match(readme, /--headless/);
  assert.match(readme, /--window-size=1200,630/);
  assert.match(readme, /--force-device-scale-factor=1/);
  assert.match(readme, /--screenshot="\$PWD\/landing\/og-image\.png"/);
});

test("landing image ships only the PNG and Caddy caches it as an asset", () => {
  const dockerfile = readLanding("Dockerfile");
  assert.match(
    dockerfile,
    /^COPY index\.html icon\.svg og-image\.png apple-touch-icon\.png \/srv\//m,
  );
  assert.doesNotMatch(dockerfile, /^COPY .*og-image\.html/m);
  assert.match(readLanding("Caddyfile"), /@assets path [^\n]*\/og-image\.png/);
});

test("landing links a 180x180 apple-touch-icon that the image ships", () => {
  const links = [...landing.matchAll(/<link\b[^>]*>/gi)].map((match) => attributes(match[0]));
  const icon = links.filter((tag) => tag.rel === "apple-touch-icon");
  assert.equal(icon.length, 1, "one apple-touch-icon link");
  assert.equal(icon[0].href, "apple-touch-icon.png");
  const bytes = fs.readFileSync(path.join(root, "landing", "apple-touch-icon.png"));
  assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.equal(bytes.readUInt32BE(16), 180);
  assert.equal(bytes.readUInt32BE(20), 180);
});

test("CI landing smoke runs the served preview assertions", () => {
  const ci = fs.readFileSync(path.join(root, ".github", "workflows", "ci.yml"), "utf8");
  assert.match(ci, /node \.\.\/tests\/landing-preview\.test\.mjs http:\/\/127\.0\.0\.1:18080/);
});

const smokeUrl = process.argv[2];
if (smokeUrl) {
  test("served landing preview has matching tags and PNG GET/HEAD without redirects", async () => {
    const base = new URL(smokeUrl);
    const get = (route, method = "GET") =>
      fetch(new URL(route, base), {
        method,
        redirect: "manual",
        signal: AbortSignal.timeout(5000),
      });
    const page = await get("/");
    assert.equal(page.status, 200);
    assert.equal(page.headers.get("location"), null);
    assertMetadata(await page.text());
    for (const method of ["GET", "HEAD"]) {
      const response = await get(new URL(imageUrl).pathname, method);
      assert.equal(response.status, 200, method);
      assert.equal(response.headers.get("location"), null);
      assert.equal(response.headers.get("content-type"), "image/png");
      assert.equal(response.headers.get("content-length"), String(png.length));
      assert.equal(response.headers.get("cache-control"), "public, max-age=86400");
      const bytes = Buffer.from(await response.arrayBuffer());
      if (method === "GET") {
        assertPng(bytes);
        assert.deepEqual(bytes, png, "served image matches the tracked asset");
      } else {
        assert.equal(bytes.length, 0);
      }
    }
    assert.equal((await get("/og-image.html")).status, 404, "render source is not shipped");
  });
}

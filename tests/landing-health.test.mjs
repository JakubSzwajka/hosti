import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dockerfile = fs.readFileSync(path.join(root, "landing/Dockerfile"), "utf8");
const caddyfile = fs.readFileSync(path.join(root, "landing/Caddyfile"), "utf8");

describe("landing image health contract", () => {
  it("bakes the full build commit into the Caddy runtime", () => {
    assert.match(dockerfile, /ARG APP_COMMIT=unknown/);
    assert.match(dockerfile, /ENV APP_COMMIT=\$APP_COMMIT/);
    assert.match(dockerfile, /sed -i "s\/__APP_COMMIT__\/\$\{commit\}\/g"/);
    assert.match(caddyfile, /__APP_COMMIT__/);
  });

  it("answers JSON health and keeps old app paths redirected", () => {
    assert.match(caddyfile, /@health path \/healthz/);
    assert.match(caddyfile, /header @health Content-Type "application\/json"/);
    assert.match(
      caddyfile,
      /respond @health `\{ "status": "ok", "commit": "__APP_COMMIT__" \}` 200/,
    );
    assert.match(caddyfile, /https:\/\/hosti-private\.kubaszwajka\.com\{uri\} 308/);
    assert.match(caddyfile, /@app path \/api\/\* \/b\/\* \/c\/\* \/v\/\*/);
  });
});

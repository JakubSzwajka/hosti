import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import { after, before, describe, it } from "node:test";
import {
  installPrivateChannel,
  isLoopbackAddress,
  PRIVATE_CHANNEL_HEADER,
  PRIVATE_CHANNEL_SECRET,
} from "../apps/web/scripts/private-channel.mjs";

const externalAddress = Object.values(os.networkInterfaces())
  .flat()
  .find((entry) => entry && entry.family === "IPv4" && !entry.internal)?.address;

function get(host, headers) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { host, port: server.address().port, path: "/internal/deploy/ready", headers },
      (response) => {
        let body = "";
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => resolve(JSON.parse(body)));
      },
    );
    request.on("error", reject);
    request.end();
  });
}

let server;
let secret;

before(async () => {
  secret = installPrivateChannel(http);
  server = http.createServer((request, response) => {
    response.end(
      JSON.stringify({
        private: request.headers[PRIVATE_CHANNEL_HEADER] === secret,
        stamped: request.headers[PRIVATE_CHANNEL_HEADER] !== undefined,
      }),
    );
  });
  await new Promise((resolve) => server.listen(0, "0.0.0.0", resolve));
});

after(() => new Promise((resolve) => server.close(resolve)));

describe("private channel preload", () => {
  it("publishes a fresh process secret for the app routes", () => {
    assert.equal(globalThis[PRIVATE_CHANNEL_SECRET], secret);
    assert.match(secret, /^[0-9a-f]{64}$/);
  });

  it("marks a loopback connection as private", async () => {
    assert.deepEqual(await get("127.0.0.1", {}), { private: true, stamped: true });
  });

  it("never marks a non-loopback connection, whatever its headers claim", async (t) => {
    if (!externalAddress) {
      t.skip("no non-loopback IPv4 interface on this machine");
      return;
    }
    const spoofed = {
      Host: "localhost:3000",
      "X-Forwarded-For": "127.0.0.1",
      "X-Real-IP": "127.0.0.1",
      "X-Small-App-Epoch": "proof-epoch-a",
      [PRIVATE_CHANNEL_HEADER]: secret,
    };
    assert.deepEqual(await get(externalAddress, spoofed), { private: false, stamped: false });
  });

  it("classifies only loopback peers as private", () => {
    for (const address of ["127.0.0.1", "127.9.8.7", "::1", "::ffff:127.0.0.1"]) {
      assert.equal(isLoopbackAddress(address), true, address);
    }
    for (const address of ["10.0.0.1", "::ffff:10.0.0.1", "fe80::1", "0.0.0.0", "", undefined]) {
      assert.equal(isLoopbackAddress(address), false, String(address));
    }
  });

  it("refuses to install twice in one process", () => {
    assert.throws(() => installPrivateChannel(http), /already installed/);
  });
});

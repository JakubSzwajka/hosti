import fs from "node:fs/promises";
import path from "node:path";
import { setupProof, check } from "./mcp-proof-runtime.mjs";

const proof = await setupProof();
let stage = "start";
function pass(label) {
  console.log(`PASS ${label}`);
}
try {
  await proof.start();
  stage = "discovery";
  for (const suffix of ["", "/mcp"]) {
    const metadata = await fetch(`${proof.base}/.well-known/oauth-protected-resource${suffix}`);
    const data = await metadata.json();
    check(data.resource === `${proof.base}/mcp`, "metadata resource");
    check(data.authorization_servers[0] === proof.issuerUrl, "metadata issuer");
  }
  const anonymous = await proof.rpc("initialize", {}, "", "");
  check(
    anonymous.status === 401 && anonymous.headers.has("www-authenticate"),
    "anonymous challenge",
  );
  check((await proof.rpc("tools/list", {}, "", "")).status === 401, "anonymous tool denial");
  pass("discovery and anonymous challenge");
  stage = "JWT validation";
  for (const [claims, status] of [
    [{ sub: "other-person" }, 403],
    [{ scope: "profile" }, 403],
    [{ aud: "https://wrong.example/mcp" }, 401],
    [{ exp: 1 }, 401],
    [{ exp: undefined }, 401],
    [{ sid: "browser-session" }, 401],
  ]) {
    check(
      (await proof.rpc("tools/list", {}, await proof.sign(claims), "")).status === status,
      "JWT denial",
    );
  }
  await proof.initialize();
  check(
    (await proof.rpc("tools/list", {}, await proof.sign({ client_id: "other-client" }))).status ===
      403,
    "session identity binding",
  );
  const tools = await proof.rpc("tools/list");
  check(tools.status === 200 && (await tools.text()).includes('"push"'), "tool discovery");
  check((await proof.call("list_bundles")).bundles.length === 0, "empty catalog");
  pass("signed JWT validation and session binding");
  stage = "upload";
  const first = await proof.call("push", {
    slug: "mcp-proof",
    title: "MCP proof",
    collection: "proof",
  });
  check(
    (await proof.call("get_bundle", { slug: "mcp-proof" })).error === "not_found",
    "grant creates no revision",
  );
  check((await proof.curl(first.url, "GET")).status === 405, "upload rejects GET");
  check((await proof.curl(first.url, "HEAD")).status === 405, "upload rejects HEAD");
  check(
    (await proof.curl(first.url.replace("sig=", "sig=x"), "PUT", proof.archive)).status === 404,
    "tampered upload rejected without consuming grant",
  );
  pass("upload wrong methods 405 and tampered signature 404 before valid PUT");
  const uploaded = await proof.curl(first.url, "PUT", proof.archive);
  check(
    uploaded.status === 201 && JSON.parse(uploaded.body).revision === 1,
    "curl upload response",
  );
  const shown = await proof.call("get_bundle", { slug: "mcp-proof" });
  check(
    shown.bundle.sharing.mode === "private" &&
      shown.revisions[0].pushedBy === "mcp:Hosti MCP proof",
    "private and attributed push",
  );
  const oldDownload = await proof.call("get_download_link", { slug: "mcp-proof" });
  check((await proof.curl(oldDownload.url, "HEAD")).status === 405, "download rejects HEAD");
  check(
    (await proof.curl(oldDownload.url.replace("sig=", "sig=x"), "GET")).status === 404,
    "tampered download rejected",
  );
  await proof.verifyDownload(oldDownload.url);
  pass("download HEAD 405 and tampered signature 404; valid GET matches nested/binary hashes");
  stage = "sharing";
  const shared = await proof.call("set_sharing", { slug: "mcp-proof", mode: "link" });
  check((await fetch(shared.shareUrl)).status === 200, "link serves");
  const rotated = await proof.call("rotate_link", { slug: "mcp-proof" });
  check(
    (await fetch(shared.shareUrl)).status === 404 && (await fetch(rotated.shareUrl)).status === 200,
    "rotated link",
  );
  const pinned = await proof.call("set_sharing", { slug: "mcp-proof", mode: "pin", pin: "4821" });
  check(pinned.sharing.hasPin, "pin present");
  const gate = await fetch(pinned.shareUrl, { headers: { Accept: "text/html" } });
  const gateHtml = await gate.text();
  check(
    gate.status === 200 && gateHtml.includes('name="pin"') && gateHtml.includes("/unlock"),
    "HTML page request displays pin gate",
  );
  check(
    (await fetch(pinned.shareUrl, { headers: { Accept: "*/*" } })).status === 404 &&
      (await fetch(new URL("nested/note.txt", pinned.shareUrl))).status === 404,
    "locked non-page and asset requests stay private",
  );
  pass("pin page Accept:text/html 200 with form; */* and locked nested asset 404");
  const privateState = await proof.call("set_sharing", { slug: "mcp-proof", mode: "private" });
  check(
    !privateState.sharing.hasPin && (await fetch(rotated.shareUrl)).status === 404,
    "private clears pin",
  );
  pass("sharing, rotation, pin and private");
  stage = "replay and restart";
  check((await proof.curl(first.url, "PUT", proof.archive)).status === 409, "upload replay");
  const freshBeforeRestart = await proof.call("push", { slug: "mcp-proof" });
  const failed = await proof.call("push", { slug: "mcp-proof" });
  const interrupted = await proof.call("push", { slug: "mcp-proof" });
  const malformed = path.join(proof.root, "malformed.tar.gz");
  await fs.writeFile(malformed, "not an archive");
  check((await proof.curl(failed.url, "PUT", malformed)).status === 400, "failed archive");
  await proof.interruptUpload(interrupted.url);
  await proof.start();
  await proof.initialize();
  check((await proof.curl(first.url, "PUT", proof.archive)).status === 409, "restarted replay");
  check(
    (await proof.curl(interrupted.url, "PUT", proof.archive)).status === 409,
    "restarted interrupted-attempt replay",
  );
  check(
    (await proof.curl(failed.url, "PUT", proof.archive)).status === 409,
    "restarted failed-attempt replay",
  );
  check(
    (await proof.curl(freshBeforeRestart.url, "PUT", proof.archive)).status === 201,
    "unused grant survives restart",
  );
  await proof.verifyDownload(oldDownload.url);
  check(
    (await proof.call("get_bundle", { slug: "mcp-proof" })).bundle.currentRevision.seq === 2,
    "replay creates no duplicate",
  );
  pass("single use, failure recovery and persistent restart grants");
  stage = "retention and deletion";
  const third = await proof.call("push", { slug: "mcp-proof" });
  check((await proof.curl(third.url, "PUT", proof.archive)).status === 201, "third push");
  const pruned = await proof.call("prune", { slug: "mcp-proof" });
  check(pruned.kept.join(",") === "3,2", "retention");
  check(
    (await proof.curl(oldDownload.url, "GET", undefined, path.join(proof.root, "removed.tar.gz")))
      .status === 404,
    "pruned download",
  );
  check(
    (await proof.call("delete_bundle", { slug: "mcp-proof", confirm: "mcp-proof" })).error ===
      "missing_scope",
    "delete denied by default",
  );
  await proof.stop();
  await proof.start(true);
  await proof.initialize();
  check(
    (await proof.call("delete_bundle", { slug: "mcp-proof", confirm: "wrong" })).error ===
      "confirmation_required",
    "delete confirmation",
  );
  check(
    (await proof.call("delete_bundle", { slug: "mcp-proof", confirm: "mcp-proof" })).deleted,
    "allowlisted delete",
  );
  pass("retention and allowlisted confirmed deletion");
  console.log("CANNOT PROVE production Clerk/OpenBot OAuth. Deferred to Majster after release.");
} catch {
  console.error(`FAIL isolated MCP proof at ${stage}. No credential output retained.`);
  process.exitCode = 1;
} finally {
  await proof.cleanup();
}

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflow = fs.readFileSync(path.join(root, ".github/workflows/release-create.yml"), "utf8");

const githubExpression = (body) => ["$", "{", "{", body, "}", "}"].join("");

const position = (text) => {
  const index = workflow.indexOf(text);
  assert.notEqual(index, -1, `workflow is missing ${text}`);
  return index;
};

describe("gated two-image release workflow", () => {
  it("runs only by workflow dispatch and keeps dry runs side-effect free", () => {
    assert.match(workflow, /on:\n {2}workflow_dispatch:/);
    assert.doesNotMatch(workflow, /\n {2}push:/);
    assert.match(workflow, /if: \$\{\{ !inputs\.dry_run \}\}/);
    assert.match(workflow, /Nothing built, tagged or deployed\./);
    assert.match(workflow, /DOKPLOY_LANDING_APPLICATION_ID is required for a real release/);
    assert.match(workflow, /if: \$\{\{ always\(\) && !cancelled\(\)/);
  });

  it("preflights the live landing health before building or tagging", () => {
    const preflight = position("Preflight landing health");
    const appBuild = position(`file: ${githubExpression(" env.DOCKERFILE ")}`);
    const gitTag = position('git tag -a "$VERSION"');

    assert.ok(preflight < appBuild);
    assert.ok(preflight < gitTag);
    assert.match(workflow, /endpoint="\$\{LANDING_URL%\/\}\$\{LANDING_HEALTH_PATH\}"/g);
    assert.match(workflow, /\.status == "ok"/g);
    assert.match(workflow, /test\("\^\[0-9a-f\]\{12\}\$"\)/g);
  });

  it("pushes app and landing immutable tags before creating the release tag", () => {
    const appBuild = position(`file: ${githubExpression(" env.DOCKERFILE ")}`);
    const landingBuild = position("file: landing/Dockerfile");
    const gitTag = position('git tag -a "$VERSION"');

    assert.ok(appBuild < landingBuild);
    assert.ok(landingBuild < gitTag);
    assert.match(workflow, /:prod-sha-\$\{\{ steps\.version\.outputs\.sha12 \}\}/);
    assert.match(workflow, /:landing-prod-sha-\$\{\{ steps\.version\.outputs\.sha12 \}\}/);
    assert.match(workflow, /build-args: APP_COMMIT=\$\{\{ github\.sha \}\}/g);
    assert.match(workflow, /RELEASE_MARK_LATEST: "false"/);
    assert.match(workflow, /--latest="\$RELEASE_MARK_LATEST"/);
  });

  it("checks both immutable images before changing either Dokploy app", () => {
    const imageCheck = position("Check release images exist");
    const preflight = position("Preflight landing health before Dokploy");
    const appDeploy = position("Deploy app to Dokploy");
    const landingDeploy = position("Deploy landing to Dokploy");

    assert.ok(imageCheck < preflight);
    assert.ok(preflight < appDeploy);
    assert.ok(appDeploy < landingDeploy);
    assert.match(workflow, /docker manifest inspect "\$image"/);
    assert.match(
      workflow,
      /LANDING_IMAGE=ghcr\.io\/\$\{GITHUB_REPOSITORY,,\}:landing-prod-sha-\$\{sha:0:12\}/,
    );
    assert.match(workflow, /DOKPLOY_LANDING_APPLICATION_ID is required for a release or redeploy/);
  });

  it("keeps the CI redirect smoke query-string check", () => {
    const ci = fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");

    assert.match(ci, /\/v\/example\?x=y/);
    assert.match(ci, /hosti-private\.kubaszwajka\.com\/v\/example\?x=y/);
  });

  it("waits for the app before deploying landing and checks both commit-bearing health routes", () => {
    const appHealth = position("Wait for the app commit on health");
    const landingDeploy = position("Deploy landing to Dokploy");
    const landingHealth = position("Wait for the landing commit on health");

    assert.ok(appHealth < landingDeploy);
    assert.ok(landingDeploy < landingHealth);
    assert.match(workflow, /HEALTH_PATH: \/api\/health/);
    assert.match(workflow, /LANDING_HEALTH_PATH: \/healthz/);
    assert.match(workflow, /URL: \$\{\{ env\.LANDING_URL \}\}/);
    assert.match(workflow, /landing commit \$\{seen:-none\}, want \$\{SHA12\}/);
  });
});

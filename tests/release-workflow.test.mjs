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
    assert.match(
      workflow,
      /for name in DOKPLOY_BASE_URL DOKPLOY_API_KEY DOKPLOY_APPLICATION_ID APP_URL; do/g,
    );
    assert.doesNotMatch(workflow, /DOKPLOY_LANDING_APPLICATION_ID/);
    assert.match(workflow, /if: \$\{\{ !cancelled\(\) && !inputs\.dry_run/);
    assert.doesNotMatch(workflow, /always\(\) && !cancelled\(\)/);
  });

  it("does not gate a release or a redeploy on the live landing health", () => {
    assert.doesNotMatch(workflow, /Preflight landing health/);
    assert.doesNotMatch(workflow, /Landing preflight failed/);
    assert.doesNotMatch(workflow, /endpoint="\$\{LANDING_URL%\/\}/);
    // The landing origin is only printed in the operator's deploy summary.
    assert.equal(workflow.split("${LANDING_URL%/}").length - 1, 1);
    assert.ok(position("${LANDING_URL%/}") > position("Print the landing deploy command"));
  });

  it("pushes app and landing immutable tags before creating the release tag", () => {
    const appBuild = position(`file: ${githubExpression(" env.DOCKERFILE ")}`);
    const landingBuild = position(`file: ${githubExpression(" env.LANDING_DOCKERFILE ")}`);
    const gitTag = position('gh release create "$VERSION"');

    assert.ok(appBuild < landingBuild);
    assert.ok(landingBuild < gitTag);
    assert.match(workflow, /:prod-sha-\$\{\{ steps\.version\.outputs\.sha12 \}\}/);
    assert.match(workflow, /:landing-prod-sha-\$\{\{ steps\.version\.outputs\.sha12 \}\}/);
    assert.match(workflow, /build-args: APP_COMMIT=\$\{\{ github\.sha \}\}/);
    assert.match(workflow, /LANDING_DOCKERFILE: landing\/Dockerfile/);
    assert.match(workflow, /RELEASE_MARK_LATEST: "false"/);
    assert.match(workflow, /--target "\$GITHUB_SHA"/);
    assert.doesNotMatch(workflow, /git push origin/);
    assert.match(workflow, /--latest="\$RELEASE_MARK_LATEST"/);
  });

  it("checks both immutable images before deploying the app to Dokploy", () => {
    const imageCheck = position("Check release images exist");
    const appDeploy = position("Deploy app to Dokploy");

    assert.ok(imageCheck < appDeploy);
    assert.match(workflow, /docker manifest inspect "\$image"/);
    assert.match(
      workflow,
      /LANDING_IMAGE=ghcr\.io\/\$\{GITHUB_REPOSITORY,,\}:landing-prod-sha-\$\{sha:0:12\}/,
    );
  });

  it("keeps the CI redirect smoke query-string check", () => {
    const ci = fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");

    assert.match(ci, /\/v\/example\?x=y/);
    assert.match(ci, /hosti-private\.kubaszwajka\.com\/v\/example\?x=y/);
  });

  it("waits for the app health, then tells the operator to deploy landing with Alchemy", () => {
    const appHealth = position("Wait for the new commit on health");
    const landingCommand = position("Print the landing deploy command");

    assert.ok(appHealth < landingCommand);
    assert.doesNotMatch(workflow, /Deploy landing to Dokploy/);
    assert.doesNotMatch(workflow, /Wait for the landing commit on health/);
    assert.match(workflow, /HEALTH_PATH: \/api\/health/);
    assert.match(workflow, /LANDING_HEALTH_PATH: \/healthz/);
    assert.match(workflow, /LANDING_DEPLOY_HOST: hosti\.kubaszwajka\.com/);
    assert.match(
      workflow,
      /echo "alchemy\/landing\/deploy\.sh deploy \$\{VERSION\} \$\{LANDING_DEPLOY_HOST\}"/,
    );
    assert.match(workflow, /serves commit \$\{SHA12\}/);
    assert.match(workflow, /tee -a "\$GITHUB_STEP_SUMMARY"/);
    assert.match(workflow, /\[ "\$\{seen:0:12\}" = "\$SHA12" \]/g);
  });
});

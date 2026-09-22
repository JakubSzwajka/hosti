import { checkerFixtureConfig } from "../config-factory.mjs";

const root = "tools/playbook-checks/tests/fixtures/checker/generated-scope";

export default checkerFixtureConfig("generated-scope", {
  generatedRoots: [
    `${root}/apps/web/.next`,
    `${root}/apps/web/generated-output`,
  ],
});

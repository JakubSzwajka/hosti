import assert from "node:assert/strict";
import test from "node:test";
import { ESLint } from "eslint";

test("lints fixture and data paths while keeping generated output ignored", async () => {
  const config = (await import("../../eslint.config.mjs")).default;
  const eslint = new ESLint({
    cwd: process.cwd(),
    overrideConfigFile: true,
    overrideConfig: config,
  });
  const lintedPaths = [
    "src/data/arbitrary.ts",
    "src/fixtures/arbitrary.ts",
    "src/__fixtures__/arbitrary.ts",
  ];
  const ignoredPaths = [
    "node_modules/pkg/generated.ts",
    "apps/web/.next/generated.ts",
    "apps/web/next-env.d.ts",
    ".pi/specs/generated.ts",
    "packages/example/build/generated.ts",
    "packages/example/dist/generated.ts",
    "packages/example/coverage/generated.ts",
  ];

  for (const filePath of lintedPaths) {
    const [result] = await eslint.lintText("// Must be linted.\nconst value = 1;", { filePath });
    assert.deepEqual(
      result.messages.map((message) => message.ruleId),
      ["house-rules/comment-discipline"],
      filePath,
    );
  }
  for (const filePath of ignoredPaths) {
    assert.equal(await eslint.isPathIgnored(filePath), true, filePath);
  }
});

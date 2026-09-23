import assert from "node:assert/strict";
import test from "node:test";
import { commentMessages, eslintMessages, lintComments } from "./test-helpers.mjs";

function commentViolationCount(code) {
  return lintComments(code).filter((message) => message.ruleId === "hosti/comment-discipline")
    .length;
}

function ruleMessages(code, rules, sourceType) {
  return eslintMessages(code, rules, sourceType).filter((message) => message.ruleId !== null);
}

test("accepts block ESLint configuration comments that ESLint 10 applies", () => {
  const simple = '/* eslint no-console: "off" */\nconsole.log("value");';
  const options =
    '/* eslint no-console: ["error", { "allow": ["warn"] }] */\nconsole.warn("value");';
  const globals = "/* globals injected:readonly */\ninjected;";
  const global = "/* global injected:readonly */\ninjected;";
  const exported = "/* exported publicName */\nvar publicName = 1;";

  assert.deepEqual(commentMessages(simple, "subject.js"), []);
  assert.deepEqual(ruleMessages(simple, { "no-console": "error" }), []);
  assert.deepEqual(commentMessages(options, "subject.js"), []);
  assert.deepEqual(ruleMessages(options, { "no-console": "error" }), []);

  for (const code of [globals, global]) {
    assert.deepEqual(commentMessages(code, "subject.js"), []);
    assert.deepEqual(ruleMessages(code, { "no-undef": "error" }), []);
  }
  assert.deepEqual(commentMessages(exported, "subject.js"), []);
  assert.deepEqual(ruleMessages(exported, { "no-unused-vars": "error" }, "script"), []);
});

test("accepts only control comment forms that ESLint 10 applies", () => {
  const blockControls = `/* eslint-disable no-console */
console.log("disabled");
/* eslint-enable no-console */
console.log("enabled");`;
  const lineNext = "// eslint-disable-next-line no-console\nconsole.log('disabled');";
  const lineSame = "console.log('disabled'); // eslint-disable-line no-console";

  assert.deepEqual(commentMessages(blockControls, "subject.js"), []);
  assert.equal(ruleMessages(blockControls, { "no-console": "error" }).length, 1);
  for (const code of [lineNext, lineSame]) {
    assert.deepEqual(commentMessages(code, "subject.js"), []);
    assert.deepEqual(ruleMessages(code, { "no-console": "error" }), []);
  }
});

test("rejects line configuration forms that ESLint 10 ignores", () => {
  const probes = [
    {
      code: '// eslint no-console: "off"\nconsole.log("value");',
      rules: { "no-console": "error" },
    },
    {
      code: "// global injected:readonly\ninjected;",
      rules: { "no-undef": "error" },
    },
    {
      code: "// globals injected:readonly\ninjected;",
      rules: { "no-undef": "error" },
    },
    {
      code: "// exported publicName\nvar publicName = 1;",
      rules: { "no-unused-vars": "error" },
      sourceType: "script",
    },
    {
      code: "// eslint-env node\nprocess.exit(0);",
      rules: { "no-undef": "error" },
    },
  ];

  for (const { code, rules, sourceType } of probes) {
    assert.equal(commentViolationCount(code), 1, code);
    assert.notEqual(ruleMessages(code, rules, sourceType).length, 0, code);
  }
});

test("rejects line-wide control forms that ESLint 10 ignores", () => {
  const probes = [
    "// eslint-disable no-console\nconsole.log('value');",
    "// eslint-enable no-console\nconsole.log('value');",
  ];

  for (const code of probes) {
    assert.equal(commentViolationCount(code), 1, code);
    assert.equal(ruleMessages(code, { "no-console": "error" }).length, 1, code);
  }
});

test("rejects unsupported eslint-env and invalid rule settings", () => {
  const invalid = [
    "/* eslint-env node */\nprocess.exit(0);",
    "/* eslint no-console: anything after colon */\nconsole.log('value');",
    "/* eslint no-console: */\nconsole.log('value');",
    "/* eslint no-console: [\"error\", invalid] */\nconsole.log('value');",
  ];

  for (const code of invalid) {
    assert.equal(commentViolationCount(code), 1, code);
  }

  const envMessages = eslintMessages(invalid[0], { "no-undef": "error" });
  assert.equal(
    envMessages.some(
      (message) => message.message === "/* eslint-env */ comments are no longer supported.",
    ),
    true,
  );
  assert.equal(
    eslintMessages(invalid[1], { "no-console": "error" }).some((message) => message.fatal),
    true,
  );
  assert.equal(
    eslintMessages(invalid[3], { "no-console": "error" }).some((message) =>
      message.message.startsWith('Inline configuration for rule "no-console" is invalid:'),
    ),
    true,
  );
});

test("rejects line rule-setting near-matches regardless of text after the colon", () => {
  const probes = [
    "// eslint no-console: anything after colon\nconsole.log('value');",
    "// eslint no-console: [\"error\"]\nconsole.log('value');",
    "// global injected:anything\ninjected;",
  ];

  for (const code of probes) assert.equal(commentViolationCount(code), 1, code);
});

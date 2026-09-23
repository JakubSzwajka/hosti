import assert from "node:assert/strict";
import tsParser from "@typescript-eslint/parser";
import { Linter } from "eslint";
import { commentDisciplinePlugin } from "./comment-discipline.mjs";

export const EXPECTED_MESSAGE =
  "Rework this comment: remove it if it restates the code; prefer a clearer name, type, constant, assertion, or test. Keep only a necessary, non-obvious why in one line beside the constrained code.";

export function lintComments(code, filename = "subject.ts") {
  const linter = new Linter();
  return linter.verify(
    code,
    [
      {
        files: ["**/*.{js,jsx,mjs,cjs,ts,tsx}"],
        linterOptions: {
          reportUnusedDisableDirectives: "off",
        },
        languageOptions: {
          parser: tsParser,
          parserOptions: {
            ecmaFeatures: { jsx: true },
          },
        },
        plugins: {
          hosti: commentDisciplinePlugin,
        },
        rules: {
          "hosti/comment-discipline": "error",
        },
      },
    ],
    { filename },
  );
}

export function commentMessages(code, filename) {
  const messages = lintComments(code, filename);
  assert.equal(
    messages.some((message) => message.fatal),
    false,
    messages.map((message) => message.message).join("\n"),
  );
  return messages;
}

export function eslintMessages(code, rules, sourceType = "module") {
  return new Linter().verify(code, [
    {
      languageOptions: { sourceType },
      linterOptions: { reportUnusedDisableDirectives: "off" },
      rules,
    },
  ]);
}

export function assertLocations(messages, expected) {
  assert.deepEqual(
    messages.map(({ line, endLine }) => [line, endLine]),
    expected,
  );
}

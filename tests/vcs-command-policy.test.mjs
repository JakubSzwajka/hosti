import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyCommandPolicy,
  HOOK_BYPASS_REASON,
  NONINTERACTIVE_VCS_ENV,
} from "../scripts/vcs-command-policy.mjs";

const blocked = { action: "block", reason: HOOK_BYPASS_REASON };
const allowedAsIs = (command) => ({ action: "allow", command });
const allowedNonInteractive = (command) => ({
  action: "allow",
  command: `${NONINTERACTIVE_VCS_ENV}${command}`,
});

describe("vcs command policy blocks hook bypass", () => {
  const cases = [
    "git commit --no-verify -m nope",
    "git push --no-verify",
    "/usr/bin/git push --no-verify",
    "cd x && git commit --no-verify",
    "git -C repo merge --no-verify topic",
    'git commit -m "--no-verify in msg"',
    "git commit -n -m nope",
    "cd x && git commit -n",
    "git commit -anm nope",
    "git -C repo commit -n",
    'bash -c "git commit -n -m nope"',
    "git -c core.hooksPath=/dev/null commit -m nope",
    "git config core.hooksPath /tmp/none",
    "LEFTHOOK=0 git commit -m nope",
  ];
  for (const command of cases) {
    it(command, () => {
      assert.deepEqual(applyCommandPolicy(command), blocked);
    });
  }
});

describe("vcs command policy allows other commands", () => {
  const unrelated = ["npm test", "echo --no-verify", "some-tool --no-verify", "gitk --all"];
  for (const command of unrelated) {
    it(`${command} is unchanged`, () => {
      assert.deepEqual(applyCommandPolicy(command), allowedAsIs(command));
    });
  }

  const vcs = [
    "git status",
    "/usr/bin/git status",
    "cd repo && git rebase -i HEAD~2",
    "jj describe",
    'git commit -m "fix -n handling"',
    "git commit -mn",
    "git commit -m -n",
    "git push -n",
    "git merge --no-verify-signatures topic",
    "git commit -- -n",
  ];
  for (const command of vcs) {
    it(`${command} gets a non-interactive editor`, () => {
      assert.deepEqual(applyCommandPolicy(command), allowedNonInteractive(command));
    });
  }
});

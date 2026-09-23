import assert from "node:assert/strict";
import { describe, it } from "node:test";

import gitInterceptor from "../.pi/extensions/git-interceptor.ts";
import { HOOK_BYPASS_REASON, NONINTERACTIVE_VCS_ENV } from "../scripts/vcs-command-policy.mjs";

const loadHandler = () => {
  let handler;
  gitInterceptor({
    on: (event, registered) => {
      assert.equal(event, "tool_call");
      handler = registered;
    },
  });
  return handler;
};

describe("Pi git interceptor extension", () => {
  it("blocks a bash call with git commit --no-verify", () => {
    const event = { toolName: "bash", input: { command: "git commit --no-verify" } };
    assert.deepEqual(loadHandler()(event), { block: true, reason: HOOK_BYPASS_REASON });
  });

  it("rewrites a git call to use a non-interactive editor", () => {
    const event = { toolName: "bash", input: { command: "git rebase -i HEAD~2" } };
    assert.equal(loadHandler()(event), undefined);
    assert.equal(event.input.command, `${NONINTERACTIVE_VCS_ENV}git rebase -i HEAD~2`);
  });

  it("ignores other tools", () => {
    const event = { toolName: "write", input: { command: "git commit --no-verify" } };
    assert.equal(loadHandler()(event), undefined);
    assert.equal(event.input.command, "git commit --no-verify");
  });
});

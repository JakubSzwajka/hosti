import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { HOOK_BYPASS_REASON } from "../scripts/vcs-command-policy.mjs";

const hook = fileURLToPath(new URL("../scripts/hooks/block-git-no-verify.mjs", import.meta.url));

const runHook = (input) => {
  const result = spawnSync(process.execPath, [hook], { input, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout };
};

const preToolUse = (command) =>
  JSON.stringify({
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command },
  });

describe("Claude Code PreToolUse hook", () => {
  it("denies git commit --no-verify", () => {
    const { status, stdout } = runHook(preToolUse("git commit --no-verify -m nope"));
    assert.equal(status, 0);
    assert.deepEqual(JSON.parse(stdout), {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: HOOK_BYPASS_REASON,
      },
    });
  });

  it("stays silent for git status so the normal permission flow runs", () => {
    assert.deepEqual(runHook(preToolUse("git status")), { status: 0, stdout: "" });
  });

  it("stays silent on unreadable input", () => {
    assert.deepEqual(runHook("not json"), { status: 0, stdout: "" });
  });
});

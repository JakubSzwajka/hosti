#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Joel Hooks

import { applyCommandPolicy } from "../vcs-command-policy.mjs";

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
};

const readPayload = async () => {
  try {
    const raw = await readStdin();
    return raw.trim() === "" ? {} : JSON.parse(raw);
  } catch {
    return {};
  }
};

const payload = await readPayload();
const command = typeof payload?.tool_input?.command === "string" ? payload.tool_input.command : "";
const result = applyCommandPolicy(command);

if (result.action === "block") {
  const decision = {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: result.reason,
    },
  };
  process.stdout.write(`${JSON.stringify(decision)}\n`);
}

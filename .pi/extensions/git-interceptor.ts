// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Joel Hooks

import { applyCommandPolicy } from "../../scripts/vcs-command-policy.mjs";

type ToolCallEvent = { toolName: string; input: Record<string, unknown> };
type ToolCallResult = { block: true; reason: string } | undefined;
type ExtensionApi = {
  on(event: "tool_call", handler: (event: ToolCallEvent) => ToolCallResult): unknown;
};

export default function gitInterceptor(pi: ExtensionApi): void {
  pi.on("tool_call", (event) => {
    const command = event.input.command;
    if (event.toolName !== "bash" || typeof command !== "string") {
      return undefined;
    }
    const result = applyCommandPolicy(command);
    if (result.action === "block") {
      return { block: true, reason: result.reason };
    }
    event.input.command = result.command;
    return undefined;
  });
}

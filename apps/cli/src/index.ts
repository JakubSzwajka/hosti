#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { HELP, parseInvocation, UsageError } from "./delivery/args.ts";
import { openInBrowser } from "./delivery/browser.ts";
import { ApiError, createClient } from "./delivery/client.ts";
import { ConfigError, resolveConfig } from "./delivery/config.ts";
import { COMMAND_TABLE, CommandError } from "./delivery/commands.ts";
import { login, logout } from "./delivery/login.ts";
import { PackError } from "./delivery/pack.ts";
import { stderr, stdout } from "./delivery/output.ts";

const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;

async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) {
    throw new CommandError("Nothing is attached to ask; pass --yes to go ahead");
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await rl.question(question);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

export async function run(argv: string[]): Promise<number> {
  let invocation: ReturnType<typeof parseInvocation>;
  try {
    invocation = parseInvocation(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    stderr(error.message);
    return EXIT_USAGE;
  }

  if (invocation.kind === "help") {
    stdout(HELP);
    return 0;
  }

  const { command } = invocation;
  try {
    if (command === "login") {
      await login({
        target: invocation.target,
        flags: invocation.flags,
        out: stdout,
        err: stderr,
        env: process.env,
        openUrl: (url) => openInBrowser(url, stderr),
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        now: Date.now,
      });
      return 0;
    }
    if (command === "logout") {
      logout({ out: stdout, err: stderr, env: process.env });
      return 0;
    }

    const config = resolveConfig(invocation.flags);
    await COMMAND_TABLE[command]({
      client: createClient(config),
      flags: invocation.flags,
      target: invocation.target,
      base: config.url,
      out: stdout,
      err: stderr,
      confirm,
      openUrl: (url) => openInBrowser(url, stderr),
    });
    return 0;
  } catch (error) {
    if (error instanceof ConfigError) {
      stderr(error.message);
      return EXIT_USAGE;
    }
    if (error instanceof ApiError || error instanceof PackError || error instanceof CommandError) {
      stderr(error.message);
      return EXIT_FAILURE;
    }
    stderr(error instanceof Error ? error.message : String(error));
    return EXIT_FAILURE;
  }
}

process.exitCode = await run(process.argv.slice(2));

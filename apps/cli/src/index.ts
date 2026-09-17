#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { HELP, parseInvocation, UsageError } from "./args.ts";
import { openInBrowser } from "./browser.ts";
import { ApiError, createClient } from "./client.ts";
import { ConfigError, resolveConfig } from "./config.ts";
import { COMMAND_TABLE, CommandError } from "./commands.ts";
import { PackError } from "./pack.ts";
import { stderr, stdout } from "./output.ts";

/** 0 fine, 1 the server or the files said no, 2 the command line was wrong. */
const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;

/** Ask the terminal. With no terminal there is nobody to ask, so refuse. */
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

  try {
    const config = resolveConfig(invocation.flags);
    await COMMAND_TABLE[invocation.command]({
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

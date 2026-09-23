// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Joel Hooks

const BOUNDARY = String.raw`[\s;&|()\x60'"]`;
const GIT_COMMAND = new RegExp(
  String.raw`(?:^|${BOUNDARY})(?:[^\s;&|()]*/)?git(?=$|${BOUNDARY})`,
  "mu",
);
const VCS_COMMAND = new RegExp(
  String.raw`(?:^|${BOUNDARY})(?:[^\s;&|()]*/)?(?:git|jj)(?=$|${BOUNDARY})`,
  "mu",
);
const NO_VERIFY = new RegExp(`(?:^|${BOUNDARY}|=)--no-verify(?=$|${BOUNDARY}|=)`, "mu");
const HOOKS_PATH = /core\.hookspath/iu;
const LEFTHOOK_OFF = /(?:^|[\s;&|()])LEFTHOOK=(?:0|false)(?=$|[\s;&|()])/mu;

const GIT_VALUE_OPTIONS = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace"]);
const COMMIT_VALUE_FLAGS = "mFcCt";
const COMMIT_ATTACHED_FLAGS = "Su";
const COMMIT_LONG_VALUE_OPTIONS = new Set([
  "--message",
  "--file",
  "--author",
  "--date",
  "--template",
  "--reuse-message",
  "--reedit-message",
  "--fixup",
  "--squash",
  "--trailer",
  "--cleanup",
  "--pathspec-from-file",
]);
const SEGMENT_BREAKS = ";&|()\n`";

export const NONINTERACTIVE_VCS_ENV =
  "export GIT_EDITOR=: GIT_SEQUENCE_EDITOR=: GIT_MERGE_AUTOEDIT=no JJ_EDITOR=:\n";

export const HOOK_BYPASS_REASON =
  "Blocked hook bypass. Do not use --no-verify, git commit -n, core.hooksPath, or LEFTHOOK=0. Fix the hook failure, or ask before changing the hook policy.";

const tokenize = (command) => {
  const segments = [[]];
  let token = null;
  let quote = null;
  const endToken = () => {
    if (token !== null) {
      segments[segments.length - 1].push(token);
      token = null;
    }
  };
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (quote !== null) {
      if (char === quote) {
        quote = null;
      } else if (char === "\\" && quote === '"' && index + 1 < command.length) {
        index += 1;
        token += command[index];
      } else {
        token += char;
      }
    } else if (char === "'" || char === '"') {
      quote = char;
      token ??= "";
    } else if (char === "\\" && index + 1 < command.length) {
      index += 1;
      token = (token ?? "") + command[index];
    } else if (SEGMENT_BREAKS.includes(char)) {
      endToken();
      segments.push([]);
    } else if (/\s/u.test(char)) {
      endToken();
    } else {
      token = (token ?? "") + char;
    }
  }
  endToken();
  return segments.filter((segment) => segment.length > 0);
};

const gitSubcommand = (segment) => {
  const gitIndex = segment.findIndex((word) => /(?:^|\/)git$/u.test(word));
  if (gitIndex === -1) {
    return null;
  }
  for (let index = gitIndex + 1; index < segment.length; index += 1) {
    const word = segment[index];
    if (GIT_VALUE_OPTIONS.has(word)) {
      index += 1;
    } else if (!word.startsWith("-")) {
      return { name: word, args: segment.slice(index + 1) };
    }
  }
  return null;
};

const readShortCluster = (cluster) => {
  for (let index = 1; index < cluster.length; index += 1) {
    const flag = cluster[index];
    if (flag === "n") {
      return "skips-hooks";
    }
    if (COMMIT_VALUE_FLAGS.includes(flag)) {
      return index === cluster.length - 1 ? "value-follows" : "value-attached";
    }
    if (COMMIT_ATTACHED_FLAGS.includes(flag)) {
      return "value-attached";
    }
  }
  return "flags-only";
};

const commitArgsSkipHooks = (args) => {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      return false;
    }
    if (COMMIT_LONG_VALUE_OPTIONS.has(arg)) {
      index += 1;
    } else if (/^-[^-]/u.test(arg)) {
      const cluster = readShortCluster(arg);
      if (cluster === "skips-hooks") {
        return true;
      }
      if (cluster === "value-follows") {
        index += 1;
      }
    }
  }
  return false;
};

const commitSkipsHooks = (command, depth = 0) =>
  tokenize(command).some((segment) => {
    const subcommand = gitSubcommand(segment);
    if (subcommand?.name === "commit" && commitArgsSkipHooks(subcommand.args)) {
      return true;
    }
    // Quoted words may be a nested shell such as bash -c "git commit -n".
    return (
      depth < 3 && segment.some((word) => /\s/u.test(word) && commitSkipsHooks(word, depth + 1))
    );
  });

const bypassesHooks = (command) => {
  if (LEFTHOOK_OFF.test(command)) {
    return true;
  }
  if (!GIT_COMMAND.test(command)) {
    return false;
  }
  return NO_VERIFY.test(command) || HOOKS_PATH.test(command) || commitSkipsHooks(command);
};

export const applyCommandPolicy = (command) => {
  if (bypassesHooks(command)) {
    return { action: "block", reason: HOOK_BYPASS_REASON };
  }
  if (!VCS_COMMAND.test(command)) {
    return { action: "allow", command };
  }
  return { action: "allow", command: `${NONINTERACTIVE_VCS_ENV}${command}` };
};

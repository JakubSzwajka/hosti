export class UsageError extends Error {}

export const COMMANDS = ["push", "ls", "share", "rotate", "rm", "open", "prune"] as const;
export type Command = (typeof COMMANDS)[number];

const SWITCHES = new Set(["allow-absolute", "yes", "open", "help", "version"]);
const VALUE_FLAGS = new Set(["slug", "title", "collection", "mode", "pin", "url", "token"]);

export type Flags = {
  slug?: string;
  title?: string;
  collection?: string;
  mode?: string;
  pin?: string;
  url?: string;
  token?: string;
  allowAbsolute?: boolean;
  yes?: boolean;
  open?: boolean;
  help?: boolean;
  version?: boolean;
};

export type Invocation =
  | { kind: "help" }
  | { kind: "run"; command: Command; target: string; flags: Flags };

const CAMEL: Record<string, keyof Flags> = {
  "allow-absolute": "allowAbsolute",
};

function assign(flags: Flags, name: string, value: string | boolean): void {
  const key = CAMEL[name] ?? (name as keyof Flags);
  (flags as Record<string, string | boolean>)[key] = value;
}

export function parseFlags(argv: string[]): { positionals: string[]; flags: Flags } {
  const positionals: string[] = [];
  const flags: Flags = {};

  for (let i = 0; i < argv.length; i += 1) {
    const word = argv[i] as string;
    if (word === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (!word.startsWith("--")) {
      positionals.push(word);
      continue;
    }

    const equals = word.indexOf("=");
    const name = equals === -1 ? word.slice(2) : word.slice(2, equals);
    const inline = equals === -1 ? null : word.slice(equals + 1);

    if (SWITCHES.has(name)) {
      if (inline !== null) throw new UsageError(`--${name} takes no value`);
      assign(flags, name, true);
      continue;
    }
    if (!VALUE_FLAGS.has(name)) throw new UsageError(`Unknown flag --${name}`);

    const value = inline ?? argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new UsageError(`--${name} needs a value`);
    }
    if (inline === null) i += 1;
    assign(flags, name, value);
  }

  return { positionals, flags };
}

export function parseInvocation(argv: string[]): Invocation {
  const { positionals, flags } = parseFlags(argv);
  const [name, ...rest] = positionals;

  if (!name || flags.help) return { kind: "help" };
  if (!(COMMANDS as readonly string[]).includes(name)) {
    throw new UsageError(`Unknown command "${name}". Try one of: ${COMMANDS.join(", ")}`);
  }
  const command = name as Command;

  if (rest.length > 1) throw new UsageError(`${command} takes one argument, got ${rest.length}`);
  const target = rest[0] ?? "";

  if (command === "push") {
    if (!target) throw new UsageError("push needs a path: hosti push ./dist --slug my-bundle");
    if (!flags.slug) throw new UsageError("push needs --slug");
  }
  if (command !== "push" && command !== "ls" && !target) {
    throw new UsageError(`${command} needs a slug: hosti ${command} my-bundle`);
  }
  if (command === "share") {
    if (!flags.mode) throw new UsageError("share needs --mode private, link or pin");
    if (!(MODES as readonly string[]).includes(flags.mode)) {
      throw new UsageError(`--mode is one of ${MODES.join(", ")}`);
    }
    if (flags.pin && flags.mode !== "pin") {
      throw new UsageError("--pin only goes with --mode pin");
    }
  } else {
    if (flags.mode) throw new UsageError(`--mode means nothing to ${command}`);
    if (flags.pin) throw new UsageError(`--pin means nothing to ${command}`);
  }
  if (command !== "open" && flags.open) {
    throw new UsageError(`--open means nothing to ${command}`);
  }

  return { kind: "run", command, target, flags };
}

const MODES = ["private", "link", "pin"] as const;

export const HELP = `hosti - push static bundles to a Hosti server

  hosti push <path> --slug <slug> [--title T] [--collection C]
                    [--allow-absolute]
  hosti ls [--collection C]
  hosti share <slug> --mode private|link|pin [--pin 4821]
  hosti rotate <slug>
  hosti rm <slug> [--yes]
  hosti open <slug> [--open]
  hosti prune <slug>

A bundle has one sharing state and at most one link:
  private  nothing answers at the share URL
  link     anyone holding the URL opens the bundle
  pin      the URL asks for the pin, then opens the bundle

A push never changes that state. A new bundle arrives private.

A pin is four to eight digits and you type it. Hosti hashes it, so nothing
ever prints the digits back. --mode pin with no pin stored and no --pin is
refused rather than left open.

rotate mints a fresh share URL and the old one stops answering. That is the
only way to cut off somebody who already has the address.

open prints the bundle's share link, or its owner-only page while the bundle
is private, and always on the last line. --open hands it to a browser.
prune trims a bundle to the newest few revisions the server keeps.

Config, in order: --url and --token, then HOSTI_URL and HOSTI_TOKEN,
then ~/.config/hosti.json.`;

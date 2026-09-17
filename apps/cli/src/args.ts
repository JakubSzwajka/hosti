/** Turning `process.argv` into one command with its flags. */

export class UsageError extends Error {}

export const COMMANDS = ["push", "ls", "share", "links", "rm", "revoke"] as const;
export type Command = (typeof COMMANDS)[number];

/** Flags that stand alone. Everything else swallows the next word. */
const SWITCHES = new Set(["share", "unlisted", "allow-absolute", "yes", "help", "version"]);
const VALUE_FLAGS = new Set(["slug", "title", "collection", "url", "token"]);

export type Flags = {
  slug?: string;
  title?: string;
  collection?: string;
  url?: string;
  token?: string;
  share?: boolean;
  unlisted?: boolean;
  allowAbsolute?: boolean;
  yes?: boolean;
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

/** One pass over the words: `--name value`, `--name=value`, or a switch. */
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

/** What the words mean: which command, its one argument, and the flags. */
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
  if ((command === "ls" || command === "links" || command === "revoke") && flags.unlisted) {
    throw new UsageError(`--unlisted means nothing to ${command}`);
  }

  return { kind: "run", command, target, flags };
}

export const HELP = `hosti - push static bundles to a Hosti server

  hosti push <path> --slug <slug> [--title T] [--collection C]
                    [--share] [--unlisted] [--allow-absolute]
  hosti ls [--collection C]
  hosti share <slug> [--unlisted]
  hosti links <slug>
  hosti rm <slug> [--yes]
  hosti revoke <share-slug>

Config, in order: --url and --token, then HOSTI_URL and HOSTI_TOKEN,
then ~/.config/hosti.json.`;

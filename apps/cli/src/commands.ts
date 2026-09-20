import type { Bundle, SharingMode, SharingResponse } from "@hosti/shared";
import { scanForAbsoluteRefs } from "./absolute-refs.ts";
import type { Flags } from "./args.ts";
import { ApiError, type Client } from "./client.ts";
import { packBundle } from "./pack.ts";
import { say, table, warnAbsoluteRefs, type Writer } from "./output.ts";

export type Context = {
  client: Client;
  flags: Flags;
  target: string;
  /** The server the caller asked for, which is the host their links must use. */
  base: string;
  out: Writer;
  err: Writer;
  /** Asks the person at the terminal; `rm` is the only caller. */
  confirm: (question: string) => Promise<boolean>;
  /** Hands a URL to the platform's browser; `open --open` is the only caller. */
  openUrl: (url: string) => void;
};

export class CommandError extends Error {}

/** `2026-09-17 16:04` out of an ISO timestamp. */
function when(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

/**
 * Keep the path the server chose, but hang it off the server the caller named.
 * Next in development answers with its own idea of the host, and a link the
 * caller cannot open is worse than no link.
 */
export function against(base: string, url: string): string {
  try {
    return `${base}${new URL(url).pathname}`;
  } catch {
    return url;
  }
}

/**
 * Where a bundle can be read after a write. The state word comes first,
 * because it is the same word the catalog and the API use, and the URL only
 * exists for two of the three.
 */
function reportSharing(out: Writer, base: string, state: SharingResponse): void {
  say(out, state.sharing.mode, noteFor(state));
  if (state.shareUrl) say(out, "url", against(base, state.shareUrl));
}

function noteFor(state: SharingResponse): string {
  if (state.sharing.mode === "private") return "nothing answers at the share URL";
  if (state.sharing.mode === "pin") return "the URL asks for the pin first";
  return "anyone holding the URL can open it";
}

export async function push(context: Context): Promise<void> {
  const { client, flags, out, err } = context;
  const slug = flags.slug as string;
  const bundle = await packBundle(context.target);

  if (!flags.allowAbsolute) {
    warnAbsoluteRefs(err, await scanForAbsoluteRefs(bundle.root, bundle.files), slug);
  }

  const pushed = await client.push({
    slug,
    body: bundle.body,
    ...(flags.title ? { title: flags.title } : {}),
    ...(flags.collection ? { collection: flags.collection } : {}),
  });
  say(out, "pushed", `revision ${pushed.revision}`);

  // A push never changes the sharing state, so this only reports it.
  say(out, pushed.sharing.mode, pushed.shareUrl ? "" : "nothing answers at the share URL");
  if (pushed.shareUrl) say(out, "url", against(context.base, pushed.shareUrl));
  else say(out, "admin", against(context.base, pushed.adminUrl));
}

export async function ls(context: Context): Promise<void> {
  const { client, flags, out } = context;
  const wanted = flags.collection?.trim();
  const bundles = (await client.catalog()).bundles.filter(
    (bundle: Bundle) => !wanted || bundle.collection === wanted,
  );

  if (bundles.length === 0) {
    say(out, "empty", wanted ? `no bundles in ${wanted}` : "no bundles pushed yet");
    return;
  }

  const rows = [["slug", "rev", "collection", "updated", "sharing", "url"]];
  for (const bundle of bundles) {
    const { mode, shareSlug } = bundle.sharing;
    rows.push([
      bundle.slug,
      String(bundle.currentRevision?.seq ?? 0),
      bundle.collection ?? "-",
      when(bundle.updatedAt),
      mode,
      mode === "private" ? "-" : `${context.base}/v/${shareSlug}/`,
    ]);
  }
  table(out, rows);
}

/**
 * Put the bundle into one of the three states. The pin is hashed the moment it
 * arrives, so the only way to change one is to type a new one, and nothing
 * ever prints the digits back.
 */
export async function share(context: Context): Promise<void> {
  const { flags } = context;
  const state = await context.client.share(context.target, flags.mode as SharingMode, flags.pin);
  reportSharing(context.out, context.base, state);
}

/**
 * Mint a fresh share URL. The old one stops answering at once, which is the
 * only way to cut off somebody who already has the address. The state and the
 * pin stay as they were.
 */
export async function rotate(context: Context): Promise<void> {
  const state = await context.client.rotate(context.target);
  say(context.out, "rotated", "the old URL stopped answering");
  reportSharing(context.out, context.base, state);
}

export async function rm(context: Context): Promise<void> {
  const { target, flags, client, out } = context;
  if (!flags.yes) {
    const question = `Delete bundle ${target} with every revision and its share link? [y/N] `;
    if (!(await context.confirm(question))) {
      say(out, "kept", target);
      return;
    }
  }
  await client.remove(target);
  say(out, "removed", target);
}

/**
 * Where a bundle can be read: its share link, or the owner-only page while the
 * bundle is private. The URL is the last line on purpose, bare, so
 * `hosti open x | tail -1` is a URL and nothing else.
 */
export async function open(context: Context): Promise<void> {
  const { client, target, out, base } = context;
  const found = await client.bundle(target).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  });
  if (!found) throw new CommandError(`No bundle is called "${target}"`);

  const { mode } = found.bundle.sharing;
  const url = found.shareUrl ? against(base, found.shareUrl) : `${base}/b/${target}`;
  if (mode === "link") say(out, "link", `anyone holding this URL can open ${target}`);
  else if (mode === "pin") say(out, "pin", `this URL asks for the pin, then opens ${target}`);
  else say(out, "private", `${target} is private, so this page wants the owner password`);
  if (context.flags.open) context.openUrl(url);
  out(url);
}

/**
 * Prune on demand. A push already prunes, so this is for a bundle nobody has
 * pushed since the keep count was tightened. The count is the server's, from
 * HOSTI_KEEP_REVISIONS, and the CLI has no say in it.
 */
export async function prune(context: Context): Promise<void> {
  const pruned = await context.client.prune(context.target);
  const { out } = context;
  say(out, "keep", `${pruned.keep} newest`);
  say(out, "kept", pruned.kept.length ? pruned.kept.join(", ") : "nothing");
  say(out, "removed", pruned.removed.length ? pruned.removed.join(", ") : "nothing");
}

export const COMMAND_TABLE = { push, ls, share, rotate, rm, open, prune } as const;

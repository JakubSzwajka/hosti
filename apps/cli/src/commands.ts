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
  base: string;
  out: Writer;
  err: Writer;
  confirm: (question: string) => Promise<boolean>;
  openUrl: (url: string) => void;
};

export class CommandError extends Error {}

function when(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

export function against(base: string, url: string): string {
  try {
    return `${base}${new URL(url).pathname}`;
  } catch {
    return url;
  }
}

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

export async function share(context: Context): Promise<void> {
  const { flags } = context;
  const state = await context.client.share(context.target, flags.mode as SharingMode, flags.pin);
  reportSharing(context.out, context.base, state);
}

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

export async function prune(context: Context): Promise<void> {
  const pruned = await context.client.prune(context.target);
  const { out } = context;
  say(out, "keep", `${pruned.keep} newest`);
  say(out, "kept", pruned.kept.length ? pruned.kept.join(", ") : "nothing");
  say(out, "removed", pruned.removed.length ? pruned.removed.join(", ") : "nothing");
}

export async function whoami(context: Context): Promise<void> {
  const me = await context.client.whoami();
  say(context.out, "url", context.base);
  say(context.out, "token", me.name);
  say(context.out, "scopes", me.scopes.join(", "));
}

export const COMMAND_TABLE = { whoami, push, ls, share, rotate, rm, open, prune } as const;

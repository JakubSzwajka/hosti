import type { Bundle } from "@hosti/shared";
import { scanForAbsoluteRefs } from "./absolute-refs.ts";
import type { Flags } from "./args.ts";
import type { Client } from "./client.ts";
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

function reportLinks(out: Writer, base: string, urls: string[], adminUrl: string): void {
  if (urls.length === 0) {
    say(out, "private", "no share link yet");
    say(out, "admin", against(base, adminUrl));
    return;
  }
  for (const url of urls) say(out, "shared", against(base, url));
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

  if (flags.share || flags.unlisted) {
    const created = await client.share(slug, flags.unlisted === true, flags.pin);
    say(out, "shared", against(context.base, created.link.url));
    if (created.link.hasPin) say(out, "pin", "set");
    return;
  }
  reportLinks(out, context.base, pushed.shareUrls, pushed.adminUrl);
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

  const rows = [["slug", "rev", "collection", "updated", "links", "url"]];
  for (const bundle of bundles) {
    rows.push([
      bundle.slug,
      String(bundle.currentRevision?.seq ?? 0),
      bundle.collection ?? "-",
      when(bundle.updatedAt),
      String(bundle.shareSlugs.length),
      bundle.shareSlugs.length === 0 ? "private" : `${context.base}/v/${bundle.shareSlugs[0]}/`,
    ]);
  }
  table(out, rows);
}

export async function share(context: Context): Promise<void> {
  const { flags } = context;
  const created = await context.client.share(context.target, flags.unlisted === true, flags.pin);
  say(context.out, "shared", against(context.base, created.link.url));
  if (created.link.hasPin) say(context.out, "pin", "set");
}

export async function links(context: Context): Promise<void> {
  const { links: found } = await context.client.links(context.target);
  if (found.length === 0) {
    say(context.out, "private", `${context.target} has no share link`);
    return;
  }
  table(
    context.out,
    found.map((link) => [
      link.slug,
      when(link.createdAt),
      link.hasPin ? "pin set" : "",
      against(context.base, link.url),
    ]),
  );
}

/**
 * Put a PIN on a link that already exists, or take one off. There is no read:
 * the PIN is hashed the moment it arrives, so the only way to change one is to
 * type a new one.
 */
export async function pin(context: Context): Promise<void> {
  const { client, flags, target, out } = context;
  if (flags.remove) {
    await client.removePin(target);
    say(out, "pin", `removed from ${target}`);
    return;
  }
  await client.setPin(target, flags.set as string);
  say(out, "pin", `set on ${target}`);
}

export async function rm(context: Context): Promise<void> {
  const { target, flags, client, out } = context;
  if (!flags.yes) {
    const question = `Delete bundle ${target} with every revision and share link? [y/N] `;
    if (!(await context.confirm(question))) {
      say(out, "kept", target);
      return;
    }
  }
  await client.remove(target);
  say(out, "removed", target);
}

export async function revoke(context: Context): Promise<void> {
  await context.client.revoke(context.target);
  say(context.out, "revoked", context.target);
}

/**
 * Where a bundle can be read: its share link, or the owner-only page when
 * nobody has opened a door yet. The URL is the last line on purpose, bare, so
 * `hosti open x | tail -1` is a URL and nothing else.
 */
export async function open(context: Context): Promise<void> {
  const { client, target, out, base } = context;
  const bundle = (await client.catalog()).bundles.find((entry) => entry.slug === target);
  if (!bundle) throw new CommandError(`No bundle is called "${target}"`);

  const shareSlug = bundle.shareSlugs[0];
  const url = shareSlug ? `${base}/v/${shareSlug}/` : `${base}/b/${target}`;
  if (shareSlug) {
    say(out, "shared", `anyone holding this link can open ${target}`);
  } else {
    say(out, "private", `${target} has no share link, so this page wants the owner password`);
  }
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

export const COMMAND_TABLE = { push, ls, share, links, pin, rm, revoke, open, prune } as const;

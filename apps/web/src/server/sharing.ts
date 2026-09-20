/**
 * The sharing state of a bundle. One bundle, one state, at most one link.
 *
 *   private  nothing answers at the share URL
 *   link     anyone holding the URL opens the bundle
 *   pin      the URL shows the pin gate, then opens the bundle
 *
 * The state lives on the bundle row, so there is nothing to keep in step and
 * no second link to forget about. `rotate` mints a fresh share slug and is the
 * only way to cut off somebody who already has the address.
 */
import type { SharingMode, SharingResponse, SharingState } from "@hosti/shared";
import { randomInt } from "node:crypto";
import {
  isSharingMode,
  PIN_RULE,
  ROTATED_ALPHABET,
  ROTATED_LENGTH,
  SHARING_MODE_RULE,
} from "@hosti/shared";
import { db, nowIso } from "@/server/db";
import { PushError } from "@/server/errors";

/** How many fresh slugs to try before giving up. A collision is a lottery win. */
const ROTATE_TRIES = 5;

export type SharingRow = {
  id: number;
  slug: string;
  share_mode: string;
  share_slug: string;
  pin_hash: string | null;
};

/** The sharing state as the API and the UI report it. */
export function describeSharing(row: SharingRow): SharingState {
  return {
    mode: toMode(row.share_mode),
    shareSlug: row.share_slug,
    hasPin: row.pin_hash !== null,
  };
}

/**
 * The absolute share URL, or null while the bundle is private. Private answers
 * nothing, so printing a URL for it would be printing a 404.
 */
export function shareUrl(state: SharingState, baseUrl: string): string | null {
  if (state.mode === "private") return null;
  return `${baseUrl}/v/${state.shareSlug}/`;
}

/**
 * A stored mode Hosti does not know reads as private. A row it cannot judge is
 * a row it refuses to open, which is the safe way round.
 */
function toMode(value: string): SharingMode {
  return isSharingMode(value) ? value : "private";
}

/** Read a mode off a request body or a form field. */
export function readSharingMode(value: unknown): SharingMode {
  if (!isSharingMode(value)) throw new PushError("bad_mode", SHARING_MODE_RULE);
  return value;
}

/** A fresh random share slug, unique across every bundle. */
function mintShareSlug(): string {
  let slug = "";
  for (let index = 0; index < ROTATED_LENGTH; index += 1) {
    slug += ROTATED_ALPHABET[randomInt(ROTATED_ALPHABET.length)];
  }
  return slug;
}

function isTaken(shareSlug: string, exceptBundleId: number): boolean {
  const row = db()
    .prepare("SELECT id FROM bundles WHERE share_slug = ? AND id != ?")
    .get(shareSlug, exceptBundleId);
  return row !== undefined;
}

/**
 * The share slug a brand new bundle starts on: its own slug, so `sleep-brief`
 * is shared at `/v/sleep-brief/`. A rotated slug elsewhere could in theory
 * have taken that name, so a taken one falls back to a fresh random slug.
 */
export function initialShareSlug(bundleSlug: string): string {
  const taken = db().prepare("SELECT id FROM bundles WHERE share_slug = ?").get(bundleSlug);
  if (!taken) return bundleSlug;
  return uniqueShareSlug(0);
}

function uniqueShareSlug(bundleId: number): string {
  for (let attempt = 0; attempt < ROTATE_TRIES; attempt += 1) {
    const candidate = mintShareSlug();
    if (!isTaken(candidate, bundleId)) return candidate;
  }
  throw new PushError("rotate_failed", "Could not find a free share slug", 500);
}

/**
 * Mint a fresh share slug. The old URL stops answering at once, which is the
 * only way to cut off somebody who already has the address. The mode and the
 * pin are left exactly as they were.
 */
export function rotateShareSlug(bundleId: number): string {
  const fresh = uniqueShareSlug(bundleId);
  db()
    .prepare("UPDATE bundles SET share_slug = ?, updated_at = ? WHERE id = ?")
    .run(fresh, nowIso(), bundleId);
  return fresh;
}

/**
 * Put a bundle into one of the three states.
 *
 * Going private or going to a plain link clears the pin hash. A pin that
 * survives going private is a trap: the owner sees `private`, turns the link
 * back on later and gets a gate they no longer remember the digits for.
 *
 * `mode: "pin"` needs a pin. The caller either sends fresh digits or the
 * bundle already holds a hash; neither means the call is refused, because
 * silently opening the link would be the opposite of what was asked.
 */
export function setSharing(
  bundleId: number,
  input: { mode: SharingMode; pinHash?: string | null },
): void {
  const pinHash = input.mode === "pin" ? (input.pinHash ?? currentPinHash(bundleId)) : null;
  if (input.mode === "pin" && !pinHash) {
    throw new PushError("pin_required", `Mode "pin" needs a pin. ${PIN_RULE}`);
  }
  db()
    .prepare("UPDATE bundles SET share_mode = ?, pin_hash = ?, updated_at = ? WHERE id = ?")
    .run(input.mode, pinHash, nowIso(), bundleId);
}

function currentPinHash(bundleId: number): string | null {
  const row = db().prepare("SELECT pin_hash FROM bundles WHERE id = ?").get(bundleId) as
    | { pin_hash: string | null }
    | undefined;
  return row?.pin_hash ?? null;
}

/**
 * Run one sharing write for a bundle at a time, in the order the requests
 * arrived.
 *
 * Hashing a pin costs scrypt time. Without this queue a slow `pin` request that
 * arrived first could finish last and write its hash over a `private` request
 * that had already cleared it, so a bundle the owner just shut would quietly
 * carry a pin again. Queueing the hash and the write together makes the last
 * request to arrive the one that decides.
 *
 * The queue lives in this process. Hosti is one owner on one box, so one Node
 * process is the whole server.
 */
const sharingWrites = new Map<number, Promise<unknown>>();

export function queueSharingWrite<T>(bundleId: number, work: () => Promise<T>): Promise<T> {
  const previous = sharingWrites.get(bundleId) ?? Promise.resolve();
  const result = previous.then(work, work);
  const settled = result.then(
    () => undefined,
    () => undefined,
  );
  sharingWrites.set(bundleId, settled);
  void settled.then(() => {
    if (sharingWrites.get(bundleId) === settled) sharingWrites.delete(bundleId);
  });
  return result;
}

/** The body both sharing endpoints answer with: the state as it now stands. */
export function sharingBody(row: SharingRow, baseUrl: string): SharingResponse {
  const sharing = describeSharing(row);
  return { bundle: row.slug, sharing, shareUrl: shareUrl(sharing, baseUrl) };
}

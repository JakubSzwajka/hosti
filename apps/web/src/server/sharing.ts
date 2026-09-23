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

const ROTATE_TRIES = 5;

export type SharingRow = {
  id: number;
  slug: string;
  share_mode: string;
  share_slug: string;
  pin_hash: string | null;
};

export function describeSharing(row: SharingRow): SharingState {
  return {
    mode: toMode(row.share_mode),
    shareSlug: row.share_slug,
    hasPin: row.pin_hash !== null,
  };
}

export function shareUrl(state: SharingState, baseUrl: string): string | null {
  if (state.mode === "private") return null;
  return `${baseUrl}/v/${state.shareSlug}/`;
}

function toMode(value: string): SharingMode {
  return isSharingMode(value) ? value : "private";
}

export function readSharingMode(value: unknown): SharingMode {
  if (!isSharingMode(value)) throw new PushError("bad_mode", SHARING_MODE_RULE);
  return value;
}

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

export function rotateShareSlug(bundleId: number): string {
  const fresh = uniqueShareSlug(bundleId);
  db()
    .prepare("UPDATE bundles SET share_slug = ?, updated_at = ? WHERE id = ?")
    .run(fresh, nowIso(), bundleId);
  return fresh;
}

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

const sharingWrites = new Map<number, Promise<unknown>>();

export function queueSharingWrite<T>(bundleId: number, work: () => Promise<T>): Promise<T> {
  // Serialize hashing with the write so a slower pin cannot overwrite a later private update.
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

export function sharingBody(row: SharingRow, baseUrl: string): SharingResponse {
  const sharing = describeSharing(row);
  return { bundle: row.slug, sharing, shareUrl: shareUrl(sharing, baseUrl) };
}

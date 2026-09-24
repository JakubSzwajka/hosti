import { Catalog, type CatalogService } from "@hosti/catalog";
import type { SharingMode, SharingResponse, SharingState } from "@hosti/shared";
import {
  isSharingMode,
  PIN_RULE,
  ROTATED_ALPHABET,
  ROTATED_LENGTH,
  SHARING_MODE_RULE,
} from "@hosti/shared";
import { Effect, Random, Semaphore } from "effect";
import { BundlesError } from "./bundles-error";
import { catalogBundlesError, internalBundlesError } from "./internal/errors";

const ROTATE_TRIES = 5;

type SharingLock = {
  readonly semaphore: Semaphore.Semaphore;
  users: number;
};

const sharingLocks = new Map<number, SharingLock>();

export type SharingRow = {
  id: number;
  slug: string;
  share_mode: string;
  share_slug: string;
  pin_hash: string | null;
};

export function describeSharing(row: SharingRow): SharingState {
  return {
    mode: isSharingMode(row.share_mode) ? row.share_mode : "private",
    shareSlug: row.share_slug,
    hasPin: row.pin_hash !== null,
  };
}

export function shareUrl(state: SharingState, baseUrl: string): string | null {
  if (state.mode === "private") return null;
  return `${baseUrl}/v/${state.shareSlug}/`;
}

export function readSharingMode(value: unknown): Effect.Effect<SharingMode, BundlesError> {
  if (isSharingMode(value)) return Effect.succeed(value);
  return Effect.fail(
    new BundlesError({ code: "bad_mode", message: SHARING_MODE_RULE, status: 400 }),
  );
}

function isShareSlugTaken(catalog: CatalogService, shareSlug: string, exceptBundleId: number) {
  return Effect.gen(function* () {
    const database = yield* catalog.database.pipe(Effect.mapError(catalogBundlesError));
    return yield* Effect.try({
      try: () =>
        database
          .prepare("SELECT id FROM bundles WHERE share_slug = ? AND id != ?")
          .get(shareSlug, exceptBundleId) !== undefined,
      catch: internalBundlesError,
    });
  });
}

function mintShareSlug() {
  return Effect.gen(function* () {
    const characters: string[] = [];
    for (let index = 0; index < ROTATED_LENGTH; index += 1) {
      const characterIndex = yield* Random.nextIntBetween(0, ROTATED_ALPHABET.length - 1);
      characters.push(ROTATED_ALPHABET.charAt(characterIndex));
    }
    return characters.join("");
  });
}

function uniqueShareSlug(catalog: CatalogService, bundleId: number) {
  return Effect.gen(function* () {
    for (let attempt = 0; attempt < ROTATE_TRIES; attempt += 1) {
      const candidate = yield* mintShareSlug();
      const taken = yield* isShareSlugTaken(catalog, candidate, bundleId);
      if (!taken) return candidate;
    }
    return yield* new BundlesError({
      code: "rotate_failed",
      message: "Could not find a free share slug",
      status: 500,
    });
  });
}

export const initialShareSlug = Effect.fn("Bundles.initialShareSlug")(function* (
  bundleSlug: string,
) {
  const catalog = yield* Catalog;
  const database = yield* catalog.database.pipe(Effect.mapError(catalogBundlesError));
  const taken = yield* Effect.try({
    try: () =>
      database.prepare("SELECT id FROM bundles WHERE share_slug = ?").get(bundleSlug) !== undefined,
    catch: internalBundlesError,
  });
  if (!taken) return bundleSlug;
  return yield* uniqueShareSlug(catalog, 0);
});

export const rotateShareSlug = Effect.fn("Bundles.rotateShareSlug")(function* (bundleId: number) {
  const catalog = yield* Catalog;
  const fresh = yield* uniqueShareSlug(catalog, bundleId);
  const database = yield* catalog.database.pipe(Effect.mapError(catalogBundlesError));
  const updatedAt = yield* catalog.nowIso;
  yield* Effect.try({
    try: () =>
      database
        .prepare("UPDATE bundles SET share_slug = ?, updated_at = ? WHERE id = ?")
        .run(fresh, updatedAt, bundleId),
    catch: internalBundlesError,
  });
  return fresh;
});

function currentPinHash(catalog: CatalogService, bundleId: number) {
  return Effect.gen(function* () {
    const database = yield* catalog.database.pipe(Effect.mapError(catalogBundlesError));
    return yield* Effect.try({
      try: () =>
        (
          database.prepare("SELECT pin_hash FROM bundles WHERE id = ?").get(bundleId) as
            | { pin_hash: string | null }
            | undefined
        )?.pin_hash ?? null,
      catch: internalBundlesError,
    });
  });
}

export const setSharing = Effect.fn("Bundles.setSharing")(function* (
  bundleId: number,
  input: { mode: SharingMode; pinHash?: string | null },
) {
  const catalog = yield* Catalog;
  const pinHash =
    input.mode === "pin" ? (input.pinHash ?? (yield* currentPinHash(catalog, bundleId))) : null;
  if (input.mode === "pin" && !pinHash) {
    return yield* new BundlesError({
      code: "pin_required",
      message: `Mode "pin" needs a pin. ${PIN_RULE}`,
      status: 400,
    });
  }
  const database = yield* catalog.database.pipe(Effect.mapError(catalogBundlesError));
  const updatedAt = yield* catalog.nowIso;
  yield* Effect.try({
    try: () =>
      database
        .prepare("UPDATE bundles SET share_mode = ?, pin_hash = ?, updated_at = ? WHERE id = ?")
        .run(input.mode, pinHash, updatedAt, bundleId),
    catch: internalBundlesError,
  });
});

export function queueSharingWrite<A, E, R>(
  bundleId: number,
  work: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.acquireUseRelease(
    Effect.sync(() => {
      const existing = sharingLocks.get(bundleId);
      if (existing) {
        existing.users += 1;
        return { bundleId, lock: existing };
      }
      const lock = { semaphore: Semaphore.makeUnsafe(1), users: 1 };
      sharingLocks.set(bundleId, lock);
      return { bundleId, lock };
    }),
    ({ lock }) => lock.semaphore.withPermit(work),
    ({ bundleId: key, lock }) =>
      Effect.sync(() => {
        lock.users -= 1;
        if (lock.users === 0 && sharingLocks.get(key) === lock) sharingLocks.delete(key);
      }),
  );
}

export function sharingBody(row: SharingRow, baseUrl: string): SharingResponse {
  const sharing = describeSharing(row);
  return { bundle: row.slug, sharing, shareUrl: shareUrl(sharing, baseUrl) };
}

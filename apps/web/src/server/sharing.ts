import type { SharingMode, SharingResponse } from "@hosti/shared";
import {
  describeSharing,
  initialShareSlug as initialShareSlugEffect,
  queueSharingWrite as queueSharingWriteEffect,
  readSharingMode as readSharingModeEffect,
  rotateShareSlug as rotateShareSlugEffect,
  setSharing as setSharingEffect,
  shareUrl,
  sharingBody as sharingBodyEffect,
  SharingWriteFailure,
  type SharingRow,
} from "@hosti/bundles";
import { Effect } from "effect";
import { runBundlesPromise, runBundlesPureSync, runBundlesSync } from "@/server/runtime";

export type { SharingRow };

export { describeSharing, shareUrl };

export function readSharingMode(value: unknown): SharingMode {
  return runBundlesPureSync(readSharingModeEffect(value));
}

export function initialShareSlug(bundleSlug: string): string {
  return runBundlesSync(initialShareSlugEffect(bundleSlug));
}

export function rotateShareSlug(bundleId: number): string {
  return runBundlesSync(rotateShareSlugEffect(bundleId));
}

export function setSharing(
  bundleId: number,
  input: { mode: SharingMode; pinHash?: string | null },
): void {
  runBundlesSync(setSharingEffect(bundleId, input));
}

export function queueSharingWrite<T>(bundleId: number, work: () => Promise<T>): Promise<T> {
  const workEffect = Effect.tryPromise({
    try: work,
    catch: (cause) => new SharingWriteFailure({ cause }),
  });
  return runBundlesPromise(queueSharingWriteEffect(bundleId, workEffect)).catch(
    (error: unknown) => {
      if (error instanceof SharingWriteFailure) throw error.cause;
      throw error;
    },
  );
}

export function sharingBody(row: SharingRow, baseUrl: string): SharingResponse {
  return sharingBodyEffect(row, baseUrl);
}

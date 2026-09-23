import type { Bundle, Revision } from "@hosti/shared";
import { runCatalogSync } from "@/server/runtime";
import type { BundleRecord, ResolvedShare, StoredRevision } from "@hosti/catalog";

export type { BundleRecord } from "@hosti/catalog";

export function findBundle(slug: string): BundleRecord | null {
  return runCatalogSync((catalog) => catalog.findBundle(slug));
}

export function createBundle(input: {
  slug: string;
  title?: string | null;
  collection?: string | null;
}): BundleRecord {
  return runCatalogSync((catalog) => catalog.createBundle(input));
}

export function deleteBundle(bundleId: number): void {
  runCatalogSync((catalog) => catalog.deleteBundle(bundleId));
}

export function updateBundleMeta(
  bundleId: number,
  input: { title?: string | null; collection?: string | null },
): void {
  runCatalogSync((catalog) => catalog.updateBundleMeta(bundleId, input));
}

export function setBundleCollection(bundleId: number, collection: string | null): void {
  runCatalogSync((catalog) => catalog.setBundleCollection(bundleId, collection));
}

export function listCollections(): string[] {
  return runCatalogSync((catalog) => catalog.listCollections);
}

export function nextRevisionSeq(bundleId: number): number {
  return runCatalogSync((catalog) => catalog.nextRevisionSeq(bundleId));
}

export function recordRevision(input: {
  bundleId: number;
  seq: number;
  byteSize: number;
  fileCount: number;
  pushedBy: string;
}): Revision {
  return runCatalogSync((catalog) => catalog.recordRevision(input));
}

export type { StoredRevision } from "@hosti/catalog";

export function revisionRecords(bundleId: number): StoredRevision[] {
  return runCatalogSync((catalog) => catalog.revisionRecords(bundleId));
}

export function deleteRevisionRows(bundleId: number, ids: number[]): void {
  runCatalogSync((catalog) => catalog.deleteRevisionRows(bundleId, ids));
}

export function listRevisions(bundleId: number): (Revision & { current: boolean })[] {
  return runCatalogSync((catalog) => catalog.listRevisions(bundleId));
}

export type { ResolvedShare } from "@hosti/catalog";

export function resolveShare(shareSlug: string): ResolvedShare | null {
  return runCatalogSync((catalog) => catalog.resolveShare(shareSlug));
}

export function describeBundle(bundle: BundleRecord): Bundle {
  return runCatalogSync((catalog) => catalog.describeBundle(bundle));
}

export function listCatalog(): Bundle[] {
  return runCatalogSync((catalog) => catalog.listCatalog);
}

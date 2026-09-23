import type { Revision, Bundle } from "@hosti/shared";
import type Database from "better-sqlite3";
import type { Effect } from "effect";
import type { Crypto } from "effect/Crypto";
import type { CatalogError } from "./catalog-error";

export type BundleRecord = {
  id: number;
  slug: string;
  title: string;
  collection: string | null;
  current_revision_id: number | null;
  share_mode: string;
  share_slug: string;
  pin_hash: string | null;
  created_at: string;
  updated_at: string;
};

export type RevisionRow = {
  id: number;
  bundle_id: number;
  seq: number;
  byte_size: number;
  file_count: number;
  pushed_by: string | null;
  created_at: string;
};

export type StoredRevision = { id: number; seq: number; current: boolean };

export type ResolvedShare = {
  shareSlug: string;
  bundleSlug: string;
  bundleId: number;
  currentSeq: number;
  pinHash: string | null;
};

export type CatalogRevision = Revision & { current: boolean };

export type CatalogMethods = {
  readonly database: Effect.Effect<Database.Database, CatalogError>;
  readonly nowIso: Effect.Effect<string>;
  readonly setDataDir: (dataDir: string) => Effect.Effect<void, CatalogError>;
  readonly findBundle: (slug: string) => Effect.Effect<BundleRecord | null, CatalogError>;
  readonly createBundle: (input: {
    slug: string;
    title?: string | null;
    collection?: string | null;
  }) => Effect.Effect<BundleRecord, CatalogError>;
  readonly deleteBundle: (bundleId: number) => Effect.Effect<void, CatalogError>;
  readonly updateBundleMeta: (
    bundleId: number,
    input: { title?: string | null; collection?: string | null },
  ) => Effect.Effect<void, CatalogError>;
  readonly setBundleCollection: (
    bundleId: number,
    collection: string | null,
  ) => Effect.Effect<void, CatalogError>;
  readonly listCollections: Effect.Effect<string[], CatalogError>;
  readonly nextRevisionSeq: (bundleId: number) => Effect.Effect<number, CatalogError>;
  readonly recordRevision: (input: {
    bundleId: number;
    seq: number;
    byteSize: number;
    fileCount: number;
    pushedBy: string;
  }) => Effect.Effect<Revision, CatalogError>;
  readonly revisionRecords: (bundleId: number) => Effect.Effect<StoredRevision[], CatalogError>;
  readonly deleteRevisionRows: (
    bundleId: number,
    ids: number[],
  ) => Effect.Effect<void, CatalogError>;
  readonly listRevisions: (bundleId: number) => Effect.Effect<CatalogRevision[], CatalogError>;
  readonly resolveShare: (shareSlug: string) => Effect.Effect<ResolvedShare | null, CatalogError>;
  readonly describeBundle: (bundle: BundleRecord) => Effect.Effect<Bundle, CatalogError>;
  readonly listCatalog: Effect.Effect<Bundle[], CatalogError>;
};

export type CatalogWriteDependencies = {
  readonly database: Effect.Effect<Database.Database, CatalogError>;
  readonly nowIso: Effect.Effect<string>;
  readonly crypto: Crypto;
};

import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { assert, expect, it } from "@effect/vitest";
import { CATALOG_UPLOAD, IdentityCrypto } from "@hosti/identity";
import { Catalog } from "@hosti/catalog";
import { ROTATED_ALPHABET, ROTATED_LENGTH } from "@hosti/shared";
import { ArchiveCodec, Storage } from "@hosti/storage";
import { Effect, FileSystem, Layer, Path, Ref, Stream } from "effect";
import {
  acceptPush,
  initialShareSlug,
  pruneRevisions,
  queueSharingWrite,
  removeBundle,
  rotateShareSlug,
  setSharing,
} from "../index";

const page = new Uint8Array([60, 104, 49, 62, 104, 105, 60, 47, 104, 49, 62]);

const testArchiveCodec = ArchiveCodec.layer({
  gunzip: (source) => source,
  inflateRaw: (source) => source,
  tarEntries: (source) =>
    Stream.unwrap(
      Stream.runFold(
        source,
        () => 0,
        (_marker, chunk) => chunk[0] ?? 0,
      ).pipe(
        Effect.map(() =>
          Stream.make({
            path: "index.html",
            kind: "file" as const,
            size: page.length,
            content: Stream.make(page),
          }),
        ),
      ),
    ),
});

const platformLayer = Layer.mergeAll(
  NodeCrypto.layer,
  NodeFileSystem.layer,
  NodePath.layer,
  testArchiveCodec,
);

type BundleServices =
  | Catalog
  | Storage
  | IdentityCrypto
  | FileSystem.FileSystem
  | Path.Path
  | import("effect/Crypto").Crypto;

function testIdentityCrypto(randomInt: (maxExclusive: number) => number = () => 0) {
  return IdentityCrypto.layer({
    encodeBase64Url: (value) => value,
    decodeBase64Url: (value) => value,
    hmacSha256Base64Url: () => Effect.succeed(""),
    sha256Hex: () => Effect.succeed(""),
    randomBytesHex: () => Effect.succeed(""),
    randomBytesBase64Url: () => Effect.succeed(""),
    randomInt: (maxExclusive) => Effect.sync(() => randomInt(maxExclusive)),
    deriveScryptBase64Url: () => Effect.succeed(""),
    constantTimeEquals: () => Effect.succeed(false),
  });
}

function withBundleServices<A, E>(
  test: (bundlesRoot: string) => Effect.Effect<A, E, BundleServices>,
  identityCryptoLayer: Layer.Layer<IdentityCrypto> = testIdentityCrypto(),
) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tempDir = yield* fs.makeTempDirectoryScoped({ prefix: "hosti-bundles-" });
    const schemaPath = path.resolve(import.meta.dirname, "../../../catalog/schema.sql");
    const schemaSql = yield* fs.readFileString(schemaPath);
    const dataDir = path.join(tempDir, "data");
    yield* fs.makeDirectory(dataDir, { recursive: true });
    const bundlesRoot = path.join(tempDir, "bundles");
    const servicesLayer = Layer.mergeAll(
      Catalog.layer(dataDir, schemaSql),
      Storage.layer,
      identityCryptoLayer,
    ).pipe(Layer.provideMerge(platformLayer));
    return yield* test(bundlesRoot).pipe(Effect.provide(servicesLayer));
  }).pipe(Effect.provide(platformLayer));
}

function recordStoredRevision(bundleId: number, seq: number, bundlesRoot: string) {
  return Effect.gen(function* () {
    const catalog = yield* Catalog;
    const storage = yield* Storage;
    const stats = yield* storage.writeRevision({
      bundlesRoot,
      bundleSlug: "prune-me",
      seq,
      source: Stream.make(new Uint8Array([seq])),
      format: "tar.gz",
    });
    yield* catalog.recordRevision({
      bundleId,
      seq,
      byteSize: stats.byteSize,
      fileCount: stats.fileCount,
      pushedBy: "@catalog",
    });
  });
}

it.effect("keeps the bundle slug until a share slug is rotated", () =>
  withBundleServices(() =>
    Effect.gen(function* () {
      const catalog = yield* Catalog;
      const initial = yield* initialShareSlug("rotate-me");
      const bundle = yield* catalog.createBundle({ slug: "rotate-me" });
      yield* setSharing(bundle.id, { mode: "pin", pinHash: "stored-pin-hash" });
      const fresh = yield* rotateShareSlug(bundle.id);
      const updated = yield* catalog.findBundle("rotate-me");

      expect(initial).toBe("rotate-me");
      expect(fresh).not.toBe("rotate-me");
      expect(fresh).toMatch(/^[bcdfghjkmnpqrstvwxz2-9]{12}$/);
      expect(updated?.share_slug).toBe(fresh);
      expect(updated?.share_mode).toBe("pin");
      expect(updated?.pin_hash).toBe("stored-pin-hash");
    }),
  ),
);

it.effect("mints share slugs through the identity crypto seam", () => {
  const draws: number[] = [];
  const identityCryptoLayer = testIdentityCrypto((maxExclusive) => {
    const index = draws.length;
    draws.push(maxExclusive);
    return index;
  });

  return withBundleServices(
    () =>
      Effect.gen(function* () {
        const catalog = yield* Catalog;
        yield* catalog.createBundle({ slug: "reserved-share" });
        const slug = yield* initialShareSlug("reserved-share");

        expect(slug).toBe("bcdfghjkmnpq");
        expect(draws).toEqual(
          Array.from({ length: ROTATED_LENGTH }, () => ROTATED_ALPHABET.length),
        );
      }),
    identityCryptoLayer,
  );
});

it.effect("serializes sharing writes for one bundle", () =>
  Effect.gen(function* () {
    const active = yield* Ref.make(0);
    const maximum = yield* Ref.make(0);
    const work = Effect.gen(function* () {
      const count = yield* Ref.updateAndGet(active, (value) => value + 1);
      yield* Ref.update(maximum, (value) => Math.max(value, count));
      yield* Effect.yieldNow;
      yield* Ref.update(active, (value) => value - 1);
    });

    yield* Effect.all([queueSharingWrite(9001, work), queueSharingWrite(9001, work)], {
      concurrency: "unbounded",
    });

    assert.strictEqual(yield* Ref.get(maximum), 1);
  }),
);

it.effect("prunes old revision files and rows but keeps current and newest revisions", () =>
  withBundleServices((bundlesRoot) =>
    Effect.gen(function* () {
      const catalog = yield* Catalog;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const bundle = yield* catalog.createBundle({ slug: "prune-me" });
      for (let seq = 1; seq <= 5; seq += 1) {
        yield* recordStoredRevision(bundle.id, seq, bundlesRoot);
      }

      const recordsBefore = yield* catalog.revisionRecords(bundle.id);
      const oldCurrent = recordsBefore.find((record) => record.seq === 2);
      expect(oldCurrent).toBeDefined();
      if (!oldCurrent) return;
      const database = yield* catalog.database;
      yield* Effect.sync(() =>
        database
          .prepare("UPDATE bundles SET current_revision_id = ? WHERE id = ?")
          .run(oldCurrent.id, bundle.id),
      );
      const currentLink = path.join(bundlesRoot, "prune-me", "current");
      yield* fs.remove(currentLink, { force: true });
      yield* fs.symlink("r2", currentLink);

      const pruned = yield* pruneRevisions({ bundleSlug: "prune-me", bundlesRoot, keep: 2 });
      const records = yield* catalog.revisionRecords(bundle.id);
      const revisionDirs = yield* Effect.forEach([1, 2, 3, 4, 5], (seq) =>
        fs.exists(path.join(bundlesRoot, "prune-me", `r${seq}`)),
      );

      expect(pruned.kept).toEqual([5, 4, 2]);
      expect(pruned.removed).toEqual([3, 1]);
      expect(records.map((record) => record.seq)).toEqual([5, 4, 2]);
      expect(revisionDirs).toEqual([false, true, false, true, true]);
    }),
  ),
);

it.effect("removes a bundle row and its files", () =>
  withBundleServices((bundlesRoot) =>
    Effect.gen(function* () {
      const catalog = yield* Catalog;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const bundle = yield* catalog.createBundle({ slug: "remove-me" });
      const storage = yield* Storage;
      yield* storage.writeRevision({
        bundlesRoot,
        bundleSlug: bundle.slug,
        seq: 1,
        source: Stream.make(new Uint8Array([1])),
        format: "tar.gz",
      });
      yield* catalog.recordRevision({
        bundleId: bundle.id,
        seq: 1,
        byteSize: page.length,
        fileCount: 1,
        pushedBy: "@catalog",
      });

      const removed = yield* removeBundle({ slug: bundle.slug, bundlesRoot });

      expect(removed).toBe(true);
      expect(yield* catalog.findBundle(bundle.slug)).toBeNull();
      expect(yield* fs.exists(path.join(bundlesRoot, "remove-me"))).toBe(false);
      expect(yield* removeBundle({ slug: bundle.slug, bundlesRoot })).toBe(false);
    }),
  ),
);

it.effect("accepts a push, records its revision and builds the response", () =>
  withBundleServices((bundlesRoot) =>
    Effect.gen(function* () {
      const catalog = yield* Catalog;
      const response = yield* acceptPush({
        slug: "pushed-bundle",
        source: Stream.make(new Uint8Array([1])),
        format: "tar.gz",
        title: "Pushed bundle",
        collection: "reports",
        bundlesRoot,
        baseUrl: "http://localhost:3000",
        pushedBy: CATALOG_UPLOAD,
      });
      const bundle = yield* catalog.findBundle("pushed-bundle");
      const revisions = bundle ? yield* catalog.listRevisions(bundle.id) : [];

      expect(response).toEqual({
        bundle: "pushed-bundle",
        revision: 1,
        adminUrl: "http://localhost:3000/b/pushed-bundle",
        sharing: { mode: "private", shareSlug: "pushed-bundle", hasPin: false },
        shareUrl: null,
      });
      expect(bundle?.collection).toBe("reports");
      expect(revisions).toMatchObject([{ seq: 1, current: true, pushedBy: "@catalog" }]);
    }),
  ),
);

import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { expect, it } from "@effect/vitest";
import { Crypto, Effect, FileSystem, Layer, Path, Exit } from "effect";
import { TestClock } from "effect/testing";
import {
  Transfers,
  TRANSFER_TTL_MS,
  MAX_TRANSFERS,
  type Transfer,
  type TransferInput,
} from "../index";

const platform = Layer.mergeAll(NodeCrypto.layer, NodeFileSystem.layer, NodePath.layer);
const upload: TransferInput = {
  kind: "upload",
  subject: "user_test",
  clientId: "client_test",
  clientName: "Test",
  slug: "test",
  title: null,
  collection: null,
  maxBytes: 50 * 1024 * 1024,
};

it.layer(Transfers.layer.pipe(Layer.provideMerge(platform)))("persistent transfers", (test) => {
  test.effect("reserves only once across independent callers using the same data directory", () =>
    Effect.gen(function* () {
      const transfers = yield* Transfers;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const grant = yield* transfers.issue(root, upload);
      const results = yield* Effect.all(
        [
          transfers.reserveUpload(root, grant.id).pipe(Effect.exit),
          transfers.reserveUpload(root, grant.id).pipe(Effect.exit),
        ],
        { concurrency: "unbounded" },
      );
      expect(results.filter(Exit.isSuccess)).toHaveLength(1);
      expect(yield* fs.exists(path.join(root, "mcp-transfers", `${grant.id}.used`))).toBe(true);
      expect((yield* transfers.reserveUpload(root, grant.id).pipe(Effect.flip)).code).toBe(
        "transfer_consumed",
      );
      expect((yield* transfers.read(root, grant.id, "download").pipe(Effect.flip)).code).toBe(
        "invalid_transfer",
      );
    }),
  );

  test.effect("expires upload and download grants and reclaims consumed state", () =>
    Effect.gen(function* () {
      const transfers = yield* Transfers;
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const first = yield* transfers.issue(root, upload);
      const second = yield* transfers.issue(root, {
        kind: "download",
        subject: "user_test",
        clientId: "client_test",
        slug: "test",
        seq: 1,
        identity: "revision_identity",
      });
      yield* transfers.reserveUpload(root, first.id);
      yield* TestClock.adjust(TRANSFER_TTL_MS);
      expect((yield* transfers.read(root, first.id, "upload").pipe(Effect.flip)).code).toBe(
        "invalid_transfer",
      );
      expect((yield* transfers.read(root, second.id, "download").pipe(Effect.flip)).code).toBe(
        "invalid_transfer",
      );
      yield* transfers.issue(root, upload);
      expect(yield* fs.exists(path.join(root, "mcp-transfers", `${first.id}.used`))).toBe(false);
      expect(yield* fs.readDirectory(path.join(root, "mcp-transfers"))).toHaveLength(1);
    }),
  );

  test.effect("caps outstanding grants then permits new grants after expiry", () =>
    Effect.gen(function* () {
      const transfers = yield* Transfers;
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped();
      const path = yield* Path.Path;
      const crypto = yield* Crypto.Crypto;
      const first = yield* transfers.issue(root, upload);
      const directory = path.join(root, "mcp-transfers");
      for (let index = 1; index < MAX_TRANSFERS - 1; index++) {
        const grant: Transfer = { ...first, id: yield* crypto.randomUUIDv4 };
        yield* fs.writeFileString(path.join(directory, `${grant.id}.json`), JSON.stringify(grant), {
          flag: "wx",
          mode: 0o600,
        });
      }
      expect(yield* fs.readDirectory(directory)).toHaveLength(255);
      expect((yield* transfers.issue(root, upload)).input.slug).toBe("test");
      expect(yield* fs.readDirectory(directory)).toHaveLength(256);
      expect((yield* transfers.issue(root, upload).pipe(Effect.flip)).status).toBe(429);
      yield* TestClock.adjust(TRANSFER_TTL_MS);
      expect((yield* transfers.issue(root, upload)).input.slug).toBe("test");
      expect(yield* fs.readDirectory(directory)).toHaveLength(1);
    }),
  );

  test.effect("rejects metadata outside limits and transfer path traversal", () =>
    Effect.gen(function* () {
      const transfers = yield* Transfers;
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped();
      for (const input of [
        { ...upload, slug: "../test" },
        { ...upload, title: "x".repeat(201) },
        { ...upload, maxBytes: 50 * 1024 * 1024 + 1 },
        { ...upload, collection: "-" },
      ]) {
        expect((yield* transfers.issue(root, input).pipe(Effect.flip)).status).toBe(400);
      }
      expect((yield* transfers.read(root, "../hosti.db", "upload").pipe(Effect.flip)).code).toBe(
        "invalid_transfer",
      );
    }),
  );
});

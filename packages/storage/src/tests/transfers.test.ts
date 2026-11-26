import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { expect, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path, Exit } from "effect";
import { TestClock } from "effect/testing";
import {
  issueTransfer,
  readTransfer,
  reserveUpload,
  TRANSFER_TTL_MS,
  MAX_TRANSFERS,
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

it.layer(platform)("persistent transfers", (test) => {
  test.effect("reserves only once across independent callers using the same data directory", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const grant = yield* issueTransfer(root, upload);
      const results = yield* Effect.all(
        [
          reserveUpload(root, grant.id).pipe(Effect.exit),
          reserveUpload(root, grant.id).pipe(Effect.exit),
        ],
        { concurrency: "unbounded" },
      );
      expect(results.filter(Exit.isSuccess)).toHaveLength(1);
      expect(yield* fs.exists(path.join(root, "mcp-transfers", `${grant.id}.used`))).toBe(true);
      expect((yield* reserveUpload(root, grant.id).pipe(Effect.flip)).code).toBe(
        "transfer_consumed",
      );
      expect((yield* readTransfer(root, grant.id, "download").pipe(Effect.flip)).code).toBe(
        "invalid_transfer",
      );
    }),
  );

  test.effect("expires upload and download grants and reclaims consumed state", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const first = yield* issueTransfer(root, upload);
      const second = yield* issueTransfer(root, {
        kind: "download",
        subject: "user_test",
        clientId: "client_test",
        slug: "test",
        seq: 1,
        identity: "revision_identity",
      });
      yield* reserveUpload(root, first.id);
      yield* TestClock.adjust(TRANSFER_TTL_MS);
      expect((yield* readTransfer(root, first.id, "upload").pipe(Effect.flip)).code).toBe(
        "invalid_transfer",
      );
      expect((yield* readTransfer(root, second.id, "download").pipe(Effect.flip)).code).toBe(
        "invalid_transfer",
      );
      yield* issueTransfer(root, upload);
      expect(yield* fs.exists(path.join(root, "mcp-transfers", `${first.id}.used`))).toBe(false);
      expect(yield* fs.readDirectory(path.join(root, "mcp-transfers"))).toHaveLength(1);
    }),
  );

  test.effect("caps outstanding grants then permits new grants after expiry", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped();
      for (let index = 0; index < MAX_TRANSFERS; index++) yield* issueTransfer(root, upload);
      expect((yield* issueTransfer(root, upload).pipe(Effect.flip)).status).toBe(429);
      yield* TestClock.adjust(TRANSFER_TTL_MS);
      expect((yield* issueTransfer(root, upload)).input.slug).toBe("test");
    }),
  );

  test.effect("rejects metadata outside limits and transfer path traversal", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped();
      for (const input of [
        { ...upload, slug: "../test" },
        { ...upload, title: "x".repeat(201) },
        { ...upload, maxBytes: 50 * 1024 * 1024 + 1 },
        { ...upload, collection: "-" },
      ]) {
        expect((yield* issueTransfer(root, input).pipe(Effect.flip)).status).toBe(400);
      }
      expect((yield* readTransfer(root, "../hosti.db", "upload").pipe(Effect.flip)).code).toBe(
        "invalid_transfer",
      );
    }),
  );
});

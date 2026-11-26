import { Clock, Context, Effect, FileSystem, Layer, Path, Schema, Semaphore } from "effect";
import * as Crypto from "effect/Crypto";
import { PUSH_LIMITS, isValidSlug, readCollection } from "@hosti/shared";
import { storageError, type StorageError } from "./storage-error";

const common = {
  subject: Schema.NonEmptyString,
  clientId: Schema.NonEmptyString,
  slug: Schema.NonEmptyString,
};
export const UploadTransfer = Schema.Struct({
  ...common,
  kind: Schema.Literal("upload"),
  clientName: Schema.NonEmptyString,
  title: Schema.NullOr(Schema.String),
  collection: Schema.NullOr(Schema.String),
  maxBytes: Schema.Int,
});
export const DownloadTransfer = Schema.Struct({
  ...common,
  kind: Schema.Literal("download"),
  seq: Schema.Int,
  identity: Schema.NonEmptyString,
});
const TransferInput = Schema.Union([UploadTransfer, DownloadTransfer]);
const Transfer = Schema.Struct({
  id: Schema.NonEmptyString,
  expiresAt: Schema.Finite,
  input: TransferInput,
});
export type TransferInput = typeof TransferInput.Type;
export type Transfer = typeof Transfer.Type;
export const TRANSFER_TTL_MS = 600_000;
export const MAX_TRANSFERS = 256;

const invalid = () => storageError("invalid_transfer", "Transfer unavailable", 404);
const ioError = () => storageError("transfer_io", "Cannot store transfer state", 500);
const allocation = Semaphore.makeUnsafe(1);
const busy = () => storageError("transfer_limit", "Transfer capacity reached. Retry later", 429);
const validId = (id: string) => /^[a-f0-9-]{36}$/.test(id);

const issueTransfer = Effect.fn("Storage.issueTransfer")(function* (
  dataDir: string,
  input: TransferInput,
) {
  const decoded = yield* Schema.decodeEffect(TransferInput)(input).pipe(
    Effect.mapError(() => storageError("bad_metadata", "Invalid transfer metadata", 400)),
  );
  if (
    !isValidSlug(decoded.slug) ||
    decoded.subject.length > 256 ||
    decoded.clientId.length > 256 ||
    (decoded.kind === "upload" &&
      (Array.from(decoded.clientName).length > 80 ||
        (decoded.title?.length ?? 0) > 200 ||
        (decoded.collection !== null && readCollection(decoded.collection) === undefined) ||
        decoded.maxBytes < 1 ||
        decoded.maxBytes > PUSH_LIMITS.maxCompressedBytes))
  ) {
    return yield* storageError("bad_metadata", "Invalid transfer metadata", 400);
  }
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const crypto = yield* Crypto.Crypto;
  const root = path.join(dataDir, "mcp-transfers");
  yield* fs.makeDirectory(root, { recursive: true, mode: 0o700 }).pipe(Effect.mapError(ioError));
  const now = yield* Clock.currentTimeMillis;
  const id = yield* crypto.randomUUIDv4.pipe(Effect.mapError(ioError));
  const grant = { id, expiresAt: now + TRANSFER_TTL_MS, input: decoded };
  return yield* allocation.withPermit(
    Effect.gen(function* () {
      const names = yield* fs.readDirectory(root).pipe(Effect.mapError(ioError));
      const grants = names.filter((name) => name.endsWith(".json") && validId(name.slice(0, -5)));
      const active = yield* Effect.forEach(
        grants,
        (name) =>
          Effect.gen(function* () {
            const file = path.join(root, name);
            const existing = yield* fs
              .readFileString(file)
              .pipe(
                Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(Transfer))),
                Effect.option,
              );
            if (existing._tag === "Some" && existing.value.expiresAt > now) {
              return true;
            } else {
              yield* fs.remove(file, { force: true }).pipe(Effect.mapError(ioError));
              yield* fs
                .remove(path.join(root, `${name.slice(0, -5)}.used`), { force: true })
                .pipe(Effect.mapError(ioError));
            }
            return false;
          }),
        { concurrency: 16 },
      );
      if (active.filter(Boolean).length >= MAX_TRANSFERS) return yield* busy();
      yield* fs
        .writeFileString(path.join(root, `${id}.json`), JSON.stringify(grant), {
          flag: "wx",
          mode: 0o600,
        })
        .pipe(Effect.mapError(ioError));
      return grant;
    }),
  );
});

const readTransfer = Effect.fn("Storage.readTransfer")(function* (
  dataDir: string,
  id: string,
  kind: "upload" | "download",
) {
  if (!validId(id)) return yield* invalid();
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const file = path.join(dataDir, "mcp-transfers", `${id}.json`);
  const info = yield* fs.stat(file).pipe(Effect.mapError(invalid));
  if (info.size > 4096n) return yield* invalid();
  const grant = yield* fs
    .readFileString(file)
    .pipe(
      Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(Transfer))),
      Effect.mapError(invalid),
    );
  const now = yield* Clock.currentTimeMillis;
  if (grant.id !== id || grant.input.kind !== kind || grant.expiresAt <= now) {
    return yield* invalid();
  }
  return grant;
});

const reserveUpload = Effect.fn("Storage.reserveUpload")(function* (dataDir: string, id: string) {
  const grant = yield* readTransfer(dataDir, id, "upload");
  if (grant.input.kind !== "upload") return yield* invalid();
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fs
    .writeFileString(path.join(dataDir, "mcp-transfers", `${id}.used`), "", {
      flag: "wx",
      mode: 0o600,
    })
    .pipe(
      Effect.mapError(() => storageError("transfer_consumed", "Upload already attempted", 409)),
    );
  return { ...grant, input: grant.input };
});

export class Transfers extends Context.Service<
  Transfers,
  {
    issue(dataDir: string, input: TransferInput): Effect.Effect<Transfer, StorageError>;
    read(
      dataDir: string,
      id: string,
      kind: "upload" | "download",
    ): Effect.Effect<Transfer, StorageError>;
    reserveUpload(
      dataDir: string,
      id: string,
    ): Effect.Effect<Transfer & { input: typeof UploadTransfer.Type }, StorageError>;
  }
>()("@hosti/storage/Transfers") {
  static readonly layer = Layer.effect(
    Transfers,
    Effect.gen(function* () {
      const dependencies = yield* Effect.context<
        FileSystem.FileSystem | Path.Path | Crypto.Crypto
      >();
      return Transfers.of({
        issue: (dataDir, input) =>
          issueTransfer(dataDir, input).pipe(Effect.provideContext(dependencies)),
        read: (dataDir, id, kind) =>
          readTransfer(dataDir, id, kind).pipe(Effect.provideContext(dependencies)),
        reserveUpload: (dataDir, id) =>
          reserveUpload(dataDir, id).pipe(Effect.provideContext(dependencies)),
      });
    }),
  );
}

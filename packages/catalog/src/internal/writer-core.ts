import type Database from "better-sqlite3";
import { Effect, Schema, Semaphore, type Deferred } from "effect";
import {
  FenceRejected,
  UNMANAGED_WRITER_STATE,
  WriterEpoch,
  WriterState,
  type WriterStateStore,
} from "../writer";
import { tryCatalog } from "./catalog-errors";
import { openReadOnlyDatabase } from "./open-database";
import { tryAcquireWriterLease } from "./writer-lease";

export type Role =
  | { readonly kind: "closed" }
  | { readonly kind: "reader"; readonly database: Database.Database | null }
  | {
      readonly kind: "writer";
      readonly database: Database.Database;
      readonly lease: Database.Database;
    }
  | {
      readonly kind: "fencing";
      readonly database: Database.Database;
      readonly lease: Database.Database;
      readonly epoch: string;
      readonly drained: Deferred.Deferred<boolean>;
    };

export type StateRead =
  | { readonly valid: true; readonly state: WriterState }
  | { readonly valid: false };

export type ProcessEpoch =
  | { readonly kind: "unmanaged" }
  | { readonly kind: "epoch"; readonly epoch: string }
  | { readonly kind: "invalid" };

export type WriterControlOptions = {
  readonly dataDir: string;
  readonly databaseFile: string;
  readonly leaseFile: string;
  readonly schemaSql: string;
  readonly store: WriterStateStore["Service"];
  readonly writerEpoch: string | undefined;
};

const decodeState = Schema.decodeUnknownEffect(Schema.fromJsonString(WriterState));
export const isWriterEpoch = Schema.is(WriterEpoch);

function processEpoch(raw: string | undefined): ProcessEpoch {
  if (raw === undefined || raw === "") return { kind: "unmanaged" };
  return isWriterEpoch(raw) ? { kind: "epoch", epoch: raw } : { kind: "invalid" };
}

export function closeQuietly(database: Database.Database | null): void {
  if (database === null || !database.open) return;
  try {
    database.close();
  } catch {
    return;
  }
}

export const closeHandle = (operation: string, handle: Database.Database) =>
  tryCatalog(operation, () => {
    if (handle.open) handle.close();
  });

export const rejected = (code: FenceRejected["code"], message: string) =>
  new FenceRejected({ code, message });

export type WriterSlot = { role: Role; inFlight: number };

export const retiredEpochs = (state: WriterState): ReadonlyArray<string> => state.retired ?? [];

export const settledState = (
  state: WriterState,
  owner: string | null,
  fence: string | null,
  spent: ReadonlyArray<string>,
): WriterState => ({ version: 1, owner, fence, spent, retired: retiredEpochs(state) });

export function makeWriterCore(options: WriterControlOptions) {
  const { dataDir, databaseFile, leaseFile, schemaSql, store } = options;
  const mine = processEpoch(options.writerEpoch);
  const ownEpoch = mine.kind === "epoch" ? mine.epoch : null;
  const transition = Semaphore.makeUnsafe(1);
  const slot: WriterSlot = { role: { kind: "closed" }, inFlight: 0 };

  const readState = Effect.gen(function* () {
    const contents = yield* store.read(dataDir);
    if (contents === null) return { valid: true, state: UNMANAGED_WRITER_STATE } as StateRead;
    return yield* decodeState(contents).pipe(
      Effect.map((state): StateRead => ({ valid: true, state })),
      Effect.orElseSucceed((): StateRead => ({ valid: false })),
    );
  });

  const writeState = (state: WriterState) => store.write(dataDir, JSON.stringify(state));

  const eligible = (state: WriterState): boolean => {
    if (mine.kind === "invalid") return false;
    if (ownEpoch !== null && state.spent.includes(ownEpoch)) return false;
    if (state.fence !== null) return ownEpoch === state.fence;
    return state.owner === null || state.owner === ownEpoch;
  };

  const openReader = tryCatalog("openReadOnlyDatabase", () => openReadOnlyDatabase(databaseFile));
  const acquireLease = tryCatalog("acquireWriterLease", () => tryAcquireWriterLease(leaseFile));

  const volumeLeaseFree = Effect.gen(function* () {
    const probe = yield* acquireLease;
    if (probe === null) return false;
    yield* closeHandle("releaseWriterLeaseProbe", probe);
    return true;
  });

  const becomeReader = (reader: Database.Database | null) =>
    Effect.gen(function* () {
      slot.role = { kind: "reader", database: reader ?? (yield* openReader) };
    });

  return {
    databaseFile,
    schemaSql,
    mine,
    ownEpoch,
    transition,
    slot,
    readState,
    writeState,
    eligible,
    openReader,
    acquireLease,
    volumeLeaseFree,
    becomeReader,
  };
}

export type WriterCore = ReturnType<typeof makeWriterCore>;

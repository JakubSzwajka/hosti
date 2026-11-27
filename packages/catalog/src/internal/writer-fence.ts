import type Database from "better-sqlite3";
import { Deferred, Effect } from "effect";
import type { CatalogError } from "../catalog-error";
import type { FenceOffResult, FenceOnResult, WriterState } from "../writer";
import { openDatabaseAt } from "./open-database";
import {
  closeHandle,
  closeQuietly,
  isWriterEpoch,
  rejected,
  retiredEpochs,
  settledState,
  type Role,
  type WriterCore,
} from "./writer-core";

export function makeFenceOperations(
  core: WriterCore,
  ensureOpen: Effect.Effect<void, CatalogError>,
) {
  const {
    databaseFile,
    schemaSql,
    mine,
    ownEpoch,
    transition,
    slot,
    readState,
    writeState,
    acquireLease,
    volumeLeaseFree,
    becomeReader,
  } = core;

  const completeFence = Effect.fnUntraced(function* (fencing: Extract<Role, { kind: "fencing" }>) {
    if (fencing.outcome.state === "fenced") return;
    if (fencing.outcome.state === "cancelled" || slot.role !== fencing) {
      fencing.outcome.state = "cancelled";
      return yield* rejected("fence_cancelled", "Fence-off cancelled this fence");
    }
    yield* closeHandle("closeFencedDatabase", fencing.database);
    yield* closeHandle("releaseWriterLease", fencing.lease);
    fencing.outcome.state = "fenced";
    slot.role = { kind: "closed" };
    yield* becomeReader(null);
  });

  const rollsBack = (state: WriterState, epoch: string) =>
    state.fence === null
      ? state.owner === epoch && epoch !== ownEpoch && state.previous === ownEpoch
      : state.fence === epoch && state.owner === ownEpoch;

  const fenceResult = (epoch: string): FenceOnResult => ({ fenced: true, drained: true, epoch });

  const awaitFence = Effect.fnUntraced(function* (fencing: Extract<Role, { kind: "fencing" }>) {
    yield* Deferred.await(fencing.wake);
    yield* transition.withPermit(completeFence(fencing));
    return fenceResult(fencing.epoch);
  });

  const beginFence = Effect.fnUntraced(function* (epoch: string) {
    if (!isWriterEpoch(epoch)) return yield* rejected("invalid_epoch", "Invalid epoch");
    if (epoch === ownEpoch) {
      return yield* rejected("epoch_owned", "This instance was started with that epoch");
    }
    const stateRead = yield* readState;
    if (!stateRead.valid) return yield* rejected("state_invalid", "Writer state is unreadable");
    const state = stateRead.state;
    if (state.spent.includes(epoch)) return yield* rejected("epoch_spent", "Epoch already spent");
    if (retiredEpochs(state).includes(epoch)) {
      return yield* rejected("epoch_stale", "Epoch belongs to a retired writer");
    }
    const fencedState = settledState(state, state.owner, epoch, state.spent);
    const current = slot.role;
    if (current.kind === "fencing") {
      if (current.epoch !== epoch)
        return yield* rejected("fence_active", "Another fence is active");
      if (state.fence !== epoch) yield* writeState(fencedState);
      return current;
    }
    if (rollsBack(state, epoch)) {
      if (current.kind === "writer") {
        return yield* rejected("state_invalid", "Writer state conflicts with this instance");
      }
      if (!(yield* volumeLeaseFree)) {
        return yield* rejected("lease_busy", "A writer still holds the volume lease");
      }
      return fenceResult(epoch);
    }
    if (state.fence === epoch || state.owner === epoch) {
      return yield* rejected("epoch_stale", "Epoch is not this instance's handover");
    }
    if (state.fence !== null) return yield* rejected("fence_active", "Another fence is active");
    if (current.kind !== "writer") {
      return yield* rejected("not_writer", "This instance does not own the writer lease");
    }
    const wake = yield* Deferred.make<void>();
    const fencing: Extract<Role, { kind: "fencing" }> = {
      kind: "fencing",
      database: current.database,
      lease: current.lease,
      epoch,
      wake,
      outcome: { state: "pending" },
    };
    slot.role = fencing;
    if (slot.inFlight === 0) yield* Deferred.succeed(wake, undefined);
    yield* writeState(fencedState);
    return fencing;
  });

  const fenceOn = Effect.fnUntraced(function* (epoch: string) {
    yield* ensureOpen;
    const started = yield* transition.withPermit(beginFence(epoch));
    if ("fenced" in started) return started;
    return yield* awaitFence(started);
  });

  const takeOwnershipBack = Effect.fnUntraced(function* (
    epoch: string,
    reader: Database.Database | null,
  ) {
    const accepts = (state: WriterState) => !state.spent.includes(epoch) && rollsBack(state, epoch);
    const lease = yield* acquireLease;
    if (lease === null)
      return yield* rejected("lease_busy", "Another process holds the writer lease");
    const fresh = yield* readState.pipe(Effect.tapError(() => Effect.sync(() => lease.close())));
    if (!fresh.valid || !accepts(fresh.state)) {
      lease.close();
      return yield* rejected("epoch_stale", "Epoch is not the active fence");
    }
    closeQuietly(reader);
    slot.role = { kind: "closed" };
    const database = yield* openDatabaseAt(databaseFile, schemaSql).pipe(
      Effect.tapError(() => Effect.sync(() => lease.close())),
    );
    yield* writeState(
      settledState(fresh.state, ownEpoch, null, [...fresh.state.spent, epoch]),
    ).pipe(
      Effect.tapError(() =>
        Effect.sync(() => {
          closeQuietly(database);
          lease.close();
        }),
      ),
    );
    slot.role = { kind: "writer", database, lease };
  });

  const unfence = Effect.fnUntraced(function* (epoch: string) {
    if (!isWriterEpoch(epoch)) return yield* rejected("invalid_epoch", "Invalid epoch");
    if (mine.kind === "invalid") return yield* rejected("not_writer", "Invalid process epoch");
    const stateRead = yield* readState;
    if (!stateRead.valid) return yield* rejected("state_invalid", "Writer state is unreadable");
    const state = stateRead.state;
    const result: FenceOffResult = { fenced: false, epoch };
    const current = slot.role;
    if (current.kind === "fencing") {
      if (current.epoch !== epoch) return yield* rejected("epoch_stale", "Epoch is not active");
      current.outcome.state = "cancelled";
      yield* Deferred.succeed(current.wake, undefined);
      yield* writeState(settledState(state, ownEpoch, null, [...state.spent, epoch]));
      slot.role = { kind: "writer", database: current.database, lease: current.lease };
      return result;
    }
    if (state.spent.includes(epoch)) {
      if (current.kind === "writer" && state.fence === null && state.owner === ownEpoch) {
        return result;
      }
      return yield* rejected("epoch_spent", "Epoch already spent");
    }
    if (ownEpoch !== null && state.spent.includes(ownEpoch)) {
      return yield* rejected("epoch_spent", "This instance's epoch is spent");
    }
    if (!rollsBack(state, epoch)) {
      return yield* rejected("epoch_stale", "Epoch is not the active fence");
    }
    if (current.kind === "writer") return yield* rejected("epoch_stale", "Already the writer");
    yield* takeOwnershipBack(epoch, current.kind === "reader" ? current.database : null);
    return result;
  });

  const fenceOff = Effect.fnUntraced(function* (epoch: string) {
    yield* ensureOpen;
    return yield* transition.withPermit(unfence(epoch));
  });

  return { fenceOn, fenceOff };
}

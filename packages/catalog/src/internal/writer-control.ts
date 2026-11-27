import type Database from "better-sqlite3";
import { Deferred, Effect } from "effect";
import { catalogSchemaVersion } from "../schema.mjs";
import { CatalogError } from "../catalog-error";
import {
  type WriterPermit,
  type WriterState,
  type WriterStatus,
  WriterUnavailable,
} from "../writer";
import { tryCatalog } from "./catalog-errors";
import { openDatabaseAt, schemaVersion } from "./open-database";
import {
  closeQuietly,
  makeWriterCore,
  settledState,
  type WriterControlOptions,
} from "./writer-core";
import { makeFenceOperations } from "./writer-fence";

export function makeWriterControl(options: WriterControlOptions) {
  const core = makeWriterCore(options);
  const {
    databaseFile,
    schemaSql,
    ownEpoch,
    transition,
    slot,
    readState,
    writeState,
    eligible,
    acquireLease,
    openReader,
    becomeReader,
  } = core;

  const promotedState = (state: WriterState): WriterState => {
    const settled = settledState(state, ownEpoch, null, state.spent);
    if (state.fence === null) return settled;
    const retired = settled.retired ?? [];
    return {
      ...settled,
      retired:
        state.owner === null || retired.includes(state.owner) ? retired : [...retired, state.owner],
      previous: state.owner,
    };
  };

  const promote = Effect.fnUntraced(function* (reader: Database.Database | null) {
    const before = yield* readState;
    if (!before.valid || !eligible(before.state)) return yield* becomeReader(reader);
    const lease = yield* acquireLease;
    if (lease === null) return yield* becomeReader(reader);
    const fresh = yield* readState.pipe(Effect.tapError(() => Effect.sync(() => lease.close())));
    if (!fresh.valid || !eligible(fresh.state)) {
      lease.close();
      return yield* becomeReader(reader);
    }
    closeQuietly(reader);
    slot.role = { kind: "closed" };
    const database = yield* openDatabaseAt(databaseFile, schemaSql).pipe(
      Effect.tapError(() => Effect.sync(() => lease.close())),
    );
    if (fresh.state.owner !== ownEpoch || fresh.state.fence !== null) {
      yield* writeState(promotedState(fresh.state)).pipe(
        Effect.tapError(() =>
          Effect.sync(() => {
            closeQuietly(database);
            lease.close();
          }),
        ),
      );
    }
    slot.role = { kind: "writer", database, lease };
  });

  const ensureOpen = Effect.suspend(() =>
    slot.role.kind === "closed"
      ? transition.withPermit(
          Effect.suspend(() => (slot.role.kind === "closed" ? promote(null) : Effect.void)),
        )
      : Effect.void,
  );

  const database = Effect.gen(function* () {
    yield* ensureOpen;
    const current = slot.role;
    if (current.kind === "closed" || current.database === null) {
      return yield* new CatalogError({
        operation: "openDatabase",
        message: "The Hosti database is not available to this process yet",
      });
    }
    return current.database;
  });

  const statusOf = (handle: Database.Database | null) =>
    Effect.gen(function* () {
      const stateRead = yield* readState;
      const schema =
        handle === null
          ? String(catalogSchemaVersion)
          : String(yield* tryCatalog("readSchemaVersion", () => schemaVersion(handle)));
      return {
        ready: stateRead.valid && handle !== null,
        writer: slot.role.kind === "writer",
        schema,
        epoch: ownEpoch,
      } satisfies WriterStatus;
    });

  const describe = Effect.suspend(() => {
    const current = slot.role;
    return statusOf(current.kind === "closed" ? null : current.database);
  });

  const observeWith = <A>(
    handle: Database.Database | null,
    read: (database: Database.Database) => Effect.Effect<A, CatalogError>,
  ) =>
    Effect.gen(function* () {
      const status = yield* statusOf(handle);
      const value = status.ready && handle !== null ? yield* read(handle) : null;
      return { status, value };
    });

  const observe = <A>(read: (database: Database.Database) => Effect.Effect<A, CatalogError>) =>
    Effect.suspend(() => {
      const current = slot.role;
      if (current.kind !== "closed") return observeWith(current.database, read);
      return Effect.acquireUseRelease(
        openReader,
        (handle) => observeWith(handle, read),
        (handle) => Effect.sync(() => closeQuietly(handle)),
      );
    });

  const status = Effect.gen(function* () {
    yield* ensureOpen;
    yield* transition.withPermit(
      Effect.suspend(() =>
        slot.role.kind === "reader" ? promote(slot.role.database) : Effect.void,
      ),
    );
    return yield* describe;
  });

  const admit = Effect.gen(function* () {
    yield* ensureOpen;
    if (slot.role.kind !== "writer") {
      return yield* new WriterUnavailable({ message: "Writes are paused on this instance" });
    }
    slot.inFlight += 1;
    const permit: WriterPermit = { released: false };
    return permit;
  });

  const release = (permit: WriterPermit) =>
    Effect.gen(function* () {
      if (permit.released) return;
      permit.released = true;
      slot.inFlight -= 1;
      const current = slot.role;
      if (slot.inFlight === 0 && current.kind === "fencing") {
        yield* Deferred.succeed(current.drained, true);
      }
    });

  const whenWriter = (run: (database: Database.Database) => void) =>
    Effect.gen(function* () {
      yield* ensureOpen;
      const current = slot.role;
      if (current.kind !== "writer") return;
      yield* tryCatalog("writerBookkeeping", () => run(current.database));
    });

  const { fenceOn, fenceOff } = makeFenceOperations(core, ensureOpen);

  const close = Effect.gen(function* () {
    const current = slot.role;
    slot.role = { kind: "closed" };
    slot.inFlight = 0;
    if (current.kind === "closed") return;
    closeQuietly(current.database);
    if (current.kind === "writer" || current.kind === "fencing") closeQuietly(current.lease);
    if (current.kind === "fencing") yield* Deferred.succeed(current.drained, false);
  });

  return {
    database,
    status,
    observe,
    admit,
    release,
    whenWriter,
    fenceOn,
    fenceOff,
    close,
  };
}

export type WriterControl = ReturnType<typeof makeWriterControl>;

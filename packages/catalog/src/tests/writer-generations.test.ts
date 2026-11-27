import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { rejection, state, withVolume } from "./writer.test-support";

describe("writer handover across generations", () => {
  it.effect("keeps a stale prior owner out of a newer fence and retires its epoch", () =>
    withVolume((volume) =>
      Effect.gen(function* () {
        const old = yield* volume.start("attempt-0");
        yield* old.catalog.fenceOn("attempt-1");
        const current = yield* volume.start("attempt-1");
        expect((yield* current.catalog.writerStatus).writer).toBe(true);
        yield* current.catalog.fenceOn("attempt-2");
        const paused = state(volume);
        expect(paused).toMatchObject({ owner: "attempt-1", fence: "attempt-2" });

        expect(yield* rejection(old.catalog.fenceOff("attempt-1"))).toBe("epoch_stale");
        expect(yield* rejection(old.catalog.fenceOn("attempt-1"))).toBe("epoch_stale");
        expect(yield* rejection(old.catalog.fenceOff("attempt-2"))).toBe("epoch_stale");
        expect(state(volume)).toEqual(paused);
        expect((yield* old.catalog.writerStatus).writer).toBe(false);

        expect(yield* current.catalog.fenceOff("attempt-2")).toEqual({
          fenced: false,
          epoch: "attempt-2",
        });
        expect(yield* current.catalog.fenceOff("attempt-2")).toEqual({
          fenced: false,
          epoch: "attempt-2",
        });
        expect((yield* current.catalog.writerStatus).writer).toBe(true);
        expect(yield* rejection(current.catalog.fenceOn("attempt-0"))).toBe("epoch_stale");
        expect(state(volume)).toMatchObject({ owner: "attempt-1", fence: null });
        yield* current.stop;
        yield* old.stop;

        const restartedOld = yield* volume.start("attempt-0");
        expect((yield* restartedOld.catalog.writerStatus).writer).toBe(false);
        const restarted = yield* volume.start("attempt-1");
        expect((yield* restarted.catalog.writerStatus).writer).toBe(true);
        expect(yield* rejection(restarted.catalog.fenceOn("attempt-0"))).toBe("epoch_stale");
        expect((yield* restartedOld.catalog.writerStatus).writer).toBe(false);
        yield* restarted.stop;
        yield* restartedOld.stop;
      }),
    ),
  );

  it.effect("lets only the fenced writer roll back a later promotion", () =>
    withVolume((volume) =>
      Effect.gen(function* () {
        const old = yield* volume.start("attempt-0");
        yield* old.catalog.fenceOn("attempt-1");
        const current = yield* volume.start("attempt-1");
        yield* current.catalog.fenceOn("attempt-2");
        const candidate = yield* volume.start("attempt-2");
        expect((yield* candidate.catalog.writerStatus).writer).toBe(true);
        yield* candidate.stop;
        const promoted = state(volume);

        expect(yield* rejection(old.catalog.fenceOff("attempt-2"))).toBe("epoch_stale");
        expect(yield* rejection(old.catalog.fenceOn("attempt-2"))).toBe("epoch_stale");
        expect(state(volume)).toEqual(promoted);
        expect((yield* old.catalog.writerStatus).writer).toBe(false);

        expect(yield* current.catalog.fenceOn("attempt-2")).toMatchObject({ fenced: true });
        expect(yield* current.catalog.fenceOff("attempt-2")).toEqual({
          fenced: false,
          epoch: "attempt-2",
        });
        expect((yield* current.catalog.writerStatus).writer).toBe(true);
        expect(state(volume)).toMatchObject({
          owner: "attempt-1",
          fence: null,
          spent: ["attempt-2"],
        });
        expect(yield* rejection(old.catalog.fenceOff("attempt-1"))).toBe("epoch_stale");
        yield* current.stop;
        expect(yield* rejection(old.catalog.fenceOff("attempt-1"))).toBe("epoch_stale");
        expect((yield* old.catalog.writerStatus).writer).toBe(false);
        yield* old.stop;
      }),
    ),
  );

  it.effect("reads state without retirement fields and refuses an unrecorded rollback", () =>
    withVolume((volume) =>
      Effect.gen(function* () {
        volume.files.set(
          volume.dataDir,
          JSON.stringify({ version: 1, owner: "attempt-1", fence: null, spent: [] }),
        );
        const current = yield* volume.start("attempt-1");
        expect(yield* current.catalog.writerStatus).toMatchObject({ ready: true, writer: true });
        const old = yield* volume.start("attempt-0");
        expect(yield* old.catalog.writerStatus).toMatchObject({ ready: true, writer: false });
        yield* current.stop;

        expect(yield* rejection(old.catalog.fenceOff("attempt-1"))).toBe("epoch_stale");
        expect((yield* old.catalog.writerStatus).writer).toBe(false);
        expect(state(volume)).toEqual({
          version: 1,
          owner: "attempt-1",
          fence: null,
          spent: [],
        });
        yield* old.stop;
      }),
    ),
  );
});

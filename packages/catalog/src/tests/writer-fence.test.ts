import { describe, expect, it } from "@effect/vitest";
import { Effect, Fiber } from "effect";
import { createBundle, rejection, slugs, state, withVolume } from "./writer.test-support";

describe("writer fence and handover", () => {
  it.effect("drains admitted writes before fencing and hands the volume to the epoch", () =>
    withVolume((volume) =>
      Effect.gen(function* () {
        const old = yield* volume.start();
        yield* createBundle(old.catalog, "before-fence");
        const inFlight = yield* old.catalog.admitWriter;

        let fenced = false;
        const fence = yield* old.catalog.fenceOn("attempt-1").pipe(
          Effect.tap(() => Effect.sync(() => (fenced = true))),
          Effect.forkChild,
        );
        yield* Effect.yieldNow;
        expect(fenced).toBe(false);
        expect(state(volume).fence).toBe("attempt-1");
        expect(yield* rejection(old.catalog.admitWriter)).toContain("WriterUnavailable");
        yield* old.catalog.createBundle({ slug: "admitted-during-drain" });

        yield* old.catalog.releaseWriter(inFlight);
        expect(yield* Fiber.join(fence)).toEqual({
          fenced: true,
          drained: true,
          epoch: "attempt-1",
        });
        expect((yield* old.catalog.writerStatus).writer).toBe(false);
        expect(yield* rejection(old.catalog.createBundle({ slug: "after-fence" }))).toContain(
          "readonly",
        );

        const candidate = yield* volume.start("attempt-1");
        expect(yield* candidate.catalog.writerStatus).toMatchObject({
          ready: true,
          writer: true,
          epoch: "attempt-1",
        });
        expect(state(volume)).toEqual({
          version: 1,
          owner: "attempt-1",
          fence: null,
          spent: [],
        });
        yield* createBundle(candidate.catalog, "from-candidate");
        expect(yield* slugs(old.catalog)).toEqual([
          "admitted-during-drain",
          "before-fence",
          "from-candidate",
        ]);
        expect(yield* rejection(old.catalog.fenceOn("attempt-1"))).toBe("lease_busy");
        expect((yield* old.catalog.writerStatus).writer).toBe(false);
        yield* candidate.stop;
        yield* old.stop;
      }),
    ),
  );

  it.effect("returns ownership only after the candidate stops and spends the epoch", () =>
    withVolume((volume) =>
      Effect.gen(function* () {
        const old = yield* volume.start("attempt-0");
        yield* old.catalog.fenceOn("attempt-1");
        const candidate = yield* volume.start("attempt-1");
        yield* createBundle(candidate.catalog, "candidate-write");

        expect(yield* rejection(old.catalog.fenceOff("attempt-1"))).toBe("lease_busy");
        yield* candidate.stop;
        expect(yield* old.catalog.fenceOff("attempt-1")).toEqual({
          fenced: false,
          epoch: "attempt-1",
        });
        expect(yield* old.catalog.fenceOff("attempt-1")).toEqual({
          fenced: false,
          epoch: "attempt-1",
        });
        expect((yield* old.catalog.writerStatus).writer).toBe(true);
        expect(yield* slugs(old.catalog)).toEqual(["candidate-write"]);
        expect(state(volume)).toEqual({
          version: 1,
          owner: "attempt-0",
          fence: null,
          spent: ["attempt-1"],
        });

        expect(yield* rejection(old.catalog.fenceOn("attempt-1"))).toBe("epoch_spent");
        expect((yield* old.catalog.writerStatus).writer).toBe(true);
        yield* old.stop;

        const restartedCandidate = yield* volume.start("attempt-1");
        expect((yield* restartedCandidate.catalog.writerStatus).writer).toBe(false);
        yield* restartedCandidate.stop;
        const restartedOld = yield* volume.start("attempt-0");
        expect((yield* restartedOld.catalog.writerStatus).writer).toBe(true);
        yield* restartedOld.stop;
      }),
    ),
  );

  it.effect("never lets a spent candidate write after rollback to an unmanaged writer", () =>
    withVolume((volume) =>
      Effect.gen(function* () {
        const old = yield* volume.start();
        yield* old.catalog.fenceOn("attempt-1");
        const candidate = yield* volume.start("attempt-1");
        expect((yield* candidate.catalog.writerStatus).writer).toBe(true);
        yield* candidate.stop;
        yield* old.catalog.fenceOff("attempt-1");
        yield* old.stop;

        const restartedCandidate = yield* volume.start("attempt-1");
        expect((yield* restartedCandidate.catalog.writerStatus).writer).toBe(false);
        yield* restartedCandidate.stop;
      }),
    ),
  );

  it.effect("keeps a fenced process a reader across restarts, including after a crash", () =>
    withVolume((volume) =>
      Effect.gen(function* () {
        const old = yield* volume.start("attempt-0");
        yield* old.catalog.admitWriter;
        yield* old.catalog.fenceOn("attempt-1").pipe(Effect.forkDetach);
        yield* Effect.yieldNow;
        expect(state(volume).fence).toBe("attempt-1");
        yield* old.stop;

        const restarted = yield* volume.start("attempt-0");
        expect(yield* restarted.catalog.writerStatus).toMatchObject({ ready: true, writer: false });
        expect(yield* rejection(restarted.catalog.admitWriter)).toContain("WriterUnavailable");
        expect(yield* restarted.catalog.fenceOn("attempt-1")).toMatchObject({ fenced: true });
        yield* restarted.stop;

        const unmanaged = yield* volume.start();
        expect((yield* unmanaged.catalog.writerStatus).writer).toBe(false);
        yield* unmanaged.stop;
      }),
    ),
  );

  it.effect("rejects own, stale and conflicting epochs without disturbing the writer", () =>
    withVolume((volume) =>
      Effect.gen(function* () {
        const old = yield* volume.start("attempt-0");
        expect(yield* rejection(old.catalog.fenceOn("attempt-0"))).toBe("epoch_owned");
        expect(yield* rejection(old.catalog.fenceOn("has space"))).toBe("invalid_epoch");
        expect(yield* rejection(old.catalog.fenceOff("attempt-9"))).toBe("epoch_stale");
        expect((yield* old.catalog.writerStatus).writer).toBe(true);
        yield* old.stop;

        const restarted = yield* volume.start("attempt-0");
        expect((yield* restarted.catalog.writerStatus).writer).toBe(true);
        yield* restarted.catalog.fenceOn("attempt-1");
        expect(yield* rejection(restarted.catalog.fenceOn("attempt-2"))).toBe("fence_active");
        expect(yield* rejection(restarted.catalog.fenceOff("attempt-2"))).toBe("epoch_stale");
        yield* restarted.stop;
      }),
    ),
  );

  it.effect("cancels an unfinished drain when fence-off arrives first", () =>
    withVolume((volume) =>
      Effect.gen(function* () {
        const old = yield* volume.start("attempt-0");
        const inFlight = yield* old.catalog.admitWriter;
        const fence = yield* old.catalog.fenceOn("attempt-1").pipe(Effect.forkChild);
        yield* Effect.yieldNow;
        expect(yield* old.catalog.fenceOff("attempt-1")).toEqual({
          fenced: false,
          epoch: "attempt-1",
        });
        expect(yield* rejection(Fiber.join(fence))).toBe("fence_cancelled");
        yield* old.catalog.releaseWriter(inFlight);
        expect((yield* old.catalog.writerStatus).writer).toBe(true);
        yield* createBundle(old.catalog, "after-cancel");
        yield* old.stop;
      }),
    ),
  );

  it.effect("answers a sibling reader's fence retry only once no writer holds the lease", () =>
    withVolume((volume) =>
      Effect.gen(function* () {
        const old = yield* volume.start("attempt-0");
        expect((yield* old.catalog.writerStatus).writer).toBe(true);
        const sibling = yield* volume.start("attempt-0");
        expect((yield* sibling.catalog.writerStatus).writer).toBe(false);
        const inFlight = yield* old.catalog.admitWriter;
        const fence = yield* old.catalog.fenceOn("attempt-1").pipe(Effect.forkChild);
        yield* Effect.yieldNow;
        expect(state(volume).fence).toBe("attempt-1");

        expect(yield* rejection(sibling.catalog.fenceOn("attempt-1"))).toBe("lease_busy");
        yield* old.catalog.releaseWriter(inFlight);
        yield* Fiber.join(fence);
        expect(yield* sibling.catalog.fenceOn("attempt-1")).toEqual({
          fenced: true,
          drained: true,
          epoch: "attempt-1",
        });
        yield* sibling.stop;
        yield* old.stop;
      }),
    ),
  );

  it.effect("keeps the lease and reports an error when the drained writer cannot close", () =>
    withVolume((volume) =>
      Effect.gen(function* () {
        const old = yield* volume.start("attempt-0");
        let busy: IterableIterator<unknown> | undefined;
        yield* old.catalog.whenWriter((database) => {
          busy = database.prepare("SELECT 1 UNION ALL SELECT 2").iterate();
          busy.next();
        });

        expect(yield* rejection(old.catalog.fenceOn("attempt-1"))).toContain(
          "busy executing a query",
        );
        expect((yield* old.catalog.writerStatus).writer).toBe(false);
        expect(yield* rejection(old.catalog.admitWriter)).toContain("WriterUnavailable");
        const early = yield* volume.start("attempt-1");
        expect((yield* early.catalog.writerStatus).writer).toBe(false);

        busy?.return?.();
        expect(yield* old.catalog.fenceOn("attempt-1")).toEqual({
          fenced: true,
          drained: true,
          epoch: "attempt-1",
        });
        expect((yield* early.catalog.writerStatus).writer).toBe(true);
        yield* early.stop;
        yield* old.stop;
      }),
    ),
  );

  it.effect("keeps admissions closed and the lease held when the fence write is uncertain", () =>
    withVolume((volume) =>
      Effect.gen(function* () {
        const old = yield* volume.start("attempt-0");
        expect((yield* old.catalog.writerStatus).writer).toBe(true);
        volume.failAfterNextWrite();

        expect(yield* rejection(old.catalog.fenceOn("attempt-1"))).toContain("fsync failed");
        expect(state(volume).fence).toBe("attempt-1");
        expect((yield* old.catalog.writerStatus).writer).toBe(false);
        expect(yield* rejection(old.catalog.admitWriter)).toContain("WriterUnavailable");
        const early = yield* volume.start("attempt-1");
        expect((yield* early.catalog.writerStatus).writer).toBe(false);

        expect(yield* old.catalog.fenceOn("attempt-1")).toEqual({
          fenced: true,
          drained: true,
          epoch: "attempt-1",
        });
        expect((yield* early.catalog.writerStatus).writer).toBe(true);
        yield* early.stop;
        yield* old.stop;
      }),
    ),
  );
});

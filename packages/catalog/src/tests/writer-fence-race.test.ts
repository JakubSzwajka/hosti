import { describe, expect, it } from "@effect/vitest";
import { Deferred, Effect, Fiber } from "effect";
import { createBundle, rejection, state, withVolume } from "./writer.test-support";

describe("writer fence cancellation races", () => {
  it.effect("rejects a fence-on that drains while fence-off holds the transition", () =>
    withVolume((volume) =>
      Effect.gen(function* () {
        const old = yield* volume.start("attempt-0");
        const inFlight = yield* old.catalog.admitWriter;
        const fence = yield* old.catalog.fenceOn("attempt-1").pipe(Effect.forkChild);
        yield* Effect.yieldNow;
        expect(state(volume).fence).toBe("attempt-1");
        const offWrite = volume.holdNextWrite();
        const off = yield* old.catalog.fenceOff("attempt-1").pipe(Effect.forkChild);
        yield* Effect.yieldNow;
        yield* old.catalog.releaseWriter(inFlight);
        yield* Deferred.succeed(offWrite, undefined);

        expect(yield* Fiber.join(off)).toEqual({ fenced: false, epoch: "attempt-1" });
        expect(yield* rejection(Fiber.join(fence))).toBe("fence_cancelled");
        expect((yield* old.catalog.writerStatus).writer).toBe(true);
        expect(state(volume)).toMatchObject({
          owner: "attempt-0",
          fence: null,
          spent: ["attempt-1"],
        });
        yield* createBundle(old.catalog, "after-cancel");
        const fresh = yield* old.catalog.admitWriter;
        const newer = yield* old.catalog.fenceOn("attempt-2").pipe(Effect.forkChild);
        yield* Effect.yieldNow;
        const candidate = yield* volume.start("attempt-2");
        expect((yield* candidate.catalog.writerStatus).writer).toBe(false);
        yield* old.catalog.releaseWriter(fresh);
        expect(yield* Fiber.join(newer)).toEqual({
          fenced: true,
          drained: true,
          epoch: "attempt-2",
        });
        expect((yield* candidate.catalog.writerStatus).writer).toBe(true);
        yield* candidate.stop;
        yield* old.stop;
      }),
    ),
  );

  it.effect("rejects a drained fence-on when its fence-off write is uncertain", () =>
    withVolume((volume) =>
      Effect.gen(function* () {
        const old = yield* volume.start("attempt-0");
        const inFlight = yield* old.catalog.admitWriter;
        const fence = yield* old.catalog.fenceOn("attempt-1").pipe(Effect.forkChild);
        yield* Effect.yieldNow;
        const offWrite = volume.holdNextWrite();
        volume.failAfterNextWrite();
        const off = yield* old.catalog.fenceOff("attempt-1").pipe(Effect.forkChild);
        yield* Effect.yieldNow;
        yield* old.catalog.releaseWriter(inFlight);
        yield* Deferred.succeed(offWrite, undefined);

        expect(yield* rejection(Fiber.join(off))).toContain("fsync failed");
        expect(yield* rejection(Fiber.join(fence))).toBe("fence_cancelled");
        expect(yield* rejection(old.catalog.fenceOn("attempt-1"))).toBe("epoch_spent");
        expect(yield* rejection(old.catalog.admitWriter)).toContain("WriterUnavailable");
        const candidate = yield* volume.start("attempt-1");
        expect((yield* candidate.catalog.writerStatus).writer).toBe(false);

        expect(yield* old.catalog.fenceOff("attempt-1")).toEqual({
          fenced: false,
          epoch: "attempt-1",
        });
        expect((yield* old.catalog.writerStatus).writer).toBe(true);
        yield* createBundle(old.catalog, "after-retry");
        yield* candidate.stop;
        yield* old.stop;
      }),
    ),
  );
});

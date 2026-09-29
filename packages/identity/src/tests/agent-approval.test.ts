import { describe, expect, it } from "@effect/vitest";
import { CatalogError } from "@hosti/catalog";
import { Deferred, Effect, Fiber } from "effect";
import { CONNECTION_LIFETIME_MS, Identity } from "../index";
import {
  directAgentConnectionStore,
  fakeSha256,
  freshIdentity,
  NOW,
  request,
} from "./agent-connections.test-support";

describe("approving and denying", () => {
  it.effect("grants only what was asked for, publish always, and writes one token row", () =>
    Effect.gen(function* () {
      const identity = yield* Identity;
      const all = yield* identity.createAgentConnection(
        request("asks-all", { scopes: ["publish", "share", "delete"] }),
        NOW,
      );
      const narrow = yield* identity.createAgentConnection(
        request("asks-publish", { scopes: ["publish"] }),
        NOW,
      );

      const subset = yield* identity.approveAgentConnection(all.id, ["share"], NOW);
      const more = yield* identity.approveAgentConnection(narrow.id, ["share", "delete"], NOW);

      expect(subset).toMatchObject({ status: "approved", grantedScopes: ["publish", "share"] });
      expect(more).toMatchObject({ status: "approved", grantedScopes: ["publish"] });
      expect(yield* identity.authenticatePush("token-asks-all")).toMatchObject({
        name: "asks-all",
        scopes: ["publish", "share"],
      });
      expect(yield* identity.authenticatePush("token-asks-publish")).toMatchObject({
        scopes: ["publish"],
      });
      expect((yield* identity.listPushTokens).length).toBe(2);
    }).pipe(Effect.provide(freshIdentity)),
  );

  it.effect("changes nothing once a connection is settled", () =>
    Effect.gen(function* () {
      const identity = yield* Identity;
      const approved = yield* identity.createAgentConnection(request("yes"), NOW);
      const denied = yield* identity.createAgentConnection(request("no"), NOW);
      yield* identity.approveAgentConnection(approved.id, ["share"], NOW);
      yield* identity.denyAgentConnection(denied.id, NOW);

      const again = yield* identity.approveAgentConnection(approved.id, ["share", "delete"], NOW);
      const denyApproved = yield* identity.denyAgentConnection(approved.id, NOW);
      const approveDenied = yield* identity.approveAgentConnection(denied.id, ["share"], NOW);

      expect(again).toMatchObject({ status: "approved", grantedScopes: ["publish", "share"] });
      expect(denyApproved?.status).toBe("approved");
      expect(approveDenied?.status).toBe("denied");
      expect((yield* identity.listPushTokens).map((one) => one.name)).toEqual(["yes"]);
    }).pipe(Effect.provide(freshIdentity)),
  );

  it.effect("cannot approve an expired connection, and knows nothing of an unknown one", () =>
    Effect.gen(function* () {
      const identity = yield* Identity;
      const created = yield* identity.createAgentConnection(request("late"), NOW);
      const expiry = NOW + CONNECTION_LIFETIME_MS;

      expect((yield* identity.approveAgentConnection(created.id, [], expiry))?.status).toBe(
        "expired",
      );
      expect((yield* identity.denyAgentConnection(created.id, expiry))?.status).toBe("expired");
      expect(yield* identity.approveAgentConnection("made-up-id-000000", [], NOW)).toBeNull();
      expect(yield* identity.denyAgentConnection("made-up-id-000000", NOW)).toBeNull();
      expect(yield* identity.listPushTokens).toEqual([]);
    }).pipe(Effect.provide(freshIdentity)),
  );

  it.effect(
    "hides an in-flight approval from pollers and a second approval until the write settles",
    () =>
      Effect.gen(function* () {
        const startedSlow = yield* Deferred.make<void>();
        const slow = yield* Deferred.make<unknown, CatalogError>();
        const startedFailing = yield* Deferred.make<void>();
        const failing = yield* Deferred.make<unknown, CatalogError>();
        const store = yield* directAgentConnectionStore({
          readTokenName: (value) => Effect.succeed(String(value)),
          pushTokenDigestExists: () => Effect.succeed(false),
          activatePushToken: (input) =>
            input.name === "failing"
              ? Deferred.succeed(startedFailing, undefined).pipe(
                  Effect.andThen(Deferred.await(failing)),
                )
              : Deferred.succeed(startedSlow, undefined).pipe(Effect.andThen(Deferred.await(slow))),
        });

        const succeeds = yield* store.create(request("slow"), NOW);
        const fails = yield* store.create(request("failing"), NOW);

        // The write is still in flight: a poller and a second approval both see "pending".
        const approveFiber = yield* Effect.forkChild(store.approve(succeeds.id, ["share"], NOW));
        yield* Deferred.await(startedSlow);
        expect(yield* store.poll(succeeds.id, "poll-slow", NOW)).toMatchObject({
          status: "pending",
        });
        const secondApproval = yield* store.approve(succeeds.id, ["share"], NOW);
        expect(secondApproval?.status).toBe("pending");

        yield* Deferred.succeed(slow, { id: 1, name: "slow", scopes: ["publish", "share"] });
        const approved = yield* Fiber.join(approveFiber);
        expect(approved?.status).toBe("approved");
        expect(yield* store.poll(succeeds.id, "poll-slow", NOW)).toMatchObject({
          status: "approved",
        });

        // A write that fails restores the connection to "pending", visible to pollers again.
        const failFiber = yield* Effect.forkChild(store.approve(fails.id, [], NOW));
        yield* Deferred.await(startedFailing);
        expect(yield* store.poll(fails.id, "poll-failing", NOW)).toMatchObject({
          status: "pending",
        });
        yield* Deferred.fail(failing, new CatalogError({ operation: "insert", message: "boom" }));
        const failure = yield* Effect.flip(Fiber.join(failFiber));
        expect(failure).toMatchObject({ _tag: "CatalogError" });
        expect(yield* store.poll(fails.id, "poll-failing", NOW)).toMatchObject({
          status: "pending",
        });
      }),
  );

  it.effect("leaves the connection pending when the token row cannot be written", () =>
    Effect.gen(function* () {
      const identity = yield* Identity;
      const created = yield* identity.createAgentConnection(request("raced"), NOW);
      yield* identity.activatePushToken({
        name: "got-there-first",
        tokenDigest: fakeSha256("token-raced"),
        scopes: ["publish"],
      });

      const error = yield* Effect.flip(identity.approveAgentConnection(created.id, [], NOW));
      expect(error).toMatchObject({ code: "token_exists" });
      expect((yield* identity.showAgentConnection(created.id, NOW))?.status).toBe("pending");
    }).pipe(Effect.provide(freshIdentity)),
  );
});

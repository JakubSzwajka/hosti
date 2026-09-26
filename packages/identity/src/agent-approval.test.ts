import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { CONNECTION_LIFETIME_MS, Identity } from "./index";
import { fakeSha256, freshIdentity, NOW, request } from "./agent-connections.test-support";

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

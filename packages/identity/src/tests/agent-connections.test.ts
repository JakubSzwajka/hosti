import { describe, expect, it } from "@effect/vitest";
import { DateTime, Effect } from "effect";
import { TestClock } from "effect/testing";
import {
  CONNECTION_LIFETIME_MS,
  CONNECTION_RETAIN_MS,
  formatScopes,
  Identity,
  MAX_PENDING_CONNECTIONS,
  parseStoredScopes,
  USER_CODE_PATTERN,
} from "../index";
import { fakeSha256, freshIdentity, NOW, request } from "./agent-connections.test-support";
import { readRequestedScopes } from "../scopes";

describe("scopes", () => {
  it("writes a sorted list once each, and reads it back in reading order", () => {
    expect(formatScopes(["share", "publish", "delete", "share"])).toBe("delete,publish,share");
    expect(parseStoredScopes("delete,publish,share")).toEqual(["publish", "share", "delete"]);
    expect(parseStoredScopes("publish,admin")).toEqual(["publish"]);
  });

  it.effect("wants publish, and only names it knows", () =>
    Effect.gen(function* () {
      expect(yield* readRequestedScopes(["share", "publish"])).toEqual(["publish", "share"]);
      for (const bad of [[], ["share"], ["publish", "admin"], "publish", null, [1]]) {
        const error = yield* Effect.flip(readRequestedScopes(bad));
        expect(error).toMatchObject({ code: "bad_scopes", status: 400 });
      }
    }),
  );
});

describe("creating an agent connection", () => {
  it.effect("hands back an id, a user code and a ten-minute expiry", () =>
    Effect.gen(function* () {
      const identity = yield* Identity;
      const created = yield* identity.createAgentConnection(request("laptop"), NOW);

      expect(created.id.length).toBeGreaterThanOrEqual(16);
      expect(created.userCode).toMatch(USER_CODE_PATTERN);
      expect(created.userCode).not.toMatch(/[AEIOUY01L]/);
      expect(created.expiresAt).toBe(
        DateTime.formatIso(DateTime.makeUnsafe(NOW + CONNECTION_LIFETIME_MS)),
      );
      expect(created.pollAfterSeconds).toBe(2);
      // Nothing touches the database until the owner approves.
      expect(yield* identity.listPushTokens).toEqual([]);
    }).pipe(Effect.provide(freshIdentity)),
  );

  it.effect("refuses a bad name, bad digests and bad scopes", () =>
    Effect.gen(function* () {
      const identity = yield* Identity;
      const refusals = [
        request("bad/name"),
        request("a", { tokenDigest: "abc" }),
        request("b", { tokenDigest: "A".repeat(64) }),
        request("c", { pollingDigest: undefined }),
        request("d", { pollingDigest: fakeSha256("token-d") }),
        request("e", { scopes: ["share"] }),
        request("f", { scopes: ["publish", "admin"] }),
      ];
      const codes: unknown[] = [];
      for (const one of refusals) {
        const error = yield* Effect.flip(identity.createAgentConnection(one, NOW));
        codes.push("code" in error ? error.code : error._tag);
      }
      expect(codes).toEqual([
        "bad_token_name",
        "bad_digest",
        "bad_digest",
        "bad_digest",
        "bad_digest",
        "bad_scopes",
        "bad_scopes",
      ]);
    }).pipe(Effect.provide(freshIdentity)),
  );

  it.effect("refuses a token digest a push token or a pending connection already has", () =>
    Effect.gen(function* () {
      const identity = yield* Identity;
      yield* identity.activatePushToken({
        name: "existing",
        tokenDigest: fakeSha256("token-taken"),
        scopes: ["publish"],
      });
      const againstToken = yield* Effect.flip(
        identity.createAgentConnection(request("taken"), NOW),
      );
      yield* identity.createAgentConnection(request("waiting"), NOW);
      const againstPending = yield* Effect.flip(
        identity.createAgentConnection(
          request("other", { tokenDigest: fakeSha256("token-waiting") }),
          NOW,
        ),
      );

      expect(againstToken).toMatchObject({ code: "token_exists", status: 409 });
      expect(againstPending).toMatchObject({ code: "token_exists", status: 409 });
    }).pipe(Effect.provide(freshIdentity)),
  );

  it.effect("caps how many connections may wait at once", () =>
    Effect.gen(function* () {
      const identity = yield* Identity;
      for (let index = 0; index < MAX_PENDING_CONNECTIONS; index += 1) {
        yield* identity.createAgentConnection(request(`agent-${index}`), NOW);
      }
      const over = yield* Effect.flip(identity.createAgentConnection(request("one-more"), NOW));
      expect(over).toMatchObject({ code: "too_many_pending", status: 429 });

      // Expired ones stop counting.
      const later = NOW + CONNECTION_LIFETIME_MS;
      const created = yield* identity.createAgentConnection(request("one-more"), later);
      expect(created.userCode).toMatch(USER_CODE_PATTERN);
    }).pipe(Effect.provide(freshIdentity)),
  );
});

describe("polling", () => {
  it.effect("answers pending, then the owner's decision, to the polling secret alone", () =>
    Effect.gen(function* () {
      const identity = yield* Identity;
      const created = yield* identity.createAgentConnection(request("poller"), NOW);

      expect(yield* identity.pollAgentConnection(created.id, "poll-poller", NOW)).toEqual({
        status: "pending",
        expiresAt: created.expiresAt,
        pollAfterSeconds: 2,
      });
      expect(yield* identity.pollAgentConnection(created.id, "poll-wrong", NOW)).toBeNull();
      expect(yield* identity.pollAgentConnection(created.id, fakeSha256("poll-poller"), NOW)).toBe(
        null,
      );
      expect(yield* identity.pollAgentConnection("made-up-id-000000", "poll-poller", NOW)).toBe(
        null,
      );
      expect(yield* identity.pollAgentConnection(created.id, "", NOW)).toBeNull();

      yield* identity.approveAgentConnection(created.id, ["publish", "share"], NOW);
      const approved = { status: "approved", scopes: ["publish", "share"], name: "poller" };
      expect(yield* identity.pollAgentConnection(created.id, "poll-poller", NOW)).toEqual(approved);
      expect(yield* identity.pollAgentConnection(created.id, "poll-poller", NOW + 1)).toEqual(
        approved,
      );
    }).pipe(Effect.provide(freshIdentity)),
  );

  it.effect("answers denied after a deny", () =>
    Effect.gen(function* () {
      const identity = yield* Identity;
      const created = yield* identity.createAgentConnection(request("refused"), NOW);
      yield* identity.denyAgentConnection(created.id, NOW);

      expect(yield* identity.pollAgentConnection(created.id, "poll-refused", NOW)).toEqual({
        status: "denied",
      });
      expect(yield* identity.listPushTokens).toEqual([]);
    }).pipe(Effect.provide(freshIdentity)),
  );

  it.effect("answers expired after ten minutes, then forgets the connection", () =>
    Effect.gen(function* () {
      const identity = yield* Identity;
      const created = yield* identity.createAgentConnection(request("slow"), NOW);
      const expiry = NOW + CONNECTION_LIFETIME_MS;

      expect(
        (yield* identity.pollAgentConnection(created.id, "poll-slow", expiry - 1))?.status,
      ).toBe("pending");
      expect(yield* identity.pollAgentConnection(created.id, "poll-slow", expiry)).toEqual({
        status: "expired",
      });
      expect(
        yield* identity.pollAgentConnection(created.id, "poll-slow", expiry + CONNECTION_RETAIN_MS),
      ).toBeNull();
    }).pipe(Effect.provide(freshIdentity)),
  );

  it.effect("reads the time from the Effect clock when none is supplied", () =>
    Effect.gen(function* () {
      const identity = yield* Identity;
      const created = yield* identity.createAgentConnection(request("clocked"));
      expect((yield* identity.pollAgentConnection(created.id, "poll-clocked"))?.status).toBe(
        "pending",
      );
      yield* TestClock.adjust(CONNECTION_LIFETIME_MS);
      expect((yield* identity.pollAgentConnection(created.id, "poll-clocked"))?.status).toBe(
        "expired",
      );
    }).pipe(Effect.provide(freshIdentity)),
  );
});

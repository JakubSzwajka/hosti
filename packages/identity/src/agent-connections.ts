import type { CatalogError } from "@hosti/catalog";
import type { PushScope } from "@hosti/shared";
import { Clock, Effect, Ref } from "effect";
import {
  type AgentConnectionCreated,
  type AgentConnectionRequest,
  type AgentConnectionView,
  CONNECTION_LIFETIME_MS,
  DIGEST_PATTERN,
  DIGEST_RULE,
  type Held,
  isoFromMillis,
  MAX_PENDING_CONNECTIONS,
  POLL_AFTER_SECONDS,
  pollView,
  statusAt,
  USER_CODE_ALPHABET,
  view,
  withoutDropped,
} from "./agent-connection-model";
import type { IdentityCrypto, IdentityCryptoError } from "./crypto";
import { type IdentityDatabaseError, IdentityInputError } from "./errors";
import { TOKEN_EXISTS_MESSAGE } from "./push-tokens";
import { orderScopes, readRequestedScopes } from "./scopes";

type TokenStore = {
  readTokenName(value: unknown): Effect.Effect<string, IdentityInputError>;
  pushTokenDigestExists(
    digest: string,
  ): Effect.Effect<boolean, CatalogError | IdentityDatabaseError>;
  activatePushToken(input: {
    name: string;
    tokenDigest: string;
    scopes: readonly PushScope[];
  }): Effect.Effect<unknown, CatalogError | IdentityDatabaseError | IdentityInputError>;
};

type Claim =
  | { kind: "unknown" }
  | { kind: "settled"; shown: AgentConnectionView }
  | { kind: "claimed"; previous: Held; approved: Held };

function currentTime(supplied?: number): Effect.Effect<number> {
  return supplied === undefined ? Clock.currentTimeMillis : Effect.succeed(supplied);
}

function refuse(code: string, message: string, status: number) {
  return new IdentityInputError({ code, message, status });
}

function readDigest(value: unknown): string | null {
  return typeof value === "string" && DIGEST_PATTERN.test(value) ? value : null;
}

export function makeAgentConnectionStore(dependencies: {
  crypto: IdentityCrypto["Service"];
  tokens: TokenStore;
}) {
  const { crypto, tokens } = dependencies;
  // Held in memory only: a restart forgets every connection, and its agent then sees a 404.
  return Effect.gen(function* () {
    const state = yield* Ref.make(new Map<string, Held>());

    const makeUserCode = Effect.fnUntraced(function* () {
      let code = "";
      for (let index = 0; index < 8; index += 1) {
        code += USER_CODE_ALPHABET[yield* crypto.randomInt(USER_CODE_ALPHABET.length)];
      }
      return `${code.slice(0, 4)}-${code.slice(4)}`;
    });

    const create = Effect.fn("Identity.createAgentConnection")(function* (
      request: AgentConnectionRequest,
      suppliedNow?: number,
    ) {
      const tokenName = yield* tokens.readTokenName(request.tokenName);
      const tokenDigest = readDigest(request.tokenDigest);
      const pollingDigest = readDigest(request.pollingDigest);
      if (!tokenDigest || !pollingDigest || tokenDigest === pollingDigest) {
        return yield* refuse("bad_digest", DIGEST_RULE, 400);
      }
      const requestedScopes = yield* readRequestedScopes(request.scopes);
      if (yield* tokens.pushTokenDigestExists(tokenDigest)) {
        return yield* refuse("token_exists", TOKEN_EXISTS_MESSAGE, 409);
      }

      const now = yield* currentTime(suppliedNow);
      const id = yield* crypto.randomBytesBase64Url(24);
      const userCode = yield* makeUserCode();
      const held: Held = {
        id,
        userCode,
        tokenName,
        tokenDigest,
        pollingDigest,
        requestedScopes,
        grantedScopes: null,
        status: "pending",
        expiresAt: now + CONNECTION_LIFETIME_MS,
      };

      const refusal = yield* Ref.modify(state, (stored) => {
        const next = withoutDropped(stored, now);
        const entries = [...next.values()];
        if (entries.some((one) => one.tokenDigest === tokenDigest)) {
          return ["token_exists" as const, next];
        }
        const pending = entries.filter((one) => statusAt(one, now) === "pending").length;
        if (pending >= MAX_PENDING_CONNECTIONS) return ["too_many" as const, next];
        next.set(id, held);
        return [null, next];
      });
      if (refusal === "token_exists") {
        return yield* refuse("token_exists", TOKEN_EXISTS_MESSAGE, 409);
      }
      if (refusal === "too_many") {
        return yield* refuse(
          "too_many_pending",
          "Too many agent connections are waiting for the owner. Try again in a few minutes.",
          429,
        );
      }
      return {
        id,
        userCode,
        expiresAt: isoFromMillis(held.expiresAt),
        pollAfterSeconds: POLL_AFTER_SECONDS,
      } satisfies AgentConnectionCreated;
    });

    const find = Effect.fnUntraced(function* (id: string, now: number) {
      return yield* Ref.modify(state, (stored) => {
        const next = withoutDropped(stored, now);
        return [next.get(id) ?? null, next];
      });
    });

    const poll = Effect.fn("Identity.pollAgentConnection")(function* (
      id: string | null | undefined,
      pollingSecret: string | null | undefined,
      suppliedNow?: number,
    ) {
      const now = yield* currentTime(suppliedNow);
      if (!id || !pollingSecret) return null;
      const held = yield* find(id, now);
      const digest = yield* crypto.sha256Hex(pollingSecret);
      const matches = yield* crypto.constantTimeEquals(digest, held?.pollingDigest ?? "");
      if (!held || !matches) return null;
      return pollView(held, now);
    });

    const show = Effect.fn("Identity.showAgentConnection")(function* (
      id: string | null | undefined,
      suppliedNow?: number,
    ) {
      const now = yield* currentTime(suppliedNow);
      if (!id) return null;
      const held = yield* find(id, now);
      return held ? view(held, now) : null;
    });

    const approve = Effect.fn("Identity.approveAgentConnection")(function* (
      id: string,
      grant: readonly PushScope[],
      suppliedNow?: number,
    ): Effect.fn.Return<
      AgentConnectionView | null,
      CatalogError | IdentityDatabaseError | IdentityInputError | IdentityCryptoError
    > {
      const now = yield* currentTime(suppliedNow);
      // Claim the entry in one step, so two approvals cannot both write a row.
      const claimed = yield* Ref.modify(state, (stored): readonly [Claim, Map<string, Held>] => {
        const next = withoutDropped(stored, now);
        const held = next.get(id);
        if (!held) return [{ kind: "unknown" }, next];
        if (statusAt(held, now) !== "pending") {
          return [{ kind: "settled", shown: view(held, now) }, next];
        }
        const granted = orderScopes([
          "publish",
          ...grant.filter((scope) => held.requestedScopes.includes(scope)),
        ]);
        const approved: Held = { ...held, status: "approved", grantedScopes: granted };
        next.set(id, approved);
        return [{ kind: "claimed", previous: held, approved }, next];
      });
      if (claimed.kind === "unknown") return null;
      if (claimed.kind === "settled") return claimed.shown;

      const { previous, approved } = claimed;
      yield* tokens
        .activatePushToken({
          name: approved.tokenName,
          tokenDigest: approved.tokenDigest,
          scopes: approved.grantedScopes ?? [],
        })
        .pipe(
          Effect.tapError(() =>
            Ref.update(state, (stored) => {
              const next = new Map(stored);
              next.set(id, previous);
              return next;
            }),
          ),
        );
      return view(approved, now);
    });

    const deny = Effect.fn("Identity.denyAgentConnection")(function* (
      id: string,
      suppliedNow?: number,
    ) {
      const now = yield* currentTime(suppliedNow);
      return yield* Ref.modify(state, (stored) => {
        const next = withoutDropped(stored, now);
        const held = next.get(id);
        if (!held) return [null, next];
        if (statusAt(held, now) !== "pending") return [view(held, now), next];
        const denied: Held = { ...held, status: "denied" };
        next.set(id, denied);
        return [view(denied, now), next];
      });
    });

    return { create, poll, show, approve, deny };
  });
}

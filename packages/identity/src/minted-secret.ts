import { Clock, Effect, Ref } from "effect";
import type { IdentityCrypto, IdentityCryptoError } from "./crypto";

const TTL_MS = 5 * 60 * 1000;

type Held = { secret: string; expiresAt: number };

export type MintedSecretStore = {
  hold(secret: string, now?: number): Effect.Effect<string, IdentityCryptoError>;
  take(
    id: string | null | undefined,
    now?: number,
  ): Effect.Effect<string | null, IdentityCryptoError>;
};

export function makeMintedSecretStore(
  crypto: IdentityCrypto["Service"],
): Effect.Effect<MintedSecretStore> {
  return Effect.gen(function* () {
    const state = yield* Ref.make(new Map<string, Held>());

    const hold = Effect.fn("Identity.holdMintedSecret")(function* (
      secret: string,
      suppliedNow?: number,
    ) {
      const now = suppliedNow ?? (yield* Clock.currentTimeMillis);
      const id = yield* crypto.randomBytesBase64Url(16);
      yield* Ref.update(state, (stored) => {
        const next = new Map([...stored].filter(([, held]) => held.expiresAt > now));
        next.set(id, { secret, expiresAt: now + TTL_MS });
        return next;
      });
      return id;
    });

    const take = Effect.fn("Identity.takeMintedSecret")(function* (
      id: string | null | undefined,
      suppliedNow?: number,
    ) {
      const now = suppliedNow ?? (yield* Clock.currentTimeMillis);
      if (!id) {
        yield* Ref.update(
          state,
          (stored) => new Map([...stored].filter(([, held]) => held.expiresAt > now)),
        );
        return null;
      }
      return yield* Ref.modify(state, (stored) => {
        const next = new Map([...stored].filter(([, held]) => held.expiresAt > now));
        const held = next.get(id);
        next.delete(id);
        return [held?.secret ?? null, next];
      });
    });

    return { hold, take };
  });
}

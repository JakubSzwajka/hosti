import { Catalog, type CatalogError } from "@hosti/catalog";
import { Context, Effect, Layer } from "effect";
import { adminSecrets, missingAdminVars, signingSecret, type AdminSecrets } from "./auth/config";
import {
  DEFAULT_LIMITS,
  makeLoginLimiter,
  type EffectLoginLimiter,
  type LimiterOptions,
} from "./auth/rate-limit";
import { makeSessionOperations, type AdminSession } from "./auth/session";
import { IdentityCrypto, type IdentityCryptoError } from "./crypto";
import type { IdentityDatabaseError, IdentityInputError } from "./errors";
import { makeMintedSecretStore } from "./minted-secret";
import { makePushTokenOperations, type PushIdentity, type PushTokenRecord } from "./push-tokens";
import { makeSharePinOperations } from "./share-pin";

export type IdentityFailure =
  | CatalogError
  | IdentityCryptoError
  | IdentityDatabaseError
  | IdentityInputError;

export class Identity extends Context.Service<
  Identity,
  {
    readonly adminSecrets: Effect.Effect<AdminSecrets | null>;
    readonly missingAdminVars: Effect.Effect<string[]>;
    readonly signingSecret: Effect.Effect<string | null>;
    readonly signSession: (
      secret: string,
      options?: { now?: number; maxAgeSeconds?: number },
    ) => Effect.Effect<string, IdentityCryptoError>;
    readonly verifySession: (
      secret: string,
      value: string | undefined | null,
      now?: number,
    ) => Effect.Effect<AdminSession | null, IdentityCryptoError>;
    readonly mutationToken: (
      secret: string,
      session: AdminSession,
    ) => Effect.Effect<string, IdentityCryptoError>;
    readonly checkMutationToken: (
      secret: string,
      session: AdminSession,
      supplied: string | null | undefined,
    ) => Effect.Effect<boolean, IdentityCryptoError>;
    readonly constantTimeEquals: (
      left: string,
      right: string,
    ) => Effect.Effect<boolean, IdentityCryptoError>;
    readonly createLoginLimiter: (
      options?: Partial<LimiterOptions>,
    ) => Effect.Effect<EffectLoginLimiter>;
    readonly hashPin: (pin: string) => Effect.Effect<string, IdentityCryptoError>;
    readonly verifyPin: (
      pin: string,
      stored: string,
    ) => Effect.Effect<boolean, IdentityCryptoError>;
    readonly readJsonPin: (value: unknown) => Effect.Effect<string | null, IdentityInputError>;
    readonly readFormPin: (value: unknown) => Effect.Effect<string | null, IdentityInputError>;
    readonly requireSigningSecret: Effect.Effect<void, IdentityInputError>;
    readonly readTokenName: (value: unknown) => Effect.Effect<string, IdentityInputError>;
    readonly hashToken: (secret: string) => Effect.Effect<string, IdentityCryptoError>;
    readonly createPushToken: (
      name: string,
    ) => Effect.Effect<{ id: number; name: string; secret: string }, IdentityFailure>;
    readonly listPushTokens: Effect.Effect<PushTokenRecord[], CatalogError | IdentityDatabaseError>;
    readonly deletePushToken: (
      id: number,
    ) => Effect.Effect<boolean, CatalogError | IdentityDatabaseError>;
    readonly authenticatePush: (
      secret: string | null,
    ) => Effect.Effect<PushIdentity | null, IdentityFailure>;
    readonly holdMintedSecret: (
      secret: string,
      now?: number,
    ) => Effect.Effect<string, IdentityCryptoError>;
    readonly takeMintedSecret: (
      id: string | null | undefined,
      now?: number,
    ) => Effect.Effect<string | null, IdentityCryptoError>;
  }
>()("@hosti/identity/Identity") {
  static readonly layer = Layer.effect(
    Identity,
    Effect.gen(function* () {
      const crypto = yield* IdentityCrypto;
      const catalog = yield* Catalog;
      const session = makeSessionOperations(crypto);
      const pushTokens = makePushTokenOperations({ catalog, crypto });
      const sharePin = makeSharePinOperations({ crypto, signingSecret: signingSecret() });
      const mintedSecrets = yield* makeMintedSecretStore(crypto);
      const limiter = (options: Partial<LimiterOptions> = {}) =>
        makeLoginLimiter({ ...DEFAULT_LIMITS, ...options });

      return Identity.of({
        adminSecrets: adminSecrets(),
        missingAdminVars: missingAdminVars(),
        signingSecret: signingSecret(),
        ...session,
        constantTimeEquals: (left, right) => crypto.constantTimeEquals(left, right),
        createLoginLimiter: limiter,
        ...sharePin,
        requireSigningSecret: sharePin.requireSigningSecret(),
        ...pushTokens,
        listPushTokens: pushTokens.listPushTokens(),
        holdMintedSecret: mintedSecrets.hold,
        takeMintedSecret: mintedSecrets.take,
      });
    }),
  );
}

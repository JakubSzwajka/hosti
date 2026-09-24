import { Context, Effect, Layer, Schema } from "effect";

export type ScryptCost = { N: number; r: number; p: number };

export class IdentityCryptoError extends Schema.TaggedError<IdentityCryptoError>()(
  "IdentityCryptoError",
  {
    operation: Schema.String,
    cause: Schema.Defect(),
  },
) {}

export class IdentityCrypto extends Context.Service<
  IdentityCrypto,
  {
    encodeBase64Url(value: string): string;
    decodeBase64Url(value: string): string;
    hmacSha256Base64Url(
      secret: string,
      message: string,
    ): Effect.Effect<string, IdentityCryptoError>;
    sha256Hex(value: string): Effect.Effect<string, IdentityCryptoError>;
    randomBytesHex(size: number): Effect.Effect<string, IdentityCryptoError>;
    randomBytesBase64Url(size: number): Effect.Effect<string, IdentityCryptoError>;
    randomInt(maxExclusive: number): Effect.Effect<number, IdentityCryptoError>;
    deriveScryptBase64Url(
      value: string,
      salt: string,
      cost: ScryptCost,
      keyBytes: number,
    ): Effect.Effect<string, IdentityCryptoError>;
    constantTimeEquals(left: string, right: string): Effect.Effect<boolean, IdentityCryptoError>;
  }
>()("@hosti/identity/IdentityCrypto") {
  static readonly layer = (
    service: Omit<IdentityCrypto["Service"], "randomInt"> & {
      readonly randomInt?: IdentityCrypto["Service"]["randomInt"];
    },
  ): Layer.Layer<IdentityCrypto> =>
    Layer.succeed(IdentityCrypto)(
      IdentityCrypto.of({
        ...service,
        randomInt:
          service.randomInt ??
          (() =>
            Effect.fail(
              new IdentityCryptoError({
                operation: "randomInt",
                cause: new Error("Random integer generation is not configured"),
              }),
            )),
      }),
    );
}

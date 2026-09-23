import { Effect } from "effect";
import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { IdentityCrypto, IdentityCryptoError, type ScryptCost } from "@hosti/identity";

export const NodeIdentityCrypto = IdentityCrypto.layer({
  encodeBase64Url(value) {
    return Buffer.from(value, "utf8").toString("base64url");
  },
  decodeBase64Url(value) {
    return Buffer.from(value, "base64url").toString("utf8");
  },
  hmacSha256Base64Url(secret, message) {
    return Effect.try({
      try: () => createHmac("sha256", secret).update(message).digest("base64url"),
      catch: (cause) => new IdentityCryptoError({ operation: "hmac", cause }),
    });
  },
  sha256Hex(value) {
    return Effect.try({
      try: () => createHash("sha256").update(value, "utf8").digest("hex"),
      catch: (cause) => new IdentityCryptoError({ operation: "sha256", cause }),
    });
  },
  randomBytesHex(size) {
    return Effect.try({
      try: () => randomBytes(size).toString("hex"),
      catch: (cause) => new IdentityCryptoError({ operation: "randomBytes", cause }),
    });
  },
  randomBytesBase64Url(size) {
    return Effect.try({
      try: () => randomBytes(size).toString("base64url"),
      catch: (cause) => new IdentityCryptoError({ operation: "randomBytes", cause }),
    });
  },
  deriveScryptBase64Url(value, salt, cost: ScryptCost, keyBytes) {
    return Effect.tryPromise({
      try: () =>
        new Promise<string>((resolve, reject) => {
          scrypt(value, Buffer.from(salt, "base64url"), keyBytes, { ...cost }, (error, key) => {
            if (error) reject(error);
            else resolve(key.toString("base64url"));
          });
        }),
      catch: (cause) => new IdentityCryptoError({ operation: "scrypt", cause }),
    });
  },
  constantTimeEquals(left, right) {
    return Effect.try({
      try: () => {
        const leftDigest = createHmac("sha256", "hosti-compare").update(left, "utf8").digest();
        const rightDigest = createHmac("sha256", "hosti-compare").update(right, "utf8").digest();
        return timingSafeEqual(leftDigest, rightDigest);
      },
      catch: (cause) => new IdentityCryptoError({ operation: "constantTimeEquals", cause }),
    });
  },
});

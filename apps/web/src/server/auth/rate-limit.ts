import {
  DEFAULT_LIMITS,
  PIN_LIMITS,
  type EffectLoginLimiter,
  type LimiterOptions,
  type Verdict,
} from "@hosti/identity";
import { runIdentitySync } from "@/server/runtime";

export type { LimiterOptions, Verdict };
export { DEFAULT_LIMITS, PIN_LIMITS };

export type LoginLimiter = {
  check(key: string, now?: number): Verdict;
  fail(key: string, now?: number): Verdict;
  succeed(key: string): void;
};

function adaptLimiter(limiter: EffectLoginLimiter): LoginLimiter {
  return {
    check(key, now) {
      return runIdentitySync(() => limiter.check(key, now));
    },
    fail(key, now) {
      return runIdentitySync(() => limiter.fail(key, now));
    },
    succeed(key) {
      runIdentitySync(() => limiter.succeed(key));
    },
  };
}

export function createLoginLimiter(options: Partial<LimiterOptions> = {}): LoginLimiter {
  const limiter = runIdentitySync((identity) => identity.createLoginLimiter(options));
  return adaptLimiter(limiter);
}

type LimiterHolder = { __hostiLoginLimiter?: LoginLimiter; __hostiPinLimiter?: LoginLimiter };

export function loginLimiter(): LoginLimiter {
  const holder = globalThis as LimiterHolder;
  holder.__hostiLoginLimiter ??= createLoginLimiter();
  return holder.__hostiLoginLimiter;
}

export function pinLimiter(): LoginLimiter {
  const holder = globalThis as LimiterHolder;
  holder.__hostiPinLimiter ??= createLoginLimiter(PIN_LIMITS);
  return holder.__hostiPinLimiter;
}

export function pinKey(headers: Headers, shareSlug: string): string {
  return `${callerKey(headers)}|${shareSlug}`;
}

export function callerKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return headers.get("x-real-ip")?.trim() || "unknown";
}

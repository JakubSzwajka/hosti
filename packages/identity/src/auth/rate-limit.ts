import { Clock, Effect, Ref } from "effect";

export type LimiterOptions = {
  maxAttempts: number;
  windowMs: number;
  lockMs: number;
};

export const DEFAULT_LIMITS: LimiterOptions = {
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000,
  lockMs: 10 * 60 * 1000,
};

export const PIN_LIMITS: LimiterOptions = {
  maxAttempts: 10,
  windowMs: 15 * 60 * 1000,
  lockMs: 60 * 60 * 1000,
};

export type Verdict = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export type EffectLoginLimiter = {
  check(key: string, now?: number): Effect.Effect<Verdict>;
  fail(key: string, now?: number): Effect.Effect<Verdict>;
  succeed(key: string): Effect.Effect<void>;
};

type Entry = { failures: number[]; lockedUntil: number };

function currentTime(supplied?: number): Effect.Effect<number> {
  return supplied === undefined ? Clock.currentTimeMillis : Effect.succeed(supplied);
}

export function makeLoginLimiter(
  options: Partial<LimiterOptions> = {},
): Effect.Effect<EffectLoginLimiter> {
  const limits = { ...DEFAULT_LIMITS, ...options };
  return Effect.gen(function* () {
    const state = yield* Ref.make(new Map<string, Entry>());

    const check = Effect.fn("Identity.loginLimiter.check")(function* (
      key: string,
      suppliedNow?: number,
    ) {
      const now = yield* currentTime(suppliedNow);
      return yield* Ref.modify(state, (seen) => {
        const next = new Map(seen);
        const previous = next.get(key) ?? { failures: [], lockedUntil: 0 };
        const entry = {
          failures: previous.failures.filter((at) => now - at < limits.windowMs),
          lockedUntil: previous.lockedUntil,
        };
        next.set(key, entry);
        const verdict: Verdict =
          entry.lockedUntil > now
            ? { allowed: false, retryAfterSeconds: Math.ceil((entry.lockedUntil - now) / 1000) }
            : { allowed: true };
        return [verdict, next];
      });
    });

    const fail = Effect.fn("Identity.loginLimiter.fail")(function* (
      key: string,
      suppliedNow?: number,
    ) {
      const now = yield* currentTime(suppliedNow);
      return yield* Ref.modify(state, (seen) => {
        const next = new Map(seen);
        const previous = next.get(key) ?? { failures: [], lockedUntil: 0 };
        const entry = {
          failures: previous.failures.filter((at) => now - at < limits.windowMs),
          lockedUntil: previous.lockedUntil,
        };
        entry.failures.push(now);
        if (entry.failures.length >= limits.maxAttempts) {
          entry.lockedUntil = now + limits.lockMs;
          entry.failures = [];
        }
        next.set(key, entry);
        const verdict: Verdict =
          entry.lockedUntil > now
            ? { allowed: false, retryAfterSeconds: Math.ceil((entry.lockedUntil - now) / 1000) }
            : { allowed: true };
        return [verdict, next];
      });
    });

    const succeed = Effect.fn("Identity.loginLimiter.succeed")(function* (key: string) {
      yield* Ref.update(state, (seen) => {
        const next = new Map(seen);
        next.delete(key);
        return next;
      });
    });

    return { check, fail, succeed };
  });
}

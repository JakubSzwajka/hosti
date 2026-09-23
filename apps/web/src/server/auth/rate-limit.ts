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

export type Verdict = { allowed: true } | { allowed: false; retryAfterSeconds: number };

type Entry = { failures: number[]; lockedUntil: number };

export type LoginLimiter = {
  check(key: string, now?: number): Verdict;

  fail(key: string, now?: number): Verdict;

  succeed(key: string): void;
};

export function createLoginLimiter(options: Partial<LimiterOptions> = {}): LoginLimiter {
  const limits = { ...DEFAULT_LIMITS, ...options };
  const seen = new Map<string, Entry>();

  function entryFor(key: string, now: number): Entry {
    const entry = seen.get(key) ?? { failures: [], lockedUntil: 0 };
    entry.failures = entry.failures.filter((at) => now - at < limits.windowMs);
    seen.set(key, entry);
    return entry;
  }

  function verdict(entry: Entry, now: number): Verdict {
    if (entry.lockedUntil > now) {
      return { allowed: false, retryAfterSeconds: Math.ceil((entry.lockedUntil - now) / 1000) };
    }
    return { allowed: true };
  }

  return {
    check(key, now = Date.now()) {
      return verdict(entryFor(key, now), now);
    },
    fail(key, now = Date.now()) {
      const entry = entryFor(key, now);
      entry.failures.push(now);
      if (entry.failures.length >= limits.maxAttempts) {
        entry.lockedUntil = now + limits.lockMs;
        entry.failures = [];
      }
      return verdict(entry, now);
    },
    succeed(key) {
      seen.delete(key);
    },
  };
}

export const PIN_LIMITS: LimiterOptions = {
  maxAttempts: 10,
  windowMs: 15 * 60 * 1000,
  lockMs: 60 * 60 * 1000,
};

type LimiterHolder = { __hostiLoginLimiter?: LoginLimiter; __hostiPinLimiter?: LoginLimiter };

export function loginLimiter(): LoginLimiter {
  // Keep the budget through development reloads so reloads cannot reset guessing limits.
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

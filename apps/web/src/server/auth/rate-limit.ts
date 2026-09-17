/**
 * Guard on the login form and on the PIN gate. There is one password and one
 * owner, so the only attack worth stopping is someone guessing in a loop.
 * Counting in memory is enough: one process, one box, and a restart that
 * forgets everything costs an attacker more than it costs the owner.
 */

export type LimiterOptions = {
  /** Failures allowed inside the window before the lock lands. */
  maxAttempts: number;
  /** How far back failures are counted, in milliseconds. */
  windowMs: number;
  /** How long a locked caller waits, in milliseconds. */
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
  /** May this caller try a password right now? */
  check(key: string, now?: number): Verdict;
  /** Record a wrong password. Returns the verdict for the next attempt. */
  fail(key: string, now?: number): Verdict;
  /** A correct password wipes the caller's history. */
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

/**
 * The PIN gate is looser than the login form, because a guest who mistypes a
 * four digit PIN twice has done nothing wrong, and then far harsher, because a
 * PIN is only four to eight digits and an hour of silence is what makes that
 * space expensive to walk.
 */
export const PIN_LIMITS: LimiterOptions = {
  maxAttempts: 10,
  windowMs: 15 * 60 * 1000,
  lockMs: 60 * 60 * 1000,
};

type LimiterHolder = { __hostiLoginLimiter?: LoginLimiter; __hostiPinLimiter?: LoginLimiter };

/**
 * One limiter for the process, parked on `globalThis` so a dev-server reload
 * does not hand an attacker a fresh budget.
 */
export function loginLimiter(): LoginLimiter {
  const holder = globalThis as LimiterHolder;
  holder.__hostiLoginLimiter ??= createLoginLimiter();
  return holder.__hostiLoginLimiter;
}

/** The same counting, on its own budget, for the PIN gate. */
export function pinLimiter(): LoginLimiter {
  const holder = globalThis as LimiterHolder;
  holder.__hostiPinLimiter ??= createLoginLimiter(PIN_LIMITS);
  return holder.__hostiPinLimiter;
}

/**
 * One budget per caller per share link. Counting per caller is what stops a
 * brute force; scoping the lock to the link is what stops one attacker from
 * shutting a link for everyone else holding it.
 */
export function pinKey(headers: Headers, shareSlug: string): string {
  return `${callerKey(headers)}|${shareSlug}`;
}

/**
 * Which caller the count belongs to. Behind Caddy the real address arrives in
 * `x-forwarded-for`; direct, it is whatever the socket says. An unknown address
 * shares one bucket, which is the safe way round.
 */
export function callerKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return headers.get("x-real-ip")?.trim() || "unknown";
}

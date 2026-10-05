import { NextResponse } from "next/server";

export interface RateWindow {
  /** Sliding window length in milliseconds. */
  windowMs: number;
  /** Max requests allowed within the window. */
  max: number;
}

declare global {
  var _rateLimitBuckets: Map<string, number[]> | undefined;
}

function buckets(): Map<string, number[]> {
  if (!global._rateLimitBuckets) {
    global._rateLimitBuckets = new Map<string, number[]>();
  }
  return global._rateLimitBuckets;
}

/** Read a positive-int env knob with a safe fallback. */
export function numEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** Global kill-switch for tests/ops. Set RATE_LIMIT_DISABLED=1 to bypass. */
export function rateLimitDisabled(): boolean {
  return process.env.RATE_LIMIT_DISABLED === "1";
}

/**
 * Best-effort client IP (Render/Heroku sit behind proxies).
 *
 * `x-forwarded-for` is an append-only chain: each proxy adds the address it
 * observed to the END. Only the last entry was written by infrastructure we
 * control, so it is the only one worth reading — the leading entries are
 * whatever the caller sent.
 *
 * Reading the *first* entry (the intuitive choice) hands the limiter to the
 * caller: a rotating fake prefix yields a fresh bucket per request, which
 * defeats the entire per-IP budget these caps exist to protect. The Groq quota
 * behind `/api/transcribe` is org-wide, so that bypass costs real money.
 *
 * A deployment behind several proxies would need the trusted-hop count to pick
 * the right entry. Rightmost is correct for the single-hop setup Render and
 * Heroku provide, and still ignores client-supplied values there.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // Take the last non-empty hop: padding and stray commas must not win.
    const hops = forwarded.split(",");
    for (let i = hops.length - 1; i >= 0; i--) {
      const hop = hops[i]?.trim();
      if (hop) return hop;
    }
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}

export interface RateLimitHit {
  limited: boolean;
  /** Seconds until the oldest request in the violated window expires. */
  retryAfterSec: number;
}

/**
 * In-memory sliding-window limiter. Correct for a single instance
 * (Render free plan). If scaled horizontally, replace with Redis/Upstash.
 */
export function checkRateLimit(
  key: string,
  windows: RateWindow[],
  now: number = Date.now()
): RateLimitHit {
  const map = buckets();
  if (map.size > 20000 && !map.has(key)) {
    // Cheap abuse guard: shed state rather than grow unbounded.
    map.clear();
  }

  const longest = Math.max(...windows.map((w) => w.windowMs));
  const stamps = (map.get(key) ?? []).filter((t) => now - t < longest);

  for (const w of windows) {
    const inWindow = stamps.filter((t) => now - t < w.windowMs);
    if (inWindow.length >= w.max) {
      const oldest = inWindow[0];
      if (oldest === undefined) {
        // Only reachable when a limit is configured as 0. Blocking is still the
        // intent, but there is no request to measure a retry from, so charge
        // the whole window instead of emitting `NaN` into a Retry-After header.
        map.set(key, stamps);
        return { limited: true, retryAfterSec: Math.ceil(w.windowMs / 1000) };
      }
      const retryAfterSec = Math.max(
        1,
        Math.ceil((oldest + w.windowMs - now) / 1000)
      );
      map.set(key, stamps);
      return { limited: true, retryAfterSec };
    }
  }

  stamps.push(now);
  map.set(key, stamps);
  return { limited: false, retryAfterSec: 0 };
}

export function rateLimitExceeded(retryAfterSec: number): NextResponse {
  const when =
    retryAfterSec >= 90
      ? `about ${Math.ceil(retryAfterSec / 60)} minute(s)`
      : `${retryAfterSec} second(s)`;
  return NextResponse.json(
    { error: `Too many requests. Try again in ${when}.` },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSec) },
    }
  );
}

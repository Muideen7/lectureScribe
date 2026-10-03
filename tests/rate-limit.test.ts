import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkRateLimit,
  getClientIp,
  numEnv,
  rateLimitDisabled,
  rateLimitExceeded,
} from "../src/lib/rate-limit";

describe("numEnv", () => {
  it("returns fallback when unset or invalid", () => {
    delete process.env.LECTURESCRIBE_TEST_NUM;
    assert.equal(numEnv("LECTURESCRIBE_TEST_NUM", 7), 7);
    process.env.LECTURESCRIBE_TEST_NUM = "abc";
    assert.equal(numEnv("LECTURESCRIBE_TEST_NUM", 7), 7);
    process.env.LECTURESCRIBE_TEST_NUM = "-3";
    assert.equal(numEnv("LECTURESCRIBE_TEST_NUM", 7), 7);
    process.env.LECTURESCRIBE_TEST_NUM = "12";
    assert.equal(numEnv("LECTURESCRIBE_TEST_NUM", 7), 12);
    delete process.env.LECTURESCRIBE_TEST_NUM;
  });
});

describe("rateLimitDisabled", () => {
  it("is off by default, on with RATE_LIMIT_DISABLED=1", () => {
    const prev = process.env.RATE_LIMIT_DISABLED;
    delete process.env.RATE_LIMIT_DISABLED;
    assert.equal(rateLimitDisabled(), false);
    process.env.RATE_LIMIT_DISABLED = "1";
    assert.equal(rateLimitDisabled(), true);
    if (prev === undefined) delete process.env.RATE_LIMIT_DISABLED;
    else process.env.RATE_LIMIT_DISABLED = prev;
  });
});

describe("getClientIp", () => {
  it("prefers the first x-forwarded-for entry", () => {
    const req = new Request("http://localhost/", {
      headers: {
        "x-forwarded-for": "203.0.113.5, 70.41.3.18",
        "x-real-ip": "198.51.100.9",
      },
    });
    assert.equal(getClientIp(req), "203.0.113.5");
  });

  it("falls back to x-real-ip, then unknown", () => {
    const withReal = new Request("http://localhost/", {
      headers: { "x-real-ip": "198.51.100.9" },
    });
    assert.equal(getClientIp(withReal), "198.51.100.9");
    assert.equal(getClientIp(new Request("http://localhost/")), "unknown");
  });
});

describe("checkRateLimit", () => {
  it("allows up to max, then limits with retry-after", () => {
    const key = `test-basic-${Date.now()}`;
    const windows = [{ windowMs: 60_000, max: 2 }];
    assert.equal(checkRateLimit(key, windows, 1000).limited, false);
    assert.equal(checkRateLimit(key, windows, 2000).limited, false);
    const hit = checkRateLimit(key, windows, 3000);
    assert.equal(hit.limited, true);
    assert.ok(hit.retryAfterSec > 0);
    assert.ok(hit.retryAfterSec <= 60);
  });

  it("slides: old requests expire", () => {
    const key = `test-slide-${Date.now()}`;
    const windows = [{ windowMs: 1_000, max: 1 }];
    assert.equal(checkRateLimit(key, windows, 0).limited, false);
    assert.equal(checkRateLimit(key, windows, 500).limited, true);
    assert.equal(checkRateLimit(key, windows, 1_001).limited, false);
  });

  it("enforces the tightest of multiple windows", () => {
    const key = `test-multi-${Date.now()}`;
    const windows = [
      { windowMs: 60_000, max: 100 },
      { windowMs: 3_600_000, max: 1 },
    ];
    assert.equal(checkRateLimit(key, windows, 0).limited, false);
    assert.equal(checkRateLimit(key, windows, 1).limited, true);
  });
});

describe("rateLimitExceeded", () => {
  it("returns 429 JSON with Retry-After", async () => {
    const res = rateLimitExceeded(75);
    assert.equal(res.status, 429);
    assert.equal(res.headers.get("Retry-After"), "75");
    const body = (await res.json()) as { error?: string };
    assert.ok(body.error?.includes("Too many requests"));
  });
});

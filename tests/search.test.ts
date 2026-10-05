import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  REEMBED_CONCURRENCY,
  SEARCH_SCAN_LIMIT,
  mapWithConcurrency,
} from "../src/lib/db";

/**
 * `mapWithConcurrency` is what keeps a search from fanning out into hundreds of
 * simultaneous embedding calls, so its bound is asserted rather than trusted.
 */

describe("mapWithConcurrency", () => {
  it("preserves input order regardless of completion order", async () => {
    const delays = [30, 5, 20, 1, 15];
    const out = await mapWithConcurrency(delays, 2, async (ms, i) => {
      await new Promise((r) => setTimeout(r, ms));
      return `${i}:${ms}`;
    });
    assert.deepEqual(out, ["0:30", "1:5", "2:20", "3:1", "4:15"]);
  });

  it("never exceeds the concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;

    await mapWithConcurrency(Array.from({ length: 40 }, (_, i) => i), 4, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight--;
    });

    assert.equal(peak, 4, `peak concurrency was ${peak}, expected 4`);
    assert.ok(peak <= REEMBED_CONCURRENCY);
  });

  it("drains every item exactly once", async () => {
    const seen: number[] = [];
    await mapWithConcurrency(Array.from({ length: 23 }, (_, i) => i), 4, async (n) => {
      seen.push(n);
    });
    assert.equal(seen.length, 23);
    assert.deepEqual([...seen].sort((a, b) => a - b), Array.from({ length: 23 }, (_, i) => i));
  });

  it("handles an empty input", async () => {
    assert.deepEqual(await mapWithConcurrency([], 4, async () => 1), []);
  });

  it("treats a nonsense limit as serial rather than unbounded", async () => {
    let peak = 0;
    let inFlight = 0;
    await mapWithConcurrency([1, 2, 3], 0, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
    });
    assert.equal(peak, 1);
  });

  it("propagates the first rejection to the caller", async () => {
    await assert.rejects(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("upstream refused");
        return n;
      }),
      /upstream refused/
    );
  });
});

describe("search constants", () => {
  it("bounds re-embedding to a small number of parallel calls", () => {
    // A whole library re-embedding at once is the failure this prevents.
    assert.ok(REEMBED_CONCURRENCY > 0);
    assert.ok(
      REEMBED_CONCURRENCY <= 8,
      `REEMBED_CONCURRENCY=${REEMBED_CONCURRENCY} is high enough to flood the provider`
    );
  });

  it("caps the brute-force scan", () => {
    assert.ok(SEARCH_SCAN_LIMIT > 0);
  });
});
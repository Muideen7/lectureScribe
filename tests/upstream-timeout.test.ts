import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(import.meta.dirname, "..", "src");

function readSource(...segments: string[]): string {
  return readFileSync(join(SRC, ...segments), "utf8");
}

const structureRoute = readSource("app", "api", "structure", "route.ts");
const dbSource = readSource("lib", "db.ts");

/**
 * Every outbound call to OpenRouter has to carry a deadline. Without one a
 * stalled upstream holds the request open until the platform timeout, which
 * burns a worker's slot for `maxDuration` and tells the student nothing about
 * why it failed. `db.ts` got this treatment when the search fan-out was
 * bounded; the structure call was the remaining unguarded one.
 *
 * These are source invariants rather than live requests: a real stall takes
 * longer than the suite should wait, but the deadline itself is asserted so a
 * later refactor cannot quietly drop it.
 */
describe("upstream model calls are bounded by a deadline", () => {
  it("guards the structure chat call", () => {
    const call = structureRoute.slice(
      structureRoute.indexOf("await fetch(OPENROUTER_URL"),
      structureRoute.indexOf("if (!upstream.ok)")
    );
    assert.match(call, /signal:\s*AbortSignal\.timeout\(/);
  });

  it("guards the embedding call", () => {
    assert.match(dbSource, /signal:\s*AbortSignal\.timeout\(/);
  });

  it("finishes before the route's own maxDuration", () => {
    // `90_000` must be read as 90000, not 90: a `\d+` capture that stops at the
    // underscore turns this assertion into a no-op.
    const readNumber = (pattern: RegExp, label: string): number => {
      const raw = structureRoute.match(pattern)?.[1]?.replaceAll("_", "");
      const value = Number(raw);
      assert.ok(Number.isFinite(value), `${label} must be a readable number`);
      return value;
    };

    const deadlineMs = readNumber(
      /STRUCTURE_TIMEOUT_MS\s*=\s*([\d_]+)/,
      "STRUCTURE_TIMEOUT_MS"
    );
    const maxDurationSec = readNumber(
      /maxDuration\s*=\s*(\d+)/,
      "maxDuration"
    );

    assert.ok(
      deadlineMs < maxDurationSec * 1000,
      `the deadline (${deadlineMs}ms) must leave room inside maxDuration ` +
        `(${maxDurationSec}s) or the platform kills the request before the ` +
        "timeout can report a cause"
    );
  });

  it("distinguishes a timeout from other transport failures", () => {
    // A timeout rejects with TimeoutError, whose bare message ("The operation
    // timed out") does not tell a student whether to retry or trim the take.
    assert.match(structureRoute, /err\.name\s*===\s*"TimeoutError"/);
    assert.match(structureRoute, /timed\s*out/i);
  });
});
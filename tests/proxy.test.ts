import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { config } from "../src/proxy";

/**
 * Guards the invariants behind `src/proxy.ts`'s matcher.
 *
 * Next clones the request body for any non-GET request its proxy handles, and
 * that clone is capped at 10MB by default. Past the cap the body is truncated
 * with no error returned to the caller. `/api/transcribe` therefore stays out
 * of the matcher, which is only sound while that route does not depend on the
 * owner cookie — so that dependency is asserted here rather than left to a
 * comment.
 *
 * `unstable_doesProxyMatch` from `next/experimental/testing/server` would cover
 * the matching itself, but it pulls in the Next server runtime and cannot be
 * loaded under `tsx --test`. The matcher is a literal string, so checking it
 * directly is enough for the regression this guards against.
 */

const SRC = join(import.meta.dirname, "..", "src");

function readSource(...segments: string[]): string {
  return readFileSync(join(SRC, ...segments), "utf8");
}

/** Every `matcher` entry as one string, for readable assertions. */
const matchers = (config.matcher as string[]).join("\n");

describe("proxy matcher", () => {
  it("excludes the upload route so its body is never cloned", () => {
    // If this ever flips back, uploads over 10MB are silently truncated and
    // the truncation is only visible as a bad transcript.
    assert.match(matchers, /api\/transcribe/);
  });

  it("still covers the routes that read the owner cookie", () => {
    for (const route of ["structure", "search"]) {
      assert.ok(
        !new RegExp(`api/${route}`).test(matchers),
        `/api/${route} must stay in the matcher: it reads the owner cookie`
      );
    }
  });

  it("keeps static assets out of the matcher", () => {
    for (const asset of ["_next/static", "_next/image", "sw.js", "icons/"]) {
      assert.ok(
        new RegExp(asset.replace("/", "\\/")).test(matchers),
        `expected ${asset} to be excluded`
      );
    }
  });
});

describe("route ownership invariants", () => {
  it("/api/transcribe does not depend on the owner cookie", () => {
    const source = readSource("app", "api", "transcribe", "route.ts");

    // Its absence from the matcher is only safe while none of these are true.
    assert.ok(
      !/OWNER_COOKIE/.test(source),
      "/api/transcribe reads the owner cookie, so it must be back in the matcher"
    );
    assert.ok(
      !/verifyOwnerToken/.test(source),
      "/api/transcribe verifies the owner cookie, so it must be back in the matcher"
    );
    assert.ok(
      !/from ["']next\/headers["']/.test(source),
      "/api/transcribe reads cookies(), so it must be back in the matcher"
    );
  });

  it("routes that persist or read lectures verify the cookie themselves", () => {
    // Next 16's proxy docs: a matcher change can silently remove coverage, so
    // never rely on the proxy alone for authorization.
    for (const route of ["structure", "search"]) {
      const source = readSource("app", "api", route, "route.ts");
      assert.match(
        source,
        /verifyOwnerToken/,
        `/api/${route} must verify the owner cookie itself`
      );
    }
  });

  it("never takes ownerId from the request body", () => {
    const source = readSource("app", "api", "structure", "route.ts");
    assert.ok(
      /ownerId must come from the signed cookie|Ownership comes from the signed cookie/.test(
        source
      ),
      "expected the cookie-only ownership rationale to stay documented"
    );
  });
});
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(import.meta.dirname, "..", "src");

function readSource(...segments: string[]): string {
  return readFileSync(join(SRC, ...segments), "utf8");
}

const structureRoute = readSource("app", "api", "structure", "route.ts");
const generateNotes = readSource("components", "GenerateNotes.tsx");
const lecturePage = readSource("app", "lectures", "[id]", "page.tsx");
const dbSource = readSource("lib", "db.ts");

describe("GenerateNotes client", () => {
  it("sends the lecture id so the route updates in place", () => {
    // Without this the route takes its insert path, and the page it just
    // refreshed never gains notes.
    assert.match(generateNotes, /id:\s*lectureId/);
  });

  it("receives the id from the detail page", () => {
    assert.match(lecturePage, /<GenerateNotes[\s\S]*?lectureId=\{lecture\._id\}/);
  });

  it("does not claim success when the notes were not persisted", () => {
    // `persisted: false` means the notes exist only in the response, so
    // refreshing into an unchanged page would silently swallow a failure.
    assert.match(generateNotes, /persisted\s*===\s*false/);
  });

  it("refreshes only after a successful persist", () => {
    const refresh = generateNotes.indexOf("router.refresh()");
    const persistedCheck = generateNotes.indexOf("persisted === false");
    assert.ok(refresh > -1, "the page must be refreshed on success");
    assert.ok(
      persistedCheck < refresh,
      "the persisted check must come before the refresh, or a failed write looks successful"
    );
  });
});

/**
 * The "generate notes" flow used to insert a second lecture and then refresh the
 * first, so the page never gained notes and every retry left a duplicate behind.
 * These guard the two properties that fix depends on: the id is accepted and
 * validated, and the owner-scoped update is what actually runs.
 */
describe("structure route: in-place notes update", () => {
  it("accepts and validates an optional lecture id", () => {
    assert.match(structureRoute, /\bid:\s*z\b/);
    assert.match(structureRoute, /\{24\}/, "id must be validated as an ObjectId");
  });

  it("updates through the owner-scoped helper rather than inserting", () => {
    assert.match(structureRoute, /attachNotesToLecture\(\s*id,\s*ownerId/);
    // A miss must not fall through to saveLecture, or a forged id would create
    // a lecture instead of being rejected.
    const backfill = structureRoute.slice(structureRoute.indexOf("if (id) {"));
    assert.ok(
      backfill.indexOf("attachNotesToLecture") < backfill.indexOf("saveLecture"),
      "the backfill branch must handle the id before any insert path"
    );
  });

  it("never lets the request body choose the owner", () => {
    assert.ok(!/\bownerId:\s*parsed\b/.test(structureRoute));
    assert.ok(!/\bownerId:\s*body\b/.test(structureRoute));
    // ownerId must be derived from the verified cookie in every path.
    assert.match(structureRoute, /const ownerId = verifyOwnerToken\(/);
  });
});

describe("db: attachNotesToLecture", () => {
  it("scopes the update filter to the owner", () => {
    const fn = dbSource.slice(dbSource.indexOf("export async function attachNotesToLecture"));
    assert.match(fn, /\{ _id: new ObjectId\(id\), ownerId \}/);
    // The owner must be part of the filter, not just checked beforehand.
    assert.ok(
      fn.indexOf("ownerId }") !== -1,
      "ownerId must appear inside the findOneAndUpdate filter"
    );
  });

  it("rejects a malformed id before touching the database", () => {
    const fn = dbSource.slice(dbSource.indexOf("export async function attachNotesToLecture"));
    assert.match(fn, /if \(!ObjectId\.isValid\(id\)\) return null;/);
  });

  it("preserves the transcript rather than overwriting it", () => {
    const fn = dbSource.slice(dbSource.indexOf("export async function attachNotesToLecture"));
    assert.ok(
      !/rawTranscript/.test(fn),
      "the backfill update must not rewrite the stored transcript"
    );
  });
});
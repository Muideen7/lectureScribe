import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { MongoClient, ObjectId, type Collection } from "mongodb";
import {
  attachNotesToLecture,
  searchLectures,
  getPlaceholderEmbedding,
  TRIGRAM_MODEL,
  type StructuredNotes,
} from "../src/lib/db";

/**
 * Covers the two Mongo-backed writes that the brute-force search and the
 * notes-backfill flow depend on. Pure helpers are unit tested in
 * `search.test.ts`; these need a real server to prove the owner scoping
 * actually holds at the query level rather than only in review.
 *
 * Needs a reachable server, so it runs only when MONGODB_URI is set and it uses
 * its own throwaway database (dropped in `after`). Point it at a scratch cluster
 * or Atlas free tier — never production:
 *
 *   MONGODB_URI="mongodb://..." MONGODB_DB=lecturescribe_test npm test
 *
 * `npm run test:db` does both against a throwaway in-memory server.
 *
 * Without the variable these are reported as skipped, not silently passed.
 */

const URI = process.env.MONGODB_URI;
// Must be the same database the app module targets, since `MONGODB_DB` is read
// at import time. The harness in `scripts/with-test-db.mjs` sets both.
const DB_NAME = process.env.MONGODB_DB ?? "lecturescribe";

const NOTES: StructuredNotes = {
  headings: ["Light reactions"],
  definitions: [{ term: "Chlorophyll", definition: "Absorbs light" }],
  flashcards: [{ question: "What is chlorophyll?", answer: "A pigment" }],
};

type Seed = Record<string, unknown>;

function seed(ownerId: string, extra: Seed = {}): Seed {
  return {
    ownerId,
    title: `Lecture ${Math.random().toString(36).slice(2, 8)}`,
    rawTranscript: "photosynthesis converts light energy into glucose",
    notes: { headings: [], definitions: [], flashcards: [] },
    embedding: getPlaceholderEmbedding("photosynthesis converts light energy"),
    embeddingModel: TRIGRAM_MODEL,
    createdAt: new Date(),
    ...extra,
  };
}

describe("db integration (needs MONGODB_URI)", { skip: !URI && "set MONGODB_URI to run" }, () => {
  let client: MongoClient;
  let collection: Collection<Seed>;

  before(async () => {
    client = new MongoClient(URI!);
    await client.connect();
    collection = client.db(DB_NAME).collection<Seed>("lectures");
  });

  after(async () => {
    await client?.db(DB_NAME).dropDatabase();
    await client?.close();

    // `src/lib/db.ts` caches its own MongoClient on `globalThis` for hot-reload
    // reuse. That socket is not this fixture's to close, but leaving it open
    // keeps the event loop alive so the test process never exits.
    const cached = globalThis._mongoClientPromise;
    globalThis._mongoClientPromise = undefined;
    if (cached) {
      const appClient = await cached;
      await appClient.close();
    }
  });

  describe("attachNotesToLecture", () => {
    it("attaches notes to a lecture the caller owns", async () => {
      const { insertedId } = await collection.insertOne(seed("owner-a"));

      const updated = await attachNotesToLecture(
        insertedId.toHexString(),
        "owner-a",
        NOTES
      );

      assert.ok(updated, "expected the lecture to be returned");
      assert.deepEqual(updated.notes, NOTES);
      assert.equal(updated._id, insertedId.toHexString());
    });

    it("leaves the stored transcript untouched", async () => {
      const { insertedId } = await collection.insertOne(
        seed("owner-a", { rawTranscript: "ORIGINAL TRANSCRIPT" })
      );

      await attachNotesToLecture(insertedId.toHexString(), "owner-a", NOTES);

      const stored = await collection.findOne({ _id: insertedId });
      assert.equal(stored?.rawTranscript, "ORIGINAL TRANSCRIPT");
      assert.deepEqual(stored?.notes, NOTES);
    });

    it("refuses to touch another owner's lecture", async () => {
      const { insertedId } = await collection.insertOne(
        seed("owner-a", { notes: { headings: ["ORIGINAL"], definitions: [], flashcards: [] } })
      );

      const result = await attachNotesToLecture(
        insertedId.toHexString(),
        "owner-b",
        NOTES
      );

      assert.equal(result, null, "must not return another owner's lecture");
      const stored = await collection.findOne({ _id: insertedId });
      assert.deepEqual(
        (stored?.notes as StructuredNotes).headings,
        ["ORIGINAL"],
        "another owner's notes must not be overwritten"
      );
    });

    it("returns null for a malformed id without querying", async () => {
      assert.equal(await attachNotesToLecture("not-an-id", "owner-a", NOTES), null);
      assert.equal(await attachNotesToLecture("", "owner-a", NOTES), null);
    });

    it("returns null for a valid but unknown id", async () => {
      const ghost = new ObjectId().toHexString();
      assert.equal(await attachNotesToLecture(ghost, "owner-a", NOTES), null);
    });

    it("does not resurrect a legacy lecture that has no owner", async () => {
      // Documents saved before ownership existed surface an empty owner, which
      // no cookie can match. They must stay unreachable, not become claimable.
      const { insertedId } = await collection.insertOne(
        seed("owner-a", { ownerId: undefined })
      );

      const result = await attachNotesToLecture(
        insertedId.toHexString(),
        "",
        NOTES
      );

      assert.equal(result, null);
    });

    it("refreshes the embedding when one is supplied", async () => {
      const { insertedId } = await collection.insertOne(seed("owner-a"));
      const vector = getPlaceholderEmbedding("a different lecture entirely");

      await attachNotesToLecture(insertedId.toHexString(), "owner-a", NOTES, {
        vector,
        model: "openai/text-embedding-3-small",
      });

      const stored = await collection.findOne({ _id: insertedId });
      assert.equal(stored?.embeddingModel, "openai/text-embedding-3-small");
      assert.deepEqual(stored?.embedding, vector);
    });
  });

  describe("searchLectures", () => {
    it("only ever returns the caller's own lectures", async () => {
      await collection.insertMany([
        seed("owner-x", { title: "X: photosynthesis" }),
        seed("owner-x", { title: "X: respiration" }),
        seed("owner-y", { title: "Y: photosynthesis" }),
      ]);

      const results = await searchLectures(
        getPlaceholderEmbedding("photosynthesis light energy"),
        "owner-x",
        10,
        TRIGRAM_MODEL
      );

      assert.equal(results.length, 2, "another owner's lecture must not appear");
      assert.ok(results.every((r) => r.title.startsWith("X:")));
    });

    it("ranks by descending score", async () => {
      await collection.insertMany([
        seed("owner-r", { rawTranscript: "quantum chromodynamics gluon quark" }),
        seed("owner-r", { rawTranscript: "photosynthesis chloroplast thylakoid" }),
        seed("owner-r", { rawTranscript: "mitochondria oxidative phosphorylation" }),
      ]);

      const results = await searchLectures(
        getPlaceholderEmbedding("quantum chromodynamics gluon"),
        "owner-r",
        10,
        TRIGRAM_MODEL
      );

      assert.equal(results.length, 3);
      // Compared as adjacent pairs rather than by index: `results[i]` types as
      // possibly-absent, and pairing proves both neighbours are real values.
      const pairs = results.slice(1).map((current, i) => [results[i], current]);
      for (const [previous, current] of pairs) {
        assert.ok(
          previous !== undefined &&
            current !== undefined &&
            previous.score >= current.score,
          "results must be ordered by descending score"
        );
      }
    });

    it("scores matching documents without needing a re-embed", async () => {
      await collection.insertOne(
        seed("owner-s", { rawTranscript: "photosynthesis converts light energy" })
      );

      // No OPENROUTER_API_KEY here, so a re-embed would fall back to trigram and
      // collapse every score to 0. A real score proves the stored vector was
      // used directly — no upstream call was needed.
      const results = await searchLectures(
        getPlaceholderEmbedding("photosynthesis converts light energy"),
        "owner-s",
        10,
        TRIGRAM_MODEL
      );

      assert.equal(results.length, 1);
      const [match] = results;
      assert.ok(
        match !== undefined,
        "the seeded lecture should be the only result"
      );
      assert.ok(
        match.score > 0.9,
        `expected a near-identical match, got ${match.score}`
      );
    });

    it("writes back a re-embedded vector so the cost is paid only once", async () => {
      // Stored under a different model, which is the historical state a real
      // library ends up in after an embedding provider is configured.
      const { insertedId } = await collection.insertOne(
        seed("owner-w", {
          embeddingModel: "some-retired-model",
          embedding: new Array(384).fill(0),
          rawTranscript: "photosynthesis converts light energy into glucose",
        })
      );

      // No OPENROUTER_API_KEY here, so getEmbedding falls back to trigram —
      // which is exactly the model being searched in, so the write-back runs.
      const query = getPlaceholderEmbedding("photosynthesis light energy");
      const first = await searchLectures(query, "owner-w", 5, TRIGRAM_MODEL);
      const firstScore = first[0]?.score;
      assert.ok(firstScore && firstScore > 0, "the re-embedded vector should score");

      const afterFirst = await collection.findOne({ _id: insertedId });
      assert.equal(
        afterFirst?.embeddingModel,
        TRIGRAM_MODEL,
        "the recomputed vector must be persisted, not re-fetched on every search"
      );
      assert.notDeepEqual(
        afterFirst?.embedding,
        seed("x").embedding,
        "the persisted vector should replace the zero-filled placeholder"
      );

      // Second search must score from storage rather than re-embedding. Changing
      // the transcript to something unrelated proves it: if the second search
      // re-embedded, the score would move.
      await collection.updateOne(
        { _id: insertedId },
        { $set: { rawTranscript: "a completely unrelated lecture about rocks" } }
      );
      const second = await searchLectures(query, "owner-w", 5, TRIGRAM_MODEL);

      assert.equal(
        second[0]?.score,
        firstScore,
        "the second search must reuse the cached vector instead of re-embedding"
      );
    });

    it("returns nothing for an owner with no lectures", async () => {
      const results = await searchLectures(
        getPlaceholderEmbedding("anything at all"),
        "owner-with-nothing",
        10,
        TRIGRAM_MODEL
      );
      assert.deepEqual(results, []);
    });

    it("respects the limit and clamps nonsense values", async () => {
      await collection.insertMany(
        Array.from({ length: 8 }, (_, i) => seed("owner-m", { title: `M${i}` }))
      );
      const query = getPlaceholderEmbedding("photosynthesis");

      const three = await searchLectures(query, "owner-m", 3, TRIGRAM_MODEL);
      assert.equal(three.length, 3);

      // 0 falls back to the default of 5.
      assert.equal((await searchLectures(query, "owner-m", 0, TRIGRAM_MODEL)).length, 5);

      // A negative limit clamps up to the minimum of 1 rather than the default:
      // a nonsense limit must never turn into an empty result set.
      assert.equal((await searchLectures(query, "owner-m", -5, TRIGRAM_MODEL)).length, 1);

      // Above the ceiling, capped at the hard maximum of 50 (8 docs here).
      assert.equal((await searchLectures(query, "owner-m", 999, TRIGRAM_MODEL)).length, 8);
    });
  });
});
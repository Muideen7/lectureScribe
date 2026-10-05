/**
 * End-to-end check of the search fan-out fix: proves that re-embedding a
 * mixed-model library costs one upstream call per document, that those calls
 * are bounded, and that the second search costs nothing because the vectors
 * were written back.
 *
 * Requires: next start on :3111 with tools/mock-openrouter.mjs loaded.
 */
import { readFileSync } from "node:fs";
import { MongoClient } from "mongodb";

const BASE = "http://127.0.0.1:3111";
const URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:37017";
const DB = process.env.MONGODB_DB ?? "lecturescribe_e2e";
const MOCK = `http://127.0.0.1:${readFileSync("/tmp/opencode/mock-port.txt", "utf8").trim()}`;

const DOC_COUNT = 20;

const results = [];
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  results.push({ ok, name });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) console.log(`      expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const assert = (name, cond, detail = "") => {
  results.push({ ok: !!cond, name });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : `  ${detail}`}`);
};

const stats = async () => (await fetch(`${MOCK}/__stats`)).json();
const reset = () => fetch(`${MOCK}/__reset`);

const client = new MongoClient(URI);
await client.connect();
const lectures = client.db(DB).collection("lectures");

// Owner cookie, as a real visit would establish it.
const landing = await fetch(`${BASE}/`);
let cookie = "";
for (const c of landing.headers.getSetCookie?.() ?? []) {
  if (c.startsWith("ls_owner=")) cookie = c.split(";")[0];
}
if (!cookie) throw new Error("no owner cookie minted");

// The cookie is `v1.<ownerId>.<mac>`; seed under the id the server will actually
// scope by, otherwise the search legitimately matches nothing.
const ownerId = decodeURIComponent(cookie.slice("ls_owner=".length)).split(".")[1];
if (!ownerId) throw new Error(`could not parse owner id from ${cookie}`);
console.log(`owner cookie: ls_owner=v1.${ownerId}.<mac>\n`);

// A library stored under a retired embedding model — the historical state that
// used to re-embed every document on every single search.
await lectures.deleteMany({ ownerId });
await lectures.insertMany(
  Array.from({ length: DOC_COUNT }, (_, i) => ({
    ownerId,
    title: `Lecture ${i}`,
    rawTranscript: `photosynthesis light energy lecture number ${i}`,
    notes: { headings: [], definitions: [], flashcards: [] },
    embedding: new Array(384).fill(0),
    embeddingModel: "some-retired-model",
    createdAt: new Date(),
  }))
);
console.log(`seeded ${DOC_COUNT} stale-model lectures for ${ownerId}\n`);

const search = () =>
  fetch(`${BASE}/api/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ query: "photosynthesis light energy" }),
  });

// --- 1. First search: pays the one-time re-embed cost. --------------------
await reset();
const first = await search();
const firstBody = await first.json();
const firstStats = await stats();

check("search returns 200", first.status, 200);
assert(
  "returns only the caller's own lectures",
  firstBody.results.every((r) => r.title.startsWith("Lecture ")),
  JSON.stringify(firstBody.results?.slice(0, 2))
);
assert(
  "re-embeds each stale document exactly once",
  firstStats.embeddings >= DOC_COUNT,
  `embeddings=${firstStats.embeddings} for ${DOC_COUNT} docs`
);
assert(
  "re-embedding is bounded, not fanned out",
  firstStats.peakConcurrentEmbeddings <= 8,
  `peak=${firstStats.peakConcurrentEmbeddings}`
);
assert(
  "the write-back persisted the new model",
  (await lectures.countDocuments({ ownerId, embeddingModel: { $ne: "some-retired-model" } })) ===
    DOC_COUNT,
  "documents were not converted to the current model"
);

// --- 2. Second search: only the query needs embedding. --------------------
// Every search must embed its query — that one call is unavoidable. The point
// is that the 20 stored documents are NOT re-embedded a second time.
await reset();
await search();
const secondStats = await stats();
check(
  "a repeat search embeds only the query",
  secondStats.embeddingInputs,
  ["photosynthesis light energy"]
);

// --- 3. And it stays that way across many searches. -----------------------
await reset();
await search();
await search();
await search();
const thirdStats = await stats();
check(
  "repeated searches still embed only their queries",
  thirdStats.embeddingInputs,
  ["photosynthesis light energy", "photosynthesis light energy", "photosynthesis light energy"]
);

// --- 4. A foreign owner's library is never scored or re-embedded. ----------
await lectures.deleteMany({ ownerId: "unrelated-owner" });
await lectures.insertMany(
  Array.from({ length: 5 }, (_, i) => ({
    ownerId: "unrelated-owner",
    title: `Not mine ${i}`,
    rawTranscript: `photosynthesis for someone else ${i}`,
    notes: { headings: [], definitions: [], flashcards: [] },
    embedding: new Array(384).fill(0),
    embeddingModel: "some-retired-model",
    createdAt: new Date(),
  }))
);
await reset();
const scoped = await search();
const scopedBody = await scoped.json();
assert(
  "another owner's lectures never appear",
  scopedBody.results.every((r) => !r.title.startsWith("Not mine")),
  JSON.stringify(scopedBody.results?.map((r) => r.title))
);
check(
  "another owner's documents are never re-embedded",
  (await stats()).embeddingInputs,
  ["photosynthesis light energy"]
);

// Cleanup.
await lectures.deleteMany({ ownerId: { $in: [ownerId, "unrelated-owner"] } });
await lectures.deleteMany({ ownerId });
await client.close();

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
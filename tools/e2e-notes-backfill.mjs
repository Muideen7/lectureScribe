/**
 * End-to-end check of the "generate notes" backfill against a running server.
 * Requires: next start on :3111 with tools/mock-openrouter.mjs loaded.
 */
import { MongoClient, ObjectId } from "mongodb";

const BASE = "http://127.0.0.1:3111";
const URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:37017";
const DB = process.env.MONGODB_DB ?? "lecturescribe_e2e";

const TRANSCRIPT =
  "Photosynthesis happens in the chloroplast. Light reactions occur in the thylakoid membrane and the Calvin cycle occurs in the stroma.";

const client = new MongoClient(URI);
await client.connect();
const db = client.db(DB);
const lectures = db.collection("lectures");

const results = [];
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  results.push({ ok, name, actual, expected });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) console.log(`      expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

let cookie = "";

async function post(body) {
  const res = await fetch(`${BASE}/api/structure`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookie) {
    if (c.startsWith("ls_owner=")) cookie = c.split(";")[0];
  }
  return { status: res.status, data: await res.json() };
}

// --- 0. Establish the owner cookie the way a real visit does. -------------
// The proxy mints ls_owner on a response, so the very first request of a brand
// new visitor cannot carry one yet. Visiting the app first is what actually
// happens, so mirror that here.
const landing = await fetch(`${BASE}/`);
for (const c of landing.headers.getSetCookie?.() ?? []) {
  if (c.startsWith("ls_owner=")) cookie = c.split(";")[0];
}
check("landing page mints the owner cookie", cookie.startsWith("ls_owner="), true);

// --- 1. Record a lecture the normal way: no id, so it inserts. -------------
const first = await post({
  title: "Biology 101 — Photosynthesis",
  transcript: TRANSCRIPT,
  course: "BIO 101",
});
check("first call persists and returns an id", first.status === 200 && !!first.data.id, true);

const insertedId = first.data.id;
check("stored lecture has the generated notes", first.data.notes.headings.length > 0, true);

// --- 2. Simulate the "No study notes yet" state the button exists for. -----
await lectures.updateOne({ _id: new ObjectId(insertedId) }, {
  $set: { notes: { headings: [], definitions: [], flashcards: [] } },
});

// --- 3. The backfill: same id, must update in place. -----------------------
const before = await lectures.countDocuments({});
const backfill = await post({
  id: insertedId,
  title: "Biology 101 — Photosynthesis",
  transcript: TRANSCRIPT,
  course: "BIO 101",
});
const after = await lectures.countDocuments({});

check("backfill returns 200", backfill.status, 200);
check("backfill reports the same id", backfill.data.id, insertedId);
check("backfill did NOT insert a duplicate lecture", after, before);
check("backfill returned the notes", backfill.data.notes.headings, ["Light reactions", "The Calvin cycle"]);

const stored = await lectures.findOne({ _id: new ObjectId(insertedId) });
check("notes are now persisted on the original document", stored.notes.headings, [
  "Light reactions",
  "The Calvin cycle",
]);
check("transcript was not rewritten", stored.rawTranscript, TRANSCRIPT);

// --- 3b. The page the student is actually looking at must now show notes. ---
// This is the bug: the old flow inserted a new lecture and refreshed, so this
// panel never cleared and every click left a duplicate.
const page = await fetch(`${BASE}/lectures/${insertedId}`, { headers: { Cookie: cookie } });
const html = await page.text();
check("detail page renders 200", page.status, 200);
check("the empty-state panel is gone", html.includes("No study notes yet"), false);
check("the generated notes are rendered", html.includes("Light reactions"), true);
check("the transcript is still rendered", html.includes("Calvin cycle"), true);

// --- 4. Idempotency: a second click must not duplicate. --------------------
const before2 = await lectures.countDocuments({});
await post({ id: insertedId, title: "t", transcript: TRANSCRIPT });
check("a repeat click does not create another lecture", await lectures.countDocuments({}), before2);

// --- 5. Security: a lecture owned by someone else must be untouched. -------
const victim = await lectures.insertOne({
  ownerId: "someone-elses-owner-id",
  title: "Someone else's lecture",
  rawTranscript: TRANSCRIPT,
  notes: { headings: ["SECRET HEADING"], definitions: [], flashcards: [] },
  createdAt: new Date(),
});
const before3 = await lectures.countDocuments({});
const stolen = await post({
  id: victim.insertedId.toHexString(),
  title: "t",
  transcript: TRANSCRIPT,
});
const after3 = await lectures.countDocuments({});

const victimDoc = await lectures.findOne({ _id: victim.insertedId });
check("cannot overwrite another owner's lecture", victimDoc.notes.headings, ["SECRET HEADING"]);
check("a rejected id does not fall back to inserting", after3, before3);
check(
  "a rejected id is reported as not persisted",
  stolen.data.persisted,
  false
);

// --- 6. A malformed id is rejected by validation. --------------------------
const bad = await post({ id: "not-an-object-id", title: "t", transcript: TRANSCRIPT });
check("malformed id is a 400", bad.status, 400);
check("malformed id created nothing", await lectures.countDocuments({}), after3);

console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`);
await client.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
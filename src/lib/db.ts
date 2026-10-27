import { Collection, Db, MongoClient, ObjectId } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB ?? "lecturescribe";
const COLLECTION = "lectures";

export interface StructuredNotes {
  headings: string[];
  definitions: { term: string; definition: string }[];
  flashcards: { question: string; answer: string }[];
}

export interface Lecture {
  _id?: string;
  /**
   * Owning visitor (see `src/lib/identity.ts`). Every read and write is scoped
   * by this field. Documents saved before ownership existed have no `ownerId`
   * and are treated as unowned — they are invisible rather than public.
   */
  ownerId: string;
  title: string;
  course?: string;
  /** ISO-639-1 code Whisper reported, when known. */
  language?: string | null;
  /** Audio length in seconds, when known. */
  duration?: number | null;
  rawTranscript: string;
  notes: StructuredNotes;
  embedding: number[]; // 384 dims (OpenRouter embed model or trigram fallback)
  /** Which model produced `embedding` — see TRIGRAM_MODEL / DEFAULT_EMBED_MODEL. */
  embeddingModel: string;
  createdAt: Date;
}

export const EMBEDDING_DIMS = 384;

/**
 * How many of the caller's newest lectures one search scores.
 *
 * Brute-force scan, so this bounds the work per query rather than the library.
 * A student with more lectures than this is matched against their most recent
 * ones; see the search limitations note in the README.
 */
export const SEARCH_SCAN_LIMIT = 500;

/** Deterministic offline embedding used when no embedding API is available. */
export const TRIGRAM_MODEL = "trigram-v1";

/**
 * Default OpenRouter embedding model. `dimensions: 384` is sent
 * so output matches EMBEDDING_DIMS. Override with
 * OPENROUTER_EMBED_MODEL (e.g. mixedbread-ai/mxbai-embed-xsmall-v1).
 */
export const DEFAULT_EMBED_MODEL = "openai/text-embedding-3-small";

const OPENROUTER_EMBED_URL = "https://openrouter.ai/api/v1/embeddings";

/**
 * Upper bound on an embedding round-trip. Embeddings are a small, fast call —
 * if one has not answered by now it is not going to, and the search that
 * triggered it should fall back to trigram rather than hang.
 */
const EMBEDDING_TIMEOUT_MS = 15_000;

/**
 * How many documents one search may re-embed at once.
 *
 * Search re-embeds any lecture stored under a different embedding model (see
 * `searchLectures`). Unbounded, a mixed-model library turned a single search
 * into hundreds of simultaneous upstream calls — repeated on every search, since
 * nothing cached the result. The re-embedded vector is now written back, so this
 * is a one-time cost per document; the bound keeps that one-time cost from
 * arriving all at once.
 */
export const REEMBED_CONCURRENCY = 4;

/**
 * `Promise.all(items.map(fn))` with a cap on how many run at once, preserving
 * input order. A worker per slot pulls the next item, so a slow item never
 * blocks the others.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  if (items.length === 0) return results;

  // Workers share an iterator rather than a cursor index. Reading `items[i]`
  // after a bounds check still types as `T | undefined` under
  // `noUncheckedIndexedAccess`, which the compiler cannot correlate with the
  // check; `IteratorResult.done` carries that guarantee in the type itself.
  // `next()` is synchronous, so claims stay strictly in input order.
  const cursor = items[Symbol.iterator]();
  let claimed = 0;

  const slotCount = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));
  const workers = Array.from({ length: slotCount }, async () => {
    for (;;) {
      const step = cursor.next();
      if (step.done === true) return;
      const item = step.value;
      // Claim the slot before awaiting, or a second worker would reuse it.
      const index = claimed++;
      results[index] = await fn(item, index);
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Placeholder 384-dim trigram-hash embedding (used until an
 * OpenRouter embedding model is available).
 * Deterministic, L2-normalized. Use for BOTH stored lectures and queries
 * so cosine similarity is comparable.
 */
export function getPlaceholderEmbedding(text: string): number[] {
  const vec = new Array<number>(EMBEDDING_DIMS).fill(0);
  const normalized = text.toLowerCase().trim();
  if (!normalized) return vec;

  const pushTrigram = (trigram: string) => {
    let hash = 2166136261; // FNV-1a 32-bit offset basis
    for (let j = 0; j < trigram.length; j++) {
      hash ^= trigram.charCodeAt(j);
      hash = Math.imul(hash, 16777619);
    }
    const idx = Math.abs(hash) % EMBEDDING_DIMS;
    // The vector is pre-filled with zeroes, so the fallback never actually
    // fires; it is here because reading an index may type as `undefined`.
    vec[idx] = (vec[idx] ?? 0) + 1;
  };

  if (normalized.length < 3) {
    pushTrigram(normalized.padEnd(3, " "));
  } else {
    for (let i = 0; i <= normalized.length - 3; i++) {
      pushTrigram(normalized.slice(i, i + 3));
    }
  }

  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  if (norm > 0) {
    for (let i = 0; i < vec.length; i++) {
      vec[i] = (vec[i] ?? 0) / norm;
    }
  }
  return vec;
}

interface OpenRouterEmbeddingResponse {
  data?: { embedding?: unknown }[];
}

/** Real embedding via OpenRouter (dimensions pinned to EMBEDDING_DIMS). */
async function fetchOpenRouterEmbedding(
  text: string,
  apiKey: string,
  model: string
): Promise<number[] | null> {
  try {
    const clipped = text.slice(0, 8000);
    if (!clipped.trim()) return null;
    const res = await fetch(OPENROUTER_EMBED_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "LectureScribe",
      },
      body: JSON.stringify({
        model,
        input: clipped,
        dimensions: EMBEDDING_DIMS,
      }),
      // Without this a stalled upstream holds the request open until the
      // platform timeout; the caller falls back to trigram instead.
      signal: AbortSignal.timeout(EMBEDDING_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as OpenRouterEmbeddingResponse;
    const embedding = data.data?.[0]?.embedding;
    if (
      !Array.isArray(embedding) ||
      embedding.length !== EMBEDDING_DIMS ||
      !embedding.every((v) => typeof v === "number" && Number.isFinite(v))
    ) {
      return null;
    }
    return embedding as number[];
  } catch {
    return null;
  }
}

export interface EmbeddedText {
  vector: number[];
  model: string;
}

/**
 * Preferred embedding for new content: OpenRouter embeddings when
 * OPENROUTER_API_KEY is set and the model is reachable, otherwise the trigram fallback. Never throws —
 * falls back to trigram on any upstream failure so writes/reads keep working.
 */
export async function getEmbedding(text: string): Promise<EmbeddedText> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_EMBED_MODEL ?? DEFAULT_EMBED_MODEL;
  if (apiKey) {
    const vector = await fetchOpenRouterEmbedding(text, apiKey, model);
    if (vector) return { vector, model };
  }
  return { vector: getPlaceholderEmbedding(text), model: TRIGRAM_MODEL };
}

function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    // Read each vector once per position: indexed access is the only thing that
    // can be absent, and one lookup keeps the fallback in a single place.
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export type LectureWithScore = Lecture & { score: number };

type LectureInput = Omit<Lecture, "_id" | "createdAt">;

interface MongoLectureDoc
  extends Omit<Lecture, "_id" | "createdAt" | "embeddingModel" | "ownerId"> {
  _id?: ObjectId;
  createdAt?: Date;
  /** Older docs may predate embeddingModel — treated as TRIGRAM_MODEL. */
  embeddingModel?: string;
  /** Absent on documents saved before ownership existed. */
  ownerId?: string;
}

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
  var _lecturescribeIndexesEnsured: boolean | undefined;
}

function getClientPromise(): Promise<MongoClient> {
  if (!MONGODB_URI) {
    throw new Error(
      "MONGODB_URI is not defined. Set it in .env.local (see .env.local.example)."
    );
  }

  if (!global._mongoClientPromise) {
    const client = new MongoClient(MONGODB_URI);
    global._mongoClientPromise = client.connect();
  }

  return global._mongoClientPromise;
}

async function ensureIndexes(db: Db): Promise<void> {
  if (global._lecturescribeIndexesEnsured) return;
  try {
    const collection = db.collection(COLLECTION);
    await collection.createIndex({ title: 1 }, { name: "title_1" });
    await collection.createIndex({ createdAt: -1 }, { name: "createdAt_-1" });
    // Every query is owner-scoped, and search sorts within one owner.
    await collection.createIndex(
      { ownerId: 1, createdAt: -1 },
      { name: "ownerId_1_createdAt_-1" }
    );
    global._lecturescribeIndexesEnsured = true;
  } catch (err) {
    // Never block requests on index creation (e.g. restricted DB users).
    console.warn(
      "[db] ensureIndexes failed:",
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * Cached connection helper for Next.js (avoids exhausting connections
 * during hot reload in dev).
 */
export async function connectDb(): Promise<{ client: MongoClient; db: Db }> {
  const client = await getClientPromise();
  const db = client.db(DB_NAME);
  await ensureIndexes(db);
  return { client, db };
}

function toLecture(doc: MongoLectureDoc): Lecture {
  return {
    _id: doc._id?.toHexString(),
    // Unowned legacy documents surface as an empty owner, which no cookie can
    // ever match — so they are unreachable rather than shared.
    ownerId: doc.ownerId ?? "",
    title: doc.title,
    course: doc.course,
    language: doc.language ?? null,
    duration: typeof doc.duration === "number" ? doc.duration : null,
    rawTranscript: doc.rawTranscript,
    notes: doc.notes,
    embedding: doc.embedding,
    embeddingModel: doc.embeddingModel ?? TRIGRAM_MODEL,
    createdAt: doc.createdAt ?? new Date(),
  };
}

/**
 * Saves a new lecture document and returns it. Always inserts (history is
 * preserved) — two lectures may share a title without overwriting each other.
 * `ownerId` must come from the verified cookie, never from client input.
 */
export async function saveLecture(lecture: LectureInput): Promise<Lecture> {
  const { db } = await connectDb();
  const collection = db.collection<MongoLectureDoc>(COLLECTION);

  const now = new Date();
  const result = await collection.insertOne({ ...lecture, createdAt: now });
  const stored = await collection.findOne({ _id: result.insertedId });

  if (!stored) {
    throw new Error("saveLecture failed: lecture not found after insert.");
  }

  return toLecture(stored);
}

/**
 * Fetch one lecture by id, scoped to its owner.
 *
 * Returns null both when the id does not exist and when it belongs to someone
 * else, so a guessed id cannot be used to probe for other users' lectures.
 */
export async function getLectureById(
  id: string,
  ownerId: string
): Promise<Lecture | null> {
  if (!ObjectId.isValid(id)) return null;

  const { db } = await connectDb();
  const collection = db.collection<MongoLectureDoc>(COLLECTION);
  const doc = await collection.findOne({ _id: new ObjectId(id), ownerId });
  return doc ? toLecture(doc) : null;
}

/**
 * Fetch all recent lectures belonging to an owner.
 */
export async function getUserLectures(
  ownerId: string,
  limit = 20
): Promise<Lecture[]> {
  if (!ownerId) return [];
  const { db } = await connectDb();
  const collection = db.collection<MongoLectureDoc>(COLLECTION);
  const docs = await collection
    .find({ ownerId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  return docs.map(toLecture);
}

/**
 * A lecture is only usable if it carries all three note arrays; the detail page
 * offers to generate notes when this is false.
 */
export function hasNotes(lecture: Pick<Lecture, "notes">): boolean {
  const notes = lecture.notes;
  if (!notes) return false;
  return (
    Array.isArray(notes.headings) &&
    Array.isArray(notes.definitions) &&
    Array.isArray(notes.flashcards) &&
    (notes.headings.length > 0 ||
      notes.definitions.length > 0 ||
      notes.flashcards.length > 0)
  );
}

/**
 * Persist a freshly computed vector so a document stops needing re-embedding.
 *
 * Owner-scoped in the filter as well as the caller check: a stale or forged id
 * must not be able to rewrite someone else's stored embedding.
 */
async function writeBackEmbedding(
  collection: Collection<MongoLectureDoc>,
  doc: MongoLectureDoc,
  fresh: EmbeddedText
): Promise<void> {
  if (!doc._id) return;
  try {
    await collection.updateOne(
      { _id: doc._id, ownerId: doc.ownerId ?? "" },
      { $set: { embedding: fresh.vector, embeddingModel: fresh.model } }
    );
  } catch (err) {
    // The search can still be answered from `fresh`, so a failed cache write is
    // only a performance loss — never fail the request over it.
    console.warn(
      "[db] embedding write-back failed:",
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * Brute-force cosine-similarity search over the caller's own lectures.
 * Placeholder until a MongoDB Atlas vector index is configured.
 *
 * Docs stored under a different embedding model are re-embedded from their
 * rawTranscript so scores stay comparable, and that vector is written back — so
 * a mixed-model library costs one round-trip per document, once, not on every
 * search. Re-embedding runs at most `REEMBED_CONCURRENCY` at a time.
 *
 * If the embedding API is unreachable the affected lecture scores 0 (it cannot
 * be compared) rather than being scored against a vector from another model.
 * Returns top `limit` lectures ranked by score (descending).
 */
export async function searchLectures(
  queryEmbedding: number[],
  ownerId: string,
  limit = 5,
  queryModel: string = TRIGRAM_MODEL
): Promise<LectureWithScore[]> {
  const safeLimit = Math.min(Math.max(Math.floor(limit) || 5, 1), 50);
  const { db } = await connectDb();
  const collection = db.collection<MongoLectureDoc>(COLLECTION);

  // Scoped to the caller: this is the only thing standing between students and
  // each other's lecture libraries.
  const docs = await collection
    .find({ ownerId })
    .sort({ createdAt: -1 })
    .limit(SEARCH_SCAN_LIMIT)
    .toArray();

  const scored = await mapWithConcurrency(
    docs,
    REEMBED_CONCURRENCY,
    async (doc): Promise<LectureWithScore> => {
      const stored = Array.isArray(doc.embedding) ? doc.embedding : [];
      const docModel = doc.embeddingModel ?? TRIGRAM_MODEL;

      if (docModel === queryModel) {
        return {
          ...toLecture(doc),
          score: cosineSimilarity(queryEmbedding, stored),
        };
      }

      // Stored under a different model (typically trigram from before an
      // embedding API was configured) — recompute in the query's model.
      const fresh = await getEmbedding(doc.rawTranscript ?? "");
      if (fresh.model !== queryModel) {
        // Upstream unavailable right now. Scoring against a vector from another
        // model would fabricate a number, so treat it as unmatchable.
        return { ...toLecture(doc), score: 0 };
      }

      await writeBackEmbedding(collection, doc, fresh);
      return {
        ...toLecture(doc),
        embedding: fresh.vector,
        embeddingModel: fresh.model,
        score: cosineSimilarity(queryEmbedding, fresh.vector),
      };
    }
  );

  return scored.sort((a, b) => b.score - a.score).slice(0, safeLimit);
}

/**
 * Attach structured notes to a lecture the caller already owns.
 *
 * Used when notes are generated for a lecture that was saved without them. The
 * owner-scoped filter means an id that belongs to someone else matches nothing
 * and is reported as absent — it can neither be read nor overwritten, and a
 * guessed id cannot be used to probe for other students' lectures.
 *
 * Returns the updated lecture, or null when the id is malformed, unknown, or
 * not the caller's.
 */
export async function attachNotesToLecture(
  id: string,
  ownerId: string,
  notes: StructuredNotes,
  embedding?: EmbeddedText
): Promise<Lecture | null> {
  if (!ObjectId.isValid(id)) return null;

  const { db } = await connectDb();
  const collection = db.collection<MongoLectureDoc>(COLLECTION);

  const set: Partial<MongoLectureDoc> = { notes };
  // Re-embed alongside the notes so the lecture becomes searchable in the
  // current model immediately, instead of waiting for a later search to fix it.
  if (embedding) {
    set.embedding = embedding.vector;
    set.embeddingModel = embedding.model;
  }

  const updated = await collection.findOneAndUpdate(
    { _id: new ObjectId(id), ownerId },
    { $set: set },
    { returnDocument: "after" }
  );

  return updated ? toLecture(updated) : null;
}

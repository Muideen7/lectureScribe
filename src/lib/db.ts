import { Db, MongoClient, ObjectId } from "mongodb";

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
    vec[idx] += 1;
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
      vec[i] /= norm;
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
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
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
 * Brute-force cosine-similarity search over the caller's own lectures.
 * Placeholder until a MongoDB Atlas vector index is configured.
 * Docs stored under a different embedding model are re-embedded from
 * their rawTranscript so scores stay comparable. Returns top `limit`
 * lectures ranked by score (descending).
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
    .limit(500)
    .toArray();

  const scored = await Promise.all(
    docs.map(async (doc) => {
      let embedding = Array.isArray(doc.embedding) ? doc.embedding : [];
      const docModel = doc.embeddingModel ?? TRIGRAM_MODEL;
      if (docModel !== queryModel) {
        try {
          const fresh = await getEmbedding(doc.rawTranscript ?? "");
          if (fresh.model === queryModel) {
            embedding = fresh.vector;
          } else {
            return { ...toLecture(doc), score: 0 };
          }
        } catch {
          return { ...toLecture(doc), score: 0 };
        }
      }
      return {
        ...toLecture(doc),
        score: cosineSimilarity(queryEmbedding, embedding),
      };
    })
  );

  return scored.sort((a, b) => b.score - a.score).slice(0, safeLimit);
}

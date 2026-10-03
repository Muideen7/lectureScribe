# LectureScribe — AI lecture note-taker for Nigerian students

LectureScribe turns lecture audio into study-ready notes. Record a lecture
with your microphone, transcribe it with Groq Whisper, structure it into
headings, definitions, and flashcards with Gemma 3 via OpenRouter, and search
past lectures stored in MongoDB Atlas. Built mobile-first with a clean
academic aesthetic.

## Stack

- **Next.js 16** (App Router, `src/` directory, Turbopack)
- **TypeScript** (strict mode)
- **Tailwind CSS**
- **Groq Whisper** (`whisper-large-v3-turbo`) for speech-to-text
- **Gemma 3 via OpenRouter** for structuring notes
- **MongoDB Atlas** (`mongodb` Node.js driver) for lecture storage + search

Key paths:

- `src/app/api/transcribe/route.ts` — `POST /api/transcribe` (multipart `audio`, WAV/MP3 ≤ 25MB → `{ transcript }`)
- `src/app/api/structure/route.ts` — `POST /api/structure` (`{ title, transcript, course? }` → `{ notes, id, persisted }`)
- `src/app/api/search/route.ts` — `POST /api/search` (`{ query }` → ranked `{ results }`, embeddings stripped)
- `src/lib/db.ts` — cached `MongoClient`, auto-created indexes, `Lecture` types, `saveLecture`, `searchLectures`, OpenRouter embeddings (openai/text-embedding-3-small @ 384 dims) with trigram fallback
- `src/lib/rate-limit.ts` — per-IP sliding-window limiter for the API routes
- `src/components/AudioRecorder.tsx` — mic recording (MediaRecorder → WAV, 5-min cap), transcribe + structure flow
- `src/components/SearchBar.tsx` — semantic search over saved lectures
- `src/components/TranscriptViewer.tsx` — side-by-side transcript + notes with flip-able flashcards

## Setup

### 1. Environment variables

Copy the example file and fill in your keys:

```bash
cp .env.local.example .env.local
```

Required vars (see `.env.local.example`):

| Variable            | Used for                                  |
| ------------------- | ----------------------------------------- |
| `MONGODB_URI`       | MongoDB Atlas connection string           |
| `GROQ_API_KEY`      | Groq Whisper transcription (`/api/transcribe`) |
| `OPENROUTER_API_KEY`| Gemma 3 note structuring + text embeddings |
| `MONGODB_DB`        | Database name (optional, default `lecturescribe`) |
| `OPENROUTER_MODEL`  | Structuring model (optional, default `google/gemma-3-27b-it`) |
| `OPENROUTER_EMBED_MODEL` | Embedding model (optional, default `openai/text-embedding-3-small`, 384 dims) |
| `NEXT_TELEMETRY_DISABLED=1` | Disables Next.js telemetry (set in Render) |

Rate limits are tunable per client IP (see `src/lib/rate-limit.ts`):
`TRANSCRIBE_PER_HOUR` (6), `TRANSCRIBE_PER_DAY` (30), `STRUCTURE_PER_HOUR`
(20), `STRUCTURE_PER_DAY` (60), `SEARCH_PER_MINUTE` (30), or
`RATE_LIMIT_DISABLED=1` to bypass.

### 2. Install and run

Requires Node.js 20.19+ (mongodb driver v7).

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Other scripts:

```bash
npm run build   # production build
npm start       # serve the production build
npm run lint    # eslint
npm test        # unit tests (tsx + node:test)
```

### Rate limits & Groq free-tier budget

Groq's free tier for `whisper-large-v3-turbo` is **org-wide**: 20 RPM,
2,000 RPD, 7,200 audio-sec/hour, 28,800 audio-sec/day (= 8 audio-hours/day).
The binding constraint is audio-seconds, not requests.

With the 5-minute client cap, one take = 300 audio-sec:

- Org daily budget fits **96 five-minute takes/day**.
- Per-IP app caps (`30 transcriptions/day` ≈ 2.5 audio-hours) let a single
  generous user do ~10 lectures/day (50 audio-min/day → ~25 audio-hours/month,
  ~10% of the org monthly budget) while leaving headroom for others.
- If many users share one key and hit 429s from Groq, upgrade to the
  Developer plan or issue per-user keys — per-IP caps alone can't stretch an
  org-wide quota.

## Deploy to Render

This repo ships a [`render.yaml`](./render.yaml) Blueprint:

- **Name:** `lecturescribe`
- **Type:** web, **Plan:** free
- **Build:** `npm install && npm run build`
- **Start:** `npm start`
- **Env:** `NODE_VERSION=22`, `NEXT_TELEMETRY_DISABLED=1` plus `MONGODB_URI`, `GROQ_API_KEY`, `OPENROUTER_API_KEY` (marked `sync: false`, so you enter them in the Render dashboard — never commit secrets).

Steps:

1. Push this repo to GitHub.
2. In [Render](https://dashboard.render.com), go to **New → Blueprint** and connect the repo.
3. Render detects `render.yaml`. Fill in the secret env vars when prompted:
   `MONGODB_URI`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`.
4. Click **Apply** and wait for the build (`npm install && npm run build`) then launch (`npm start`).
5. Open the service URL. Free-plan services sleep when idle — the first request after inactivity can take ~1 minute.

## How to get API keys

- **Groq** — sign up at [groq.com](https://groq.com) (console at `console.groq.com`), create an API key under API Keys, and set it as `GROQ_API_KEY`. Used for Whisper transcription.
- **OpenRouter** — sign up at [openrouter.ai](https://openrouter.ai), generate a key on the Keys page, fund a small balance if required by the model, and set it as `OPENROUTER_API_KEY`. Used for Gemma 3 note structuring.
- **MongoDB Atlas** — sign up at [cloud.mongodb.com](https://cloud.mongodb.com), create a free cluster, add a database user + allow your IP (or `0.0.0.0/0` for hosted deploys), and paste the connection string as `MONGODB_URI`.

## Troubleshooting

- **`/api/structure` returns "Key limit exceeded (total limit)"** — your
  OpenRouter key has a spend limit that is already reached. Remove or
  raise it at openrouter.ai → Keys (the error message links directly).
  Until then, structuring is blocked and search silently uses the
  built-in trigram fallback embeddings.
- **`/api/transcribe` returns 429** — you hit the per-IP cap
  (`TRANSCRIBE_PER_*`) or Groq's org-wide free-tier quota; see the
  budget section above.
- **`/api/search` finds nothing** — lectures are only searchable after
  they are structured (that's when they're saved to MongoDB).

## Hacktoberfest 2026 note

Built for the **Hacktoberfest 2026 Weekend Challenge** theme **"Build for a Friend"** — LectureScribe is a study companion for Nigerian students: record lectures on a phone, get back headings, definitions, and flashcards to revise with, even on a tight data budget.

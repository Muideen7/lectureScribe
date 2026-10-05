# Verification tooling

Manual aids used to prove behaviour that unit tests cannot reach on their own.
None of this ships to production, and `npm test` does not depend on it.

## `with-test-db.mjs`

Runs the test suite against a throwaway in-memory MongoDB, so the suites that
need real queries (`tests/db.integration.test.ts`) actually run.

```bash
npm run test:db
```

Downloads the mongod binary (~120 MB) on first run and caches it afterwards.
`npm test` alone stays runnable without a database — those suites report
themselves as skipped with a reason rather than silently passing.

## `mock-openrouter.mjs`

Intercepts outbound `openrouter.ai` calls so the real HTTP routes can be
exercised without a live API key. Only `globalThis.fetch` is patched, and only
for OpenRouter URLs.

Needs a MongoDB the app can reach, then:

```bash
# Terminal 1 — a MongoDB for the app to use
mongod --dbpath /path/to/data --port 37017 --bind_ip 127.0.0.1

# Terminal 2 — the app, with OpenRouter mocked
MONGODB_URI="mongodb://127.0.0.1:37017" \
MONGODB_DB=verification \
NODE_OPTIONS="--import ./tools/mock-openrouter.mjs" \
GROQ_API_KEY=dummy \
OPENROUTER_API_KEY=mock-key \
IDENTITY_SECRET=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef \
npx next start -p 3111
```

`next start` loads `NODE_OPTIONS` in more than one process, so the mock pins a
fixed port (`MOCK_OPENROUTER_PORT`, default 39123) and the later processes reuse
the first one. Call counters are exposed on that port at `/__stats` and
`/__reset`, and every embedded text is recorded so a test can tell a query
embedding apart from a whole-library re-embed. `POST /__stall?on=1` makes the
next upstream call hang instead of answering, which is how a route's timeout can
be observed.

## The `e2e-*.mjs` scripts

Require the server above to be running.

```bash
MONGODB_URI="mongodb://127.0.0.1:37017" MONGODB_DB=verification \
  node tools/e2e-notes-backfill.mjs

MONGODB_URI="mongodb://127.0.0.1:37017" MONGODB_DB=verification \
  node tools/e2e-search-fanout.mjs

APP_URL=http://localhost:3000 node tools/e2e-upstream-timeout.mjs
```

- **`e2e-notes-backfill.mjs`** — the "generate notes" flow end to end: that it
  updates the lecture in place rather than inserting a duplicate, that the
  detail page stops showing the empty state, and that another owner's lecture
  can neither be read nor overwritten.
- **`e2e-search-fanout.mjs`** — that a library stored under an older embedding
  model is re-embedded once with bounded concurrency, that the result is written
  back, and that later searches embed only their query.
- **`e2e-upstream-timeout.mjs`** — that a stalled OpenRouter is abandoned on the
  route's own clock and reported as a timeout, rather than hanging until the
  platform timeout.

All exit non-zero on failure and seed their own fixtures, so they can be run
repeatedly.

### The timeout script is slow by default

It waits out the route's real `STRUCTURE_TIMEOUT_MS` (90s). To iterate, lower
that constant temporarily and rebuild — `next start` serves the compiled bundle,
so editing the source alone changes nothing. With the guard removed the route
never responds and the script reports that instead of hanging forever.
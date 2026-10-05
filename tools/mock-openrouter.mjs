/**
 * Stands in for OpenRouter so the real HTTP routes can be exercised end to end
 * without a live key.
 *
 *   NODE_OPTIONS="--import ./tools/mock-openrouter.mjs" npm start
 *
 * Only `globalThis.fetch` is touched, and only for openrouter.ai URLs; every
 * other request (including the app's own pages) passes through untouched.
 * Point MONGODB_URI wherever the app should read and write.
 *
 * Not used by `npm test` — this is a manual verification aid.
 */
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";

const NOTES = {
  headings: ["Light reactions", "The Calvin cycle"],
  definitions: [{ term: "Chlorophyll", definition: "The pigment that absorbs light." }],
  flashcards: [{ question: "Where does the Calvin cycle occur?", answer: "In the stroma." }],
};

const EMBEDDING = new Array(384).fill(0.05);

/** Counted so a test can prove how many upstream calls a request caused. */
const calls = {
  embeddings: 0,
  chat: 0,
  peakConcurrentEmbeddings: 0,
  _inFlight: 0,
  /** Every text that was sent for embedding, so a test can tell a query
   *  embedding apart from a whole-library re-embed. */
  embeddingInputs: [],
};

const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    res.setHeader("Content-Type", "application/json");

    // Introspection for the verification harness.
    if (req.url === "/__stats") {
      res.end(JSON.stringify(calls));
      return;
    }
    if (req.url === "/__reset") {
      calls.embeddings = 0;
      calls.chat = 0;
      calls.peakConcurrentEmbeddings = 0;
      calls._inFlight = 0;
      calls.embeddingInputs = [];
      res.end("{}");
      return;
    }

    if (req.url?.includes("/embeddings")) {
      calls.embeddings++;
      try {
        const parsed = JSON.parse(body || "{}");
        calls.embeddingInputs.push(
          typeof parsed.input === "string" ? parsed.input : JSON.stringify(parsed.input)
        );
      } catch {
        // Unparseable body still counts as a call.
      }
      calls._inFlight++;
      calls.peakConcurrentEmbeddings = Math.max(
        calls.peakConcurrentEmbeddings,
        calls._inFlight
      );
      // Hold the response briefly so concurrency is observable.
      setTimeout(() => {
        calls._inFlight--;
        res.end(JSON.stringify({ data: [{ embedding: EMBEDDING, index: 0 }] }));
      }, 120);
      return;
    }

    calls.chat++;
    const content = process.env.MOCK_OPENROUTER_INVALID_JSON
      ? "{ not json"
      : JSON.stringify(NOTES);

    res.end(
      JSON.stringify({
        id: "gen-mock",
        choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }],
      })
    );
  });
});

// `next start` loads NODE_OPTIONS in more than one process (the server and its
// workers). Pinning the port means whichever binds first owns the mock and the
// others simply route to it, so there is exactly one source of counters.
const PORT = Number(process.env.MOCK_OPENROUTER_PORT ?? 39123);
let owns = false;

try {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, "127.0.0.1", resolve);
  });
  owns = true;
} catch (err) {
  if (err?.code !== "EADDRINUSE") throw err;
}

if (owns) writeFileSync("/tmp/opencode/mock-port.txt", String(PORT));

const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = typeof input === "string" ? input : (input?.url ?? "");
  if (url.includes("openrouter.ai")) {
    const path = url.includes("/embeddings") ? "/embeddings" : "/chat/completions";
    return realFetch(`http://127.0.0.1:${PORT}${path}`, init);
  }
  return realFetch(input, init);
};

console.log(`[mock-openrouter] intercepting openrouter.ai on port ${PORT}${owns ? "" : " (reusing)"}`);
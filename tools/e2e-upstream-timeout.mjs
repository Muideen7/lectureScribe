/**
 * Proves the structure route gives up on a stalled OpenRouter instead of
 * hanging until the platform timeout.
 *
 *   NODE_OPTIONS="--import ./tools/mock-openrouter.mjs" npm start
 *   node tools/e2e-upstream-timeout.mjs
 *
 * The mock is told to stall the next chat call, so the only way the request can
 * complete is if the route's own `AbortSignal.timeout` fires. The run fails on
 * the exact wording of the 500 body, because a timeout that reports itself as a
 * generic "failed to reach OpenRouter" has fixed the hang but not the
 * diagnosis.
 *
 * Takes as long as STRUCTURE_TIMEOUT_MS. Set a smaller deadline in the route
 * to iterate faster; the assertion is the same either way.
 *
 * Not used by `npm test` — this is a manual verification aid.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const MOCK = process.env.MOCK_URL ?? "http://127.0.0.1:39123";

const route = readFileSync(
  join(import.meta.dirname, "..", "src", "app", "api", "structure", "route.ts"),
  "utf8"
);
const deadlineMs = Number(
  route.match(/STRUCTURE_TIMEOUT_MS\s*=\s*([\d_]+)/)?.[1]?.replaceAll("_", "")
);

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

console.log(
  `[e2e-timeout] app=${APP} deadline=` +
    (Number.isFinite(deadlineMs) ? `${deadlineMs}ms` : "UNSET")
);

// A fresh visitor needs `GET /` to mint the owner cookie; the route reads it
// from the request, so skipping this would test the unpersisted path.
const jar = [];
const browser = async (path, init = {}) => {
  const res = await fetch(`${APP}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), cookie: jar.join("; ") },
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookie) jar.push(c.split(";")[0]);
  return res;
};

await browser("/");

const ownerId = decodeURIComponent(
  (jar.find((c) => c.startsWith("ls_owner=")) ?? "").slice("ls_owner=".length).split(".")[1] ?? ""
);
check("owner cookie minted", ownerId.length > 0, ownerId || "none");

// Arm the stall, then confirm it took effect before making the slow request.
await fetch(`${MOCK}/__reset`);
await fetch(`${MOCK}/__stall?on=1`);
const armed = await (await fetch(`${MOCK}/__stats`)).json();
check("mock armed to stall", armed.stall === 1, `stall=${armed.stall}`);

console.log("[e2e-timeout] requesting notes; expecting the route to abort on its own clock");

// Without the route's own deadline this request never returns, so the harness
// carries a backstop. If it fires, the guard is missing and that is the finding
// — not a reason to wait.
const backstopMs = Number.isFinite(deadlineMs) ? deadlineMs + 20_000 : 60_000;
const startedAt = Date.now();
let res;
let body;
let clientGaveUp = false;
try {
  res = await fetch(`${APP}/api/structure`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: jar.join("; "),
    },
    body: JSON.stringify({
      title: "Photosynthesis",
      transcript: "Light reactions happen in the thylakoid membrane.",
      course: "Biology",
    }),
    signal: AbortSignal.timeout(backstopMs),
  });
  body = await res.json();
} catch (err) {
  clientGaveUp = true;
  body = { error: err instanceof Error ? err.message : String(err) };
}
const elapsed = Date.now() - startedAt;

check(
  "responded instead of hanging",
  !clientGaveUp,
  clientGaveUp
    ? `still open after ${backstopMs}ms — the route never gave up`
    : `${elapsed}ms`
);
check(
  "responded 500",
  res?.status === 500,
  clientGaveUp ? "no response" : `got ${res?.status}`
);
if (Number.isFinite(deadlineMs)) {
  check(
    "aborted near its own deadline, not the platform's",
    elapsed < deadlineMs + 15_000,
    `${elapsed}ms vs deadline ${deadlineMs}ms`
  );
}
check(
  "body names the timeout as the cause",
  typeof body.error === "string" && /timed out/i.test(body.error),
  body.error ?? "(no error field)"
);
check(
  "does not leak a raw runtime error",
  typeof body.error === "string" && !/aborted|signal|fetch failed/i.test(body.error),
  body.error ?? "(no error field)"
);

// The mock decrements the stall as soon as it receives the request, so this
// only proves the route really did reach OpenRouter and hang on it — which is
// what makes the timeout above meaningful. It cannot tell us who gave up; the
// elapsed time already did that.
const after = await (await fetch(`${MOCK}/__stats`)).json();
check("the route really did reach upstream and hang", after.stall === 0, `stall=${after.stall}`);

// And a normal call still works, so the guard did not break the happy path.
await fetch(`${MOCK}/__reset`);
const okRes = await browser("/api/structure", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    title: "Photosynthesis",
    transcript: "Light reactions happen in the thylakoid membrane.",
    course: "Biology",
  }),
});
const okBody = await okRes.json();
check("happy path still returns notes", okRes.status === 200, okBody.error ?? "");
check(
  "happy path has notes",
  Array.isArray(okBody.notes?.headings) && okBody.notes.headings.length > 0
);

await fetch(`${MOCK}/__reset`);
console.log(failures === 0 ? "\n[e2e-timeout] ALL CHECKS PASSED" : `\n[e2e-timeout] ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
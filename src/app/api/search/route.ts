import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getEmbedding, searchLectures } from "@/lib/db";
import { OWNER_COOKIE, verifyOwnerToken } from "@/lib/identity";
import {
  checkRateLimit,
  getClientIp,
  numEnv,
  rateLimitDisabled,
  rateLimitExceeded,
} from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  query: z
    .string({ error: "query is required" })
    .trim()
    .min(1, "query is required")
    .max(2000),
});

export async function POST(request: Request) {
  // Search is a cheap read, but the brute-force scan hits the whole
  // collection — keep per-IP bursts sane.
  if (!rateLimitDisabled()) {
    const hit = checkRateLimit(`search:${getClientIp(request)}`, [
      { windowMs: 60 * 1000, max: numEnv("SEARCH_PER_MINUTE", 30) },
    ]);
    if (hit.limited) return rateLimitExceeded(hit.retryAfterSec);
  }

  try {
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body. Expected { query: string }.' },
        { status: 400 }
      );
    }

    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid query." },
        { status: 400 }
      );
    }

    // Scoped to the caller's own lectures. Search must never surface another
    // student's recording, so an unverifiable session returns nothing.
    const cookieStore = await cookies();
    const ownerId = verifyOwnerToken(cookieStore.get(OWNER_COOKIE)?.value);
    if (!ownerId) {
      return NextResponse.json({ results: [] });
    }

    const { vector, model } = await getEmbedding(parsed.data.query);
    const results = await searchLectures(vector, ownerId, 5, model);

    // Strip bulky embedding vectors before sending to the browser.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const slim = results.map(({ embedding, ...rest }) => rest);
    return NextResponse.json({ results: slim });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

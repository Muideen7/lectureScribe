import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getUserFromSession } from "@/lib/auth";
import { getEmbedding, saveLecture } from "@/lib/db";
import { OWNER_COOKIE, verifyOwnerToken } from "@/lib/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SaveLectureSchema = z.object({
  title: z.string().trim().min(1, "title is required").max(200),
  course: z.string().trim().max(100).optional(),
  language: z.string().trim().max(16).nullish(),
  duration: z.number().finite().nonnegative().nullish(),
  transcript: z.string().trim().min(1, "transcript is required").max(60000),
  notes: z.object({
    headings: z.array(z.string().trim().min(1)).min(1).max(12),
    definitions: z
      .array(
        z.object({
          term: z.string().trim().min(1),
          definition: z.string().trim().min(1),
        })
      )
      .max(20),
    flashcards: z
      .array(
        z.object({
          question: z.string().trim().min(1),
          answer: z.string().trim().min(1),
        })
      )
      .max(30),
  }),
});

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const user = getUserFromSession(cookieStore);

    if (!user) {
      return NextResponse.json(
        { error: "You must be logged in to keep your recordings." },
        { status: 401 }
      );
    }

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request body." },
        { status: 400 }
      );
    }

    const parsed = SaveLectureSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid lecture data." },
        { status: 400 }
      );
    }

    // Ownership comes from the signed cookie / authenticated session
    const ownerId =
      user.id || (verifyOwnerToken(cookieStore.get(OWNER_COOKIE)?.value) ?? "");

    const embedding = await getEmbedding(parsed.data.transcript);

    const stored = await saveLecture({
      ownerId,
      title: parsed.data.title,
      course: parsed.data.course,
      language: parsed.data.language ?? null,
      duration: parsed.data.duration ?? null,
      rawTranscript: parsed.data.transcript,
      notes: parsed.data.notes,
      embedding: embedding.vector,
      embeddingModel: embedding.model,
    });

    return NextResponse.json({
      persisted: true,
      id: stored._id,
      title: stored.title,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save lecture.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

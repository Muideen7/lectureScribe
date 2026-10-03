import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getEmbedding,
  saveLecture,
  type StructuredNotes,
} from "@/lib/db";
import {
  checkRateLimit,
  getClientIp,
  numEnv,
  rateLimitDisabled,
  rateLimitExceeded,
} from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "google/gemma-3-27b-it";
// Cap what we send to the model to control cost/latency.
const MAX_MODEL_CHARS = 20000;

const BodySchema = z.object({
  title: z
    .string({ error: "title is required" })
    .trim()
    .min(1, "title is required")
    .max(200),
  transcript: z
    .string({ error: "transcript is required" })
    .trim()
    .min(1, "transcript is required")
    .max(60000, "transcript is too long (max 60000 characters)."),
  course: z.string().trim().max(100).optional(),
});

const NotesSchema = z.object({
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
});

interface OpenRouterChoice {
  message?: { content?: string | null };
}

interface OpenRouterResponse {
  choices?: OpenRouterChoice[];
  error?: { message?: string } | string;
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (match?.[1] ?? trimmed).trim();
}

function buildPrompt(title: string, transcript: string): string {
  const clipped =
    transcript.length > MAX_MODEL_CHARS
      ? `${transcript.slice(0, MAX_MODEL_CHARS)}\n\n[Transcript truncated for length.]`
      : transcript;
  return [
    `You are a study assistant for Nigerian university students.`,
    `Turn the lecture transcript below (titled "${title}") into structured study notes.`,
    ``,
    `Return ONLY valid JSON — no markdown, no code fences, no commentary — with exactly this shape:`,
    `{`,
    `  "headings": ["string", ...],`,
    `  "definitions": [{ "term": "string", "definition": "string" }, ...],`,
    `  "flashcards": [{ "question": "string", "answer": "string" }, ...]`,
    `}`,
    ``,
    `Rules:`,
    `- 3-8 concise headings covering the lecture's key sections.`,
    `- 4-10 key term definitions in plain language.`,
    `- 4-10 flashcards with specific questions and short answers.`,
    `- Use the transcript content only; do not invent facts.`,
    `- Keep language clear and simple.`,
    ``,
    `Transcript:`,
    clipped,
  ].join("\n");
}

export async function POST(request: Request) {
  // Each call spends OpenRouter credits — cap per-IP usage.
  if (!rateLimitDisabled()) {
    const hit = checkRateLimit(`structure:${getClientIp(request)}`, [
      { windowMs: 60 * 60 * 1000, max: numEnv("STRUCTURE_PER_HOUR", 20) },
      { windowMs: 24 * 60 * 60 * 1000, max: numEnv("STRUCTURE_PER_DAY", 60) },
    ]);
    if (hit.limited) return rateLimitExceeded(hit.retryAfterSec);
  }

  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENROUTER_API_KEY is not configured." },
        { status: 500 }
      );
    }

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json(
        {
          error:
            'Invalid JSON body. Expected { title: string, transcript: string, course?: string }.',
        },
        { status: 400 }
      );
    }

    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request." },
        { status: 400 }
      );
    }
    const { title, transcript, course } = parsed.data;

    const model = process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;

    let upstream: Response;
    try {
      upstream = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "X-Title": "LectureScribe",
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: 2000,
          messages: [
            {
              role: "system",
              content:
                "You output only valid JSON matching the requested schema. No markdown, no commentary.",
            },
            { role: "user", content: buildPrompt(title, transcript) },
          ],
        }),
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to reach OpenRouter.";
      return NextResponse.json({ error: message }, { status: 500 });
    }

    if (!upstream.ok) {
      let message = `Note structuring failed (${upstream.status}).`;
      try {
        const text = await upstream.text();
        if (text) {
          try {
            const data = JSON.parse(text) as OpenRouterResponse;
            if (typeof data.error === "string") {
              message = data.error;
            } else if (data.error?.message) {
              message = data.error.message;
            } else {
              message = text.slice(0, 500);
            }
          } catch {
            message = text.slice(0, 500);
          }
        }
      } catch {
        // Keep default message
      }
      return NextResponse.json({ error: message }, { status: 500 });
    }

    const data = (await upstream.json()) as OpenRouterResponse;
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return NextResponse.json(
        { error: "Model returned an empty response." },
        { status: 500 }
      );
    }

    let notes: StructuredNotes;
    try {
      notes = NotesSchema.parse(JSON.parse(stripCodeFences(content)));
    } catch {
      return NextResponse.json(
        { error: "Model returned invalid notes JSON. Please try again." },
        { status: 500 }
      );
    }

    // Persist for search. Degrade gracefully if the DB is unavailable
    // so the user still gets their notes.
    try {
      const { vector, model } = await getEmbedding(transcript);
      const stored = await saveLecture({
        title,
        course,
        rawTranscript: transcript,
        notes,
        embedding: vector,
        embeddingModel: model,
      });
      return NextResponse.json({
        notes,
        id: stored._id,
        title,
        persisted: true,
      });
    } catch (err) {
      const warning =
        err instanceof Error ? err.message : "Failed to save lecture.";
      return NextResponse.json({
        notes,
        title,
        persisted: false,
        warning,
      });
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to structure notes.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

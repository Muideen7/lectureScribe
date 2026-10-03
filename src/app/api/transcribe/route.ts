import { NextResponse } from "next/server";
import {
  checkRateLimit,
  getClientIp,
  numEnv,
  rateLimitDisabled,
  rateLimitExceeded,
} from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const GROQ_MODEL = "whisper-large-v3-turbo";
const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25MB

const ALLOWED_MIME_TYPES = new Set([
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/vnd.wave",
  "audio/mpeg",
  "audio/mp3",
  "audio/x-mpeg",
  "audio/x-mp3",
]);

const ALLOWED_EXTENSIONS = new Set(["wav", "mp3"]);

function getExtension(filename: string): string {
  const parts = filename.toLowerCase().split(".");
  return parts.length > 1 ? (parts.pop() ?? "") : "";
}

function isAllowedAudio(file: File): boolean {
  if (file.type && ALLOWED_MIME_TYPES.has(file.type.toLowerCase())) {
    return true;
  }
  // Fall back to extension check — some browsers send empty/octet-stream types.
  const ext = getExtension(file.name);
  return ALLOWED_EXTENSIONS.has(ext);
}

export async function POST(request: Request) {
  // Groq free tier is org-wide (20 RPM / 2,000 RPD / 7,200 audio-sec per hour
  // / 28,800 audio-sec per day), so cap each client IP well below it.
  // 5-min takes max: 6/hour ≈ 30 audio-min/hour, 30/day ≈ 2.5 audio-hours/day.
  if (!rateLimitDisabled()) {
    const hit = checkRateLimit(`transcribe:${getClientIp(request)}`, [
      { windowMs: 60 * 60 * 1000, max: numEnv("TRANSCRIBE_PER_HOUR", 6) },
      { windowMs: 24 * 60 * 60 * 1000, max: numEnv("TRANSCRIBE_PER_DAY", 30) },
    ]);
    if (hit.limited) return rateLimitExceeded(hit.retryAfterSec);
  }

  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GROQ_API_KEY is not configured." },
        { status: 500 }
      );
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: "Invalid multipart/form-data request." },
        { status: 400 }
      );
    }

    const audio = formData.get("audio");

    if (!audio || !(audio instanceof File)) {
      return NextResponse.json(
        { error: 'Missing audio file field named "audio".' },
        { status: 400 }
      );
    }

    if (audio.size === 0) {
      return NextResponse.json(
        { error: "Audio file is empty." },
        { status: 400 }
      );
    }

    if (audio.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "Audio file must be up to 25MB." },
        { status: 400 }
      );
    }

    if (!isAllowedAudio(audio)) {
      return NextResponse.json(
        { error: "Only WAV or MP3 audio files are supported." },
        { status: 400 }
      );
    }

    // Forward to Groq as OpenAI-compatible multipart upload.
    // Do NOT set Content-Type manually — fetch sets the boundary.
    const groqForm = new FormData();
    groqForm.append("file", audio, audio.name || "audio.mp3");
    groqForm.append("model", GROQ_MODEL);
    groqForm.append("response_format", "json");

    let groqRes: Response;
    try {
      groqRes = await fetch(`${GROQ_BASE_URL}/audio/transcriptions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: groqForm,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to reach Groq API.";
      return NextResponse.json({ error: message }, { status: 500 });
    }

    if (!groqRes.ok) {
      let message = `Groq transcription failed (${groqRes.status}).`;
      try {
        const text = await groqRes.text();
        if (text) {
          try {
            const parsed = JSON.parse(text) as {
              error?: { message?: string } | string;
            };
            if (typeof parsed.error === "string") {
              message = parsed.error;
            } else if (parsed.error?.message) {
              message = parsed.error.message;
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

    const data = (await groqRes.json()) as { text?: string };
    if (!data.text) {
      return NextResponse.json(
        { error: "Groq returned an empty transcript." },
        { status: 500 }
      );
    }

    return NextResponse.json({ transcript: data.text });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Transcription failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

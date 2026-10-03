import { NextResponse } from "next/server";
import { z } from "zod";
import {
  buildGroqPrompt,
  getLanguageOption,
  isAllowedAudioFile,
  MAX_UPLOAD_BYTES,
  type SpeechLanguage,
} from "@/lib/transcribe";
import {
  checkRateLimit,
  getClientIp,
  numEnv,
  rateLimitDisabled,
  rateLimitExceeded,
} from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Uploading a 5-minute take plus upstream transcription can outrun the
// platform default. Render/Vercel read this from the build output.
export const maxDuration = 120;

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

/**
 * `whisper-large-v3` measures ~10.3% WER against turbo's ~12% on Groq's
 * benchmark. Lecture notes are only useful if the transcript is right, so
 * accuracy wins over the cheaper, faster turbo model. Override with
 * GROQ_MODEL=whisper-large-v3-turbo to trade accuracy for cost and latency.
 */
const GROQ_MODEL = process.env.GROQ_MODEL?.trim() || "whisper-large-v3";

const FieldSchema = z
  .string()
  .trim()
  .max(600, "Field is too long (max 600 characters).")
  .optional()
  .default("");

const MetadataSchema = z.object({
  language: z.string().trim().max(8).optional(),
  title: FieldSchema,
  course: FieldSchema,
  terms: FieldSchema,
});

interface GroqTranscription {
  text?: string;
  language?: string;
  duration?: number;
}

interface GroqErrorBody {
  error?: { message?: string } | string;
}

function readErrorMessage(body: string, fallback: string): string {
  if (!body) return fallback;
  try {
    const parsed = JSON.parse(body) as GroqErrorBody;
    if (typeof parsed.error === "string") return parsed.error;
    if (parsed.error?.message) return parsed.error.message;
  } catch {
    // Not JSON — fall through to the raw snippet.
  }
  return body.slice(0, 500);
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

    if (audio.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          error: `Audio file must be ${Math.floor(
            MAX_UPLOAD_BYTES / 1024 / 1024
          )}MB or smaller.`,
        },
        { status: 413 }
      );
    }

    if (!isAllowedAudioFile(audio.type, audio.name)) {
      return NextResponse.json(
        { error: "Unsupported audio format. Use WAV, MP3, M4A, WebM or OGG." },
        { status: 400 }
      );
    }

    // Client-supplied hints arrive on the multipart body, not JSON, so parse
    // them defensively — a bad hint must never fail an otherwise valid upload.
    const rawLanguage = formData.get("language");
    const language = (
      typeof rawLanguage === "string" ? rawLanguage : ""
    ).trim() as SpeechLanguage;

    const metadata = MetadataSchema.safeParse({
      language,
      title: formData.get("title"),
      course: formData.get("course"),
      terms: formData.get("terms"),
    });
    const meta = metadata.success ? metadata.data : null;
    const languageOption = getLanguageOption(
      meta?.language ?? (language || undefined)
    );

    const model = GROQ_MODEL;

    const groqForm = new FormData();
    // Do NOT set Content-Type manually — fetch sets the multipart boundary.
    groqForm.append("file", audio, audio.name || "audio.wav");
    groqForm.append("model", model);    // Greedy decoding: no sampling drift between takes of the same lecture.
    groqForm.append("temperature", "0");
    // verbose_json reports the language Whisper settled on, so the UI can show
    // the student what was actually decoded.
    groqForm.append("response_format", "verbose_json");

    if (languageOption.groq) {
      groqForm.append("language", languageOption.groq);
    }

    const prompt = buildGroqPrompt({
      language: languageOption.value,
      title: meta?.title,
      course: meta?.course,
      terms: meta?.terms,
    });
    if (prompt) {
      groqForm.append("prompt", prompt);
    }

    let groqRes: Response;
    try {
      groqRes = await fetch(`${GROQ_BASE_URL}/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: groqForm,
        signal: AbortSignal.timeout(110_000),
      });
    } catch (err) {
      const message =
        err instanceof Error && err.name === "TimeoutError"
          ? "Transcription timed out. Try a shorter recording."
          : err instanceof Error
            ? err.message
            : "Failed to reach Groq API.";
      return NextResponse.json({ error: message }, { status: 504 });
    }

    if (!groqRes.ok) {
      // Surface 429 as a 429 so the client can show the real retry window.
      const status = groqRes.status === 429 ? 429 : 502;
      const body = await groqRes.text().catch(() => "");
      return NextResponse.json(
        {
          error: readErrorMessage(
            body,
            `Groq transcription failed (${groqRes.status}).`
          ),
        },
        { status }
      );
    }

    const data = (await groqRes.json()) as GroqTranscription;
    const transcript = data.text?.trim();
    if (!transcript) {
      return NextResponse.json(
        { error: "Groq returned an empty transcript." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      transcript,
      language: data.language ?? languageOption.groq ?? null,
      duration: typeof data.duration === "number" ? data.duration : null,
      model,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Transcription failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

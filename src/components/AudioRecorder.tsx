"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mic, Sparkles, Square, TriangleAlert } from "lucide-react";
import type { StructuredNotes } from "@/lib/db";
import {
  formatElapsed,
  getUploadSizeBytes,
  LANGUAGE_OPTIONS,
  MAX_RECORDING_SECONDS,
  MAX_UPLOAD_BYTES,
  WHISPER_SAMPLE_RATE,
  type SpeechLanguage,
} from "@/lib/transcribe";

interface AudioRecorderResult {
  title: string;
  transcript: string;
  notes: StructuredNotes;
  persisted: boolean;
  language: string | null;
  duration: number | null;
}

interface AudioRecorderProps {
  onResult?: (data: AudioRecorderResult) => void;
}

const MAX_UPLOAD_MB = Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024);

/** Opus in WebM is ~10x smaller than PCM; prefer it where the browser has it. */
function pickMimeType(): string | undefined {
  if (
    typeof MediaRecorder === "undefined" ||
    typeof MediaRecorder.isTypeSupported !== "function"
  ) {
    return undefined;
  }
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "",
  ];
  for (const mime of candidates) {
    if (!mime) return undefined;
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch {
      // try next
    }
  }
  return undefined;
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

/** Wrap mono float samples in a canonical 16-bit PCM WAV container. */
function encodeMonoWav(
  samples: Float32Array,
  sampleRate: number
): { blob: Blob; byteLength: number } {
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return {
    blob: new Blob([buffer], { type: "audio/wav" }),
    byteLength: buffer.byteLength,
  };
}

/**
 * Resample to mono 16kHz — the rate Whisper decodes natively.
 *
 * This is a correctness fix, not an optimisation. The browser hands us 48kHz
 * stereo, which as 16-bit PCM is ~187KB/s: a 5-minute take would be ~55MB and
 * blow past the 25MB upload cap at roughly 2:13. At 16kHz mono the same take
 * is ~9MB, and because Whisper resamples to 16kHz internally anyway, no
 * accuracy is lost. It also cuts mobile upload data by ~85%, which matters for
 * the students this is built for.
 */
async function blobToWhisperWav(blob: Blob): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioContextClass =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  const OfflineContextClass =
    window.OfflineAudioContext ??
    (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;

  if (!AudioContextClass || !OfflineContextClass) {
    throw new Error("Audio conversion is not supported in this browser.");
  }

  // Decode at the source rate, then let OfflineAudioContext do the resample
  // and stereo->mono downmix in one pass.
  const decodeCtx = new AudioContextClass();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeCtx.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    void decodeCtx.close().catch(() => undefined);
  }

  const frames = Math.max(1, Math.ceil(decoded.duration * WHISPER_SAMPLE_RATE));
  const offline = new OfflineContextClass(1, frames, WHISPER_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();

  const rendered = await offline.startRendering();
  return encodeMonoWav(rendered.getChannelData(0), WHISPER_SAMPLE_RATE).blob;
}

function extractNotes(json: unknown): StructuredNotes | null {
  if (!json || typeof json !== "object") return null;
  const obj = json as Record<string, unknown>;
  const candidates = [obj.notes, obj.structuredNotes];
  const lecture = obj.lecture as Record<string, unknown> | undefined;
  if (lecture && typeof lecture === "object") {
    candidates.push(lecture.notes);
  }
  for (const candidate of candidates) {
    if (
      candidate &&
      typeof candidate === "object" &&
      Array.isArray((candidate as StructuredNotes).headings) &&
      Array.isArray((candidate as StructuredNotes).definitions) &&
      Array.isArray((candidate as StructuredNotes).flashcards)
    ) {
      return candidate as StructuredNotes;
    }
  }
  return null;
}

export default function AudioRecorder({ onResult }: AudioRecorderProps) {
  const [title, setTitle] = useState("");
  const [course, setCourse] = useState("");
  const [terms, setTerms] = useState("");
  const [language, setLanguage] = useState<SpeechLanguage>("en");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isStructuring, setIsStructuring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [detected, setDetected] = useState<{
    language: string | null;
    duration: number | null;
  } | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep the latest hint values readable from the stop handler without
  // re-creating it (and re-binding MediaRecorder) on every keystroke.
  const hintsRef = useRef({ title, course, terms, language });

  useEffect(() => {
    hintsRef.current = { title, course, terms, language };
  }, [title, course, terms, language]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const handleStoppedRecording = useCallback(
    async (recorder: MediaRecorder) => {
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setIsTranscribing(true);
      setError(null);
      setDetected(null);
      const hints = hintsRef.current;

      try {
        const mimeType = recorder.mimeType || "audio/webm";
        const rawBlob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];

        if (rawBlob.size === 0) {
          throw new Error("Recording was empty. Please try again.");
        }

        const wavBlob = await blobToWhisperWav(rawBlob);
        if (wavBlob.size > MAX_UPLOAD_BYTES) {
          throw new Error(
            `Converted audio is ${(wavBlob.size / 1024 / 1024).toFixed(1)}MB, ` +
              `over the ${MAX_UPLOAD_MB}MB limit. Try a shorter recording.`
          );
        }

        const baseName = (hints.title.trim() || "lecture").replace(/\s+/g, "-");
        const form = new FormData();
        form.append("audio", wavBlob, `${baseName}.wav`);
        form.append("language", hints.language);
        if (hints.title.trim()) form.append("title", hints.title.trim());
        if (hints.course.trim()) form.append("course", hints.course.trim());
        if (hints.terms.trim()) form.append("terms", hints.terms.trim());

        const res = await fetch("/api/transcribe", {
          method: "POST",
          body: form,
        });
        const data = (await res.json()) as {
          transcript?: string;
          language?: string | null;
          duration?: number | null;
          error?: string;
        };
        if (!res.ok) {
          throw new Error(data.error ?? "Transcription failed.");
        }
        if (!data.transcript?.trim()) {
          throw new Error(
            "Transcription returned no text. Try moving closer to the speaker."
          );
        }
        setTranscript(data.transcript);
        setDetected({
          language: data.language ?? null,
          duration: typeof data.duration === "number" ? data.duration : null,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Transcription failed.");
      } finally {
        setIsTranscribing(false);
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        recorderRef.current = null;
      }
    },
    []
  );

  const startRecording = useCallback(async () => {
    setError(null);
    setSaveWarning(null);
    setTranscript("");
    setDetected(null);
    setElapsed(0);

    if (
      typeof window === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setError("Microphone recording is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // A lecture is one voice in a reverberant hall, not a video call:
          // echo cancellation would treat the lecturer as echo and gate them.
          echoCancellation: false,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      streamRef.current = stream;

      const mimeType = pickMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        void handleStoppedRecording(recorder);
      };
      recorder.onerror = () => {
        setError("Recording failed. Please try again.");
      };

      recorder.start(250);
      setIsRecording(true);
      timerRef.current = setInterval(() => {
        setElapsed((s) => {
          const next = s + 1;
          if (next >= MAX_RECORDING_SECONDS) {
            // Auto-stop at the cap; onstop handles transcription.
            const active = recorderRef.current;
            if (active && active.state !== "inactive") {
              active.stop();
            }
          }
          return next;
        });
      }, 1000);
    } catch (err) {
      setError(
        err instanceof Error
          ? `Could not access the microphone: ${err.message}`
          : "Could not access the microphone."
      );
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, [handleStoppedRecording]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }, []);

  const structureNotes = useCallback(async () => {
    if (!transcript.trim()) {
      setError("Transcribe audio first before structuring notes.");
      return;
    }
    const effectiveTitle = title.trim() || "Untitled Lecture";
    setIsStructuring(true);
    setError(null);
    setSaveWarning(null);
    try {
      const res = await fetch("/api/structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: effectiveTitle,
          transcript: transcript.trim(),
          course: course.trim() || undefined,
          // Persist what was actually recorded, not what was requested, so
          // search and later note regeneration know the lecture's language.
          language: detected?.language ?? undefined,
          duration: detected?.duration ?? undefined,
        }),
      });
      const data = (await res.json()) as unknown;
      if (!res.ok) {
        const message =
          data && typeof data === "object" && "error" in data
            ? String((data as { error: unknown }).error)
            : "Failed to structure notes.";
        throw new Error(message);
      }
      const parsed = extractNotes(data);
      if (!parsed) {
        throw new Error("Structuring returned invalid notes.");
      }
      const persisted =
        data && typeof data === "object" && "persisted" in data
          ? (data as { persisted: unknown }).persisted !== false
          : true;
      const warning =
        data && typeof data === "object" && "warning" in data
          ? String((data as { warning: unknown }).warning)
          : null;
      if (!persisted) {
        setSaveWarning(
          warning
            ? `Notes generated but not saved to your library: ${warning}`
            : "Notes generated but not saved to your library."
        );
      }
      onResult?.({
        title: effectiveTitle,
        transcript: transcript.trim(),
        notes: parsed,
        persisted,
        language: detected?.language ?? null,
        duration: detected?.duration ?? null,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to structure notes."
      );
    } finally {
      setIsStructuring(false);
    }
  }, [transcript, title, course, detected, onResult]);

  const busy = isTranscribing || isStructuring;
  const selectedLanguage =
    LANGUAGE_OPTIONS.find((option) => option.value === language) ??
    LANGUAGE_OPTIONS[0];
  const uploadEstimate = getUploadSizeBytes(elapsed);

  return (
    <section
      aria-label="Lecture recorder"
      className="w-full rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="lecture-title"
            className="mb-1.5 block text-sm font-medium text-zinc-700"
          >
            Lecture title
          </label>
          <input
            id="lecture-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Intro to Photosynthesis"
            disabled={isRecording || busy}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-base text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none disabled:opacity-60 sm:text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="lecture-course"
            className="mb-1.5 block text-sm font-medium text-zinc-700"
          >
            Course <span className="font-normal text-zinc-400">(optional)</span>
          </label>
          <input
            id="lecture-course"
            type="text"
            value={course}
            onChange={(e) => setCourse(e.target.value)}
            placeholder="e.g. BIO 201"
            disabled={isRecording || busy}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-base text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none disabled:opacity-60 sm:text-sm"
          />
        </div>
      </div>

      <div className="mt-4">
        <label
          htmlFor="lecture-language"
          className="mb-1.5 block text-sm font-medium text-zinc-700"
        >
          Language spoken in the lecture
        </label>
        <select
          id="lecture-language"
          value={language}
          onChange={(e) => setLanguage(e.target.value as SpeechLanguage)}
          disabled={isRecording || busy}
          aria-describedby="lecture-language-hint"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-base text-zinc-900 focus:border-zinc-900 focus:outline-none disabled:opacity-60 sm:text-sm"
        >
          {LANGUAGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p
          id="lecture-language-hint"
          className="mt-1.5 text-xs leading-5 text-zinc-500"
        >
          {selectedLanguage.hint}
        </p>
      </div>

      <details className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-zinc-700">
          Add course words to recognise
        </summary>
        <div className="mt-3">
          <label htmlFor="lecture-terms" className="sr-only">
            Course words and names
          </label>
          <input
            id="lecture-terms"
            type="text"
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            placeholder="e.g. Professor Adeyemi, photosynthesis, JSTOR"
            disabled={isRecording || busy}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-base text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none disabled:opacity-60 sm:text-sm"
          />
          <p className="mt-1.5 text-xs leading-5 text-zinc-500">
            Names and terms you add here are biased into the transcription, so
            they are spelled correctly instead of guessed.
          </p>
        </div>
      </details>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        {!isRecording ? (
          <button
            type="button"
            onClick={() => void startRecording()}
            disabled={busy}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Mic className="h-4 w-4" aria-hidden />
            Start Recording
          </button>
        ) : (
          <button
            type="button"
            onClick={stopRecording}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-red-500"
          >
            <Square className="h-4 w-4" aria-hidden />
            Stop Recording
          </button>
        )}

        <div aria-live="polite" className="text-sm text-zinc-600">
          {isRecording ? (
            <span className="inline-flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-red-600"
                aria-hidden
              />
              Recording… {formatElapsed(elapsed)} /{" "}
              {formatElapsed(MAX_RECORDING_SECONDS)}
            </span>
          ) : isTranscribing ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Transcribing audio…
            </span>
          ) : null}
        </div>
      </div>
      <p className="mt-2 text-xs text-zinc-400">
        Up to {formatElapsed(MAX_RECORDING_SECONDS)} per take · uploaded as{" "}
        {(uploadEstimate / 1024 / 1024).toFixed(1)}MB of {MAX_UPLOAD_MB}MB
        {isRecording ? "" : " at full length"}
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}

      {saveWarning ? (
        <p
          role="status"
          className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{saveWarning}</span>
        </p>
      ) : null}

      {transcript ? (
        <div className="mt-5">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
              Raw transcript
            </h3>
            {detected?.language ? (
              <p className="text-xs text-zinc-400">
                Decoded as{" "}
                <span className="font-medium text-zinc-600">
                  {detected.language}
                </span>
                {detected.duration
                  ? ` · ${formatElapsed(Math.round(detected.duration))}`
                  : ""}
              </p>
            ) : null}
          </div>
          <p className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-zinc-50 px-3 py-2.5 text-sm leading-7 text-zinc-800">
            {transcript}
          </p>
          <button
            type="button"
            onClick={() => void structureNotes()}
            disabled={busy || !transcript.trim()}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-zinc-900 px-5 py-2.5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {isStructuring ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="h-4 w-4" aria-hidden />
            )}
            {isStructuring ? "Structuring…" : "Structure Notes"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BookmarkCheck,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  Lock,
  Mic,
  Sparkles,
  Square,
  TriangleAlert,
} from "lucide-react";
import { useAuth } from "@/components/AuthContext";
import type { StructuredNotes } from "@/lib/db";
import {
  formatElapsed,
  DEFAULT_LANGUAGE_OPTION,
  getUploadSizeBytes,
  LANGUAGE_OPTIONS,
  MAX_RECORDING_SECONDS,
  MAX_UPLOAD_BYTES,
  WHISPER_SAMPLE_RATE,
} from "@/lib/transcribe";
import type { SpeechLanguage } from "@/lib/transcribe";

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
    // A missing sample is silence, not `undefined` coerced to NaN — which
    // `Math.min` would happily produce and write into the WAV header as noise.
    const sample = Math.max(-1, Math.min(1, samples[i] ?? 0));
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

  const { user, openAuthModal } = useAuth();
  const [lastNotes, setLastNotes] = useState<StructuredNotes | null>(null);
  const [requiresAuthToKeep, setRequiresAuthToKeep] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [savingToLibrary, setSavingToLibrary] = useState(false);
  const [copiedTranscript, setCopiedTranscript] = useState(false);

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
    setIsSaved(false);
    setSavedId(null);
    setRequiresAuthToKeep(false);

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

  const saveLectureToAccount = useCallback(
    async (notesToSave?: StructuredNotes) => {
      const targetNotes = notesToSave ?? lastNotes;
      if (!targetNotes || !transcript.trim()) return;

      setSavingToLibrary(true);
      setError(null);
      try {
        const res = await fetch("/api/lectures/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim() || "Untitled Lecture",
            course: course.trim() || undefined,
            language: detected?.language ?? null,
            duration: detected?.duration ?? null,
            transcript: transcript.trim(),
            notes: targetNotes,
          }),
        });
        const data = (await res.json()) as { id?: string; error?: string };
        if (!res.ok) {
          throw new Error(data.error || "Failed to save lecture.");
        }
        setIsSaved(true);
        if (data.id) setSavedId(data.id);
        setRequiresAuthToKeep(false);
        setSaveWarning(null);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to save lecture to your account."
        );
      } finally {
        setSavingToLibrary(false);
      }
    },
    [lastNotes, transcript, title, course, detected]
  );

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
      setLastNotes(parsed);

      const requiresAuth =
        data && typeof data === "object" && "requiresAuth" in data
          ? Boolean((data as { requiresAuth: unknown }).requiresAuth)
          : false;

      const persisted =
        data && typeof data === "object" && "persisted" in data
          ? (data as { persisted: unknown }).persisted !== false
          : true;

      const warning =
        data && typeof data === "object" && "warning" in data
          ? String((data as { warning: unknown }).warning)
          : null;

      if (requiresAuth) {
        setRequiresAuthToKeep(true);
        setIsSaved(false);
      } else if (persisted) {
        setIsSaved(true);
        setRequiresAuthToKeep(false);
        if (data && typeof data === "object" && "id" in data) {
          setSavedId(String((data as { id: unknown }).id));
        }
      } else if (!persisted) {
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
    DEFAULT_LANGUAGE_OPTION;
  const uploadEstimate = getUploadSizeBytes(elapsed);

  function copyTranscript() {
    if (!transcript) return;
    void navigator.clipboard.writeText(transcript);
    setCopiedTranscript(true);
    setTimeout(() => setCopiedTranscript(false), 2000);
  }

  return (
    <section
      aria-label="Lecture recorder"
      className="relative overflow-hidden rounded-3xl border border-stone-200/90 bg-white p-5 shadow-xl transition-all sm:p-7 dark:border-zinc-800 dark:bg-zinc-900/95"
    >
      {/* Ambient background glow */}
      <div
        className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl"
        aria-hidden="true"
      />

      {/* Header bar */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 pb-4 dark:border-zinc-800">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
            <Mic className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-stone-900 dark:text-white">
              Recording Studio
            </h2>
            <p className="text-xs text-stone-500 dark:text-zinc-400">
              Live microphone capture with dialect tuning
            </p>
          </div>
        </div>

        {/* User state indicator */}
        <div className="flex items-center gap-2 text-xs">
          {user ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              Auto-saves to account
            </span>
          ) : (
            <button
              type="button"
              onClick={() =>
                openAuthModal(
                  "Sign in with email and password to keep your recordings saved."
                )
              }
              className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-3 py-1 font-medium text-stone-600 transition hover:bg-stone-100 hover:text-stone-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              <Lock className="h-3 w-3" aria-hidden />
              Guest take · Log in to keep
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="lecture-title"
            className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-stone-600 dark:text-zinc-300"
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
            className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-base text-stone-900 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-60 sm:text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder:text-zinc-500 dark:focus:border-emerald-500"
          />
        </div>
        <div>
          <label
            htmlFor="lecture-course"
            className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-stone-600 dark:text-zinc-300"
          >
            Course <span className="font-normal text-stone-400">(optional)</span>
          </label>
          <input
            id="lecture-course"
            type="text"
            value={course}
            onChange={(e) => setCourse(e.target.value)}
            placeholder="e.g. BIO 201"
            disabled={isRecording || busy}
            className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-base text-stone-900 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-60 sm:text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder:text-zinc-500 dark:focus:border-emerald-500"
          />
        </div>
      </div>

      <div className="mt-4">
        <label
          htmlFor="lecture-language"
          className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-stone-600 dark:text-zinc-300"
        >
          Spoken dialect or language
        </label>
        <select
          id="lecture-language"
          value={language}
          onChange={(e) => setLanguage(e.target.value as SpeechLanguage)}
          disabled={isRecording || busy}
          aria-describedby="lecture-language-hint"
          className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-base text-stone-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-60 sm:text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-emerald-500"
        >
          {LANGUAGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p
          id="lecture-language-hint"
          className="mt-1.5 text-xs leading-5 text-stone-500 dark:text-zinc-400"
        >
          {selectedLanguage.hint}
        </p>
      </div>

      <details className="mt-4 rounded-xl border border-stone-200/80 bg-stone-50/70 px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-800/40">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-stone-700 dark:text-zinc-300">
          Add specific names & course terminology
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
            placeholder="e.g. Professor Adeyemi, photosynthesis, JSTOR, Unilag"
            disabled={isRecording || busy}
            className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-base text-stone-900 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-60 sm:text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder:text-zinc-500 dark:focus:border-emerald-500"
          />
          <p className="mt-1.5 text-xs leading-5 text-stone-500 dark:text-zinc-400">
            Names and terms you enter are biased into the Whisper transcription
            engine for accurate spelling.
          </p>
        </div>
      </details>

      {/* Recording Actions & Live Visualizer */}
      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {!isRecording ? (
            <button
              type="button"
              onClick={() => void startRecording()}
              disabled={busy}
              className="inline-flex min-h-12 items-center justify-center gap-2.5 rounded-full bg-stone-900 px-6 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-stone-800 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
            >
              <Mic className="h-4 w-4" aria-hidden />
              Start Recording
            </button>
          ) : (
            <button
              type="button"
              onClick={stopRecording}
              className="inline-flex min-h-12 items-center justify-center gap-2.5 rounded-full bg-red-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-red-600/30 transition-all hover:bg-red-500"
            >
              <Square className="h-4 w-4" aria-hidden />
              Stop Recording
            </button>
          )}

          {/* Soundwave equalizer & timer feedback */}
          {isRecording ? (
            <div className="flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" />
              <div className="flex h-5 items-center gap-0.5">
                <span className="w-1 rounded-full bg-red-600 animate-soundwave-1" />
                <span className="w-1 rounded-full bg-red-600 animate-soundwave-2" />
                <span className="w-1 rounded-full bg-red-600 animate-soundwave-3" />
                <span className="w-1 rounded-full bg-red-600 animate-soundwave-4" />
                <span className="w-1 rounded-full bg-red-600 animate-soundwave-5" />
              </div>
              <span className="tabular-nums font-mono">
                {formatElapsed(elapsed)} / {formatElapsed(MAX_RECORDING_SECONDS)}
              </span>
            </div>
          ) : isTranscribing ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-3.5 py-2 text-xs font-medium text-stone-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-600" aria-hidden />
              Transcribing audio via Whisper AI…
            </div>
          ) : null}
        </div>

        <p className="text-xs text-stone-400 dark:text-zinc-500">
          Up to {formatElapsed(MAX_RECORDING_SECONDS)} per take · ~{(uploadEstimate / 1024 / 1024).toFixed(1)}MB of {MAX_UPLOAD_MB}MB
        </p>
      </div>

      {error ? (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs leading-relaxed text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300 sm:text-sm"
        >
          {error}
        </div>
      ) : null}

      {saveWarning ? (
        <div
          role="status"
          className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300 sm:text-sm"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{saveWarning}</span>
        </div>
      ) : null}

      {/* Raw Transcript Box */}
      {transcript ? (
        <div className="mt-6 rounded-2xl border border-stone-200/90 bg-stone-50/70 p-4 sm:p-5 dark:border-zinc-800 dark:bg-zinc-800/40">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-zinc-400">
                Transcribed Audio
              </h3>
              {detected?.language ? (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  {detected.language.toUpperCase()}
                  {detected.duration ? ` · ${formatElapsed(Math.round(detected.duration))}` : ""}
                </span>
              ) : null}
            </div>

            <button
              type="button"
              onClick={copyTranscript}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-stone-600 hover:bg-stone-200/70 hover:text-stone-900 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-white"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden />
              {copiedTranscript ? "Copied!" : "Copy text"}
            </button>
          </div>

          <p className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-white p-3.5 text-sm leading-7 text-stone-800 shadow-inner sm:text-[15px] dark:bg-zinc-900 dark:text-zinc-200">
            {transcript}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void structureNotes()}
              disabled={busy || !transcript.trim()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isStructuring ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="h-4 w-4" aria-hidden />
              )}
              {isStructuring ? "AI Generating Notes…" : "Generate Structured Notes & Flashcards"}
            </button>
          </div>
        </div>
      ) : null}

      {/* KEEP RECORDING BANNER FOR GUEST USERS */}
      {requiresAuthToKeep && !isSaved ? (
        <div className="mt-6 flex flex-col items-start justify-between gap-4 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 p-4 sm:flex-row sm:items-center sm:p-5 dark:border-emerald-900/60 dark:from-emerald-950/40 dark:to-teal-950/40">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow">
              <BookmarkCheck className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <h4 className="text-sm font-bold text-stone-900 dark:text-white">
                Want to keep this recording in your study library?
              </h4>
              <p className="mt-0.5 text-xs leading-relaxed text-stone-600 dark:text-zinc-300">
                You generated notes as a guest. Sign in or create an account with
                your email & password to save this lecture and study anytime.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              openAuthModal(
                "Sign in with your email & password to keep this lecture in your library.",
                () => {
                  void saveLectureToAccount();
                }
              )
            }
            disabled={savingToLibrary}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-stone-900 px-5 text-xs font-semibold text-white shadow transition hover:bg-stone-800 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          >
            {savingToLibrary ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Lock className="h-3.5 w-3.5" aria-hidden />
            )}
            Sign In to Keep Recording
          </button>
        </div>
      ) : null}

      {/* SUCCESS SAVED BANNER */}
      {isSaved ? (
        <div className="mt-5 flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-xs text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300 sm:text-sm">
          <span className="inline-flex items-center gap-2 font-medium">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
            Saved permanently to your account library!
          </span>
          {savedId ? (
            <Link
              href={`/lectures/${savedId}`}
              className="inline-flex items-center gap-1 font-semibold text-emerald-900 underline hover:text-emerald-700 dark:text-emerald-200"
            >
              Open saved lecture
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

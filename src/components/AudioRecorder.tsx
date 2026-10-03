"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mic, Sparkles, Square, TriangleAlert } from "lucide-react";
import type { StructuredNotes } from "@/lib/db";

interface AudioRecorderResult {
  title: string;
  transcript: string;
  notes: StructuredNotes;
  persisted: boolean;
}

interface AudioRecorderProps {
  onResult?: (data: AudioRecorderResult) => void;
}

const MAX_FILE_BYTES = 25 * 1024 * 1024;
// Groq free-tier friendly: 5-min takes keep each transcription small and
// a single device far below the org-wide 28,800 audio-sec/day quota.
const MAX_RECORDING_SECONDS = 5 * 60;

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

function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = Math.min(buffer.numberOfChannels, 2);
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = length * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  const channelData: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channelData.push(buffer.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channelData[c][i]));
      view.setInt16(
        offset,
        sample < 0 ? sample * 0x8000 : sample * 0x7fff,
        true
      );
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

async function blobToWavBlob(blob: Blob): Promise<Blob> {
  // Already WAV — pass through
  if (blob.type.toLowerCase().includes("wav")) return blob;
  const arrayBuffer = await blob.arrayBuffer();
  const AudioContextClass =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error("Audio conversion is not supported in this browser.");
  }
  const ctx = new AudioContextClass();
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    return audioBufferToWavBlob(audioBuffer);
  } finally {
    void ctx.close().catch(() => undefined);
  }
}

function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
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
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isStructuring, setIsStructuring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [notes, setNotes] = useState<StructuredNotes | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      try {
        const mimeType = recorder.mimeType || "audio/webm";
        const rawBlob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];

        if (rawBlob.size === 0) {
          throw new Error("Recording was empty. Please try again.");
        }
        if (rawBlob.size > MAX_FILE_BYTES) {
          throw new Error("Recording exceeds the 25MB limit.");
        }

        const wavBlob = await blobToWavBlob(rawBlob);
        if (wavBlob.size > MAX_FILE_BYTES) {
          throw new Error(
            "Converted WAV exceeds the 25MB limit. Try a shorter recording."
          );
        }

        const baseName = title.trim() || "lecture";
        const form = new FormData();
        form.append("audio", wavBlob, `${baseName}.wav`);

        const res = await fetch("/api/transcribe", {
          method: "POST",
          body: form,
        });
        const data = (await res.json()) as {
          transcript?: string;
          error?: string;
        };
        if (!res.ok) {
          throw new Error(data.error ?? "Transcription failed.");
        }
        if (!data.transcript) {
          throw new Error("Transcription returned no text.");
        }
        setTranscript(data.transcript);
        setNotes(null);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Transcription failed."
        );
      } finally {
        setIsTranscribing(false);
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        recorderRef.current = null;
      }
    },
    [title]
  );

  const startRecording = useCallback(async () => {
    setError(null);
    setSaveWarning(null);
    setTranscript("");
    setNotes(null);
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
        audio: true,
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
            const recorder = recorderRef.current;
            if (recorder && recorder.state !== "inactive") {
              recorder.stop();
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
      setNotes(parsed);
      onResult?.({
        title: effectiveTitle,
        transcript: transcript.trim(),
        notes: parsed,
        persisted,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to structure notes."
      );
    } finally {
      setIsStructuring(false);
    }
  }, [transcript, title, onResult]);

  const busy = isTranscribing || isStructuring;

  return (
    <section
      aria-label="Lecture recorder"
      className="w-full rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <div className="mb-4">
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
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none disabled:opacity-60"
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {!isRecording ? (
          <button
            type="button"
            onClick={() => void startRecording()}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Mic className="h-4 w-4" aria-hidden />
            Start Recording
          </button>
        ) : (
          <button
            type="button"
            onClick={stopRecording}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-red-500"
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
              {elapsed >= MAX_RECORDING_SECONDS - 30
                ? " (stops automatically at 5:00)"
                : null}
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
        Max {formatElapsed(MAX_RECORDING_SECONDS)} per take — keeps
        transcriptions fast and within the free-tier audio budget.
      </p>

      {error ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
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
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Raw transcript
          </h3>
          <p className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg bg-zinc-50 px-3 py-2.5 text-sm leading-7 text-zinc-800">
            {transcript}
          </p>
          <button
            type="button"
            onClick={() => void structureNotes()}
            disabled={busy || !transcript.trim()}
            className="mt-3 inline-flex items-center justify-center gap-2 rounded-full border border-zinc-900 px-5 py-2.5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
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

      {notes ? (
        <div className="mt-5 border-t border-zinc-100 pt-4">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Structured notes
          </h3>
          {notes.headings.length > 0 ? (
            <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-zinc-800">
              {notes.headings.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          ) : null}
          {notes.definitions.length > 0 ? (
            <dl className="mb-3 space-y-2">
              {notes.definitions.map((d) => (
                <div key={d.term} className="text-sm">
                  <dt className="font-semibold text-zinc-900">{d.term}</dt>
                  <dd className="text-zinc-700">{d.definition}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {notes.flashcards.length > 0 ? (
            <ul className="space-y-2">
              {notes.flashcards.map((f, i) => (
                <li
                  key={`${f.question}-${i}`}
                  className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-800"
                >
                  <span className="font-medium">Q: {f.question}</span>
                  <br />
                  <span className="text-zinc-600">A: {f.answer}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

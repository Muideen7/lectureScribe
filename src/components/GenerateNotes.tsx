"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";

interface GenerateNotesProps {
  title: string;
  course?: string;
  transcript: string;
  language?: string | null;
  duration?: number | null;
}

/**
 * Builds notes for a lecture that was saved without them.
 *
 * Calls the same `POST /api/structure` the recorder uses, which saves a *new*
 * lecture document rather than updating this one — the transcript stays the
 * source of truth and history is preserved. On success the page reloads so the
 * server component picks up the fresh notes.
 */
export default function GenerateNotes({
  title,
  course,
  transcript,
  language,
  duration,
}: GenerateNotesProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          transcript,
          course: course || undefined,
          language: language ?? undefined,
          duration: duration ?? undefined,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to generate notes.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate notes.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => void generate()}
        disabled={busy || !transcript.trim()}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Sparkles className="h-4 w-4" aria-hidden />
        )}
        {busy ? "Generating…" : "Generate notes"}
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

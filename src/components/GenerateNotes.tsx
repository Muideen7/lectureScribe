"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";

interface GenerateNotesProps {
  /** Mongo id of the lecture to annotate. Must be present for an in-place update. */
  lectureId?: string;
  title: string;
  course?: string;
  transcript: string;
  language?: string | null;
  duration?: number | null;
}

/**
 * Builds notes for a lecture that was saved without them.
 *
 * Calls the same `POST /api/structure` the recorder uses, passing this
 * lecture's id so the notes are attached to *this* document. Without the id the
 * route would insert a second lecture and the page below would still show no
 * notes, so every click would spend a request and leave a duplicate behind.
 *
 * The transcript stays the source of truth: the update only replaces the notes
 * (and refreshes the embedding so search covers them immediately). On success
 * the page refreshes so the server component picks up the fresh notes.
 */
export default function GenerateNotes({
  lectureId,
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
          id: lectureId,
          title,
          transcript,
          course: course || undefined,
          language: language ?? undefined,
          duration: duration ?? undefined,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        id?: string;
        persisted?: boolean;
        warning?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to generate notes.");
      }
      // The notes were produced but not written back — say so instead of
      // refreshing into a page that looks unchanged.
      if (data.persisted === false) {
        throw new Error(
          data.warning ?? "Notes generated but not saved to your library."
        );
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

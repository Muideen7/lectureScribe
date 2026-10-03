"use client";

import type { StructuredNotes } from "@/lib/db";
import { formatElapsed } from "@/lib/transcribe";
import Flashcards from "@/components/Flashcards";

interface TranscriptViewerProps {
  title?: string;
  transcript: string;
  notes: StructuredNotes;
  language?: string | null;
  duration?: number | null;
}

export default function TranscriptViewer({
  title,
  transcript,
  notes,
  language,
  duration,
}: TranscriptViewerProps) {
  return (
    <section aria-label="Lecture transcript and notes" className="w-full">
      {title ? (
        <div className="mb-4">
          <h2 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
            {title}
          </h2>
          {language || duration ? (
            <p className="mt-1 text-xs uppercase tracking-wider text-zinc-400">
              {language ? `Transcribed as ${language}` : null}
              {language && duration ? " · " : null}
              {duration ? formatElapsed(duration) : null}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Raw transcript — left */}
        <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Raw transcript
          </h2>
          <p className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-7 text-zinc-800 md:max-h-none md:overflow-visible sm:text-[15px]">
            {transcript || (
              <span className="text-zinc-400">No transcript yet.</span>
            )}
          </p>
        </article>

        {/* Structured notes — right */}
        <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Structured notes
          </h2>

          {notes.headings.length > 0 ? (
            <div className="mb-5">
              {notes.headings.map((heading, i) => (
                <h3
                  key={`${heading}-${i}`}
                  className="mb-2 text-base font-semibold text-zinc-900"
                >
                  {heading}
                </h3>
              ))}
            </div>
          ) : (
            <p className="mb-5 text-sm text-zinc-400">No headings.</p>
          )}

          <div className="mb-5">
            <h3 className="mb-2 text-sm font-semibold text-zinc-700">
              Definitions
            </h3>
            {notes.definitions.length > 0 ? (
              <dl className="space-y-3">
                {notes.definitions.map((def, i) => (
                  <div
                    key={`${def.term}-${i}`}
                    className="rounded-lg bg-zinc-50 px-3 py-2"
                  >
                    <dt className="text-sm font-semibold text-zinc-900">
                      {def.term}
                    </dt>
                    <dd className="mt-0.5 text-sm leading-6 text-zinc-700">
                      {def.definition}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-zinc-400">No definitions.</p>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-zinc-700">
              Flashcards
            </h3>
            <Flashcards cards={notes.flashcards} />
          </div>
        </article>
      </div>
    </section>
  );
}

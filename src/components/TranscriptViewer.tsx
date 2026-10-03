"use client";

import { useState } from "react";
import type { StructuredNotes } from "@/lib/db";

interface TranscriptViewerProps {
  title?: string;
  transcript: string;
  notes: StructuredNotes;
}

export default function TranscriptViewer({
  title,
  transcript,
  notes,
}: TranscriptViewerProps) {
  const [flipped, setFlipped] = useState<Set<number>>(new Set());

  function toggleCard(index: number) {
    setFlipped((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  return (
    <section aria-label="Lecture transcript and notes" className="w-full">
      {title ? (
        <h2 className="mb-4 text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
          {title}
        </h2>
      ) : null}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Raw transcript — left */}
        <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Raw transcript
          </h2>
          <p className="whitespace-pre-wrap text-sm leading-7 text-zinc-800 sm:text-[15px]">
            {transcript || (
              <span className="text-zinc-400">No transcript yet.</span>
            )}
          </p>
        </article>

        {/* Structured notes — right */}
        <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Structured notes
          </h2>

          {notes.headings.length > 0 ? (
            <div className="mb-5">
              {notes.headings.map((heading) => (
                <h3
                  key={heading}
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
                {notes.definitions.map((def) => (
                  <div
                    key={def.term}
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
            {notes.flashcards.length > 0 ? (
              <div className="grid grid-cols-1 gap-3">
                {notes.flashcards.map((card, i) => {
                  const isFlipped = flipped.has(i);
                  return (
                    <button
                      key={`${card.question}-${i}`}
                      type="button"
                      onClick={() => toggleCard(i)}
                      aria-pressed={isFlipped}
                      aria-label={`Flashcard ${i + 1}: ${card.question}. Activate to ${isFlipped ? "show question" : "show answer"}.`}
                      className="flashcard h-32 cursor-pointer text-left"
                    >
                      <span
                        className="flashcard-inner"
                        data-flipped={isFlipped ? "true" : undefined}
                      >
                        <span className="flashcard-front">
                          <span className="px-4 text-center text-sm font-medium">
                            {card.question}
                          </span>
                        </span>
                        <span className="flashcard-back">
                          <span className="px-4 text-center text-sm">
                            {card.answer}
                          </span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-zinc-400">No flashcards.</p>
            )}
            <p className="mt-2 text-xs text-zinc-400">
              Hover, focus, or tap a card to flip it.
            </p>
          </div>
        </article>
      </div>
    </section>
  );
}

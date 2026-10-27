"use client";

import { useState } from "react";
import {
  BookOpen,
  Check,
  Clock,
  Copy,
  Download,
  Languages,
  Layers,
  Sparkles,
} from "lucide-react";
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
  const [copiedTranscript, setCopiedTranscript] = useState(false);
  const [copiedNotes, setCopiedNotes] = useState(false);

  function copyTranscript() {
    if (!transcript) return;
    void navigator.clipboard.writeText(transcript);
    setCopiedTranscript(true);
    setTimeout(() => setCopiedTranscript(false), 2000);
  }

  function exportMarkdown() {
    const lines = [
      `# ${title || "Lecture Notes"}`,
      "",
      language ? `**Language:** ${language.toUpperCase()}` : "",
      duration ? `**Duration:** ${formatElapsed(duration)}` : "",
      "",
      "## Key Sections",
      ...notes.headings.map((h, i) => `${i + 1}. ${h}`),
      "",
      "## Definitions",
      ...notes.definitions.map((d) => `### ${d.term}\n${d.definition}\n`),
      "",
      "## Flashcards",
      ...notes.flashcards.map(
        (f, i) => `**Q${i + 1}: ${f.question}**\nA: ${f.answer}\n`
      ),
      "",
      "## Raw Transcript",
      transcript,
    ]
      .filter(Boolean)
      .join("\n");

    const blob = new Blob([lines], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(title || "lecture-notes").toLowerCase().replace(/\s+/g, "-")}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function copyAllNotes() {
    const text = [
      title || "Lecture Notes",
      "",
      "KEY SECTIONS:",
      ...notes.headings.map((h, i) => `${i + 1}. ${h}`),
      "",
      "DEFINITIONS:",
      ...notes.definitions.map((d) => `${d.term}: ${d.definition}`),
      "",
      "FLASHCARDS:",
      ...notes.flashcards.map((f, i) => `Q${i + 1}: ${f.question} | A: ${f.answer}`),
    ].join("\n");

    void navigator.clipboard.writeText(text);
    setCopiedNotes(true);
    setTimeout(() => setCopiedNotes(false), 2000);
  }

  const wordCount = transcript.trim() ? transcript.trim().split(/\s+/).length : 0;

  return (
    <section aria-label="Lecture transcript and notes" className="w-full space-y-5">
      {/* Title & Metadata Header */}
      <div className="flex flex-col justify-between gap-3 rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            AI Study Digest
          </span>
          <h2 className="text-xl font-bold tracking-tight text-stone-900 sm:text-2xl dark:text-white">
            {title || "Lecture Notes"}
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-stone-500 dark:text-zinc-400">
            {language ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 px-2 py-0.5 font-medium dark:bg-zinc-800">
                <Languages className="h-3 w-3 text-stone-400" aria-hidden />
                {language.toUpperCase()}
              </span>
            ) : null}
            {duration ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 px-2 py-0.5 font-medium dark:bg-zinc-800">
                <Clock className="h-3 w-3 text-stone-400" aria-hidden />
                {formatElapsed(duration)}
              </span>
            ) : null}
            <span>{wordCount} words</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={copyAllNotes}
            className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            {copiedNotes ? (
              <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden />
            )}
            {copiedNotes ? "Notes Copied!" : "Copy Notes"}
          </button>
          <button
            type="button"
            onClick={exportMarkdown}
            className="inline-flex items-center gap-1.5 rounded-full bg-stone-900 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-stone-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Export (.md)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: Raw Transcript */}
        <article className="flex flex-col rounded-3xl border border-stone-200/90 bg-white p-5 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-3.5 flex items-center justify-between border-b border-stone-100 pb-3 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-100 text-stone-700 dark:bg-zinc-800 dark:text-zinc-300">
                <BookOpen className="h-3.5 w-3.5" aria-hidden />
              </span>
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-zinc-300">
                Full Transcript
              </h3>
            </div>
            <button
              type="button"
              onClick={copyTranscript}
              className="inline-flex items-center gap-1 text-xs text-stone-500 hover:text-stone-900 dark:text-zinc-400 dark:hover:text-white"
            >
              <Copy className="h-3 w-3" aria-hidden />
              {copiedTranscript ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="max-h-[34rem] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-7 text-stone-800 selection:bg-emerald-100 dark:text-zinc-200">
            {transcript || (
              <span className="text-stone-400">No transcript available.</span>
            )}
          </p>
        </article>

        {/* Right: AI Structured Study Guide */}
        <article className="flex flex-col gap-6 rounded-3xl border border-stone-200/90 bg-white p-5 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
          {/* Key Sections */}
          <div>
            <div className="mb-3 flex items-center gap-2 border-b border-stone-100 pb-2.5 dark:border-zinc-800">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                <Layers className="h-3.5 w-3.5" aria-hidden />
              </span>
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-zinc-300">
                Key Topics & Headings
              </h3>
            </div>

            {notes.headings.length > 0 ? (
              <ol className="space-y-2">
                {notes.headings.map((heading, i) => (
                  <li
                    key={`${heading}-${i}`}
                    className="flex items-start gap-2.5 rounded-xl bg-stone-50/80 p-2.5 text-sm text-stone-800 dark:bg-zinc-800/50 dark:text-zinc-200"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-[11px] font-bold text-white shadow-sm">
                      {i + 1}
                    </span>
                    <span className="font-medium leading-snug">{heading}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-stone-400">No headings generated.</p>
            )}
          </div>

          {/* Definitions */}
          <div>
            <div className="mb-3 flex items-center gap-2 border-b border-stone-100 pb-2.5 dark:border-zinc-800">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-400">
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
              </span>
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-zinc-300">
                Glossary & Definitions
              </h3>
            </div>

            {notes.definitions.length > 0 ? (
              <dl className="grid gap-2.5">
                {notes.definitions.map((def, i) => (
                  <div
                    key={`${def.term}-${i}`}
                    className="rounded-xl border border-stone-200/70 bg-stone-50/50 p-3 transition hover:border-emerald-300 dark:border-zinc-800 dark:bg-zinc-800/40"
                  >
                    <dt className="text-sm font-bold text-emerald-800 dark:text-emerald-400">
                      {def.term}
                    </dt>
                    <dd className="mt-1 text-xs leading-relaxed text-stone-700 sm:text-sm dark:text-zinc-300">
                      {def.definition}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-xs text-stone-400">No definitions generated.</p>
            )}
          </div>

          {/* Flashcards */}
          <div>
            <div className="mb-3 flex items-center justify-between border-b border-stone-100 pb-2.5 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                </span>
                <h3 className="text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-zinc-300">
                  Interactive 3D Flashcards
                </h3>
              </div>
              <span className="text-xs font-semibold text-stone-400">
                {notes.flashcards.length} cards
              </span>
            </div>

            <Flashcards cards={notes.flashcards} />
          </div>
        </article>
      </div>
    </section>
  );
}

import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, BookOpen, Clock, Languages, Layers, Sparkles } from "lucide-react";
import { getLectureById, hasNotes } from "@/lib/db";
import { OWNER_COOKIE, verifyOwnerToken } from "@/lib/identity";
import { formatElapsed } from "@/lib/transcribe";
import Flashcards from "@/components/Flashcards";
import GenerateNotes from "@/components/GenerateNotes";
import Header from "@/components/Header";

/**
 * Lectures are private per visitor, so nothing here may be prerendered or
 * cached — the id alone must not be enough to read a lecture.
 */
export const dynamic = "force-dynamic";

type LecturePageProps = {
  params: Promise<{ id: string }>;
};

const dateFormatter = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Lagos",
});

async function loadLecture(id: string) {
  const cookieStore = await cookies();
  const ownerId = verifyOwnerToken(cookieStore.get(OWNER_COOKIE)?.value);
  // No owner means no access, rather than a redirect loop on a public page.
  if (!ownerId) return null;
  return getLectureById(id, ownerId);
}

export async function generateMetadata({
  params,
}: LecturePageProps): Promise<Metadata> {
  const { id } = await params;
  const lecture = await loadLecture(id);
  if (!lecture) return { title: "Lecture not found — LectureScribe" };
  return {
    title: `${lecture.title} — LectureScribe`,
    description: lecture.notes.headings.slice(0, 3).join(" · ") || undefined,
  };
}

export default async function LecturePage({ params }: LecturePageProps) {
  const { id } = await params;
  const lecture = await loadLecture(id);

  // Wrong owner and missing lecture are indistinguishable on purpose: a 404
  // here must not confirm that someone else's id exists.
  if (!lecture) notFound();

  const notesReady = hasNotes(lecture);

  return (
    <div className="flex min-h-dvh flex-col bg-stone-50/60 text-stone-900 transition-colors dark:bg-zinc-950 dark:text-zinc-100">
      <Header />

      <main className="safe-area mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 py-6 pb-12 sm:py-8">
        {/* Navigation Breadcrumb */}
        <div>
          <Link
            href="/"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3.5 text-xs font-semibold text-stone-600 shadow-sm transition hover:bg-stone-50 hover:text-stone-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Back to Library
          </Link>
        </div>

        {/* Title Header Card */}
        <div className="rounded-3xl border border-stone-200/80 bg-white p-6 shadow-xl sm:p-8 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-wrap items-center gap-2">
            {lecture.course ? (
              <span className="rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                {lecture.course}
              </span>
            ) : null}
            <span className="rounded-md bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600 dark:bg-zinc-800 dark:text-zinc-400">
              {dateFormatter.format(lecture.createdAt)}
            </span>
            {lecture.language ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600 dark:bg-zinc-800 dark:text-zinc-400">
                <Languages className="h-3 w-3 text-stone-400" aria-hidden />
                {lecture.language.toUpperCase()}
              </span>
            ) : null}
            {lecture.duration ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600 dark:bg-zinc-800 dark:text-zinc-400">
                <Clock className="h-3 w-3 text-stone-400" aria-hidden />
                {formatElapsed(lecture.duration)}
              </span>
            ) : null}
          </div>

          <h1 className="mt-3 text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl md:text-4xl dark:text-white">
            {lecture.title}
          </h1>
        </div>

        {!notesReady ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
            <h2 className="font-bold">No study notes yet</h2>
            <p className="mt-1 text-xs leading-relaxed sm:text-sm">
              This lecture was saved without structured notes. Generate them
              from the transcript below — it costs one request.
            </p>
            <div className="mt-3">
              <GenerateNotes
                lectureId={lecture._id}
                title={lecture.title}
                course={lecture.course}
                transcript={lecture.rawTranscript}
                language={lecture.language}
                duration={lecture.duration}
              />
            </div>
          </section>
        ) : null}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Left: Raw Transcript */}
          <article className="rounded-3xl border border-stone-200/90 bg-white p-5 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-3.5 flex items-center gap-2 border-b border-stone-100 pb-3 dark:border-zinc-800">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-100 text-stone-700 dark:bg-zinc-800 dark:text-zinc-300">
                <BookOpen className="h-3.5 w-3.5" aria-hidden />
              </span>
              <h2 className="text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-zinc-400">
                Full Audio Transcript
              </h2>
            </div>
            <p className="max-h-[32rem] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-7 text-stone-800 selection:bg-emerald-100 lg:max-h-[40rem] sm:text-[15px] dark:text-zinc-200">
              {lecture.rawTranscript}
            </p>
          </article>

          {/* Right: Study Guide Notes */}
          <div className="flex flex-col gap-6">
            <article className="rounded-3xl border border-stone-200/90 bg-white p-5 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-3 flex items-center gap-2 border-b border-stone-100 pb-2.5 dark:border-zinc-800">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                  <Layers className="h-3.5 w-3.5" aria-hidden />
                </span>
                <h2 className="text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-zinc-400">
                  Key Topics
                </h2>
              </div>
              {lecture.notes.headings.length > 0 ? (
                <ol className="space-y-2">
                  {lecture.notes.headings.map((heading, i) => (
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
                <p className="text-xs text-stone-400">No headings.</p>
              )}
            </article>

            <article className="rounded-3xl border border-stone-200/90 bg-white p-5 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-3 flex items-center gap-2 border-b border-stone-100 pb-2.5 dark:border-zinc-800">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-400">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                </span>
                <h2 className="text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-zinc-400">
                  Definitions & Vocabulary
                </h2>
              </div>
              {lecture.notes.definitions.length > 0 ? (
                <dl className="grid gap-2.5">
                  {lecture.notes.definitions.map((def, i) => (
                    <div
                      key={`${def.term}-${i}`}
                      className="rounded-xl border border-stone-200/70 bg-stone-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-800/40"
                    >
                      <dt className="text-sm font-bold text-emerald-800 dark:text-emerald-400">
                        {def.term}
                      </dt>
                      <dd className="mt-0.5 text-xs leading-relaxed text-stone-700 sm:text-sm dark:text-zinc-300">
                        {def.definition}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-xs text-stone-400">No definitions.</p>
              )}
            </article>

            <article className="rounded-3xl border border-stone-200/90 bg-white p-5 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mb-3 flex items-center justify-between border-b border-stone-100 pb-2.5 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-zinc-400">
                    Flashcards
                  </h2>
                </div>
                <span className="text-xs font-semibold text-stone-400">
                  {lecture.notes.flashcards.length} cards
                </span>
              </div>
              <Flashcards cards={lecture.notes.flashcards} />
            </article>
          </div>
        </div>
      </main>
    </div>
  );
}

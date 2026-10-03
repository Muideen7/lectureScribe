import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Clock, Languages } from "lucide-react";
import { getLectureById, hasNotes } from "@/lib/db";
import { OWNER_COOKIE, verifyOwnerToken } from "@/lib/identity";
import { formatElapsed } from "@/lib/transcribe";
import Flashcards from "@/components/Flashcards";
import GenerateNotes from "@/components/GenerateNotes";

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
    <div className="min-h-dvh bg-stone-50 text-zinc-900">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="safe-area mx-auto flex w-full max-w-4xl items-center gap-3 py-3">
          <Link
            href="/"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-2 text-sm text-zinc-600 hover:bg-zinc-100"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            All lectures
          </Link>
        </div>
      </header>

      <main className="safe-area mx-auto flex w-full max-w-4xl flex-col gap-6 py-6 pb-10 sm:py-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
            {lecture.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
            {lecture.course ? (
              <span className="font-medium text-zinc-700">
                {lecture.course}
              </span>
            ) : null}
            <span>{dateFormatter.format(lecture.createdAt)}</span>
            {lecture.language ? (
              <span className="inline-flex items-center gap-1">
                <Languages className="h-3.5 w-3.5" aria-hidden />
                {lecture.language.toUpperCase()}
              </span>
            ) : null}
            {lecture.duration ? (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" aria-hidden />
                {formatElapsed(lecture.duration)}
              </span>
            ) : null}
          </div>
        </div>

        {!notesReady ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            <h2 className="font-semibold">No study notes yet</h2>
            <p className="mt-1">
              This lecture was saved without structured notes. Generate them
              from the transcript below — it costs one request.
            </p>
            <GenerateNotes
              title={lecture.title}
              course={lecture.course}
              transcript={lecture.rawTranscript}
              language={lecture.language}
              duration={lecture.duration}
            />
          </section>
        ) : null}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
              Raw transcript
            </h2>
            <p className="max-h-[28rem] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-7 text-zinc-800 md:max-h-[36rem] sm:text-[15px]">
              {lecture.rawTranscript}
            </p>
          </article>

          <div className="flex flex-col gap-6">
            <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
                Key sections
              </h2>
              {lecture.notes.headings.length > 0 ? (
                <ol className="space-y-2">
                  {lecture.notes.headings.map((heading, i) => (
                    <li key={`${heading}-${i}`} className="flex gap-2 text-sm">
                      <span className="font-semibold tabular-nums text-zinc-400">
                        {i + 1}.
                      </span>
                      <span className="text-zinc-800">{heading}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-zinc-400">No headings.</p>
              )}
            </article>

            <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
                Definitions
              </h2>
              {lecture.notes.definitions.length > 0 ? (
                <dl className="space-y-3">
                  {lecture.notes.definitions.map((def, i) => (
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
            </article>

            <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
                Flashcards
              </h2>
              <Flashcards cards={lecture.notes.flashcards} />
            </article>
          </div>
        </div>
      </main>
    </div>
  );
}

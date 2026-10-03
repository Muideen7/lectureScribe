import { BookOpenText, GraduationCap } from "lucide-react";
import StudySection from "@/components/StudySection";

export default function Home() {
  return (
    <div className="min-h-screen bg-stone-50 text-zinc-900">
      <header className="border-b border-stone-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-3 px-4 py-5 sm:px-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 text-white">
            <GraduationCap className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
              LectureScribe
            </p>
            <h1 className="font-serif text-xl font-semibold leading-tight sm:text-2xl">
              From lecture audio to study notes
            </h1>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
        <div className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-amber-50 p-4 text-sm leading-6 text-stone-700">
          <BookOpenText
            className="mt-0.5 h-5 w-5 shrink-0 text-stone-500"
            aria-hidden
          />
          <p>
            Record a lecture with your microphone — up to 5 minutes per take.
            We transcribe it with Groq Whisper, then structure it into
            headings, definitions, and flashcards. Best in a quiet room.
          </p>
        </div>

        <StudySection />
      </main>

      <footer className="border-t border-stone-200 bg-white">
        <p className="mx-auto w-full max-w-4xl px-4 py-5 text-center text-xs text-zinc-400 sm:px-6">
          LectureScribe — record, transcribe, and revise. Audio stays in your
          browser until you submit it for transcription.
        </p>
      </footer>
    </div>
  );
}

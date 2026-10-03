import { BookOpenText, GraduationCap } from "lucide-react";
import InstallPrompt from "@/components/InstallPrompt";
import StudySection from "@/components/StudySection";

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col bg-stone-50 text-zinc-900">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="safe-area mx-auto flex w-full max-w-4xl items-center gap-3 py-3 sm:py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-white sm:h-10 sm:w-10">
            <GraduationCap className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[0.625rem] font-semibold uppercase tracking-[0.2em] text-zinc-500 sm:text-xs">
              LectureScribe
            </p>
            <h1 className="font-serif text-lg font-semibold leading-tight sm:text-2xl">
              From lecture audio to study notes
            </h1>
          </div>
        </div>
      </header>

      <main className="safe-area mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 py-6 sm:gap-8 sm:py-8">
        <div className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-amber-50 p-4 text-sm leading-6 text-stone-700">
          <BookOpenText
            className="mt-0.5 h-5 w-5 shrink-0 text-stone-500"
            aria-hidden
          />
          <p>
            Record a lecture with your microphone — up to 5 minutes per take.
            Pick the language being spoken so Nigerian English, Pidgin, Yorùbá,
            Igbo and Hausa transcribe accurately. Best in a quiet room.
          </p>
        </div>

        <InstallPrompt />

        <StudySection />
      </main>

      <footer className="border-t border-stone-200 bg-white">
        <p className="safe-area mx-auto w-full max-w-4xl py-4 text-center text-xs leading-5 text-zinc-400">
          LectureScribe — record, transcribe, and revise. Audio stays in your
          browser until you submit it for transcription. Saved lectures are
          private to this browser.
        </p>
      </footer>
    </div>
  );
}

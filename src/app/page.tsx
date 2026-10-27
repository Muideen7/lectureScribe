import {
  AudioLines,
  BookOpenText,
  Languages,
  Mic,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Header from "@/components/Header";
import InstallPrompt from "@/components/InstallPrompt";
import StudySection from "@/components/StudySection";

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col bg-stone-50/60 text-stone-900 transition-colors dark:bg-zinc-950 dark:text-zinc-100">
      <Header />

      <main className="safe-area mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 py-6 sm:py-10">
        {/* Hero Section */}
        <div className="relative overflow-hidden rounded-3xl border border-stone-200/80 bg-gradient-to-b from-white via-white to-stone-50/50 p-6 shadow-xl sm:p-10 dark:border-zinc-800 dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-950">
          {/* Ambient decorative glow */}
          <div
            className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full bg-emerald-500/15 blur-3xl"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -bottom-20 -right-20 h-72 w-72 rounded-full bg-teal-500/15 blur-3xl"
            aria-hidden="true"
          />

          <div className="relative z-10 max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/80 bg-emerald-50/80 px-3.5 py-1 text-xs font-semibold text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/60 dark:text-emerald-300">
              <Sparkles className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
              <span>Whisper Speech AI & 3D Interactive Revision</span>
            </div>

            <h1 className="mt-4 font-sans text-3xl font-extrabold tracking-tight text-stone-900 sm:text-4xl md:text-5xl dark:text-white">
              Turn Classroom Audio into{" "}
              <span className="bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">
                Study Notes & Flashcards
              </span>
            </h1>

            <p className="mt-3.5 text-sm leading-relaxed text-stone-600 sm:text-base dark:text-zinc-300">
              Record lectures directly from your phone or laptop. Tuned for{" "}
              <strong className="font-semibold text-stone-800 dark:text-white">
                Nigerian English, Pidgin, Yorùbá, Igbo, and Hausa
              </strong>
              . Instant AI definitions, structured outlines, and flip flashcards
              to ace your exams.
            </p>

            {/* Feature Pills */}
            <div className="mt-6 flex flex-wrap gap-2 text-xs font-medium text-stone-600 dark:text-zinc-400">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1 shadow-sm dark:border-zinc-800 dark:bg-zinc-800/80 dark:text-zinc-300">
                <Mic className="h-3 w-3 text-emerald-600" aria-hidden />
                5-Min Microphone Takes
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1 shadow-sm dark:border-zinc-800 dark:bg-zinc-800/80 dark:text-zinc-300">
                <Languages className="h-3 w-3 text-emerald-600" aria-hidden />
                Multilingual Voice Models
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1 shadow-sm dark:border-zinc-800 dark:bg-zinc-800/80 dark:text-zinc-300">
                <AudioLines className="h-3 w-3 text-emerald-600" aria-hidden />
                Custom Course Vocabulary
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1 shadow-sm dark:border-zinc-800 dark:bg-zinc-800/80 dark:text-zinc-300">
                <ShieldCheck className="h-3 w-3 text-emerald-600" aria-hidden />
                Private to Your Account
              </span>
            </div>
          </div>
        </div>

        {/* Tip Box */}
        <div className="flex items-start gap-3.5 rounded-2xl border border-amber-200/90 bg-amber-50/70 p-4 text-xs leading-relaxed text-amber-900 shadow-sm sm:text-sm dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          <BookOpenText
            className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400"
            aria-hidden
          />
          <div>
            <span className="font-bold">Microphone tip for best results:</span>{" "}
            Place your phone or laptop on your lecture desk facing the lecturer.
            If your professor mixes Pidgin or local phrases, pick your dialect
            in the dropdown so the transcription engine biases for it.
          </div>
        </div>

        <InstallPrompt />

        <StudySection />
      </main>

      <footer className="mt-auto border-t border-stone-200/80 bg-white/70 py-6 text-center text-xs text-stone-500 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/70 dark:text-zinc-500">
        <div className="safe-area safe-area-bottom mx-auto max-w-5xl space-y-1.5">
          <p className="font-medium text-stone-600 dark:text-zinc-400">
            LectureScribe — Record, Transcribe, and Revise.
          </p>
          <p>
            Guest recordings stay in your browser until submitted for transcription.
            Sign in with email and password to keep your study library saved across devices.
          </p>
        </div>
      </footer>
    </div>
  );
}

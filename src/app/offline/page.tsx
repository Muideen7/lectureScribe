import Link from "next/link";
import { CloudOff } from "lucide-react";

export const metadata = {
  title: "You're offline — LectureScribe",
};

export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <CloudOff className="h-10 w-10 text-zinc-400" aria-hidden />
      <h1 className="text-xl font-semibold text-zinc-900">
        You&apos;re offline
      </h1>
      <p className="max-w-sm text-sm leading-6 text-zinc-600">
        LectureScribe needs a connection to record and transcribe lectures.
        Reconnect and reload — anything you have already saved is still in your
        library.
      </p>
      <Link
        href="/"
        className="inline-flex min-h-11 items-center justify-center rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white"
      >
        Try again
      </Link>
    </div>
  );
}

"use client";

import { useState } from "react";
import AudioRecorder from "@/components/AudioRecorder";
import SearchBar from "@/components/SearchBar";
import TranscriptViewer from "@/components/TranscriptViewer";
import type { StructuredNotes } from "@/lib/db";

interface LectureResult {
  title: string;
  transcript: string;
  notes: StructuredNotes;
}

export default function StudySection() {
  const [result, setResult] = useState<LectureResult | null>(null);

  return (
    <div className="flex flex-col gap-8">
      <AudioRecorder onResult={(data) => setResult(data)} />

      {result ? (
        <TranscriptViewer
          title={result.title}
          transcript={result.transcript}
          notes={result.notes}
        />
      ) : (
        <p className="text-center text-sm text-zinc-400">
          Your transcript and structured notes will appear here after
          recording.
        </p>
      )}

      <SearchBar />
    </div>
  );
}

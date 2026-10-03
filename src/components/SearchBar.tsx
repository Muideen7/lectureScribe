"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ChevronRight,
  History,
  Loader2,
  Search,
} from "lucide-react";
import type { StructuredNotes } from "@/lib/db";

interface SearchHit {
  _id?: string;
  title: string;
  course?: string;
  language?: string | null;
  rawTranscript: string;
  notes: StructuredNotes;
  score: number;
  createdAt: string;
}

const dateFormatter = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeZone: "Africa/Lagos",
});

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : dateFormatter.format(date);
}

function snippet(text: string, max = 200): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

export default function SearchBar() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchHit[]>([]);
  const [searched, setSearched] = useState(false);

  async function onSearch(event?: FormEvent) {
    event?.preventDefault();
    if (!query.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
      });
      const data = (await res.json()) as {
        results?: SearchHit[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Search failed.");
      }
      setResults(Array.isArray(data.results) ? data.results : []);
      setSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      aria-label="Search past lectures"
      className="w-full rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6"
    >
      <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-900">
        <History className="h-4 w-4" aria-hidden />
        Past lectures
      </h2>
      <p className="mt-1 text-sm text-zinc-500">
        Search the lectures saved in this browser, by meaning rather than
        keywords. Tap a result to open it.
      </p>

      <form onSubmit={(e) => void onSearch(e)} className="mt-4 flex gap-2">
        <label htmlFor="lecture-search" className="sr-only">
          Search past lectures
        </label>
        <input
          id="lecture-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. how does photosynthesis work?"
          disabled={loading}
          className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2.5 text-base text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none disabled:opacity-60 sm:text-sm"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-zinc-900 px-4 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 sm:px-5"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Search className="h-4 w-4" aria-hidden />
          )}
          Search
        </button>
      </form>

      <div aria-live="polite">
        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </p>
        ) : null}

        {searched && !error && !loading ? (
          results.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {results.map((hit) => {
                const body = (
                  <>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-zinc-900">
                        {hit.title}
                        {hit.course ? (
                          <span className="ml-2 font-normal text-zinc-500">
                            {hit.course}
                          </span>
                        ) : null}
                      </p>
                      <span className="shrink-0 text-xs tabular-nums text-zinc-400">
                        {(hit.score * 100).toFixed(0)}% match
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
                      {hit.notes.headings.length > 0 ? (
                        <span className="min-w-0 truncate">
                          {hit.notes.headings.slice(0, 3).join(" · ")}
                        </span>
                      ) : (
                        <span className="font-medium text-amber-600">
                          No notes yet
                        </span>
                      )}
                      <span>{formatDate(hit.createdAt)}</span>
                    </div>
                    <p className="mt-1.5 text-sm leading-6 text-zinc-700">
                      {snippet(hit.rawTranscript)}
                    </p>
                  </>
                );

                return (
                  <li key={hit._id ?? `${hit.title}-${hit.score}`}>
                    {hit._id ? (
                      <Link
                        href={`/lectures/${hit._id}`}
                        className="block rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3 transition hover:border-zinc-300 hover:bg-white"
                      >
                        {body}
                        <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-zinc-500">
                          Open lecture
                          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                        </span>
                      </Link>
                    ) : (
                      <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3">
                        {body}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-zinc-400">
              No saved lectures match that query yet.
            </p>
          )
        ) : null}
      </div>
    </section>
  );
}

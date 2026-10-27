"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  BookOpen,
  ChevronRight,
  History,
  Loader2,
  Lock,
  Search,
} from "lucide-react";
import type { StructuredNotes } from "@/lib/db";
import { useAuth } from "@/components/AuthContext";
import { formatElapsed } from "@/lib/transcribe";

interface SearchHit {
  _id?: string;
  title: string;
  course?: string;
  language?: string | null;
  duration?: number | null;
  rawTranscript: string;
  notes: StructuredNotes;
  score?: number;
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

function snippet(text: string, max = 180): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

export default function SearchBar() {
  const { user, openAuthModal } = useAuth();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchHit[]>([]);
  const [searched, setSearched] = useState(false);
  const [savedLectures, setSavedLectures] = useState<SearchHit[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);

  // Fetch saved lectures when user is authenticated
  useEffect(() => {
    async function fetchLectures() {
      if (!user) {
        setSavedLectures([]);
        return;
      }
      setLoadingSaved(true);
      try {
        const res = await fetch("/api/lectures", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { lectures?: SearchHit[] };
          setSavedLectures(data.lectures ?? []);
        }
      } catch {
        // Degrade silently
      } finally {
        setLoadingSaved(false);
      }
    }
    void fetchLectures();
  }, [user]);

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
      className="relative overflow-hidden rounded-3xl border border-stone-200/90 bg-white p-5 shadow-xl transition-all sm:p-7 dark:border-zinc-800 dark:bg-zinc-900/95"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 pb-4 dark:border-zinc-800">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-400">
            <History className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-stone-900 dark:text-white">
              Study Library & Semantic Search
            </h2>
            <p className="text-xs text-stone-500 dark:text-zinc-400">
              Search lectures by meaning, concepts, and key terms
            </p>
          </div>
        </div>

        {user ? (
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
            {savedLectures.length} saved lectures
          </span>
        ) : null}
      </div>

      {/* Guest Notice */}
      {!user ? (
        <div className="mt-4 flex flex-col items-start justify-between gap-3 rounded-2xl border border-stone-200/80 bg-stone-50/80 p-4 sm:flex-row sm:items-center dark:border-zinc-800 dark:bg-zinc-800/40">
          <div className="flex items-center gap-2.5">
            <Lock className="h-4 w-4 text-stone-400 dark:text-zinc-500" aria-hidden />
            <p className="text-xs text-stone-600 dark:text-zinc-300">
              You are browsing in guest mode. Sign in to keep all your recordings
              in your library across your phone and laptop.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              openAuthModal(
                "Sign in with email and password to access your lecture library anywhere."
              )
            }
            className="shrink-0 rounded-full bg-stone-900 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-stone-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          >
            Sign In with Email
          </button>
        </div>
      ) : null}

      {/* Search Input Form */}
      <form onSubmit={(e) => void onSearch(e)} className="mt-5 flex gap-2">
        <label htmlFor="lecture-search" className="sr-only">
          Search past lectures
        </label>
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
            aria-hidden
          />
          <input
            id="lecture-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by concept (e.g. 'how does photosynthesis convert sunlight?')"
            disabled={loading}
            className="w-full rounded-xl border border-stone-300 bg-white py-3 pl-10 pr-4 text-sm text-stone-900 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder:text-zinc-500 dark:focus:border-emerald-500"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-stone-900 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Search className="h-4 w-4" aria-hidden />
          )}
          <span className="hidden sm:inline">Search Library</span>
        </button>
      </form>

      {/* Error alert */}
      <div aria-live="polite">
        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300 sm:text-sm"
          >
            {error}
          </p>
        ) : null}

        {/* Search Results */}
        {searched && !error && !loading ? (
          results.length > 0 ? (
            <div className="mt-5">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400">
                Search Results ({results.length} matches)
              </h3>
              <ul className="space-y-3">
                {results.map((hit) => {
                  const matchScore = typeof hit.score === "number" ? Math.round(hit.score * 100) : null;
                  return (
                    <li key={hit._id ?? `${hit.title}-${hit.score}`}>
                      {hit._id ? (
                        <Link
                          href={`/lectures/${hit._id}`}
                          className="block rounded-2xl border border-stone-200/80 bg-stone-50/60 p-4 transition hover:border-emerald-500 hover:bg-white hover:shadow-md dark:border-zinc-800 dark:bg-zinc-800/40 dark:hover:border-emerald-500 dark:hover:bg-zinc-800"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-stone-900 dark:text-white">
                                  {hit.title}
                                </span>
                                {hit.course ? (
                                  <span className="rounded-md bg-stone-200/70 px-2 py-0.5 text-xs font-semibold text-stone-700 dark:bg-zinc-700 dark:text-zinc-200">
                                    {hit.course}
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-stone-500 dark:text-zinc-400">
                                <span>{formatDate(hit.createdAt)}</span>
                                {hit.language ? (
                                  <span>{hit.language.toUpperCase()}</span>
                                ) : null}
                              </div>
                            </div>
                            {matchScore !== null ? (
                              <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                {matchScore}% match
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-2 text-xs leading-relaxed text-stone-600 sm:text-sm dark:text-zinc-300">
                            {snippet(hit.rawTranscript)}
                          </p>
                          <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
                            Open lecture & study flashcards
                            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                          </span>
                        </Link>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-dashed border-stone-200 p-6 text-center text-xs text-stone-500 dark:border-zinc-800 dark:text-zinc-400">
              No saved lectures match &quot;{query}&quot;. Try different keywords or record another lecture!
            </div>
          )
        ) : null}

        {/* Saved lectures list if not actively searching */}
        {!searched && user && (
          <div className="mt-6">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400">
              Your Saved Lectures
            </h3>
            {loadingSaved ? (
              <div className="flex items-center justify-center py-6 text-xs text-stone-400">
                <Loader2 className="mr-2 h-4 w-4 animate-spin text-emerald-600" />
                Loading your library…
              </div>
            ) : savedLectures.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {savedLectures.map((item) => (
                  <Link
                    key={item._id}
                    href={`/lectures/${item._id}`}
                    className="group rounded-2xl border border-stone-200/80 bg-stone-50/50 p-4 transition-all hover:border-emerald-500 hover:bg-white hover:shadow-md dark:border-zinc-800 dark:bg-zinc-800/40 dark:hover:border-emerald-500 dark:hover:bg-zinc-800"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-bold text-stone-900 transition group-hover:text-emerald-600 dark:text-white dark:group-hover:text-emerald-400">
                        {item.title}
                      </span>
                      {item.course ? (
                        <span className="rounded-md bg-stone-200/60 px-1.5 py-0.5 text-[11px] font-semibold text-stone-700 dark:bg-zinc-700 dark:text-zinc-300">
                          {item.course}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-1 flex items-center gap-3 text-xs text-stone-400 dark:text-zinc-500">
                      <span>{formatDate(item.createdAt)}</span>
                      {item.duration ? (
                        <span>{formatElapsed(item.duration)}</span>
                      ) : null}
                    </div>

                    <div className="mt-2.5 flex items-center justify-between text-xs">
                      <span className="text-stone-500 dark:text-zinc-400">
                        {item.notes?.flashcards?.length ?? 0} flashcards
                      </span>
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 group-hover:translate-x-0.5 transition-transform dark:text-emerald-400">
                        Study
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-stone-200 p-8 text-center text-xs text-stone-500 dark:border-zinc-800 dark:text-zinc-400">
                <BookOpen className="mx-auto mb-2 h-6 w-6 text-stone-300 dark:text-zinc-600" />
                <p className="font-semibold text-stone-700 dark:text-zinc-300">
                  No saved lectures yet
                </p>
                <p className="mt-1">
                  Record your first lecture in the studio above to build your study library!
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

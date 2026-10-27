"use client";

import Link from "next/link";
import { GraduationCap, LogIn, LogOut } from "lucide-react";
import { useAuth } from "@/components/AuthContext";

export default function Header() {
  const { user, openAuthModal, logout } = useAuth();

  return (
    <header className="sticky top-0 z-30 border-b border-stone-200/80 bg-white/80 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/85">
      <div className="safe-area safe-area-top mx-auto flex w-full max-w-5xl items-center justify-between py-3 sm:py-3.5">
        {/* Brand / Logo */}
        <Link href="/" className="group flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-600/20 transition-transform group-hover:scale-105">
            <GraduationCap className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-sans text-lg font-bold tracking-tight text-stone-900 sm:text-xl dark:text-white">
                LectureScribe
              </span>
              <span className="hidden rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 sm:inline-block dark:bg-emerald-950/50 dark:text-emerald-300">
                AI Studio
              </span>
            </div>
            <p className="hidden text-xs text-stone-500 sm:block dark:text-zinc-400">
              Audio to structured notes & flashcards
            </p>
          </div>
        </Link>

        {/* Right side Auth Controls */}
        <div className="flex items-center gap-2.5">
          {user ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 rounded-full border border-stone-200 bg-stone-50/80 py-1 pl-2.5 pr-3 text-xs text-stone-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">
                  {user.email.charAt(0).toUpperCase()}
                </span>
                <span className="max-w-[130px] truncate sm:max-w-[200px]">
                  {user.email}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void logout()}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-stone-200 px-3 text-xs font-medium text-stone-600 transition hover:bg-stone-100 hover:text-stone-900 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
                title="Sign out of account"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="hidden text-xs text-stone-400 md:inline">
                Guest Mode
              </span>
              <button
                type="button"
                onClick={() =>
                  openAuthModal(
                    "Sign in with your email & password to keep your recordings permanently."
                  )
                }
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-stone-900 px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-stone-800 hover:shadow dark:bg-emerald-600 dark:hover:bg-emerald-500"
              >
                <LogIn className="h-3.5 w-3.5" aria-hidden />
                Sign In
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

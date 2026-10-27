"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Eye, EyeOff, Loader2, Lock, Mail, Sparkles, X } from "lucide-react";
import { useAuth } from "@/components/AuthContext";

export default function AuthModal() {
  const { isAuthModalOpen, closeAuthModal, authModalReason, login, register } =
    useAuth();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Close on Escape key press while modal is open
  useEffect(() => {
    if (!isAuthModalOpen) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closeAuthModal();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isAuthModalOpen, closeAuthModal]);

  if (!isAuthModalOpen) return null;

  function handleModeChange(newMode: "login" | "signup") {
    setMode(newMode);
    setError(null);
  }

  function handleClose() {
    setError(null);
    closeAuthModal();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      if (mode === "login") {
        await login({ email: email.trim(), password });
      } else {
        await register({ email: email.trim(), password });
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop blur */}
      <div
        onClick={handleClose}
        className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm transition-opacity"
        aria-hidden="true"
      />

      {/* Modal Dialog Card */}
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-stone-200/80 bg-white p-6 shadow-2xl transition-all sm:p-8 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
        {/* Subtle top ambient glow */}
        <div
          className="pointer-events-none absolute -top-24 left-1/2 h-48 w-72 -translate-x-1/2 rounded-full bg-emerald-500/15 blur-3xl"
          aria-hidden="true"
        />

        {/* Close Button */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-4 top-4 rounded-full p-2 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          aria-label="Close dialog"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>

        {/* Modal Header */}
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-500/20">
            <Lock className="h-6 w-6" aria-hidden />
          </div>
          <h2
            id="auth-modal-title"
            className="text-xl font-bold tracking-tight text-stone-900 sm:text-2xl dark:text-white"
          >
            {mode === "login" ? "Sign In to LectureScribe" : "Create Your Account"}
          </h2>
          <p className="mt-1.5 text-xs leading-relaxed text-stone-500 sm:text-sm dark:text-zinc-400">
            {authModalReason ||
              (mode === "login"
                ? "Sign in to keep your recordings and access your lecture notes anywhere."
                : "Create an account with email & password to keep your lectures saved permanently.")}
          </p>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="mt-6 flex rounded-xl bg-stone-100 p-1 dark:bg-zinc-800">
          <button
            type="button"
            onClick={() => handleModeChange("login")}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold transition sm:text-sm ${
              mode === "login"
                ? "bg-white text-stone-900 shadow-sm dark:bg-zinc-900 dark:text-white"
                : "text-stone-500 hover:text-stone-900 dark:text-zinc-400 dark:hover:text-white"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => handleModeChange("signup")}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold transition sm:text-sm ${
              mode === "signup"
                ? "bg-white text-stone-900 shadow-sm dark:bg-zinc-900 dark:text-white"
                : "text-stone-500 hover:text-stone-900 dark:text-zinc-400 dark:hover:text-white"
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Form: Email & Password Options Only */}
        <form onSubmit={(e) => void handleSubmit(e)} className="mt-5 space-y-4">
          {error ? (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 sm:text-sm dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300"
            >
              {error}
            </div>
          ) : null}

          {/* Email Field */}
          <div>
            <label
              htmlFor="auth-email"
              className="block text-xs font-semibold text-stone-700 sm:text-sm dark:text-zinc-300"
            >
              Email Address
            </label>
            <div className="relative mt-1.5">
              <Mail
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400 dark:text-zinc-500"
                aria-hidden
              />
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@university.edu.ng"
                disabled={submitting}
                className="w-full rounded-xl border border-stone-300 bg-white py-2.5 pl-10 pr-4 text-sm text-stone-900 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder:text-zinc-500 dark:focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Password Field */}
          <div>
            <label
              htmlFor="auth-password"
              className="block text-xs font-semibold text-stone-700 sm:text-sm dark:text-zinc-300"
            >
              Password
            </label>
            <div className="relative mt-1.5">
              <Lock
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400 dark:text-zinc-500"
                aria-hidden
              />
              <input
                id="auth-password"
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={submitting}
                className="w-full rounded-xl border border-stone-300 bg-white py-2.5 pl-10 pr-11 text-sm text-stone-900 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder:text-zinc-500 dark:focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 dark:text-zinc-500 dark:hover:text-zinc-300"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden />
                )}
              </button>
            </div>
            {mode === "signup" ? (
              <p className="mt-1 text-[11px] text-stone-500 dark:text-zinc-400">
                Must be at least 6 characters long.
              </p>
            ) : null}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={submitting || !email.trim() || !password}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="h-4 w-4" aria-hidden />
            )}
            {submitting
              ? mode === "login"
                ? "Signing in…"
                : "Creating account…"
              : mode === "login"
              ? "Sign In"
              : "Create Free Account"}
          </button>
        </form>

        {/* Guest info badge */}
        <div className="mt-6 border-t border-stone-100 pt-4 text-center text-xs text-stone-400 dark:border-zinc-800 dark:text-zinc-500">
          <p>
            Guest recording & live AI notes are always free. An account keeps
            your revision library saved across your phones and computers.
          </p>
        </div>
      </div>
    </div>
  );
}

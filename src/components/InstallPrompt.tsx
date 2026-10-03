"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, Share, X } from "lucide-react";

/**
 * Minimal `BeforeInstallPromptEvent`, which is not in lib.dom yet.
 */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function getIsStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari reports standalone through the navigator instead.
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function subscribeDisplayMode(onChange: () => void): () => void {
  const query = window.matchMedia("(display-mode: standalone)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getIsIos(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS 13+ reports as Mac; touch points give it away.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** The user agent never changes, so there is nothing to subscribe to. */
function subscribeStatic(): () => void {
  return () => {};
}

/**
 * Install affordance.
 *
 * Chrome/Edge/Android fire `beforeinstallprompt`, which we stash and surface
 * as a button. iOS Safari has no equivalent event, so it gets the manual
 * "Share -> Add to Home Screen" instructions instead — without this, iOS users
 * would never know the app is installable. Nothing renders once installed.
 *
 * Both platform signals come from `useSyncExternalStore` rather than an effect:
 * they are browser-only facts, and the server snapshot keeps the initial render
 * (and hydration) free of a mismatch.
 */
export default function InstallPrompt() {
  const isStandalone = useSyncExternalStore(
    subscribeDisplayMode,
    getIsStandalone,
    () => false
  );
  const isIosDevice = useSyncExternalStore(
    subscribeStatic,
    getIsIos,
    () => false
  );
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isStandalone || dismissed) return;

    const onPrompt = (event: Event) => {
      // Suppress Chrome's own mini-infobar so we can ask in our own words.
      event.preventDefault();
      setDeferred(event as InstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, [dismissed, isStandalone]);

  if (dismissed || isStandalone) return null;

  const close = () => setDismissed(true);

  if (deferred) {
    return (
      <div className="safe-area flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <Download className="h-5 w-5 shrink-0 text-zinc-500" aria-hidden />
        <p className="min-w-0 flex-1 text-sm text-zinc-700">
          Install LectureScribe for a full-screen recorder.
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={close}
            aria-label="Dismiss install prompt"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={async () => {
              await deferred.prompt();
              await deferred.userChoice;
              setDeferred(null);
              setDismissed(true);
            }}
            className="min-h-9 rounded-full bg-zinc-900 px-4 text-sm font-medium text-white"
          >
            Install
          </button>
        </div>
      </div>
    );
  }

  if (isIosDevice) {
    return (
      <div className="safe-area flex items-start gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <Share className="mt-0.5 h-5 w-5 shrink-0 text-zinc-500" aria-hidden />
        <p className="min-w-0 flex-1 text-sm leading-6 text-zinc-700">
          Add LectureScribe to your home screen: tap{" "}
          <Share className="inline h-4 w-4 align-text-bottom" aria-hidden />{" "}
          <span className="font-medium">Share</span>, then{" "}
          <span className="font-medium">Add to Home Screen</span>.
        </p>
        <button
          type="button"
          onClick={close}
          aria-label="Dismiss install hint"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    );
  }

  return null;
}

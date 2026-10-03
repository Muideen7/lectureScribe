"use client";

import { useEffect } from "react";

/**
 * Registers the app-shell service worker.
 *
 * `updateViaCache: "none"` matters: without it the HTTP cache can serve a
 * stale worker and the user is pinned to an old build indefinitely. Combined
 * with the no-store header in `next.config.ts`, every check hits the network.
 *
 * Dev is skipped on purpose — a caching worker makes hot reload lie to you.
 */
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });

        // A new worker waits for every tab to close by default. Nudge it so a
        // deploy reaches people who keep one tab open all semester.
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              installing.postMessage("SKIP_WAITING");
            }
          });
        });

        if (registration.waiting && !cancelled) {
          registration.waiting.postMessage("SKIP_WAITING");
        }
      } catch {
        // Offline support is an enhancement; a failed registration must never
        // break recording or transcription.
      }
    };

    void register();

    // Check for a new worker when the app returns to the foreground.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        navigator.serviceWorker.getRegistration().then((registration) => {
          registration?.update().catch(() => {});
        });
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}

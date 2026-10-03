import type { MetadataRoute } from "next";

/**
 * Makes LectureScribe installable to the home screen on Android and iOS.
 *
 * Chrome/Edge require `name`, `short_name`, `start_url`, `display` and a
 * 192px + 512px icon before they will fire `beforeinstallprompt`. Android
 * additionally wants a `maskable` icon so the launcher can crop it to any
 * shape without clipping the mark.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "LectureScribe — AI lecture note-taker",
    short_name: "LectureScribe",
    description:
      "Record lectures, transcribe Nigerian English, Pidgin and native languages, and revise with AI-structured notes, definitions and flashcards.",
    lang: "en-NG",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // A phone held in one hand during a lecture should not rotate.
    orientation: "portrait-primary",
    background_color: "#fafaf9",
    theme_color: "#18181b",
    categories: ["education", "productivity", "utilities"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Record a lecture",
        short_name: "Record",
        description: "Jump straight to the recorder",
        url: "/?action=record",
      },
    ],
  };
}

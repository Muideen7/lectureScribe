import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import { AuthProvider } from "@/components/AuthContext";
import AuthModal from "@/components/AuthModal";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://lecturescribe.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "LectureScribe — AI Lecture Note-Taker & 3D Flashcards",
    template: "%s | LectureScribe",
  },
  description:
    "Record university lectures in Nigerian English, Pidgin, Yorùbá, Igbo, and Hausa. Automatically transcribe audio with Whisper AI and generate structured revision notes, definitions, and interactive 3D flashcards.",
  applicationName: "LectureScribe",
  keywords: [
    "lecture notes",
    "AI note taker",
    "Nigerian English transcription",
    "Pidgin Whisper",
    "speech to notes",
    "interactive flashcards",
    "university revision",
    "audio transcription",
    "Yoruba",
    "Igbo",
    "Hausa",
  ],
  authors: [{ name: "LectureScribe" }],
  creator: "LectureScribe",
  publisher: "LectureScribe",
  category: "education",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "LectureScribe",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    locale: "en_NG",
    url: siteUrl,
    title: "LectureScribe — From Lecture Audio to Study Notes & 3D Flashcards",
    description:
      "Accurately record and transcribe lectures with Nigerian accents and native languages into AI-structured notes, definitions, and flashcard decks.",
    siteName: "LectureScribe",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "LectureScribe — AI Lecture Note-Taker and Revision Companion",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "LectureScribe — AI Lecture Note-Taker & 3D Flashcards",
    description:
      "Record classroom lectures in Nigerian English, Pidgin, Yorùbá, Igbo, and Hausa. Get instant study notes and flashcards.",
    creator: "@lecturescribe",
    images: ["/twitter-image"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf9" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en-NG"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-stone-50 text-stone-900 selection:bg-emerald-500 selection:text-white dark:bg-zinc-950 dark:text-zinc-100">
        <AuthProvider>
          {children}
          <AuthModal />
          <ServiceWorkerRegistration />
        </AuthProvider>
      </body>
    </html>
  );
}

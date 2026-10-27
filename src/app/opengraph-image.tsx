import { ImageResponse } from "next/og";

export const runtime = "nodejs";

export const alt =
  "LectureScribe — AI Lecture Note-Taker, Audio Transcription & Revision Flashcards";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px",
          backgroundColor: "#09090b",
          backgroundImage:
            "radial-gradient(circle at 15% 20%, rgba(16, 185, 129, 0.18) 0%, transparent 45%), radial-gradient(circle at 85% 80%, rgba(99, 102, 241, 0.22) 0%, transparent 50%)",
          fontFamily: "system-ui, -apple-system, sans-serif",
          color: "#ffffff",
        }}
      >
        {/* Top Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "16px",
              backgroundColor: "#18181b",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 24px rgba(0, 0, 0, 0.5)",
            }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#10b981"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
              <path d="M6 12v5c3 3 9 3 12 0v-5" />
            </svg>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span
              style={{
                fontSize: "26px",
                fontWeight: 800,
                letterSpacing: "-0.03em",
                color: "#ffffff",
              }}
            >
              LectureScribe
            </span>
            <span
              style={{
                fontSize: "14px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                color: "#10b981",
              }}
            >
              AI Lecture Companion
            </span>
          </div>
        </div>

        {/* Main Center Callout */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            maxWidth: "920px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              backgroundColor: "rgba(16, 185, 129, 0.12)",
              border: "1px solid rgba(16, 185, 129, 0.35)",
              padding: "8px 18px",
              borderRadius: "999px",
              alignSelf: "flex-start",
            }}
          >
            <span style={{ fontSize: "15px", color: "#6ee7b7", fontWeight: 600 }}>
              🎙️ Built for Universities & Nigerian Audio Dialects
            </span>
          </div>

          <h1
            style={{
              fontSize: "58px",
              fontWeight: 900,
              lineHeight: 1.15,
              letterSpacing: "-0.04em",
              margin: 0,
              backgroundImage: "linear-gradient(to right, #ffffff, #e4e4e7, #a1a1aa)",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            From Lecture Audio to Study Notes & 3D Flashcards
          </h1>

          <p
            style={{
              fontSize: "22px",
              lineHeight: 1.45,
              color: "#a1a1aa",
              margin: 0,
            }}
          >
            Accurate speech-to-text for Nigerian English, Pidgin, Yorùbá, Igbo,
            and Hausa with instant AI definitions, summaries, and revision decks.
          </p>
        </div>

        {/* Bottom Feature Badges */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: "24px",
            borderTop: "1px solid rgba(255, 255, 255, 0.1)",
          }}
        >
          <div style={{ display: "flex", gap: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "18px" }}>🇳🇬</span>
              <span style={{ fontSize: "16px", color: "#d4d4d8", fontWeight: 500 }}>
                Multilingual Speech AI
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "18px" }}>⚡</span>
              <span style={{ fontSize: "16px", color: "#d4d4d8", fontWeight: 500 }}>
                Instant Flashcards
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "18px" }}>🔍</span>
              <span style={{ fontSize: "16px", color: "#d4d4d8", fontWeight: 500 }}>
                Vector Semantic Search
              </span>
            </div>
          </div>

          <span
            style={{
              fontSize: "15px",
              color: "#71717a",
              fontWeight: 500,
            }}
          >
            lecturescribe.com
          </span>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}

/**
 * Transcription tuning for Nigerian lecture audio.
 *
 * Whisper is a zero-shot model: with no hints it mis-detects West African
 * accents (often as French or Portuguese) and drops the diacritics that carry
 * meaning in Yoruba, Igbo and Hausa. Three levers fix most of that, and all
 * three are used by `POST /api/transcribe`:
 *
 *   1. `language` — pinning the ISO-639-1 code skips unreliable auto-detection.
 *   2. `prompt`   — Whisper's `initial_prompt` (max 224 tokens) biases spelling
 *                   and register. Measured at roughly 1-2pp WER improvement on
 *                   Nigerian Pidgin for free at inference time.
 *   3. `temperature: 0` — greedy decoding; no sampling drift between takes.
 *
 * See https://console.groq.com/docs/speech-to-text for the parameter contract.
 */

/** Audio the client downsamples to before upload — Whisper's native rate. */
export const WHISPER_SAMPLE_RATE = 16_000;

/** Header for the canonical 16-bit PCM WAV written by the client. */
export const WAV_HEADER_BYTES = 44;

/**
 * Groq caps uploads at 25MB. At 16kHz mono 16-bit that is ~13 minutes of
 * audio, so a 5-minute take lands around 9MB — comfortable headroom.
 * (`getUploadSizeBytes` is the single source of truth for the client cap.)
 */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * Longest single take. Keeps each transcription small enough to stay well
 * inside Groq's org-wide audio-seconds budget (a 5-min take is 300 audio-sec
 * against a 28,800 audio-sec/day org quota).
 */
export const MAX_RECORDING_SECONDS = 5 * 60;

/** `m:ss`, for the recording timer and upload readout. */
export function formatElapsed(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export type SpeechLanguage =
  | "auto"
  | "en"
  | "pcm"
  | "yo"
  | "ig"
  | "ha";

export interface LanguageOption {
  /** Value sent by the client. */
  value: SpeechLanguage;
  /** ISO-639-1 code forwarded to Groq, or null to let Whisper detect it. */
  groq: string | null;
  label: string;
  /** Shown under the label to explain what it does. */
  hint: string;
}

export const LANGUAGE_OPTIONS: readonly LanguageOption[] = [
  {
    value: "auto",
    groq: null,
    label: "Detect automatically",
    hint: "Best for mixed English and Pidgin. May guess the wrong language.",
  },
  {
    value: "en",
    groq: "en",
    label: "English",
    hint: "Recommended for English lectures — skips unreliable auto-detection.",
  },
  {
    value: "pcm",
    groq: "en",
    label: "Nigerian Pidgin",
    hint: "Decodes as English but keeps Pidgin words instead of translating them to English.",
  },
  {
    value: "yo",
    groq: "yo",
    label: "Yorùbá",
    hint: "For Yorùbá-only lectures. Keeps tone diacritics.",
  },
  {
    value: "ig",
    groq: "ig",
    label: "Igbo",
    hint: "For Igbo-only lectures.",
  },
  {
    value: "ha",
    groq: "ha",
    label: "Hausa",
    hint: "For Hausa-only lectures. Keeps ƙ/ɓ/Ɗ/Ƴ letterforms.",
  },
];

const DEFAULT_OPTION = LANGUAGE_OPTIONS[0];

export function isSpeechLanguage(value: unknown): value is SpeechLanguage {
  return LANGUAGE_OPTIONS.some((option) => option.value === value);
}

export function getLanguageOption(value: unknown): LanguageOption {
  return (
    LANGUAGE_OPTIONS.find((option) => option.value === value) ?? DEFAULT_OPTION
  );
}

/**
 * Bytes a WAV of `seconds` will occupy at the given format. Kept pure so the
 * 25MB ceiling can be asserted in tests instead of discovered in production.
 */
export function getUploadSizeBytes(
  seconds: number,
  sampleRate: number = WHISPER_SAMPLE_RATE,
  channels = 1
): number {
  const frames = Math.max(0, Math.ceil(seconds * sampleRate));
  return WAV_HEADER_BYTES + frames * channels * 2;
}

/** Longest take that still fits the upload cap at 16kHz mono. */
export function maxUploadSeconds(
  maxBytes: number = MAX_UPLOAD_BYTES,
  sampleRate: number = WHISPER_SAMPLE_RATE
): number {
  return Math.floor((maxBytes - WAV_HEADER_BYTES) / (sampleRate * 2));
}

/**
 * Groq truncates the `prompt` field at 224 tokens. English runs ~4 chars per
 * token, but Yoruba and Hausa carry combining diacritics that BPE splits far
 * more aggressively, so budget on characters and keep clear headroom.
 */
const PROMPT_CHAR_BUDGET = 520;

/** Academic register that shows up in Nigerian higher-education lectures. */
const ENGLISH_TERMS = [
  "matriculation",
  "semester",
  "registration",
  "lecturer",
  "department",
  "faculty",
  "course unit",
  "exam",
  "continuous assessment",
  "grade point average",
  "laboratory",
  "practical",
  "tutorial",
  "assignment",
  "deadline",
  "waiver",
  "undergraduate",
  "project",
  "thesis",
];

/**
 * Pidgin function words plus the local vocabulary an English lecture in
 * Nigeria actually contains. Without these, Whisper "corrects" Pidgin to
 * standard English ("wahala" -> "trouble"), which is exactly the failure the
 * student is trying to avoid.
 */
const PIDGIN_TERMS = [
  "wahala",
  "gist",
  "sha",
  "abeg",
  "abuna",
  "wahala",
  "sharp sharp",
  "na",
  "dey",
  "don",
  "go",
  "come",
  "make",
  "sey",
  "e no go",
  "jollof",
  "suya",
  "tuwo",
  "naira",
  "kobo",
  "okada",
  "danfo",
  "hostel",
  "matron",
  "jacket",
  "oja",
  "pikin",
  "mama",
  "papa",
  "omo",
  "ehen",
];

/** Correct Yoruba vowel tone marks. Whisper otherwise emits bare "e" and "o". */
const YORUBA_ORTHOGRAPHY =
  "Yoruba orthography uses tone marks on vowels: à á è é ì í ò ó ù ú ẹ̀ ẹ́ ọ̀ ọ́ ṣ̀ ṣ́ ń. Spell them exactly.";

/** Correct Hausa letterforms with their hooked and looped shapes. */
const HAUSA_ORTHOGRAPHY =
  "Hausa orthography uses ƙ ɓ Ɗ ɗ Ƙ Ɓ and Ƴ Ə. Spell them exactly.";

/** Correct Igbo vowels, especially the dotted ọ and ị. */
const IGBO_ORTHOGRAPHY =
  "Igbo orthography uses ọ ị ụ and letter pairs like ọnụkwụ, ịhụ, nwụ. Spell them exactly.";

/** Spoken as a sentence so Whisper treats it as context, not a term list. */
function asSentence(terms: readonly string[]): string {
  const unique = Array.from(new Set(terms));
  return `Key vocabulary: ${unique.join(", ")}.`;
}

/** Collapse whitespace so user-supplied hotwords can't break the layout. */
function normalizeTerms(value: unknown, limit = 24): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(/[,\n]+/)
    .map((term) => term.replace(/\s+/g, " ").trim())
    .filter((term) => term.length > 1 && term.length < 60)
    .slice(0, limit);
}

export interface PromptInput {
  language: SpeechLanguage;
  title?: string;
  course?: string;
  /** Free-text hotwords typed by the student (course codes, lecturer names). */
  terms?: string;
}

/**
 * Build the `initial_prompt` for a take. The prompt must be in the same
 * language as the audio, so each branch supplies its own register and
 * orthography hints rather than one blanket English list.
 */
export function buildGroqPrompt({
  language,
  title,
  course,
  terms,
}: PromptInput): string {
  const userTerms = normalizeTerms(terms);
  const subject = [title, course]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
    .join(" — ");
  const subjectLine = subject ? `Lecture subject: ${subject}.` : "";

  let register: string;
  switch (language) {
    case "pcm":
      // Pidgin rides on the English decoder, so hint English context but name
      // the Pidgin words to preserve.
      register = [
        "Nigerian lecture recording. The lecturer mixes Nigerian Pidgin with",
        "standard English; transcribe Pidgin words as spoken rather than",
        "replacing them with English equivalents.",
        asSentence(PIDGIN_TERMS),
      ].join(" ");
      break;
    case "yo":
      register = `Nigerian lecture recording in Yoruba. ${YORUBA_ORTHOGRAPHY}`;
      break;
    case "ig":
      register = `Nigerian lecture recording in Igbo. ${IGBO_ORTHOGRAPHY}`;
      break;
    case "ha":
      register = `Nigerian lecture recording in Hausa. ${HAUSA_ORTHOGRAPHY}`;
      break;
    case "en":
      register = [
        "Lecture by a Nigerian lecturer in English.",
        asSentence(ENGLISH_TERMS),
        "Local terms may appear; keep them as spoken.",
      ].join(" ");
      break;
    default:
      // Auto-detect: stay deliberately neutral so the hint cannot overrule
      // Whisper's own language decision.
      register = [
        "University lecture recording in Nigeria.",
        asSentence(ENGLISH_TERMS),
      ].join(" ");
      break;
  }

  const userLine = userTerms.length
    ? `Also expected: ${userTerms.join(", ")}.`
    : "";

  const prompt = [subjectLine, register, userLine]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  // Trim on a word boundary so the biasing terms at the end survive longest.
  return prompt.length <= PROMPT_CHAR_BUDGET
    ? prompt
    : `${prompt.slice(0, prompt.lastIndexOf(" ", PROMPT_CHAR_BUDGET)).trim()}…`;
}

/** Groq accepts these container/codec combinations for transcription. */
export const ALLOWED_AUDIO_MIME_TYPES: ReadonlySet<string> = new Set([
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/vnd.wave",
  "audio/mpeg",
  "audio/mp3",
  "audio/x-mpeg",
  "audio/x-mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
  "audio/aac",
  "audio/ogg",
  "audio/webm",
  "audio/flac",
  "audio/x-flac",
  "video/webm",
  "video/mp4",
]);

export const ALLOWED_AUDIO_EXTENSIONS: ReadonlySet<string> = new Set([
  "wav",
  "mp3",
  "mp4",
  "m4a",
  "aac",
  "ogg",
  "oga",
  "webm",
  "flac",
  "mpga",
  "mpeg",
]);

/** Browser MIME types are unreliable, so fall back to the file extension. */
export function isAllowedAudioFile(type: string, filename: string): boolean {
  const mime = type.split(";")[0]?.trim().toLowerCase() ?? "";
  if (mime && ALLOWED_AUDIO_MIME_TYPES.has(mime)) return true;

  const ext = filename.toLowerCase().split(".").pop() ?? "";
  return ALLOWED_AUDIO_EXTENSIONS.has(ext);
}

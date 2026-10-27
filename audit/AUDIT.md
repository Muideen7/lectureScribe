# LectureScribe — UI audit (before)

Audited: 2026-10-06 · Method: all screens rebuilt as `audit/before.html`,
rendered at 390×844 and 1440×900 with the web-designer scanner
(`audit/shots/before/`), plus a full read of every component in `src/`.

## What exists

A Next.js 16 + React 19 + Tailwind 4 PWA. Three screens: home (recorder
form → transcript → search), lecture detail (transcript + sections +
definitions + flashcards), offline. Core loop is sound: record ≤5 min,
transcribe (Nigerian English, Pidgin, Yorùbá, Igbo, Hausa), structure
into headings/definitions/flashcards, search past lectures by meaning.

## Scan result — 6 FAILs, 11 warns

### FAILs (mechanical, from the scanner)

1. **Contrast below WCAG on solid ground: 2.56:1** — `text-zinc-400`
   (`#a1a1aa`) on white/zinc-50, 14px. Hits: the "(optional)" label on
   home; the "1. 2. 3." section numbers on the detail page. The same
   colour is also the footer, all "No …" placeholders, "Tap a card to
   flip it", search-result dates and match-% labels. All fail AA
   (4.5:1 needed). This is an accessibility bug, not a taste issue.
2. **Text clipped / touching the viewport edge** — the raw-transcript
   block (`max-h-[28rem]`, `overflow-y-auto`) cuts mid-sentence at the
   frame bottom on the detail page. It scrolls, so content is reachable,
   but there is no fade or shadow affordance that more text exists below.

### Warns (each answered)

- **Georgia "renders identically to a missing font"** — the home h1 uses
  `font-serif` with no webfont loaded. On Linux/Android it falls back to
  whatever exists; the design is not rendering as designed anywhere.
  *Deliberate? No — fix by self-hosting one real face.*
- **Largest text is 24px; no element owns the screen** (home). True and
  deliberate-to-fix: there is no display moment anywhere in the app.
- **Em dashes in visible copy** — "up to 5 minutes per take", "Search …
  by meaning rather than keywords." Replace with periods/colons.
- **Targets under 44px** — the install-prompt dismiss (36×36), the
  language `<select>` (40px tall), "All lectures" back button (36px tall).
  Real tap targets on phones; fix.
- **Text within 12px of the viewport edge** on detail (3px) — the
  scrollable transcript runs under the frame edge; needs bottom padding.

### Pixel measurements (390×844)

| frame | hues | accent share | largest flat colour | dominance |
|---|---|---|---|---|
| home | **0** | 0.4% | 56% | 1.09× |
| lecture-detail | 1 (amber 24°) | 1.9% | 42% | 1.18× |
| offline | **0** | 0.0% | **96%** | 1.02× |

Home and offline are **fully achromatic**. No frame has a dominant
element (dominance ≈ 1.0× means nothing wins). The offline page is one
flat colour covering 96% of the screen — a screen with nothing on it.

## Slop tells hit (from slop.md)

1. **Default-reach font** — Geist/Geist Mono are named in slop.md §2 as
   "the fonts that mean nobody chose" (the Vercel/Next.js default).
2. **Mixed family for decoration** — a Georgia serif h1 dropped into an
   otherwise sans UI "to look designed", with no webfont behind it.
3. **Tailwind palette by name** — `zinc-*`, `stone-*`, `amber-*`,
   `red-*` throughout; zero derived values.
4. **Grey on grey** — zinc-400-on-zinc-50, the exact pattern slop.md
   calls out ("You can feel these").
5. **Everything is a card** — home is a stack of five `rounded-2xl
   border shadow-sm` boxes (banner, install prompt, recorder, empty
   placeholder, search); detail stacks six. Cards inside the same page,
   no hierarchy between them.
6. **ALL CAPS eyebrows** — RAW TRANSCRIPT, STRUCTURED NOTES, KEY
   SECTIONS, DEFINITIONS, FLASHCARDS — five grey uppercase
   tracking-wider labels, the maximum slop.md allows is one per frame.
7. **Flat type scale** — home renders only [24, 14, 12]px at
   400/500/600. No display moment, no metadata tier.
8. **No richness source** — 0 hue families on home; all-type, all-grey.
9. **Fake depth everywhere** — `shadow-sm` on every card plus
   `backdrop-blur` on the sticky header.
10. **Uniform rhythm** — `gap-6` between everything, `gap-4` inside
    everything. Nothing groups, nothing breathes.
11. **AI sparkles** — the `Sparkles` lucide icon sits next to
    "Structure Notes" / "Generate notes". slop.md §5: name what it does.
12. **The default stack** — lucide-react at default 24px/2px stroke,
    Tailwind utilities, Geist, monochrome Vercel-style icon
    (82% #18181b / 17% white / 0.6% violet trace).

## What is genuinely good — keep

- **No greeting header.** The header names the product and the promise.
- **The core action is on the first screen** (recorder), not a marketing
  hero.
- **Real, specific context**: en-NG, Africa/Lagos dates, Yorùbá/Igbo/
  Hausa/Pidgin language options, "Professor Adeyemi" in placeholder copy.
- **Mobile engineering**: iOS safe-area insets, 16px inputs to stop
  iOS zoom, `touch-action: manipulation`, `viewportFit: cover`.
- **Flashcard flip**: grid-cell technique so the longer face is never
  clipped; hover-flip only on fine pointers; reduced-motion respected.
- **Honest states**: save warnings, error alerts, empty states that name
  the next action, offline page that says what works.
- **Owner-scoped privacy** and meaning-search with match %.
- Dark-mode token *structure* exists (`--app-*` CSS vars) — to be
  restyled, not removed.

## Inventory

**Keep:** all features and flows; flashcard flip; safe-area/mobile meta
work; state copy; Nigerian language context; dark-token structure.

**Lose:** Geist/Geist Mono as the voice; the Georgia decorative serif;
zinc/stone grey-on-grey; card-everything layout; five uppercase
eyebrows; `shadow-sm` everywhere; the Sparkles icon on AI actions;
em dashes in UI copy; zinc-400 as a text colour (contrast FAIL).

**Unknown:** whether the name/mark stay; whether any photography or
lecture imagery exists for a richness source (none in the repo, no image
generation connected); user colour preference.

## Decisions for the user

1. **Name & mark** — keep "LectureScribe" and the monochrome
   graduation-cap icon, or rethink? The mark has a violet trace
   (#a868f8) that currently appears nowhere in the UI.
2. **Accent colour** — the concept (lecture audio → study notes) suggests
   chalk/board, notebook, or lamplight families. This is a brand call.
3. **First screen** — recorder owns it today. Confirm, or should the
   saved-lecture library lead for returning users?
4. **Dark mode** — keep `prefers-color-scheme` auto, or add a toggle?

## Category default refused (for the redesign)

The top of this category (Otter.ai, Fireflies, Notion AI) shares:
SaaS-violet gradients, "Effortlessly transcribe" marketing voice,
Inter/Manrope, hero + three feature cards. This app avoids the gradient
but lands on the equally-default Vercel stack (Geist + zinc + stone +
rounded cards). The redesign must pick a voice from the lecture hall, not
from either default.

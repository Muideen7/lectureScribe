# LectureScribe — direction

## Brief (self-authored, partially confirmed)

The user asked to "audit the current UI design", then answered two of the
four open questions. Confirmed by them: keep the name, replace the
graduation-cap mark with a better **non-monochrome** logo, keep dark mode
on `prefers-color-scheme`. Still open, decided by me below.

1. **What it is, who for:** a mobile-first PWA for Nigerian university
   students. Record a lecture (≤5 min), transcribe Nigerian English,
   Pidgin, Yorùbá, Igbo, Hausa, get structured notes (headings,
   definitions, flashcards) and meaning-search over past lectures.
2. **Core action (first 10 seconds):** tap record, speak, stop, get notes.
3. **Feel:** precise, calm, scholarly. A well-kept lecture hall, not a
   SaaS dashboard.
4. **What exists:** the name LectureScribe; a monochrome graduation-cap
   icon (82% #181818 / 17% white / 0.6% violet trace) the user has now
   asked me to replace; no photography; Next.js 16 + React 19 +
   Tailwind 4 with all features working; Geist; a zinc/stone palette.
5. **Need:** the audit (done: `audit/AUDIT.md`), then a redesign.
6. **Image generation:** none connected. Richness is drawn, not
   photographed.

## Audit summary (full report: audit/AUDIT.md)

6 scanner FAILs (zinc-400 at 2.56:1 across the footer, labels and section
numbers; a clipped transcript), 11 warns, and a near-total absence of
colour, type contrast and any dominant element. The app ships the
un-designed Vercel default: Geist, zinc/stone, a card per section, five
grey uppercase eyebrows, and a Georgia serif h1 with no webfont behind it.

## Decisions

- **Name:** keep "LectureScribe" (user).
- **Mark:** replace it (user). New mark designed below, colour in every
  state, not monochrome.
- **Dark mode:** `prefers-color-scheme` auto, no toggle (user). Both
  modes are designed, not inverted.
- **Accent family:** decided by the exploration. **Chalk yellow**, the
  one colour that belongs to a lecture hall.
- **First screen:** the recorder keeps it. It is the core action, and
  the library sits directly under it as evidence the loop closes.

## Category default refused

Otter.ai, Fireflies and Notion AI: SaaS-violet gradients, "Effortlessly
transcribe" voice, Inter/Manrope, hero + three feature cards. The app
already avoided the gradient but sat on the equally default Vercel stack
(Geist + zinc + rounded cards), and its icon carried a violet trace that
appeared nowhere else. Refused: both. The new voice comes from the room
the product is used in.

## Exploration (audit/explore.html, three concepts, all scanned clean)

1. **A · The board** — *a lecture hall after the lecturer leaves.*
   place · dark green-black slate · grotesque · shape language (chalk
   waveform, ruled board) · chalk yellow.
2. **B · The page** — *a ruled field notebook in ballpoint blue.*
   printed matter · pale paper, red margin, graph grid · serif ·
   colour and material · blue ink.
3. **C · The tape** — *a broadcast poster on a cobalt wall, the take
   printed on a cassette label.* media · saturated colour field ·
   rounded · drawn illustration · signal orange.

Measured at 390×844 (`audit/shots/explore3/`):

| | ground | dominance | accent share | largest flat | mud | chroma/edge |
|---|---|---|---|---|---|---|
| A the board | dark | **1.24×** | 3.2% | 76% | **1%** | **2.421** |
| B the page | light | 1.10× | 7.2% | 71% | 3% | 0.211 |
| C the tape | dark | 1.02× | 21.2% | 68% | 12% | 3.095 |

**A wins.** It is the only one of the three with an element that owns
the screen (dominance 1.24× against 1.10× and 1.02×), the cleanest
material (mud 1%), and it spends the least of the surface on colour
while having the highest chroma per edge, which is what "one accent, one
role" actually looks like in pixels. It is also the only concept whose
ground *is* the product's world.

**B lost** because it is the safe answer. Cream paper plus a serif title
is the editorial default this brief's mood would reach for on its own,
and cream-and-serif is the trap slop.md names; its chroma per edge
(0.211) is the flattest of the three, and on screen one the live take,
the thing the app exists for, is a 20px number in a row of hairlines.

**C lost** on its own numbers: mud 12% and dominance 1.02× say the drawn
tape is neither a clean hero nor convincing material, and the accent
covers 21.2% of the surface (dot, label, button, mark, warning), which
breaks one-accent-one-role. The one idea worth keeping from it is the
take time printed on the label: that becomes the detail frame's
handwritten-style caption in the winner.

## Direction: A · the board

**Concept sentence.** LectureScribe is a lecture hall board after the
lecture: green-black slate, chalk-white ink, one stick of chalk, and the
recording you are making written large in the corner.

**The richness source, as art direction.** The board itself. Slate is a
material with a top-lit sheen, so the ground carries one soft elliptical
falloff from the upper left, as if a ceiling lamp hangs over the front
row, and nothing else. On it: chalk, which is not a colour but a
*material* with a specific behaviour, so chalk marks are hand-drawn paths
with slightly uneven ends, never rectangles, and the recorded waveform is
drawn as chalk strokes that get quieter toward the left and brighter at
the live edge. Hairline chalk rules separate rows; no cards, no shadows,
no frosted panels except the one sticky header. Colour is scarce on
purpose, so the eye has nowhere else to go.

### Tokens

Light and dark are **two boards, not an inversion**: dark is the hall at
dusk with the lamp on (green-black slate, chalk-white ink, chalk-yellow
chalk). Light is the same hall with the room lights up (pale slate-grey
board, ink-black chalk, a deeper ochre-yellow that survives on white).

```css
/* dark · the default look, and the "lamp on" mode */
--ground:#12261C;  --ink:#F1EEE0;  --ink-2:#A9B6AC; --ink-3:#8A998E;
--rule:rgba(214,226,208,.17);
--chalk:#F5DE5A;   /* the accent: chalk yellow. 11.7:1 on the ground */
--chalk-ink:#12261C;         /* ink on a chalk fill */
--chalk-warm:#E08A3C;        /* same family, one step: warnings and overdue */

/* light · the room lights up */
--ground:#E8EAE3;  --ink:#15201A;  --ink-2:#414C44;  --ink-3:#5A655C;
--rule:rgba(21,32,26,.16);
--chalk:#7A5D00;              /* ochre: yellow that passes as text on pale slate */
--chalk-fill:#F2D64B;         /* yellow that survives as a fill (board-ink on it 11.6:1) */
--chalk-warm:#9C4A18;
```

Contrast, measured not guessed, every ink ≥4.5:1 on its own ground:

| token | on the dark board | on the pale board |
|---|---|---|
| ink | 13.67:1 | 13.81:1 |
| ink-2 | 7.56:1 | 7.39:1 |
| ink-3 | 5.33:1 | 5.02:1 |
| chalk (accent) | 11.73:1 | 5.10:1 (hue 46°, 5° from the dark chalk) |
| chalk-warm | 5.96:1 | 5.08:1 |
| board-ink on a chalk fill | 11.73:1 | 11.57:1 |

The audit's 2.56:1 zinc-400 failure is the bar this clears. Accent occupies
3–5% of a frame in the core state, measured.

### Type

Two families, both self-hosted as variable woff2 from `audit/fonts/`,
preloaded, `font-display: block`.

- **Bricolage Grotesque** (wght 200–800, wdth 75–100) is the voice. It is
  a grotesque with a real width axis, which lets the timer be *condensed*
  (wdth 78, wght 300) so a 96px clock fits a 390px phone without
  shrinking, while the wordmark and buttons are default width. Stated
  reason: the app is one long take and a running clock; condensed
  grotesque figures are the densest, most legible way to put a clock on a
  phone.
- **Hanken Grotesk** (wght 100–900) is the text face, for values and UI
  labels, because its tabular figures are stable at every size the timer
  and durations need.

Seven steps, weights two apart, display tracking tightened:

| role | size | family | weight | tracking |
|---|---|---|---|---|
| timer (hero, one per frame) | 96 | Bricolage, wdth 78 | 300 | −4.5% |
| page title | 40 | Bricolage | 500 | −2% |
| row value | 22 | Bricolage | 600 | −1.5% |
| secondary value | 17 | Hanken | 500 | 0 |
| wordmark / button | 15 | Bricolage | 640 | −0.5% |
| meta | 13 | Hanken | 400 | 0 |
| label | 12 | Hanken | 400 | +5% |

Measure: 34ch for notes prose (65–75ch is the cap, the phone is the real
limit). Labels are sentence case; one tracked label per group, never the
five-uppercase-eyebrow pattern the audit found.

### Layout

Mobile-first by construction, because the product is used in a lecture
hall on a phone. One column, 20px gutters, content edge to edge, no
cards: hairline rules group, space separates. Rhythm tight inside groups
(4–8), loose between (24–30), one rest per frame. The sticky header is
the only elevated layer and it is the one place frost is allowed.

### The new mark

The graduation cap is gone. The mark is one continuous stroke: a wave
that **settles into a straight line**, which is the product's whole
promise in one gesture (sound becomes script). Tile is the chalk accent
with board-ink stroke, so it is never monochrome: two colours, one
silhouette, legible at 16px, no text, no generic glyph.

## Signature interaction — *the chalk draws the take*

**Trigger:** the moment recording starts, and again when it stops.

- **Frame 1 (0ms):** the board is quiet. The timer reads `00:00`, the
  waveform is a single flat chalk line across the width. The record
  button says "Start recording".
- **Frame 2 (~120ms):** the chalk dot lights. The flat line *lifts*:
  bars rise from the baseline left to right over 260ms with a spring
  (`cubic-bezier(.16,1,.3,1)`), because audio is arriving. The timer
  starts counting.
- **Frame 3 (during):** new bars are drawn in chalk yellow at the live
  edge every ~250ms; older bars decay toward `--rule` at their true
  amplitude. Nothing loops or pulses for decoration; the motion is the
  audio.
- **Frame 4 (on stop):** the waveform **holds its full height and turns
  to ink** in one 320ms wipe from the live edge leftwards, the way chalk
  becomes a written line. The timer freezes; the button becomes "Stop
  and save"; the live edge becomes a labelled play/pause affordance
  because the take now exists.

Haptics: one 12ms tick on start, one 24ms tap on stop (navigator.vibrate,
guarded). Reduced motion: frames 2 and 4 collapse to a cross-fade of the
line, no bar lift, no wipe; the timer still counts. The signature lives
on the core action, is under a second, and is different on the 100th take
because the drawing is the recording.

## Content (Step 3, written before layout)

Realistic, uneven, mid-use. Not one tidy dataset.

- In progress: **Intro to Photosynthesis**, BIO 201, English (Nigerian,
  Pidgin), 02:14 of 05:00, 8.2MB of 25MB.
- Saved, complete: **Cellular Respiration**, BIO 201, 3m 12s, 12 Jan,
  6 flashcards.
- Saved, incomplete: **Oro in Yorùbá Linguistics**, ENG 304, 4m 48s,
  9 Jan, **no notes yet** (in `--chalk-warm`).
- Hint copy: "Audio stays on this phone until you save. Then it is
  transcribed and kept private to this browser." (periods, no em dashes.)

## Still to do

- Step 4: the frame set (core, detail, notes, signature storyboard,
  dark twin, empty state, wide layout, tile) in `mockup.html`.
- Step 5–6: shoot at 390 / 430 / 1440, one fresh critic, iterate.
- Step 7: the Next.js build, then point the scanner at the running app.
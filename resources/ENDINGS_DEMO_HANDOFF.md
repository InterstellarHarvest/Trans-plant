# Trans-plant — Endings Demo Handoff

## What you're building

`demo-endings.html` in `resources/`. A single-file HTML/CSS/JS demo (no build step) that shows all game-over screens — both victory endings and failure states. This is the last demo in the pre-engine phase; after this, every demo is done.

## Project context

**Trans-plant** is a roguelike resource-management game about hauling plants across space to seed a colony. The player manages fuel/food/water/hull/morale over a journey, makes encounter choices at stops, and arrives (or doesn't). This endings demo is what shows when the journey resolves.

**Working directory:** `/Users/MrDashiki/SCHOOL/UGMC Masters LDTC/Clicking Games/Trans-plant/resources/`

**Everything links:** `shared.css` + `shared.js` must be linked in the `<head>` of the new file. Every demo does this. Do not inline styles that belong in shared.css or duplicate what's already there.

**Tone:** dry, deadpan, slightly funny. The game never over-explains. One sentence does what three would in another game. Look at the encounter demo's outcome text for the register.

---

## The nine endings (§17 of GAME_BIBLE.md)

### Victory brackets (score-based)

| ID | Condition | Tone |
|---|---|---|
| `legendary` | Full crew, surplus resources, ahead of schedule | Gold — triumphant, almost embarrassed by how well it went |
| `good` | Made it, mostly intact | Teal — satisfied, matter-of-fact |
| `rough` | Arrived. Colony report is euphemisms. | Muted — dry, they made it but barely |
| `pyrrhic` | One survivor. Named a mountain after Jenkins. | Dark red — bleak, absurdly specific |

### Failure states (trigger-based, game ends immediately)

| ID | Trigger | Tone |
|---|---|---|
| `no_fuel` | Fuel hits 0 mid-journey | Cold — stranded. Emergency beacon. No one's coming fast. |
| `crew_gone` | All crew dead | Strange — ship arrives on autopilot. A kind of victory. Nobody is sure. |
| `hull_zero` | Hull hits 0 | Brief — catastrophic. One sentence. |
| `mutiny` | Morale hits 0 | Bureaucratic — crew files the forms. Player files a complaint. |
| `time_expired` | Journey time limit exceeded | Apologetic form letter — planet was claimed. Very sorry for your journey. |

**The bible says:** "The game always tells you *how* in one dry sentence." That's the guiding principle for all body text.

---

## Content to author (write these in the demo)

All text should be authored directly in JS as a data structure. Invent it; the bible leaves all text `empty`. Match the tone of `demo-encounter.html`'s outcome text — spare, specific, funny without trying. Each ending needs:

- `title` — 2-4 words, all caps. (e.g., "MADE IT." / "MOSTLY MADE IT." / "NOBODY'S SURE.")
- `body` — 1-3 sentences. The dry summary.
- `line` — optional. A final quote from someone — crew, colony administrator, the ship's log. Italicised. Can be omitted for brutal failures.
- `score_note` — optional override for the score breakdown label (e.g., pyrrhic: "1 of N crew survived").

Draft some; they can be revised later. Prioritise getting all 9 slots filled over perfecting any one.

---

## Visual design

### Layout

Full-screen takeover — not a modal, not a card in a corner. The endings screen IS the view. Reference: `demo-combat.html`'s end card is the closest pattern but this should feel bigger and more final.

```
┌─────────────────────────────────────────────────────┐  960×640
│                                                     │
│         [ background scene — full bleed ]           │
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │  ENDING TITLE              (Press Start 2P) │    │
│  │                                             │    │
│  │  Body text. One to three sentences.         │    │
│  │  Dry. Specific.          (VT323 20px)       │    │
│  │                                             │    │
│  │  "Optional final quote from someone."       │    │
│  │                                             │    │
│  │  ─────────── SCORE BREAKDOWN ────────────   │    │
│  │  CREW ●●●○  RESOURCES ██░░  HULL ████       │    │
│  │  DAY 47 OF 133 · ARRIVED 12 DAYS EARLY      │    │
│  │                                             │    │
│  │              [ NEW RUN ]                    │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

The card sits centred over a dark full-bleed background. For the demo, the background can be a solid dark gradient; the engine will eventually supply a scene image per ending. Consider a subtle animated element — slow parallax star drift (already exists in `demo-cruise.html` as `drawStars()`) or a gentle canvas overlay.

### Tone colours (border + title colour per ending)

| Ending | Border colour | Title colour |
|---|---|---|
| `legendary` | `rgba(200,168,90,0.85)` gold | `#c8a85a` |
| `good` | `rgba(140,200,144,0.7)` teal | `#8cc890` |
| `rough` | `rgba(160,140,100,0.5)` muted gold | `#a08c5a` |
| `pyrrhic` | `rgba(160,60,60,0.65)` dark red | `#a03c3c` |
| `no_fuel` | `rgba(100,120,160,0.6)` cold slate | `#8090b0` |
| `crew_gone` | `rgba(100,100,140,0.5)` violet-grey | `#8888aa` |
| `hull_zero` | `rgba(204,51,51,0.8)` red | `#cc3333` |
| `mutiny` | `rgba(180,90,40,0.65)` burnt orange | `#b45a28` |
| `time_expired` | `rgba(120,140,160,0.5)` bureaucratic grey | `#7890a0` |

### Fonts (same as every demo)
- **Press Start 2P** — title, section labels, button text
- **VT323** — body text, score breakdown, quote

### Score breakdown panel
Show the simulated end-state. In the demo, the values are controlled by sliders/inputs in a dev panel. Display:
- **CREW** — pip row (filled circles = alive, empty = dead). Max 5.
- **RESOURCES** — single bar or five mini-bars (fuel/food/water/hull/gold). Show % remaining.
- **DAYS** — `DAY N · X DAYS [EARLY / LATE / ON TIME]` — compare to a hardcoded par of 120 days.

The breakdown doesn't appear on failure screens where it doesn't make sense (`hull_zero` just ends — no score), but shows on all victory brackets and on `no_fuel`/`mutiny`/`time_expired` where you want to see how close you got.

---

## Dev panel

A collapsible panel (like the existing demos) for testing all 9 endings without replaying a run. Controls:

- **Ending picker** — dropdown with all 9 ids, renders that ending card immediately on change
- **Crew sliders** — set alive crew count (1-5)
- **Resource sliders** — fuel/food/water/hull %, each 0-100
- **Days slider** — journey days elapsed, 40-160 (par = 120)
- **Trigger button** — "SHOW ENDING" re-renders with current panel values

This is a demo — the controls are the gameplay. There's no cruise loop here, just the ending screens.

---

## Existing patterns to reuse

### From `demo-combat.html`
The combat end card is the closest structural relative. Its CSS classes (`.combat-end-card`, `.end-title`, `.end-body`) can inform the endings card classes — give the new ones their own namespace (`.endings-card`, `.endings-title`, `.endings-body`) so they don't conflict if ever combined.

The animation: `combat-end-card-rise` (slide up + fade in) is the right energy. Reimplement it for endings — or grab it directly.

### From `demo-cruise.html`
`drawStars()` — a canvas starfield function. Look at how cruise implements it and either copy/adapt or just link the same logic. A slow drift of stars behind the endings card is the right ambient.

### Shared infrastructure
`shared.js` provides: `PauseMenu`, `ShipsLog`, `MarketModal` — not needed here.
`shared.css` provides: scrollbar, typewriter cursor, `--gold` and `--red` CSS vars — useful.

---

## File + folder conventions

- **Single HTML file** — `demo-endings.html`. All CSS and JS inline (in `<style>` / `<script>` blocks). This is how every demo is built. No external `.js` or `.css` files except `shared.css` and `shared.js`.
- **Sprite paths** — relative from `resources/`. Background images would live in `sprites/endings/` when authored; for now use a CSS gradient placeholder.
- **Google Fonts** in `<head>`: `Press Start 2P` + `VT323`. Every demo links these.

Standard head block:
```html
<link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323:wght@400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="shared.css">
```
And at end of `<body>`:
```html
<script src="shared.js"></script>
```

---

## What done looks like

- All 9 endings render without errors
- Dev panel lets you switch between all 9 and adjust score values live
- Each ending has its own tone colour, title, body text, optional quote
- Score breakdown shows correctly for the applicable endings
- "NEW RUN" button resets the demo to a neutral state (or just re-shows the dev panel)
- No `[STUB]` markers — this demo has no engine integration contract, it IS the endpoint
- JS syntax clean: `awk '/^<script>/,/^<\/script>/' demo-endings.html | sed '1d;$d' | node --check -`

---

## Memory files to read if context is needed

- `project_transplant_session.md` — demo status table, what's done, what the stubs are
- `project_transplant_encounter_state.md` — not directly relevant but covers STATE conventions if you're confused about patterns
- `GAME_BIBLE.md §17` (line ~1740) — the canonical endings spec
- `DESIGN_SYSTEM.md` — full colour + typography reference

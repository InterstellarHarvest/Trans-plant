# Pause Menu — Build Spec

## Why this exists

Trans-plant is a captain-runs-a-ship sim. The player needs a meta layer they
can step into at any time — to read help, change settings, save/load, quit, or
peek at the ship's log. Right now there's no such layer; a pause action would
need to know what context it's in and there's no shared overlay surface.

This menu is also the **lever that adds `pause()` / `resume()` hooks to every
demo**. That contract is exactly what the eventual engine layer needs (each
demo as a mountable module). Building pause menu is the cheap excuse to add
those hooks one demo at a time, in context, without inventing the whole
engine.

It is intentionally **mostly cosmetic for now** — wiring saves to a real
serializable STATE happens after a separate `STATE` refactor (see
`project_transplant_session.md`). All save/load slots in this menu show
"Empty" or stub their UI. That's fine.

## Aesthetic — captain's terminal, not the rest of the game

The whole rest of Trans-plant uses the gold/teal/cream palette with subtle
gradients, soft drop-shadows, modal popups. **Pause menu must look
deliberately different** so the player understands they've stepped outside
the game.

Reference vibes (pick the cleanest interpretation, not literal):
- **Apple IIe / DOS prompt** — chunky monospace, mostly amber-or-green on
  black, hard edges, minimal chrome.
- **Fallout Pip-Boy** — but **without** the heavy CRT scanline filter and
  curvature. Those are jarring and slow to read.
- **Captain's bridge monitor** — implies a physical screen the player is
  looking at. A modest bezel/frame around the content sells this.

Concrete style direction:
- **Monochrome amber on black**: amber `#c8a85a` (= existing `--gold` so it
  ties subtly to the rest of the design system) on near-black `#020408`
  (= `--void`). Consider a small accent shade for emphasis (brighter cream
  `#e8d8a0` = `--cream`).
- **No green** unless playtest says amber feels wrong; we already use lots
  of teal in-game and a green pause menu would compete.
- Pixel fonts: `Press Start 2P` for headers and section labels, `VT323` for
  body/menu text (already loaded).
- **Subtle scanlines OK** — like 1px every 4–6px at very low alpha (~0.06)
  — *barely visible*, evokes monitor without harming readability. Skip
  curvature, vignette, animated noise.
- A small "case" border/bezel around the whole content — gives the impression
  the player is looking at a wall-mounted display, not a popup. Could be a
  3–6px outer frame in deep slate, with the amber text content inside.
- Power LED dot in a corner. Small "SHIP TERMINAL" / "BRIDGE OPS" label.
  These sell the diegetic framing for free.

What to avoid:
- Animated CRT noise / flicker / scanline drift.
- Heavy curvature / barrel distortion.
- Modern UI affordances (rounded buttons, drop-shadows on cards, gradient
  fills).
- Color/brightness controls (skipped per design call).

## Layout — sidebar + sub-panel, full takeover

Full-screen takeover within the 960×640 scale-root. Background is the
underlying game frame, dimmed via overlay `rgba(2,4,8,.92)`. Player can
faintly see they're in cruise/encounter/whatever, but it's clearly off-stage.

```
┌─────────────────────────────────────────────────────┐
│  ● BRIDGE TERMINAL · PAUSED                  ESC ✕  │
├──────────────┬──────────────────────────────────────┤
│ ▶ RESUME     │                                      │
│   SETTINGS   │   [content for selected section]     │
│   SAVE       │                                      │
│   LOAD       │   First open = brief welcome /       │
│   SHIP'S LOG │   ship status summary panel.         │
│   HELP       │                                      │
│   QUIT       │                                      │
│              │                                      │
└──────────────┴──────────────────────────────────────┘
```

- **Left column**: ~210px wide. Vertical menu list. Each item monospace
  amber. Selected item shows a `▶` prefix (or just brighter color).
  Keyboard: arrow keys + enter to navigate. Mouse: click selects + actions.
- **Right column**: content area. Swaps based on left selection.
- **Top bar**: ~36px tall, terminal-prompt vibe. Power LED dot, "BRIDGE
  TERMINAL · PAUSED" label, ESC + ✕ close affordance on the right.
- **Outer frame**: thin slate "bezel" (4–6px) all around so the amber
  content reads as a screen, not a UI overlay.

## Menu sections — what each does

Each described as: **what the player sees / what the demo agent should
implement**. Save/load are intentionally cosmetic until central STATE lands.

### 1. RESUME
Closes the menu. Triggers `resume()` on the currently-mounted demo.
Default-selected when menu opens.

### 2. SETTINGS
Sub-panel with adjustable controls. Most are cosmetic for now; the cursor
controls are real and wired through `shared.js`.

Controls to include (label + control type):
- **Cursor color** — color picker / 4-swatch preset (gold / cream / teal /
  red). Wires to `generateCursor(...)` in shared.js. **REAL — already
  working.**
- **Cursor outline** — toggle. Real (existing param).
- **SFX volume** — slider 0–100. Stub (no audio yet).
- **Music volume** — slider 0–100. Stub.
- **Text speed** — radio: slow / normal / fast. Stub.
- **Colorblind mode** — toggle. **Only include if a 1-line CSS filter on
  scale-root works as a quick test (e.g. `filter: hue-rotate(...)`)**. If
  it requires a real palette swap, **skip entirely**. The user explicitly
  doesn't want fake/half-baked accessibility.

Save settings to `localStorage` under a single key like `transplant:settings`.
On boot, `shared.js` should read this and re-call `refreshCursorVars(...)`.

### 3. SAVE
Three numbered slots stacked vertically:
```
SLOT 1 — empty                              [SAVE]
SLOT 2 — empty                              [SAVE]
SLOT 3 — empty                              [SAVE]
```
Clicking SAVE shows a brief confirmation toast and writes a stub object
to `localStorage` under `transplant:save:<n>` with timestamp + slot name.
**Real localStorage write, fake content** — the contents are just
`{ts: Date.now(), label: 'TEST'}` for now. When STATE refactor lands,
wire to `serializeState()`.

### 4. LOAD
Same three-slot UI. Empty slots show "EMPTY" and are non-interactive.
Filled slots show their saved-at timestamp + slot label. Click LOAD on a
filled slot → reads the stub object and shows a "loaded" toast (no actual
state restoration). **Cosmetic for now.**

### 5. SHIP'S LOG
**Include even though the Log demo doesn't exist yet.** Pause menu IS the
meta hub; Log structurally belongs here. Sub-panel shows an empty state:

```
SHIP'S LOG — no entries

Your decisions and discoveries will be recorded here.
This system is offline pending log subsystem install.
```

When the actual Ship's Log demo (bible §19) lands, swap the panel content.

### 6. HELP
Single static screen of mouse + keyboard reference. Two columns.
Left: mouse actions (click / drag / hold). Right: keyboard shortcuts.
Plus a short "What is this game" blurb at the bottom — 2–3 sentences from
the bible §1 / project_transplant.md. No interactive content.

### 7. QUIT
**Real action** — confirms with a yes/no dialog ("Return to title? Unsaved
progress will be lost"), then navigates to `demo-title.html` (or the
project's eventual single-page entrypoint). For demo purposes, just
`window.location.href = 'demo-title.html'`.

## Technical contract — pause/resume hooks

Every demo currently runs its own rAF loop and has timers. Pause menu needs
each one to honor a paused state. Approach:

1. Add a tiny shared module to `shared.js`:
   ```js
   const PauseBus = {
     paused: false,
     listeners: new Set(),
     pause()  { this.paused = true;  this.listeners.forEach(fn => fn(true));  },
     resume() { this.paused = false; this.listeners.forEach(fn => fn(false)); },
     onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
   };
   ```
2. Add a global `Esc` keyboard handler (in `shared.js`) that toggles the
   pause menu overlay. Mount overlay if not yet mounted.
3. **Each demo's rAF loop checks `PauseBus.paused` at the top**:
   ```js
   function frame(now){
     if(done) return;
     if(PauseBus.paused){ rafId = requestAnimationFrame(frame); return; }
     // ... real frame logic
   }
   ```
4. **`makeTimer` in `demo-minigames.html` needs to honor pause too** — when
   paused, freeze elapsed time. Cleanest: track `accumulatedMs` separately
   from real wallclock, only advance when `!PauseBus.paused`. Touch this
   carefully — many minigames use it.
5. Per-demo `setTimeout`-based events (surge timers, name bubbles) also
   need to pause. Two options:
   - Refactor all `setTimeout` to driven-by-rAF time accumulation. Cleanest,
     biggest refactor.
   - Track active setTimeout IDs per demo, call `clearTimeout` on pause +
     re-queue on resume with remaining duration. More work, less invasive.
   - **MVP option**: leave `setTimeout` alone. Particle pops, name bubbles,
     etc. continue ticking during pause but the main game state is frozen.
     Not perfect but acceptable for a demo. **Ship this; refactor in the
     STATE pass.**

The `PauseBus.onChange` hook lets demos do per-game pause work (mute
audio when audio exists, dim active visuals, etc.).

## Where to mount

The pause menu lives as a single shared component. Options:

**A. In `shared.js` + `shared.css`** — auto-mounted by every page that
links shared.js. ESC opens it. Simplest. **Recommended.**

**B. As its own demo file** that all other demos `<iframe>` or import.
More complex, no real benefit.

Go with A. The component constructs its DOM lazily on first ESC press,
attaches to `document.body`, and subsequent toggles just show/hide.

## Files to read before starting

In rough priority order:
1. `memory/MEMORY.md` and the project_transplant_* memories — gives full
   context on what's been built and project conventions.
2. `resources/shared.js` — see `generateCursor`, `CURSOR_CONTEXTS`,
   `refreshCursorVars` for the cursor settings wiring. See cursor sprite +
   reticle systems.
3. `resources/shared.css` — design system applied. Pause menu CSS goes here.
4. `resources/demo-title.html` — what QUIT routes to.
5. `resources/demo-cruise.html` — biggest, most complex demo. Test the
   pause hook here first since it has the most state.
6. `resources/demo-minigames.html` — has many small demos. Test pause in
   one or two minigames (medical and brace are most state-heavy).
7. `resources/DESIGN_SYSTEM.md` — palette, typography, button styles.
8. `resources/GAME_BIBLE.md` §19 — what Ship's Log will eventually contain.

## Out of scope for this build

- Real save/load (waits for central STATE refactor).
- Audio (no sfx exist yet).
- Ship's Log content (waits for Log demo).
- Color/brightness sliders.
- Animated CRT effects.
- Refactoring per-demo `setTimeout` to pausable form (MVP leaves them
  ticking — fine for demo).

## First-action checklist for the new agent

1. Read this file + the memories listed above.
2. Verify recent file state — `ls resources/` and confirm what demos
   currently exist (since memory may lag).
3. Build the overlay shell in `shared.js` + CSS in `shared.css`. Static
   layout first, no logic.
4. Wire ESC handler + `PauseBus`. Verify ESC toggles the menu over
   `demo-title.html` (simplest demo).
5. Add `if(PauseBus.paused) { rAF; return; }` to one minigame's loop
   (e.g. brace) and verify pause/resume works while a surge is in flight.
6. Build the section sub-panels one at a time: SETTINGS first (it has the
   one real working control — cursor — so it's the proof-of-concept),
   then SAVE/LOAD (cosmetic), then HELP, then SHIP'S LOG empty state,
   then QUIT.
7. Sweep remaining demos to add the pause-bus check to their loops. This
   is a one-line edit per demo. Track them off in a checklist.

## Memory pointers to write after build

When the build is done, update memory:
- Add a `project_transplant_pause.md` note covering: how PauseBus works,
  where settings persist, which demos honor pause, which don't yet.
- Update `project_transplant_session.md` Demo status table — mark Pause
  Menu done.

## Open questions to ask the user up-front

- **Amber or green for the terminal text?** Spec recommends amber (matches
  `--gold`) but green is the more iconic terminal look. Get a yes/no
  before diving in.
- **Should ESC also be the open trigger, or pause-icon-only?** Spec
  recommends both. Confirm.
- **Quit confirmation modal — full takeover style match, or smaller modal
  inside the pause menu's right panel?** Spec recommends inline in the
  right panel.

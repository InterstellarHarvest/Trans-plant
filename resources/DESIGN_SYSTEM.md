# Trans-plant — Visual Design System

> **Status:** Locked baseline as of session 2026-04-13.
> Inspired by warm retro-futuristic UI kit reference images (cream/teal/orange/navy palette).
> Carries forward to EVERY screen, modal, tooltip, and UI element in the game.
> Divergence from this requires a deliberate decision.

---

## Shared modules

`resources/shared.css` and `resources/shared.js` are the single source of truth for visual primitives + JS helpers that every demo consumes. Every demo HTML file links them in `<head>` before its own inline `<style>`/`<script>`:

```html
<link href="shared.css" rel="stylesheet">
<script src="shared.js"></script>
```

**`shared.css` contains:** `:root` brand vars `--gold` and `--red` (only the two values that are unanimous across every demo), the custom scrollbar block (`.scroll-host` / `.scroll-content` / `.scroll-track` / `.scroll-thumb`), and the typewriter cursor + blink keyframes (`.tw-cursor` + `@keyframes blink-cursor`).

**`shared.js` contains:** `CREW_ATLAS` + helpers (`crewIconCss`, `applyCrewPortrait`, `probeCrewSprite`, `_looseFileBg`, `CREW_SHEET_W/H` constants), and `wireCustomScroll(host)`.

**Intentionally NOT shared** — these are flagged because future passes shouldn't "consolidate" them by mistake:
- `--teal` / `--cream` / `--body` palette vars (intentionally diverge per demo's visual register)
- `.has-sprite` (each demo scopes it to specific elements)
- `.panel-btn` rules (per-demo accent colors)
- Modal frame styles (each modal has its own border/width)
- Encounter's `tw-cursor` + `tw-blink` keyframes (encounter uses a `▍` character cursor for its layout-reservation typewriter — deliberate visual divergence)
- Font `<link>` tags (small one-liner per file; better in `<head>` than as `@import`)

**Promotion checklist** before adding new code to shared.css/shared.js:
1. Appears identically in 2+ demos (run `diff` between them)
2. Any current divergence is unintentional
3. CSS doesn't conflict with per-demo overrides (cascade order works — shared loads first)
4. JS doesn't depend on demo-specific state (must be pure helpers)
5. After promoting, remove the inline copy from every demo + parse-check each one

See [project_transplant_shared.md](memory file in user's auto-memory) for the full origin story and reference implementations.

## Core Palette

| Role | Color | Hex | Usage |
|---|---|---|---|
| **Gold accent** | warm gold | `#c8a85a` | Frame borders, active step labels, category titles, primary accent |
| **Sage green** | plant sage | `#8cc890` | Secondary accent, "done" progress pips, sage button fills, LED indicators |
| **Orange bar** | signal orange | `#e88830` | Alert indicators, active tab underlines (not for card selection) |
| **Red LED** | signal red | `#cc3333` | Warnings, critical alerts, small status dots |
| **Cream panel** | warm cream | `#e8d8a0` | Button primary fill, readable content panels, info text areas |
| **Dark slate navy** | deep slate | `#2a3040` | Card surfaces, frame interior borders, secondary backgrounds |
| **Deep charcoal** | void blue-black | `#0e1520` | Game background top |
| **Deepest void** | pure dark | `#020408` | Game background bottom, star canvas background |
| **Body text** | light gray-blue | `#8898a8` | Description text, card descriptions |
| **Muted** | slate gray-green | `#5a7a6a` | Section headers, inactive state labels |
| **Subject border** | desat slate | `#545F5C` | Encounter subject-frame border, name plate border |
| **Empty backdrop** | pure dark | `#020408` | `--bg-empty` — encounter screen fallback when all bg layers are transparent/missing |

## Typography

- **Press Start 2P** — all headers, titles, category labels, pip labels, small UI labels. Font sizes: 7-13px (uppercase, letter-spacing 1-3px)
- **VT323** — all body text, descriptions, button labels, input fields. Font sizes: 14-26px
- **Never** use either font in opposite roles. Never introduce a third font.

## Frame / Window Treatment

The gold 3px rounded frame (`border: 3px solid #c8a85a`, `border-radius: 6px`, inset double-border shadow) is a **setup-only** chrome, not a global game frame. It reads as a "card on a table" — appropriate for pre-game scenes where the player is picking options, wrong for the game world itself.

**Applies to:**
- Setup scene only (`demo-setup.html` → production Setup flow)

**Does NOT apply to:**
- Intro / title screen (it's a full-bleed poster, not a framed card)
- Cruise screen (the main gameplay surface — the player is *inside* the ship, not looking at a card of one)
- Modal overlays (Growbay / Orders / Inventory / Map / Stop Menu / etc.) — they stack on top of cruise, which is unframed, so they float against the live scene with their own per-modal chrome (see "Modal popup conventions" below). Wrapping them in a shared frame would make them look like cards floating on cards.

**In the demo files**, `#game` is still a 960×640 container (for consistent sizing across demos and to host CRT overlay + screen-shake) but it renders without border, border-radius, or inset shadow on every demo except setup. The container's background gradient is retained so the "stage" is visible against the page background.

- **Content panel borders**: 2px gold top or gold-with-alpha for internal dividers
- **Inner panels / cards**: 2px solid slate border (`#2a3040`) when inactive, 2px gold when selected/active, border-radius 6-8px
- **Modal panels**: per-modal border + title color tuned to the modal's subject (Orders `#435384` slate-blue + cyan title, Growbay `#608c64` warm-green + growth-green title, Inventory cream + gold title) — each modal owns its own chrome and doesn't inherit a shared border
- **Section dividers**: 1-2px solid with alpha, teal or gold

## Button Styles

Trans-plant has **two distinct button classes**. Picking the right one matters.

### When to use which

| Class | Represents | Visual cue | Examples |
|---|---|---|---|
| **Floating UI** | Abstract game interaction, primary CTAs | Rounded, cream/teal, soft shadow | "New Game", "Launch", "Start", dialogue choices, "Continue" on outcome modals |
| **Analog panel** | A physical button on a computer interface | Square, 3D-beveled, click-to-invert | Back/Next navigation, cruise dashboard (Map / Cargo / Log / Crop), modal close (X), toolbar controls, tabs, in-game "system" buttons |

If the button represents something the player would *physically press* on the ship's control panel, it's an analog panel button. If it's a floating interface element inviting an abstract choice, it's a floating UI button.

---

### Class 1: Floating UI Buttons (rounded)

Two primary variants:

**Cream button (default)**
- Background: linear-gradient(180deg, `#e8d8a0` 0%, `#d8c888` 100%)
- Border: 3px solid gold `#c8a85a`, border-radius 8px
- Text: `#2a3040` (dark slate), VT323 22px uppercase
- Shadow: `inset 0 0 0 1px rgba(200,168,90,0.2), 0 2px 4px rgba(0,0,0,0.3)`
- Hover: lighter gradient
- Active: translate(1,1) + inset shadow

**Teal accent button**
- Background: linear-gradient(180deg, `#8cc890` 0%, `#70b898` 100%)
- Border: 3px solid gold, border-radius 8px
- Text: `#1a2030` dark
- Decoration: horizontal stripe overlay via `::before` pseudo-element — `repeating-linear-gradient(90deg, transparent, transparent 3px, rgba(255,255,255,0.06) 3px, rgba(255,255,255,0.06) 4px)`
- Optional small LED dot inside button (6px, colored circle with box-shadow glow)

**Disabled button**: opacity 0.3, pointer-events none

---

### Class 2: Analog Panel Buttons (square, beveled)

Classic computer-interface buttons — like Windows 95 toolbar buttons, SSL's retro panel style, or real-world control-panel buttons. They exist to be *pressed*.

**Core styling:**
- **Shape**: square or slightly rectangular, **no border-radius** (or very minimal, max 2px)
- **Background**: linear-gradient(180deg, `#3a4050` 0%, `#252a38` 50%, `#1a1f2a` 100%) — dark gradient with subtle top-to-bottom falloff
- **Border**: 3px outset — lighter top/left, darker bottom/right for 3D pop effect
  - `border-color: #5a6070 #1a1f2a #1a1f2a #5a6070` — creates the raised bevel look
- **Text**: VT323 18-22px, uppercase, cream `#d0c890` or teal `#8cc890` depending on context
- **Icon or letter** on left if toolbar-style

**Press state (click-to-invert):**
- `border-style: inset` — flips the bevel so the button appears pressed IN
- `transform: translate(1px, 1px)` — subtle pixel shift for tactile feedback
- Slightly darker background: `linear-gradient(180deg, #1a1f2a 0%, #252a38 50%, #3a4050 100%)` (gradient reversed)
- `text-shadow: 0 1px 0 rgba(0,0,0,0.4)` — text looks slightly recessed

**Hover state:**
- Background brightens slightly
- Border highlights slightly more
- **No position shift** — only active/press shifts

**Accent variants:**
- **Gold accent** — border top/left tinted gold `#c8a85a`, text gold. Used for primary actions like "Next" or "Launch".
- **Teal accent** — border top/left tinted teal `#8cc890`, text teal. Used for affirmative/safe actions.
- **Red accent** — border top/left tinted red `#cc3333`, text red. Used for destructive/critical actions.

**Disabled state:**
- Opacity 0.4
- No border color differentiation (both sides same dark color)
- pointer-events: none

**Example CSS pattern:**
```css
.panel-btn {
  background: linear-gradient(180deg, #3a4050 0%, #252a38 50%, #1a1f2a 100%);
  border: 3px outset #5a6070;
  border-color: #5a6070 #1a1f2a #1a1f2a #5a6070;
  color: #d0c890;
  font-family: 'VT323', monospace;
  font-size: 20px;
  text-transform: uppercase;
  letter-spacing: 1px;
  padding: 8px 18px;
  cursor: pointer;
  transition: background 0.1s;
}
.panel-btn:hover {
  background: linear-gradient(180deg, #454b5c 0%, #2d3340 50%, #20252e 100%);
}
.panel-btn:active {
  border-style: inset;
  border-color: #1a1f2a #5a6070 #5a6070 #1a1f2a;
  background: linear-gradient(180deg, #1a1f2a 0%, #252a38 50%, #3a4050 100%);
  transform: translate(1px, 1px);
}
.panel-btn.accent-gold {
  border-color: #c8a85a #3a2a10 #3a2a10 #c8a85a;
  color: #c8a85a;
}
.panel-btn.accent-gold:active {
  border-color: #3a2a10 #c8a85a #c8a85a #3a2a10;
}
```

---

## Card / List Item Style

- Inactive: 2px slate border, dark background with 0.6 alpha, 6px border-radius
- Hover: teal border with 0.3 alpha, slight teal-tinted bg
- **Selected**: gold border, gradient bg (cream + teal tint at low alpha), box-shadow gold glow. **No right-edge orange stripe** — the gold border + glow is sufficient on its own; extra decoration reads as noise.
- Small LED dot on left (6px circle) — slate when inactive, teal with glow when selected
- Card icon on left (26-28px emoji/sprite)
- Card info: name in Press Start 2P 8px uppercase (slate when inactive, gold when selected), description in VT323 17px

## Halftone Dot Pattern

- Corner decoration: `radial-gradient(circle, rgba(140,200,144,0.06) 1px, transparent 1px)` with `background-size: 8px 8px`
- Placed in bottom-left and top-right corners with `mask-image: radial-gradient(ellipse at 0%/100%, black, transparent 70%)` to fade toward center
- Opacity 0.06-0.10 is the sweet spot — present but not loud

## Progress Indicators

- **Progress pips**: 12px circles, slate border when pending, teal filled when done, gold ring when active
- **Connecting lines** between pips: 2px, slate when pending, teal when done (represents path completed)

## LED Indicators

- Small colored circles, 6-12px
- Always with matching `box-shadow: 0 0 6px currentColor` for the glow
- Color semantics:
  - **Teal** — active/healthy/selected
  - **Orange** — warning/accent/special
  - **Red** — critical/alert
  - **Gold** — highlighted/chosen
  - **Slate** — inactive

## Background Treatment

- Main background: linear-gradient top-to-bottom, deep charcoal to void black
- Add canvas-based star field (slow lateral drift — we're moving)
- Parallax layers: far (slow + twinkle), near (faster), optional dust/seed particles (organic green tint, gentle sine-wave float)
- **NO static CSS stars or 4-pointed star decorations.** All star/sparkle effects are canvas-animated.
- Warm horizon glow at bottom (orange/gold at ~30-40% alpha fading up) suggests distant destination

## CRT Scanlines

- `repeating-linear-gradient(0deg, rgba(0,0,0,0.05), rgba(0,0,0,0.05) 1px, transparent 1px, transparent 2px)`
- 5-8% opacity — present but not heavy
- Never turn this off

## Decorative Rules

- **Tabbed navigation**: ONLY for modals/popups that genuinely need to show a lot of information with sub-views (inventory with items/materials/upgrades). NOT a default pattern — most modals are single-view.
- **Four-pointed stars**: do not render as CSS elements. Canvas stars cover this.
- **Stripes**: horizontal stripe patterns on buttons for visual texture, not on backgrounds
- **Halftones**: corners and specific accent areas only, not full backgrounds

## Input Fields

- Background: `rgba(20,28,40,0.8)` dark slate with slight transparency
- Border: 2px gold solid, 6px border-radius
- Text: cream/gold color, VT323 26px with 2px letter-spacing
- Focus state: border shifts to teal with teal box-shadow glow
- Placeholder: `#3a4a50` very muted

## Custom Scrollbar

**HARD RULE: every scrollable surface in the game uses this pattern.** No exceptions in the player-facing UI — log columns, choice columns, modal grids, modal detail panels, dialog histories, ship's log, station rooms, dossier scrolls, anywhere content can overflow. If a surface scrolls, it gets `.scroll-host` markup and a `wireCustomScroll(host)` call.

**The CSS lives in `resources/shared.css` and the JS in `resources/shared.js`.** No demo redefines either inline. To use:

```html
<link href="shared.css" rel="stylesheet">
<script src="shared.js"></script>
```

Then markup the surface with `.scroll-host > .scroll-content + .scroll-track > .scroll-thumb` and call `wireCustomScroll(host)` once at boot.

Default browser scrollbars look wrong against the retro palette and can't be precisely styled across browsers (Firefox can't do granular width, iOS can't be styled at all). Cross-browser parity matters because the game runs in any browser; we don't get to assume Chromium.

Reference implementations:
- `demo-inventory.html` — item grid + detail panel (first impl)
- `demo-cruise.html` — AI log column + Stop Menu choice column
- Any future scrollable surface — `<link>` shared.css + `<script>` shared.js, then add the markup. Do not copy the rules inline.

The dev-only controls sidebar in each demo keeps its native scrollbar — that's scaffolding chrome, not player-facing UI, so the rule doesn't apply there.

**DOM shape:**

```html
<div class="scroll-host">
  <div class="scroll-content"> …scrollable content… </div>
  <div class="scroll-track">
    <div class="scroll-thumb"></div>
  </div>
</div>
```

The `.scroll-host` is the positioning parent. It can carry whatever flex / sizing role the scrollable element used to carry. The `.scroll-content` keeps native `overflow: auto` — wheel, touch, keyboard, and screen readers all still work. The native scrollbar is hidden via CSS; a sibling `.scroll-track` + `.scroll-thumb` render the retro thumb, synced to the content's scroll position in JS.

**Visual language:**
- Track: 8px wide, dark slate `rgba(10,14,20,0.6)`, no border, no border-radius — the gold thumb provides all the visual weight
- Thumb: gold vertical gradient (`#c8a85a → #8a7435`) with a cream inset highlight on top and a dark inset shadow on the bottom (same inset-bevel vocabulary as the panel buttons)
- Minimum thumb height: 22px
- Visibility: hidden by default; fades in on `scroll-host:hover`, during an active drag, or for 600ms after any scroll event
- Collapses entirely (`display: none`) when content fits (JS sets a `.no-scroll` class on the host)

**JS (`wireCustomScroll(host)`):**
- `scroll` event on content → recomputes thumb height + position
- `pointerdown/move/up` on thumb → drag to scroll, uses `setPointerCapture` so releasing off-thumb still ends the drag
- `click` on track (not thumb) → page-jumps 80% of viewport toward click
- `ResizeObserver` on content → recompute on layout changes
- `MutationObserver` on content → recompute when children change (e.g. `innerHTML` re-renders)
- Transient `.scrolling` class on host flashes the track visible for 600ms after each scroll

**Scope:** applies only to elements with `.scroll-content`. Other scrollable surfaces (e.g. the dev-only controls sidebar in the demos) keep their native scrollbar — native is fine for scaffolding chrome, retro-styled for game UI.

**Reusing the pattern:** wrap the scrollable element in the three-class markup above, call `wireCustomScroll(host)` once at boot. ~130 lines of vanilla JS + ~45 lines CSS, zero dependencies.

## Dropdowns

**Never use a default browser `<select>` element in the game UI.** Browser dropdowns ignore our font, palette, and chrome; they break the CRT/retro feel instantly. Every in-game dropdown is custom:

- Trigger: Class 2 Analog Panel Button styling with a small `▾` chevron on the right
- Open state: chevron rotates 180° (`▴`), flyout panel appears below anchored to the trigger
- Flyout: slate bg, gold border, same padding as the trigger — rendered list of options
- Each option: VT323, cream color, hover tints to gold, click selects + closes
- Selected option: gold accent + subtle inset highlight
- Outside-click or `Esc` closes without selecting
- Keyboard: `↑`/`↓` moves highlight, `Enter` selects, `Esc` closes

This applies to sort selectors, filter selectors, tier pickers, anything that would otherwise be a `<select>`. The dev-only control panels on the style-tuning sidebars are exempt — those can stay plain `<select>` since they're scaffolding, not game UI.

## Animation Philosophy

- Everything eases — no linear transitions
- Hover states are 120ms
- Selection/state changes are 150-300ms
- Intro sequences build progressively (icon grows in → title fades → text typewrites → buttons appear)
- Typewriter text at 33-40ms per character (SSL-compatible). The blink cursor (`.tw-cursor` + `@keyframes blink-cursor`) lives in `shared.css` — every demo uses the same 8px-wide block that inherits `currentColor` from its parent, EXCEPT encounter, which deliberately keeps its `▍`-character cursor with its own `tw-blink` keyframes for the layout-reservation typewriter.
- **Subtle idle bobs** on hero sprites (ship on name-step, ship silhouette on cruise): `transform: translateY(-6px)` on a 3.2–3.6s `ease-in-out infinite` loop. Just enough motion to feel alive; not so much that it draws focus.

## Sprite Pattern (icon swap)

Every pixel-art icon slot in the UI wears a `.has-sprite` modifier alongside its base class (`.card-icon`, `.ai-avatar`, etc.). The PNG path lives as an inline `style="background-image: url('sprites/<kind>/<name>.png')"` so each instance picks its own sprite without a per-option CSS rule.

```css
.<base>.has-sprite {
  background-size: contain;       /* or cover for tightly-cropped portraits */
  background-repeat: no-repeat;
  background-position: center;
  color: transparent;             /* hide the emoji fallback */
  text-shadow: none;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}
```

Emoji stays as the element's text content (fallback + a11y). `color: transparent` hides it when the sprite loads. If the PNG is missing or network-stripped, the emoji is still there as a usable fallback.

Circle-framed avatar slots (`.ai-avatar` specifically) drop border + border-radius + background-color inside the `.has-sprite` override — the portrait itself is the icon, no circle needed.

Current sprite directories under `resources/sprites/`:
- `AI/` — 5 AI companion portraits (aria, marv, rex, chip, ajoy)
- `careers/` — 10 captain backgrounds
- `crew_sprites/` — 8 named crew members: osei, kazuki, reyes, vasquez, hargrove, reeves, tanaka, captain
- `crops/` — 5 crop icons (note: `sweet_potato` → `potato.png`, `soybean` → `soybeans.png`)
- `ships/` — `default.png` at 380×135, used at original size on the ship-name step
- `cargo/` — resource tiles (`cargo_fuel.png`, `cargo_food.png`, `cargo_water.png`, each 64×64 with a per-resource gauge-overlay rectangle declared in the inventory demo's `RESOURCES` array)
- `cargo/items/` — gear sprites (64×64 native)
- `cargo/materials/` — material sprites (64×64 native)
- `cargo/upgrades/` — upgrade sprites (**128×128 native** — larger because upgrades are shown as hero elements in the detail panel at native size)
- `growbay/` — growbay-modal spritesheets + per-crew JSON. `spritesheet_growbay.png` holds all 5 crops × 4 stages at 109×192 per frame; per-crew animated sheets (`spritesheet_growbay_<id>.png`) hold a 9-frame animation + 1 idle frame each, dimensions differ per crew (see `CREW_SHEETS` table in demo-growbay.html)
- top-level icons: `engines.png`, `rations.png`, `water.png`, `plant.png`, `crew.png`, trail icons (`moon.png`, `mars.png`, `interstellar.png`)

**Sprite size convention (cargo/inventory pipeline):**
- Items + materials + resource tiles: **64×64 native**
- Upgrades: **128×128 native** (2× the rest because they render at hero size in the detail panel)
- Grid tile display: 64px (1:1 for items/materials; 2× downscale for upgrades — clean integer)
- Detail-panel hero display: **128px** (1:1 for upgrades; 2× upscale for items/materials — clean integer)

Single source per sprite, clean integer scaling at both surfaces. Never display at fractional scale — pixel art aliases badly.

## Layout Lock for Dynamic Rows

Any row that conditionally shows/hides a red warning indicator, a delta pill, or any emoji-based inline marker must not push surrounding content up or down when its state changes. The orders-modal preview rows and section headers codify the pattern — reuse verbatim anywhere a row swaps state.

1. **Keep the conditional element in the DOM always**; toggle an `.on` / `.warn` class that flips `opacity: 0 → 1`. Never `display: none`, `visibility: hidden`, or empty-`textContent` for an ephemeral indicator — those remove layout and reshape the row.
2. **Lock `line-height` on the row** to the line-box of its tallest inline child. Inline emoji have naturally taller line-boxes than VT323/Press Start 2P glyphs; without a locked line-height the row grows ≈1px when the emoji becomes visible.
3. **Delta / badge spans must be `display: inline-block`** with their own fixed `line-height`. Inline spans with padding can shift surrounding text baselines by a subpixel in some browsers' line-box math.
4. **Section headers containing mixed font sizes use `align-items: center` + `min-height`** — never `align-items: baseline`. Baseline alignment with mixed fonts + an animated child that creates a stacking context (e.g. `filter: brightness()` pulse) can subtly recompute the row baseline and shift everything below.

## Inline Tier Descriptions

Plain-language one-sentence tier descriptions (e.g. `"Arrive fastest. Bleed fuel and crew. Not a drill."` next to PLAID) ride **inline in the section header**, right of the section label, same row:

- VT323, 15px, italic, `opacity: 0.85`, body-color
- `flex: 1` so the desc fills available row width and pushes any right-side content (like a warn badge) to the far edge
- `white-space: nowrap; overflow: hidden; text-overflow: ellipsis` for narrow widths

Tier descriptions translate abstract numbers (multipliers, day counts) into vibe the player can remember. Every stepped-tier picker in the UI should have them.

## Tooltips

Every informational hover target in the game eventually wears a **custom tooltip**, not the browser's native `title=`. Native tooltips use the browser chrome font, wrong palette, and have a 500ms+ OS-controlled delay — they break the retro-pixel aesthetic instantly, the same reason `<select>` is banned.

**Current state**: shipped demos still use native `title=` as a placeholder; `demo-growbay.html` (multi-line species/stage tooltip) and `demo-inventory.html` (provenance) carry the richest copy. The actual `.ui-tip` primitive is built and live in `demo-tooltip.html` — design iteration surface for the engine, registry, tones, and devtool. Promotion of the `.ui-tip` CSS + `Tooltip` IIFE into `resources/shared.css` + `resources/shared.js` happens when the design is signed off; until then `demo-tooltip.html` is the source of truth.

**Component contract** (`.ui-tip`, as built in `demo-tooltip.html`):
- Hover target declares `data-tip="<key>"` keyed to a registry entry, OR per-element override attrs (`data-tip-title`, `data-tip-description`, `data-tip-tone`, `data-tip-anchor`, `data-tip-rows`, `data-tip-list`). Hybrid API: registry by default, inline overrides for one-offs.
- Schema: `{ title?, description?, rows?: [{label,value}], list?: [{text, current?}], tone?, anchor? }`.
- Tones: `default` (gold/cream), `warn` (orange), `danger` (red), `good` (teal), `quote` (italic VT323 for AI-voiced hovers).
- Panel: slate-blue bg `rgba(17,22,34,0.95)`, 1px tone-colored border, 10px padding, VT323 14px body, Press Start 2P 10px tone-colored title. `▸` markers on `list[i].current` items, recolored to the active tone.
- Anchor default: element-anchored above-center with auto-flip near viewport edges (top → flip below; horizontal clamp). Cursor-follow opt-in via `data-tip-anchor="cursor"`, used for big hit areas (minigame canvases, large map regions).
- Behavior: 50ms open delay (near-instantaneous, guards against fly-throughs), 80ms fade-in, no close delay. Hides on scroll/resize/Esc and on `PauseBus` pause.

**Migration rule**: when we wire the component in, every existing `title=` in demos is ported to `data-tip=` verbatim. The copy is already correct — it was authored for this system.

**Consolidation audit rule** (engine-layer phase): when collapsing the demos into the unified shell, every interactive UI element gets a yes/no pass: *does this need a tooltip?* The answer is often no — a labelled button doesn't need one, a section header doesn't need one, a literal caption doesn't need one. But the question must be asked once per element, never skipped, because the principle is "consider every element," not "tooltip every element." Surfaces that don't get audited end up with inconsistent affordance — some hovers reveal information, some don't, players can't predict which is which.

If the answer is yes, the next question is *shared registry key, or inline context override?* Shared keys live in the tooltip registry (currently inline at the top of `demo-tooltip.html`, eventually promoted to `resources/tooltips.js`) and are reused across screens — `resource_fuel` would appear in cruise + orders + encounter HUD reading the same entry. Inline `data-tip-title=…` is reserved for one-offs that don't generalize (devtool labels, surface-specific lock reasons, debug readouts). Keeping shared vs. context-specific separate matters because copy drift across screens is the failure mode this whole system exists to prevent.

Skip the audit only when the answer is already in: elements that already carry a `title=` placeholder (the migration rule covers those), elements explicitly tagged for a tooltip in their demo spec, or elements that are obviously informational on their own (already-labelled crew portraits, resource bars whose visible label IS the data). For everything else — including elements that "feel" self-explanatory — the question gets asked, the decision gets logged in the registry or noted as a deliberate skip, and the next element gets audited.

**The deliverable of the audit is a list, not a tooltip.** Two columns: element selector / surface, decision (shared key | inline | skip + why). Pass the list before writing tooltip code so the registry can be designed against the full set rather than grown ad-hoc. The list also surfaces the natural-grouping question — when three screens all want hover copy on "morale," that's one shared key, not three.

## Scale-unit / mixed-glyph row jitter

A row whose text content can swap between "has a non-Latin glyph" (e.g. `→`, emoji, box-drawing chars) and "plain Latin only" will jitter ~1–2px as the line-box recomputes to the tallest glyph. Seen first on the growbay `NEXT STAGE` row where `Flowering → Maturing in ~14 days` rendered taller than `Plant is READY to HARVEST!`.

Fix: lock `line-height: 1` (or a fixed px value ≥ the tallest expected line-box) on the value span. Same principle as the layout-lock pattern above, applied to text-content changes rather than toggled DOM nodes.

## The Divergence from SSL

| Aspect | SSL | Trans-plant |
|---|---|---|
| Primary accent | Cyan `#06b6d4` | Gold `#c8a85a` + teal `#8cc890` |
| Feel | Cold, institutional, investigative | Warm, retro-futuristic, adventurous |
| Borders | Sharp outset/inset gray | Gold rounded double-borders |
| Buttons | Gray gradient with cyan text | Cream or teal gradient with gold border |
| Background | Dark navy gradient | Deep charcoal to void black |
| Decoration | None | Halftone corners + canvas stars + horizon glow |

## Map Design

The map is a **popup modal** opened from the cruise screen, not a fullscreen view. Same chrome family as inventory / growbay / crew (gold border, scale-in animation, dimmed cruise-ghost backdrop). Layered on top of the live cruise scene so the player keeps context for "where am I in the journey vs. what's about to happen on-ship."

**Layout**: horizontal left-to-right, NOT vertical, NOT corner-to-corner.

**Node placement (procgen-ready)**: nodes carry only logical coords — `depth` (column index along the spine) + `lane` (signed offset, 0 = on-spine, ±1 = branch up/down). Pixel x/y are computed by `layoutNodes()` at render time. This means any procedurally-generated topology — 5 nodes or 25, one fork or four — auto-fits and centers in the current viewport. Two-pass layout:
1. Bounding-box fit on x-axis (depth uses full width); fixed-pixel lanes on y-axis (spine sits on viewport centerline; branches at consistent visual distance regardless of how many lanes a trail uses).
2. Per-node id-hashed jitter so the spine wobbles organically and forks aren't perfect mirrors. Deterministic — same trail always lays out the same.

**No-go zones**: the legend (bottom-left) and modal-header buffer (top strip) are repulsion zones. Any node landing inside gets pushed out along the shortest in-viewport exit.

**Node visuals**: small circles color-coded by type (station / planet / derelict / asteroid / anomaly / nebula / void). White-border silhouette ring keeps dark-fill types (void, derelict) readable against the bg. Lines connect nodes; branch detours = multi-node parallel paths (Slay the Spire shape), not single-node spikes.

**State by-glance**:
- Current position: pulsing color halo + YOU ARE HERE pointer
- Visited: full color + small outcome glyph in the corner (★ loot, ⇄ trader, ⚔ combat, ⚠ disaster, · empty) — turns the map into a journey diary
- Future-scanned: dimmed type color, threat-tinted connection lines (red high / amber low / soft-green none) for at-a-glance danger map
- Future-unscanned: neutral gray fill, neutral gray line — no info leak before scan

**Decision support**:
- Days-per-leg labels rendered on every connection line so resupply planning doesn't require clicking each node.
- Click a future node → sets it as route target. Path from current node highlights in bright gold and the info panel shows ROUTE summary (days / hops / threat counts).
- Hover-preview-route → temporarily projects the route to the hovered node without committing. Lets a player at a fork "feel out" each branch before clicking.

**Trail rules** (canonical, drawn from GAME_BIBLE.md §4.29 + Region weirdness curve):
| Trail | Spine | Forks | Days/leg | Charted ramp | Threat ramp | Voids |
|---|---|---|---|---|---|---|
| Lunar | 10 | 1 | ~9 | 100% → 90% | 0% → 5% high | no |
| Mars | 13 | 2 | ~14 | 95% → 55% | 5% → 25% high | no |
| Interstellar | 15 | 3 | ~28 | 90% → 15% | 5% → 55% high | yes (back half) |

Charted + threat are interpolated linearly from start→end across the spine, so early nodes skew civilized and late nodes skew toward the trail's flavor. First and last spine nodes always stations.

---

## Modal popup conventions

Every popup modal in the game (inventory, growbay, crew, map, future stop menu / fabricator / pause / etc.) follows the same close conventions, the same chrome shape, and the same backdrop pattern. **Any new modal MUST implement all four close paths and the dimmed cruise-ghost backdrop.**

**Close paths (all four required)**:
1. **`X` button** — top-right corner of the modal header, 26×26 with 2px border tinted to the modal's accent color
2. **Back / contextual button** — labeled per modal ("BACK TO CRUISE", "CLOSE", "DISMISS")
3. **Backdrop click** — clicking the dimmed area outside the modal closes it
4. **`Escape` key** — keyboard shortcut, listened on `document` while `body.modal-open` is set. Standard convention; players expect it

**Chrome shape**:
- 3px solid border in the modal's accent color (per-modal: inventory cyan-blue, growbay green, crew steel-gray, map gold). Each modal "owns" its own border color so the player can tell which screen they're on at a glance.
- 6px border-radius
- Layered box-shadow: `inset 0 0 0 1px <accent at 18%>, inset 0 0 0 2px rgba(14,20,32,0.5), 0 8px 40px rgba(0,0,0,0.8)`
- Background: `linear-gradient(180deg, #141a28, #0a0e18)`
- Open/close transition: `opacity` + `transform: scale(0.96) → scale(1)` over 0.25s

**Backdrop**:
- The cruise screen behind the modal stays visible but dimmed (filter: brightness(0.35)) so the player keeps "I'm still on my journey, this is a window into a system" context. Ghost-cruise pattern: header strip (ship name + day counter) and bottom HUD strip rendered in dim form behind the modal.
- A semi-opaque overlay on top of the ghost (`rgba(4,8,16,0.75)`) handles backdrop-click-to-close.

**Header structure**:
- Modal-specific title in `Press Start 2P` at the modal's accent color (cyan / green / steel / gold)
- Subtitle / meta on the same row (slot count, day, etc.)
- Close `X` flush right

**Implementation status**: inventory, growbay, crew, map = ✅ following the pattern. The remaining popups (stop menu, fabricator, station interior overlay) need to be retrofitted to match — particularly ESC support, which is a recent add to the convention.

The **Pause Menu** is intentionally OUTSIDE this modal convention — it's a *meta layer*, not an in-game modal. See "Pause Menu (Bridge Terminal overlay)" below.

---

## Pause Menu (Bridge Terminal overlay)

**Authoritative implementation:** `resources/shared.js` (PauseBus + PauseMenu IIFE) + `resources/shared.css` (`.pause-overlay` + descendants). Iteration surface: `resources/demo-pause.html`. Memory: `project_transplant_pause.md`.

The pause menu is a **deliberately divergent visual register** from the rest of the game — captain's-terminal aesthetic, amber-on-near-black, monospace, hard edges, faint scanlines. Every other surface uses the warm gold/teal/cream palette; pause is monochrome amber so the player reads "stepped outside the game" the moment it appears.

**Triggers**: ESC only. Suppressed when `body.modal-open` is set, so per-demo modals retain ESC for closing themselves.

**Mounting**: shared.js auto-mounts the overlay inside `#game` (or `#scale-root`, fallback `<body>`) at `position: absolute; inset: 0`. The menu fills the 960×640 game frame the way the spec calls for — "full-screen takeover within the scale-root."

**Sections**: RESUME / SETTINGS / SAVE / LOAD / SHIP'S LOG / HELP / QUIT. Sidebar uses 32×32 PNG mask icons recolored via `currentColor`, so they tint amber on idle, amber-bright on selected/hover, red on QUIT — automatically. Save/load slots are intentionally cosmetic (real localStorage, stub content) until the central STATE refactor lands.

**Tunable CSS vars**: every palette + sizing value is a `--pause-*` custom property exposed on `:root`. demo-pause.html's TUNE panel exposes color pickers + sliders for each. Defaults locked in 2026-05-06: see `project_transplant_pause.md` var table.

**Scanlines** match the canonical Trans-plant CRT overlay (`rgba(0,0,0, 0.05)` at 1px/2px) — see "CRT Scanlines" section above. Pause repaints the same recipe inline because it sits above `#crt-overlay`'s z-index. Don't tune scanlines per-surface; the standard filter is the standard filter.

**Pause hooks**: every demo's rAF loop checks `PauseBus.paused` at the top of every frame. Add the same one-line check when you build a new demo — without it, the demo's animation runs through the menu open. `makeTimer` (in `demo-minigames.html`) shifts its anchor on resume so deadlines stay correct; per-demo `setTimeout`-based timers keep ticking under pause for now (acceptable MVP, refactor in the STATE pass).

---

## Cursor system (custom pixel-art cursors)

shared.js bakes 2 always-on pixel-art cursors at script load and exposes them as CSS vars on `:root`:

- `--cursor-pointer` — arrow, default for non-interactive surfaces (html/body)
- `--cursor-hand` — finger, anything you CAN do (click OR drag)

**No closed-fist "grab" variant.** Removed 2026-05-06. Draggable elements (sliders, scroll thumbs, water tracks, drag-and-drop puzzle pieces) keep the hand cursor the whole way through the drag. Reasoning: the cursor flicker between hand → fist → hand felt twitchy, and the press-state visual feedback is already carried by the element itself (border bevel inversion on `.panel-btn`, brightness lift on `.scroll-thumb:active`, etc.).

Reticle cursors for minigame contexts are separate — `CURSOR_CONTEXTS` in shared.js maps context tags (`medical_scan`, `mining`, etc.) to parametric reticles. Wire a new minigame by adding a row to `CURSOR_CONTEXTS` and calling `generateCursor('<tag>')`.

---

## Encounter Screen UI (event/hail/conversation surface)

Authoritative implementation: `demo-encounter.html`. Canonical bible spec: §18 "Encounter Screen". Visual conventions worth knowing system-wide:

### Subject frame (talking-head)

- Square `--subj-size` × `--subj-size` (default 160px), positioned at left edge with `--subj-top` vertical offset (default 60px)
- Border: `--subj-border-w` solid `--subj-border` (default 2px solid `#545F5C`)
- Corner brackets: 4-cornered HUD-style tabs in `--subj-corner` (default gold) — independent of frame border color
- Crew/NPC sprite renders at 96% inside the frame (`overflow: hidden` clips strays)
- Name plate sits below the frame as a sibling element (NOT inside, so it isn't clipped by the frame's overflow)

### Comm-mode overlay (`comm-{in-person|screen|corrupted}` class on `.enc-subject`)

- **Screen** — repeating horizontal scanlines + radial vignette + green-phosphor `hue-rotate(-10deg) saturate(0.85)` on the head + `comm-flicker` 5.5s cycle (two quick brightness pops, one dim — reads as "marginal power on old hardware"). Use for hails, security cams, viewscreen comms.
- **Corrupted** — purple-shifted scanlines (`rgba(160,90,200,0.22)`) at 1px cadence + 3-step `head-glitch` 1.2s ±2px translate with hue shift. AI bar gets matching corrupted treatment (split RGB shadow, purple tint). Use for void / cosmic-horror moments.
- **In-person** — no overlay, clean portrait. Default for stations, on-ship rooms, planet surface.

### Dialog strip (NPC speech)

- Anchored under the subject's name plate, width tracks `--subj-size` with a 240px floor
- Italic VT323, gold border (`rgba(200,168,90,0.4)`), 3px border-radius
- Contains the speaker's spoken words ONLY — rendered as `"..."` with quote marks
- Auto-hides when the layer has no `line:` field or scenario is `noSubject`
- Companion to the subject's name plate above it (which serves as speaker attribution)
- **Hard rule:** character speech belongs here, not in the bottom narrator panel. Never embed `'quoted speech'` in `body:` — split it into `body:` (narrator prose) + `line:` (the spoken words).

### Choice button accent strip

- `--strip-c` custom property carries the variant accent color across all states. Variants:
  - default → `var(--gold)`
  - `.risky` → `var(--choice-risky)` (red)
  - `.hint` → `var(--teal)`
  - `.locked` → `rgba(95,100,115,0.4)` (gray)
  - `.leave` → `var(--red)`
- Default strip side: **right** (5px thick), via `.accent-right` class on the choices container. Left-mode (3px) preserved as a dev toggle.
- Hover border mirrors `--strip-c` (variant-aware) — risky hovers red, hint hovers teal, leave hovers red.
- **Leave button** (always-present exit/abort row) — uniform 3px border on all four sides, no asymmetric strip. The thicker uniform border replaces the strip's accent role.
- Entrance animation: top-to-bottom staggered fade (40ms × 180ms per button), `pointer-events: none` until whole group lands.

### Effort pip system

- `●●●○○` filled vs empty out of 5 (VT323 11px, gold)
- Visualizes the always-on morale tax of an action
- Hover the whole button for the full breakdown (effort tax + action-specific costs + risk hint)
- Locked actions skip tooltip — show `🔒` icon + inline "Need: X + Y + Z" instead

### Backdrop layer naming

`enc-backdrop-base` (z=0) → `enc-backdrop-sprite` (z=1, 640×405 at (160,93)) → `enc-backdrop` (z=2). Driven by per-scenario / per-layer `bg`, `bgBase`, `bgSprite` fields. See bible §16 + §18 for full convention.

---

## Sprite Folder Convention (interface icons)

All UI icons — anything that's a *picture-of-a-thing-as-a-button-or-indicator*, not a character or background — live under `sprites/interface/`. Sub-organized by purpose so future additions just drop into the right subfolder.

```
sprites/interface/
  engines.png  rations.png  water.png  plant.png  crew.png         (HUD icons; cruise + orders demos)
  diplomat.png  medic.png  engineer.png  xeno.png                   (gate icons, 32×32; encounter demo)
  analyzer.png  kit.png  gold.png  lock.png                         (gate icons, 32×32)
  AI/
    aria.png  marv.png  rex.png  chip.png  ajoy.png                 (AI companion avatars)
  careers/
    academic.png  botanist.png  chef.png  diplomat.png  engineer.png
    medic.png  merchant.png  pilot.png  veteran.png  xenobiologist.png  (10 captain backgrounds)
  crops/
    wheat.png  tomato.png  potato.png  soybeans.png  zinnia.png     (5 crop icons used in setup + growbay pickers)
  trails/
    moon.png  mars.png  interstellar.png                            (3 trail/route icons; setup demo)
```

**Why one umbrella folder:** most of these (trail / career / AI / crop / gate) are setup-screen-or-picker assets. Grouping them under `interface/` means a future "add new career" or "add new AI companion" is a single file dropped into the obvious subfolder — no decision about where in `sprites/` it should live. New subfolder types (e.g., `interface/factions/` or `interface/skills/`) follow the same pattern when they show up.

**Naming clash note:** `interface/diplomat.png` (32×32 gate badge), `interface/careers/diplomat.png` (larger career card icon), and `sprites/crew_sprites/spritesheet_hargrove.png` (the actual crew member playing the diplomat role) are three distinct assets serving three distinct contexts. The folder disambiguates. Same overlap pattern for `medic`, `engineer`, `xenobiologist`.

**What stays at `sprites/` root:** anything that ISN'T a UI icon — `backgrounds/`, `cargo/`, `crew_sprites/`, `fabricator/`, `growbay/`, `npc/`, `ships/`. These are world-content sprite collections (gameplay surfaces, character art, item pictures), not UI chrome.

## Crew Sprite Atlas Pattern (talking heads + portraits + icons)

Each crew member's spritesheet packs three asset types into one PNG:
- 9 talk/idle frames (96×96 in 3×3 grid)
- A static portrait (~80×192)
- A small icon (48×48)

Coords for each region come from the per-crew `.json`. Demos that show a crew member's icon or portrait use the helpers `crewIconCss(crewId, sizePx)` (small icon crop) or `applyCrewPortrait(el, crewId, w, h)` (full portrait, paints into a sized child element so neighbor sheet content can't bleed through). Both helpers + the `CREW_ATLAS` data table now live in **`resources/shared.js`**. Demos that need them just `<script src="shared.js"></script>` and call them from their IIFE — no inline copies.

Captain is the exception — separate `captain.png` + `captain_icon.png` files (no spritesheet — captain doesn't talk to themselves yet); the helper detects via the `fileIcon`/`filePortrait` keys in `CREW_ATLAS` and falls through to direct URL.

The `applyCrewPortrait` helper is critical to use as designed — it injects a `.cd-portrait-sprite` child element sized to *exactly* the displayed portrait region. Without that child, the parent box (typically wider than the 80px portrait) lets the sheet's other regions (talk frames + icon) render alongside it. This was the "ghost-Osei" bug fixed in demo-crew during the cruise stop-upgrade pass.

---

*Reference images: see `design-ref-*.png` in resources/ (warm retro UI kit screenshots)*
*When adding new UI elements, check this document first. When something doesn't fit, update this document before building.*

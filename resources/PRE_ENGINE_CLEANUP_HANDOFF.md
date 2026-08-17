# PRE-ENGINE CLEANUP — HANDOFF

> Fixes the demo layer before the engine is built on top of it.
> Work through tasks in order — each is independent but later tasks assume earlier ones are done.
> No new features. No new files except where noted. Nothing that changes visible demo behaviour.
> When complete, every shared system has one authoritative source and every demo is wired to it.

---

## Task 1 — Add `shared.js` to `demo-engine-repair.html`

**Why:** `demo-engine-repair.html` is the only demo that does not load `shared.js`. As a result it has no PauseBus, no cursor system, no MarketModal, and no access to any shared utility. It is isolated from the foundation everything else sits on.

**Files:** `demo-engine-repair.html`

**Steps:**

1. Before the inline `<script>` tag (currently the only script tag, line 461), add:
   ```html
   <link href="shared.css" rel="stylesheet">
   <script src="shared.js"></script>
   ```

2. Find every `requestAnimationFrame` loop in the file. At the top of each loop function, before any draw logic, add the PauseBus guard. Pattern to follow (from `demo-cruise.html`):
   ```js
   if (PauseBus.paused) { lastT = now; requestAnimationFrame(loopFnName); return; }
   ```
   Replace `lastT` with whatever timestamp variable that loop uses, and `loopFnName` with the actual function name.

3. No cursor changes needed in this task — once `shared.js` loads, `refreshCursorVars()` runs automatically and `shared.css` applies `var(--cursor-pointer)` and `var(--cursor-hand)` to `html`, `body`, `.panel-btn`, and `.scroll-thumb` globally. The raw `cursor:` rules already in the file will be addressed in Task 4.

**Acceptance:** Open `demo-engine-repair.html`. Press ESC — the Bridge Terminal pause overlay should appear. The pixel-art cursor should be visible. No console errors about undefined globals.

---

## Task 2 — Promote `CRATE_POOLS` to `shared.js`

**Why:** `CRATE_POOLS` is defined locally inside the IIFE in `demo-minigames.html`. `demo-mining.html` has a comment reading "mirrors CRATE_POOLS.asteroid from demo-minigames" and carries its own inline copy. When the engine runs, both demos need to draw from the same authoritative loot table. Keeping two local copies means they can drift silently.

**Files:** `shared.js`, `demo-minigames.html`, `demo-mining.html`

**Steps:**

1. In `shared.js`, in the Asset Pool section (after `resetPickCache` and before the Pause System section), add the following as a **module-level constant** (not inside any function or IIFE):

   ```js
   // Loot pools by scene context. Weighted random draws via rollCratePool() below.
   // r = resource/material id matching materials.json. w = relative weight.
   const CRATE_POOLS = {
     asteroid: [{r:'minerals',w:6},{r:'scrap',w:6},{r:'metal',w:3},{r:'exotic',w:1},{r:'biocomponent',w:1}],
     deepspace: [{r:'metal',w:5},{r:'exotic',w:3},{r:'scrap',w:2},{r:'biocomponent',w:1}],
     space:     [{r:'metal',w:5},{r:'exotic',w:3},{r:'scrap',w:2},{r:'biocomponent',w:1}],
     planet:    [{r:'biocomponent',w:6},{r:'minerals',w:3},{r:'metal',w:2},{r:'scrap',w:2}],
   };
   ```

2. In `demo-minigames.html`, find the local `const CRATE_POOLS = {` declaration (line 4609) and **delete it**. The IIFE will now resolve `CRATE_POOLS` from the shared global scope. Verify nothing else in the IIFE shadows it.

3. In `demo-mining.html`, find the comment `// Loot pools (mirrors CRATE_POOLS.asteroid from demo-minigames)` and any local copy below it. **Delete the local copy.** Update the comment to:
   ```js
   // CRATE_POOLS defined in shared.js — use CRATE_POOLS.asteroid directly.
   ```
   Verify all references to `CRATE_POOLS` in `demo-mining.html` now resolve from the shared global.

**Acceptance:** Both `demo-minigames.html` and `demo-mining.html` open without console errors. Mining and salvage loot still drops. No local `CRATE_POOLS` declarations remain in either demo file.

---

## Task 3 — Wire `PauseBus` into `demo-shipslog.html`, `demo-npc.html`, `demo-endings.html`

**Why:** These three demos load `shared.js` but do not check `PauseBus.paused` in their animation loops. Pressing ESC opens the pause overlay but their animations keep running underneath it.

**Files:** `demo-shipslog.html`, `demo-npc.html`, `demo-endings.html`

**Pattern to insert at the top of each rAF loop, before any draw logic:**
```js
if (PauseBus.paused) { <timestamp_var> = now; requestAnimationFrame(<loop_fn>); return; }
```

**Per-file specifics:**

**`demo-shipslog.html`** — Find the `drawStars` function. It uses `starLast` as its timestamp variable. Insert:
```js
if (PauseBus.paused) { starLast = now; requestAnimationFrame(drawStars); return; }
```

**`demo-npc.html`** — Find the `tick` function (inside the card animation system, around line 395). It uses `now` but may not have a named timestamp holder — check the actual variable name at the top of the loop. If the loop has no early-return timestamp, add one:
```js
if (PauseBus.paused) { requestAnimationFrame(tick); return; }
```
This is safe for NPC talk animation — pausing mid-frame just holds the current frame.

**`demo-endings.html`** — Find the `drawStars` function (around line 689). It uses `starLast` as its timestamp variable. Insert:
```js
if (PauseBus.paused) { starLast = now; requestAnimationFrame(drawStars); return; }
```

**Acceptance:** In each of the three demos, press ESC. The pause overlay appears. Stars and animations freeze. Press ESC again or click RESUME — animations resume from where they stopped. No console errors.

---

## Task 4 — Replace raw `cursor:` CSS rules with shared CSS vars

**Why:** `shared.js` bakes pixel-art cursors into `--cursor-pointer` and `--cursor-hand` CSS vars on every page load. `shared.css` applies them to `html`, `body`, `.panel-btn`, and `.scroll-thumb`. Any demo CSS rule that hardcodes `cursor: pointer` or `cursor: grab` bypasses this system entirely, making those elements fall back to the OS cursor instead of the game cursor.

**Scope:** 16 demos. Do NOT modify: `demo-minigames.html` (already calls `generateCursor()` directly), `demo-mining.html` (already calls `generateCursor()` directly), `demo-pause.html` (demos `refreshCursorVars()` directly).

**Demos to fix:**
`demo-combat.html` · `demo-crew.html` · `demo-cruise.html` · `demo-encounter.html` · `demo-endings.html` · `demo-engine-repair.html` · `demo-fabricator.html` · `demo-growbay.html` · `demo-inventory.html` · `demo-map.html` · `demo-npc.html` · `demo-orders.html` · `demo-setup.html` · `demo-shipslog.html` · `demo-title.html` · `demo-tooltip.html`

**Replacement rules — apply to every inline style and `<style>` block in each demo:**

| Find | Replace with |
|---|---|
| `cursor: pointer` | `cursor: var(--cursor-hand, pointer)` |
| `cursor: grab` | `cursor: var(--cursor-hand, grab)` |
| `cursor: grabbing` | `cursor: var(--cursor-hand, grabbing)` |
| `cursor: default` | `cursor: var(--cursor-pointer, default)` |

**Do NOT replace:**
- `cursor: not-allowed` — no shared equivalent, leave as-is
- `cursor: crosshair` — no shared equivalent, leave as-is
- `cursor: text` — no shared equivalent, leave as-is
- `cursor: move` — no shared equivalent, leave as-is
- Any `cursor:` rule inside a `.show-bbox` debug block — leave debug tooling untouched
- Any `cursor:` rule that is already using a CSS var

**Acceptance:** Open any fixed demo. Interactive elements (buttons, choices, scrollbars, clickable nodes) show the pixel-art hand cursor on hover. The default surface shows the pixel-art pointer cursor. No element reverts to an OS cursor during normal use.

---

## Task 5 — `scatterLayout` dead-code comment in `shared.js`

**Why:** `scatterLayout` is defined in `shared.js` but called by zero demos. It is intentionally reserved for the engine layer. Without a comment, it looks like a bug or an oversight.

**File:** `shared.js`

**Step:** Find `function scatterLayout(n, opts) {` (line 826). Directly above it, replace the existing block comment that describes it with:

```js
// ENGINE-LAYER ONLY — not called by any demo.
// Reserved for Phase 2 procedural placement: asteroid fields, NPC cluster
// seeding, item scatter on salvage surfaces. Do not delete; do not call
// from demos. See GAME_BIBLE.md §9 (Map Generation) for intended use.
function scatterLayout(n, opts) {
```

**Acceptance:** The comment is present. The function body is unchanged. No other file references `scatterLayout`.

---

## Task 6 — `tag_registry.json` version alignment

**Why:** `tag_registry.json` declares `"version": "0.1"` in its `_meta` block. The game bible is at version 0.7. The registry has been updated through 0.7 (NPC tags, combat tags all present). The version mismatch causes unnecessary confusion about whether the file is current.

**File:** `registry/tag_registry.json`

**Step:** In the `_meta` block at the top of the file, change:
```json
"version": "0.1"
```
to:
```json
"version": "0.7"
```

**Acceptance:** `tag_registry.json` parses valid JSON. Version reads 0.7.

---

## Task 7 — `starbound-trail/` path cleanup

**Why:** Two documentation files still reference the old `starbound-trail/` directory name in their project structure trees. The project folder is `trans-plant/`.

**Files:** `GAME_BIBLE.md`, `CLAUDE_file.md`

**Steps:**

1. In `GAME_BIBLE.md` around line 1924, find the project structure tree entry showing `starbound-trail/`. Replace with `trans-plant/`.

2. In `CLAUDE_file.md` around line 28, find the matching reference. Replace with `trans-plant/`.

**Acceptance:** Neither file contains the string `starbound-trail`. Both parse and read correctly.

---

## Task 8 — Engine note: `items.json` `_section` objects

**Why:** `items.json` contains non-item separator objects with a `_section` key and no `id` field. These are authoring annotations, not items. The engine must filter them when loading the items array or it will attempt to treat them as item definitions.

**File:** `CLAUDE_file.md`

**Step:** In `CLAUDE_file.md`, in the section covering engine loading of module files (Phase 2 engine notes), add the following note:

```
### items.json — filter _section objects on load

items.json contains annotation objects of the form { "_section": "..." } with no id field.
These are authoring separators, not items. The engine must filter them before processing:

  const items = rawItems.filter(entry => !entry._section);

Apply this filter immediately after JSON.parse. Do not modify items.json itself.
```

**Acceptance:** Note is present in `CLAUDE_file.md`. `items.json` is not modified.

---

## Completion Checklist

- [ ] `demo-engine-repair.html` loads `shared.js` and `shared.css`
- [ ] `demo-engine-repair.html` PauseBus guards in all rAF loops
- [ ] `CRATE_POOLS` defined in `shared.js`, removed from `demo-minigames.html` and `demo-mining.html`
- [ ] `PauseBus.paused` guard in `demo-shipslog.html` drawStars
- [ ] `PauseBus.paused` guard in `demo-npc.html` tick
- [ ] `PauseBus.paused` guard in `demo-endings.html` drawStars
- [ ] All 16 target demos: `cursor: pointer/grab/default` replaced with CSS vars
- [ ] `scatterLayout` engine-layer comment in `shared.js`
- [ ] `tag_registry.json` version bumped to 0.7
- [ ] `starbound-trail/` replaced with `trans-plant/` in GAME_BIBLE.md and CLAUDE_file.md
- [ ] `items.json` filter note added to `CLAUDE_file.md`

---

## Out of Scope (do not touch in this pass)

- Tooltip audit and `data-tip` wiring — separate session, all demos
- `demo-encounter.html` local `probeImage`/`pickFromList` migration — flagged in `shared.js` comments, separate cleanup pass
- Engine build — starts after this checklist is complete
- Any content changes to JSON module files
- Any new features or visual changes

---

*This handoff closes the pre-engine cleanup phase. When the checklist is complete, the wiring matrix from `transplant-wiring-map.html` should show no critical red edges on Tab 1 and no ✗ in the `shared.js loaded` and `PauseBus wired` columns on Tab 3.*

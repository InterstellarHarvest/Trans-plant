# 🌿 The Verdant Ark — Engine & Scene System Redesign

> **Status:** Phase 1A draft. Supersedes the single-viewport metaphor in `VERDANT_ARK_BIBLE.md` (Scene System, UI Layout) and demotes `PROMPT_bg_viewport_primary.md` to a cruise-only background brief.
> **Posture:** Walking skeleton first. Define every system. Implement four scene templates and the keystone modal. Reserve the rest. Then write `launch_from_kepler` against a real foundation.

---

## 1. SSL Patterns Ported to VA

Space Sprout Sleuth shipped a working DOM-driven state machine. Roughly 80% of VA's runtime needs are already proven there. These patterns port directly:

- **`#scale-root` + `transform: scale()`** — 960×640 root, scaled to fit any viewport. Solves "looks right on every device" for free.
- **Two-column persistent shell** — `#scene-wrap` (left) + right column (speaker bar pinned top, info area scrollable middle, action grid pinned bottom). The shell never gets torn down; templates rearrange its contents.
- **Stacked-canvas scene layering**, with one new layer added for VA:
  1. Procedural fallback canvas (bottom)
  2. Behind-PNG FX canvas (stars, drift)
  3. Background PNG `<img>` (the location)
  4. **NEW: Sprite overlay layer** (NPCs, props, ship, animated elements)
  5. On-top FX overlay canvas (dust, particles, screen FX)
  All FX throttled to ~15fps.
- **Pixel art commitments** — PNGs at native resolution, `image-rendering: pixelated`, 2× CSS upscale. Procedural canvas is fallback only.
- **Spritesheet system** — TexturePacker JSON for frame coordinates, dedicated canvases for blitting, spritesheet cache, emoji fallback if a sheet fails to load.
- **Dialogue engine (~150 lines)** — keep verbatim. Nodes have `text` + `options[]`. Options filtered by `meetsRequirements()` supporting `clueFound`, `nodeVisited`, `actionTaken`, `flagSet`, `moodIsNot`, `stateIs`. Effects via `applyNodeEffects()`. Auto-restart at start node on re-entry. SSL ran 298+ nodes on this engine.
- **Typewriter text** — 33ms/char, click-to-skip, per-entry progress in state, fully-read entries show instantly on revisit. VA log entries use this exact behavior.
- **Mood/personality system** — numeric `moodValue`, per-NPC personality thresholds (patient, professional, prickly, stressed, stoic), softlock prevention rule (locked nodes still reveal critical info). VA crew members use this directly.
- **Per-location palette** — every location declares `palette.bg` applied to `sceneWrap.style.background`. Cheap, effective.
- **Campaign hot-swap** — `setActiveCampaign(idx)` swaps active spritesheets and data set. **VA's three trails (Lunar, Mars, Generation Ship) use this exact pattern.** Trail switching is campaign switching.
- **Save/load** — single global `STATE` object, auto-saved to `localStorage` after every change.
- **Visual stack** — Press Start 2P (headers), VT323 (body), CRT scanline overlay, retro beveled borders, dark navy gradients, cyan accent (`#06b6d4`), `.retro-btn` with outset/inset press.

**What's new in VA on top of SSL:**
1. The sprite overlay layer (above).
2. A **scene template router** instead of SSL's single layout (§3).
3. A **modal system** for paused overlays (§4).
4. A **tooltip helper** for hover/long-press readouts (§5).
5. **Per-event composition data** (§6).
6. The **economy and fabricator** primitives (§8, §9).

---

## 2. UI Surface Tiers (the rule)

Three tiers. Pick the right one for the information.

| Tier | When | Behavior |
|---|---|---|
| **Glance** | Ambient awareness. Value visible passively in the status strip. | No interaction. Just there. |
| **Tooltip** | 1–3 lines of factual readout. No decisions, no scrolling. | Hover (mouse) or long-press (touch). Ephemeral. Game keeps running. |
| **Modal** | Decisions, deep inspection, anything needing buttons or scrolling. | Click. Pauses game, dims background, owns input until dismissed. |

**Examples:** Day counter = glance. Fabricator health LED = glance + tooltip. Crew portrait = glance + tooltip + modal on click. Part request ("need a hull patch") = modal only (no glance, no tooltip — it's a decision moment, not a status surface).

If you can answer it in three lines without buttons, it's a tooltip. If it needs a button, it's a modal. If it's just a number you read in passing, it's glance only.

Tooltips must work on touch. Long-press to show, tap-elsewhere to dismiss, no accidental click-through. A small `tooltip.js` helper handles both input modes — spec'd in §11.

---

## 3. Scene Template Router

Replaces SSL's single `loadScene()`. The router has two entry points:

```js
enterScene({
  template,        // one of the 10 scene templates below
  background_id,   // which background PNG
  sprite_overlays, // array of sprites + positions to render on the overlay layer
  ui,              // template-specific UI payload (right column content, etc.)
  music_cue        // optional, deferred to Phase 2
});

openModal({
  template,        // one of the modal templates in §4
  payload,         // template-specific data
  on_resolve       // callback when modal dismisses
});
```

**`enterScene` swaps the full viewport.** It tears down the previous scene's right-column content, installs the new template's right-column variant, loads the background, populates the sprite overlay layer, and clears any FX from the previous scene.

**`openModal` overlays.** Pauses the game (FX loops freeze, typewriter pauses, save state holds), dims the scene behind it, renders the modal on top, owns input until resolved. Modals can stack — opening inventory from inside a part_request popup is legal, the part_request stays paused beneath. Each modal in the stack owns input only when it's the topmost.

### The 10 Scene Templates

| # | Template | Purpose | Right Column | Phase 1A? |
|---|---|---|---|---|
| 1 | `cruise` | Default state between nodes. Animated ship in viewport, parallax stars, thruster FX scaled to speed. | Status strip + speed/rations controls + chart/inventory/crew buttons | ✅ Implemented |
| 2 | `chart` | Pulled up from cruise. Slay-the-Spire-style branching map, current position, visited nodes, next-available nodes pulsed. | Legend, current waypoint detail, "resume cruise" button | ✅ Implemented |
| 3 | `scripted_waypoint` | Baked-in story node. Ceremonial. Big title card, narration, choices. Hosts `launch_from_kepler`, Derelict Station, the anomaly, etc. | Speaker bar + narration + choice grid (SSL's classic shape) | ✅ Implemented |
| 4 | `mine` | Stop the ship at an asteroid/derelict and extract materials. Drill-targeting timing minigame. | Material readout + drill controls + "leave" button | ✅ Implemented |
| 5 | `hunt` | Stop the ship to gather food at a small body / abandoned habitat. Whack-a-mole loop (engine reused from prior project). | Food readout + active targets + "leave" button | 🔲 Reserved (stub falls back to scripted_waypoint) |
| 6 | `dock` | Outpost/trader. Inventory-forward right column. Multiple NPCs with trade lists. | Inventory + trader inventory + mixed-payment composer | 🔲 Reserved |
| 7 | `hazard_crossing` | Geographic hazard with structured multi-option choice. Wide viewport showing the obstacle. | Approach options + risk readouts | 🔲 Reserved (stub falls back to scripted_waypoint) |
| 8 | `shipboard_event` | Lightweight random event interrupting cruise. Tight interior shot, narration overlay, single decision. | Narration + 2–3 choices | 🔲 Reserved (stub falls back to scripted_waypoint) |
| 9 | `loadout` | Pre-launch crew + crop selection at Kepler-9. | Selection grid | 🔲 Reserved (stub) |
| 10 | `ending` | Mission end. Resources tallied, modifiers applied (Zinnia hook, etc.), final narration. | Stats summary + restart | 🔲 Reserved (stub) |

**Phase 1A implements 4 templates fully.** The other 6 are **reserved slots in the router** with stub implementations that fall back to a generic layout. The router accepts all 10 template names from day one — the skeleton playthrough never crashes because a template is "missing"; it just renders a less-polished version of the moment. This means Phase 2 can flesh out templates one at a time without ever touching the router contract.

---

## 4. Modal Template Registry

Modals are paused overlays. Cheap to add. Each is a small framed window with a payload and a resolution.

| Modal | Purpose | Payload | Resolutions | Phase 1A? |
|---|---|---|---|---|
| `part_request` | **Keystone modal.** "You need X." Lists all viable resolution paths dynamically. | `{need_id, context_text}` | Use from inventory / Fabricate / Trade (if trader nearby) / Decline | ✅ Implemented |
| `inventory` | Browse all carried items and materials. Read-only. | none | dismiss | ✅ Implemented |
| `crew_detail` | Full info on one crew member. | `{crew_id}` | dismiss | ✅ Implemented |
| `ship_detail` | Full info on one ship subsystem (Hull, Power, etc.). | `{subsystem_id}` | dismiss | 🔲 Reserved |
| `repair_attempt` | Repair the fabricator (or other subsystem). Three paths. | `{subsystem_id}` | From inventory / Improvised / Dock-only | 🔲 Reserved |
| `trade_confirm` | Confirm a mixed-payment trade with a dock NPC. | `{item, price, trader_id}` | Confirm / Cancel | 🔲 Reserved |
| `chart_node_detail` | Click a node on the chart for info before selecting. | `{node_id}` | Travel here / Cancel | 🔲 Reserved |

### `part_request` — full spec (the keystone)

Triggered any time the game says "you need X." Opens with title (the need), a 1–2 line deadpan situation from the ship computer, then a dynamically generated resolution list:

```
NEEDED: Hull Patch
"The hull is making a sound it should not be making. Fixing this is recommended."

[ Use from Inventory ]    Hull Patch ×1 in stock        ← if count > 0
[ Fabricate ]             3 (10) iron ✓  2 (5) scrap ✓
                          Wear: −1% Fab health (currently 87%)
                          Misfire chance: 1%
[ Trade ]                 Available: Lunar Outpost merchant nearby   ← if trader in range
                          Price: 5 gold (or equivalent)
[ Decline ]               (the ship computer will have feelings)
```

Each option is generated from current state at modal open time. Greyed options show *why* they're unavailable. Red text = insufficient. Green text = sufficient. Fabricate option shows wear cost and misfire chance always — the player should never click it without seeing the risk.

**One modal does enormous work.** Repair, food shortage, medical need, fuel crisis — same shape, different needs and resolution lists. This is the consolidation that earns its keep.

---

## 5. Tooltip Helper

`tooltip.js` — small utility, not a system.

- Attaches to any element with `data-tooltip="..."` or via `attachTooltip(el, contentFn)` for dynamic content.
- Mouse: shows on `mouseenter` after 200ms delay, hides on `mouseleave`.
- Touch: shows on `touchstart` long-press (500ms), hides on tap-elsewhere or `touchend` after a short visibility window.
- Tooltips never own input. They cannot contain buttons. They cannot scroll. Three lines max as a soft rule.
- The Fab indicator is the canonical example: hover → "Fab Health: 87% / Misfire chance: 2% / Avg wear/use: 1.5%".

---

## 6. Per-Event Composition Data

Every node and event declares its scene composition in a single object. Backgrounds and sprites are reused across events — the Derelict Corridor background hosts the Derelict Station scripted waypoint *and* any future Salvage Crew shipboard event with different sprites on top.

```js
{
  id: "launch_from_kepler",
  scene: {
    template: "scripted_waypoint",
    background_id: "bg_kepler9_dock",
    sprite_overlays: [
      { sprite_id: "ship_verdant_ark", x: 120, y: 180, anim: "idle" },
      { sprite_id: "kepler_tower", x: 20, y: 40 }
    ],
    ui: {
      title: "Earth Orbital Station Kepler-9",
      day_label: "Day 1"
    }
  },
  // ...content (text, options, effects) — unchanged from the existing schema
}
```

**Content schemas (nodes, events, items, tags, gates) are unchanged.** Only the scene wrapper is new. Existing schema work in the bible survives.

---

## 7. Sprite Brief Format (rewritten once, correctly)

Every visual asset gets a brief in this format. The brief declares what kind of asset it is and which template it's for.

```
ASSET ID: bg_cruise_default
ASSET TYPE: background
SCENE TEMPLATE: cruise
DIMENSIONS: 480×320 (2× CSS upscale to 960×640)
PURPOSE: Default cruise viewport. Parallax starfield, ship-bobbing area, no UI baked in.

PROMPT (SSL prefix):
"16-color palette, chunky low-res pixel art, 1-2px black outlines, no anti-aliasing,
hard dithering for shading, CRT-era sci-fi aesthetic, muted tones with one saturated
accent color, white background."

THEN: [scene-specific description]

POST-PROCESSING CHECKLIST:
- [ ] BG remover applied
- [ ] Verify no UI elements baked in
- [ ] Verify pixel grid alignment
- [ ] Verify accent color matches palette
```

Asset types: `background`, `npc_overlay`, `prop_overlay`, `icon`, `ui_frame`.

---

## 8. Economy Primitives

**Gold is the unit of account.** Value = 1.

Every other material has a gold-denominated trade value declared in `materials.js`:

```js
{ id: "iron",   name: "Iron",   value: 0.2 },  // 5 iron = 1 gold
{ id: "scrap",  name: "Scrap",  value: 0.1 },
{ id: "exotic", name: "Exotic Element", value: 3 },
// ...
```

**Mixed payment** — any transaction can be paid in any combination of gold and materials totaling the price. Buying a 5-gold item: pay 5 gold, OR pay 3 gold + 10 iron, OR pay 25 iron, OR any combination the player composes in the `trade_confirm` modal.

**Three paths to any item** — buy at a dock, mine-and-fabricate, or barter. The player picks based on what they have, what's nearby, and whether the fabricator is functional.

Recipes live in `recipes.js`:

```js
{
  id: "hull_patch",
  output: { item_id: "hull_patch", count: 1 },
  inputs: [
    { material_id: "iron", count: 3 },
    { material_id: "scrap", count: 2 }
  ],
  wear_cost: 1   // Fab health % consumed per fabrication
}
```

**Phase 1A ships with one recipe (Hull Patch).** The recipe book grows in Phase 2.

---

## 9. Fabricator State Model

Glance + tooltip on the cruise status strip. Invisible infrastructure with a visible vital sign.

**State:**
```js
fabricator: {
  health: 100,        // 0-100, integer
  state: "functional" // "functional" | "broken"
}
```

**Wear per use** — deterministic, declared per recipe. Hull Patch = 1%, Engine Coil = 4%, etc. Same recipe, same wear, every time. Player can predict it.

**Misfire chance curve** — derived from `health`. Nonlinear; most danger lives in the bottom third:

| Health | Misfire % |
|---|---|
| 100 | 0 |
| 80 | 2 |
| 60 | 8 |
| 40 | 18 |
| 20 | 35 |
| 10 | 55 |
| 0 | 80 |

**Misfire outcomes:**
- ~85% of misfires: materials consumed, nothing produced. Loud, bad, deadpan log entry.
- ~15% of misfires: produces a **Fabricator Surplus** item — almost-right-but-useless. Tagged `fab_surplus`. Accumulates as a running joke. **Logged as Dangling Thread (§13) — needs a Phase 2 payoff.**
- At very low health (<20%), a misfire has a small chance to **break** the fabricator entirely. State flips to `broken`. No fabrication possible until repaired.

**Repair paths** (open the `repair_attempt` modal):
1. **From inventory** — uses fabricator parts. Restores fully. Safe. Costs materials.
2. **Improvised** — requires `crew_engineer`. No parts cost. Partial restoration (e.g., +30%). Can fail and worsen.
3. **At a dock** — only at outposts. Costs gold. Restores fully.

**LED color gradient:** bright green (100) → yellow-green (80) → amber (60) → orange (40) → red (20) → dark red pulsing (<10).

---

## 10. The 10-Beat Skeleton Playthrough

One run, one fixed config, every system exercised once.

**Fixed config:** Botanist (player role) + Xenobiologist + Chef (crew) + Zinnias (crop). Reasoning: Botanist is thematically central; Xeno is needed to fire the diplomatic gate at the anomaly (otherwise locked-door mechanics aren't tested end-to-end); Chef seeds the fungus item for a Phase 2 payoff; Zinnias because `crop_zinnia` is the most dangling crop tag and putting it in the skeleton seeds the Phase 2 Zinnia Arc with a concrete first beat.

| # | Beat | Template | Systems Exercised |
|---|---|---|---|
| 1 | Loadout at Kepler-9 | `loadout` (stub) | Setup tags, starting state |
| 2 | `launch_from_kepler` | `scripted_waypoint` | Choice mechanic, opening narration, day counter init |
| 3 | Cruise + chart check | `cruise` → `chart` → `cruise` | Cruise animation, status strip, chart map, glance/tooltip surfaces |
| 4 | Random shipboard event | `shipboard_event` (stub → scripted_waypoint) | Cruise interrupt, decision, resume |
| 5 | Mining stop at asteroid | `mine` | Drill minigame, material gain, fabricator inputs |
| 6 | Hunting stop at small body | `hunt` (stub → scripted_waypoint) | Food gain, ration buffer |
| 7 | Derelict Station waypoint | `scripted_waypoint` | **Closes `has_alien_seed_pod` hungry gate.** Item grant. |
| 8 | Hazard crossing | `hazard_crossing` (stub → scripted_waypoint) | Multi-option structured choice |
| 9 | Outpost docking | `dock` (stub) | Trade, mixed payment, **part_request modal fired here** |
| 10 | Anomaly waypoint → Lunar arrival | `scripted_waypoint` → `ending` (stub) | **Locked-door mechanic fires** (xeno + seed pod). Zinnia ending modifier slot checked. |

Every template named. Every loop fired. Every gate-and-key tested. The Fab health bar drains across beats 5–9 so the player feels the wear curve in a single run. The part_request modal is fired explicitly at beat 9 to test the keystone interaction.

---

## 11. Bible Diff

| Section | Action |
|---|---|
| Scene System | **Rewrite** to match §3 (router, 10 templates, sprite overlay layer) |
| UI Layout | **Rewrite** to match §2 + §3 (tiers, two-column shell, template variants) |
| `PROMPT_bg_viewport_primary.md` | **Demote and rename** → `PROMPT_cruise_background.md`. Rewrite to spec just the cruise scene background (parallax stars, ship-bobbing area, no UI baked in). |
| Tag Registry | **Keep.** No changes. |
| Item Registry | **Keep.** No changes. |
| Locked Doors & Keys | **Keep.** No changes. |
| Hungry Gates | **Keep.** No changes. |
| Two Moves Ahead | **Keep.** Add: "Fabricator Surplus payoff" (see §13). |
| Dangling Threads | **Keep.** Add: Fabricator Surplus items, `crew_engineer` improvised-repair payoff. |
| Sparse Areas | **Update.** `crew_engineer` is no longer fully sparse (gains improvised repair). |
| Dense Areas | **Keep.** |
| Replayability Audit | **Keep.** |
| Provenance Archive | **Keep.** Add new entries for fabricator, economy, scene templates as they're committed. |
| Session Log | **Append** Session 2 entry. |
| **NEW: Scene Template Registry** | Add. Mirrors §3. |
| **NEW: Modal Template Registry** | Add. Mirrors §4. |
| **NEW: UI Surface Tiers** | Add. Mirrors §2. |
| **NEW: Materials & Economy** | Add. Mirrors §8. |
| **NEW: Recipe Registry** | Add. Phase 1A: just Hull Patch. |
| **NEW: Fabricator** | Add. Mirrors §9. |

---

## 12. Phase 1A Definition of Done

Phase 1A is complete when:

- [ ] The `#scale-root` shell + two-column layout is ported from SSL and renders.
- [ ] `enterScene()` and `openModal()` exist and accept all 10 scene templates and all 7+ modal templates (stubs OK for unimplemented ones).
- [ ] `tooltip.js` works on mouse and touch.
- [ ] The 4 Phase 1A scene templates render with real backgrounds: `cruise`, `chart`, `scripted_waypoint`, `mine`.
- [ ] The 3 Phase 1A modals work: `part_request`, `inventory`, `crew_detail`.
- [ ] The Fabricator state model exists, the LED renders, the tooltip works, the misfire curve is wired.
- [ ] The economy primitives exist: `materials.js`, `recipes.js` with Hull Patch, mixed-payment math.
- [ ] The 10-beat skeleton playthrough runs end-to-end without crashing. Stub templates fall back gracefully.
- [ ] The bible has been updated per §11.

**Only after all of the above** does `launch_from_kepler` get drafted as real content.

---

## 13. New Dangling Threads (to log in the bible)

- **Fabricator Surplus items** — cursed misfire outputs accumulate in inventory. They want a payoff. Possible: a trader on the Lunar Outpost is collecting them and will not say why. 🟡 Dangling.
- **`crew_engineer` improvised repair** — gives the role a second payoff beyond gating one choice. Closes part of the "Crew role payoffs" sparse area. 🟡 Dangling until written.

---

## 14. What Comes After Phase 1A

In order:

1. **Bible update** per §11. Done in one pass after this doc is approved.
2. **Engine skeleton build** — the four templates, three modals, tooltip helper, fabricator wiring, economy primitives. Built against SSL's existing index.html as the starting point.
3. **`launch_from_kepler` draft** — finally. Written against `scripted_waypoint`, with a real sprite_brief in the new format, against a confirmed scene composition.
4. **The other nine skeleton beats** drafted in order.
5. **Phase 1B**: walking skeleton plays end-to-end.
6. **Phase 2**: flesh out one Two Moves Ahead idea at a time. Derelict Station expansion. Zinnia Arc. Chef's Secret Project. Something That Followed You. Each draft → review → commit → bible update → next.

---

*End of redesign doc. Ready for review.*

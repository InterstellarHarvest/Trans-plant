# MINING DEMO — Implementation Handoff

**File to create:** `demo-mining.html`
**File to edit:** `demo-encounter.html` (one scenario simplification — see §11)
**Forked from:** `demo-encounter.html` (chrome + layer stack)
**Reuses:** `pickAsteroids()` from `shared.js`, `CRATE_POOLS.asteroid` from `demo-minigames.html`, `generateCursor()` cursor system, AI patter pattern from existing minigames
**Game version impact:** patch CLAUDE.md to 0.6 on landing

---

## 1. Concept

Mining is a **mode within the encounter shell**, not a new screen. The encounter chrome stays put — AI bar, resources HUD, narrative strip, choice column, viewport rect at (160, 93) × 640×405. Only the *contents of the viewport* and the *purpose of the choice column* change. This mirrors the combat approach: same shell, different verbs and different things in the viewport.

There is exactly one mining minigame: **shoot rocks, get resources.** No vein-tapping, no analyzer assist, no flavor variants on the entry button. The action button just says MINING. The texture inside the minigame comes from tier choice, splitting cascades, and the occasional hollow rock that pays out nothing but a deadpan AI line.

Mining is **chosen-relaxed**. Failure means a smaller hold, not damage. The ship is never hit. The crew is never hurt. The only things you can lose are energy, fragments that drift offscreen before you click them, and the occasional shot wasted on a hollow. This distinguishes mining (and salvage, forage) from combat / breach / brace, which are forced-tense and can damage the ship. Worth promoting this axis to `VERDANT_ARK_BIBLE.md` §4 explicitly when this lands — currently implicit.

---

## 2. Entry point

Stop Menu MINE verb (existing) → encounter `asteroid_mining` (existing scenario, simplified — see §11) → intro layer with **one MINING button** → click MINING → encounter shell stays in place but the viewport becomes the shooter and the choice column collapses to just EXIT MINING.

The bible's reservation field `minigame: 'shooter_360'` rides on the MINING button as the route signal. For the demo, `demo-mining.html` is a standalone HTML file that just lets you play the mode directly — engine routing comes later.

---

## 3. The encounter shell, repurposed

Two states: **pre-commit** (player just arrived at the encounter, MINING button visible) and **active** (player clicked MINING, shooter is running).

| Element | Pre-commit | Active mining |
|---|---|---|
| `enc-backdrop` | `space/asteroid_field.jpg` | Same |
| `enc-vignette` | Edge darkening | Unchanged |
| `enc-subject` + name plate | Hidden (`noSubject: true`) | Hidden |
| `enc-dialog` | Hidden | Hidden |
| `enc-ai-bar` | Static AI flavor line for the field | **Live patter** — short lines cycle every 4–6s based on what the player just did (large split, rich crack, hollow hit, idle, low energy) |
| `enc-resources` | Standard HUD | Standard HUD + a HAUL counter that ticks on each loot drop |
| `enc-narrative` | Title + body prose ("THE BELT — Tumbling rock as far as the instruments can see…") | **Live status readout** — `MINING · 7 ROCKS PROCESSED · 14 MATERIALS · ENERGY 60%` |
| `enc-choices` | Two buttons: **MINING** (gold, default) and **REROUTE** (red, leave) | One button: **EXIT MINING** (red, leave-style) |

**Transition.** Clicking MINING swaps the choice column contents (CSS class flip on `enc-choices`), starts the asteroid spawner, repurposes `enc-narrative` from prose to status readout, and switches the AI bar from one-shot flavor to patter cycle. No screen change, no fade — just elements rearranging within the existing shell.

**Cursor scoping.** `generateCursor('mining')` (new context) replaces the hand cursor *only inside the viewport rect*. Per-element CSS — set on a new `.mining-stage` div positioned at (160, 93) × 640×405 — handles this. Hovering over the choice column or narrative panel returns the default hand. Same pattern as `medical_scan` in `shared.js`.

Add to `CURSOR_CONTEXTS` in `shared.js`:

```js
mining: { family:'reticle', cursor:'crossdot', size:32, thickness:2,
          gap:3, color1:'#c8a85a', color2:'#e8d8a0',
          outline:true, dot:true, scale:2 },
```

`crossdot` already exists in `RETICLES`. Gold/cream palette matches mining's loot tone.

---

## 4. Asteroid tiers

Five tiers. Reading rule: **bright + crisp + big = high commitment, high payout. Dim + small = freebie. Glittering = exotic-rich.** Hollows are the deception — visually identical to LARGE at idle, you only know which is which by shooting.

| Tier | Size | Layer | HP | On crack | Loot | Spawn weight |
|---|---|---|---|---|---|---|
| **SMALL** | 32–48px | back/mid (dim, slow) | 1 | drops loot, removes self | Tier 1 only (1 mineral / 1 scrap most rolls) | 35% |
| **STANDARD** | 60–80px | mid (normal bri/speed) | 1 | drops loot, removes self | `CRATE_POOLS.asteroid` straight roll, full pool | 40% |
| **LARGE** | 90–110px | front (bright, fast) | 1 | **splits into 2–3 MID fragments**, no immediate loot | Loot comes from the fragments | 15% |
| **RICH** | 90–110px, glittering FX overlay | front | 1 | splits into 2 MID fragments, **each MID splits again into 2 SMALLs** on crack | Exotic-weighted (`{exotic:3, minerals:2, biocomponent:1, metal:1}`) per final SMALL | 5% |
| **HOLLOW** | 90–110px (LARGE-shaped) | front | 1 | dust puff effect, no fragments, no loot, MARV sighs | none | 5% |

**Visual identity rules:**
- LARGE vs HOLLOW: **must look identical** at idle. Same sprite picker, same size range, same layer, same brightness, same tumble speed. Only the on-crack behavior differs. This is the comedic core of the mode and the user has confirmed it's wanted.
- LARGE vs STANDARD distinguished by size + brightness + speed (front layer parameters from existing salvage code).
- RICH wears a layered glittering particle FX (gold sparkles, repurposed from the salvage `dust_puff` machinery, recolored). Readable from across the viewport — player should always recognize a RICH and prioritize it. Hollows do **not** glitter.
- All sprites pulled from the existing 81-grid via `pickAsteroids()`. **No new asteroid art needed for v1.**

---

## 5. Splitting & fragments

When a LARGE cracks:
1. Spawn 2–3 MID fragments at the parent's center position.
2. Each fragment gets an outward velocity from the split point — angles spaced ~120° apart with ±15° jitter, magnitude **0.6× the average fresh-spawn speed**. Fragments drift slower than fresh asteroids — preserves the splitting-as-commitment feel without making LARGE rocks feel punishing. A player paying basic attention catches every fragment.
3. Each MID fragment is mechanically a STANDARD asteroid: 1 HP, drops standard loot on crack, drifts off the viewport edge if not caught.
4. Fragments inherit the parent's tumble (`vrot`) with mild randomization.

When a RICH cracks:
1. Same as LARGE but always 2 fragments (not 3).
2. Fragments are MID with a `parent: 'rich'` flag — when one cracks, it splits *again* into 2 SMALLs at 0.6× of the *fragment's* speed (cascading slowdown).
3. Final SMALLs roll loot from the rich loot table (exotic-weighted), not standard.
4. Five clicks total to fully process a RICH cluster, but each individual click is forgiving because everything moves slowly. The skill test is **attention budget under time pressure**, not reflexes.

When a HOLLOW cracks:
1. Spawn a dust puff sprite at the parent's center (reuse salvage's particle pattern, warm gray/cream, ~0.6s lifetime).
2. Remove the parent. No fragments. No loot.
3. Increment a `hollows_hit` counter for the run (used by the haul card and AI patter triggers).

Fragments use the same sprite pool. Visually, only their size + speed signals their tier — same as fresh asteroids.

---

## 6. Loot table

Reuse `CRATE_POOLS.asteroid` from `demo-minigames.html` verbatim:

```js
asteroid: [{r:'minerals',w:6},{r:'scrap',w:6},{r:'metal',w:3},
           {r:'exotic',w:1},{r:'biocomponent',w:1}]
```

Per-tier modifications:
- **SMALL**: roll once, but biocomponent and exotic are removed from the pool (no rare drops from the freebie tier).
- **STANDARD**: straight roll, full pool. 1 unit per drop.
- **LARGE fragments (MID)**: straight roll, full pool. 1–2 units per drop (roll 1d2).
- **RICH SMALLs**: rich pool — `{exotic:3, minerals:2, biocomponent:1, metal:1}`. 1 unit per drop, exotic-favored.
- **HOLLOW**: nothing. Don't even call the loot roller.

Sprite paths for loot: `sprites/cargo/materials/{r}.png` — all 5 already exist (`metal`, `scrap`, `exotic`, `biocomponent`, `minerals`).

---

## 7. Pacing

- **Energy**: 100 max, **5 drained per shot fired** (whether it hits or not — discourages spamming, makes hollows sting just a little). Visible as a bar in the resources HUD or as part of the narrative-strip readout.
- **Time**: 18-second hard safety cap (hidden — most runs end on energy depletion first).
- **Spawn rate**: maintain ~6–8 asteroids onscreen via spawner interval. When count drops below 6, spawn one from a random edge with weighted tier roll (§4 weights).
- **End conditions**: energy ≤ 0 OR 18s elapsed OR player clicks EXIT MINING. All three resolve to the haul card.

---

## 8. AI patter

Same five-AI pattern as `MINIGAME_QUIPS`. Lines cycle every 4–6s in `enc-ai-bar` once mining is active. Each AI has lines for these triggers:

| Trigger | Example line (MARV) |
|---|---|
| `idle` (no clicks for 3s) | "The rocks are not going to mine themselves. I have run that simulation." |
| `hollow_hit` | "You struck three hollow rocks. I had not considered this outcome. I have now." |
| `large_split` | "Structural integrity gave way. We anticipated this. We did not anticipate enjoying it." |
| `rich_crack` | "Exotic matter detected. Begin the paperwork. Or do not. I am not a notary." |
| `fragment_lost` | "That one drifted off. The galaxy has it now." |
| `low_energy` (energy < 25%) | "Tractor beam is at 24%. Below 20% I am required to mention it again." |

Five lines per AI per trigger. Aria is upbeat-and-wrong; MARV is bleak-and-accurate; Rex is military-misread; Chip is sponsored-interruption; Ajoy is cryptic-philosophical. Existing `MINIGAME_QUIPS.mining` covers the perfect/good/poor end states — extend that block with these in-action triggers, don't create a parallel structure.

---

## 9. Haul card (end screen)

Same pattern as salvage's end card. Centered overlay on top of the dimmed viewport — **encounter shell stays visible behind it**, no screen replacement. Card contents:

1. **Tier banner** — PERFECT / ADEQUATE / INSUFFICIENT, colored to match (gold / teal / red). Tier rules:
   - PERFECT: 12+ loot drops, OR any RICH fully cracked
   - ADEQUATE: 6–11 loot drops
   - INSUFFICIENT: <6 loot drops
2. **AI line** for the run, pulled from `MINIGAME_QUIPS.mining[tier][activeAi]` — these lines already exist in spec. Use them.
3. **Inventory tiles** — one per material type, count badge. Reuse salvage's `.sal-inv-tile` pattern.
4. **Hollow tally** (if `hollows_hit > 0`) — small line under inventory: `Hollow rocks struck: 3`. Flavor only, no mechanical effect.
5. **CONTINUE** button → returns to encounter outcome. For demo, just resets the mode.

---

## 10. First implementation step

```
1. Copy demo-encounter.html → demo-mining.html.
2. Strip all scenario dropdown + control panel machinery; force-render
   the encounter shell with: bg = 'space/asteroid_field', subject hidden,
   narrative shows the field's intro prose, choices = [MINING, REROUTE].
3. Add a .mining-stage div absolutely positioned at left:160 top:93
   width:640 height:405, z-index above .enc-backdrop, below .enc-vignette.
   Mining cursor scoped to this element via per-element CSS.
4. Wire MINING button click:
   - Swap choice column to a single EXIT MINING button.
   - Replace narrative prose with live status readout (DOM swap, same
     panel — keep the typography).
   - Start asteroid spawner + AI patter cycle.
5. Port the asteroid spawner from demo-minigames.html's initSalvage:
   - 3 ASTEROID_LAYERS table (back/mid/front), already exists
   - pickAsteroids() spawn helper, already exists
   - per-asteroid {fx, fy, vx, vy, rot, vrot, tier, hp, lootRoll}
   - drift in fractional units within the stage rect (not the full
     viewport — fractional coords map to the 640×405 stage)
6. Wire mousedown on each asteroid:
   - Decrement hp.
   - On hp<=0: branch on tier.
     - SMALL/STANDARD/MID: drop loot, remove element.
     - LARGE: spawn 2-3 MID fragments at parent position with
       outward velocities at 0.6× standard speed, remove parent.
     - RICH: spawn 2 MID-with-rich-flag fragments (same speed rule).
     - MID-with-rich-flag: on crack, spawn 2 SMALLs at 0.6× of
       fragment speed (cascading slowdown).
     - HOLLOW: spawn dust puff CSS effect, increment hollows_hit
       counter, no loot, no fragments.
   - Drain 5 energy per click (regardless of hit).
7. Maintain spawn count via setInterval — when onscreen count < 6,
   spawn one from a random edge with weighted tier roll. The
   LARGE/HOLLOW roll is a single bucket (20% combined): when it hits,
   sub-roll 75% LARGE / 25% HOLLOW. This guarantees hollows are
   indistinguishable from LARGEs at the spawner level too — they
   travel through the same code path until on-crack.
8. End on energy<=0 OR 18s OR EXIT click.
   Show haul card overlay — DON'T destroy the stage behind it.
9. Wire AI patter: poll for trigger events in the tick loop, push
   to enc-ai-bar with the existing typewriter/swap pattern from
   demo-encounter.
```

Should fit in ~550 lines of new JS, most of it adapted from existing `initSalvage`. Splitting cascade comes free from step 6's recursion. Hollows are ~10 lines.

---

## 11. Companion edit: `demo-encounter.html` `asteroid_mining` scenario

Replace the current `intro` layer's `choices` array (four entries: MINE THE DENSE ONE / CRACK THE IRREGULAR / INVESTIGATE THE CRACKED / SCAN THE FIELD) with a single MINING action. The CRACK THE IRREGULAR variant was a holdover from when hollow rocks were imagined as a per-encounter narrative beat; that idea is retired — hollows now live entirely inside the minigame as a feature, not as a player-facing choice variant. The action button just says MINING. The minigame discovers the hollows.

The `cracked` sub-layer and the four `asteroid_*` outcomes can stay for now (they may resurface as separate event types later — derelict-cache scenarios, etc.) but they're no longer reachable from the intro.

```js
asteroid_mining: {
  bg: 'space/asteroid_field',
  noSubject: true,
  subjectName: 'ASTEROID FIELD',
  archetype: null,
  leaveLabel: 'REROUTE',
  entryLayer: 'intro',
  layers: {
    intro: {
      title: 'THE BELT',
      body: "Tumbling rock as far as the instruments can see. The hold is empty. The rocks are not. Most of them.",
      pose: 'listening',
      bg: 'space/asteroid_field',
      ai: {
        aria: "Sparkly rocks!",
        marv: "Mineral density is within nominal parameters. A small percentage of these rocks contain nothing. We will find out which.",
        rex:  "No contacts. Noisy field. Stay sharp.",
        chip: "Unlicensed mining in contested belts voids insurance.",
        ajoy: "The rocks have been waiting. Some of them have nothing to give. They are still waiting."
      },
      choices: [
        { label: 'MINING', effort: 3, time: 12, sub: 'Shoot rocks · gather materials',
          outcome: 'asteroid_haul', minigame: 'shooter_360' }
      ]
    }
  },
  outcomes: {
    asteroid_haul: { title: 'HOLD FILLED', body: "[Mining minigame would trigger.]\n\nThe hold is heavier than it was. Some rocks are not.", bg: 'space/asteroid_field' }
  }
}
```

The dropped sub-layers and outcomes (`cracked`, `asteroid_dense`, `asteroid_irregular`, `asteroid_scan`, `asteroid_cache`, `asteroid_disarm`, `asteroid_partial`) can either be deleted or left in place as inert dead code for the demo. Recommend leaving them in `demo-encounter.html` for one more cycle, commented with `// TODO: repurpose for derelict-cache event`, then deleting in a later cleanup pass once it's confirmed nothing references them.

---

## 12. Cleanup items (do after demo lands, not part of this work)

- **Retire `minigame_sprite_spec.html` mining section.** The `ore_node` / `ore_node_rich` / `ore_hollow` / `mine_bg.jpg` sprite plan is the OLD drift-and-click vein concept and is fully cut. The new mining mode uses the existing 81-asteroid grid with no new sprites. Either delete that section of the spec or rewrite it to describe the splitting-shooter version (most of which needs no art at all — only the dust puff effect and the gold-sparkle FX overlay for RICH need new tiny assets).
- **Add chosen-relaxed vs forced-tense axis to `VERDANT_ARK_BIBLE.md` §4.** Mining, salvage, forage are chosen-relaxed (player initiates, worst case is opportunity cost). Combat, breach, brace, ramming are forced-tense (world initiates, worst case is damage). Currently implicit; making it explicit prevents future minigame designs from drifting toward "all gather verbs need failure stakes."
- **Patch CLAUDE.md to 0.6** when `demo-mining.html` lands.

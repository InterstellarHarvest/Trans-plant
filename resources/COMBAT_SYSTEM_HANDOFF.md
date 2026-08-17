# COMBAT SYSTEM — HANDOFF

> Hand-off document for Claude Code.
> Adds the ship-to-ship combat minigame to Trans-plant.
> Combat is an in-place mode swap on the encounter screen — no new layout, no new sprites.

---

## What This Update Does

Adds:
1. **New demo file:** `demo-combat.html`
2. **Bible additions** to `GAME_BIBLE.md` Section 13 (Arcade Minigames)
3. **Tag registry additions** for combat-related tags
4. **Crew combat bonus table** — full bonuses for all crew roles + captain backgrounds
5. **Pirate species HP variance** + trail difficulty scaling
6. **Pool skeleton addition** — `combat_log` block added to `modules/flavor/flavor_pools.json`

Version bump: bible 0.5 → 0.6, CLAUDE.md 0.5 → 0.6.

---

## APPLY IN THIS ORDER

1. Read this document end-to-end before touching files.
2. Add the `combat_log` skeleton to `modules/flavor/flavor_pools.json` (Section 9 below). Empty arrays.
3. Add the new tags to `registry/tag_registry.json` (Section 10 below).
4. Insert the bible additions into `GAME_BIBLE.md` Section 13 (Section 11 below).
5. Build `demo-combat.html` per the spec in Sections 1–8. Single file. Self-contained.
6. Bump version footers on `GAME_BIBLE.md` and `CLAUDE_file.md`.

---

## 1. Entry & Exit

### Entry
Combat is triggered from a pirate encounter when the player picks an aggressive choice (`OPEN FIRE`, `ATTACK`, etc.). The encounter view does not unmount — it swaps into combat mode in place. The pirate's NPC sprite stays exactly where it is in the subject frame. The choice column transforms into the combat action panel. The narrative panel becomes the AI combat log.

### Exit conditions
Combat ends when one of these fires:
- **VICTORY** — enemy hull = 0 → destruction FX → salvage choice (see Section 6)
- **SURRENDER ACCEPTED** — player accepts pirate surrender → small loot + morale bump
- **SURRENDER REFUSED** — player executes the killing blow on a surrendered pirate → loot + morale penalty
- **ESCAPED** — FTL jump completes successfully → no loot, fuel cost
- **DEFEAT** — player hull = 0 → limp-away state (see Section 7)
- **TRIBUTE ACCEPTED** — Botanist or Cook tribute succeeded on opening turn → no loot, morale bump, possible faction tag

Each exit triggers a different narrative panel resolution and returns control to the encounter screen for normal flow continuation.

---

## 2. Layout (No Layout Changes)

Combat reuses the encounter screen exactly:
- **Subject frame** holds the enemy ship sprite (the pirate NPC)
- **AI flavor bar** updates to show `COMBAT MODE // HULL XX% // GROW BAY: NOMINAL`
- **Resource HUD** stays — hull bar is now the live combat HP indicator
- **Choice column** is replaced by the combat action panel (see Section 3)
- **Narrative panel** becomes the AI combat log (renders one or two AI lines per round)

The transition from encounter to combat is a 200ms cross-fade on the choice column only. Nothing else animates. The encounter screen does not know it has changed modes.

---

## 3. Combat Action Panel

Replaces the choice column. Buttons appear conditionally based on crew composition, captain background, items in cargo, and combat state.

### Always available
| Button | Effect |
|---|---|
| `FIRE LASER` | Triggers targeting mode; click viewport to fire |
| `EVASIVE MANEUVERS` | Reduces incoming damage 50%; chance to fully dodge (see Section 8) |
| `ATTEMPT ESCAPE` | Begins FTL charge sequence (see Section 4) |

### Conditional
| Button | Condition | Effect |
|---|---|---|
| `BOOST SHIELDS` | `item: shield_module_upgrade` in cargo | **STUB FOR V2.** Render as locked button with tooltip "Requires Shield Module Upgrade." Do not implement effect logic. |
| `HULL PATCH` | Engineer crew aboard OR Engineer captain background AND hull ≤ 50% | Free action (no turn skip). Restores hull. Once per combat. (See Section 8.) |
| `OFFER HARVEST` | Botanist crew aboard | **OPENING TURN ONLY.** Tribute attempt. (See Section 5.) |
| `OFFER COOKIES` | Cook crew aboard | **OPENING TURN ONLY.** Tribute attempt. (See Section 5.) |

After the first round resolves (whether by tribute attempt or first FIRE), `OFFER HARVEST` and `OFFER COOKIES` are removed from the panel for the rest of combat.

---

## 4. State Machine

```
ENCOUNTER → COMBAT_INTRO 
          → PLAYER_TURN ──┬─→ TARGETING ─→ FIRED ─→ HIT_RESOLVE ─→ ENEMY_TURN
                          ├─→ EVADING ─────────────────────────────→ ENEMY_TURN
                          ├─→ HULL_PATCHING ───────────────────────→ ENEMY_TURN
                          ├─→ TRIBUTE_ATTEMPT ──┬─→ TRIBUTE_SUCCESS → END
                          │                     └─→ TRIBUTE_FAIL ──→ ENEMY_TURN
                          ├─→ FTL_CHARGING ────────────────────────→ ENEMY_TURN
                          └─→ SURRENDER_DECISION ──┬─→ FINISH ─→ HIT_RESOLVE
                                                   └─→ ACCEPT ─→ END
          → ENEMY_TURN ───┬─→ ENEMY_FIRES ─→ HULL_HIT_RESOLVE ─→ ROUND_END
                          └─→ ENEMY_SURRENDERS → SURRENDER_DECISION (player's next turn)
          → ROUND_END ────┬─→ check exit conditions
                          ├─→ if exit → END (victory/defeat/escape/etc)
                          └─→ else → PLAYER_TURN
          → END ──────────→ return to encounter screen with outcome
```

### State details

**FTL_CHARGING:** Once initiated, the player is committed for the next 3 turns. During each charging turn, the action panel shows only `FTL CHARGE: 33% / 66% / 100%` as a progress indicator and disabled buttons. Enemy fires normally each turn. On turn 3 completion → `ESCAPED`.

**Pilot crew aboard:** FTL charge time reduced from 3 turns to 2 turns. Pilot captain background: 3 turns reduced to 2 also (full benefit — one of the few full-benefit captain backgrounds, since FTL is binary not graduated).

**SURRENDER_DECISION:** When enemy hull ≤ 30% AND species permits surrender (see Section 5), enemy fires a `pirate.defeated` line in the narrative panel (uses existing NPC dialogue system) and the action panel changes to two buttons: `FINISH THEM` and `ACCEPT SURRENDER`. Combat pauses until player chooses.

---

## 5. Surrender, Tribute, and Species Behavior

### Surrender trigger
Enemy offers surrender at hull ≤ 30%, **species permitting**:

| Species | Surrenders? |
|---|---|
| human | yes |
| reptile | yes |
| water | yes |
| robot | yes |
| unknown | yes |
| insect | NO — fights to destruction |
| rock | NO — fights to destruction |

Trigger fires on the first `ENEMY_TURN` after enemy hull crosses 30% threshold. Once offered, surrender choice persists until player picks. Player cannot fire while surrender is on the table — must choose `FINISH THEM` or `ACCEPT SURRENDER`.

### Tribute attempts (opening turn only)
Both Botanist and Cook tribute actions, if available, must be used on the **very first player turn** before any other action. Once any other button is pressed (FIRE, EVADE, ESCAPE, HULL PATCH), tribute buttons disappear permanently for this combat.

| Action | Crew req | Success chance | On success | On failure |
|---|---|---|---|---|
| `OFFER HARVEST` | Botanist crew | 40% | Encounter ends. Lose 5 food. Morale +3. | Combat begins. Lose 5 food. First enemy turn fires immediately (player loses opening shot). |
| `OFFER COOKIES` | Cook crew | 25% | Encounter ends. Lose 3 food. Morale +5. **Sets faction tag: `friendly_with_pirate_<species>` for one journey leg.** | Combat begins. Lose 3 food. First enemy turn fires immediately. |

Botanist captain background: half-effective version. `OFFER HARVEST` available, success chance reduced to 20%. Cook is currently not in the captain background list (per `demo-setup.html`), so no captain version.

If both Botanist and Cook are aboard, both buttons appear. Player picks one. Choosing one doesn't consume the other — the other simply disappears with the rest of the tribute options when combat begins.

### Cookie friendship tag
The `friendly_with_pirate_<species>` tag is set on the player state when cookies succeed. For one journey leg, any pirate encounter rolling that same species auto-resolves as a friendly drifter-style encounter instead of triggering combat. This is a minor reward but a great running joke. Tag clears at next station.

---

## 6. Victory & Loot

### Destruction (enemy hull = 0, no surrender path taken)
1. Trigger destruction FX (see Section 12).
2. Narrative panel: AI fires a `combat_log.enemy_destroyed.<ai_id>` line.
3. Choice column shows two buttons: `SALVAGE WRECKAGE` and `LEAVE IT`.

### Salvage choice
| Choice | Result |
|---|---|
| `SALVAGE WRECKAGE` | Transitions to existing salvage minigame screen. Loot pool drawn at 100% with a chance roll for a bonus crate item. |
| `LEAVE IT` | Skips minigame. Receive flat 60% of base loot. No bonus crate roll. |

### Surrender accepted
- 40% of base loot, automatically deposited in cargo
- Morale +5
- No salvage minigame
- No combat FX victory beat

### Surrender refused (player picks `FINISH THEM`)
- Triggers full destruction FX
- 100% of base loot + bonus crate roll
- Morale -10
- Sets flag: `executed_surrendered_pirate` (for future event consequences)

### Escape (FTL completed)
- No loot
- Fuel cost: -15
- Combat ends, encounter screen returns

### Tribute success
- No loot
- Food cost as listed in Section 5
- Morale bonus as listed
- Possible faction tag for cookies

---

## 7. Defeat (Player Hull = 0)

Player does not die from combat. Combat ends in a "limp away" state:

1. Combat FX freeze. AI fires `combat_log.player_defeated.<ai_id>` line.
2. Hull set to 1.
3. Cargo loss: random 30–50% of cargo items removed.
4. **Crew death roll** — see table below.
5. Encounter screen returns with outcome narrative panel showing damage report.

### Crew death chance on defeat
Base chance: **50%** to lose one random crew member (the player/captain is never lost — they're always present).

Reducers (stack additively):
| Condition | Reduction |
|---|---|
| Medic crew aboard | -20% |
| Medic captain background | -10% |
| Pilot crew aboard | -15% |
| Pilot captain background | -8% |
| Morale ≥ 70 at time of defeat | -15% |
| Morale ≥ 90 at time of defeat | additional -5% (stacks with above, total -20% from morale) |

**Floor: 5%.** Total reducers cannot bring the chance below 5%. Space is space.

If the roll succeeds (crew member dies), pull a `crew_epitaph` from the existing flavor pool and render it in the post-combat resolution panel.

---

## 8. Crew Combat Bonus Table

Full table. Crew gets full bonus; captain background gets approximately half (per the established `0.5x` discount rule from `VA_BUILD_NOTES.md`).

| Role | Crew bonus | Captain background bonus |
|---|---|---|
| **Pilot** | EVADE has 25% chance to fully dodge (no damage at all, instead of -50%). FTL charge: 3 turns → 2 turns. | EVADE 12% full dodge. FTL: 3 → 2 turns (full benefit, binary mechanic). |
| **Engineer** | `HULL PATCH` action available below 50% hull. Free action, restores **25% hull**, once per combat. | `HULL PATCH` available. Free action, restores **12% hull**, once per combat. |
| **Medic** | -20% crew death chance on defeat. Reduces crew injury rolls during combat by half. | -10% crew death chance on defeat. Crew injury rolls reduced by 25%. |
| **Botanist** | `OFFER HARVEST` opening-turn tribute available. 40% success. | `OFFER HARVEST` available. 20% success. |
| **Cook** | `OFFER COOKIES` opening-turn tribute available. 25% success. Sets friendly_with_pirate flag on success. | Not available — Cook is not currently a captain background option. |
| **Diplomat** | Pirate surrender chance increased by 15% (when species permits). Reduces enemy aggression on opening turn (enemy first shot does -25% damage). | Surrender chance +8%. Opening-turn aggression reduced by -12%. |
| **Xenobiologist** | Identifies enemy ship's species before first turn (HUD reveal: full HP shown, species traits flagged). Knowledge of weak points: +10% damage on FIRE LASER. | Same identification reveal. +5% damage. |
| **Veteran** | Not in current crew roster — confirm with N. before adding. Likely: +1 starting morale during combat, reduces "first hit" panic damage by 20%. | TBD pending crew confirmation. |
| **Academic** | Not combat-relevant. No bonus. | No bonus. |
| **Merchant** | Bonus loot from salvage minigame: +1 chance roll for bonus crate. | Same, +0.5 chance. |
| **Chef** | Same as Cook (functional duplicate?) — confirm with N. | TBD. |

**Implementation note:** Crew bonus values should be defined in a single combat config object (e.g., `COMBAT_CONFIG.crew_bonuses`) so they're tunable without hunting through code. Same for `pirate_species_hp` (Section 9).

---

## 9. Pirate Stats & Difficulty Scaling

### Base pirate
| Stat | Value |
|---|---|
| Base HP | 50 |
| Damage per shot | 12–18 (random per shot) |

### Species HP modifiers (multiplied against base)
| Species | HP Modifier | Notes |
|---|---|---|
| human | 1.00 | Baseline |
| insect | 0.90 | Fragile, never surrenders |
| rock | 1.30 | Heavy, never surrenders |
| water | 0.95 | |
| reptile | 1.05 | |
| robot | 1.10 | |
| unknown | 1.00 ± 20% per-fight variance | Roll on combat start |

### Trail difficulty scaling (multiplied AFTER species modifier)
| Trail | HP × | Damage × |
|---|---|---|
| Lunar (Easy) | 0.85 | 0.85 |
| Mars (Medium) | 1.00 | 1.00 |
| Interstellar (Hard) | 1.25 | 1.15 |

### Final HP calculation example
Rock pirate on Interstellar: `50 × 1.30 × 1.25 = 81 HP`.
Human pirate on Lunar: `50 × 1.00 × 0.85 = 42.5 → 42 HP`.

Round all final HP values down to integers. Damage stays as a range (re-rolled per shot).

### Player FIRE LASER damage
Base: 10–15 damage per shot. Xenobiologist crew adds +10%, captain +5% (see Section 8).

---

## 10. Combat Log Pool — Add to `flavor_pools.json`

Add this block to `modules/flavor/flavor_pools.json`. Empty arrays. To be filled in a later content-writing phase. Five AIs: ARIA, MARV, REX, CHIP, AJOY.

```json
"combat_log": {
  "intro":             { "aria": [], "marv": [], "rex": [], "chip": [], "ajoy": [] },
  "player_fires":      { "aria": [], "marv": [], "rex": [], "chip": [], "ajoy": [] },
  "player_evades":     { "aria": [], "marv": [], "rex": [], "chip": [], "ajoy": [] },
  "player_dodge_full": { "aria": [], "marv": [], "rex": [], "chip": [], "ajoy": [] },
  "hull_patch":        { "aria": [], "marv": [], "rex": [], "chip": [], "ajoy": [] },
  "ftl_charging":      { "aria": [], "marv": [], "rex": [], "chip": [], "ajoy": [] },
  "ftl_complete":      { "aria": [], "marv": [], "rex": [], "chip": [], "ajoy": [] },
  "enemy_fires":       { "aria": [], "marv": [], "rex": [], "chip": [], "ajoy": [] },
  "enemy_low_hp":      { "aria": [], "marv": [], "rex": [], "chip": [], "ajoy": [] },
  "enemy_destroyed":   { "aria": [], "marv": [], "rex": [], "chip": [], "ajoy": [] },
  "enemy_surrenders":  { "aria": [], "marv": [], "rex": [], "chip": [], "ajoy": [] },
  "surrender_accepted":{ "aria": [], "marv": [], "rex": [], "chip": [], "ajoy": [] },
  "surrender_refused": { "aria": [], "marv": [], "rex": [], "chip": [], "ajoy": [] },
  "tribute_offered":   { "aria": [], "marv": [], "rex": [], "chip": [], "ajoy": [] },
  "tribute_success":   { "aria": [], "marv": [], "rex": [], "chip": [], "ajoy": [] },
  "tribute_fail":      { "aria": [], "marv": [], "rex": [], "chip": [], "ajoy": [] },
  "player_defeated":   { "aria": [], "marv": [], "rex": [], "chip": [], "ajoy": [] }
}
```

17 slots × 5 AIs = 85 line pools. Fill with 4–6 lines each in the content-writing phase. Voice guide: ARIA cheerful denial, MARV bleak accuracy, REX threat assessment, CHIP sponsored interruptions, AJOY cryptic philosophy.

For the demo, hardcode 1–2 placeholder lines per slot per AI to verify the rendering pipeline works.

---

## 11. Tag Registry Additions

Add to `registry/tag_registry.json`:

### `combat_outcome`
```json
{
  "engine_required": true,
  "multiple_allowed": false,
  "values": {
    "victory_destroyed":   { "status": "empty" },
    "victory_surrendered": { "status": "empty" },
    "victory_executed":    { "status": "empty" },
    "tribute_resolved":    { "status": "empty" },
    "escaped":             { "status": "empty" },
    "defeated":            { "status": "empty" }
  }
}
```

### `pirate_disposition_subtype`
For future pirate variety. Currently only one value to populate.
```json
{
  "engine_required": false,
  "multiple_allowed": false,
  "values": {
    "raider":   { "status": "empty" },
    "marauder": { "status": "empty" },
    "stalker":  { "status": "empty" },
    "warlord":  { "status": "empty" }
  }
}
```

### `combat_action_type`
```json
{
  "engine_required": true,
  "multiple_allowed": false,
  "values": {
    "fire":       { "status": "empty" },
    "evade":      { "status": "empty" },
    "escape":     { "status": "empty" },
    "hull_patch": { "status": "empty" },
    "tribute":    { "status": "empty" },
    "surrender_decision": { "status": "empty" }
  }
}
```

---

## 12. Bible Additions — `GAME_BIBLE.md` Section 13

Insert a new sub-section under Section 13 (Arcade Minigames), after the existing minigame entries. Marker block:

```markdown
<<<BEGIN BIBLE SECTION 13 INSERT>>>

### Ship-to-Ship Combat

Triggered from pirate encounters when the player picks an aggressive choice. Combat is an in-place mode swap on the encounter screen — the pirate's NPC sprite stays in the subject frame, the choice column transforms into the combat action panel, and the narrative panel becomes the AI combat log.

**Tone.** The AI describes combat with the same deadpan indifference applied to plant care. Hull damage is reported alongside grow bay status. Casualties are noted; the orchids are checked on first.

**Turn structure.** Strictly turn-based. Player acts, then enemy acts, then round resolves. No timers, no cooldowns.

**Player actions (always available):** FIRE LASER, EVASIVE MANEUVERS, ATTEMPT ESCAPE.
**Conditional actions:** HULL PATCH (Engineer), OFFER HARVEST (Botanist, opening turn), OFFER COOKIES (Cook, opening turn), BOOST SHIELDS (item-gated, v2).

**Surrender.** Pirates surrender at ≤30% hull, except insect and rock species which fight to destruction. Player chooses to accept (small loot, +morale) or finish (full loot, -morale, sets `executed_surrendered_pirate` flag).

**Defeat.** Player hull = 0 results in limp-away state, not game over. Hull set to 1, 30–50% cargo lost, crew death roll (50% base, reduced by Medic / Pilot / Morale, floor 5%).

**Loot.** Destruction → salvage minigame (full loot + bonus crate roll) OR skip (60% loot). Surrender accepted → 40% loot, no minigame. Tribute success → no loot, morale bonus.

**FTL escape.** 3-turn charge while taking enemy fire. Pilot reduces to 2 turns.

**Visual FX.** Laser beams drawn on canvas overlay (player shots from bottom-center, enemy shots toward bottom-left or bottom-right). Sprite shake + brightness dim on hit. Full-screen shake (not just viewport) when player takes a hit. Viewport edge red vignette on hull damage. Destruction = particle scatter + rapid sprite fade. (Pixelation FX deferred to v2 polish.)

See `COMBAT_SYSTEM_HANDOFF.md` for full implementation spec.

<<<END BIBLE SECTION 13 INSERT>>>
```

---

## 13. Demo File Spec — `demo-combat.html`

### Structure
Single self-contained HTML file. Imports `shared.css` and `shared.js`. Loosely modeled on `demo-encounter.html` for layout and on `salvage-devtool.html` / `forage-anchor-editor.html` for cursor patterns.

### Required components
1. **Encounter viewport** (960×640) — reuses encounter layout: subject frame, narrative panel, AI flavor bar, resource HUD, choice column.
2. **Combat action panel** — replaces choice column when combat begins.
3. **Canvas FX overlay** — `position: absolute; inset: 0; pointer-events: none; z-index: 10` over the viewport. Used for laser beams and destruction particles.
4. **Custom cursor system** — when `state === 'TARGETING'`, viewport sets `cursor: none` and a canvas-drawn crosshair follows the mouse. CSS lock-ring pulses on the enemy sprite.
5. **State machine driver** — single `combatState` object with current state, enemy HP, player HP, turn count, FTL charge counter, crew/captain config, and species/difficulty modifiers.
6. **AI combat log renderer** — pulls from hardcoded placeholder pool (matching the structure in Section 10). Fires one line per state transition.
7. **Devtools panel (left rail)** — for testing: dropdowns for AI selection, pirate species, trail difficulty, crew composition (checkboxes for each role), captain background, current hull/morale; buttons to force outcomes (force defeat, force surrender, force tribute success); reset button.

### FX requirements
| FX | Implementation |
|---|---|
| **Laser beam (player)** | Canvas `lineTo` from x=480, y=640 (bottom center of viewport) to enemy sprite center. Stroke `#35c6bf`, width 3px, `globalCompositeOperation: 'lighter'`. Animate over ~250ms. Brief radial glow burst on contact. |
| **Laser beam (enemy)** | Canvas line from sprite center to either bottom-left (x=80, y=640) or bottom-right (x=880, y=640) of viewport. Random per shot. Stroke `#cc3333`, width 3px. |
| **Sprite hit response** | Add CSS class `.combat-hit` for 150ms (`filter: brightness(2) sepia(1) hue-rotate(-30deg)`). Then add `.combat-shake` for 400ms (keyframe `translateX` oscillation). Persistent `filter: brightness(X)` tied to enemy HP — sprite dims from 100% down to 60% as HP falls. |
| **Hull damage vignette** | Add CSS class `.hull-hit` to viewport edge for 600ms — red box-shadow inset that pulses and fades. |
| **Full-screen shake** | Add CSS class `.screen-shake` to `body` for 400ms — keyframe translate. (Confirms with N's spec: whole screen shakes, not just viewport.) |
| **FTL charging visual** | Cyan glow ring around viewport edge that pulses brighter with each charge tick. |
| **Destruction** | Sprite fade-out over ~300ms while canvas fires particle burst: ~50 small colored rects (sampled from sprite area) scatter outward with gravity and fade. **No pixelation effect in v1.** Flag for v2 polish. |
| **Lock-ring on enemy sprite** | When in TARGETING state, CSS pulse animation around the subject frame. |
| **Targeting crosshair** | Canvas-drawn crosshair following mouse position. Style: outer circle + inner cross + corner ticks. Match aesthetic of cursors in `cursor-armory.html`. |

### Hardcoded combat log lines for demo
Hardcode 1–2 placeholder lines per AI per slot for testing. Examples (write more in this voice):

```javascript
const PLACEHOLDER_COMBAT_LINES = {
  intro: {
    marv: ["Combat initiated. Probability of structural damage to Grow Bay C-4: 12%. Proceeding."],
    aria: ["A vigorous exchange of ideas approaches!"],
    rex:  ["Hostile contact. Engaging."],
    chip: ["Combat detected. Did you know StellarSeal hull insurance is available at participating stations?"],
    ajoy: ["You could have taken the other path. You did not."]
  },
  player_fires: {
    marv: ["Firing. The orchids are aware."],
    aria: ["A wonderful application of focused light!"],
    rex:  ["Firing. Center mass."],
    chip: ["Discharge logged for warranty purposes."],
    ajoy: ["You fired. The galaxy noted."]
  },
  enemy_destroyed: {
    marv: ["Target destroyed. Scanning debris for recoverable biological material. Results: disappointing."],
    aria: ["They've been resolved!"],
    rex:  ["Target neutralized. Standard."],
    chip: ["Hostile vessel deconstructed. Salvage rights apply per Section 14.b of your standard agreement."],
    ajoy: ["The pirate is gone. The pirate was always going to be gone."]
  }
  // etc — fill remaining 14 slots × 5 AIs with at least 1 line each
};
```

### What NOT to do
- Do **not** create new sprite assets for combat. The pirate sprite is whatever the NPC system rolled.
- Do **not** add a player ship sprite to the viewport. Player position is implied off-screen.
- Do **not** implement BOOST SHIELDS effect logic. Render as locked-disabled button only.
- Do **not** implement pixelation destruction FX in v1. Particle scatter + fade is sufficient.
- Do **not** wire combat into the actual encounter routing yet. The demo is standalone with devtools to drive state.

---

## 14. Deliverables

1. `demo-combat.html` — fully working demo per Section 13 spec.
2. `modules/flavor/flavor_pools.json` — `combat_log` block added (Section 10).
3. `registry/tag_registry.json` — three tag groups added (Section 11).
4. `GAME_BIBLE.md` — Section 13 insert applied (Section 12).
5. Version bumps on `GAME_BIBLE.md` and `CLAUDE_file.md` from 0.5 to 0.6.

---

## 15. V2 / Future Work (Do Not Build Now)

Flagged here so they don't get lost:

- **Pixelation destruction FX.** Sample sprite into 16×16 canvas, scale up with `imageSmoothingEnabled = false`, scatter blocks. Cool but complex. Flagged.
- **BOOST SHIELDS.** Item-gated combat action. `item: shield_module_upgrade` purchasable at stations. When in cargo, button is enabled. Effect: full block of next incoming hit. Once per combat. Item not consumed.
- **Pirate sub-types.** `pirate_disposition_subtype` tag already added. Future: raider/marauder/stalker/warlord with different stat blocks. Just JSON entries when ready.
- **Multi-enemy combat.** Data shape uses `enemies: []` array but limited to length 1 in v1. Future: wings of 2–3 pirates.
- **Trader combat.** Currently disallowed. Future: aggressive trader interaction option that opens combat with morale consequences.
- **Crew combat traits beyond what's in Section 8.** E.g., specific captain background combos that unlock special actions.
- **Wing combat / convoy escort events.** Far future.

---

## 16. Open Confirmation Items

These were left open during design and are noted for the writer of v1, not blockers for CC:

- **Veteran crew role** — listed in Section 8 with a placeholder bonus. Confirm with N. before implementing. May not be in the active roster.
- **Chef vs Cook** — possible duplicate. Currently both listed as captain backgrounds. Confirm whether Chef and Cook should differ in combat tribute mechanics.
- **`friendly_with_pirate_<species>` tag** — concept introduced in Section 5. Add to tag registry when implemented; currently undocumented elsewhere.

---

End of handoff.

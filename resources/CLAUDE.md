# CLAUDE.md — TRANS-PLANT

This file is read by Claude Code at the start of every session. Follow everything here before touching any file.

---

## What This Project Is

A browser-based roguelike narrative game in the spirit of Oregon Trail, set in space, written in the tone of Douglas Adams. Earth is dying. The player leads a colony mission to a habitable planet. They will probably not make it in the condition they hoped.

**Stack:** HTML5 / JavaScript / CSS — no frameworks, no build tools, runs in a browser tab.
**Architecture:** Modular data system. Game content lives in JSON files. Engine reads those files at runtime.

---

## The Two Documents You Must Read First

Before writing any code or any module content, read these in order:

1. **`GAME_BIBLE.md`** — the design authority. Every system, every mechanic, every rule. If you have a design question, the answer is in here. If it isn't, ask before inventing.
2. **`registry/tag_registry.json`** — the tag authority. Every valid tag and value used in module files. If a tag isn't in here, it doesn't exist yet. Do not use tags that aren't registered.

---

## Project Structure

```
trans-plant/
├── CLAUDE.md                      ← you are here
├── GAME_BIBLE.md                  ← design authority
├── engine/                        ← Phase 2 — do not build until modules are complete
│   └── (game code goes here)
├── modules/
│   ├── events/
│   │   ├── events_general.json    ← node_type: any, trigger: any
│   │   ├── events_station.json    ← node_type: station
│   │   ├── events_planet.json     ← node_type: planet
│   │   ├── events_derelict.json   ← node_type: derelict
│   │   ├── events_anomaly.json    ← node_type: anomaly
│   │   └── events_crisis.json     ← trigger: low_fuel, low_food, low_o2, low_hull, low_morale
│   ├── locations/
│   │   ├── stations.json
│   │   ├── planets.json
│   │   ├── derelicts.json
│   │   └── anomalies.json
│   ├── crew/
│   │   └── crew_roster.json
│   ├── items/
│   │   └── items.json
│   ├── ships/
│   │   └── ships.json
│   ├── endings/
│   │   └── endings.json
│   └── flavor/
│       └── flavor_pools.json
└── registry/
    └── tag_registry.json          ← tag authority
```

---

## Two Phases — Do Not Mix Them

### Phase 1: Modules
Build all content files in `modules/` and `registry/` first. No engine code. No HTML game files.

**Build order within Phase 1:**
1. `registry/tag_registry.json` — first file created; everything else validates against it
2. `modules/ships/ships.json` — small, foundational, establishes ship IDs
3. `modules/crew/crew_roster.json` — establishes crew IDs referenced by events
4. `modules/items/items.json` — establishes item IDs referenced by events
5. `modules/events/*.json` — one file at a time, cross-referencing crew and items as you go
6. `modules/locations/*.json` — node definitions
7. `modules/endings/endings.json`
8. `modules/flavor/flavor_pools.json`

Do not start Phase 2 until all module files are at least scaffolded and the registry shows no `engine_required` tags at `empty` status.

### Phase 2: Engine
Build the game interface in `engine/` that reads the completed module files. Modules are read-only at this point — the engine loads them, it doesn't modify them.

---

## The Tag Registry — How to Use It

`registry/tag_registry.json` is the machine-readable source of truth for all tags.

### Before writing any module
Open `registry/tag_registry.json` and confirm every tag value you plan to use exists in it.

### After writing a module
Update every tag value you used from `"status": "empty"` to `"status": "populated"` in the registry.

### If you need a new tag
1. Add it to `registry/tag_registry.json` first with all values set to `"status": "empty"`
2. Note in the registry entry which existing modules should retroactively use it
3. Then use it in your module

### If you are retiring a tag value
Change its status to `"status": "deprecated"` — never delete entries from the registry.

### Content gap audit
At any time you can be asked: *"what tags are still empty?"* — read the registry and report all entries with `"status": "empty"`. Entries marked `"engine_required": true` that are still `"empty"` are blockers for Phase 2.

---

## Tag Rules (Non-Negotiable)

- **Never use a tag that isn't in `tag_registry.json`**
- **Never add a tag to a module before adding it to the registry**
- **`multiple_allowed: false` tags** — a module may only have one value for this tag
- **`multiple_allowed: true` tags** — a module may declare an array of values
- **`engine_required: true`** — at least one module must use this tag before Phase 2 begins
- **`min_variants_before_launch`** — scene_type pool must have at least this many variants before the game is considered shippable

---

## Module ID Naming Convention

All module IDs follow this pattern: `{type}_{subtype}_{zero-padded-number}`

| Module type | Example ID |
|---|---|
| Event (general) | `event_general_001` |
| Event (planet) | `event_planet_007` |
| Event (crisis) | `event_crisis_003` |
| Location (station) | `location_station_002` |
| Location (planet) | `location_planet_005` |
| Crew member | `crew_engineer_001` |
| Captain | `captain_veteran_001` |
| Item | `item_gas_analyzer_001` |
| Ship | `ship_perseverance_001` |
| Ending | `ending_legendary_002` |
| Failure screen | `failure_no_fuel_001` |
| Scene image | `scene_station_interior_003` |
| Flavor pool | `flavor_epitaphs` |

IDs are permanent. Once assigned, never change them. If a module is retired, mark it `"active": false` — do not delete it or reassign its ID.

---

## Module JSON Structure

### Event Module
```json
{
  "id": "event_planet_001",
  "active": true,
  "title": "The Planet Looks Fine",
  "difficulty": "easy",
  "tone": ["absurd"],
  "node_type": ["planet"],
  "trigger": ["any"],
  "event_presentation": "modal",
  "scene_type": "planet_surface",
  "once": false,
  "sets_flag": null,
  "requires_flag": null,
  "ai_flavor": {
    "aria": "ARIA notes this is a wonderful opportunity.",
    "marv": "MARV has already calculated the outcomes. None are good.",
    "rex": "REX has locked weapons. Just in case.",
    "chip": "CHIP suggests consulting the warranty before proceeding."
  },
  "body": "Flavor text goes here.",
  "choices": [
    {
      "text": "Choice label",
      "requires_crew": null,
      "requires_item": null,
      "requires_flag": null,
      "microgame_type": null,
      "minigame_type": null,
      "effort_cost": null,
      "effort_required": null,
      "requires_effort_from": null,
      "outcome": {
        "resources": { "food": 20, "hull": 0, "fuel": 0, "o2": 0, "morale": 0 },
        "crew_effect": null,
        "severity": null,
        "item_grant": null,
        "item_consume": null,
        "sets_flag": null,
        "time_cost": "low",
        "narrative": "One-line outcome text shown to player."
      }
    }
  ]
}
```

### Event Module — layered variant (added Phase 3 engine integration)

For richer, multi-beat scenarios (pirates, traders, boarding a derelict), an event can carry a `layers` map instead of top-level `body`/`choices`. This is purely additive — every event above stays valid unchanged; the engine only reads `layers` when it's present. New content of this shape lives in `modules/events/events_encounter.json` (kept separate from the per-node-type files since it's organized by *who* you encounter, not *where*).

```json
{
  "id": "event_encounter_pirate_001",
  "active": true,
  "node_type": ["any"],
  "trigger": ["any"],
  "difficulty": "medium",
  "scene_type": "ship_exterior",
  "comm_mode": "screen",
  "npc": { "disposition": "pirate", "species": null },
  "entryLayer": "intro",
  "layers": {
    "intro": {
      "title": "UNINVITED COMPANY",
      "body": "A rust-pocked ship closes on your port side. {npc.quirk}",
      "line": "Hail, little ship. Cut your engines.",
      "ai": { "aria": "...", "marv": "...", "rex": "...", "chip": "...", "ajoy": "..." },
      "choices": [
        {
          "text": "Negotiate", "gate": { "crew": "diplomat" },
          "effort_required": 20, "next": "negotiate"
        },
        {
          "text": "Pay", "gate": { "gold": 20 },
          "outcome": "pirate_paid"
        }
      ]
    },
    "negotiate": {
      "title": "NEGOTIATION",
      "body": "They're listening — for now.",
      "choices": [
        { "text": "Offer a deal", "back": true }
      ]
    }
  },
  "outcomes": {
    "pirate_paid": {
      "title": "THEY PEEL OFF", "tone": "success",
      "body": "You hand over the gold. They burn off into the dark.",
      "resources": { "gold": -20 }, "sets_flag": null, "time_cost": "low"
    }
  }
}
```

Field notes:
- `layers[id].body` = narrator panel text (scene description). `layers[id].line` = the NPC's actual spoken words, rendered in the dialog strip under their portrait. Keep these separate — never combine them into one field.
- Choice navigation is mutually exclusive: `next` (push another layer), `back` (pop to the previous layer), `outcome` (resolve into the `outcomes` map — terminal for this event), `scenario` (jump to a different event's `entryLayer` — use sparingly, this is the closest thing to a new mechanic here).
- `gate: { crew, item, gold }` is an **additive alternate** to the flat schema's `requires_crew`/`requires_item`/`requires_flag` — use whichever fits; the engine checks both shapes. `gold` gating only exists on `gate`, since the flat schema never supported it.
- `npc: { disposition, species }` — `disposition` must be a registered `npc_disposition` value, `species` a registered `npc_species` value (or `null` to let the engine roll one and cache it for the run). Reference the result in text via `{npc.species}`, `{npc.disposition}`, `{npc.quirk}`.
- `outcomes[id]` mirrors the flat schema's `outcome` object fields (`resources`, `crew_effect`, `item_grant`, `item_consume`, `sets_flag`, `time_cost`, `narrative`/`body`) plus `title`, `tone` (`success`|`danger`), and optional `scene_bg`/`scene_bg_base`/`scene_bg_sprite` overrides.
- `materials` (both schemas): a map of material id → quantity granted into `STATE.materials` (fabricator stock), e.g. `"materials": { "scrap": 2, "metal": 1 }`. **Materials and items are different namespaces** — `item_grant` is for `items.json` short ids only, `materials` for `materials.json` ids only; `tools/lint_modules.js` enforces both. (The original per-node-type events granted material ids through `item_grant` for months — they landed in `STATE.items` as inert junk until the 2026-08-02 migration.)
- `clears_pest: true` (outcome field): ends an active growbay pest outbreak (the engine rolls pest onset daily, scaled by the crop's `contamination_resistance`; the growbay's TREAT button is the non-event cure). `fabricator_repair: true` (outcome field): un-breaks the fabricator and caps wear at 50 — the flip side of a craft-failure breakage.
- **Minigame-launching choices** (flat schema): `launch_minigame: "<id>"` (ids from `engine/js/minigames.js`: `scan`/`engine`/`medical`/`forage`/`brace`/`breach`/`salvage`) plays the real minigame BEFORE the outcome applies. Optional `minigame_opts` passes through to the game. Optional `tier_outcomes: { perfect|good|poor: { resources?, narrative? } }` overlays the base `outcome` per result tier (resources merge key-wise, narrative replaces). This is how MEDICAL/BRACE/BREACH — which have no Stop Menu verb — are reached: see `event_crisis_015/016/017` for the reference cases.
- **Combat hijack fields** (Phase 5, `events_encounter.json`'s pirate scenario is the reference case) — checked in `handleChoiceClick()` *before* the `next`/`back`/`outcome`/`scenario` navigation above, so a choice carrying one of these ignores any navigation fields also present:
  - `triggerCombat: true` — mounts the ship-to-ship combat mode-swap (`engine/js/combat.js`) in place on the encounter screen. No `outcome` needed; combat resolves its own terminal outcome when it ends.
  - `triggerRamResolve: true` — resolves a ramming attempt: 30% chance it fails and falls into `triggerCombat`'s mode-swap (player takes `choice.hull` damage first, enemy fires first shot); otherwise resolves normally into `choice.outcome`. Requires both `outcome` (the success-path outcome id) and `hull` (ram damage amount, both for the fail-case combat entry and typically mirrored in the success outcome's own `resources.hull` — ramming costs hull either way).
  - `triggerFleeResolve: true` — thin wrapper that resolves `choice.outcome` exactly like a bare `outcome` choice would. Exists as a named hook (matching `triggerCombat`/`triggerRamResolve`) so a future flee-risk mechanic can be added without touching authored content.

### Item Module
```json
{
  "id": "item_gas_analyzer_001",
  "active": true,
  "name": "Gas Analyzer",
  "description": "Identifies atmospheric composition. Required for safe planet assessment.",
  "item_source": "purchasable",
  "item_behavior": ["passive_effect"],
  "item_location_condition": "any",
  "requires_item": null,
  "cargo_slots": 1,
  "base_price": 80,
  "passive_flavor": "The gas analyzer hums quietly near the viewport.",
  "one_use": false,
  "effort_contribution": null
}
```

### Crew Module
```json
{
  "id": "crew_engineer_001",
  "active": true,
  "role": "engineer",
  "name": "Sample Name",
  "bio": "One-line bio. Dry. Revealing.",
  "passive_skill": {
    "description": "Hull repair events cost less time and resources.",
    "effect": "effort_contribution",
    "effort_contribution": {
      "repair_types": ["hull_events", "mechanical_events"],
      "value": 25
    },
    "applies_to": ["hull_events"]
  },
  "active_skill": {
    "description": "Emergency patch — prevent 1 hull damage event per leg.",
    "uses_per_leg": 1,
    "recharges_at": "station"
  },
  "narrative_unlocks": ["requires_crew: engineer choices in event modules"],
  "crew_display_state": "healthy",
  "eats_double": true
}
```

### Ship Module
```json
{
  "id": "ship_perseverance_001",
  "active": true,
  "name": "The Perseverance",
  "flavor": "Government-issued colony hauler. Beaten up. Reliable. Smells like budget.",
  "requires_ship": "perseverance",
  "cargo_capacity": "large",
  "engine_class": "slow",
  "fuel_burn_modifier": 0.8,
  "unique_trait": "Starts with medic pre-assigned to one crew slot.",
  "starting_credits": "average",
  "starting_items": []
}
```

### Ending Module
```json
{
  "id": "ending_legendary_001",
  "active": true,
  "ending_score": "legendary",
  "tone": ["absurd", "heartwarming"],
  "title": "You Made It. Somehow.",
  "body": "Full ending text goes here.",
  "epitaph": "One-line summary for the ship's log record."
}
```

### Failure Module
```json
{
  "id": "failure_no_fuel_001",
  "active": true,
  "failure_type": "no_fuel",
  "tone": ["grim"],
  "title": "Dead Stop",
  "body": "You are out of fuel. The ship drifts. The stars do not care.",
  "emergency_beacon_option": true,
  "epitaph": "They ran out of fuel. The emergency beacon was in cargo the whole time."
}
```

---

## Cross-Reference Rules When Writing Modules

Every time you write a module that references another module type, verify the ID exists:

| Reference in module | Check file |
|---|---|
| `requires_crew: engineer` | `modules/crew/crew_roster.json` — confirm role exists |
| `requires_item: gas_analyzer` | `modules/items/items.json` — confirm item ID exists |
| `requires_ship: perseverance` | `modules/ships/ships.json` — confirm ship ID exists |
| `requires_ai: marv` | `registry/tag_registry.json` — confirm AI value registered |
| `scene_type: planet_surface` | `registry/tag_registry.json` — confirm scene type registered |
| `sets_flag: *` | Document new flags in a `flags.md` file in `registry/` |
| `requires_flag: *` | Check `registry/flags.md` — flag must be set by another module |

---

## Flags

Flags are game-state booleans set by event outcomes and checked by later events. They enable consequence events — choices made early affecting what appears later.

All flags must be documented in `registry/flags.md` with:
- Flag ID (snake_case)
- Which module sets it
- Which modules check it
- What it means narratively

Example:
```
flag: spared_inevitable_misunderstanding
set_by: event_general_014 (choice: let pirates go)
checked_by: event_general_022 (the same ship returns)
narrative: The crew of the Inevitable Misunderstanding remembers you.
```

---

## Resources Reference (for outcome objects)

All resource deltas go in the `outcome.resources` object. Valid keys:

| Key | Range | Notes |
|---|---|---|
| `fuel` | 0–100 | Negative = consumed |
| `food` | 0–100 | Negative = consumed |
| `o2` | 0–100 | Negative = consumed |
| `hull` | 0–100 | Negative = damage |
| `morale` | 0–100 | Negative = crew unhappy |

Time cost is separate — use `outcome.time_cost` with a value from `effort_cost` tag values: `trivial`, `low`, `medium`, `high`, `extreme`. For repair choices that invoke the effort system, also set `effort_required` to a numeric value (see GAME_BIBLE Section 8 for benchmarks). The `effort_cost` label is for pool filtering; `effort_required` is the number the engine does math with.

---

## Crew Effects Reference (for outcome objects)

`outcome.crew_effect` valid values:
```json
{ "type": "injure", "target": "random" }
{ "type": "injure", "target": "specific_role", "role": "engineer" }
{ "type": "kill",   "target": "random" }
{ "type": "kill",   "target": "specific_role", "role": "pilot" }
{ "type": "heal",   "target": "all_injured" }
{ "type": "heal",   "target": "specific_role", "role": "medic" }
```

---

## Tone & Voice

Every line of text written in modules must match the game's voice. Before writing flavor text, re-read this:

> The game is intentionally tonally inconsistent — retro kitsch, corporate bureaucracy, and grimy used-universe all coexist. An event can reference a galactic permit office on the same screen as a physics-defying anomaly. Both are treated with equal narrative deadpan.

**Write like:**
- Douglas Adams — huge consequences described in the flattest possible voice
- The Far Side — absurd premise, played completely straight
- Oregon Trail — terse, unsentimental, occasionally brutal

**Avoid:**
- Winking at the player ("get it?")
- Explaining the joke
- Exclamation points (CHIP and ARIA are the only characters who use them, intentionally — ARIA's relentless positivity IS exclamation points; everyone else stays dry)
- Purple prose — one good dry sentence beats three flowery ones

**Crew epitaphs** are drawn from `modules/flavor/flavor_pools.json`. They are one sentence. They are not sad. They are the saddest thing in the game.

---

## AI Companion Flavor Lines

Every fullscreen event should include an `ai_flavor` object with one line per AI. These replace a standard UI widget line during that event. Keep them short. Each AI has a distinct register:

| AI | Register | Never does |
|---|---|---|
| ARIA | Relentlessly positive, factually questionable | Express doubt |
| MARV | Accurate, bleak, already calculated this | Offer encouragement |
| REX | Military threat assessment applied to everything | Diplomacy |
| CHIP | Corporate, sponsored, Terms of Service | Say anything for free |

Modal events may omit `ai_flavor` if the event is very short. Fullscreen events should always include it.

---

## The Pity Counter (Engine Note for Phase 2)

The event pool uses a hidden pity counter. After 4 consecutive events tagged `difficulty: hard` or `difficulty: ultra`, the engine temporarily weights toward `difficulty: easy` or `difficulty: medium` events. Do not encode this in module tags — it is pure engine logic. Noted here so Phase 2 engine code implements it correctly.

---

## Map Generation Rules (Engine Note for Phase 2)

From Bible Section 9. Implement exactly as specified:

- No two identical `node_type` values in a row
- `node_type: void` only after node 5 on hard maps
- Final node before destination is always `node_type: station`
- `node_type: anomaly` does not appear in first two legs
- Each fork branch must have a different `branch_flavor`
- Map names drawn from `flavor_pools.json` — cosmetic only, no mechanical weight

---

## Scene Image Pool Rules (Engine Note for Phase 2)

From Bible Section 16:
- Each `scene_type` has a pool of pixel art variants
- Engine tracks which have been shown this run
- Never repeat a variant within a single run
- Each variant has a `tone` tag — engine selects from tone-appropriate subset based on current event
- `min_variants_before_launch` must be met per scene type before the game is shippable

---

## Module Loading Notes (Engine Note for Phase 2)

### items.json — filter _section objects on load

items.json contains annotation objects of the form { "_section": "..." } with no id field.
These are authoring separators, not items. The engine must filter them before processing:

  const items = rawItems.filter(entry => !entry._section);

Apply this filter immediately after JSON.parse. Do not modify items.json itself.

---

## First Session Protocol — Run This Before Anything Else

When starting a fresh session with no modules built yet, do not begin writing files. Instead, run a full bible audit and produce a human-readable report of everything needed before work can begin. Present this report to the human and wait for responses before proceeding.

### The Audit

Read `GAME_BIBLE.md` completely. Then report the following, organized exactly as shown:

---

**1. CONTENT I NEED YOU TO WRITE OR CONFIRM**

List every piece of content the bible defines structurally but hasn't actually written yet. These are things only the human can provide — names, flavor text, event bodies, epitaphs, etc. For each item, state exactly what's needed and where it goes.

Examples of what to surface:
- "The bible defines 8 crew epitaphs in the flavor pool but they are placeholders. Please write or approve the final text for all 8."
- "The bible lists 3 ship names and flavor lines. Please confirm these are final or provide alternatives."
- "events_crisis.json needs events for each of: low_fuel, low_food, low_o2, low_hull, low_morale. Please provide at least 2 events per trigger, or confirm I should generate them in the game's voice for your review."
- "The Stowaway crew card needs a sub-pool of possible identities to draw from. The bible describes the concept but lists no actual stowaway characters."

---

**2. ART ASSETS I CANNOT CREATE**

List every pixel art asset the game requires that must be provided externally. For each, state the scene type, minimum quantity needed before launch (from the registry), and what tone variants are required.

Format:
```
Scene type: station_interior
Minimum variants needed: 2
Tone variants required: mundane, horror, corporate, absurd
Status: 0 of 2 minimum provided
```

Also list:
- Ship sprites (3 ships, pixel art, side view for travel screen)
- Crew icon sprite (the helmet/astronaut silhouette used for health display)
- Resource bar icons (one per resource: fuel, food, o2, hull, morale)
- Any other UI pixel art elements

---

**3. DESIGN DECISIONS THE BIBLE LEAVES OPEN**

List anything the bible is ambiguous or silent about that will require a concrete decision before the engine can implement it. Do not invent answers — surface them.

Examples:
- "The bible specifies the pity counter fires after 4 hard events in a row but does not specify how long the pool re-weights toward easy. How many legs does the easier weighting last?"
- "The bible says the Stowaway is revealed on the first event that references them. Does the player see the reveal as a modal event, or does the crew icon simply update silently?"
- "The bible describes faction reputation as a hidden number but does not specify the range or what threshold values trigger reputation-gated events. Please define this."
- "The travel screen shows flavor objects drifting past. Are these purely cosmetic CSS elements, or do any of them trigger events when clicked?"

---

**4. THINGS I CAN GENERATE FOR YOUR REVIEW**

List content the bible defines well enough that it can be generated in the correct voice and structure, but that should be reviewed by the human before being locked in. Offer to generate these in batches.

Examples:
- "I can draft all events for events_general.json in the game's voice for your review. Confirm and I will begin."
- "I can write all crew bios and passive/active skill descriptions based on the bible. Confirm and I will begin."
- "I can write all failure screen text for all 5 failure types. Confirm and I will begin."

---

**5. WHAT I CAN BUILD IMMEDIATELY WITHOUT INPUT**

List everything that is fully specified in the bible and registry and requires no human input to begin. This is what gets built first once the human has responded to items 1–4.

Examples:
- "`registry/tag_registry.json` — fully specified in Bible Section 22, ready to generate"
- "`modules/ships/ships.json` — 3 ships fully specified in Bible Section 5, ready to generate"
- "`modules/items/items.json` — all items fully specified in Bible Section 15, ready to generate"

---

Present this full report, then wait. Do not begin building until the human has responded to at least sections 1, 2, and 3. Section 4 items can be queued for the next session. Section 5 items can begin as soon as the human says go.

---

## What to Ask Before Doing

If any of the following situations arise, stop and ask before proceeding:

1. A design decision the bible doesn't cover
2. A tag value you want to use that isn't in the registry
3. A cross-reference ID that doesn't exist in its module file yet
4. Anything that would require modifying a module file during Phase 2
5. A flag that no existing module sets (dangling `requires_flag`)
6. Any structural change to module JSON schemas

**Do not invent solutions to design gaps.** The bible is the authority. If the bible is silent on something, surface it.

---

## Quick Reference — Valid Tag Dimensions

All 33 tag dimensions registered in `registry/tag_registry.json`:

`difficulty` · `tone` · `node_type` · `trigger` · `branch_flavor` · `requires_crew` · `requires_item` · `requires_ai` · `requires_ship` · `minigame_type` · `minigame_end_condition` · `minigame_trigger` · `microgame_type` · `microgame_difficulty_modifier` · `event_presentation` · `comm_mode` · `failure_type` · `ending_score` · `effort_cost` · `requires_effort_from` · `scene_type` · `item_behavior` · `item_source` · `item_location_condition` · `crew_display_state` · `severity` · `npc_disposition` · `npc_species` · `npc_station_job` · `trail` · `captain_background` · `crop_type` · `fabricator_state`

If you need a dimension not in this list, add it to the registry first.

---

*CLAUDE.md version: 0.7 — matches GAME_BIBLE.md version 0.7*
*Update version numbers together whenever either document changes.*

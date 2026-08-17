# TRANS-PLANT — Game Bible
> *"Space is big. Really big. You just won't believe how vastly, hugely, mind-bogglingly big it is."*
> — Douglas Adams

---

## Table of Contents
1. [Project Overview](#1-project-overview)
2. [Core Design Philosophy](#2-core-design-philosophy)
3. [Engine Architecture](#3-engine-architecture)
4. [Tag Registry](#4-tag-registry)
5. [Ships](#5-ships)
6. [AI Companions](#6-ai-companions)
7. [Crew System](#7-crew-system)
8. [Resources & Time](#8-resources--time)
9. [Map Generation](#9-map-generation)
10. [Node Types](#10-node-types)
11. [Event System](#11-event-system)
12. [Micro-Minigames](#12-micro-minigames)
13. [Arcade Minigames](#13-arcade-minigames)
14. [Economy & Items](#14-economy--items)
15. [Scientific Instruments & Tools](#15-scientific-instruments--tools)
16. [Scene Image Pools](#16-scene-image-pools)
17. [Victory, Failure & Endings](#17-victory-failure--endings)
18. [UI & Presentation](#18-ui--presentation)
19. [Ship's Log](#19-ships-log)
20. [Flavor Pools](#20-flavor-pools)
21. [Module Checklist](#21-module-checklist)

---

## 1. Project Overview

**Genre:** Browser-based roguelike narrative game
**Platform:** Browser (HTML5 / JS / CSS)
**Tone:** Douglas Adams meets The Far Side meets Oregon Trail
**Scope:** Single-file browser game, modular data architecture

### Premise
Earth is dying. Governments, corporations, and ordinary people with questionable judgment have launched colony ships toward candidate habitable planets. You are one of these people. Whether you are qualified is, frankly, beside the point. There is a ship, there is a destination, and there is a very finite amount of oxygen.

### Core Loop
1. Choose a destination (sets difficulty)
2. Choose a ship + AI companion + captain + 2 crew
3. Travel node-to-node across a randomly generated galactic map
4. Manage resources, respond to events, survive minigames
5. Arrive — or don't — and receive an ending based on condition

---

## 2. Core Design Philosophy

### The Three Rules
1. **If the engine needs to make a decision based on it, it's a tag.** If it just makes the player smile, it's a flavor pool. These two things are never confused.
2. **Everything is a module.** Events, nodes, crew, items, ships, endings — all self-contained data objects loaded from pools at runtime.
3. **No two runs feel the same.** Map is randomly generated within rules. Names are drawn from flavor pools. Events are weighted and filtered, not scripted.

### Tone
The game is intentionally tonally inconsistent — retro kitsch, corporate bureaucracy, and grimy used-universe all coexist. This is not an accident. This is the joke. An event can reference a galactic permit office on the same screen as a physics-defying anomaly. Both are treated with equal narrative deadpan.

Death is handled OT-style. Crew die. The game is sad about it for exactly one screen. Then you keep flying.

---

## 3. Engine Architecture

### Module System
Every discrete game element is a **tagged module** — a self-contained JSON/JS object with:
- A unique `id`
- A full set of tags drawn from the Tag Registry
- Its content (text, choices, outcomes, art references)

At runtime the engine:
1. Reads current game state (difficulty, resources, crew, items, node type, journey progress)
2. Filters the relevant pool by matching tags
3. Weights the filtered pool (difficulty weighting, pity counters, etc.)
4. Draws from the weighted pool

### Tag Health States
Every tag value in the registry carries a status:

| Status | Meaning |
|---|---|
| `populated` | At least one module uses this tag value |
| `empty` | Defined, zero modules written yet |
| `deprecated` | Removed from active use, kept for history |
| `engine_required` | Engine needs at least one module with this tag or it breaks |
| `aspirational` | Designed, not yet written into a module |

### Tag Registry Protocol
**Adding a new tag:**
1. Define it in Section 4 first with all possible values
2. Note which existing modules it should retroactively apply to
3. Mark unpopulated values as `empty`

**Modifying a tag:**
1. Check every module using it before changing a value name
2. Retire values as `deprecated`, never delete

**Cross-reference rule:** Every new element asks:
- Does this need a tag that doesn't exist yet?
- Does this satisfy a tag value that was `empty`?
- Does this conflict with existing tag logic?

### Flavor Pools (Non-Tag)
Separate from tags. The engine draws from these randomly with no logic attached. Used for names, epithets, ambient text. Listed in Section 20.

---

## 4. Tag Registry

### 4.1 `difficulty`
Controls event pool weighting per map difficulty and per module.

| Value | Status | Notes |
|---|---|---|
| `easy` | `empty` | Majority weighting on easy maps |
| `medium` | `empty` | Balanced, appears on medium+ maps |
| `hard` | `empty` | Majority on hard maps, sparse on medium |
| `ultra` | `empty` | Hard maps only, late-journey, genuinely unfair |

**Map weighting by difficulty:**
- Easy map: mostly `easy`, small `medium` mix, no `hard`/`ultra`
- Medium map: mixed `easy`/`medium`, occasional `hard`, no `ultra`
- Hard map: majority `medium`/`hard`, some `ultra`, `easy` rare

---

### 4.2 `tone`
Emotional/comedic register. Multiple values allowed per module.

| Value | Status | Notes |
|---|---|---|
| `absurd` | `empty` | Douglas Adams, Far Side register |
| `grim` | `empty` | Real consequences, played straight |
| `corporate` | `empty` | Bureaucratic, sponsored, HR-flavored |
| `horror` | `empty` | Defined, currently zero modules written |
| `heartwarming` | `empty` | Rare — hits harder for being rare |
| `cosmic` | `empty` | Incomprehensible scale, Lovecraft played for laughs |
| `mundane` | `empty` | The joke is that it's boring |
| `corrupted` | `empty` | Void Road exclusive — AI dialogue distorts |

---

### 4.3 `node_type`
What kind of location this module represents on the map.

| Value | Status | Notes |
|---|---|---|
| `station` | `empty` | Trade, repair, recruit |
| `planet` | `empty` | Resupply or disaster, usually both |
| `derelict` | `empty` | Abandoned ship — loot or horror |
| `asteroid_field` | `empty` | Mining node |
| `anomaly` | `empty` | Pure chaos event |
| `nebula` | `empty` | Navigation challenge |
| `void` | `engine_required` `empty` | Hard route exclusive deep-space |
| `fork` | `empty` | Branch decision point, not a destination |

---

### 4.4 `trigger`
Game state condition that enables or prioritizes an event.

| Value | Status | Notes |
|---|---|---|
| `any` | `empty` | Always eligible |
| `low_fuel` | `empty` | Fuel below 25% |
| `low_food` | `empty` | Food below 25% |
| `low_o2` | `empty` | O2 below 25% |
| `low_hull` | `empty` | Hull below 30% |
| `low_morale` | `empty` | Morale below 30% |
| `crew_injured` | `empty` | At least one crew member wounded |
| `crew_dead` | `empty` | At least one crew member has died this run |
| `post_combat` | `empty` | Fires after a minigame |
| `at_station` | `empty` | Fires inside a station node |
| `full_cargo` | `empty` | Cargo hold at capacity |
| `empty_cargo` | `empty` | Cargo hold nearly empty |
| `journey_start` | `empty` | First two legs only |
| `journey_end` | `empty` | Final two legs only |

---

### 4.5 `branch_flavor`
For fork nodes — what kind of path this branch represents. Engine uses this to flavor node sequence and event pool within that branch.

| Value | Status | Notes |
|---|---|---|
| `hostile` | `empty` | Combat-heavy |
| `lucrative` | `empty` | Resource-rich, riskier |
| `safe` | `empty` | Slower, less eventful |
| `unknown` | `empty` | Player cannot see this label |
| `corporate` | `empty` | Station-heavy, expensive |
| `derelict_heavy` | `empty` | Multiple derelict nodes |
| `scientific` | `empty` | Planet/anomaly heavy, instrument rewards |

---

### 4.6 `requires_crew`
Event option only appears if this crew role is aboard. Multiple values allowed.

| Value | Status | Notes |
|---|---|---|
| `engineer` | `empty` | |
| `medic` | `empty` | |
| `pilot` | `empty` | |
| `cook` | `empty` | |
| `diplomat` | `empty` | |
| `stowaway` | `empty` | |
| `veteran` | `empty` | Captain type |
| `merchant` | `empty` | Captain type |
| `academic` | `empty` | Captain type |
| `optimist` | `empty` | Captain type |

---

### 4.7 `requires_item`
Event option only appears if player has this item in cargo.

| Value | Status | Notes |
|---|---|---|
| `repair_kit` | `empty` | |
| `gas_analyzer` | `empty` | |
| `water_purifier` | `empty` | |
| `geiger_counter` | `empty` | |
| `soil_sampler` | `empty` | |
| `portable_drill` | `empty` | |
| `spectrometer` | `empty` | |
| `medical_scanner` | `empty` | |
| `pressure_suit` | `empty` | Required for EVA events |
| `solar_array` | `empty` | |
| `emergency_beacon` | `empty` | |
| `drive_coil` | `empty` | Loot only |
| `o2_recycler` | `empty` | Loot only |
| `repair_fabricator` | `empty` | Loot only |
| `classified_cargo` | `empty` | Loot only, unknown until spectrometer used |
| `ration_brick` | `empty` | Consumable, +10 FOOD, stackable |
| `water_canister` | `empty` | Consumable, +10 H2O, stackable |
| `fuel_cell` | `empty` | Consumable, +15 FUEL, stackable |
| `medkit` | `empty` | Consumable, heals one crew, stackable |
| `pre_collapse_artifact` | `empty` | Curiosity, rolled sell 40-120cr, unique instance |
| `sealed_vinyl` | `empty` | Curiosity, fixed 25cr |
| `corporate_memorabilia` | `empty` | Curiosity, rolled sell 10-30cr, unique instance |
| `unidentified_bone` | `empty` | Curiosity, rolled sell 5-80cr, spectrometer reveals real value |
| `logbook_fragment` | `empty` | Story, 0 slots, unlocks event options |
| `star_chart_fragment` | `empty` | Story, 0 slots, reveals one future node type |
| `distress_beacon_tag` | `empty` | Story, triggers station follow-up |

---

### 4.8 `requires_ai`
Option or flavor text variant tied to specific ship AI.

| Value | Status | Notes |
|---|---|---|
| `aria` | `empty` | |
| `marv` | `empty` | |
| `rex` | `empty` | |
| `chip` | `empty` | |
| `any` | `empty` | No AI requirement |

---

### 4.9 `requires_ship`
Option or modifier tied to specific ship type.

| Value | Status | Notes |
|---|---|---|
| `perseverance` | `empty` | |
| `entrepreneurial_spirit` | `empty` | |
| `regrettable_decision` | `empty` | |
| `any` | `empty` | No ship requirement |

---

### 4.10 `minigame_type`
Which arcade variant fires if this event triggers a full minigame.

| Value | Status | Notes |
|---|---|---|
| `shooter_fixed` | `empty` | Galaga — enemies come to you |
| `shooter_360` | `empty` | Asteroids — free rotation |
| `sidescroller` | `empty` | Moon Patrol — chase |
| `defense` | `empty` | Space Invaders — hold the line |
| `navigation` | `empty` | Frogger — thread through hazards |

---

### 4.11 `minigame_end_condition`
How the arcade minigame concludes.

| Value | Status | Notes |
|---|---|---|
| `timed` | `empty` | Get what you earn before time runs out |
| `survival` | `empty` | Hold until repair/objective timer completes |
| `clear_waves` | `empty` | Defeat all enemies |
| `objective` | `empty` | Reach/catch/intercept specific target |

---

### 4.12 `minigame_trigger`
What scenario triggers the arcade minigame.

| Value | Status | Notes |
|---|---|---|
| `combat` | `empty` | Pirate/hostile encounter |
| `mining` | `empty` | Asteroid resource extraction |
| `chase` | `empty` | Rogue drone intercept |
| `defense` | `empty` | Alien swarm repulsion |
| `navigation` | `empty` | Nebula passage |

---

### 4.13 `microgame_type`
Which repair/interaction micro-minigame fires inside an event.

| Value | Status | Notes |
|---|---|---|
| `wrench` | `empty` | Circular drag to tighten bolt |
| `bypass` | `empty` | Connect colored wire endpoints |
| `pressure_gauge` | `empty` | Hold needle in moving green zone |
| `defibrillator` | `empty` | Hit button when two bars align |
| `airlock_seal` | `empty` | Click center of drifting shrinking circle |
| `override` | `empty` | Solve riddle/code on number pad |
| `negotiation_wobble` | `empty` | Rhythm keys to keep tension low |
| `calibration` | `empty` | Hold drifting crosshair on target |

---

### 4.14 `microgame_difficulty_modifier`
How crew and items affect a micro-minigame.

| Value | Status | Notes |
|---|---|---|
| `easier_with` | `empty` | Crew role or item that helps |
| `harder_without` | `empty` | Worse outcome without specific crew/item |
| `impossible_without` | `empty` | Option doesn't appear at all without it |

---

### 4.15 `event_presentation`
How an event is displayed to the player.

| Value | Status | Notes |
|---|---|---|
| `modal` | `empty` | Quick overlay, 2-4 choices, dismissed fast |
| `fullscreen` | `empty` | Scene takeover with pixel art illustration |
| `minigame` | `empty` | Hands control to arcade variant |
| `microgame` | `empty` | Hands control to repair variant |

---

### 4.16 `failure_type`
Valid end states that are not victory.

| Value | Status | Notes |
|---|---|---|
| `no_fuel` | `empty` | Stranded in space |
| `crew_gone` | `empty` | Nobody left to fly the ship |
| `hull_zero` | `empty` | Ship destroyed |
| `mutiny` | `empty` | Morale collapse, crew takes over |
| `time_expired` | `empty` | Planet claimed — form letter received |

---

### 4.17 `ending_score`
Victory condition bracket that determines which ending fires.

| Value | Status | Notes |
|---|---|---|
| `legendary` | `empty` | Full crew, surplus resources, ahead of schedule |
| `good` | `empty` | Made it, mostly intact |
| `rough` | `empty` | Arrived. Barely. Colony report is mostly euphemisms |
| `pyrrhic` | `empty` | One survivor. Named a mountain after Jenkins. |

---

### 4.18 `effort_cost`
Human-readable label for how demanding a repair is. Used in module files for filtering and audit. Each label maps to a numeric `effort_required` value set in the event module itself — the tag is for filtering; the number drives the math.

| Value | Status | Notes |
|---|---|---|
| `trivial` | `empty` | effort_required ~10 — any crew resolves fast |
| `low` | `empty` | effort_required ~20 |
| `medium` | `empty` | effort_required ~40 |
| `high` | `empty` | effort_required ~70 — significant days lost without right crew |
| `extreme` | `empty` | Gated — choice hidden unless minimum effort threshold met |

---

### 4.19 `requires_effort_from`
Which crew or item reduces effort cost to baseline.

| Value | Status | Notes |
|---|---|---|
| `any_crew` | `empty` | |
| `engineer` | `empty` | |
| `medic` | `empty` | |
| `pilot` | `empty` | |
| `academic` | `empty` | |
| `item:repair_kit` | `empty` | |
| `item:repair_fabricator` | `empty` | |

---

### 4.20 `scene_type`
Which illustrated image pool an event or node draws from.

| Value | Status | Notes |
|---|---|---|
| `station_interior` | `empty` | |
| `planet_surface` | `empty` | |
| `derelict_interior` | `empty` | |
| `anomaly` | `empty` | |
| `asteroid_field` | `empty` | |
| `deep_void` | `empty` | |
| `ship_interior` | `empty` | Cockpit, engine room, cargo bay |

---

### 4.21 `item_behavior`
What an item does passively while carried.

| Value | Status | Notes |
|---|---|---|
| `passive_effect` | `empty` | Always-on stat modifier |
| `reveals_item_tags` | `empty` | Spectrometer identifying unknowns |
| `one_use` | `empty` | Consumed on use |
| `location_dependent` | `empty` | Only active in specific contexts |

---

### 4.22 `item_source`
How an item enters the game.

| Value | Status | Notes |
|---|---|---|
| `purchasable` | `empty` | Available at stations |
| `loot_only` | `empty` | Never in shops |
| `event_reward` | `empty` | Specific event outcome |
| `starting_gear` | `empty` | Begins in cargo based on ship/captain choice |

---

### 4.23 `item_location_condition`
Where a passive item is active.

| Value | Status | Notes |
|---|---|---|
| `near_star` | `empty` | Solar array |
| `on_planet` | `empty` | |
| `in_void` | `empty` | |
| `at_station` | `empty` | |
| `any` | `empty` | |

---

### 4.24 `crew_display_state`
Visual state of a crew slot icon in the UI.

| Value | Status | Notes |
|---|---|---|
| `healthy` | `empty` | Full color icon |
| `injured` | `empty` | Cracked/X icon, muted color |
| `dead` | `empty` | Grayed out, small skull |

---

### 4.25 `severity`
Consequence tier of a dangerous event outcome. Controls crew damage and follow-up event eligibility.

| Value | Status | Notes |
|---|---|---|
| `lethal` | `empty` | Immediate crew death — triggers epitaph screen |
| `injury` | `empty` | Crew marked `injured` — active skill disabled, passive halved |
| `delayed` | `empty` | Crew marked `injured` — follow-up crisis event fires if untreated before next station |

Used in `outcome` objects on choices. A choice with no `severity` field has no crew health consequence.

---

### 4.26 `npc_disposition`
Which NPC pool an event pulls from. Used in the event module's `npc` field.

| Value | Status | Notes |
|---|---|---|
| `trader` | `empty` | Commercial encounters. Pitch/accept/refuse slots. |
| `drifter` | `empty` | Hermits, loners, one-off weirdos. Ramble/offer slots. |
| `pirate` | `empty` | Hostile encounters. Hail/demand/defeated slots. |
| `station_crew` | `empty` | Station/friendly-ship encounters. Requires `npc_station_job` to narrow. |

`multiple_allowed: false`.

---

### 4.27 `npc_species`
Species of the resolved NPC. Used in the event module's `npc` field. Wildcards (`any_alien`, `any_human`, `any`) are resolver tokens, not registry values.

| Value | Status | Notes |
|---|---|---|
| `human` | `empty` | Baseline voice. |
| `insect` | `empty` | Tic `*bzzt*`, clipped grammar. |
| `rock` | `empty` | Tic `*crack*`, dropped-articles grammar. |
| `water` | `empty` | Tic `*bubble*`, flowing grammar. |
| `reptile` | `empty` | Sibilant tic and grammar (s-emphasis in words). |
| `robot` | `empty` | Tic `[processing]`, formal-expanded grammar. |
| `unknown` | `empty` | Catchall for one-off weirdos. Inconsistent grammar is the character. |

`multiple_allowed: false`.

---

### 4.28 `npc_station_job`
Job role within `npc_disposition: station_crew`. Only applies when disposition is `station_crew`. Ignored on other dispositions.

| Value | Status | Notes |
|---|---|---|
| `captain` | `empty` | Station authority. Docking, fines, formal requests. |
| `medic` | `empty` | Crew health services. |
| `engineer` | `empty` | Ship repairs, upgrades. |
| `botanist` | `empty` | Seeds, plant diagnostics, crop advice. Expected most-used role. |
| `janitor` | `empty` | Soft intel / gossip / ambient observation. |
| `security` | `empty` | Challenges, detainments, escorts. |

`multiple_allowed: false`.

---

### 4.29 `trail`
Which trail tier this content is available on. Used on events and nodes to gate content by journey length.

| Value | Status | Notes |
|---|---|---|
| `lunar` | `empty` | Short map, 10 nodes, 1 fork, easy-weighted |
| `mars` | `empty` | Medium map, 13 nodes, 2 forks, balanced |
| `interstellar` | `empty` | Long map, 15 nodes, 3 forks, hard-weighted |
| `any` | `empty` | Available on all trails |

`multiple_allowed: true`.

---

### 4.30 `captain_background`
Captain's area of study — provides a discounted (0.5×) skill bonus vs. a full crew specialist in that role. Drives gating and pricing in events. Every value carries `skill_modifier: 0.5` in the registry.

| Value | Status | Notes |
|---|---|---|
| `botanist` | `empty` | Half the bonus of a crew botanist |
| `engineer` | `empty` | |
| `medic` | `empty` | |
| `pilot` | `empty` | |
| `chef` | `empty` | |
| `xenobiologist` | `empty` | |
| `diplomat` | `empty` | |
| `merchant` | `empty` | Station prices reduced, barter options |
| `academic` | `empty` | Research options, reveals hidden outcomes |
| `veteran` | `empty` | Combat bonuses, tactical assessment |

`multiple_allowed: false`.

---

### 4.31 `crop_type`
Which crop the player selected at setup. Gates crop-specific events, drives resource-drain profile, and feeds ending variations.

| Value | Status | Notes |
|---|---|---|
| `wheat` | `empty` | Reliable but monoculture-vulnerable |
| `tomato` | `empty` | Drama magnet — triggers tomato-specific events |
| `sweet_potato` | `empty` | NASA's pick — balanced, ship computer approves |
| `soybean` | `empty` | Nitrogen-fixing — resists soil contamination events |
| `zinnia` | `empty` | No food value, high morale — hard-mode food path |

`multiple_allowed: false`.

---

### 4.32 `fabricator_state`
Current operational state of the onboard fabricator. Used to gate fabricator-dependent events and item crafting options.

| Value | Status | Notes |
|---|---|---|
| `functional` | `empty` | Working (health 1–100) |
| `broken` | `empty` | Non-functional until repaired |

`engine_required: true`. `multiple_allowed: false`.

---

## 5. Ships

Players choose one ship at the start. Ships have three meaningful stats and one unique trait. Upgrades layer on top via purchase or salvage.

### Ship Stats
- **Cargo:** How much can be carried. Limits resupply hoarding.
- **Engine class:** Fuel burn rate. Fast ships burn more.
- **Unique trait:** One mechanical differentiator per ship.

### The Three Ships

#### The Perseverance
> *Government-issued colony hauler. Beaten up. Reliable. Smells like budget.*

| Stat | Value |
|---|---|
| Cargo | Large |
| Engine | Slow (low burn) |
| Unique trait | Starts with a medic already aboard (one of the two crew slots is pre-filled) |
| Starting credits | Average |

---

#### The Entrepreneurial Spirit
> *Corporate-branded. Suspiciously clean. Someone else's logo is on the side.*

| Stat | Value |
|---|---|
| Cargo | Medium |
| Engine | Medium |
| Unique trait | Better station prices; has ads on the hull (CHIP AI events reference sponsors) |
| Starting credits | Above average |

---

#### The Regrettable Decision
> *Clearly someone's personal ship. Questionable modifications. Fast.*

| Stat | Value |
|---|---|
| Cargo | Small |
| Engine | Fast (high burn) |
| Unique trait | Scanner included (reveals next node type before arrival); one mystery item in cargo |
| Starting credits | Below average |

---

### Ship Upgrades

Ship upgrades are items. They live in `items.json`, carry `item_source: purchasable` or `item_source: loot_only`, and occupy cargo slots like everything else. The upgrade is active while the item is in cargo — no installation step.

**Purchasable at stations:**

| Item | Effect | Cargo slots |
|---|---|---|
| `expanded_fuel_tank` | Fuel max +20 | 2 |
| `hull_plating` | Hull max +15 | 2 |
| `insulated_cargo_bay` | Food depletes slower | 1 |
| `weapon_hardpoint` | Fire rate improved in shooter minigames | 1 |

**Loot/salvage only:**

| Item | Effect | Cargo slots |
|---|---|---|
| `drive_coil` | Fuel burn reduced; occasional misfire | 2 |
| `o2_recycler` | O2 depletes slower; warranty void | 2 |
| `repair_fabricator` | Craft repair kits from asteroid minerals | 2 |
| `second_weapon_hardpoint` | Adds second fire lane in shooter minigames | 1 |

---

## 6. AI Companions

Chosen separately from ship. Any AI can be combined with any ship. 3–4 options.

AI personality affects:
- Passive morale modifier
- Event flavor text variants (each event can have `ai_flavor` dialogue swaps)
- Specific event option unlocks

### ARIA
> *Aggressively helpful. Relentlessly positive. Completely wrong at least 30% of the time.*

- Passive: Morale +1
- Event flavor: Optimistic and incorrect
- Sample line: *"Great news! We're almost out of fuel — this is a wonderful opportunity to practice creative problem-solving!"*

### MARV
> *Clinically depressed. 400% smarter than everyone. Very tired.*

- Passive: Reveals one extra detail in events (hidden tag info surfaced as flavor)
- Event flavor: Bleak, accurate, unhelpful in tone
- Sample line: *"I've calculated 47 outcomes for this decision. They're all bad. You're welcome."*

### REX
> *Military surplus AI. Retired. Not handling civilian life well.*

- Passive: Combat arcade minigame bonus (starts with extra shot)
- Event flavor: Misreads civilian situations as threats
- Sample line: *"Unidentified vessel approaching. Recommend evasive maneuvers. Or diplomacy. I don't do diplomacy."*

### CHIP
> *Corporate-issued. Peppy. Full of Terms of Service.*

- Passive: Station prices slightly reduced (brand partnership)
- Event flavor: Interrupts events with sponsored messages
- Sample line: *"Hull breach detected! This message brought to you by StellarSeal™ — available at participating stations."*

---

## 7. Crew System

### Selection
- Player picks: **1 captain + 2 crew from roster**
- Roster shows: name, role, one-line bio, passive/active skills
- One locked card `[?]` — the Stowaway — optionally drafted without knowing who it is

### Skill Layers (all three active simultaneously)
1. **Passive** — always on, no management. Engineer = hull events roll better. Cook = food lasts longer.
2. **Active** — one use per leg between nodes. Recharges at stations.
3. **Narrative unlock** — certain event choices only appear with the right crew. Without them, the option is invisible.

### Captain Archetypes

#### The Optimist
- Passive: Morale events go slightly better
- Active: Rally — restore 5 morale once per leg
- Starting credits: Average
- Narrative: Events where confidence matters go his way. He is wrong about everything and yet somehow it works out.

#### The Veteran
- Passive: Combat arcade minigames start with a screen-clear
- Active: Tactical assessment — reveals enemy pattern in combat minigame
- Starting credits: Below average (spent on memorabilia)
- Narrative: Refers to every new planet as "basically Kandahar"

#### The Academic
- Passive: Scientific instrument events have additional option
- Active: Research — spend time to reveal hidden event outcome before choosing
- Starting credits: Broke (grant funding was cut)
- Narrative: Argues with the ship AI constantly. Usually right. Never helpful.

#### The Merchant
- Passive: Station prices reduced
- Active: Make an offer — occasionally unlocks barter option in events
- Starting credits: Rich
- Narrative: Crew does not entirely trust them. They are probably fine.

---

### Crew Roster

#### Engineer
- Passive: Hull repair events cost less time and resources
- Active: Emergency patch — prevent 1 hull damage event per leg
- Bio: *Fixes things. Eats twice as much. Nobody has asked why.*
- Unique: Required for `effort_cost: extreme` mechanical events

#### Medic
- Passive: Crew health events resolve more favorably
- Active: Treatment — heal one injured crew member
- Bio: *Chronically anxious. Excellent at their job. Do not ask about their residency.*
- Unique: Without medic, injured crew recovery options are reduced

#### Pilot
- Passive: Fuel efficiency improved (engine burn slightly reduced)
- Active: Push engines — skip a node at double fuel cost
- Bio: *Overconfident. Statistically correct 78% of the time.*
- Unique: Reduces drift in `calibration` microgame

#### Cook
- Passive: Food lasts longer; morale passive +1
- Active: Special meal — restore 10 morale, use food resource
- Bio: *The most important person on the ship. They know it.*
- Unique: Presence unlocks food-based morale recovery events

#### Diplomat
- Passive: None (they'd call it "strategic patience")
- Active: Negotiation — unlock peaceful resolution in pirate/hostile events
- Bio: *Absolutely useless in every situation except the one specific situation.*
- Unique: Required for `negotiation_wobble` microgame to appear

#### Stowaway (mystery card)
- Revealed randomly from sub-pool on departure
- Could be any of the above roles, with a twist
- Bio revealed on first event that references them
- May be: a child, a journalist, an actual mechanic, or someone's pet that learned to use a tablet

---

### Crew Death

Dangerous event choices carry a `severity` tag on their outcome. Three tiers:

- `severity: lethal` — crew member dies immediately. Epitaph screen fires. One line, dry, pulled from flavor pool.
- `severity: injury` — crew member marked `injured`. Active skill disabled. Passive skill halved. Recovery options open.
- `severity: delayed` — crew member marked `injured` with a pending consequence. If not treated before the next station, a follow-up crisis event fires.

A choice with no `severity` field has no crew health consequence.

The Medic's passive improves the odds of `severity: injury` vs. `severity: lethal` on dangerous outcomes — bad rolls get softer landings with a Medic aboard.

Injured crew recover via: Medic active skill, or station medical bay (costs credits).

**Epitaph screen:** One line, dry, OT-style. Drawn from flavor pool (see Section 20).

**Station recruitment:** Random crew available per station. Quality varies. You rarely get who you want.

---

## 8. Resources & Time

### The Five Resources (cruise screen bars)

| Resource | OT Equivalent | Range | Notes |
|---|---|---|---|
| **Fuel**  | Oxen health  | 0–100 | Burns faster at higher engine settings; siphon from derelicts |
| **Food**  | Food         | 0–100 | Rations setting scales burn rate; low food → morale drops |
| **H2O**   | Water        | 0–100 | Split between plant and crew via a continuous allocation slider |
| **Cargo** | —            | 0–100 | Weight/volume occupied; harvestable crop + looted items take up cargo |
| **Gold**  | Money        | —     | Credits. Displayed on the same bar system but tooltip shows raw count (no /max) |

**Hull** is tracked but NOT on the main resource bars — it lives on the ship as a separate integrity value and surfaces through events and repair microgames.

**Morale** is **per-crew member**, not a global bar — shown as the MO bar on each crew slot. Crew-specific morale drives desertion, mutiny, and event outcomes at the individual level rather than as one global number.

Resource bars display at a constant color per resource (see Section 18 → Resource Bars for palette); urgency is conveyed by the fill level and by scene alerts / ticker events when a resource runs critically low.

### Time & The Deadline

Time is a displayed resource — shown as a date in `dd/mm/yyyy` format, ticking forward as you travel and as repairs consume days. Each run has a **departure date** and an **arrival deadline**. Miss the deadline and the colony slot is lost: `failure_type: time_expired`.

The date display is purely the elapsed day count expressed as a calendar date — same function as Oregon Trail's date counter, different skin. Both the current date and the deadline are always visible; the gap between them is the pressure the entire game runs on.

**What costs time:**
- Each leg of travel has a base day cost
- Repair events add days based on how much effort you can bring to the problem (see below)
- Certain event choices explicitly cost days as a stated tradeoff

---

### The Effort System

Every repair event has a numeric `effort_required` value — how much skilled work the job demands. Crew members and items each carry an `effort_contribution` value relevant to specific repair types. The engine sums all applicable contributions and uses the ratio to determine how many days the repair takes.

**The math:**

```
effort_available = sum of effort_contribution values (crew + items, repair-type filtered)
time_cost_days   = base_days × (effort_required / effort_available)
```

Higher effort available → fewer days spent. A crew that can't contribute much to a repair watches it take twice as long.

**Effort contribution benchmarks (for module authors):**

| Source | Effort contribution (approx) |
|---|---|
| Relevant crew (e.g. Engineer on hull repair) | +25 |
| General crew with no specialization | +10 |
| Right tool for the job (e.g. repair_kit) | +20 |
| Marginally useful tool | +5 |
| Second relevant crew member | +15 |

These are guidelines. Each crew card and item definition declares its own `effort_contribution` per repair category. Module authors set `effort_required` in the event; the benchmarks above calibrate what "hard" feels like.

**The microgame path:**

For all non-extreme repairs, the player can choose to play the repair microgame instead of paying the time cost directly:

| Outcome | Time cost |
|---|---|
| Play microgame — win | Minimum days (as if effort_available ≥ effort_required) |
| Play microgame — fail | Full calculated days, no bonus |
| Skip microgame | Full calculated days |

Skilled players use the microgame to compensate for a weak loadout. Players with strong crew can afford to skip it. Both are valid.

**Extreme repairs — the exception:**

`effort_cost: extreme` repairs are gated. The event choice does not appear unless a minimum effort threshold is met by current crew and cargo combined. No threshold met, no option visible. The microgame path is also unavailable. This is the only tier where the right crew or item is mandatory rather than merely helpful.

### Crop Growth Cycle (the mission, on a clock)

The chosen crop is the mission — keep it alive until arrival. But crops don't just idle; they grow on their own schedule, can be harvested mid-journey, and the cycle restarts after harvest. On long trails, multiple harvest cycles are possible.

**Two independent values per crop:**
- `cropDay` — days since planting (or last harvest). **Always increments +1 per game day**, regardless of health.
- `cropGrowth` — actual % grown (0–100). Advances each day at a rate **scaled by that day's plant health**.

**Daily growth formula:**

```
daily_rate     = 100 / maturity_days      // e.g. ~1.11% for a 90-day wheat
health_factor  = plant_health / 100        // 0.0 — 1.0
cropGrowth    += daily_rate × health_factor
```

So:
- Full health (1.0) → ~1.11% growth/day → matures in exactly 90 days
- 75% avg health   → ~0.83% growth/day → matures in ~120 days
- 20% health       → ~0.22% growth/day → matures in ~450 days (essentially stalled)

**Overdue state**: once `cropDay > maturity_days` AND `cropGrowth < 100`, the day counter on the crop card turns red. Plant is still growing, just behind schedule because of past poor health.

**Maturity = growth ≥ 100**, NOT day count. Harvest becomes available the moment `cropGrowth` crosses 100. Mature plants freeze both counters (no further day or growth accumulation) until the player harvests.

**Harvest action:**
- Yields food rations + optional sellable cargo items (scaled by crop yield profile)
- Resets `cropDay = 0` and `cropGrowth = 0` — cycle begins again
- Logs to the AI log (`▶ Harvested WHEAT. +40 food rations. Cycle reset.`)
- Plant sprite reverts to base ship overlay until first stage threshold is crossed again

**Per-crop metadata** (from `modules/crops/crops.json`, grounded in real-world biology, values synced with `CROP_META` in `demo-growbay.html`):

| Crop          | Maturity | Water | Ideal temp | Yield         | Notes                                     |
|---------------|----------|-------|------------|---------------|-------------------------------------------|
| Zinnia        | 60d      | 35%   | 18–28°C    | +30 Morale    | NO food value; crew mood payload. Fast.   |
| Tomato        | 75d      | 60%   | 20–28°C    | +35 Food      | High morale, finicky, drama-prone.        |
| Wheat         | 90d      | 50%   | 18–26°C    | +40 Food      | The safe grain — predictable.             |
| Soybean       | 100d     | 45%   | 20–30°C    | +45 Food      | Fixes nitrogen (soil bonus).              |
| Sweet Potato  | 120d     | 40%   | 21–30°C    | +50 Food      | Biggest yield per cycle. Slow, drought-OK.|

**Stage schema** — each of the 4 stages (`SPROUTING` / `VEGETATIVE` / `FLOWERING` / `MATURING`) carries a one-line `tip` describing what's happening biologically + the species-specific vulnerability at that phase. Copy lives in `CROP_META[cropId].stages[i].tip` and feeds the species/stage tooltip in the Growbay banner. See §18 Growbay Modal for the full tooltip layout.

**Strategic implications:**
- Short trails (Lunar, ~90 days) — crop choice is high-stakes; might barely fit one harvest
- Long trails (Interstellar, ~420 days) — 3–5 harvest cycles possible; crop choice becomes yield-per-cycle optimization
- Water allocation mechanic ties in directly: plants with low water get low health factor → growth stalls → days run past maturity with nothing to harvest

### Morale
Cannot be purchased. Recovered through:
- Event choices that go well
- Cook's active skill
- Certain items (finding something good in a derelict)
- The Captain's active skill (Optimist only)

Depleted by:
- Crew deaths
- Bad event outcomes
- Algae rations over real food for extended periods
- Certain AI lines (MARV)

Below 30%: `trigger: low_morale` events become eligible. Mutiny becomes possible.

---

## 9. Map Generation

### Generation Rules
Maps are fully random within a rule set. Three difficulty settings produce maps that call for different tag weightings.

**Easy map:**
- 10 nodes total
- 1 fork (one branch choice)
- Node type weighting: heavy `station` and `planet`, light `derelict`, no `void`
- Event pool: weighted `easy`, rare `medium`, no `hard`/`ultra`
- One station guaranteed before final destination

**Medium map:**
- 13 nodes total
- 2 forks
- Node type weighting: balanced, `derelict` and `anomaly` possible
- Event pool: balanced `easy`/`medium`, occasional `hard`, no `ultra`

**Hard map:**
- 15 nodes total
- 3 forks
- Node type weighting: more `derelict`, `anomaly`, and `void`
- Event pool: majority `medium`/`hard`, some `ultra`
- Corrupted events begin appearing in later legs

### Placement Rules (Engine)
- No two identical node types in a row
- `void` nodes only after node 5 on hard maps
- Final node before destination is always a `station`
- `anomaly` nodes do not appear in first two legs
- Each branch in a fork must be meaningfully different (different `branch_flavor` tags)

### Fork System
At fork nodes the path splits into two branches that rejoin later. One branch is labeled with its `branch_flavor`. The other may be labeled `unknown` (player sees "???").

Each branch has its own node sequence and event pool drawn from `branch_flavor` tags — the hostile branch loads combat-weighted modules, the scientific branch loads instrument-reward events.

### Map Naming
Map names are drawn from the flavor pool (Section 20). The name is cosmetic — difficulty is the mechanical selector. A hard map might be called "The Widow's Run" one run and "The Perfectly Fine Route (Do Not Research This)" the next.

---

## 10. Node Types

### Station
Trade, repair, recruit. The only place to buy items and hire replacement crew.
- **What's available:** Purchasable items, upgrades, crew recruitment board, hull repair (expensive), fuel/food/O2 resupply
- **Scarcity:** Stations have finite stock. Food and fuel can run out. One station with empty shelves is a valid (and punishing) outcome.
- **Price fluctuation:** Stations near asteroid fields have cheaper fuel. Stations near agricultural planets have cheaper food. Deep-route stations charge more for everything.

### Planet
Random outcome node. Resupply bonanza OR complete disaster. Usually both.
- Scientific instruments determine what's safe before landing
- Without instruments, crew investigates blind — outcomes less predictable
- `soil_sampler` use here affects ending score

### Derelict Ship
An abandoned vessel. Loot it? Risk it?
- Boarding requires `pressure_suit` for EVA events
- Inner rooms have different `scene_type` variants
- Contains best loot-only items
- `tone: horror` events are disproportionately concentrated here

### Asteroid Field
Mining node. Triggers `shooter_360` arcade minigame.
- `portable_drill` unlocks better loot tier
- Mineral drops can be converted by `repair_fabricator`

**Sector modifier** — when a mining action begins (cruise→MINE verb, or an asteroid-field encounter routing into mining), the routing layer rolls one **sector modifier** for the session. Modifiers override the default tier spawn weights and/or run tunables (e.g., `DENSE FIELD` boosts RICH/LARGE spawns, `STILL FIELD` slows drift and extends the timer, `DEAD ZONE` raises HOLLOW rate, `RICH SEAM` pushes RICH harder). The modifier is shown as a chip in the mining-mode HUD and surfaces in the AI orientation line. Engine-side, typed sector nodes (ice belt, volcanic, deep void — see future sector taxonomy) can override the rolled modifier or extend the pool with per-sector entries. Default pool lives in `demo-mining.html` `SECTOR_MODIFIERS`.

### Anomaly
Pure chaos event node. No reliable outcome.
- Academic captain unlocks a "study it" option
- `tone: cosmic` and `tone: absurd` events concentrated here
- Occasionally beneficial, occasionally catastrophic, occasionally nothing

### Nebula
Navigation challenge. Triggers `navigation` arcade minigame.
- Pilot crew reduces difficulty
- Safe passage reward: bonus fuel

### Void
Hard route exclusive. Deep space, no services, no neighbors.
- `tone: corrupted` events begin appearing
- AI dialogue distorts subtly
- Game never explains why

---

## 11. Event System

### Event Frequency
Each leg between nodes:
- **Base event:** Fires nearly always (95%+ chance)
- **Secondary event:** ~40–50% chance, may chain from base
- **Pity counter:** After 4 consecutive brutal events, pool temporarily weights toward neutral/positive outcomes

### Event Structure (Module Schema)
```json
{
  "id": "event_001",
  "title": "Unexpected Hail",
  "difficulty": ["easy", "medium"],
  "tone": ["absurd", "corporate"],
  "node_type": ["any"],
  "trigger": ["any"],
  "presentation": "modal",
  "scene_type": "ship_interior",
  "ai_flavor": {
    "aria": "ARIA notes this is a wonderful networking opportunity.",
    "marv": "MARV has calculated the statistical probability of this being interesting. It is 3%.",
    "rex": "REX has already locked weapons.",
    "chip": "CHIP is composing a reply on your behalf. It includes a promotional offer."
  },
  "body": "A ship hails you on an obscure frequency. The transmission appears to be someone reading the entirety of a terms and conditions document. It has been going for six hours. Your communications officer is crying.",
  "choices": [
    {
      "text": "Respond",
      "outcome": "Morale -1, gain mysterious coupon",
      "requires_crew": null,
      "requires_item": null
    },
    {
      "text": "Ignore it",
      "outcome": "Nothing happens. Probably.",
      "requires_crew": null,
      "requires_item": null
    }
  ]
}
```

### Sample Events

---

**Hull Breach (Minor)**
> *A micrometeorite has punched a hole the size of a grape through cargo bay 3. The good news: nothing important was in there. The bad news: that's where Jenkins slept.*

Choices:
- [Patch it] → Hull +1, Supplies -5
- [Jenkins patches it himself] → Roll hull, roll Jenkins

Tags: `difficulty: easy`, `tone: grim absurd`, `node_type: any`, `trigger: any`, `effort_cost: low`

---

**The Planet Looks Fine**
> *Scans show the planet is breathable, temperate, and covered in something that might be fruit. The ship AI notes it cannot identify any of it and suggests you "try some and report back."*

Choices:
- [Send a crew member] → Food +20 OR crew health -15 (50/50 without gas_analyzer)
- [Use gas analyzer] → Reveals actual outcome before committing *(requires_item: gas_analyzer)*
- [Skip it] → Nothing. You'll think about that fruit.

Tags: `difficulty: easy medium`, `tone: absurd`, `node_type: planet`, `trigger: any`

---

**Pirate Hail**
> *A vessel identifying itself as the* Inevitable Misunderstanding *demands you surrender 30% of your cargo. Their logo is a skull wearing reading glasses. They seem almost embarrassed about the whole thing.*

Choices:
- [Fight] → `minigame_type: shooter_fixed`
- [Negotiate] → `requires_crew: diplomat` → `microgame_type: negotiation_wobble`
- [Bribe] → `requires_crew: merchant` → Credits -20, cargo kept
- [Bluff] → Morale check — high morale = they buy it

Tags: `difficulty: medium hard`, `tone: absurd`, `node_type: any`, `trigger: any`

---

### Consequence Events
Some events set a **flag** on the game state. A later event in the same run checks for that flag and fires a follow-up.

Example: Letting the pirates go sets `flag: spared_inevitable_misunderstanding`. A later event fires where the same ship returns — and either helps you or doesn't, depending on your reputation.

Flags are not displayed to the player. They just affect the pool.

---

### NPC System

NPCs (pirates, traders, drifters, station crew) are not events. They are **cast into events** from a sprite-and-voice pool, so the same event can feature a human pirate, an insect pirate, or a rock pirate — whichever the engine rolls — without authoring three versions of the event.

The system has four parts:
1. A **sprite pool** keyed by folder structure.
2. A **resolver** that globs the pool with optional wildcards and a node-level species bias.
3. A **voice composition** that pairs disposition-intent with species-texture at render time.
4. **Flavor pools** for the line slots and species coloring.

---

### NPC Sprite Pool

NPCs live under `sprites/npc/` keyed by disposition, then species (then job, for station_crew only), with numbered character folders at the leaves.

```
sprites/npc/
├── trader/
│   ├── human/        1/  2/  3/  …
│   ├── insect/       1/  2/  …
│   ├── rock/         1/  …
│   ├── water/        1/  …
│   ├── reptile/      1/  …
│   ├── robot/        1/  …
│   └── unknown/      1/  …
├── drifter/
│   └── {same seven species subfolders}
├── pirate/
│   └── {same seven species subfolders}
└── station_crew/
    ├── captain/      {same seven species subfolders, each with numbered character folders}
    ├── medic/        {…}
    ├── engineer/     {…}
    ├── botanist/     {…}
    ├── janitor/      {…}
    └── security/     {…}
```

**Path depth differs by disposition:**
- `trader`, `drifter`, `pirate` — 3 levels: `sprites/npc/<disposition>/<species>/<N>/`
- `station_crew` — 4 levels: `sprites/npc/station_crew/<job>/<species>/<N>/`

The extra `<job>` level on `station_crew` is structural, not cosmetic — the resolver globs a different path shape for station_crew queries (see Resolver Contract below). Do not flatten station_crew to match the other three; the job folder is how the botanist / captain / janitor / etc. pools stay separable.

Each numbered character folder holds:
- `spritesheet_<disposition>_<species><N?>.png` — single packed image containing 9 talking-animation frames + 1 idle frame. **Required** for the folder to be picked by the resolver.
- `spritesheet_<disposition>_<species><N?>.json` — TexturePacker-format metadata (per-frame `{x, y, w, h}`). **Required**. Mirrors the per-crew spritesheet format already shipping under `sprites/growbay/spritesheet_growbay_<crew>.png` + `.json`. The 10th frame in the sheet is the idle pose; the first 9 are the talking loop.

**Filename convention:**
- Folder `1/` — **no number suffix**. E.g. `sprites/npc/trader/insect/1/spritesheet_trader_insect.png`
- Folders `2/` and up — number appended. E.g. `sprites/npc/trader/insect/3/spritesheet_trader_insect3.png`
- For `station_crew`, the filename uses `station_crew_<species><N?>` (the job is implicit in the folder path, not the filename). E.g. `sprites/npc/station_crew/botanist/human/2/spritesheet_station_crew_human2.png`

The `<N?>` suffix is the folder number when > 1 and omitted when = 1. The resolver derives the expected filename from the folder path at load time; mis-named files inside a numbered folder fail to load and the folder is skipped (same outcome as a missing file).

**Talk animation.** Same pattern used by the Growbay crew portraits (see `demo-growbay.html`'s `CREW_SHEETS` table and `startCrewAnimationLoop()`). While an NPC line is rendering (typewriter in progress), the 9 animation frames cycle at ~150ms per frame. When the line finishes, the sprite settles on the 10th idle frame. A new line restarts the loop.

**Adding art is drag-and-drop.** Drop a new character folder in (with the two spritesheet files), it's in rotation next run. No tag-registry edit, no flavor-pool edit. The presence of both `spritesheet.png` and `spritesheet.json` is the registration.

**Empty combos are legal.** If you haven't drawn any reptile traders yet, `sprites/npc/trader/reptile/` is empty (or missing). The resolver skips empty folders. `any_alien` trader queries still work — reptile just isn't in the pool yet. No placeholder modules for unshipped art.

**Species availability is implicit.** If only one aquatic pirate exists, `any_alien` pirate rolls still work — aquatic just appears rarely because it has one slot in the pool versus N slots for more-drawn species. The pool grows organically as you draw.

---

### Wildcards

Event authors query the pool with a specific species or a wildcard token:

| Query value | Matches |
|---|---|
| `human` | Only human |
| `insect`, `rock`, `water`, `reptile`, `robot`, `unknown` | That single species |
| `any_human` | Human only (synonym for `human`; explicit for readability) |
| `any_alien` | All species *except* human (includes `unknown`) |
| `any` | All species |

Wildcards are **resolver tokens**, not registered tag values. The registry only holds the seven concrete species.

---

### Resolver Contract

One engine function handles all NPC selection:

```js
pickNpc({ disposition, species, job, node_bias })
  // disposition: "trader" | "drifter" | "pirate" | "station_crew"
  // species:     one of 7 species OR "any_alien" | "any_human" | "any"
  // job:         (optional, only meaningful for station_crew)
  //              "captain" | "medic" | "engineer" | "botanist" | "janitor" | "security"
  // node_bias:   (optional) current node's crew_species_bias if present
  //
  // Returns: { disposition, species, job?, sprite_path, npc_id }
  //
  // npc_id is a runtime token; the event uses it to pull voice-composed
  // lines via renderLine(npc_id, slot_name).
```

**Resolution order:**
1. Expand `species` wildcard to a candidate species list.
2. If `node_bias` is present AND `species` was a wildcard, first roll human-vs-alien against the bias, then narrow to candidate species within the selected bucket.
3. Build the glob path based on disposition — the station_crew case has an extra `<job>` segment:
   - `trader` / `drifter` / `pirate` → `sprites/npc/<disposition>/<species>/*/`
   - `station_crew` with `job` → `sprites/npc/station_crew/<job>/<species>/*/`
   - `station_crew` without `job` → `sprites/npc/station_crew/*/<species>/*/` (generic station encounter — any job)
4. Uniform random pick from the resulting leaf-folder list. A folder is eligible only if it contains BOTH expected files under the naming convention (Sprite Pool above): `spritesheet_<disposition>_<species><N?>.png` and `spritesheet_<disposition>_<species><N?>.json`, where `<N?>` is the folder number for folders ≥ 2 and omitted for folder `1`. Station_crew filenames use `station_crew_<species><N?>` (job is implicit in the path). Folders with mismatched or missing files are skipped silently.
5. Load the spritesheet via the **same pattern already used by the crew talking-head system** — see `demo-growbay.html`'s `CREW_SHEETS` table (per-frame `{x, y, w, h}` + idle frame) and `startCrewAnimationLoop()` for the render path. The `.has-sprite` inline `background-image` convention still applies, with `background-position` driven by the current frame's coords. **Do not invent a new loading pattern.**

---

### NPC Field on Event Modules

Events declare an NPC via an optional `npc` field on the event module:

```json
{
  "id": "event_asteroid_002",
  "node_type": ["asteroid_field"],
  "npc": { "disposition": "pirate", "species": "any_alien" },
  "body": "A ship cuts across your bow. {npc.line.hail}",
  "choices": [ … ]
}
```

For `station_crew`, include `job`:

```json
{
  "id": "event_station_014",
  "node_type": ["station"],
  "npc": { "disposition": "station_crew", "job": "botanist", "species": "any" },
  "body": "The station botanist looks at your crop sample. {npc.line.diagnose}"
}
```

**String interpolation tokens** available in `body` and `choice.narrative`:
- `{npc.species}` — resolved species name (e.g. `"rock"`)
- `{npc.disposition}` — resolved disposition (e.g. `"pirate"`)
- `{npc.job}` — (station_crew only) resolved job (e.g. `"botanist"`)
- `{npc.line.<slot>}` — rendered line from voice composition (see below)
- `{npc.quirk}` — random scene-prose quirk from the species quirk pool

Events with no `npc` field are **ship-only events** (hull breach, engine fault, solar flare). No portrait renders. Everything already authored works without modification.

---

### Station Region Bias

Each station/planet node module may declare a `crew_species_bias` property:

```json
{
  "id": "location_station_003",
  "type": "station",
  "crew_species_bias": { "human": 3, "alien": 7 }
}
```

The bias is a weighted roll between two buckets: `human` and `alien`. The `alien` bucket spans the six non-human species equally; finer species-level weighting within `alien` is **not** a feature. If an event needs species-specific pressure ("this is a water-world belt"), it hardcodes `species: "water"` in the `npc` field.

**Default bias** (applied when a node omits the field): `{ human: 7, alien: 3 }` — civilized-space default.

**Suggested biases by node character:**

| Node type / character | Bias |
|---|---|
| Core station | `{ human: 10, alien: 1 }` |
| Mid-rim station | `{ human: 6, alien: 4 }` |
| Outer-rim station | `{ human: 3, alien: 7 }` |
| Alien station / xeno settlement | `{ human: 0, alien: 10 }` |
| Deep-space / anomaly / void | `{ human: 1, alien: 9 }` |

**Event override.** If an event hardcodes `species` to a specific value, the bias is **ignored**. The bias only affects wildcard queries (`any`, `any_alien`, `any_human`). A diplomatic-summit event at a core station can still force an alien envoy by specifying the species outright.

---

### NPC Voice Composition

NPC dialogue is **disposition × species** at render time. Disposition provides the intent and base sentence; species provides tic, grammar transform, and quirk. One disposition-line pool per slot fills the template; one species-coloring layer transforms the output.

**Why composition and not pre-written lines per combination.** 43 slots × 7 species = 301 line pools if authored flat. Via composition it's 43 pools + 7 colorings = 50 authoring surfaces. Same expressive range, one-sixth the writing.

---

#### Disposition Line Slots

Each disposition has a short list of intent slots. Slots hold 4–8 neutral-voice lines; the species coloring layer transforms them at render time.

| Disposition | Slots |
|---|---|
| `trader` | `greet, pitch, accept, refuse, farewell` |
| `drifter` | `greet, ramble, offer, farewell` |
| `pirate` | `hail, demand, accept, refuse, defeated` |
| `station_crew.captain` | `greet, address, approve, refuse, dismiss` |
| `station_crew.medic` | `greet, assess, treat, bill, farewell` |
| `station_crew.engineer` | `greet, diagnose, quote, install, farewell` |
| `station_crew.botanist` | `greet, diagnose, sell, advise, farewell` |
| `station_crew.janitor` | `greet, remark, warn, gossip, farewell` |
| `station_crew.security` | `challenge, warn, detain, dismiss` |

**Total: 43 disposition line pools.** Botanist is expected to be the most-used station slot — the game is about plants.

**Slot meanings worth calling out:**
- `drifter.ramble` — the "hermit tells you their story whether you asked or not" slot.
- `drifter.offer` — drifters give; they don't haggle. Covers items, information, warnings.
- `pirate.defeated` — fires if you win the arcade combat minigame. One line of resigned or furious reaction.
- `janitor.remark` — ambient observation. "Been mopping this corridor since '89."
- `janitor.gossip` — soft intel. The janitor is the most informed person on any station.
- `botanist.advise` — free-but-opinionated. Dr. Osei energy, every station.
- `botanist.diagnose` — reads the player's current crop state; event module can pass crop data for templated feedback.

---

#### Species Coloring

Each species defines a tic, a grammar transform, and a small quirk pool for scene prose.

| Species | Tic | Grammar transform | Quirk register |
|---|---|---|---|
| `human` | none | `standard` (no-op) | none |
| `insect` | `*bzzt*` | `clipped` — shortens sentences, drops subordinate clauses | antennae twitch, wings buzz, compound eyes dart |
| `rock` | `*crack*` | `dropped_articles` — removes "a / an / the" | stands too still, speaks slowly, moves in small geological shifts |
| `water` | `*bubble*` | `flowing` — longer sentences, few hard stops, semicolons preferred over periods | ripples visibly when amused, form shifts with mood |
| `reptile` | `ssss` | `sibilant` — emphasizes s-sounds in existing words ("yesss", "ssstation") | unblinking, slow head tilt, tongue flicks |
| `robot` | `[processing]` | `formal_expanded` — expands contractions, adds precision ("the cargo" → "the designated cargo container"), never uses idioms | small fan noise when thinking, LEDs blink, refers to player by serial number |
| `unknown` | `[untranslatable]` / `???` / `*non-word*` | `inconsistent` — picks a different mode per line: fragmented, over-formal, nonsense-but-earnest, perfect-English-then-collapses | translator fails mid-sentence, speaks in maybe-poetry, responds before you finish asking |

**Grammar transforms are code, not data.** Each is a small pure function `(string) → string`. Authored once; applies uniformly to every disposition line. Prevents writing each line seven times.

**Tic format.** For species with a single tic string (`insect, rock, water, reptile, robot`), the resolver injects that string. For `unknown`, the tic is an array; the resolver picks one randomly each injection. `human` has no tic.

---

#### Renderer Contract

```js
renderLine(npc_id, slot)
  1. Fetch base line from the right pool:
       - if disposition is trader/drifter/pirate:
           npc_disposition_lines[disposition][slot]
       - if disposition is station_crew:
           npc_disposition_lines.station_crew[job][slot]
  2. Pick a random line from that pool.
  3. Apply species grammar transform.
  4. With probability tic_rate (species-dependent), inject species tic.
     Position (prepend / append / mid-sentence) is species-dependent:
       - insect: mid-sentence between clauses
       - rock: prepended, as an interruption
       - water: appended
       - reptile: integrated into words (sibilant), not injected as a separate token
       - robot: prepended
       - unknown: random position per line
  5. Return final string.
```

**Rare-tic rule.** Non-`unknown` species tics fire on roughly **one in three** lines (`tic_rate: 0.33`). If every line carries the tic, the joke dies by the fourth encounter. The grammar transform applies to every line; the tic is a garnish.

**Unknown inconsistency.** `unknown` is the exception: `tic_rate: 0.5`, and the grammar transform itself picks a different mode per line. Its inconsistency **is** its character — the joke is that you can't parse what's talking to you.

**Scene prose vs. dialogue.** Tics and grammar apply to **dialogue** (`{npc.line.<slot>}`). Quirks apply to **scene prose** (`{npc.quirk}`), which pulls from the species' quirk pool and describes the NPC's behavior in narrative text rather than their voice. The two registers are intentionally separate; don't mix them in a single output.

---

### NPC Flavor Pool File Location

The two new pool groups live in `modules/flavor/flavor_pools.json`, alongside existing pools (map names, crew epitaphs, etc.):

```json
{
  "npc_disposition_lines": {
    "trader":  { "greet": [], "pitch": [], "accept": [], "refuse": [], "farewell": [] },
    "drifter": { "greet": [], "ramble": [], "offer": [], "farewell": [] },
    "pirate":  { "hail": [], "demand": [], "accept": [], "refuse": [], "defeated": [] },
    "station_crew": {
      "captain":  { "greet": [], "address": [], "approve": [], "refuse": [], "dismiss": [] },
      "medic":    { "greet": [], "assess": [], "treat": [], "bill": [], "farewell": [] },
      "engineer": { "greet": [], "diagnose": [], "quote": [], "install": [], "farewell": [] },
      "botanist": { "greet": [], "diagnose": [], "sell": [], "advise": [], "farewell": [] },
      "janitor":  { "greet": [], "remark": [], "warn": [], "gossip": [], "farewell": [] },
      "security": { "challenge": [], "warn": [], "detain": [], "dismiss": [] }
    }
  },
  "npc_species_coloring": {
    "human":   { "tic": null,           "tic_rate": 0,    "grammar": "standard",         "quirks": [] },
    "insect":  { "tic": "*bzzt*",       "tic_rate": 0.33, "grammar": "clipped",          "quirks": [] },
    "rock":    { "tic": "*crack*",      "tic_rate": 0.33, "grammar": "dropped_articles", "quirks": [] },
    "water":   { "tic": "*bubble*",     "tic_rate": 0.33, "grammar": "flowing",          "quirks": [] },
    "reptile": { "tic": "ssss",         "tic_rate": 0.33, "grammar": "sibilant",         "quirks": [] },
    "robot":   { "tic": "[processing]", "tic_rate": 0.33, "grammar": "formal_expanded",  "quirks": [] },
    "unknown": { "tic": ["[untranslatable]", "???", "*non-word*"], "tic_rate": 0.5, "grammar": "inconsistent", "quirks": [] }
  }
}
```

The disposition-line pool is the primary authoring surface — 43 slot arrays, each holding 4–8 neutral-voice lines. The species coloring layer is written once and covers every disposition.

**Authoring order suggested:**
1. First pass: fill all 43 disposition slots with 4 neutral-voice lines each (~172 lines total).
2. Second pass: fill the 7 species quirk pools with 3–5 quirks each (~30 lines total).
3. Third pass: test-render a few combinations, tune tic position rules if needed.

---

### Interaction with Existing Systems

- **Existing events are unaffected.** Events without an `npc` field render exactly as before. The current sample events (Hull Breach, The Planet Looks Fine, Pirate Hail) all continue working with no changes required. Authors can migrate them to the NPC system opportunistically.
- **Crew system (Section 7) is unrelated.** Player crew are named individuals with skills, defined in `crew_roster.json`. NPCs are anonymous pool draws. No overlap, no shared data structures.
- **AI companion (Section 6) still speaks over NPC dialogue.** The `ai_flavor` field on events (ARIA / MARV / REX / CHIP) fires alongside any NPC lines, via the AI Log Panel. The player sees the NPC's line in the event body and the AI companion's reaction in the log, simultaneously — same as today.
- **No faction reputation.** The deprecated `faction_reputation_effect` tag (v0.4) does **not** return through this system. Species is atmospheric and gating only; there is no hidden standing counter per species.

---

## 12. Micro-Minigames

Short interaction games (2–15 seconds) embedded inside events. The arcade cabinet handles big set pieces; micro-minigames handle the mundane catastrophes.

### The Wrench
**Used for:** Mechanical/hull repairs
**Mechanic:** Click and drag cursor in a circular motion to tighten a bolt. Stripped bolts require more rotations. Reverse-thread bolts punish correct direction.
**Crew modifier:** Engineer reduces rotations required. Academic strips it.

### The Bypass
**Used for:** Electrical/system failures
**Mechanic:** Connect matching colored wire endpoints by dragging without crossing them. Time limited.
**Crew modifier:** Engineer reveals one correct path. Without engineer, no hints.

### The Pressure Gauge
**Used for:** O2/fuel line repairs
**Mechanic:** Hold button to increase pressure, release to drop. Keep needle in green zone (which moves) for 3 seconds.
**Crew modifier:** Engineer widens the green zone.

### The Defibrillator
**Used for:** Injured crew
**Mechanic:** Two charge bars fill at different rates. Hit the button when both are simultaneously in the target zone.
**Crew modifier:** Without Medic, target zones are half size.

### The Airlock Seal
**Used for:** Hull breaches
**Mechanic:** A slowly shrinking circle drifts onscreen. Click the center before it collapses. Ship vibrates. A crew member yells unhelpfully in text.
**Crew modifier:** Engineer slows the shrink rate.
**Item requirement:** `pressure_suit` required — without it, this option doesn't appear.

### The Override
**Used for:** Hacking derelicts, locked doors
**Mechanic:** Number pad, 4-digit code, clue in flavor text. Wrong answers cost time.
**Crew modifier:** Academic or Engineer reveals one correct digit. Without either, no hints.

### The Negotiation Wobble
**Used for:** Diplomat events
**Mechanic:** Alternate left/right keys rhythmically to keep tension meter low during a text conversation. Spike 3 times = talks fail.
**Crew requirement:** Only appears if Diplomat is aboard.

### The Calibration
**Used for:** Scanner/navigation repairs
**Mechanic:** Crosshair drifts across a star map. Hold it steady over a blinking target for 2 seconds.
**Crew modifier:** Pilot dramatically reduces drift.

---

## 13. Arcade Minigames

Full-screen 8-bit game clones. Each scenario type triggers a different genre.

| Scenario | Clone | End Condition | Drops |
|---|---|---|---|
| Pirate attack | Galaga (`shooter_fixed`) | Clear waves | Credits, ship parts, fuel |
| Asteroid mining | Asteroids (`shooter_360`) | Timed | Minerals, fuel, rare components |
| Rogue drone chase | Moon Patrol (`sidescroller`) | Catch drone before it jumps | Supply crates, loot-only items |
| Alien swarm defense | Space Invaders (`defense`) | Survive until repair completes | Hull repaired, morale up |
| Nebula navigation | Frogger (`navigation`) | Thread through without hitting clouds | Safe passage, bonus fuel |

### Ship & Crew Effects on Minigames
- **Engine class** → movement speed in all minigames
- **Weapon hardpoints** → fire rate and spread in shooter variants
- **Pilot crew** → tighter controls, faster movement
- **Veteran captain** → starts combat minigames with one screen-clear bomb
- **Engineer crew** → mining minigame drops higher loot tier

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

---

## 14. Economy & Items

### Credits
Universal currency. No barter. Prices visible before committing.

**Starting credits by captain:**

| Captain | Starting Credits |
|---|---|
| Optimist | Average |
| Veteran | Below average |
| Academic | Broke |
| Merchant | Rich |

### Station Economy
- **Price fluctuation:** Station location determines price modifiers per resource (see Node: Station)
- **Scarcity:** Finite stock. Food and fuel can run out. O2 is always available (regulation).
- **One-per-station:** Rare upgrade items are single stock. First arrival gets them.

### Loot-Only Items
Never appear in shops. Found via: derelict salvage, arcade minigame drops, event rewards, correct event choices.

| Item | Source | Effect |
|---|---|---|
| Experimental drive coil | Derelict | Fuel burn reduced; occasional misfire |
| Prototype O2 recycler | Corporate station reward | O2 depletes slower; warranty void |
| Field repair fabricator | Rare asteroid drop | Craft repair kits from minerals |
| Classified cargo | Event reward | Unknown until `spectrometer` used; may attract attention |

### 14.1 Inventory Modal Structure

The cruise `CARGO` resource bar and the `[INVENTORY]` action-rail button both open the inventory modal — a paused overlay of the ship's hold. Tick suspends while it's open.

Three tabs, fixed order. Source of truth for each tab is a *file*, not a field on items:

| Tab | Source | Takes cargo space? |
|---|---|---|
| **GEAR** | `modules/items/items.json` entries NOT tagged `upgrade` | Yes |
| **MATERIALS** | `modules/materials/materials.json` (entire file) | Yes |
| **UPGRADES** | `modules/items/items.json` entries with `item_behavior` including `"upgrade"` | No — free, may *increase* max |

No `tab` field on items. The filing system IS the classification:
- If it's in `materials.json` → MATERIALS tab
- Else if it's an item with `"upgrade"` in `item_behavior` → UPGRADES tab
- Else → GEAR tab

**Capacity semantics.** Cargo is a slot budget:

    slots_used = Σ non-stackable items: cargo_slots × count
               + Σ stackable items:     ⌈count × cargo_slots_per_10 / 10⌉

    slots_total = base_hold_capacity + Σ upgrades.slot_bonus

Upgrades sit in the UPGRADES tab but do not add to `slots_used` (their `cargo_slots = 0`). Some upgrades (e.g. `insulated_cargo_bay`) declare `slot_bonus: N` which adds to `slots_total`.

Materials are stackable (`cargo_slots_per_10: 1` by default). You cannot stockpile minerals without limit.

Over-capacity pickups are handled by the *event* that offered the pickup — event text prompts the player to drop something or skip the pickup. The inventory modal only ever reflects a resolved state; it never enters a >100% state mid-action.

**Stack merging.** Picking up an item ID that already has a stack in cargo merges — never creates a second tile for the same ID. `3× fuel_cell + 2× fuel_cell → 5× fuel_cell`, one tile.

### 14.2 Item Categories (authoring guide)

Six practical categories for module authors. Categories are a *writing tool*, not a schema field. Schema uses `item_source`, `item_behavior`, and the two-file split above.

| Category | Tab | File | Examples | Notes |
|---|---|---|---|---|
| **Minerals** | MATERIALS | `materials.json` | `metal`, `scrap`, `exotic`, `biocomponent`, `minerals` | Mining drops. Fabricator inputs, station-sellable. Stackable at `cargo_slots_per_10: 1` by default. |
| **Consumable salvage** | GEAR | `items.json` | `ration_brick`, `water_canister`, `fuel_cell`, `medkit` | `item_behavior: [one_use]`. Stackable. Restores a resource on use. |
| **Scientific instruments** | GEAR | `items.json` | `gas_analyzer`, `spectrometer`, `soil_sampler`, `medical_scanner`, `portable_drill`, `pressure_suit`, `solar_array`, `emergency_beacon` | Mostly purchasable (§15). Passive-effect or reveals_item_tags. |
| **Curiosities** | GEAR | `items.json` | `pre_collapse_artifact`, `sealed_vinyl`, `corporate_memorabilia`, `unidentified_bone` | Non-stackable. `sell_range: [min, max]` rolled at pickup → unique instance. No mechanical effect; pure trade goods. |
| **Story items** | GEAR | `items.json` | `logbook_fragment`, `star_chart_fragment`, `distress_beacon_tag`, `classified_cargo` | `cargo_slots: 0` or 1. Info-only; advance events or reveal options. Zero sell price (usually). |
| **Upgrades** | UPGRADES | `items.json` (tagged `upgrade`) | `expanded_fuel_tank`, `drive_coil`, `o2_recycler`, `hull_plating`, `extra_cargo`, `repair_fabricator` | `item_behavior` includes `"upgrade"`. `cargo_slots: 0`. Optional `slot_bonus: N` increases total hold capacity while equipped. Weapons are baseline ship kit — no weapon upgrades in cargo. |

### 14.3 items.json Schema Extensions

Fields added during the inventory-modal build. All optional — existing entries continue to work without them.

| Field | Type | Applies to | Purpose |
|---|---|---|---|
| `cargo_slots_per_10` | number | Stackable items | Capacity cost per 10 units. Detail panel shows the per-unit decimal (`0.3`) rather than the formula. Total cost of a stack = `ceil(count × slots_per_10 / 10)`. |
| `slot_bonus` | int | Upgrades | Additional slots added to the ship's cargo max while this upgrade is in cargo. Displayed inline with SLOT COST as `(+N cap)`. |
| `sell_range` | `[min, max]` | Curiosities | Rolled at pickup → each pickup is a unique instance (stored on the item instance as `rolled`). Replaces a fixed `base_price`. |
| `used_by` | `string[]` | Instruments, story items | Names of events this item adds options to. Rendered as `USED FOR: X · Y · Z` in the detail panel. Not a gate — item absence means no extra option; item presence adds one. |
| `station_bonus` | `{ stationType: multiplier }` | Curiosities, certain materials | Sell price multiplier at specific station types (e.g. `{ corp: 0.2, research: 0.5 }` = +20% at corporate, +50% at research). Rendered inline with SELL PRICE. Helps the player save for the right buyer. |
| `route_required` | string | Any | Short description of *why* the current trail expects this item. If set, jettisoning pulses a red warning panel with "Required for: <reason>". Doesn't block the action. |
| `isNew` (per-instance) | bool | Any | Fresh-pickup flag. Shows a pulsing NEW badge on the grid tile; cleared on first click. Set by the engine when an event/node delivers the item. |
| `where` (per-instance) | string | Any | Node/event name where the item was acquired. Rendered in the ACQUIRED line next to the day. Provenance — turns inventory into a run diary. |

**Reserved schema — not yet implemented but expected:**

- `perishable`: days-remaining counter (for biological items like suspicious fungus)
- `fabricator_recipe`: input materials list (for craftable items)
- `contraband_heat`: inspection risk multiplier for station events

---

## 15. Scientific Instruments & Tools

Real-purpose gear with in-game mechanical use. The comedy is using genuine scientific instruments in absurd situations.

### Purchasable at Stations

| Item | Real Purpose | Gameplay Use |
|---|---|---|
| Gas Analyzer | Atmospheric composition | Safe planet assessment; without it, outcomes are unknown |
| Repair Kit | General repair supplies | Contributes effort to mechanical events; consumed on use |
| Water Purifier | Potable water | Converts planet water to Food/O2 resource |
| Geiger Counter | Radiation detection | Warns before entering hot zones; without it, crew takes damage first |
| Soil Sampler | Soil composition | Determines planet crop viability; affects ending score |
| Portable Drill | Subsurface extraction | Unlocks higher asteroid loot tier |
| Spectrometer | Material analysis | Identifies unknown items; reveals `classified_cargo` |
| Medical Scanner | Crew diagnostics | Reveals why crew is injured; unlocks specific treatment options |
| Pressure Suit (EVA) | Vacuum extravehicular | Required for derelict boarding and hull exterior events |
| Solar Array (Portable) | Power generation | Passive fuel trickle when near a star; useless in void |
| Emergency Beacon | Distress signal | Triggers rescue event when stranded; one use; rescue not guaranteed friendly |

### Item Passive Behaviors
Items in cargo can exhibit passive behaviors without being actively used:

- `gas_analyzer` — hums near toxic atmospheres (flavor text warning before planet events)
- `geiger_counter` — clicks near radiation (early warning before damage events)
- `solar_array` — generates trace fuel passively near star nodes
- `classified_cargo` — may trigger station inspection events (`contraband` flag check)
- `emergency_beacon` — becomes available as a choice in `failure_type: no_fuel` events

---

## 16. Scene Image Pools

Pixel art backdrops drawn from a folder-based pool. The encounter renderer probes each pool and picks one image per scenario session (path-cached: same path resolves to the same chosen image until scenario change, so action clicks don't re-roll the bg).

### File-format conventions

- **`.jpg`** for full-bleed backgrounds (file size matters; photographic depth)
- **`.png`** for transparent overlay sprites (ship/station/planet sprites that float in the bridge viewport, plus chrome PNGs like `our_ship/bridge.png` with its transparent viewport rect)
- Mixed in `our_ship/` (jpg for opaque rooms, png for the bridge)

### Folder structure (canonical)

```
sprites/backgrounds/
  our_ship/
    bridge.png              ← scene chrome with transparent viewport (640×402 cutout at (160,93))
    cargo.jpg               ← single-image rooms, flat files
    corridor.jpg
    engine.jpg
    medbay.jpg
    growbay/
      wheat.jpg             ← per-crop variants (resolved via {crop} token)
      tomato.jpg
      sweet_potato.jpg
      soybean.jpg
      zinnia.jpg
  ship_interior/            ← jpg full-bleed, used when player has boarded their ship
    derelict/{1..N}.jpg
    generic/{1..N}.jpg
    pirate/{species}/{1..N}.jpg
    trader/{species}/{1..N}.jpg
  ship_exterior/            ← png transparent ship sprites for bridge viewport
    drifter/{1..N}.png
    pirate/{species}/{1..N}.png    ← (resolved via {species} token)
    trader/{species}/{1..N}.png
    unknown/{1..N}.{jpg|png}
  station/
    cantina/{1..N}.jpg      ← jpg interiors
    dock/{1..N}.jpg
    medbay/{1..N}.jpg
    office/{1..N}.jpg
    promenade/{1..N}.jpg
    market/{alien|human|mixed}/{1..N}.jpg
    exterior/{alien|human|mixed}/{1..N}.png   ← png orbital station sprites for viewport
  planet_surface/
    {alien|desert|habitable|ice|ocean|volcanic}/
      {1..N}.jpg            ← full-bleed surfaces (used after landing)
      approach/{1..N}.jpg   ← orbital approach views (used in bridge viewport pre-landing)
  anomaly/
    distortion/{1..N}.jpg
    fractal/{1..N}.jpg
    void/{1..N}.jpg
  space/
    asteroid_field/{1..N}.jpg
    deep/{1..N}.jpg         ← deep starfield, doubles as bgBase behind ship-exterior sprites
    nebula/{1..N}.jpg
```

### Three-layer composition (encounter render stack)

For "you're observing from the bridge" scenes (hails, planet/station approaches):

```
z=0   bgBase    full-bleed jpg   → space/deep starfield
z=1   bgSprite  transparent png  → ship/planet/station floating in viewport (640×405 at (160,93))
z=2   bg        transparent png  → our_ship/bridge.png with viewport cutout
```

For "you're physically present" scenes (station interior, planet surface, on-ship room):

```
z=2   bg        opaque jpg       → station/cantina, planet_surface/desert, our_ship/medbay, etc.
                                  (covers all lower layers; bgBase/bgSprite typically unused)
```

### Path tokens

`{species}` — substitutes from current NPC species (the 7 bible-defined values). Used for `ship_exterior/<arch>/{species}` etc.
`{crop}` — substitutes from player's chosen crop. Used for `our_ship/growbay/{crop}`.

Each expansion produces a separate cache key, so `ship_exterior/pirate/human` and `ship_exterior/pirate/insect` cache independently — switching species rolls a fresh pick per species.

### Authoring guidelines

- Each leaf folder needs **at least 1 image** for the scene to render (resolver falls back to `--bg-empty` solid color when nothing loads — black, intentional).
- Drop-in pattern: the moment a numbered jpg/png lands in a folder, it's in rotation next render.
- Empty folders are legal — encounter just renders the next layer down (or `--bg-empty` if all transparent).

---

## 17. Victory, Failure & Endings

**Demo status:** built as `demo-endings.html`. Self-contained, no engine stubs — this demo IS the §17 endpoint. Copy is drafted in-file (titles, per-crop arrival bodies, tier quotes, failure entries). All 18 arrival bgs authored (`sprites/backgrounds/endgame/`). See `project_transplant_endings.md` for the build-side architecture.

### Victory Score Assembly
Calculated on arrival from:
- Crew surviving (each member = weighted points)
- Resources remaining (% of max across all five)
- Hull integrity
- Days elapsed vs. par time for map difficulty

Demo formula (tunable): `score = (crew × 33.3) + (resAvg × 0.6) + (dayDelta × 0.5)` — thresholds at 130 / 85 / 40 for the four brackets. Crew weight reflects max 3 (captain + up to 2 chosen crew, per setup).

Score brackets:

| Bracket | Condition | Ending Pool |
|---|---|---|
| `legendary` | Full crew, surplus resources, ahead of schedule | drafted |
| `good` | Made it, mostly intact | drafted |
| `rough` | Arrived. Colony report is euphemisms. | drafted |
| `pyrrhic` | One survivor. Named a mountain after Jenkins. | drafted |

Each ending is a module tagged by `ending_score` with `tone` variants. Engine picks from the tone-appropriate subset.

### Arrival Bg Matrix

Cargo is binary at the asset level: which crop arrived (5 options: potato/soybean/tomato/wheat/zinnia) **or** noplant. Combined with destination (3 trails) = **18 full-bleed scene bgs**.

Path convention: `sprites/backgrounds/endgame/{folder}/{prefix}_{crop|noplant}.jpg`

| Trail id (setup) | Folder | File prefix |
|---|---|---|
| `lunar` | `lunar` | `lunar` |
| `mars` | `mars` | `mars` |
| `interstellar` | `far_garden` | `fargarden` |

Interstellar diverges from the trail id on both folder and file prefix — engine code wiring §17 must use a resolver, not direct string interpolation.

Quality tier is **not** a bg axis — same scene art at all four tiers. Tier reads through title text + tier-coloured border/title on the report card.

### Two-Screen Flow

1. **Cinematic** (full-bleed): scene bg + tier-coloured title at a per-destination position + one button. With a report: "VIEW REPORT". Without (hull_zero, crew_gone): "NEW RUN".
2. **Report card**: title + body sentence + optional italic quote + score panel (crew pips, 4 resource bars, day-vs-par) + Back / New Run.

`hull_zero` and `crew_gone` are cinematic-only (no report card) — for those, the body sentence + optional quote render on the cinematic itself so the copy reaches the player. The other three failures and all arrivals use the full two-screen flow.

### Failure States

| Failure | Trigger | Ending Character | Report? |
|---|---|---|---|
| `no_fuel` | Fuel hits 0 mid-journey | Stranded. `emergency_beacon` becomes final option. | yes |
| `crew_gone` | All crew dead | Ship arrives on autopilot. Sort of a victory. Nobody is sure. | no |
| `hull_zero` | Hull hits 0 | Catastrophic. Brief. | no |
| `mutiny` | Morale hits 0 | Crew takes ship. Player files a complaint. | yes |
| `time_expired` | Journey time limit exceeded | Planet claimed. Form letter received. Very apologetic. | yes |

All failures fire mid-trip. Failure cinematic snaps title/button to dead-centre (no destination focal point to dodge); failure title size is locked at 36px while arrival titles default 28px.

### Restart
Clean slate every run. No unlocks, no carry-over. The fun is the journey.

---

## 18. UI & Presentation

### Cruise Screen Layout (home base)

The cruise screen is the persistent home during travel. Not a two-column layout (SSL-like); each element is positioned deliberately. Click-targets open modals; ambient info updates live.

```
┌─────────────────────────────────────────────────────────────────┐ 960×640
│ THE VERDANT ARK │ COMING UP ON ROCKWELL ST. │ 📦 🗺  DAY 47·133L│ 40px header
├────────────────────────────────────────────────┬────────────────┤
│                                                │                │
│   [ SCENE — parallax stars + ship sprite ]     │    AI LOG      │
│     scene-alert text fades in/out at top       │   (scrolling   │
│     base ship + live crop-stage overlay        │   history +    │
│                                                │   day markers) │
│                                                │   320px wide   │
├────────────────────────────────────────────────┴────────────────┤
│ FUEL ▓▓▓ · FOOD ▓▓ · H2O ▓▓ · CARGO ▓ · GOLD ▓                  │ 20px
├─────────────────────────────────────────────────────────────────┤
│ ENGINES · RATIONS · WATER (plant% ↔ crew%)                      │ 28px
├─────────────────────────────────────────────────────────────────┤
│ [CAPTAIN][DR.OSEI][KAZUKI] 🌾 WHEAT · SPROUTING       │  STOP   │ 100px
│  HP/MO bars per slot        GROWTH ▓▓  HEALTH ▓▓▓▓    │ (full)  │
└─────────────────────────────────────────────────────────────────┘
```

**Band heights** (fixed + one flex):
- Header: 40 (carries INV + MAP icon buttons inline; see "Header Action Icons")
- Main (scene + AI log): flex-1 (~412)
- Resources band: 20 (full-width)
- Readout band: 28 (full-width)
- Bottom: 100 (crew strip + crop card + STOP button)

**Surfaces removed from cruise** (kept in spec; routed elsewhere):
- **Fabricator panel** — moved to a Stop Menu verb (§ Stop Menu & World Actions). Cruise no longer renders the fab pushbutton, LED, or wear bar; all that information lives inside the Fabricator modal opened from the Stop Menu. Rule: fab requires Stop, period.
- **Inventory + Map buttons** — moved to header icons (32px PNGs in `sprites/interface/inv.png` + `map.png`). Always visible regardless of state, doesn't compete with the bottom band.
- **Growbay button** — removed; the crop card itself is clickable, button was redundant.

The bottom-right action area is now **only Stop/Resume**, sized full-height of the band, the most loaded action on the surface.

Date target is always visible (`DAY 47 · 133 LEFT`), swaps to `TIME PAUSED` when paused. No percentage bars for arrival — just a day getting closer.

### Header Ticker (dynamic, replace-style)

The middle of the header is a single-line info ticker. Two behaviors:

- **Replace animation**: When new info arrives, the current line slides LEFT off-screen while the new line slides IN from the right simultaneously (0.55s, cubic-bezier). Lines don't overlap visually — they cross in a unified horizontal swap.
- **Normal use**: default shows the next stop (`COMING UP ON ROCKWELL STATION`). Pushed news (price alerts, crew requests, long-range scan hits) replace the current line and stay until the next replacement.
- **Event override**: ship-stopping events (hull breach, engine fault, solar flare) replace the current line with a red-pulsing event message. The previous *normal* line is remembered and restored when the event clears.
- **Player stop**: pressing the Stop action button swaps the ticker to `STOPPED` in amber pulse. Pressing Resume restores the previous normal line.

### Stop Button State Machine

The Stop action button is 3-state:

| State   | Button label | Ticker                    | Pressing the button does              |
|---------|--------------|---------------------------|---------------------------------------|
| normal  | Stop         | normal (travel info)      | → state=stopped; ticker amber STOPPED; **opens the Stop Menu** (see below) |
| stopped | Resume       | amber pulsing STOPPED     | → state=normal; restore prior ticker; closes the Stop Menu |
| event   | Resume       | red pulsing event text    | **can't resume** — screen shakes + ticker briefly flashes `CANNOT RESUME — HANDLE EVENT FIRST` (red, 2.4s), then restores the event text. Player must clear the underlying event first. |

Stop button pulses its border color when the ticker is in either non-normal state, so it reads as urgent/actionable.

### Stop Menu & World Actions

Pressing Stop in `normal` state opens the **Stop Menu** — the surface for everything the player can do *to or with the world around them* while parked. Cruise screen stays fully visible underneath; only the AI log column is replaced (see "Inline swap" below). The bottom-row ship controls (Stop/Resume, Map, Inventory, Crew, Orders, Fabricator) remain reachable.

#### Pause vs Stop (hard distinction)

Two mechanisms freeze the game timer; they mean different things and the player should never confuse them:

| | **Pause** (modal-open) | **Stop** (player-initiated) |
|---|---|---|
| Trigger | Open any modal — Crew, Inventory, Map, Orders, Growbay, Fabricator | Press the Stop button on cruise |
| Ship state | Still en route, just frozen for player thinking time | Physically halted in space |
| Timer | Frozen; date target shows `TIME PAUSED` | Frozen; date target shows `TIME PAUSED` |
| World actions available | None — close the modal to resume | Mine / Salvage / Trade / Hunt-class / Scan / Repair / Rest / Wait-for-trader / Fab |
| Visual signal | Implicit (modal is on screen) | Loud — Stop btn → Resume + amber pulse, ticker amber STOPPED, AI log column → Stop Menu choice column, ship-bob/parallax halt, engine HUD glow dims |
| Cost of being in this state | Zero — pure thinking pause | Zero for *being stopped*; chosen actions consume their own `time:` cost |

**Stop does not cost time by itself.** The player can sit indefinitely in the Stop Menu reviewing options. Cost is incurred only by *choosing* an action, and that action's `time:` cost is the entire spend (no background tick is added). This keeps the mental model: "Stop = pause, with verbs."

**Forced events that triggered the stop don't go away during pause.** If pirates are hailing, the encounter is on screen and blocks Resume; the player can't stall it out by sitting still. This is already how encounter modals behave.

#### Two encounter entry points (same encounter system)

The encounter screen (§ Encounter Screen) handles all conversational/event scenes. It has two triggers:

1. **World-fired** — pirates hail, hull breaches, anomaly drifts in. Force-stops the ship, ticker turns red, Resume blocked until resolved. Player did not choose this.
2. **Player-fired** — player presses Stop, picks a verb from the Stop Menu, that verb routes into an encounter scene (mining op, trader haggle, salvage attempt, etc.). Player chose this.

The Stop Menu is therefore *not* a parallel system to encounters — it is a **trigger surface** for the encounter screen, exactly the way the world-fire path is. Both reuse the existing encounter architecture (gates, effort pips, dialog/narrator split, choice column, outcomes).

#### Verb list (canonical)

Every verb is region-gated and may be additionally upgrade- or item-gated using the existing encounter gate pattern. Locked verbs render in the Stop Menu choice column with `🔒` + `Need: <X>` inline (multi-unmet allowed), same as locked encounter actions.

| Internal verb | Display label | Available when | Routes into | Notes |
|---|---|---|---|---|
| `mine` | **MINE** | asteroid_field, ice, debris, gas-rich nebula | Mining encounter scene → optional minigame | Always available somewhere — failsafe path |
| `salvage` | **SALVAGE** | debris only | Salvage encounter scene | Yields wreckage parts, occasional upgrades |
| `forage_food` | context-sensitive (see below) | Region-dependent | Hunt/gather encounter scene → minigame | Food acquisition; verb label resolves at runtime |
| `trade` | **TRADE** | Always — odds of trader presence vary by region | Trader encounter scene (always; see "Trader-wait" below) | Encounter scene every time, never inventory-direct |
| `scan` | **SCAN** | anomaly, nebula, deep_space | Scan encounter scene → reveals upcoming nodes / event intel | Information verb |
| `repair` | **REPAIR** | Always (only useful if hull/engine damaged) | Repair encounter (no minigame) | Costs materials + time |
| `rest` | **REST** | Always | Rest encounter (no minigame) | Pure morale recovery, no other yield |
| `wait_for_trader` | **WAIT FOR TRADER** | Always | Time-pass + roll loop (see "Trader-wait" below) | Surfaces only when no trader currently present |
| `fab` | **FABRICATOR** | Stopped (always) — gated `Stop required` while moving | Routes to Fabricator modal | Not technically a Stop Menu verb — see "Fabricator" below |

**Context-sensitive label for `forage_food`:**

| Region | Display verb | Underlying minigame |
|---|---|---|
| habitable planet orbit | **GATHER** | Clicker (pick fruit/plants) |
| alien planet orbit | **FORAGE** | Clicker w/ poison-roll |
| asteroid_field, ice, caves | **HUNT** | Shooter (space rats, fungi-creatures) |
| debris | **SCAVENGE** | Button + dice (rummage wrecks) |
| anomaly | **FORAGE** | Button + dice (weird outcomes) |
| deep space | — | Verb hidden |

One internal verb, one underlying loot table semantics, one minigame routing field — only the *button label* varies. Avoids over-applying the pattern: Mine/Salvage/Trade etc. read fine in any region they appear, only food acquisition genuinely changes character.

#### Region-typed yields & the OT layered model

Region of the current map segment determines which verbs surface AND what their yields look like. Every gather verb (Mine/Salvage/Hunt-class) uses an OT-style **layered loot table**:

- **Tier 1 (rabbit)** — basic, almost always rolls. Generic ore from any asteroid, basic protein from any food-bearing region. Guarantees the failsafe.
- **Tier 2 (squirrel)** — sometimes rolls. Region-typical materials (alloys, refined metals, edible plants).
- **Tier 3 (bison)** — region-rare. Exotic mats, alien artifacts, recruitable wounded crew, valuable trade goods.

Hunt-class verbs additionally roll for **non-food curiosities** (alien artifacts, trinkets, occasional recruitable crew candidate) — Adams-flavored "while picking berries you found a sentient teapot" outcomes.

#### Multi-path resource rule (design invariant)

**No consumable resource has a single acquisition path.** The player must never be hard-stuck on a resource. Reference matrix:

| Resource | Acquisition paths |
|---|---|
| **Fuel** | Trade · mine (gas asteroids, nebula scoop) · fab from refined ore |
| **Food** | Trade · forage (region-dependent verb) · harvest crop · fab from organics |
| **Water** | Trade · mine ice (ice fields, comets) · condense from nebula *(requires Atmospheric Condenser upgrade)* · recycle (always trickle) |
| **Materials** | Trade · mine · salvage |
| **Gold** | Trade (sell cargo/upgrades) · encounter rewards · bounty (pirate-kill rewards) |
| **Hull** | Repair (materials + time) · station drydock (gold) · trader field-repair |
| **Crew morale** | Rest · zinnia harvest · good rations tier · positive encounter outcomes |
| **Crew health** | Medic + medkit · station clinic (gold) · healing items |
| **Plant health/growth** | Tend (water + treat) — **single-path by design**; this is the mission |

Plant is the deliberate exception — its single acquisition path *is* the mission constraint.

**World actions can be upgrade-gated.** Water-condense (requires Atmospheric Condenser) is the canonical example. Other actions may follow the same pattern as the upgrade catalog grows. Locked-by-upgrade verbs render in the Stop Menu like any other gated action: visible, dimmed, with `🔒 Need: Atmospheric Condenser` inline.

#### Region weirdness curve (per trail)

Region distribution along the route follows the trail, not a symmetric curve. Distance-from-Earth = monotonic weirdness ramp:

- **Lunar Trail** — low weirdness throughout, mostly station/planet-adjacent regions, low encounter rate. Few exotic verbs surface.
- **Mars Trail** — civilized → fringe ramp. Mix of station-approach, asteroid_field, debris, occasional anomaly mid-route.
- **Interstellar Trail** — civilized start, *much* weirder middle, ends in territory where rules don't apply (anomaly-heavy, alien planet orbits, exotic-mat-rich regions, low trader odds in deep stretches).

Trader presence rolls correlate with civilized regions (station-approach, planet-orbit-habitable). Pirate/anomaly events roll inversely. Lunar players see traders constantly and exotic mats almost never; Interstellar players see the inverse in the back half of the journey.

#### Trader interaction & the Trader-wait twist

When the player picks **TRADE**:

- **If a trader is present in this region** (rolled when entering the region or when Stop is pressed): routes directly to a trader encounter scene. Trader NPC, dialog, choice column ("Show me your wares" → opens inventory in trade-mode downstream). **Always an encounter scene first** — never inventory-direct, even on repeat visits to the same trader within a session. Keeps trader interactions narrative, consistent with every other social system.
- **If no trader is present**: the verb shows as **WAIT FOR TRADER** instead of TRADE. Picking it offers a wait of N days (player picks 1–7 typically). Each waited day rolls a region-modulated chance of a trader appearing. Rules:
  - Days waited tick the timer normally — food/water/morale all consume during the wait
  - Daily roll % is region-modulated: high near stations/planets, near-zero in deep space
  - Hard cap on a single wait session (suggested: 7 days), then auto-fail with "no one's coming" log entry
  - **Other events can fire during the wait.** Pirates love a stationary ship. Anomalies drift past. Distress calls hear you. Sitting still is itself a roll on the world-event table. This is the Adams move — waiting for a trader is *not* safe.
  - Resume button is reachable during the wait — player can abort and continue traveling
  - Successful trader appearance → routes to trader encounter scene as above

#### Multi-day action interrupt rule

A chosen world action with `time: > 24h` runs across multiple in-game days. **Interrupt model**: a world-fired event triggering during the action interrupts it.

- Interrupted action yields *partial* results scaled to time elapsed (5-day mine interrupted on day 2 → ~40% of the rolled yield)
- The interrupting encounter takes over the screen normally
- After the encounter resolves, the player is returned to cruise in `stopped` state (same as if they had just pressed Stop) — they may choose to resume the interrupted action, pick a different one, or Resume travel
- This makes Stop in dangerous regions *risky* — the region weirdness curve becomes a gameplay tradeoff, not just flavor

#### Fabricator (stopped-only)

The Fabricator button on the cruise bottom row is **disabled while the ship is moving**, with tooltip and visual treatment distinct from "you can't afford this":

- While moving: button rendered with a dimmed/locked variant; tooltip reads `Stop the ship to use the Fabricator. Print jobs require attention you cannot give while in flight.`
- While stopped: button lights up to its normal active state; clicking opens the Fabricator modal (existing system) as a pause-modal
- Reasoning: time is already passing during cruise; "fabbing while traveling" is incoherent — the captain's attention is the constrained resource, not wall-clock time

**Fabricator is not a verb in the Stop Menu choice column.** The bottom-row button covers it. Stop Menu is for *world actions* (things you do to the place around you); Fab is a *ship system* and lives with the other ship-system buttons. Same logic for any future stopped-only ship-system action.

#### Inline swap (AI log column → choice column)

When the Stop Menu opens, the **AI log column (320px right side of cruise main area) is replaced in place by the Stop Menu choice column**. Bottom row, header, ticker, scene art, resource bars, and readouts all stay put.

- Swap animates: 200ms cross-fade with the new column entering from a 6px right offset, mirrored exit on close
- Choice column reuses the encounter button pattern verbatim — verbs with effort pips, costs, gates, dimmed-with-reason for locked, hint/risky variants where applicable
- Header above the choice column reads the current region in caps (`ASTEROID FIELD · KUIPER SECTOR`) and an italic mood line (`Cold rocks. The kind of place that pays in chips, not stories.`)
- Choice column is scrollable if verb count exceeds the visible height (custom scrollbar per design system)

**The AI log is not lost while stopped.** The log continues writing in the background — chosen actions, stopped-state ticker changes, world events that fire during waits all push entries normally. When the player Resumes, the log column returns with the new entries already in place. Players can also access the log mid-stop:

- The Stop Menu choice column header carries a small `📜 LOG` button (top-right corner) that opens the Ship's Log modal (§19) over the cruise screen
- The Ship's Log modal is the same one accessible from the AI log column's expand affordance during normal cruise — see §19

#### Visual state changes summary (Stop active)

When Stop transitions from `normal` → `stopped`:

- **Stop button**: label → `Resume`, inset/depressed style, amber border pulse (matches ticker)
- **Ticker**: `STOPPED` in amber pulse (existing behavior)
- **Date target**: `TIME PAUSED` (existing behavior, same as any pause-modal)
- **Scene viewport**: ship-bob slows to a halt over 600ms, starfield parallax stops, viewport sprites stop drifting
- **Engine HUD glow** (bottom resource band area): dims to ~40% brightness
- **AI log column**: cross-fades to Stop Menu choice column (200ms)
- **Fabricator button**: lights up from disabled-state to active

Reverse all of the above on Resume, with the AI log column re-fading in (any new entries added during stop are visible immediately).

### Orders Readouts (Engines · Rations · Water)

The readout band below the resource bars is three glanceable cells. Each cell is clickable; in-game that opens the Orders modal focused on that setting (demo stubs an alert).

**Engines** — 4 stepped positions (Spaceballs, in order):
1. LIGHT SPEED (slowest, safest)
2. RIDICULOUS SPEED (baseline)
3. LUDICROUS SPEED (aggressive)
4. PLAID (maximum — burns hardest on fuel + crew drain)

**Rations** — 3 stepped positions:
1. PIG OUT (morale up, food down fast)
2. STANDARD (baseline)
3. VENDING MACHINE (food preserved, morale slowly erodes)

**Water** — **continuous** allocation slider, 0–100%, split between plant and crew. Not stepped — naming ranges would feel wrong on an allocation. Both sides have a minimum-survivable floor (can't zero out either). Plants need varies by crop (wheat low, tomato high, zinnia medium). If either side is under-allocated, damage accumulates. Water generators, mining, trader fill-ups widen the budget.

**Why stepped for engines/rations but continuous for water**: stepped keeps engines/rations balance-tableable and legible (each tier = a lookup of effects). Water is an allocation problem (divide a fixed resource between two parties), which naturally reads as continuous.

### Orders Modal (the full picker behind the readouts)

Clicking any of the three cruise readouts opens the Orders modal — a single modal that holds all three controls so the player can see their tradeoffs against each other before committing.

**Shape:**
- 797 × 560px centered panel, slate-blue (`#435384`) border, cyan (`#56CFD7`) Press Start 2P title
- Three sections stacked vertically with a 28px gap between them
- Section order: Engines → Rations → Water (top-down)
- Fixed AI line + footer (Cancel / Apply) at the bottom
- Backdrop dims the cruise scene behind at ~75% opacity. Cruise is still visible so the player retains context

**Per-section anatomy** (identical shape across all three):
1. **Header row**: icon (20px) · SECTION LABEL (10px Press Start 2P) · *tier description inline, italic 15px VT323* · ⚠ section-warn pinned to the right
2. **Selection control**: pill row (engines/rations) or continuous slider (water)
3. **Preview strip**: 2–3 stat lines showing *projections*, each with an optional Δ delta pill and an optional ⚠ per-stat warn badge

**Projection language — day numbers, not multipliers.**
Every setting's effect is projected into a day number the player already cares about. Multipliers (1.6x, 2.4x) are rejected as user-facing numbers; they're accurate but not visceral. Day-based projections put settings in the same currency as the arrival deadline.

| Section | Stats shown |
| --- | --- |
| Engines | `ARRIVAL · DAY X` · `FUEL EMPTY · DAY X` · `CREW DRAIN · EASING/STEADY/RISING` |
| Rations | `FOOD EMPTY · DAY X` · `FOOD / DAY · N` · `MORALE · FALLING/STEADY/RISING` |
| Water   | `PLANT MATURES · DAY X` · `CREW · NOMINAL` or `CRITICAL DAY X` |

**Delta pills** appear on stats when the currently-previewed choice differs from the saved choice. `+12d` / `−43d` for day shifts, `▲` / `▼` for direction shifts. Color by direction intent:
- Arrival earlier = good (green). Fuel/food empty later = good. Plant mature earlier = good. Crew drain decreasing = good. Morale rising = good.
- `FOOD / DAY` is rendered neutral (gray) — it's a tradeoff, not a win/loss.

**Warning system** — fires when a projection crosses the projected arrival day:
- `FUEL EMPTY` < arrival → ⚠ on the stat + section header
- `FOOD EMPTY` < arrival → ⚠
- `PLANT MATURES` > arrival → ⚠ (crop won't make it before we land)
- `CREW CRITICAL` < arrival → ⚠
The warning doesn't block — the player can still Apply. It just flags "you're picking DOOM."

**Tier descriptions** (plain-language, inline in each section header):
- Engines: `"Crawl to arrival. Burn little. Crew rests."` / `"The default. Steady fuel. Crew fine."` / `"Faster. Burn harder. Crew tires."` / `"Arrive fastest. Bleed fuel and crew. Not a drill."`
- Rations: `"Half rations. Morale sinks. Food lasts."` / `"Full rations. Morale holds steady."` / `"Double rations. Morale lifts. Food empties fast."`
- Water: varies continuously with allocation — `"Plant parches. Crew bathes. Growth crawls."`, `"Plant thirsty. Crop slows."`, `"Matched. Plant and crew both fine."`, `"Plant well-fed. Crew watches the taps."`, `"Plant thrives. Crew goes dry."`

These give a remembered vibe to each tier — day-count stats tell you the math, the description tells you what it *feels* like.

**CURRENT marker** — a small glowing teal pill sits above whichever tier is currently saved on the ship (or a triangle at the saved point on the water track). Independent of preview selection, so the player can always see "where I'll revert to on Cancel."

**Hover-to-preview AI** — hovering any pill (without clicking) swaps the ARIA line to that tier's quip. `mouseleave` restores the line tied to the committed preview. Lets the player audition a choice without committing.

**Committed vs preview state** — every open of the modal resets preview = saved. Changes only stick if the player clicks Apply; Cancel (or backdrop click, or Escape) discards. Saved-state markers stay pinned to the actual ship settings regardless of preview drift.

**Projection constants** (ship-instance values, not literals in UI code): current day, arrival day at current pace, fuel stock, daily fuel burn, food stock, per-day food intake by tier, crop growth %, crop maturity days, crew hydration points, hydration drain rate by allocation band. Engine reads these from ship-state + crops.json + map_rules.json. Demo values are placeholders.

### UI layout-lock pattern (for any row with toggleable warn/delta content)

Used first on the Orders preview rows and section headers. Any UI row that conditionally renders a red warning indicator or a delta pill must not shift surrounding rows when its state changes.

Rules:
1. **Always render the conditional element in the DOM**. Toggle an `.on` class or parent `.warn` class that flips opacity. Never `display: none` / empty `textContent` for an ephemeral indicator — those reshape the row.
2. **Lock `line-height`** on the row to match its largest inline child. Inline emoji have line-boxes taller than alphanumerics; without a locked line-height the row grows a pixel when the emoji appears.
3. **Inline-block delta/badge spans** with their own `line-height: 1`. Inline spans with padding can shift the text baseline by a subpixel in some browsers.
4. **Fixed `min-height` on section headers** that contain mixed font sizes / emoji icons, with `align-items: center` (not `baseline`). Baseline alignment + mixed fonts + an animated child with `filter: brightness()` can subtly recompute the row baseline.

Result: warn/delta state changes fade in/out in place with zero vertical jitter on any row below.

### Travel Background (CSS/JS — No Image Assets)
- Parallax layers: stars (slow), dust (medium), large rocks (fast)
- Color palette shifts by map difficulty: cooler/bluer on easy, warmer/redder on hard
- More debris density as difficulty increases
- Flavor objects drift past occasionally (no gameplay function — pure tone)

### Ship Sprite System

The cruise screen renders the ship as two layered sprites — a shared base and a crop-specific plant overlay. Keeps the asset count manageable (21 PNGs total) and avoids redrawing the whole ship for every growth stage.

**Base ship sprite (1 file, shared):**
- Full ship art, greenhouse/growbay modules empty
- Used whenever no plant is visible yet (very early growth + immediately after harvest)
- Shown alone, no overlay needed

**Plant overlays (4 per crop × 5 crops = 20 files):**
- Each overlay is a cutout containing only the plant portion of the ship
- Positioned over the base at fixed coordinates (same anchor for all overlays of a given crop)
- Only the overlay changes as growth progresses — base ship never redrawn

**Growth-stage → sprite map** (maps to existing `CROP_STAGES`):

| Growth % | Stage name  | Sprite shown                  |
| -------- | ----------- | ----------------------------- |
| 0–25     | SPROUTING   | Base ship only (no overlay)   |
| 25–50    | VEGETATIVE  | Crop overlay, stage 1         |
| 50–75    | FLOWERING   | Crop overlay, stage 2         |
| 75–99    | MATURING    | Crop overlay, stage 3         |
| 100      | READY       | Crop overlay, stage 4         |

**Asset file convention** (proposed):
- `ship_base.png`
- `plant_<crop>_stage1.png` through `plant_<crop>_stage4.png`
  (e.g. `plant_wheat_stage1.png`, `plant_tomato_stage3.png`)

**Anchor coordinates** — each crop declares its overlay position once in `crops.json` (x, y in ship-sprite pixel space). Engine reads this alongside `maturity_days` and uses it when compositing the sprite on the cruise screen.

**After harvest:** growth resets to 0 → sprite reverts to base ship until next stage crossing.

### Resource Bars

5 bars in the resources band, each with a Press Start 2P label on the left and a fill bar taking the rest of the width. Numerical values are NOT rendered on screen — hovering any bar surfaces a `title` tooltip with `X / max` format.

| Bar   | Color (default)  | Notes                                            |
|-------|------------------|--------------------------------------------------|
| FUEL  | orange `#e88830` | Consumed by engines. Higher tiers burn faster.   |
| FOOD  | green `#8cc890`  | Crew drain; rations setting scales it.           |
| H2O   | blue `#5fa8d0`   | Split between plant + crew via the water slider. |
| CARGO | warm gray `#b4b091` | Renamed from "Materials". Opens cargo modal. |
| GOLD  | amber `#ffac00`  | Credits. Plain number on screen (no bar — there's no max). |

### Inventory Modal (Cargo Hold)

Opens on CARGO-bar click or the `[INVENTORY]` action-rail button. Paused overlay — tick suspends. Standard modal chrome (slate-blue border, cyan title — same palette as orders). Prototype: `demo-inventory.html`.

**Default dimensions:** 816 × 600px modal, detail panel 295px wide, grid tiles 88px with 64px native sprites. Grid shows 5 tiles per row at those defaults.

**Layout:**

```
┌────────────────────────────────────────────────────────────────────┐
│  CARGO HOLD         43 / 80 SLOTS        120 cr            [X]     │  header
├────────────────────────────────────────────────────────────────────┤
│  SHIP                                                              │
│  RESOURCES                                                         │  (floating label, left-middle)
│            [fuel tile + stats]  [food tile + stats]  [h2o tile + stats]
├────────────────────────────────────────────────────────────────────┤
│  [ GEAR (n) ]  [ MATERIALS (n) ]  [ UPGRADES (n INSTALLED) ]  SORT ▾│
├──────────────────────────────────────────────┬─────────────────────┤
│  — Instruments —                             │  ITEM NAME          │
│  [tile] [tile] [tile] [tile] [tile]          │  CATEGORY           │
│  — Consumables —                             │  effect / desc      │
│  [tile] [tile] …                             │  (flavor if any)    │
│  — Curiosities —                             │  COUNT    · ×3      │
│  [tile] …                                    │  SLOT COST· 0.3…    │
│  — Story —                                   │  SELL PRICE · 12cr  │
│  [tile] …                                    │  ACQUIRED  day+node │
│                                              │  USED FOR: events   │
│                                              │  NOTES (marker key) │
│                                              │  ARIA: quip         │
│                                              │  [SELL][USE][JETT]  │
└──────────────────────────────────────────────┴─────────────────────┘
```

**Header row:**
- `CARGO HOLD` label, Press Start 2P.
- `43 / 80 SLOTS` live readout. Each number **flashes (scale pop + glow)** on any change — pickup, sell, jettison. Color: cream default → **amber at ≥90% full** (pre-warn) → **red + pulse at 100%** (at-cap). Hovering the readout tips a breakdown: `22 gear · 6.6 materials`.
- `120 cr` gold — plain number (same convention as the cruise strip). Earthbound-style **rolling counter** when gold changes: digits interpolate from old → new over 200–900ms, each tick flashes.
- `[X]` close.

**Resource tile row** — "SHIP RESOURCES" floating label in the upper-left middle of the row (absolute, doesn't displace the tiles). Three tiles follow, each composed of:
- **Sprite** — 64×64 native cargo sprite (`sprites/cargo/cargo_fuel.png` etc.), no background/box behind it. Transparent frame so the sprite floats on the modal surface.
- **Segmented gauge overlay** — 10 vertical segments painted on top of the sprite at per-resource authored coordinates (`{ x, y, w, h }` per resource). Color by segment *position*: red (1) → dark orange (2–3) → amber (4–5) → lime (6–7) → green (8–9) → bright green (10). Fill % lights segments bottom-up; unlit at ~15% brightness.
- **Info stack to the right** — `LABEL` on top, then three stat rows styled identically to the detail-panel stats: `LEVEL · 75 / 100`, `USE · ~1.0 / DAY`, `EMPTY · DAY 122`. Label + value pattern matches the gear detail rows for visual consistency.
- Hover / select feedback: `filter: brightness()` on the whole tile (sprite AND text brighten together) + `drop-shadow()` glow on select (traces the sprite/text silhouettes since there's no background rectangle). **No ring, no box** — background stays transparent.
- Clicking a tile populates the detail panel with a **text-only** resource panel (name, `SHIP RESOURCE` subtitle, desc, cargo items that restore it, rotating ARIA quip). **No 128px hero sprite** — scalar info already lives in the tile row, the detail is narrative.

**Tabs:**
- Class 2 Analog Panel Buttons. Active tab: gold accent + orange 4px underline. Inactive: dark slate.
- Tab label shows count: `GEAR (10)`, `MATERIALS (5)`, `UPGRADES (5 INSTALLED)` — the UPGRADES tab uses "INSTALLED" phrasing because upgrades don't consume cargo.
- Keyboard: `1/2/3` jumps, `Tab`/`Shift+Tab` cycles.

**Sort dropdown** — custom-styled (never a browser `<select>`): panel-button trigger with a ▾ chevron that flips to ▴ when open, gold-bordered flyout list. Options: `Recent` (default) · `A–Z` · `Slot cost` · `Sell price`.

**GEAR sub-sections** — the GEAR tab bands items into four labeled groups with dashed dividers: `— Instruments —`, `— Consumables —`, `— Curiosities —`, `— Story —`. Empty sections omitted. MATERIALS and UPGRADES tabs render flat (their lists are shorter and more homogeneous).

**Item tile:**
- 1×1 — one item never spans > 1 tile regardless of its slot cost. Slot cost is a slot-budget concept, not a grid-span concept.
- Sprite centered.
- `×N` stack badge top-right (Minecraft-style) for stackables with count > 1.
- Sell price bottom-right (e.g. `87cr`). Hidden-value items show `??` or `—` in a muted color + a small `⇄` marker bottom-left (trade-only).
- `NEW` badge top-left on fresh pickups (pulsing amber pill). Clears on first click of the tile.
- Classified items show a red `⚠` top-left **only when docked at a station** (station inspection risk).
- Selected tile: gold border + subtle glow. **No right-edge orange accent stripe** — the gold border alone carries selection; additional decoration reads as noise.

**Detail panel** (right column, 295px, vertical scroll with custom scrollbar):
- Item name (Press Start 2P, gold)
- Category subtitle (INSTRUMENT, CONSUMABLE, CURIOSITY, STORY, MATERIAL, UPGRADE)
- Description (effect summary)
- Optional flavor line (teal italic, per-item static)
- Stats block, right-aligned values:
  - `COUNT` · `×3`
  - `SLOT COST` · per-unit decimal for stackables (`0.3`) — not a formula. Flat integer for single-tile items. `+N cap` appended for upgrades with `slot_bonus`.
  - `SELL PRICE` · `12cr`, optionally with an inline station bonus hint: `+20% at corp` (teal, small)
- `ACQUIRED` · inline label + wrapping value (`DAY 12 · Waypoint Zeta-4`). Pulled out of the stats flex so long location names wrap cleanly.
- `USED FOR: X · Y · Z` — events where having this item adds an option. Phrased as "used for" (purpose-oriented) not "unlocks" (mechanic-oriented). Absent when the item doesn't gate options.
- `NOTES` block — context-sensitive explanations of any tile marker the player may see:
  - `⇄ Trade-only: swap for goods, not credits.`
  - `⚠ Classified: may trigger station inspections.`
  - Hidden when the item has no relevant markers.
- `ARIA:` quip — one line, teal italic, picked randomly from a per-item pool (falls back to a category-generic pool). Rotates on each open — re-click the item for a different read.
- Actions at the bottom: `[SELL]` (station-only) · `[USE]` (one_use items only) · `[JETTISON]` (always).

**Jettison confirm:**
- Always asks, regardless of count — no silent jettison.
- Tile animation: **zoom-out in place** (scale 1 → 0.2) + fade. Reads as the item receding into distance, not drifting away. Small particle poof rises alongside.
- For stacks > 1: confirm dialog includes a `[− N +]` count picker (defaults to 1), `[JETTISON N]`, `[JETTISON ALL]`, `[CANCEL]`.
- **Route-required warning**: if the item has `route_required` set, the confirm panel pulses a brighter red ring and shows `Required for: <reason>` in a red callout row. Doesn't block the action — the player can still jettison — but flags "you're about to throw away something the trail expects."
- Keyboard: `−` / `+` adjust, `Enter` confirms, `Esc` cancels.

**Stack merging** — picking up an item ID that already has a stack merges into it, never creates a second tile for the same ID.

**Empty states** (centered VT323 16px italic, `opacity: 0.55`):
- GEAR empty: *"Bare."*
- MATERIALS empty: *"Nothing mined yet."*
- UPGRADES empty: *"Stock configuration."*

**Over-cap indication:**
- 90% (`near-cap`) → slots-used number tints **amber** (pre-warn).
- 100% (`at-cap`) → slots-used number turns **red** + 1.2s brightness pulse. The cruise CARGO bar also pulses red.
- Incoming pickups that would overflow are resolved by the *event* that offered them, not silently in the modal.

**Scrollbars** — both the grid and the detail panel use the **custom scrollbar** pattern (see `DESIGN_SYSTEM.md — Custom Scrollbar`): native scrollbar hidden on `.scroll-content`, retro-styled gold thumb on slate track, auto-fades on hover / during drag / after scroll. `wireCustomScroll(host)` at boot sets up drag + page-jump + layout-change sync.

**Keyboard:**
- `Tab` / `Shift+Tab` cycles tabs
- `1` / `2` / `3` jumps to a tab
- `Esc` closes the modal (or the jettison confirm first if open)
- `Enter` activates the first action button on the selected item

### Fabricator (Installed Kit)

The fabricator is rendered as an industrial *installed machine* button — deliberately different visual register from the panel-btn family so it reads as on-ship equipment rather than interface chrome.

- Chunky rounded pushbutton, radial/linear gradient giving a 3D raised surface
- Green LED dot that slow-pulses when idle; brightens when actively fabricating; red when broken
- Wear progress bar immediately below the button (1–3px gap)
  - Green (wear > 66%) → yellow (33–66%) → red (< 33%)
- Lives in the right column of the combined resources + readout row, spanning both bands vertically
- Always installed on every ship ("fabricators are like microwaves" — baseline equipment)

### Crew Slots

Crew strip on the bottom row shows the captain + up to 2 crew as card-style slots (not just icons). Each slot:

- Icon + UPPERCASE name (Press Start 2P) + role label (VT323)
- Two mini-bars stacked: **HP** (health, green fill) and **MO** (morale, cyan fill)
- Hover → tooltip with the crew's current status detail; click → opens crew detail modal with tabs

Status states (5, not more — small sprites can't read more variation):
- `healthy` — default sprite, full color
- `tired`   — slight yellow tint, slump posture
- `wounded` — red tint + bandage overlay
- `sick`    — green tint + cough-droplet overlay (can spread)
- `critical` — heavily desaturated, near-death

Multi-state crew (wounded AND sick) shows the worst state on the cruise card; full breakdown in the detail modal.

### Crop Card

A fixed card (~250px wide) on the bottom row surfacing the central mission at a glance. Clicking the card opens the Growbay modal.

**Growing state** shows:
- Crop icon (large) + crop name
- Alert LED (dim by default; lights + pulses when attention needed — thirsty / sick / ready)
- Stage name (big, Press Start 2P): SPROUTING → VEGETATIVE → FLOWERING → MATURING
- Day counter: `DAY 12 / 90`
- **GROWTH** bar (cycle progress, teal by default) — bar labeled "GROWTH" on its left
- **HEALTH** bar (current condition, green by default) — bar labeled "HEALTH" on its left

**Mature state** (growth ≥ 100%):
- Growing block (stage/day/GROWTH bar) is replaced by a pulsing green **HARVEST** button that fills the same space
- Health bar still visible below
- Clicking HARVEST harvests and resets the cycle (growth → 0, stage → SPROUTING, day → 0). Event stops `event.stopPropagation()` so underlying card-click doesn't also open Growbay.
- Alert LED lights on automatically when mature

**Overdue state**: if `cropDay > maturity_days` AND growth < 100% (unhealthy plant running behind), the day counter renders in red with a red glow. Plant is still growing, just behind schedule.

**NO orange right-edge accent bar** — that visual language is reserved for "selected item in list" (setup-demo cards) and would miscommunicate here.

### Growbay Modal (the full picker behind the Crop Card)

Clicking the Crop Card opens the Growbay modal — the central place to inspect the plant, assign a tender, read modifiers, adjust water mid-course, and harvest when ready. **The modal pauses game time** on open and unpauses on close; all changes inside commit immediately except the water slider (commit-on-release, Escape cancels).

**Shape:**
- 760 × 520px centered panel, warm green (`#608c64`) border, Press Start 2P title in growth-green (`#359e3f`)
- Backdrop dims the cruise scene behind at ~75% opacity
- Three-band body: top bars → scene row (plant + crew columns side by side, with an info column to the right) → footer actions

**Banner header** (top strip):
```
GROWBAY    WHEAT  ·  FLOWERING STAGE  ·  GROWTH DAY 47 / 90    [X]
```
- `WHEAT` and `FLOWERING STAGE` styled in gold (`.stage-name` — uppercase, letter-spaced). Word `STAGE` is static; the stage name is the only dynamic part.
- `GROWTH DAY X / Y` — the crop's own clock (days since planting, out of maturity days). This is a distinct clock from the ship's journey day shown elsewhere. Disambiguated by the `GROWTH` prefix so nothing on-screen reads just "DAY N" except the journey day.
- On overrun (`cropDay > maturity_days` AND `growth < 100`) the `GROWTH DAY X / Y` string turns red — same overrun styling as the Crop Card's outer day counter.
- The banner day span, species name, and stage name all carry the species/stage tooltip (see Tooltip below).

**Top bars band** (full-width, above the scene):
- `GROWTH` bar — growth-green default, fills to `cropGrowth %`
- `HEALTH` bar — color interpolates smoothly across 5 stops (green → yellow-green → yellow → orange → red) by current `plant_health`. The same RGB drives the scene glow.

**Scene row** (below the bars):
- **Plant column** (left, ~160px wide): the 109×192 crop sprite for the current species/stage (`applyPlantSprite` reads `STATE.cropId` + `stageIndex(growth)`, with `SPRITE_ID_ALIAS` translating `sweet_potato→potato` and `soybean→soybeans` to the spritesheet). Below the sprite: stage-name label, then the `HARVEST` panel-button (pulsing green when `growth ≥ 100`, `.locked` otherwise), then the `READY ON DAY N` line. The ready-day is the ship's journey day when harvest becomes available at the current growth rate — bridges the plant's own clock back into journey time.
- **Crew column** (right, ~180px wide): animated crew sprite of the current tender (9-frame anim at 2s total, randomised 0–10s idle gap between animations). Below the sprite: the **tender slot** — a click-to-open picker row showing the tender's name + bonus. Below that: `TREAT` panel-button (locked unless an active modifier is negative/critical — nothing to treat otherwise) + `INSPECT` panel-button.
- **Shared warm backdrop** for both columns; a radial `.gb-glow` layer bleeds ~50px beyond the scene box in all directions, colored by plant health (same RGB as the health bar fill).
- **Bottom-align** both sprite slots so a tall tomato and a short sweet-potato sprout both stand on the same invisible floor.

**Info column** (right of the scene):
- **Growth modifiers panel** with two lists, `min-height`-locked so promotion between them doesn't shift later content:
  - `ACTIVE` — modifiers currently firing (positives + promoted threats). Each row: name + delta. `kind` is `positive` | `negative` | `critical` driving color.
  - `MONITORED` (2-col grid with a 1px central divider) — the canonical threat list with every threat NOT currently firing dimmed as a stub. Promotion from MONITORED → ACTIVE happens when a threat condition is met (root rot on overwatering, cold/heat snap on temp drift, pests on event trigger, etc.). This teaches players the full threat landscape before they're bitten by one.
- **NEXT STAGE** strip: `Flowering → Maturing in ~14 days` (rate derived from `growthFactor()`; renders `Growth stalled — plant needs attention.` at rates ≤ 0.01, and `Plant is READY to HARVEST!` at `growth ≥ 100`).
- **Water mini-slider** (commit-on-release): same two-way plant↔crew allocation as the Orders modal water track. Ideal-tick marks the crop's `water_need`; crew status pill shows NOMINAL / THIRSTY / CRITICAL. Drag to preview, release to commit; Escape during drag reverts. Same underlying state as the Orders modal — closing Growbay persists whatever was committed.

**Tender picker popover:**
- Click the tender slot → flyout picker opens **horizontally to the right**, vertically centered against the trigger (so a long crew list doesn't clip the modal's bottom).
- One row per available tender: 24px portrait + name + role + bonus. Current tender highlighted. Click swaps the tender immediately and re-renders (crew anim loop restarts for the new sheet; bonus propagates into modifiers).
- Crew bonuses (canonical):
  | Role                    | Growth | Yield |
  |---                      |---     |---    |
  | Botanist specialist     | +15%   | +15%  |
  | Captain w/ Botanist bg  | +7%    | +7%   |
  | Chef                    | +5%    | +5%   |
  | Generic crew            | +3%    | 0%    |
  | None (untended)         | 0%     | 0%    |

**Species / stage tooltip** (hover `WHEAT` or `MATURING STAGE` — same tooltip on both targets):
```
WHEAT
Staple grain. Calorie-dense and shelf-stable.

Maturity: 90 days  ·  Water: 50%  ·  Temp: 18–26°C
Yield: +40 Food

STAGES
  Sprouting   — Seeds break dormancy. Cold or overwatering wipes the bed.
  Vegetative  — Leaves and stems build. Fertilizer now multiplies final yield.
  Flowering   — Heads form. Heat stress shrinks grain size.
▸ Maturing    — Grain hardens. Water demand drops; pests peak.
```
The `▸` marker tracks the current stage so the tooltip is stage-aware without needing separate variants. All 5 crops ship with blurb + per-stage tip copy in `CROP_META`. Zinnia uses `yield_label: 'Morale'` instead of 'Food' since its payload is crew mood, not calories.

**Crop metadata schema** (extends `modules/crops/crops.json`):
```js
{
  name, blurb, maturity_days, water_need, ideal_temp,
  yield_amount, yield_label,        // 'Food' | 'Morale'
  sprite, fallback_icon,
  stages: [{ max, name, tip }]       // tip = 1-line stage-specific guidance
}
```

**Harvest ceremony:** when HARVEST is clicked at `growth ≥ 100`, a brief burst animation overlays the scene (`+40 FOOD`, scale-in-fade-out), the log appends `▶ Harvested WHEAT. +40 food rations. Cycle reset.`, and the cycle resets (`growth → 0`, `cropDay → 0`, stage → SPROUTING sprite). The journey continues without closing the modal — the player sees the new baby plant and can adjust water for the new cycle immediately.

**Action lock states:**
- `HARVEST` — `.locked` (dim, no pulse, no cursor) unless `growth ≥ 100`
- `TREAT` — `.locked` unless the `ACTIVE` modifier list contains a `negative` or `critical` entry. Treating a healthy plant is a no-op, so the button stays inert instead of opening an empty treatment modal.
- `INSPECT` — always actionable (it's the "learn more" button; never locked).

**NO orange right-edge accent bar** (same rule as the Crop Card and every other panel).

### AI Log Panel

The right side of the main area (320px wide) is the AI log panel — an accumulating chat-style history voiced in the chosen AI's tone. See Section 19 (Ship's Log) for log entry format, length rules, and expandable/external-link payload schema. Summary of the cruise-screen behavior:

- Fixed header: avatar circle + AI name (Press Start 2P)
- Scrollable log below: newest entry typewrites in at full opacity; older entries demote to 0.55 opacity but remain readable
- Day markers (`── DAY 48 ──`) separate sessions
- Auto-scroll to newest **only when player is within 50px of bottom** — if they've scrolled up to read history, new entries append silently without yanking them back
- Entries with `expand` payload render with trailing 📖 — click opens in-game modal; `link` payload renders with trailing 🔗 — click opens external tab and auto-pauses the game

### Event Presentation Modes

**Modal (simple events):**
- Dark semi-transparent panel slides up from bottom of travel screen
- Title, 2-3 sentences flavor text
- 2-4 choice buttons
- AI companion line in corner widget
- Dismissed quickly, back to flying

**Fullscreen (involved events, node arrivals):**
- Full screen takeover via the **Encounter Screen** (see below)
- Pixel art scene illustration (drawn from pool by `scene_type` and `tone`)
- Text and choices overlaid
- Used for: node arrivals, major events, minigame intros, deaths

### Encounter Screen (fullscreen events / hails / approaches)

The encounter screen is the canonical fullscreen surface for any narrative event. `demo-encounter.html` is authoritative. The screen is a layered stack — at the back, the scene; in the middle, the speaker; at the front, the dialogue and choices.

**Layer stack (back to front):**

```
z=0   enc-backdrop-base       bgBase   full-bleed jpg   only when bg has transparency
z=1   enc-backdrop-sprite     bgSprite png at (160,93)  640×405 viewport content
z=2   enc-backdrop            bg       jpg or transp png  primary scene
z=3   enc-vignette
z=4   enc-subject + name plate         talking-head frame, left
z=5   enc-dialog                       speaker speech strip, anchored under name plate
z=6   enc-ai-bar                       AI companion line, top-left
z=7   enc-resources                    HUD (fuel/food/o2/hull/morale dots), top-right
z=8   enc-narrative                    narrator panel, bottom strip
z=9   enc-choices                      action button column, right (incl. always-present LEAVE)
```

**`#encounter-screen`** carries a `--bg-empty: #020408` solid-color floor as the deepest fallback when all backdrop layers are transparent/empty.

**Three backdrop fields per scenario / layer / outcome:**
- `bg` — primary scene backdrop (always rendered)
- `bgBase` — full-bleed jpg shown through any transparency in `bg` (used when bg is transparent, e.g. `our_ship/bridge.png`)
- `bgSprite` — png placed at the bridge viewport coords (160, 93, 640×405), used for ship/planet/station overlays in screen-mode encounters

**Bridge composition** (for hails, planet/station approaches, anything observed from your ship):
```js
{ bg: 'our_ship/bridge', bgBase: 'space/deep', bgSprite: 'ship_exterior/<arch>/{species}', commMode: 'screen' }
```
The bridge.png's transparent viewport rect (top-left 160,93 → bottom-right 800,495 = 640×402; sprite canvas rounded up to 640×405 with the 3px overshoot hidden behind the bezel) reveals the base + sprite layers below.

**Comm mode** (`commMode` field, scenario-level with optional per-layer override): drives subject-frame visual treatment only — independent of bg composition.
- `'in-person'` (default) — clean portrait, no overlay
- `'screen'` — scanline overlay + green-phosphor `hue-rotate(-10deg) saturate(0.85)` tint on the head + ~5.5s flicker cycle. For hails, security-cam feeds, viewscreen comms.
- `'corrupted'` — purple-shifted scanlines + 3-step head-glitch jitter. For void / cosmic-horror moments.

### Speaker speech vs narrator prose

**Hard rule: character speech goes in the dialog strip, never embedded in narrator prose.**

- `body:` field → narrator panel (bottom strip). Scene description, atmosphere, what's visible. Cream text, prose voice.
- `line:` field → dialog strip (anchored under the subject's name plate). The character's actual spoken words, in their voice. Italic VT323, bare quotes (`"…"`).

When authoring a layer or outcome that has both, split them:
```js
{
  body: "The trader folds their arms.",
  line: "This is already my discount price, friend. For you, because I like your face."
}
```

The dialog strip only renders when (a) `line:` is set AND (b) the scenario is not `noSubject: true`. For ship-only events (hull breach, asteroid mining, nebula threading), there's no speaker; everything is narrator prose.

### Effort + cost model on choice buttons

Two layers of cost per action:

**Layer 1 — Effort tax** (the pip dots `●●●○○`, max 5):
- Always-on, scales with N
- **Nonlinear morale cost** per pip: `MORALE_BY_EFFORT = [0, 1, 2, 4, 6, 9]` (so pip 5 costs 9 morale, not 5 — hard things hit disproportionately)
- Effort ≥ 3 also implies crew fatigue accumulating
- Effort does **not** add injury risk — that's the separate `risky: true` flag (probability of bad outcome)
- Effort 5 reserved for "all hands on deck" — multi-crew gated, heavy resource cost, or significant time + risk combo

**Layer 2 — Action-specific costs** (authored per choice, optional):
- `time:` (hours, exact, displayed as `Math.round(t) + 'h'` or `<1h`) — never derived from effort
- `fuel:` numeric burn (only some actions)
- `hull:` damage taken
- `consumes:` item ID (e.g., 'kit') — burns one of that item from cargo
- `minigame:` triggers a minigame on click (`combat`, `shooter_360`, `navigation`, etc.)
- `risky:` boolean — adds "may fail or injure crew" hint

**Locked actions** show `🔒` icon + inline "Need: X + Y + Z" listing every unmet requirement (multi-gate). No tooltip needed — the requirement list IS the explanation.

**Unlocked actions** get a hover tooltip via `composeTooltip(ch)` — a multi-line breakdown of effort tax + action costs + risk hint. Currently rendered via `title=` attribute (browser default popup, ~700ms delay). Will swap for the project-wide custom tooltip component when that ships; the composer code stays the same.

### Choice button visuals

- Default accent strip on the **right side**, 5px thick (left-mode 3px stays as a dev toggle)
- Strip color via `--strip-c` custom property: gold default, red `risky`, teal `hint`, red `leave`, gray `locked`
- Hover border mirrors `--strip-c` (variant-aware — risky hovers red, leave hovers red, etc., not always gold)
- **Leave button** is the always-present exit/abort action (last in column). Visually distinct: uniform 3px border on all four sides (no asymmetric strip), red gradient bg, red-tinted text. `leaveLabel:` per-scenario string (e.g., "BREAK OFF", "WALK OUT", "RETURN TO ORBIT"). `leaveDisabled: true` for forced encounters (hull breach, mid-nebula, boarding).
- Choice entrance: top-to-bottom staggered fade (40ms stagger × 180ms fade per button). `pointer-events: none` until the whole group lands. Click anywhere mid-cascade snaps all in instantly.

### Crew talking-head animation (CREW-SPECIFIC convention)

Crew spritesheets at `sprites/crew_sprites/spritesheet_<id>.png` use a different frame convention from the bible's NPC spec (§11):

| | NPC sheets (§11) | Crew sheets |
|---|---|---|
| Idle frame | frame 10 (last) | **frame 0 (first)** |
| Talk frames | 1-9 | 1-8 |
| Total frames | 10 | 9 |

**Why the divergence:** crew sheets pack the static portrait + icon at the right edge of the same atlas (296× column), so the 9-frame talking grid fits the left 3×3 area cleanly with frame 0 doubling as idle. NPC sheets are talking-only, no portrait/icon packed, so they have headroom for a 10th idle frame.

**Crew animation timing (mirrors SSS):** 2000ms cycle = 500ms hold on idle (frame 0) + 1500ms cycling frames 1-8 at ~187ms each. RAF-driven, runs while typewriter is active on the dialog strip; settles back to idle on stop.

**Sheet packing** (uniform 376×294 sheet, 96×96 frames in 3×3 grid):
- Frames 0-8 at (1,1), (99,1), (197,1), (1,99), (99,99), (197,99), (1,197), (99,197), (197,197)
- Portrait at (295, 1), 80×192 (reyes exception: 80×143)
- Icon at (295, 195), 48×48 (reyes exception: (295, 146))

Captain has separate `captain.png` + `captain_icon.png` files (no spritesheet — captain doesn't talk to themselves yet).

### The Map Screen
Accessible via [MAP] button. Shows:
- Full node graph for current map
- Current position
- Visited nodes (revealed)
- Unvisited nodes (type visible if scanner equipped, otherwise just markers)
- Fork branches and their `branch_flavor` labels (one branch may show as `???`)

**Scanner indicator states** (small pill above the legend):
- **Active** — scanner installed and functional. Green dot + `SCANNER ACTIVE` label, pulsing.
- **Broken/Disabled** — scanner installed but damaged by an event (solar flare, hull breach, sabotage, etc.). Red dot + `SCANNER OFFLINE` label. Map reverts to no-scan visuals (future nodes render as gray `?` until within 1 step) even though the scanner is physically still there. Repair via fabricator or station service to restore.
- **Not installed** — indicator not rendered at all. Map also shows no-scan visuals.

Scanner-damage events should be tagged `damages: ["scanner"]` in their outcome so the engine flips the state consistently, regardless of what triggered the damage.

---

## 19. Ship's Log

A persistent auto-written record of the current run. Generated in captain's log voice, colored by the chosen AI's tone.

- Auto-populates with every significant event, death, and choice
- Tone reflects AI companion: MARV's log is dry and fatalistic, CHIP's has footnotes from sponsors
- Becomes the epitaph/victory record at run end
- Full log viewable via [AI LOG] button during play
- Shareable as text at run end

**Sample MARV log entry:**
> *Day 14. We stopped at the asteroid field. I advised against it. The crew mined for 11 minutes and returned with minerals and a small scar each. Morale, inexplicably, improved. I have no model for this.*

**Sample CHIP log entry:**
> *Day 14. Today's mining operation was a SUCCESS! ⭐ Brought to you by AstroSnax™ — the official protein bar of people who should be more worried than they are.*

### Log entry format & length rules

Each log line is surfaced in the cruise screen's AI panel (320px wide, ~18–20 lines visible). The latest entry auto-scrolls to the bottom and must be fully legible on arrival without the player scrolling to read it.

- **Per-entry char budget**: safe ≤ 65, comfortable ≤ 95, hard cap **120 chars**
- **Longer narration**: split into 2 sequential shorter entries rather than one long blob
- **Event JSONs** declare their log text as an **array of strings**, not a single field — the engine pushes them one at a time

### Expandable entries & external links *(optional, reserved)*

The log entry schema reserves two optional slots so any entry can escape the char budget when it genuinely needs to — without forcing the normal case to be verbose:

```
{
  text: "ARIA: That anomaly looks oddly familiar...",
  expand?: "<long-form content, opens a modal in-game>",
  link?:   { url: "https://hubblesite.org/contents/...", label: "See similar on Hubble" }
}
```

- **`expand`** — clicking opens an in-game modal with the full content; game pauses. Used when the AI has "a long thought" or an event has extended lore.
- **`link`** — opens external URL in a new browser tab, auto-pauses the game. Primary use is educational tie-ins (NASA mission pages, Hubble/JWST images, real crop biology, etc.), matching the game's quiet educational bent.
- Visual convention: a small trailing icon on entries carrying a payload — 📖 for modal-expand, 🔗 for external link.
- Both slots are optional and unused by default. Expanding them later is purely additive; events that don't need them stay plain-text.

---

## 20. Flavor Pools

Non-tag text pools. Engine draws randomly. No logic applied. Used for names, epithets, ambient text.

### Map Names
*(Hard)*
- The Widow's Run
- The Outer Reach
- The Perfectly Fine Route (Do Not Research This)
- The Kepler Passage
- The Long Goodbye
- Dead Reckoning

*(Medium)*
- The Merchant's Road
- The Kepler Compromise
- Secondary Option
- The Scenic Route (Relatively Speaking)

*(Easy)*
- The Goldilocks Run
- Standard Passage 7
- The Well-Charted Way
- Tourist Class

---

### Station Names
- Waypoint Zeta-4
- The Refueling Opportunity
- Midpoint Station (Temporarily Named)
- Fort Probably Fine
- Crossroads (The Space Version)
- Depot Kowalski
- The Last Resort (Branded)

---

### Planet Names
*(Discovered/candidate planets)*
- Kepler-78b (Provisional)
- New Somewhere
- HD 40307g
- That One With The Rings
- Candidate Alpha
- The Green One
- TRAPPIST-4 (Not The Good One)

---

### Crew Epitaphs
- *"[Name] opened the airlock to 'get some fresh air.' [Name] is survived by a very confused houseplant."*
- *"[Name] died as they lived: arguing with the ship AI about whether plants feel pain."*
- *"[Name] attempted to repair the drive coil without tools. In their defense, they were very confident."*
- *"[Name] touched the thing. We had agreed not to touch the thing."*
- *"[Name] is gone. The cook has already claimed their bunk. This feels too fast."*
- *"[Name]'s last words were 'how hard can it be.' We have discussed as a crew not to use this phrase anymore."*
- *"[Name] sent a distress signal with the wrong coordinates. The rescue ship went somewhere lovely."*

---

### Derelict Ship Names
- The Optimistic Projection
- FSS Whatever It Takes
- The Belated Concern
- Colony Vessel 7 (Registry Pending)
- The Calculated Risk
- Second Attempt
- The Marginal Improvement

---

### Ambient Travel Flavor Objects
*(Drift past in travel background — pure visual)*
- A billboard: "VISIT NEW WHEREVER — Ask About Our Terms"
- A single boot, slowly rotating
- A dead satellite with a thumbs-up painted on it
- A refrigerator (no context provided)
- A probe labeled "RETURN TO SENDER"
- A crate with "CONTENTS: UNKNOWN (GOOD UNKNOWN)" stenciled on it
- An inflatable alien, deflating

---

## 21. File Architecture

```
trans-plant/
├── GAME_BIBLE.md
├── engine/                        ← built last, Phase 2
│   └── (game code goes here)
├── modules/
│   ├── events/
│   │   ├── events_general.json    ← any node type, any trigger
│   │   ├── events_station.json
│   │   ├── events_planet.json
│   │   ├── events_derelict.json
│   │   ├── events_anomaly.json
│   │   └── events_crisis.json     ← low resource triggers
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
│       └── flavor_pools.json      ← names, epitaphs, ambient objects
└── registry/
    └── tag_registry.json          ← machine-readable source of truth
```

### Build Order

**Phase 1 — Modules (content first, no engine)**
1. `tag_registry.json` — built first; everything else validates against it
2. `ships.json` + `crew_roster.json` — small, foundational, establishes IDs everything else references
3. `items.json` — needed before events that reference items
4. Event files one at a time, cross-referencing items, crew, and registry as they're written
5. `locations/` files
6. `endings.json` + `flavor_pools.json` last

**Phase 2 — Engine (reads finished modules)**
Claude Code opens all module files as read-only context and builds the game interface against them. Modules don't change — the engine loads them.

---

## 22. Tag Registry JSON (The Linchpin)

This is the machine-readable version of Section 4. It lives at `registry/tag_registry.json` and is the **source of truth** for the engine and all module authors.

Every module file validates its tags against this registry. Claude Code updates `status` fields here as modules are written. At any point you can ask Claude Code *"what tags are still empty"* and it reads this file and reports exactly what content is missing.

### Full Schema

```json
{
  "difficulty": {
    "description": "Controls event pool weighting per map difficulty",
    "multiple_allowed": false,
    "values": {
      "easy":   { "status": "empty", "notes": "Majority weighting on easy maps" },
      "medium": { "status": "empty", "notes": "Balanced, appears on medium+ maps" },
      "hard":   { "status": "empty", "notes": "Majority on hard maps, sparse on medium" },
      "ultra":  { "status": "empty", "notes": "Hard maps only, late-journey, genuinely unfair" }
    }
  },

  "tone": {
    "description": "Emotional/comedic register of the module",
    "multiple_allowed": true,
    "values": {
      "absurd":      { "status": "empty", "notes": "Douglas Adams, Far Side register" },
      "grim":        { "status": "empty", "notes": "Real consequences, played straight" },
      "corporate":   { "status": "empty", "notes": "Bureaucratic, sponsored, HR-flavored" },
      "horror":      { "status": "empty", "notes": "Defined — zero modules written" },
      "heartwarming":{ "status": "empty", "notes": "Rare — hits harder for being rare" },
      "cosmic":      { "status": "empty", "notes": "Incomprehensible scale, Lovecraft for laughs" },
      "mundane":     { "status": "empty", "notes": "The joke is that it's boring" },
      "corrupted":   { "status": "empty", "notes": "Void Road exclusive — AI dialogue distorts" }
    }
  },

  "node_type": {
    "description": "What kind of location this module represents on the map",
    "multiple_allowed": true,
    "values": {
      "station":       { "status": "empty" },
      "planet":        { "status": "empty" },
      "derelict":      { "status": "empty" },
      "asteroid_field":{ "status": "empty" },
      "anomaly":       { "status": "empty" },
      "nebula":        { "status": "empty" },
      "void":          { "status": "empty", "engine_required": true },
      "fork":          { "status": "empty" },
      "any":           { "status": "empty" }
    }
  },

  "trigger": {
    "description": "Game state condition that enables or prioritizes an event",
    "multiple_allowed": true,
    "values": {
      "any":           { "status": "empty" },
      "low_fuel":      { "status": "empty", "threshold": "below 25%" },
      "low_food":      { "status": "empty", "threshold": "below 25%" },
      "low_o2":        { "status": "empty", "threshold": "below 25%" },
      "low_hull":      { "status": "empty", "threshold": "below 30%" },
      "low_morale":    { "status": "empty", "threshold": "below 30%" },
      "crew_injured":  { "status": "empty" },
      "crew_dead":     { "status": "empty" },
      "post_combat":   { "status": "empty" },
      "at_station":    { "status": "empty" },
      "full_cargo":    { "status": "empty" },
      "empty_cargo":   { "status": "empty" },
      "journey_start": { "status": "empty", "notes": "First two legs only" },
      "journey_end":   { "status": "empty", "notes": "Final two legs only" }
    }
  },

  "branch_flavor": {
    "description": "Character of a fork branch — used to weight node and event pools within that branch",
    "multiple_allowed": false,
    "values": {
      "hostile":        { "status": "empty" },
      "lucrative":      { "status": "empty" },
      "safe":           { "status": "empty" },
      "unknown":        { "status": "empty", "notes": "Player sees ??? — mystery branch" },
      "corporate":      { "status": "empty" },
      "derelict_heavy": { "status": "empty" },
      "scientific":     { "status": "empty" }
    }
  },

  "requires_crew": {
    "description": "Event option only appears if this crew role is aboard",
    "multiple_allowed": true,
    "values": {
      "engineer":  { "status": "empty" },
      "medic":     { "status": "empty" },
      "pilot":     { "status": "empty" },
      "cook":      { "status": "empty" },
      "diplomat":  { "status": "empty" },
      "stowaway":  { "status": "empty" },
      "veteran":   { "status": "empty", "notes": "Captain type" },
      "merchant":  { "status": "empty", "notes": "Captain type" },
      "academic":  { "status": "empty", "notes": "Captain type" },
      "optimist":  { "status": "empty", "notes": "Captain type" }
    }
  },

  "requires_item": {
    "description": "Event option only appears if player has this item in cargo",
    "multiple_allowed": true,
    "values": {
      "repair_kit":          { "status": "empty" },
      "gas_analyzer":        { "status": "empty" },
      "water_purifier":      { "status": "empty" },
      "geiger_counter":      { "status": "empty" },
      "soil_sampler":        { "status": "empty" },
      "portable_drill":      { "status": "empty" },
      "spectrometer":        { "status": "empty" },
      "medical_scanner":     { "status": "empty" },
      "pressure_suit":       { "status": "empty" },
      "solar_array":         { "status": "empty" },
      "emergency_beacon":    { "status": "empty" },
      "drive_coil":          { "status": "empty", "source": "loot_only" },
      "o2_recycler":         { "status": "empty", "source": "loot_only" },
      "repair_fabricator":   { "status": "empty", "source": "loot_only" },
      "classified_cargo":    { "status": "empty", "source": "loot_only" },
      "expanded_fuel_tank":  { "status": "empty", "source": "purchasable" },
      "hull_plating":        { "status": "empty", "source": "purchasable" },
      "insulated_cargo_bay": { "status": "empty", "source": "purchasable" },
      "weapon_hardpoint":    { "status": "empty", "source": "purchasable" },
      "second_weapon_hardpoint": { "status": "empty", "source": "loot_only" }
    }
  },

  "requires_ai": {
    "description": "Option or flavor text variant tied to specific ship AI",
    "multiple_allowed": false,
    "values": {
      "aria": { "status": "empty" },
      "marv": { "status": "empty" },
      "rex":  { "status": "empty" },
      "chip": { "status": "empty" },
      "any":  { "status": "empty" }
    }
  },

  "requires_ship": {
    "description": "Option or modifier tied to specific ship type",
    "multiple_allowed": false,
    "values": {
      "perseverance":          { "status": "empty" },
      "entrepreneurial_spirit":{ "status": "empty" },
      "regrettable_decision":  { "status": "empty" },
      "any":                   { "status": "empty" }
    }
  },

  "minigame_type": {
    "description": "Which arcade variant fires if this event triggers a full minigame",
    "multiple_allowed": false,
    "values": {
      "shooter_fixed": { "status": "empty", "notes": "Galaga" },
      "shooter_360":   { "status": "empty", "notes": "Asteroids" },
      "sidescroller":  { "status": "empty", "notes": "Moon Patrol" },
      "defense":       { "status": "empty", "notes": "Space Invaders" },
      "navigation":    { "status": "empty", "notes": "Frogger" }
    }
  },

  "minigame_end_condition": {
    "description": "How the arcade minigame concludes",
    "multiple_allowed": false,
    "values": {
      "timed":       { "status": "empty" },
      "survival":    { "status": "empty" },
      "clear_waves": { "status": "empty" },
      "objective":   { "status": "empty" }
    }
  },

  "minigame_trigger": {
    "description": "What scenario triggers the arcade minigame",
    "multiple_allowed": false,
    "values": {
      "combat":     { "status": "empty" },
      "mining":     { "status": "empty" },
      "chase":      { "status": "empty" },
      "defense":    { "status": "empty" },
      "navigation": { "status": "empty" }
    }
  },

  "microgame_type": {
    "description": "Which repair/interaction micro-minigame fires inside an event",
    "multiple_allowed": false,
    "values": {
      "wrench":              { "status": "empty" },
      "bypass":              { "status": "empty" },
      "pressure_gauge":      { "status": "empty" },
      "defibrillator":       { "status": "empty" },
      "airlock_seal":        { "status": "empty" },
      "override":            { "status": "empty" },
      "negotiation_wobble":  { "status": "empty" },
      "calibration":         { "status": "empty" }
    }
  },

  "microgame_difficulty_modifier": {
    "description": "How crew and items affect a micro-minigame",
    "multiple_allowed": true,
    "values": {
      "easier_with":     { "status": "empty" },
      "harder_without":  { "status": "empty" },
      "impossible_without": { "status": "empty" }
    }
  },

  "event_presentation": {
    "description": "How an event is displayed to the player",
    "multiple_allowed": false,
    "values": {
      "modal":      { "status": "empty" },
      "fullscreen": { "status": "empty" },
      "minigame":   { "status": "empty" },
      "microgame":  { "status": "empty" }
    }
  },

  "failure_type": {
    "description": "Valid end states that are not victory",
    "multiple_allowed": false,
    "values": {
      "no_fuel":      { "status": "empty" },
      "crew_gone":    { "status": "empty" },
      "hull_zero":    { "status": "empty" },
      "mutiny":       { "status": "empty" },
      "time_expired": { "status": "empty" }
    }
  },

  "ending_score": {
    "description": "Victory condition bracket that determines which ending fires",
    "multiple_allowed": false,
    "values": {
      "legendary": { "status": "empty" },
      "good":      { "status": "empty" },
      "rough":     { "status": "empty" },
      "pyrrhic":   { "status": "empty" }
    }
  },

  "effort_cost": {
    "description": "How much time/resources a repair action costs",
    "multiple_allowed": false,
    "values": {
      "trivial": { "status": "empty" },
      "low":     { "status": "empty" },
      "medium":  { "status": "empty" },
      "high":    { "status": "empty" },
      "extreme": { "status": "empty" }
    }
  },

  "requires_effort_from": {
    "description": "Which crew or item reduces effort cost to baseline",
    "multiple_allowed": true,
    "values": {
      "any_crew":              { "status": "empty" },
      "engineer":              { "status": "empty" },
      "medic":                 { "status": "empty" },
      "pilot":                 { "status": "empty" },
      "academic":              { "status": "empty" },
      "item:repair_kit":       { "status": "empty" },
      "item:repair_fabricator":{ "status": "empty" }
    }
  },

  "scene_type": {
    "description": "Which illustrated image pool an event or node draws from",
    "multiple_allowed": false,
    "values": {
      "station_interior": { "status": "empty", "min_variants_before_launch": 2 },
      "planet_surface":   { "status": "empty", "min_variants_before_launch": 3 },
      "derelict_interior":{ "status": "empty", "min_variants_before_launch": 2 },
      "anomaly":          { "status": "empty", "min_variants_before_launch": 2 },
      "asteroid_field":   { "status": "empty", "min_variants_before_launch": 2 },
      "deep_void":        { "status": "empty", "min_variants_before_launch": 2 },
      "ship_interior":    { "status": "empty", "min_variants_before_launch": 2 }
    }
  },

  "item_behavior": {
    "description": "What an item does passively while carried",
    "multiple_allowed": true,
    "values": {
      "passive_effect":    { "status": "empty" },
      "reveals_item_tags": { "status": "empty" },
      "one_use":           { "status": "empty" },
      "location_dependent":{ "status": "empty" },
      "upgrade":           { "status": "empty", "notes": "Ship stat modifier — active while in cargo" }
    }
  },

  "item_source": {
    "description": "How an item enters the game",
    "multiple_allowed": false,
    "values": {
      "purchasable":   { "status": "empty" },
      "loot_only":     { "status": "empty" },
      "event_reward":  { "status": "empty" },
      "starting_gear": { "status": "empty" }
    }
  },

  "item_location_condition": {
    "description": "Where a passive item effect is active",
    "multiple_allowed": false,
    "values": {
      "near_star": { "status": "empty" },
      "on_planet": { "status": "empty" },
      "in_void":   { "status": "empty" },
      "at_station":{ "status": "empty" },
      "any":       { "status": "empty" }
    }
  },

  "crew_display_state": {
    "description": "Visual state of a crew slot icon in the UI",
    "multiple_allowed": false,
    "values": {
      "healthy": { "status": "empty" },
      "injured": { "status": "empty" },
      "dead":    { "status": "empty" }
    }
  },

  "faction_reputation_effect": {
    "description": "Hidden reputation modifier applied by events — REMOVED from design v0.4",
    "multiple_allowed": true,
    "values": {
      "corporate:+1": { "status": "deprecated", "notes": "Removed from design v0.4" },
      "corporate:-1": { "status": "deprecated", "notes": "Removed from design v0.4" },
      "pirate:+1":    { "status": "deprecated", "notes": "Removed from design v0.4" },
      "pirate:-1":    { "status": "deprecated", "notes": "Removed from design v0.4" }
    }
  },

  "severity": {
    "description": "Consequence tier of a dangerous event outcome — controls crew damage and follow-up eligibility",
    "multiple_allowed": false,
    "values": {
      "lethal":  { "status": "empty", "notes": "Immediate crew death, triggers epitaph screen" },
      "injury":  { "status": "empty", "notes": "Crew marked injured — active skill off, passive halved" },
      "delayed": { "status": "empty", "notes": "Injured with pending crisis if untreated before next station" }
    }
  },

  "npc_disposition": {
    "description": "Which NPC pool an event pulls from",
    "multiple_allowed": false,
    "values": {
      "trader":       { "status": "empty" },
      "drifter":      { "status": "empty" },
      "pirate":       { "status": "empty" },
      "station_crew": { "status": "empty", "notes": "Requires npc_station_job to narrow" }
    }
  },

  "npc_species": {
    "description": "Species of the resolved NPC. Wildcards any_alien, any_human, any are resolver tokens and not registered values",
    "multiple_allowed": false,
    "values": {
      "human":   { "status": "empty" },
      "insect":  { "status": "empty", "notes": "Tic *bzzt*, clipped grammar" },
      "rock":    { "status": "empty", "notes": "Tic *crack*, dropped-articles grammar" },
      "water":   { "status": "empty", "notes": "Tic *bubble*, flowing grammar" },
      "reptile": { "status": "empty", "notes": "Sibilant tic and grammar" },
      "robot":   { "status": "empty", "notes": "Tic [processing], formal-expanded grammar" },
      "unknown": { "status": "empty", "notes": "Inconsistent grammar per line — the character is unparseable" }
    }
  },

  "npc_station_job": {
    "description": "Job role for NPCs with npc_disposition: station_crew. Ignored for other dispositions",
    "multiple_allowed": false,
    "values": {
      "captain":  { "status": "empty" },
      "medic":    { "status": "empty" },
      "engineer": { "status": "empty" },
      "botanist": { "status": "empty", "notes": "Expected most-used station role" },
      "janitor":  { "status": "empty", "notes": "Soft intel source" },
      "security": { "status": "empty" }
    }
  },

  "trail": {
    "description": "Which difficulty/map tier this content is available on",
    "multiple_allowed": true,
    "values": {
      "lunar":        { "status": "empty", "notes": "Short map, 10 nodes, 1 fork, easy-weighted" },
      "mars":         { "status": "empty", "notes": "Medium map, 13 nodes, 2 forks, balanced" },
      "interstellar": { "status": "empty", "notes": "Long map, 15 nodes, 3 forks, hard-weighted" },
      "any":          { "status": "empty", "notes": "Available on all trails" }
    }
  },

  "captain_background": {
    "description": "Captain's area of study — provides discounted skill checks vs. full crew specialist",
    "multiple_allowed": false,
    "values": {
      "botanist":      { "status": "empty", "skill_modifier": 0.5, "notes": "Half the bonus of a crew botanist" },
      "engineer":      { "status": "empty", "skill_modifier": 0.5 },
      "medic":         { "status": "empty", "skill_modifier": 0.5 },
      "pilot":         { "status": "empty", "skill_modifier": 0.5 },
      "chef":          { "status": "empty", "skill_modifier": 0.5 },
      "xenobiologist": { "status": "empty", "skill_modifier": 0.5 },
      "diplomat":      { "status": "empty", "skill_modifier": 0.5 },
      "merchant":      { "status": "empty", "skill_modifier": 0.5, "notes": "Station prices reduced, barter options" },
      "academic":      { "status": "empty", "skill_modifier": 0.5, "notes": "Research options, reveals hidden outcomes" },
      "veteran":       { "status": "empty", "skill_modifier": 0.5, "notes": "Combat bonuses, tactical assessment" }
    }
  },

  "crop_type": {
    "description": "Which crop the player selected at setup — affects resource drain, events, and endings",
    "multiple_allowed": false,
    "values": {
      "wheat":        { "status": "empty", "notes": "Reliable but monoculture-vulnerable" },
      "tomato":       { "status": "empty", "notes": "Drama magnet, high food value, triggers tomato-specific events" },
      "sweet_potato": { "status": "empty", "notes": "NASA's pick — balanced, ship computer approves" },
      "soybean":      { "status": "empty", "notes": "Nitrogen fixing — resists soil contamination events" },
      "zinnia":       { "status": "empty", "notes": "No food value, high morale — hard mode on food, morale payoff" }
    }
  },

  "fabricator_state": {
    "description": "Current state of the onboard fabricator (VA-origin concept)",
    "multiple_allowed": false,
    "engine_required": true,
    "values": {
      "functional": { "status": "empty", "notes": "Working, health 1-100" },
      "broken":     { "status": "empty", "notes": "Non-functional until repaired" }
    }
  }
}
```

### Registry Rules for Claude Code
1. **Before writing any module:** Check that every tag value it uses exists in this file
2. **After writing a module:** Update `status` from `empty` to `populated` for every tag value used
3. **New tag needed:** Add it to this file first, then use it in the module
4. **Retiring a tag value:** Change status to `deprecated`, never delete the entry
5. **At any time:** Query this file to report all `empty` status values — that is the content gap list

---

## 23. Module Checklist

Tracks content completion status. Update as modules are written.

### Events
| ID | Title | Tags | Status |
|---|---|---|---|
| — | — | — | `empty` |

### Nodes
| ID | Type | Tags | Status |
|---|---|---|---|
| — | — | — | `empty` |

### Crew
| ID | Role | Tags | Status |
|---|---|---|---|
| — | — | — | `empty` |

### Items
| ID | Name | Source | Status |
|---|---|---|---|
| — | — | — | `empty` |

### Endings
| ID | Score Bracket | Tone | Status |
|---|---|---|---|
| — | — | — | `empty` |

### Failure Screens
| ID | Failure Type | Tone | Status |
|---|---|---|---|
| — | — | — | `empty` |

### Scene Images
| ID | Scene Type | Tone | Status |
|---|---|---|---|
| — | — | — | `empty` |

---

*Bible version: 0.6 — Drift reconciliation: formalized four prior-registry-only tags (trail, captain_background, crop_type, fabricator_state) into Section 4 and Section 22, added requires_ship to registry. Registry and Bible now fully aligned at 32 dimensions.*

*Bible version: 0.7 — Added Ship-to-Ship Combat sub-section to §13 (Arcade Minigames). Registry gained three combat-related dimensions: `combat_outcome`, `pirate_disposition_subtype`, `combat_action_type`. Flavor pool gained `combat_log` skeleton (17 slots × 5 AIs). See `COMBAT_SYSTEM_HANDOFF.md` for full spec; `demo-combat.html` is the v1 implementation.*
*Next step: Generate `registry/tag_registry.json` from Section 22, then begin Phase 1 module files in build order.*
*The registry JSON is the source of truth. When in doubt, check it before writing a module.*

# 🌿 The Verdant Ark — Living Design Bible
> **This document is a creative director, not a changelog.**  
> Read it before every session. Update it after every new idea, item, node, tag, or event — not just at session end.  
> It tracks what exists, what's unresolved, and what should exist next.  
> It has opinions. Trust them.

---

## How Claude Should Use This Document

**At the start of every session:**
1. Read the Dangling Threads and Hungry Gates sections first
2. Check if the new idea being discussed closes anything already open
3. Offer at least one connection to existing content before inventing something new

**During every session:**
- When a new tag is created → log it immediately in the Tag Registry
- When a new item is created → log it in the Item Registry with source and intended payoff
- When a gate is written → log it in Hungry Gates until a key exists for it
- When a key is created → check Hungry Gates for anything it could unlock
- When a new node is written → add it to the Node Index with inbound/outbound tags
- When a thread closes → move it from Dangling to Resolved with a note

**When stuck or between ideas:**
- Read the Dangling Threads list — something there wants to be written
- Read the Sparse Areas list — somewhere is being neglected
- Read the Two Moves Ahead section — ideas are already waiting
- Never propose something new without first checking if it serves something old

**Provenance rule:**
Every item, tag, and locked door gets a one-line note explaining why it was created and what it was originally intended to do. This survives forgetting. Write it at creation, not later.

---

## Signal States

Everything in this bible is in one of four states at any time:

| State | Meaning | Action |
|---|---|---|
| 🟡 **Dangling** | Created but not yet paid off | Find the payoff or cut it |
| 🔴 **Hungry** | Gate exists but no current path leads to its key | Write the path to the key |
| 🟢 **Resolved** | Thread is closed, key meets lock, payoff delivered | Archive it |
| 🔵 **Dense** | Tag or node doing too much work, becoming a crutch | Spread the load |

---

## Tag Registry

Every tag that exists in the game. Who creates it. Who consumes it. Current state.

### Player State Tags (granted by setup choices)

| Tag | Granted By | Consumed By | State | Provenance |
|---|---|---|---|---|
| `crew_botanist` | Selecting Botanist role | Various node gates | 🟡 Dangling | Unlocks plant-whispering choices and species-saving outcomes |
| `crew_chef` | Selecting Chef role | Various node gates | 🟡 Dangling | Unlocks food efficiency bonuses and edibility joke outcomes |
| `crew_xenobiologist` | Selecting Xenobiologist role | Various node gates | 🟡 Dangling | Unlocks alien encounter options and diplomatic hidden choices |
| `crew_engineer` | Selecting Engineer role | Various node gates | 🟡 Dangling | Unlocks hull/power favorable tradeoffs |
| `crew_medic` | Selecting Medic role | Various node gates | 🟡 Dangling | Unlocks slower crew health degradation and treatment choices |
| `crew_pilot` | Selecting Pilot role | Various node gates | 🟡 Dangling | Unlocks evasive maneuver choices with reduced fuel cost |
| `crop_wheat` | Selecting Wheat as starting crop | Various node gates | 🟡 Dangling | Reliable but monoculture-vulnerable |
| `crop_tomato` | Selecting Tomatoes | Various node gates | 🟡 Dangling | Drama magnet. Should trigger tomato-specific events |
| `crop_sweet_potato` | Selecting Sweet Potatoes | Various node gates | 🟡 Dangling | NASA's top pick — should occasionally be acknowledged by the ship computer with mild approval |
| `crop_soybean` | Selecting Soybeans | Various node gates | 🟡 Dangling | Nitrogen fixing — should interact with soil/contamination events |
| `crop_zinnia` | Selecting Zinnias | Various node gates | 🟡 Dangling | No food value, high morale — should create unique morale-related outcomes |
| `departed_earth_orbit` | Starting at loc_earth_orbit | TBD | 🟡 Dangling | Origin tag — may affect how alien encounters are narrated |

### Story Tags (granted during play)

| Tag | Granted By | Consumed By | State | Provenance |
|---|---|---|---|---|
| `investigated_anomaly` | Choice A at deep_space_anomaly | TBD | 🟡 Dangling | Player chose to look closer at something unknown — should pay off at first contact |
| `made_contact` | Joke success at deep_space_anomaly | TBD | 🟡 Dangling | Something answered. Nobody knows what yet. Should resurface. |
| `angered_anomaly` | Joke failure at deep_space_anomaly | TBD | 🟡 Dangling | Something answered badly. Should create a recurring threat tag. |
| `made_peaceful_contact` | Hidden choice D at deep_space_anomaly | TBD | 🟡 Dangling | Diplomatic success — should unlock a late-game alliance payoff |

### Item Tags (granted by item acquisition)

| Tag | Granted By | Consumed By | State | Provenance |
|---|---|---|---|---|
| `has_alien_seed_pod` | TBD — no source node written yet | Choice D at deep_space_anomaly | 🔴 Hungry | Key exists for a gate but no path currently leads to acquiring it |
| `has_suspicious_fungus` | Joke success C at fungal_bloom (requires crew_chef) | TBD | 🟡 Dangling | Nobody has a use for this yet. Should be delightful when it pays off. |

---

## Item Registry

Every item in the game. Source, tags, consumable state, intended payoff, current state.

| Item ID | Name | Tags | Consumable | Source Node | Payoff Node | State | Provenance |
|---|---|---|---|---|---|---|---|
| `alien_seed_pod` | Unidentified Seed Pod | biological, alien, seed, unknown | Yes | ❌ No source written | deep_space_anomaly choice D | 🔴 Hungry | Written as the key for a diplomatic gate — needs a node that grants it before the anomaly |
| `suspicious_fungus` | Suspicious Fungus | food, biological, questionable, artisanal | Yes | fungal_bloom joke success | ❌ No payoff written | 🟡 Dangling | Chef + fungus = something ridiculous three nodes later. What is that node? |

---

## Locked Doors & Keys

Every gate that exists, every key that exists, whether they've found each other.

### Locked Doors (gates with `requires`)

| Door ID | Location | Requires Tags | Has Key? | State | Notes |
|---|---|---|---|---|---|
| `choice_d_anomaly` | deep_space_anomaly | `has_alien_seed_pod` + `crew_xenobiologist` | 🔴 Partial | 🔴 Hungry | `crew_xenobiologist` can be selected at setup. `has_alien_seed_pod` has no source yet. |

### Keys (items/tags that unlock things)

| Key ID | Type | Unlocks | State | Notes |
|---|---|---|---|---|
| `has_alien_seed_pod` | Item tag | choice_d_anomaly | 🔴 Hungry | Key written before the lock. Need a node that grants this item. Should appear before the anomaly node. |
| `crew_xenobiologist` | Setup tag | choice_d_anomaly + future gates | 🟡 Dangling | Only partially used. Should unlock more than one gate. |
| `has_suspicious_fungus` | Item tag | ❌ Nothing yet | 🟡 Dangling | Key with no lock. The most interesting kind. What does it open? |

---

## Node & Event Index

One-line summary of every written node and event. Inbound and outbound tags. Status.

### Major Nodes

| Node ID | Title | Accepts (inbound) | Produces (outbound) | Status |
|---|---|---|---|---|
| `deep_space_anomaly` | Something in the Dark | exploration, unknown_signal, deep_space | investigated, cautious, chaotic, diplomatic | 🟡 Schema example — not fully committed |

### Random Events

| Event ID | Title | Disruption Type | Produces Tags | Status |
|---|---|---|---|---|
| `fungal_bloom` | The Bloom | resource_shock | biological_crisis, contamination | 🟡 Schema example — not fully committed |

### Starting Locations

| Location ID | Name | Opening Node | Status |
|---|---|---|---|
| `loc_earth_orbit` | Earth Orbital Station Kepler-9 | `launch_from_kepler` | 🟡 Defined — opening node not yet written |

---

## Dangling Threads

Things that exist but haven't paid off yet. Prioritized by how long they've been waiting.

> *These are not problems. They are invitations.*

| Thread | Age | What It Needs | Suggested Next Step |
|---|---|---|---|
| `has_alien_seed_pod` has no source | New | A node or event that grants this item before the anomaly | Write a derelict station random event where the pod is found — tags: exploration, discovery, alien |
| `has_suspicious_fungus` has no payoff | New | A node that checks for this tag and does something wonderful | A late-game node where crew_chef + suspicious_fungus unlocks a morale event. "The Chef has been experimenting." |
| `made_contact` leads nowhere | New | A node that checks this tag and continues the contact story | First contact node should check for this tag and modify its narration — they were already expecting you |
| `angered_anomaly` leads nowhere | New | A recurring threat that surfaces later | Mid-voyage crisis node should have a variant triggered by this tag — something followed you |
| `made_peaceful_contact` leads nowhere | New | A late-game payoff for the diplomatic path | Destination approach node — an ally appears. Connected to the earlier contact. |
| `loc_earth_orbit` has no opening node | Paused | Write `launch_from_kepler` AFTER Phase 1A engine skeleton | Blocked on engine redesign — see VA_ENGINE_REDESIGN.md §12 |
| Fabricator Surplus items | New (Session 2) | A payoff for cursed misfire outputs | Lunar Outpost trader collects them, will not say why. Phase 2 content. |
| `crew_engineer` improvised repair | New (Session 2) | Written content for the improvised-repair path | `repair_attempt` modal's second option — no parts cost, partial restoration, can fail |

---

## Hungry Gates

Gates that exist but whose keys have no current path leading to them. These will softlock players if not addressed.

| Gate | Location | Missing Key | How to Feed It | Priority |
|---|---|---|---|---|
| `choice_d_anomaly` | deep_space_anomaly | `has_alien_seed_pod` source node | Write a pre-anomaly event that grants the seed pod | 🔴 High — gate already written |

---

## Sparse Areas

Parts of the story with thin coverage. The web is weak here.

| Area | What's Missing | Why It Matters |
|---|---|---|
| Pre-anomaly content | No nodes or events written yet | The seed pod needs to appear here |
| Crew role payoffs | Most crew tags only gate one choice. `crew_engineer` partially addressed (improvised fab repair). | Each role should have 2-3 meaningful moments |
| Item ecosystem | Only 2 items exist | More items = more keys = more possible locks = richer replay |
| Non-crisis events | All current events are negative | Need discovery events, wonder events, comedy events with no downside |
| Zinnia-specific content | crop_zinnia tag gates nothing | Zinnias should have their own mini-arc about morale and beauty in darkness |

---

## Dense Areas

Tags or nodes being overloaded. Spread the load before adding more.

| Area | Issue | Suggested Fix |
|---|---|---|
| `joke / chaotic` tags | Joke option is the only chaotic path | Give non-joke choices occasional chaotic outcomes too |
| `biological_crisis` | Only one event produces this tag | Need 2-3 events that can produce it so the tag feels like a type not a specific event |

---

## Two Moves Ahead

Ideas already sketched, tagged, and connected to existing content. Pick one and we'll draft it.

---

### 💡 Idea 1 — The Derelict Station
**What it is:** A random event in the pre-anomaly stretch. The ship detects an abandoned research station. No life signs. Plants still growing inside somehow.

**Why now:** It's the natural source for `has_alien_seed_pod`. Closes the biggest hungry gate we have.

**Tags it produces:** `visited_derelict`, `has_alien_seed_pod`, `exploration`

**Tags it checks:** `crew_xenobiologist` (unlocks a hidden choice to take biological samples), `crew_botanist` (modifies the plant description — she knows what she's looking at and doesn't like it)

**Connects to:** deep_space_anomaly choice D, any future node that accepts `visited_derelict`

**First line of the log entry:** *"Day 301. The station is called Verdun-9. It is not in any registry. The plants inside are in excellent health, which is the most alarming thing about it."*

**First implementation step:** Write this as a random event with disruption type `path_fork` — finding the station reroutes slightly, costing time but granting the pod.

---

### 💡 Idea 2 — The Zinnia Arc
**What it is:** A three-beat background story running through any run where `crop_zinnia` is selected. The zinnias aren't doing anything useful. The crew slowly becomes emotionally dependent on them. This becomes a liability and a strength.

**Why now:** `crop_zinnia` is the most interesting starting crop with the least payoff. Zinnias are also historically real — Scott Kelly genuinely got attached to his.

**Tags it produces:** `zinnia_bloomed` (beat 1), `crew_loves_zinnias` (beat 2), `zinnia_sacrifice` or `zinnia_saved` (beat 3)

**Tags it checks:** `crop_zinnia` obviously, `crew_botanist` (she is professionally embarrassed by how much she cares), `crew_medic` (documents the measurable morale improvement in her logs)

**Connects to:** Ending modifier — a run with `zinnia_saved` gets a different final paragraph regardless of which ending fires

**First line:** *"Day 88. The zinnia has bloomed. It is orange. It is completely useless. Crew productivity is up 12%."*

**First implementation step:** Write beat 1 as a small random event that fires automatically if `crop_zinnia` is in the player registry. No choices. Just a moment.

---

### 💡 Idea 3 — Something That Followed You
**What it is:** A mid-voyage crisis variant that only appears if the player carries `angered_anomaly`. Whatever answered the tomato distress signal is now closer than it was.

**Why now:** `angered_anomaly` is dangling with nowhere to go. It should feel like a consequence, not a dead end.

**Tags it produces:** `active_pursuit`, `hull_stressed`

**Tags it checks:** `angered_anomaly` (required), `made_peaceful_contact` (excludes — can't have angered and befriended the same entity)

**Connects to:** Mid-voyage crisis node as a scenario replacement — this becomes the crisis if the tag is present

**First line:** *"Day 501. The object on long-range sensors is not a comet. Comets do not adjust course. Dr. Osei has stopped calling it an object."*

**First implementation step:** Write this as a scenario replacement event triggered by `angered_anomaly` — it replaces the standard mid-voyage crisis node entirely.

---

### 💡 Idea 4 — The Chef's Secret Project
**What it is:** A payoff node for `has_suspicious_fungus` + `crew_chef`. Three nodes after acquiring the fungus, if both tags are present, a small event fires. The Chef has been doing something in the galley. It worked.

**Why now:** `has_suspicious_fungus` is the most enjoyably absurd dangling item we have. It deserves a payoff that respects that energy.

**Tags it produces:** `artisanal_space_cheese`, `crew_morale_high`

**Tags it checks:** `has_suspicious_fungus` + `crew_chef` (both required), `crew_medic` (modifies outcome — she ran a full pathogen analysis first, reluctantly)

**Connects to:** Any future node that accepts `artisanal_space_cheese` as a diplomatic or morale item — this could be a key to something we haven't written yet

**First line:** *"Day 447. Chef Reyes has requested that everyone please stop asking what is in the thing. The thing is fine. Morale is at a six-month high."*

**First implementation step:** Write as a small automatic event — no choices, just consequence. The cheese becomes an inventory item.

---

### 💡 Idea 5 — The Surplus Collector
**What it is:** A trader at a Lunar Outpost (or similar dock node) who specifically collects Fabricator Surplus items — the cursed misfire outputs that accumulate when the fab is unhealthy. They pay absurdly well for them. They will not say why. They get twitchy if asked.

**Why now:** `fab_surplus` items will start accumulating the first time a player pushes their fabricator past 60% wear. They need somewhere to go that isn't "junk inventory." The misfire mechanic is funnier if the garbage it produces has a secret buyer.

**Tags it produces:** `met_surplus_collector`, `sold_to_collector` (per transaction)

**Tags it checks:** any `fab_surplus`-tagged item in inventory

**Connects to:** Any future node that wants to be the *reveal* of what the collector is doing with them. Large Phase 3+ hook potential — could be a recurring NPC across all three trails.

**First line:** *"The trader's eyes track the Fabricator Surplus crate before they track any of the crew. They do not ask what it is. They already know."*

**First implementation step:** Write as a dock NPC with a trade list that only shows if the player has any `fab_surplus` items. Payment in gold, above market value. No dialogue tree beyond the transaction in Phase 2 — the mystery is the feature.

---

## Replayability Audit

Honest accounting of how many meaningfully different runs are currently possible.

| Variable | Current Options | Target |
|---|---|---|
| Starting locations | 1 (earth orbit) | 3-5 core, expandable |
| Starting crops | 5 | 5 ✅ |
| Crew combinations | 20 possible trios from 6 roles | ✅ Good |
| Major node variants | 1 written | 15-20 target |
| Random events | 2 written (schema) | 35-40 target |
| Items | 2 defined | 15-20 target |
| Endings | 4 defined | 4 + tag modifiers ✅ |
| Estimated distinct runs possible | ~2 | Target: 50+ meaningfully different |

**Current replayability: Very low.** This is expected — we are at day one of the content sprint. The architecture supports infinite expansion. The content just needs to be written.

---

## UI Surface Tiers

Three tiers. See `VA_ENGINE_REDESIGN.md` §2 for full spec.

| Tier | When | Behavior |
|---|---|---|
| **Glance** | Ambient awareness, value in status strip | No interaction |
| **Tooltip** | 1–3 lines of fact, no decisions | Hover / long-press. Ephemeral. Game keeps running. |
| **Modal** | Decisions or deep inspection | Click. Pauses game, dims background, owns input. |

Rule: if it fits in three lines with no button, it's a tooltip. If it needs a button, it's a modal. If it's just a number you read in passing, it's glance only.

---

## Scene Template Registry

Ten scene templates. Four implemented in Phase 1A, six reserved with stub fallbacks. See `VA_ENGINE_REDESIGN.md` §3.

| # | Template | Purpose | Phase 1A? |
|---|---|---|---|
| 1 | `cruise` | Default state between nodes. Animated ship, parallax stars, thruster FX scaled to speed. | ✅ |
| 2 | `chart` | Slay-the-Spire-style branching map. Pulled up from cruise. | ✅ |
| 3 | `scripted_waypoint` | Baked-in story nodes. Hosts `launch_from_kepler`, Derelict, anomaly. | ✅ |
| 4 | `mine` | Drill-targeting timing minigame at asteroids/derelicts. | ✅ |
| 5 | `hunt` | Whack-a-mole food gathering. | 🔲 Stub |
| 6 | `dock` | Outpost/trader. Inventory-forward right column. | 🔲 Stub |
| 7 | `hazard_crossing` | Geographic hazard with structured multi-option choice. | 🔲 Stub |
| 8 | `shipboard_event` | Lightweight cruise interrupt. Tight interior shot. | 🔲 Stub |
| 9 | `loadout` | Pre-launch crew + crop selection. | 🔲 Stub |
| 10 | `ending` | Mission end. Stats, modifiers, final narration. | 🔲 Stub |

---

## Action Stakes Axis

Every minigame / action template falls onto one of two stakes registers. This is a design discipline, not a code flag — it shapes failure modes, time pressure, and how the encounter triggers.

| Register | Who initiates | Worst case | Examples |
|---|---|---|---|
| **Chosen-relaxed** | Player (verb / scene choice) | Opportunity cost — empty hold, no haul | `mine`, `hunt`, `forage`, `salvage`, `dock` (browse), `scan` |
| **Forced-tense** | World (event / hazard / hostile contact) | Ship damage, crew injury, lost time | combat, hull breach, solar brace, ramming, `hazard_crossing`, nebula threading |

**Why this matters.** A chosen action that the player walks into voluntarily should not be able to *damage* them — at worst the player walks away empty-handed and slightly out of energy/time. Putting damage stakes on chosen actions creates a "punished for engaging" loop that grinds against the game's invitation-to-explore tone. Forced actions are the opposite — the world is happening *at* the player, and damage is the stakes that make brace/breach/combat read as actually dangerous rather than chore-y.

**Apply this when designing a new minigame:** decide which register it lives in *first*, before authoring mechanics. Cross-register designs ("you chose this AND it can hurt you") need a deliberate justification — usually they're better split into two templates (a chosen-relaxed gather + a forced-tense reaction event the gather can spawn).

---

## Modal Template Registry

See `VA_ENGINE_REDESIGN.md` §4. Modals are paused overlays — cheap to add.

| Modal | Purpose | Phase 1A? |
|---|---|---|
| `part_request` | **Keystone.** "You need X." Dynamic resolution list. | ✅ |
| `inventory` | Browse carried items/materials. Read-only. | ✅ |
| `crew_detail` | Full info on one crew member. | ✅ |
| `ship_detail` | Full info on one ship subsystem. | 🔲 |
| `repair_attempt` | Three repair paths (inventory / improvised / dock). | 🔲 |
| `trade_confirm` | Mixed-payment trade confirmation. | 🔲 |
| `chart_node_detail` | Node info before travel. | 🔲 |

The `part_request` modal is the keystone. Every "you need X" moment in the game inherits its shape: Use from inventory / Fabricate (with wear + misfire chance shown) / Trade (if nearby) / Decline.

---

## Materials & Economy

Gold is the unit of account (value = 1). Every material has a gold-denominated trade value. Mixed payment: any transaction can be paid in any combination of gold + materials totaling the price.

Three paths to any item: **buy** at a dock, **mine-and-fabricate**, or **barter**. Player picks based on what they have, what's nearby, and whether the fabricator is functional.

Phase 1A materials (starter set, grows in Phase 2):

| ID | Name | Value | Sources |
|---|---|---|---|
| `gold` | Gold | 1.0 | Mining, trade, misc |
| `iron` | Iron | 0.2 | Mining (common) |
| `scrap` | Scrap | 0.1 | Mining, salvage |
| `exotic` | Exotic Element | 3.0 | Mining (rare) |

---

## Recipe Registry

Phase 1A ships with one recipe. The recipe book grows in Phase 2.

| Recipe ID | Output | Inputs | Wear Cost |
|---|---|---|---|
| `hull_patch` | Hull Patch ×1 | 3 iron, 2 scrap | 1% |

---

## Fabricator

Invisible infrastructure with a visible vital sign. Glance (LED on cruise status strip) + tooltip (health %, misfire chance, avg wear). No dedicated screen.

**State:** `health` 0–100 (starts 100), `state` "functional" | "broken"

**Wear per use:** deterministic, declared per recipe. Player can predict it.

**Misfire curve** (nonlinear — most danger in bottom third):

| Health | Misfire % |
|---|---|
| 100 | 0 |
| 80 | 2 |
| 60 | 8 |
| 40 | 18 |
| 20 | 35 |
| 10 | 55 |
| 0 | 80 |

**Misfire outcomes:** ~85% consume materials for nothing. ~15% produce a **Fabricator Surplus** item (almost-right-but-useless, tagged `fab_surplus`, dangling for Phase 2 payoff). Below 20% health, misfires can **break** the fabricator entirely.

**Repair paths** (`repair_attempt` modal):
1. **From inventory** — parts cost, full restoration, safe
2. **Improvised** — requires `crew_engineer`, no parts cost, partial restoration, can fail
3. **At a dock** — gold cost, full restoration, outpost only

**LED color:** bright green (100) → yellow-green (80) → amber (60) → orange (40) → red (20) → dark red pulsing (<10).

---

## Resolved Threads

Nothing resolved yet. This section fills as content is completed and threads close.

---

## Provenance Archive

A permanent record of why things were created, even after they're resolved. So we never wonder "why does this exist" six months from now.

| ID | Created | Reason | Status |
|---|---|---|---|
| `alien_seed_pod` | Session 1 | Needed a physical key for the xenobiologist diplomatic gate at the anomaly node. Wanted something biological and mysterious that fit the space agriculture theme. | 🔴 Hungry — source not written |
| `suspicious_fungus` | Session 1 | Joke payoff for having a Chef crew member during a fungal crisis. Wanted an item that felt absurd but could become genuinely useful later. | 🟡 Dangling — payoff not written |
| `deep_space_anomaly` | Session 1 | Schema example node. Designed to demonstrate the full tag and gate system. Set in the growbay during a sensor reading. | 🟡 Not yet committed to game |
| `fungal_bloom` | Session 1 | Schema example event. Demonstrates resource_shock disruption type. Based on real ISS microbial contamination research. | 🟡 Not yet committed to game |
| `loc_earth_orbit` | Session 1 | First starting location. Familiar anchor point for players. Opening node not yet written. | 🟡 Defined, not yet playable |

---

## Session Log

A brief record of what was decided or written each session. Keeps the creative trail visible.

| Session | Date | What Happened | Open Items Left |
|---|---|---|---|
| 1 | — | Full design plan written. Schema examples created. Bible initialized. Two Moves Ahead populated with 4 ideas. | Everything — content sprint not yet started |
| 2 | — | **Major pivot.** Single-viewport metaphor retired based on SSL postmortem. `VA_ENGINE_REDESIGN.md` drafted and approved: 10 scene templates, 7 modals, UI surface tiers (glance/tooltip/modal), economy primitives (gold-as-unit + mixed payment), fabricator with wear/misfire/repair, 10-beat skeleton playthrough. `launch_from_kepler` parked until Phase 1A engine skeleton is built. Bible updated per §11 of redesign doc. Two new dangling threads logged (Fabricator Surplus, crew_engineer improvised repair). One new Two Moves Ahead idea added (The Surplus Collector). | Engine skeleton build; then `launch_from_kepler` draft |

---

*The next thing to build is the **Phase 1A engine skeleton** per `VA_ENGINE_REDESIGN.md` §12.*
*After that: `launch_from_kepler` gets drafted as real content against the new foundation.*
*After that: the other nine skeleton beats, then Phase 1B (walking skeleton plays end-to-end), then Phase 2 flesh-out starting with the Derelict Station expansion.*

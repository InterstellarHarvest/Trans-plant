# NPC SYSTEM — UPDATE PACKAGE

> Hand-off document for Claude Code.
> Adds the NPC (non-player character) system to Trans-plant: sprite pool, voice composition, and node-level species bias.
> Additive only. No existing systems change.

---

## What This Update Does

Adds four things:

1. **Three new sub-sections to `GAME_BIBLE.md` Section 11 (Event System)** — NPC Sprite Pool, Station Region Bias, NPC Voice Composition, NPC Flavor Pool File Location.
2. **Three new tag dimensions in `GAME_BIBLE.md` Section 4** — `4.26 npc_disposition`, `4.27 npc_species`, `4.28 npc_station_job`.
3. **Matching entries in `GAME_BIBLE.md` Section 22 (JSON Registry)**.
4. **Two small edits to `CLAUDE_file.md`** — tag count 25 → 28, append three new tag names to the quick-reference list.

Version bump: bible 0.4 → 0.5, CLAUDE.md 0.4 → 0.5.

---

## APPLY IN THIS ORDER

### STEP 1 — Insert into `GAME_BIBLE.md` between line 1005 and line 1007

(After the `---` that ends "Consequence Events" in Section 11, before `## 12. Micro-Minigames`.)

Paste everything between the `<<<BEGIN BIBLE SECTION 11 INSERT>>>` and `<<<END BIBLE SECTION 11 INSERT>>>` markers.

```markdown
<<<BEGIN BIBLE SECTION 11 INSERT>>>

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

Each numbered character folder holds:
- `portrait.png` — mouth-closed head-and-shoulders. **Required** for the folder to be picked by the resolver.
- `talk.png` — mouth-open frame. **Optional**; absence means static portrait (no talk animation).

**Talk animation.** When an NPC line is rendering (typewriter in progress), if `talk.png` exists the engine swaps between the two frames at ~150ms per frame for the duration of the typewriter. When the line finishes, it settles on `portrait.png`.

**Adding art is drag-and-drop.** Drop a new folder in, it's in rotation next run. No registry update, no JSON edit. The presence of `portrait.png` is the registration.

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
3. For `station_crew` with `job`, glob into `station_crew/{job}/{species}/*/`. Without `job`, glob across all jobs (generic station encounter — event doesn't care who shows up).
4. Uniform random pick from the resulting leaf-folder list. Only folders containing `portrait.png` are eligible.
5. Load `portrait.png` via the **same three-tier fallback pattern as the crew system** — see `demo-crew.html`'s `tryImg()` chain (`portrait.png` → fallback asset → emoji fallback). Use the existing `.has-sprite` inline `background-image` pattern. **Do not invent a new loading pattern.**

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
1. First pass: fill all 43 disposition slots with 4 neutral-voice lines each (≈172 lines total).
2. Second pass: fill the 7 species quirk pools with 3–5 quirks each (≈30 lines total).
3. Third pass: test-render a few combinations, tune tic position rules if needed.

---

### Interaction with Existing Systems

- **Existing events are unaffected.** Events without an `npc` field render exactly as before. The current sample events (Hull Breach, The Planet Looks Fine, Pirate Hail) all continue working with no changes required. Authors can migrate them to the NPC system opportunistically.
- **Crew system (Section 7) is unrelated.** Player crew are named individuals with skills, defined in `crew_roster.json`. NPCs are anonymous pool draws. No overlap, no shared data structures.
- **AI companion (Section 6) still speaks over NPC dialogue.** The `ai_flavor` field on events (ARIA / MARV / REX / CHIP) fires alongside any NPC lines, via the AI Log Panel. The player sees the NPC's line in the event body and the AI companion's reaction in the log, simultaneously — same as today.
- **No faction reputation.** The deprecated `faction_reputation_effect` tag (v0.4) does **not** return through this system. Species is atmospheric and gating only; there is no hidden standing counter per species.

<<<END BIBLE SECTION 11 INSERT>>>
```

---

### STEP 2 — Insert into `GAME_BIBLE.md` after line 477 (after `### 4.25 severity`)

Paste between the markers.

```markdown
<<<BEGIN BIBLE SECTION 4 TAG ADDITIONS>>>

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

<<<END BIBLE SECTION 4 TAG ADDITIONS>>>
```

---

### STEP 3 — Insert into `GAME_BIBLE.md` Section 22 JSON registry

Locate the JSON object that ends with the `severity` block (last existing entry in the registry JSON). Add a comma after its closing brace if not present, then paste the three new entries between the markers.

```json
<<<BEGIN BIBLE SECTION 22 JSON ADDITIONS>>>

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
  }

<<<END BIBLE SECTION 22 JSON ADDITIONS>>>
```

---

### STEP 4 — Update `GAME_BIBLE.md` footer

Find the footer line:

```
*Bible version: 0.4 — Time displayed as date, effort system numeric, severity tag added, faction reputation removed, ship upgrades formalized as items.*
```

Replace with:

```
*Bible version: 0.5 — NPC system added (sprite pool, voice composition, station region bias, three new tags npc_disposition/npc_species/npc_station_job).*
```

---

### STEP 5 — Update `CLAUDE_file.md`

**Edit 1** — line 516. Find:

```
All 25 tag dimensions registered in `registry/tag_registry.json`:
```

Replace with:

```
All 28 tag dimensions registered in `registry/tag_registry.json`:
```

**Edit 2** — the tag quick-reference list immediately below that line. Find the line ending with `` `severity` `` and append three new tag names. Final list should read:

```
`difficulty` · `tone` · `node_type` · `trigger` · `branch_flavor` · `requires_crew` · `requires_item` · `requires_ai` · `requires_ship` · `minigame_type` · `minigame_end_condition` · `minigame_trigger` · `microgame_type` · `microgame_difficulty_modifier` · `event_presentation` · `failure_type` · `ending_score` · `effort_cost` · `requires_effort_from` · `scene_type` · `item_behavior` · `item_source` · `item_location_condition` · `crew_display_state` · `severity` · `npc_disposition` · `npc_species` · `npc_station_job`
```

**Edit 3** — footer line. Find:

```
*CLAUDE.md version: 0.4 — matches GAME_BIBLE.md version 0.4*
```

Replace with:

```
*CLAUDE.md version: 0.5 — matches GAME_BIBLE.md version 0.5*
```

---

## Validation Checklist (for CC after applying)

- [ ] `GAME_BIBLE.md` Section 11 now contains NPC System / NPC Sprite Pool / Wildcards / Resolver Contract / NPC Field on Event Modules / Station Region Bias / NPC Voice Composition / NPC Flavor Pool File Location / Interaction with Existing Systems.
- [ ] `GAME_BIBLE.md` Section 4 now ends at 4.28.
- [ ] `GAME_BIBLE.md` Section 22 JSON parses valid and contains three new keys: `npc_disposition`, `npc_species`, `npc_station_job`.
- [ ] `CLAUDE_file.md` tag-count line says 28.
- [ ] `CLAUDE_file.md` quick-reference list contains all three new tag names, comma-separator style consistent with existing.
- [ ] Both version footers bumped to 0.5.
- [ ] `registry/tag_registry.json` (if it exists) matches Section 22 JSON — if the registry file is already populated from a previous generation, add the three new top-level keys there too with the same structure.
- [ ] No existing modules were modified. This update is additive only.

---

## Out of Scope for This Update (Deliberately Deferred)

The following are related but not part of this update; flagging so they're not forgotten:

- **Name drift cleanup.** `GAME_BIBLE.md` line 1924 and `CLAUDE_file.md` line 28 still reference `starbound-trail/` in the project-structure tree. Should be `trans-plant/`. Separate commit, not tied to NPC work.
- **Content fill.** The 43 disposition-line pools and 7 species quirk pools are defined structurally here but contain no actual lines. Phase 1 content session fills them.
- **Grammar transform implementation.** The seven grammar transform functions (`standard`, `clipped`, `dropped_articles`, `flowing`, `sibilant`, `formal_expanded`, `inconsistent`) are described by behavior in the bible but not coded. That's Phase 2 engine work.
- **First NPC art.** Sprite folders are schema'd but unpopulated. First sprites can go in any disposition/species combo; the system tolerates any population level.
- **Migration of existing sample events.** The Pirate Hail sample event in Section 11 could be rewritten to use the NPC system as a reference example. Optional, not required — existing form still works.

*End of update package.*

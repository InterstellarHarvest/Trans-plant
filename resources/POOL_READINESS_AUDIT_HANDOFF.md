# POOL READINESS AUDIT — HANDOFF

> **Date:** 2026-07-01
> **Audited:** root `index.html` (canonical engine, May 21 build), `modules/*`, `registry/tag_registry.json`, `resources/shared.js`, integration-bound demos (encounter, combat, cruise, growbay, mining, minigames). Content-scan pass on all other demos.
> **Method:** static analysis + cross-reference sweep + **live Playwright run of the full engine loop** (served via `python3 -m http.server`, headless Chromium, console/404 capture). Two bugs below are live-verified, not just code-read.
> **Status:** AUDIT ONLY — no code or module files were changed.

---

## Verdict in one line

The **data layer is scale-ready** (consistent schemas, clean cross-references, Bible-matching pool skeletons) — but the **engine has no pool-selection layer at all yet**, plus 2 live-verified bugs and a set of authoring-safety gaps that will bite once 100+ entries land.

---

## A. STRUCTURAL BLOCKERS

These require code changes — adding JSON entries alone will not land the content, or will actively break.

### A1. No pool-draw layer exists (THE gating item)

Every node in `modules/locations/lunar_test_path.json` hardcodes an `event_id`; the engine builds `EVENTS` as a flat id→event lookup (`index.html:538`) and resolves nodes linearly. There is **no** difficulty weighting, trigger filtering, pity counter, no-repeat/shuffle-without-replacement, or random draw anywhere in the engine, shared.js, or demos (grep-verified).

- `MOD.flavor` (flavor_pools.json) is fetched at boot and **never read again**.
- `map_rules.json` `node_weights` / `event_difficulty_weights` are never consumed (only `starting_resources` + `base_days` are).

**Consequence:** new events and flavor lines are dead content until a selection layer exists.
**Fix:** build `selectEvent(nodeType, trigger, difficultyWeights, seenSet)` replacing the direct lookup at `travelTo()`, plus a generic `drawFromPool(pool, seenSet)` flavor helper with exhaustion handling (reset seen-set when pool is spent). The data side (difficulty/node_type/trigger tags on all 20 events, weights in map_rules) is already complete and correct — this is engine work only.

### A2. LIVE-VERIFIED BUG — `item_grant` arrays break material loot

`resolveChoice()` at `index.html:945`:
```js
if (o.item_grant)   STATE.items.push(o.item_grant);
```
8+ live events grant **arrays** — `events_asteroid_001/002`, `events_derelict_001/002`, `events_anomaly_002` (e.g. `"item_grant": ["minerals", "minerals", "iron"]`). The whole array is pushed as one nested element.

**Live repro:** granting `['minerals','iron']` then checking `lockReason({requires_item:'minerals'})` returns `"Needs minerals"` — the gate stays locked on loot the player just earned.
**Fix:** `Array.isArray(o.item_grant) ? STATE.items.push(...o.item_grant) : STATE.items.push(o.item_grant)`.
**Related decision:** `minerals`/`scrap`/`iron`/`exotic` aren't items.json entries at all. `modules/materials/materials.json` exists but is **not in MODULE_PATHS**. Decide the items-vs-materials split (separate `STATE.materials`?) before authoring more loot events.

### A3. LIVE-VERIFIED BUG — map always renders while hidden

Every `renderMap()` call fires while `#screen-map` is `display:none`:
- Boot order (`index.html:1106-1112`): `renderMap()` runs before `showScreen('screen-map')`.
- Post-event paths (`index.html:821`, `index.html:1016`): map is rendered while the encounter screen is still active.

`nodePositions()` (`index.html:660`) reads `vp.clientWidth/clientHeight`, which are **0** for a hidden element → all 9 nodes stack at x≈30px→-30px, y=0, and the SVG gets `viewBox="0 0 0 0"` (no connection lines).

**Live-verified:** headless boot shows all nodes squashed in the top-left corner; state persists after event resolution.
**Fix:** call `showScreen('screen-map')` *before* `renderMap()`, or derive layout from fixed design coordinates (960×640 is constant), or re-render on screen activation.

**Related design gap:** on a linear path, `advanceAfterEvent()` (`index.html:1001`) chains straight into the next node's event via `travelTo()` — the player never returns to the map between nodes, and the map DOM stays stale from boot. Decide whether map-as-hub-between-nodes is the intended loop (the footer's Advance button implies yes) or events should chain (current behavior).

### A4. Encounter content schema gap (biggest migration blocker)

`demo-encounter.html` `SCENARIOS` (~line 1358; 20+ scenario types, ~80 authored bodies/lines/choices) uses a far richer schema than the event JSON + engine renderer support: layered states, `body:`/`line:` narrator-vs-speech split, `commMode`, `bg`/`bgBase`/`bgSprite` triples, effort pips, `leaveLabel`, NPC casting. `demo-combat.html` carries a **forked copy** of SCENARIOS (~line 1870) — two inline copies already drifting.

**Consequence:** this content can't migrate into `modules/events/*.json` without first extending the event schema + the engine's encounter renderer. Authoring it into the current flat schema would lose the structure the demos already prove out.
**Design gate to resolve first:** monolithic `events_encounter.json` scenarios module vs splitting across the existing per-node-type event files.

### A5. Variant system unimplemented

`enterEvent()` (`index.html:840-842`) coerces `standard_variants[0]` and ignores `stowaway_variant` entirely (only `event_shipboard_001` uses this today). Authoring more variants in this pattern = dead content until variant selection + the stowaway RNG are wired.

### A6. First-match `.find()` for endings and failures

- `checkFailure()` → `MOD.failures.find(f => f.failure_type === type)` (`index.html:1037`)
- `triggerArrival()` → `MOD.endings.find(e => e.id === id) || .find(e => e.test_path === true) || [0]` (`index.html:1045-1048`)

Multiple variants per failure_type or ending bracket can **never fire** — only the first in file order. No tone-subset selection (Bible §17 expects pools).
**Fix:** filter matching candidates, then random-draw. Only a blocker if >1 variant per type is planned (the Bible says yes).

### A7. combat_log slot mismatch

`flavor_pools.json` already has a `combat_log` skeleton — **16 slots × 5 AIs, all empty**. `demo-combat.html` `PLACEHOLDER_COMBAT_LINES` (~line 4848) holds ~105 authored lines across **~17–21 slots**. Slot names/counts don't line up.
**Fix:** reconcile the slot list (demo is the richer, battle-tested set) BEFORE migrating, or lines will land in slots nothing reads / slots the demo reads will stay empty.

### A8. Missing softlock guards (authoring safety at scale)

Three failure modes that are statistically guaranteed once 100+ events are authored:

1. **All-choices-locked event:** `renderChoices()` (`index.html:871`) only appends a Continue fallback when `choices.length === 0` — an event whose every choice is gate-locked (crew/item/flag) renders zero clickable buttons → run softlocks. **Fix:** if no unlocked choice remains, append the Continue/Leave fallback.
2. **Fork events must set `chose_alpha`/`chose_beta` on EVERY choice**, or `advanceAfterEvent()` finds no available nodes and the map dead-ends at "End of line". Currently an undocumented authoring invariant.
3. **Duplicate event ids across files silently overwrite** in the `EVENTS` build (`index.html:538`, last file wins). **Fix:** one-line collision warning in the loader.

**Recommended:** a small validation lint script (node, run pre-commit or on demand) covering: duplicate ids, fork flag coverage, dangling `requires_flag`, unknown `requires_item`/`requires_crew` values, array-vs-string `item_grant`, and tag-registry membership. This converts all three into caught-at-author-time errors.

### A9. Trigger/crisis layer absent

- `events_crisis.json` (low_fuel/low_food/low_o2/low_hull/low_morale) **can never fire** — no trigger evaluation exists.
- Food/water/o2 hitting 0 currently has **no consequence at all** (`checkFailure()` only checks fuel/hull/morale/crew).
- `failure_time_expired_001` and `failure_crop_dead_001` exist in failures.json but nothing triggers them (daysElapsed/baseDays are tracked but unchecked).
- Event-level `once` / `requires_flag` / `sets_flag` are ignored (only choice-level gates and outcome-level flags are handled).
- Effort math is stubbed: flat `time_cost` tier→days constants; `effort_required`/`effort_contribution` unimplemented (acknowledged in-code).

Author crisis/consequence content freely — the JSON is correctly shaped — but know it's inert until this layer lands.

---

## B. QUICK WINS

Safe anytime; no design decisions required.

1. **Tag registry fully stale.** Every value in `registry/tag_registry.json` is still `"status": "empty"` despite difficulty/tone/node_type/trigger being used across all 20 events. Do a sync pass — or better, have the lint script from A8 derive statuses automatically so this never drifts again.
2. **Item ID convention.** Events + `STATE.items` use short ids (`soil_sampler`); items.json uses `item_soil_sampler_001`. The engine never joins against `MOD.items` (loaded, filtered for `_section`, then unused), so it silently works on string matching. **Recommendation:** standardize on short ids — it's what every gate already uses — and add a short-id field or rename in items.json so item data becomes joinable.
3. **Pure content migrations (no code change needed):**
   - `demo-cruise.html` `AI_COMMENTARY` (~L1767) → `ai_universal.cruise_ambient` **already exists and is populated (~3/AI)** — merge the inline lines in, delete the inline copy.
   - `AI_FALLBACK` — duplicated **identically** in `demo-encounter.html` (~L1232) and `demo-combat.html` (~L1792) → new flavor slot (e.g. `ai_universal.encounter_fallback`).
   - `demo-crew.html` `EPITAPHS` (~L1961, 7 lines) **diverges** from flavor_pools `crew_epitaphs` (12 lines, different text) → merge keepers or mark demo copy stale.
   - `demo-growbay.html` `CROP_META` (~L1603) vs `modules/crops/crops.json` — both define crop metadata with different field structures. Drift audit + pick the single source of truth (crops.json per bible).
   - `demo-growbay.html` `CREW` tender bonuses (~L1716) → belong in `crew_roster.json`.
   - Optional: growbay `MONITORED_THREATS` (~L1800, 7 names) → pool if threats become player-facing copy.
4. **Loader duplicate-id warning** — one line in the `EVENTS` build loop (`index.html:538`).
5. **`shared.js` `wireCustomScroll`** — the MutationObserver/ResizeObserver per host are never disconnected. Harmless in single-mount demos; will accumulate when demos consolidate into one engine shell with mount/unmount cycles. Return a cleanup handle. (Minor: PauseMenu's document keydown could use remove-before-add for refactor safety.)
6. **`engine/index.html` is dead code** — Apr 13 build superseded by root `index.html` (May 21). Archive or delete to avoid future-session confusion about which engine is real.
7. **Unloaded modules note:** `captains.json`, `crops.json`, `materials.json`, `recipes.json` exist under modules/ but are not in `MODULE_PATHS` — fine today, remember when wiring setup/growbay/fabricator into the engine.
8. **Underpopulated pools for the content pass:** `ai_universal.resource_warning` + `crop_lifecycle` sit at ~2 lines per slot (target 4–6); `npc_disposition_lines` — all 43 slots empty; `npc_species_coloring` quirks — all empty; `combat_log` — empty (populate after A7 slot reconcile).

---

## C. GREEN LIGHT — verified solid, safe to scale now

- **Event schema is consistent 19/20** — only `event_shipboard_001` diverges (variant pattern, and the engine's coercion handles it without breaking). Adding 100+ events per file is schema-safe: same flat shape everywhere, `ai_flavor` 5-AI block (aria/marv/rex/chip/ajoy) consistent across every event.
- **flavor_pools.json structure matches the Bible spec exactly** — 43 NPC disposition slots, 7 species colorings, combat_log skeleton. Populating names/epitaphs/ambient/AI pools is pure JSON-add.
- **Cross-reference integrity is clean:** every lunar_test_path `event_id` resolves; every `requires_crew` role exists in crew_roster (incl. botanist, xenobiologist); zero dangling `requires_flag`.
- **Live boot verified:** all 19 modules fetch + parse with zero console errors and zero 404s; the loader fails loudly by design (good).
- **Perf/leak health is good:** integration demos' rAF loops cancel properly and honor PauseBus; listeners are cleaned up; no per-frame allocations found; the engine itself is leak-free (no rAF, listeners die with innerHTML rebuilds). 19 parallel fetches (~160KB total) and full-innerHTML HUD/map rebuilds are fine at this scale — revisit only if real-time resource ticking or 50+ node maps arrive.
- **failures.json covers all four engine-wired failure types** (no_fuel, hull_zero, mutiny, crew_gone).

---

## Suggested sequencing for the content push

1. Fix A2 (item_grant spread) + A3 (map render order) + A8a (locked-choice guard) — three small engine patches, unblocks safe authoring.
2. Reconcile A7 combat_log slots + do the B3 pure migrations — clears all inline/JSON duplication so pools are the single source of truth.
3. Build the A8 lint script + sync the tag registry (B1) — authoring safety net in place.
4. **Then** populate at scale (events + the 43 NPC slots + combat_log + quirks + AI pool expansion).
5. Build the A1 selection layer (+ A6 random draw for endings/failures) — content goes live.
6. A4 encounter schema extension + A9 trigger layer as their own engine passes.

## Re-running the live checks

```bash
cd Trans-plant && python3 -m http.server 8177 &
# then Playwright (nvm v20 path recipe — see reference_playwright memory):
# goto http://localhost:8177/index.html, watch console/pageerror/requestfailed,
# inspect .map-node style.left values (all ~30px→-30px = A3 still broken),
# page.evaluate resolveChoice({outcome:{item_grant:['a','b']}}) → nested array = A2 still broken.
```

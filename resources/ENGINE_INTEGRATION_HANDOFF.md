# ENGINE INTEGRATION — HANDOFF

> **Date:** 2026-07-01 (session started same day as POOL_READINESS_AUDIT_HANDOFF.md; Cruise Resume-wiring + Phase 4 landed same day, follow-up sessions; Phases 5, 6, and 7 each landed as further follow-up sessions same day)
> **Status: ALL 7 PHASES DONE AND PLAYWRIGHT-VERIFIED.** The demo-to-engine integration effort described in `/Users/MrDashiki/.claude/plans/vast-sprouting-codd.md` is complete — title→setup→cruise→travel→events→combat→endings all work end-to-end on all 3 trails, confirmed via full scripted playthroughs (see Phase 7 below), not just per-system unit tests.
> **Plan of record:** `/Users/MrDashiki/.claude/plans/vast-sprouting-codd.md` — read this first for full phase-by-phase detail, architectural decisions, and the two user-confirmed design forks (new `events_encounter.json` file; weighted/soft crisis-trigger priority).
> **Do not restart from scratch.** Root `index.html` is now a real, working, multi-screen engine — verify current behavior with Playwright before changing anything.
> **What's next is content, not engine work.** The remaining gaps below (§ "What's NOT wired yet") are almost entirely thin/placeholder *content* (flavor pools, event count, NPC art) rather than missing *systems* — every mechanical system the Bible describes is now wired and reachable. A good next session's framing: "flesh out the random pools" (more events per node type/trigger, more flavor lines, more endings) rather than "build system X."

---

## What this session actually built (verified, not just planned)

### Phase 0 — Scaffolding
- Archived dead `engine/index.html` → `engine/index.html.deprecated` (April build, superseded).
- Root `index.html` now loads `resources/shared.css` + `resources/shared.js`.
- Added a **symlink**: `Trans-plant/sprites -> resources/sprites`. **Do not delete this.** `shared.js` and every migrated demo hardcode `sprites/...` paths relative to `resources/`; the symlink lets those resolve correctly now that root `index.html` (one directory up) also loads them. Any future demo migration needs this — don't rewrite paths to `resources/sprites/...` instead, the symlink already handles it.
- New screen containers: `screen-title`, `screen-setup`, `screen-cruise`. New overlay containers (siblings of screens, `.overlay` class, shown via `showOverlay(id)`/`hideOverlay(id)`, NOT via `showScreen()`): `overlay-map`, `overlay-stopmenu` (unused so far), `overlay-market`, `overlay-mining`, `overlay-growbay`, `overlay-fabricator`, `overlay-minigames`.
- Fixed a **latent CSS bug**: `#screen-loading { display: flex }` had no `.active` gate, so it always beat `.screen { display: none }` on specificity. Only became visible once a screen was inserted between loading and map in DOM order. Fixed by removing the unconditional `display` from the base rule.

### Phase 1 — Title + Setup
- `resources/screen-title.css` + `engine/js/screens/title.js`: migrated `demo-title.html`, minus its dev-controls panel and viewport-scaling harness (values baked in as constants). `btn-new` → `startNewGame()` → `showScreen('screen-setup')`.
- `resources/screen-setup.css` + `engine/js/screens/setup.js`: migrated `demo-setup.html`'s 6-step wizard (trail/AI/captain/crew/crop/ship-name) verbatim, same simplification. Final step's Launch button calls `applySetupToState(sel)` (in `index.html`'s main script) instead of the old `alert(...)`.
- `applySetupToState(sel)`: populates real `STATE` (trail/mapName/destination/baseDays/resources from `map_rules.json`, activeAI/captain/crew/crop/shipName from the wizard), then calls `generateMap()` (Phase 2) and `renderCruise()`/`renderHUD()` (Phase 2), then `showScreen('screen-cruise')`.
- `?debug=fixed_path` query param preserved: boots straight into the old hardcoded `lunar_test_path.json` + `screen-map`/`screen-encounter` loop, bypassing title/setup. **This is the fastest way to test encounter/combat/event content without clicking through the wizard every time** — use it.

### Phase 2 — Map generation + Cruise hub
- `engine/js/map.js`: `generateMap(trailKey)` ports `demo-map.html`'s weighted spine/fork generation algorithm into the engine's own node shape (`{id, name, description, node_type, position, connects_to, event_id}` — matches what `travelTo()`/`renderMap()` already expected). **Stress-tested 150 generated maps (50/trail), zero placement-rule violations.**
  - Found and fixed a real bug: the guaranteed-final-station node could collide with a randomly-picked station right before it (violates no-repeat-node-type). Fixed via a `nextForced` exclusion param in `pickSpineType()`.
  - `modules/maps/map_rules.json` got an **additive** extension: `node_weights_start` + `branch_len_min`/`branch_len_max` per trail (the pre-existing `node_weights` is now treated as the end-of-spine table, interpolated from `node_weights_start`). Nothing pre-existing was removed or renamed.
- `renderMap()`/`nodePositions()` in `index.html` were **refactored to accept an `ids` config** (default = legacy `screen-map` ids) instead of hardcoding element ids. This let a new `renderMapOverlay()` reuse the exact same renderer for `overlay-map` (the read-only "MAP" button view from Cruise) — no second parallel map-rendering system was built, deliberately, since one already existed and worked.
  - **Gotcha already hit once and fixed**: overlay must be shown via `showOverlay()` BEFORE calling `renderMapOverlay()`/`renderMap()`, because `nodePositions()` reads `clientWidth`/`clientHeight` which are 0 on a hidden (`display:none`) element. Same class of bug as the original Phase-0 map-render bug — will bite again if any future code calls a render function before making its container visible. **Watch for this pattern everywhere.**
- `resources/screen-cruise.css` + `engine/js/screens/cruise.js`: migrated `demo-cruise.html` as the **default post-setup hub screen** (not `screen-map` — that's now debug/legacy-only). Real ship name, day counter, all-6-resource HUD (reused the existing `.hud`/`renderHUD()` component from map/encounter screens rather than building a 4th resource-bar variant — `renderHUD()` was extended to also target `#hud-cruise` if present), live crew portraits from `crew_roster.json` + `crewIconCss()`, crop card, fuel/food/water bars.
  - **Deliberate scope cut, not yet backfilled**: demo-cruise.html's dev-controls panel, 3-layer warp-speed starfield, scrolling ticker carousel, forced-event interrupt system, and multi-day wait-timer machinery were NOT ported. Cruise currently has a simple single-layer starfield and a static AI panel. These need real day-tick/encounter wiring that doesn't exist yet anyway (see "What's NOT wired yet" below) — build the fancy version only once that foundation exists, not before.
  - **Stop Menu shell** built and working: region-gated verb list (`REGIONS`/`STOP_VERBS`, region derived from `NODE_TYPE_TO_REGION` mapping off the current node's `node_type`), effort pips, clicking any verb currently pushes an honest `"◆ X isn't wired into the engine yet."` log message — **this is where Phase 4 plugs in real routing.**
  - MAP button → `showOverlay('overlay-map')` then `renderMapOverlay()`. INV button → same honest "not wired" log message (no inventory demo migration was in scope).

### Phase 3 — Event schema + layered encounter renderer (the biggest phase)
- **Schema extended additively** in `index.html`'s `enterEvent()`/`renderEncounterState()`/`renderChoices()`/`lockReason()` — full rewrite of the encounter-rendering block, but the flat schema (19/20 existing events) works completely unchanged (regression-verified via `?debug=fixed_path`). New optional event fields: `layers` (map of `{title, body, line, ai, choices, comm_mode?}`), `entryLayer`, `outcomes` (map of terminal states), `npc: {disposition, species}`, `comm_mode` (registered as tag dimension #33 in `tag_registry.json`: `in_person`/`screen`/`corrupted`). New choice fields: `gate: {crew, item, gold}` (additive alternate to the flat `requires_crew`/`requires_item`/`requires_flag`), navigation `next`/`back`/`outcome`/`scenario` (mutually exclusive).
  - **Key disambiguation**: in the flat schema, `choice.outcome` is an inline object. In the layered schema, `choice.outcome` is a STRING id into `ev.outcomes`. The renderer branches on `ev.layers` presence to know which to expect — see `handleChoiceClick()` vs `resolveChoice()` in `index.html`.
  - Full schema docs + a worked example added to `resources/CLAUDE.md` right after the existing flat "Event Module" section (search for "layered variant").
  - New `enc-dialog` UI element (name + spoken line strip) added to `#screen-encounter` markup/CSS — this is the `layer.line` (character's actual words) rendering slot, separate from `.enc-narrative` (`layer.body`, narrator prose). **No NPC portrait art exists in the repo** (`sprites/npc/` confirmed absent) — the dialog strip is text-only by design until art lands; zero code change will be needed then.
  - NPC text resolver: `resolveNpc(ev)` rolls (and caches per event id, per run, in `STATE.npcCache`) a species from `NPC_SPECIES_POOL`, resolves `{npc.species}`/`{npc.disposition}`/`{npc.quirk}`/`{npc.line.<slot>}` tokens via `interpolateNpcTokens()`. The `{npc.line.<slot>}` token reads from `MOD.flavor.npc_disposition_lines` which is **currently empty** (per the original audit) — falls back to dropping the token cleanly.
- **Pool-draw layer** (`selectEvent(node)` in `index.html`) replaces the flat `node.event_id` lookup in `travelTo()`. Filters `EVENTS` by node_type + active trigger match + `once`/seen + `active:true`; weights by difficulty (`map_rules.json`'s `event_difficulty_weights`, reweighted by the pity counter when `STATE.pityRelief > 0`); crisis-triggered events get a ×15 weight bump (not a hard override — confirmed ~60% pick rate when forced, not 100%, per the user's "weighted priority" decision).
  - `activeTriggers()` computes the 6 threshold triggers (`low_fuel`/`low_food`/`low_water`/`low_o2`/`low_hull`/`low_morale` — **note: 6, not 5**, `low_water` is real and easy to miss) plus position-based `journey_start`/`journey_end` (needed — 2 real authored station events depend on these and would be permanently dead content otherwise).
  - Pity counter (`STATE.hardStreak`/`STATE.pityRelief`) verified directly by forcing an all-hard-tier candidate pool: streak increments 1→2→3, 4th hard pick trips 2-leg relief and resets streak to 0. **Note**: only 1 of 20 real authored events is `difficulty:"hard"` and zero are `"ultra"` — the pity counter will almost never trigger against real content yet; that's a content-sparsity fact, not a bug.
  - `filterThenRandomDraw(pool, predicate)` + `weightedDraw(candidates, weightFn)` are the two reusable draw helpers (closes audit A6). Applied to `checkFailure()` (now also wired to detect `time_expired` via `daysElapsed > baseDays`). **Not yet applied to `triggerArrival()`/endings** — deliberately deferred to Phase 6, since `endings.json` only has 2 entries today (both `ending_score: "any"`), so bracket-filtering has nothing real to test against yet.
- **Bugs fixed**: A2 (`item_grant` array-push bug — one-line fix), A8 remaining sub-items (softlock guard now covers "every choice locked" not just zero-length; duplicate-event-id console warning in the loader; new standalone `tools/lint_modules.js` — run via `node tools/lint_modules.js` from the Trans-plant root, checks duplicate ids, fork `chose_alpha`/`chose_beta` coverage, dangling `requires_flag`, unknown crew/item references against `crew_roster.json`/`items.json`, and tag-registry membership).
  - **The lint script immediately found one real pre-existing content gap, left flagged not fixed**: `event_crisis_001` requires_item `"hull_patch"`, which doesn't exist in `items.json`. This is a content-authoring decision (add the item? rename the reference?), not something to silently invent.
  - Lint script also required a fix of its own: `items.json` uses long-form ids (`item_gas_analyzer_001`) but every event/`STATE.items`/`lockReason()` already use short-form (`gas_analyzer`) per the original audit's B2 finding — the lint script now derives short ids from the long form rather than requiring events match the long form.
- **New content authored**: `modules/events/events_encounter.json` (was created as `[]` early in the phase, now has one full 3-layer pirate scenario — intro/negotiate/haggle, 5 outcomes) as the schema's proof case. Registered in `MODULE_PATHS` as `ev_encounter`.
- **Verification performed** (all passing, zero console errors throughout): flat-schema regression walk, full pirate-scenario click-through (gate-locked "Negotiate" choice when no diplomat aboard, `comm_mode:"screen"` visual tint applied, NPC species rolled as "insect" with quirk text correctly interpolated into the body, `next`/`back` navigation intro→negotiate→haggle→back→back returning to stack depth 1, outcome resolution with correct resource deltas e.g. fuel 100→92 on Flee).

### Phase 5 — Combat wiring [DONE]

- `engine/js/combat.js` — full `COMBAT`/`COMBAT_CONFIG` state machine ported from `resources/demo-combat.html` (IDLE→PLAYER_TURN→TARGETING→FTL_CHARGING/SURRENDER_DECISION/MUTINY→END), wrapped in an IIFE exposing exactly three globals: `window.triggerCombat`/`triggerRamResolve`/`triggerFleeResolve`. All turn logic (damage, crit, morale-driven miss chance, evade/dodge, hull patch, FTL charge/abort, tribute, surrender/retreat rolls, mutiny, defeat) ported 1:1 including every crew/captain bonus table entry.
  - **Deliberate scope cuts vs. the demo** (documented in the file's own header comment too): no canvas FX (laser beams/particles/crosshair/targeting-click) and no subject sprite frame — Phase 3 never built one, no NPC portrait art exists yet. Hit feedback is a CSS flash/shake on `#screen-encounter` itself. FIRE LASER auto-resolves through a brief `TARGETING` state instead of waiting for a viewport click (the demo's click coordinates never affected hit/damage math anyway — purely cosmetic beam endpoints). No "injured" crew mechanic — confirmed dead code even in the flat schema (`applyOutcomeEffects` only implements `crew_effect.type === 'kill'`); only crew death is modeled. Bonus salvage crate pool trimmed to items that actually exist in `items.json`/`materials.json` (dropped the demo's invented circuit-board/O2-tank drops) — same "don't invent content" rule Phase 4 applied to Fabricator's recipe list. `AI_FALLBACK` was **not** deduplicated into `shared.js` per the original plan wording — that object only ever existed in the two now-frozen demo files, never in the engine; a small local fallback in `combat.js` covers the one place the engine needs it.
  - **No separate end-of-combat modal card / loot tile grid.** Combat resolution reuses `renderOutcomeView()` — the exact same terminal screen every other encounter choice already lands on — with loot described as text (`"Recovered: 6× gold, 1× Fuel Cell."`) and routed into real `STATE` (`STATE.materials`/`STATE.items`/`STATE.goldAmount`) via the existing `applyOutcomeEffects()` pipeline. This keeps combat's exit UX consistent with the rest of Phase 3 instead of introducing a second resolution pattern.
  - **Hull/morale reconciliation pattern**: `COMBAT.player.hull`/`.morale` are a live shadow-copy of `STATE.resources.hull`/`.morale`, snapshotted at combat start and mutated turn-by-turn (matching the demo exactly). At combat end, the NET delta (`COMBAT.player.hull - STATE.resources.hull`) is what actually applies to `STATE` via a synthetic `outcome` object run through the same `applyOutcomeEffects()`/`renderHUD()`/`checkFailure()` sequence every other choice resolution uses — so a combat that zeroes hull/morale/crew correctly routes to the failure screen instead of silently continuing. Food cost for tribute-on-fail is the one exception: since combat continues after a rejected tribute (no outcome object to route through yet), it's deducted directly against `STATE.resources.food` mid-fight.
- **Content authored**: `events_encounter.json`'s pirate scenario intro layer gained two new choices — `Open Fire` (`triggerCombat: true`) and `Ram — engineer braces the hull` (`gate: {crew:engineer}`, `triggerRamResolve: true`, 30% fail chance drops into combat already damaged with the enemy firing first). `Flee` was switched from a bare `outcome` choice to `triggerFleeResolve: true` (functionally identical today — a thin wrapper that resolves `choice.outcome` — but gives a named hook for a future flee-risk mechanic without touching content again). New `pirate_ram` outcome entry added to the event's `outcomes` map for the ram-success path.
- **Schema fields documented, not registered as tags** (matches how `next`/`back`/`outcome`/`scenario` were handled in Phase 3 — these are choice-level navigation mechanics, not `tag_registry.json` dimensions): `triggerCombat`, `triggerRamResolve`, `triggerFleeResolve`, and the ram choice's `hull` (damage-on-fail amount) field. Documented in `resources/CLAUDE.md`'s layered Event Module section.
- **DOM/CSS additions**: `#combat-turn-indicator` + `#combat-hpbars` (HULL/ENEMY/MOR bars) added to `#screen-encounter`'s markup in `index.html`, gated entirely on a `.combat-mode` class combat.js adds/removes — no changes to the non-combat encounter render path. New `resources/screen-combat.css` (button color accents by action family, turn indicator, HP bars, FTL charge progress pane, hit-flash/hull-hit-vignette keyframes). `#enc-meta` (the node-type/name label) hides during combat mode to avoid overlapping the new HP bars.
- **`combat_log` flavor pool populated** (A7 fix, closes the last item from `COMBAT_SYSTEM_HANDOFF.md`) — all 17 slots × 5 AIs filled with the demo's own `PLACEHOLDER_COMBAT_LINES` content (verified 1:1 slot-name match between the two, so this was a straight copy, not a reconciliation exercise).
- **Verification performed** (Playwright, `?debug=fixed_path` + `page.evaluate` to force `enterEvent(node, EVENTS['event_encounter_pirate_001'])` directly — bypassing the pool-draw's randomness for deterministic setup, same technique Phase 3 used): mount via Open Fire (HUD/turn-indicator/action-panel render correctly, tribute options appear for botanist/chef crew, xeno fire-bonus tag shows), full fight-to-**surrender** (correct loot/gold/item application, `combat-mode` class cleared, lands cleanly on the standard outcome screen), forced **defeat** with real crew (LIMP AWAY outcome, hull→1, cargo-loss item drop applied, run continues), forced **defeat with empty crew** (confirms `checkFailure()` correctly intercepts mid-combat-resolution and routes to the failure screen instead of the LIMP AWAY outcome — the "Autopilot / crew gone" failure text rendered correctly), **RAM success** (hull -18, resolves to the new `pirate_ram` outcome, no combat mount), **RAM forced-failure** (`Math.random` monkeypatched for one call to force the 30% branch — mounts combat with "RAM FAILED — COMBAT" and enemy firing first, as designed), **FLEE** (resolves to `pirate_flee`, fuel -8), and **MUTINY** (insect species — never surrenders — + morale ≤10 → immediate `MUTINY` state on entry with only STAND DOWN available → forced defeat). Zero non-404 console errors across every run; the 404s are the same pre-existing background-art probe noise from Phase 3/4. Also re-verified the plain `?debug=fixed_path` boot and the full non-debug title-screen boot both still render clean with the two new `<link>`/`<script src>` tags added.

---

### Phase 6 — Endings/Failures wiring [DONE]

- `engine/js/screens/endings.js` + new `resources/screen-end.css` replace the old single-screen `screen-end` placeholder with the real two-screen cinematic→report flow from `resources/demo-endings.html`, per Bible §17. Both sub-views (`#end-cinematic`/`#end-report`) live inside `#screen-end` itself — same pattern the encounter screen already uses for its layer/outcome toggle — rather than the global overlay system, which is Cruise-specific.
  - **Key divergence from the demo, and why**: the demo's `TITLES`/`ARRIVAL_BODY`/`TIER_QUOTE`/`FAILURES` tables were dev-placeholder copy that never made it into the real module JSON — `modules/endings/endings.json` and `modules/failures/failures.json` diverged into richer, differently-structured authored content during the content-writing pass (endings: a single `body_template` per module with `{score_paragraph}`/`{crop_paragraph}`/`{crew_paragraph}`/`{report_number}` placeholders resolved against `score_paragraphs`/`crop_paragraphs`/`crew_paragraphs` sub-objects, not one module per tier; failures: `title`/`body`/`epitaph`, no per-entry "show report?" flag). This port reads the real modules — same "don't port a drifted demo mirror" call Phase 4 made for Fabricator's recipes. The one kept-from-the-demo piece is the four tier-reactive cinematic titles (MADE IT / MOSTLY MADE IT / BARELY MADE IT / NOBODY'S SURE) — treated as structural/presentational, not narrative content tied to a module, matching how NPC_QUIRKS/NPC_DISPOSITION_NAME already live directly in `index.html` rather than JSON.
  - **Crop status is now real**, closing a placeholder Phase 3/4 explicitly flagged ("no crop sim wired yet — assume thriving"): `resolveCropStatus()` reads `STATE.cropGrowth.health` (Phase 4's Growbay) against the selected crop's own authored `healthy_threshold`/`sick_threshold` (already in `crops.json`, not invented) to pick `thriving`/`sick`/`dead`, which feeds both `endings.json`'s `crop_paragraphs` and the arrival background's crop-vs-noplant axis.
  - **Arrival bg matrix** (`sprites/backgrounds/endgame/{folder}/{prefix}_{crop|noplant}.jpg`, all 18 files confirmed present) wired via `DEST_PATHS`, correctly diverging interstellar's folder/prefix from its trail id per Bible's explicit instruction. **Found and fixed a real id mismatch** during this port: `crops.json`'s id is `sweet_potato` but the bg asset is named `*_potato.jpg` — a `CROP_BG_ID` resolver maps it (fix lives in the resolver, not a rename of the crops.json id, same "fix the lookup, not the content id" approach Phase 4 used for items.json's short-id mismatch).
  - **`triggerArrival()` now does a real bracket+tone random draw** (closes the Phase 3-flagged gap: with no `event_id` on any procedurally-generated node, every real playthrough previously always landed on the one `test_path:true`-flagged ending). The `?debug=fixed_path` fixed test path still resolves deterministically (its arrival node hardcodes `event_id: "ending_colonyfiled_001"`), so no regression there. Only 2 endings exist today, both `ending_score:"any"`, so in practice this is currently a coin flip between them — same "ready for more content, currently thin" situation Phase 3's pity-counter verification was in.
  - **`crop_dead` wired into `checkFailure()`** (`STATE.cropGrowth.health <= 0`) — genuinely reachable now that Growbay tracks real health, but **nothing currently decrements health automatically** (only the one-time seed at crop selection; growbay.js's `bindGrowbayState()` daily catch-up only advances `growth`, not `health`) — so this branch is correctly wired but practically dead until a pest/threat/neglect mechanic exists. Wired now so that future mechanic needs zero `checkFailure()` changes, same reasoning as Phase 3's pity counter.
  - **`crop_dead`'s cinematic-vs-report classification is a judgment call**, not from the Bible's original 5-failure table (Bible only lists no_fuel/crew_gone/hull_zero/mutiny/time_expired — crop_dead was explicitly gated on Phase 4's crop-tick loop existing, per Phase 3's own note). Treated as full two-screen (has a report card) since `failures.json`'s entry carries a `continue_option` field suggesting more narrative weight than a cinematic-only beat — flagged here, not silently decided.
  - **Emergency beacon NOT implemented as an interactive mechanic.** Bible: "`no_fuel`'s `emergency_beacon` becomes the final option" — the Bible doesn't specify what accepting rescue actually does mechanically (cost? different ending text? just flavor?), so this isn't a one-line extrapolation like crop-status was. The report card still renders `failure_no_fuel_001`'s authored body/epitaph (which already reads as "the beacon is your only option" narratively), it just isn't a clickable branch. Honest gap, not invented.
- **Verification performed** (Playwright, `?debug=fixed_path` + direct `triggerArrival()`/`checkFailure()` calls with STATE forced, same deterministic-setup technique Phases 3/5 used): full arrival cinematic→report flow (legendary tier, lunar/wheat — correct bg, correct tier-gold title, correct randomly-drawn ending body with score/crew paragraph substitution, correct resource bars/crew pips/day-delta line), all 6 failure types forced individually (title/body/epitaph all match the real `failures.json` content, not the demo's copy; `hull_zero`/`crew_gone` correctly render cinematic-only with body+quote on-screen and a New Run button; the other 4 correctly show View Report), Back button on the report card returns cleanly to the cinematic, full `applySetupToState()` → arrival chain end-to-end (not just direct function calls) on an interstellar/zinnia run — correctly resolved the diverged `far_garden/fargarden_zinnia.jpg` path, the `sweet_potato`→`potato` bg-id fix, and the dead-crop→`noplant` bg fallback. Zero console errors across every run; re-verified both boot paths (`?debug=fixed_path` and the real title-screen boot) still render clean with the new `<link>`/`<script src>` tags.

---

### Phase 7 — Full beginning-to-end playtest pass [DONE]

- **A real softlock was found and fixed** (this is the headline result of Phase 7 — exactly what this phase exists to catch). Root cause, in two parts:
  1. `selectEvent()`'s node-type filter let any `node_type: ["any"]` event (e.g. `event_shipboard_001`) win the weighted draw at a **fork** node instead of the one event actually built to resolve it (`event_general_001`, `node_type: ["fork"]`). When that happened, the fork's `chose_alpha`/`chose_beta` flag never got set, `nextAvailableNodes()` returned an empty set forever, and Resume just logged "No route forward from here yet" — permanently. Fixed in `index.html`'s `selectEvent()`: fork nodes now exclude the blanket `"any"` node_type match every other node type gets, and only draw from events explicitly tagged `node_type: ["fork"]`.
  2. That fix surfaced a **second, previously-undiscovered content bug**: `event_general_002` ("The Company Memo") is also `node_type: ["fork"]` — clearly authored as a second fork-resolving event, structurally mirroring `event_general_001` — but its two choices set `sets_flag: "chose_corporate"` / `"chose_unapproved"` instead of `chose_alpha`/`chose_beta`. `branchPick()` only ever checks the latter two, so this event could fire, the player could pick a route, and the fork would *still* never resolve. Fixed in `modules/events/events_general.json`: both flags renamed to `chose_alpha`/`chose_beta` (confirmed unreferenced anywhere else, so no other content broke).
  - **Verified the fix, not just the individual case**: 21 automated trials across all 3 trails (lunar/mars/interstellar, 5–8 trials each) confirmed every fork on every trail draws a genuinely resolving event. A follow-up sequential test specifically walked interstellar's 3 forks with real `once:true` consumption (only 2 fork-events exist total) and confirmed the 3rd fork — which runs out of dedicated content — still produces a non-empty `nextAvailableNodes()` by falling back to the (global, not per-fork) `chose_alpha`/`chose_beta` flag already set by an earlier fork, rather than softlocking. That fallback is real but **known-thin**: a trail's 2nd/3rd+ fork silently reuses the first fork's branch bias instead of getting its own distinct choice once the two dedicated fork-events are exhausted — flagged below as a content gap (more `node_type: ["fork"]` events, or per-fork-instance flag namespacing), not a stuck-forever bug.
- **Full real-UI playthrough, lunar trail**: title screen (including the poster-dismiss interaction, which blocks all clicks until dismissed — a Playwright gotcha, not a bug) → New Game → all 6 setup wizard steps via real card clicks (trail/AI/captain/2 crew/crop/ship name) → Launch → landed on a fully rendered Cruise screen. From there: MAP overlay opened and closed cleanly; Stop Menu opened and REPAIR/FABRICATOR verbs (the two available at the starting station node) confirmed opening their real overlays; Resume-loop drove through `event_launch_001`/`002`, a **naturally-drawn pirate encounter** (not forced) taken through the FIGHT path to a full combat resolution (14 clicks), the fork event (post-fix), several general/shipboard events, and arrival — reaching the real "MADE IT" cinematic + report screen. Zero console errors across the entire run.
- **Abbreviated regression passes, mars and interstellar** (map generation itself was already stress-tested 150x across all 3 trails in Phase 2 — this only needed to confirm the *live full-loop* mechanics, travel/forks/combat/arrival, don't regress per-trail): mars reached arrival at leg 58 (43 days) with the correct `mars_tomato.jpg` background. Interstellar — deliberately stress-tested harder since `event_encounter_pirate_001` is `once:false` and a "click first available choice" driver reliably triggers FIGHT — fought through **14 separate pirate combats** over a 103-day run before reaching arrival with the correctly-diverged `far_garden/fargarden_zinnia.jpg` background. Zero console errors on either trail.
- **One test-methodology note worth recording**: an early abbreviated pass logged many "no clickable choice" warnings and appeared to stall on interstellar. Investigation traced this to the test driver polling during combat's legitimate ~380ms `TARGETING` transition window (where every button is briefly, correctly, locked) rather than a real game issue — increasing the poll tolerance and leg budget resolved it. Worth remembering for any future scripted playthrough: a momentarily-all-locked encounter screen during combat is expected, not a bug signal.
- **Minor, non-blocking visual nit observed, not fixed**: the map overlay's node labels overlap near a fork's two branch nodes (`Station(alpha)`/`Station(beta)` labels crowd the branch names above them) — pre-existing from Phase 2's `renderMap()`, not introduced this phase. Cosmetic only.

---

### Post-integration content pass #1 (2026-08-02) [DONE]

First "flesh out the pools" session after the 7-phase integration completed. All changes lint-clean (`node tools/lint_modules.js` now reports **fully clean** — the long-standing `hull_patch` gap is closed) and Playwright-verified in-engine:

- **Crisis events 2→12** (`events_crisis.json`): 2 per trigger for all 6 crisis triggers (was: low_hull×1, low_water×1, and *zero* for low_fuel/low_food/low_o2/low_morale — two-thirds of the crisis system was dead content). Choices follow the established pattern: an item-gated fix (fuel_cell/ration_brick/o2_recycler/water_canister/hull_plating/sealed_vinyl finally have event uses), a crew-gated fix, an effort/microgame fix, and an ignore-with-consequences option. Verified: forcing each low resource gives that trigger's events ~90% of draws (27/30 for low_fuel).
- **`hull_patch` item added to `items.json`** — recipes.json already crafted an item with that id (Phase 4's Fabricator), so this wasn't inventing content, it was completing a triangle: fabricator crafts it → items.json defines it → `event_crisis_001` consumes it. Also added `mystery_provisions` (curiosity trade good granted by the new `event_crisis_006`).
- **`events_nebula.json` (2) + `events_void.json` (3) created and registered in `MODULE_PATHS`** (`ev_nebula`/`ev_void`) — these node types previously had zero dedicated events. Nebula follows Bible §10 (navigation challenge, pilot shines, fuel rewards); void follows Bible §10's corrupted-register spec (`tone: corrupted`, `comm_mode: "corrupted"` for the existing visual tint, subtly-wrong AI flavor lines, never explained). Verified drawing at their node types (43% of void-node draws mid-journey).
- **`npc_disposition_lines` fully populated** — all 43 slots × 4–5 neutral-voice lines (174 total) per Bible §11's composition spec (base lines stay species-neutral; species coloring transforms at render time). All 7 `npc_species_coloring` quirk pools filled (27 quirks, scene-prose register). **Engine fix required and made**: `interpolateNpcTokens()` in `index.html` expected `npc_disposition_lines[disposition]` to be a flat array, but the Bible's schema is per-slot dicts (station_crew nesting one level deeper by job) — the token regex now captures the slot name and resolves it properly; missing slots still drop cleanly. Verified: `{npc.line.hail}`/`{npc.line.demand}`/station_crew `{npc.line.gossip}` all resolve, unknown slots return ''. **Note**: the Bible's full species-coloring pass (grammar transform functions + tic injection) is still future engine work — only neutral base-line selection is wired.
- **Endings 2→6** (`endings.json`): one bracket-specific ending each for legendary/good/rough/pyrrhic, alongside the two existing `"any"` endings — the Phase 6 bracket filter finally has real pools (verified: legendary bracket draws from a 3-ending pool including `ending_legendary_002`). Each uses `crop_paragraphs` keyed to the real thriving/sick/dead status Phase 6 wired.
- **Tag registry status sweep** — 72 values flipped `empty`→`populated` based on actual module usage (statuses had never been maintained; even long-populated values read `empty`). Remaining honestly-empty: 13 trigger values with no engine support yet (`crop_sick`/`fab_broken`/`post_combat`/etc.), `ending_score: hollow`.
- **Balance bug found & fixed during verification**: `selectEvent()` gave positional triggers (`journey_start`/`journey_end`) the full ×15 *crisis* weight multiplier — launch events crowded out all node-specific content for the first ~15% of every run (45 of 60 draws at a day-0 nebula node). Positional triggers now get ×3; real crises keep ×15. Verified: day-0 draws now show variety, mid-journey node content surfaces properly, crisis dominance unaffected.

Still thin after this pass (next content session's menu): per-node-type pools beyond nebula/void are 2–3 events each (station/planet/derelict/asteroid/anomaly); `events_encounter.json` has only the one pirate scenario (trader/drifter/boarding scenarios would exercise the trader/drifter disposition lines just written); the 13 unwired trigger values; `hollow` bracket endings (needs the crop-dead-at-arrival scoring path); more `ai_universal` lines (2/slot currently, Bible suggests 5–6).

---

### Post-integration content pass #2 (2026-08-02, same session as #1) [DONE]

"Expand and deepen everything, fix bugs found." All lint-clean (49 events across 12 files), all Playwright-verified:

**New engine features (activating previously-dead authored content):**
- **`ai_universal` pools are now actually consumed** — they never were, despite being authored since the module-writing phase. `cruise.js` now pushes into the AI log: an ambient line on arrival at each new node (45% chance, `cruise_ambient`), resource warnings on downward threshold crossings (`resource_warning`, low <25/30 matching `activeTriggers()`, critical <12, once per crossing with silent reset on recovery), and crop milestones (`crop_lifecycle.mature` at >75 growth, `.died` at 0 health, once each per run). Added the missing `water`/`o2` warning pools (only fuel/food/hull/morale existed) and deepened `cruise_ambient` 3→6 lines/AI. `window.pushCruiseLog` exported for other modules.
- **`failures.json`'s `continue_option` is implemented** — `crop_dead`'s authored "Keep flying" choice (present in the JSON since the content-writing phase, never wired) now renders as a second button on the failure cinematic; accepting sets `crop_death_accepted` (guards `checkFailure()` re-fire), un-ends the run, pushes the authored continue-narrative into the cruise log, and returns to the hub.
- **The `hollow` ending bracket is reachable** — `scoreBracket()` returns `'hollow'` when the crop is dead at arrival, overriding the numeric brackets. Both original endings authored `score_paragraphs.hollow` ("Crew: arrived. Crop: deceased.") that were unreachable until now. Cinematic title: "MADE IT. IT DIDN'T"; grey-green tier colours in `screen-end.css`. **Verified end-to-end**: crop death → Empty Growbay failure → Keep flying → cruise (no re-fire) → arrival → hollow bracket, correct noplant background.
- **`resolveNpc()` upgrades**: draws `{npc.quirk}` from the populated `npc_species_coloring` pools (hardcoded NPC_QUIRKS table kept as fallback only); carries `ev.npc.job` through for station_crew NPCs (without it, `{npc.line.<slot>}` always fell back to janitor lines); job-specific display names.

**New content:**
- **Trader + drifter layered scenarios** in `events_encounter.json` (`event_encounter_trader_001` — 3 layers, gold-gated purchases incl. a mystery crate; `event_encounter_drifter_001` — `once:true`, 3 layers, route-notes reward). Both use `{npc.line.<slot>}` tokens live, exercising the disposition pools written in pass #1 — **verified in-engine: tokens resolve to real pool lines through full click-throughs of both scenarios.**
- **Per-node-type depth**: station +2 (docking queue, inspection), planet +2 (rain, ruins), derelict +2 (warm kettle horror, garden ship), asteroid_field +2 (expired claim, singing rock), anomaly +2 (time stutter, the compliment), +1 `journey_end` general event (Almost). 49 events total, up from 21 at session start.
- **Tonal fix**: `event_encounter_pirate_001` node_type narrowed from `any` to exclude `station`/`fork` — pirates no longer hail you on final approach to a patrolled station.

**Bugs found and fixed:**
- **Map branch layout was genuinely broken on dense trails** (Phase 7 logged it as a cosmetic nit; interstellar showed it's worse): (1) branch nodes were packed at fixed 0.1 position-unit steps — ~9px apart on-screen, nodes and labels overprinting into an unreadable smear; now distributed evenly across the fork gap (`map.js`). (2) `forkGaps` could pick *adjacent* spine gaps, stacking two fork structures on top of each other; now enforced ≥2 apart (`map.js`). (3) Multi-node branches arc outward vertically (44px/step in `nodePositions()`) so 2-node branches read as a detour loop. (4) Labels: branch labels drop the redundant `(alpha)/(beta)` suffix (full name kept in hover title + footer), face outward from the spine, and spine/fork labels alternate below/above by rank. Verified against the worst case (interstellar, 15 spine + 3 forks) — all nodes and labels individually legible.
- Verified no regressions: full organic mars playthrough with randomized choices (13 distinct events surfaced in one run, including the new trader/nebula/derelict content), both boot paths clean, zero console errors throughout.

Still on the menu for future passes: more `events_encounter.json` scenarios (boarding, station-crew NPC events using the job-line pools), the 13 unwired trigger values, a health-decay mechanic so crop_dead/hollow can fire without dev intervention, `map_commentary`/`fabricator_events` ai_universal groups (still unconsumed), species grammar-transform + tic-injection pass (Bible §11's renderer contract steps 3–4).

---

### Post-integration content pass #3 (2026-08-02, same day) [DONE]

Continuation of "expand and deepen everything." Lint clean (57 events across 12 files, 223 choices), full organic interstellar playthrough verified (15 distinct events, zero errors):

**New mechanics:**
- **Crop health decay is real** (`growbay.js`'s daily catch-up, ticked from every `renderCruise()` via new `window.tickCropGrowth()` — decay runs even if the player never opens the growbay). Numbers grounded in crops.json's own authored data: dry ship (water=0) −3/day × the crop's authored vulnerability multipliers (tomato ×1.5 water_sensitivity, zinnia ×1.3 fragile), badly mismatched watering −0.5/day, untreated pests −1.5/day, decent care +0.5/day recovery (sweet potato ×0.5 slow_recovery). A neglected crop dies in ~18–27 days of total drought — "sustained neglect" per crops.json's own \_meta. **This makes crop_dead/hollow/crop_sick reachable in normal play.** Verified: tomato 75→30→0 over 20 dry days.
- **7 trigger values wired into `activeTriggers()`**: `crop_sick` (below the crop's own sick_threshold), `crop_dead` (only after "Keep flying" acceptance — feeds hollow-run aftermath events), `solo_run` (zero crew), `journey_mid` (35–65% of the trip), `post_combat` (2-event-draw aftermath window; `combat.js` sets `STATE.postCombatLegs=2` on combat end, `selectEvent()` decrements), `crew_dead` (permanent once anyone dies — `applyOutcomeEffects`' kill branch sets `crew_lost`, which combat defeats route through too), `fab_broken` (fabricator broken state; wired engine-side, no authored event yet — left `empty` in the registry honestly).
- **Species coloring pass** (Bible §11 renderer contract steps 3–4, previously explicitly deferred): grammar transforms as pure functions in `index.html` (`clipped`/`dropped_articles`/`flowing`/`sibilant`/`formal_expanded`/`inconsistent`) + tic injection with per-species position rules (insect mid-clause, rock/robot prepend, water append, unknown random, reptile never — its sibilant transform IS the tic) + capitalization repair. Applies ONLY to `{npc.line.<slot>}` pool dialogue, never authored `line:` fields or scene prose, per the Bible's register separation. Verified all transforms produce correct output.
- **`materials` outcome field** (additive schema extension, documented in CLAUDE.md): map of material id → qty granted to `STATE.materials`. Mirrors combat loot's routing.
- **Remaining `ai_universal` groups consumed**: `map_commentary.node_entering` (station/derelict arrival lines, preferred over generic ambient when the node type has a pool) and `fabricator_events.craft_started`/`craft_complete` (pushed to the cruise log from `fabricator.js`).

**Bug found & fixed — 14 pre-existing broken loot grants:** the original per-node-type events (anomaly_001/002, asteroid_001/002, derelict_001/002, planet_001) granted material ids (`exotic`/`minerals`/`scrap`/`iron`/`biocomponent`) through `item_grant`, silently landing in `STATE.items` as inert junk since the loot system was wired. `iron` existed in NO module file (clearly meant `metal`). All migrated to the new `materials` field; `tools/lint_modules.js` now validates `item_grant`/`item_consume`/`materials` against their correct namespaces (both flat choice outcomes and layered outcomes maps) so this class of error can't recur.

**New content (49→57 events):** crop_sick ×2 ("The Leaves Are Wrong", "Second Opinion" — the medic scanning the plant), solo_run ("Table for One"), crew_dead memorial ("The Empty Bunk"), journey_mid ("The Middle"), post_combat ("After Action"), a station_crew NPC layered event ("The Janitor Knows" — first live use of the station_crew job-line pools: greet/remark/gossip/warn/farewell all verified resolving + species-colored), and a derelict boarding scenario ("Squatters' Rights" — second `triggerCombat` entry path, verified mounting combat; diplomat parley + toll + walk-away alternatives; uses the new `materials` grants).

Still on the menu: fab_broken/fab_low/crew_injured/stowaway_aboard/at_station/full_cargo/empty_cargo triggers (need either mechanics or events), more per-node-type depth (station/planet/derelict now 4–6 each; could go deeper), medical/brace/breach minigames still unmapped to any verb (crisis-event material), pest mechanic (GSTATE.pest exists and decay reads it, but nothing sets it outside the growbay demo's dev tools).

---

### Post-integration content pass #4 (2026-08-02, same day — autonomous expand-and-bughunt pass) [DONE]

User directive: "keep going without my input, deliberately force bugs so they never cause issues." Lint clean (63 events across 12 files, 244 choices). Verified via a 6-run randomized fuzz battery + an 8-case forced-edge battery + organic runs — zero invariant violations, zero console errors anywhere.

**New mechanics (closing the "needs mechanics before content" list):**
- **Pest system live end-to-end**: daily onset roll in the growbay tick scaled by each crop's authored `contamination_resistance` (low 2%/day → high 0.6%/day, only once established at growth>10), AI log alert on outbreak (re-arms per outbreak), decay reads it (−1.5/day × fragility), and TWO cures: the growbay's TREAT button is now real (clears pest; costs 1 day, free with a botanist aboard) and events can author `clears_pest: true`.
- **`launch_minigame` choice contract** (documented in CLAUDE.md): flat-schema choices can play a real minigame before their outcome applies, with `tier_outcomes {perfect/good/poor}` overlaying resources/narrative per result. **This finally connects MEDICAL / SOLAR BRACE / HULL BREACH** — orphaned since Phase 4 ("no natural verb maps to them — they're crisis-event material") — to actual content.
- **`fab_low` trigger** (wear ≥70, suppressed while broken) + **`fabricator_repair: true` outcome field** (un-breaks, caps wear at 50) — the fabricator's failure loop now closes: wear accumulates per craft (Phase 4) → fab_low maintenance event → ignored → craft-failure breakage (Phase 4's breakFab) → fab_broken event → repair via the `repair_fabricator` item (which finally has its purpose), engineer rebuild, or scrap-and-stubbornness.
- **NaN hardening**: `applyOutcomeEffects` skips non-finite resource values so an authored typo can never NaN-poison STATE (verified: `{fuel: undefined, food: 'lots'}` leaves both untouched).

**New content (57→63):** `event_crisis_015` "Something Going Around" (MEDICAL triage, tier-scaled), `016` "Weather Report" (solar flare, BRACE, pilot shadow-line alternative), `017` "Holes" (low_hull, BREACH, engineer alternative), `018` "Uninvited Gardeners" (pest outbreak on crop_sick trigger, all paths clear the pest except laissez-faire), `019` "The Fabricator Is On Strike" (fab_broken — repair kit / engineer rebuild / improvised / leave dead), `020` "Scheduled Maintenance (Overdue)" (fab_low, once).

**Bug hunt results:**
- 6-run fuzz (randomized trail/crop/AI/captain/crew, random choices, random verb pokes, minigames stubbed to random tiers): all 6 reached endings, 31 distinct events surfaced, and per-leg invariants held throughout (resources finite ∈ [0,100], gold ≥ 0, days finite, items all strings, materials finite, crop health finite, no stall signatures).
- Forced-edge battery, all passing: all-locked choice set → A8 Continue fallback; `tier_outcomes` merge math exact per tier; MEDICAL overlay genuinely mounts from an event context; fully-exhausted event pool → clean null → returnToHub; `colorNpcLine` robust to empty/single-word/all-caps/unknown-species input; full pest cycle (force → announce → TREAT → +1 day without botanist, flag re-arms); fab_low → fab_broken precedence → repair clears both and caps wear; NaN guard.
- Two authoring slips caught and fixed same-pass (a stray CJK character in an AI line; a zero-quantity materials grant).
- One non-bug confirmed while testing: a minigame launched from an event can't orphan the encounter — `rbquit` (the results screen) is the game's only exit and always fires `onDone`, per Phase 4's design.

Remaining honestly-empty triggers: `crew_injured` (needs an injury model — currently only kill exists), `stowaway_aboard` (variant system, explicitly deferred since the original plan), `at_station` (redundant with node_type targeting), `full_cargo`/`empty_cargo` (need a cargo-capacity model). All blocked on design decisions, not authoring.

---

### Post-integration content pass #5 (2026-08-03) — the four design decisions [DONE]

User resolved the four design-blocked items via the question modal; all four built same-session. Lint clean (67 events, 257 choices), 6-run fuzz regression clean, targeted battery all-green. **The trigger registry is now 100% closed — every value populated or deprecated, zero empty.**

- **Per-crew HP** (user chose the rich option over binary injury): `STATE.crewHP` (0–100/role). `crew_effect` routes through it — injure −35 (a medic aboard softens ALL crew damage ×0.6), kill is lethal EXCEPT a carried medkit's own authored "15% of would-be-lethal → injury" fires (consuming the medkit, survivor at 20 HP), heal +40 all-injured / full for specific. Death at 0 pulls a real `crew_epitaphs` line (with the crew member's roster name substituted) into the cruise log. Gates refuse crew ≤25 HP ("X is hurt too badly to help"). +1 HP regen per travel leg (+2 with medic). Combat defeats roll a 60% injury on top of the death roll. Cruise crew-card HP bars are live (amber <60, red ≤25). `crew_injured` trigger: anyone <60.
- **Cargo: full enforcement** (user chose hard limits despite the UI caveat — so a minimal cargo UI shipped with it): capacity = ships.json's authored `cargo_capacity_base` (8) +5 while the insulated cargo bay is held; slot costs from each item's authored `cargo_slots`/`cargo_slots_per_10` (stackables per-10, rounded up). `grantItem()` refuses over-capacity grants with an honest log line. Materials and the crop are NOT cargo. Cruise's INV button (a stub since Phase 2) now opens `overlay-inventory`: grouped list, live slot meter, per-row JETTISON. `full_cargo`/`empty_cargo` triggers live, one event each ("The Hold Is Full", "Echo").
- **Stowaway: full arc.** ~35% of runs roll a hidden stowaway (identity from the new `stowaway_identities` flavor pool — **5 drafted identities awaiting player review**: Wembly Voss the unretired inspector, Meridian Slate the secret auditor, Pip Andrade the lottery kid, Old Marrow the seed-keeper who's been secretly fixing your nutrient mix, Capt. Ellery Dunn (Ret.) who boarded the wrong ship in 2287). Reveal fires past 20% of the journey via the `stowaway_aboard` trigger — through the new dedicated event (`event_shipboard_005`, `{stowaway.*}` tokens) OR through `event_shipboard_001`'s original authored `stowaway_variant`, which is finally honored (its coercion to standard_variants was Phase 3's deliberate deferral). Choice-level `stowaway_resolve` field: `welcome` (joins as real crew with HP if their identity carries a role and a slot is open, else passenger flag), `welcome_replace` (a random existing crew member disembarks), `refuse`. Both reveal paths verified end-to-end, including identity-token interpolation and the crew-count-conditioned variant choices.
- **`at_station`: deprecated** in the registry per the never-delete rule (redundant with `node_type: ["station"]`).

**Major latent bug found while testing (Phase 4 vintage): `screen-mining.css` declared ~34 UNSCOPED `.enc-*` selectors** — including `.enc-narrative { height: fixed; overflow: hidden }` — that leaked into the main encounter screen globally. Every event body longer than ~3 lines has been silently clipped since the mining port landed. All mining selectors now scoped under `#mining-root`; the real narrative panel grows to a 340px cap then scrolls (`.enc-narr-body { overflow-y: auto; min-height: 0 }`). Verified: long stowaway reveals display fully; mining overlay unaffected (its scoped 130px height still applies in context). **Lesson for future ports: any demo CSS migrated to a shared page MUST be scoped under its root container — this is the second unscoped-CSS collision this project has hit (Phase 0's #screen-loading was the first).**

New/changed events: `event_shipboard_005` (reveal), `006` ("Light Duty", crew_injured), `event_general_007` ("The Hold Is Full"), `008` ("Echo"), plus `stowaway_resolve` wired into shipboard_001's authored variant outcomes. Schema docs for `stowaway_resolve` + cargo/HP fields belong in CLAUDE.md's next doc pass (flagged).

---

### Post-integration pass #6 (2026-08-03) — systems audit + consequence-content pass [DONE]

User directive: "double-check all recent mechanic/logic implementations, then continue content depth." Full audit of passes #3–5 found and fixed **six real bugs**, then a consequence-event content pass. Lint clean (74 events, 273 choices), fuzz clean (sharpened stall detector — the one flagged stall was a harness false-positive on layered next/back ping-pong, not a game hang).

**Audit findings, all fixed:**
1. **Flat events could never enter combat** — Phase 5's combat-hijack checks sat AFTER `handleChoiceClick()`'s flat-schema early-return. Moved above it, and `event_general_003`'s original authored `combat_trigger: true` field (module-writing era, orphaned ever since) is honored as an alias. FIGHT on "Vessel Approaching" now genuinely mounts combat — a third organic combat entry.
2. **`selectEvent()` never read event-level `requires_flag`** — the schema field existed from day one; flag-gated events would have fired without their flag. Now filtered in the candidate pass. This is the fix that makes consequence events possible at all.
3. **`endRun()` under an open overlay** — growbay TREAT and fabricator crafts advance days → a `time_expired` failure could fire with their overlay open, burying the end screen underneath it (overlays are independent of `showScreen()`). `endRun()` now force-hides all active overlays + `modal-open`/`stop-active`.
4. **Three cargo-enforcement bypasses** — combat loot, forage rare drops, and fabricator output all pushed into `STATE.items` directly, ignoring capacity. All routed through `grantItem()`; the fabricator additionally keeps un-claimable output in the bay (jettison → claim again) and refuses a new craft while output is pending so it can't be clobbered.
5. **Pay-for-nothing purchases** — a full hold let you pay a trader's gold and then have `grantItem()` refuse the goods. `lockReason()` is now capacity-aware: choices whose outcome grants unfittable items lock up-front with "No cargo space" (exact simulation, so stackables joining a partial stack don't over-lock). Verified live: full hold locks "Buy a fuel cell" but not "Buy sealed rations" (food is a resource).
6. **Second-crop milestones never announced** — `doHarvest()`'s replant didn't re-arm the `ai_noted_crop_*` flags. Cleared on replant.

**Content pass:**
- **7 consequence events** (`events_general 009–015`) — the flag system's first real payoff, all `requires_flag`-gated and verified to only enter the pool with their flag set: the mystery crate finally opened (or enshrined), the executed-pirate reputation catching up ("Word Travels"), the nebula song's journey-end reprise, the hull-knock answered ("Return Correspondence"), K's med-ship found ("Signal Fire, Long Cold"), the janitor's intel paying off, and the welcomed stowaway settling in ({stowaway.name} tokens in a consequence event).
- **`ending_hollow_001` "The Garden, Anyway"** — the hollow bracket's own dedicated ending (pool of 3 now).
- **Pools deepened**: crew epitaphs +6, ambient travel objects +8, station/planet/derelict names +4 each, map names +2/trail, fabricator misfires +4, crop comments +1/crop.
- **`registry/flags.md` finally exists** — CLAUDE.md required it from day one; generated from actual module content (80 content flags + 13 engine flags, setter/checker table). **Zero dangling flags.** Regenerate after content passes with the script in this session's log (or rewrite — it's a ~40-line scan).

---

### Post-integration pass #7 (2026-08-03) — variety mega-pass [DONE]

User ask: "more ways for the game to say the same thing" + more scenario content. Targeted by repetition-visibility (the lines players see most often got the most new variants). Lint clean (79 events, 285 choices), fuzz clean, all gating verified.

**Flavor (+~210 lines):**
- `combat_log` +40 (the 8 busiest slots ×5 AIs — the most-repeated lines in the game; Bible target is 4–6/slot, now at 3–4)
- `resource_warning` +60 (every resource × both severities × 5 AIs — the second-most-repeated)
- `map_commentary.node_entering` +50: **the 5 missing node types authored** (planet/asteroid_field/nebula/anomaly/void ×5 AIs ×2) — arrival flavor now exists everywhere, not just station/derelict
- `cruise_ambient` +15 (now 9/AI), `crop_lifecycle` +25 (all 5 stages ×5 AIs)
- **New `fabricator_events.craft_failed` pool** wired into `breakFab()` — breakage now gets an AI line
- Stowaway identities +2 (Bastian Oke, liner chef with a sourdough named Gerald; Ines Vahl, unpaid cartographer chasing chart errors) — 7 total
- NPC hot-slot lines +12 (pirate hail/demand, trader greet/pitch, drifter ramble, janitor gossip)

**New scenario architecture — the game's first multi-event arcs:**
- **The Provident arc** (`events_general 016–018`): a rival colony ship met at journey_start, found damaged at journey_mid (help fully / half-help / pass by — the pass-by option is written to sting), and raced to the finish line at journey_end. 017/018 gated on `met_the_provident`; the finale works with any middle outcome.
- **The mayday pair** (`019–020`): answer a prospector's faint distress call mid-run → much later, WHEN A RESOURCE CRISIS TRIGGER FIRES (low_fuel/food/water), Okonkwo comes back with a bigger ship and pays the debt. Gating verified both directions: payoff never draws without the flag, draws 8/30 with it during a crisis.
- Verified the arc/payoff chains live in-engine; also verified journey_mid targeting (test note: mars baseDays is 240 — day-fraction math, not day-count, decides the windows).

Pool-depth state after this pass: nothing user-facing draws from fewer than ~3 variants; the repeat-heavy surfaces (warnings, combat, ambient) sit at 3–9 per slot.

---

### Post-integration pass #8 (2026-08-03) — permanent verification harnesses + more consequence content [DONE]

User ask: keep going, AND make the "scenarios can't fire without their prerequisites" guarantee a permanent, systematic thing rather than per-pass ad-hoc testing. Both harnesses are now repo tools; both immediately caught real bugs on their first runs.

**The two permanent harnesses (run both after ANY engine or content change):**
1. **`tools/lint_modules.js` (extended)** — now additionally enforces: event-LEVEL `requires_flag` participates in the dangling check (was choice-level only — every consequence event's gate went unverified); layered-outcome and stowaway-variant `sets_flag` are collected as setters (they weren't — two valid flags false-positived, exposing the collection gap); an `ENGINE_SET_FLAGS` allowlist for flags with no JSON setter; `launch_minigame` ids / `tier_outcomes` keys / `stowaway_resolve` values validated against the engine contract; **node-type reachability** — an event whose `node_type` targets can't spawn on ANY trail's map generation (per map_rules weights + structural fork/station) errors as dead content.
2. **`tools/fuzz_playthrough.js`** (promoted from scratchpad, hardened) — randomized full playthroughs with an in-page `enterEvent()` wrapper that audits EVERY event at the moment it fires: requires_flag actually set, at least one trigger actually active, node_type actually matched, once:true never repeats. Plus the per-leg STATE invariants (finite/in-range resources, gold ≥ 0, items are strings, materials ≥ 0), stall detection, zero-console-error requirement, and a non-zero exit code on any violation. `FUZZ_RUNS` env var scales it.

**Bugs the harnesses caught immediately (the system working as designed):**
- Lint caught its own former blind spot (layered-outcome setters uncollected), then **caught a live authoring error mid-pass**: the new spared-pirates event was gated on `pirate_sympathy`, which the mercy outcome never actually set — would have shipped permanently unreachable. One-line content fix (the outcome now sets its flag).
- Fuzz's draw audit caught a **real decision/state consistency flaw**: `selectEvent()` decremented `postCombatLegs` mid-draw, so on the aftermath window's final leg the event fired legitimately but world-state disagreed by `enterEvent()` time. Fixed by moving the decrement to `travelTo()` AFTER the draw+entry — the engine is consistent now, rather than the audit being loosened. 8-run re-fuzz: zero violations.

**New content (79→83 events):** "The Inevitable Misunderstanding, Again" (`general_021` — flags.md's founding example realized: the pirates spared via the medic's mercy come back to square the ledger; the escort option is the best formation joke in the game), "The Receipt" (`022` — the bribed inspector returns to collect; a bribe is an enrollment), "The Water Answer" (`023` — the searching_for_water promise kept at a planet), and "Walk-In Clinic" (`station_007` — layered station-crew MEDIC event, first live use of the medic job-line pools; sells real medkits, heals real crew HP).

flags.md regenerated (97 flags tracked). Lint clean at 83 events / 300 choices; 8-run audited fuzz clean.

---

### Post-integration pass #9 (2026-08-03) — trail identity + educational links [DONE]

Two user questions answered with engineering: (1) do shorter maps still feel eventful, and (2) where are the Bible's educational log links?

**Per-trail coverage — measured, healthy, and now permanently tracked:** `tools/lint_modules.js` prints a per-trail coverage line on every clean run (currently lunar 78 / mars 81 / interstellar 84 eligible events). Lunar's only exclusions are the 7 void/anomaly events (those node types don't spawn there, by map-rules design); per-NODE event density is identical across trails. What lunar lacked was *identity* — it was just "interstellar minus spice" — so:
- **Trail targeting wired** (`ev.trail: ["lunar"]` — the registry's §4.29 `trail` dimension, registered forever but never used by any content or engine path). `selectEvent()` filters on it; the fuzz harness's draw audit verifies it per-fire; lint validates values + rejects empty arrays.
- **4 trail-exclusive events**: lunar gets "Rush Hour" (corridor traffic, draft behind a freighter) and "Sightseers" (a tourist liner photographs you — roll the ship, light the growbay), mars gets "The Claim Boards" (the frontier's feral property registry; file your own 5-gold homestead marker), interstellar gets "The Last Beacon" (the final piece of infrastructure; top off its power cell for ships you'll never meet). Verified: lunar draws Rush Hour and can never draw The Last Beacon, and vice versa.

**Educational links — status was: reserved in the Bible (§18 `link`/`expand` schema, 🔗/📖 convention), zero payloads anywhere, engine rendered plain text only, pause-menu Ship's Log button still just opens the old demo page. Now:**
- `pushLogEntry()` accepts `{text, link: {url, label}}` → renders a clickable teal 🔗 anchor (new tab, noopener). `expand`/📖 remains reserved.
- **New `science_links` flavor pool** (5 crops + 9 topics, stable Wikipedia URLs) — crop links auto-attach at crop maturity (the zinnia's link tells the real 2016 ISS story its crops.json `real_science` field records).
- **`science_link` event field** — pushed to the cruise log once per run when the event fires (flag-guarded), waiting for the player's return. Attached to 9 genuinely science-adjacent events (singing rock→piezoelectricity, solar flare→space weather, hull breach→micrometeoroids, rain planet→ISS water recycling, garden ship→Veggie program, etc.). Deliberately NOT attached to the horror/corrupted events — a Wikipedia link would puncture that register.
- Lint validates `science_link.url` shape. Verified live: links render, click targets correct, once-guard holds on re-fire, crop-maturity link fires.
- **Still not done** (honest): the full Ship's Log journal surface (`demo-shipslog.html`) remains unintegrated — the pause menu still launches the demo page; `expand` modals unwired. The cruise AI log is the live log surface per Bible §18's own format spec.

87 events / 311 choices, lint clean with coverage report, audited 6-run fuzz clean (now also enforcing trail gates), flags.md at 99 flags.

---

### Post-integration pass #10 (2026-08-03) — the finishing pass [DONE]

User directive: finish everything outstanding, fully test, and add more science links. **The "isn't wired into the engine yet" message is now extinct** — every Stop Menu verb, every reserved schema slot, and every authored-but-dormant mechanic is live. Lint clean (87 events / 312 choices + coverage report), 8-run audited fuzz clean (41 distinct events surfaced), full targeted battery green.

**Everything finished this pass:**
- **The last 3 dead Stop verbs**: REST (+6 morale, +2 with a chef aboard, 1 day), TRADE (summons the full layered trader scenario at the current node — the trader IS the market; cleaner than a bare market screen and reuses everything), WAIT FOR TRADER (parks 1–2 days, 55% the trader arrives, else "the dice do not apologize").
- **Emergency beacon mechanic** — items.json's own authored contract implemented verbatim ("rescue may be friendly, hostile, or corporate"): a third button on the no_fuel failure cinematic (only when the beacon is actually carried), one use, three rescue rolls — a long-hauler who says "pass it on" (45%), a StellarAssist™ tug with an invoice (35%), or pirates charging a "rescue fee" of half your gold and a crate (20%). All refuel enough to keep flying. **Acquisition loop closed**: the beacon (previously purchasable-but-sold-nowhere) is now in the trader's pitch at 60g with appropriately grim provenance patter.
- **Ship's Log integrated** — the pause menu's SHIP'S LOG panel no longer launches the demo page: `pushLogEntry` persists every entry to `STATE.shipLog` (day-stamped, link/expand payloads carried through); a new engine journal overlay (`overlay-shipslog`) lists the whole run newest-first with clickable 🔗 links and working **📖 expand modals** (the schema's other reserved half, now live); the pause panel previews the last 4 entries inline and its OPEN button closes pause → opens the journal. Standalone demo pages still fall back to demo-shipslog.html. (The demo's full parchment/memorial chrome remains future polish; this is the live surface.) **One real bug found while wiring**: `const STATE` doesn't attach to `window`, so shared.js's `window.STATE` check silently disabled the preview — typeof-check fixes it; worth remembering for any shared.js code touching engine globals.
- **Science links batch 2 (+10, 19 link-bearing events total)**: Voyager 1 (The Last Beacon — the perfect pairing), the overview effect (The Middle), sonification (Something Singing), time dilation (The Repeat), ion thrusters (Fumes and Arithmetic), how the ISS makes oxygen/Elektron (Thin Air), plant perception (The Leaves Are Wrong), atmospheric water generators (Condensation), generation ships (The Other Colony Ship), the psychology of spaceflight (The Quiet Mess Hall).

**Still honestly outstanding after this pass** (all art- or design-blocked, none engine-blocked): NPC portraits + scene background pools (need art), combat canvas FX (needs a subject sprite frame to target), the Ship's Log demo's full parchment chrome (polish), the distress_beacon_tag item's authored station follow-up (needs an acquisition path first — nothing grants the tag).

---

## What's NOT wired yet (honest gaps, for future content/polish work)

1. ~~Cruise's Stop Menu verbs don't do anything real yet.~~ **DONE (2026-07-01, Phase 4 session).** MINE, SCAN, REPAIR, forage (GATHER/HUNT/SCAVENGE by region), SALVAGE, and FABRICATOR are all real now. TRADE/WAIT FOR TRADER/REST still log the honest "isn't wired into the engine yet." message — out of scope for this pass, no engine-side system exists for any of them yet. Details:
   - **Minigames** (`engine/js/minigames.js`, from `demo-minigames.html`) — all 7 games (SCAN/ENGINE REPAIR/MEDICAL/FORAGE/SOLAR BRACE/HULL BREACH/SALVAGE) lifted essentially verbatim (already engine-ready per the earlier audit). New `window.openMinigame(id, opts, onDone)` entry point replaces the demo's own launcher grid; `onDone(tier, payload)` hands the result to whichever Stop Menu verb opened it. No "Play Again" button — one activation per verb click, closing the same exploit door the plan flagged for Mining's sector modifier. Markup lives in `#overlay-minigames` in `index.html`; MEDICAL and BRACE/BREACH aren't wired to any Stop Menu verb yet (no natural verb maps to them — they're crisis-event material, future work).
   - **Mining** (`engine/js/minigames/mining.js`, from `demo-mining.html`) — all 8 original `[STUB]` markers resolved. Sector modifier rolls once per map node and persists on `STATE.miningSectors[nodeId]` (re-opening MINE at the same node can't reroll for a better sector). Crew picker/`activeAi` read live `STATE.crew`/`STATE.activeAI`. `window.openMining(onDone)` entry point; MINE AGAIN loops for more runs in one visit, RETURN TO SHIP banks the whole visit's accumulated haul into `STATE.materials`, LEAVE bails with an empty haul (no time cost) if the player backs out before starting a run.
   - **Growbay** (`engine/js/screens/growbay.js`, from `demo-growbay.html`) — the demo's local `STATE` object (renamed `GSTATE` to free the identifier) is a **live reference** to a new `STATE.cropGrowth`, not a per-visit copy like Mining's — growth/health/day/tenderId/pest all persist and are caught up (per-day formula ported straight from the demo's own `advanceDay()` dev tool) every time the overlay opens, driven by real `STATE.daysElapsed` deltas. `CROP_META` (maturity/stages/sprites — presentation content crops.json doesn't carry) stays local; harvest yield amounts still come from `CROP_META.yield_amount` since crops.json only has per-leg drain numbers, not a per-harvest figure — **flagged as a genuine content gap, not silently invented**. Harvest correctly routes to `STATE.resources.food` or `.morale` per crop's `yield_label` (verified: zinnia grants morale, wheat grants food). Access point: click the Cruise crop card (`#crop-card-mini`) → `openGrowbay()`.
   - **Fabricator** (`engine/js/screens/fabricator.js`, from `demo-fabricator.html`) — **stayed a Stop Menu verb** rather than moving to Bible §18's bottom-row stopped-gated button (Cruise only exists while stopped in this engine — there's no "moving" state to gate against, so a second UI surface wouldn't buy anything; matches what Phase 2 already scaffolded). `MATERIALS`/`RECIPES` are now **derived from the real `materials.json`/`recipes.json`** instead of the demo's hardcoded mirror, which had drifted field names (`days`/`wear`/`desc` vs `craft_days`/`wear_cost`/`description`) and invented 4 extra recipes beyond the real 5 — those 4 (`radiation_shield`/`advanced_sensor`/`xeno_sample_kit`/`reactor_core`) are **dropped, not ported**, per CLAUDE.md's "don't invent content" rule. Two of the real 5 recipes (`fuel_cell`, `o2_canister`) require an item (`repair_fabricator`) that doesn't exist in `items.json` yet — same honest-gap pattern as the pre-existing `hull_patch` gap, they just stay locked. `FSTATE.stock`/`wear`/`broken` are live references onto `STATE.materials`/`STATE.fabricator` (getters/setters); `aboard`/`captainBg` recompute fresh from `STATE.crew`/`STATE.captain` every open. The demo's real-time rAF/setTimeout craft-progress animation is kept as cosmetic flavor (still fun to watch, keeps running via background timers if you close the overlay mid-craft); the actual time cost is paid as a lump sum to `STATE.daysElapsed` the moment a craft **starts** (matching every other verb's `settleMinigame()` pattern) rather than ticking incrementally with the animation, which would race against the rest of the engine's discrete day-advancement.
   - **Load-order pitfall hit once, worth flagging for future overlay ports:** `engine/js/*.js` files load via `<script src>` *before* `index.html`'s own inline `<script>` block has even declared `MOD`/`STATE`, let alone populated them via `loadAllModules()`. Any top-level (not-inside-a-function) code that reads `MOD.x`/`STATE.x` at parse time throws immediately (`ReferenceError`). `fabricator.js` hit this twice (a top-level `RECIPES = MOD.recipes...map(...)` and a top-level `STATE.fabricator = STATE.fabricator || {...}`) — fixed by moving both into `loadFabricatorData()`/`bindFabricatorState()`, called from `openFabricator()` instead of at module load. `mining.js`/`growbay.js`/`minigames.js` never had this bug since they only ever touch `MOD`/`STATE` inside function bodies invoked later. **Also hit once during the port:** an overly-broad find/replace deletion accidentally ate fabricator's real `renderAll()` and sort/filter-dropdown wiring along with the dev-only code it was meant to remove — caught via a function-name diff against the pre-deletion intermediate file before shipping. Worth diffing function/identifier names before/after any big deletion range on future ports.
   - Verified via Playwright for all 6 wired verbs: SCAN/REPAIR/SALVAGE/FORAGE played to a real result and closed cleanly back to Cruise with correct `STATE` deltas and AI-log messages; MINE walked through armed→crew-pick→play→haul→RETURN TO SHIP with sector persistence confirmed across 3 repeat visits to the same node; FABRICATOR opened showing exactly the real 5 recipes (2 correctly locked), crafted Hull Patch end-to-end (materials deducted 3 metal/2 scrap, `daysElapsed` +1, wear +1, claimed item landed in `STATE.items`). Zero console errors/pageerrors across every test (aside from expected background/bg-art probing 404s that already existed pre-Phase-4).
2. ~~There is no automatic day-ticking or travel-triggering from Cruise.~~ **DONE (2026-07-01, follow-up session).** Cruise's Stop/Resume flow now calls the real `travelTo()`/`selectEvent()` pool-draw. What changed:
   - `STATE.hubScreen` (`'screen-cruise'` normally, `'screen-map'` under `?debug=fixed_path`) added so `travelTo()`'s no-event branch and `advanceAfterEvent()`'s multi/zero-target fallback know which screen to return to instead of hardcoding `screen-map`. New `returnToHub()` helper in `index.html` centralizes this (`renderHUD()` + `showScreen(STATE.hubScreen)` + `renderMap()`/`renderCruise()`).
   - `cruise.js`'s `stop-btn` now has real Stop⇄Resume semantics (button text morphs, matching `demo-cruise.html`'s original intent): pressing it while stopped calls a new `attemptResume()` — reads `nextAvailableNodes()`, and if exactly one target exists, closes the Stop Menu and calls `travelTo(nextId)`, which fires `selectEvent()` and chains through consecutive event-less/eventful nodes exactly like the legacy `?debug=fixed_path` loop already did, landing back on Cruise via `returnToHub()` once the chain has nothing more to do.
   - **Edge case noted here originally as "known, correct" — it was NOT actually correct.** An unresolved fork having zero available next nodes is the right *symptom* description, but this session's Phase 4 text assumed a fork's own event would always resolve it. Phase 7 found and fixed a real bug where that assumption failed (wrong event winning the draw at a fork, plus a mismatched flag name in a second fork event) — see the Phase 7 section below for the full story. The "No route forward from here yet" message itself is still correct, honest UI for the *residual* case (a trail's 3rd+ fork after all dedicated fork-events are exhausted) — see gap #9 below.
   - Verified via Playwright (`page.evaluate(() => applySetupToState({...}))` to skip the wizard, then driving `#stop-btn` clicks): full lunar-trail walk from `node_spine_0` through a fork to `node_fork_0`, confirmed `STATE.currentId`/`daysElapsed` advance correctly, confirmed final screen is `screen-cruise` (not `screen-map`) once the chain runs dry, confirmed the fork's zero-route message, and confirmed `?debug=fixed_path` still reports `hubScreen: 'screen-map'` with no regressions. Zero console errors/pageerrors throughout.
3. ~~Combat is completely unwired.~~ **DONE (2026-07-01, Phase 5 session).** See the Phase 5 section above. Only the pirate scenario in `events_encounter.json` currently authors `triggerCombat`/`triggerRamResolve`/`triggerFleeResolve` choices — any future boarding/derelict/anomaly content that wants a fight just needs to add the same three fields, no engine changes required.
4. ~~Endings/failures still show the old crude placeholder `screen-end`.~~ **DONE (2026-07-01, Phase 6 session).** See the Phase 6 section above. Combat's defeat/failure paths already correctly route through the existing `checkFailure()`/`endRun()` machinery (verified in Phase 5), so Phase 6 had nothing extra to reconcile from Phase 5's side.
5. **NPC portraits, scene background pools** — still explicitly deferred per the plan, degrade gracefully, zero code changes needed when content lands. (`combat_log` flavor reconciliation, formerly also listed here as A7, is now done — see Phase 5 above.)
6. **No canvas FX layer for combat** (laser beams, particle destruction, targeting crosshair) — cut in Phase 5 for the reason above (no subject sprite frame exists to target). If/when NPC portrait art lands and a subject frame gets built for the encounter screen generally, combat's hit feedback could upgrade from the current screen-wide CSS flash to sprite-targeted FX at that point — no combat.js architecture changes needed, just richer visuals in the same hook points (`applyEnemyDamage`/`applyPlayerDamage`/`onEnemyDestroyed`).
7. **No emergency beacon mechanic** — Bible §17 mentions `no_fuel`'s `emergency_beacon_option` "becomes the final option" but doesn't specify what accepting rescue does mechanically; `failure_no_fuel_001`'s authored body/epitaph render as-is on the report card, `emergency_beacon_option: true` isn't read anywhere. Flag for a design pass, not an engine gap — needs the mechanic specified before it can be built.
8. **No health-decay mechanic feeds `crop_dead`** — `checkFailure()` checks `STATE.cropGrowth.health <= 0` (Phase 6), but nothing decrements health automatically yet (`growbay.js`'s daily catch-up only advances `growth`). Wired and ready; a future pest/threat/neglect mechanic needs zero `checkFailure()` changes to actually fire it.
9. **Only 2 fork-resolving events exist** (`event_general_001`, `event_general_002`, both `once:true`) but interstellar's map can generate up to 3 forks. Phase 7's fix guarantees this never softlocks (a 3rd+ fork falls back to reusing whichever `chose_alpha`/`chose_beta` an earlier fork already set — verified, not theoretical), but that 3rd fork gets no narrative moment of its own, just a silent route continuation. Needs either a 3rd `node_type: ["fork"]` event, or — a bigger change — per-fork-instance flag namespacing (`chose_alpha_<forkId>`) if forks should ever present genuinely independent choices within one run. The straightforward fix (author one more fork event) is the one to reach for first.
10. **`registry/flags.md` doesn't exist.** CLAUDE.md's own protocol requires every flag to be documented there (setter/checker/narrative meaning) but the file was never created — `chose_alpha`/`chose_beta`, `friendly_with_pirate_<species>`, `executed_surrendered_pirate`, `promenadeVendorPresent`, and others are all undocumented. Pre-existing gap, not introduced this session; surfaced here because Phase 7's fork-flag fix touched this exact territory.

---

## Quick orientation for a fresh session

- Read `/Users/MrDashiki/.claude/plans/vast-sprouting-codd.md` first (the approved plan — phase-by-phase detail, the two user-confirmed design decisions, critical file list).
- Then read this file for what's *actually* built vs. planned (some deliberate deviations noted above — reused `renderMap()` instead of porting `demo-map.html`'s visual system, simplified Cruise's ambiance systems, etc.).
- To verify current state before touching anything: `cd "Trans-plant" && python3 -m http.server 8177`, then Playwright via the nvm-node recipe in memory `reference_playwright.md`. Boot `http://localhost:8177/index.html` for the real title→setup→cruise flow, or `?debug=fixed_path` for the fast encounter/combat-content test loop.
- `node tools/lint_modules.js` before touching any module JSON content.
- `MEMORY.md` → `project_transplant_session.md` has a running log of this integration effort too, but this file is the authoritative single-document handoff.
- Phase 4 files, if you need to touch verb wiring: `engine/js/minigames.js` (+`resources/screen-minigames.css`), `engine/js/minigames/mining.js` (+`screen-mining.css`), `engine/js/screens/growbay.js` (+`screen-growbay.css`), `engine/js/screens/fabricator.js` (+`screen-fabricator.css`) — all four `<link>`/`<script src>` tags live in `index.html`'s `<head>`/pre-main-script area, all four overlay containers (`overlay-minigames`/`overlay-mining`/`overlay-growbay`/`overlay-fabricator`) are populated in `index.html`'s markup, and the verb→handler dispatch table (`VERB_HANDLERS`) lives in `cruise.js`.
- Phase 5 files, if you need to touch combat: `engine/js/combat.js` (+`resources/screen-combat.css`) — self-contained IIFE, only exposes `window.triggerCombat`/`triggerRamResolve`/`triggerFleeResolve`. `modules/events/events_encounter.json`'s pirate scenario is the only content author of these three fields so far. `modules/flavor/flavor_pools.json`'s `combat_log` block is now fully populated (placeholder-quality, matches every other flavor pool's current state).
- Phase 6 files, if you need to touch endings/failures: `engine/js/screens/endings.js` (+`resources/screen-end.css`) — self-contained IIFE, exposes `window.renderEndScreen`/`showEndReport`/`endBackToCinematic`. `index.html`'s `checkFailure()`/`triggerArrival()`/`scoreBracket()`/`endRun()` still own the STATE-level decision logic (which failure/ending module fires); `endings.js` only paints.
- **All 7 phases are done.** There is no Phase 8 in the original plan. Next work is content/polish, not engine architecture: flesh out the event pools (more entries per `node_type`/`trigger` so the weighted draw has real variety instead of drawing from 1-3 candidates most of the time), populate the remaining empty flavor pools, consider gap #9 above (a 3rd fork event) if interstellar's fork content feels thin in practice, and eventually a real content-writing pass per CLAUDE.md's "First Session Protocol" audit categories.

---

## Post-integration pass #11 (2026-08-03) — the scene-art port [DONE]

**The "no portrait art / no scene backgrounds" era is over.** Deferred-gaps #5 and #6 above are now closed — the art was on disk all along (~60 animated NPC characters, ~150 backgrounds, the full 21-PNG ship+plant overlay set); what was missing was engine wiring. This pass ported the demo-encounter systems into the engine proper.

**New file: `engine/js/scene_art.js`** (IIFE, load-order-safe, exposed as `window.SceneArt`):
- Probe-by-error background resolvers (flat file → numbered folder pool, jpg-preferred backdrops / png-preferred viewport sprites) with a session-long file-existence cache and per-event sticky picks (`clearRunCaches()` re-rolls per run — called from `applySetupToState`).
- `sceneSpecFor(ev, node, npcCtx)` — the scene_type → layer-spec map. Events author **no bg paths**; composition derives from `scene_type` + node + npc. Highlights: `ship_exterior` = bridge composition (`our_ship/bridge.png` chrome over starfield base + species-matched `ship_exterior/<disposition>/<species>` ship in the viewport cutout at 160,93 → 640×405); `station_interior` picks the room by npc job (medic→medbay, security→office, captain/engineer→dock, janitor→promenade, botanist→market, bartender→cantina); `planet_surface` sticky-rolls a biome per event; `anomaly` sticky-rolls distortion/fractal/void; nebula/asteroid node types get their space pools.
- NPC subject frame per Bible §11: numbered-variant probing (`<folder>/<N>/spritesheet.png` + `.json`), idle-frame detection from TexturePacker filenames (idle = the frame NOT named `frame_NNN`), talk-loop animation (engine has no typewriter — talk duration ∝ line length, settles on idle), fallback chain sheet → single portrait (`<folder>/1/<stem>.png`) → emoji. Comm-mode overlays (screen scanlines / corrupted glitch) land on the subject element; the old whole-backdrop hue-rotate is suppressed when real art is painted (`.has-bg-sprite`).
- `subjectFX('hit'|'destroyed'|'reset')` — combat portrait FX (shake+dim on enemy damage, whiteout-fade on destruction). Wired in `combat.js` `applyEnemyDamage`/`onEnemyDestroyed`. `applySubject` clears fx classes so a destroyed pirate never leaves the frame faded for the next event's guest.

**New file: `resources/screen-encounter-art.css`** — every selector scoped under `#screen-encounter` (screen-mining.css lesson). Subject frame at left:40 top:100 (240px), name plate below, backdrop layer stack, ship-bob, comm overlays, fx keyframes. **Combat mode overrides `--subj-top` to 168px** so the frame clears `.combat-hpbars` (top:60, ~90px tall) — verified by bounding-rect check.

**index.html:** markup adds `#enc-backdrop-base` + `#enc-backdrop-sprite` before the main backdrop (z-order via DOM order), subject frame + name plate; `renderEncounterState()` calls `SceneArt.render(ev, node, layer, npcCtx, interpolatedLine)`; `renderOutcomeView()` calls `SceneArt.renderOutcome(outcome, npcCtx)` (honors `scene_bg`/`scene_bg_base`/`scene_bg_sprite` outcome overrides per CLAUDE.md schema).

**Cruise ship crop overlay (`cruise.js` `syncShipSprite`)** — Bible "Ship Sprite System": `#ship-silhouette` now stacks `ships/<crop>/<stage 1-4>.png` over `ships/default.png` via CSS multiple backgrounds, stage = growth quartile, dead crop (health ≤ 0) or growth 0 reverts to base-only. `sweet_potato` maps to the `potato/` folder. Called at the top of `renderCruise()`.

**Verification:** 23-check Playwright battery (scratchpad `test_scene_art.js`) — pirate hail 3-layer composition + sheet + plate, ship-only event hides subject, medic clinic → medbay + portrait, all 5 crop-overlay states, fx classes — ALL PASSED, zero non-404 console errors (probe 404s are by design; fuzz already filters them). Combat visual check (`test_combat_scene.js`): OPEN FIRE → combat-mode, portrait visible, no HP-bar overlap. `lint_modules` clean (87 events / 312 choices). 6-run fuzz: all trails ended, VIOLATIONS none, ERRORS [].

**Still open (art/authoring, not engine):** deferred art list from the 2026-08-03 audit — `spritesheet_growbay_tanaka`, 3 cargo icons (`hull_patch`/`mystery_provisions`/`insulated_cargo_bay`), 9-frame talk animations for 4 NPC variants (trader/unknown/4, botanist/water/2, janitor/robot/3, janitor/unknown/1), packing janitor/unknown/2's loose frames into a sheet. Approach-mode animated station sheets (demo `resolveApproachSprite`) deliberately not ported — no engine surface uses that composition yet. Canvas laser-beam FX remains v2 polish (subject frame now exists, so the old blocker is gone).

**Pass #11 addendum (2026-08-03, later same day):** Art drops landed and wired — `spritesheet_growbay_tanaka` (user-fixed to 9 talk + idle; PNG was a 2× export, downscaled NEAREST to match JSON coords 426×392; **her sheet is flush-packed with NO 1px margins unlike every other growbay sheet** — coords in `growbay.js` `CREW_SHEETS` reflect that) + Tanaka added to growbay's `CREW` tender table (+3%/0, generic-crew tier) and `CREW_SHEET_KEY` (she was mapped in `ROLE_TO_CREWID` but filtered out for lacking a CREW entry — xenobiologist runs never saw her). `hull_patch.png` + `mystery_provisions.png` cargo icons added (user-generated). `janitor/unknown/2` loose frames packed into `spritesheet.png`+`.json` via PIL (Bible §11 layout: 9 talk in 3×3 grid 1px margins + idle at 295,1, TexturePacker JSON with idle = the non-`frame_NNN` filename) — janitor/unknown was the ONLY disposition/species combo with zero complete variants; live-verified resolving. **Fuzz caught a real scene_art bug**: rAF's tick timestamp can precede the `performance.now()` captured at `startTalking` → negative elapsed → `talkIdxs[-1]` → crash; fixed with `Math.max(0, …)` clamp. Fuzz harness now records pageerror STACKS, not just messages (that's how this was found). 6-run fuzz clean. Remaining NPC art gaps (talk frames needed, portrait exists): station_crew/botanist/water/2, station_crew/janitor/robot/3, station_crew/janitor/unknown/1 — all are extra pool variants; every disposition/species combo has ≥1 complete talking head. trader/unknown/4 landed later same day (user art was 2× + margin-less; repacked via PIL to the canonical 392×294/1px-margin grid — REPACK RULE: the engine ignores JSON x/y and uses its hard-coded NPC_FRAME_COORDS, so any sheet not packed on that exact grid renders with drift; always repack incoming NPC sheets from loose frames).

---

## Post-integration pass #12 (2026-08-03) — demo-parity + persistence + station life [DONE]

**Three project laws established this pass (also in memory as feedback_*):** (1) NO AUDIO — the user doesn't use sounds in their games; the sound plan stays dormant, never pitch it. (2) NOTHING ORPHANED — every new item/asset/flag gets both ends wired (grant AND payoff), preferring hooks into existing content. (3) DEMOS ARE CANON — demo design choices must survive engine ports; a dropped behavior is a bug unless the handoff records it as an approved cut.

**Demo-parity restorations (index.html + screen-encounter-art.css):**
- **Typewriter** (`typeInto`/`finishAllTyping`): narrator bodies type at 12ms, dialog at 26ms; talk animation stops exactly when the line finishes typing; click-to-complete; PauseBus honored; self-cancels if anything else (combat's setNarrCombat) writes the element directly.
- **Dialog strip re-anchored** under the subject frame (demo canon; was orphaned bottom-right), name span inside strip hidden (plate above names the speaker), hidden on no-subject.
- **Rich choice renderer**: gate badges (32×32 — crew gates use `sprites/interface/careers/<role>.png`, item gates `sprites/cargo/items/<item>.png`, gold `interface/gold.png`, locked `interface/lock.png`), effort pips (●○ 5-max), one-line `sub` labels, `risky`/`hint` accent strips, `dialog: true` italic labels.
- **Demo layer machinery the engine never got, now real**: `layer.npc` speaker override (subject frame + dialog name swap per layer; rolled species cached per event+layer; scene_art tracks a subject key separate from the event key), `layer.revisit` {body,line,ai} overrides (per-entry `STATE._layerVisits`), `choice.consume`/`consumedLabel` one-shots (persisted in `STATE.consumedActions`, keyed event@node so repeatable scenarios re-arm at the next station), `choice.showFlag`/`hideFlag` visibility (A8 softlock guard now judges the VISIBLE list), `layer.pose` → subject filter classes, `choice.gold_cost` (up-front charge for nav choices — gate.gold affords, gold_cost spends).
- **selectEvent: event-level `requires_item`** now honored (delivery events only fire while the story object is in cargo).

**Run persistence (localStorage `transplant_save_v1`):** autosaved on every cruise-hub repaint; Sets serialized; `?debug=` boots NEVER write (fuzz/Playwright isolation); endRun clears the slot; the title screen's Continue button (dormant since the title demo) now enables via MutationObserver when a save exists, green LED, resumes at cruise. `SAVED_FIELDS` list in index.html — ADD NEW PERSISTENT STATE FIELDS THERE. 8/8 Playwright checks.

**Content:** `event_general_028` "The Buoy With Opinions" (3rd fork — closes handoff gap #9), the beacon-tag arc (`event_general_029` "The Math, Later": requires relayed_the_mayday → grants distress_beacon_tag; `event_station_008` "Next of Kin": delivery to the dockmaster, morale +8, no gold on purpose), the **cantina** (`event_station_009` "The Long Dark Bar", ported from demo-encounter's station_cantina: robot bartender [resolveNpc jobNames now includes bartender], watchers courier thread [take job → +20g + classified_cargo + hideFlag collapses thread; payoff `event_station_010` "The Handoff" +30g/+25g, consumes cargo], off-duty engineer thread [5g drink via gold_cost → 3 tips → goodwill outcome], drink rumor → heard_nebula_rumor → `event_nebula_003` "Triple Rates, As Promised"), 5 alternate endings (legendary/good/rough/pyrrhic/hollow now 2+ variants each, 12 endings total), 3 more trail exclusives (lunar Traffic Control, mars Half-Built Relay, interstellar Last Radio Hour + science_link). **96 events / 347 choices / 120 flags** (flags.md regenerated — the generator script is inline in the session log, scans event+layer+outcome+variant setters/checkers incl. showFlag/hideFlag).

**Bugs found+fixed this pass:** growbay scene events silently bg-less (crop-NAMED pool vs numbered probe — scene map now resolves `our_ship/growbay/<crop>`), space/deep/7.jpg unreachable (probe max 6→8), bartender displayName fallback, engineer-drink gate-without-charge, A8 guard counting hidden choices, typewriter-vs-direct-write stomping. Verify battery: cantina 16/16, autosave 8/8, scene battery 23/23, matrix 55 combos/0 real flags, lint clean, fuzz clean.

**Still open (art/authoring only):** talk frames for 3 NPC pool variants (botanist/water/2, janitor/robot/3, janitor/unknown/1), thin bg pools, Ship's Log parchment chrome, canvas laser FX (v2 — subject frame exists now; would draw beam lines + particle scatter on the combat mode-swap). Tooltip primitive (.ui-tip, demo-tooltip.html) still not in shared — port when the consolidation audit runs.

---

## Post-integration pass #13 (2026-08-03) — combat canvas FX port [DONE]

**RECORD CORRECTION: demo-combat.html ALWAYS had the full canvas FX layer** — the Phase 5 port note ("no canvas FX... no subject sprite frame exists") described what the PORT dropped, and later docs mis-read it as "the demo never built it." The user caught this. Per demos-are-canon it was a dropped feature, now fully ported into `engine/js/combat.js` + `screen-combat.css` + two canvases in index.html:

- **Two canvases**: `#combat-fx-canvas` (beams/particles/sparks, clip-pathed to the bridge viewport cutout 160,93→800,498) + `#combat-cursor-canvas` (crosshair, unclipped). Shown only in `.combat-mode`.
- **Real TARGETING**: FIRE LASER → crosshair follows the mouse (cursor:none), click within 220px of the enemy ship to aim; beam launches from the viewport's bottom-center to the click point. CANCEL button offered. **Engine addition over the demo: an explicit FIRE AT CENTER action (+ Enter key)** so keyboard players and the fuzz harness can never wedge in TARGETING (fuzz clicks buttons only, and the aim click is on the scene). *Pass #14 replaced the original 1.6s auto-fire timer with this — the Bible says combat is strictly turn-based, no timers.*
- **Beams**: cyan (player) / red (enemy), additive glow, traveling head, impact radial. Enemy beams fire from the enemy ship center to a random point on the viewport's bottom edge.
- **Hit feedback**: enemy ship sprite hit-flash class + portrait shake (SceneArt.subjectFX kept), damage floaters (normal/crit variants rise from the enemy ship; player-hit variant rises over the HULL bar), MISS! popups on all miss paths (morale wobble, full dodge, FTL-spool), full-screen body shake + red hull vignette on taking damage.
- **Destruction sequence** (demo-canon timing): pre-explosion rattle 380ms → 160-particle debris field + 14 chunky slabs + 32-spark flash ring + screen shake → ship sprite fades → **captain's feed CRT-off** (static flicker overlay + vertical-line collapse, name plate fades) → 2.2s hold on empty space → SALVAGE/LEAVE choice. Replaced the old `subjectFX('destroyed')` whiteout on this path.
- **Stage reset**: combat aftermath (inline sprite opacity 0, CRT classes, combat-ended/hostile-gone) deliberately persists through the OUTCOME view (wreck stays gone while reading the result) and is fully reset by SceneArt.render when the NEXT event paints.
- Helper collision note: combat.js now has its own `rand`/`pickOne` (the file already had `irand`/`pick`); `clamp` remains the index.html late-bound global.

Verified: 11-check Playwright battery (TARGETING chrome, aim-click beam, auto-fire at ~1.66s, kill sequence with fade+CRT, next-event stage reset), lint clean, 6-run fuzz all trails VIOLATIONS none ERRORS none. Screenshot evidence: cyan beam + crosshair on the pirate ship inside the viewport.

---

## Restoration item 1 — engine-repair scene [DONE] (2026-08-03)

Ported `resources/demo-engine-repair.html` (demos-are-canon) into the engine per RESTORATION_PLAN.md item 1.

**Files:**
- `engine/js/minigames/engine_repair.js` (new, ~560 lines) — IIFE exposing `window.openEngineRepair(onDone)`. Full scene: 4 hotspot microgames via the openComp router (breaker bank ×4 clicks, ignition switches vs laminated reference, coolant-valve hold-gauge + silhouette-masked steam particles, fuel-junction ×3), spark/drip emitters tracked to hotspots, mask-tint pulsing fault highlights, pip row, AI quips with per-fault time costs ([Nh spent · Xh total]), lights-off end gate. All rAF loops honor PauseBus AND a `running` flag (loops stop when the overlay closes). No top-level MOD/STATE reads; all ids `er-`-prefixed.
- `resources/screen-engine-repair.css` (new, ~230 lines) — ALL demo CSS scoped under `#engrepair-root`, **including the CSS custom properties** (on the root container, not `:root`) and `er-`-prefixed keyframes. body.scene-fixed → #engrepair-root.scene-fixed. Devtool/size-toggle/bbox chrome dropped.
- `index.html` — `<link>` after screen-mining.css; `<div id="overlay-engrepair"><div id="engrepair-root">` empty-shell overlay (market pattern; module injects markup on first open) after #overlay-mining; `<script>` after mining.js.
- `engine/js/screens/cruise.js` `handleRepairVerb` — now calls `openEngineRepair`. The Simon-says `'engine'` minigame in minigames.js is untouched (still reachable via `launch_minigame`).

**Contract:** `onDone({ fixedCount, allFixed })`, fired exactly once. Cruise mapping preserves the old tier effects: allFixed → +20 hull (old 'perfect'), partial → +3 (old 'poor'), both + settleMinigame's 1-day cost; fixedCount 0 → no effect, no day (mirrors MINE's empty-handed LEAVE).

**Deviations from demo (all deliberate):**
1. **Failsafe LEAVE** — "RETURN TO BRIDGE / Abandon repairs" choice visible from scene entry (demo had no exit until all-fixed; engine can't wedge a run). Swaps to the demo's lights-toggle + gated-leave pair at the end state.
2. Resource HUD shows live STATE.resources (demo hardcoded values).
3. Demo's dangling `LIGHTS_HOLD` 4-frame ping-pong constant not ported — the demo itself never implemented the loop (code ends at the constant); lights-off is the single-image crossfade the demo actually ships.
4. `tools/fuzz_playthrough.js`: stub for `openEngineRepair` (random fixedCount 0-4, same pattern as the openMining stub), `overlay-engrepair` added to the force-hide list, and a **pre-existing latent flake exempted**: WAIT FOR TRADER at a fork node (fork→deep_space region) deliberately summons `event_encounter_trader_001`, which the draw-audit's fork rule flagged. Unrelated to this item.

**Verified:** sprites all exist on disk at `sprites/minigames/engine/` (bg ×3, fault overlays ×4, breaker ×2, switch ×4, valve ×2, junction ×2 — used verbatim). 21-check Playwright battery (scratchpad `test_engine_repair.js`): full 4-fault clear incl. real mousedown-hold valve win at ~1.6s, gated-leave no-op, lights-off unlock, onDone {4, true}, revisit re-faults, abandon resolves {1, false}, cruise verb applies +20 hull +1 day; pageerrors none (the only 404s are mining.js's pre-existing bg probes). lint_modules clean. FUZZ_RUNS=2: VIOLATIONS none, ERRORS [].

---

## Restoration item 2 — market modal [DONE]

**What shipped:** demo-encounter.html's VENDORS/openMarket market ported into the
engine. `#overlay-market` (index.html) now carries the demo's `#enc-market` chrome
markup plus a new `#market-log` running-log column; `resources/screen-market.css`
(new, linked in head) holds ONLY positioning + market-mode reflow, all scoped under
`#overlay-market` / `#screen-encounter.market-mode` (chrome + `.sinister` theme were
already shared via resources/shared.css). Host wiring lives in
`engine/js/screens/market.js` (new IIFE, loads with the other screen scripts, no
top-level MOD/STATE reads): `window.openMarket({sinister}, onClose)`.

**Engine contract:**
- Stock built at open time from items.json: purchasable × base_price shelves the
  normal OUTPOST TRADER (15 wares, stackables honored); sell side pays
  round(base_price × 2/3) — the demo outpost_trader ratio — for anything priced.
- Sinister BACK INVENTORY refills the demo's 45/60/35g black-market slots with real
  loot_only ids (drive_coil/o2_recycler/classified_cargo); fence mode keys on the
  real `trade_good` tag (fencePrices for artifact/bone/vinyl, default 20g). Demo-only
  ware ids never enter STATE (fabricator-recipe-port rule).
- Buying: `canAddCargo` hook added to shared.js MarketModal (optional, demos
  unaffected) gates capacity BEFORE any cost applies → refused buy leaves gold
  untouched; grants route through grantItem, never direct STATE.items pushes.
  All gold movement renderHUD()s. Six sprite-less ids get emoji ware icons.
- `choice.open_market: true` (+ optional `market_sinister: true`, `setFlag`) handled
  in handleChoiceClick after combat hijacks, before the flat-schema return — both
  schemas can host it; nav fields on the same choice are ignored (modal is the
  action). Sinister close returns to entryLayer + clears STATE.npcCtx (demo canon).
- Authored into: event_encounter_trader_001/intro ("BROWSE THE WARES"),
  event_station_001 (flat "Browse the equipment shop" choice UPGRADED to the live
  market, setFlag browsed_zeta4_shop kept), event_station_009/watchers ("SEE THE
  GOODS" — sinister). Station_003 considered and skipped: its premise is inflated
  prices, which the single vendor table would contradict.
- fuzz_playthrough.js stubs openMarket (instant close) — blind clicker would punch
  the hidden choice column behind a real modal.

**Verified:** 29-check Playwright battery (scratchpad `test_market.js`): open/stock/
gold readout, buy (100→88g, medkit lands via grantItem), full-hold refusal (gold
unchanged, deny logged), sell (+8g, deferred removal on close), close restores layer
+ choices, sinister chrome/LEAVE./entry-layer reset/npc cleared; pageerrors none.
lint_modules clean (96 events, 349 choices). FUZZ_RUNS=2: VIOLATIONS none, ERRORS [].

## Restoration item 3 — combat FX leftovers [DONE]

Ported the six remaining demo-combat.html presentation pieces into
engine/js/combat.js + resources/screen-combat.css + index.html:

1. **triggerFtlJumpEffect** (combat.js ~444) — combat-ftl-vanish shrink-fade
   on ship/captain/name plate + combat-ftl-flash white bloom (flash div
   created per-jump, self-removes at 900ms) + ~3s empty-bridge beat. Called
   by BOTH enemyRetreats (~896) and the escape path in advanceFtlIfNeeded
   (~917, after the existing 700ms final-shot beat). Vanish classes persist
   through the outcome view on purpose; SceneArt.render()'s new-event reset
   (scene_art.js ~496) strips them + sweeps orphaned flash divs.
2. **spawnEnemyChargeParticles** (~411) + combat-enemy-charge — cyan
   convergence into the enemy hull before retreat; wave-2 stagger via
   negative particle life (combatFxLoop skips life<0).
3. **combat-alert-strip** — 4 divs in index.html (#screen-encounter combat
   chrome section) + CSS frame around the 640×405 cutout; shown in
   .combat-mode, killed by .combat-ended (added at retreat + FTL-complete).
4. **combat-low-hp** — toggled in applyEnemyDamage (~934) at ≤35% hull;
   cleared at teardown + SceneArt reset.
5. **combat-ftl-charging** — added in beginFtlCharge (~713); removed at
   abortFtl, surrender offer, PLAYER_TURN restore, retreat, FTL complete,
   onEnemyDestroyed, endCombatToOutcome (all demo removal sites mirrored;
   demo's dev-panel site has no engine analog).
6. **Xeno nameplate reveal** (~1307) — `PIRATE · SPECIES [NNHP · WILL
   SURRENDER/FIGHTS TO DEATH]` at mount when identifiedByXeno; repainted to
   plain displayName by applySubject on the next event.

CSS note: the two sprite animations (enemy-charge, low-hp) are scoped under
`#screen-encounter.combat-mode` — screen-encounter-art.css loads after
screen-combat.css and its `.enc-backdrop-sprite.bobbing` animation would win
the cascade at demo specificity.

**Verified:** 23-check Playwright battery (scratchpad `test_combat_fx2.js`):
xeno plates both variants (ROCK 65HP FIGHTS TO DEATH / HUMAN 50HP WILL
SURRENDER), 4 strips visible in combat then hidden on combat-ended,
ftl-charging class through spool, escape vanish+flash → outcome with ship
still gone, forced enemy retreat (Math.random patch at ≤30% foe hull) →
charge class + particles → vanish → ENEMY FLED outcome, low-hp glow seen,
full stage reset on next event; pageerrors none. Computed-style probe:
opacity 0 / scale(0.18) on all three vanished elements. lint_modules clean
(96 events, 349 choices). FUZZ_RUNS=2: VIOLATIONS none, ERRORS [].

---

## Restoration item 4 — crew dossiers + active skills [DONE]

Ported demo-crew.html into the engine: cruise crew-strip slots (captain
included) click-open a `.cd-*` dossier modal — portrait + cycle chevrons
(click or ←/→), HP-driven glow, HEALTH/MORALE bars, bio + hint
(roster `narrative_unlocks[0]`), status band (wounded promotes at HP<40,
morale crisis at <25; rest are monitored stubs), passive card, active
card with USE + charges, dismiss/jettison confirm + blood-spark anim +
flavor-pool epitaph overlay.

**Files:** `engine/js/screens/crew.js` (new, `window.openCrewDetail(role)`,
'captain' = reduced captain card), `resources/screen-crew.css` (new, all
scoped under `#overlay-crew`), index.html (`#overlay-crew` shell, css/script
tags, `crewSkillCharges` state helpers + SAVED_FIELDS entry, travelTo
station recharge + `opts.skipEvent`, Emergency Patch hull-absorb branch in
applyOutcomeEffects), cruise.js (slot click), market.js (Negotiation
discount), lint ENGINE_SET_FLAGS + flags.md (2 engine flags).

**Charges:** `STATE.crewSkillCharges {role: usesRemaining}` — seeded in
applySetupToState/initState from roster `uses_per_leg`, lazily backfilled
for legacy saves (`ensureCrewSkillCharges()`), persisted in SAVED_FIELDS,
restored by travelTo() on station arrival per authored `recharges_at:
'station'` (the roster's `uses_per_leg` is the cap, not a per-leg reset —
"1 / 1 USES · RECHARGES AT STATION" is the demo-canon reading).

**Skill → engine-hook mapping (roster `active_skill.effect` → implementation):**

| Role | Authored effect | Engine hook |
|---|---|---|
| botanist | `{crop_health: 15}` | `STATE.cropGrowth.health +15` (refuses if no/dead/full crop) |
| engineer | `{hull_damage_prevented: 1}` | arms `emergency_patch_armed` flag; applyOutcomeEffects absorbs the next negative-hull event delta, logs, clears |
| medic | `{heal_crew: 1}` | worst-injured `STATE.crewHP` role → 100 (refuses if nobody hurt) |
| pilot | `{skip_node: true, fuel_cost_multiplier: 2}` | −10 fuel + `travelTo(next, {skipEvent:true})` — jumps the next node with NO event; refuses at forks/dead-ends/arrival (JUDGMENT CALL: travel has no per-leg fuel line item yet, so "double fuel" = flat 10) |
| chef | `{morale: 10, food_cost: 5}` | morale +10, food −5 |
| xenobiologist | `{reveal_biological_properties: true}` | logs the authored `gameplay_effect` of the first biological/alien/unknown-tagged cargo item (JUDGMENT CALL: item-knowledge surface is the log; refuses with none aboard) |
| diplomat | `{unlock_peaceful_resolution: true}` | arms `negotiation_prepared` → 15% off next station market (JUDGMENT CALL: peaceful encounter options are already presence-gated on the diplomat, so the one-shot maps to the skill's other authored line "talk stations into better deals") |
| captain | no roster entry | reduced card: background bonus as passive (table copied from setup.js), no active, no dismiss (demo rule: captain is the player) |

**Dismiss/jettison:** safe dropoff = station/planet node (demo's
station/allied_ship/habitable_world). Safe → grayscale fade + local
dismissal line; unsafe → spin-jettison + splat + epitaph from
`flavor_pools.crew_epitaphs` (same line shown in overlay AND pushed to
the cruise log), `crew_lost` flag set. Removal is a plain STATE.crew
splice (+crewHP/charges cleanup) so every gate consequence follows;
checkFailure() runs after (crew_gone is reachable by dismissing your
last crew).

**Verified:** 35-check Playwright battery (scratchpad `test_crew.js`,
screenshots shot_crew_dossier/epitaph.png): all checks green, pageerrors
none; dossier ESC closes without opening the pause menu (capture-phase,
market.js pattern); epitaph/departure can't wedge (ESC honored at every
stage). lint_modules clean (96 events, 349 choices). FUZZ_RUNS=2:
VIOLATIONS none, ERRORS [].

---

## Restoration item 5 — orders system [DONE]

**What landed (2026-08-03):** demo-orders.html ported into the engine as
a REAL mechanics layer. `STATE.orders = { pace, rations, waterSplit }`
(defaults `ridiculous` / `standard` / `50`, in SAVED_FIELDS, backfilled
into pre-orders saves by `ensureOrders()`); the dead cruise readout at
index.html #cruise-readout is live (renderCruise paints it from
STATE.orders; clicking any cell opens `window.openOrders()`); the modal
is demo-faithful chrome (three sections, tier pills with teal
saved-current markers, 15–85 water slider, live projections with
⚠ doom-flags, per-AI quip line with hover audition) in
`engine/js/screens/orders.js` + `resources/screen-orders.css`
(scoped under `#overlay-orders`, od-prefixed ids) + static markup in
index.html (overlay-market pattern).

**Multiplier tables (demo numbers verbatim):**

| PACE | etaMult (days/leg) | fuelMult | drainMult (crew) |
|---|---|---|---|
| LIGHT SPEED | 1.35 | 0.6 | 0.6 |
| RIDICULOUS SPEED (default) | 1.0 | 1.0 | 1.0 |
| LUDICROUS SPEED | 0.78 | 1.6 | 1.4 |
| PLAID | 0.55 | 2.4 | 2.0 |

| RATIONS | foodMult | morale/day | label |
|---|---|---|---|
| VENDING MACHINE | 0.5 | −0.3 | FALLING |
| STANDARD (default) | 1.0 | 0 | STEADY |
| PIG OUT | 1.5 | +0.15 | RISING |

**Engine-scale base rates (ORDERS_BASE, index.html)** — demo stock
units don't map to 0-100 resources, so the multipliers ride on these:
travel-day budget ≈ 55% of baseDays spread across the generated map's
node count (`legDaysFrac 0.55` → lunar ≈5d/leg, mars ≈10, interstellar
≈13 at RIDICULOUS); fuel 3/leg; food 0.2/day; ship water stock
0.15/day; pace morale ±(drainMult−1)×0.25/day on travel days only;
crew-water pressure per demo crewDrainRate tiers (0/1/3/6) mapped to
morale −0/−0.1/−0.5/−1.2 per day, plus crew HP −1/day (via damageCrew,
medic-softened) at the driest tier only.

**Mechanics wiring:** `travelTo()` charges every leg (incl. arrival +
Push Engines legs) `legTravelCost()` = {days×etaMult, fuel×fuelMult},
then checkFailure — you can now run the tank or the clock dry mid-leg.
ALL day advancement routes through the one `passDays(days, opts)`
helper (event time_cost in applyOutcomeEffects, cruise settleMinigame /
wait-for-trader, growbay TREAT, fabricator crafts), so rations/water
drains apply uniformly. Pilot's Push Engines now genuinely
double-charges the leg's actual fuel (pre-burns 1× extra in crew.js;
travelTo charges the flown 1×) instead of the flat −10 stopgap.

**Water unification (dual-drain, USER-CONFIRMED):**
`STATE.orders.waterSplit` is canonical; growbay's
`cropGrowth.waterPlant` is a synced alias (growbay's growth/health tick
still reads it). One write point `setWaterSplit()`; growbay's mini
slider commit and the orders slider both call it; `bindGrowbayState()`
re-syncs on every tick. Plant side = growbay's existing per-day
health/growth math; crew side = the new daily morale/HP pressure above.
Growbay's `openOrders` "isn't wired yet" stub deleted — orders.js owns
`window.openOrders` now.

**Projections (modal):** remaining legs via BFS over connects_to
(handles fork {alpha:[],beta:[]} shape) × (legDays×etaMult + 2d avg
event cost) → projectedArrivalDay; fuelEmptyDay from fuel/legs-of-fuel;
foodEmptyDay from real food ÷ daily burn; cropMatureDay from real
growth/health + CROP_META water_need/maturity_days (growbay's new
`window.cropMetaOf` export); crewCriticalDay from the demo drain tiers.
Warnings: fuel/food empty before arrival, crop matures after arrival,
crew critical before arrival.

**Balance drift (documented):** pre-orders, per-day costs didn't exist
(days only moved via time_cost) — fuzz arrived at day 13/44/53. With
default orders the same random playthroughs arrive at ~day 61/146/220
of 120/240/400 and still MAKE IT on all three trails (probe: lunar
fuel 62 · food 88 remaining; mars 48/72; interstellar 13/61 — fuel is
now genuinely tense on interstellar, which is the demo's intended
knife-edge). Real drift accepted per the item's purpose: pace/rations/
water are REAL now; crops can actually mature in-flight (runs are long
enough); LIGHT SPEED on lunar legitimately risks the clock.

**Verified:** 35-check Playwright battery (scratchpad `test_orders.js`,
screenshot shot_orders_modal.png) — readout defaults + click-to-open,
PLAID leg measured 3→7.2 fuel and 5→3 days vs default, rations drift
measured over 10 ticked days (−2/−3/−1 food, 0/+1.5/−3 morale),
slider↔growbay lockstep both directions, dual-drain pressure both
sides, projections react, save/load round-trips orders, ESC/backdrop/
hammering never wedges, pageerrors none. `FUZZ_RUNS=3` (one per
trail): all reach screen-end, VIOLATIONS none, ERRORS [].
lint_modules clean (96 events, 349 choices).

---

## Restoration items 6-10 (2026-08-03) [DONE] — RESTORATION PLAN COMPLETE

Items 6+7 done inline (subagent spend-limit): **Ship's Log parchment chrome** (paper journal card, per-type LEDs [death red / sci orange], memorial expand: .death-mode dark slate + desaturated crew portrait via crewIconCss or † fallback + "IN MEMORIAM · NAME"; killCrew pushes {type:'death', crewId, crewName, expand}; pushLogEntry persists type/crewId/crewName, auto-types 'sci' for link entries). **Inventory rich UI** (GEAR/RESOURCES tabs = items/materials, sprite grid tiles with count badges, detail panel with slots + fence value + description, jettison behind confirm dialog "The airlock does not do refunds"). Item 8 smalls: **leave row** (layered events, entry layer only, suppressed by ev.no_leave [set on the pirate — FLEE is the authored exit] / layer.leaveHidden; ev.leave_label override), **cost tooltips** via title= (demo's own stopgap; .ui-tip stays parked), **bartender model names** (BARTENDER_NAMES pool, hash-stable per station node, in resolveNpc + resolveLayerNpc), **choice entrance cascade + click pulse**, **cruise log typewriter** (pushLogEntry types entries, PauseBus-guarded, aborts if re-rendered), **own-crew talking heads** (scene_art crew path: CREW_SHEET_IDS from sprites/crew_sprites, frame 0 idle / 1-8 talk, dims read from PNG; `crew_id` on layer/event → subject; authored osei on event_shipboard_002), stale comments fixed. Item 9: **map ship marker** (.map-here "▲ YOU ARE HERE", bobbing, side-aware) + **branch_flavor labels** rendered (orphan closed). **REGRESSION FIXED during review: screen-encounter-art.css subject border vars had been moved into .combat-mode by an earlier merge — non-combat frames were borderless; restored to base scope.**

Final battery: lint clean (96 events/349 choices), test_scene_art + test_cantina (updated for bartender names) + test_orders + test_log_inv + test_smalls ALL PASSED, FUZZ_RUNS=3 all trails VIOLATIONS none ERRORS []. The RESTORATION_PLAN.md queue is fully executed: engine-repair scene, market modal, combat FX leftovers, crew dossiers + active skills, orders system, log chrome, inventory UI, all smalls, map touches.

---

## Third permanent harness: `tools/ui_sweep.js` (2026-08-04)

lint checks content, fuzz checks the engine — NEITHER touches the UI (fuzz calls applySetupToState directly). The setup-wizard bug the owner found by hand (NEXT looked enabled with no choice made, and Launch would have wrecked the run) was invisible to both. `ui_sweep.js` drives the REAL clickable game: real wizard walkthrough (single-select steps must refuse with nothing picked; crew's solo-run confirm is deliberate), a dead-control sweep on the cruise hub (every visible control must either change the page signature or look disabled — looks-enabled-but-inert and looks-disabled-but-acted are both flagged), interior sweeps of every overlay it opens, a working-close check on every overlay (its own close-ish button must close it; ESC is NOT used as a fallback because ESC opens the pause menu), the Stop Menu verbs (Stop⇄Resume is TRAVEL, never "close"; summoned events get clicked through back to the hub), and real clicks through a layered encounter.

**First real catch:** the growbay's X close button did nothing — `window.closeModal` was defined by BOTH growbay.js and fabricator.js (each demo had its own), fabricator loads later and won, so the growbay X closed the fabricator. Fixed by renaming to `closeGrowbay`/`closeFabricator` (inline onclicks in index.html + internal callers). **Now guarded permanently: lint_modules.js scans engine/js + shared.js for any `window.X =` assigned in more than one file and errors.**

**RUN ALL THREE AFTER ANY CHANGE:** `node tools/lint_modules.js` · `tools/fuzz_playthrough.js` · `tools/ui_sweep.js` (Playwright via the nvm recipe; server on 8177).

**ui_sweep catches #2–#4 (same day):** (2) TRADE / WAIT FOR TRADER summoned a trader at the parked node, but resolving it called advanceAfterEvent → travelTo(next) — you were flung down the trail; now `STATE.summonedEvent` (set by both verbs) makes advanceAfterEvent returnToHub() at the same node. (3) `checkFailure` fired `crew_gone` ("Autopilot") on `crew.length === 0` — but the wizard permits solo launches and `solo_run` content exists; a solo captain died on day 2. Now killCrew sets `all_crew_dead` when the last crew member DIES and crew_gone requires it; dismissals and solo starts are valid runs. (4) Re-clicking the active inventory tab wiped the selected item's detail — guarded. Harness design notes: page signature EXCLUDES the cruise log (typewriter changes text over time → false "acted"); current tabs/selections (.active/.selected) count as inert-OK; summoned-event click-through prefers the LAST choice (walk-away row) so re-enterable choices like BROWSE THE WARES can't loop it.

---

## Pass #14 — Codex independent review, merged with owner decisions (2026-08-29)

Branch `review/codex-2026-08-29`. Codex's cold review (`resources/CODEX_REVIEW_REPORT.md`) found 10 real defects, all fixed in e42f10a — read §1 of that report; it is accurate. Its viewport-scale fix (C9) broke combat aim mapping under `scale(<1)`; fixed in 1fcc2e8 (`screenScale()` in combat.js — **every clientX/Y → 960×640 mapping must divide by the cabinet scale**).

Owner rulings on the report's §2 disputes, all implemented:

1. **Interstellar fuel balance** — `ORDERS_BASE.fuelPerLeg: 3` became `travelFuelBudget: 30` spread over the trail's authored `total_nodes` (`fuelPerLegBase()`, also used by the Orders projection). Lunar unchanged at 3/leg, Mars 2.3, Interstellar 2.0. Unstubbed RIDICULOUS run: Interstellar arrives day 188 with 28 fuel (was 16 and 0 in the two review samples). Morale on the long trail is still the tight resource (24 at arrival) — watched, not tuned.
2. **Auto-fire timer removed.** TARGETING now offers `FIRE AT CENTER` (button, `.combat-fire`) + Enter key; both call `fireAtCenter()` → `resolveFire()` at the ship centre with the old jitter. No timers in combat. `FX.autoFireTimer` is gone.
3. **Crew active skills made real.**
   - *Xenobiologist Field Analysis*: examines one un-analysed biological/unknown item, sets `analyzed_<itemId>`; the item's new authored `analysis` line (items.json — alien_seed_pod, suspicious_fungus, mystery_provisions) shows in the cargo detail AND replaces the sub-label of any encounter choice that needs/spends that item (`ANALYZED · …`) — the consequence is revealed before commit. Add an `analysis` line to any future biological/unknown item or the skill will refuse it.
   - *Diplomat Negotiation*: `negotiation_prepared` now unlocks an **"Invoke the prepared terms"** choice in the three hostile hails (pirate_001, boarding_001, general pirate tribute) — free, clean passage, `sets_flag negotiated_pirate`, spends the flag via the new outcome key **`clears_flag`** (applyOutcome). The station-market −15% remains as the second consumer; whichever fires first spends it.
4. **ARIA exclamation points are canon, not a defect.** The CLAUDE.md voice rule said CHIP only; the Bible's ARIA ("Relentlessly positive", sample line full of them) and all 112 ARIA lines since the first event say otherwise. The rule was wrong; corrected to CHIP + ARIA. Nothing rewritten.

Verified: lint clean (96 events / 352 choices), FUZZ_RUNS=3 all trails ended, ui_sweep FLAGS/ERRORS none, Codex probe 10/10, feature battery (per-trail fuel, FIRE AT CENTER + Enter, analysis flag + cargo detail + choice sub reveal, prepared-terms choice present/absent/spent) all pass, pageerrors none.

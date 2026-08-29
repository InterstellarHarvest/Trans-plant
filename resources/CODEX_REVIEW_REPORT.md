# Independent Codex review — 2026-08-29

Branch: `review/codex-2026-08-29`  
Reviewed base: `9b87764`  
Fix commit: `e42f10a` (`Fix adversarial interaction and persistence defects`)

## Executive finding

The game is substantially more complete than a passing harness alone proves, but the cold pass found ten reachable defects. The most consequential were fake save/load slots in the finished pause menu, pause guards that never actually observed the shared pause bus, stale combat presentation on a repeated event ID, and a lethal last-crew airlock path that did not produce `crew_gone`. All clear-cut defects below were fixed in `e42f10a`; the required lint, four-run fuzz, and UI harnesses are green afterward.

The balance judgment is less favorable than the existing handoff: RIDICULOUS is comfortable on Lunar and Mars under the review policy, but two independent Interstellar runs ended from a depleted resource. PLAID is a real gamble on Lunar and an early fuel-loss setting on Mars/Interstellar, not a cheat.

## 1. Confirmed defects, reproductions, and fixes

All fixes in this section are in `e42f10a`.

### C1 — Pause save/load slots were fake (`resources/shared.js:1168`, `index.html:1698`)

- Repro: Pause → SAVE GAME → SAVE wrote only `{ts,label}`. Pause → LOAD then displayed `cosmetic — no state restored` while leaving the run untouched.
- Observed: a finished, reachable control represented persistence but had no state connection.
- Expected: slots save and restore the same evolving subsystems as Continue, without allowing an unresolved encounter to be snapshotted.
- Fix: `saveRun(key)`/`loadRun(key)` now accept a slot key, snapshots carry a timestamp, and the pause slots call those engine hooks. Saving while `STATE.currentEvent` is active is refused; loading always clears transient encounter state and returns to Cruise. Standalone demos retain their explicitly cosmetic preview.
- Verification: the focused probe saved a slot with PLAID/PIG OUT/73% water plus HP, log, stowaway, crop, combat aftermath, warning cache, fabricator, consumed actions, charges, flags, and seen events; it mutated the live state, loaded through the pause UI, and recovered every field at `screen-cruise`. The slot remained byte-identical while an encounter was active.

### C2 — Pause-aware loops were not connected to the pause bus (`resources/shared.js:885`, `engine/js/combat.js:602`)

- Repro: `PauseBus` was a top-level `const`, but engine guards used `window.PauseBus`. In a classic script, that lexical binding is not a `window` property, so the guards were false and combat FX, targeting fallback, NPC talking, and typed logs continued behind Pause.
- Observed: pausing during the 1.6 s targeting window allowed the fallback to fire.
- Expected: no game action occurs during Pause; resuming should provide thinking time rather than consume it.
- Fix: publish the single bus as `window.PauseBus`. The targeting fallback now waits while paused and starts a fresh 1.6 s aim window after resume.
- Verification: after 1.9 s paused, combat remained in targeting; it was still targeting 1.2 s after resume.

### C3 — Re-entering the same event ID could retain dead combat art (`engine/js/scene_art.js:510`, `index.html:2865`)

- Repro: enter `event_encounter_pirate_001`, end/leave it, then encounter that same authored ID later. SceneArt's ID-key short circuit could skip reset work, preserving `.combat-ended`, `.hostile-gone`, inline sprite opacity `0`, or CRT-off classes.
- Observed: the later encounter could render an absent or powered-off subject.
- Expected: sticky art selection may be keyed by authored ID, but presentation state belongs to one entry.
- Fix: `SceneArt.beginEvent()` resets entry-local scene keys, talking state, and active sheet; `enterEvent()` calls it before every render.
- Verification: the probe poisoned all listed classes/styles, returned to hub, re-entered the same ID, and observed all of them clean.

### C4 — Slow sprite probing could restart talking after text finished (`engine/js/scene_art.js:399`)

- Repro: delay the probe image's `onload` by 100 ms, type a one-character line at 1 ms, and let `stopTalking()` run before the sheet resolves.
- Observed: `_pendingLine` survived; the late probe started the talk loop after the line had completed.
- Expected: finished typewriter text leaves the NPC on its idle frame.
- Fix: `stopTalking()` now clears `_pendingLine` as well as the live rAF.
- Verification: at 900 ms, the text was `x` and the frame remained idle (`--frame-x: 295`).

### C5 — A normal double-click could skip an outcome (`index.html:3269`)

- Repro: physically double-click the first unlocked choice in `event_general_030`. The first click replaced the choice with Continue at the same coordinates; the second click activated the new button.
- Observed: the OUTCOME screen was skipped, sometimes advancing into the next event.
- Expected: one physical double-click resolves one authored choice and leaves its result visible.
- Fix: all encounter choices, leave rows, and Advance buttons share a 300 ms action lock across re-renders.
- Verification: the double-click now remains in `event_general_030`, `outcomeMode: true`, title `OUTCOME`.

### C6 — Engine-repair completion could close the next component (`engine/js/minigames/engine_repair.js:319`)

- Repro: reset all four breakers, close their component panel during the 350 ms success beat, then open Ignition Array.
- Observed: the breaker's delayed callback called the generic `closeComp()` and closed Ignition Array.
- Expected: a completion callback may mark its own component fixed but cannot close a newer panel.
- Fix: delayed completion captures the component and closes only if that component is still active and the minigame still runs. The same guard covers breaker, switches, valve, and junction.
- Verification: after 450 ms, Breaker Bank was fixed and Ignition Array remained open.

### C7 — One jettison confirmation could remove two units (`index.html:2226`, `index.html:2311`)

- Repro: carry two repair kits and dispatch two click events on OPEN THE AIRLOCK after one confirmation.
- Observed: the shared selection remained live and both copies were removed.
- Expected: one confirmation authorizes one unit.
- Fix: confirmation now captures and consumes a one-shot pending item before mutation and validates `indexOf`.
- Verification: two confirmation events left exactly one of two repair kits.

### C8 — Airlocking the last crew member did not count as all crew dead (`engine/js/screens/crew.js:601`, `index.html:3777`)

- Repro: at a non-station/non-planet node, open the only crew dossier and confirm JETTISON CREW.
- Observed: `crew_lost` was set, the roster became empty, but `all_crew_dead` was not set; the ship continued as a voluntary solo run.
- Expected: safe dismissal can create a valid solo run, but the UI explicitly describes the unsafe branch as lethal, so ejecting the last person must reach `crew_gone`.
- Fix: the unsafe branch sets `all_crew_dead` when it empties the roster.
- Verification: a safe station dismissal left `ended:false`, zero crew, and no death flag; the equivalent deep-space jettison ended at `screen-end` with `all_crew_dead:true`.

### C9 — The fixed cabinet clipped on smaller viewports (`index.html:71`, `index.html:2211`)

- Repro: resize to 800×600.
- Observed on the live build in Chromium and Firefox: game rect `800×640`, top `-20`; the top and bottom were clipped.
- Expected: retain the canonical 960×640 internal coordinate system while keeping the cabinet playable.
- Fix: prevent flex shrink and scale the complete cabinet by `min(1, width/960, height/640)` on resize.
- Verification: local Chromium and Firefox both report `800×533`, top `33`, with neither axis clipped; pointer-driven UI tests remain green.

### C10 — Audio controls violated the no-audio law (`resources/shared.js:1097`)

- Repro: Pause → SETTINGS exposed persistent SFX VOLUME and MUSIC VOLUME controls, albeit labeled STUB.
- Observed: the UI promised future sound in a project whose rule is “No audio, ever.”
- Expected: no audio surface.
- Fix: removed both audio rows and their range persistence handler. A repository search finds no remaining `SFX VOLUME`, `MUSIC VOLUME`, or “mute audio” surface.

## 2. Disputed judgment calls

### Orders balance

The base rates are internally coherent: fuel is charged once per flown leg, while event/repair/rest days drain daily resources; merely opening Stop costs no time. I would keep that model. I would not call the current default fair on all three trails yet.

Unstubbed, real-click RIDICULOUS runs (pilot captain, engineer + botanist, sweet potato, retreat preferred) produced:

| Trail | Day | Fuel | Food | Water | Hull | Morale | Result |
|---|---:|---:|---:|---:|---:|---:|---|
| Lunar | 66 | 55 | 86.8 | 90.1 | 100 | 63.4 | ending reached |
| Mars | 132 | 34 | 73.6 | 80.2 | 84 | 41.8 | ending reached |
| Interstellar | 184 | 16 | 63.2 | 72.4 | 76 | 0 | mutiny ending |

An earlier independent RIDICULOUS Interstellar sample ended at day 179 with fuel 0. These are not proof of an impossible route—the event stream and simplistic action policy matter—but they are two separate failures on the one trail whose greater leg count amplifies the same per-leg fuel constant. I recommend a larger seeded balance batch before declaring all three defaults fair.

PLAID is not a cheat. One real-click set ended Lunar at day 34 with 13.6 fuel, Mars at day 50 with 0 fuel, and Interstellar at day 55 with 0 fuel. It is a viable Lunar gamble and a conspicuous long-trail trap. The Orders preview and AI warnings are candid, so I did not change it.

There is also a stock/allocation mismatch: `index.html:2699` computes crew-water pressure from the split even when the ship has no water, while `engine/js/screens/growbay.js:286` correctly damages the crop at zero stock. A crew can therefore remain “NOMINAL” on an empty tank. I would make zero stock override the allocation tier, but left this as a balance/UX decision.

### Crew active skills

Botanist, Engineer, Medic, Pilot, and Chef have concrete effects that match their authored intent closely enough. Two mappings do not:

- Xenobiologist Field Analysis (`engine/js/screens/crew.js:307`) only appends the item's already-authored description/effect to the log. It creates no identified state and does not reveal a consequence before the player commits, so the authored promise is not mechanically fulfilled.
- Diplomat Negotiation (`engine/js/screens/crew.js:317`) arms a one-market 15% discount. Peaceful encounter options are merely presence-gated. That is useful, but it substitutes the roster's secondary “better deals” sentence for the active effect's `unlock_peaceful_resolution` contract.

I did not rewrite either because both require a product decision about how much outcome information to reveal and which encounters should gain a new branch.

### The 1.6 second auto-fire fallback

The post-combat/end guard is sound (`engine/js/combat.js:604`, `engine/js/combat.js:1113`): combat cleanup clears the timer, and the callback also requires active TARGETING state. The pause race is fixed.

I still disagree with the fallback itself. GAME_BIBLE combat says strictly turn-based, with no timers or cooldowns; a forced shot after 1.6 seconds makes aiming real-time and is too short for deliberate pointer play. “Keyboard players and the fuzz harness” is not sufficient because no keyboard target selection is exposed. Prefer an explicit FIRE AT CENTER keyboard/button action, or an accessibility option. I left the behavior unchanged because removing it would strand the current keyboard/fuzz path.

### `crew_gone` semantics

The documented decision is correct: solo launch and safe dismissal are player choices, not deaths. `checkFailure()` requires both an empty roster and `all_crew_dead`, and the focused probe confirms a station dismissal can travel onward. Only the lethal airlock edge was defective and was fixed in C8.

### Summoned trader return

Keep the current behavior. `advanceAfterEvent()` consumes `STATE.summonedEvent`, calls `returnToHub()`, and does not call `travelTo()` (`index.html:3742`). The trade/wait action is an activity at the current stop; silently advancing would charge a leg the player did not choose.

## 3. Cross-browser findings

### Chromium

- Live URL loaded with no captured console/page errors.
- Verified combat `clip-path: inset(93px 160px 142px)`, `image-rendering: pixelated`, computed sprite frame size `940.8px 705.6px`, comm blend `multiply`, alert blend `screen`, combat mode, and overlay z-index 70.
- Orders and Crew opened and closed via Escape.
- Live 800×600 resize clipped vertically; fixed locally. Local branch now renders `800×533` at `(0,33)` without clipping.

### Firefox

- The live URL and local branch both loaded with no captured console/page errors.
- All visual properties above matched Chromium, including the custom-property-derived frame sizing/position, blend modes, clip path, and overlay stack.
- Orders/Crew Escape behavior matched Chromium.
- The live resize defect reproduced identically and the local fix produces the same unclipped `800×533` rect.

### WebKit / Safari

No result is claimed. Playwright refused to install WebKit with `Playwright does not support webkit on mac12`. Built-in Safari 17.6's driver was present, but session creation returned: `You must enable 'Allow remote automation' in Safari Developer preferences`. Changing that security/developer setting was not authorized, so Safari could not be executed. This remains the only requested browser gap.

## 4. Player and saboteur findings

- Completed one unstubbed run per trail; latest output is in §2 and `tools/codex_player_runs.js`. No console/page errors occurred. A separate PLAID set exercised the high-burn case.
- Spam-clicked encounter replacement controls: found/fixed C5.
- Spam-confirmed duplicate cargo: found/fixed C7.
- Finished one engine-repair component and opened another during its delayed animation: found/fixed C6.
- Paused during targeting and held it beyond the fallback deadline: found/fixed C2.
- Re-entered a previously poisoned combat event ID: found/fixed C3.
- Dismissed the entire roster safely and killed the entire roster via the airlock: verified the intended distinction and found/fixed C8.
- Jettisoning `classified_cargo` correctly removes `event_station_010` from the pool because selection requires both `courier_job_taken` and the item (`index.html:2106`; source at `modules/events/events_station.json:1205`, payoff at `modules/events/events_station.json:1226`). The flag may remain as history, but the payoff is intentionally unscheduled rather than orphaned or fired without cargo.
- Opened Inventory, Orders, Growbay, Crew, Market/Trade, Repair, Fabricator, and Pause through reachable controls; Escape ownership did not leak to the pause menu. Overlays that can be reopened use one-time mounts or replace their prior close handler.
- Saved and loaded a full evolving state from a pause slot, attempted to save during an encounter, and loaded that slot from the encounter. The encounter did not overwrite the slot and load returned to Cruise.
- Resized to 800×600 in both local browsers: found/fixed C9.

## 5. Prose notes

No spelling typo surfaced in the requested range. The issues are voice and explanation.

### Mechanical voice-rule violation

The requested files contain 16 ARIA strings with exclamation points, despite the project rule that only CHIP uses them:

- `events_general.json`: 028 (`:2271`), 029 (`:2337`), 030 (`:2409`), 031 (`:2481`), 032 (`:2579`).
- `events_station.json`: 008 (`:862`); 009 intro/watchers/pry/engineer/drink/berth/cranes (`:945`, `:994`, `:1043`, `:1073`, `:1120`, `:1151`, `:1175`); 010 intro/pry (`:1259`, `:1284`).
- `events_nebula.json`: 003 (`:234`).

I did not silently rewrite character copy during a code-correctness review. This should be a focused ARIA punctuation pass across the whole corpus—the same pattern exists before event 028—not a local patch that leaves the voice inconsistent elsewhere.

### Event-specific notes

- `event_general_028` and 029 are the strongest of this batch: compact premise, clean turn, no result explanation. Keep them, aside from ARIA punctuation.
- `event_general_030`: “which is bureaucrat for” explains the setup, and the outcome literally says “which is why morale goes up” (`events_general.json:2415`, `:2452`). Delete the explanation and trust the wave/survey joke.
- `event_general_031`: “Engineer-assist the coupling repair” (`:2510`) reads like implementation vocabulary, not a captain's choice. The outcome is warm but the final “particular glow” sentence drifts sentimental.
- `event_general_032`: “which is how crews hug” (`:2603`) explains its own image. Ending on everybody cooking is stronger and flatter.
- `event_station_008`: the procedural dialogue is excellent. “There’s no reward. That was never what this was” (`events_station.json:900`) tells the player how to feel; the two-hands action and closer-walking crew already do that work.
- `event_station_009`: best match for the terse Adams/Far Side register. The layered bar observations are economical; only ARIA punctuation needs the systematic pass.
- `event_station_010`: “professionally, the way lighthouses watch ships” (`:1315`) is decorative and semantically fights the threat—the officer is surveillance, while a lighthouse warns/protects.
- `event_nebula_003`: “which is what data always wanted” (`events_nebula.json:278`) is a second punchline after the scientist reaction and lands flat. End on the crew walking taller.

### Endings `*_002` / `*_003`

- `ending_legendary_002` (`endings.json:57`) is the strongest: the eleven “correct” annotations and unbelievable logs carry the corporate joke. Its crew-loss variants are more solemn but earned.
- `ending_legendary_003` (`:167`) and `ending_good_002` (`:190`) repeatedly name abstractions (“truer,” “whole job,” “plural of alone”) after the concrete image has landed. Trim the interpretive final sentence in each paragraph.
- `ending_rough_002` (`:213`) has a good form joke, then a long repair-yard coda explains “both count as repairs.” End earlier, on the ship's cooling tick or the yard boss.
- `ending_pyrrhic_002` (`:236`) is polished but substantially more literary/trauma-monologue than Adams or Oregon Trail. “The ledger just reads differently from the inside” and the supply-run coda compete; choose one.
- `ending_hollow_002` (`:259`) is the furthest tonal drift. It stacks funeral, ledger, identity, ignorant shoots, “Grief…composts,” and repeated watering. The late-crop discovery is enough; halve the surrounding interpretation.

## 6. Verified correct — do not re-audit without new evidence

- `SAVED_FIELDS` covers all evolving systems called out in the brief, Sets round-trip explicitly, legacy missing Orders are seeded, and loads clear transient encounter state (`index.html:1690–1735`). Debug URLs do not write either the automatic slot or manual slots.
- Combat cleanup removes mode/targeting/FTL classes, cancels the auto-fire timer, and stops FX. The fallback cannot fire after combat end because it checks both `COMBAT.active` and TARGETING.
- Orders listeners are registered once by its IIFE; Crew and Engine Repair use guarded one-time mounts; Market replaces its old close-button handler; their global Escape handlers are registered once, not per open.
- Engine Repair's gauge removes document mouse/touch end handlers and cancels its rAF when the component closes (`engine_repair.js:360`). Repeated opens did not accumulate actions.
- Market capacity is checked before cost, sales compact cargo on close, Escape closes the top market, and repeated mounts do not duplicate the close action.
- `crew_gone` does not fire on solo setup or safe dismissal; it does fire after the last actual death, including the corrected airlock path.
- Summoned traders return to the current node's Cruise hub without advancing or charging fuel.
- The required event draw gates (`requires_flag`, `requires_item`, trail, trigger, node type, once) produced no violations across the final fuzz batch.
- No reviewed engine file reads `MOD`/`STATE` at top-level or defines a duplicate `window.X` owner. No demos, sprite paths, Pages configuration, dependencies, or module architecture were changed.

## 7. Verification evidence

Commands used Node 20.20.2 with Playwright on the local `python3 -m http.server 8177` server.

### Required harness 1 — module lint

```text
trail coverage — lunar: 85 eligible (68 ungated)  |  mars: 88 eligible (71 ungated)  |  interstellar: 91 eligible (74 ungated)
lint_modules: clean — 96 events across 12 files, 349 choices checked.
```

### Required harness 2 — `FUZZ_RUNS=4`

```text
run0 [lunar/tomato/marv]: {"screen":"screen-end","days":62,"ended":true,"cropHealth":75}
run1 [mars/sweet_potato/ajoy]: {"screen":"screen-end","days":142,"ended":true,"cropHealth":85}
run2 [interstellar/tomato/rex]: {"screen":"screen-end","days":213,"ended":true,"cropHealth":75}
run3 [lunar/wheat/marv]: {"screen":"screen-end","days":71,"ended":true,"cropHealth":80}
distinct events across fuzz: 33
VIOLATIONS: none
CONSOLE/PAGE ERRORS: []
```

### Required harness 3 — UI sweep tail

```text
✓ swept stop verbs — 5 of 5: TRADE | WAIT FOR TRADER | REPAIR | REST | FABRICATOR
✓ encounter clicks all registered — 5 clicks, 0 inert
FLAGS: none
ERRORS: none
```

### Focused adversarial regression probe

```text
✓ late sprite load stays on idle after typing finishes
✓ one component completion does not close the next component
✓ same event id entered later receives a clean combat stage
✓ double-click resolves one choice without skipping its outcome
✓ auto-fire does not act while the pause menu is open
✓ resume grants a fresh targeting window
✓ double confirmation removes exactly one cargo unit
✓ safe dismissal permits solo play; last-person airlock death triggers crew_gone
✓ debug boot never overwrites the real autosave
✓ autosave is safe-point-only and restores all evolving subsystems
ERRORS: none
FAILURES: none
```

### Local browser matrix tail

```text
Chromium: clipPath inset(93px 160px 142px); imageRendering pixelated;
          blends multiply/screen; Orders ESC true; Crew ESC true;
          resize 800×533 at (0,33), clippedX false, clippedY false; errors []
Firefox:  clipPath inset(93px 160px 142px); imageRendering pixelated;
          blends multiply/screen; Orders ESC true; Crew ESC true;
          resize 800×533 at (0,33), clippedX false, clippedY false; errors []
```

### Unstubbed player runner tail

```text
lunar:        screen-end, day 66, fuel 55, morale 63.4, 9 distinct events
mars:         screen-end, day 132, fuel 34, morale 41.8, 16 distinct events
interstellar: screen-end, day 184, fuel 16, morale 0, 17 distinct events
ERRORS: none
```

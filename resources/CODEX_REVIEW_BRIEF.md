# Independent review brief — Trans-plant

You are doing a cold, adversarial second-opinion review of a finished browser game. The previous engineer (Claude) wrote both the code and the tests that pass it, so the tests encode that engineer's assumptions. Your job is to find what those assumptions missed. Do not trust comments, docs, or commit messages as evidence of behavior — this project has a documented history of comments that were wrong and later sessions believing them. Verify by reading code and running the game.

## The project

- Repo: https://github.com/InterstellarHarvest/Trans-plant (live: https://interstellarharvest.github.io/Trans-plant/)
- Oregon Trail-style space roguelike. Douglas Adams tone. **No build step, no framework, no modules**: root `index.html` is the game; `engine/js/*.js` files load via `<script src>` BEFORE the inline main script and all share ONE global scope.
- Read first, in order: `resources/CLAUDE.md`, `resources/RESTORATION_PLAN.md`, then the last ~8 sections of `resources/ENGINE_INTEGRATION_HANDOFF.md` (passes #11–#13 and "Restoration items 1–10", "Third permanent harness"). `resources/GAME_BIBLE.md` is the design authority if you need to settle what something is *supposed* to do.

## Non-negotiable project laws (violating these is a defect, not a style choice)

1. **No audio.** The owner doesn't use sound. Never add, wire, or recommend it.
2. **Nothing orphaned.** Every item/flag/asset/event must have both ends wired (something grants/produces it AND something consumes/pays it off). If you add anything, wire both ends.
3. **Demos are canon.** `resources/demo-*.html` are finished design templates. Where the engine differs from a demo, the demo wins unless the handoff records the cut as approved. Don't "improve" a demo behavior away.
4. Engine files are IIFEs; **never read `MOD`/`STATE` at top level** (load order); **never define the same `window.X` in two files** (lint now enforces this); demo CSS ported into shared pages **must be scoped** under its screen/overlay root.
5. Hand cursor only (no grab cursor). Choice sub-labels are one line. Don't rewrite `sprites/...` asset paths — the root `sprites` symlink is load-bearing; the Pages workflow materializes it. Never switch Pages to deploy-from-branch.
6. `?debug=` boots must never write the localStorage save slot.

## Definition of done — all three harnesses must be green after any change

```
cd Trans-plant && python3 -m http.server 8177 &
node tools/lint_modules.js                      # content + global-collision checks
FUZZ_RUNS=4 node tools/fuzz_playthrough.js      # engine playthroughs, all trails
node tools/ui_sweep.js                          # real-click UI honesty sweep
```
(Playwright is required for the last two; if system node lacks it, use `NODE_PATH=<nvm>/lib/node_modules <nvm>/bin/node`.) Note the fuzz harness STUBS the minigames and never opens the orders/crew/market overlays; the UI sweep covers overlays but not minigame play.

## What to review — in priority order

### A. Adversarial code review of the recently written engine files
`engine/js/scene_art.js`, `engine/js/combat.js` (the FX layer ~lines 340–560 and the FTL/retreat visuals), `engine/js/screens/orders.js`, `engine/js/screens/crew.js`, `engine/js/screens/market.js`, `engine/js/minigames/engine_repair.js`, plus the `typeInto` typewriter, `renderChoices`, `saveRun/loadRun`, and `checkFailure` in `index.html`. Hunt specifically for:
- listeners or rAF loops registered per-open on overlays that get opened many times per run (leaks, double-firing)
- save/load: any persistent field added recently that is missing from `SAVED_FIELDS`, or a resume path that assumes a field a fresh save lacks (look at every `STATE.x` write in the new files and check it round-trips)
- async races: probe-by-error image loading, the talk-loop/typewriter sync, PauseBus honored in every loop
- combat: any path that leaves `.combat-mode`/`combat-targeting`/inline sprite opacity/CRT classes behind for the NEXT event; the auto-fire fallback firing after combat already ended
- anything reachable in play that throws (undefined global, null element) — the UI sweep only clicks the cruise hub and one encounter

### B. Challenge these documented judgment calls (argue, don't just accept)
All are recorded with reasoning in the handoff; if you'd rule differently, say why with evidence:
- Orders base rates (fuel 3/leg, food 0.2/day, water 0.15/day, crew-water morale tiers) invented to scale the demo's multipliers onto 0–100 resources; pace fuel charged per leg not per parked day. Is a default-settings run fair on all three trails? Is PLAID a gamble or a cheat?
- Crew active-skill mappings (pilot = double leg fuel, diplomat = 15% station discount, xeno = cargo reveal to log, engineer Emergency Patch absorbs EVENT hull damage but not combat hits)
- 1.6s auto-fire fallback in combat targeting
- `crew_gone` failure fires only on death (`all_crew_dead`), never on solo launch or dismissal
- Summoned trader events (TRADE / WAIT FOR TRADER) return to the same node's hub

### C. Cross-browser — this is a known gap
Every verification so far was Chromium only. Load the live URL (or the repo via a static server) in **Firefox and WebKit/Safari**. The game relies on `clip-path: inset()` on the combat canvas, `mix-blend-mode`, `image-rendering: pixelated`, CSS custom properties inside `calc()` for spritesheet frames, and `backdrop`/overlay stacking. Report anything that renders differently, plus any console errors.

### D. Play it like a player, then like a saboteur
One full run per trail (lunar is short). Then try to break it: jettison the story item mid-arc, dismiss all crew then travel, open every overlay from every screen state, ESC everywhere, resume from a save taken at each screen, spam-click during typewriter and combat animations, resize the window.

### E. Prose pass (lowest priority, real value)
~35 events and 5 endings were written in one sitting (`modules/events/events_general.json` 028–032, `events_station.json` 008–010, `events_nebula.json` 003, `modules/endings/endings.json` *_002/_003). Flag flat jokes, tonal drift from the Adams/Far Side/Oregon Trail register described in CLAUDE.md, exclamation points outside CHIP's lines, typos.

## How to work and what to deliver

- Work on a branch (`review/codex-YYYY-MM-DD`). Fix clear-cut defects directly, with the three harnesses green; do NOT refactor to modules, reorganize files, add dependencies, or touch `resources/demo-*.html`.
- For judgment-call disagreements and anything you're not certain is a bug, **don't change it — write it up.**
- Deliver `resources/CODEX_REVIEW_REPORT.md` containing: (1) confirmed defects with repro + fix commit, (2) disputed judgment calls with your argument, (3) cross-browser findings per browser, (4) prose notes, (5) what you verified as correct (so the next reviewer doesn't repeat it), (6) harness output tails proving green.
- Be specific: file:line, exact repro steps, exact observed vs expected. "Looks fine" is not a finding; "verified X by doing Y" is.

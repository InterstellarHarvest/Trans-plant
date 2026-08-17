# DEMO RESTORATION PLAN — approved 2026-08-03

User approved ALL tiers from the 7-agent demo-vs-engine audit (recorded in
ENGINE_INTEGRATION_HANDOFF.md passes #11-13 + this file). Work in THIS ORDER,
run `node tools/lint_modules.js` + `FUZZ_RUNS=3+ tools/fuzz_playthrough.js`
+ targeted Playwright after EACH item. Demos are the spec — port as-is.

## Order of work
1. **Engine-repair scene** (demo-engine-repair.html:784-1027) → new
   `engine/js/minigames/engine_repair.js` + CSS. 4 hotspot microgames
   (buildBreaker/resetBreaker, buildSwitches/toggleSw, buildValve/gauge*,
   buildJunction/reconnect via openComp router) + toggleLights/leaveEngineRoom
   end gate. Point cruise.js `handleRepairVerb` at it (replaces openMinigame('engine')
   for the repair verb; the Simon-says 'engine' game stays for launch_minigame use).
   Fault sprites: bg_engine_error_* under sprites/ (verify paths).
2. **Market modal** (demo-encounter.html:3809-3967 VENDORS/openMarket/.sinister)
   → fill `#overlay-market` in index.html. Layout per demo: modal left:
   calc(40px + subj-size + 12px); dialog log flush under portrait. Wire a
   `choice.open_market` field for trader/station events + author MARKET choice
   into trader + cantina + station market events. Sinister variant: close btn
   'LEAVE.', onClose returns to entryLayer + clears npc slot.
3. **Combat FX leftovers** (demo-combat.html): triggerFtlJumpEffect
   (combat-ftl-vanish shrink-fade of sprite/subject/name + combat-ftl-flash
   white overlay + ~3s empty-bridge beat; called by BOTH enemyRetreats D:5760
   and player escape D:5785), spawnEnemyChargeParticles (D:6385-6411 cyan
   convergence + combat-enemy-charge), combat-alert-strip (4 divs + CSS
   D:1169-1186, pulsing red viewport border, hidden on .combat-ended),
   combat-low-hp glow (toggle in applyEnemyDamage at ≤35%), combat-ftl-charging
   screen glow class in beginFtlCharge, xeno nameplate reveal string
   (PIRATE · SPECIES [xxHP · WILL SURRENDER/FIGHTS TO DEATH], D:5141-5144).
4. **Crew dossiers + active skills** (demo-crew.html) → new overlay in
   index.html or engine/js/screens/crew.js. Cruise crew strip becomes
   clickable → dossier modal (.cd-* chrome, portrait + cycle chevrons, bio,
   passive card, active skill USE button). Implement active_skill mechanic
   from crew_roster.json: uses_per_leg charges, recharges_at station
   (STATE.crewSkillCharges, reset on station arrival + travelTo leg logic per
   demo useActive). Dismiss/jettison flow + confirm + epitaph overlay.
   ADD new persistent fields to SAVED_FIELDS in index.html!
5. **Orders system** (demo-orders.html:1013-1160) → orders modal, opened by
   clicking #cruise-readout. ENGINES pace (Light/Ridiculous/Ludicrous/Plaid →
   speed + fuel-burn multipliers), RATIONS (Vending Machine/Standard/Pig Out →
   food burn + morale drift), WATER ALLOCATION slider plant↔crew (drives
   growbay waterPlant vs crew morale/health). Live projections:
   projectedArrivalDay, fuelEmptyDay, foodEmptyDay, cropMatureDay,
   crewCriticalDay + AI quips. Wire STATE.orders {pace, rations, waterSplit}
   into travelTo day math + tickCropGrowth + daily drains. Make the readout
   cells live (they're currently dead hardcoded HTML at index.html ~647).
   USER CONFIRMED full dual-drain water mechanic. ADD STATE.orders to
   SAVED_FIELDS. Balance: fuzz must still complete all trails.
6. **Ship's Log chrome** (demo-shipslog.html): parchment-cream lore chrome
   (D:65-95), .death-mode dark memorial chrome (D:323-350) with
   expand-portrait/candle/† (D:363-391), 5-AI re-voicing (D:564-654),
   per-entry type LEDs. Entry schema already carries what's needed.
7. **Inventory rich UI** (demo-inventory.html): sprite grid tiles
   (cargo/items icons — all exist), resource/gear tabs, sort, detail panel,
   10-seg gauge, sell price display, jettison-confirm dialog, provenance.
8. **Tier-3 smalls**: encounter Leave row (leaveLabel convention — engine:
   always-present walk-away using node-appropriate label, suppressed when
   layer authors leaveHidden), choice cost tooltips via title attr
   (composeTooltip port, demo D:4122-4153), bartender BARTENDER_NAMES pool
   (D:3758-3800) rolled per station via resolveNpc/resolveLayerNpc, choice
   entrance cascade (.entering stagger) + click pulse, cruise log typewriter
   (reuse typeInto pattern in pushLogEntry render), own-crew CREW_SHEETS
   talking heads in encounters (scene_art.js crewId path — sheets at
   sprites/crew_sprites/spritesheet_<id>.png, demo-encounter D:4260-4321;
   also FIX the lying header comment in scene_art.js:13 + stale comment at
   index.html ~2638 'no portrait art exists yet').
9. **Map touches ONLY** (user ruled: keep engine's simple map): add
   "YOU ARE HERE" ship marker + render branch_flavor labels (data already
   generated, map.js:157). Nothing else from demo-map.
10. Regenerate flags.md if flags added; update handoff pass #14 + memory
    project_transplant_session.md when done.

## Standing rules
- Tooltip .ui-tip primitive STAYS PARKED (user's design-system rule; title= attrs are demo-canon stopgap).
- No audio ever. Nothing orphaned. Demos are canon.
- Test recipe: server on 8177; NVM=$HOME/.nvm/versions/node/v20.20.2;
  NODE_PATH=$NVM/lib/node_modules $NVM/bin/node <script>.
- Scratchpad test batteries exist: test_scene_art/test_cantina/test_autosave/
  test_combat_fx.js (pattern to copy for new ones).

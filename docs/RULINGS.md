# Owner rulings

The owner's design rulings, numbered as in `resources/PARITY_AUDIT.md` Tier C. Where a ruling and a demo disagree, the ruling wins. Code comments cite them as "ruling N" (46a/46b and 47a/47b are the two halves of 46 and 47; "owner ruling 2026-10-11 #12" is ruling 12). `tools/lint_code.js` checks that every cited number is listed here. New rulings take the next number.

Rulings 1–25 date from 2026-10-11 and 26–56 from 2026-10-12.

1. Cargo slots follow the Bible/demo per-unit rule `ceil(count × per10 / 10)`.
2. Traders: TRADE when a trader is present, WAIT FOR TRADER otherwise; every station has a Market Row.
3. Forage poison uses the demo numbers: about 10/20/35 HP and 5/12/20 morale.
4. Crew STRENGTH / fatigue is dropped; the effort tax stands in for it.
5. Defeat injuries follow the demo: 75% chance (a medic softens it), 30% chance of a second injury, death adds a roll.
6. Combat pacing uses the demo timings.
7. Encounters deliver in the demo's beat order; choices wait until the text lands, and a click anywhere snaps it.
8. The cruise HUD pill stays (an approved addition, and the only place O2/hull/morale show on the cruise).
9. Tooltips use the demo `.ui-tip` system and copy, one style everywhere.
10. The warp starfield is ported: speed follows pace, streaks, and Stop decelerates it.
11. The combat end card is the demo's card (loot tiles, notes, CLEAR view).
12. SALVAGE at a derelict plays derelict salvage with the derelict sprites (fuel cells → fuel, food cans → food, medkit, component → materials, 3 hazards).
13. The merchant appraisal line is deleted; "Sell it sealed" (22g) and the botanist weighting stay.
14. Item provenance ("ACQUIRED DAY n · place") is dropped: not shown, not recorded.
15. Morale is per crew member: group changes hit everyone, the crew average drives low_morale (<30) and mutiny (0), anyone at 0 deserts at the next station after warnings; the captain has no morale, and no crew means no morale.
16. No dot HUD on the cruise; elsewhere (encounter, map, mining) it is the encounter demo's five dots with numbers (fuel, food, O2, hull, crew-average morale), no letter codes.
17. Cruise header: TIME PAUSED does not replace the day counter (STOPPED in the ticker is enough); gold sits left of the inventory box in the day text's size and centring.
18. Cruise bottom right is 2 columns × 3 rows: FOOD, H2O, O2 on the left; FUEL, HULL, STOP/RESUME on the right; wide labelled bars.
19. Every station stop opens with the demo approach (HAIL/DOCK, dockmaster hails 1 in 3, 5g parking fee 1 in 3, wave-off); DOCK leads to the stop's event as a dock room plus Market Row; delayed crises and Push Engines bypass it; a wave-off or skip closes the stop's services at no time cost; MEDBAY/DRYDOCK/FAB SERVICE stay Stop verbs.
20. Derelict stops split 60% intact hulk (DERELICT, derelict salvage) / 40% broken up (DEBRIS FIELD, space salvage).
21. The hollow-ending tier quote stays: "Mission status: incomplete. Crew status: present. The form has no field for the rest."
22. Materials cost cargo space: 1 slot per 10 of each material type (`cargo_slots_per_10`), and every material grant is capacity-checked like items.
23. Never more than captain + 2 crew: a third joiner rides as a passenger (or swaps someone out); the crew strip always shows 3 same-size slots, an empty one as a dim dashed card.
24. H2O and O2 never share a colour: O2 is pale ice #b8e6ee everywhere, water keeps #5fa8d0.
25. No pause button in the cruise header: STOP stops time, and Esc opens the Bridge Terminal.
26. Jettisoning the last crew member makes a solo run, like a safe dismissal: epitaph, then carry on with no morale and vacant slots; never a crew_gone failure.
27. The fabricator works per day, as in the demo: days tick while it crafts, and CANCEL refunds the materials and keeps the unspent days.
28. Cargo Hold SELL works when docked, at the Market Row trader price, with the demo's classified ⚠ and NOTES row.
29. The captain has real HP and can be hurt like crew (injuries, wounded/crisis statuses, deprivation).
30. The captain at 0 HP ends the run with the "captain lost" failure; medic, MEDBAY, medkits and the softer-landing rolls can save the captain first, as for crew.
31. The end report is the demo card (stinger title, one arrival line, quote, Run Report, no scrolling); the module paragraphs sit behind READ THE COLONY REPORT; hull-zero is one dry sentence.
32. No "NAME:" prefix on an AI line that already names the AI or "the ship computer".
33. Encounter sizing keeps the engine's values (320 column, 14/18 fonts, 14 AI, 13 HUD).
34. Choice tooltips follow the demo: everyone sees time and resource costs on hover, MARV keeps the sub-label preview as his perk, and Flee, Ram and Open Fire get tooltips.
35. The encounter location label moves into the title row or AI bar, and the portrait goes back to top 60.
36. Flag-gated choices stay hidden until the flag is set (demo showFlag).
37. A flat event's outcome title is the event title, not "OUTCOME".
38. engine_fault is a cruise event that launches the Simon ENGINE REPAIR minigame.
39. The pirate leave row BREAK OFF does what Flee does; it is never free.
40. The pirate haggle costs 30% fuel + 1 repair kit, and the line says so.
41. A botanist (crew or captain) tends the growbay by default; the player can change the tender.
42. No footer Close on the Cargo Hold, as in the demos: Esc, the backdrop and X close everything.
43. Gate icons keep the career portraits, drawn at integer scale.
44. Crew strip HP colours stay amber below 40 and red at 25 or less.
45. The hull-breach O2 bar is pale ice, keeping the orange/red low-O2 warning colours.
46. Forced stops skip the one-verb menu: after the alert flash the event opens straight away (46a); the mining overlay is the mining route, with no encounter wrapper (46b).
47. The map "???" pill has cream text and a red border (47a); the NPC talk loop holds idle 500ms on every loop (47b).
48. All crew dead with the captain alive: the captain carries on solo; the run ends only when the captain dies (captain_lost "Command Vacant" with crew aboard, crew_gone "Autopilot" when alone).
49. The encounter and mining AI name chip hides when the line already names the AI or "the ship computer" (ruling 32 applied to those bars).
50. The fabricator's per-day job is held while the fabricator is closed, and closing logs that the job is held.
51. Fence prices follow one rule for every good, with no flat 20g fallback.
52. The hull-zero failure title is "BREACH", and the other failure titles match demo-endings (Adrift, Official Complaint, We Regret to Inform, Autopilot).
53. A reload mid-fight settles as ATTEMPT ESCAPE played out (charge-turn volleys on the hull, −15 fuel, the time, the morale so far), never better than playing on; volleys that would sink the ship, or a reload in the defeat beat, settle as LIMP AWAY.
54. Cargo Hold SELL is free (no day, no effort), unlike the Market Row's haggling day, and its tooltip says "no day spent".
55. Fabricator craft days roll no during-wait interrupts; CANCEL after the first day refunds half the materials (rounded down per material), before day 1 everything.
56. Engine Fault follows demo-cruise: FIELD REPAIR (engineer) effort 3, 6 days; LIMP MODE effort 1, 2 days, −2 fuel.
57. Per-crew morale (owner 2026-10-12): each role also reacts to its own concern on top of the shared changes — botanist to crop health swings, engineer to hull damage, chef to short rations, medic to injuries, pilot to engine pace — and a person loses morale when they are wounded. The crew strip and morale tooltip say why, so one member's morale can fall alone and desertion is reachable.
58. Difficulty (owner 2026-10-12): careful play is made harder by weighting the second half of each trail toward hard/ultra events (the pity counter still caps streaks); supplies and the deadline stay as they are.
59. Gold (owner 2026-10-12): more to earn — material sell prices back toward ×4 (from ×2.5) and trade goods rolled more often, aiming at ~60–100 gold earned per careful run, so the Market Row, MEDBAY and gold-gated choices are real decisions.
60. Late-game bite (owner 2026-10-12): every hard event's cheapest option costs something real (time, fuel, hull or morale), shown truthfully in its preview, and new hard and ultra events are written (repeatable ones, station-capable ones, interstellar's ultra tier) so the late-leg weighting (ruling 58) has content to draw.
61. Gold target (owner 2026-10-12): salvaging is part of careful play; the 60–100 gold target is per trail (Lunar is short) and is met by careful salvaging play at the ruling-59 prices — no further gold change.
62. Desertion warning (owner 2026-10-12): a crew member warned at 0 morale walks off at the next station unless their own morale is back to 25 (MORALE_CRISIS); a passive +1 (ARIA, the chef) doesn't cancel it; the MO bar and dossier say 'needs 25 to stay'.
63. Lone crew (owner 2026-10-12): role concerns count half while only one crew member is aboard, previews included.
64. Lunar/Mars bite (owner 2026-10-13): more hard-event costs point at water and food (the only supplies that ever run short), re-simmed toward ~90% careful wins on Mars and ~95% on Lunar (Lunar stays the gentle trail).
65. Repeat cooldown (owner 2026-10-13): a repeatable event can't fire again within the next 4 stops (a per-trail data value); it applies to every repeatable event.
66. Decided fights (owner 2026-10-13): a reload after a fight's result is decided lands that result, never the ruling-53 break-off — the kill (LEAVE IT until SALVAGE is picked), a surrender on offer (taken, +5 morale, as ACCEPT), FINISH THEM, their retreat, our completed jump. Confirmed with it: LIMP MODE keeps no −2 morale (the effort-1 tax is its morale cost); a fabricator cancel before day 1 refunds everything (ruling 55); Engine Fault's times are days.
67. Autopilot with passengers (owner 2026-10-13): when the captain dies with no crew but a rescued passenger or a welcomed stowaway still aboard, the crew_gone failure names them (failures.json body_passengers / epitaph_passengers).
68. Per-trail supply bite (owner 2026-10-13): a map_rules value per trail scales event water/food costs (e.g. Mars ×2, Lunar ×1.5, Interstellar ×1), applied once in the engine so every preview shows the real number; tuned toward ~90% careful wins on Mars and ~95% on Lunar.
69. Mars supply pressure (owner 2026-10-13): Mars event water/food costs ×3 (not ×5) plus Mars starting water and food about 15% lower (map_rules starting_resources), re-simmed toward ~90% careful wins.
70. Narrative figures (owner 2026-10-13): event narratives that state a water/food cost write the real scaled figure through a token (e.g. {cost.water}), so the text always matches the outcome on every trail.
71. Lunar stays gentle (owner 2026-10-13): no extra supply pressure on Lunar; 100% careful wins there is fine. Mars and Interstellar carry the challenge.
72. Mars start (owner 2026-10-13): Mars keeps 70 water and 70 food at departure (ruling 69's figure); ~88–92% careful wins is the intended pressure, no easing to 85.
73. Desertion line (owner 2026-10-13): ruling 62 stands — a warned member needs 25 morale to stay; the line is not lowered to 15.
74. Mars trail card (owner 2026-10-13): the setup card says the run leaves short on water and food ("Leaves short on water and food."), engine and demo-setup alike.
75. Crew skill numbers (owner 2026-10-13): the crew active skills read crew_roster.json active_skill.effect (Greenhouse Protocol crop_health, Special Meal morale / food_cost) — one source of truth as for captains and AIs — and speak the holder's name through crewNameOf, never a hard-coded roster name.
76. Breach countdown (owner 2026-10-14): the hull-breach minigame's countdown stays on real seconds; the launching choice's tooltip states the days the job takes and that it is timed on a real clock.
77. Engineer repair lift (owner 2026-10-14): a finished repair — REPAIR, DRYDOCK, the Engine Fault's rebuild or a clean restart — lifts the engineer's morale (crew_roster.json morale_concern repair_done, +3), the way back from hull_damage; the REPAIR / DRYDOCK tooltips and the event previews show it (outcome field repair_done).
78. Gold (owner 2026-10-14): no gold change until the owner's hand-play says otherwise; careful non-salvaging play stays low (ruling 61 stands).
79. Crafted goods (owner 2026-10-14): a station pays a fabricator print its materials' value (the recipe's inputs at the material sell price — a repair kit 8g, not 27g); copies that came any other way sell first at the full price, the hold's SELL PRICE and the Market Row say which, and the count rides in the save (STATE.crafted).
80. Easy / medium content batch (owner 2026-10-14): ten easy events (two each at anomaly, nebula, void, asteroid field and derelict stops) and four medium station dock rooms (station people, station trouble, crop, a crew moment); easy events are small trade-offs; tones absurd, heartwarming, corporate and eerie; real-world science links where they fit (about half); mostly one-shot; three or four hands-on minigame choices; the owner reviews the text before it ships. Outcome morale_to "speaker" lands on the crew member a crew_speaker event is about.

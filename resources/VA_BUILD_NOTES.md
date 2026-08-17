# Trans-plant Build Notes — Quick Reference

> Formerly "The Verdant Ark." Merged with an earlier Oregon-Trail-in-space concept. Two game ideas became one.

## Game Name: Trans-plant
- Ship default name: "The Verdant Ark" (player can rename, SSL-style)
- Tone: Douglas Adams meets The Far Side meets Oregon Trail
- Stack: HTML5 / JS / CSS — no frameworks, no build tools. Engine = index.html + JS. Content = modular JSON.

## Project Structure
```
Trans-plant/
├── engine/           ← Phase 2: index.html + JS, reads modules
├── modules/
│   ├── ai/           ← 5 AI companions (ARIA, MARV, REX, CHIP, AJOY)
│   ├── captains/     ← 10 captain backgrounds (discounted specialist skills)
│   ├── crew/         ← 7 crew roles (3-layer skills: passive/active/narrative)
│   ├── crops/        ← 5 crops (the mission objective)
│   ├── events/       ← event modules by type (general, station, planet, etc.)
│   ├── endings/      ← victory + failure ending screens
│   ├── failures/     ← 6 failure types
│   ├── flavor/       ← names, epitaphs, ambient objects, crop comments
│   ├── items/        ← instruments, tools, ship upgrades, loot, event rewards
│   ├── locations/    ← station/planet/derelict/anomaly definitions
│   ├── maps/         ← map generation rules per trail
│   ├── materials/    ← economy primitives (gold, iron, scrap, exotic, etc.)
│   └── recipes/      ← fabricator recipes
├── registry/
│   └── tag_registry.json  ← source of truth for all tags
├── resources/        ← original VA + ST design docs
└── assets/           ← pixel art (Phase 2)
```

## Setup Flow
1. Choose trail (Lunar / Mars / Interstellar) — sets difficulty + map
2. Choose AI (ARIA / MARV / REX / CHIP / AJOY) — sets narrator voice
3. Choose captain background — discounted specialist skills (0.5x crew)
4. Choose 0-2 crew from roster — full specialist skills
5. Choose crop — the mission objective (different requirements/payoffs)
6. Name ship — defaults to "The Verdant Ark"
7. Launch

## Key Merged Decisions
- Captain background = discounted version of crew role (0.5x effort, 0.5x passives)
- Crew max: captain + 2 crew (3 humans). Can launch with 0-2 crew.
- Stowaway = random event during journey, not setup choice. Must fire someone to take them if at cap.
- Crop death = mission failure, but game continues to destination for a "hollow" ending
- Crop is very hard to kill — can get very sick but death requires sustained neglect
- Maps: single start → branches/reconnects → single destination. All paths converge.
- Ship stats derived from trail choice, not ship selection. One ship, upgradeable via items.
- AJOY passive: shows what you missed (one unchosen choice + hint at outcome after events)
- Fabricator: misfire curve + micro-minigame skill path (fab_align)

## Modules Built (Phase 1)
- [x] tag_registry.json — 25+ tag dimensions, merged VA + ST
- [x] ai_companions.json — 5 AIs with sample lines, passives, log voices
- [x] crew_roster.json — 7 roles with passive/active/narrative skills
- [x] crops.json — 5 crops with real science, resource consumption, vulnerabilities, arrival bonuses
- [x] captains.json — 10 backgrounds with discounted skills and starting bonuses
- [x] items.json — 11 instruments, 4 ship upgrades, 4 loot-only, 3 event rewards
- [x] materials.json — 5 materials + credit currency
- [x] recipes.json — 5 fabricator recipes (2 default, 1 crop treatment, 2 require upgrade)
- [x] map_rules.json — 3 trails with node weights, event difficulty, visual palettes, placement rules
- [x] flavor_pools.json — epitaphs, station/planet/derelict names, map names, ambient objects, crop comments

## What's Next
1. Event modules (events_general.json, events_station.json, etc.) — the bulk of content
2. Location definitions (stations.json, planets.json, etc.)
3. Endings + failures modules
4. GAME_BIBLE.md for Trans-plant (merged bible from VA + ST)
5. Engine build (Phase 2) — index.html reads all module JSON at runtime

## Origin Docs (in resources/)
- VA_ENGINE_REDESIGN.md — engine architecture patterns (SSL port specs, scene router, modal system)
- VERDANT_ARK_BIBLE.md — narrative tracking (tags, gates, dangling threads, Two Moves Ahead ideas)
- CLAUDE file.md — ST's build protocol (module structure, tag registry protocol, cross-reference rules)
- GAME_BIBLE.md — ST's full game design (systems, crew, items, minigames, economy, UI)

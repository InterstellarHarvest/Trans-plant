# AI FLAVOR POOL AUDIT — HANDOFF

> Hand-off document for Claude Code.
> Catalog the gap between AI lines hardcoded in the demos and pool slots defined in `flavor_pools.json`.
> Output: a delta report + skeleton additions to `flavor_pools.json`. **No game code changes.**

---

## What This Audit Does

The Trans-plant game uses five AI companions (ARIA, MARV, REX, CHIP, AJOY) whose lines appear throughout the game. Some pools for these lines are already defined in `modules/flavor/flavor_pools.json` (NPC dialogue, event `ai_flavor` per event, minigame quips per `minigame_sprite_spec.html`). Many others are not — currently they live as hardcoded strings inside the demo HTML files.

This audit catalogs:
1. Where AI lines are currently hardcoded across the demos
2. Which of those have a pool home already
3. Which need new pool slots
4. Skeleton additions to `flavor_pools.json` to close the gap

The audit is preparation for a later content-writing phase. It does not change any game code, does not move any hardcoded strings, and does not modify any demo files. It produces two deliverables: a report and a JSON additions block.

---

## Why a Delta, Not a Full Inventory

`flavor_pools.json` already has structure for:
- **NPC disposition lines** — 43 slots × 7 species coloring (per `NPC_SYSTEM_UPDATE.md`)
- **Event `ai_flavor`** — per-event field, lives inside event modules, not in the pool file
- **Minigame quips** — 5 AIs × 3 tiers × 12 minigames (per `minigame_sprite_spec.html`)
- **Crew epitaphs, map names, station names, planet names, derelict ship names, ambient travel objects** (per Bible Section 20)
- **`combat_log`** — being added by `COMBAT_SYSTEM_HANDOFF.md` (5 AIs × 17 slots)

What this audit needs to find is **what's not already covered**. Things like:
- AI quips when the player opens the inventory modal
- AI commentary on resource bar warnings (low fuel, low O2, etc.)
- AI lines on the orders/cruise screen for routine tick events
- AI lines when a crop matures / dies / becomes diseased
- AI lines on fabricator recipe completion
- AI lines on map selection / branch decisions
- etc.

If a pool already exists in `flavor_pools.json`, just note it and move on. If a pool doesn't exist, that's the gap.

---

## Files to Scan

Scan every demo HTML file for hardcoded references to the five AIs (`aria`, `marv`, `rex`, `chip`, `ajoy`). Look for both string keys (e.g., `aria: "..."`) and inline character names (e.g., `"ARIA notes that..."`).

### Primary scan targets
- `demo-encounter.html`
- `demo-cruise.html`
- `demo-orders.html`
- `demo-inventory.html`
- `demo-fabricator.html`
- `demo-growbay.html`
- `demo-crew.html`
- `demo-map.html`
- `demo-setup.html`
- `demo-title.html`
- `demo-minigames.html`
- `demo-npc.html`

### Secondary scan targets (sprite/spec/devtool files — likely fewer lines, still check)
- `minigame_sprite_spec.html`
- `npc_checklist.html`
- `salvage-devtool.html`
- `forage-anchor-editor.html`

### Skip
- `cursor-armory.html`, `pulse-ring-demo.html`, `circle-indicator-demo.html`, `weld-border-demo.html`, `zone-marker.html`, `starfield-demo.html` — pure UI / FX demos, no narrative AI lines expected.
- All `.md` files — design docs, not implementation.

For each match, record:
- **File** — the demo file
- **Context** — what game moment this line appears in (e.g., "encounter intro layer", "low fuel warning", "crop matures", "modal closing flavor")
- **AI** — which of the five
- **Line text** — the actual hardcoded string
- **Pool home** — either an existing pool slot path (if covered) or `MISSING`

---

## Existing Pool Coverage Reference

When checking whether a found line already has a pool home, use this mapping. If the line falls into one of these categories, mark it as covered.

| Context | Pool path |
|---|---|
| NPC dialogue (trader/drifter/pirate/station_crew speaking) | `npc_disposition_lines.<disposition>.<slot>` |
| NPC species texturing (tic, grammar, quirk) | `npc_species_coloring.<species>` |
| Per-event AI commentary inside an event module | `ai_flavor` field on the event itself (NOT the pool file) |
| Minigame outcome quips (perfect / good / poor for a specific minigame) | `minigame_quips.<minigame_id>.<tier>.<ai_id>` (per `minigame_sprite_spec.html` data shape — confirm whether this block actually exists in `flavor_pools.json` yet; if not, that's a gap) |
| Crew epitaphs | `crew_epitaphs` |
| Combat log (during combat) | `combat_log.<slot>.<ai_id>` (added by `COMBAT_SYSTEM_HANDOFF.md`) |

Anything that doesn't fit these categories is a gap.

---

## Expected Gap Categories (Hypotheses to Verify)

These are categories the audit is likely to surface. Confirm or deny each based on what's actually in the demos:

- **Resource warnings** — AI lines fired when fuel/food/o2/hull/morale crosses a low threshold. Likely a `resource_warning.<resource>.<severity>.<ai_id>` shape.
- **Crop lifecycle commentary** — AI quips when crops are planted, mature, get sick, are harvested, die. Likely a `crop_lifecycle.<event>.<ai_id>` shape.
- **Inventory / cargo interactions** — AI lines on opening the cargo modal, on inventory full, on item gained/lost. Likely `inventory_event.<context>.<ai_id>` shape.
- **Map / navigation** — AI commentary on revealing the next node, on choosing a branch, on entering different node types. Likely `map_event.<context>.<ai_id>` shape.
- **Cruise tick ambient flavor** — AI low-frequency idle quips during routine travel. Likely `cruise_ambient.<ai_id>` (one flat pool per AI, no sub-slot).
- **Fabricator / recipe events** — AI lines on starting a craft, on completion, on missing materials. Likely `fabricator_event.<context>.<ai_id>` shape.
- **Setup screen flavor** — AI lines during the choose-trail / choose-AI / choose-crew flow. May or may not need pool storage (these are very few lines and might stay hardcoded).
- **Minigame quips block** — confirm whether the `minigame_quips` block from `minigame_sprite_spec.html` actually exists in `flavor_pools.json`. The spec defines the data shape but the actual JSON skeleton may not be in the file yet.

For each category that turns out to need a pool, propose a slot structure and add it to the skeleton additions block.

---

## Deliverables

### 1. `AUDIT_REPORT.md` (new file at project root)
Markdown document with three sections:

**Section A: Sanity check — pools already in `flavor_pools.json`**
List every top-level pool key currently present in the file. One-line description of each. This confirms the baseline and verifies the audit reader is looking at the same file the audit was performed against.

**Section B: Hardcoded AI lines found in demos**
Table with columns: File, Context, AI, Line text, Pool home (existing path OR `MISSING`).
One row per hardcoded line found. Sort by file, then by context.

**Section C: Gap report — pool slots needed but missing**
For every `MISSING` row in Section B, group by proposed pool slot. For each new slot, propose:
- Slot path (e.g., `resource_warning.fuel.critical.aria`)
- One-sentence description of what triggers it
- Suggested line count target (typically 4–6 lines per AI per slot)

### 2. `flavor_pools_additions.json` (new file at project root, NOT applied to flavor_pools.json yet)
Pure JSON file containing a single object with all the new pool slots needed, structured ready to merge into `flavor_pools.json`. Empty arrays. Five-AI structure where appropriate.

Example structure:
```json
{
  "resource_warning": {
    "fuel": {
      "low":      { "aria": [], "marv": [], "rex": [], "chip": [], "ajoy": [] },
      "critical": { "aria": [], "marv": [], "rex": [], "chip": [], "ajoy": [] }
    },
    "food":   { "low": { "...": [] }, "critical": { "...": [] } },
    "o2":     { "low": { "...": [] }, "critical": { "...": [] } },
    "hull":   { "low": { "...": [] }, "critical": { "...": [] } },
    "morale": { "low": { "...": [] }, "critical": { "...": [] } }
  },
  "crop_lifecycle": {
    "planted":    { "aria": [], "marv": [], "rex": [], "chip": [], "ajoy": [] },
    "mature":     { "aria": [], "marv": [], "rex": [], "chip": [], "ajoy": [] },
    "diseased":   { "aria": [], "marv": [], "rex": [], "chip": [], "ajoy": [] },
    "harvested":  { "aria": [], "marv": [], "rex": [], "chip": [], "ajoy": [] },
    "died":       { "aria": [], "marv": [], "rex": [], "chip": [], "ajoy": [] }
  }
  // ... etc per gap category found
}
```

The actual structure is determined by what the audit finds. Above is illustrative. Do not invent slots that aren't supported by something the audit actually found in a demo.

### 3. Do NOT modify
- `modules/flavor/flavor_pools.json` — do not merge the additions yet. The N-review step happens before merge.
- Any demo HTML file — do not move hardcoded lines into the pool file. That's a later pass.
- Any other game file.

---

## Methodology

1. Read `modules/flavor/flavor_pools.json` (or note its current state if it doesn't exist yet — in which case Section A becomes "file not yet created, expected pools per Bible Section 20 are: ...").
2. Open each demo file in the scan list. Use grep / pattern search for: `aria:`, `marv:`, `rex:`, `chip:`, `ajoy:`, plus the uppercase versions in narrative strings (`ARIA `, `MARV `, etc.) and any `ai_flavor` blocks.
3. For each hit, identify the surrounding context (what game moment is this AI commenting on?) and record into the audit table.
4. After all demos are scanned, classify each line: covered (existing pool slot) or MISSING.
5. For MISSING lines, group by likely pool category. Propose slot structure.
6. Write `AUDIT_REPORT.md`.
7. Generate `flavor_pools_additions.json` matching the proposed slot structure.

---

## What "Done" Looks Like

- `AUDIT_REPORT.md` exists at project root with all three sections complete.
- `flavor_pools_additions.json` exists at project root with new slot skeleton.
- Every hardcoded AI line in every scanned demo is accounted for in the audit table.
- `flavor_pools.json` is untouched. Demo files are untouched. Game code is untouched.
- Report is readable by N. — clear file/context/line columns, gap section is grouped sensibly so N. can review proposals one category at a time.

---

## Out of Scope (Do Not Do)

- Do not write any actual line content (the empty arrays stay empty).
- Do not merge `flavor_pools_additions.json` into `flavor_pools.json` — N. reviews and approves first.
- Do not migrate hardcoded lines out of the demos into the pool file. That's the next phase, after the gap report is approved.
- Do not refactor or restructure `flavor_pools.json` if its current structure differs from what the Bible documents. Just report what's there and what's missing.
- Do not propose pool slots speculatively (e.g., "we might need a slot for X someday"). Only propose slots backed by an actual hardcoded line that doesn't have a home.

---

## Notes for the Auditor

- The audit voice is technical and neutral. Save the deadpan game-tone for content writing later.
- If a slot proposal is genuinely ambiguous between two structures (e.g., should crop lifecycle be `crop_lifecycle.<event>` or `crop_<event>`), note both options in the gap report and let N. pick.
- If a hardcoded line clearly belongs to an existing pool but isn't currently being pulled from one, flag it in Section B with the existing pool path AND a note "currently hardcoded, not pulled from pool" — this signals a future migration task without making the audit a code refactor.

---

End of handoff.

#!/usr/bin/env node
'use strict';
/* Standalone authoring-safety lint for modules/*.json (no build
 * pipeline to hook this into automatically — run manually before a
 * content push). Per POOL_READINESS_AUDIT_HANDOFF.md item A8.
 *
 * Usage: node tools/lint_modules.js   (run from the Trans-plant root)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
function readJSON(rel) { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); }

let errors = [];
function err(msg) { errors.push(msg); }
// Warnings print but don't fail the run — for open owner decisions and
// art/content debt someone is already on. Promote to err() once fixed.
let warnings = [];
function warn(msg) { warnings.push(msg); }
// Engine source scan (index.html + engine/js/**, portable_data.js
// excluded) shared with gen_flags.js.
const genFlags = require('./gen_flags.js');
const engineSrcByFile = new Map(genFlags.engineSources().map(f => [f.rel, f.src]));
const quotedIn = (src, id) => src.includes("'" + id + "'") || src.includes('"' + id + '"');

const eventFiles = fs.readdirSync(path.join(ROOT, 'modules/events')).filter(f => f.endsWith('.json'));
const crewRoles = new Set(readJSON('modules/crew/crew_roster.json').map(c => c.role));
// items.json ids are the long form (item_gas_analyzer_001); every event,
// STATE.items, and lockReason() already use the short form (gas_analyzer)
// per the established convention (audit item B2) — derive short ids
// rather than requiring events to match the long form.
const itemIds = new Set(readJSON('modules/items/items.json').filter(i => !i._section).map(i => i.id.replace(/^item_/, '').replace(/_\d+$/, '')));
const materialIds = new Set((readJSON('modules/materials/materials.json').materials || []).map(m => m.id));
const registry = readJSON('registry/tag_registry.json');

// Validates the reference-bearing fields of an outcome object (flat
// choice.outcome or a layered event's outcomes[id] entry): item grants/
// consumes against items.json short ids, materials grants against
// materials.json ids. Catches the item-vs-material confusion that put
// a material id into an item_grant once (boarding scenario authoring).
function checkOutcomeRefs(file, evId, where, o) {
  const grants = Array.isArray(o.item_grant) ? o.item_grant : (o.item_grant ? [o.item_grant] : []);
  for (const g of grants) {
    if (!itemIds.has(g)) err(`${file} ${evId}${where ? '/' + where : ''}: item_grant "${g}" is not an id in items.json`);
  }
  if (o.item_consume && !itemIds.has(o.item_consume)) {
    err(`${file} ${evId}${where ? '/' + where : ''}: item_consume "${o.item_consume}" is not an id in items.json`);
  }
  if (o.materials) {
    for (const mat of Object.keys(o.materials)) {
      if (!materialIds.has(mat)) err(`${file} ${evId}${where ? '/' + where : ''}: materials grant "${mat}" is not an id in materials.json`);
    }
  }
}

// Flags the ENGINE sets (no JSON setter exists) — exempt from the
// dangling-requires_flag check. flag -> the file that sets it; each entry
// is verified against that file (flags.add('x') / sets_flag = 'x'), so a
// moved or deleted setter fails here instead of silently allowlisting.
// chose_alpha/chose_beta are content-set (fork events), not listed.
const ENGINE_SET_FLAGS = {
  crop_death_accepted: 'engine/js/screens/endings.js',
  crew_lost: 'index.html',
  ai_noted_crop_mature: 'engine/js/screens/cruise.js', ai_noted_crop_sick: 'engine/js/screens/cruise.js',
  ai_noted_crop_died: 'engine/js/screens/cruise.js', ai_noted_crop_planted: 'engine/js/screens/cruise.js',
  ai_noted_pest: 'engine/js/screens/cruise.js',
  stowaway_welcomed: 'index.html', stowaway_passenger: 'index.html', stowaway_refused: 'index.html',
  executed_surrendered_pirate: 'engine/js/combat.js',
  emergency_patch_armed: 'engine/js/screens/crew.js', negotiation_prepared: 'engine/js/screens/crew.js',
};

// Minigame ids openMinigame() accepts (engine/js/minigames.js) — for
// launch_minigame validation.
const MINIGAME_IDS = new Set(['scan', 'engine', 'medical', 'forage', 'brace', 'breach', 'salvage']);
const STOWAWAY_RESOLVES = new Set(['welcome', 'welcome_replace', 'refuse']);
// crew_effect contract (applyOutcomeEffects). "patient" = the wounded
// crew member of an engine-forced delayed_crisis event, so it (and the
// {patient.*} text tokens) only make sense inside those events. "crew" =
// one of the crew, never the captain (a choice that sends a crew member).
const CREW_EFFECT_TYPES = new Set(['injure', 'kill', 'heal']);
const CREW_EFFECT_TARGETS = new Set(['random', 'specific_role', 'all_injured', 'patient', 'crew']);
const severityValues = new Set(Object.keys((registry.severity || {}).values || {}));
const TIER_KEYS = new Set(['perfect', 'good', 'poor']);

// Node types that can actually appear on generated maps: weighted
// spawn tables across all trails (map_rules.json) + the structural
// types every map gets (fork; station is also forced at endpoints).
const spawnableTypes = new Set(['fork', 'station']);
{
  const mapRules = readJSON('modules/maps/map_rules.json');
  for (const trail of Object.values(mapRules.trails)) {
    for (const tbl of ['node_weights', 'node_weights_start']) {
      for (const [t, w] of Object.entries(trail[tbl] || {})) if (w > 0) spawnableTypes.add(t);
    }
  }
}

const eventsById = new Map(); // id -> {file, event}
const allChoices = []; // {file, eventId, choice}
const setsFlags = new Set();
const requiresFlags = new Set();

for (const file of eventFiles) {
  const events = readJSON('modules/events/' + file);
  for (const ev of events) {
    if (!ev || !ev.id) continue;

    if (eventsById.has(ev.id)) {
      err(`Duplicate event id "${ev.id}" in ${file} (already defined in ${eventsById.get(ev.id).file})`);
    } else {
      eventsById.set(ev.id, { file, event: ev });
    }

    // Collect choices from either the flat schema or a layers map.
    const choiceSets = [];
    if (ev.choices) choiceSets.push({ layer: null, choices: ev.choices });
    if (ev.layers) {
      for (const [layerId, layer] of Object.entries(ev.layers)) {
        if (layer.choices) choiceSets.push({ layer: layerId, choices: layer.choices });
      }
    }
    // standard_variants (event_shipboard_001) render as ordinary choices
    // when the event isn't the stowaway reveal — their flags are real
    // setters and their refs need the same checks.
    for (const v of (ev.standard_variants || [])) {
      if (v.choices) choiceSets.push({ layer: 'variant:' + v.variant_id, choices: v.choices });
    }

    for (const { layer, choices } of choiceSets) {
      const forkFlags = new Set();
      for (const ch of choices) {
        allChoices.push({ file, eventId: ev.id, layer, choice: ch });
        const setFlag = ch.outcome ? ch.outcome.sets_flag : ch.sets_flag;
        if (setFlag) setsFlags.add(setFlag);
        if (setFlag === 'chose_alpha' || setFlag === 'chose_beta') forkFlags.add(setFlag);
        if (ch.requires_flag) requiresFlags.add(ch.requires_flag);

        // "any": anyone in the crew (hasRoleFor) — the captain doesn't count.
        if (ch.requires_crew && ch.requires_crew !== 'any' && !crewRoles.has(ch.requires_crew)) {
          err(`${file} ${ev.id}${layer ? '/' + layer : ''}: requires_crew "${ch.requires_crew}" is not a role in crew_roster.json (or "any")`);
        }
        if (ch.gate && ch.gate.crew && ch.gate.crew !== 'any' && !crewRoles.has(ch.gate.crew)) {
          err(`${file} ${ev.id}${layer ? '/' + layer : ''}: gate.crew "${ch.gate.crew}" is not a role in crew_roster.json (or "any")`);
        }
        if (ch.requires_item && !itemIds.has(ch.requires_item)) {
          err(`${file} ${ev.id}${layer ? '/' + layer : ''}: requires_item "${ch.requires_item}" is not an id in items.json`);
        }
        if (ch.gate && ch.gate.item && !itemIds.has(ch.gate.item)) {
          err(`${file} ${ev.id}${layer ? '/' + layer : ''}: gate.item "${ch.gate.item}" is not an id in items.json`);
        }
        if (ch.outcome && typeof ch.outcome === 'object') checkOutcomeRefs(file, ev.id, layer, ch.outcome);
      }
      // A8 sub-item: if ANY choice in this layer resolves a fork
      // (sets chose_alpha/chose_beta), EVERY choice must — otherwise
      // a path through this layer can leave the map with no fork
      // branch chosen, and advanceAfterEvent() dead-ends.
      if (forkFlags.size > 0) {
        for (const ch of choices) {
          const setFlag = ch.outcome ? ch.outcome.sets_flag : ch.sets_flag;
          if (setFlag !== 'chose_alpha' && setFlag !== 'chose_beta') {
            err(`${file} ${ev.id}${layer ? '/' + layer : ''}: choice "${ch.text || ch.label}" doesn't set chose_alpha/chose_beta, but a sibling choice does — every choice in a fork-resolving layer must pick a branch`);
          }
        }
      }
    }

    // Layered events: validate reference fields in the outcomes map too,
    // and COLLECT their sets_flag (they're real setters — the dangling
    // check missed layered-outcome flags until this collection existed).
    if (ev.outcomes) {
      for (const [outId, o] of Object.entries(ev.outcomes)) {
        if (o && typeof o === 'object') {
          checkOutcomeRefs(file, ev.id, 'outcomes.' + outId, o);
          if (o.sets_flag) setsFlags.add(o.sets_flag);
        }
      }
    }
    // stowaway_variant outcomes set flags too (stowaway_aboard etc.).
    if (ev.stowaway_variant) {
      for (const ch of (ev.stowaway_variant.stowaway_choices || [])) {
        if (ch.outcome && ch.outcome.sets_flag) setsFlags.add(ch.outcome.sets_flag);
      }
    }

    // Event-level flag gate participates in the dangling check (audit
    // fix: only choice-level gates were collected before, so every
    // consequence event's gate went unverified).
    if (ev.requires_flag) requiresFlags.add(ev.requires_flag);

    // Reachability: an event whose node_type targets can never spawn on
    // ANY trail's generated map is dead content.
    if (ev.node_type && !ev.node_type.includes('any')) {
      if (!ev.node_type.some(t => spawnableTypes.has(t))) {
        err(`${file} ${ev.id}: node_type ${JSON.stringify(ev.node_type)} contains no type that any trail's map generation can produce — event is unreachable`);
      }
    }

    // Severity + crew_effect contract on every outcome shape.
    const isCrisis = (ev.trigger || []).includes('delayed_crisis');
    const outcomeList = [];
    for (const { layer, choices } of choiceSets) {
      for (const ch of choices) if (ch.outcome && typeof ch.outcome === 'object') outcomeList.push([layer, ch.outcome]);
    }
    for (const [outId, o] of Object.entries(ev.outcomes || {})) if (o && typeof o === 'object') outcomeList.push(['outcomes.' + outId, o]);
    for (const ch of ((ev.stowaway_variant || {}).stowaway_choices || [])) if (ch.outcome) outcomeList.push(['stowaway_variant', ch.outcome]);
    for (const [where, o] of outcomeList) {
      const at = `${file} ${ev.id}${where ? '/' + where : ''}`;
      if (o.severity != null && !severityValues.has(o.severity)) err(`${at}: severity "${o.severity}" is not registered (${[...severityValues].join('/')})`);
      const ce = o.crew_effect;
      if (ce) {
        if (ce.type != null && !CREW_EFFECT_TYPES.has(ce.type)) err(`${at}: crew_effect.type "${ce.type}" is not injure/kill/heal`);
        if (ce.target != null && !CREW_EFFECT_TARGETS.has(ce.target)) err(`${at}: crew_effect.target "${ce.target}" is not ${[...CREW_EFFECT_TARGETS].join('/')}`);
        if (ce.target === 'specific_role' && !crewRoles.has(ce.role)) err(`${at}: crew_effect.role "${ce.role}" is not a role in crew_roster.json`);
        if (ce.target === 'patient' && !isCrisis) err(`${at}: crew_effect target "patient" only exists inside delayed_crisis events`);
      }
    }
    if (!isCrisis && JSON.stringify(ev).includes('{patient.')) err(`${file} ${ev.id}: {patient.*} tokens only resolve inside delayed_crisis events`);
    if (isCrisis && JSON.stringify(ev.node_type) !== '["station"]') err(`${file} ${ev.id}: delayed_crisis events fire only on station arrival — node_type must be ["station"]`);

    // Engine-contract field validation on choices (both schemas).
    for (const { layer, choices } of choiceSets) {
      for (const ch of choices) {
        if (ch.launch_minigame && !MINIGAME_IDS.has(ch.launch_minigame)) {
          err(`${file} ${ev.id}${layer ? '/' + layer : ''}: launch_minigame "${ch.launch_minigame}" is not a valid minigame id (${[...MINIGAME_IDS].join('/')})`);
        }
        if (ch.tier_outcomes) {
          for (const k of Object.keys(ch.tier_outcomes)) {
            if (!TIER_KEYS.has(k)) err(`${file} ${ev.id}${layer ? '/' + layer : ''}: tier_outcomes key "${k}" is not perfect/good/poor`);
          }
        }
        // A choice that spends gold must be gated on having it (gold floors
        // at 0, so an ungated cost was free to a broke player). Layered
        // outcome ids resolve through ev.outcomes.
        {
          const oc = typeof ch.outcome === 'object' ? ch.outcome : (ev.outcomes || {})[ch.outcome];
          const cost = oc && oc.resources && oc.resources.gold < 0 ? -oc.resources.gold : 0;
          if (cost && !((ch.gate && ch.gate.gold) >= cost) && !ch.gold_cost) {
            err(`${file} ${ev.id}${layer ? '/' + layer : ''}: choice "${ch.text || ch.label}" costs ${cost} gold but has no gate.gold ≥ ${cost} — a player with no gold could take it free`);
          }
        }
        // Station botanist fields (2026-10-11): gate.crop kinds are the
        // three index.html cropGateReason() knows; preview: true needs a
        // fixed outcome to show; crop_advice applies on a navigation
        // choice (an outcome choice would end the event first).
        {
          const at = `${file} ${ev.id}${layer ? '/' + layer : ''}: choice "${ch.text || ch.label}"`;
          if (ch.gate && ch.gate.crop && !['alive', 'cuttable', 'ailing'].includes(ch.gate.crop)) err(`${at}: gate.crop "${ch.gate.crop}" is not alive/cuttable/ailing`);
          if (ch.preview && !ch.outcome) err(`${at}: preview: true needs an outcome to preview`);
          if (ch.crop_advice && !(ch.back || ch.next)) err(`${at}: crop_advice needs back/next (it applies before navigating)`);
        }
        const o = ch.outcome;
        if (o && typeof o === 'object' && o.stowaway_resolve && !STOWAWAY_RESOLVES.has(o.stowaway_resolve)) {
          err(`${file} ${ev.id}${layer ? '/' + layer : ''}: stowaway_resolve "${o.stowaway_resolve}" is not welcome/welcome_replace/refuse`);
        }
      }
    }
    // stowaway_variant choices carry stowaway_resolve too.
    if (ev.stowaway_variant) {
      for (const ch of (ev.stowaway_variant.stowaway_choices || [])) {
        const o = ch.outcome;
        if (o && o.stowaway_resolve && !STOWAWAY_RESOLVES.has(o.stowaway_resolve)) {
          err(`${file} ${ev.id} (stowaway_variant): stowaway_resolve "${o.stowaway_resolve}" is invalid`);
        }
      }
    }

    // Trail targeting: values must be registered trails, and a trail
    // list must never be empty (that would be an always-dead event).
    if (ev.trail) {
      if (!Array.isArray(ev.trail) || !ev.trail.length) {
        err(`${file} ${ev.id}: trail must be a non-empty array when present`);
      } else {
        for (const t of ev.trail) {
          if (!(registry.trail && t in registry.trail.values)) {
            err(`${file} ${ev.id}: trail "${t}" is not registered in tag_registry.json`);
          }
        }
      }
    }
    // science_link shape (Bible §18 link schema).
    if (ev.science_link && !(ev.science_link.url && /^https?:\/\//.test(ev.science_link.url))) {
      err(`${file} ${ev.id}: science_link.url missing or not http(s)`);
    }
    // log_lore (Ship's Log, engine/js/shipslog.js): an outcome's long-form
    // page behind the journal's 📖 — { title ≤ 40 chars, text ≥ 80 }.
    // Only on outcomes (inline, layered ev.outcomes, tier_outcomes).
    {
      const outs = [];
      for (const { layer, choices } of choiceSets) for (const ch of choices) {
        if (ch.log_lore) err(`${file} ${ev.id}${layer ? '/' + layer : ''}: log_lore belongs on the outcome, not the choice "${ch.text}"`);
        if (ch.outcome && typeof ch.outcome === 'object') outs.push([`choice "${ch.text}"`, ch.outcome]);
        for (const [t, to] of Object.entries(ch.tier_outcomes || {})) outs.push([`choice "${ch.text}" tier ${t}`, to]);
      }
      for (const [id, o] of Object.entries(ev.outcomes || {})) outs.push([`outcome ${id}`, o]);
      for (const [at, o] of outs) {
        const l = o && o.log_lore;
        if (l == null) continue;
        if (typeof l !== 'object' || typeof l.title !== 'string' || !l.title.trim() || l.title.length > 40 || typeof l.text !== 'string' || l.text.trim().length < 80) {
          err(`${file} ${ev.id} ${at}: log_lore must be { title: <1–40 chars>, text: <80+ chars> }`);
        }
      }
    }

    // requires_item values (choice, gate.item, event-level) must be
    // registered like any other tag (nine had drifted unregistered).
    {
      const reg = (registry.requires_item || {}).values || {};
      const ids = [ev.requires_item];
      for (const { choices } of choiceSets) for (const ch of choices) ids.push(ch.requires_item, ch.gate && ch.gate.item);
      for (const id of ids) if (id && !(id in reg)) err(`${file} ${ev.id}: requires_item "${id}" is not registered in tag_registry.json`);
    }

    // Tag registry membership (only for dimensions the flat schema uses).
    for (const [field, dim] of [['difficulty', 'difficulty'], ['tone', 'tone'], ['node_type', 'node_type'], ['trigger', 'trigger']]) {
      if (!ev[field] || !registry[dim]) continue;
      const values = Array.isArray(ev[field]) ? ev[field] : [ev[field]];
      for (const v of values) {
        if (v !== 'any' && !(v in registry[dim].values)) {
          err(`${file} ${ev.id}: ${field} "${v}" is not registered in tag_registry.json's ${dim} dimension`);
        }
      }
    }
  }
}

// Voice rule (pass #14 ruling): only ARIA and CHIP use exclamation
// points. Any string under a marv/rex/ajoy key — flavor pools, event
// ai_flavor, layered-event ai lines — must not contain one.
{
  const DRY = new Set(['marv', 'rex', 'ajoy']);
  const walk = (o, where) => {
    if (Array.isArray(o)) o.forEach((x, i) => walk(x, where.concat(i)));
    else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) walk(v, where.concat(k));
    else if (typeof o === 'string' && o.includes('!') && where.some(k => DRY.has(k))) {
      err(`${where.join('.')}: "!" in a ${where.find(k => DRY.has(k)).toUpperCase()} line — only ARIA and CHIP use exclamation points`);
    }
  };
  walk(readJSON('modules/flavor/flavor_pools.json'), ['flavor_pools']);
  for (const { event: ev } of eventsById.values()) {
    walk(ev.ai_flavor || {}, [ev.id, 'ai_flavor']);
    for (const [lk, l] of Object.entries(ev.layers || {})) walk(l.ai || {}, [ev.id, lk, 'ai']);
  }
}

// Cargo hold AI lines (parity batch 2, 2026-10-11): the inventory
// detail panel picks flavor_pools.ai_universal.cargo_hold.resource[key]
// (the SHIP RESOURCES tiles) or .category[cat] (the item's Bible §14.2
// category) in the active AI's voice — every AI needs lines for every key.
{
  const ch = ((readJSON('modules/flavor/flavor_pools.json').ai_universal) || {}).cargo_hold;
  const ais = readJSON('modules/ai/ai_companions.json').filter(a => a.active !== false).map(a => a.id.replace(/^ai_/, ''));
  const need = { resource: ['fuel', 'food', 'water'], category: ['instrument', 'consumable', 'curiosity', 'story', 'material', 'upgrade'] };
  if (!ch) err('flavor_pools.json ai_universal.cargo_hold is missing (the cargo hold detail panel reads it)');
  else for (const [slot, keys] of Object.entries(need)) for (const k of keys) for (const ai of ais) {
    const pool = ch[slot] && ch[slot][k] && ch[slot][k][ai];
    if (!Array.isArray(pool) || !pool.length || pool.some(l => typeof l !== 'string' || !l.trim())) err(`flavor_pools.json ai_universal.cargo_hold.${slot}.${k}.${ai}: needs at least one line`);
  }
}

// Materials are cargo (owner ruling 2026-10-11, Bible §14.1): each type
// is a stack costing ceil(count × cargo_slots_per_10 / 10) slots. The
// field is data (default 1); when present it must be a number ≥ 0.
for (const m of (readJSON('modules/materials/materials.json').materials || [])) {
  if ('cargo_slots' in m) err(`materials.json ${m.id}: "cargo_slots" is the item field — materials stack: use cargo_slots_per_10`);
  if ('cargo_slots_per_10' in m && !(Number.isFinite(m.cargo_slots_per_10) && m.cargo_slots_per_10 >= 0)) err(`materials.json ${m.id}: cargo_slots_per_10 must be a number ≥ 0`);
  // flavor (b4 re-audit B6): the cargo hold's player-facing line. It may
  // not state a price — the trader's price lives in market.js, and the
  // old "5 metal = 1g" notes contradicted the 1g a unit it pays.
  if ('flavor' in m && (typeof m.flavor !== 'string' || !m.flavor.trim())) err(`materials.json ${m.id}: flavor must be a non-empty string`);
  if (typeof m.flavor === 'string' && /\d\s*(g|cr|gold|credits?)\b|=\s*\d/i.test(m.flavor)) err(`materials.json ${m.id}: flavor states a price ("${m.flavor}") — prices live in market.js`);
  if ('notes' in m) err(`materials.json ${m.id}: "notes" is retired — player-facing text goes in flavor (no prices)`);
}
// passive_skill.fabricator_contribution (b4): the fabricator's crew speed
// — the one source fabricator.js reads (absent = 0).
for (const c of readJSON('modules/crew/crew_roster.json')) {
  const v = c && c.passive_skill && c.passive_skill.fabricator_contribution;
  if (v !== undefined && !(Number.isFinite(v) && v >= 0)) err(`crew_roster.json ${c.role}: passive_skill.fabricator_contribution must be a number ≥ 0`);
}

let engineGrantedItems = {}; // filled by the item-sources block; read by the item-sinks block
// Item sources (nothing orphaned): every item a choice, event or recipe
// REQUIRES must be obtainable somewhere — an event grant, the station
// market (purchasable), a recipe, or one of the engine's own grant paths
// below. Five items were required but unobtainable until 2026-10-09.
{
  // id -> the engine file that grants it; verified below (the id must
  // appear there as a quoted literal). classified_cargo is gone: the
  // sinister market (market.js) no longer stocks it — event_station_009's
  // item_grant is its source, which the event scan already counts.
  const ENGINE_GRANTED_ITEMS = {
    drive_coil: 'engine/js/minigames.js', o2_recycler: 'engine/js/minigames.js', repair_fabricator: 'engine/js/minigames.js', // salvage minigame upgrades (UPGRADES)
    fuel_cell: 'engine/js/combat.js', repair_kit: 'engine/js/combat.js',                     // combat loot
    logbook_fragment: 'engine/js/screens/cruise.js', medkit: 'engine/js/screens/cruise.js',  // forage rare finds (RARE_TO_REAL)
    fab_surplus: 'engine/js/screens/fabricator.js',                                          // fabricator misfires
    suspicious_fungus: 'engine/js/screens/cruise.js',                                        // good forage on alien ground
    pre_collapse_artifact: 'engine/js/screens/cruise.js', corporate_memorabilia: 'engine/js/screens/cruise.js', unidentified_bone: 'engine/js/screens/cruise.js', // salvage curiosities
  };
  for (const [id, file] of Object.entries(ENGINE_GRANTED_ITEMS)) {
    const src = engineSrcByFile.get(file);
    if (src == null) err(`ENGINE_GRANTED_ITEMS.${id}: ${file} does not exist`);
    else if (!quotedIn(src, id)) err(`ENGINE_GRANTED_ITEMS.${id}: '${id}' never appears in ${file} — the engine grant moved or is gone; fix the entry`);
    if (!itemIds.has(id)) err(`ENGINE_GRANTED_ITEMS.${id}: not an item in items.json`);
  }
  engineGrantedItems = ENGINE_GRANTED_ITEMS;
  const items = readJSON('modules/items/items.json').filter(i => !i._section);
  const sourced = new Set(Object.keys(ENGINE_GRANTED_ITEMS));
  for (const i of items) if (i.item_source === 'purchasable') sourced.add(i.id.replace(/^item_/, '').replace(/_\d+$/, ''));
  const recipesRaw = readJSON('modules/recipes/recipes.json');
  const recipes = Array.isArray(recipesRaw) ? recipesRaw : (recipesRaw.recipes || []);
  for (const r of recipes) { const out = r.output && (r.output.item_id || r.output.item || r.output); if (typeof out === 'string') sourced.add(out); }
  // Every recipe must craft a real items.json item (two crafted phantom ids
  // nobody could use until 2026-10-09).
  const itemIdSet = new Set(items.map(i => i.id.replace(/^item_/, '').replace(/_\d+$/, '')));
  for (const r of recipes) { const out = r.output && r.output.item_id; if (out && !itemIdSet.has(out)) err(`recipes.json ${r.id}: output "${out}" is not an item in items.json`); }
  const required = new Map(); // item -> where
  const need = (id, where) => { if (id && !required.has(id)) required.set(id, where); };
  for (const { file, event: ev } of eventsById.values()) {
    need(ev.requires_item, `${file} ${ev.id}`);
    const grantsOf = o => o ? (Array.isArray(o.item_grant) ? o.item_grant : (o.item_grant ? [o.item_grant] : [])) : [];
    const all = [...(ev.choices || [])];
    for (const l of Object.values(ev.layers || {})) all.push(...(l.choices || []));
    for (const v of (ev.standard_variants || [])) all.push(...(v.choices || []));
    for (const ch of all) {
      need(ch.requires_item, `${file} ${ev.id}`); need(ch.gate && ch.gate.item, `${file} ${ev.id}`);
      if (ch.outcome && typeof ch.outcome === 'object') { grantsOf(ch.outcome).forEach(g => sourced.add(g)); need(ch.outcome.item_consume, `${file} ${ev.id}`); }
    }
    for (const o of Object.values(ev.outcomes || {})) { grantsOf(o).forEach(g => sourced.add(g)); if (o) need(o.item_consume, `${file} ${ev.id}`); }
  }
  for (const r of recipes) need(r.requires_item, `recipes.json ${r.id}`);
  for (const [id, where] of required) {
    if (!sourced.has(id)) err(`item "${id}" is required (${where}) but nothing grants it — no event item_grant, not purchasable, no recipe, not an engine grant`);
  }
}

// Every failure type the registry marks populated needs an active
// failures.json module — checkFailure() falls back to failures[0]
// (the wrong screen) when one is missing.
{
  const fr = readJSON('modules/failures/failures.json');
  const fails = Array.isArray(fr) ? fr : (fr.failures || []);
  for (const [t, v] of Object.entries((registry.failure_type || {}).values || {})) {
    if (v.status === 'populated' && !fails.some(f => f.failure_type === t && f.active !== false)) {
      err(`failure_type "${t}" is populated but failures.json has no active module for it`);
    }
  }
}

// Stowaway identities: a welcomed stowaway with a join_role is pushed
// straight into STATE.crew, so it must be a real crew role (or null =
// passenger). Wembly Voss shipped as "academic" (a captain background).
for (const idn of (readJSON('modules/flavor/flavor_pools.json').stowaway_identities || [])) {
  if (idn.join_role != null && !crewRoles.has(idn.join_role)) {
    err(`flavor_pools.json stowaway_identities ${idn.id}: join_role "${idn.join_role}" is not a role in crew_roster.json (use a crew role or null)`);
  }
}
// The stowaway roll is the engine's (35% of runs, owner ruling
// 2026-10-09); a per-event chance field would be dead data.
for (const { file, event: ev } of eventsById.values()) {
  if (ev.stowaway_variant && 'stowaway_chance' in ev.stowaway_variant) {
    err(`${file} ${ev.id}: stowaway_variant.stowaway_chance is not read by the engine (the roll is a fixed 35% per run) — remove it`);
  }
}

for (const flag of requiresFlags) {
  if (!setsFlags.has(flag) && !(flag in ENGINE_SET_FLAGS)) {
    err(`Dangling requires_flag "${flag}" — no event's sets_flag (and no engine path) ever sets it`);
  }
}

// Per-trail coverage report (informational): how many events each
// trail can actually draw from, given its spawnable node types and
// trail targeting. Guards the "shorter maps still feel eventful" goal.
function trailCoverage() {
  const mapRules = readJSON('modules/maps/map_rules.json');
  const lines = [];
  for (const [trail, r] of Object.entries(mapRules.trails)) {
    const types = new Set(['fork', 'station']);
    for (const tbl of ['node_weights', 'node_weights_start']) {
      for (const [t, w] of Object.entries(r[tbl] || {})) if (w > 0) types.add(t);
    }
    let eligible = 0, ungated = 0;
    for (const { event: ev } of eventsById.values()) {
      if (ev.active === false) continue;
      if (ev.trail && !ev.trail.includes(trail)) continue;
      const nts = ev.node_type || ['any'];
      if (!nts.includes('any') && !nts.some(t => types.has(t))) continue;
      eligible++;
      if (!ev.requires_flag) ungated++;
    }
    lines.push(`${trail}: ${eligible} eligible (${ungated} ungated)`);
  }
  return lines.join('  |  ');
}


// ── Global-name collision scan (added 2026-08-04) ──────────────────
// All engine files share ONE global scope (no modules). Two files
// assigning the same window.X silently let the later-loaded one win —
// the growbay's X button called the FABRICATOR's closeModal for weeks.
{
  const fs2 = require('fs'), path2 = require('path');
  const files = [];
  const walk = d => { for (const e of fs2.readdirSync(d)) { const f = path2.join(d, e); if (fs2.statSync(f).isDirectory()) walk(f); else if (f.endsWith('.js')) files.push(f); } };
  walk('engine/js'); files.push('resources/shared.js');
  const owners = {};
  for (const f of files) {
    const src = fs2.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)) (owners[m[1]] = owners[m[1]] || new Set()).add(f);
  }
  const dupes = Object.entries(owners).filter(([, fs]) => fs.size > 1);
  for (const [name, fs] of dupes) errors.push(`global collision: window.${name} assigned in ${[...fs].join(' AND ')} — later-loaded file silently wins`);
}

// ── file:// bundle freshness (added 2026-10-09) ────────────────────
// Double-click launches read modules from engine/js/portable_data.js,
// not the JSON — a stale bundle would silently ship old content there.
{
  const { build, OUT } = require('./build_portable.js');
  const outPath = path.join(ROOT, OUT);
  if (!fs.existsSync(outPath) || fs.readFileSync(outPath, 'utf8') !== build()) {
    err(`${OUT} is stale vs modules/ (file:// launches would run old content) — run: node tools/build_portable.js`);
  }
}

// ── Registry status freshness (added 2026-10-09) ──────────────────
// A value content uses must not be marked "empty" (the "what tags are
// still empty?" audit depends on it). Fix: node tools/sync_registry.js
{
  const st = require('./sync_registry.js').stale();
  if (st.length) err(`tag_registry.json: ${st.length} value(s) used by content but still "empty" (${st.slice(0, 5).map(([d, v]) => d + '.' + v).join(', ')}${st.length > 5 ? ', …' : ''}) — run: node tools/sync_registry.js`);
}

// ── flags.md freshness (added 2026-10-09) ─────────────────────────
// The content-set table is generated from the event files; a stale one
// hides who checks a flag (the orphan question every new flag asks).
{
  // flags.md is a local authoring doc (Markdown stays out of the public
  // repo), so a fresh clone without it skips this check.
  const gen = require('./gen_flags.js');
  if (fs.existsSync(path.join(ROOT, gen.OUT)) && fs.readFileSync(path.join(ROOT, gen.OUT), 'utf8') !== gen.render()) {
    err(`${gen.OUT} is stale vs modules/ + the engine's flag setters — run: node tools/gen_flags.js`);
  }
}

// ── Story-flag payoffs (added 2026-10-10, owner: nothing orphaned) ──
// Every flag content sets must be READ somewhere (a gate, an event, the
// engine) or carry a flavor_pools.flag_payoffs entry: a Ship's Record
// epilogue line plus a callback line for each AI.
{
  const pay = (readJSON('modules/flavor/flavor_pools.json').flag_payoffs) || {};
  const engineSrc = ['index.html', 'engine/js/combat.js', 'engine/js/minigames.js', 'engine/js/map.js',
    ...fs.readdirSync(path.join(ROOT, 'engine/js/screens')).map(f => 'engine/js/screens/' + f),
    ...fs.readdirSync(path.join(ROOT, 'engine/js/minigames')).map(f => 'engine/js/minigames/' + f)]
    .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  const AIS = ['aria', 'marv', 'rex', 'chip', 'ajoy'];
  // Event-level setters and the other flag readers (showFlag / hideFlag /
  // gate.flag) — not tracked by the main pass above.
  const sets = new Set(setsFlags), reads = new Set(requiresFlags);
  for (const { event } of eventsById.values()) {
    if (event.sets_flag) sets.add(event.sets_flag);
    (function walk(o) {
      if (!o || typeof o !== 'object') return;
      for (const k of ['showFlag', 'hideFlag', 'requires_flag']) if (typeof o[k] === 'string') reads.add(o[k]);
      if (o.gate && o.gate.flag) reads.add(o.gate.flag);
      if (typeof o.setFlag === 'string') sets.add(o.setFlag);
      if (typeof o.sets_flag === 'string') sets.add(o.sets_flag);
      for (const k in o) walk(o[k]);
    })(event);
  }
  for (const f of sets) {
    // Engine-read families: fork branches, per-species pirate goodwill, and
    // analyzed_<item> (inventory/gate FIELD ANALYSIS). Anything else under
    // these prefixes (chose_drift, analyzed_green_planet) needs a reader.
    if (reads.has(f) || /^(chose_(alpha|beta)$|friendly_with_pirate_)/.test(f)
        || (f.startsWith('analyzed_') && itemIds.has(f.slice(9)))) continue;
    if (new RegExp("flags\\.has\\(['\"]" + f + "['\"]").test(engineSrc)) continue;
    const p = pay[f];
    if (!p) { err(`flag "${f}" is set by content but nothing reads it — add a flag_payoffs entry (epilogue + callbacks) or a reader`); continue; }
    if (!p.epilogue) err(`flag_payoffs.${f}: missing epilogue`);
    for (const ai of AIS) if (!p.callback || !p.callback[ai]) err(`flag_payoffs.${f}: missing ${ai} callback`);
    for (const ai of ['marv', 'rex', 'ajoy']) if (p.callback && /!/.test(p.callback[ai] || '')) err(`flag_payoffs.${f}: ${ai} uses "!" (only ARIA/CHIP do)`);
    if (/!/.test(p.epilogue || '')) err(`flag_payoffs.${f}: epilogue uses "!"`);
  }
  for (const f of Object.keys(pay)) if (!sets.has(f)) err(`flag_payoffs.${f}: no content sets this flag`);
}

// ── Shared helpers for the 2026-10-11 open-loop checks ─────────────
const atOf = (file, evId, layer) => `${file} ${evId}${layer ? '/' + layer : ''}`;
const shortItem = id => id.replace(/^item_/, '').replace(/_\d+$/, '');
// Every choice set of an event (flat, layered, standard_variants).
function choiceSetsOf(ev) {
  const sets = [];
  if (ev.choices) sets.push({ layer: null, choices: ev.choices });
  for (const [lk, l] of Object.entries(ev.layers || {})) if (l.choices) sets.push({ layer: lk, choices: l.choices });
  for (const v of (ev.standard_variants || [])) if (v.choices) sets.push({ layer: 'variant:' + v.variant_id, choices: v.choices });
  return sets;
}
// EFFORT_CHECKS (index.html): hands-on job types → { from: [...] }.
const EFFORT_CHECKS = (() => {
  const src = engineSrcByFile.get('index.html');
  const m = src.match(/const EFFORT_CHECKS = \{([\s\S]*?)\n\};/);
  const out = new Map();
  if (!m) { err('index.html: EFFORT_CHECKS table not found (lint parses it for the effort contract)'); return out; }
  for (const km of m[1].matchAll(/^\s*(\w+):\s*\{([^\n]*)/gm)) {
    const fm = km[2].match(/from:\s*\[([^\]]*)\]/);
    out.set(km[1], fm ? [...fm[1].matchAll(/['"]([^'"]+)['"]/g)].map(x => x[1]) : []);
  }
  return out;
})();
// Trail → node types its generated maps can spawn (weights > 0, plus the
// structural fork/station every map gets).
const trailTypes = new Map();
for (const [trail, r] of Object.entries(readJSON('modules/maps/map_rules.json').trails)) {
  const types = new Set(['fork', 'station']);
  for (const tbl of ['node_weights', 'node_weights_start']) for (const [t, w] of Object.entries(r[tbl] || {})) if (w > 0) types.add(t);
  trailTypes.set(trail, types);
}
const eventOnTrail = (ev, trail) => {
  if (ev.active === false) return false;
  if (ev.trail && !ev.trail.includes('any') && !ev.trail.includes(trail)) return false;
  const nts = ev.node_type || ['any'];
  return nts.includes('any') || nts.some(t => trailTypes.get(trail).has(t));
};

// ── Tag-registry membership for every tagged field (added 2026-10-11) ──
// The per-event pass above covers difficulty/tone/node_type/trigger/
// trail/requires_item; these are the rest of the tagged fields.
{
  const regCheck = (at, field, dim, v) => {
    if (v == null) return;
    if (!(registry[dim] && registry[dim].values && v in registry[dim].values)) err(`${at}: ${field} "${v}" is not registered in tag_registry.json's ${dim} dimension`);
    else if (registry[dim].values[v].status === 'deprecated') err(`${at}: ${field} "${v}" is deprecated in tag_registry.json's ${dim} dimension`);
  };
  const npcCheck = (at, npc, ev) => {
    if (!npc) return;
    if (npc.disposition == null) err(`${at}: npc has no disposition (resolveNpc needs one)`);
    regCheck(at, 'npc.disposition', 'npc_disposition', npc.disposition);
    regCheck(at, 'npc.species', 'npc_species', npc.species);
    regCheck(at, 'npc.job', 'npc_station_job', npc.job);
    // Scenes pass 2026-10-11 (index.html resolveNpc / scene_art pickNpcSheet):
    // displayName = the subject's name plate (demo subjectName: 'INTRUDER',
    // '????'); variant = one pinned sprite folder (needs a pinned species,
    // and the folder must hold a spritesheet); recall = a flag whose NPC
    // comes back (some outcome must set it, and the event should wait for it).
    if (npc.displayName != null && !(typeof npc.displayName === 'string' && npc.displayName.trim() === npc.displayName && npc.displayName && npc.displayName === npc.displayName.toUpperCase())) err(`${at}: npc.displayName must be a non-empty UPPERCASE string (it is the name plate)`);
    if (npc.variant != null) {
      if (!Number.isInteger(npc.variant) || npc.variant < 1 || npc.variant > 6) err(`${at}: npc.variant must be an integer 1-6 (scene_art.js probes numbered folders 1..6)`);
      else if (!npc.species) err(`${at}: npc.variant pins one species' folder — it needs a pinned npc.species`);
      else {
        const dir = ['resources/sprites/npc', npc.disposition, ...(npc.disposition === 'station_crew' ? [npc.job || 'janitor'] : []), npc.species, String(npc.variant)].join('/');
        if (!fs.existsSync(path.join(ROOT, dir, 'spritesheet.png'))) err(`${at}: npc.variant ${npc.variant} → ${dir}/spritesheet.png does not exist`);
      }
    }
    if (npc.recall != null) {
      if (typeof npc.recall !== 'string' || !setsFlags.has(npc.recall)) err(`${at}: npc.recall "${npc.recall}" is not a flag any outcome sets — the NPC it recalls is never met`);
      else if (ev && ev.requires_flag !== npc.recall) warn(`${at}: npc.recall "${npc.recall}" on an event that doesn't require that flag — it can fire before the NPC was ever met (falls back to a fresh roll)`);
    }
  };
  for (const { file, event: ev } of eventsById.values()) {
    const at = `${file} ${ev.id}`;
    regCheck(at, 'scene_type', 'scene_type', ev.scene_type);
    regCheck(at, 'comm_mode', 'comm_mode', ev.comm_mode);
    regCheck(at, 'event_presentation', 'event_presentation', ev.event_presentation);
    npcCheck(at, ev.npc, ev);
    for (const [lk, l] of Object.entries(ev.layers || {})) {
      regCheck(at + '/' + lk, 'comm_mode', 'comm_mode', l.comm_mode);
      regCheck(at + '/' + lk, 'scene_type', 'scene_type', l.scene_type);
      npcCheck(at + '/' + lk, l.npc);
      if (l.npc && l.npc.recall != null) err(`${at}/${lk}: npc.recall on a layer npc — only the event's npc is recalled (index.html resolveNpc)`);
    }
    for (const { layer, choices } of choiceSetsOf(ev)) {
      for (const ch of choices) {
        regCheck(atOf(file, ev.id, layer), 'microgame_type', 'microgame_type', ch.microgame_type);
        regCheck(atOf(file, ev.id, layer), 'minigame_type', 'minigame_type', ch.minigame_type);
      }
    }
  }
  const caps = readJSON('modules/captains/captains.json');
  for (const c of (Array.isArray(caps) ? caps : caps.captains || [])) regCheck(`captains.json ${c.id}`, 'background', 'captain_background', c.background);
  const crops = readJSON('modules/crops/crops.json');
  for (const c of (crops.crops || [])) regCheck(`crops.json ${c.id}`, 'crop id', 'crop_type', String(c.id).replace(/^crop_/, ''));
  for (const e of readJSON('modules/endings/endings.json').filter(e => !e._section)) {
    regCheck(`endings.json ${e.id}`, 'ending_score', 'ending_score', e.ending_score);
    regCheck(`endings.json ${e.id}`, 'event_presentation', 'event_presentation', e.event_presentation);
  }
}

// ── Scenes B fields (added 2026-10-11, demo parity batch 2) ────────
// biome (planet biome gate, eventEligible), crew_speaker (own-crew
// conversation: roles in preference order or "any"), body_by_speaker
// (narrator body per speaking role, "any" fallback), npc.displayName,
// and outcome crew_join (a named rescue: crew in join_role, else a
// passenger to the next station with crew_join.passenger.reward), and
// outcome morale_to (per-crew morale: the one member a change names).
{
  const BIOMES = new Set(['alien', 'desert', 'habitable', 'ice', 'ocean', 'volcanic']); // scene_art.js PLANET_BIOMES
  const isUpper = v => typeof v === 'string' && v.trim() === v && v.length > 0 && v === v.toUpperCase();
  const RES = new Set(['fuel', 'food', 'water', 'o2', 'hull', 'morale', 'gold']);
  for (const { file, event: ev } of eventsById.values()) {
    const at = `${file} ${ev.id}`;
    if (ev.biome != null) {
      if (!Array.isArray(ev.biome) || !ev.biome.length) err(`${at}: biome must be a non-empty array`);
      else for (const b of ev.biome) if (!BIOMES.has(b)) err(`${at}: biome "${b}" is not a planet biome (${[...BIOMES].join('/')})`);
      if (!(ev.node_type || []).includes('planet')) err(`${at}: biome gate on an event that never fires at a planet — it can never pass`);
    }
    // requires_crew_aboard (eventEligible): copy that needs the crew in the
    // scene never fires for a captain flying alone.
    if (ev.requires_crew_aboard != null && ev.requires_crew_aboard !== true) err(`${at}: requires_crew_aboard must be true (or absent)`);
    if (ev.draw_weight != null && !(Number.isFinite(ev.draw_weight) && ev.draw_weight > 0 && ev.draw_weight <= 5)) err(`${at}: draw_weight must be a number in (0, 5]`);
    if (ev.draw_weight != null && !ev.biome) warn(`${at}: draw_weight without a biome gate — only narrow gates should need it`);
    if (ev.crew_speaker != null) {
      const list = Array.isArray(ev.crew_speaker) ? ev.crew_speaker : [ev.crew_speaker];
      if (!list.length) err(`${at}: crew_speaker is empty`);
      for (const r of list) if (r !== 'any' && !crewRoles.has(r)) err(`${at}: crew_speaker "${r}" is not a crew role (or "any")`);
      if (ev.crew_id) err(`${at}: crew_speaker and crew_id together — the speaker is picked, crew_id would be ignored`);
    }
    if (JSON.stringify(ev).includes('{speaker.') && !ev.crew_speaker) err(`${at}: {speaker.*} tokens need crew_speaker (nobody is picked to fill them)`);
    const npcs = [ev.npc, ...Object.values(ev.layers || {}).map(l => l.npc)].filter(Boolean);
    for (const n of npcs) if (n.displayName != null && !isUpper(n.displayName)) err(`${at}: npc.displayName must be an UPPERCASE name plate`);
    for (const [lk, l] of Object.entries(ev.layers || {})) {
      if (l.body_by_speaker == null) continue;
      if (!ev.crew_speaker) err(`${at}/${lk}: body_by_speaker without crew_speaker — nobody speaks`);
      for (const k of Object.keys(l.body_by_speaker)) if (k !== 'any' && !crewRoles.has(k)) err(`${at}/${lk}: body_by_speaker key "${k}" is not a crew role (or "any")`);
    }
    const outs = [...Object.entries(ev.outcomes || {}).map(([k, o]) => ['outcomes.' + k, o])];
    for (const { layer, choices } of choiceSetsOf(ev)) for (const ch of choices) if (ch.outcome && typeof ch.outcome === 'object') outs.push([layer, ch.outcome]);
    for (const [where, o] of outs) {
      // morale_to (per-crew morale, owner ruling 15): the outcome's morale
      // lands on one named crew member — "lowest" or a crew role — so it
      // needs a morale change to carry.
      if (o && o.morale_to != null) {
        const mat = atOf(file, ev.id, where);
        if (o.morale_to !== 'lowest' && !crewRoles.has(o.morale_to)) err(`${mat}: morale_to "${o.morale_to}" must be "lowest" or a crew role`);
        if (!(o.resources && Number.isFinite(o.resources.morale) && o.resources.morale)) err(`${mat}: morale_to without a resources.morale change — it moves nothing`);
      }
      const cj = o && o.crew_join;
      if (!cj) continue;
      const cat = atOf(file, ev.id, where);
      if (!cj.id || !cj.name || !cj.story) err(`${cat}: crew_join needs id, name and story (the crew screen shows them)`);
      if (cj.join_role != null && !crewRoles.has(cj.join_role)) err(`${cat}: crew_join.join_role "${cj.join_role}" is not a crew role`);
      if (cj.hp != null && !(Number.isInteger(cj.hp) && cj.hp > 0 && cj.hp <= 100)) err(`${cat}: crew_join.hp must be an integer 1-100`);
      const r = (cj.passenger && cj.passenger.reward) || {};
      for (const [k, v] of Object.entries(r)) if (!RES.has(k) || !Number.isFinite(v)) err(`${cat}: crew_join.passenger.reward.${k} is not a resource number`);
    }
  }
}

// ── Station approach (added 2026-10-11, owner ruling — engine/js/station.js) ──
// leave_next names a layer of the event; leave_sub is a one-line string;
// waves_off is boolean (closes the stop's services); choice.station is one
// of the station.js actions; station_room names a room the approach
// defines; exactly one station_approach event, engine-forced (trigger
// station_arrival) with its room table, fee pool and captain.
{
  const ACTIONS = new Set(['hail', 'dock', 'room', 'to_dock']);
  const approaches = [...eventsById.values()].filter(x => x.event.station_approach);
  if (approaches.length !== 1) err(`station approach: ${approaches.length} events carry station_approach (engine/js/station.js reads exactly one, event_station_014)`);
  const ap = approaches[0] && approaches[0].event;
  const roomKeys = new Set(Object.keys((ap && ap.station_rooms) || {}));
  if (ap) {
    const at = `${approaches[0].file} ${ap.id}`;
    if (ap.id !== 'event_station_014') err(`${at}: station.js looks the approach up as event_station_014`);
    if (JSON.stringify(ap.trigger) !== '["station_arrival"]') err(`${at}: the approach is engine-forced — trigger must be ["station_arrival"]`);
    for (const k of ['cantina', 'market', 'clinic', 'office', 'promenade', 'dockmaster']) if (!roomKeys.has(k)) err(`${at}: station_rooms.${k} missing (station.js maps NPC jobs to it)`);
    for (const [k, r] of Object.entries(ap.station_rooms || {})) for (const f of ['label', 'sub', 'nav', 'back']) if (typeof r[f] !== 'string' || !r[f]) err(`${at}: station_rooms.${k}.${f} missing`);
    if (!Array.isArray(ap.parking_fees) || !ap.parking_fees.length || !ap.parking_fees.every(f => f.reason && f.detail)) err(`${at}: parking_fees must be [{reason, detail}, …]`);
    if (!(Number.isInteger(ap.parking_cost) && ap.parking_cost > 0)) err(`${at}: parking_cost must be a positive integer`);
    if (!ap.station_captain || ap.station_captain.job !== 'captain') err(`${at}: station_captain must be a station_crew captain npc spec`);
    for (const l of ['intro', 'hail', 'hail_polite', 'hail_brief', 'waveoff_warn', 'docked']) if (!(ap.layers || {})[l]) err(`${at}: layer "${l}" missing (station.js shapes it)`);
  }
  for (const { file, event: ev } of eventsById.values()) {
    const at = `${file} ${ev.id}`;
    if ((ev.trigger || []).includes('station_arrival') && !ev.station_approach) err(`${at}: trigger station_arrival is the approach's alone`);
    if (ev.station_room != null && !roomKeys.has(ev.station_room)) err(`${at}: station_room "${ev.station_room}" is not a room the approach defines`);
    if (ev.leave_sub != null && typeof ev.leave_sub !== 'string') err(`${at}: leave_sub must be a string`);
    for (const [lk, l] of Object.entries(ev.layers || {})) {
      if (l.leave_next != null && !(ev.layers || {})[l.leave_next]) err(`${at}/${lk}: leave_next "${l.leave_next}" is not a layer of this event`);
      if (l.leave_sub != null && typeof l.leave_sub !== 'string') err(`${at}/${lk}: leave_sub must be a string`);
    }
    for (const { layer, choices } of choiceSetsOf(ev)) for (const ch of choices) {
      if (ch.station != null && !ACTIONS.has(ch.station)) err(`${atOf(file, ev.id, layer)}: choice "${ch.text || ch.label}" station "${ch.station}" is not ${[...ACTIONS].join('/')}`);
      if (ch.station != null && !ev.station_approach) err(`${atOf(file, ev.id, layer)}: choice.station only works on the approach event`);
      const o = ch.outcome && typeof ch.outcome === 'object' ? ch.outcome : null;
      if (o && o.waves_off != null && typeof o.waves_off !== 'boolean') err(`${atOf(file, ev.id, layer)}: waves_off must be true/false`);
      if (o && o.waves_off && !(ev.node_type || []).includes('station')) err(`${atOf(file, ev.id, layer)}: waves_off outside a station event`);
    }
    for (const [k, o] of Object.entries(ev.outcomes || {})) if (o && o.waves_off != null && typeof o.waves_off !== 'boolean') err(`${at}/outcomes.${k}: waves_off must be true/false`);
  }
}

// ── Encounter presentation fields (added 2026-10-11, encounter parity) ──
// The leave row (index.html renderLeaveRow; Bible §18 leaveLabel /
// leaveDisabled): every layered event names its leave row (`leave_label`)
// unless `no_leave` hides it; a forced event (`leave_disabled`, layered or
// flat) shows it locked and must say why ("CAN'T LEAVE (…)"); a flat
// event has no free leave row, so a label there without leave_disabled
// would never show. Layers may rename it (`leave_label`) or hide it
// (`leaveHidden`). `timed` puts ⏱ on the title; `pose` must be a styled
// pose; market_vendor / market_barter only mean something on open_market.
{
  const POSES = new Set(['hostile', 'listening', 'pleased']);
  const MARKET_VENDORS = new Set(['surplus']);
  const isLabel = v => typeof v === 'string' && v.trim() === v && v.length > 0 && v === v.toUpperCase();
  for (const { file, event: ev } of eventsById.values()) {
    const at = `${file} ${ev.id}`;
    if (ev.leave_label != null && !isLabel(ev.leave_label)) err(`${at}: leave_label must be a non-empty UPPERCASE string`);
    if (ev.leave_disabled != null && typeof ev.leave_disabled !== 'boolean') err(`${at}: leave_disabled must be true/false`);
    if (ev.timed != null && typeof ev.timed !== 'boolean') err(`${at}: timed must be true/false`);
    if (ev.leave_disabled) {
      if (!/^CAN'T LEAVE \(.+\)$/.test(ev.leave_label || '')) err(`${at}: leave_disabled needs leave_label "CAN'T LEAVE (<why>)" — the locked row has to say why`);
      if (ev.no_leave) err(`${at}: leave_disabled and no_leave together — the row is either locked or hidden`);
    } else if (ev.layers) {
      if (!ev.no_leave && ev.active !== false && !ev.leave_label) err(`${at}: layered event has no leave_label (its leave row would read "LEAVE") — name it, or no_leave: true`);
    } else if (ev.leave_label != null) {
      err(`${at}: flat event with leave_label but no leave_disabled — flat events have no leave row, the label never shows`);
    }
    // leave_as (b4 ruling 39): the leave row runs a choice-shaped exit —
    // a flee/ram/combat hijack or an outcome id of this event, never free.
    if (ev.leave_as != null) {
      const la = ev.leave_as;
      if (typeof la !== 'object' || Array.isArray(la)) err(`${at}: leave_as must be a choice-shaped object`);
      else {
        if (ev.no_leave || ev.leave_disabled) err(`${at}: leave_as on an event whose leave row is ${ev.no_leave ? 'hidden' : 'locked'} — it never runs`);
        if (!ev.layers) err(`${at}: leave_as on a flat event — flat events have no leave row`);
        if (!(la.triggerFleeResolve || la.triggerRamResolve || la.triggerCombat || la.outcome)) err(`${at}: leave_as does nothing (no outcome / flee / ram / combat)`);
        if (la.outcome != null && !(ev.outcomes || {})[la.outcome]) err(`${at}: leave_as.outcome "${la.outcome}" is not an outcome of this event`);
        if ((la.triggerFleeResolve || la.triggerRamResolve) && !la.outcome) err(`${at}: leave_as flee/ram needs the outcome it resolves to`);
      }
    }
    for (const [ok, o] of Object.entries(ev.outcomes || {})) {
      if (o && o.pose != null && !POSES.has(o.pose)) err(`${at}/outcomes.${ok}: pose "${o.pose}" is not styled (${[...POSES].join('/')})`);
    }
    for (const [lk, l] of Object.entries(ev.layers || {})) {
      const lat = at + '/' + lk;
      if (l.leave_label != null && !isLabel(l.leave_label)) err(`${lat}: leave_label must be a non-empty UPPERCASE string`);
      if (l.leave_label != null && (ev.no_leave || ev.leave_disabled)) err(`${lat}: layer leave_label on an event whose leave row is ${ev.no_leave ? 'hidden' : 'locked'} — it never shows`);
      if (l.leaveHidden != null && typeof l.leaveHidden !== 'boolean') err(`${lat}: leaveHidden must be true/false`);
      if (l.timed != null && typeof l.timed !== 'boolean') err(`${lat}: timed must be true/false`);
      if (l.pose != null && !POSES.has(l.pose)) err(`${lat}: pose "${l.pose}" is not styled (${[...POSES].join('/')})`);
    }
    for (const { layer, choices } of choiceSetsOf(ev)) {
      for (const ch of choices) {
        const cat = atOf(file, ev.id, layer), label = ch.text || ch.label;
        if (ch.market_vendor != null && !MARKET_VENDORS.has(ch.market_vendor)) err(`${cat}: choice "${label}" market_vendor "${ch.market_vendor}" is not a vendor engine/js/screens/market.js builds (${[...MARKET_VENDORS].join('/')})`);
        if ((ch.market_vendor != null || ch.market_barter) && !ch.open_market) err(`${cat}: choice "${label}" has market_vendor/market_barter but no open_market — it never opens a market`);
        if (ch.market_barter && !ev.npc) err(`${cat}: choice "${label}" market_barter needs the event's npc (the vendor's species decides the barter stock)`);
        if (ch.market_barter && ch.market_sinister) err(`${cat}: choice "${label}" market_barter on the black market — the sinister vendor never barters`);
      }
    }
  }
}

// ── Effort contract + hands-on job types (added 2026-10-11) ────────
// choiceEffort() only rolls effort when a choice authors BOTH
// effort_required and requires_effort_from, or names an EFFORT_CHECKS
// job type — an effort_required alone is dead data (no odds, no roll).
// Job types must be EFFORT_CHECKS keys (index.html) or launch_minigame
// ids; anything else is silently a plain choice. Combat hijacks resolve
// their own outcome, so an `outcome` on them never applies.
{
  for (const [type, from] of EFFORT_CHECKS) {
    for (const src of from) {
      if (src.startsWith('item:') ? !itemIds.has(src.slice(5)) : !crewRoles.has(src)) err(`index.html EFFORT_CHECKS.${type}: from "${src}" is not a crew role or item:<items.json id>`);
    }
  }
  for (const { file, event: ev } of eventsById.values()) {
    for (const { layer, choices } of choiceSetsOf(ev)) {
      for (const ch of choices) {
        const at = atOf(file, ev.id, layer), label = ch.text || ch.label;
        const job = ch.microgame_type || ch.minigame_type;
        if (ch.effort_required != null && !Array.isArray(ch.requires_effort_from) && !(job && EFFORT_CHECKS.has(job))) {
          err(`${at}: choice "${label}" has effort_required ${ch.effort_required} but no requires_effort_from array and no EFFORT_CHECKS microgame_type/minigame_type — choiceEffort() never reads it`);
        }
        for (const k of ['microgame_type', 'minigame_type']) {
          if (ch[k] != null && !EFFORT_CHECKS.has(ch[k]) && !MINIGAME_IDS.has(ch[k])) {
            err(`${at}: choice "${label}" ${k} "${ch[k]}" is neither an EFFORT_CHECKS job (${[...EFFORT_CHECKS.keys()].join('/')}) nor a minigame id — it does nothing`);
          }
        }
        if (Array.isArray(ch.requires_effort_from)) {
          for (const src of ch.requires_effort_from) {
            if (src.startsWith('item:') ? !itemIds.has(src.slice(5)) : !crewRoles.has(src)) err(`${at}: choice "${label}" requires_effort_from "${src}" is not a crew role or item:<items.json id>`);
          }
        }
        if ((ch.triggerCombat || ch.combat_trigger) && 'outcome' in ch) {
          err(`${at}: choice "${label}" is a combat hijack (${ch.triggerCombat ? 'triggerCombat' : 'combat_trigger'}) but carries an outcome — combat resolves its own outcome, this one never applies`);
        }
        // combat_intro (2026-10-11): an outcome id whose title/body/line
        // open the fight (combat.js triggerCombat) — only on a combat
        // hijack, must exist, and may carry no effects (none apply).
        if (ch.combat_intro != null) {
          const io = (ev.outcomes || {})[ch.combat_intro];
          if (!(ch.triggerCombat || ch.combat_trigger)) err(`${at}: choice "${label}" has combat_intro but is not a combat hijack — combat_intro is only read when a fight starts`);
          if (!io) err(`${at}: choice "${label}" combat_intro "${ch.combat_intro}" names no outcome in this event's outcomes`);
          else {
            const fx = ['resources', 'sets_flag', 'clears_flag', 'item_grant', 'item_consume', 'crew_effect', 'severity', 'materials', 'time_cost', 'set_orders']
              .filter(k => io[k] != null && !(typeof io[k] === 'object' && !Object.keys(io[k]).length));
            if (fx.length) err(`${at}: combat_intro outcome "${ch.combat_intro}" carries ${fx.join('/')} — an intro only opens the fight, those never apply`);
          }
        }
      }
    }
  }
}

// ── Item sinks, per trail (added 2026-10-11, owner: nothing orphaned) ──
// Every item needs somewhere to GO: a USE button (index.html ITEM_USE), a
// sale price, the fence's trade_good tag, a content reference that needs
// or spends it, a recipe input, an engine read (quoted literal), or an
// EFFORT_CHECKS tool slot. An item whose only sinks are event references
// must be spendable on every trail that can grant it.
{
  // ITEM_USE moved to engine/js/screens/inventory.js (parity batch 2).
  const ITEM_USE_FILE = 'engine/js/screens/inventory.js';
  const src = engineSrcByFile.get(ITEM_USE_FILE) || '';
  const iu = src.match(/const ITEM_USE = \{([\s\S]*?)\n\};/);
  const useKeys = new Set();
  if (!iu) err(`${ITEM_USE_FILE}: ITEM_USE table not found (lint parses it for item sinks)`);
  else for (const m of iu[1].matchAll(/^  (\w+):\s*\{/gm)) useKeys.add(m[1]);
  for (const k of useKeys) if (!itemIds.has(k)) err(`${ITEM_USE_FILE} ITEM_USE.${k}: not an item in items.json`);
  const literals = new Set();
  for (const s of engineSrcByFile.values()) for (const m of s.matchAll(/['"]([a-z0-9_]+)['"]/g)) literals.add(m[1]);
  const effortItems = new Set();
  for (const from of EFFORT_CHECKS.values()) for (const f of from) if (f.startsWith('item:')) effortItems.add(f.slice(5));
  const recipesRaw = readJSON('modules/recipes/recipes.json');
  const recipes = Array.isArray(recipesRaw) ? recipesRaw : (recipesRaw.recipes || []);
  const recipeSinks = new Set();
  for (const r of recipes) {
    if (r.active === false) continue;
    if (r.requires_item) recipeSinks.add(r.requires_item);
    for (const inp of (r.inputs || [])) if (inp.item_id) recipeSinks.add(inp.item_id);
  }
  // Per-event sink and grant references (active events only).
  const eventSinks = new Map(), eventGrants = new Map(); // item -> Set(event id)
  const addTo = (m, id, evId) => { if (!id) return; if (!m.has(id)) m.set(id, new Set()); m.get(id).add(evId); };
  for (const { event: ev } of eventsById.values()) {
    if (ev.active === false) continue;
    addTo(eventSinks, ev.requires_item, ev.id);
    const outs = [];
    for (const { choices } of choiceSetsOf(ev)) {
      for (const ch of choices) {
        addTo(eventSinks, ch.requires_item, ev.id);
        addTo(eventSinks, ch.gate && ch.gate.item, ev.id);
        for (const f of (Array.isArray(ch.requires_effort_from) ? ch.requires_effort_from : [])) if (f.startsWith('item:')) addTo(eventSinks, f.slice(5), ev.id);
        if (ch.outcome && typeof ch.outcome === 'object') outs.push(ch.outcome);
      }
    }
    for (const o of Object.values(ev.outcomes || {})) if (o && typeof o === 'object') outs.push(o);
    for (const ch of ((ev.stowaway_variant || {}).stowaway_choices || [])) if (ch.outcome) outs.push(ch.outcome);
    for (const o of outs) {
      addTo(eventSinks, o.item_consume, ev.id);
      for (const g of (Array.isArray(o.item_grant) ? o.item_grant : [o.item_grant])) addTo(eventGrants, g, ev.id);
    }
  }
  const recipeOutputs = new Set(recipes.filter(r => r.active !== false).map(r => r.output && r.output.item_id).filter(Boolean));
  for (const it of readJSON('modules/items/items.json').filter(i => !i._section && i.active !== false)) {
    const id = shortItem(it.id);
    const global = [];
    if (useKeys.has(id)) global.push('USE');
    if (it.base_price > 0) global.push('price');
    if ((it.tags || []).includes('trade_good')) global.push('trade_good');
    if (recipeSinks.has(id)) global.push('recipe');
    if (literals.has(id)) global.push('engine');
    if (effortItems.has(id)) global.push('EFFORT_CHECKS');
    if (global.length) continue;
    const sinks = eventSinks.get(id);
    if (!sinks) { err(`item "${id}" has no sink — no USE handler, no price, no trade_good tag, nothing requires/consumes it, no recipe input, no engine read, no EFFORT_CHECKS slot`); continue; }
    // Only event references spend it: each trail that can grant it must
    // also reach one of those events.
    const grantAll = it.item_source === 'purchasable' || id in engineGrantedItems || recipeOutputs.has(id);
    for (const trail of trailTypes.keys()) {
      const grants = grantAll || [...(eventGrants.get(id) || [])].some(e => eventOnTrail(eventsById.get(e).event, trail));
      if (!grants) continue;
      if (![...sinks].some(e => eventOnTrail(eventsById.get(e).event, trail))) {
        warn(`item "${id}": grantable on ${trail} (${[...(eventGrants.get(id) || ['engine/market'])].filter(e => grantAll || eventOnTrail(eventsById.get(e).event, trail)).join(', ')}) but its only sinks (${[...sinks].join(', ')}) can't spawn on ${trail} — dead cargo there`);
      }
    }
  }
}

// ── Trade-good values (added 2026-10-11, owner ruling) ─────────────
// sell_range is rolled per copy at pickup (index.html TRADE-GOOD VALUES)
// and replaces base_price; the spectrometer_reveals_value tag hides that
// value until a spectrometer is aboard, so it needs a sell_range to hide.
{
  for (const it of readJSON('modules/items/items.json').filter(i => !i._section && i.id)) {
    const r = it.sell_range, tags = it.tags || [];
    if (r !== undefined && r !== null) {
      if (!Array.isArray(r) || r.length !== 2 || !r.every(v => Number.isInteger(v) && v > 0) || r[0] > r[1]) err(`items.json ${it.id}: sell_range must be [lo, hi] — positive integers, lo <= hi (got ${JSON.stringify(r)})`);
      if (it.base_price != null) err(`items.json ${it.id}: has a sell_range AND base_price ${it.base_price} — the rolled value replaces the fixed price (set base_price null)`);
      if (!tags.includes('trade_good')) err(`items.json ${it.id}: sell_range on an item without the trade_good tag — nobody would buy it`);
      if (it.item_source === 'purchasable') err(`items.json ${it.id}: a purchasable item can't have a sell_range — the station shelves it at base_price`);
    }
    if (tags.includes('spectrometer_reveals_value') && !(Array.isArray(r) && r.length === 2)) err(`items.json ${it.id}: tagged spectrometer_reveals_value but has no sell_range — there's no rolled value to reveal`);
  }
}

// ── Engine flags documented (added 2026-10-11) ─────────────────────
// Every literal flag the engine sets must have prose in gen_flags.js
// (that's what puts it in registry/flags.md), and the ENGINE_SET_FLAGS
// allowlist must name the file that really sets each flag.
{
  const { literals, families } = genFlags.scanEngine();
  for (const [flag, file] of Object.entries(ENGINE_SET_FLAGS)) {
    if (!(literals.get(flag) || new Set()).has(file)) err(`ENGINE_SET_FLAGS.${flag}: ${file} never sets it (no flags.add('${flag}') / sets_flag = '${flag}')${literals.has(flag) ? ' — it is set in ' + [...literals.get(flag)].join(', ') : ''} — fix the entry`);
  }
  for (const [flag, files] of literals) if (!genFlags.ENGINE_FLAG_NOTES[flag]) err(`engine flag "${flag}" (set in ${[...files].join(', ')}) is undocumented — add it to tools/gen_flags.js ENGINE_FLAG_NOTES, then run node tools/gen_flags.js`);
  for (const [p, files] of families) if (!genFlags.FAMILY_NOTES[p]) err(`engine flag family "${p}<…>" (set in ${[...files].join(', ')}) is undocumented — add it to tools/gen_flags.js FAMILY_NOTES`);
  for (const flag of Object.keys(genFlags.ENGINE_FLAG_NOTES)) if (!literals.has(flag)) warn(`tools/gen_flags.js ENGINE_FLAG_NOTES.${flag}: the engine no longer sets it — drop the note`);
  for (const p of Object.keys(genFlags.FAMILY_NOTES)) if (!families.has(p)) warn(`tools/gen_flags.js FAMILY_NOTES.${p}: the engine no longer sets this family — drop the note`);
}

// ── Ending reachability (added 2026-10-11) ─────────────────────────
// endings.js fills body_template's {crop_paragraph} from
// crop_paragraphs[thriving|sick|dead] and {crew_paragraph} from
// crew_paragraphs[full|partial|solo]; score_paragraphs is keyed by
// bracket. scoreBracket() (index.html) returns 'hollow' whenever the crop
// is dead, so a numeric-bracket ending's crop_paragraphs.dead never shows.
{
  const brackets = new Set(Object.keys((registry.ending_score || {}).values || {}));
  const CROP_KEYS = new Set(['thriving', 'sick', 'dead']), CREW_KEYS = new Set(['full', 'partial', 'solo']);
  for (const e of readJSON('modules/endings/endings.json')) {
    if (e._section || e.active === false) continue;
    const at = `endings.json ${e.id}`, body = e.body_template || '';
    if (e.crop_paragraphs) {
      if (!body.includes('{crop_paragraph}')) warn(`${at}: authors crop_paragraphs but body_template has no {crop_paragraph} token — they never show`);
      for (const k of Object.keys(e.crop_paragraphs)) if (!CROP_KEYS.has(k)) err(`${at}: crop_paragraphs key "${k}" is not thriving/sick/dead`);
      if ('dead' in e.crop_paragraphs && e.ending_score !== 'hollow' && e.ending_score !== 'any') warn(`${at}: crop_paragraphs.dead on a "${e.ending_score}" ending is unreachable — a dead crop forces the hollow bracket`);
    }
    for (const k of Object.keys(e.crew_paragraphs || {})) if (!CREW_KEYS.has(k)) err(`${at}: crew_paragraphs key "${k}" is not full/partial/solo`);
    for (const k of Object.keys(e.score_paragraphs || {})) if (!brackets.has(k)) err(`${at}: score_paragraphs key "${k}" is not a registered ending_score bracket`);
  }
}

// ── Salvage sprite sets (added 2026-10-11, parity batch 2) ──────────
// SALVAGE plays sprites/minigames/salvage/ in a debris field and
// sprites/minigames/derelict/ inside a hulk (owner ruling #12): every file
// in both folders must be named in minigames.js (nothing orphaned), and no
// sprite filename may carry stray whitespace (four derelict files once
// ended in a space and could never load by their clean name).
{
  const src = fs.readFileSync(path.join(ROOT, 'engine/js/minigames.js'), 'utf8');
  for (const dir of ['sprites/minigames/salvage', 'sprites/minigames/derelict']) {
    for (const f of fs.readdirSync(path.join(ROOT, dir))) {
      if (f.startsWith('.')) continue;
      if (f !== f.trim()) { err(`${dir}/${JSON.stringify(f)}: filename has leading/trailing whitespace`); continue; }
      if (!src.includes(f)) err(`${dir}/${f}: not named in engine/js/minigames.js — no salvage run can show it`);
    }
  }
  const walk = d => { for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
    if (e.name !== e.name.trim()) err(`${d}/${JSON.stringify(e.name)}: sprite path has leading/trailing whitespace`);
    else if (e.isDirectory()) walk(d + '/' + e.name);
  } };
  walk('sprites');
}

// ── Player-facing item text (added 2026-10-11, parity batch 2) ─────
// items.json gameplay_effect is shown to the player as written (the
// fabricator's detail line; any future inventory row). Authoring notes —
// stacking rules, recipes, event ids, "gate item" — go in design_note.
{
  const NOTE = /\b(Stackable|Craftable|Fabricated|Pure trade good|Info-only|Gate item|Key for)\b|\b(event|recipe|item|crop)_[a-z0-9_]+|\b[a-z]+_[a-z][a-z_]*\b/;
  for (const it of readJSON('modules/items/items.json').filter(i => !i._section && i.id)) {
    const ge = it.gameplay_effect;
    if (ge == null) continue;
    const m = String(ge).match(NOTE);
    if (m) err(`items.json ${it.id}: gameplay_effect carries an authoring note ("${m[0]}") — players see this text; move it to design_note`);
  }
}

// ── Arrival lines + tier quotes (added 2026-10-11, parity batch 2) ──
// endings.json's { _section: 'arrival_lines' } entry (index.html moves it
// to MOD.endingLines; endings.js reads it): every trail × every crop (+
// 'noplant') needs its destination line, and every bracket scoreBracket()
// can return needs its quote — a gap would leave an arrival report short.
{
  const all = readJSON('modules/endings/endings.json');
  const secs = all.filter(e => e._section);
  for (const e of secs) if (e._section !== 'arrival_lines') err(`endings.json: unknown _section "${e._section}" (only arrival_lines is read)`);
  const sec = secs.find(e => e._section === 'arrival_lines');
  if (!sec) err('endings.json: no { _section: "arrival_lines" } entry — arrivals would show no destination line or quote');
  else {
    const trails = Object.keys(readJSON('modules/maps/map_rules.json').trails || {});
    const crops = (readJSON('modules/crops/crops.json').crops || []).map(c => String(c.id).replace(/^crop_/, '')).concat('noplant');
    const al = sec.arrival_lines || {};
    for (const t of trails) for (const c of crops) {
      const line = (al[t] || {})[c];
      if (typeof line !== 'string' || !line.trim()) err(`endings.json arrival_lines.${t}.${c}: missing — that arrival shows no destination line`);
    }
    for (const t of Object.keys(al)) {
      if (!trails.includes(t)) err(`endings.json arrival_lines.${t}: not a trail in map_rules.json`);
      for (const c of Object.keys(al[t] || {})) if (!crops.includes(c)) err(`endings.json arrival_lines.${t}.${c}: not a crop id (or noplant)`);
    }
    const brackets = Object.keys((registry.ending_score || {}).values || {}).filter(b => b !== 'any');
    for (const b of brackets) if (typeof (sec.tier_quotes || {})[b] !== 'string' || !sec.tier_quotes[b].trim()) err(`endings.json tier_quotes.${b}: missing — that bracket's arrival shows no quote`);
    for (const b of Object.keys(sec.tier_quotes || {})) if (!brackets.includes(b)) err(`endings.json tier_quotes.${b}: not a registered ending_score bracket`);
  }
}

// ── NPC line tokens (added 2026-10-11) ─────────────────────────────
// {npc.line.<slot>} resolves against the EVENT's npc (index.html
// interpolateNpcTokens): npc_disposition_lines[disposition][slot], and for
// station_crew one level deeper by job (default janitor). An empty pool
// drops the token to ''; an event with no npc shows the raw token.
// Outcome lines may be spoken by a layer npc (STATE.lastSpeaker).
{
  const pools = readJSON('modules/flavor/flavor_pools.json').npc_disposition_lines || {};
  const resolves = (npc, slot) => {
    if (!npc) return false;
    let pool = pools[npc.disposition];
    if (pool && npc.disposition === 'station_crew') pool = pool[npc.job || 'janitor'];
    return !!(pool && Array.isArray(pool[slot]) && pool[slot].length);
  };
  const tokens = o => { const out = []; (function walk(x) { if (typeof x === 'string') { for (const m of x.matchAll(/\{npc\.line\.(\w+)\}/g)) out.push(m[1]); } else if (x && typeof x === 'object') for (const k in x) walk(x[k]); })(o); return out; };
  const usedJobs = new Set();
  for (const { file, event: ev } of eventsById.values()) {
    if (ev.npc && ev.npc.job) usedJobs.add(ev.npc.job);
    const layerNpcs = Object.values(ev.layers || {}).map(l => l.npc).filter(Boolean);
    layerNpcs.forEach(n => n.job && usedJobs.add(n.job));
    const desc = n => n ? n.disposition + (n.disposition === 'station_crew' ? '/' + (n.job || 'janitor') : '') : 'no npc';
    const { outcomes, ...rest } = ev;
    for (const slot of new Set(tokens(rest))) {
      if (!resolves(ev.npc, slot)) err(`${file} ${ev.id}: {npc.line.${slot}} has no line pool for ${desc(ev.npc)} in flavor_pools.npc_disposition_lines`);
    }
    for (const slot of new Set(tokens(outcomes || {}))) {
      if (![ev.npc, ...layerNpcs].some(n => resolves(n, slot))) err(`${file} ${ev.id}/outcomes: {npc.line.${slot}} has no line pool for any speaker (${[ev.npc, ...layerNpcs].map(desc).join(', ')})`);
    }
  }
  for (const [job, v] of Object.entries((registry.npc_station_job || {}).values || {})) {
    if (v.status !== 'deprecated' && !usedJobs.has(job)) warn(`npc_station_job "${job}" is registered but no event or layer npc uses it`);
  }
}

// ── Sprite assets (added 2026-10-11) ───────────────────────────────
// Header reads only: an image's extension must match its magic bytes
// (a PNG named .jpg), and every NPC spritesheet.png must be the 392×294
// 3×3 grid of 130×98 frames scene_art.js slices.
{
  const SPR = path.join(ROOT, 'resources/sprites');
  const magic = b => b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG' ? 'png'
    : b[0] === 0xff && b[1] === 0xd8 ? 'jpg'
    : b.toString('latin1', 0, 3) === 'GIF' ? 'gif'
    : b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP' ? 'webp' : 'unknown';
  const head = f => { const fd = fs.openSync(f, 'r'), b = Buffer.alloc(24); fs.readSync(fd, b, 0, 24, 0); fs.closeSync(fd); return b; };
  const walk = (dir, fn) => { if (!fs.existsSync(dir)) return; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) walk(f, fn); else fn(f); } };
  const check = (f, npc) => {
    const ext = path.extname(f).toLowerCase().replace('jpeg', 'jpg').slice(1);
    if (!['png', 'jpg', 'gif', 'webp'].includes(ext)) return;
    const b = head(f), kind = magic(b), rel = path.relative(SPR, f);
    if (kind !== ext) warn(`sprites/${rel}: .${ext} file holds ${kind.toUpperCase()} data — rename it (or re-export)`);
    if (npc && path.basename(f) === 'spritesheet.png' && kind === 'png') {
      const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
      if (w !== 392 || h !== 294) warn(`sprites/${rel}: NPC spritesheet is ${w}×${h}, not 392×294 — frames slice off-grid`);
      // The engine slices fixed cells (scene_art.js NPC_FRAME_COORDS: 96×96,
      // 1px border, 2px gutter) in the JSON's frame order — a right-sized
      // sheet packed edge to edge still slices 1–5px off.
      const CELLS = [[1, 1], [99, 1], [197, 1], [1, 99], [99, 99], [197, 99], [1, 197], [99, 197], [197, 197], [295, 1]];
      const jf = path.join(path.dirname(f), 'spritesheet.json');
      try {
        const j = JSON.parse(fs.readFileSync(jf, 'utf8'));
        const frames = Array.isArray(j.frames) ? j.frames : Object.values(j.frames || {});
        const bad = frames.findIndex((fr, i) => !CELLS[i] || fr.frame.x !== CELLS[i][0] || fr.frame.y !== CELLS[i][1] || fr.frame.w !== 96 || fr.frame.h !== 96);
        if (frames.length !== 10 || bad >= 0) warn(`sprites/${rel}: frame ${bad >= 0 ? bad : frames.length} is not on the engine grid (96×96 cells at 1/99/197/295, 1px border, 2px gutter) — the talk animation slices off`);
      } catch (e) { warn(`sprites/${rel}: no readable spritesheet.json beside it`); }
    }
  };
  walk(path.join(SPR, 'backgrounds'), f => check(f, false));
  // NPC art the engine loads: <disposition>/[<job>/]<species>/<N>/spritesheet.png
  // (the loose source images at the npc/ root are never referenced).
  walk(path.join(SPR, 'npc'), f => { if (path.dirname(f) !== path.join(SPR, 'npc') && path.basename(f) === 'spritesheet.png') check(f, true); });
}

// Difficulty weights need content (owner ruling 2026-10-11: 'ultra'
// stays at 0 until ultra events exist): a trail can't weight a tier
// that has no active event able to fire on it.
{
  const rules = readJSON('modules/maps/map_rules.json');
  for (const [trail, t] of Object.entries(rules.trails || {})) {
    for (const [tier, w] of Object.entries(t.event_difficulty_weights || {})) {
      if (!(w > 0)) continue;
      const any = [...eventsById.values()].some(({ event: ev }) => ev.active !== false
        && (Array.isArray(ev.difficulty) ? ev.difficulty[0] : (ev.difficulty || 'medium')) === tier
        && (!ev.trail || ev.trail.includes(trail)));
      if (!any) err(`map_rules ${trail}: event_difficulty_weights.${tier} is ${w} but no active event of that tier can fire on ${trail} — set it to 0 or write the events`);
    }
  }
}

// Captain / AI numbers the engine reads (one source of truth, owner
// ruling 2026-10-11) must be numbers where the engine looks for them.
{
  const caps = readJSON('modules/captains/captains.json').captains || [];
  const NUMERIC = { botanist: ['crop_water_modifier'], engineer: ['fabricator_wear_modifier', 'fabricator_contribution'], medic: ['severity_modifier.lethal_to_injury_chance'], pilot: ['fuel_burn_modifier'], chef: ['food_consumption_modifier', 'morale_passive'], merchant: ['station_price_modifier'], academic: ['fabricator_contribution'] };
  for (const [bg, keys] of Object.entries(NUMERIC)) {
    const c = caps.find(x => x.background === bg);
    if (!c) { err(`captains.json: no captain with background "${bg}"`); continue; }
    if (!Number.isFinite(c.skill_modifier)) err(`captains.json ${c.id}: skill_modifier is not a number`);
    for (const k of keys) {
      const v = k.split('.').reduce((o, p) => o && o[p], c.passive_effect);
      if (!Number.isFinite(v)) err(`captains.json ${c.id}: passive_effect.${k} must be a number (the engine reads it)`);
    }
  }
  const ais = readJSON('modules/ai/ai_companions.json');
  for (const [id, type] of [['ai_aria', 'morale_bonus'], ['ai_chip', 'price_reduction']]) {
    const a = ais.find(x => x.id === id);
    if (!a || !a.passive_effect || a.passive_effect.type !== type || !Number.isFinite(a.passive_effect.value)) err(`ai_companions.json ${id}: passive_effect must be { type: "${type}", value: <number> } (the engine reads it)`);
  }
  // log_templates (Ship's Log voicing, engine/js/shipslog.js): every AI
  // authors every key, and each carries the tokens that state the REAL
  // effect (no decorative claims). Fixed text stays short so the filled
  // entry fits the Bible §19 120-char cap.
  const LOG_TEMPLATE_TOKENS = {
    choice: ['title', 'choice'], outcome_good: ['line', 'effects'], outcome_bad: ['line', 'effects'],
    death: ['name', 'crew_left'], memorial_title: ['name'],
    stowaway_join: ['name', 'role', 'crew_count'], stowaway_passenger: ['name', 'crew_count'],
    crop_stage: ['crop', 'stage', 'growth', 'health'], crop_ready: ['crop', 'health'],
    arrival: ['place', 'costs'],
    fight_won: ['title', 'effects'], fight_lost: ['title', 'effects'], fight_fled: ['title', 'effects'], fight_paid: ['title', 'effects'],
    morale_zero: ['name'], morale_back: ['name'], desertion: ['name', 'role', 'place', 'crew_left'], // per-crew morale (owner ruling 15)
  };
  for (const a of ais) {
    const t = a.log_templates;
    if (!t || typeof t !== 'object') { err(`ai_companions.json ${a.id}: log_templates missing (the Ship's Log voices every entry from it)`); continue; }
    for (const [k, toks] of Object.entries(LOG_TEMPLATE_TOKENS)) {
      if (typeof t[k] !== 'string' || !t[k].trim()) { err(`ai_companions.json ${a.id}: log_templates.${k} missing`); continue; }
      for (const tok of toks) if (!t[k].includes('{' + tok + '}')) err(`ai_companions.json ${a.id}: log_templates.${k} must use {${tok}} (states the real effect)`);
      const fixed = t[k].replace(/\{\w+\}/g, '').length;
      if (fixed > 60) err(`ai_companions.json ${a.id}: log_templates.${k} fixed text is ${fixed} chars (≤ 60 leaves room under the 120 cap)`);
    }
    for (const k of Object.keys(t)) if (!(k in LOG_TEMPLATE_TOKENS)) err(`ai_companions.json ${a.id}: log_templates.${k} is not a key the engine reads`);
  }
}

// ── Scene backdrops (added 2026-10-11, owner ruling "unused backdrops") ──
// Every backdrop path an event names — layer bg / bgBase / bgSprite
// (demo names, 'inherit' allowed) and outcome scene_bg / scene_bg_base /
// scene_bg_sprite — must resolve on disk the way scene_art.js resolves
// it: a flat <path>.jpg|.png, or a numbered pool <path>/1..8.jpg (bg
// slots; sprite slots also take .png). Tokens expand over every value
// they can take: {species} (needs an event npc), {crop}, {biome}.
// Then an orphan report: background images that no event path and no
// engine scene pool (below — mirror of scene_art.js sceneSpecFor +
// combat.js + mining.js) can ever show.
{
  const BG = path.join(ROOT, 'resources/sprites/backgrounds');
  const PROBE_MAX = 8; // scene_art.js BG_PROBE_MAX
  const SPECIES = Object.keys((registry.npc_species || {}).values || {});
  const CROPS = (readJSON('modules/crops/crops.json').crops || []).map(c => c.id.replace(/^crop_/, ''));
  const BIOMES = ['alien', 'desert', 'habitable', 'ice', 'ocean', 'volcanic']; // scene_art.js PLANET_BIOMES
  const TOKENS = { species: SPECIES, crop: CROPS, biome: BIOMES };
  const expand = raw => {
    let outs = [raw];
    for (const [tok, vals] of Object.entries(TOKENS)) {
      if (!raw.includes('{' + tok + '}')) continue;
      outs = outs.flatMap(o => vals.map(v => o.split('{' + tok + '}').join(v)));
    }
    return outs;
  };
  const exists = rel => fs.existsSync(path.join(BG, rel));
  // Files a path can show, exactly as the resolver probes (flat file wins).
  const filesFor = (rel, sprite) => {
    const flat = sprite ? ['.png', '.jpg'] : ['.jpg', '.png'];
    for (const ext of flat) if (exists(rel + ext)) return [rel + ext];
    const out = [];
    for (let i = 1; i <= PROBE_MAX; i++) {
      if (exists(rel + '/' + i + '.jpg')) out.push(rel + '/' + i + '.jpg');
      if (sprite && exists(rel + '/' + i + '.png')) out.push(rel + '/' + i + '.png');
    }
    return out;
  };
  // Approach pools (scene_art.js STATION_APPROACH_POOL — station hails +
  // the cruise hub's station stop): numbered SUBFOLDERS, each either a
  // spritesheet (spritesheet.png + a spritesheet.json with frames and
  // meta.size — shown animated) or one static png (<N>.png, else 1.png),
  // exactly as resolveApproach probes. A sheet's packing-source frames
  // (loose files its json names, e.g. frame_000.png) are shown through
  // the sheet; anything else in the folder is still an orphan.
  const APPROACH_POOLS = ['station/approach'];
  const approachFiles = (rel) => {
    const out = [];
    for (let i = 1; i <= PROBE_MAX; i++) {
      const dir = rel + '/' + i;
      if (exists(dir + '/spritesheet.png') && exists(dir + '/spritesheet.json')) {
        let j = null;
        try { j = JSON.parse(fs.readFileSync(path.join(BG, dir, 'spritesheet.json'), 'utf8')); } catch (_) { j = null; }
        const frames = j && j.frames ? (Array.isArray(j.frames) ? j.frames.map(f => [f.filename, f]) : Object.entries(j.frames)) : [];
        if (frames.length && frames.every(([, f]) => f && f.frame) && j.meta && j.meta.size && j.meta.size.w && j.meta.size.h) {
          out.push(dir + '/spritesheet.png');
          for (const [name] of frames) {
            if (!name) continue;
            const file = /\.png$/i.test(name) ? name : name + '.png';
            if (exists(dir + '/' + file)) out.push(dir + '/' + file);
          }
          continue;
        }
        err(`${dir}/spritesheet.json: approach sheet needs frames[].frame {x,y,w,h} and meta.size {w,h} (scene_art.js reads both)`);
      }
      for (const name of [i + '.png', '1.png']) if (exists(dir + '/' + name)) { out.push(dir + '/' + name); break; }
    }
    return out;
  };
  const shown = new Set();
  const usePath = (at, field, raw, ev, sprite) => {
    if (raw === undefined || raw === null || raw === '' || raw === 'inherit') return;
    if (typeof raw !== 'string') { err(`${at}: ${field} must be a backdrop path string`); return; }
    const unknown = (raw.match(/\{(\w+)\}/g) || []).filter(t => !TOKENS[t.slice(1, -1)]);
    if (unknown.length) { err(`${at}: ${field} "${raw}" uses unknown token ${unknown.join(', ')} (scene_art.js expands {species}, {crop}, {biome})`); return; }
    if (raw.includes('{species}') && !ev.npc) err(`${at}: ${field} "${raw}" uses {species} but the event has no npc to take it from — it never resolves`);
    for (const rel of expand(raw)) {
      const files = (sprite && APPROACH_POOLS.includes(rel)) ? approachFiles(rel) : filesFor(rel, sprite);
      if (!files.length) err(`${at}: ${field} "${raw}" → sprites/backgrounds/${rel} has no ${sprite ? '.png/.jpg' : '.jpg'} file or numbered pool on disk`);
      files.forEach(f => shown.add(f));
    }
  };
  const LAYER_FIELDS = [['bg', false], ['bgBase', false], ['bgSprite', true]];
  const OUTCOME_FIELDS = [['scene_bg', false], ['scene_bg_base', false], ['scene_bg_sprite', true]];
  const outcomeScenes = (at, o, ev) => {
    if (!o || typeof o !== 'object') return;
    for (const [f, sp] of OUTCOME_FIELDS) usePath(at, f, o[f], ev, sp);
    for (const [t, to] of Object.entries(o.tier_outcomes || {})) outcomeScenes(at + ' tier ' + t, to, ev);
  };
  for (const { file, event: ev } of eventsById.values()) {
    for (const [f, sp] of LAYER_FIELDS) usePath(atOf(file, ev.id, ''), f, ev[f], ev, sp); // event-level room (scene_art sceneSpecFor)
    for (const [lid, layer] of Object.entries(ev.layers || {})) {
      for (const [f, sp] of LAYER_FIELDS) usePath(atOf(file, ev.id, lid), f, layer[f], ev, sp);
    }
    for (const [oid, o] of Object.entries(ev.outcomes || {})) outcomeScenes(atOf(file, ev.id, 'outcomes.' + oid), o, ev);
    for (const { layer, choices } of choiceSetsOf(ev)) {
      for (const ch of choices) {
        if (ch.outcome && typeof ch.outcome === 'object') outcomeScenes(atOf(file, ev.id, layer), ch.outcome, ev);
        for (const [t, to] of Object.entries(ch.tier_outcomes || {})) outcomeScenes(atOf(file, ev.id, layer) + ' tier ' + t, to, ev);
      }
    }
  }
  // Engine-chosen scenes (no event names them). [path, sprite-slot?, where]
  const ENGINE_SCENE_POOLS = [
    ['our_ship/bridge', false, 'scene_art.js ship_exterior'], ['space/deep', false, 'scene_art.js spaceFor'],
    ['space/nebula', false, 'scene_art.js spaceFor'], ['space/asteroid_field', false, 'scene_art.js spaceFor'],
    ['ship_exterior/unknown', true, 'scene_art.js ship_exterior'], ['ship_exterior/drifter', true, 'scene_art.js ship_exterior'],
    ['ship_exterior/pirate/{species}', true, 'scene_art.js ship_exterior'], ['ship_exterior/trader/{species}', true, 'scene_art.js ship_exterior'],
    ['ship_interior/pirate/{species}', false, 'combat.js accepted surrender'], ['ship_interior/generic', false, 'scene_art.js ship_interior'],
    ['ship_interior/derelict', false, 'scene_art.js derelict_interior'], ['our_ship/corridor', false, 'scene_art.js ship_interior'],
    ['our_ship/growbay/{crop}', false, 'scene_art.js growbay'],
    ['station/medbay', false, 'scene_art.js station'], ['station/office', false, 'scene_art.js station'], ['station/dock', false, 'scene_art.js station'],
    ['station/promenade', false, 'scene_art.js station'], ['station/market/mixed', false, 'scene_art.js station'],
    ['station/market/human', false, 'scene_art.js station trader (human vendor)'], ['station/market/alien', false, 'scene_art.js station trader (alien vendor)'], ['station/cantina', false, 'scene_art.js station'],
    ['planet_surface/{biome}/approach', false, 'scene_art.js planet_surface'],
    ['station/approach', true, 'scene_art.js station hail + cruise.js station stop'],
    ['anomaly/distortion', false, 'scene_art.js anomaly'], ['anomaly/fractal', false, 'scene_art.js anomaly'], ['anomaly/void', false, 'scene_art.js anomaly'],
  ];
  for (const [p, sp, where] of ENGINE_SCENE_POOLS) usePath('engine ' + where, 'scene pool', p, { npc: true }, sp);
  // Orphans: images under backgrounds/ nothing above can show. endgame/
  // belongs to endings.js (its own file naming), so it is not swept here.
  const orphans = new Map(); // folder → count
  const walkBg = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name), rel = path.relative(BG, f).split(path.sep).join('/');
      if (e.isDirectory()) { if (rel !== 'endgame') walkBg(f); continue; }
      if (!/\.(jpg|png)$/i.test(e.name) || shown.has(rel)) continue;
      const folder = path.dirname(rel);
      orphans.set(folder, (orphans.get(folder) || 0) + 1);
    }
  };
  if (fs.existsSync(BG)) walkBg(BG);
  // Owner 2026-10-11: every background must be reachable ("if they don't, we need to wire them up").
  for (const [folder, n] of [...orphans].sort()) err(`orphaned backdrop: sprites/backgrounds/${folder}/ — ${n} image(s) no event path or engine scene pool can show`);
}

function printWarnings(out) {
  if (!warnings.length) return;
  out(`lint_modules: ${warnings.length} warning(s) (not failing):\n`);
  warnings.forEach(w => out('  ~ ' + w));
  out('');
}
if (errors.length) {
  printWarnings(console.error);
  console.error(`lint_modules: ${errors.length} issue(s) found:\n`);
  errors.forEach(e => console.error('  - ' + e));
  process.exit(1);
} else {
  printWarnings(console.log);
  console.log('trail coverage — ' + trailCoverage());
  console.log(`lint_modules: clean — ${eventsById.size} events across ${eventFiles.length} files, ${allChoices.length} choices checked${warnings.length ? ` (${warnings.length} warning(s))` : ''}.`);
}

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
// dangling-requires_flag check. Keep in sync with registry/flags.md's
// engine table when new engine-set flags land.
const ENGINE_SET_FLAGS = new Set([
  'chose_alpha', 'chose_beta', 'crop_death_accepted', 'crew_lost',
  'ai_noted_crop_mature', 'ai_noted_crop_sick', 'ai_noted_crop_died', 'ai_noted_crop_planted', 'ai_noted_pest',
  'stowaway_welcomed', 'stowaway_passenger', 'stowaway_refused',
  'executed_surrendered_pirate',
  'emergency_patch_armed', 'negotiation_prepared',
]);

// Minigame ids openMinigame() accepts (engine/js/minigames.js) — for
// launch_minigame validation.
const MINIGAME_IDS = new Set(['scan', 'engine', 'medical', 'forage', 'brace', 'breach', 'salvage']);
const STOWAWAY_RESOLVES = new Set(['welcome', 'welcome_replace', 'refuse']);
// crew_effect contract (applyOutcomeEffects). "patient" = the wounded
// crew member of an engine-forced delayed_crisis event, so it (and the
// {patient.*} text tokens) only make sense inside those events.
const CREW_EFFECT_TYPES = new Set(['injure', 'kill', 'heal']);
const CREW_EFFECT_TARGETS = new Set(['random', 'specific_role', 'all_injured', 'patient']);
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

        if (ch.requires_crew && !crewRoles.has(ch.requires_crew)) {
          err(`${file} ${ev.id}${layer ? '/' + layer : ''}: requires_crew "${ch.requires_crew}" is not a role in crew_roster.json`);
        }
        if (ch.gate && ch.gate.crew && !crewRoles.has(ch.gate.crew)) {
          err(`${file} ${ev.id}${layer ? '/' + layer : ''}: gate.crew "${ch.gate.crew}" is not a role in crew_roster.json`);
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

// Item sources (nothing orphaned): every item a choice, event or recipe
// REQUIRES must be obtainable somewhere — an event grant, the station
// market (purchasable), a recipe, or one of the engine's own grant paths
// below. Five items were required but unobtainable until 2026-10-09.
{
  const ENGINE_GRANTED_ITEMS = new Set([
    'drive_coil', 'o2_recycler', 'repair_fabricator', // salvage minigame upgrades (minigames.js UPGRADES)
    'fuel_cell', 'repair_kit',                        // combat loot (combat.js)
    'classified_cargo',                               // sinister market back inventory (market.js)
    'logbook_fragment', 'medkit',                     // forage rare finds (cruise.js RARE_TO_REAL)
    'fab_surplus',                                    // fabricator misfires (fabricator.js)
  ]);
  const items = readJSON('modules/items/items.json').filter(i => !i._section);
  const sourced = new Set(ENGINE_GRANTED_ITEMS);
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
  if (!setsFlags.has(flag) && !ENGINE_SET_FLAGS.has(flag)) {
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
    err(`${gen.OUT} content-set table is stale vs modules/events — run: node tools/gen_flags.js`);
  }
}

if (errors.length) {
  console.error(`lint_modules: ${errors.length} issue(s) found:\n`);
  errors.forEach(e => console.error('  - ' + e));
  process.exit(1);
} else {
  console.log('trail coverage — ' + trailCoverage());
  console.log(`lint_modules: clean — ${eventsById.size} events across ${eventFiles.length} files, ${allChoices.length} choices checked.`);
}

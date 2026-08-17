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
  'ai_noted_crop_mature', 'ai_noted_crop_sick', 'ai_noted_crop_died', 'ai_noted_pest',
  'stowaway_welcomed', 'stowaway_passenger', 'stowaway_refused',
  'executed_surrendered_pirate',
  'emergency_patch_armed', 'negotiation_prepared',
]);

// Minigame ids openMinigame() accepts (engine/js/minigames.js) — for
// launch_minigame validation.
const MINIGAME_IDS = new Set(['scan', 'engine', 'medical', 'forage', 'brace', 'breach', 'salvage']);
const STOWAWAY_RESOLVES = new Set(['welcome', 'welcome_replace', 'refuse']);
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

if (errors.length) {
  console.error(`lint_modules: ${errors.length} issue(s) found:\n`);
  errors.forEach(e => console.error('  - ' + e));
  process.exit(1);
} else {
  console.log('trail coverage — ' + trailCoverage());
  console.log(`lint_modules: clean — ${eventsById.size} events across ${eventFiles.length} files, ${allChoices.length} choices checked.`);
}

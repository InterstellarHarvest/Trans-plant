#!/usr/bin/env node
'use strict';
/* Regenerates registry/flags.md — the whole file:
 *   - "Content-set flags": every flag an event sets, who sets it, and who
 *     checks it (events, engine readers, flag_payoffs).
 *   - "Engine-set flags": every literal flag the engine sets
 *     (flags.add('x') / outcome.sets_flag = 'x' in index.html and
 *     engine/js/**, portable_data.js excluded), scanned from source.
 *   - "Dynamic flag families": prefix setters (flags.add('sci_' + id),
 *     `friendly_with_pirate_${sp}`), scanned from source.
 * The scan finds the rows; the prose for each engine row/family lives in
 * ENGINE_FLAG_NOTES / FAMILY_NOTES below (lint fails when a scanned
 * engine flag has no note — a new engine flag must be documented here).
 *
 * Usage: node tools/gen_flags.js          (rewrite registry/flags.md)
 *        require('./gen_flags.js').render() (lint's freshness check)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = 'registry/flags.md';
const HEADER = '# Flags Registry\n\n' +
  '> GENERATED — run `node tools/gen_flags.js` after content or engine passes (lint fails while it is stale).\n' +
  '> Engine rows and dynamic families are scanned from index.html + engine/js; their prose lives in tools/gen_flags.js\n' +
  '> (ENGINE_FLAG_NOTES / FAMILY_NOTES). tools/lint_modules.js enforces setter existence and that every engine flag is documented.\n';

// Prose for engine-set literal flags. Keys must match what scanEngine()
// finds; `set` / `check` describe the paths the scan can't name.
const ENGINE_FLAG_NOTES = {
  ai_noted_crop_planted: { set: 'checkCropMilestones — once per growth cycle (growbay.js harvest re-arms it); index.html marks it on old-save load', check: 'cruise.js (announce once)' },
  ai_noted_crop_mature: { set: 'checkCropMilestones', check: 'cruise.js (announce once); growbay.js harvest clears it' },
  ai_noted_crop_sick: { set: 'checkCropMilestones', check: 'cruise.js (announce once; cleared on recovery); growbay.js harvest clears it' },
  ai_noted_crop_died: { set: 'checkCropMilestones', check: 'cruise.js (announce once); growbay.js harvest clears it' },
  ai_noted_pest: { set: 'checkCropMilestones', check: 'cruise.js (announce once); TREAT / crop_treatment / clears_pest clear it' },
  ai_sampled_low_fuel: { set: 'first low-fuel AI sample line', check: 'cruise.js (once per run)' },
  ai_sampled_crop_sick: { set: 'first crop-sick AI sample line', check: 'cruise.js (once per run)' },
  crew_lost: { set: 'killCrew (index.html) / an unsafe jettison from the crew dossier (crew.js)', check: 'trigger crew_dead; endings.js crew_paragraphs partial; startCrew save migration' },
  all_crew_dead: { set: 'killCrew / a jettison that leaves nobody aboard', check: 'checkFailure — crew_gone (death only; a solo-by-choice run is valid)' },
  crop_death_accepted: { set: 'endContinueRun — the player presses on after crop_dead', check: 'checkFailure (no re-fire); trigger crop_dead' },
  emergency_patch_armed: { set: 'crew dossier — engineer\'s Emergency Patch active skill', check: 'applyOutcomeEffects / combat.js absorb one hull-damage event, then clear it' },
  negotiation_prepared: { set: 'crew dossier — diplomat\'s Negotiation active skill', check: 'market.js 15% off the next station market, then cleared; pirate/boarding "prepared terms" choices' },
  executed_surrendered_pirate: { set: 'executing a surrendered pirate (outcome.sets_flag)', check: '' },
  stowaway_welcomed: { set: 'stowaway resolve welcome / welcome_replace', check: '' },
  stowaway_passenger: { set: 'stowaway resolve welcome with no open crew slot (rides as a passenger)', check: '' },
  stowaway_refused: { set: 'stowaway resolve refuse', check: '' },
};
// Prose for prefix families (flags.add('<prefix>' + …)).
const FAMILY_NOTES = {
  sci_: '`sci_<event_id>` — set by enterEvent when a science_link event first fires (once-per-run guard for the cruise-log link)',
  analyzed_: '`analyzed_<item_id>` — set by the xenobiologist\'s FIELD ANALYSIS (crew dossier); read by the cargo detail and by choices that need/spend that item (sub-label shows the finding)',
  zinnia_: '`zinnia_<beat>` — set by cruise.js when a crops.json zinnia_arc beat plays (once per beat per run)',
  friendly_with_pirate_: '`friendly_with_pirate_<species>` — set by combat.js when a pirate parts on good terms; combat.js reads it on the next pirate of that species (cleared on a new run)',
};
// Content-set flags the engine reads by name: richer prose than the
// bare "engine (file)" the scan would print.
const CONTENT_ENGINE_NOTES = {
  departed: 'engine: index.html selectEvent/eventEligible — until set, a launch event takes the first ordinary stop; once set, no launch event fires again',
  chose_alpha: 'engine: index.html branchPick — the ship travels the alpha branch; both fork flags clear on entering the next fork',
  chose_beta: 'engine: index.html branchPick — the ship travels the beta branch; both fork flags clear on entering the next fork',
};

// index.html + engine/js/**/*.js, minus the generated module bundle.
function engineSources() {
  const out = [{ rel: 'index.html', src: fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8') }];
  const walk = d => {
    for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      const rel = d + '/' + e.name;
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith('.js') && e.name !== 'portable_data.js') out.push({ rel, src: fs.readFileSync(path.join(ROOT, rel), 'utf8') });
    }
  };
  walk('engine/js');
  return out;
}

// literals: flag -> Set(file) set by the engine; families: prefix ->
// Set(file); reads: flag -> Set(file) (flags.has('x')).
let _engineScan = null;
function scanEngine() {
  if (_engineScan) return _engineScan;
  const literals = new Map(), families = new Map(), reads = new Map();
  const add = (m, k, v) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(v); };
  for (const { rel, src } of engineSources()) {
    for (const m of src.matchAll(/flags\.add\(\s*(['"])([\w]+)\1\s*\)/g)) add(literals, m[2], rel);
    for (const m of src.matchAll(/\.sets_flag\s*=\s*(['"])([\w]+)\1/g)) add(literals, m[2], rel);
    for (const m of src.matchAll(/flags\.add\(\s*(['"])([\w]+)\1\s*\+/g)) add(families, m[2], rel);
    for (const m of src.matchAll(/flags\.add\(\s*`([\w]+)\$\{/g)) add(families, m[1], rel);
    for (const m of src.matchAll(/\.sets_flag\s*=\s*`([\w]+)\$\{/g)) add(families, m[1], rel);
    for (const m of src.matchAll(/flags\.has\(\s*(['"])([\w]+)\1\s*\)/g)) add(reads, m[2], rel);
  }
  _engineScan = { literals, families, reads };
  return _engineScan;
}

function scan() {
  const setBy = new Map();   // flag -> Set("event_id (file)")
  const checkedBy = new Map(); // flag -> Set(event_id)
  const add = (m, k, v) => { if (!k) return; if (!m.has(k)) m.set(k, new Set()); m.get(k).add(v); };
  const dir = path.join(ROOT, 'modules/events');
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    for (const ev of JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))) {
      if (!ev || !ev.id) continue;
      const setter = `${ev.id} (${file})`;
      add(setBy, ev.sets_flag, setter);
      add(checkedBy, ev.requires_flag, ev.id);
      const choices = [...(ev.choices || [])];
      for (const l of Object.values(ev.layers || {})) choices.push(...(l.choices || []));
      for (const v of (ev.standard_variants || [])) choices.push(...(v.choices || []));
      choices.push(...((ev.stowaway_variant || {}).stowaway_choices || []));
      for (const ch of choices) {
        const o = ch.outcome && typeof ch.outcome === 'object' ? ch.outcome : null;
        add(setBy, o ? o.sets_flag : ch.sets_flag, setter);
        add(setBy, ch.setFlag, setter); // open_market choices
        add(checkedBy, ch.requires_flag, ev.id);
        add(checkedBy, ch.showFlag, ev.id);
        add(checkedBy, ch.hideFlag, ev.id); // choice hidden once the flag is set
        add(checkedBy, ch.gate && ch.gate.flag, ev.id);
      }
      for (const o of Object.values(ev.outcomes || {})) if (o) add(setBy, o.sets_flag, setter);
    }
  }
  return { setBy, checkedBy };
}

function payoffs() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'modules/flavor/flavor_pools.json'), 'utf8')).flag_payoffs || {}; } catch (e) { return {}; }
}

// "Checked by" cell: content checkers, engine readers (+ prose), payoff.
function checksCell(flag, content, pay, extra) {
  const { reads } = scanEngine();
  const bits = [];
  if (content.has(flag)) bits.push([...content.get(flag)].sort().join(', '));
  if (CONTENT_ENGINE_NOTES[flag]) bits.push(CONTENT_ENGINE_NOTES[flag]);
  else if (extra) bits.push('engine: ' + extra);
  else if (reads.has(flag)) bits.push('engine: ' + [...reads.get(flag)].sort().join(', '));
  if (pay[flag]) bits.push('flag_payoffs (Ship\'s Record + AI callback)');
  return bits.length ? bits.join('; ') : '— (narrative record only)';
}

function contentTable() {
  const { setBy, checkedBy } = scan();
  const pay = payoffs();
  const rows = [...setBy.keys()].sort().map(flag =>
    `| \`${flag}\` | ${[...setBy.get(flag)].join(', ')} | ${checksCell(flag, checkedBy, pay)} |`);
  return '## Content-set flags\n\n| Flag | Set by | Checked by |\n|---|---|---|\n' + rows.join('\n') + '\n';
}

function engineTable() {
  const { literals } = scanEngine();
  const { checkedBy } = scan();
  const pay = payoffs();
  const rows = [...literals.keys()].sort().map(flag => {
    const note = ENGINE_FLAG_NOTES[flag] || {};
    const set = 'engine: ' + [...literals.get(flag)].sort().join(', ') + (note.set ? ' — ' + note.set : '');
    return `| \`${flag}\` | ${set} | ${checksCell(flag, checkedBy, pay, note.check)} |`;
  });
  return '## Engine-set flags (scanned from index.html + engine/js; lint_modules.js ENGINE_SET_FLAGS allowlists the ones content requires)\n\n' +
    '| Flag | Set by | Checked by |\n|---|---|---|\n' + rows.join('\n') + '\n';
}

function familySection() {
  const { families } = scanEngine();
  const lines = [...families.keys()].sort().map(p =>
    `- ${FAMILY_NOTES[p] || '`' + p + '<…>`'} (set in ${[...families.get(p)].sort().join(', ')})`);
  return '## Dynamic flag families\n\n' + lines.join('\n') + '\n';
}

function render() {
  return HEADER + '\n' + contentTable() + '\n' + engineTable() + '\n' + familySection();
}

if (require.main === module) {
  fs.writeFileSync(path.join(ROOT, OUT), render());
  console.log('gen_flags: wrote ' + OUT);
}
module.exports = { render, OUT, scanEngine, engineSources, ENGINE_FLAG_NOTES, FAMILY_NOTES };

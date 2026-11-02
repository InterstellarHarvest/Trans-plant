#!/usr/bin/env node
'use strict';
/* The pool-500 definition of done, as a check. lint_modules.js stands for the
 * whole game; this holds NEW events (ids not in tools/pool_baseline_ids.json)
 * to the rules the old ones grew up without, so nothing is left to be gone
 * back for. See resources/POOL500_BRIEF.md.
 *
 *   node tools/check_pool_events.js                     everything in modules/
 *   node tools/check_pool_events.js <draft.json> …      drafts (a writer's own pre-flight)
 *
 * A draft: { lane, events: [...], flag_payoffs: {...}, notes: { <event id>:
 * { inspired_by, how, science } } }. Exits 1 on any error.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const J = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const AIS = ['aria', 'marv', 'rex', 'chip', 'ajoy'];
const LOUD = new Set(['aria', 'chip']);
const TIERS = ['easy', 'medium', 'hard', 'ultra'];
const SPECIES = ['human', 'insect', 'rock', 'water', 'reptile', 'robot', 'unknown'];
const MILD = ['crop_thriving', 'well_funded'];
const SUB_MAX = 32, SUB_MAX_GATED = 24, AI_MAX = 260;
const MINIGAMES = ['scan', 'engine', 'medical', 'forage', 'brace', 'breach', 'salvage', 'mining'];

// Nothing copied from the inspirations: names, ships, signature phrases. The
// joke may rhyme; it may not quote. Whole words, any case.
const BANNED = ['zaphod', 'beeblebrox', 'arthur dent', 'ford prefect', 'trillian', 'slartibartfast', 'vogon', 'babel fish', 'heart of gold',
  'pan galactic', 'gargle blaster', 'magrathea', 'deep thought', 'hitchhiker', 'hitch-hiker', "don't panic", 'mostly harmless', 'so long and thanks',
  'sam lowry', 'tuttle', 'buttle', 'harry tuttle', 'jack lint', '27b', 'ministry of information',
  'spock', 'kirk', 'picard', 'klingon', 'vulcan', 'romulan', 'ferengi', 'borg', 'tribble', 'starfleet', 'tricorder', 'phaser', 'redshirt', 'red shirt',
  'beam me', 'prime directive', 'live long', 'resistance is futile', 'kobayashi', 'horta', 'dilithium', 'warp core',
  'jedi', 'sith', 'wookiee', 'wookie', 'skywalker', 'vader', 'chewbacca', 'yoda', 'millennium falcon', 'death star', 'lightsaber', 'droids you', 'tatooine', 'mos eisley', 'kessel', 'x-wing', 'han solo', 'uss enterprise',
  "logan's run", 'lastday', 'carrousel', 'sandman',
  'zardoz', 'the gun is good', 'eternals',
  'delorean', 'flux capacitor', 'mcfly', 'doc brown', 'biff', 'hoverboard', '1.21', 'gigawatts', 'great scott', 'almanac sports',
  'hal 9000', 'open the pod bay', 'monolith', 'solaris', 'the abyss', 'silent running', 'huey', 'dewey', 'louie', 'asimov', 'three laws', 'terminator', 'skynet', 'dalek', 'tardis', 'xenomorph', 'nostromo', 'ripley', 'soylent'];

const reg = J('registry/tag_registry.json');
const vals = dim => Object.keys(reg[dim].values || reg[dim]);
const ITEM_IDS = new Set(J('modules/items/items.json').filter(i => i.id).map(i => i.id.replace(/^item_/, '').replace(/_\d+$/, '')));
const MATERIALS = new Set((j => (Array.isArray(j) ? j : j.materials || []).map(m => m.id))(J('modules/materials/materials.json')));
const ROLES = new Set(vals('requires_crew'));
const baseline = new Set(J('tools/pool_baseline_ids.json'));
const standing = [...ITEM_IDS].filter(i => reg.requires_item.values[i] && reg.requires_item.values[i].source === 'event_reward'
  && ['hive_lozenge', 'slow_writ', 'salt_letter', 'basking_chit', 'extended_warranty', 'odd_receipt', 'stamped_exemption'].includes(i));

const errs = [];
const err = (id, m) => errs.push(`${id}: ${m}`);

function faceExists(n) {
  const base = n.disposition === 'station_crew' ? `sprites/npc/station_crew/${n.job}/${n.species}` : `sprites/npc/${n.disposition}/${n.species}`;
  return fs.existsSync(path.join(ROOT, base));
}
function strings(x, out = []) {
  if (typeof x === 'string') out.push(x);
  else if (Array.isArray(x)) x.forEach(v => strings(v, out));
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { if (k !== 'url' && k !== 'id' && k !== 'bg' && k !== 'scene_bg' && k !== 'design_note') strings(v, out); }
  return out;
}
function voices(id, where, set, maxLen = AI_MAX) {
  if (!set || typeof set !== 'object') return err(id, `${where}: no AI lines`);
  for (const a of AIS) {
    const l = set[a];
    if (typeof l !== 'string' || !l.trim()) { err(id, `${where}: missing ${a.toUpperCase()}`); continue; }
    if (l.length > maxLen) err(id, `${where}: ${a.toUpperCase()} line is ${l.length} chars (max ${maxLen})`);
    if (!LOUD.has(a) && l.includes('!')) err(id, `${where}: ${a.toUpperCase()} may not use "!"`);
  }
  const seen = new Set(AIS.map(a => (set[a] || '').trim()));
  if (seen.size < AIS.length) err(id, `${where}: two AIs share a line`);
}
function checkOutcome(id, where, o, ctx) {
  if (!o || typeof o !== 'object') return err(id, `${where}: no outcome`);
  if (!(o.narrative || o.body)) err(id, `${where}: no narrative`);
  if (ctx.terminal !== false) {
    if (!o.resources) err(id, `${where}: no resources (use {} if nothing moves)`);
    if (o.time_cost == null && o.time_days == null) err(id, `${where}: no time_cost`);
  }
  for (const [k, v] of Object.entries(o.materials || {})) { if (v < 0) err(id, `${where}: event outcomes never spend materials`); if (!MATERIALS.has(k)) err(id, `${where}: unknown material ${k}`); }
  for (const i of [].concat(o.item_grant || [], o.item_consume || [])) if (!ITEM_IDS.has(i)) err(id, `${where}: unknown item ${i}`);
  if (o.sets_flag) ctx.flags.add(o.sets_flag);
  const c = o.resources || {};
  if (Number.isFinite(c.gold) && c.gold < 0 && !ctx.goldGated) err(id, `${where}: spends ${-c.gold} gold with no gate.gold`);
}
function checkChoice(id, where, ch, ev, flags) {
  if (!ch.text) err(id, `${where}: no text`);
  const gated = !!(ch.gate || ch.requires_crew || ch.requires_item);
  if (ch.sub && ch.sub.length > (gated ? SUB_MAX_GATED : SUB_MAX)) err(id, `${where}: sub-label "${ch.sub}" is ${ch.sub.length} chars (max ${gated ? SUB_MAX_GATED : SUB_MAX}: one line)`);
  const role = ch.requires_crew || (ch.gate && ch.gate.crew);
  if (role && role !== 'any' && !ROLES.has(role)) err(id, `${where}: unknown crew role ${role}`);
  if (role && !ch.effort) err(id, `${where}: a crew job needs effort pips`);
  if (ch.effort && !(Number.isInteger(ch.effort) && ch.effort >= 1 && ch.effort <= 5)) err(id, `${where}: effort must be 1–5`);
  const item = ch.requires_item || (ch.gate && ch.gate.item);
  if (item && !ITEM_IDS.has(item)) err(id, `${where}: unknown item ${item}`);
  if (ch.requires_item && ch.gate && ch.gate.item) err(id, `${where}: use one of requires_item / gate.item`);
  if (ch.unless_item && !ITEM_IDS.has(ch.unless_item)) err(id, `${where}: unless_item ${ch.unless_item} is not an item`);
  if (ch.launch_minigame) {
    if (!MINIGAMES.includes(ch.launch_minigame)) err(id, `${where}: unknown minigame ${ch.launch_minigame}`);
    if (ch.launch_minigame === 'forage') err(id, `${where}: an event never launches forage (its food haul would not apply)`);
    const o = ch.minigame_opts || {};
    voices(id, `${where} briefing`, o.briefing, 320);
    for (const t of ['perfect', 'good', 'poor']) {
      const q = o.quips && o.quips[t];
      if (!q) err(id, `${where}: no ${t} quips (minigame_opts.quips.${t}: one line per AI)`); else voices(id, `${where} ${t} quip`, q, 200);
      const to = ch.tier_outcomes && ch.tier_outcomes[t];
      if (!to || !to.narrative) err(id, `${where}: tier_outcomes.${t} needs a narrative`);
    }
  }
  const combat = ch.triggerCombat;
  if (combat && !ev.npc) err(id, `${where}: a fight needs an npc`);
  if (!ch.outcome && !ch.next && !ch.back && !combat && !ch.open_market) err(id, `${where}: the choice goes nowhere`);
  const gg = !!(ch.gate && ch.gate.gold) || !!ch.gold_cost;
  if (ch.outcome && typeof ch.outcome === 'object') checkOutcome(id, where, ch.outcome, { flags, goldGated: gg });
  if (ch.outcome && typeof ch.outcome === 'string') {
    const o = (ev.outcomes || {})[ch.outcome];
    if (!o) err(id, `${where}: no outcome "${ch.outcome}"`);
    else if (o.resources && o.resources.gold < 0 && !gg) err(id, `${where}: spends gold with no gate.gold`);
  }
}
function checkEvent(ev, flags) {
  const id = ev.id;
  if (!/^event_(species_(insect|rock|water|reptile|robot|unknown|human|fortune)|voyage_(crew|time|office|ruins|ship|fork|quest|identity|landmark|pair|format|oddity|thin|trigger|edge|station|trail))_\d{3}$/.test(id)) err(id, 'id must be event_species_<lane>_NNN or event_voyage_<lane>_NNN');
  for (const k of ['active', 'title', 'difficulty', 'tone', 'node_type', 'trigger', 'scene_type']) if (ev[k] == null) err(id, `missing ${k}`);
  if (typeof ev.once !== 'boolean') err(id, 'once must be true or false');
  if (!TIERS.includes(ev.difficulty)) err(id, `difficulty ${ev.difficulty}`);
  for (const t of ev.tone || []) if (!vals('tone').includes(t)) err(id, `unregistered tone ${t}`);
  for (const t of ev.trigger || []) if (!vals('trigger').includes(t)) err(id, `unregistered trigger ${t}`);
  for (const n of ev.node_type || []) if (!vals('node_type').includes(n)) err(id, `unregistered node_type ${n}`);
  if (!vals('scene_type').includes(ev.scene_type)) err(id, `unregistered scene_type ${ev.scene_type}`);
  if (ev.comm_mode && !vals('comm_mode').includes(ev.comm_mode)) err(id, `unregistered comm_mode ${ev.comm_mode}`);
  if (ev.difficulty === 'ultra' && !(ev.trail && ev.trail.length === 1 && ev.trail[0] === 'interstellar')) err(id, 'ultra is Interstellar only: trail ["interstellar"]');
  if ((ev.trigger || []).some(t => MILD.includes(t)) && !ev.once) err(id, 'a good-fortune trigger stays once: true');
  const isFork = (ev.node_type || []).includes('fork');
  if (isFork && (ev.node_type.length > 1 || ev.layers)) err(id, 'a fork event is flat and fork-only');
  if ((ev.node_type || []).includes('station') && ['hard', 'ultra'].includes(ev.difficulty) && (ev.layers || ev.npc)) err(id, 'hard/ultra station events play as the docking: flat, no in-person npc');

  const lane = (/^event_species_([a-z]+)_/.exec(id) || [])[1];
  if (lane && lane !== 'fortune' && ev.species_lane !== lane) err(id, `species_lane must be "${lane}" (it places the event by species, ruling 119)`);
  if (ev.species_home && !(lane && (ev.node_type || []).join() === 'station')) err(id, 'species_home is for a species lane event at a station');
  // The NPC: the species has to be real and have a face.
  const npcs = [ev.npc, ...Object.values(ev.layers || {}).map(l => l.npc)].filter(Boolean);
  for (const n of npcs) {
    if (!vals('npc_disposition').includes(n.disposition)) err(id, `unregistered disposition ${n.disposition}`);
    if (id.startsWith('event_voyage_') && n.species == null) continue; // rolled: it has to read true for anyone
    if (!SPECIES.includes(n.species)) err(id, `npc.species must be pinned (got ${n.species})`);
    else if (!faceExists(n)) err(id, `no face for ${n.disposition}/${n.job || ''}/${n.species}`);
  }

  // Text.
  const stops = [];
  const blob = strings(ev).join('\n');
  const low = blob.toLowerCase();
  for (const b of BANNED) {
    const re = new RegExp('(^|[^a-z])' + b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z])');
    if (re.test(low)) err(id, `names something from an inspiration: "${b}"`);
  }
  for (const t of blob.match(/\{[^}]*\}/g) || []) {
    if (!/^\{(npc\.(quirk|species|disposition|name|line\.[a-z]+)|crew\.[a-z_]+|cost\.(water|food|o2)(\.num)?|branch\.(alpha|beta)\.(label|first)|crop\.(name|advice|diagnosis|verdict)|speaker\.(name|role)|patient\.(name|role)|stowaway\.[a-z_]+|wreck\.(ship|captain|crop|fate|days))\}$/.test(t)) err(id, `unknown token ${t}`);
  }

  if (ev.layers) {
    if (!ev.entryLayer || !ev.layers[ev.entryLayer]) err(id, 'layered: no entryLayer');
    if (!ev.leave_label && !(ev.leave_disabled)) err(id, 'layered: needs leave_label');
    const returned = new Set();
    for (const [k, l] of Object.entries(ev.layers)) {
      if (!l.body) err(id, `layer ${k}: no body`);
      voices(id, `layer ${k}`, l.ai);
      if (l.line && !npcs.length && !ev.crew_speaker) err(id, `layer ${k}: a line with no npc`);
      if (!(l.choices || []).length) err(id, `layer ${k}: no choices`);
      if (npcs.length && l.line && (l.choices || []).some(c => /^hail/i.test(c.text || ''))) err(id, `layer ${k}: HAIL with a character already speaking`);
      (l.choices || []).forEach((c, i) => {
        if (c.launch_minigame) err(id, `layer ${k} choice ${i}: minigames only run on flat events (a layered launch_minigame does nothing)`);
        checkChoice(id, `layer ${k} choice ${i}`, c, ev, flags);
        if (c.next && !ev.layers[c.next]) err(id, `layer ${k}: next → missing layer ${c.next}`);
        if (c.next && (ev.layers[c.next].choices || []).some(x => x.back)) returned.add(k);
      });
    }
    for (const k of returned) if (!(ev.layers[k].revisit && ev.layers[k].revisit.body)) err(id, `layer ${k} is returned to: it needs revisit.body (and revisit.line if it speaks)`);
    // A combat_intro is a line shown as the fight starts, with no effects of its own.
    const intros = new Set(Object.values(ev.layers).flatMap(l => (l.choices || []).map(c => c.combat_intro)).filter(Boolean));
    for (const [k, o] of Object.entries(ev.outcomes || {})) {
      checkOutcome(id, `outcome ${k}`, o, { flags, goldGated: true, terminal: !intros.has(k) });
      if (!o.title) err(id, `outcome ${k}: no title`);
    }
  } else {
    if (!ev.body || ev.body.length < 80) err(id, 'no real body');
    voices(id, 'ai_flavor', ev.ai_flavor);
    if (!(ev.choices || []).length) err(id, 'no choices');
    (ev.choices || []).forEach((c, i) => checkChoice(id, `choice ${i}`, c, ev, flags));
    if ((ev.choices || []).length < 2) err(id, 'fewer than two choices');
  }
  if (ev.once === false && !(Array.isArray(ev.alt_bodies) && ev.alt_bodies.length >= 2)) err(id, 'a repeatable event needs two alt_bodies');
  if (ev.science_link) {
    const s = ev.science_link;
    if (!s.text || !s.label || !/^https:\/\/en\.wikipedia\.org\/wiki\/\S+$/.test(s.url || '')) err(id, 'science_link needs text, label and a https://en.wikipedia.org/wiki/ url');
    if (/horror/.test((ev.tone || []).join())) err(id, 'no science links on horror-register events');
  }
  if (isFork) {
    const set = new Set();
    for (const c of ev.choices || []) {
      const o = c.outcome || {};
      if (!['chose_alpha', 'chose_beta'].includes(o.sets_flag)) err(id, `fork choice "${c.text}" must set chose_alpha or chose_beta`);
      set.add(o.sets_flag);
    }
    if (set.size < 2) err(id, 'a fork offers both lanes');
  }
  return stops;
}

function load() {
  const args = process.argv.slice(2);
  if (args.length) {
    const events = [], payoffs = {}, notes = {};
    for (const f of args) {
      const d = JSON.parse(fs.readFileSync(f, 'utf8'));
      events.push(...d.events); Object.assign(payoffs, d.flag_payoffs || {}); Object.assign(notes, d.notes || {});
    }
    return { events, payoffs, notes, draft: true };
  }
  const events = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'modules/events'))) {
    const d = J('modules/events/' + f);
    for (const e of Array.isArray(d) ? d : d.events) if (e && e.id && !baseline.has(e.id)) events.push(e);
  }
  const notesP = path.join(ROOT, 'resources/pool500/notes.json');
  return { events, payoffs: J('modules/flavor/flavor_pools.json').flag_payoffs, notes: fs.existsSync(notesP) ? JSON.parse(fs.readFileSync(notesP)) : {}, draft: false };
}

const { events, payoffs, notes, draft } = load();
const seen = new Set();
const set = new Set(), read = new Set();
for (const ev of events) {
  if (seen.has(ev.id)) err(ev.id, 'duplicate id');
  seen.add(ev.id);
  checkEvent(ev, set);
  if (ev.requires_flag) read.add(ev.requires_flag);
  for (const f of JSON.stringify(ev).matchAll(/"(?:requires_flag|hideFlag|showFlag|flag)":"([a-z0-9_]+)"/g)) read.add(f[1]);
  const n = notes[ev.id];
  if (!n || !n.inspired_by || !n.how) err(ev.id, 'notes need inspired_by and how (the batch report reads them)');
  if (ev.science_link && !(n && n.science)) err(ev.id, 'notes need science: the claim, as checked');
}
for (const f of set) {
  if (['chose_alpha', 'chose_beta'].includes(f)) continue;
  const p = payoffs[f];
  if (!p && !read.has(f)) { err('flags', `${f}: no reader and no flag_payoffs entry`); continue; }
  if (p) {
    if (![1, 2, 3].includes(p.weight)) err('flags', `${f}: weight 1–3`);
    if (!p.epilogue) err('flags', `${f}: no epilogue`);
    voices(`flags ${f}`, 'callback', p.callback);
  }
}
// Nearby openings: two events that start the same way read as one writer.
const open = {};
for (const ev of events) {
  const b = ev.body || (ev.layers && ev.entryLayer && ev.layers[ev.entryLayer] && ev.layers[ev.entryLayer].body) || '';
  const k = b.toLowerCase().split(/\s+/).slice(0, 3).join(' ');
  if (open[k]) err(ev.id, `opens like ${open[k]} ("${k}")`); else open[k] = ev.id;
}
if (!draft) {
  // Nothing orphaned: a standing item is granted somewhere and used twice over.
  for (const it of standing) {
    const s = JSON.stringify(events);
    const grants = (s.match(new RegExp(`"item_grant":(\\[[^\\]]*)?"${it}"`, 'g')) || []).length;
    const uses = (s.match(new RegExp(`"(?:requires_item|item)":"${it}"`, 'g')) || []).length;
    if (!grants) err(it, 'nothing grants it');
    if (uses < 2) err(it, `only ${uses} use(s): a standing item unlocks at least two choices`);
  }
}
const tiers = {}; for (const e of events) tiers[e.difficulty] = (tiers[e.difficulty] || 0) + 1;
if (errs.length) { for (const e of errs) console.log('✗ ' + e); console.log(`check_pool_events: ${errs.length} error(s) in ${events.length} events`); process.exit(1); }
console.log(`check_pool_events: clean — ${events.length} new events ${JSON.stringify(tiers)}`);

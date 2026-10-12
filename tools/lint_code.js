#!/usr/bin/env node
'use strict';
/* Code lint (the engine and the test batteries; lint_modules.js covers the
 * data). Each rule is a habit that once let two copies of something drift:
 *   - every battery uses the shared URL default, so run_all.sh (and either
 *     browser's server) reaches it: an agent port left behind (8184, 8225)
 *     ran a battery against a dead server or another tree.
 *   - the game's thresholds live once, in index.html's THRESHOLDS script:
 *     a bare resource / morale / HP / fab-wear line, a crew cap of 2, a
 *     crops.json fallback or a second copy of the wounded multiplier or
 *     the crew water tiers is an error (four copies of the low-resource
 *     lines once disagreed). A line that means a different number says so
 *     with `// lint-ok: threshold`.
 *   - the registry's low_* / fab_low thresholds equal RES_LOW, MORALE_LOW
 *     and FAB_LOW_WEAR; fabricator.js's misfire numbers equal recipes.json
 *     _meta (prose on both sides, so nothing else ties them).
 * Run from anywhere: node tools/lint_code.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const TESTS = path.join(ROOT, 'tools', 'tests');
const errors = [];
const err = m => errors.push(m);

// ── Batteries: one URL default ──────────────────────────────────────
const URL_DEFAULT = "const URL = process.env.URL || 'http://localhost:8177/index.html';";
for (const f of fs.readdirSync(TESTS).filter(f => /^test_.*\.js$/.test(f)).sort()) {
  const src = fs.readFileSync(path.join(TESTS, f), 'utf8');
  if (!src.includes(URL_DEFAULT)) err(`tools/tests/${f}: missing the shared URL default (${URL_DEFAULT})`);
  // Any other localhost address is a hard-coded server the env can't redirect.
  src.split('\n').forEach((line, i) => {
    if (line.includes(URL_DEFAULT)) return;
    const m = line.match(/['"`]https?:\/\/localhost:\d+[^'"`]*['"`]/);
    if (m) err(`tools/tests/${f}:${i + 1}: hard-coded server ${m[0]} — derive it from URL`);
  });
}

// ── Engine source: one copy of each threshold ───────────────────────
// Code only: comments and string/template contents become spaces (line
// numbers kept), so prose like "morale < 30" in a comment never trips.
function codeOnly(src) {
  let out = '', i = 0, st = 'code', prev = '';
  const esc = () => { out += ' ' + (src[i + 1] === '\n' ? '\n' : ' '); i += 2; }; // an escape keeps its newline
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (st === 'code') {
      if (c === '/' && n === '/') { st = 'line'; out += '  '; i += 2; continue; }
      if (c === '/' && n === '*') { st = 'block'; out += '  '; i += 2; continue; }
      if (c === "'" || c === '"' || c === '`') { st = c; out += c; i++; continue; }
      // A regex literal: a slash where an operand starts.
      if (c === '/' && /[(,=:[!&|?{};+\-*%<>~^]|^$/.test(prev)) { st = 're'; out += c; i++; continue; }
      out += c; if (!/\s/.test(c)) prev = c; i++; continue;
    }
    if (st === 'line') { if (c === '\n') { st = 'code'; out += c; } else out += ' '; i++; continue; }
    if (st === 'block') { if (c === '*' && n === '/') { st = 'code'; out += '  '; i += 2; continue; } out += c === '\n' ? c : ' '; i++; continue; }
    if (st === 're') {
      if (c === '\\') { esc(); continue; }
      if (c === '[') { st = 'reclass'; out += ' '; i++; continue; }
      if (c === '/' || c === '\n') { st = 'code'; prev = 'x'; out += c; i++; continue; }
      out += ' '; i++; continue;
    }
    if (st === 'reclass') { if (c === '\\') { esc(); continue; } if (c === ']') st = 're'; out += c === '\n' ? c : ' '; i++; continue; }
    // A string or template literal (a template's ${…} is skipped with it).
    if (c === '\\') { esc(); continue; }
    if (c === st) { st = 'code'; prev = 'x'; out += c; i++; continue; }
    if (c === '\n' && st !== '`') st = 'code';
    out += c === '\n' ? c : ' '; i++;
  }
  return out;
}
// index.html's inline scripts; markup, CSS and src= tags blanked (line
// numbers kept).
const blank = t => t.replace(/[^\n]/g, ' ');
function inlineScripts(html) {
  let out = '', at = 0;
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    out += blank(html.slice(at, m.index));
    out += /\bsrc=/.test(m[1]) ? blank(m[0]) : blank('<script' + m[1] + '>') + m[2] + blank('</script>');
    at = m.index + m[0].length;
  }
  return out + blank(html.slice(at));
}
const ENGINE = [{ rel: 'index.html', raw: fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8') }];
(function walk(dir) {
  for (const f of fs.readdirSync(path.join(ROOT, dir)).sort()) {
    const rel = dir + '/' + f;
    if (fs.statSync(path.join(ROOT, rel)).isDirectory()) walk(rel);
    else if (f.endsWith('.js') && f !== 'portable_data.js') ENGINE.push({ rel, raw: fs.readFileSync(path.join(ROOT, rel), 'utf8') });
  }
})('engine/js');
for (const e of ENGINE) {
  e.code = codeOnly(e.rel === 'index.html' ? inlineScripts(e.raw) : e.raw).split('\n');
  e.lines = e.raw.split('\n');
}

const THRESHOLD_RULES = [
  // A resource against a bare number (0 = empty is fine).
  { re: /\b(?:r|res|resources)\.(?:fuel|food|water|o2|hull)\s*(?:<=?|>=?)\s*(\d+(?:\.\d+)?)/g, ok: v => v === 0, say: 'a resource line — use RES_LOW / RES_CRITICAL / resMax' },
  // Morale against a bare number (0 = mutiny / walk-off, 100 = full).
  { re: /\b(?:mo|morale)\s*(?:<=?|>=?)\s*(\d+(?:\.\d+)?)/g, ok: v => v === 0 || v === 100, say: 'a morale line — use MORALE_LOW / MORALE_CRISIS (or name it where it lives)' },
  // HP against a bare number (0 = dead, 100 = unhurt).
  { re: /\b(?:hp|captainHP|(?:hpOf|crewHPOf|captainHPOf)\([^()]*\))\s*(?:<=?|>=?)\s*(\d+(?:\.\d+)?)/g, ok: v => v === 0 || v === 100, say: 'an HP line — use CREW_WOUNDED_HP / CREW_CRITICAL_HP (or name it)' },
  // Fab wear against a bare number, or a bare 100 ceiling around it.
  { re: /\bwear\w*\b(?:\s*\|\|\s*0\s*\))?\s*(?:<=?|>=?)\s*(\d+(?:\.\d+)?)/g, ok: v => v === 0, say: 'a fab wear line — use FAB_WEAR_MAX / FAB_LOW_WEAR / FAB_SERVICE_WEAR' },
  { re: /Math\.min\(\s*100\s*,[^;]*\bwear|\b100\s*-\s*\(?\s*[\w.]*wear/gi, say: 'a fab wear ceiling — use FAB_WEAR_MAX' },
  // The crew cap.
  { re: /\bcrew\.length\s*(?:<=?|>=?|[!=]==?)\s*2\b|\bcrew\.slice\(\s*0\s*,\s*2\s*\)/g, say: 'the crew cap — use CREW_MAX' },
  // A second copy of the wounded multiplier.
  { re: /CREW_WOUNDED_HP\s*\)?\s*\?\s*[\d.]+\s*:/g, say: 'the wounded multiplier — use woundedMult(who)' },
  // A crops.json fallback written out.
  { re: /\b(?:healthy_threshold|sick_threshold|water_need|maturity_days)\s*\)*\s*\|\|\s*\d+/g, say: 'a crops.json fallback — use CROP_*_DEFAULT' },
];
const LINT_OK = /\/\/\s*lint-ok:\s*threshold\b/;
for (const e of ENGINE) {
  e.code.forEach((line, i) => {
    if (LINT_OK.test(e.lines[i] || '')) return;
    for (const rule of THRESHOLD_RULES) {
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(line))) {
        if (rule.ok && rule.ok(Number(m[1]))) continue;
        err(`${e.rel}:${i + 1}: ${rule.say}: ${m[0].trim()}`);
      }
    }
  });
}
// The crew's water tiers: index.html crewWaterDrainRate only.
for (const e of ENGINE) e.code.forEach((line, i) => {
  if (/ratio\s*>=\s*0\.7\b/.test(line) && !(e.rel === 'index.html' && /^\s*if \(ratio >= 0\.7\) return 1;/.test(line)))
    err(`${e.rel}:${i + 1}: a copy of the crew water tiers — call crewWaterDrainRate(plantPct)`);
});

// ── The named thresholds agree with the registry and recipes.json ───
const html = ENGINE[0].raw;
const block = (html.match(/<script>\s*'use strict';\s*\/\*[─\s]*THRESHOLDS\b[\s\S]*?<\/script>/) || [''])[0].replace(/^<script>|<\/script>$/g, '');
let T = null;
try { T = vm.runInNewContext(block + ';({ RES_LOW, MORALE_LOW, FAB_WEAR_MAX, FAB_LOW_WEAR })'); }
catch (e) { err(`index.html: can't read the THRESHOLDS script (${e.message})`); }
if (T) {
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'registry', 'tag_registry.json'), 'utf8'));
  const trig = (reg.trigger && reg.trigger.values) || {};
  const below = v => { const m = String((v && v.threshold) || '').match(/below\s+(\d+(?:\.\d+)?)%/); return m ? Number(m[1]) : null; };
  const want = Object.assign({}, T.RES_LOW, { morale: T.MORALE_LOW });
  for (const [k, at] of Object.entries(want)) {
    const r = below(trig['low_' + k]);
    if (r !== at) err(`registry trigger low_${k}: threshold ${r == null ? 'missing' : '"below ' + r + '%"'} but the engine fires below ${at} (${k === 'morale' ? 'MORALE_LOW' : 'RES_LOW.' + k})`);
  }
  for (const k of Object.keys(trig)) if (/^low_/.test(k) && !(k.slice(4) in want)) err(`registry trigger ${k}: no engine threshold (RES_LOW / MORALE_LOW)`);
  const fh = below(trig.fab_low);
  if (fh == null || T.FAB_WEAR_MAX - fh !== T.FAB_LOW_WEAR) err(`registry trigger fab_low: "fab health below ${fh}%" but the engine fires above ${T.FAB_LOW_WEAR}% wear (FAB_LOW_WEAR)`);
}
{
  const fab = fs.readFileSync(path.join(ROOT, 'engine', 'js', 'screens', 'fabricator.js'), 'utf8');
  const meta = (JSON.parse(fs.readFileSync(path.join(ROOT, 'modules', 'recipes', 'recipes.json'), 'utf8'))._meta) || {};
  const num = name => { const m = fab.match(new RegExp('const ' + name + ' = ([\\d.]+);')); return m ? Number(m[1]) : null; };
  const curveSrc = (fab.match(/const MISFIRE_CURVE = (\[[^;]*\]);/) || [])[1];
  const curve = curveSrc ? JSON.parse(curveSrc) : null;
  const metaCurve = [...String(meta.misfire_curve || '').matchAll(/(\d+)hp=(\d+(?:\.\d+)?)%/g)].map(m => [Number(m[1]), Number(m[2]) / 100]);
  if (!curve || JSON.stringify(curve) !== JSON.stringify(metaCurve)) err(`fabricator.js MISFIRE_CURVE ${curveSrc} ≠ recipes.json _meta.misfire_curve ${JSON.stringify(metaCurve)}`);
  const outs = String(meta.misfire_outcomes || '');
  const surplus = (outs.match(/~(\d+)% produces fab_surplus/) || [])[1];
  if (surplus == null || Number(surplus) / 100 !== num('MISFIRE_SURPLUS_CHANCE')) err(`fabricator.js MISFIRE_SURPLUS_CHANCE ${num('MISFIRE_SURPLUS_CHANCE')} ≠ recipes.json _meta.misfire_outcomes "~${surplus}% produces fab_surplus"`);
  const brk = (outs.match(/Below (\d+)% health/) || [])[1];
  if (brk == null || Number(brk) !== num('MISFIRE_BREAK_HEALTH')) err(`fabricator.js MISFIRE_BREAK_HEALTH ${num('MISFIRE_BREAK_HEALTH')} ≠ recipes.json _meta.misfire_outcomes "Below ${brk}% health"`);
}

if (errors.length) {
  console.error(`lint_code: ${errors.length} issue(s) found:\n`);
  errors.forEach(e => console.error('  - ' + e));
  process.exit(1);
}
console.log('lint_code: clean.');

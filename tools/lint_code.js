#!/usr/bin/env node
'use strict';
/* Code lint (the engine and the test batteries; lint_modules.js covers the
 * data). Each rule is a habit that once let two copies of something drift:
 *   - every battery uses the shared URL default, so run_all.sh (and either
 *     browser's server) reaches it: an agent port left behind (8184, 8225)
 *     ran a battery against a dead server or another tree.
 *   - index.html never re-exports a top-level function declaration
 *     (window.X = X or Object.assign(window, {X})): a classic script's
 *     declarations are already window properties, and the copies piled up.
 *   - the crew role <-> crew id map and the AI display names live once, in
 *     index.html's shared helpers: six copies of the role map and three of
 *     the AI names had grown across the engine.
 *   - (warning) an engine window export nothing outside its file reads is
 *     dead weight on the one shared global scope.
 * Run from anywhere: node tools/lint_code.js
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const TESTS = path.join(ROOT, 'tools', 'tests');
const errors = [], warnings = [];
const err = m => errors.push(m);
const warn = m => warnings.push(m);
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const walk = d => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? walk(d + '/' + e.name) : [d + '/' + e.name]);
const ENGINE = walk('engine/js').filter(f => f.endsWith('.js') && !f.endsWith('portable_data.js'));
const lineOf = (src, i) => src.slice(0, i).split('\n').length;
// index.html's inline classic scripts (no src), with their offsets.
const INDEX = read('index.html');
const inlineScripts = [...INDEX.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => ({ code: m[1], at: m.index + m[0].indexOf(m[1]) }));
// Keys of every Object.assign(window, { ... }) in src (shorthand or key: value).
function assignKeys(src) {
  const out = [];
  for (const m of src.matchAll(/Object\.assign\(\s*window\s*,\s*\{([\s\S]*?)\}\s*\)/g)) {
    for (const part of m[1].replace(/\/\/.*$/gm, '').split(',')) {
      const k = part.trim().split(':')[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(k)) out.push({ name: k, line: lineOf(src, m.index) });
    }
  }
  return out;
}

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

// ── index.html: no re-exports of top-level function declarations ──
{
  const fns = new Set();
  for (const { code } of inlineScripts) for (const m of code.matchAll(/^(?:async )?function ([A-Za-z_$][\w$]*)/gm)) fns.add(m[1]);
  for (const m of INDEX.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=(?!=)\s*([A-Za-z_$][\w$]*)?/g)) {
    if (fns.has(m[1])) err(`index.html:${lineOf(INDEX, m.index)}: window.${m[1]} = … re-exports a top-level function declaration (already a window property) — delete it`);
  }
  for (const k of assignKeys(INDEX)) if (fns.has(k.name)) err(`index.html:${k.line}: Object.assign(window, {${k.name}}) re-exports a top-level function declaration (already a window property) — delete it`);
}

// ── One copy of the shared maps (index.html SHARED HELPERS) ─────────
{
  const SHARED_MAPS = [
    { what: 'the crew role -> crew id map', re: /\bbotanist['"]?\s*:\s*['"]osei['"]|\bosei['"]?\s*:\s*['"]botanist['"]/, home: /^const CREWID_OF_ROLE = /, use: 'CREWID_OF_ROLE / ROLE_OF_CREWID' },
    { what: 'the AI display names', re: /\baria['"]?\s*:\s*['"]ARIA['"]|['"]ARIA['"]\s*,\s*['"]MARV['"]/, home: /^const AI_NAMES = /, use: 'AI_NAMES' },
  ];
  for (const rel of ['index.html', ...ENGINE]) {
    read(rel).split('\n').forEach((line, i) => {
      for (const m of SHARED_MAPS) {
        if (m.re.test(line) && !(rel === 'index.html' && m.home.test(line))) err(`${rel}:${i + 1}: a second copy of ${m.what} — read ${m.use} (index.html shared helpers)`);
      }
    });
  }
}

// ── Engine window exports something outside the file reads ──────────
{
  const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
  const readers = ['index.html', ...ENGINE, ...walk('tools').filter(f => f.endsWith('.js'))];
  const text = Object.fromEntries(readers.map(f => [f, stripComments(read(f))]));
  for (const rel of ENGINE) {
    const src = read(rel);
    const names = [...src.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)].map(m => ({ name: m[1], line: lineOf(src, m.index) })).concat(assignKeys(src));
    for (const { name, line } of names) {
      const re = new RegExp('\\b' + name.replace(/\$/g, '\\$') + '\\b');
      if (!readers.some(f => f !== rel && re.test(text[f]))) warn(`${rel}:${line}: window.${name} is exported but nothing outside the file reads it (engine, index.html, tools/**) — make it local`);
    }
  }
}

if (warnings.length) {
  console.warn(`lint_code: ${warnings.length} warning(s):\n`);
  warnings.forEach(w => console.warn('  - ' + w));
  console.warn('');
}
if (errors.length) {
  console.error(`lint_code: ${errors.length} issue(s) found:\n`);
  errors.forEach(e => console.error('  - ' + e));
  process.exit(1);
}
console.log('lint_code: clean.');

#!/usr/bin/env node
'use strict';
/* Code lint (the engine and the test batteries; lint_modules.js covers the
 * data). Each rule is a habit that once let two copies of something drift:
 *   - every battery uses the shared URL default, so run_all.sh (and either
 *     browser's server) reaches it: an agent port left behind (8184, 8225)
 *     ran a battery against a dead server or another tree.
 * Run from anywhere: node tools/lint_code.js
 */
const fs = require('fs');
const path = require('path');
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

if (errors.length) {
  console.error(`lint_code: ${errors.length} issue(s) found:\n`);
  errors.forEach(e => console.error('  - ' + e));
  process.exit(1);
}
console.log('lint_code: clean.');

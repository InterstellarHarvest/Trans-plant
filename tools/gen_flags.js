#!/usr/bin/env node
'use strict';
/* Regenerates the "Content-set flags" table in registry/flags.md from
 * modules/events/*.json — every flag an event sets, who sets it, and
 * which events check it. The engine-set table and the dynamic-family
 * notes below it are hand-maintained and kept verbatim.
 *
 * Usage: node tools/gen_flags.js          (rewrite registry/flags.md)
 *        require('./gen_flags.js').render() (lint's freshness check)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = 'registry/flags.md';
const HEADER = '# Flags Registry\n\n' +
  '> The content-set table is GENERATED — run `node tools/gen_flags.js` after content passes (lint fails while it is stale).\n' +
  '> The engine-set table and dynamic families are hand-maintained. tools/lint_modules.js enforces setter existence (JSON or engine table).\n';

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
        add(checkedBy, ch.hideFlag, ev.id); // choice hidden once the flag is set
      }
      for (const o of Object.values(ev.outcomes || {})) if (o) add(setBy, o.sets_flag, setter);
    }
  }
  return { setBy, checkedBy };
}

function contentTable() {
  const { setBy, checkedBy } = scan();
  const rows = [...setBy.keys()].sort().map(flag => {
    const checks = checkedBy.has(flag) ? [...checkedBy.get(flag)].sort().join(', ') : '— (narrative record only)';
    return `| \`${flag}\` | ${[...setBy.get(flag)].join(', ')} | ${checks} |`;
  });
  return '## Content-set flags\n\n| Flag | Set by | Checked by |\n|---|---|---|\n' + rows.join('\n') + '\n';
}

function render() {
  const cur = fs.readFileSync(path.join(ROOT, OUT), 'utf8');
  const engineAt = cur.indexOf('## Engine-set flags');
  if (engineAt < 0) throw new Error(OUT + ': missing the "## Engine-set flags" section');
  return HEADER + '\n' + contentTable() + '\n' + cur.slice(engineAt);
}

if (require.main === module) {
  fs.writeFileSync(path.join(ROOT, OUT), render());
  console.log('gen_flags: wrote ' + OUT);
}
module.exports = { render, OUT };

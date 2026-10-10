#!/usr/bin/env node
'use strict';
/* Flips registry/tag_registry.json values from "empty" to "populated"
 * wherever module content actually uses them (CLAUDE.md: "After writing a
 * module, update every tag value you used from empty to populated" — a
 * step that drifted for months). Never flips back, never touches
 * "deprecated", never deletes.
 *
 * Usage: node tools/sync_registry.js          (rewrite the registry)
 *        require('./sync_registry.js').stale() (lint: values still "empty")
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REG = 'registry/tag_registry.json';

// Module keys whose values belong to a differently-named dimension.
// time_cost carries effort_cost values (CLAUDE.md "Resources Reference");
// gate.crew / gate.item are the layered schema's requires_crew / _item.
const ALIAS = { time_cost: 'effort_cost', 'gate.crew': 'requires_crew', 'gate.item': 'requires_item' };

function moduleFiles() {
  const out = [];
  const walk = d => { for (const e of fs.readdirSync(d)) { const f = path.join(d, e); if (fs.statSync(f).isDirectory()) walk(f); else if (f.endsWith('.json')) out.push(f); } };
  walk(path.join(ROOT, 'modules'));
  return out;
}

function usedValues(registry) {
  const used = {}; // dim -> Set(values)
  const note = (dim, v) => {
    if (!registry[dim] || !registry[dim].values || typeof v !== 'string' || !(v in registry[dim].values)) return;
    (used[dim] = used[dim] || new Set()).add(v);
  };
  const walk = (o, parentKey) => {
    if (Array.isArray(o)) { o.forEach(x => walk(x, parentKey)); return; }
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      const dim = ALIAS[parentKey ? parentKey + '.' + k : k] || ALIAS[k] || k;
      if (typeof v === 'string') note(dim, v);
      else if (Array.isArray(v) && v.every(x => typeof x === 'string')) v.forEach(x => note(dim, x));
      walk(v, k);
    }
  };
  for (const f of moduleFiles()) walk(JSON.parse(fs.readFileSync(f, 'utf8')), null);
  return used;
}

// [dim, value] pairs used by content but still marked "empty".
function stale() {
  const registry = JSON.parse(fs.readFileSync(path.join(ROOT, REG), 'utf8'));
  const used = usedValues(registry);
  const out = [];
  for (const [dim, vals] of Object.entries(used)) {
    for (const v of vals) if (registry[dim].values[v].status === 'empty') out.push([dim, v]);
  }
  return out;
}

if (require.main === module) {
  const registry = JSON.parse(fs.readFileSync(path.join(ROOT, REG), 'utf8'));
  const flips = stale();
  for (const [dim, v] of flips) registry[dim].values[v].status = 'populated';
  fs.writeFileSync(path.join(ROOT, REG), JSON.stringify(registry, null, 2));
  console.log(`sync_registry: ${flips.length} value(s) empty → populated` + (flips.length ? ':\n  ' + flips.map(([d, v]) => d + '.' + v).join('\n  ') : ''));
}
module.exports = { stale };

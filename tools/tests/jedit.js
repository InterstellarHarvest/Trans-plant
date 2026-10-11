// Round-trip-safe JSON editing for Trans-plant modules (files are
// JSON.stringify(x, null, 2) with no trailing newline).
const fs = require('fs');
const path = require('path');
const ROOT = '/Users/MrDashiki/Experiments & Projects/Trans-plant';
const load = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const save = (rel, data) => fs.writeFileSync(path.join(ROOT, rel), JSON.stringify(data, null, 2));
const ev = (arr, id) => { const e = arr.find(x => x.id === id); if (!e) throw new Error('no event ' + id); return e; };

// Flat-schema choice builder with the canonical null fields.
function choice(text, o, extra = {}) {
  return Object.assign({
    text,
    requires_crew: null, requires_item: null, requires_flag: null, microgame_type: null,
  }, extra, {
    outcome: Object.assign({
      resources: {}, crew_effect: null, severity: null, item_grant: null, item_consume: null,
      sets_flag: null, time_cost: 'low', narrative: '',
    }, o),
  });
}
function event(fields) {
  return Object.assign({
    id: null, active: true, title: '', difficulty: 'easy', tone: [], node_type: ['any'], trigger: ['any'],
    event_presentation: 'modal', scene_type: 'ship_interior', once: false, test_path: false,
    sets_flag: null, requires_flag: null, ai_flavor: null, body: '', choices: [],
  }, fields);
}
module.exports = { load, save, ev, choice, event };

'use strict';
/* ────────────────────────────────────────────────────────────────
   MAP GENERATION — algorithm ported from resources/demo-map.html's
   generateTrail() (weighted spine + fork placement per GAME_BIBLE
   §9), reshaped to write STATE.nodes/byId directly in the engine's
   own node shape ({id, name, description, node_type, position,
   connects_to, event_id}) instead of demo-map's internal shape.

   Note: this does NOT port demo-map.html's fog-of-war/scanner visual
   system — the "overlay-map" view reuses the engine's own existing
   renderMap()/nodePositions()/connectionsOf() renderer (already
   built and verified against this exact node shape), so there's no
   second parallel rendering system to maintain.
   ──────────────────────────────────────────────────────────────── */

const TYPE_LABELS = {
  station: 'Station', planet: 'Planet', asteroid_field: 'Asteroid Field',
  derelict: 'Derelict', nebula: 'Nebula', void: 'Void', anomaly: 'Anomaly',
};
const TYPE_DESCS = {
  station:        'A trading post along the route. Trade, patch up the crew, service the fabricator.',
  planet:         'Unsurveyed surface. Probe drops or skip — your call.',
  asteroid_field: 'Mineral-bearing asteroids. Slow travel, possible salvage.',
  derelict:       'Abandoned vessel drifting silent. Loot is plausible. So is something worse.',
  nebula:         'Dense gas cloud. Sensors gummed up; pilot earns their pay.',
  void:           'Empty space. No services. No witnesses.',
  anomaly:        'Sensor readings disagree. Reality is debatable here.',
};
const BRANCH_FLAVORS = ['hostile', 'lucrative', 'safe', 'corporate', 'derelict_heavy', 'scientific', 'agricultural'];
/* What a branch label means for its stops (Bible §4.5 / §9 Fork System —
   owner ruling 2026-10-11: the labels are real). Multiplies the trail's
   node weights along that branch; a type the trail can't spawn stays at
   zero. The event pool is weighted by the same label (index.html
   branchEventMult). */
const BRANCH_NODE_MULT = {
  hostile:        { void: 2, derelict: 1.5, asteroid_field: 1.3, station: 0.4 },
  lucrative:      { asteroid_field: 2.5, derelict: 1.5, planet: 1.2 },
  safe:           { station: 2, planet: 1.5, void: 0.2, anomaly: 0.2, derelict: 0.6 },
  corporate:      { station: 4 },
  derelict_heavy: { derelict: 4 },
  scientific:     { planet: 2, anomaly: 2.5, nebula: 2 },
  agricultural:   { planet: 3, station: 1.2 },
};
function branchWeights(weights, flavor) {
  const m = BRANCH_NODE_MULT[flavor] || {};
  const out = {};
  for (const k in weights) out[k] = weights[k] * (m[k] != null ? m[k] : 1);
  return out;
}

function pickWeighted(weights) {
  let total = 0;
  for (const k in weights) total += weights[k];
  if (total <= 0) return Object.keys(weights)[0];
  let r = Math.random() * total;
  for (const k in weights) {
    r -= weights[k];
    if (r <= 0) return k;
  }
  return Object.keys(weights)[0];
}

function interpWeights(a, b, t) {
  const out = {};
  for (const k in a) out[k] = a[k] * (1 - t) + (b[k] || 0) * t;
  return out;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* Placement-rule guards (GAME_BIBLE §9 / map_rules.json placement_rules):
   no two identical node_type in a row, void only after node 5, anomaly
   not in the first two legs. `nextForced` excludes whatever type the
   FOLLOWING node is already locked to (only the final spine node is
   forced, to 'station') so this node can't create a repeat with it.
   Falls back to a type that satisfies both exclusions if 20 rerolls
   all land on an excluded type. */
function pickSpineType(weights, prevType, index, nextForced) {
  for (let tries = 0; tries < 20; tries++) {
    const type = pickWeighted(weights);
    if (type === prevType || type === nextForced) continue;
    if (type === 'void' && index < 5) continue;
    if (type === 'anomaly' && index < 2) continue;
    return type;
  }
  for (const type of Object.keys(weights)) {
    if (type !== prevType && type !== nextForced) return type;
  }
  return 'planet'; // last resort — always a valid, always-available type
}

function nodeName(type, index, rules) {
  if (index === 0) return 'Earth Orbital Station';
  if (index === rules.total_nodes - 1) return rules.destination;
  return flavorName(type) || (TYPE_LABELS[type] + ' ' + index);
}
// Real place names from flavor_pools (station_names / planet_names /
// derelict_names), each used once per map; other types keep the type
// label. The map draws the short type label (node.short) — these names
// are for the encounter header, the log and the map footer.
const NAME_POOL_BY_TYPE = { station: 'station_names', planet: 'planet_names', derelict: 'derelict_names' };
let _namesLeft = {};
function flavorName(type) {
  const key = NAME_POOL_BY_TYPE[type];
  if (!key) return null;
  if (!_namesLeft[key]) _namesLeft[key] = shuffle((((typeof MOD !== 'undefined' && MOD.flavor) || {})[key] || []).slice());
  return _namesLeft[key].pop() || null;
}

/* Generates STATE.nodes/byId/currentId for `trailKey` from
   MOD.map_rules.trails[trailKey]. Forks are detours added on top of
   a fixed-length spine (matching map_rules.json's total_nodes/forks
   fields) — a fork node's connects_to is {alpha:[...], beta:[...]},
   exactly what connectionsOf()/nextAvailableNodes()/branchPick()
   already expect. */
function generateMap(trailKey) {
  const rules = MOD.map_rules.trails[trailKey];
  _namesLeft = {};
  const spineLen = rules.total_nodes;
  const nodes = [];
  const byId = {};
  function add(n) { nodes.push(n); byId[n.id] = n; return n; }

  const spine = [];
  let prevType = null;
  for (let i = 0; i < spineLen; i++) {
    const isEdge = (i === 0 || i === spineLen - 1);
    const t = spineLen <= 1 ? 0 : i / (spineLen - 1);
    const weights = interpWeights(rules.node_weights_start, rules.node_weights, t);
    // map_rules final_node_rule: the last stop before the destination is a
    // station (arriving at the destination ends the run at once — it used
    // to be the only station-typed node there, and the stop before it was
    // barred from being one). The stop before that can't repeat it.
    const lastStop = spineLen >= 3 && i === spineLen - 2;
    const nextForced = (i === spineLen - 3) ? 'station' : null;
    const type = (isEdge || lastStop) ? 'station' : pickSpineType(weights, prevType, i, nextForced);
    prevType = type;
    spine.push(add({
      id: 'node_spine_' + i,
      name: nodeName(type, i, rules),
      short: (i === 0 || i === spineLen - 1) ? null : TYPE_LABELS[type] + ' ' + i,
      description: TYPE_DESCS[type] || '',
      node_type: type, position: i, connects_to: [], event_id: null,
    }));
  }

  // map_rules station_guarantee: at least one station in the first third
  // of the route (the origin doesn't count — you leave it). Converts a
  // stop whose neighbours aren't stations, so no-repeat still holds.
  const third = Math.max(2, Math.floor((spineLen - 1) / 3));
  if (!spine.slice(1, third + 1).some(n => n.node_type === 'station')) {
    const cands = [];
    for (let i = 2; i <= third && i < spineLen - 2; i++) {
      if (spine[i - 1].node_type !== 'station' && spine[i + 1].node_type !== 'station') cands.push(i);
    }
    if (cands.length) {
      const i = cands[Math.floor(Math.random() * cands.length)];
      Object.assign(spine[i], { node_type: 'station', name: nodeName('station', i, rules), short: TYPE_LABELS.station + ' ' + i, description: TYPE_DESCS.station });
    }
  }

  // Pick which spine gaps (between spine[i] and spine[i+1]) get a fork.
  // Avoid the first and last two gaps so entry/exit stay clean, and
  // keep chosen gaps >= 2 apart — adjacent-gap forks stack two whole
  // branch structures side by side and the map turns into soup
  // (found during the interstellar map-layout pass).
  const eligibleGaps = [];
  for (let i = 1; i < spineLen - 2; i++) eligibleGaps.push(i);
  const forkGaps = [];
  for (const g of shuffle(eligibleGaps)) {
    if (forkGaps.length >= rules.forks) break;
    if (forkGaps.every(x => Math.abs(x - g) >= 2)) forkGaps.push(g);
  }
  forkGaps.sort((a, b) => a - b);

  let branchNum = 0;
  for (const gap of forkGaps) {
    const before = spine[gap], after = spine[gap + 1];
    const forkId = 'node_fork_' + branchNum;
    const forkNode = add({
      id: forkId, name: 'Route Decision', description: 'The path splits here.',
      node_type: 'fork', position: gap + 0.5, connects_to: { alpha: [], beta: [] }, event_id: null,
    });
    before.connects_to = [forkId];

    const branchLen = rules.branch_len_min + Math.floor(Math.random() * (rules.branch_len_max - rules.branch_len_min + 1));
    const flavors = shuffle(BRANCH_FLAVORS.slice());
    // Bible §9: one branch may go unlabeled — the player sees "???" (its
    // label still shapes it).
    const hiddenKey = Math.random() < 0.35 ? (Math.random() < 0.5 ? 'alpha' : 'beta') : null;
    for (const key of ['alpha', 'beta']) {
      const flavor = flavors.pop();
      const branchIds = [];
      for (let j = 0; j < branchLen; j++) {
        const t = (gap + j + 1) / (spineLen - 1);
        const weights = branchWeights(interpWeights(rules.node_weights_start, rules.node_weights, t), flavor);
        const type = pickWeighted(weights);
        const id = 'node_branch_' + branchNum + '_' + key + '_' + j;
        branchIds.push(id);
        add({
          id, name: flavorName(type) || (TYPE_LABELS[type] + ' (' + key + ')'), short: TYPE_LABELS[type],
          description: TYPE_DESCS[type] || '',
          // Distribute branch nodes evenly across the fork→rejoin gap
          // (0.5 position units). The old fixed 0.1 step packed a
          // 2-node branch into ~9px of screen — nodes and labels
          // overlapped illegibly (Phase 7's map-overlay nit).
          node_type: type, position: gap + 0.5 + (j + 1) * (0.5 / (branchLen + 1)), connects_to: [], event_id: null,
          branch_flavor: j === 0 ? flavor : undefined,
          branch_hidden: (j === 0 && hiddenKey === key) || undefined,
          branch: flavor, // every stop on the branch: weights its event pool
        });
      }
      forkNode.connects_to[key] = [branchIds[0]];
      for (let j = 0; j < branchIds.length - 1; j++) byId[branchIds[j]].connects_to = [branchIds[j + 1]];
      byId[branchIds[branchIds.length - 1]].connects_to = [after.id];
      branchNum++;
    }
  }

  for (let i = 0; i < spineLen - 1; i++) {
    if (forkGaps.includes(i)) continue; // already wired through the fork node above
    spine[i].connects_to = [spine[i + 1].id];
  }
  spine[spineLen - 1].connects_to = []; // arrival node — triggerArrival() fires on empty connects_to

  STATE.trail       = trailKey;
  const mapNames = ((MOD.flavor && MOD.flavor.map_names) || {})[trailKey];
  STATE.mapName      = (Array.isArray(mapNames) && mapNames.length) ? mapNames[Math.floor(Math.random() * mapNames.length)] : rules.name;
  STATE.destination  = rules.destination;
  STATE.nodes        = nodes;
  STATE.byId         = byId;
  STATE.currentId    = spine[0].id;
}

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
  station:        'A trading post along the route. Refuel, repair, recruit.',
  planet:         'Unsurveyed surface. Probe drops or skip — your call.',
  asteroid_field: 'Mineral-bearing asteroids. Slow travel, possible salvage.',
  derelict:       'Abandoned vessel drifting silent. Loot is plausible. So is something worse.',
  nebula:         'Dense gas cloud. Sensors gummed up; pilot earns their pay.',
  void:           'Empty space. No services. No witnesses.',
  anomaly:        'Sensor readings disagree. Reality is debatable here.',
};
const BRANCH_FLAVORS = ['hostile', 'lucrative', 'safe', 'corporate', 'derelict_heavy', 'scientific', 'agricultural'];

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
  return TYPE_LABELS[type] + ' ' + index;
}

/* Generates STATE.nodes/byId/currentId for `trailKey` from
   MOD.map_rules.trails[trailKey]. Forks are detours added on top of
   a fixed-length spine (matching map_rules.json's total_nodes/forks
   fields) — a fork node's connects_to is {alpha:[...], beta:[...]},
   exactly what connectionsOf()/nextAvailableNodes()/branchPick()
   already expect. */
function generateMap(trailKey) {
  const rules = MOD.map_rules.trails[trailKey];
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
    const nextForced = (i === spineLen - 2) ? 'station' : null; // avoid colliding with the forced-station final node
    const type = isEdge ? 'station' : pickSpineType(weights, prevType, i, nextForced);
    prevType = type;
    spine.push(add({
      id: 'node_spine_' + i,
      name: nodeName(type, i, rules),
      description: TYPE_DESCS[type] || '',
      node_type: type, position: i, connects_to: [], event_id: null,
    }));
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
    for (const key of ['alpha', 'beta']) {
      const flavor = flavors.pop();
      const branchIds = [];
      for (let j = 0; j < branchLen; j++) {
        const t = (gap + j + 1) / (spineLen - 1);
        const weights = interpWeights(rules.node_weights_start, rules.node_weights, t);
        const type = pickWeighted(weights);
        const id = 'node_branch_' + branchNum + '_' + key + '_' + j;
        branchIds.push(id);
        add({
          id, name: TYPE_LABELS[type] + ' (' + key + ')',
          description: TYPE_DESCS[type] || '',
          // Distribute branch nodes evenly across the fork→rejoin gap
          // (0.5 position units). The old fixed 0.1 step packed a
          // 2-node branch into ~9px of screen — nodes and labels
          // overlapped illegibly (Phase 7's map-overlay nit).
          node_type: type, position: gap + 0.5 + (j + 1) * (0.5 / (branchLen + 1)), connects_to: [], event_id: null,
          branch_flavor: j === 0 ? flavor : undefined,
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
  STATE.mapName      = rules.name;
  STATE.destination  = rules.destination;
  STATE.nodes        = nodes;
  STATE.byId         = byId;
  STATE.currentId    = spine[0].id;
}

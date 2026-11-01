'use strict';
/* ────────────────────────────────────────────────────────────────
   CARGO HOLD — resources/demo-inventory.html canon. Styles in
   resources/screen-inventory.css; markup is #overlay-inventory in
   index.html. Cruise's INV button calls openInventory().

   What the hold shows is the engine's own state, never mock data:
   • header — SLOTS used / capacity (cargoSlotsUsed / cargoCapacity:
     per-unit stackable rule, owner ruling 2026-10-11) with amber ≥90%,
     a pulse at the cap, a flash when it changes and a breakdown tip;
     the gold readout rolls to STATE.goldAmount.
   • SHIP RESOURCES — fuel / food / H2O tiles with the 10-segment gauge
     and LEVEL / USE / EMPTY from the real burn (legTravelCost for fuel:
     pace × fuelBurnMult; food: rations × foodBurnMult × mouthsMult;
     water: dailyDraw().water). Click → detail with IN CARGO and an
     AI line (flavor_pools ai_universal.cargo_hold.resource, 5 voices).
   • GEAR / MATERIALS / UPGRADES tabs (1/2/3 keys), SORT (Recent / A–Z /
     Slot cost / Sell price), GEAR sections, NEW badges + Recent order
     from STATE.itemPickups (index.html; provenance was dropped by the
     owner 2026-10-11 — no day/place is recorded or shown).
   • detail column — category, COUNT / SLOT COST (per item) / SELL
     PRICE (trader · fence — market.js stationBuyPrice / fenceBuyPrice),
     USED FOR (events' requires_item / gate.item), NOTES (⇄ story items
     no trader buys, ⚠ classified), an AI line (cargo_hold.category);
     SELL one to the Market Row trader while docked (ruling 28).
   • jettison — −N+ picker, JETTISON ALL, the red ⚠ confirm (with a
     "Required for:" line only when an event needs the item to fire),
     the tile zoom-fade + poof. A rolled-value copy leaves with its value.

   Load order: a classic script after the markup and before index.html's
   main inline script — top-level declarations here are page globals
   (tests and market.js/combat.js read itemSpritePath, ITEM_USE, …);
   MOD/STATE and index.html helpers resolve at call time only.
   ──────────────────────────────────────────────────────────────── */

// Item art lives in two folders: upgrades in sprites/cargo/upgrades
// (insulated_cargo_bay's file is extra_cargo.png), everything else in
// sprites/cargo/items. null when no art exists yet (emoji fallback).
const UPGRADE_SPRITES = { expanded_fuel_tank: 'expanded_fuel_tank', hull_plating: 'hull_plating', insulated_cargo_bay: 'extra_cargo', drive_coil: 'drive_coil', o2_recycler: 'o2_recycler', repair_fabricator: 'repair_fabricator', atmospheric_condenser: 'atmospheric_condenser', shield_module_upgrade: 'shield_module_upgrade' };
const NO_ITEM_ART = {}; // ids awaiting art (resources/ART_REQUESTS.md) — emoji until it lands
function itemSpritePath(id) {
  if (UPGRADE_SPRITES[id]) return 'sprites/cargo/upgrades/' + UPGRADE_SPRITES[id] + '.png';
  if (NO_ITEM_ART[id]) return null;
  return 'sprites/cargo/items/' + id + '.png';
}
// Per-item emoji when the art is missing (demo ITEM_META icons) — drawn at the sprite's 64px, never a generic 📦 for everything.
const INV_EMOJI = {
  gas_analyzer: '🔬', repair_kit: '🔧', medkit: '💊', fuel_cell: '🔋', ration_brick: '🥫', water_canister: '💧',
  pre_collapse_artifact: '🏺', corporate_memorabilia: '🎖️', logbook_fragment: '📜', classified_cargo: '📦',
  metal: '⛰️', scrap: '🧱', exotic: '✨', biocomponent: '🌿', minerals: '🪨',
  expanded_fuel_tank: '⛽', drive_coil: '🌀', insulated_cargo_bay: '🧳', hull_plating: '🛡️', o2_recycler: '🫁', repair_fabricator: '⚙️',
  water_purifier: '🚰', geiger_counter: '☢️', soil_sampler: '🧪', portable_drill: '🪛', spectrometer: '🌈', medical_scanner: '🩺',
  pressure_suit: '🧑‍🚀', solar_array: '🔆', emergency_beacon: '🚨', atmospheric_condenser: '🌫️', shield_module_upgrade: '🔰',
  alien_seed_pod: '🌰', suspicious_fungus: '🍄', fab_surplus: '🎁', sealed_vinyl: '💿', mystery_provisions: '🥡',
  unidentified_bone: '🦴', star_chart_fragment: '🗺️', distress_beacon_tag: '🏷️', crop_treatment: '🧴', o2_canister: '🫧', hull_patch: '🩹',
};
const invEmojiOf = id => NO_ITEM_ART[id] || INV_EMOJI[id] || '📦';
function invIconHtml(id, isMaterial) {
  const path = isMaterial ? 'sprites/cargo/materials/' + id + '.png' : itemSpritePath(id);
  const emo = invEmojiOf(id);
  if (!path) return '<span class="inv-tile-emoji">' + emo + '</span>';
  return '<img src="' + path + '" alt="" onerror="this.outerHTML=\'<span class=&quot;inv-tile-emoji&quot;>' + emo + '</span>\'">';
}

/* ── Consumables the player can use from the hold (items.json "on use"
   effects). can() → null when usable, else the reason it isn't; label()
   and tip() state what will really land (cap-aware) and use() returns the
   log line with what did — the same arithmetic, so the button never
   promises +15 when the tank takes 5. ── */
// What adding n to a resource really adds (up to its cap) — invAddRes's own sum.
function invLand(k, n) { const b = STATE.resources[k]; return Math.round(clamp(b + n, 0, resMax(k)) - b); }
// Adds to a resource up to its cap; returns what actually went in (USE lines report that).
function invAddRes(k, n) { const b = STATE.resources[k]; STATE.resources[k] = clamp(b + n, 0, resMax(k)); return Math.round(STATE.resources[k] - b); }
// The worst-hurt person aboard — the captain included (owner ruling 29:
// the captain has real HP, and a medkit can save them like anyone).
function worstHurtCrew() {
  let worst = null;
  for (const r of peopleAboard()) if (hpOf(r) < 100 && (!worst || hpOf(r) < hpOf(worst))) worst = r;
  return worst;
}
// A resource refill: n of k, labelled tag, with its refusal and its log line.
function invRefill(k, n, tag, item, full, line) {
  return {
    label: () => '+' + invLand(k, n) + ' ' + tag,
    tip: () => {
      const g = invLand(k, n);
      return g < n ? 'A ' + item + ' holds ' + n + '; the ' + tag + ' gauge has room for ' + g + ' (' + Math.round(STATE.resources[k]) + ' / ' + Math.round(resMax(k)) + '). The rest is lost.'
        : 'Adds ' + n + ' ' + tag + '.';
    },
    can: () => STATE.resources[k] >= resMax(k) ? full : null,
    use: () => line(invAddRes(k, n)),
  };
}
// Crop treatment: up to +30 health (the crop caps at 100), and it clears pests.
const INV_CROP_TREAT = 30;
function invCropTreatGain() {
  const cg = STATE.cropGrowth;
  return cg ? Math.round(Math.min(100, cg.health + INV_CROP_TREAT) - cg.health) : 0;
}
const ITEM_USE = {
  ration_brick:   invRefill('food', 10, 'FOOD', 'ration brick', 'Food stores are full', g => 'Ration brick unwrapped. +' + g + ' food. Nobody describes the flavor.'),
  water_canister: invRefill('water', 10, 'H2O', 'water canister', 'Water tanks are full', g => 'Water canister emptied into the tanks. +' + g + ' water.'),
  fuel_cell:      invRefill('fuel', 15, 'FUEL', 'fuel cell', 'Fuel tank is full', g => 'Fuel cell slotted in. +' + g + ' fuel.'),
  repair_kit:     invRefill('hull', 10, 'HULL', 'repair kit', 'Hull is intact', g => 'Repair kit spent on the worst seams. +' + g + ' hull.'),
  hull_patch:     invRefill('hull', 15, 'HULL', 'hull patch', 'Hull is intact', g => 'Hull patch applied. +' + g + ' hull. It holds. Probably.'),
  o2_canister:    invRefill('o2', 14, 'O2', 'O2 canister', 'O2 is full', g => 'O2 canister vented into the air supply. +' + g + ' O2.'),
  medkit: {
    label: () => 'HEAL',
    tip: () => { const r = worstHurtCrew(); return r ? 'Restores ' + PersonName(r) + ' (the worst hurt aboard) to full health.' : 'Restores the worst hurt aboard to full health.'; },
    can: () => worstHurtCrew() ? null : 'Nobody is hurt',
    use: () => { const r = worstHurtCrew(); setHP(r, 100); delete crewPendingOf()[r]; return 'Medkit opened. ' + PersonName(r) + ' is patched up and back on their feet.'; },
  },
  crop_treatment: {
    label: () => { const g = invCropTreatGain(), pest = STATE.cropGrowth && STATE.cropGrowth.pest; return g > 0 ? '+' + g + ' CROP' + (pest ? ' · PESTS' : '') : 'CLEAR PESTS'; },
    tip: () => {
      const g = invCropTreatGain(), pest = STATE.cropGrowth && STATE.cropGrowth.pest;
      return (g > 0 ? '+' + g + ' crop health' + (g < INV_CROP_TREAT ? ' (health caps at 100)' : '') : 'No health to add') + (pest ? ', and it clears the pests.' : '.');
    },
    can: () => !STATE.cropGrowth || STATE.cropGrowth.health <= 0 ? 'Nothing left to treat' : (STATE.cropGrowth.health >= 100 && !STATE.cropGrowth.pest ? 'The crop is healthy' : null),
    use: () => {
      window.tickCropGrowth(); // health caught up first: the line reports what landed
      const cg = STATE.cropGrowth, had = cg.pest;
      if (had) clearCropPest();
      const h0 = cg.health;
      cg.health = Math.min(100, cg.health + INV_CROP_TREAT);
      noteCropSwing(cg.health - h0);
      const g = Math.round(cg.health - h0);
      return 'Crop treatment applied. ' + (g > 0 ? '+' + g + ' crop health' : 'No health to add') + (had ? '; pests cleared.' : '.');
    },
  },
  // items.json: "reveals the type of one future node… consumed on use" —
  // a good SCAN's worth: the next stop(s) locked in and reported.
  star_chart_fragment: {
    label: () => 'SCOUT',
    tip: () => 'Reveals what waits at the next stop on the route (both, at a fork).',
    can: () => { const n = STATE.byId && STATE.byId[STATE.currentId]; return n && connectionsOf(n).length ? null : 'Nothing left to chart'; },
    use: () => { const r = scoutAhead(1, false); return 'Star chart fragment matched to the route. ' + (r.length ? r.join(' · ') : 'Nothing ahead but the destination.'); },
  },
};

/* ── View state ─────────────────────────────────────────────── */
let _invTab = 'gear';            // 'gear' | 'materials' | 'upgrades'
let _invSelected = null;         // selected item / material id
let _invSelectedCopy = null;     // a rolled-value trade good: which copy (index into STATE.itemValues[id]) — one tile per copy
let _invSelectedRes = null;      // a SHIP RESOURCES tile: 'fuel' | 'food' | 'water'
let _invSort = 'recent';
let _invJettisonPending = null;
let _invJettisonCopy = null;     // which copy of a rolled-value trade good goes out the airlock
let _invJettisonCount = 1;
let _invJettisonMax = 1;
let _invSellPending = false;     // the confirm panel is asking about a SELL, not the airlock
let _invJettisonText = '';       // the confirm's question, before any capacity-loss line
let _invJettisonCapItem = null;  // the item id whose capacity loss the confirm states
let _invAi = { key: null, line: '' };       // the AI line stays put across repaints; re-picked per click
let _invReadout = { used: null, cap: null }; // last slot numbers shown (flash on change)
let _invGold = { shown: 0, timer: null };   // rolling gold counter (demo: rolls from 0 on the first open)
let _invRerender = null;

const INV_SORT_LABELS = { recent: 'Recent', alpha: 'A–Z', slots: 'Slot cost', price: 'Sell price' };
const INV_EMPTY = { gear: '"Bare."', materials: '"Nothing mined yet."', upgrades: '"Stock configuration."' };
const INV_GEAR_GROUPS = [
  { label: 'Instruments', cat: 'INSTRUMENT' },
  { label: 'Consumables', cat: 'CONSUMABLE' },
  { label: 'Curiosities', cat: 'CURIOSITY' },
  { label: 'Story',       cat: 'STORY' },
];
// The 64×64 tank sprites + the gauge rectangle inside each (demo RESOURCES,
// DESIGN_SYSTEM cargo/ convention). `item` = the cargo that refills it.
const INV_RESOURCES = [
  { key: 'fuel',  label: 'FUEL', sprite: 'sprites/cargo/cargo_fuel.png',  gauge: { x: 27, y: 18, w: 10, h: 35 }, item: 'fuel_cell',
    desc: 'Burns on every leg flown; a faster pace burns more. A fuel cell from the hold adds 15.' },
  { key: 'food',  label: 'FOOD', sprite: 'sprites/cargo/cargo_food.png',  gauge: { x: 27, y: 14, w: 10, h: 35 }, item: 'ration_brick',
    desc: 'The crew eats every day; RATIONS in Orders set how much, and every mouth aboard counts. Harvests, foraging and ration bricks (+10) refill it.' },
  { key: 'water', label: 'H2O',  sprite: 'sprites/cargo/cargo_water.png', gauge: { x: 27, y: 22, w: 10, h: 33 }, item: 'water_canister',
    desc: 'One tank for crew and crop; the water split in Orders decides who drinks. A water canister adds 10.' },
];

/* ── Classification (GAME_BIBLE §14: the filing system IS the tab) ── */
function invIsUpgrade(id) { const d = itemDef(id); return !!(d && (d.item_behavior || []).includes('upgrade')); }
// Bible §14.2 authoring categories, read off the item's own data.
function invItemCategory(id) {
  const d = itemDef(id);
  if (!d) return 'INSTRUMENT';
  const beh = d.item_behavior || [], tags = d.tags || [];
  const oneUse = !!d.one_use || beh.includes('one_use');
  if (beh.includes('upgrade')) return 'UPGRADE';
  if (tags.includes('story') || (!(d.base_price > 0) && !sellRangeOf(id) && !oneUse)) return 'STORY';
  if (tags.includes('curiosity') || tags.includes('trade_good')) return 'CURIOSITY';
  if (oneUse) return 'CONSUMABLE';
  return 'INSTRUMENT';
}
// Classified cargo (demo ITEM_META classified; Bible §Cargo Hold): a red
// ⚠ on its tile while docked at a station, and a NOTES line.
const INV_CLASSIFIED = new Set(['classified_cargo']);
// Docked = at a station whose services are open (a wave-off closes them)
// — the same test as the Stop menu's TRADE there. SELL lives here.
function invDocked() {
  const n = STATE.byId && STATE.byId[STATE.currentId];
  return !!(n && n.node_type === 'station' && !STATE.ended && !(window.stationServicesClosed()));
}
function invNameOf(id, material) {
  const d = material ? materialDefOf(id) : itemDef(id);
  return (d && d.name) || prettyItem(id);
}

/* ── Prices: what a station trader pays (market.js stationBuyPrice —
   the one source), the rolled value of a trade-good copy, or none. ── */
function invPrice(en) {
  if (en.copy != null) {
    const r = sellRangeOf(en.id);
    if (itemValueKnown(en.id)) return { num: en.value, label: en.value + 'g' };
    return { num: r ? (r[0] + r[1]) / 2 : 0, label: '??', unknown: true };
  }
  const p = window.stationBuyPriceNext(en.id);
  if (p == null) return { num: 0, label: '—', none: true };
  return { num: p, label: p + 'g' };
}
function invTileSlots(en) { return itemSlotsFor(en.id, en.n); } // materials are cargo too (owner ruling 2026-10-11)

/* ── Entries per tab ────────────────────────────────────────── */
function invEntries(tab) {
  if (tab === 'materials') {
    const order = MOD.materials.materials.map(m => m.id);
    // NEW + Recent from STATE.materialPickups (grantMaterials marks a
    // stack that gains units); unmarked stacks (the launch
    // stores) are oldest, in materials.json order.
    const marks = STATE.materialPickups || {};
    return Object.keys(STATE.materials || {}).filter(m => STATE.materials[m] > 0)
      .sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99))
      .map((id, i) => ({ id, n: STATE.materials[id], material: true,
        seq: marks[id] ? marks[id].s : -(i + 1), isNew: !!(marks[id] && marks[id].n) }));
  }
  syncItemPickups();
  const counts = {};
  for (const id of STATE.items) counts[id] = (counts[id] || 0) + 1;
  const wantUp = tab === 'upgrades';
  return Object.keys(counts).filter(id => invIsUpgrade(id) === wantUp).flatMap(id => {
    const marks = itemPickupsOf(id);
    const vals = itemValuesOf(id);
    // A trade good with a rolled value is one tile per copy: each copy is
    // its own instance with its own value (sell / jettison that copy).
    if (vals.length) return vals.map((value, copy) => ({ id, n: 1, material: false, copy, value,
      seq: (marks[copy] && marks[copy].s) || 0, isNew: !!(marks[copy] && marks[copy].n) }));
    return [{ id, n: counts[id], material: false,
      seq: Math.max(0, ...marks.map(o => o.s || 0)), isNew: marks.some(o => o.n) }];
  });
}
function invSorted(list) {
  const name = en => invNameOf(en.id, en.material);
  const byName = (a, b) => name(a).localeCompare(name(b)) || ((a.copy || 0) - (b.copy || 0));
  const cmp = {
    recent: (a, b) => (b.seq - a.seq) || byName(a, b),
    alpha:  byName,
    slots:  (a, b) => (invTileSlots(b) - invTileSlots(a)) || byName(a, b),
    price:  (a, b) => (invPrice(b).num - invPrice(a).num) || byName(a, b),
  }[_invSort] || byName;
  return list.slice().sort(cmp);
}
const invKey = en => en.id + (en.copy != null ? '#' + en.copy : '');

/* ── Rendering ──────────────────────────────────────────────── */
function renderInventory() {
  _invJettisonPending = null; _invSellPending = false;
  document.getElementById('inv-confirm').classList.add('hidden');
  invUpdateReadouts();
  renderInvResources();
  // Tabs + counts (demo: GEAR (n) · MATERIALS (n) · UPGRADES (n INSTALLED)).
  const all = { gear: invEntries('gear'), materials: invEntries('materials'), upgrades: invEntries('upgrades') };
  document.querySelectorAll('#overlay-inventory .inv-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === _invTab));
  const cnt = (id, n, suffix) => { document.getElementById(id).textContent = n ? '(' + n + (suffix || '') + ')' : ''; };
  cnt('inv-count-gear', all.gear.length); cnt('inv-count-materials', all.materials.length); cnt('inv-count-upgrades', all.upgrades.length, ' INSTALLED');
  document.getElementById('inv-sort-current').textContent = INV_SORT_LABELS[_invSort];
  document.querySelectorAll('#inv-sort .sort-option').forEach(o => o.classList.toggle('selected', o.dataset.sort === _invSort));

  const grid = document.getElementById('inv-grid');
  grid.innerHTML = '';
  const entries = invSorted(all[_invTab] || []);
  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'inv-empty';
    empty.textContent = INV_EMPTY[_invTab];
    grid.appendChild(empty);
  }
  const isSel = en => !_invSelectedRes && _invSelected === en.id && (en.copy == null || en.copy === (_invSelectedCopy || 0));
  // GEAR reads as sorted categories; the other tabs are flat.
  const groups = _invTab === 'gear'
    ? INV_GEAR_GROUPS.map(g => ({ label: g.label, items: entries.filter(en => invItemCategory(en.id) === g.cat) }))
    : [{ label: null, items: entries }];
  for (const g of groups) {
    if (!g.items.length) continue;
    if (g.label) {
      const hdr = document.createElement('div');
      hdr.className = 'grid-section-header';
      hdr.textContent = '— ' + g.label + ' —';
      grid.appendChild(hdr);
    }
    for (const en of g.items) grid.appendChild(invTile(en, isSel(en)));
  }
  // Detail: the selected resource, or the selected tile (a selected copy
  // that's gone falls back to the id's first tile), else the empty prompt.
  if (_invSelectedRes) return renderInvResourceDetail(_invSelectedRes);
  const sel = entries.find(isSel) || entries.find(e => e.id === _invSelected);
  if (sel) { if (sel.copy != null) _invSelectedCopy = sel.copy; renderInvDetail(sel); }
  else { _invSelected = null; invShowDetail(false); }
}
function invTile(en, selected) {
  const tile = document.createElement('div');
  tile.className = 'inv-tile' + (selected ? ' selected' : '');
  tile.dataset.key = invKey(en);
  tile.dataset.id = en.id;
  const price = invPrice(en);
  const story = !en.material && price.none && invItemCategory(en.id) === 'STORY';
  tile.innerHTML = invIconHtml(en.id, en.material) +
    (en.n > 1 ? '<span class="inv-tile-count">×' + en.n + '</span>' : '') +
    // Rolled-value copies wear their value (Bible §14 tile: hidden value = ??).
    '<span class="inv-tile-price' + (en.copy != null ? ' inv-tile-value' : '') + (price.unknown || price.none ? ' unknown' : '') + '">' + price.label + '</span>' +
    (story ? '<span class="inv-tile-trade">⇄</span>' : '') +
    (en.isNew ? '<span class="inv-tile-new">NEW</span>' : '') +
    (INV_CLASSIFIED.has(en.id) && invDocked() ? '<span class="inv-tile-classified' + (en.isNew ? ' below-new' : '') + '">⚠</span>' : '');
  // Hover (.ui-tip): the name, plus a rolled-value copy's worth.
  tile.dataset.tipTitle = invNameOf(en.id, en.material).toUpperCase();
  if (en.copy != null) tile.dataset.tipDescription = itemValueKnown(en.id) ? 'Worth ' + en.value + 'g.' : 'Worth ' + itemValueRangeLabel(en.id) + ' (unappraised).';
  tile.addEventListener('click', () => {
    _invSelected = en.id; _invSelectedCopy = en.copy != null ? en.copy : null; _invSelectedRes = null;
    _invAi.key = null; // a click re-picks the AI line (demo: "re-clicking gives a different read")
    if (en.isNew) invMarkSeen(en);
    renderInventory();
  });
  return tile;
}
// NEW clears once the tile is clicked (demo canon); a stack clears every copy.
function invMarkSeen(en) {
  if (en.material) { const m = STATE.materialPickups && STATE.materialPickups[en.id]; if (m) m.n = false; return; }
  const list = STATE.itemPickups && STATE.itemPickups[en.id];
  if (!Array.isArray(list)) return;
  if (en.copy != null) { if (list[en.copy]) list[en.copy].n = false; }
  else list.forEach(o => { o.n = false; });
}

function invShowDetail(on) {
  document.getElementById('inv-detail').classList.toggle('hidden', !on);
  document.getElementById('inv-detail-empty').classList.toggle('hidden', on);
  if (!on) document.getElementById('inv-detail-actions').classList.add('inv-hide');
}
function invSetBlock(id, html) {
  const el = document.getElementById(id);
  el.innerHTML = html || '';
  el.classList.toggle('inv-hide', !html);
}
const invStat = (label, value, cls) => '<div class="detail-stat' + (cls ? ' ' + cls : '') + '"><span>' + label + '</span><strong>' + value + '</strong></div>';

function renderInvDetail(en) {
  invShowDetail(true);
  const def = en.material ? null : itemDef(en.id);
  const mdef = en.material ? materialDefOf(en.id) : null;
  const cat = en.material ? 'MATERIAL' : invItemCategory(en.id);
  document.getElementById('inv-detail-name').textContent = invNameOf(en.id, en.material);
  document.getElementById('inv-detail-cat').textContent = cat;
  let desc = en.material ? ((mdef && mdef.description) || 'Feedstock for the fabricator. Sharp edges included at no extra charge.')
                         : ((def && def.description) || 'Unlabeled. Confident.');
  // Xenobiologist Field Analysis payoff — the finding travels with the item.
  if (def && def.analysis && STATE.flags.has('analyzed_' + en.id)) desc += '  ◆ FIELD ANALYSIS: ' + def.analysis;
  // The spectrometer (items.json: "identifies unknown items") reads the same finding.
  else if (def && def.analysis && STATE.items.includes('spectrometer')) desc += '  ◆ SPECTROMETER: ' + def.analysis;
  document.getElementById('inv-detail-desc').textContent = desc;
  // The item's own aside: items.json passive_flavor, or a material's
  // materials.json flavor line (demo detail-flavor).
  document.getElementById('inv-detail-flavor').textContent = (def && def.passive_flavor) || (mdef && mdef.flavor) || '';

  // COUNT / SLOT COST / SELL PRICE (demo rows). SLOT COST is the per-item
  // figure (demo + Bible §14.3): a stackable's per-unit
  // decimal, anything else its whole-slot cost; a stack adds its total.
  const per10 = en.material ? materialPer10(en.id) : def && def.cargo_slots_per_10;
  const total = en.n > 1 ? ' <span class="detail-dim">' + itemSlotsFor(en.id, en.n) + ' total</span>' : '';
  const slot = (per10 ? (per10 / 10).toFixed(1) + ' per unit' : String(def ? (def.cargo_slots || 0) : 1) + (def && def.slot_bonus ? ' (+' + def.slot_bonus + ' cap)' : '')) + total;
  // SELL PRICE: one rule for every good — what a station
  // trader pays (market.js stationBuyPrice; a rolled copy its own value)
  // and, for anything a fence takes, what the fence pays (fenceBuyPrice).
  let sell, note = '';
  const fence = !en.material;
  if (en.copy != null) {
    // Rolled at pickup: the exact figure needs a spectrometer aboard.
    if (itemValueKnown(en.id)) sell = en.value + 'g' + (fence ? ' · fence ' + window.fenceBuyPrice(en.id, en.value) + 'g' : '');
    else { sell = itemValueRangeLabel(en.id) + (fence ? ' · fence ' + itemValueRangeLabel(en.id, true) : ''); note = 'exact value needs a spectrometer'; }
  } else {
    const p = invPrice(en);
    const f = fence ? window.fenceBuyPrice(en.id) : null;
    sell = p.none ? '—' : p.label + (en.n > 1 ? ' each' : '') + (f != null ? ' · fence ' + f + 'g' : '');
    // Crafted copies (ruling 79) sell at their materials' value, after any full-price copy.
    const c = !en.material ? window.craftedHeld(en.id) : 0;
    if (c) note = c >= en.n ? 'fabricator print' + (en.n > 1 ? 's' : '') + ': pays the materials\' value' : c + ' of these ' + (c === 1 ? 'is a print and pays ' : 'are prints and pay ') + window.craftedPrice(en.id) + 'g';
  }
  invSetBlock('inv-detail-meta', invStat('COUNT', '×' + en.n) + invStat('SLOT COST', slot) + invStat('SELL PRICE', sell) + (note ? invStat('', note, 'note') : ''));

  // USED FOR — the events this item opens options in (real data only).
  const used = en.material ? [] : invUsedFor(en.id);
  invSetBlock('inv-detail-used', used.length ? '<span class="detail-label">USED FOR:</span> ' + used.map(escapeHTML).join(' · ') : '');
  // NOTES — explains the corner markers (demo :1985-1991): ⇄ no trader
  // buys it; ⚠ classified. No inspection mechanic exists, so the ⚠ line
  // says what is true (nobody on the rack buys it) — no invented threat.
  const story = !en.material && invPrice(en).none && cat === 'STORY';
  const notes = [];
  if (INV_CLASSIFIED.has(en.id)) notes.push(['⚠', 'Classified: off the manifest. No trader will buy it; the contact waiting for it will.', 'classified']);
  else if (story) notes.push(['⇄', 'Not for sale: no trader buys it. Its worth is in what it unlocks.', '']);
  invSetBlock('inv-detail-notes', notes.length ? '<div class="detail-label">NOTES</div>' + notes.map(([i, t, c]) =>
    '<div class="detail-marker-row"><span class="detail-marker-icon' + (c ? ' ' + c : '') + '">' + i + '</span>' + t + '</div>').join('') : '');
  invRenderAiLine('item:' + invKey(en), ['category', cat.toLowerCase()]);

  // Actions: SELL (docked at a station, ruling 28) · USE · JETTISON.
  const sellBtn = document.getElementById('inv-sell-btn');
  const price = invPrice(en);
  const canSell = invDocked() && !price.none && !INV_CLASSIFIED.has(en.id);
  sellBtn.style.display = canSell ? '' : 'none';
  if (canSell) {
    const locked = !en.material && !canRemoveItem(en.id);
    sellBtn.textContent = 'SELL · ' + (price.unknown ? '??' : price.label);
    sellBtn.disabled = locked;
    sellBtn.dataset.tipTitle = 'SELL ONE';
    sellBtn.dataset.tipDescription = locked ? 'The cargo bay is holding things. Clear some space first.'
      : 'The Market Row trader buys one for ' + (price.unknown ? 'its real value (' + itemValueRangeLabel(en.id) + ')' : price.label) + '. Same price as the stall · no day spent.';
    if (locked) sellBtn.dataset.tipTone = 'danger'; else delete sellBtn.dataset.tipTone;
  }
  const jett = document.getElementById('inv-jett-btn');
  jett.style.display = ''; // materials too: they take hold space now, so the airlock is their way back
  const useBtn = document.getElementById('inv-use-btn');
  const iu = !en.material && ITEM_USE[en.id];
  useBtn.style.display = iu ? '' : 'none';
  if (iu) {
    const why = iu.can();
    useBtn.textContent = 'USE · ' + iu.label();
    useBtn.disabled = !!why;
    useBtn.dataset.tipTitle = 'USE ONE';
    if (why) { useBtn.dataset.tipDescription = why; useBtn.dataset.tipTone = 'danger'; }
    else { useBtn.dataset.tipDescription = iu.tip(); delete useBtn.dataset.tipTone; }
  }
  document.getElementById('inv-detail-actions').classList.remove('inv-hide');
}

// SELL one of the selected tile (ruling 28) — market.js stationSellOne:
// the Market Row trader's price and removal, logged like a stall sale.
// Cargo an event ahead needs (invRequiredFor) asks first, in the same
// confirm the airlock uses; `confirmed` is its yes.
function invSellSelected(confirmed) {
  if (!_invSelected || _invSelectedRes || !invDocked() || INV_CLASSIFIED.has(_invSelected)) return;
  const id = _invSelected, isMat = materialPer10(id) != null;
  const capLoss = isMat ? [] : invCapLoss(id, 1);
  if (confirmed !== true && !isMat && (invRequiredFor(id).length || capLoss.length)) return invOpenSellConfirm(id);
  const copy = !isMat && sellRangeOf(id) ? (_invSelectedCopy || 0) : null;
  const tileEl = document.querySelector('#inv-grid .inv-tile[data-key="' + id + (copy != null ? '#' + copy : '') + '"]');
  const r = window.stationSellOne(id, copy);
  if (!r || r.why || !Number.isFinite(r.paid)) return;
  if (!isMat) { syncItemValues(); syncItemPickups(); }
  renderHUD();
  window.pushCruiseLog('◆ Sold from the hold: ' + invNameOf(id, isMat) + ' to the Market Row trader. +' + r.paid + 'g.' +
    (capLoss.length ? ' The extra ' + invCapLossText(capLoss) + ' went with it.' : ''));
  const whole = isMat ? !STATE.materials[id] : (!STATE.items.includes(id) || copy != null);
  if (whole && _invSelected === id) { _invSelected = null; _invSelectedCopy = null; }
  invJettisonFx(tileEl, whole);
  saveRun();
}

/* ── AI line: flavor_pools ai_universal.cargo_hold, the active AI's voice ── */
function invAiPool(path) {
  let node = MOD.flavor && MOD.flavor.ai_universal && MOD.flavor.ai_universal.cargo_hold;
  for (const k of path) node = node && node[k];
  const pool = node && node[STATE.activeAI];
  return Array.isArray(pool) ? pool : [];
}
function invRenderAiLine(key, path) {
  if (_invAi.key !== key) {
    const pool = invAiPool(path);
    _invAi = { key, line: pool.length ? pool[Math.floor(Math.random() * pool.length)] : '' };
  }
  const ai = (MOD.ai_companions || []).find(a => a.id === 'ai_' + STATE.activeAI);
  const name = (ai && ai.name) || String(STATE.activeAI || '').toUpperCase();
  // No "NAME:" chip on a line that already names its AI (ruling 32): "MARV has done the arithmetic."
  const chip = namesTheAI(_invAi.line) ? '' : '<span class="detail-ai-name">' + escapeHTML(name) + ':</span>';
  invSetBlock('inv-detail-ai', _invAi.line ? chip + escapeHTML(_invAi.line) : '');
}

/* ── USED FOR / Required for — derived from the event data ──────── */
let _invUsedCache = null;
function invUsedIndex() {
  if (_invUsedCache && _invUsedCache.trail === STATE.trail) return _invUsedCache;
  const used = {}, required = {};
  const add = (map, id, ev) => { (map[id] = map[id] || new Map()).set(ev.id, ev); };
  const walk = (o, ev) => {
    if (Array.isArray(o)) { o.forEach(x => walk(x, ev)); return; }
    if (!o || typeof o !== 'object') return;
    if (typeof o.requires_item === 'string') add(used, o.requires_item, ev);
    if (o.gate && typeof o.gate.item === 'string') add(used, o.gate.item, ev);
    for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v, ev);
  };
  for (const ev of Object.values(EVENTS)) {
    if (!ev || ev.active === false) continue;
    if (ev.trail && STATE.trail && !ev.trail.includes(STATE.trail)) continue;
    walk(ev, ev);
    // An event-level requires_item only fires while the item is aboard
    // (eventEligible) — the payoff/delivery events the hold must keep it for.
    if (typeof ev.requires_item === 'string') add(required, ev.requires_item, ev);
  }
  _invUsedCache = { trail: STATE.trail, used, required };
  return _invUsedCache;
}
function invUsedFor(id) {
  const m = invUsedIndex().used[id];
  return m ? [...new Set([...m.values()].map(ev => ev.title || ev.id))] : [];
}
// Events still ahead that need this item aboard to happen at all: active,
// on this trail, story flag met, not already spent (once + seen).
function invRequiredFor(id) {
  const m = invUsedIndex().required[id];
  if (!m) return [];
  return [...new Set([...m.values()].filter(ev =>
    (!ev.requires_flag || STATE.flags.has(ev.requires_flag)) && !(ev.once && STATE.seenEventIds.has(ev.id))
  ).map(ev => ev.title || ev.id))];
}

/* ── SHIP RESOURCES row ─────────────────────────────────────── */
function invResourceStats(key) {
  const level = Math.max(0, STATE.resources[key] || 0), max = resMax(key);
  let perDay = 0, tip = '';
  if (key === 'fuel') {
    const leg = legTravelCost();
    perDay = leg.exactDays > 0 ? leg.fuel / leg.exactDays : 0;
    tip = 'Fuel burns only in flight: ' + leg.fuel + ' per leg at ' + ordersPace().name + ' (~' + leg.exactDays.toFixed(1) + ' days). About ' + (leg.fuel > 0 ? Math.floor(level / leg.fuel) : '∞') + ' legs left.';
  } else if (key === 'food') {
    perDay = ORDERS_BASE.foodPerDay * ordersRations().foodMult * foodBurnMult() * mouthsMult();
    tip = 'Eaten every day at ' + ordersRations().name + ' rations by ' + (STATE.crew.length + 1) + ' aboard.';
  } else if (key === 'water') {
    perDay = dailyDraw().water; // the crop's saving (botanist / purifier) included
    tip = 'Drawn every day; crew and crop share the tank.';
  }
  const daysLeft = perDay > 0 ? Math.floor(level / perDay) : null;
  // Fuel burns per leg, not per day: the tile shows it per leg, and its
  // EMPTY day is Orders' projection (legs left x a leg's days with the
  // usual stop time), so the two screens agree.
  if (key === 'fuel') {
    const leg = legTravelCost();
    const emptyDay = window.ordersFuelEmptyDay();
    return { level, max, perDay, perLeg: leg.fuel, emptyDay, tip };
  }
  return { level, max, perDay, emptyDay: daysLeft == null ? null : STATE.daysElapsed + daysLeft, tip };
}
function invSegColor(pos) {
  if (pos === 1) return 'var(--gauge-seg-low)';
  if (pos <= 3) return 'var(--gauge-seg-lowmid)';
  if (pos <= 5) return 'var(--gauge-seg-mid)';
  if (pos <= 7) return 'var(--gauge-seg-highmid)';
  if (pos <= 9) return 'var(--gauge-seg-high)';
  return 'var(--gauge-seg-full)';
}
function invRate(v) {
  const r1 = Math.round(v * 10) / 10;
  return Math.abs(r1 - v) < 1e-9 ? r1.toFixed(1) : (Math.round(v * 100) / 100).toFixed(2);
}
function renderInvResources() {
  const row = document.getElementById('inv-res-tiles');
  row.innerHTML = '';
  for (const r of INV_RESOURCES) {
    const s = invResourceStats(r.key);
    const tile = document.createElement('div');
    tile.className = 'res-tile' + (_invSelectedRes === r.key ? ' selected' : '');
    tile.dataset.res = r.key;
    const lit = Math.round(Math.min(1, s.level / (s.max || 100)) * 10);
    let segs = '';
    for (let i = 1; i <= 10; i++) segs += '<div class="gauge-seg' + (i <= lit ? ' lit' : '') + '" style="--seg-color:' + invSegColor(i) + '"></div>';
    // The figure EMPTY is computed from: one decimal when that is exact,
    // else two (so H2O's 0.35 never reads "~0.3" beside an EMPTY day
    // worked out at 0.35).
    const use = s.perLeg != null ? (s.perLeg > 0 ? '~' + invRate(s.perLeg) + ' / LEG' : '—') : s.perDay > 0 ? '~' + invRate(s.perDay) + ' / DAY' : '—';
    const empty = s.level <= 0 ? 'NOW' : s.emptyDay == null ? '—' : 'DAY ' + s.emptyDay;
    tile.innerHTML =
      '<div class="res-tile-frame" style="background-image:url(\'' + r.sprite + '\')">' +
        '<div class="res-gauge" style="left:' + r.gauge.x + 'px;top:' + r.gauge.y + 'px;width:' + r.gauge.w + 'px;height:' + r.gauge.h + 'px">' + segs + '</div></div>' +
      '<div class="res-tile-info">' +
        '<div class="res-tile-label">' + r.label + '</div>' +
        '<div class="res-tile-stat"><span>LEVEL</span><strong>' + Math.round(s.level) + ' / ' + Math.round(s.max) + '</strong></div>' +
        '<div class="res-tile-stat"><span>USE</span><strong>' + use + '</strong></div>' +
        '<div class="res-tile-stat' + (s.level <= 0 ? ' dry' : '') + '"><span>EMPTY</span><strong>' + empty + '</strong></div>' +
      '</div>';
    tile.dataset.tipTitle = r.label;
    tile.dataset.tipDescription = s.tip + ' EMPTY assumes nothing refills it.';
    tile.addEventListener('click', () => {
      _invSelectedRes = r.key; _invSelected = null; _invSelectedCopy = null; _invAi.key = null;
      renderInventory();
    });
    row.appendChild(tile);
  }
}
function renderInvResourceDetail(key) {
  const r = INV_RESOURCES.find(x => x.key === key);
  if (!r) return invShowDetail(false);
  invShowDetail(true);
  document.getElementById('inv-detail-name').textContent = r.label;
  document.getElementById('inv-detail-cat').textContent = 'SHIP RESOURCE';
  document.getElementById('inv-detail-desc').textContent = r.desc;
  document.getElementById('inv-detail-flavor').textContent = '';
  const n = STATE.items.filter(x => x === r.item).length;
  invSetBlock('inv-detail-meta', invStat('IN CARGO', n ? '×' + n + ' ' + escapeHTML(invNameOf(r.item)) : 'none'));
  invSetBlock('inv-detail-used', ''); invSetBlock('inv-detail-notes', '');
  invRenderAiLine('res:' + key, ['resource', key]);
  document.getElementById('inv-detail-actions').classList.add('inv-hide');
}

/* ── Header readouts ────────────────────────────────────────── */
function invFlash(el) {
  el.classList.remove('readout-flash');
  void el.offsetWidth; // restart the one-shot animation
  el.classList.add('readout-flash');
}
function invUpdateReadouts() {
  const used = cargoSlotsUsed(), cap = cargoCapacity();
  const usedEl = document.getElementById('inv-slots-used'), capEl = document.getElementById('inv-slots-total');
  usedEl.textContent = used; capEl.textContent = cap;
  if (_invReadout.used != null && used !== _invReadout.used) invFlash(usedEl);
  if (_invReadout.cap != null && cap !== _invReadout.cap) invFlash(capEl);
  _invReadout = { used, cap };
  const slots = document.getElementById('inv-slots');
  slots.classList.toggle('at-cap', used >= cap);
  slots.classList.toggle('near-cap', cap > 0 && used / cap >= 0.9 && used < cap);
  // Breakdown (.ui-tip, Bible: "22 gear · 6.6 materials"): what is eating the hold.
  let gear = 0;
  for (const en of invEntries('gear')) gear += itemSlotsFor(en.id, en.n);
  const mats = materialSlotsUsed();
  const parts = cargoCapacityParts();
  slots.dataset.tipTitle = 'CARGO SLOTS';
  slots.dataset.tipDescription = gear + ' gear · ' + mats + ' materials. Stackables (consumables and every material) cost a fraction of a slot per unit, rounded up per stack. The crop lives in the growbay, not the hold.';
  slots.dataset.tipRows = JSON.stringify([{ label: 'Gear', value: String(gear) }, { label: 'Materials', value: String(mats) },
    { label: 'Capacity', value: parts.base + (parts.bonus ? ' + ' + parts.bonus + ' bay' : '') }]);
  invRollGold(Math.round(STATE.goldAmount || 0));
}
// Earthbound-style rolling counter (demo animateGoldTo): ease-out over
// ~200–900ms scaled to the change, flashing on every tick.
function invRollGold(target) {
  const el = document.getElementById('inv-gold');
  if (_invGold.timer) { clearInterval(_invGold.timer); _invGold.timer = null; }
  const start = _invGold.shown, delta = target - start;
  if (!delta) { el.textContent = target; return; }
  const duration = Math.min(900, 200 + Math.abs(delta) * 18);
  const steps = Math.max(1, Math.min(Math.abs(delta), Math.floor(duration / 40)));
  let i = 0;
  _invGold.timer = setInterval(() => {
    i++;
    const t = i / steps, eased = 1 - Math.pow(1 - t, 2);
    _invGold.shown = Math.round(start + delta * eased);
    el.textContent = _invGold.shown;
    invFlash(el);
    if (i >= steps) { clearInterval(_invGold.timer); _invGold.timer = null; _invGold.shown = target; el.textContent = target; }
  }, duration / steps);
}

/* ── Capacity upgrades: what leaves with the last copy ─────────
   An Expanded Fuel Tank or Hull Plating raises a gauge's cap (index.html
   resMax); selling or jettisoning the last one drops the cap, and
   renderHUD trims whatever sat above it. Before the removal: which gauges
   lose what ([{ k, lost, from, to }]), so the confirm can say so. */
const INV_CAP_KEYS = ['fuel', 'hull', 'food', 'water', 'o2'];
const INV_CAP_LABEL = { fuel: 'fuel', hull: 'hull', food: 'food', water: 'water', o2: 'O2' };
function invCapLoss(id, count) {
  const have = STATE.items.filter(x => x === id).length;
  if (!have || (count || 1) < have) return [];
  const saved = STATE.items;
  const out = [];
  try {
    const before = {};
    for (const k of INV_CAP_KEYS) before[k] = resMax(k);
    STATE.items = saved.filter(x => x !== id);
    for (const k of INV_CAP_KEYS) {
      const to = resMax(k), level = STATE.resources[k] || 0;
      if (to < before[k] && level > to) out.push({ k, lost: Math.round(level - to), from: Math.round(level), to: Math.round(to) });
    }
  } finally { STATE.items = saved; }
  return out.filter(x => x.lost > 0);
}
const invCapLossText = loss => loss.map(x => x.lost + ' ' + INV_CAP_LABEL[x.k] + ' (' + INV_CAP_LABEL[x.k] + ' ' + x.from + ' → ' + x.to + ')').join(' and ');

/* ── Jettison ───────────────────────────────────────────────── */
function invOpenJettison() {
  if (!_invSelected || _invSelectedRes) return;
  const id = _invSelected;
  const isMat = materialPer10(id) != null; // a materials stack (STATE.materials), not an item
  const name = invNameOf(id, isMat);
  const blocked = !isMat && STATE.items.includes(id) && !canRemoveItem(id);
  const copyTile = !isMat && _invSelectedCopy != null && sellRangeOf(id);
  _invJettisonPending = blocked ? null : id;
  _invJettisonCopy = isMat ? null : _invSelectedCopy;
  _invJettisonMax = isMat ? (STATE.materials[id] || 0) : copyTile ? 1 : STATE.items.filter(x => x === id).length;
  _invJettisonCount = 1;
  _invSellPending = false;
  document.querySelector('#inv-jett-panel .jettison-title').textContent = '⚠ JETTISON?';
  _invJettisonText = blocked
    ? 'The ' + name + ' is holding cargo. Clear some space first.'
    : (_invJettisonMax > 1 ? 'Drop some of your ' + name + ' (×' + _invJettisonMax + ') into space?' : 'Drop your ' + name + ' into space?') + ' The airlock does not do refunds.';
  _invJettisonCapItem = blocked || isMat ? null : id;
  document.getElementById('inv-confirm-text').textContent = _invJettisonText;
  // "Required for:" — only when an event ahead needs it aboard to happen.
  const req = blocked || isMat ? [] : invRequiredFor(id);
  const warn = document.getElementById('inv-route-warn');
  warn.innerHTML = req.length ? 'Required for: <strong>' + req.map(escapeHTML).join(' · ') + '</strong>' : '';
  warn.classList.toggle('hidden', !req.length);
  document.getElementById('inv-jett-panel').classList.toggle('route-warn', !!req.length);
  document.getElementById('inv-jett-count-row').classList.toggle('hidden', blocked || _invJettisonMax < 2);
  document.getElementById('inv-jett-all').classList.toggle('hidden', blocked || _invJettisonMax < 2);
  document.getElementById('inv-confirm-yes').classList.toggle('hidden', blocked);
  invUpdateJettisonCount();
  document.getElementById('inv-confirm').classList.remove('hidden');
}
// SELL of cargo an event ahead needs, or of the last capacity upgrade
// (its headroom goes with it): the jettison confirm, one unit, SELL.
function invOpenSellConfirm(id) {
  const req = invRequiredFor(id);
  const loss = invCapLoss(id, 1);
  _invJettisonPending = null;
  _invSellPending = true;
  document.querySelector('#inv-jett-panel .jettison-title').textContent = '⚠ SELL?';
  document.getElementById('inv-confirm-text').textContent = 'Sell your ' + invNameOf(id) + ' to the Market Row trader?' +
    (loss.length ? ' The extra ' + invCapLossText(loss) + ' goes with it.' : '');
  const warn = document.getElementById('inv-route-warn');
  warn.innerHTML = req.length ? 'Required for: <strong>' + req.map(escapeHTML).join(' · ') + '</strong>' : '';
  warn.classList.toggle('hidden', !req.length);
  document.getElementById('inv-jett-panel').classList.toggle('route-warn', !!req.length);
  document.getElementById('inv-jett-count-row').classList.add('hidden');
  document.getElementById('inv-jett-all').classList.add('hidden');
  const yes = document.getElementById('inv-confirm-yes');
  yes.classList.remove('hidden');
  yes.textContent = 'SELL 1';
  document.getElementById('inv-confirm').classList.remove('hidden');
}
function invUpdateJettisonCount() {
  // The last capacity upgrade out takes its headroom with it — said before the yes.
  if (!_invSellPending && _invJettisonCapItem) {
    const loss = invCapLoss(_invJettisonCapItem, _invJettisonCount);
    document.getElementById('inv-confirm-text').textContent = _invJettisonText + (loss.length ? ' The extra ' + invCapLossText(loss) + ' goes with it.' : '');
  }
  document.getElementById('inv-jett-count').textContent = _invJettisonCount;
  document.getElementById('inv-confirm-yes').textContent = 'JETTISON ' + _invJettisonCount;
  document.getElementById('inv-jett-minus').disabled = _invJettisonCount <= 1;
  document.getElementById('inv-jett-plus').disabled = _invJettisonCount >= _invJettisonMax;
}
function invCloseJettison() {
  _invJettisonPending = null; _invSellPending = false;
  document.getElementById('inv-confirm').classList.add('hidden');
  document.getElementById('inv-jett-panel').classList.remove('route-warn');
}
// Rising particles in a tile (demo spawnPoofInTile): 7–9, random drift.
function invPoof(tileEl) {
  const count = 7 + Math.floor(Math.random() * 3);
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'poof-particle';
    p.style.left = (20 + Math.random() * 50) + '%';
    p.style.top = (40 + Math.random() * 30) + '%';
    p.style.setProperty('--dx', ((Math.random() - 0.5) * 40) + 'px');
    p.style.setProperty('--dy', (-30 - Math.random() * 25) + 'px');
    p.style.setProperty('--poof-delay', (Math.random() * 0.08) + 's');
    p.style.setProperty('--poof-dur', (0.55 + Math.random() * 0.25) + 's');
    tileEl.appendChild(p);
  }
}
// The state changes at once (a save or close mid-animation can't lose or
// double it); the grid repaints after the poof has played.
function invJettison(count) {
  // Consume the confirmation before mutating or repainting: a physical
  // double-click must still authorize exactly one trip through the airlock.
  const id = _invJettisonPending;
  _invJettisonPending = null;
  if (!id) return;
  const copy = _invJettisonCopy;
  _invJettisonCopy = null;
  if (materialPer10(id) != null) return invJettisonMaterial(id, count);
  const have = STATE.items.filter(x => x === id).length;
  const n = Math.max(1, Math.min(count, have, _invJettisonMax));
  const tileEl = document.querySelector('#inv-grid .inv-tile[data-key="' + id + (copy != null && sellRangeOf(id) ? '#' + copy : '') + '"]');
  const capLoss = invCapLoss(id, n);
  let gone = 0;
  for (let i = 0; i < n; i++) {
    if (!STATE.items.includes(id) || !canRemoveItem(id)) break;
    if (sellRangeOf(id)) takeItemCopy(id, copy); // that copy, and its value, go together
    else STATE.items.splice(STATE.items.lastIndexOf(id), 1);
    gone++;
  }
  if (!gone) return invCloseJettison();
  syncItemValues(); syncItemPickups();
  renderHUD();
  const lostLine = gone === n && capLoss.length ? ' The extra ' + invCapLossText(capLoss) + ' went with it.' : '';
  window.pushCruiseLog('◆ Jettisoned: ' + (gone > 1 ? gone + '× ' : '') + invNameOf(id) + '. ' + (gone > 1 ? 'They tumble' : 'It tumbles') + ' off into the dark, unemployed.' + lostLine);
  const whole = !STATE.items.includes(id) || copy != null;
  if (whole && _invSelected === id) { _invSelected = null; _invSelectedCopy = null; }
  invCloseJettison();
  invJettisonFx(tileEl, whole);
}
// Materials out the airlock (they're cargo now): N units of the stack.
function invJettisonMaterial(id, count) {
  const have = STATE.materials[id] || 0;
  const n = Math.max(0, Math.min(count, have));
  if (!n) return invCloseJettison();
  const tileEl = document.querySelector('#inv-grid .inv-tile[data-key="' + id + '"]');
  STATE.materials[id] = have - n;
  renderHUD();
  window.pushCruiseLog('◆ Jettisoned: ' + n + ' ' + invNameOf(id, true).toLowerCase() + '. The hold breathes a little easier.');
  const whole = !STATE.materials[id];
  if (whole && _invSelected === id) _invSelected = null;
  invCloseJettison();
  invJettisonFx(tileEl, whole);
}
function invJettisonFx(tileEl, whole) {
  if (tileEl) { invPoof(tileEl); if (whole) tileEl.classList.add('jettisoning'); }
  invUpdateReadouts();
  clearTimeout(_invRerender);
  _invRerender = setTimeout(() => {
    _invRerender = null;
    if (document.getElementById('overlay-inventory').classList.contains('active') && document.getElementById('inv-confirm').classList.contains('hidden')) renderInventory();
  }, whole ? 500 : 350);
  if (!tileEl) renderInventory();
}

/* ── Tabs / sort ────────────────────────────────────────────── */
function invSetTab(tab) {
  if (tab === _invTab || !['gear', 'materials', 'upgrades'].includes(tab)) return; // re-clicking the active tab must not wipe the selection (ui_sweep catch)
  _invTab = tab; _invSelected = null; _invSelectedCopy = null; _invSelectedRes = null;
  document.getElementById('inv-sort').classList.remove('open');
  renderInventory();
}
function invSetSort(key) {
  if (!INV_SORT_LABELS[key]) return;
  _invSort = key;
  document.getElementById('inv-sort').classList.remove('open');
  renderInventory();
}

(function wireInventoryChrome() {
  document.querySelectorAll('#overlay-inventory .inv-tab').forEach(t => t.addEventListener('click', () => invSetTab(t.dataset.tab)));
  const sort = document.getElementById('inv-sort');
  document.getElementById('inv-sort-btn').addEventListener('click', e => { e.stopPropagation(); sort.classList.toggle('open'); });
  sort.querySelectorAll('.sort-option').forEach(o => o.addEventListener('click', e => { e.stopPropagation(); invSetSort(o.dataset.sort); }));
  // Outside click closes the flyout.
  document.addEventListener('click', e => { if (sort.classList.contains('open') && !sort.contains(e.target)) sort.classList.remove('open'); });
  document.getElementById('inv-jett-btn').addEventListener('click', invOpenJettison);
  document.getElementById('inv-sell-btn').addEventListener('click', invSellSelected);
  document.getElementById('inv-jett-minus').addEventListener('click', () => { _invJettisonCount = Math.max(1, _invJettisonCount - 1); invUpdateJettisonCount(); });
  document.getElementById('inv-jett-plus').addEventListener('click', () => { _invJettisonCount = Math.min(_invJettisonMax, _invJettisonCount + 1); invUpdateJettisonCount(); });
  document.getElementById('inv-jett-all').addEventListener('click', () => invJettison(_invJettisonMax));
  document.getElementById('inv-confirm-yes').addEventListener('click', () => {
    if (!_invSellPending) return invJettison(_invJettisonCount);
    invCloseJettison(); // consumed before the sale: a double-click sells one
    invSellSelected(true);
  });
  document.getElementById('inv-confirm-no').addEventListener('click', () => { invCloseJettison(); renderInventory(); });
  document.getElementById('inv-use-btn').addEventListener('click', () => {
    const id = _invSelected, iu = id && ITEM_USE[id];
    if (!iu || iu.can() || !STATE.items.includes(id)) return;
    STATE.items.splice(STATE.items.indexOf(id), 1);
    const msg = iu.use();
    renderHUD();
    window.pushCruiseLog('◆ ' + msg);
    if (!STATE.items.includes(id)) _invSelected = null;
    renderInventory();
    if (document.getElementById('screen-cruise').classList.contains('active')) window.renderCruise();
    window.refreshStopMenu();
  });
  // Keys while the hold is open: 1/2/3 switch tabs (demo); Esc closes an
  // open SORT flyout first (the jettison confirm's Esc lives in index.html).
  document.addEventListener('keydown', e => {
    if (!document.getElementById('overlay-inventory').classList.contains('active')) return;
    if (PauseMenu.isOpen()) return;
    if (e.key === 'Escape' && sort.classList.contains('open')) {
      sort.classList.remove('open'); e.preventDefault(); e.stopImmediatePropagation(); return;
    }
    if (!document.getElementById('inv-confirm').classList.contains('hidden')) return;
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
    const tab = { 1: 'gear', 2: 'materials', 3: 'upgrades' }[e.key];
    if (tab) { invSetTab(tab); e.preventDefault(); }
  }, true);
})();

function openInventory() {
  _invReadout = { used: null, cap: null }; // no flash for the numbers it opens on
  _invAi.key = null;
  _invUsedCache = null;
  showOverlay('overlay-inventory');
  renderInventory();
}
// Every close path (✕, backdrop, Esc — the footer CLOSE is gone, ruling
// 42) — jettisons persist.
function closeInventory() {
  document.getElementById('inv-sort').classList.remove('open');
  hideOverlay('overlay-inventory');
  saveRun();
}

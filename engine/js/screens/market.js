'use strict';
/* ────────────────────────────────────────────────────────────────
   MARKET MODAL — engine host wiring (Restoration item 2).
   Ported from resources/demo-encounter.html's VENDORS/openMarket
   block. The generic modal machinery (mount/rows/log/close) is
   MarketModal in resources/shared.js — this file only provides the
   engine-side host contract:

   • Stock is built from modules/items/items.json at open time —
     purchasable items shelve at base_price; the demo's invented
     ware ids (humming thing, ghost chip, …) must never enter
     STATE.items (same rule as the fabricator recipe port), so the
     demo's black-market ware slots are refilled with real loot_only
     ids at the demo's price points.
   • Sell side: the vendor pays ~2/3 of an item's base_price — the
     demo outpost_trader convention (18→12, 22→15, 6→4). Trade goods
     with a sell_range have no base_price: each copy carries the value
     rolled when it came aboard (index.html TRADE-GOOD VALUES), the
     trader pays exactly that and the fence FENCE_MULT × it. Without a
     spectrometer aboard the offer shows the range; the sale pays (and
     logs) the real figure. Standing discounts never touch selling.
   • A lane trader (an event of the trader family — STATE.currentEvent)
     shelves only its own hold (traderStock: consumables + a few items);
     stations keep the whole catalogue.
   • Gold is STATE.goldAmount; every transaction renderHUD()s.
   • Buying routes through window.grantItem (capacity-enforced —
     NEVER pushes to STATE.items directly). The canAddCargo hook
     gates capacity BEFORE MarketModal applies any cost, so a
     refused buy leaves gold untouched.
   • Sinister variant (opts.sinister): .sinister chrome on
     #enc-market, close button 'LEAVE.', and close navigates back to
     the scenario entryLayer with the npc slot cleared so the intro
     renders without an NPC visible (demo openMarket onClose).

   Load-order rule: this script loads BEFORE index.html's main inline
   script — no top-level MOD/STATE/DOM-builder reads; everything
   resolves at call time. Entry: window.openMarket(opts, onClose).
   ──────────────────────────────────────────────────────────────── */
(function() {
  'use strict';
  const $ = id => document.getElementById(id);

  const shortIdOf = id => id.replace(/^item_/, '').replace(/_\d+$/, '');

  // Six items.json ids have no sprites/cargo/items PNG (ship upgrades +
  // loot-only ship gear) — emoji fallback per the demo's own ware-icon
  // convention. Everything else uses its real cargo sprite.
  const ICON_FALLBACK = {
    expanded_fuel_tank:  '⛽',
    hull_plating:        '🛡️',
    insulated_cargo_bay: '📦',
    drive_coil:          '🌀',
    o2_recycler:         '♻️',
    repair_fabricator:   '🛠️'
  };
  // Upgrades have their own art in sprites/cargo/upgrades (it existed
  // all along — the market showed emoji); emoji only where no art exists.
  const iconOf = sid => itemSpritePath(sid) || (typeof NO_ITEM_ART !== 'undefined' && NO_ITEM_ART[sid]) || ICON_FALLBACK[sid] || ('sprites/cargo/items/' + sid + '.png');

  // Demo sell-price convention: vendors pay ~2/3 of asking price.
  const sellPrice = bp => Math.max(1, Math.round(bp * 2 / 3));

  function allMaterialDefs() {
    return (typeof MOD !== 'undefined' && MOD.materials && MOD.materials.materials) || [];
  }
  // A unit of raw material sells for its authored value × materials.json
  // station_sell_multiplier (its _meta says why it stays under 5: mining
  // for sale). The Market Row, the cargo hold's SELL and every SELL PRICE
  // readout read this one function, so the shown price is the paid one.
  const materialSellMult = () => MOD.materials.station_sell_multiplier;
  const materialPrice = m => Math.max(1, Math.round((m.value || 0.2) * materialSellMult()));
  // What a station trader pays for one unit of sid (item or material), or
  // null when no trader buys it — the cargo hold's SELL PRICE / price
  // corner read this (one source with stationVendor's buyPrices).
  function stationBuyPrice(sid) {
    const m = allMaterialDefs().find(x => x.id === sid);
    if (m) return materialPrice(m);
    const d = defBy(sid);
    return d && Number.isFinite(d.base_price) && d.base_price > 0 ? sellPrice(d.base_price) : null;
  }
  /* Crafted copies (ruling 79): a fabricator print sells for what its
     materials would (the recipe's inputs at materialPrice), not the shelf
     price — a repair kit prints from 8g of metal and scrap and sold for
     27g. STATE.crafted[sid] counts the prints aboard (fabricator.js
     claimOutput); copies that came any other way sell first at the full
     price, so the price shown is the one the next sale pays. */
  const recipeFor = sid => (((typeof MOD !== 'undefined' && MOD.recipes && MOD.recipes.recipes) || [])).find(r => r && r.active !== false && r.output && (r.output.item_id === sid || r.output.item === sid));
  function craftedPrice(sid) {
    const r = recipeFor(sid);
    if (!r) return null;
    let g = 0;
    for (const i of r.inputs || []) { const m = allMaterialDefs().find(x => x.id === i.material_id); if (m) g += materialPrice(m) * (i.count || 0); }
    return Math.max(1, Math.round(g));
  }
  const heldCount = sid => STATE.items.filter(x => x === sid).length;
  function craftedHeld(sid) {
    const n = STATE.crafted && Number.isFinite(STATE.crafted[sid]) ? STATE.crafted[sid] : 0;
    return craftedPrice(sid) == null ? 0 : Math.max(0, Math.min(n, heldCount(sid)));
  }
  // Is the next copy sold a crafted one (no full-price copy left)?
  const nextIsCrafted = sid => craftedHeld(sid) > 0 && craftedHeld(sid) >= heldCount(sid);
  // What the next sale of sid pays at a station (the hold's SELL PRICE and SELL button).
  function stationBuyPriceNext(sid) {
    return nextIsCrafted(sid) ? craftedPrice(sid) : stationBuyPrice(sid);
  }
  function noteCraftedSold(sid) {
    if (STATE.crafted && STATE.crafted[sid] > 0) { STATE.crafted[sid] -= 1; if (!STATE.crafted[sid]) delete STATE.crafted[sid]; }
  }
  // What a fence pays for one sid (one rule for every trade good, the one
  // items.json states — "a fence pays half again as much" as a station
  // trader): a rolled copy FENCE_MULT × its value, a
  // fixed-value good FENCE_MULT × the trader's ⅔ of base_price (= its
  // base price: vinyl 17 → 25). null when the fence doesn't take it
  // (only trade_good-tagged cargo). The black market's offers and the
  // cargo hold's SELL PRICE both read this.
  const FENCE_TAGS = ['trade_good'];
  function fenceBuyPrice(sid, copyValue) {
    const d = defBy(sid);
    if (!d || !(d.tags || []).some(t => FENCE_TAGS.includes(t))) return null;
    if (Number.isFinite(copyValue)) return fenceValueOf(copyValue);
    if (Number.isFinite(d.base_price) && d.base_price > 0) return Math.max(1, Math.round(d.base_price * 2 / 3 * FENCE_MULT));
    return null;
  }
  // A station trader's sale of one unit, from outside the Market Row
  // (the cargo hold's SELL when docked, ruling 28): the same price as the
  // trader's row (stationBuyPrice; a rolled copy pays its own value) and
  // the same removal (materials by the unit, a rolled copy with its
  // value). Returns { paid } or { why }.
  function stationSellOne(sid, copy) {
    const isMat = allMaterialDefs().some(m => m.id === sid);
    if (isMat) {
      if (!(STATE.materials[sid] > 0)) return { why: 'None left' };
      const p = window.stationBuyPrice(sid);
      STATE.materials[sid] -= 1;
      STATE.goldAmount += p;
      return { paid: p };
    }
    if (!STATE.items.includes(sid)) return { why: 'None left' };
    if (!canRemoveItem(sid)) return { why: 'The cargo bay is holding things. Clear some space first.' };
    const vals = itemValuesOf(sid);
    let paid, crafted = false;
    if (vals.length) {
      const k = Number.isInteger(copy) && copy >= 0 && copy < vals.length ? copy : 0;
      paid = takeItemCopy(sid, k);
    } else {
      crafted = nextIsCrafted(sid);
      paid = crafted ? craftedPrice(sid) : window.stationBuyPrice(sid);
      if (paid == null) return { why: 'No trader buys it' };
      STATE.items.splice(STATE.items.lastIndexOf(sid), 1);
      if (crafted) noteCraftedSold(sid);
    }
    STATE.goldAmount += paid;
    return { paid, crafted };
  }
  function allItemDefs() {
    return (typeof MOD !== 'undefined' && MOD.items) ? MOD.items : [];
  }
  function defBy(sid) {
    return itemDef(sid);
  }

  /* A trader met in the lanes (the trader family — event_encounter_trader_*,
     which every TRADE / WAIT FOR TRADER summons) carries a ship's hold, not
     a station's shelves: the shelf consumables plus a few pieces of gear
     that suit the trader. The closing-down sale (trader_004) sells fake
     hull plating in its pitch, so its hold has no genuine plating. */
  const TRADER_CONSUMABLES = ['fuel_cell', 'ration_brick', 'water_canister', 'o2_canister', 'hull_patch', 'medkit'];
  const TRADER_GEAR = {
    event_encounter_trader_001: ['repair_kit', 'geiger_counter', 'water_purifier'],   // the travelling merchant
    event_encounter_trader_002: ['spectrometer', 'medical_scanner'],                  // the museum's duplicates shelf
    event_encounter_trader_003: ['repair_kit', 'soil_sampler', 'portable_drill'],     // the haggler
    event_encounter_trader_004: ['gas_analyzer', 'solar_array'],                      // the closing-down sale: no plating
  };
  const TRADER_GEAR_DEFAULT = ['repair_kit'];
  // The trader event the market was opened from (STATE.currentEvent), or null at a station.
  function traderEventId() {
    const ev = typeof STATE !== 'undefined' && STATE.currentEvent;
    return ev && ev.family === 'trader' ? ev.id : null;
  }
  function traderStock(evId) {
    return new Set(TRADER_CONSUMABLES.concat(TRADER_GEAR[evId] || TRADER_GEAR_DEFAULT));
  }

  // ── Vendor builders — demo VENDORS structure fed by items.json ──
  // stock: a Set of short ids to shelve (a lane trader's hold), or null
  // for a station's whole catalogue.
  function stationVendor(stock) {
    const wares = allItemDefs()
      .filter(d => d.item_source === 'purchasable' && d.active !== false &&
                   Number.isFinite(d.base_price) && d.base_price > 0)
      .filter(d => !stock || stock.has(shortIdOf(d.id)))
      .map(d => {
        const sid = shortIdOf(d.id);
        return {
          id: sid,
          name: (d.name || sid).toUpperCase(),
          icon: iconOf(sid),
          cost: { gold: d.base_price },
          stackable: !!d.cargo_slots_per_10 || (d.tags || []).includes('stackable'),
          desc: d.description || ''
        };
      });
    // The vendor buys back anything items.json prices (base_price > 0)
    // — including loot-only consumables, so scavenged goods have a
    // gold outlet at honest shops.
    const buyPrices = {};
    for (const d of allItemDefs()) {
      if (d.id && Number.isFinite(d.base_price) && d.base_price > 0) {
        buyPrices[shortIdOf(d.id)] = sellPrice(d.base_price);
      }
    }
    // Raw materials are "tradeable at stations" (materials.json) — the
    // trader buys them by the unit at their authored value.
    for (const m of allMaterialDefs()) buyPrices[m.id] = materialPrice(m);
    // Negotiation (diplomat active skill, crew.js): the armed flag buys
    // 15% off this station market's wares, then it's spent — the skill's
    // authored "talk stations into better deals" line, made mechanical.
    // Standing discounts (setup screen): CHIP "Station prices -15%"
    // (ai_companions price_reduction), Merchant captain "Prices -10%".
    const standing = stationPriceMult();
    if (standing < 1) {
      for (const w of wares) {
        if (w.cost && w.cost.gold) w.cost.gold = Math.max(1, Math.round(w.cost.gold * standing));
      }
    }
    // An upgrade you already carry does nothing twice — don't offer it.
    for (let i = wares.length - 1; i >= 0; i--) {
      const d = defBy(wares[i].id);
      if (d && (d.item_behavior || []).includes('upgrade') && STATE.items.includes(wares[i].id)) wares.splice(i, 1);
    }
    let negotiated = false;
    // Negotiation talks stations into better deals: a lane trader leaves it armed.
    if (!stock && typeof STATE !== 'undefined' && STATE.flags && STATE.flags.has('negotiation_prepared')) {
      STATE.flags.delete('negotiation_prepared');
      negotiated = true;
      for (const w of wares) {
        if (w.cost && w.cost.gold) w.cost.gold = Math.max(1, Math.round(w.cost.gold * 0.85));
      }
    }
    // Stacked discounts (CHIP × Merchant × Negotiation = 0.65) went under
    // the 2/3 buy-back: buy a hull patch at 9, sell it at 10, forever.
    // Nothing on the shelf sells for less than the trader pays for it.
    for (const w of wares) {
      if (w.cost && w.cost.gold && buyPrices[w.id] != null) w.cost.gold = Math.max(w.cost.gold, buyPrices[w.id] + 1);
    }
    if (stock) return {
      name: 'TRADER\'S HOLD',
      greeting: "It's a ship, not a station. What's in the hold is what's for sale.",
      farewell: "Safe lanes. Maybe I'll see you at the next one.",
      wares,
      buyPrices,
      flavor: {
        buy:  ["Pleasure doing business.", "Fresh out of the hold.", "Don't crash it."],
        sell: ["I'll take it.", "There's room in the hold for that.", "Somebody down the lane will want it."],
        deny: ["Don't have the gold for that.", "Can't help you there."],
        no_buyback: ["No use for that, sorry.", "Nobody's buying those this cycle."]
      }
    };
    return {
      name: 'OUTPOST TRADER',
      greeting: negotiated
        ? "Your diplomat already talked my ear off. Fine. Up to fifteen percent, and not a credit under what I pay for it. Don't tell the other captains."
        : "Welcome, welcome. What do you need today — or what are you selling?",
      farewell: "Come back when you've got more to spend.",
      wares,
      buyPrices,
      flavor: {
        buy:  ["Pleasure doing business.", "Smart pick.", "Don't crash it."],
        sell: ["I'll take it.", "Adding it to the rack.", "Always a market for that."],
        deny: ["Don't have the gold for that.", "Can't help you there."],
        no_buyback: ["No use for that, sorry.", "Nobody's buying those this cycle."]
      }
    };
  }

  function blackMarketVendor() {
    // Demo black_market ware slots (45/60/50g) refilled with real
    // loot_only ids — off-manifest gear no honest shop shelves. (Classified
    // cargo left the rack: bought here it had no courier job to pay it off.)
    const stock = [['drive_coil', 60], ['o2_recycler', 45], ['repair_fabricator', 50]];
    const wares = [];
    // Fixed-value fence offers from the one rule (window.fenceBuyPrice);
    // a rolled copy carries its own (cargoEntry's fencePrice).
    const fencePrices = {};
    for (const d of allItemDefs()) {
      const sid = d.id && shortIdOf(d.id), f = sid && window.fenceBuyPrice(sid);
      if (f != null) fencePrices[sid] = f;
    }
    for (const [sid, gold] of stock) {
      const d = defBy(sid);
      if (!d) continue; // defensive: never invent an id items.json lacks
      if (STATE.items.includes(sid)) continue; // an upgrade you carry does nothing twice
      wares.push({
        id: sid,
        name: (d.name || sid).toUpperCase(),
        icon: iconOf(sid),
        cost: { gold },
        desc: d.description || ''
      });
    }
    return {
      name: 'BACK INVENTORY',
      sinister: true,
      greeting: "No names. No manifest. And if anyone asks, I sell planters.",
      farewell: "You were never here.",
      wares,
      // Fence mode: buys tagged curiosities only (items.json's
      // trade_good tag — the engine's stand-in for the demo's
      // black_market tag, which no real item carries). Rolled-value
      // goods carry their own fencePrice (cargoEntry); these are the
      // fixed-value ones.
      wantedTags: FENCE_TAGS,
      fencePrices,
      defaultFenceValue: 20, // unreachable fallback: every trade good carries a price
      flavor: {
        buy:  ["No receipt.", "Yours. We never spoke.", "Keep it away from port authority scanners."],
        deny: ["Gold. Real gold. Not scrip.", "Come back when you're not short."],
        no_buyback: ["I don't move that here.", "Wrong market entirely."],
        fence: ["Well, well. Where'd you get this?", "I've been looking for exactly that.", "This never happened. Pleasure doing business."]
      }
    };
  }

  /* Demo trader_surplus (the space trader's surplus bin): one box of
     fabricator surplus, sold unseen as "???" for 8 gold. It is the real
     fab_surplus item (items.json) — the Surplus Collector and the fence
     take it; this bin doesn't buy anything back. */
  function surplusVendor() {
    const d = defBy('fab_surplus');
    return {
      name: 'SURPLUS MYSTERY',
      greeting: "No names. No returns. No questions. And yes, it hums.",
      farewell: "Whatever it does, it's yours now.",
      wares: d ? [{ id: 'fab_surplus', name: '???', icon: '📦', cost: { gold: 8 },
                    desc: 'Fabricator surplus. Contents unknown. Warranty: void. Do not submerge.' }] : [],
      buyPrices: {},
      flavor: {
        buy:  ["Hope it's useful.", "Sold.", "Try not to open it near an open flame."],
        deny: ["Eight gold. That's the price.", "Can't negotiate on something I can't describe."],
        no_buyback: ["I don't buy mystery boxes back. Obviously."]
      }
    };
  }

  /* Barter (demo xeno_merchant): an alien vendor at Market Row (the
     choice's market_barter; the vendor's species is the event NPC's)
     also takes goods — item for item, or gold and an item. One trade per
     row each time the stall opens. Real items only, each with a source
     and a use: surplus (fabricator misfires) and fungus (events) in,
     shelf consumables out. A human vendor deals in gold only. */
  const BARTER_WARES = [
    { id: 'hull_patch',  cost: { item: 'fab_surplus' },              desc: 'Takes your fabricator surplus, sight unseen. Gives you a hull patch, sight very much seen.' },
    { id: 'medkit',      cost: { item: 'suspicious_fungus' },        desc: 'They want the fungus. They do not say what for. The medkit is sealed and current.' },
    { id: 'o2_canister', cost: { gold: 3, item: 'ration_brick' },    desc: 'A ration brick and three gold for a canister of air. They insist the brick is the valuable half.' },
    { id: 'fuel_cell',   cost: { gold: 4, item: 'water_canister' },  desc: 'Water and four gold for a fuel cell. Out here water is the currency; gold is the tip.' },
  ];
  const BARTER_FLAVOR = {
    buy:  ["*a low chime — assent*", "*chime: THE EXCHANGE IS GOOD*", "*chime: REGARD*"],
    deny: ["*a sharp chime — regret*", "*chime: NOT POSSIBLE*"],
  };
  function addBarterWares(vendor) {
    const sp = STATE.npcCtx && STATE.npcCtx.species;
    if (!sp || sp === 'human') return vendor;
    // Top of the rack: the trades are the stall's specialty (they sat
    // below twenty gold rows, out of sight).
    const barter = [];
    for (const w of BARTER_WARES) {
      const d = defBy(w.id);
      if (!d || (w.cost.item && !defBy(w.cost.item))) continue; // never invent an id items.json lacks
      barter.push({ id: w.id, name: (d.name || w.id).toUpperCase(), icon: iconOf(w.id), cost: Object.assign({}, w.cost), desc: w.desc, barter: true });
    }
    vendor.wares.unshift(...barter);
    vendor.name = 'XENO MERCHANT';
    vendor.greeting = "*a chime that resolves into the word: TRADE*";
    vendor.farewell = "*a chime, descending — assent of farewell*";
    vendor.flavor.buy = BARTER_FLAVOR.buy.concat(vendor.flavor.buy);
    vendor.flavor.deny = BARTER_FLAVOR.deny.concat(vendor.flavor.deny);
    return vendor;
  }

  // STATE.items (short-id strings) → MarketModal cargo entries. A trade
  // good with a rolled value is its own entry (key id#copy) priced at
  // that copy's value — exact with a spectrometer aboard, the range without.
  function cargoEntry(sid, copy) {
    const d = defBy(sid);
    const e = {
      id: sid,
      name: ((d && d.name) || sid.replace(/_/g, ' ')).toUpperCase(),
      icon: iconOf(sid),
      desc: (d && d.description) || '',
      tags: (d && d.tags) || []
    };
    const vals = itemValuesOf(sid);
    if (vals.length && copy != null && copy < vals.length) {
      const v = vals[copy];
      e.key = sid + '#' + copy;
      e.copy = copy;
      e.price = v;
      e.fencePrice = fenceValueOf(v);
      if (!itemValueKnown(sid)) {
        e.priceLabel = itemValueRangeLabel(sid);
        e.fenceLabel = itemValueRangeLabel(sid, true);
        e.desc += (e.desc ? '  ' : '') + 'Unappraised: pays its real value, somewhere in that range. A spectrometer aboard reads the exact figure.';
      }
    }
    return e;
  }
  function cargoEntries() {
    const seen = {};
    return STATE.items.map(sid => { const k = seen[sid] = (seen[sid] == null ? 0 : seen[sid] + 1); return cargoEntry(sid, k); });
  }
  // The Market Row lists a crafted copy at its materials' value (ruling 79):
  // the last craftedHeld copies of each id are the prints, so the full-price
  // copies sell first.
  function markCraftedEntries(entries) {
    const held = {}, idx = {};
    for (const e of entries) held[e.id] = (held[e.id] || 0) + 1;
    for (const e of entries) {
      const k = idx[e.id] = (idx[e.id] == null ? 0 : idx[e.id] + 1);
      const c = craftedHeld(e.id);
      if (e.copy != null || !c || k < held[e.id] - c) continue;
      e.key = e.id + '#c' + k;
      e.crafted = true;
      e.price = craftedPrice(e.id);
      e.desc += (e.desc ? '  ' : '') + 'A fabricator print: the trader pays what its materials are worth.';
    }
    return entries;
  }

  // Trial-fit: would one more of `sid` fit the hold? Mirrors
  // grantItem's own check without committing (push → measure → pop).
  // A barter ware frees its traded item's slot first (item for item
  // must not be refused by a full hold).
  function cargoFits(sid, tradedSid) {
    if (sid === 'insulated_cargo_bay') return !STATE.items.includes(sid); // grantItem's own paradox guard
    const ti = tradedSid ? STATE.items.lastIndexOf(tradedSid) : -1;
    if (ti >= 0) STATE.items.splice(ti, 1);
    STATE.items.push(sid);
    const fits = cargoSlotsUsed() <= cargoCapacity();
    STATE.items.pop();
    if (ti >= 0) STATE.items.splice(ti, 0, tradedSid);
    return fits;
  }

  // The sell confirm (index.html #market-confirm): one pending yes.
  let confirmYes = null;
  function closeSellConfirm() {
    confirmYes = null;
    const c = $('market-confirm'); if (c) c.classList.add('hidden');
  }
  function askSellRequired(entry, proceed) {
    if (entry.material) return false;
    const req = window.invRequiredFor(entry.id);
    // The last capacity upgrade sold takes its headroom with it (inventory.js invCapLoss).
    const loss = invCapLoss(entry.id, 1);
    const c = $('market-confirm');
    if ((!req.length && !loss.length) || !c) return false;
    const d = defBy(entry.id);
    $('market-confirm-text').textContent = 'Sell your ' + ((d && d.name) || entry.id) + ' here?' +
      (loss.length ? ' The extra ' + invCapLossText(loss) + ' goes with it.' : '');
    const warn = $('market-route-warn');
    warn.innerHTML = req.length ? 'Required for: <strong>' + req.map(escapeHTML).join(' · ') + '</strong>' : '';
    warn.style.display = req.length ? '' : 'none';
    confirmYes = proceed;
    c.classList.remove('hidden');
    return true;
  }
  (function wireSellConfirm() {
    const yes = $('market-confirm-yes'), no = $('market-confirm-no');
    if (!yes || !no) return;
    // The yes is consumed before the sale: a double-click sells one.
    yes.addEventListener('click', () => { const go = confirmYes; closeSellConfirm(); if (go) go(); });
    no.addEventListener('click', closeSellConfirm);
  })();

  function openMarket(opts, onClose) {
    opts = opts || {};
    if (typeof MarketModal === 'undefined') {
      console.warn('[market] MarketModal missing — shared.js not loaded?');
      if (typeof onClose === 'function') onClose();
      return;
    }
    if (MarketModal.isOpen()) return;
    // A lane trader's market is its own hold (traderStock); a station's is the catalogue.
    const trader = traderEventId();
    const stock = trader ? traderStock(trader) : null;
    const vendor = opts.sinister ? blackMarketVendor()
      : opts.vendor === 'surplus' ? surplusVendor()
      : opts.barter ? addBarterWares(stationVendor(stock))
      : stationVendor(stock);

    const marketEl = $('enc-market');
    if (marketEl) marketEl.classList.toggle('sinister', !!vendor.sinister);
    const closeBtn = $('market-close-btn');
    if (closeBtn) closeBtn.textContent = vendor.sinister ? 'LEAVE.' : 'STEP BACK';
    showOverlay('overlay-market');

    MarketModal.mount({
      vendor,
      hostEl:        $('screen-encounter'),   // receives .market-mode reflow class
      logEl:         $('market-log'),
      subjectNameEl: $('enc-subject-name'),
      getGold: () => STATE.goldAmount,
      setGold: v => { STATE.goldAmount = Math.max(0, v); renderHUD(); },
      // Items, then one entry per unit of each raw material (the list
      // stacks them) — materials sell at stations; each unit sold frees its share of hold space.
      getCargo: () => markCraftedEntries(cargoEntries()).concat(
        (vendor.sinister || opts.vendor === 'surplus') ? [] : allMaterialDefs().flatMap(m => Array.from({ length: STATE.materials[m.id] || 0 }, () => ({
          id: m.id, name: (m.name || m.id).toUpperCase(), icon: 'sprites/cargo/materials/' + m.id + '.png', desc: m.description || '', tags: [], material: true,
        })))),
      // Capacity gate BEFORE any cost applies — a refused buy must
      // leave gold untouched (shared.js MarketModal optional hook).
      canAddCargo: ware => cargoFits(ware.id, ware.cost && ware.cost.item),
      cargoFullMsg: 'No room in the hold. Jettison something (the crate icon) first.',
      addCargo: entry => { grantItem(entry.id); renderHUD(); },
      // The cargo bay can't leave while the hold needs its extra slots.
      canRemoveCargo: sid => allMaterialDefs().some(m => m.id === sid) || canRemoveItem(sid),
      cargoLockedMsg: 'The cargo bay is holding things. Clear some space first.',
      // Cargo an event ahead needs (inventory.js invRequiredFor) asks
      // first, like the cargo hold's SELL and JETTISON.
      confirmRemoval: (entry, offer, proceed) => askSellRequired(entry, proceed),
      removeCargo: (sid, entry) => {
        if (allMaterialDefs().some(m => m.id === sid)) {
          STATE.materials[sid] = Math.max(0, (STATE.materials[sid] || 0) - 1);
          renderHUD(); return;
        }
        // A rolled-value copy leaves with its own value (the one just paid for).
        if (entry && entry.copy != null) { takeItemCopy(sid, entry.copy); renderHUD(); return; }
        const loss = invCapLoss(sid, 1); // the last capacity upgrade's headroom (renderHUD trims it)
        const i = STATE.items.indexOf(sid);
        if (i >= 0) STATE.items.splice(i, 1);
        if (entry && entry.crafted) noteCraftedSold(sid); // a print sold at its materials' value
        renderHUD();
        if (loss.length) window.pushCruiseLog('◆ Sold the ' + ((defBy(sid) || {}).name || sid) + '. The extra ' + invCapLossText(loss) + ' went with it.');
      },
      onClose: () => {
        closeSellConfirm();
        const log = $('market-log');
        if (log) { log.innerHTML = ''; log.classList.add('hidden'); }
        hideOverlay('overlay-market');
        if (vendor.sinister && STATE.currentEvent && STATE.currentEvent.layers) {
          // Sinister close (demo): navigate back to the scenario entry with
          // the event's own speaker restored (nulling it blanked the
          // intro's and later outcomes' speaker names). npcCache keeps
          // the same face.
          STATE.layerStack = [STATE.currentEvent.entryLayer || Object.keys(STATE.currentEvent.layers)[0]];
          STATE.npcCtx = (STATE.currentEvent.npc) ? resolveNpc(STATE.currentEvent) : null;
        }
        if (typeof onClose === 'function') onClose();
      }
    });
  }

  // Escape closes the market when open. Capture phase so we run
  // before the pause menu's Escape handler claims it (demo parity).
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && typeof MarketModal !== 'undefined' && MarketModal.isOpen()) {
      e.stopPropagation();
      // An open sell confirm takes the Escape (its CANCEL), not the market.
      const c = $('market-confirm');
      if (c && !c.classList.contains('hidden')) { closeSellConfirm(); return; }
      MarketModal.close();
    }
  }, true);

  Object.assign(window, {
    // engine API
    stationBuyPrice, stationBuyPriceNext, craftedPrice, craftedHeld, fenceBuyPrice, stationSellOne, openMarket,
  });
})();

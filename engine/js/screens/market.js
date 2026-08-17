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
     demo outpost_trader convention (18→12, 22→15, 6→4).
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
  const iconOf = sid => ICON_FALLBACK[sid] || ('sprites/cargo/items/' + sid + '.png');

  // Demo sell-price convention: vendors pay ~2/3 of asking price.
  const sellPrice = bp => Math.max(1, Math.round(bp * 2 / 3));

  function allItemDefs() {
    return (typeof MOD !== 'undefined' && MOD.items) ? MOD.items : [];
  }
  function defBy(sid) {
    return (typeof itemDef === 'function') ? itemDef(sid) : null;
  }

  // ── Vendor builders — demo VENDORS structure fed by items.json ──
  function stationVendor() {
    const wares = allItemDefs()
      .filter(d => d.item_source === 'purchasable' && d.active !== false &&
                   Number.isFinite(d.base_price) && d.base_price > 0)
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
    // Negotiation (diplomat active skill, crew.js): the armed flag buys
    // 15% off this station market's wares, then it's spent — the skill's
    // authored "talk stations into better deals" line, made mechanical.
    let negotiated = false;
    if (typeof STATE !== 'undefined' && STATE.flags && STATE.flags.has('negotiation_prepared')) {
      STATE.flags.delete('negotiation_prepared');
      negotiated = true;
      for (const w of wares) {
        if (w.cost && w.cost.gold) w.cost.gold = Math.max(1, Math.round(w.cost.gold * 0.85));
      }
    }
    return {
      name: 'OUTPOST TRADER',
      greeting: negotiated
        ? "Your diplomat already talked my ear off. Fine. Fifteen percent. Don't tell the other captains."
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
    // Demo black_market ware slots (45/60/35g) refilled with real
    // loot_only ids — off-manifest gear no honest shop shelves.
    const stock = [['drive_coil', 60], ['o2_recycler', 45], ['classified_cargo', 35]];
    const wares = [];
    for (const [sid, gold] of stock) {
      const d = defBy(sid);
      if (!d) continue; // defensive: never invent an id items.json lacks
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
      // black_market tag, which no real item carries).
      wantedTags: ['trade_good'],
      fencePrices: { pre_collapse_artifact: 40, unidentified_bone: 30, sealed_vinyl: 25 },
      defaultFenceValue: 20,
      flavor: {
        buy:  ["No receipt.", "Yours. We never spoke.", "Keep it away from port authority scanners."],
        deny: ["Gold. Real gold. Not scrip.", "Come back when you're not short."],
        no_buyback: ["I don't move that here.", "Wrong market entirely."],
        fence: ["Well, well. Where'd you get this?", "I've been looking for exactly that.", "This never happened. Pleasure doing business."]
      }
    };
  }

  // STATE.items (short-id strings) → MarketModal cargo entries.
  function cargoEntry(sid) {
    const d = defBy(sid);
    return {
      id: sid,
      name: ((d && d.name) || sid.replace(/_/g, ' ')).toUpperCase(),
      icon: iconOf(sid),
      desc: (d && d.description) || '',
      tags: (d && d.tags) || []
    };
  }

  // Trial-fit: would one more of `sid` fit the hold? Mirrors
  // grantItem's own check without committing (push → measure → pop).
  function cargoFits(sid) {
    if (sid === 'insulated_cargo_bay') return true; // grantItem's own paradox guard
    STATE.items.push(sid);
    const fits = cargoSlotsUsed() <= cargoCapacity();
    STATE.items.pop();
    return fits;
  }

  window.openMarket = function(opts, onClose) {
    opts = opts || {};
    if (typeof MarketModal === 'undefined') {
      console.warn('[market] MarketModal missing — shared.js not loaded?');
      if (typeof onClose === 'function') onClose();
      return;
    }
    if (MarketModal.isOpen()) return;
    const vendor = opts.sinister ? blackMarketVendor() : stationVendor();

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
      getCargo: () => STATE.items.map(cargoEntry),
      // Capacity gate BEFORE any cost applies — a refused buy must
      // leave gold untouched (shared.js MarketModal optional hook).
      canAddCargo: ware => cargoFits(ware.id),
      cargoFullMsg: 'No room in the hold. Jettison something (INV) first.',
      addCargo: entry => { grantItem(entry.id); renderHUD(); },
      removeCargo: sid => {
        const i = STATE.items.indexOf(sid);
        if (i >= 0) STATE.items.splice(i, 1);
        renderHUD();
      },
      onClose: () => {
        const log = $('market-log');
        if (log) { log.innerHTML = ''; log.classList.add('hidden'); }
        hideOverlay('overlay-market');
        if (vendor.sinister && STATE.currentEvent && STATE.currentEvent.layers) {
          // Sinister close (demo): navigate back to the scenario entry
          // and clear the npc slot so the intro renders without an NPC
          // visible. npcCache stays — re-approaching meets the same face.
          STATE.layerStack = [STATE.currentEvent.entryLayer || Object.keys(STATE.currentEvent.layers)[0]];
          STATE.npcCtx = null;
        }
        if (typeof onClose === 'function') onClose();
      }
    });
  };

  // Escape closes the market when open. Capture phase so we run
  // before the pause menu's Escape handler claims it (demo parity).
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && typeof MarketModal !== 'undefined' && MarketModal.isOpen()) {
      e.stopPropagation();
      MarketModal.close();
    }
  }, true);
})();

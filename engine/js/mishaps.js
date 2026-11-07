/* ────────────────────────────────────────────────────────────────
   MISHAPS (ruling 142; the hull half is ruling 143)
   Things that happen to the ship on a travel leg that nobody chose: a
   pinhole breach plugged with gum, fuel spilled in a corridor, the
   captain down a ladder. travelTo() rolls one per leg (never the leg into
   the destination) after the leg's days have passed; its effects land at
   once, the Ship's Log records it in red, and the cruise screen stops on
   a popup the player must acknowledge before the stop's arrival plays.
   Saved with the effects already applied (STATE.pendingMishap +
   STATE.pendingArrival): a reload shows the same popup and applies
   nothing twice.

   Content and every number: modules/mishaps/mishaps.json (odds per trail,
   route progress, pace and hull band; severity weights per trail; cost
   scale per trail). Automated browsers get none unless they ask
   (?mishaps=1 or window.TP_MISHAPS = true): the regression batteries fly
   legs and expect the stop's arrival, the sims and the soak opt in.

   Load-order note: loads before index.html's inline script; reads MOD /
   STATE and the engine's helpers only inside functions called later.
   ──────────────────────────────────────────────────────────────── */
(function () {
  const $ = id => document.getElementById(id);
  const TIERS = ['minor', 'moderate', 'severe'];

  function enabled() {
    const q = new URLSearchParams(location.search).get('mishaps');
    if (q === '1' || q === 'on') return true;
    if (q === '0' || q === 'off') return false;
    if (window.TP_MISHAPS != null) return !!window.TP_MISHAPS;
    return !navigator.webdriver;
  }
  const data = () => (MOD.mishaps || {});
  const odds = () => data().odds || {};
  const trailKey = () => STATE.trail || 'lunar';

  // The hull band the ship is in now (the lowest `below` it is under).
  function hullBand() {
    const bands = (odds().hull_bands || []).slice().sort((a, b) => a.below - b.below);
    return bands.find(b => STATE.resources.hull < b.below) || null;
  }

  // The chance of a mishap on this leg.
  function legChance() {
    const o = odds();
    let p = (o.per_leg || {})[trailKey()] || 0;
    p *= 1 + (o.late_mult || 0) * Math.min(1, journeyFrac());
    p *= (o.pace_mult || {})[ordersPace().id] || 1;
    const band = hullBand();
    if (band) p *= band.odds_mult || 1;
    return Math.min(Number.isFinite(o.max_per_leg) ? o.max_per_leg : 0.95, p);
  }

  function eligible(m) {
    if (m.requires_crew_aboard && !STATE.crew.length) return false;
    if (m.trail && !m.trail.includes(trailKey())) return false;
    const tierHurtsCrew = TIERS.some(t => m[t] && m[t].hurt && m[t].hurt.who === 'crew');
    if (tierHurtsCrew && !STATE.crew.length) return false;
    if (m.kind === 'crop' && !(STATE.cropGrowth && STATE.cropGrowth.health > 0)) return false;
    return true;
  }
  function weighted(list, w) {
    const tot = list.reduce((s, x) => s + w(x), 0);
    if (!(tot > 0)) return null;
    let u = Math.random() * tot;
    for (const x of list) { u -= w(x); if (u <= 0) return x; }
    return list[list.length - 1];
  }
  function pickTier(m) {
    const o = odds();
    const base = (o.severity || {})[trailKey()] || { minor: 60, moderate: 30, severe: 10 };
    const band = hullBand();
    const sevMult = (1 + (o.late_severe_mult || 0) * Math.min(1, journeyFrac())) * (m.kind === 'hull' && band ? (band.severe_mult || 1) : 1);
    const tiers = TIERS.filter(t => m[t]);
    return weighted(tiers, t => (base[t] || 0) * (t === 'severe' ? sevMult : 1));
  }

  // A tier's fix comes through when its role is aboard: a crew specialist
  // always, a captain of that background or a wounded specialist half the
  // time (the one passive rule, specialistMult).
  function fixLands(fix) {
    if (!fix || !fix.role) return false;
    const m = specialistMult(fix.role);
    return m > 0 && Math.random() < m;
  }

  function scaledCost(k, v) {
    if (!(v < 0) || k === 'gold') return v;
    const mult = (odds().cost_mult || {})[trailKey()] || 1;
    return -Math.max(1, Math.round(-v * mult));
  }

  /* Rolls this leg's mishap and applies it. Returns the popup's view (also
     STATE.pendingMishap's shape) or null. */
  function rollMishap(node) {
    if (!enabled() || !MOD.mishaps || STATE.ended) return null;
    const legs = STATE.visited ? STATE.visited.size : 0;
    const cd = odds().cooldown_legs || 0;
    if (Number.isFinite(STATE.mishapLastLeg) && legs - STATE.mishapLastLeg <= cd) return null;
    if (Math.random() >= legChance()) return null;
    const band = hullBand();
    const kindMult = (band && band.kind_mult) || {};
    const pool = (data().mishaps || []).filter(eligible);
    const m = weighted(pool, x => (x.weight || 1) * (kindMult[x.kind] || 1));
    if (!m) return null;
    const tier = pickTier(m);
    if (!tier) return null;
    let t = m[tier];
    let fixedBy = null;
    if (t.fixed && fixLands(t.fixed)) { fixedBy = t.fixed.role; t = Object.assign({}, t, t.fixed); }
    STATE.mishapLastLeg = legs;
    STATE.mishapCount = (STATE.mishapCount || 0) + 1;
    const view = applyTier(m, tier, t, fixedBy);
    return view;
  }

  function applyTier(m, tier, t, fixedBy) {
    const r = STATE.resources;
    const effects = [];
    const hull0 = r.hull;
    for (const [k, v0] of Object.entries(t.resources || {})) {
      const v = scaledCost(k, v0);
      if (k === 'gold') {
        const before = STATE.goldAmount;
        STATE.goldAmount = Math.max(0, before + v);
        if (STATE.goldAmount !== before) effects.push({ k: 'GOLD', d: STATE.goldAmount - before });
        continue;
      }
      if (!(k in r)) continue;
      const before = r[k];
      r[k] = clamp(Math.round((before + v) * 100) / 100, 0, resMax(k));
      const d = Math.round(r[k] - before);
      if (d) effects.push({ k: k === 'o2' ? 'O2' : k.toUpperCase(), d });
    }
    if (r.hull < hull0) applyHullConcern(hull0 - r.hull);
    if (Number.isFinite(t.crop_health) && t.crop_health && STATE.cropGrowth && STATE.cropGrowth.health > 0) {
      const h0 = STATE.cropGrowth.health;
      STATE.cropGrowth.health = clamp(h0 + t.crop_health, 1, 100);
      const d = Math.round(STATE.cropGrowth.health - h0);
      if (d) { noteCropSwing(STATE.cropGrowth.health - h0); effects.push({ k: 'CROP', d }); }
    }
    // Someone hurt: the captain, one of the crew, or anyone aboard.
    let who = null;
    if (t.hurt) {
      const people = peopleAboard();
      who = t.hurt.who === 'captain' ? (people.includes('captain') ? 'captain' : null)
        : t.hurt.who === 'crew' ? (STATE.crew.length ? STATE.crew[Math.floor(Math.random() * STATE.crew.length)] : null)
        : people[Math.floor(Math.random() * people.length)] || null;
      if (who) {
        const hp0 = hpOf(who);
        if (t.hurt.severity) applySeverity(who, t.hurt.severity);
        else { damageCrew(who, t.hurt.hp || 0); if (peopleAboard().includes(who)) applyInjuryConcern(who); }
        const lost = hp0 - (peopleAboard().includes(who) ? hpOf(who) : 0);
        if (lost > 0) effects.push({ k: (who === 'captain' ? 'CAPTAIN' : String(crewNameOf(who)).toUpperCase()) + ' HP', d: -lost });
        if (t.hurt.severity === 'delayed' && peopleAboard().includes(who)) effects.push({ k: 'WOUND FESTERING', d: null });
      }
    }
    let text = String(t.text || '');
    if (who) {
      const nm = who === 'captain' ? 'you' : crewNameOf(who);
      text = text.replace(/\{Who\}/g, who === 'captain' ? 'You' : nm).replace(/\{who\}/g, nm);
    }
    text = interpolateStowawayTokens(text);
    const view = { id: m.id, title: m.title, tier, text, effects, fixedBy: fixedBy ? (fixedBy === STATE.captain && !STATE.crew.includes(fixedBy) ? 'captain' : fixedBy) : null, day: STATE.daysElapsed };
    // The Ship's Log keeps it in red (type 'mishap'), with what it cost.
    window.pushCruiseLog({ text: '⚠ ' + m.title + ' — ' + text + (effects.length ? ' ' + effectLine(effects) + '.' : ''), type: 'mishap' }, { instant: true });
    return view;
  }

  function effectLine(effects) {
    return effects.map(e => e.d == null ? e.k : (e.d > 0 ? '+' : '−') + Math.abs(e.d) + ' ' + e.k).join(' · ');
  }

  // ── The popup ─────────────────────────────────────────────────
  // The cruise stops on it: an .overlay (time holds while one is open),
  // body.modal-open (the pause key and the number keys stand down), one
  // button. It must be acknowledged — no ✕, no ESC.
  function showMishap() {
    const v = STATE.pendingMishap;
    if (!v) return;
    let ov = $('overlay-mishap');
    if (!ov) return;
    const sev = { minor: 'MINOR', moderate: 'MODERATE', severe: 'SEVERE' }[v.tier] || '';
    ov.innerHTML =
      '<div class="mishap-card mishap-' + escapeHTML(v.tier) + '" role="alertdialog" aria-modal="true" aria-labelledby="mishap-title" aria-describedby="mishap-text">' +
        '<div class="mishap-head"><span class="mishap-led"></span>SHIPBOARD INCIDENT · DAY ' + escapeHTML(v.day) + '<span class="mishap-sev">' + sev + '</span></div>' +
        '<h2 id="mishap-title" class="mishap-title">⚠ ' + escapeHTML(v.title) + '</h2>' +
        '<p id="mishap-text" class="mishap-text">' + escapeHTML(v.text) + '</p>' +
        (v.effects && v.effects.length ? '<div class="mishap-effects">' + v.effects.map(e => '<span class="mishap-fx' + (e.d > 0 ? ' good' : '') + '">' + escapeHTML(e.d == null ? e.k : (e.d > 0 ? '+' : '−') + Math.abs(e.d) + ' ' + e.k) + '</span>').join('') + '</div>'
          : '<div class="mishap-effects"><span class="mishap-fx none">NO HARM DONE</span></div>') +
        (v.fixedBy ? '<p class="mishap-fixed">' + escapeHTML((v.fixedBy === 'captain' ? 'You' : crewNameOf(v.fixedBy)) + ' kept it from being worse.') + '</p>' : '') +
        '<button type="button" class="pause-btn mishap-ack" id="mishap-ack">ACKNOWLEDGED</button>' +
      '</div>';
    // The leg's days have passed under the popup: the header says so.
    const dc = $('day-counter');
    if (dc) { const left = STATE.baseDays - STATE.daysElapsed; dc.textContent = 'DAY ' + STATE.daysElapsed + ' · ' + (left >= 0 ? left + ' LEFT' : -left + ' LATE'); }
    renderHUD();
    ov.classList.add('active');
    document.body.classList.add('modal-open');
    $('mishap-ack').addEventListener('click', ackMishap, { once: true });
    setTimeout(() => { const b = $('mishap-ack'); if (b) b.focus({ preventScroll: true }); }, 50);
  }

  // Acknowledged: the leg's arrival plays (or the failure the mishap
  // caused). The same path a reload's popup takes.
  function ackMishap() {
    const ov = $('overlay-mishap');
    if (ov) { ov.classList.remove('active'); ov.innerHTML = ''; }
    document.body.classList.remove('modal-open');
    if (!STATE.pendingMishap) return;
    STATE.pendingMishap = null;
    const pa = STATE.pendingArrival;
    const node = pa && STATE.byId[pa.id];
    renderHUD();
    if (!node) { STATE.pendingArrival = null; renderCruise(); return; }
    if (checkFailure({ arriving: connectionsOf(node).length === 0 })) return;
    STATE.pendingArrival = null;
    arriveAtNode(node, { skipEvent: pa.skipEvent });
  }
  // pause → LOAD / a new game: the replaced run's popup goes with it.
  function abortMishap() {
    const ov = $('overlay-mishap');
    if (ov) { ov.classList.remove('active'); ov.innerHTML = ''; }
  }

  Object.assign(window, { rollMishap, showMishap, ackMishap, abortMishap, mishapsEnabled: enabled, mishapLegChance: legChance });
})();

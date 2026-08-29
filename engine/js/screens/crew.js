'use strict';
/* ────────────────────────────────────────────────────────────────
   CREW DETAIL DOSSIER — engine port (Restoration item 4), from
   resources/demo-crew.html. Entry: window.openCrewDetail(role) —
   role is a STATE.crew role string, or 'captain' for the captain's
   (reduced) dossier. Opened by clicking a cruise crew-strip slot.

   Data authority: modules/crew/crew_roster.json drives everything a
   crew card shows — bio, passive_skill.description, active_skill
   {name, description, uses_per_leg, recharges_at, effect}. The
   demo's presentation-only fields map as:
   • passive card NAME — demo's invented names, kept as a per-role
     display table (roster passives have effect ids, not names).
   • hint line — roster narrative_unlocks[0] (authored, per-crew).
   • cost tag — derived from active_skill.effect resource fields.
   • captain — no roster entry (backgrounds live in setup.js's
     wizard config); reduced card: passive = background bonus,
     no active card, no dismiss (the captain is the player).

   Charges: STATE.crewSkillCharges {role: usesRemaining} — seeded in
   applySetupToState/initState, lazily via ensureCrewSkillCharges()
   for legacy saves, decremented here on USE, restored by travelTo()
   on station arrival per each skill's authored recharges_at.

   Load-order rule: loads BEFORE index.html's main inline script —
   no top-level MOD/STATE reads; everything resolves at call time.
   ──────────────────────────────────────────────────────────────── */
(function() {
  const $ = id => document.getElementById(id);

  const CD_ROLE_TO_CREWID = { botanist: 'osei', engineer: 'kazuki', medic: 'vasquez', pilot: 'reeves', chef: 'reyes', xenobiologist: 'tanaka', diplomat: 'hargrove' };
  const CD_ROLE_EMOJI = { botanist: '🌱', engineer: '🔧', medic: '🩺', pilot: '🛸', chef: '🍳', diplomat: '🤝', xenobiologist: '🔬', captain: '🧑‍✈️' };

  // Demo's passive display names (roster passives carry effect ids,
  // not player-facing names — presentation stays demo-canon).
  const PASSIVE_NAME = {
    botanist: 'Crop Care', engineer: 'Mechanical Instinct', medic: 'Bedside Manner',
    pilot: 'Fuel Discipline', chef: 'Pantry Logic', diplomat: 'Strategic Patience',
    xenobiologist: 'Field Identification',
  };

  // Captain backgrounds — copied from setup.js's wizard config (the
  // only place backgrounds are authored; no MOD.captains module).
  const CAPTAIN_BG = {
    botanist:      { name: 'Botanist',      stat: 'Crop care +7%',       desc: 'You know plants. Not as well as Dr. Osei, but enough.', flavor: 'Your parents asked what you\'d do with that degree. This.' },
    engineer:      { name: 'Engineer',      stat: 'Fab wear -10%',       desc: 'You can fix things. Not as fast as Kazuki.', flavor: 'The ship makes sounds it shouldn\'t. You recognize most of them.' },
    medic:         { name: 'Medic',         stat: '15% lethal→injury',   desc: 'You passed the exam. You are not a doctor.', flavor: 'The residency was... there were circumstances.' },
    pilot:         { name: 'Pilot',         stat: 'Fuel -5%',            desc: 'You can fly. Slightly better than expected.', flavor: 'You are statistically correct 68% of the time.' },
    chef:          { name: 'Chef',          stat: 'Food -7%',            desc: 'You can make algae taste like something other than regret.', flavor: 'You know 47 ways to prepare algae. Forty-six are bad.' },
    xenobiologist: { name: 'Xenobiologist', stat: 'Anomaly safer',       desc: 'You studied aliens. You have never met one.', flavor: 'Your thesis was theoretical. Everything is about to become very applied.' },
    diplomat:      { name: 'Diplomat',      stat: 'Credits +15',         desc: 'Very good at making people feel heard while doing nothing.', flavor: 'Your crew does not find this reassuring.' },
    merchant:      { name: 'Merchant',      stat: 'Prices -10%',         desc: 'You ran a business.', flavor: 'You are going to run this mission like a business.' },
    academic:      { name: 'Academic',      stat: 'Research options',    desc: 'You have a PhD. In what is not immediately relevant.', flavor: 'Your grant funding was cut. You are in space. These events are related.' },
    veteran:       { name: 'Veteran',       stat: 'Combat screen-clear', desc: 'You served. Where is classified.', flavor: 'You don\'t talk about it.' },
  };

  // AI quips — demo's per-crew pool, voiced by whichever AI is active.
  const CD_QUIPS = {
    botanist: [
      'She reorganized the seed vault. I am not to touch it.',
      'Dr. Osei calls the plants by their full taxonomic names. It seems mutual.'],
    engineer: [
      'Kazuki fixed the thing. Kazuki made the thing. We are ahead.',
      'He has not explained the second sandwich. I have stopped asking.'],
    medic: [
      'Dr. Vasquez is calm in emergencies. I find this upsetting, in a good way.',
      'Their hands do not shake. Everything else does.'],
    pilot: [
      'Reeves is confident. Reeves is, on balance, correct.',
      'He has a story about this. Please do not encourage it.'],
    chef: [
      'Reyes cooked. The crew is civil again.',
      'The spice budget for one meal exceeded the monthly allowance.'],
    diplomat: [
      'Hargrove waits. Hargrove has been waiting. It is his job.',
      'Two factions met. One of them left smiling.'],
    xenobiologist: [
      'Dr. Tanaka logged a new species. We are not at a destination yet.',
      'She identified the ship. It is, apparently, habitat.'],
    captain: [
      'The captain is certain. This is correlated with outcomes only sometimes.',
      'A plan was announced. The crew applauded. The plan was optimistic.'],
  };

  // Safe-dismiss line pool (safe dropoff — no flavor pool exists for
  // non-lethal departures; the crew_epitaphs pool is deaths only).
  const DISMISS_LINES = [
    '[Name] steps off at the dock with one bag and no speech. The airlock closes politely.',
    '[Name] has been released from the manifest. The manifest recovers quickly. The crew, less so.',
    '[Name] is now somebody else\'s specialist. The bunk is already suspiciously tidy.',
  ];

  // Monitored statuses — demo's canonical list. The engine currently
  // promotes wounded (crew HP) and morale_crisis (ship morale); the
  // rest render as dim monitored stubs until their systems land.
  const MONITORED_STATUSES = [
    { id: 'wounded',            name: 'Wounded',            kind: 'critical', effect: 'Active skill disabled · passive halved' },
    { id: 'sick',               name: 'Sick',               kind: 'negative', effect: '−10% strength regen · morale −1/day' },
    { id: 'infected',           name: 'Infected',           kind: 'critical', effect: 'Contagious · spreads without a Medic' },
    { id: 'exhausted',          name: 'Exhausted',          kind: 'negative', effect: 'Strength actions cost double' },
    { id: 'morale_crisis',      name: 'Morale crisis',      kind: 'critical', effect: 'Unstable · event rolls trend bad' },
    { id: 'traumatized',        name: 'Traumatized',        kind: 'negative', effect: 'Morale cap ≤ 60 until processed' },
    { id: 'malnourished',       name: 'Malnourished',       kind: 'negative', effect: 'HP regen halted · morale −1/day' },
    { id: 'dehydrated',         name: 'Dehydrated',         kind: 'negative', effect: 'Strength −10/day · HP at risk' },
    { id: 'radiation_exposure', name: 'Radiation exposure', kind: 'critical', effect: 'Accumulating damage · see Medic' },
    { id: 'pending_crisis',     name: 'Pending crisis',     kind: 'critical', effect: 'Untreated by next station → follow-up event' },
  ];

  // HEALTH-driven glow stops — growbay's HEALTH_STOPS (demo copy).
  const GLOW_STOPS = [
    { p: 0,   c: [204, 51,  51 ] },
    { p: 25,  c: [224, 120, 52 ] },
    { p: 50,  c: [216, 192, 68 ] },
    { p: 75,  c: [133, 210, 96 ] },
    { p: 100, c: [56,  138, 74 ] },
  ];
  function glowRGB(pct) {
    pct = Math.max(0, Math.min(100, pct));
    for (let i = 0; i < GLOW_STOPS.length - 1; i++) {
      const a = GLOW_STOPS[i], b = GLOW_STOPS[i + 1];
      if (pct <= b.p) {
        const t = (pct - a.p) / (b.p - a.p);
        return [0, 1, 2].map(j => Math.round(a.c[j] + (b.c[j] - a.c[j]) * t));
      }
    }
    return GLOW_STOPS[GLOW_STOPS.length - 1].c.slice();
  }

  const AI_SPRITE = { aria: 'sprites/interface/AI/aria.png', marv: 'sprites/interface/AI/marv.png', rex: 'sprites/interface/AI/rex.png', chip: 'sprites/interface/AI/chip.png', ajoy: 'sprites/interface/AI/ajoy.png' };

  let mounted = false;
  let cur = null;             // current member: role string or 'captain'
  let pendingEpitaph = null;  // {role} while the epitaph overlay is up
  let departing = false;      // animation in flight — block interaction

  function rosterOf(role) {
    return ((typeof MOD !== 'undefined' && MOD.crew_roster) || []).find(c => c.role === role) || null;
  }
  function memberList() {
    const l = [];
    if (STATE.captain) l.push('captain');
    for (const r of STATE.crew) l.push(r);
    return l;
  }
  function isOpen() {
    const ov = $('overlay-crew');
    return !!(ov && ov.classList.contains('active'));
  }

  // Safe dropoff — demo's station / allied_ship / habitable_world maps
  // onto engine node types: station + planet (habitable orbit). All
  // other node types (asteroid_field, derelict, nebula, void, anomaly,
  // fork, deep space) have no safe exit — the airlock does.
  function canDismissSafely() {
    const node = STATE.byId && STATE.byId[STATE.currentId];
    return !!node && (node.node_type === 'station' || node.node_type === 'planet');
  }

  // ── Mount (once) ───────────────────────────────────────────────
  function mount() {
    if (mounted) return;
    mounted = true;
    $('crewdetail-root').innerHTML =
      '<div id="cd-backdrop"></div>' +
      '<div id="cd-modal">' +
        '<div class="cd-header">' +
          '<span class="cd-title">CREW</span>' +
          '<div class="cd-subtitle"><span class="crew-name-banner" id="cd-name-banner"></span><span class="dot"> · </span><span id="cd-role-banner"></span></div>' +
          '<button class="cd-close" id="cd-close-btn">X</button>' +
        '</div>' +
        '<div class="cd-body">' +
          '<div class="cd-top">' +
            '<div class="cd-portrait-box">' +
              '<div class="cd-glow" id="cd-glow"></div>' +
              '<div class="cd-portrait fallback" id="cd-portrait">👤</div>' +
              '<div class="cd-spark-field" id="cd-spark-field"></div>' +
              '<button class="cd-nav prev" id="cd-nav-prev" aria-label="Previous crew">&#9664;</button>' +
              '<button class="cd-nav next" id="cd-nav-next" aria-label="Next crew">&#9654;</button>' +
            '</div>' +
            '<div class="cd-ident">' +
              '<div class="cd-name" id="cd-name"></div>' +
              '<div class="cd-role"><span id="cd-role-text"></span><span class="dot"> · </span><span class="bg-tag" id="cd-bg-tag"></span></div>' +
              '<div class="cd-divider"></div>' +
              '<div class="cd-stats">' +
                '<div class="cd-stat-row hp"><span class="cd-stat-label">HEALTH</span><div class="cd-stat-track"><div class="cd-stat-fill" id="cd-stat-hp-fill"></div></div><span class="cd-stat-value" id="cd-stat-hp-val"></span></div>' +
                '<div class="cd-stat-row mo"><span class="cd-stat-label">MORALE</span><div class="cd-stat-track"><div class="cd-stat-fill" id="cd-stat-mo-fill"></div></div><span class="cd-stat-value" id="cd-stat-mo-val"></span></div>' +
              '</div>' +
              '<div class="cd-divider"></div>' +
              '<div class="cd-bio" id="cd-bio"></div>' +
            '</div>' +
          '</div>' +
          '<div class="cd-status">' +
            '<div class="cd-status-col"><div class="cd-status-title">STATUS EFFECTS</div><div class="cd-status-active" id="cd-status-active"></div></div>' +
            '<div class="cd-status-col-divider"></div>' +
            '<div class="cd-status-col"><div class="cd-status-title">MONITORED</div><div id="cd-status-monitored"></div></div>' +
          '</div>' +
          '<div class="cd-skills">' +
            '<div class="cd-skill-card" id="cd-passive-card">' +
              '<div class="cd-skill-title"><span class="kind">PASSIVE</span><span>ALWAYS ON</span></div>' +
              '<div class="cd-skill-name" id="cd-passive-name"></div>' +
              '<div class="cd-skill-desc" id="cd-passive-desc"></div>' +
              '<div class="cd-skill-meta"><span class="warn hidden" id="cd-passive-warn">Injury: effect halved.</span></div>' +
            '</div>' +
            '<div class="cd-skill-card cd-active-card" id="cd-active-card">' +
              '<div class="cd-skill-title"><span class="kind">ACTIVE</span><span id="cd-active-cost"></span></div>' +
              '<div class="cd-skill-name" id="cd-active-name"></div>' +
              '<div class="cd-skill-desc" id="cd-active-desc"></div>' +
              '<div class="cd-active-action"><span class="cd-active-uses" id="cd-active-uses"></span><button class="cd-active-btn" id="cd-active-btn">USE</button></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="cd-footer">' +
          '<button class="cd-dismiss-btn" id="cd-dismiss-btn">Dismiss Crew</button>' +
          '<div class="cd-aria"><span class="cd-aria-icon" id="cd-ai-icon"></span><span class="cd-aria-name" id="cd-ai-name"></span><span class="cd-aria-text" id="cd-ai-text"></span></div>' +
        '</div>' +
        '<div class="cd-epitaph" id="cd-epitaph">' +
          '<div class="cd-epitaph-rule">── — ──</div>' +
          '<div class="cd-epitaph-name" id="cd-epitaph-name"></div>' +
          '<div class="cd-epitaph-line" id="cd-epitaph-line"></div>' +
          '<div class="cd-epitaph-rule">── — ──</div>' +
          '<div class="cd-epitaph-hint">Click anywhere, or press Enter.</div>' +
        '</div>' +
      '</div>' +
      '<div id="cd-confirm-backdrop"></div>' +
      '<div id="cd-confirm">' +
        '<div class="cd-confirm-title" id="cd-confirm-title"></div>' +
        '<div class="cd-confirm-body" id="cd-confirm-body"></div>' +
        '<div class="cd-confirm-actions">' +
          '<button class="cd-confirm-btn" id="cd-confirm-cancel">Cancel</button>' +
          '<button class="cd-confirm-btn danger" id="cd-confirm-ok">Confirm</button>' +
        '</div>' +
      '</div>';

    $('cd-backdrop').addEventListener('click', closeCrewDetail);
    $('cd-close-btn').addEventListener('click', closeCrewDetail);
    $('cd-nav-prev').addEventListener('click', () => cycleCrew(-1));
    $('cd-nav-next').addEventListener('click', () => cycleCrew(1));
    $('cd-active-btn').addEventListener('click', useActive);
    $('cd-dismiss-btn').addEventListener('click', openConfirm);
    $('cd-confirm-cancel').addEventListener('click', closeConfirm);
    $('cd-confirm-backdrop').addEventListener('click', closeConfirm);
    $('cd-confirm-ok').addEventListener('click', confirmDismiss);
    $('cd-epitaph').addEventListener('click', closeEpitaph);
  }

  // ── Active-skill mapping — roster active_skill.effect → engine hook.
  // Each returns { ok, log } or { ok:false, refusal }. Effects that
  // change resources call renderHUD + checkFailure at the call site.
  const SKILL_EFFECTS = {
    // Greenhouse Protocol — effect {crop_health: 15} → STATE.cropGrowth.
    botanist() {
      const cg = STATE.cropGrowth;
      if (!STATE.crop || !cg) return { ok: false, refusal: 'No crop aboard to stabilize.' };
      if (cg.health <= 0) return { ok: false, refusal: 'The crop is past stabilizing. Dr. Osei declines to discuss it.' };
      if (cg.health >= 100) return { ok: false, refusal: 'The crop is at full health. Dr. Osei is quietly proud.' };
      cg.health = Math.min(100, cg.health + 15);
      return { ok: true, log: 'GREENHOUSE PROTOCOL — Dr. Osei stabilizes the crop (+15 health). The plants seem grateful, botanically speaking.' };
    },
    // Emergency Patch — effect {hull_damage_prevented: 1} → arms a run
    // flag consumed by applyOutcomeEffects' hull-damage branch.
    engineer() {
      if (STATE.flags.has('emergency_patch_armed')) return { ok: false, refusal: 'A patch is already in place. Kazuki sees no reason to waste another.' };
      STATE.flags.add('emergency_patch_armed');
      return { ok: true, log: 'EMERGENCY PATCH — Kazuki rigs a preemptive hull patch. The next hull damage event will be absorbed.' };
    },
    // Treatment — effect {heal_crew: 1} → restore the worst-injured
    // crew member to healthy (100 HP).
    medic() {
      let worst = null, worstHp = 100;
      for (const r of STATE.crew) {
        const hp = (typeof crewHPOf === 'function') ? crewHPOf(r) : 100;
        if (hp < worstHp) { worst = r; worstHp = hp; }
      }
      if (!worst || worstHp >= 100) return { ok: false, refusal: 'Nobody is injured. Dr. Vasquez remains anxious anyway.' };
      STATE.crewHP[worst] = 100;
      const name = (rosterOf(worst) || {}).name || worst;
      return { ok: true, log: 'TREATMENT — Dr. Vasquez patches up ' + name + ' (restored to full health). Do not ask about the residency.' };
    },
    // Push Engines — effect {skip_node: true, fuel_cost_multiplier: 2}.
    // Now that travel has a real per-leg fuel line item (Restoration
    // item 5's standing orders), "double fuel" means exactly that: the
    // skill pre-burns one extra leg's worth of fuel at the current pace
    // (travelTo() then charges the normal 1× on the flown leg — 2×
    // total, per the authored fuel_cost_multiplier). Only fires with
    // exactly one route forward that isn't the arrival node.
    pilot() {
      const nextIds = (typeof nextAvailableNodes === 'function') ? [...nextAvailableNodes()] : [];
      if (nextIds.length !== 1) return { ok: false, refusal: nextIds.length === 0 ? 'No route forward to push toward.' : 'The route forks ahead — pick a heading first.' };
      const next = STATE.byId[nextIds[0]];
      const isArrival = next && next.connects_to && (Array.isArray(next.connects_to) ? next.connects_to.length === 0 : Object.keys(next.connects_to).length === 0);
      if (isArrival) return { ok: false, refusal: 'That is the destination. Reeves refuses to skip the ending.' };
      const legFuel = (typeof window.legTravelCost === 'function') ? legTravelCost().fuel : 5;
      if (STATE.resources.fuel < legFuel * 2) return { ok: false, refusal: 'Not enough fuel to burn double. Reeves keeps the tally to himself.' };
      STATE.resources.fuel = Math.max(0, STATE.resources.fuel - legFuel);
      return { ok: true, log: 'PUSH ENGINES — Reeves burns double fuel for the leg (−' + (legFuel * 2) + ' total) and blows straight past ' + ((next && next.name) || 'the next stop') + '. Statistically correct, this time.', skipTo: nextIds[0] };
    },
    // Special Meal — effect {morale: 10, food_cost: 5}.
    chef() {
      if (STATE.resources.food < 5) return { ok: false, refusal: 'Not enough food for a special meal. Reyes takes this personally.' };
      STATE.resources.food = Math.max(0, STATE.resources.food - 5);
      STATE.resources.morale = Math.min(100, STATE.resources.morale + 10);
      return { ok: true, log: 'SPECIAL MEAL — Reyes cooks the good stuff (−5 food, +10 morale). The crew is civil again.' };
    },
    // Field Analysis — effect {reveal_biological_properties: true} →
    // reveals the authored gameplay_effect of one biological unknown
    // in cargo (the engine's item-knowledge surface is the log).
    xenobiologist() {
      const defs = (typeof MOD !== 'undefined' && MOD.items) || [];
      let hit = null;
      for (const sid of STATE.items) {
        const d = defs.find(x => { const s = x.id && x.id.replace(/^item_/, '').replace(/_\d+$/, ''); return s === sid; });
        if (d && (d.tags || []).some(t => ['biological', 'alien', 'unknown'].includes(t))) { hit = d; break; }
      }
      if (!hit) return { ok: false, refusal: 'Nothing biological or unknown in the hold. Dr. Tanaka is visibly disappointed.' };
      return { ok: true, log: 'FIELD ANALYSIS — Dr. Tanaka examines the ' + hit.name + ': ' + (hit.gameplay_effect || hit.description || 'inconclusive, which she finds thrilling.') };
    },
    // Negotiation — effect {unlock_peaceful_resolution: true}. Peaceful
    // encounter options are already presence-gated on the diplomat, so
    // the one-shot maps to the skill's OTHER authored line: "talk
    // stations into better deals" — arms a flag market.js consumes for
    // 15% off the next station market.
    diplomat() {
      if (STATE.flags.has('negotiation_prepared')) return { ok: false, refusal: 'Hargrove has already prepared the ground. Patience.' };
      STATE.flags.add('negotiation_prepared');
      return { ok: true, log: 'NEGOTIATION — Hargrove works the channels ahead. The next station market will see reason (−15% prices).' };
    },
  };

  const SKILL_COST_TAG = { chef: 'COST: 5 FOOD', pilot: 'COST: DOUBLE FUEL' };

  // ── Render ─────────────────────────────────────────────────────
  function memberData(key) {
    if (key === 'captain') {
      const bg = CAPTAIN_BG[STATE.captain] || { name: STATE.captain || 'Captain', stat: '', desc: '', flavor: '' };
      return {
        key, isCaptain: true, crewId: 'captain', emoji: CD_ROLE_EMOJI.captain,
        name: 'Captain', role: 'Captain', bgTag: bg.name,
        bio: bg.flavor || bg.desc, hint: 'If the captain background matches a crew role, specialist bonuses are halved.',
        passiveName: bg.name + ' Background', passiveDesc: (bg.stat ? bg.stat + ' — ' : '') + bg.desc,
        active: null,
      };
    }
    const r = rosterOf(key) || {};
    return {
      key, isCaptain: false, crewId: CD_ROLE_TO_CREWID[key], emoji: CD_ROLE_EMOJI[key] || '👤',
      name: r.name || key, role: key.charAt(0).toUpperCase() + key.slice(1), bgTag: 'Crew',
      bio: r.bio || '', hint: (r.narrative_unlocks && r.narrative_unlocks[0]) || '',
      passiveName: PASSIVE_NAME[key] || 'Passive',
      passiveDesc: (r.passive_skill && r.passive_skill.description) || '',
      active: r.active_skill || null,
    };
  }

  function computeStatuses(hp, mo) {
    const fired = new Set();
    const active = [];
    if (hp < 40) { fired.add('wounded'); active.push(MONITORED_STATUSES[0]); }
    if (mo < 25) { fired.add('morale_crisis'); active.push(MONITORED_STATUSES.find(s => s.id === 'morale_crisis')); }
    return { active, monitored: MONITORED_STATUSES.filter(s => !fired.has(s.id)) };
  }

  function loadPortrait(m) {
    const el = $('cd-portrait');
    el.classList.remove('anim-dismiss', 'anim-jettison');
    probeCrewSprite(m.crewId, ok => {
      if (ok) {
        el.classList.remove('fallback');
        el.textContent = '';
        applyCrewPortrait(el, m.crewId, 192, 192);
      } else {
        el.classList.add('fallback');
        el.querySelectorAll('.cd-portrait-sprite').forEach(n => n.remove());
        el.textContent = m.emoji;
      }
    });
  }

  function render() {
    const m = memberData(cur);
    const hp = m.isCaptain ? 100 : ((typeof crewHPOf === 'function') ? crewHPOf(m.key) : 100);
    const mo = STATE.resources.morale;

    $('cd-name-banner').textContent = m.name.toUpperCase();
    $('cd-role-banner').textContent = m.role.toUpperCase();
    $('cd-name').textContent = m.name.toUpperCase();
    $('cd-role-text').textContent = m.role;
    $('cd-bg-tag').textContent = m.bgTag;
    const bioEl = $('cd-bio');
    bioEl.textContent = m.bio;
    if (m.hint) {
      const hint = document.createElement('span');
      hint.className = 'hint';
      hint.textContent = m.hint;
      bioEl.appendChild(hint);
    }
    $('cd-modal').classList.toggle('captain-mode', m.isCaptain);

    loadPortrait(m);

    // Stats + HP-driven glow (bar fill tracks the same hue).
    $('cd-stat-hp-fill').style.width = hp + '%';
    $('cd-stat-hp-val').textContent = hp;
    $('cd-stat-mo-fill').style.width = mo + '%';
    $('cd-stat-mo-val').textContent = mo;
    const rgb = glowRGB(hp);
    $('overlay-crew').style.setProperty('--cdw-glow-color', rgb.join(','));
    $('cd-stat-hp-fill').style.background = 'rgb(' + rgb.join(',') + ')';

    // Status band
    const { active, monitored } = computeStatuses(hp, mo);
    const activeEl = $('cd-status-active');
    const monEl = $('cd-status-monitored');
    activeEl.innerHTML = '';
    monEl.innerHTML = '';
    if (!active.length) {
      const row = document.createElement('div');
      row.className = 'cd-status-row nominal';
      row.innerHTML = '<span class="s-name">No active effects. Nominal.</span>';
      activeEl.appendChild(row);
    } else {
      for (const s of active) {
        const row = document.createElement('div');
        row.className = 'cd-status-row ' + s.kind;
        row.innerHTML = '<span class="s-name">' + s.name + '</span><span class="s-eff">' + s.effect + '</span>';
        activeEl.appendChild(row);
      }
    }
    for (const s of monitored) {
      const row = document.createElement('div');
      row.className = 'cd-status-row stub';
      row.innerHTML = '<span class="s-name">· ' + s.name + '</span><span class="s-eff">—</span>';
      monEl.appendChild(row);
    }
    const isWounded = active.some(s => s.id === 'wounded');

    // Passive card
    $('cd-passive-name').textContent = m.passiveName.toUpperCase();
    $('cd-passive-desc').textContent = m.passiveDesc;
    $('cd-passive-card').title = m.passiveName + '\n\n' + m.passiveDesc + '\n\nAlways on. Halved if this crew is injured.';
    $('cd-passive-warn').classList.toggle('hidden', !isWounded);

    // Active card + charge state
    if (m.active) {
      if (typeof window.ensureCrewSkillCharges === 'function') ensureCrewSkillCharges();
      const max = m.active.uses_per_leg || 1;
      const uses = (STATE.crewSkillCharges && (m.key in STATE.crewSkillCharges)) ? STATE.crewSkillCharges[m.key] : max;
      const rechargeNote = (m.active.recharges_at === 'station') ? 'RECHARGES AT STATION' : 'RECHARGES EACH LEG';
      $('cd-active-name').textContent = (m.active.name || 'Active Skill').toUpperCase();
      $('cd-active-desc').textContent = m.active.description || '';
      $('cd-active-cost').textContent = SKILL_COST_TAG[m.key] || 'NO COST';
      $('cd-active-card').title = (m.active.name || '') + '\n\n' + (m.active.description || '') +
        '\nUses: ' + max + ' per leg · recharges at ' + (m.active.recharges_at || 'station') + '.' +
        (isWounded ? '\n\nDisabled while wounded.' : '');
      const btn = $('cd-active-btn');
      const usesEl = $('cd-active-uses');
      btn.classList.remove('locked');
      usesEl.classList.remove('exhausted', 'locked');
      if (isWounded) {
        btn.classList.add('locked');
        btn.textContent = 'UNAVAILABLE';
        usesEl.classList.add('locked');
        usesEl.innerHTML = 'Injured — skill disabled until treated.';
      } else if (uses <= 0) {
        btn.classList.add('locked');
        btn.textContent = 'USE · EXHAUSTED';
        usesEl.classList.add('exhausted');
        usesEl.innerHTML = '<strong>0</strong> / ' + max + ' USES · ' + rechargeNote;
      } else {
        btn.textContent = 'USE';
        usesEl.innerHTML = '<strong>' + uses + '</strong> / ' + max + ' USES · ' + rechargeNote;
      }
    }

    // Footer — active AI + per-crew quip; dismiss/jettison branch.
    const ai = STATE.activeAI || 'marv';
    $('cd-ai-icon').style.backgroundImage = "url('" + (AI_SPRITE[ai] || AI_SPRITE.marv) + "')";
    $('cd-ai-name').textContent = ai.toUpperCase() + ':';
    const quips = CD_QUIPS[m.isCaptain ? 'captain' : m.key] || CD_QUIPS.captain;
    setAiText(quips[Math.floor(Math.random() * quips.length)], false);
    const dBtn = $('cd-dismiss-btn');
    if (!m.isCaptain) {
      const safe = canDismissSafely();
      dBtn.textContent = safe ? 'Dismiss Crew' : 'Jettison Crew';
      dBtn.classList.toggle('jettison', !safe);
    }

    // Chevrons only make sense with 2+ members aboard.
    const many = memberList().length > 1;
    $('cd-nav-prev').style.display = many ? '' : 'none';
    $('cd-nav-next').style.display = many ? '' : 'none';
  }

  function setAiText(text, refusal) {
    const el = $('cd-ai-text');
    el.textContent = text;
    el.classList.toggle('refusal', !!refusal);
  }

  // ── Open / close / cycle ───────────────────────────────────────
  window.openCrewDetail = function(role) {
    mount();
    if (typeof window.ensureCrewSkillCharges === 'function') ensureCrewSkillCharges();
    const list = memberList();
    if (!list.length) return;
    cur = list.includes(role) ? role : list[0];
    pendingEpitaph = null;
    departing = false;
    $('cd-epitaph').classList.remove('visible');
    $('overlay-crew').classList.remove('confirm-open');
    showOverlay('overlay-crew');
    render();
  };

  function closeCrewDetail() {
    if (departing || pendingEpitaph) return; // finish the departure beat first
    $('overlay-crew').classList.remove('confirm-open');
    hideOverlay('overlay-crew');
  }

  function cycleCrew(delta) {
    if (departing) return;
    const list = memberList();
    if (!list.length) { closeCrewDetail(); return; }
    const i = list.indexOf(cur);
    cur = list[(((i < 0 ? 0 : i) + delta) % list.length + list.length) % list.length];
    render();
  }

  // ── USE ────────────────────────────────────────────────────────
  function useActive() {
    if (departing || cur === 'captain') return;
    const m = memberData(cur);
    if (!m.active) return;
    const hp = (typeof crewHPOf === 'function') ? crewHPOf(cur) : 100;
    if (hp < 40) return; // wounded — button is locked anyway
    if (typeof window.ensureCrewSkillCharges === 'function') ensureCrewSkillCharges();
    const uses = STATE.crewSkillCharges[cur] || 0;
    if (uses <= 0) return;
    const fx = SKILL_EFFECTS[cur];
    if (!fx) return;
    const res = fx();
    if (!res.ok) { setAiText(res.refusal, true); return; }
    STATE.crewSkillCharges[cur] = uses - 1;
    if (typeof window.pushCruiseLog === 'function') pushCruiseLog('◆ ' + res.log);
    if (typeof renderHUD === 'function') renderHUD();
    if (typeof checkFailure === 'function' && checkFailure()) return; // pilot fuel burn can empty the tank
    if (res.skipTo) {
      // Push Engines — leave the dossier and jump the node, no event.
      hideOverlay('overlay-crew');
      travelTo(res.skipTo, { skipEvent: true });
      return;
    }
    if (typeof window.renderCruise === 'function') renderCruise();
    render();
    setAiText(res.log, false);
  }

  // ── Dismiss / Jettison ─────────────────────────────────────────
  function openConfirm() {
    if (departing || cur === 'captain') return;
    const m = memberData(cur);
    if (canDismissSafely()) {
      $('cd-confirm-title').textContent = 'DISMISS CREW';
      $('cd-confirm-body').innerHTML = 'Dismiss <strong>' + m.name + '</strong> from the crew? ' +
        'They are not coming back.<br><br><em>Current stop allows a safe goodbye.</em>';
    } else {
      $('cd-confirm-title').textContent = 'JETTISON CREW';
      $('cd-confirm-body').innerHTML = 'No station. No friendly ship. Not even an obliging asteroid.<br><br>' +
        'The airlock, however, remains fully operational. <strong>' + m.name + '</strong> will not.<br><br>' +
        '<em>The universe files no objection. It rarely does.</em>';
    }
    $('overlay-crew').classList.add('confirm-open');
  }
  function closeConfirm() { $('overlay-crew').classList.remove('confirm-open'); }

  function spawnSparks(count, opts) {
    const field = $('cd-spark-field');
    if (!field) return;
    opts = opts || {};
    for (let i = 0; i < count; i++) {
      const s = document.createElement('span');
      s.className = 'cd-spark' + (opts.center ? ' center' : '');
      const sx = (Math.random() - 0.5) * (opts.center ? 200 : 140);
      const sy = opts.center ? (Math.random() - 0.35) * 180 : (-30 - Math.random() * 100);
      const sz = (opts.center ? 4 : 2) + Math.random() * (opts.center ? 10 : 6);
      const delay = Math.random() * (opts.center ? 180 : 220);
      s.style.setProperty('--sx', sx + 'px');
      s.style.setProperty('--sy', sy + 'px');
      s.style.setProperty('--sz', sz + 'px');
      s.style.animationDelay = delay + 'ms';
      if (opts.center) s.style.animationDuration = '1400ms';
      field.appendChild(s);
      setTimeout(() => s.remove(), (opts.center ? 1500 : 1100) + delay);
    }
  }

  /* Removes the member from the run — the actual mechanical event.
     Gate consequences (requires_crew choices, passive bonuses, crew-
     count failure) all key off STATE.crew, so the splice is the whole
     story; charges + HP entries go with them. */
  function removeCrew(role, jettisoned) {
    const idx = STATE.crew.indexOf(role);
    if (idx >= 0) STATE.crew.splice(idx, 1);
    if (STATE.crewHP) delete STATE.crewHP[role];
    if (STATE.crewSkillCharges) delete STATE.crewSkillCharges[role];
    const name = (rosterOf(role) || {}).name || role;
    let line;
    if (jettisoned) {
      STATE.flags.add('crew_lost');
      // An unsafe "dismissal" is explicitly an airlock death. Preserve
      // solo-by-choice at stations/planets, but route a last-person
      // jettison through the same crew_gone failure as killCrew().
      if (STATE.crew.length === 0) STATE.flags.add('all_crew_dead');
      const pool = (typeof MOD !== 'undefined' && MOD.flavor && MOD.flavor.crew_epitaphs) || [];
      line = pool.length ? pool[Math.floor(Math.random() * pool.length)].replaceAll('[Name]', name)
                         : name + ' has joined the long line of things that used to be indoors.';
    } else {
      line = DISMISS_LINES[Math.floor(Math.random() * DISMISS_LINES.length)].replaceAll('[Name]', name);
    }
    if (typeof window.pushCruiseLog === 'function') pushCruiseLog('◆ ' + line);
    if (typeof renderHUD === 'function') renderHUD();
    return line;
  }

  function confirmDismiss() {
    closeConfirm();
    const role = cur;
    const jettison = !canDismissSafely();
    const portraitEl = $('cd-portrait');
    departing = true;
    portraitEl.classList.remove('anim-dismiss', 'anim-jettison');
    void portraitEl.offsetWidth; // restart animation cleanly

    if (jettison) {
      portraitEl.classList.add('anim-jettison');
      setTimeout(() => spawnSparks(18, { center: true }), 1500);
      setTimeout(() => {
        const line = removeCrew(role, true);
        // crew_gone failure can fire from an empty roster — endRun()
        // strips overlays itself, so just stop here if the run ended.
        if (typeof checkFailure === 'function' && checkFailure()) { departing = false; return; }
        pendingEpitaph = { role, name: ((rosterOf(role) || {}).name || role) };
        const sentences = line.match(/[^.!?]+[.!?]+/g) || [line];
        $('cd-epitaph-name').textContent = pendingEpitaph.name.toUpperCase();
        $('cd-epitaph-line').innerHTML = sentences.map(s => s.trim()).filter(Boolean).join('<br>');
        $('cd-epitaph').classList.add('visible');
      }, 2000); // 1500ms spin + 500ms splat beat (demo timing)
    } else {
      portraitEl.classList.add('anim-dismiss');
      setTimeout(() => {
        removeCrew(role, false);
        departing = false;
        if (typeof checkFailure === 'function' && checkFailure()) return;
        portraitEl.classList.remove('anim-dismiss');
        afterDeparture();
      }, 1060);
    }
  }

  function closeEpitaph() {
    if (!pendingEpitaph) return;
    $('cd-epitaph').classList.remove('visible');
    pendingEpitaph = null;
    // Demo: keep the jettison end-state until the next render swaps
    // the sprite, so the ejected crew's ghost never flashes back.
    setTimeout(() => { departing = false; afterDeparture(); }, 400);
  }

  function afterDeparture() {
    const list = memberList();
    if (typeof window.renderCruise === 'function') renderCruise();
    if (!list.length) { closeCrewDetail(); return; }
    cur = list.includes(cur) ? cur : list[0];
    render();
  }

  // ── Keyboard — capture phase so ESC never reaches the pause menu
  // while the dossier owns it (same pattern as market.js).
  document.addEventListener('keydown', e => {
    if (!isOpen()) return;
    if (pendingEpitaph) {
      if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') { closeEpitaph(); e.preventDefault(); }
      e.stopPropagation();
      return;
    }
    if (departing) { if (e.key === 'Escape') e.stopPropagation(); return; }
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      if ($('overlay-crew').classList.contains('confirm-open')) closeConfirm();
      else closeCrewDetail();
      return;
    }
    if (!$('overlay-crew').classList.contains('confirm-open')) {
      if (e.key === 'ArrowLeft')  { cycleCrew(-1); e.preventDefault(); }
      if (e.key === 'ArrowRight') { cycleCrew(1);  e.preventDefault(); }
    }
  }, true);
})();

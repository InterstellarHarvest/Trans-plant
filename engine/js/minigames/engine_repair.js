'use strict';
/* ────────────────────────────────────────────────────────────────
   ENGINE-REPAIR SCENE — lifted from resources/demo-engine-repair.html
   (Restoration item 1, RESTORATION_PLAN.md). The full engine-room
   fault-isolation scene: 4 hotspot microgames (breaker bank, ignition
   switches, coolant valve gauge + steam, fuel-line junction) routed
   through openComp, spark/drip particle emitters tracked to hotspots,
   pulsing mask-tint fault highlights, and the lights-off end gate.

   Dev-only demo chrome (devtool panel, size toggle, bbox drag,
   scale-root frame) stripped. All ids prefixed er-, all state kept
   inside this IIFE (load-order rule: nothing reads MOD/STATE at top
   level). CSS lives in resources/screen-engine-repair.css, scoped
   under #engrepair-root (screen-mining.css lesson).

   Entry point: window.openEngineRepair(onDone). onDone(result) fires
   exactly once per visit with result = { fixedCount, allFixed }:
   - demo path: fix all 4 → lights-off gate → RETURN TO BRIDGE
     → { fixedCount: 4, allFixed: true }
   - failsafe LEAVE (engine addition, not in demo — the demo looped
     forever): ABANDON REPAIRS is available before the end state so
     the scene can never wedge a run → { fixedCount: 0..3,
     allFixed: false }. See cruise.js handleRepairVerb for how the
     result maps onto the old openMinigame('engine') tier effects.
   ──────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const SPR = 'sprites/minigames/engine/';

  // ── scene state ──────────────────────────────────────────────
  const COMPS = ['breaker', 'switches', 'valve', 'junction'];
  const fixed = { breaker: false, switches: false, valve: false, junction: false };
  // Per-fault repair time (hours) — surfaced in the AI quips, demo values.
  const TIME_COSTS = { breaker: 1, switches: 2, valve: 1, junction: 3 };
  let totalRepairTime = 0;
  let activeComp = null, gaugeAngle = 0.04, gaugeHeld = false, gaugeRAF = null, gaugeWon = false, gaugeGreenFrames = 0;
  const SW_IDS = ['s0', 's1', 's2', 's3', 's4', 's5'], SW_CORRECT = { s0: true, s1: false, s2: true, s3: false, s4: true, s5: true };
  let swState = {}, brState = {}, jState = {};
  let endStateActive = false;
  let lightsOn = true;
  let running = false;        // true while the overlay is open (gates rAF loops)
  let mounted = false;        // markup injected once, reset per visit
  let onRepairDone = null;

  const QUIPS = {
    open: { breaker: { n: 'MARV', t: "Four breakers tripped simultaneously. The manual says this 'should not occur.' The manual is shy." }, switches: { n: 'ARIA', t: "The ignition array is configured approximately wrong. It's fine! We just fix the switches!" }, valve: { n: 'AJOY', t: "Pressure that cannot leave becomes something else. Bleed the valve. Do not think about what it becomes." }, junction: { n: 'MARV', t: "The fuel lines are disconnected. This is, specifically, why we have stopped." } },
    fixed: { breaker: { n: 'CHIP', t: "Breakers reset! Arbor Day Nutrient Systems Inc. thanks you for your continued safe operation!" }, switches: { n: 'ARIA', t: "All switches nominal! I knew you could do it! I had a backup plan but I won't need it!" }, valve: { n: 'MARV', t: "Pressure nominal. The coolant has accepted its situation." }, junction: { n: 'AJOY', t: "The lines remember their purpose. Connection is just remembering, made physical." } },
    result: { n: 'MARV', t: "All four systems nominal. The Ark will continue. This outcome was, statistically, likely. I had not told you that." }
  };
  function setAI(n, t) { $('er-ai-name').textContent = n; $('er-ai-text').textContent = t; }
  function paused() { return typeof PauseBus !== 'undefined' && PauseBus.paused; }

  // ── markup (injected once into the static #engrepair-root shell) ──
  function mount() {
    if (mounted) return;
    mounted = true;
    const hotspot = (c, lbl, state) =>
      `<div class="hotspot" id="er-hs-${c}" data-comp="${c}">
        <div class="hs-tl"></div><div class="hs-tr"></div><div class="hs-bl"></div><div class="hs-br"></div>
        <div class="hs-inner"><div class="hs-lbl">${lbl}</div><div class="hs-state">${state}</div></div>
      </div>`;
    const pip = (c, lbl) =>
      `<div class="pip" id="er-pip-${c}"><div class="pip-dot"></div><span class="pip-name">${lbl}</span><span class="pip-state" id="er-ps-${c}">✗ FAULT</span></div>`;
    $('engrepair-root').innerHTML = `
      <div class="enc-backdrop">
        <img id="er-bg-broken"     src="${SPR}bg_engine_error.jpg"            alt="">
        <img id="er-bg-fixed"      src="${SPR}bg_engine_fixed.jpg"            alt="">
        <img id="er-bg-lights-off" src="${SPR}bg_engine_fixed_lights_off.jpg" alt="">
      </div>
      <div class="enc-vignette"></div>
      <img class="fault-sprite" id="er-fs-breaker"  src="${SPR}bg_engine_error_relay.png"    alt="">
      <img class="fault-sprite" id="er-fs-switches" src="${SPR}bg_engine_error_ignition.png" alt="">
      <img class="fault-sprite" id="er-fs-valve"    src="${SPR}bg_engine_error_coolant.png"  alt="">
      <img class="fault-sprite" id="er-fs-junction" src="${SPR}bg_engine_error_fuel.png"     alt="">
      <div id="er-hl-tint-layer" class="hl-layer active">
        <div class="hl-tint" data-fault="breaker"  style="-webkit-mask-image:url(${SPR}bg_engine_error_relay.png);mask-image:url(${SPR}bg_engine_error_relay.png)"></div>
        <div class="hl-tint" data-fault="switches" style="-webkit-mask-image:url(${SPR}bg_engine_error_ignition.png);mask-image:url(${SPR}bg_engine_error_ignition.png)"></div>
        <div class="hl-tint" data-fault="valve"    style="-webkit-mask-image:url(${SPR}bg_engine_error_coolant.png);mask-image:url(${SPR}bg_engine_error_coolant.png)"></div>
        <div class="hl-tint" data-fault="junction" style="-webkit-mask-image:url(${SPR}bg_engine_error_fuel.png);mask-image:url(${SPR}bg_engine_error_fuel.png)"></div>
      </div>
      <canvas id="er-spark-canvas" width="960" height="640"></canvas>
      <div class="enc-ai-bar">
        <span class="enc-ai-name" id="er-ai-name">ARIA</span>
        <span class="enc-ai-text" id="er-ai-text"></span>
      </div>
      <div class="enc-resources" id="er-resources">
        <div class="enc-res fuel"><span class="dot"></span><span id="er-res-fuel">–</span></div>
        <div class="enc-res food"><span class="dot"></span><span id="er-res-food">–</span></div>
        <div class="enc-res o2"  ><span class="dot"></span><span id="er-res-o2">–</span></div>
        <div class="enc-res hull"><span class="dot"></span><span id="er-res-hull">–</span></div>
        <div class="enc-res mor" ><span class="dot"></span><span id="er-res-mor">–</span></div>
      </div>
      ${hotspot('breaker', 'POWER RELAY', 'TRIPPED')}
      ${hotspot('switches', 'IGNITION ARRAY', 'MISCONFIG')}
      ${hotspot('valve', 'COOLANT VALVE', 'OVERPRESSURE')}
      ${hotspot('junction', 'FUEL MANIFOLD', 'DISCONNECTED')}
      <div id="er-comp-panel">
        <div id="er-comp-box">
          <div id="er-comp-hdr">
            <div><div id="er-comp-title">COMPONENT</div><div id="er-comp-status">FAULT DETECTED</div></div>
            <button id="er-comp-close">✕ CLOSE</button>
          </div>
          <div id="er-comp-body"><div id="er-comp-hint"></div><div id="er-comp-controls"></div></div>
        </div>
      </div>
      <div class="enc-choices show" id="er-end-choices">
        <div class="enc-choice" id="er-ec-lights" hidden>
          <div class="enc-choice-body" id="er-ec-lights-label">TURN OFF LIGHTS</div>
          <div class="enc-choice-sub"  id="er-ec-lights-sub">The orchids prefer dim</div>
        </div>
        <div class="enc-choice locked leave" id="er-ec-leave" hidden>
          <div class="enc-choice-body">RETURN TO BRIDGE</div>
          <div class="enc-choice-sub" id="er-ec-leave-sub">Lights still on</div>
        </div>
        <div class="enc-choice leave" id="er-ec-abandon">
          <div class="enc-choice-body">RETURN TO BRIDGE</div>
          <div class="enc-choice-sub">Abandon repairs</div>
        </div>
      </div>
      <div class="enc-narrative">
        <div id="er-pip-row">
          ${pip('breaker', 'POWER RELAY')}${pip('switches', 'IGNITION ARRAY')}${pip('valve', 'COOLANT VALVE')}${pip('junction', 'FUEL MANIFOLD')}
        </div>
        <div id="er-narr-text">
          <div class="enc-narr-title" id="er-narr-title">ENGINE ROOM — FAULT ISOLATION PROCEDURE</div>
          <div class="enc-narr-body" id="er-narr-body"></div>
        </div>
      </div>`;
    COMPS.forEach(c => $('er-hs-' + c).addEventListener('click', () => openComp(c)));
    $('er-comp-close').addEventListener('click', closeComp);
    $('er-ec-lights').addEventListener('click', toggleLights);
    $('er-ec-leave').addEventListener('click', leaveEngineRoom);
    $('er-ec-abandon').addEventListener('click', abandonRepairs);
  }

  // ── spark system (demo-faithful; emitters track their hotspot) ──
  let sctx = null;
  const EMITTERS = [
    // breaker on left wall — sparks shoot right + slightly down toward center floor
    { id: 'breaker', kind: 'spark', track: 'breaker', cx: 0, cy: 0, ox: 0, oy: 0, spread: 44, angleBase: 0.25, angleSpread: 0.75, active: true, sparks: [], nextBurst: 0 },
    // switches on right wall — sparks shoot left + slightly down
    { id: 'switches', kind: 'spark', track: 'switches', cx: 0, cy: 0, ox: 0, oy: 0, spread: 48, angleBase: Math.PI - 0.25, angleSpread: 0.75, active: true, sparks: [], nextBurst: 1400 },
    { id: 'valve', kind: 'drip', track: 'valve', cx: 0, cy: 0, active: true, sparks: [], nextBurst: 600 },
  ];
  let lastBurstTime = -1000;
  const MIN_BURST_GAP = 500; // ms between any two emitter bursts so they read as distinct
  let sparkRAF = null;

  function spawnBurst(em) {
    if (em.track) {
      const hs = $('er-hs-' + em.track);
      if (hs) {
        const cx = hs.offsetLeft + hs.offsetWidth / 2;
        if (em.kind === 'drip') {
          em.cx = cx;
          em.cy = hs.offsetTop + hs.offsetHeight;
        } else {
          em.cx = cx + (em.ox || 0);
          em.cy = hs.offsetTop + hs.offsetHeight / 2 + (em.oy || 0);
        }
      }
    }
    if (em.kind === 'drip') {
      const n = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) {
        em.sparks.push({
          kind: 'drip',
          x: em.cx + (Math.random() - 0.5) * 16, y: em.cy,
          vx: (Math.random() - 0.5) * 0.5, vy: 0.4 + Math.random() * 0.8,
          life: 1, decay: 0.013 + Math.random() * 0.006,
          size: 2 + Math.random() * 1.5
        });
      }
      em.nextBurst = performance.now() + 260 + Math.random() * 420;
      return;
    }
    const angBase = em.angleBase ?? -Math.PI / 2;
    const angSpread = em.angleSpread ?? 1.3;
    const n = 5 + Math.floor(Math.random() * 10);
    for (let i = 0; i < n; i++) {
      const ang = angBase + (Math.random() - 0.5) * angSpread, spd = 1.2 + Math.random() * 3.8;
      em.sparks.push({ kind: 'spark', x: em.cx + (Math.random() - 0.5) * em.spread, y: em.cy + (Math.random() - 0.5) * 8, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 0.75 + Math.random() * 0.25, decay: 0.011 + Math.random() * 0.024, size: 0.8 + Math.random() * 2.4, bright: Math.random() > 0.28, sputter: Math.random() > 0.55, sputtered: false });
    }
    lastBurstTime = performance.now();
    em.nextBurst = lastBurstTime + (Math.random() < 0.18 ? 3200 + Math.random() * 1800 : 500 + Math.random() * 2400);
  }

  function sparkLoop(now) {
    if (!running) { sparkRAF = null; return; }
    if (paused()) { lastBurstTime = now; sparkRAF = requestAnimationFrame(sparkLoop); return; }
    EMITTERS.forEach(em => {
      if (!em.active) return;
      if (now > em.nextBurst) {
        // drip is continuous, not bursty — skip the global gap
        if (em.kind !== 'drip' && now - lastBurstTime < MIN_BURST_GAP) {
          em.nextBurst = lastBurstTime + MIN_BURST_GAP + Math.random() * 600;
        } else {
          spawnBurst(em);
        }
      }
      em.sparks.forEach(s => {
        if (s.kind === 'drip') {
          s.x += s.vx; s.y += s.vy; s.vy += 0.12; s.vx *= 0.99; s.life -= s.decay;
        } else {
          s.x += s.vx; s.y += s.vy; s.vy += 0.14; s.vx *= 0.976;
          if (s.sputter && !s.sputtered && s.life < 0.3) { s.life = Math.min(0.65, s.life + 0.38); s.sputtered = true; s.size *= 1.5; }
          s.life -= s.decay;
        }
      });
      em.sparks = em.sparks.filter(s => s.life > 0);
    });
    sctx.clearRect(0, 0, 960, 640);
    EMITTERS.forEach(em => em.sparks.forEach(s => {
      if (s.kind === 'drip') {
        sctx.save();
        sctx.globalAlpha = Math.min(1, s.life * 1.2);
        const px = Math.round(s.x), py = Math.round(s.y);
        const w = Math.max(1, Math.round(s.size));
        const h = Math.max(2, Math.round(s.size + Math.min(4, Math.abs(s.vy) * 0.7)));
        sctx.fillStyle = '#3b6a8c';
        sctx.fillRect(px - Math.floor(w / 2), py - Math.floor(h / 2) + 1, w, h);
        sctx.fillStyle = '#5fa8d0';
        sctx.fillRect(px - Math.floor(w / 2), py - Math.floor(h / 2), w, h);
        sctx.globalAlpha = Math.min(1, s.life) * 0.7;
        sctx.fillStyle = '#cce8f4';
        sctx.fillRect(px - Math.floor(w / 2), py - Math.floor(h / 2), 1, 1);
        sctx.restore();
        return;
      }
      sctx.save(); sctx.globalAlpha = Math.min(1, s.life * 1.35);
      sctx.fillStyle = s.bright ? '#ffffff' : 'rgb(255,' + Math.round(110 + s.life * 90) + ',15)';
      const px = Math.round(s.x), py = Math.round(s.y), sz = Math.max(1, Math.round(s.size));
      sctx.fillRect(px - Math.floor(sz / 2), py - Math.floor(sz / 2), sz, sz);
      if (s.size > 1.8) { sctx.globalAlpha = Math.min(1, s.life) * 0.28; sctx.shadowColor = '#ff8800'; sctx.shadowBlur = 5; sctx.fillStyle = '#ff6600'; sctx.fillRect(px - Math.floor(sz / 2), py - Math.floor(sz / 2), sz, sz); }
      sctx.restore();
    }));
    sparkRAF = requestAnimationFrame(sparkLoop);
  }

  // ── fault lifecycle ──────────────────────────────────────────
  function markFixed(comp) {
    fixed[comp] = true;
    const hs = $('er-hs-' + comp); if (hs) { hs.classList.add('fixed'); hs.querySelector('.hs-state').textContent = 'NOMINAL'; }
    const fs = $('er-fs-' + comp); if (fs) fs.classList.add('fixed');
    const tn = document.querySelector('#engrepair-root .hl-tint[data-fault="' + comp + '"]'); if (tn) tn.classList.add('fixed');
    const pip = $('er-pip-' + comp); if (pip) pip.classList.add('ok');
    $('er-ps-' + comp).textContent = '✓ OK';
    const em = EMITTERS.find(e => e.id === comp); if (em) em.active = false;
    const cost = TIME_COSTS[comp] || 1;
    totalRepairTime += cost;
    const q = QUIPS.fixed[comp];
    setAI(q.n, q.t + ` [${cost}h spent · ${totalRepairTime}h total]`);
    if (COMPS.filter(c => fixed[c]).length === 4) setTimeout(showResult, 700);
  }

  function showResult() {
    if (!running) return;
    endStateActive = true;
    lightsOn = true;
    $('engrepair-root').classList.add('scene-fixed');
    $('er-bg-fixed').classList.add('show');
    $('er-bg-broken').style.opacity = '0'; // fade out — was bleeding through during lights crossfade
    $('er-bg-lights-off').classList.remove('show');
    EMITTERS.forEach(em => { em.active = false; em.sparks = []; });
    $('er-narr-title').textContent = 'ENGINE ROOM — ALL SYSTEMS NOMINAL';
    $('er-narr-body').textContent = `Propulsion restored after ${totalRepairTime} hours of repair work. The Verdant Ark resumes transit. The plants remained undisturbed. There is, however, the matter of the lights.`;
    setAI('MARV', `All four systems nominal — ${totalRepairTime} hours lost to the schedule. Now please turn off the lights — the orchids prefer it dark, and so do I. The bridge will not unlock until you do.`);
    $('er-ec-abandon').hidden = true;
    $('er-ec-lights').hidden = false;
    $('er-ec-leave').hidden = false;
    syncEndChoices();
  }

  function resetScene() {
    const fl = { breaker: 'TRIPPED', switches: 'MISCONFIG', valve: 'OVERPRESSURE', junction: 'DISCONNECTED' };
    COMPS.forEach(c => {
      fixed[c] = false;
      const hs = $('er-hs-' + c); if (hs) { hs.classList.remove('fixed'); hs.querySelector('.hs-state').textContent = fl[c]; }
      const fs = $('er-fs-' + c); if (fs) fs.classList.remove('fixed');
      const tn = document.querySelector('#engrepair-root .hl-tint[data-fault="' + c + '"]'); if (tn) tn.classList.remove('fixed');
      const pip = $('er-pip-' + c); if (pip) pip.classList.remove('ok');
      $('er-ps-' + c).textContent = '✗ FAULT';
    });
    EMITTERS.forEach(em => { em.active = true; em.sparks = []; em.nextBurst = 0; });
    totalRepairTime = 0;
    endStateActive = false;
    lightsOn = true;
    $('engrepair-root').classList.remove('scene-fixed');
    $('er-bg-broken').style.opacity = '';
    $('er-bg-fixed').classList.remove('show');
    $('er-bg-lights-off').classList.remove('show');
    $('er-ec-abandon').hidden = false;
    $('er-ec-lights').hidden = true;
    $('er-ec-leave').hidden = true;
    $('er-narr-title').textContent = 'ENGINE ROOM — FAULT ISOLATION PROCEDURE';
    $('er-narr-body').textContent = "The Verdant Ark has entered Safe Mode. Four faults detected. The manual recommends a 6-hour diagnostic. The manual was written by people who had never had a schedule.";
    setAI('ARIA', 'Something in the engine room needs attention. The plants are fine. I checked the plants first.');
    if (activeComp) closeComp();
  }

  // ── component modal router ───────────────────────────────────
  function openComp(comp) {
    if (fixed[comp]) return;
    activeComp = comp;
    const q = QUIPS.open[comp]; setAI(q.n, q.t);
    const titles = { breaker: 'POWER RELAY', switches: 'IGNITION ARRAY', valve: 'COOLANT VALVE', junction: 'FUEL MANIFOLD' };
    const statuses = { breaker: 'FAULT: ALL BREAKERS TRIPPED', switches: 'FAULT: SWITCH MISCONFIGURATION', valve: 'FAULT: COOLANT OVERPRESSURE', junction: 'FAULT: FUEL LINES DISCONNECTED' };
    $('er-comp-title').textContent = titles[comp]; $('er-comp-status').textContent = statuses[comp];
    ({ breaker: buildBreaker, switches: buildSwitches, valve: buildValve, junction: buildJunction })[comp]();
    $('er-comp-panel').classList.add('open');
  }
  function closeComp() { stopGauge(); $('er-comp-panel').classList.remove('open'); activeComp = null; }

  // A success beat resolves after a short visual hold. If the player
  // opens another component during that hold, do not close the newer
  // panel when the older component's callback arrives.
  function completeComp(comp, delay) {
    setTimeout(() => {
      if (!running || fixed[comp]) return;
      if (activeComp === comp) closeComp();
      markFixed(comp);
    }, delay);
  }

  // ── microgame 1: breaker bank ────────────────────────────────
  function buildBreaker() {
    $('er-comp-hint').textContent = 'Four circuit breakers tripped. Click each to reset. The manual calls this "Step 1 of 47."';
    brState = { B1: false, B2: false, B3: false, B4: false };
    $('er-comp-controls').innerHTML = `<div class="breaker-bank">${['B1', 'B2', 'B3', 'B4'].map(id => `<div class="breaker" id="er-br-${id}" data-br="${id}"><img class="br-sprite" id="er-br-img-${id}" src="${SPR}breaker_faulted.png" alt=""><div class="br-label">${id}</div></div>`).join('')}</div>`;
    ['B1', 'B2', 'B3', 'B4'].forEach(id => $('er-br-' + id).addEventListener('click', () => resetBreaker(id)));
  }
  function resetBreaker(id) { if (brState[id]) return; brState[id] = true; const el = $('er-br-' + id); el.classList.add('br-fixed'); $('er-br-img-' + id).src = SPR + 'breaker_fixed.png'; if (Object.values(brState).every(v => v)) completeComp('breaker', 350); }

  // ── microgame 2: ignition switches ───────────────────────────
  function buildSwitches() {
    $('er-comp-hint').textContent = '';
    SW_IDS.forEach(id => { swState[id] = SW_CORRECT[id]; });
    SW_IDS.slice().sort(() => Math.random() - 0.5).slice(0, 3).forEach(id => { swState[id] = !swState[id]; });
    $('er-comp-controls').innerHTML = `<div style="width:100%"><div class="sw-ref-box"><div class="sw-ref-label">▸ REFERENCE — CORRECT POSITIONS (Appendix D-7, Laminated)</div><div class="sw-row">${SW_IDS.map(id => `<div class="sw-toggle ref-item"><img class="sw-sprite" src="${SPR}switch_ref_${SW_CORRECT[id] ? '2' : '1'}.png" alt=""><div class="sw-lbl">${id.toUpperCase()}</div></div>`).join('')}</div></div><div style="font-size:14px;color:#5a7a6a;margin-bottom:7px;font-style:italic">Current — click wrong switches to correct:</div><div class="sw-row">${SW_IDS.map(id => `<div class="sw-toggle" id="er-sw-${id}" data-sw="${id}"><img class="sw-sprite" id="er-sw-img-${id}" src="${SPR}switch_${swState[id] ? '2' : '1'}.png" alt=""><div class="sw-lbl">${id.toUpperCase()}</div></div>`).join('')}</div></div>`;
    SW_IDS.forEach(id => $('er-sw-' + id).addEventListener('click', () => toggleSw(id)));
  }
  function toggleSw(id) { swState[id] = !swState[id]; $('er-sw-img-' + id).src = SPR + 'switch_' + (swState[id] ? '2' : '1') + '.png'; if (SW_IDS.every(k => swState[k] === SW_CORRECT[k])) completeComp('switches', 350); }

  // ── microgame 3: coolant valve gauge + steam ─────────────────
  function buildValve() {
    gaugeAngle = 0.04; gaugeHeld = false; gaugeWon = false; gaugeGreenFrames = 0;
    $('er-comp-hint').textContent = '';
    $('er-comp-controls').innerHTML = `<div class="gauge-section"><div style="font-size:15px;color:#5a7a6a;font-style:italic;text-align:center">Hold BLEED VALVE until needle reaches green.</div><canvas id="er-gauge-canvas" width="320" height="140"></canvas><div class="gauge-nom-msg" id="er-gauge-nom">● PRESSURE NOMINAL</div><button id="er-valve-btn"><canvas id="er-valve-steam-canvas" width="240" height="170"></canvas><img id="er-valve-btn-img" src="${SPR}valve_btn.png" alt="BLEED VALVE"></button></div>`;
    const btn = $('er-valve-btn');
    btn.addEventListener('mousedown', gaugeDown);
    btn.addEventListener('touchstart', gaugeDown);
    drawGauge();
    startValveSteam();
    document.addEventListener('mouseup', gaugeUp); document.addEventListener('touchend', gaugeUp);
  }
  function gaugeDown(e) { if (e) e.preventDefault(); if (gaugeWon) return; gaugeHeld = true; const img = $('er-valve-btn-img'); if (img) img.src = SPR + 'valve_btn_held.png'; if (!gaugeRAF) gaugeLoop(); }
  function gaugeUp() { gaugeHeld = false; const img = $('er-valve-btn-img'); if (img) img.src = SPR + 'valve_btn.png'; }
  function stopGauge() { gaugeHeld = false; if (gaugeRAF) { cancelAnimationFrame(gaugeRAF); gaugeRAF = null; } document.removeEventListener('mouseup', gaugeUp); document.removeEventListener('touchend', gaugeUp); }
  function gaugeLoop() {
    if (paused()) { gaugeRAF = requestAnimationFrame(gaugeLoop); return; }
    if (!$('er-gauge-canvas')) { gaugeRAF = null; return; }
    if (gaugeHeld && !gaugeWon) {
      gaugeAngle = Math.min(1, gaugeAngle + 0.007);
      if (gaugeAngle >= 0.44 && gaugeAngle <= 0.66) { gaugeGreenFrames++; if (gaugeGreenFrames > 18) { gaugeWon = true; gaugeHeld = false; const n = $('er-gauge-nom'); if (n) n.classList.add('show'); drawGauge(); completeComp('valve', 600); return; } } else { gaugeGreenFrames = 0; }
      if (gaugeAngle > 0.72) { const m = $('er-gauge-nom'); if (m) m.textContent = '● OVER-BLED — RELEASE AND RETRY'; }
    } else if (!gaugeHeld && gaugeAngle > 0.72) { gaugeAngle = Math.max(0.04, gaugeAngle - 0.003); gaugeGreenFrames = 0; }
    drawGauge();
    gaugeRAF = requestAnimationFrame(gaugeLoop);
  }
  function drawGauge() {
    const c = $('er-gauge-canvas'); if (!c) return;
    const ctx = c.getContext('2d');
    const W = c.width, H = c.height;
    const cx = W / 2, cy = H * 0.91, r = W * 0.37;
    const s = 215, sw = 110, toR = d => d * Math.PI / 180;
    const aLW = W * 0.073, fSize1 = Math.round(W * 0.055), fSize2 = Math.round(W * 0.038);
    ctx.clearRect(0, 0, W, H);
    [{ f: 0, t: 0.22, c: '#882222' }, { f: 0.22, t: 0.38, c: '#b87020' }, { f: 0.38, t: 0.72, c: '#2a7a5a' }, { f: 0.72, t: 0.86, c: '#b87020' }, { f: 0.86, t: 1, c: '#882222' }].forEach(z => { ctx.beginPath(); ctx.arc(cx, cy, r, toR(s + z.f * sw), toR(s + z.t * sw)); ctx.strokeStyle = z.c; ctx.lineWidth = aLW; ctx.stroke(); });
    ctx.beginPath(); ctx.arc(cx, cy, r + 2, toR(212), toR(328)); ctx.strokeStyle = '#1a2535'; ctx.lineWidth = 4; ctx.stroke();
    ctx.font = `bold ${fSize1}px 'VT323',monospace`; ctx.fillStyle = '#445566'; ctx.textAlign = 'center'; ctx.fillText('COOLANT PSI', cx, cy - r * 0.4);
    const nd = s + gaugeAngle * sw, inG = gaugeAngle >= 0.44 && gaugeAngle <= 0.66;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(toR(nd)) * (r - 6), cy + Math.sin(toR(nd)) * (r - 6)); ctx.strokeStyle = inG ? '#8cc890' : '#e8d8a0'; ctx.lineWidth = Math.max(2.5, W * 0.011); ctx.lineCap = 'round'; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(5, W * 0.022), 0, Math.PI * 2); ctx.fillStyle = inG ? '#8cc890' : '#c8a85a'; ctx.fill();
    const ld = s + 0.55 * sw; ctx.font = `${fSize2}px 'Press Start 2P',monospace`; ctx.fillStyle = inG ? '#8cc890' : 'rgba(53,198,191,0.2)'; ctx.textAlign = 'center'; ctx.fillText('OK', cx + Math.cos(toR(ld)) * (r - W * 0.13), cy + Math.sin(toR(ld)) * (r - W * 0.13));
  }

  // ── microgame 4: fuel-line junction ──────────────────────────
  function buildJunction() {
    jState = { 0: false, 1: false, 2: false }; $('er-comp-hint').textContent = 'Three fuel lines disconnected. Click each to reconnect.';
    $('er-comp-controls').innerHTML = `<div class="junction-section"><div class="junction-row">${['LINE A', 'LINE B', 'LINE C'].map((l, i) => `<div class="jnode" id="er-jn-${i}" data-jn="${i}"><img class="jn-sprite" id="er-jn-img-${i}" src="${SPR}junction_a_faulted.png" alt=""><div class="jn-lbl">${l}</div></div>`).join('')}</div></div>`;
    [0, 1, 2].forEach(i => $('er-jn-' + i).addEventListener('click', () => reconnect(i)));
  }
  function reconnect(i) { if (jState[i]) return; jState[i] = true; const el = $('er-jn-' + i); el.classList.add('jn-fixed'); $('er-jn-img-' + i).src = SPR + 'junction_a_fixed.png'; if (Object.values(jState).every(v => v)) completeComp('junction', 350); }

  // ── valve steam particles (modal-local canvas above the button) ──
  // Idle: slow gentle puffs. Held: pressurized side jets. Auto-stops
  // when the modal canvas is gone (closeComp removes it).
  let valveSteamParticles = [];
  let valveSteamRAF = null;
  let valveSteamNextBurst = 0;
  let valveBtnAlphaImg = null; // preloaded lazily so the canvas can mask to the button silhouette

  function startValveSteam() {
    if (!valveBtnAlphaImg) { valveBtnAlphaImg = new Image(); valveBtnAlphaImg.src = SPR + 'valve_btn.png'; }
    valveSteamParticles = [];
    valveSteamNextBurst = 0;
    if (valveSteamRAF) cancelAnimationFrame(valveSteamRAF);
    valveSteamRAF = requestAnimationFrame(steamLoop);
  }

  function steamLoop(t) {
    if (paused()) { valveSteamNextBurst = t; valveSteamRAF = requestAnimationFrame(steamLoop); return; }
    const cv = $('er-valve-steam-canvas');
    if (!cv || !running) { valveSteamRAF = null; valveSteamParticles = []; return; }
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    if (t > valveSteamNextBurst) {
      spawnSteamPuff(W, H);
      const interval = gaugeHeld ? 22 : 95;
      valveSteamNextBurst = t + interval + Math.random() * 30;
    }
    for (const p of valveSteamParticles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy *= 0.985; // air resistance softens upward speed
      p.vx *= 0.99;
      p.size += p.grow; // steam expands as it rises
      p.life -= p.decay;
    }
    valveSteamParticles = valveSteamParticles.filter(p => p.life > 0 && p.y > -20 && p.x > -20 && p.x < W + 20);
    ctx.clearRect(0, 0, W, H);
    for (const p of valveSteamParticles) {
      const a = Math.min(0.55, p.life * 0.7);
      if (a <= 0) continue;
      const sz = Math.max(1, Math.round(p.size));
      ctx.globalAlpha = a;
      ctx.fillStyle = '#b8c8d4';
      ctx.fillRect(Math.round(p.x - sz / 2), Math.round(p.y - sz / 2), sz, sz);
      if (p.bright) {
        ctx.globalAlpha = a * 0.9;
        ctx.fillStyle = '#f0f4f8';
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      }
    }
    // Mask the canvas with the button's alpha so steam follows the button
    // silhouette instead of the rectangular canvas.
    if (valveBtnAlphaImg.complete && valveBtnAlphaImg.naturalWidth) {
      const BTN_W = 110, BTN_H = 108;
      const bx = (W - BTN_W) / 2, by = (H - BTN_H) / 2;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.drawImage(valveBtnAlphaImg, bx, by, BTN_W, BTN_H);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
    valveSteamRAF = requestAnimationFrame(steamLoop);
  }

  function spawnSteamPuff(W, H) {
    const BTN_W = 110, BTN_H = 108;
    const cx = W / 2;
    const btnTopY = (H - BTN_H) / 2;
    const btnLeftX = (W - BTN_W) / 2;
    const btnRightX = (W + BTN_W) / 2;
    const btnCenterY = H / 2;
    if (gaugeHeld) {
      // ── HELD: pressure escapes ONLY out the sides ──
      for (const dir of [-1, 1]) {
        const baseX = dir < 0 ? (btnLeftX - 3) : (btnRightX + 3);
        const sideCount = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < sideCount; i++) {
          valveSteamParticles.push({
            x: baseX,
            y: btnCenterY + (Math.random() - 0.5) * 32,
            vx: dir * (1.6 + Math.random() * 1.4),
            vy: -0.3 + (Math.random() - 0.5) * 0.5,
            size: 2 + Math.random() * 1.5,
            grow: 0.10,
            life: 1,
            decay: 0.020,
            bright: Math.random() < 0.5
          });
        }
      }
    } else {
      // ── IDLE: gentle top puff only ──
      const count = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < count; i++) {
        valveSteamParticles.push({
          x: cx + (Math.random() - 0.5) * 18,
          y: btnTopY - 2,
          vx: (Math.random() - 0.5) * 0.9,
          vy: -0.5 - Math.random() * 0.7,
          size: 2.5 + Math.random() * 2,
          grow: 0.06,
          life: 1,
          decay: 0.014,
          bright: false
        });
      }
    }
  }

  // ── end state: lights toggle + gated leave ───────────────────
  function toggleLights() {
    if (!endStateActive) return;
    lightsOn = !lightsOn;
    if (lightsOn) {
      $('er-bg-fixed').classList.add('show');
      $('er-bg-lights-off').classList.remove('show');
      setAI('MARV', "If you must, but the orchids will sigh. The bridge is locked again. Try once more.");
    } else {
      $('er-bg-fixed').classList.remove('show');
      $('er-bg-lights-off').classList.add('show');
      setAI('MARV', "Better. The orchids prefer dim. The bridge is now accessible — though I'd argue you should stay.");
    }
    syncEndChoices();
  }

  function syncEndChoices() {
    const lblEl = $('er-ec-lights-label'), subEl = $('er-ec-lights-sub');
    const leave = $('er-ec-leave'), leaveSub = $('er-ec-leave-sub');
    if (lightsOn) {
      lblEl.textContent = 'TURN OFF LIGHTS';
      subEl.textContent = 'The orchids prefer dim';
      leave.classList.add('locked');
      leaveSub.textContent = 'Lights still on';
    } else {
      lblEl.textContent = 'TURN ON LIGHTS';
      subEl.textContent = 'Reveal full nominal state';
      leave.classList.remove('locked');
      leaveSub.textContent = 'Resume cruise';
    }
  }

  function fixedCount() { return COMPS.filter(c => fixed[c]).length; }

  function leaveEngineRoom() {
    if (lightsOn) return; // gated — the orchids prefer dim
    finish({ fixedCount: 4, allFixed: true });
  }

  // Failsafe LEAVE (engine addition): always available before the end
  // state so the scene can never wedge a run — the demo looped forever.
  function abandonRepairs() {
    const n = fixedCount();
    finish({ fixedCount: n, allFixed: n === 4 });
  }

  function finish(result) {
    running = false;
    closeComp();
    if (sparkRAF) { cancelAnimationFrame(sparkRAF); sparkRAF = null; }
    if (valveSteamRAF) { cancelAnimationFrame(valveSteamRAF); valveSteamRAF = null; }
    hideOverlay('overlay-engrepair');
    const cb = onRepairDone;
    onRepairDone = null;
    if (cb) cb(result);
  }

  // ── entry point ──────────────────────────────────────────────
  // Called by cruise.js's REPAIR verb handler. onDone(result) fires when
  // the player leaves the engine room — see finish() above.
  window.openEngineRepair = function (onDone) {
    mount();
    onRepairDone = onDone || null;
    sctx = $('er-spark-canvas').getContext('2d');
    resetScene();
    // Resource HUD mirrors live STATE (demo hardcoded these values)
    if (typeof STATE !== 'undefined' && STATE.resources) {
      const R = STATE.resources;
      $('er-res-fuel').textContent = Math.round(R.fuel);
      $('er-res-food').textContent = Math.round(R.food);
      $('er-res-o2').textContent = Math.round(R.o2);
      $('er-res-hull').textContent = Math.round(R.hull);
      $('er-res-mor').textContent = Math.round(R.morale);
    }
    showOverlay('overlay-engrepair');
    running = true;
    lastBurstTime = -1000;
    if (!sparkRAF) sparkRAF = requestAnimationFrame(sparkLoop);
  };

})();

'use strict';
/* ────────────────────────────────────────────────────────────────
   CRUISE SCREEN — migrated from resources/demo-cruise.html (GAME_BIBLE
   §18). The hub between legs: real resources/crew/crop/day data, the
   Stop Menu (region verbs → minigames / encounters), the MAP overlay.

   From the demo (owner-approved): its 3-layer warp starfield
   (pace-driven, streaks at Ludicrous/Plaid, decelerates on Stop), the
   ticker state machine (slide replace, amber STOPPED,
   red event, AI quips as amber "MARV: …" lines while stopped), TIME
   PAUSED, scene alerts wired to real state, the multi-day WAIT FOR
   TRADER / REST machinery (1–7 day picker, action banner, result
   flash, STOP WAITING / WAKE UP, during-wait events), the trader
   presence roll, the forced-event state those during-wait events put
   the ship in, the LOG button, verb time labels, readout icons, day
   markers and the 35ms typewriter in the AI log.

   Engine adaptation of the demo's Stop/Resume: the ship only travels
   on Resume (travelTo is instant), and it lands stopped after every
   event (owner ruling 2026-10-10). So "normal" (cruising) is what the
   player sees before the first Stop of a run; the starfield's warp is
   re-armed on every Resume so each arrival shows the deceleration.
   ──────────────────────────────────────────────────────────────── */
(function () {
  const $ = id => document.getElementById(id);
  const cruiseVisible = () => { const s = $('screen-cruise'); return !!(s && s.classList.contains('active')); };
  const isStopped = () => document.body.classList.contains('stop-active');

  // ── Warp starfield (starfield-demo.html / demo-cruise.html canon) ──
  // Three parallax layers (far/mid/near). Speed follows the ENGINES
  // order (STATE.orders.pace); Ludicrous and Plaid streak. Stars travel
  // left-to-right (cruise convention). Stop → linear deceleration to 0;
  // Resume → ease back up. CPU: the loop idles (no rAF at all) while the
  // cruise screen is hidden, while PauseBus is paused, and once a stopped
  // ship's stars have come to rest — observers below wake it.
  const STAR_W = 960, STAR_H = 640;
  const starCvs = $('starfield');
  const starCtx = starCvs.getContext('2d', { alpha: true });
  const STAR_LAYERS = [
    { count: 80, speed: 0.35, size: 1,   alpha: 0.55 },  // far
    { count: 42, speed: 0.95, size: 1.6, alpha: 0.85 },  // mid
    { count: 18, speed: 1.85, size: 2.4, alpha: 1.00 },  // near
  ];
  // Pace id → the demo's STAR_SPEEDS row (LIGHT/RIDICULOUS/LUDICROUS/PLAID).
  const STAR_SPEEDS = {
    light:      { mul: 1,  streakAt: Infinity },
    ridiculous: { mul: 4,  streakAt: Infinity },
    ludicrous:  { mul: 14, streakAt: 5 },
    plaid:      { mul: 42, streakAt: 2 },
  };
  const STAR_STOP_DECEL = 28;   // mul-units/s: Plaid → 0 in ~1.5s
  const STAR_ACCEL_EASE = 0.08; // per 60fps frame
  const starLayers = STAR_LAYERS.map(L => {
    const xs = new Float32Array(L.count), ys = new Float32Array(L.count);
    for (let i = 0; i < L.count; i++) { xs[i] = Math.random() * STAR_W; ys[i] = Math.random() * STAR_H; }
    return { xs, ys, cfg: L };
  });
  let starMul = 0, starLastT = performance.now(), starRunning = false;
  function starSpeed() {
    const pace = (typeof STATE !== 'undefined' && STATE.orders && STATE.orders.pace) || 'ridiculous';
    return STAR_SPEEDS[pace] || STAR_SPEEDS.ridiculous;
  }
  // Stopped = parked (Stop menu open, a wait, a during-wait event).
  const starsStopped = () => isStopped() || document.body.classList.contains('event-active');
  function drawStars(dtFrame) {
    starCtx.clearRect(0, 0, STAR_W, STAR_H);
    const streakAt = starSpeed().streakAt;
    for (const { xs, ys, cfg } of starLayers) {
      const dx = cfg.speed * starMul * dtFrame, adx = Math.abs(dx), n = xs.length;
      if (adx > streakAt) {
        starCtx.strokeStyle = 'rgba(255,255,255,' + cfg.alpha + ')';
        starCtx.lineWidth = Math.max(1, cfg.size * 0.85);
        starCtx.lineCap = 'butt';
        starCtx.beginPath();
        for (let i = 0; i < n; i++) {
          let x = xs[i] + dx;
          if (x > STAR_W + adx) { x = -Math.random() * 40; ys[i] = Math.random() * STAR_H; }
          xs[i] = x;
          starCtx.moveTo(x, ys[i]);
          starCtx.lineTo(x - dx, ys[i]);
        }
        starCtx.stroke();
      } else {
        starCtx.fillStyle = 'rgba(255,255,255,' + cfg.alpha + ')';
        const s = cfg.size, half = s / 2;
        for (let i = 0; i < n; i++) {
          let x = xs[i] + dx;
          if (x > STAR_W) { x = 0; ys[i] = Math.random() * STAR_H; }
          xs[i] = x;
          starCtx.fillRect((x - half) | 0, (ys[i] - half) | 0, s, s);
        }
      }
    }
  }
  function starFrame(now) {
    if (!cruiseVisible() || PauseBus.paused) { starRunning = false; return; }
    let dtFrame = (now - starLastT) / 16.6667;
    if (dtFrame > 3) dtFrame = 3;
    const dtSec = Math.min(0.2, (now - starLastT) / 1000);
    starLastT = now;
    if (starsStopped()) {
      const step = STAR_STOP_DECEL * dtSec;
      starMul = Math.abs(starMul) <= step ? 0 : starMul - Math.sign(starMul) * step;
    } else {
      const target = starSpeed().mul;
      starMul += (target - starMul) * Math.min(1, STAR_ACCEL_EASE * dtFrame);
      if (Math.abs(starMul - target) < 0.01) starMul = target;
    }
    drawStars(dtFrame);
    // A parked ship's stars have stopped: the frame just drawn holds.
    if (starsStopped() && starMul === 0) { starRunning = false; return; }
    requestAnimationFrame(starFrame);
  }
  function wakeStars() {
    if (starRunning || !cruiseVisible() || PauseBus.paused) return;
    starRunning = true;
    starLastT = performance.now();
    requestAnimationFrame(starFrame);
  }
  drawStars(0); // a still field under the first frame
  // The leg itself is flown at the ordered pace — set on Resume so the
  // hub (which comes back stopped after the stop's event) shows the ship
  // decelerating out of warp.
  function markUnderway() { starMul = starSpeed().mul; }
  const cruiseStarState = () => ({ mul: starMul, running: starRunning, target: starSpeed().mul, streakAt: starSpeed().streakAt, stopped: starsStopped() });

  wireCustomScroll($('ai-log-host'));
  wireCustomScroll($('stop-choices-host'));

  const AI_SPRITE = { aria: 'sprites/interface/AI/aria.png', marv: 'sprites/interface/AI/marv.png', rex: 'sprites/interface/AI/rex.png', chip: 'sprites/interface/AI/chip.png', ajoy: 'sprites/interface/AI/ajoy.png' };
  const NODE_TYPE_TO_REGION = { station: 'station_approach', planet: 'planet_orbit_habitable', asteroid_field: 'asteroid_field', derelict: 'debris_field', nebula: 'nebula', void: 'deep_space', anomaly: 'anomaly', fork: 'deep_space' };
  const capWord = s => { s = String(s || '').replace(/_/g, ' '); return s.charAt(0).toUpperCase() + s.slice(1); };

  // Bible §"Ship Sprite System": the scene ship is two layered sprites —
  // shared base (ships/default.png, already the silhouette's CSS bg) +
  // a crop overlay at ships/<crop>/<stage 1-4>.png keyed to growth
  // quartiles. Dead crop (health ≤ 0) reverts to base-only until a
  // replant crosses the first threshold again.
  const CROP_SHIP_FOLDER = { wheat: 'wheat', tomato: 'tomato', sweet_potato: 'potato', soybean: 'soybean', zinnia: 'zinnia' };
  function syncShipSprite() {
    const sil = document.getElementById('ship-silhouette');
    if (!sil) return;
    const base = "url('sprites/ships/default.png')";
    const cg = STATE.cropGrowth;
    const folder = CROP_SHIP_FOLDER[STATE.crop];
    // Demo applyShipSprite: the empty pods only for the first days after
    // planting (POST_HARVEST_DAYS = 3 — "nothing's grown back yet"), then
    // the stage by growth with the card's own thresholds (≤25 sprouting,
    // ≤50 vegetative, ≤75 flowering, else maturing).
    if (!folder || !cg || cg.health <= 0 || (cg.day || 0) < 3) {
      sil.style.backgroundImage = base;
      return;
    }
    const g = cg.growth || 0;
    const stage = g <= 25 ? 1 : g <= 50 ? 2 : g <= 75 ? 3 : 4;
    sil.style.backgroundImage = "url('sprites/ships/" + folder + "/" + stage + ".png'), " + base;
  }

  // Crop card plant sprite (demo-cruise.html canon, dropped in the
  // port — the card showed a wheat emoji for every crop). Frame coords
  // are the demo's verbatim table from sprites/growbay/spritesheet_growbay
  // .json: sheet 666×776, frames 109×192, displayed 76px tall.
  const PLANT_SHEET_W = 666, PLANT_SHEET_H = 776, PLANT_FRAME_H = 192;
  const PLANT_STAGE_SPRITES = {
    wheat:    [{ x: 445, y: 389 }, { x: 556, y: 1   }, { x: 223, y: 389 }, { x: 334, y: 389 }],
    tomato:   [{ x: 1,   y: 389 }, { x: 112, y: 389 }, { x: 334, y: 195 }, { x: 445, y: 195 }],
    potato:   [{ x: 223, y: 1   }, { x: 334, y: 1   }, { x: 1,   y: 1   }, { x: 112, y: 1   }],
    soybeans: [{ x: 112, y: 195 }, { x: 223, y: 195 }, { x: 445, y: 1   }, { x: 1,   y: 195 }],
    zinnia:   [{ x: 1,   y: 583 }, { x: 112, y: 583 }, { x: 556, y: 195 }, { x: 556, y: 389 }],
  };
  const CROP_TO_SHEET_KEY = { sweet_potato: 'potato', soybean: 'soybeans' };
  function paintCropIcon(crop, stageIdx) {
    const el = $('crop-icon');
    const frames = PLANT_STAGE_SPRITES[CROP_TO_SHEET_KEY[crop] || crop];
    if (!el || !frames) return;
    const f = frames[Math.max(0, Math.min(3, stageIdx))];
    const k = 76 / PLANT_FRAME_H;
    el.classList.add('has-plant-sprite');
    el.textContent = '';
    el.style.backgroundImage = "url('sprites/growbay/spritesheet_growbay.png')";
    el.style.backgroundSize = (PLANT_SHEET_W * k).toFixed(2) + 'px ' + (PLANT_SHEET_H * k).toFixed(2) + 'px';
    el.style.backgroundPosition = (-f.x * k).toFixed(2) + 'px ' + (-f.y * k).toFixed(2) + 'px';
  }

  // Station stop (owner ruling 2026-10-11, demo approach mode): the
  // station the hail showed hangs behind the ship — same node, same
  // station (scene_art.js picks it per node from the run's art seed),
  // above the ship (which drops lower to sit under it), at an integer
  // downscale if it would not fit; nothing at any other kind of stop.
  function syncStationView() {
    const node = STATE.byId && STATE.byId[STATE.currentId];
    $('cruise-scene').classList.toggle('at-station', !!(node && node.node_type === 'station'));
    SceneArt.paintStationView($('cruise-station'), node, { maxW: 170, maxH: 130 });
  }

  // ── Header ticker (Bible §18 "Header Ticker", demo writeTicker) ──
  // One line at a time: the old line slides out left while the new one
  // slides in from the right (0.55s). Kinds: 'normal' (teal), 'event-info'
  // (amber pulse — STOPPED, and AI quips / news while stopped) and 'event'
  // (red pulse — a during-wait event holding the ship). syncTicker() only
  // rewrites when the state's own line changes, so a quip or a news line
  // stays up until the next real replacement (Bible: "stay until the next
  // replacement"); leaving the state restores its line.
  let tickerEl = null, tickerKey = null, tickerWarnTimer = null, hubHiddenAt = 0, hubWasVisible = false;
  // tip (optional): the line's own hover — an AI quip reads in the
  // tooltip's quote tone under the AI's name (demo-tooltip ai_quip_*).
  function writeTicker(text, kind, tip) {
    const box = $('header-ticker');
    if (!box) return;
    // Written while the hub is hidden, the line is simply there; and a
    // line left over from before the hub was last hidden doesn't slide
    // out over the return from an encounter — it just goes.
    const instant = !cruiseVisible();
    const el = document.createElement('span');
    el.className = 'ticker-text' + (instant ? '' : ' enter') + (kind === 'event' ? ' event' : kind === 'event-info' ? ' event-info' : '');
    const inner = document.createElement('span');
    inner.className = 'ticker-inner';
    inner.textContent = text;
    el.appendChild(inner);
    if (tip) Tooltip.attach(el, tip);
    else el.title = text;
    box.appendChild(el);
    void el.offsetWidth;            // the enter transform sticks, then transitions to centre
    el.classList.remove('enter');
    if (tickerEl) {
      const old = tickerEl;
      // Replaced before it ever landed (two state changes in one beat,
      // e.g. returnToHub's repaint then its Stop): it just goes.
      if (instant || (old._born || 0) < hubHiddenAt || performance.now() - (old._born || 0) < 80) old.remove();
      else { old.classList.add('exit'); setTimeout(() => old.remove(), 700); }
    }
    el._born = performance.now();
    tickerEl = el;
    // A line longer than the ticker drifts across once it has landed
    // (the AI's quips are full sentences; clipping them mid-word hid the
    // only place they show while stopped).
    setTimeout(() => {
      if (tickerEl !== el || !el.isConnected) return;
      const over = inner.scrollWidth - el.clientWidth;
      if (over > 4) {
        el.classList.add('marquee');
        inner.style.setProperty('--tk-shift', (-over - 8) + 'px');
        inner.style.animationDuration = Math.max(6, (over + 8) / 28 + 4) + 's';
      }
    }, 600);
  }
  const forcedDef = () => STATE.forcedEvent && WAIT_EVENTS[STATE.forcedEvent.kind];
  function normalTickerLine() {
    const here = STATE.byId && STATE.byId[STATE.currentId];
    if (!here) return '';
    const nextIds = [...nextAvailableNodes()];
    // Long-range scan hits are news: they replace the default line.
    const hit = nextIds.map(id => STATE.scouted && STATE.scouted[id]).find(sc => sc && sc.ev && EVENTS[sc.ev]);
    if (hit) return 'SCAN · NEXT: ' + String(EVENTS[hit.ev].title || 'CONTACT').toUpperCase();
    if (nextIds.length === 1) {
      const n = STATE.byId[nextIds[0]];
      return 'COMING UP ON ' + String((n && n.name) || STATE.destination || 'THE NEXT STOP').toUpperCase();
    }
    if (nextIds.length > 1) return 'ROUTES DIVERGE AHEAD — CHECK THE MAP';
    if (here.node_type === 'fork') return 'ROUTE DECISION — CHOOSE A HEADING';
    return STATE.destination ? 'EN ROUTE TO ' + STATE.destination.toUpperCase() : '';
  }
  function tickerTarget() {
    const f = forcedDef();
    if (f) return { text: f.ticker, kind: 'event' };
    if (isStopped()) return { text: traderHere() && !atStation() ? 'STOPPED — TRADER IN RANGE' : 'STOPPED', kind: 'event-info' };
    return { text: normalTickerLine(), kind: 'normal' };
  }
  function syncTicker(force) {
    const t = tickerTarget();
    const key = t.kind + '|' + t.text;
    if (key === tickerKey && !force) return;
    tickerKey = key;
    writeTicker(t.text, t.kind);
  }
  // Something worth a line while stopped (AI quip, scan news): amber,
  // replaces whatever is up; the state's own line returns with the next
  // state change.
  function tickerNews(text, tip) {
    if (!cruiseVisible()) return;
    writeTicker(text, isStopped() || STATE.forcedEvent ? 'event-info' : 'normal', tip);
  }

  // ── Time held (Bible §18 Pause vs Stop) ────────────────────────
  // .time-paused marks the hub while the ship is stopped or the game is
  // paused (pause menu, any modal over the hub); a multi-day wait's days
  // really pass, so it doesn't count. Owner ruling 17 (2026-10-11): the
  // day counter stays up regardless — no TIME PAUSED swap; STOPPED in
  // the ticker is the signal. The class is a state hook only.
  function overlayOpen() {
    return !!document.querySelector('#game .overlay.active, .overlay.active');
  }
  function syncPaused() {
    const scr = $('screen-cruise');
    if (!scr) return;
    const paused = PauseBus.paused || overlayOpen() ||
      ((isStopped() || !!STATE.forcedEvent) && !activeWait);
    scr.classList.toggle('time-paused', !!paused);
  }
  function dayText() {
    const daysLeft = Math.max(0, STATE.baseDays - STATE.daysElapsed);
    return 'DAY ' + STATE.daysElapsed + ' · ' + daysLeft + ' LEFT';
  }

  // ── Scene alert + Stop pulse (demo showSceneAlert) ─────────────
  // Amber line fading in at the top of the scene for ~4s, the Stop
  // button pulsing with it. Only real state raises one (arrival at a
  // stop with a trader in range, what the route ahead shows) and each
  // is logged, as the demo logs its alerts.
  let alertTimer = null;
  function showSceneAlert(msg, ms) {
    const el = $('scene-alert');
    el.textContent = msg;
    el.classList.add('show');
    $('stop-btn').classList.add('alert');
    clearTimeout(alertTimer);
    alertTimer = setTimeout(() => { el.classList.remove('show'); $('stop-btn').classList.remove('alert'); }, ms || 4200);
  }
  const NEXT_STOP_ALERT = {
    asteroid_field: 'ASTEROID FIELD AHEAD — GOOD MINING',
    derelict:       'DERELICT DETECTED — PROCEED WITH CAUTION',
    anomaly:        'UNIDENTIFIED SIGNAL · PORT BOW',
  };
  function arrivalAlert() {
    if (!cruiseVisible() || STATE.ended || STATE.alertedNode === STATE.currentId || activeWait || STATE.forcedEvent) return;
    STATE.alertedNode = STATE.currentId; // saved: a reload doesn't raise (and log) it again
    let msg = null;
    if (traderHere() && !atStation()) msg = 'TRADER SHIP ON APPROACH';
    else {
      const nextIds = [...nextAvailableNodes()];
      const n = nextIds.length === 1 && STATE.byId[nextIds[0]];
      if (n) msg = NEXT_STOP_ALERT[n.node_type] || null;
    }
    if (!msg) return;
    showSceneAlert(msg);
    pushLogEntry('▶ ' + msg);
    saveRun(); // the line + alertedNode (the hub's own save ran before this timer)
  }

  // ── Trader presence (owner ruling 2026-10-11, Bible §18 Trader-wait) ──
  // Each non-station stop rolls once, on the first hub visit, whether a
  // trader is in range: TRADE when one is, WAIT FOR TRADER when not.
  // Saved (STATE.traderAt) so a reload can't re-roll it. Stations always
  // trade (Market Row). Odds lean civilized (Bible: "high near stations/
  // planets, near-zero in deep space"); anomalies have no trade verbs.
  const TRADER_PRESENT_CHANCE = {
    planet_orbit_habitable: 0.55, debris_field: 0.45, derelict: 0.45, asteroid_field: 0.40,
    nebula: 0.35, planet_orbit_alien: 0.30, deep_space: 0.15, anomaly: 0,
  };
  const atStation = () => { const n = STATE.byId && STATE.byId[STATE.currentId]; return !!(n && n.node_type === 'station'); };
  function traderHere() {
    if (atStation()) return true;
    STATE.traderAt = STATE.traderAt || {};
    return !!STATE.traderAt[STATE.currentId];
  }
  function rollTraderPresence() {
    const id = STATE.currentId;
    if (!id || !STATE.byId || !STATE.byId[id] || atStation()) return;
    STATE.traderAt = STATE.traderAt || {};
    if (id in STATE.traderAt) return;
    STATE.traderAt[id] = Math.random() < (TRADER_PRESENT_CHANCE[currentRegionKey()] || 0);
  }

  // ── AI log (demo pushLogEntry / pushDayMarker / typewriteInto) ──
  // ▶ marks ship events; the AI's own lines carry its voice ("MARV: …").
  // A "── DAY n ──" marker opens each new day's entries. The newest
  // entry typewrites at 35ms/char behind a blinking cursor; older ones
  // dim to 0.55. The log only follows the tail when the reader is
  // already within 50px of the bottom — scrolled up, it stays put.
  const TYPE_MS = 35;
  let typing = null, markerDay = null;
  const isAtBottom = el => el.scrollHeight - el.scrollTop - el.clientHeight < 50;
  // No "NAME: " prefix when the line already names the AI (index.html
  // namesTheAI).
  function displayLine(text, voice) {
    const body = String(text == null ? '' : text).replace(/^\s*[◆▶]\s*/, '');
    if (!voice) return '▶ ' + body;
    return namesTheAI(body) ? body : voice.toUpperCase() + ': ' + body;
  }
  function finishTyping() {
    if (!typing) return;
    const t = typing; typing = null;
    clearTimeout(t.timer);
    t.span.textContent = t.text;
    t.cursor.remove();
    if (t.done) t.done();
  }
  function appendDayMarker(log, day) {
    const m = document.createElement('div');
    m.className = 'ai-day-marker';
    m.textContent = '── DAY ' + day + ' ──';
    log.appendChild(m);
    markerDay = day;
  }
  // Payload entries (Bible §18/§19, demo-cruise pushLogEntry): the
  // WHOLE entry is clickable, with 📖 (expand: opens that entry's page in
  // the Ship's Log journal) or 🔗 (link: opens the page in a new tab and
  // pauses the game — the Bridge Terminal comes up, so the player returns
  // to a held game) at its end. An entry carrying both opens its page,
  // as the journal does.
  const payloadOf = en => {
    if (!en) return null;
    if (en.expand) return { kind: 'expand' };
    if (en.link && en.link.url) return { kind: 'link', link: en.link };
    return null;
  };
  function openLogLink(link) {
    if (!link || !link.url) return;
    window.open(link.url, '_blank', 'noopener');
    if (!PauseMenu.isOpen()) PauseMenu.open();
    else PauseBus.pause();
  }
  function armPayload(entry, en) {
    const p = payloadOf(en);
    if (!p) return null;
    entry.classList.add('has-payload');
    entry.setAttribute('title', p.kind === 'expand' ? 'Read more' : (p.link.label || 'Learn more') + ' — opens in a new tab; the game pauses');
    entry.addEventListener('click', ev => {
      ev.stopPropagation();
      if (p.kind === 'expand') ShipLog.openEntry(en);
      else openLogLink(p.link);
    });
    return p;
  }
  function addPayloadIcon(entry, en) {
    const p = payloadOf(en);
    if (!p) return;
    const b = document.createElement('span');
    b.className = 'ai-entry-payload';
    b.textContent = p.kind === 'expand' ? '\u{1F4D6}' : '\u{1F517}';
    entry.appendChild(document.createTextNode(' '));
    entry.appendChild(b);
  }

  /* Accepts a plain string OR {text, link: {url, label}} per the
     Bible's reserved log-entry schema (§18 "Expandable entries &
     external links"). opts.ai marks the active AI's own voice line;
     opts.instant skips the typewriter. Link entries get the 🔗
     convention and open in a new tab. */
  function pushLogEntry(entryOrText, opts) {
    // Ship's Log (engine/js/shipslog.js): while an outcome is being
    // applied, lines are held and replayed after its choice/outcome
    // entries, so the record reads in order.
    if (ShipLog.capture(entryOrText, opts)) return null;
    opts = opts || {};
    const log = $('ai-log');
    const isObj = entryOrText && typeof entryOrText === 'object';
    const text = isObj ? entryOrText.text : entryOrText;
    const voice = opts.ai ? (STATE.activeAI || 'marv') : null;
    const day = (isObj && Number.isFinite(entryOrText.day)) ? entryOrText.day : STATE.daysElapsed;
    // Persist to the run's Ship's Log (browsable journal — pause menu →
    // SHIP'S LOG). Day-stamped; carries link/expand payloads through.
    STATE.shipLog = STATE.shipLog || [];
    const stored = {
      day: day,
      text: text,
      link: (isObj && entryOrText.link) || null,
      expand: (isObj && entryOrText.expand) || null,
      // Journal chrome (demo-shipslog canon): 'death' entries get the
      // memorial treatment; 'sci' marks science-link payloads' LED.
      type: (isObj && entryOrText.type) || (isObj && entryOrText.link ? 'sci' : null),
      crewId: (isObj && entryOrText.crewId) || null,
      crewName: (isObj && entryOrText.crewName) || null,
      voice: voice,
    };
    STATE.shipLog.push(ShipLog.store(stored));
    ShipLog.compact();
    // An entry that lands while the journal is open shows at once (a scene
    // alert fires a beat after returning to the hub, e.g.).
    const slog = document.getElementById('overlay-shipslog');
    if (slog && slog.classList.contains('active')) window.renderShipsLog();
    const line = displayLine(text, voice);
    // At a stop the log column is under the Stop menu: the AI says this
    // stop's lines in a speech bubble over the ship (ruling 91). Lines
    // pushed before the menu opens (tips, comments, warnings) wait for it.
    if (voice) queueAiBubble(String(text == null ? '' : text).replace(/^\s*[◆▶]\s*/, ''), voice, !!opts.tip);
    const sticky = isAtBottom(log);
    finishTyping();
    log.querySelectorAll('.ai-entry.latest').forEach(e => e.classList.remove('latest'));
    if (day !== markerDay) appendDayMarker(log, day);
    const entry = document.createElement('div');
    entry.className = 'ai-entry latest' + (voice ? ' voice' : ' system');
    log.appendChild(entry);
    const saved = STATE.shipLog[STATE.shipLog.length - 1];
    armPayload(entry, saved);
    const follow = () => { if (sticky) log.scrollTop = log.scrollHeight; };
    if (opts.instant || isStopped() || !cruiseVisible()) {
      entry.textContent = line;
      addPayloadIcon(entry, saved);
      follow();
      return entry;
    }
    const span = document.createElement('span');
    const cursor = document.createElement('span');
    cursor.className = 'tw-cursor';
    entry.appendChild(span);
    entry.appendChild(cursor);
    typing = { span, cursor, text: line, timer: null, done: () => { addPayloadIcon(entry, saved); follow(); } };
    const t = typing;
    let i = 0;
    (function tick() {
      if (typing !== t) return;                          // finished early by the next entry
      if (!entry.isConnected) { typing = null; return; } // log rebuilt (load)
      if (PauseBus.paused) { t.timer = setTimeout(tick, 120); return; }
      span.textContent += line.charAt(i++);
      follow();
      if (i < line.length) t.timer = setTimeout(tick, TYPE_MS * textSpeedMult()); // pause menu TEXT SPEED
      else finishTyping();
    })();
    follow();
    return entry;
  }

  // The last n Ship's Log entries, re-rendered as the hub log (a load
  // replaces the run, and with it the log) — same markers and prefixes.
  function rebuildCruiseLog(n) {
    const log = $('ai-log');
    if (!log) return;
    finishTyping();
    log.innerHTML = '';
    markerDay = null;
    const list = (STATE.shipLog || []).slice(-(n || 8));
    list.forEach((en, i) => {
      if (!en) return;
      if (en.day !== markerDay) appendDayMarker(log, en.day);
      const d = document.createElement('div');
      d.className = 'ai-entry' + (en.voice ? ' voice' : ' system') + (i === list.length - 1 ? ' latest' : '');
      d.textContent = displayLine(en.text, en.voice);
      armPayload(d, en);
      addPayloadIcon(d, en);
      log.appendChild(d);
    });
    log.scrollTop = log.scrollHeight;
  }

  // Bottom-right bars (owner ruling 18): FOOD/H2O/O2 | FUEL/HULL, each
  // with the HUD's low thresholds as a crit pulse (the dot HUD left the
  // hub, so its warning moved onto the bars). renderHUD() repaints them
  // too, so a change that only re-renders the HUD lands here as well.
  const BAR_SPEC = [
    ['fuel', 'Fuel'], ['food', 'Food'], ['water', 'Water'],
    ['o2',   'Oxygen'], ['hull', 'Hull'],
  ];
  function paintCruiseBars() {
    const r = STATE.resources;
    for (const [k, name] of BAR_SPEC) {
      const fill = $('res-fill-' + k);
      if (!fill) continue;
      const max = resMax(k);
      fill.style.width = clampPct(r[k] * 100 / max) + '%';
      const row = fill.parentNode.parentNode;
      row.classList.toggle('crit', r[k] < RES_LOW[k]);
      row.title = name + ': ' + Math.round(r[k]) + ' / ' + max;
    }
  }

  function renderCruise() {
    // Catch crop growth/health up to today before painting the card —
    // decay must tick even if the player never opens the growbay.
    window.tickCropGrowth();
    // A during-wait event belongs to the stop it happened at (anything
    // that moved the ship — a test harness, Push Engines — drops it).
    if (STATE.forcedEvent && STATE.forcedEvent.node !== STATE.currentId) STATE.forcedEvent = null;
    document.body.classList.toggle('event-active', !!STATE.forcedEvent);
    // A during-wait event saved before its flash finished (a reload, a
    // load) opens straight away (owner ruling 46a) — no menu between.
    if (STATE.forcedEvent && !activeWait) setTimeout(() => { if (STATE.forcedEvent && !activeWait && cruiseVisible()) resolveForced(); }, 0);
    rollTraderPresence();
    syncShipSprite();
    syncStationView();
    $('cruise-ship-name').textContent = (STATE.shipName || 'THE SHIP').toUpperCase();
    syncTicker();
    $('day-counter').textContent = dayText();
    if ($('cruise-gold')) $('cruise-gold').textContent = STATE.goldAmount + 'g';
    syncPaused();

    const ai = STATE.activeAI || 'marv';
    const avatar = $('ai-avatar');
    avatar.style.backgroundImage = "url('" + (AI_SPRITE[ai] || AI_SPRITE.marv) + "')";
    $('ai-name').textContent = ai.toUpperCase();

    paintCruiseBars();

    // Standing-orders readout — live from STATE.orders (Restoration
    // item 5). Clicking any cell opens the Orders modal (wired once
    // below); the cells just mirror the committed settings here.
    const o = ensureOrders();
    $('readout-engines').textContent = ordersPace().name;
    $('readout-rations').textContent = ordersRations().name;
    $('readout-water-plant').textContent = o.waterSplit + '%';
    $('readout-water-crew').textContent  = (100 - o.waterSplit) + '%';

    // Crew strip: the captain (their own sprite — the player is not a
    // crew specialist) + STATE.crew. Name on top, role capitalised under
    // it (demo canon: "CAPTAIN / Botanist", "DR. OSEI / Botanist").
    const strip = $('crew-strip');
    strip.innerHTML = '';
    const members = [];
    if (STATE.captain) members.push({ key: 'captain', label: 'CAPTAIN', role: capWord(STATE.captain), crewId: 'captain' });
    for (const role of STATE.crew) members.push({ key: role, label: crewNameOf(role).toUpperCase(), role: capWord(role), crewId: crewSpriteIdOf(role) });
    // Always three slots — captain + the two crew places (the cap,
    // crewJoinRole). An empty place keeps its card-sized spot, so the crop
    // card and everything right of it never shift (owner).
    const CREW_PLACES = 3;
    while (members.length < CREW_PLACES) members.push({ key: null, empty: true });
    for (const m of members) {
      if (m.empty) {
        const slot = document.createElement('div');
        slot.className = 'crew-slot empty';
        slot.title = 'Empty crew slot — a stowaway you welcome or a survivor you rescue can take it.';
        slot.innerHTML = '<div class="crew-empty-label">— vacant —</div>';
        strip.appendChild(slot);
        continue;
      }
      const slot = document.createElement('div');
      slot.className = 'crew-slot' + (m.key === 'captain' ? ' captain' : '');
      const iconHtml = m.crewId
        ? '<div class="crew-icon has-sprite" data-crew-id="' + m.crewId + '" style="' + crewIconCss(m.crewId, 'var(--card-icon-size)') + '"></div>'
        : '<div class="crew-icon">\u{1F464}</div>';
      // Real HP — the captain's own too (owner ruling 29, index.html hpOf).
      const hp = hpOf(m.key);
      const hpColor = hp <= CREW_CRITICAL_HP ? '#cc5555' : (hp < CREW_WOUNDED_HP ? '#d4a830' : '');
      // Their OWN morale (owner ruling 15). The captain has none: no MO bar.
      const mo = m.key === 'captain' ? null : crewMoraleOf(m.key);
      // HUD rounding (crewMoraleAvg): above 0 reads at least 1 — "0" only when they walk.
      // …why it moved apart from the crew's (role concerns, ruling 57), and
      // a warned member's "needs 25 to stay" (owner 2026-10-12).
      const moTip = mo == null ? '' : escapeHTML(crewMoraleTip(m.key));
      const moBar = mo == null ? ''
        : '<div class="crew-bar mo' + (crewDeserting(m.key) ? ' zero' : '') + '" title="' + moTip + '"><span class="crew-bar-label">MO</span><div class="crew-bar-track"><div class="crew-bar-fill" style="width:' + clampPct(mo) + '%"></div></div></div>';
      slot.innerHTML =
        '<div class="crew-slot-top">' + iconHtml +
          '<div class="crew-info"><div class="crew-name">' + m.label + '</div><div class="crew-role">' + m.role + '</div></div>' +
        '</div>' +
        '<div class="crew-bars">' +
          '<div class="crew-bar hp" title="Health ' + hp + '/100"><span class="crew-bar-label">HP</span><div class="crew-bar-track"><div class="crew-bar-fill" style="width:' + clampPct(hp) + '%' + (hpColor ? ';background:' + hpColor : '') + '"></div></div></div>' +
          moBar +
        '</div>';
      // Crew dossier (Restoration item 4) — click opens the detail
      // modal; the captain slot opens their reduced dossier.
      slot.addEventListener('click', () => {
        openCrewDetail(m.key);
      });
      strip.appendChild(slot);
    }

    renderCropCard();

    // AI universal pools — ambient/warning/crop lines into the log.
    // All three are idempotent per condition (guards inside), so the
    // many renderCruise() call sites stay safe. Defined further down
    // (function declarations hoist).
    maybePushAmbient();
    checkResourceWarnings();
    crewMoraleWatch(); // per-crew morale: the 0-morale warning / all-clear (owner ruling 15)
    checkCropMilestones();
    setTimeout(arrivalAlert, 350); // once the hub is actually on screen
    wakeStars();
    // Every hub repaint is a safe between-actions point — autosave, last,
    // so the lines/flags just pushed above are in it (they used to replay
    // with fresh text after a reload).
    saveRun();
  }
  function clampPct(v) { return Math.max(0, Math.min(100, v | 0)); }

  // ── Crop card (demo renderCrop) ─────────────────────────────────
  // Real growth/health from STATE.cropGrowth (growbay.js). At 100%
  // growth the card goes READY / .mature and the pulsing HARVEST button
  // takes the growing block's place — it runs the growbay's own harvest.
  // "DAY n / maturity" goes red once the crop is past its maturity days
  // without being grown (the growbay's own overdue rule). The LED lights
  // for anything that wants the player: ready, sick, pests, thirst.
  function cropAttention() {
    const cg = STATE.cropGrowth;
    if (!STATE.crop || !cg || cg.health <= 0) return [];
    const why = [];
    if (cg.growth >= 100) why.push('Ready to harvest');
    const def = ((MOD.crops && MOD.crops.crops) || []).find(c => c.id === 'crop_' + STATE.crop);
    if (cg.health < ((def && def.sick_threshold) || CROP_SICK_DEFAULT)) why.push('Sick');
    if (cg.pest) why.push('Pests');
    // The growbay's own thirst rule (pickAriaQuip): plant share >10
    // points under the crop's need.
    const split = STATE.orders && Number.isFinite(STATE.orders.waterSplit) ? STATE.orders.waterSplit : cg.waterPlant;
    if (split < Math.round(cropWaterNeed()) - 5) why.push('Thirsty'); // the growbay's DRY line (more than 5 under the need stalls growth)
    return why;
  }
  // Crop problems in the order the card names them (the worst first).
  const CROP_ISSUES = [
    { why: 'Pests', label: 'PESTS: TREAT IT', tip: () => 'Pests are eating the crop. Open the growbay and TREAT (' + window.cropTreatCostShort() + '), or USE a crop treatment from the hold.' }, // growbay.js: the rule TREAT rolls
    { why: 'Sick', label: 'SICK', tip: "The crop's health is below its sick line. Open the growbay to see what's hurting it." },
    { why: 'Thirsty', label: 'THIRSTY', tip: "The crop's share of the water is below what it needs. Raise it in Orders or the growbay." },
  ];
  function renderCropCard() {
    const card = $('crop-card-mini');
    if (!STATE.crop) return;
    const cg = STATE.cropGrowth;
    const growth = cg ? cg.growth : 0;
    const alive = !cg || cg.health > 0;
    const mature = !!cg && alive && growth >= 100;
    const STAGE_NAMES = ['SPROUTING', 'VEGETATIVE', 'FLOWERING', 'MATURING'];
    const stageIdx = growth <= 25 ? 0 : growth <= 50 ? 1 : growth <= 75 ? 2 : 3;
    const meta = cropMetaOf(STATE.crop);
    const maturity = (meta && meta.maturity_days) || CROP_MATURITY_DEFAULT;
    const day = cg ? cg.day : 0;
    $('crop-name').textContent = STATE.crop.replace(/_/g, ' ').toUpperCase();
    paintCropIcon(STATE.crop, stageIdx);
    const stageEl = $('crop-stage');
    stageEl.textContent = !alive ? 'DEAD' : mature ? 'READY' : STAGE_NAMES[stageIdx];
    const dayEl = $('crop-day');
    dayEl.textContent = 'DAY ' + day + ' / ' + maturity;
    const overdue = alive && day > maturity && growth < 100;
    dayEl.classList.toggle('overdue', overdue);
    dayEl.title = overdue ? 'Past its ' + maturity + '-day maturity and still growing — health slows growth.' : 'Days since planting / days to maturity at full health.';
    $('crop-growth-fill').style.width = clampPct(growth) + '%';
    $('crop-health-fill').style.width = clampPct(cg ? cg.health : 100) + '%';
    card.classList.toggle('mature', mature);
    const why = cropAttention();
    const led = $('crop-alert-led');
    led.classList.toggle('on', why.length > 0);
    led.title = why.length ? why.join(' · ') : 'Nothing needs attention';
    // A problem takes the stage line until it is dealt with (owner
    // 2026-10-15, ruling 86): the worst first, in amber, with what to do
    // on hover. The plant shows it too: pests pulse it amber, sickness
    // drains its colour. The LED stays the demo's general cue.
    const issue = alive ? CROP_ISSUES.find(i => why.includes(i.why)) : null;
    stageEl.classList.toggle('issue', !!issue && !mature);
    if (issue && !mature) stageEl.textContent = issue.label;
    stageEl.title = issue ? (typeof issue.tip === 'function' ? issue.tip() : issue.tip) : '';
    const icon = $('crop-icon');
    icon.classList.toggle('pest', alive && !!(cg && cg.pest));
    icon.classList.toggle('sick', alive && why.includes('Sick'));
  }
  function harvestFromCard(e) {
    if (e) e.stopPropagation(); // the card itself opens the growbay
    window.tickCropGrowth();    // binds the growbay's live crop state, caught up to today
    const cg = STATE.cropGrowth;
    if (!cg || cg.growth < 100 || cg.health <= 0) return;
    // doHarvest logs "▶ Harvested … +N food" itself — one line for both
    // harvest paths, stating what really landed.
    window.doHarvest();
    renderHUD();
    renderCruise();
    if (isStopped()) renderStopMenu();
  }


  // ── Header buttons ───────────────────────────────────────────
  $('btn-map').addEventListener('click', () => {
    showOverlay('overlay-map'); // must show before rendering — nodePositions() reads clientWidth/Height
    renderMapOverlay();
  });
  $('ovmap-close').addEventListener('click', () => hideOverlay('overlay-map'));
  $('btn-inv').addEventListener('click', () => openInventory());
  $('crop-card-mini').addEventListener('click', () => { if (STATE.crop) openGrowbay(); });
  $('crop-harvest-btn').addEventListener('click', harvestFromCard);
  // Stop Menu header LOG button → the Ship's Log (Bible §18 "📜 LOG").
  $('stop-log-btn').addEventListener('click', () => { window.openShipsLog(); });
  // The AI bubble: a click anywhere on it dismisses (ruling 91).
  if ($('ai-bubble')) $('ai-bubble').addEventListener('click', () => clearAiBubble());
  // Any readout cell opens the Orders modal (demo-orders.html's
  // cg-readout behavior — the whole strip is one click target).
  $('cruise-readout').addEventListener('click', () => {
    openOrders();
  });

  // ── Stop Menu shell ──────────────────────────────────────────
  // Regions + verb lists are demo canon (with the engine's station
  // services and CONDENSE). TRADE and WAIT FOR TRADER share a slot: the
  // stop's trader roll decides which one shows. A planet the run's art
  // gives the 'alien' biome (scene_art.js biomeFor — the same pick its
  // approach and landing scenes use) is PLANET ORBIT · ALIEN: FORAGE in
  // the red risky strip, and the risk is real (an extra poison roll).
  const REGIONS = {
    deep_space:             { label: 'DEEP SPACE',             mood: 'Stars and silence. Nothing here but thinking.',                       verbs: ['scan', 'trade', 'wait_for_trader', 'repair', 'rest', 'fab'] },
    asteroid_field:         { label: 'ASTEROID FIELD',         mood: 'Cold rocks. The kind of place that pays in chips, not stories.',      verbs: ['mine', 'forage_food', 'trade', 'wait_for_trader', 'repair', 'rest', 'fab'] },
    debris_field:           { label: 'DEBRIS FIELD',           mood: 'Someone else’s bad day, scattered for kilometers.',              verbs: ['salvage', 'mine', 'forage_food', 'trade', 'wait_for_trader', 'repair', 'rest', 'fab'] },
    // A derelict stop whose hulk is still in one piece (derelictFormOf):
    // the debris field's verbs, but SALVAGE boards it — the derelict
    // salvage game (owner ruling 2026-10-11 #12).
    derelict:               { label: 'DERELICT',               mood: 'A dead ship, still in one piece. Whatever its crew left aboard is still aboard.', verbs: ['salvage', 'mine', 'forage_food', 'trade', 'wait_for_trader', 'repair', 'rest', 'fab'] },
    nebula:                 { label: 'NEBULA',                 mood: 'Glowing gas in colors that probably mean something.',                 verbs: ['mine', 'condense', 'scan', 'trade', 'wait_for_trader', 'repair', 'rest', 'fab'] },
    anomaly:                { label: 'ANOMALY',                mood: 'The instruments disagree with each other. None of them with reality.', verbs: ['scan', 'forage_food', 'repair', 'rest', 'fab'] },
    planet_orbit_habitable: { label: 'PLANET ORBIT · HABITABLE', mood: 'Green and blue and trying. A world that knows how to grow things.', verbs: ['forage_food', 'trade', 'wait_for_trader', 'scan', 'repair', 'rest', 'fab'] },
    planet_orbit_alien:     { label: 'PLANET ORBIT · ALIEN',   mood: 'Whatever evolved here did so without consulting Earth precedent.',   verbs: ['forage_food', 'trade', 'wait_for_trader', 'scan', 'repair', 'rest', 'fab'] },
    station_approach:       { label: 'STATION APPROACH',       mood: 'Lights and traffic. Civilization, give or take.',                     verbs: ['trade', 'medbay', 'drydock', 'fab_service', 'repair', 'rest', 'fab'] },
  };
  const FORAGE_LABEL_BY_REGION = { planet_orbit_habitable: 'GATHER', planet_orbit_alien: 'FORAGE', asteroid_field: 'HUNT', debris_field: 'SCAVENGE', derelict: 'SCAVENGE', anomaly: 'FORAGE' };
  // Time labels say what the engine really charges: whole days (the
  // demo's hour labels — 8h, 5h — predate day-granular costs). No label
  // on verbs that cost no days.
  const STOP_VERBS = {
    // icon: demo-cruise.html STOP_VERBS iconUrl (demo canon), sprites/interface/.
    mine:         { label: 'MINE',      sub: (region) => holdIsFull() ? 'Hold full: no room to keep what you mine.' : region === 'nebula' ? 'Skim the gas for materials and fuel.' : 'Pull raw materials from the rocks.',              effort: 3, icon: 'mining', time: '1d/run' },
    salvage:      { label: 'SALVAGE',   sub: (region) => holdIsFull() ? 'Hold full: no room to keep what you find.' : region === 'derelict' ? 'Board the hulk. Fuel cells, ration cans, the odd medkit.' : 'Pick through the wreckage. Mind the sharp bits.',  effort: 3, icon: 'salvage', time: '1d' },
    forage_food:  { label: (region) => FORAGE_LABEL_BY_REGION[region] || 'FORAGE',
                    sub: (region) => region === 'planet_orbit_alien' ? 'Alien flora. Some of it bites back: someone aboard may be poisoned.' : 'Find something edible. Or interesting. Sometimes both.',
                    effort: 2, icon: 'forage', time: '1d', variantBy: (region) => region === 'planet_orbit_alien' ? 'risky' : null },
    trade:        { label: 'TRADE',     sub: () => atStation() ? 'Market Row is open. Haggle in person.' : 'A trader is in range. Haggle. Or pretend to.', effort: 1, icon: 'trade', time: '0-2d', requires: () => traderHere() }, // browsing is free; a deal takes a day or two
    wait_for_trader: { label: 'WAIT FOR TRADER', sub: 'Park. Roll the dice. Days will pass. Things will hear you.', effort: 1, hint: true, icon: 'wait', time: '1-7d', hideWhen: () => traderHere() },
    scan:         { label: 'SCAN',      sub: 'Read the signals. Find what is coming.',           effort: 2, hint: true, icon: 'scan', time: '1d' },
    repair:       { label: 'REPAIR',    sub: () => 'Patch the hull: +' + Math.min(repairHullGain(), Math.ceil(resMax('hull') - STATE.resources.hull)) + ' hull for 2 metal + 1 scrap.', effort: 3, locked: repairLockReason, icon: 'repair', time: '1d', hideWhen: () => hullIntact() },
    rest:         { label: 'REST',      sub: () => 'Crew morale up (+' + restPerDay() + ' a day). Days down.', effort: 1, hint: true, icon: 'rest', time: '1-7d', locked: restLockReason },
    fab:          { label: 'FABRICATOR', sub: 'Open the print queue. Long jobs need a still ship.', effort: 1, hint: true, icon: 'fab' },
    medbay:       { label: 'MEDBAY',    sub: () => 'Treat everyone aboard who is hurt. ' + medbayFee() + 'g, no days.', effort: 1, hint: true, locked: medbayLockReason, icon: 'medic', hideWhen: () => !medbayPatient() },
    condense:     { label: 'CONDENSE',  sub: 'Wring water out of the nebula. A day for +12 water.', effort: 2, locked: condenseLockReason, icon: 'water', time: '1d' },
    drydock:      { label: 'DRYDOCK',   sub: () => 'Station crews patch the hull. +' + Math.min(30, Math.ceil(resMax('hull') - STATE.resources.hull)) + ' hull for ' + drydockFee() + 'g.', effort: 1, hint: true, locked: drydockLockReason, icon: 'repair', hideWhen: () => hullIntact() },
    fab_service:  { label: 'FAB SERVICE', sub: () => 'Station techs overhaul the fabricator. Wear to zero, ' + fabServiceFee() + 'g.', effort: 1, hint: true, locked: fabServiceLockReason, icon: 'fab', hideWhen: () => fabGoodAsNew() },
  };
  // demo-cruise hideWhen (REPAIR: !hullDamaged): a verb with nothing to
  // work on isn't offered at all — no locked row saying so. The same rule
  // covers the station services the demo never drew: DRYDOCK (hull
  // intact), MEDBAY (nobody hurt), FAB SERVICE (good as new). Rows locked
  // for a NEED the player can meet (materials, gold, an item, a berth)
  // stay, with their Need rows on hover.
  const hullIntact = () => STATE.resources.hull >= resMax('hull');
  // FAB SERVICE has nothing to do below this much wear.
  const FAB_GOOD_AS_NEW_WEAR = 10;
  const fabGoodAsNew = () => { const f = STATE.fabricator || {}; return !f.broken && (f.wear || 0) < FAB_GOOD_AS_NEW_WEAR; };
  // REST raises every crew member's morale (owner ruling 15). No crew
  // aboard: nothing to raise — locked, not offered as a morale verb.
  // Locked only when EVERYONE is in good spirits (one low member is
  // reason enough to rest).
  function restLockReason() {
    if (!STATE.crew.length) return 'No crew aboard to rest';
    return STATE.crew.every(r => crewMoraleOf(r) >= 95) ? 'The crew is in good spirits' : null;
  }
  const STATION_SERVICE_VERBS = new Set(['trade', 'medbay', 'drydock', 'fab_service']); // closed by a wave-off (owner ruling 2026-10-11)
  function effortPips(n) { n = Math.max(0, Math.min(5, n | 0)); return '●'.repeat(n) + '○'.repeat(5 - n); }


  // ── Stop Menu verb → minigame wiring (Phase 4) ────────────────
  // Applies a minigame's tier-based effects to real STATE, checks for
  // failure (a minigame's time cost can push daysElapsed past baseDays
  // same as any other action), then logs + re-renders. Mirrors the
  // apply → renderHUD → checkFailure → log/render order resolveChoice()
  // uses for events, so minigame outcomes and event outcomes behave the
  // same way around the failure check.
  // The effort tax is paid on the click, so a job cancelled before
  // it starts (closed at the briefing, LEAVE before mining, REPAIR closed
  // untouched — or a double-click's second press on the backdrop) gets it
  // back. Once the job begins, a reload settles it as a quit (loadRun).
  let pendingVerbTax = 0, activeVerb = null, jobMarker = null;
  function refundVerbTax() {
    // Exactly what each crew member paid comes back (refundEffortTax).
    if (pendingVerbTax) { refundEffortTax(pendingVerbTax); pendingVerbTax = 0; renderHUD(); }
  }
  function onJobBegun(days) {
    pendingVerbTax = 0;
    if (STATE.currentEvent) { window.eventMinigameBegun(); return; }
    jobMarker = activeVerb ? { verb: activeVerb, days: days || 1 } : null;
    if (jobMarker) writeSnapshot(undefined, { pendingAbandon: jobMarker });
  }
  // Harm taken in play (minigames.js reportJobHarm: a forage poisoning,
  // the patient's HP) rides in the quit marker, so a reload keeps it as
  // ✕ QUIT does.
  function onJobHarm(harm) {
    if (STATE.currentEvent) { window.eventMinigameBegun(harm); return; }
    if (jobMarker) writeSnapshot(undefined, { pendingAbandon: Object.assign({}, jobMarker, { harm }) });
  }
  // A quit's harm so far lands (✕ QUIT and loadRun's pendingAbandon): each
  // forage poisoning hurts someone aboard, as it would have at the end.
  // Returns the log's addendum.
  function applyAbandonHarm(harm) {
    const hits = (harm && Array.isArray(harm.poison)) ? harm.poison : [];
    const who = [];
    for (const sev of hits) {
      const hp = POISON_HP[sev] || POISON_HP.light;
      const hit = damageCrew(null, hp);
      if (hit) who.push((hit === 'captain' ? 'you' : crewNameOf(hit)) + ' −' + hp + ' HP');
    }
    if (!who.length) return '';
    renderHUD();
    return ' The poisoning stays: ' + who.join(', ') + ' (before the medic\'s care).';
  }
  function settleMinigame(logLine, days) {
    pendingVerbTax = 0; activeVerb = null; jobMarker = null;
    passDays(days || 1); // trivial time cost (MINE: one day per run), same tier index.html's applyOutcomeEffects uses — routed through the orders daily-drain helper
    renderHUD();
    if (checkFailure()) return;
    pushLogEntry(logLine);
    renderCruise();
    // The Stop menu stays open across verbs — re-gate it (a REPAIR that
    // spent the last metal must lock, MEDBAY with no one hurt…).
    if (document.body.classList.contains('stop-active')) renderStopMenu();
  }

  // Quitting a minigame mid-game (tier 'abandoned', owner ruling
  // 2026-10-09): nothing gained, even what was already in hand — the
  // day is still spent.
  function settleAbandoned(verb, harm) {
    const hurt = applyAbandonHarm(harm);
    settleMinigame('◆ ' + verb + ' — abandoned partway. Nothing kept; the day is gone anyway.' + hurt);
  }

  const TRAIL_TO_SCAN_DIFFICULTY = { lunar: 'easy', mars: 'medium', interstellar: 'hard' };
  const REGION_TO_FORAGE_MODE = { asteroid_field: 'HUNT', debris_field: 'SCAVENGE', derelict: 'SCAVENGE', planet_orbit_habitable: 'GATHER', planet_orbit_alien: 'GATHER', anomaly: 'GATHER' };
  // Alien-world poison roll: a 'medium' forage poisoning — owner ruling 3
  // (demo numbers, the sickness table below): light 10 / medium 20 /
  // heavy 35 HP.
  const ALIEN_POISON_CHANCE = 0.25, ALIEN_POISON_HP = 20;
  // A forage poisoning by severity (owner ruling 2026-10-11, the demo's
  // payload numbers): HP, before the medic's softening.
  const POISON_HP = { light: 10, medium: 20, heavy: 35 };

  function handleScanVerb() {
    const difficulty = TRAIL_TO_SCAN_DIFFICULTY[STATE.trail] || 'medium';
    openMinigame('scan', { difficulty }, (tier) => {
      if (tier === 'abandoned') return settleAbandoned('SCAN');
      // Owner ruling 2026-10-10 — SCAN does something: it locks in and
      // reports what waits ahead (index.html scoutAhead). Perfect: two
      // stops deep, with full outcome intel on arrival. Good: the next
      // stop(s), every fork branch. Poor: static.
      if (tier === 'poor') return settleMinigame('◆ SCAN — Signal lost in the static. Nothing useful recovered.');
      const perfect = tier === 'perfect';
      const report = scoutAhead(perfect ? 2 : 1, perfect);
      const head = perfect ? 'Clean lock. Long-range picture, outcomes modeled.' : 'Partial read — the next stop, at least.';
      settleMinigame('◆ SCAN — ' + head + (report.length ? ' ' + report.join(' · ') : ' Nothing ahead but the destination.'));
      // A long-range hit is news: up on the ticker (amber while stopped).
      const news = normalTickerLine();
      if (/^SCAN/.test(news)) tickerNews(news);
    });
  }

  // REPAIR — the full engine-room fault-isolation scene (Restoration
  // item 1; engine/js/minigames/engine_repair.js, ported from
  // demo-engine-repair.html). Replaces the old openMinigame('engine')
  // Simon-says here — that game stays in minigames.js for
  // launch_minigame events. Outcome contract preserved from the old
  // tier handler: allFixed (4/4 faults) → the 'perfect' effect (+20
  // hull). Abandoning partway (1–3 faults fixed) is a QUIT — nothing
  // kept, the day spent (owner ruling 2026-10-09); walking out before
  // touching anything is a free cancel (mirrors MINE's pre-run LEAVE).
  // REPAIR costs materials (owner ruling 2026-10-10): 2 metal + 1 scrap,
  // spent only when the patch is done (a quit keeps them, costs the day).
  const REPAIR_COST = { metal: 2, scrap: 1 };
  // Ruling 77: a finished repair (REPAIR, DRYDOCK, the Engine Fault's
  // rebuild) lifts the engineer — crew_roster.json morale_concern
  // repair_done, the way back from hull_damage. The verb tooltips show it.
  // The hold has no free slot (a MINE / SALVAGE haul would stay behind).
  function holdIsFull() {
    const ids = MOD.materials.materials.map(m => m.id);
    const land = materialLandings(Object.fromEntries(ids.map(id => [id, 1])));
    return ids.length > 0 && ids.every(id => !land[id]); // not one unit of anything fits
  }
  // REPAIR's patch: +20 hull, +10 more with an engineer (half for a captain engineer).
  function repairHullGain() { return 20 + Math.round(10 * specialistMult('engineer')); }
  function repairLift() {
    const c = concernDef('engineer', 'repair_done');
    return c ? applyConcern('engineer', c.morale, 'repair_done') : 0;
  }
  function repairLiftTip() {
    const c = concernDef('engineer', 'repair_done');
    return c && STATE.crew.includes('engineer') ? ' · ' + concernText([{ label: 'ENGINEER', v: concernAmount(c.morale) }]) + ' MORALE' : '';
  }
  function repairLockReason() {
    const m = STATE.materials || {};
    if (STATE.resources.hull >= resMax('hull')) return 'Hull is intact';
    if ((m.metal || 0) < REPAIR_COST.metal || (m.scrap || 0) < REPAIR_COST.scrap) return 'Need 2 metal + 1 scrap';
    return null;
  }
  function handleRepairVerb() {
    if (repairLockReason()) return;
    openEngineRepair((result) => {
      result = result || {};
      const n = result.fixedCount | 0;
      if (n === 0) { window.refundVerbTax(); activeVerb = null; renderCruise(); return; }
      if (!result.allFixed) return settleAbandoned('REPAIR');
      for (const [mat, q] of Object.entries(REPAIR_COST)) STATE.materials[mat] = Math.max(0, (STATE.materials[mat] || 0) - q);
      // Engineer aboard: the patch goes further (+10, captain half).
      const before = STATE.resources.hull;
      STATE.resources.hull = clamp(STATE.resources.hull + repairHullGain(), 0, resMax('hull'));
      const gain = Math.round(STATE.resources.hull - before); // the log reports what actually landed
      repairLift(); // the engineer minds a finished repair (ruling 77)
      settleMinigame('◆ REPAIR — ' + (result.allFixed ? 'all four systems nominal' : n + '/4 faults cleared') + ', hull patched (+' + gain + ').');
    });
  }

  function handleForageVerb() {
    const regionKey = currentRegionKey();
    const mode = REGION_TO_FORAGE_MODE[regionKey] || 'GATHER';
    const alien = regionKey === 'planet_orbit_alien';
    const label = (FORAGE_LABEL_BY_REGION[regionKey] || mode);
    // regionLabel: the forage HUD names the real stop (parity-shell); minigames.js appends ' · MODE'.
    const hudPlace = alien ? 'ALIEN WORLD' : (REGIONS[regionKey] || REGIONS.deep_space).label.split(' · ')[0];
    // The side rolls (alien poisoning, the fungus) are made once, when the
    // result card shows them, and the close applies the same rolls. A good
    // forage on alien ground can turn up the suspicious fungus (the chef's
    // Secret Project — event_shipboard_016); its items.json find_odds.forage
    // is the chance.
    let side = null;
    const rollSide = tier => side || (side = {
      poison: alien && Math.random() < ALIEN_POISON_CHANCE,
      fungus: tier !== 'poor' && (regionKey === 'anomaly' || regionKey === 'planet_orbit_habitable' || alien) &&
        !STATE.items.includes('suspicious_fungus') && Math.random() < itemFindOdds('suspicious_fungus', 'forage'),
    });
    // The fungus is granted before the rare finds, so the card's room check is the real one.
    const fungusFits = () => { STATE.items.push('suspicious_fungus'); const fits = cargoSlotsUsed() <= cargoCapacity(); STATE.items.pop(); return fits; };
    const resultLines = tier => {
      if (tier === 'abandoned') return [];
      const r = rollSide(tier), out = [];
      // Anyone aboard — the captain included (owner ruling 29).
      if (r.poison && peopleAboard().length) out.push({ text: 'POISONING · someone aboard · alien ground', tone: 'red' });
      if (r.fungus) out.push(fungusFits() ? 'FIND · a fungus nobody can name' : { text: 'FIND · a fungus nobody can name · CARGO FULL, LEFT BEHIND', tone: 'orange' });
      return out;
    };
    openMinigame('forage', { mode, regionLabel: hudPlace, resultLines }, (tier, payload) => {
      if (tier === 'abandoned') return settleAbandoned(label, payload && payload.harm);
      payload = payload || {};
      const r = rollSide(tier);
      const fungus = r.fungus && grantItem('suspicious_fungus');
      let foodGot = 0; // what actually lands (the tank caps)
      if (typeof payload.food === 'number' && payload.food > 0) {
        const f0 = STATE.resources.food;
        STATE.resources.food = clamp(STATE.resources.food + payload.food, 0, resMax('food'));
        foodGot = Math.round(STATE.resources.food - f0);
      }
      // Forage's rare finds are demo ids with no items.json entry — granting
      // them raw put phantom, unsellable cargo in the hold. Map each to a
      // real reward (demo ware ids never enter STATE).
      const RARE_TO_REAL = { cred_chip: { gold: 10 }, data_fragment: { item: 'logbook_fragment' }, salt_crystal: { material: 'minerals', qty: 2 }, med_herb: { item: 'medkit' } };
      if (payload.rare_drops) payload.rare_drops.forEach(d => {
        const r = RARE_TO_REAL[d.id] || {};
        if (r.gold) STATE.goldAmount += r.gold;
        if (r.material) grantMaterial(r.material, r.qty || 1); // materials are cargo: capacity-enforced, a refusal is logged
        if (r.item) grantItem(r.item); // capacity-enforced
      });
      const poisoned = [];
      if (payload.sickness) payload.sickness.forEach(s => {
        // Owner ruling 2026-10-11: the demo's numbers (demo-minigames forage
        // payload contract) — poisoning ~10/20/35 HP, morale 5/12/20.
        const hpHit = POISON_HP[s.severity] || POISON_HP.light;
        const moHit = { light: 5, medium: 12, heavy: 20 }[s.severity] || 5;
        // Poisoning hurts one person aboard (the demo's "SICKNESS · -HP one
        // crew") — the captain can be the one (owner ruling 29), and a
        // solo captain always is. The log names who, and what it cost.
        if (s.type === 'poisoning') poisoned.push(poisonLine(hpHit));
        else addCrewMorale(-moHit); // morale_drop 'all_crew': every crew member (none aboard: nobody to sour)
      });
      let gained = foodGot > 0 ? ('+' + foodGot + ' food.') : payload.food > 0 ? 'found food, but the stores are full.' : 'came back empty-handed.';
      for (const line of poisoned) if (line) gained += ' ' + line;
      // Alien world (the red risky strip, Bible "FORAGE — clicker w/
      // poison-roll"): one roll in four, something in the haul poisons a
      // crew member — the minigame's medium sickness (anyone aboard, the captain too).
      if (r.poison) {
        const line = poisonLine(ALIEN_POISON_HP);
        if (line) gained += ' ' + line;
      }
      if (fungus) gained += ' Also: a fungus nobody can name. The chef has asked to keep it.';
      settleMinigame('◆ ' + label + ' — ' + gained);
    });
  }
  // One poisoning on someone aboard at random (the captain included): the
  // forage log line naming who it was and the HP it really cost (after a
  // medic's softening), or that it killed them. '' with nobody aboard.
  function poisonLine(hp) {
    const pool = peopleAboard();
    if (!pool.length) return '';
    const who = pool[Math.floor(Math.random() * pool.length)];
    const name = who === 'captain' ? 'you' : crewNameOf(who);
    const before = hpOf(who);
    damageCrew(who, hp);
    if (!peopleAboard().includes(who)) return 'Something in the haul killed ' + name + '.';
    return 'Something in the haul disagreed with ' + name + ' (−' + Math.round(before - hpOf(who)) + ' HP).';
  }

  function handleSalvageVerb() {
    // In a hulk the game plays inside it, with the derelict's loot set.
    const inHulk = currentRegionKey() === 'derelict';
    openMinigame('salvage', inHulk ? { setting: 'derelict' } : {}, (tier, payload) => {
      if (tier === 'abandoned') return settleAbandoned('SALVAGE');
      // Grant exactly the haul card's contents: materials stock, upgrade
      // items (capacity-enforced), O₂ tanks as air, gold chips as gold;
      // 'useless_scrap' is what it says. No payload → the old tier table.
      const haul = (payload && payload.salvage) || { perfect: { metal: 3, scrap: 2 }, good: { metal: 2 }, poor: { scrap: 1 } }[tier] || {};
      const MATS = new Set(MOD.materials.materials.map(m => m.id));
      const TANK_O2 = { tank_s: 4, tank_m: 8, tank_l: 12 };
      const got = [];
      // Materials are cargo (owner ruling 2026-10-11): one capacity-enforced
      // grant for the whole haul; grantMaterials logs what stays behind.
      const matRes = grantMaterials(Object.fromEntries(Object.entries(haul).filter(([k, q]) => q && MATS.has(k))));
      applyAlienFind(matRes.got); // the xenobiologist's concern (ruling 57)
      for (const [key, qty] of Object.entries(haul)) {
        if (!qty) continue;
        if (MATS.has(key)) { if (matRes.got[key]) got.push(matRes.got[key] + ' ' + key); }
        // Derelict hold: fuel cells and ration cans arrive as units of
        // fuel / food (the haul card's numbers); the tanks cap.
        else if (key === 'fuel' || key === 'food') { const b = STATE.resources[key]; STATE.resources[key] = clamp(b + qty, 0, resMax(key)); const d = Math.round(STATE.resources[key] - b); got.push(d > 0 ? '+' + d + ' ' + key : key + ', but the tank is full'); }
        else if (key in TANK_O2) { const o0 = STATE.resources.o2; STATE.resources.o2 = clamp(STATE.resources.o2 + TANK_O2[key] * qty, 0, 100); const d = Math.round(STATE.resources.o2 - o0); got.push(d > 0 ? '+' + d + ' O₂' : 'O₂ tanks, but the air is full'); }
        else if (key === 'gold') { STATE.goldAmount += 5 * qty; got.push(5 * qty + 'g'); }
        else if (key !== 'useless_scrap') { let n = 0; for (let i = 0; i < qty; i++) if (grantItem(key) !== false) n++; if (n) got.push(key.replace(/_/g, ' ')); }
      }
      // Wrecks hold curiosities the fence pays for: on a good haul each
      // item with an items.json find_odds.salvage gets its own roll.
      if (tier !== 'poor') {
        for (const cur of itemsFoundBy('salvage')) {
          if (Math.random() < itemFindOdds(cur, 'salvage') && grantItem(cur)) got.push(cur.replace(/_/g, ' '));
        }
      }
      renderHUD();
      settleMinigame('◆ SALVAGE — recovered ' + (got.join(', ') || 'nothing usable') + '.');
    });
  }

  function handleMineVerb() {
    openMining((haul) => {
      haul = haul || {};
      const inv = haul.inventory || {};
      const granted = [], noRoom = [];
      // Materials are cargo (owner ruling 2026-10-11): the haul comes aboard
      // as far as the hold allows; grantMaterials logs what stays behind.
      const res = grantMaterials(inv);
      applyAlienFind(res.got); // the xenobiologist's concern (ruling 57)
      for (const [mat, qty] of Object.entries(inv)) {
        if (!qty) continue;
        if (res.got[mat]) granted.push(res.got[mat] + ' ' + mat);
        else noRoom.push(mat);
      }
      if (!granted.length && !noRoom.length && !(haul.runs > 0)) { window.refundVerbTax(); activeVerb = null; renderCruise(); return; } // LEAVE with no run made — no time cost either
      // Bible multi-path rule: asteroid ice melts into water, a nebula
      // run scoops fuel — scaled by how much was mined (cap 15).
      const mined = Object.values(inv).reduce((a, b) => a + (b || 0), 0);
      const side = Math.min(15, Math.round(mined / 2));
      const region = currentRegionKey();
      // The log reports what actually went in (tanks cap).
      const gain = (k, max) => { const b = STATE.resources[k]; STATE.resources[k] = clamp(b + side, 0, max); return Math.round(STATE.resources[k] - b); };
      if (side > 0 && region === 'asteroid_field') {
        const got = gain('water', 100);
        granted.push(got > 0 ? 'ice melted for +' + got + ' water' : 'ice, but the water tanks are full');
      } else if (side > 0 && region === 'nebula') {
        const got = gain('fuel', resMax('fuel'));
        granted.push(got > 0 ? '+' + got + ' fuel scooped from the gas' : 'gas, but the fuel tank is full');
      }
      // One day per mining run: unlimited MINE AGAIN runs for a single
      // day are a gold and fuel faucet (economy sim).
      const runs = Math.max(1, haul.runs || 1);
      const parts = [];
      if (granted.length) parts.push('recovered ' + granted.join(', '));
      if (noRoom.length) parts.push('no room in the hold for ' + noRoom.join(' or '));
      settleMinigame('◆ MINE — ' + (runs > 1 ? runs + ' runs, ' + runs + ' days: ' : '') + (parts.length ? parts.join('; ') : 'the rocks gave up nothing') + '.' + (haul.summary ? ' ' + haul.summary : ''), runs); // summary: tier · sector · crew credit (mining.js, parity-shell)
    });
  }

  // TRADE — summons the trader scenario at this node (reuses the full
  // layered encounter rather than a bare market screen; the trader IS
  // the market). Only offered while a trader is in range (the stop's
  // presence roll, or one a WAIT brought in); stations always trade.
  function handleTradeVerb() {
    // Docked at a station, the market is the station's own Market Row
    // (a vendor in person at a stall); anywhere else a trader ship
    // answers the call.
    const here = STATE.byId[STATE.currentId];
    // Away from a station: this stop's trader (ruling 90 — one of the trader family, the same one all stop).
    const ev = (here && here.node_type === 'station' && EVENTS['event_station_013']) || familyEvent('trader', here) || EVENTS['event_encounter_trader_001'];
    if (!ev) { pushLogEntry('◆ No traders registered on this route.'); return; }
    closeStopMenu();
    enterEvent(STATE.byId[STATE.currentId], ev);
  }


  // FABRICATOR stays a Stop Menu verb rather than moving to a separate
  // bottom-row ship-system button (Bible §18's original design) — Cruise
  // only exists while the ship is stopped between legs in this engine
  // (there's no continuous "moving" state to gate against), so the extra
  // UI real estate a bottom-row button would need doesn't buy anything
  // here. Matches what Phase 2 already scaffolded (fab was already in
  // every region's STOP_VERBS list before Phase 4 wired it up).
  function handleFabricatorVerb() { openFabricator(); }

  // MEDBAY (stations only) — the Bible §7 recovery path besides the
  // medic's skill: for a flat fee, the worst-hurt crew member is
  // treated to full HP, which also closes a delayed-severity wound
  // before it comes due. No time cost — the Bible prices it in credits.
  const MEDBAY_BASE = 30;
  const medbayFee = () => stationPrice(MEDBAY_BASE); // CHIP / merchant discounts
  // Everyone aboard — the captain is a patient too (owner ruling 29/30).
  function medbayPatient() {
    let worst = null;
    for (const r of peopleAboard()) if (hpOf(r) < 100 && (!worst || hpOf(r) < hpOf(worst))) worst = r;
    return worst;
  }
  function medbayLockReason() {
    if (!medbayPatient()) return 'Nobody is hurt';
    if (STATE.goldAmount < medbayFee()) return 'Costs ' + medbayFee() + 'g';
    return null;
  }
  function handleMedbayVerb() {
    const r = medbayPatient();
    if (!r) { pushLogEntry('◆ MEDBAY — the duty nurse looks your crew over and finds nothing to bill. They seem disappointed.'); return; }
    if (STATE.goldAmount < medbayFee()) { pushLogEntry('◆ MEDBAY — treatment is ' + medbayFee() + 'g, payable in advance. You have ' + STATE.goldAmount + 'g. The nurse has heard every story.'); return; }
    // The whole crew, for one fee: one patient for 30g would be strictly
    // worse than a 12g medkit from the same station's shelf.
    STATE.goldAmount -= medbayFee();
    const treated = peopleAboard().filter(x => hpOf(x) < 100);
    for (const x of treated) { setHP(x, 100); if (STATE.crewPending) delete STATE.crewPending[x]; }
    const who = treated.map((x, i) => i ? personName(x) : PersonName(x));
    const list = who.length > 1 ? who.slice(0, -1).join(', ') + ' and ' + who[who.length - 1] : who[0]; // "A, B and C"
    pushLogEntry('◆ MEDBAY — ' + list + (treated.length > 1 ? ' are' : ' is') + ' treated, stitched and discharged with a lollipop each. −' + medbayFee() + 'g.');
    renderHUD();
    renderCruise();
    renderStopMenu(); // the verb re-gates (nobody hurt / can't afford)
  }

  // FAB SERVICE (stations only) — the station overhaul the fabricator's
  // own wear warning promises ("repair needed at next station"): wear
  // back to 0, a broken fab working again. Flat fee, no time cost.
  const FAB_SERVICE_BASE = 40;
  const fabServiceFee = () => stationPrice(FAB_SERVICE_BASE);
  function fabServiceLockReason() {
    if (fabGoodAsNew()) return 'Fabricator is good as new';
    if (STATE.goldAmount < fabServiceFee()) return 'Costs ' + fabServiceFee() + 'g';
    return null;
  }
  function handleFabServiceVerb() {
    if (fabServiceLockReason()) return;
    STATE.goldAmount -= fabServiceFee();
    STATE.fabricator.wear = 0;
    STATE.fabricator.broken = false;
    pushLogEntry('◆ FAB SERVICE — station techs strip the fabricator, swear at it professionally, and hand it back at zero wear. −' + fabServiceFee() + 'g.');
    renderHUD();
    renderCruise();
    renderStopMenu();
  }

  // CONDENSE (nebulae, Atmospheric Condenser upgrade — Bible multi-path
  // rule's canonical upgrade-gated verb): a day of work, +12 water.
  function condenseLockReason() {
    if (!STATE.items.includes('atmospheric_condenser')) return 'Need: Atmospheric Condenser';
    if (STATE.resources.water > resMax('water') - 8) return 'Water tanks are nearly full'; // a day for under 8 water isn't a trade
    return null;
  }
  function handleCondenseVerb() {
    if (condenseLockReason()) return;
    const before = STATE.resources.water;
    STATE.resources.water = clamp(before + 12, 0, 100);
    settleMinigame('◆ CONDENSE — a day of the condenser hissing at the nebula. +' + Math.round(STATE.resources.water - before) + ' water, faintly violet.');
  }
  // DRYDOCK (stations — Bible multi-path rule "station drydock (gold)").
  const DRYDOCK_BASE = 30;
  // Pro-rated: the full fee buys +30; topping off a few points costs less
  // (it charged 30g for +1 at 104/105).
  const drydockFee = () => {
    const missing = Math.max(0, resMax('hull') - STATE.resources.hull);
    return stationPrice(Math.max(5, Math.ceil(DRYDOCK_BASE * Math.min(30, missing) / 30)));
  };
  function drydockLockReason() {
    if (STATE.resources.hull >= resMax('hull')) return 'Hull is intact';
    if (STATE.goldAmount < drydockFee()) return 'Costs ' + drydockFee() + 'g';
    return null;
  }
  function handleDrydockVerb() {
    if (drydockLockReason()) return;
    const fee = drydockFee(); // priced on the gap before the weld (the log reports what was charged)
    STATE.goldAmount -= fee;
    const before = STATE.resources.hull;
    STATE.resources.hull = clamp(STATE.resources.hull + 30, 0, resMax('hull'));
    pushLogEntry('◆ DRYDOCK — station crews weld, rivet and invoice. +' + Math.round(STATE.resources.hull - before) + ' hull, −' + fee + 'g.');
    repairLift(); // the engineer minds a finished repair (ruling 77)
    renderHUD();
    renderCruise();
    renderStopMenu();
  }


  // REST and WAIT FOR TRADER aren't one-click handlers: they open the
  // 1–7 day picker and run as multi-day waits (below).
  const VERB_HANDLERS = { condense: handleCondenseVerb, drydock: handleDrydockVerb, fab_service: handleFabServiceVerb, medbay: handleMedbayVerb, mine: handleMineVerb, scan: handleScanVerb, repair: handleRepairVerb, forage_food: handleForageVerb, salvage: handleSalvageVerb, fab: handleFabricatorVerb, trade: handleTradeVerb };
  const WAIT_VERBS = { wait_for_trader: 1, rest: 1 };

  function currentRegionKey() {
    const node = STATE.byId && STATE.byId[STATE.currentId];
    const region = NODE_TYPE_TO_REGION[node && node.node_type] || 'deep_space';
    // The planet's biome is the node's own sticky pick (scene_art.js) —
    // the same one its approach view and landing scenes show.
    if (region === 'planet_orbit_habitable' && SceneArt.biomeFor(null, node) === 'alien') return 'planet_orbit_alien';
    if (region === 'debris_field' && derelictFormOf(node) === 'hulk') return 'derelict';
    return region;
  }
  /* A derelict stop is one of two things, fixed per stop (the run's art
     seed + the node, so a reload or revisit agrees): a hulk still in one
     piece (DERELICT — SALVAGE boards it: the derelict salvage game, owner
     ruling 2026-10-11 #12) or one already broken up (DEBRIS FIELD —
     SALVAGE sweeps the drift outside: the space salvage game). Derelict
     nodes are the only debris fields the map makes, so the split keeps
     both games (and both sprite sets) in play. Three in five are hulks. */
  const DERELICT_HULK_SHARE = 0.6;
  function derelictFormOf(node) {
    if (!node || node.node_type !== 'derelict') return null;
    const key = String((STATE && STATE.artSeed) || 0) + '|derelict-form|' + node.id;
    let h = 2166136261 >>> 0; // FNV-1a, as scene_art.js's stable picks
    for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 13;
    return ((h >>> 0) % 1000) / 1000 < DERELICT_HULK_SHARE ? 'hulk' : 'debris';
  }

  /* ── Multi-day waits: WAIT FOR TRADER and REST (demo ~2757-3113,
     Bible §18 "Trader-wait twist" + "Multi-day action interrupt rule").
     The player picks 1–7 days; each day ticks for real (passDays: food,
     water, O2, rations morale, deprivation — the deadline moves), about
     1.5s apiece, held while the game is paused or a modal is open.
     • WAIT FOR TRADER rolls a region-modulated chance each day; a hit
       brings a trader in range (TRADE now shows) and opens the trader.
     • REST pays its morale when the rest is done: +REST_MORALE_PER_DAY
       a day (+2 with a chef aboard). WAKE UP early gains nothing (owner
       rule: quitting gains nothing and costs the time).
     • Waiting is not safe (Bible): each day also rolls for a pirate, a
       distress call or an anomalous drift — a real engine event, picked
       only from events eligible at this stop. It ends the wait (REST
       keeps the days it got, pro rata, per the interrupt rule) and puts
       the ship in the forced-event state below until the player answers.
     • STOP WAITING / WAKE UP / Resume cancel: the days spent stay spent.
     Docked at a station nothing interrupts (and a trader is always in). */
  const WAIT_TICK_MS = 1500, WAIT_DAY_MAX = 7;
  const TRADER_DAILY_CHANCE = {
    planet_orbit_habitable: 0.75, debris_field: 0.65, derelict: 0.65, asteroid_field: 0.60,
    nebula: 0.55, planet_orbit_alien: 0.45, deep_space: 0.35, anomaly: 0,
  };
  const INTERRUPT_DAILY_CHANCE = {
    station_approach: 0, planet_orbit_habitable: 0.04, planet_orbit_alien: 0.06,
    asteroid_field: 0.06, debris_field: 0.06, derelict: 0.06, nebula: 0.06, deep_space: 0.08, anomaly: 0.09,
  };
  const REST_MORALE_PER_DAY = 6;
  function restPerDay() { return REST_MORALE_PER_DAY + Math.round(2 * passiveMult('chef')); } // wounded chef: halved
  const WAIT_CFG = {
    wait_for_trader: {
      label: 'WAITING FOR TRADER', picker: 'WAIT HOW MANY DAYS?',
      startLog: d => '▶ Captain orders the ship parked. Waiting for a trader (' + d + ' day cap).',
      timeoutFlash: 'NO ONE CAME', timeoutVariant: 'timeout',
      cancelLabel: 'STOP WAITING', cancelSub: 'Call it off. No trader, and the days already spent stay spent.',
    },
    rest: {
      label: 'RESTING', picker: 'REST HOW MANY DAYS?',
      startLog: d => '▶ Crew stands down for ' + d + ' day' + (d === 1 ? '' : 's') + '. Lights low. Time soft.',
      timeoutFlash: 'REFRESHED', timeoutVariant: 'success',
      cancelLabel: 'WAKE UP', cancelSub: 'Cut rest short. Nobody is rested yet; the days are gone all the same.',
    },
  };
  // During-wait events. Weights are relative (the daily chance above is
  // whether anything comes at all); each kind fires a real event, drawn
  // from those eligible here (node type, once-only, flags).
  const WAIT_EVENTS = {
    pirate: {
      weight: 5, events: () => Object.values(EVENTS).filter(e => e.family === 'pirate').map(e => e.id), // ruling 90: any of the pirate family
      log: 'Pirate signature on long-range scan. They saw you sitting still.',
      flash: 'PIRATE INBOUND', variant: 'event-danger',
      ticker: 'PIRATE SIGNATURE — WEAPONS HOT',
    },
    distress: {
      weight: 3, events: () => ['event_encounter_drifter_001'],
      log: 'Distress call on an open channel. Someone, somewhere, needs help.',
      flash: 'DISTRESS CALL', variant: 'event',
      ticker: 'DISTRESS CALL — OPEN CHANNEL',
    },
    anomaly: {
      weight: 2, events: () => Object.keys(EVENTS).filter(id => /^event_anomaly_/.test(id)),
      log: 'Anomalous drift current bumps the ship. Instruments disagree about which way is up.',
      flash: 'ANOMALY', variant: 'event',
      ticker: 'ANOMALOUS DRIFT — INSTRUMENTS DISAGREE',
    },
  };
  function waitEventPick() {
    const node = STATE.byId && STATE.byId[STATE.currentId];
    if (!node) return null;
    const trig = activeTriggers();
    // The repeat cooldown (ruling 65) holds here too: an interrupt is the
    // world firing an event. A kind with nothing off cooldown sits out.
    const gap = repeatGaps(currentStop()), N = repeatCooldownStops();
    const kinds = [];
    for (const [kind, d] of Object.entries(WAIT_EVENTS)) {
      const ids = d.events().filter(id => EVENTS[id] && eventEligible(EVENTS[id], node, trig) && (EVENTS[id].once || gap(EVENTS[id]) > N));
      if (ids.length) kinds.push({ kind, d, ids });
    }
    if (!kinds.length) return null;
    let r = Math.random() * kinds.reduce((s, k) => s + k.d.weight, 0);
    let pick = kinds[kinds.length - 1];
    for (const k of kinds) { r -= k.d.weight; if (r < 0) { pick = k; break; } }
    const fresh = pick.ids.filter(id => !STATE.seenEventIds.has(id));
    const pool = fresh.length ? fresh : pick.ids;
    return { kind: pick.kind, ev: pool[Math.floor(Math.random() * pool.length)] };
  }
  const CRUISE_WAIT_TUNING = { WAIT_TICK_MS, WAIT_DAY_MAX, TRADER_PRESENT_CHANCE, TRADER_DAILY_CHANCE, INTERRUPT_DAILY_CHANCE, REST_MORALE_PER_DAY };

  let activeWait = null; // { verbId, days, day, node, region, timer, resolving, finish }
  let bannerTimer = null;
  const waitHeld = () => PauseBus.paused || !cruiseVisible() || overlayOpen();
  function showActionBanner(label, day, days) {
    clearTimeout(bannerTimer);
    const b = $('action-banner');
    b.classList.remove('cancelled');
    $('action-banner-label').textContent = label;
    $('action-banner-counter').textContent = 'DAY ' + day + ' / ' + days;
    $('action-banner-fill').style.width = Math.min(100, day / days * 100).toFixed(1) + '%';
    b.classList.add('show');
  }
  function hideActionBanner() { $('action-banner').classList.remove('show'); }
  const FLASH_VARIANTS = ['success', 'timeout', 'event', 'event-danger'];
  function showWaitFlash(text, variant) {
    const el = $('wait-flash');
    el.querySelector('.wait-flash-label').textContent = text;
    el.classList.remove(...FLASH_VARIANTS);
    el.classList.add(variant, 'show');
  }
  function hideWaitFlash() {
    const el = $('wait-flash');
    el.classList.remove('show');
    setTimeout(() => { if (!el.classList.contains('show')) el.classList.remove(...FLASH_VARIANTS); }, 600);
  }
  // A timer step that waits out a pause / an open modal before it lands.
  function whenFree(fn, ms) {
    const a = activeWait;
    const go = () => { if (activeWait !== a) return; if (waitHeld()) { a.timer = setTimeout(go, 250); return; } fn(); };
    a.timer = setTimeout(go, ms);
  }

  // Day picker — the verb's button swaps its rows for a 1..7 stepper
  // (demo enterDayPickerMode). A day commits; a click anywhere else
  // collapses it. Steps are role=button spans, not nested <button>s.
  function openDayPicker(btn, verbId) {
    document.querySelectorAll('#stop-choices .stop-choice.day-picker').forEach(collapseDayPicker);
    btn.classList.add('day-picker');
    btn._origHTML = btn.innerHTML;
    const gate = btn.querySelector('.stop-choice-gate');
    btn.innerHTML = '';
    if (gate) btn.appendChild(gate);
    const body = document.createElement('div');
    body.className = 'stop-choice-body';
    body.textContent = WAIT_CFG[verbId].picker;
    btn.appendChild(body);
    const stepper = document.createElement('div');
    stepper.className = 'day-stepper';
    for (let d = 1; d <= WAIT_DAY_MAX; d++) {
      const step = document.createElement('span');
      step.className = 'day-step';
      step.setAttribute('role', 'button');
      step.tabIndex = 0;
      step.textContent = String(d);
      step.title = d + ' day' + (d === 1 ? '' : 's') + (verbId === 'rest' ? ' · +' + restPerDay() * d + ' morale if you sleep it through' : '');
      step.addEventListener('click', e => { e.stopPropagation(); startWait(verbId, d); });
      step.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); startWait(verbId, d); } });
      stepper.appendChild(step);
    }
    btn.appendChild(stepper);
    btn._outside = e => { if (!btn.contains(e.target)) collapseDayPicker(btn); };
    setTimeout(() => document.addEventListener('click', btn._outside, true), 0);
  }
  function collapseDayPicker(btn) {
    if (!btn.classList.contains('day-picker')) return;
    btn.classList.remove('day-picker');
    if (btn._origHTML != null) { btn.innerHTML = btn._origHTML; btn._origHTML = null; }
    if (btn._outside) { document.removeEventListener('click', btn._outside, true); btn._outside = null; }
  }

  function startWait(verbId, days) {
    if (activeWait || STATE.forcedEvent || STATE.ended) return;
    const cfg = WAIT_CFG[verbId];
    if (!cfg) return;
    if (verbId === 'rest' && restLockReason()) return;
    if (verbId === 'wait_for_trader' && traderHere()) return;
    document.querySelectorAll('#stop-choices .stop-choice.day-picker').forEach(collapseDayPicker);
    days = Math.max(1, Math.min(WAIT_DAY_MAX, days | 0));
    // The verb's effort tax, once for the whole wait (it's one decision).
    payEffortTax(STOP_VERBS[verbId].effort);
    activeWait = { verbId, days, day: 0, node: STATE.currentId, region: currentRegionKey(), timer: null, resolving: false, finish: null };
    pushLogEntry(cfg.startLog(days));
    const fill = $('action-banner-fill');
    fill.style.transition = 'none'; fill.style.width = '0%'; void fill.offsetWidth; fill.style.transition = '';
    showActionBanner(cfg.label, 0, days);
    renderHUD();
    // Deferred: rebuilding the column inside the step's click would put
    // STOP WAITING under the same click (demo note).
    setTimeout(() => { if (isStopped()) renderStopMenu(); }, 0);
    syncPaused();
    activeWait.timer = setTimeout(waitTick, WAIT_TICK_MS);
  }

  function waitTick() {
    const a = activeWait;
    if (!a || a.resolving) return;
    if (STATE.ended || STATE.currentId !== a.node) { stopWaitSilently(); return; }
    if (waitHeld()) { a.timer = setTimeout(waitTick, 250); return; }
    a.day++;
    // Saved with the day (renderCruise autosaves): a reload mid-wait is a
    // call-off, and loadRun says so in the log.
    STATE.waitInProgress = { verb: a.verbId, day: a.day, days: a.days };
    passDays(1);
    renderHUD();
    showActionBanner(WAIT_CFG[a.verbId].label, a.day, a.days);
    if (checkFailure()) { stopWaitSilently(); return; }
    renderCruise(); // the day's drain on the card/bars; autosave (a reload mid-wait = called off)
    if (a.verbId === 'wait_for_trader' && Math.random() < (TRADER_DAILY_CHANCE[a.region] || 0)) return traderArrives(a);
    if (Math.random() < (INTERRUPT_DAILY_CHANCE[a.region] || 0)) {
      const pick = waitEventPick();
      if (pick) return interruptWait(a, pick);
    }
    if (a.day >= a.days) return waitTimeout(a);
    a.timer = setTimeout(waitTick, WAIT_TICK_MS);
  }

  function traderArrives(a) {
    a.resolving = true;
    STATE.waitInProgress = null; // resolved (its own saves follow): not a call-off
    STATE.traderAt = STATE.traderAt || {};
    STATE.traderAt[a.node] = true;
    pushLogEntry('▶ A trader has appeared after ' + a.day + ' day' + (a.day === 1 ? '' : 's') + ' of waiting.');
    saveRun(); // a reload in the flash keeps the trader here (TRADE)
    // leaving = the player Resumed during the flash: the trader stays
    // behind at this stop (TRADE), the ship goes.
    a.finish = leaving => {
      clearTimeout(a.timer);
      hideWaitFlash(); hideActionBanner();
      activeWait = null; STATE.waitInProgress = null;
      renderCruise();
      if (leaving || STATE.ended) return;
      const ev = familyEvent('trader', STATE.byId[STATE.currentId]) || EVENTS.event_encounter_trader_001;
      if (ev) { closeStopMenu(); enterEvent(STATE.byId[STATE.currentId], ev); }
      else renderStopMenu();
    };
    whenFree(() => { showWaitFlash('TRADER APPROACHING', 'success'); whenFree(() => a.finish(false), 2000); }, 600);
  }

  function interruptWait(a, pick) {
    a.resolving = true;
    STATE.waitInProgress = null; // resolved (its own saves follow): not a call-off
    const d = WAIT_EVENTS[pick.kind];
    pushLogEntry('▶ ' + d.log);
    // Bible interrupt rule: an interrupted action yields pro rata.
    if (a.verbId === 'rest') {
      const got = Math.round(addCrewMorale(restPerDay() * a.day)); // every crew member
      pushLogEntry('▶ Rest broken after ' + a.day + ' day' + (a.day === 1 ? '' : 's') + (got > 0 ? ' — morale +' + got + '.' : '.'));
      renderHUD();
    }
    // The event is the ship's business from this moment (saved: a reload
    // opens it). Red ticker + Stop pulse through the alert flash; Resume
    // there shakes (CANNOT RESUME). After the flash the event opens
    // straight away (owner ruling 46a — no one-verb menu in between).
    STATE.forcedEvent = { kind: pick.kind, ev: pick.ev, node: a.node };
    saveRun(); // the event and the rest so far: a reload opens it, keeps the morale
    document.body.classList.add('event-active');
    syncTicker();
    a.finish = () => {
      clearTimeout(a.timer);
      hideWaitFlash(); hideActionBanner();
      activeWait = null; STATE.waitInProgress = null;
      resolveForced();
    };
    whenFree(() => { showWaitFlash(d.flash, d.variant); whenFree(() => a.finish(false), 2000); }, 600);
  }

  function waitTimeout(a) {
    a.resolving = true;
    STATE.waitInProgress = null; // resolved (its own saves follow): not a call-off
    const cfg = WAIT_CFG[a.verbId];
    if (a.verbId === 'rest') {
      const got = Math.round(addCrewMorale(restPerDay() * a.days)); // every crew member
      pushLogEntry('▶ Crew rested ' + a.days + ' day' + (a.days === 1 ? '' : 's') + '. Morale +' + got + (restPerDay() > REST_MORALE_PER_DAY ? ' (the chef cooked the good stuff).' : '.'));
    } else {
      pushLogEntry('▶ No one came. ' + a.days + ' day' + (a.days === 1 ? '' : 's') + ' parked; the dice do not apologize.');
    }
    renderHUD();
    saveRun(); // the rest's morale, before the flash
    a.finish = () => {
      clearTimeout(a.timer);
      hideWaitFlash(); hideActionBanner();
      activeWait = null; STATE.waitInProgress = null;
      renderCruise();
      if (isStopped()) renderStopMenu();
      syncPaused();
    };
    whenFree(() => { showWaitFlash(cfg.timeoutFlash, cfg.timeoutVariant); whenFree(() => a.finish(false), 2200); }, 800);
  }

  // STOP WAITING / WAKE UP (and Resume mid-wait): the days already
  // passed stay passed; nothing else comes of it.
  function cancelWait() {
    const a = activeWait;
    if (!a || a.resolving) return;
    clearTimeout(a.timer);
    activeWait = null; STATE.waitInProgress = null;
    const n = a.day, dd = n + ' day' + (n === 1 ? '' : 's');
    pushLogEntry(a.verbId === 'rest'
      ? '▶ Rest cut short after ' + dd + '. Nobody feels any better for it.'
      : '▶ Wait called off after ' + dd + '. No trader, and the days are gone.');
    const banner = $('action-banner');
    banner.classList.add('cancelled');
    $('action-banner-label').textContent = n ? 'WASTED ' + n + ' ' + (n === 1 ? 'DAY' : 'DAYS') + '!' : (a.verbId === 'rest' ? 'REST CANCELED' : 'WAIT CANCELED');
    $('action-banner-counter').textContent = '';
    hideWaitFlash();
    if (isStopped()) renderStopMenu();
    syncPaused();
    renderCruise();
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => {
      hideActionBanner();
      setTimeout(() => { if (!activeWait) banner.classList.remove('cancelled'); }, 400);
    }, 1500);
  }
  function stopWaitSilently() {
    if (activeWait) clearTimeout(activeWait.timer);
    activeWait = null; STATE.waitInProgress = null;
    hideWaitFlash(); hideActionBanner();
    syncPaused();
  }
  // index.html teardownLiveUI (pause → LOAD, new game): no wait may
  // resolve into the run that replaces this one.
  function abortCruiseWait() {
    stopWaitSilently();
    document.body.classList.remove('event-active');
    tickerKey = null;
  }
  const cruiseWaitActive = () => !!activeWait;
  const cruiseWaitState = () => activeWait && { verbId: activeWait.verbId, day: activeWait.day, days: activeWait.days, resolving: activeWait.resolving };

  // ── Forced-event state (demo ~1990-2062, 2131-2160; Bible Stop
  // Button State Machine "event" row). Entered only by a during-wait
  // event: red pulsing ticker and Stop button through the alert flash,
  // Resume blocked (the screen shakes, the ticker flashes CANNOT
  // RESUME), then the real encounter opens on its own (owner ruling 46a:
  // the demo's resolve-verb menu is skipped). After it the ship is back
  // at the hub, stopped, as after any event.
  function resolveForced() {
    const f = STATE.forcedEvent;
    if (!f) return;
    const ev = EVENTS[f.ev];
    STATE.forcedEvent = null;
    document.body.classList.remove('event-active');
    tickerKey = null;
    if (!ev) { renderCruise(); return; }
    closeStopMenu();
    noteEventDrawn(ev);
    enterEvent(STATE.byId[STATE.currentId], ev);
  }
  function shakeScreen() {
    const g = $('screen-cruise');
    g.classList.remove('shaking');
    void g.offsetWidth;
    g.classList.add('shaking');
    setTimeout(() => g.classList.remove('shaking'), 600);
  }
  function flashTickerWarning() {
    writeTicker('CANNOT RESUME — HANDLE EVENT FIRST', 'event');
    tickerKey = 'warning';
    clearTimeout(tickerWarnTimer);
    tickerWarnTimer = setTimeout(() => { if (tickerKey === 'warning') { tickerKey = null; syncTicker(); } }, 2400);
  }

  function choiceButton(o) {
    const btn = document.createElement('button');
    btn.className = 'stop-choice' + (o.variant ? ' ' + o.variant : '');
    const gate = document.createElement('div');
    gate.className = 'stop-choice-gate' + (o.locked ? ' locked' : '');
    if (o.icon) gate.style.backgroundImage = "url('sprites/interface/" + o.icon + ".png')";
    else if (o.glyph) gate.textContent = o.glyph;
    btn.appendChild(gate);
    const body = document.createElement('div');
    body.className = 'stop-choice-body';
    body.textContent = o.label;
    btn.appendChild(body);
    const sub = document.createElement('div');
    sub.className = 'stop-choice-sub';
    for (const part of o.parts || []) sub.appendChild(part);
    if (o.sub) {
      const s = document.createElement('span');
      s.className = 'stop-choice-desc';
      s.textContent = '· ' + o.sub;
      sub.appendChild(s);
    }
    btn.appendChild(sub);
    return btn;
  }
  const span = (cls, text) => { const s = document.createElement('span'); if (cls) s.className = cls; s.textContent = text; return s; };

  // Locked verb hover (demo-tooltip action_locked_*): danger tone, one
  // "Need" row per missing thing; a lock that isn't a need (a waved-off
  // berth, nobody to rest) just says why.
  function lockTip(label, reason) {
    let m, rows = [];
    if ((m = /^Need:?\s+(.+)$/.exec(reason))) rows = m[1].split(/\s+\+\s+/).map(v => ({ label: 'Need', value: v }));
    else if ((m = /^Costs (\d+)g$/.exec(reason))) rows = [{ label: 'Need', value: m[1] + ' gold' }];
    return { title: 'LOCKED — ' + label, description: rows.length ? 'You lack the resources to perform this action.' : reason + '.', rows, tone: 'danger' };
  }

  function renderStopMenu() {
    const regionKey = currentRegionKey();
    const region = REGIONS[regionKey] || REGIONS.deep_space;
    const list = $('stop-choices');
    list.innerHTML = '';

    $('stop-region-label').textContent = region.label;
    $('stop-region-mood').textContent = region.mood;

    // Mid-wait the column holds only the way to call it off.
    if (activeWait) {
      const cfg = WAIT_CFG[activeWait.verbId];
      const btn = choiceButton({ label: cfg.cancelLabel, sub: cfg.cancelSub, glyph: '✕', variant: 'risky' });
      btn.addEventListener('click', cancelWait);
      list.appendChild(btn);
      return;
    }

    region.verbs.forEach(verbId => {
      const verb = STOP_VERBS[verbId];
      if (!verb) return;
      if (verb.hideWhen && verb.hideWhen()) return;
      if (verb.requires && !verb.requires()) return;
      const labelStr = typeof verb.label === 'function' ? verb.label(regionKey) : verb.label;
      // A waved-off station (station.js): no berth, so its services are closed this stop.
      const lockReason = (STATION_SERVICE_VERBS.has(verbId) && atStation() && window.stationServicesClosed())
        ? 'Waved off — no berth here' : (verb.locked ? verb.locked() : null);
      const variant = lockReason ? null : (verb.variantBy && verb.variantBy(regionKey)) || (verb.hint ? 'hint' : null);
      const parts = [];
      if (lockReason) {
        parts.push(span('lock-need', '\u{1F512} ' + lockReason));
      } else {
        // The pips cost morale (Bible effort tax); the number says how much.
        parts.push(span('effort', effortPips(verb.effort) + (effortTax(verb.effort) ? ' −' + effortTax(verb.effort) + ' MO' : '')));
        if (verb.time) parts.push(span('verb-time', verb.time));
      }
      const subText = lockReason ? null : (typeof verb.sub === 'function' ? verb.sub(regionKey) : verb.sub);
      const btn = choiceButton({ label: labelStr, sub: subText, parts, variant, icon: lockReason ? 'lock' : (verb.icon || 'wait'), locked: !!lockReason });
      if (lockReason) { btn.classList.add('locked'); btn.tabIndex = -1; btn.setAttribute('aria-disabled', 'true'); }
      if (lockReason) Tooltip.attach(btn, lockTip(labelStr, lockReason));
      btn.setAttribute('data-verb-id', verbId);
      if (!lockReason && verb.effort) btn.title = 'Effort ' + verb.effort + '/5' + (effortTax(verb.effort) ? ' · costs ' + effortTax(verb.effort) + ' morale' + (verbId === 'fab' ? ' per craft' : WAIT_VERBS[verbId] ? ' for the whole wait' : '') : '') + ((verbId === 'repair' || verbId === 'drydock') ? repairLiftTip() : ''); // no crew aboard: no tax to state
      btn.addEventListener('click', () => {
        if (lockReason) return;
        if (btn.classList.contains('day-picker')) return; // picking days on this button
        if (WAIT_VERBS[verbId]) { openDayPicker(btn, verbId); return; }
        const handler = VERB_HANDLERS[verbId];
        // Effort tax on use (the fabricator charges per craft instead —
        // opening its screen to look costs nothing).
        if (handler && verbId !== 'fab') { const rc = {}; pendingVerbTax = payEffortTax(verb.effort, rc) ? rc : 0; renderHUD(); }
        activeVerb = labelStr;
        if (handler) handler();
        else pushLogEntry('◆ ' + labelStr + ' isn’t wired into the engine yet.');
      });
      list.appendChild(btn);
    });
    if (!list.children.length) {
      const empty = document.createElement('div');
      empty.className = 'stop-empty';
      empty.textContent = 'Nothing to do here.';
      list.appendChild(empty);
    }
  }

  function openStopMenu() {
    document.body.classList.add('stop-active');
    $('stop-btn').textContent = 'Resume';
    renderStopMenu();
    syncTicker();
    syncPaused();
    syncAiBubble();
    wakeStars(); // decelerate to a stop
  }

  /* AI speech bubble (owner ruling 91): the AI's lines at a stop — first-run
     tips, comments, warnings, callbacks — in a bubble with its portrait over
     the ship view, the newest three. Click or × dismisses; RESUME clears it
     (the lines stay in the log and the Ship's Log). */
  const AI_BUBBLE_MAX = 3;
  let aiBubbleLines = [];
  function queueAiBubble(text, voice, tip) {
    if (!text) return;
    aiBubbleLines.push({ text, voice, tip });
    // Over three: the oldest comment goes first; a first-run tip stays.
    while (aiBubbleLines.length > AI_BUBBLE_MAX) {
      const i = aiBubbleLines.findIndex(l => !l.tip);
      aiBubbleLines.splice(i >= 0 ? i : 0, 1);
    }
    syncAiBubble();
  }
  function clearAiBubble() { aiBubbleLines = []; syncAiBubble(); }
  function syncAiBubble() {
    const el = $('ai-bubble');
    if (!el) return;
    const show = aiBubbleLines.length > 0 && isStopped() && cruiseVisible();
    el.classList.toggle('show', show);
    if (!show) return;
    const ai = STATE.activeAI || 'marv';
    el.querySelector('.ai-bubble-avatar').style.backgroundImage = "url('" + (AI_SPRITE[ai] || AI_SPRITE.marv) + "')";
    // Ruling 32: a line that names its own AI carries no name chip.
    const named = aiBubbleLines.every(l => namesTheAI(l.text));
    const nameEl = el.querySelector('.ai-bubble-name');
    nameEl.textContent = named ? '' : ai.toUpperCase();
    nameEl.style.display = named ? 'none' : '';
    const lines = el.querySelector('.ai-bubble-lines');
    lines.innerHTML = '';
    for (const l of aiBubbleLines) { const p = document.createElement('p'); p.textContent = l.text; lines.appendChild(p); }
  }
  function closeStopMenu() {
    document.querySelectorAll('#stop-choices .stop-choice.day-picker').forEach(collapseDayPicker);
    if (activeWait && !activeWait.resolving) cancelWait();
    document.body.classList.remove('stop-active');
    $('stop-btn').textContent = 'Stop';
    syncTicker();
    syncPaused();
    wakeStars(); // spool back up
  }

  /* Pressing Stop/Resume while stopped means "resume course" — advance
     one leg via the real travelTo()/selectEvent() pool-draw (Phase 3).
     Forks resolve to 0 available targets until their own event sets
     chose_alpha/chose_beta — that's an honest content-state, not a bug
     here, so it just logs instead of forcing a route. A during-wait
     event blocks Resume outright (shake + CANNOT RESUME); a wait in
     progress is called off (its days stay spent). */
  function attemptResume() {
    if (STATE.forcedEvent) { shakeScreen(); flashTickerWarning(); return; } // the event opens when its flash ends
    if (activeWait && activeWait.resolving && activeWait.finish) activeWait.finish(true);
    if (activeWait) cancelWait();
    const nextIds = [...nextAvailableNodes()];
    if (nextIds.length === 0 && resolveStuckFork()) { closeStopMenu(); return; }
    if (nextIds.length !== 1) {
      pushLogEntry(nextIds.length === 0
        ? '◆ No route forward from here yet.'
        : '◆ Multiple routes ahead — check the map.');
      return;
    }
    closeStopMenu();
    clearAiBubble(); // this stop's lines are said; the next stop has its own
    markUnderway();
    travelTo(nextIds[0]);
  }

  $('stop-btn').addEventListener('click', () => {
    if (isStopped()) attemptResume();
    else { openStopMenu(); pushLogEntry('▶ Ship stopped by captain.'); }
  });


  /* ── AI universal pools (flavor_pools.json → ai_universal) ─────
     Wires the previously-unconsumed ambient/warning/crop pools into
     the cruise AI log. All draws keyed to STATE.activeAI. Called from
     renderCruise() — cheap, idempotent per condition (each warning
     fires once per downward threshold crossing, ambient once per node). */
  function aiPool(path) {
    let node = MOD.flavor && MOD.flavor.ai_universal;
    for (const k of path) { node = node && node[k]; }
    const pool = node && node[STATE.activeAI];
    return (Array.isArray(pool) && pool.length) ? pool[Math.floor(Math.random() * pool.length)] : null;
  }

  // Story-flag callbacks (owner ruling 2026-10-10): the AI brings up a
  // past choice (flavor_pools.flag_payoffs[flag].callback[ai]) — at least
  // two legs after it happened, each choice once.
  function maybePushCallback() {
    const pay = MOD.flavor && MOD.flavor.flag_payoffs;
    if (!pay) return false;
    STATE.flagFirstSeen = STATE.flagFirstSeen || {};
    STATE.calledBack = STATE.calledBack || [];
    const leg = STATE.visited ? STATE.visited.size : 0;
    for (const f of STATE.flags) if (pay[f] && !(f in STATE.flagFirstSeen)) STATE.flagFirstSeen[f] = leg;
    const ready = [...STATE.flags].filter(f => pay[f] && !STATE.calledBack.includes(f) && leg - STATE.flagFirstSeen[f] >= 2
      && pay[f].callback && pay[f].callback[STATE.activeAI]);
    if (!ready.length) return false;
    // Pacing (measured over 36 real runs): 35% per new stop, at least two
    // legs apart, and guaranteed after four quiet legs while a memory is
    // waiting — without the guarantee lunar runs often get none.
    const since = leg - (STATE.lastCallbackLeg != null ? STATE.lastCallbackLeg : -99);
    if (since < 2) return false;
    if (since < 4 && Math.random() >= 0.35) return false;
    STATE.lastCallbackLeg = leg;
    ready.sort((a, b) => (pay[b].weight || 1) - (pay[a].weight || 1));
    const f = ready[0];
    STATE.calledBack.push(f);
    pushLogEntry('◆ ' + pay[f].callback[STATE.activeAI], { ai: true });
    return true;
  }

  /* First-run tips (ruling 87): the AI says one tip, in its own voice, at
     the first new stop where the topic applies — the most urgent first,
     then the introductions one stop at a time. Each topic once per run
     (STATE.tipsShown, saved); the pause menu's SHOW TIPS switches them off
     (settings showTips). Lines: flavor_pools ai_universal.tips.<topic>. */
  const TIP_TOPICS = [
    { id: 'treat', when: () => !!(STATE.cropGrowth && STATE.cropGrowth.health > 0 && STATE.cropGrowth.pest) },
    { id: 'wounded', when: () => peopleAboard().some(r => hpOf(r) < CREW_WOUNDED_HP) },
    { id: 'supplies_low', when: () => Object.keys(RES_LOW).some(k => STATE.resources[k] < RES_LOW[k]) },
    { id: 'morale_low', when: () => STATE.crew.some(r => crewMoraleOf(r) < MORALE_LOW) },
    // The welcome: always the first tip after anything urgent (the departure stop).
    { id: 'stop_menu', when: () => true },
    { id: 'harvest', when: () => !!(STATE.cropGrowth && STATE.cropGrowth.health > 0 && STATE.cropGrowth.growth >= 100) },
    // A station whose services are closed (waved off, blown past) waits for the next one: the tip talks about docking.
    { id: 'station', when: () => { const n = STATE.byId[STATE.currentId]; return !!n && n.node_type === 'station' && !StationVisit.servicesClosed(); } },
    { id: 'fabricator', when: () => Object.values(STATE.materials || {}).reduce((a, q) => a + (q || 0), 0) >= 5 },
    { id: 'fork', when: () => [...nextAvailableNodes()].some(id => STATE.byId[id] && STATE.byId[id].node_type === 'fork') },
    { id: 'cargo', when: () => STATE.items.length > 0 && legsFlown() >= 2 },
    // Then one introduction per stop.
    { id: 'orders', when: () => legsFlown() >= 1 },
    { id: 'growbay', when: () => !!STATE.crop && legsFlown() >= 2 },
    { id: 'map', when: () => legsFlown() >= 3 },
  ];
  const legsFlown = () => (STATE.visited ? STATE.visited.size - 1 : 0);
  function tipsOn() {
    try { return tpLoadSettings().showTips !== false; } catch (_) { return true; }
  }
  function maybePushTip() {
    if (!tipsOn()) return false;
    if (!Array.isArray(STATE.tipsShown)) STATE.tipsShown = [];
    for (const t of TIP_TOPICS) {
      if (STATE.tipsShown.includes(t.id)) continue;
      let due = false;
      try { due = t.when(); } catch (_) { due = false; }
      if (!due) continue;
      const line = aiPool(['tips', t.id]);
      if (!line) continue;
      STATE.tipsShown.push(t.id);
      pushLogEntry('◆ ' + line, { ai: true, tip: true });
      return true;
    }
    return false;
  }

  function maybePushAmbient() {
    if (STATE.lastAmbientNode === STATE.currentId) return;
    STATE.lastAmbientNode = STATE.currentId;
    if (maybePushTip()) return;
    if (maybePushCallback()) return;
    // Node-specific commentary (map_commentary.node_entering — currently
    // authored for station/derelict) takes priority over generic ambient
    // when this node type has a pool.
    const node = STATE.byId && STATE.byId[STATE.currentId];
    if (node) {
      const nodeLine = aiPool(['map_commentary', 'node_entering', node.node_type]);
      if (nodeLine && Math.random() < 0.6) { pushLogEntry('◆ ' + nodeLine, { ai: true }); return; }
    }
    if (Math.random() < 0.45) {
      // One ambient beat in four is the ship computer's own note on the
      // living crop (flavor_pools.ship_computer_crop_comments, per crop).
      const cropPool = MOD.flavor && MOD.flavor.ship_computer_crop_comments && STATE.crop
        && STATE.cropGrowth && STATE.cropGrowth.health > 0 && MOD.flavor.ship_computer_crop_comments[STATE.crop];
      // …and one in five is something drifting past the window
      // (flavor_pools.ambient_travel_objects).
      const drift = MOD.flavor && MOD.flavor.ambient_travel_objects;
      const roll = Math.random();
      const line = (Array.isArray(cropPool) && cropPool.length && roll < 0.25)
        ? cropPool[Math.floor(Math.random() * cropPool.length)]
        : (Array.isArray(drift) && drift.length && roll < 0.45)
          ? 'Passing the window: ' + drift[Math.floor(Math.random() * drift.length)].replace(/^./, c => c.toLowerCase()).replace(/\.$/, '') + '.'
          : aiPool(['cruise_ambient']);
      if (line) pushLogEntry('◆ ' + line, { ai: true });
    }
  }

  // low is activeTriggers()' line (RES_LOW / MORALE_LOW); critical is a
  // deeper second warning (RES_CRITICAL).
  const WARN_THRESHOLDS = Object.assign({}, RES_LOW, { morale: MORALE_LOW });
  function checkResourceWarnings() {
    STATE.aiWarnLevels = STATE.aiWarnLevels || {};
    for (const [res, lowAt] of Object.entries(WARN_THRESHOLDS)) {
      // Morale = the crew average (owner ruling 15); no crew, no warning.
      const v = res === 'morale' ? crewMoraleAvg() : STATE.resources[res];
      const level = v == null ? 'ok' : v < RES_CRITICAL ? 'critical' : (v < lowAt ? 'low' : 'ok');
      const prev = STATE.aiWarnLevels[res] || 'ok';
      // Fire only on a downward crossing (ok→low, ok→critical, low→critical);
      // recovery resets silently so the next dip warns again.
      const rank = { ok: 0, low: 1, critical: 2 };
      if (rank[level] > rank[prev]) {
        // Pool only covers fuel/food/water/o2/hull/morale where authored —
        // missing pools just skip (water/o2 land in the same pass as this wiring).
        // First time fuel runs low: the AI's signature low_fuel line.
        let line = null;
        if (res === 'fuel' && !STATE.flags.has('ai_sampled_low_fuel')) {
          STATE.flags.add('ai_sampled_low_fuel'); line = aiSampleLine('low_fuel');
        }
        line = line || aiPool(['resource_warning', res, level]);
        if (line) pushLogEntry('◆ ' + line, { ai: true });
      }
      STATE.aiWarnLevels[res] = level;
    }
  }

  // crops.json zinnia_arc — a three-beat background story for zinnia runs
  // (bloom at the start, a name mid-journey, a scare when it sickens).
  // The first two are morale events in fact, not just in the log.
  const ZINNIA_BEATS = [['beat_1', 'journey_start', 2], ['beat_2', 'journey_mid', 3], ['beat_3', 'crop_sick', 0]];
  function checkZinniaArc() {
    if (STATE.crop !== 'zinnia' || !STATE.cropGrowth || STATE.cropGrowth.health <= 0) return;
    const arc = ((MOD.crops && MOD.crops.crops) || []).find(c => c.id === 'crop_zinnia');
    if (!arc || !arc.zinnia_arc) return;
    const trig = activeTriggers();
    for (const [key, trigger, morale] of ZINNIA_BEATS) {
      const beat = arc.zinnia_arc[key];
      if (!beat || STATE.flags.has('zinnia_' + key) || !trig.has(trigger)) continue;
      STATE.flags.add('zinnia_' + key);
      const got = morale ? Math.round(addCrewMorale(morale)) : 0; // every crew member; none aboard, no claim
      pushLogEntry('◆ ' + beat.first_line + (got ? ' (+' + got + ' morale)' : ''), { ai: true });
      return; // one beat per stop
    }
  }

  function checkCropMilestones() {
    if (!STATE.crop || !STATE.cropGrowth) return;
    checkZinniaArc();
    ShipLog.cropCheck(); // Ship's Log: growth-stage milestones (shipslog.js)
    const growth = STATE.cropGrowth.growth || 0;
    const health = STATE.cropGrowth.health;
    // A fresh growth cycle (launch, or the replant after a harvest —
    // growbay.js re-arms the flag) gets its "planted" line once.
    if (health > 0 && growth < 75 && !STATE.flags.has('ai_noted_crop_planted')) {
      STATE.flags.add('ai_noted_crop_planted');
      const line = aiPool(['crop_lifecycle', 'planted']);
      if (line) pushLogEntry('◆ ' + line, { ai: true });
    }
    if (growth > 75 && !STATE.flags.has('ai_noted_crop_mature')) {
      STATE.flags.add('ai_noted_crop_mature');
      const line = aiPool(['crop_lifecycle', 'mature']);
      if (line) pushLogEntry('◆ ' + line, { ai: true });
      // Maturity is the crop's science moment — attach the real-world
      // tie-in from the science_links pool (Bible §18 link schema).
      const sci = MOD.flavor && MOD.flavor.science_links && MOD.flavor.science_links.crops
        && MOD.flavor.science_links.crops[STATE.crop];
      if (sci && sci.url) {
        pushLogEntry({ text: '◆ ' + (sci.text || 'The ship computer files the crop\'s real history for curious minds.'), link: { url: sci.url, label: sci.label || 'Learn more' } }, { ai: true });
      }
    }
    // Sickness announcement fires on crossing below the crop's own
    // sick_threshold, and re-arms once it recovers past healthy_threshold
    // — so a crop that yo-yos warns each relapse, not every render.
    const cropDef = (MOD.crops && MOD.crops.crops || []).find(c => c.id === 'crop_' + STATE.crop);
    const sickAt = (cropDef && cropDef.sick_threshold) || CROP_SICK_DEFAULT;
    const healthyAt = (cropDef && cropDef.healthy_threshold) || CROP_HEALTHY_DEFAULT;
    if (health > 0 && health < sickAt && !STATE.flags.has('ai_noted_crop_sick')) {
      STATE.flags.add('ai_noted_crop_sick');
      // The AI's signature crop_sick line (ai_companions) the first time;
      // the crop_lifecycle pool for relapses.
      const first = !STATE.flags.has('ai_sampled_crop_sick');
      STATE.flags.add('ai_sampled_crop_sick');
      const line = (first && aiSampleLine('crop_sick')) || aiPool(['crop_lifecycle', 'diseased']);
      if (line) pushLogEntry('◆ ' + line, { ai: true });
    } else if (health >= healthyAt && STATE.flags.has('ai_noted_crop_sick')) {
      STATE.flags.delete('ai_noted_crop_sick');
    }
    if (health <= 0 && !STATE.flags.has('ai_noted_crop_died')) {
      STATE.flags.add('ai_noted_crop_died');
      const line = aiPool(['crop_lifecycle', 'died']);
      if (line) pushLogEntry('◆ ' + line, { ai: true });
    }
    // Pest outbreak announcement — once per outbreak (flag cleared by
    // TREAT / an event's clears_pest, so the next outbreak re-warns).
    if (STATE.cropGrowth.pest && !STATE.flags.has('ai_noted_pest')) {
      STATE.flags.add('ai_noted_pest');
      pushLogEntry('◆ GROWBAY ALERT — pest outbreak detected. TREAT from the growbay before it compounds.');
    }
  }

  // The open Stop menu re-gates after anything that changes the ship
  // from an overlay (fabricator, inventory USE) — lock reasons and fees.
  const refreshStopMenu = () => { if (document.body.classList.contains('stop-active')) renderStopMenu(); };
  // Other screens log through here; { ai: true } marks the AI's own voice.

  // Wake-ups: the starfield, TIME PAUSED and the wait's hold all follow
  // the screen, the Stop state, overlays and the pause menu.
  const mo = new MutationObserver(() => {
    const vis = cruiseVisible();
    if (!vis && hubWasVisible) hubHiddenAt = performance.now();
    hubWasVisible = vis;
    wakeStars(); syncPaused();
  });
  mo.observe($('screen-cruise'), { attributes: true, attributeFilter: ['class'] });
  mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  document.querySelectorAll('.overlay').forEach(ov => mo.observe(ov, { attributes: true, attributeFilter: ['class'] }));
  PauseBus.onChange(() => { wakeStars(); syncPaused(); });

  Object.assign(window, {
    // engine API
    rebuildCruiseLog, paintCruiseBars, refundVerbTax, onJobBegun, onJobHarm,
    applyAbandonHarm, abortCruiseWait, openStopMenu, renderCruise,
    refreshStopMenu, pushCruiseLog: pushLogEntry,
    // test hooks: tools/tests drive and read these through page.evaluate
    cruiseStarState, cruiseSceneAlert: showSceneAlert,
    cruiseDisplayLine: displayLine, derelictFormOf,
    cruiseRegionKey: currentRegionKey, cruiseWaitEventPick: waitEventPick,
    CRUISE_WAIT_TUNING, cruiseWaitActive, cruiseWaitState,
    cruiseLockTip: lockTip,
  });
})();

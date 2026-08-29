/* ═══════════════════════════════════════════════════════════════════
   SCENE ART — encounter backgrounds + NPC talking heads (engine port)

   Ported from demo-encounter.html per Bible §11 (NPC sprite pool) and
   §16 (scene layer stack). Owns:
     - three-layer backdrop resolution (bgBase z=0 / bgSprite z=1 /
       main backdrop z=2) with probe-by-error discovery + caches
     - scene_type → layer-spec mapping (events author no bg paths;
       the map lives here, keyed off scene_type + node + npc context)
     - NPC subject frame: spritesheet variant probing (numbered
       folders per Bible §11), talk-loop animation, portrait/emoji
       fallback chain
     - crew talking heads for own-crew events (`crew_id` on layer/event,
       CREW_SHEETS convention: frame 0 idle, 1-8 talk)

   Load-order rule: this file is loaded BEFORE the index.html inline
   script — never read MOD/STATE at top level; only inside functions.

   Approach-mode (animated station approach sheets) is NOT ported —
   that composition belongs to the docking sequence, which the engine
   reaches through station events rather than a dedicated approach
   screen. Static station approach art is reachable via the mapping.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const BG_ROOT = 'sprites/backgrounds/';
  const BG_PROBE_MAX = 8;   // space/deep has 7 — probe past the deepest pool
  const NPC_PROBE_MAX = 6;

  /* ── probing + caches ─────────────────────────────────────────────
     _listCache:  path → array of URLs that exist (null when none) —
                  survives the whole session (files don't move).
     _picked:     pickKey → chosen URL. Keyed per event so a scene
                  stays stable across re-renders within one event but
                  re-rolls for the next event. Cleared per run. */
  const _listCache = new Map();
  let _picked = new Map();

  function probeImage(path) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(path);
      img.onerror = () => resolve(null);
      img.src = path;
    });
  }

  function pickSticky(pickKey, list) {
    if (!list || !list.length) return null;
    if (_picked.has(pickKey)) return _picked.get(pickKey);
    const chosen = list[Math.floor(Math.random() * list.length)];
    _picked.set(pickKey, chosen);
    return chosen;
  }

  /* Backdrop resolver — flat file first (bridge.png, corridor.jpg),
     then numbered folder pool. jpg-preferred for backdrops. */
  async function resolveBackground(raw) {
    if (!raw) return null;
    const cacheKey = 'bg:' + raw;
    if (!_listCache.has(cacheKey)) {
      let found = null;
      const flatJpg = await probeImage(BG_ROOT + raw + '.jpg');
      if (flatJpg) found = [flatJpg];
      if (!found) {
        const flatPng = await probeImage(BG_ROOT + raw + '.png');
        if (flatPng) found = [flatPng];
      }
      if (!found) {
        const probes = [];
        for (let i = 1; i <= BG_PROBE_MAX; i++) {
          probes.push(probeImage(BG_ROOT + raw + '/' + i + '.jpg'));
        }
        const hits = (await Promise.all(probes)).filter(Boolean);
        found = hits.length ? hits : null;
      }
      _listCache.set(cacheKey, found);
    }
    return _listCache.get(cacheKey);
  }

  /* Viewport-sprite resolver — png-preferred (transparent overlays),
     numbered folders probe both extensions (full-bleed jpgs legal). */
  async function resolveSprite(raw) {
    if (!raw) return null;
    const cacheKey = 'sprite:' + raw;
    if (!_listCache.has(cacheKey)) {
      let found = null;
      const flatPng = await probeImage(BG_ROOT + raw + '.png');
      if (flatPng) found = [flatPng];
      if (!found) {
        const flatJpg = await probeImage(BG_ROOT + raw + '.jpg');
        if (flatJpg) found = [flatJpg];
      }
      if (!found) {
        const probes = [];
        for (let i = 1; i <= BG_PROBE_MAX; i++) {
          probes.push(probeImage(BG_ROOT + raw + '/' + i + '.png'));
          probes.push(probeImage(BG_ROOT + raw + '/' + i + '.jpg'));
        }
        const hits = (await Promise.all(probes)).filter(Boolean);
        found = hits.length ? hits : null;
      }
      _listCache.set(cacheKey, found);
    }
    return _listCache.get(cacheKey);
  }

  /* ── scene_type → layer spec ──────────────────────────────────────
     Returns { bg, bgBase, bgSprite } of BG_ROOT-relative paths (each
     may be a flat file or a numbered pool — the resolvers handle
     both). Events author scene_type only; everything else derives
     from npc context + node type. `pickKey` seeds sticky choices that
     have to be made HERE (planet biome, anomaly flavor) rather than
     at image-pick time. */
  const PLANET_BIOMES = ['alien', 'desert', 'habitable', 'ice', 'ocean', 'volcanic'];
  const ANOMALY_KINDS = ['distortion', 'fractal', 'void'];
  const STATION_ROOM_BY_JOB = {
    medic:     'station/medbay',
    security:  'station/office',
    captain:   'station/dock',
    engineer:  'station/dock',
    janitor:   'station/promenade',
    botanist:  'station/market/mixed',
    bartender: 'station/cantina',
  };

  function stickyFrom(pickKey, list) {
    const key = 'kind:' + pickKey;
    if (_picked.has(key)) return _picked.get(key);
    const chosen = list[Math.floor(Math.random() * list.length)];
    _picked.set(key, chosen);
    return chosen;
  }

  function spaceFor(node) {
    const nt = node && node.node_type;
    if (nt === 'nebula') return 'space/nebula';
    if (nt === 'asteroid') return 'space/asteroid_field';
    return 'space/deep';
  }

  function sceneSpecFor(ev, node, npcCtx) {
    const st = ev.scene_type || null;
    const pickKey = ev.id || 'anon';
    const npc = npcCtx || null;
    const disp = npc && npc.disposition;

    switch (st) {
      case 'ship_exterior': {
        // Bridge composition: starfield base, their ship in the
        // viewport cutout, bridge chrome on top.
        let sprite = 'ship_exterior/unknown';
        if (disp === 'pirate' || disp === 'trader') sprite = 'ship_exterior/' + disp + '/' + npc.species;
        else if (disp === 'drifter') sprite = 'ship_exterior/drifter';
        return { bg: 'our_ship/bridge', bgBase: spaceFor(node), bgSprite: sprite };
      }
      case 'ship_interior': {
        // Aboard THEIR ship when a commercial/hostile NPC is present
        // in person; otherwise one of our own rooms.
        if (disp === 'pirate' || disp === 'trader') return { bg: 'ship_interior/' + disp + '/' + npc.species };
        if (disp === 'drifter') return { bg: 'ship_interior/generic' };
        return { bg: 'our_ship/corridor' };
      }
      case 'growbay': {
        // Pool is crop-NAMED, not numbered (wheat.jpg … sweet_potato.jpg)
        // — resolve the run's own crop; no-crop runs get the wheat bay.
        const crop = (typeof STATE !== 'undefined' && STATE.crop) || 'wheat';
        return { bg: 'our_ship/growbay/' + crop };
      }
      case 'station_interior': {
        if (disp === 'station_crew' && npc.job && STATION_ROOM_BY_JOB[npc.job]) {
          return { bg: STATION_ROOM_BY_JOB[npc.job] };
        }
        if (disp === 'trader') return { bg: 'station/market/mixed' };
        return { bg: 'station/promenade' };
      }
      case 'planet_surface': {
        const biome = stickyFrom(pickKey + ':biome', PLANET_BIOMES);
        return { bg: 'planet_surface/' + biome + '/approach' };
      }
      case 'derelict_interior':
        return { bg: 'ship_interior/derelict' };
      case 'asteroid_field':
        return { bg: 'space/asteroid_field' };
      case 'deep_void':
        return { bg: spaceFor(node) };
      case 'anomaly': {
        const kind = stickyFrom(pickKey + ':anomaly', ANOMALY_KINDS);
        return { bg: 'anomaly/' + kind };
      }
      default: {
        // No scene_type authored — derive from where we are.
        const nt = node && node.node_type;
        if (nt === 'station')  return { bg: 'station/promenade' };
        if (nt === 'planet') {
          const biome = stickyFrom(pickKey + ':biome', PLANET_BIOMES);
          return { bg: 'planet_surface/' + biome + '/approach' };
        }
        if (nt === 'derelict') return { bg: 'ship_interior/derelict' };
        if (nt === 'anomaly') {
          const kind = stickyFrom(pickKey + ':anomaly', ANOMALY_KINDS);
          return { bg: 'anomaly/' + kind };
        }
        return { bg: spaceFor(node) };
      }
    }
  }

  /* ── backdrop painting ────────────────────────────────────────────
     Sequence counter guards in-flight resolutions against the player
     advancing to another event mid-probe (same pattern as the demo). */
  let _bgSeq = 0;

  function applyBackdropSpec(spec, pickKey) {
    const main   = document.getElementById('enc-backdrop');
    const base   = document.getElementById('enc-backdrop-base');
    const sprite = document.getElementById('enc-backdrop-sprite');
    if (!main || !base || !sprite) return;
    const mySeq = ++_bgSeq;
    spec = spec || {};

    if (!spec.bg) {
      main.style.backgroundImage = '';
      main.classList.remove('has-bg-sprite');
    } else {
      resolveBackground(spec.bg).then(list => {
        if (mySeq !== _bgSeq) return;
        const path = pickSticky(pickKey + '|bg:' + spec.bg, list);
        if (path) {
          main.style.backgroundImage = "url('" + path + "')";
          main.classList.add('has-bg-sprite');
        } else {
          main.style.backgroundImage = '';
          main.classList.remove('has-bg-sprite');
        }
      });
    }

    if (!spec.bgBase) {
      base.classList.add('hidden');
      base.style.backgroundImage = '';
    } else {
      resolveBackground(spec.bgBase).then(list => {
        if (mySeq !== _bgSeq) return;
        const path = pickSticky(pickKey + '|base:' + spec.bgBase, list);
        if (path) {
          base.style.backgroundImage = "url('" + path + "')";
          base.classList.remove('hidden');
        } else {
          base.classList.add('hidden');
          base.style.backgroundImage = '';
        }
      });
    }

    if (!spec.bgSprite) {
      sprite.classList.add('hidden');
      sprite.style.backgroundImage = '';
      sprite.classList.remove('bobbing', 'fullbleed');
    } else {
      resolveSprite(spec.bgSprite).then(list => {
        if (mySeq !== _bgSeq) return;
        const path = pickSticky(pickKey + '|vs:' + spec.bgSprite, list);
        if (path) {
          sprite.style.backgroundImage = "url('" + path + "')";
          sprite.classList.remove('hidden');
          // JPG = full-bleed scene, no bob. PNG = transparent ship
          // overlay drifting in the viewport.
          const fullbleed = /\.jpg(\?|$)/i.test(path);
          sprite.classList.toggle('fullbleed', fullbleed);
          sprite.classList.toggle('bobbing', !fullbleed);
        } else {
          sprite.classList.add('hidden');
          sprite.style.backgroundImage = '';
          sprite.classList.remove('bobbing', 'fullbleed');
        }
      });
    }
  }

  /* ── NPC spritesheet system (Bible §11) ───────────────────────────
     Folder: sprites/npc/<disposition>/<species>/<N>/ — station_crew
     adds a <job> segment. Each numbered folder holds spritesheet.png
     + spritesheet.json (TexturePacker). 9 talk frames + 1 idle; the
     idle slot is whichever frame's source filename ISN'T frame_NNN
     (declaration order varies per pack), defaulting to slot 9. */
  const NPC_SHEET_W = 3.92;   // 392px native / 100 (per Bible §11 pack spec)
  const NPC_SHEET_H = 2.94;   // 294px native / 100
  const NPC_FRAME_COORDS = [
    [1, 1], [99, 1], [197, 1],
    [1, 99], [99, 99], [197, 99],
    [1, 197], [99, 197], [197, 197],
    [295, 1],
  ];
  const TALK_LOOP_MS = 1500;

  const EMOJI_BY_KEY = {
    pirate: '🏴‍☠️', trader: '💰', drifter: '👤',
    medic: '🩺', security: '🛡️', captain: '🎖️', engineer: '🔧',
    janitor: '🧹', botanist: '🌱', bartender: '🤖', station_crew: '🧑‍🚀',
  };

  const _npcSheetCache = new Map(); // folder → {url, idleIdx, talkIdxs} | null
  let _activeSheet = null;
  let _talkRAF = null;
  let _talkUntil = 0;

  function npcFolderPath(npcCtx) {
    if (!npcCtx || !npcCtx.disposition || !npcCtx.species) return null;
    if (npcCtx.disposition === 'station_crew') {
      if (!npcCtx.job) return null;
      return 'sprites/npc/station_crew/' + npcCtx.job + '/' + npcCtx.species;
    }
    return 'sprites/npc/' + npcCtx.disposition + '/' + npcCtx.species;
  }

  function fetchJSON(url) {
    return new Promise(res => {
      const x = new XMLHttpRequest();
      x.onload = () => { try { res(JSON.parse(x.responseText)); } catch (_) { res(null); } };
      x.onerror = () => res(null);
      x.open('GET', url);
      try { x.send(); } catch (_) { res(null); }
    });
  }

  async function pickNpcSheet(npcCtx) {
    const folder = npcFolderPath(npcCtx);
    if (!folder) return null;
    if (_npcSheetCache.has(folder)) return _npcSheetCache.get(folder);
    const found = [];
    for (let i = 1; i <= NPC_PROBE_MAX; i++) {
      const url = await probeImage(folder + '/' + i + '/spritesheet.png');
      if (url) found.push({ url, jsonUrl: folder + '/' + i + '/spritesheet.json' });
    }
    if (!found.length) { _npcSheetCache.set(folder, null); return null; }
    const pick = found[Math.floor(Math.random() * found.length)];
    let idleIdx = 9;
    const json = await fetchJSON(pick.jsonUrl);
    if (json && Array.isArray(json.frames)) {
      for (let f = 0; f < json.frames.length; f++) {
        const fn = (json.frames[f].filename) || '';
        if (!/^frame_\d+\.png$/i.test(fn)) { idleIdx = f; break; }
      }
    }
    const talkIdxs = [];
    for (let f = 0; f < NPC_FRAME_COORDS.length; f++) {
      if (f !== idleIdx) talkIdxs.push(f);
    }
    const desc = { url: pick.url, idleIdx, talkIdxs };
    _npcSheetCache.set(folder, desc);
    return desc;
  }

  function setNpcFrame(sheet, frameIdx) {
    const head = document.getElementById('enc-subject-head');
    if (!head) return;
    const grid = sheet.crew ? CREW_FRAME_COORDS : NPC_FRAME_COORDS;
    const coords = grid[Math.min(frameIdx, grid.length - 1)];
    head.style.setProperty('--sheet-url', "url('" + sheet.url + "')");
    head.style.setProperty('--sheet-w', sheet.crew ? sheet.sheetW : NPC_SHEET_W);
    head.style.setProperty('--sheet-h', sheet.crew ? sheet.sheetH : NPC_SHEET_H);
    head.style.setProperty('--frame-x', coords[0]);
    head.style.setProperty('--frame-y', coords[1]);
    head.classList.add('has-spritesheet');
    head.textContent = '';
    head.style.removeProperty('--subj-sprite');
  }

  /* Own-crew talking heads (demo-encounter CREW_SHEETS convention):
     3×3 grid, 96px frames at 1px margins, frame 0 = idle (unlike NPC
     sheets where idle is the extra 10th slot). Sheet dims vary per
     crew — read from the packed PNG at probe time. A layer/event
     authoring `crew_id` puts that crew member in the subject frame. */
  const CREW_SHEET_IDS = ['osei', 'hargrove', 'kazuki', 'reeves', 'reyes', 'tanaka', 'vasquez'];
  const CREW_FRAME_COORDS = [
    [1, 1], [99, 1], [197, 1],
    [1, 99], [99, 99], [197, 99],
    [1, 197], [99, 197], [197, 197],
  ];
  const _crewSheetCache = new Map();
  async function pickCrewSheet(crewId) {
    if (!CREW_SHEET_IDS.includes(crewId)) return null;
    if (_crewSheetCache.has(crewId)) return _crewSheetCache.get(crewId);
    const url = 'sprites/crew_sprites/spritesheet_' + crewId + '.png';
    const desc = await new Promise(res => {
      const img = new Image();
      img.onload = () => res({ url, idleIdx: 0, talkIdxs: [1, 2, 3, 4, 5, 6, 7, 8], crew: true,
                               sheetW: img.naturalWidth / 100, sheetH: img.naturalHeight / 100 });
      img.onerror = () => res(null);
      img.src = url;
    });
    _crewSheetCache.set(crewId, desc);
    return desc;
  }

  function stopTalking() {
    if (_talkRAF) cancelAnimationFrame(_talkRAF);
    _talkRAF = null;
    // A line can finish while its spritesheet is still being probed.
    // Clear the deferred start as well as the live loop, otherwise the
    // eventual image load starts talking after the text is complete.
    _pendingLine = null;
    if (_activeSheet) setNpcFrame(_activeSheet, _activeSheet.idleIdx);
  }

  /* Engine has no typewriter — run the talk loop for a duration
     proportional to the line length, then settle on idle. */
  function startTalking(line) {
    stopTalking();
    if (!_activeSheet) return;
    const sheet = _activeSheet;
    const frameMs = TALK_LOOP_MS / sheet.talkIdxs.length;
    _talkUntil = performance.now() + Math.min(1200 + String(line || '').length * 35, 6500);
    const start = performance.now();
    function tick(now) {
      if (_activeSheet !== sheet) return;
      if (window.PauseBus && window.PauseBus.paused) { _talkRAF = requestAnimationFrame(tick); return; }
      if (now >= _talkUntil) { setNpcFrame(sheet, sheet.idleIdx); _talkRAF = null; return; }
      // rAF's timestamp is the frame's START time and can precede the
      // performance.now() captured above — a negative elapsed indexed
      // talkIdxs[-1] → undefined → crash (caught by fuzz, 2026-08-03).
      const elapsed = Math.max(0, now - start) % TALK_LOOP_MS;
      const idx = sheet.talkIdxs[Math.min(sheet.talkIdxs.length - 1, Math.floor(elapsed / frameMs))];
      setNpcFrame(sheet, idx);
      _talkRAF = requestAnimationFrame(tick);
    }
    _talkRAF = requestAnimationFrame(tick);
  }

  /* Subject frame: sheet → single portrait → emoji, same fallback
     chain as the demo. Comm-mode class lands on the subject element
     so scanline/glitch overlays track the event's comm_mode. */
  function applySubject(npcCtx, commMode, evKey) {
    const screen = document.getElementById('screen-encounter');
    const subj = document.getElementById('enc-subject');
    const head = document.getElementById('enc-subject-head');
    const namePlate = document.getElementById('enc-subject-name');
    if (!screen || !subj || !head) return;

    stopTalking();
    _activeSheet = null;
    // A destroyed pirate must not leave the frame faded for the next
    // event's guest.
    subj.classList.remove('fx-hit', 'fx-destroyed');

    if (!npcCtx) {
      screen.classList.add('no-subject');
      return;
    }
    screen.classList.remove('no-subject');
    if (namePlate) namePlate.textContent = npcCtx.displayName || '';

    subj.classList.remove('comm-screen', 'comm-corrupted');
    if (commMode === 'screen') subj.classList.add('comm-screen');
    if (commMode === 'corrupted') subj.classList.add('comm-corrupted');

    const startedKey = evKey;
    const pickPromise = npcCtx.crewId ? pickCrewSheet(npcCtx.crewId) : pickNpcSheet(npcCtx);
    pickPromise.then(sheet => {
      if (_currentSubjKey !== startedKey) return;
      if (sheet) {
        _activeSheet = sheet;
        setNpcFrame(sheet, sheet.idleIdx);
        if (_pendingLine) { startTalking(_pendingLine); _pendingLine = null; }
        return;
      }
      // Single-portrait fallback: folder/1/<stem>.png
      head.classList.remove('has-spritesheet');
      const folder = npcFolderPath(npcCtx);
      const stem = npcCtx.disposition === 'station_crew'
        ? npcCtx.job + '_' + npcCtx.species
        : npcCtx.disposition + '_' + npcCtx.species;
      const emoji = EMOJI_BY_KEY[npcCtx.job || npcCtx.disposition] || '👤';
      if (!folder) {
        head.style.removeProperty('--subj-sprite');
        head.textContent = emoji;
        return;
      }
      const path = folder + '/1/' + stem + '.png';
      const img = new Image();
      img.onload = () => {
        if (_currentSubjKey !== startedKey) return;
        head.style.setProperty('--subj-sprite', "url('" + path + "')");
        head.textContent = '';
      };
      img.onerror = () => {
        if (_currentSubjKey !== startedKey) return;
        head.style.removeProperty('--subj-sprite');
        head.textContent = emoji;
      };
      img.src = path;
    });

    // Entrance flash, same as the demo.
    subj.classList.remove('flash'); void subj.offsetWidth; subj.classList.add('flash');
  }

  /* ── public entry points ──────────────────────────────────────── */
  let _currentEvKey = null;
  let _currentSubjKey = null;
  let _pendingLine = null;

  /* An event id can be drawn more than once in one run. Sticky art may
     remain keyed by id, but presentation state belongs to one entry:
     prior combat opacity and CRT classes must not survive a later draw
     of the same authored event. */
  function beginEvent() {
    _currentEvKey = null;
    _currentSubjKey = null;
    stopTalking();
    _activeSheet = null;
  }

  function subjKeyFor(evKey, ctx) {
    return evKey + '|' + (ctx
      ? ctx.disposition + '/' + (ctx.job || '') + '/' + ctx.species + '/' + (ctx.displayName || '')
      : 'none');
  }

  /* Called from renderEncounterState() on every layer paint.
     opts.subjectCtx — layer-level speaker override (demo's presentNpc
     machinery: a cantina layer can put the off-duty engineer in the
     frame while the event's default npc stays the bartender).
     opts.pose — layer pose class (hostile/listening/pleased). */
  function render(ev, node, layer, npcCtx, line, opts) {
    opts = opts || {};
    const evKey = ev.id || 'anon';
    const commMode = (layer && layer.comm_mode) || ev.comm_mode || 'in_person';
    const subjCtx = opts.subjectCtx || npcCtx;
    const subjKey = subjKeyFor(evKey, subjCtx);
    if (_currentEvKey !== evKey) {
      _currentEvKey = evKey;
      // Undo the previous event's combat aftermath: destroyed-ship
      // inline fade, CRT-off on the frame, FTL-vanish shrink-fade on
      // ship/captain/name (escape + enemy retreat), any orphaned FTL
      // flash overlay, hostile-gone/combat-ended screen classes. A new
      // event = a fully reset stage.
      const screen = document.getElementById('screen-encounter');
      if (screen) {
        screen.classList.remove('hostile-gone', 'combat-ended');
        screen.querySelectorAll('.combat-ftl-flash').forEach(el => el.remove());
      }
      const sp = document.getElementById('enc-backdrop-sprite');
      if (sp) { sp.style.opacity = ''; sp.style.transition = ''; sp.classList.remove('combat-hit', 'combat-pre-explode', 'combat-ftl-vanish', 'combat-enemy-charge', 'combat-low-hp'); }
      const subjEl2 = document.getElementById('enc-subject');
      if (subjEl2) { subjEl2.classList.remove('combat-crt-off', 'combat-locking', 'combat-ftl-vanish'); subjEl2.style.opacity = ''; }
      const plate = document.getElementById('enc-subject-name');
      if (plate) { plate.classList.remove('combat-crt-off-name', 'combat-ftl-vanish'); plate.style.opacity = ''; }
      applyBackdropSpec(sceneSpecFor(ev, node, npcCtx), evKey);
    }
    if (_currentSubjKey !== subjKey) {
      _currentSubjKey = subjKey;
      _pendingLine = null;
      applySubject(subjCtx, commMode, subjKey);
    } else {
      // Same speaker — only the comm-mode class may shift per layer.
      const subj = document.getElementById('enc-subject');
      if (subj) {
        subj.classList.remove('comm-screen', 'comm-corrupted');
        if (commMode === 'screen') subj.classList.add('comm-screen');
        if (commMode === 'corrupted') subj.classList.add('comm-corrupted');
      }
    }
    const subjEl = document.getElementById('enc-subject');
    if (subjEl) {
      subjEl.classList.remove('pose-hostile', 'pose-listening', 'pose-pleased');
      const pose = opts.pose || (layer && layer.pose);
      if (pose) subjEl.classList.add('pose-' + pose);
    }
    if (line) {
      if (_activeSheet) startTalking(line);
      else _pendingLine = line;  // sheet still probing — talk when it lands
    } else {
      _pendingLine = null;
      stopTalking();
    }
  }

  /* Called from renderOutcomeView(). Outcomes may override the scene
     (scene_bg / scene_bg_base / scene_bg_sprite per CLAUDE.md schema). */
  function renderOutcome(outcome, npcCtx) {
    if (outcome && (outcome.scene_bg || outcome.scene_bg_base || outcome.scene_bg_sprite)) {
      applyBackdropSpec({
        bg: outcome.scene_bg || null,
        bgBase: outcome.scene_bg_base || null,
        bgSprite: outcome.scene_bg_sprite || null,
      }, (_currentEvKey || 'anon') + ':outcome');
    }
    if (outcome && outcome.line && npcCtx) startTalking(outcome.line);
    else stopTalking();
  }

  /* Combat FX hook — shake/dim the subject frame on enemy hits,
     fade it out on destruction. Called from combat.js. */
  function subjectFX(kind) {
    const subj = document.getElementById('enc-subject');
    if (!subj) return;
    if (kind === 'hit') {
      subj.classList.remove('fx-hit'); void subj.offsetWidth; subj.classList.add('fx-hit');
    } else if (kind === 'destroyed') {
      subj.classList.add('fx-destroyed');
    } else if (kind === 'reset') {
      subj.classList.remove('fx-hit', 'fx-destroyed');
    }
  }

  /* New run: forget sticky picks + rolled sheet variants so the next
     run re-rolls its own cast. File-existence cache survives. */
  function clearRunCaches() {
    _picked = new Map();
    _npcSheetCache.clear();
    _currentEvKey = null;
    _currentSubjKey = null;
    _pendingLine = null;
    stopTalking();
    _activeSheet = null;
  }

  window.SceneArt = { beginEvent, render, renderOutcome, subjectFX, clearRunCaches, stopTalking, sceneSpecFor };
})();

/* ═══════════════════════════════════════════════════════════════════
   SCENE ART — encounter backgrounds + NPC talking heads (engine port)

   Ported from demo-encounter.html per Bible §11 (NPC sprite pool) and
   §16 (scene layer stack). Owns:
     - three-layer backdrop resolution (bgBase z=0 / bgSprite z=1 /
       main backdrop z=2) with probe-by-error discovery + caches
     - scene_type → layer-spec mapping (the event's own scene, keyed
       off scene_type + node + npc context)
     - per-layer bg / bgBase / bgSprite (demo renderAll's layer view,
       'inherit' + {species}/{crop}/{biome} tokens) and outcome
       scene_bg* overrides, swapped in at layer change
     - deterministic picks (run art seed + event instance + path), so
       a reload mid-event shows the very same images
     - NPC subject frame: spritesheet variant probing (numbered
       folders per Bible §11), talk-loop animation, portrait/emoji
       fallback chain
     - crew talking heads for own-crew events (`crew_id` on layer/event,
       CREW_SHEETS convention: frame 0 idle, 1-8 talk)

   Load-order rule: this file is loaded BEFORE the index.html inline
   script — never read MOD/STATE at top level; only inside functions.

   Approach mode (demo-encounter's station_approach, owner ruling
   2026-10-11): the station/approach pool — numbered subfolders, each a
   spritesheet (animated) or a single png (static, bobs) — painted at
   intrinsic size, centred in the bridge viewport, when a station event
   speaks over comms; the cruise hub shows the same station at a
   station stop. One pick per station NODE (stationApproachFor).
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const BG_ROOT = 'sprites/backgrounds/';
  const BG_PROBE_MAX = 8;   // space/deep has 7 — probe past the deepest pool
  const NPC_PROBE_MAX = 6;

  /* ── probing + caches ─────────────────────────────────────────────
     _listCache:  path → array of URLs that exist (null when none) —
                  survives the whole session (files don't move).

     Picks are DETERMINISTIC (owner ruling 2026-10-11): a hash of the
     run's art seed (STATE.artSeed, saved with the run) + the event
     instance (event id @ node id) + the path. Same instance → same
     image on every re-render, every revisit of a layer, and after a
     reload; the next event instance (or the next run) gets its own
     roll. The demo's path-cached random pick, made reload-proof. */
  const _listCache = new Map();

  function hashStr(str) {
    let h = 2166136261 >>> 0; // FNV-1a
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    // final avalanche so neighbouring keys don't land on neighbouring picks
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 13;
    return h >>> 0;
  }
  function runSeed() {
    return (typeof STATE !== 'undefined' && STATE && STATE.artSeed) || 0;
  }
  function stablePick(key, list) {
    if (!list || !list.length) return null;
    return list[hashStr(runSeed() + '|' + key) % list.length];
  }

  function probeImage(path) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(path);
      img.onerror = () => resolve(null);
      img.src = path;
    });
  }

  function pickSticky(pickKey, list) { return stablePick(pickKey, list); }

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

  /* ── Station approach (demo-encounter approach mode) ──────────────
     Pool layout: <path>/1/, <path>/2/, … each holding EITHER a
     spritesheet (spritesheet.png + spritesheet.json, TexturePacker —
     frames in declaration order, array or keyed map) OR one static
     png (<N>.png, else 1.png). Descriptors, demo shape:
       { kind:'animated', folder, url, frames:[{x,y,w,h}], w, h, sheetW, sheetH }
       { kind:'static',   folder, url, w, h }
     The pick belongs to the station NODE, not the event: the hail, a
     later hail at the same stop and the cruise hub's view all show the
     same station, and a reload (same saved artSeed) shows it again. */
  const STATION_APPROACH_POOL = 'station/approach';
  const APPROACH_FPS = 12; // demo startApproachAnim

  function imageSize(url) {
    return new Promise(res => {
      const img = new Image();
      img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => res(null);
      img.src = url;
    });
  }

  async function approachDescFor(folderRel, n) {
    const folder = BG_ROOT + folderRel + '/' + n;
    const sheetUrl = await probeImage(folder + '/spritesheet.png');
    if (sheetUrl) {
      const json = await fetchJSON(folder + '/spritesheet.json');
      const frames = json && json.frames ? Object.values(json.frames).map(f => f && f.frame).filter(Boolean) : [];
      const size = json && json.meta && json.meta.size;
      if (frames.length && size && size.w && size.h) {
        return { kind: 'animated', folder: folderRel + '/' + n, url: sheetUrl, frames,
                 w: frames[0].w, h: frames[0].h, sheetW: size.w, sheetH: size.h };
      }
    }
    for (const name of [n + '.png', '1.png']) {
      const url = await probeImage(folder + '/' + name);
      if (!url) continue;
      const sz = await imageSize(url);
      if (sz) return { kind: 'static', folder: folderRel + '/' + n, url, w: sz.w, h: sz.h };
    }
    return null;
  }

  async function resolveApproach(raw) {
    const cacheKey = 'approach:' + raw;
    if (!_listCache.has(cacheKey)) {
      const probes = [];
      for (let i = 1; i <= BG_PROBE_MAX; i++) probes.push(approachDescFor(raw, i));
      const found = (await Promise.all(probes)).filter(Boolean);
      _listCache.set(cacheKey, found.length ? found : null);
    }
    return _listCache.get(cacheKey);
  }

  function stationKey(node) { return 'station:' + ((node && node.id) || '?'); }

  /* The station this node shows (Promise → descriptor | null). */
  function stationApproachFor(node, raw) {
    raw = raw || STATION_APPROACH_POOL;
    return resolveApproach(raw).then(list => stablePick(stationKey(node) + '|approach:' + raw, list));
  }

  /* Paint a descriptor into an element (the encounter's viewport child
     or the cruise hub's station). Animated: the sheet as background,
     frame offsets cycled at 12fps (skipped while paused or hidden).
     Static: the png, bobbing (the demo's ship-bob; animated sheets
     never bob — their frames are the motion). opts.scale shrinks it
     (cruise hub); the encounter paints at 1 — intrinsic size. */
  const _approachTimers = new Map(); // element → interval id
  function stopApproachAnim(el) {
    const t = _approachTimers.get(el);
    if (t) { clearInterval(t); _approachTimers.delete(el); }
  }
  function clearApproachEl(el) {
    stopApproachAnim(el);
    el.classList.remove('animated', 'static', 'bobbing', 'shown');
    el.style.backgroundImage = '';
    ['--sprite-w', '--sprite-h', '--sheet-w', '--sheet-h', '--frame-x', '--frame-y', '--approach-scale']
      .forEach(p => el.style.removeProperty(p));
    delete el.dataset.station;
    delete el.dataset.kind;
    delete el.dataset.frame;
  }
  function paintApproachEl(el, desc, scale) {
    clearApproachEl(el);
    if (!desc) return;
    el.style.backgroundImage = "url('" + desc.url + "')";
    el.style.setProperty('--sprite-w', desc.w);
    el.style.setProperty('--sprite-h', desc.h);
    el.style.setProperty('--approach-scale', scale || 1);
    el.dataset.station = desc.folder;
    el.dataset.kind = desc.kind;
    el.classList.add(desc.kind, 'shown');
    if (desc.kind === 'static') { el.classList.add('bobbing'); return; }
    el.style.setProperty('--sheet-w', desc.sheetW);
    el.style.setProperty('--sheet-h', desc.sheetH);
    let idx = 0;
    const tick = () => {
      const f = desc.frames[idx];
      el.style.setProperty('--frame-x', f.x);
      el.style.setProperty('--frame-y', f.y);
      el.dataset.frame = idx;
      idx = (idx + 1) % desc.frames.length;
    };
    tick();
    if (desc.frames.length < 2) return;
    _approachTimers.set(el, setInterval(() => {
      if (!el.isConnected) { stopApproachAnim(el); return; }
      if ((window.PauseBus && window.PauseBus.paused) || !el.getClientRects().length) return;
      tick();
    }, 1000 / APPROACH_FPS));
  }

  /* Cruise hub (cruise.js): the station at a station stop, nothing
     elsewhere. Integer downscale (½, ⅓ …) so the largest station fits
     opts.maxW × opts.maxH without blurring its pixels. Re-renders of
     the same stop are no-ops. */
  function paintStationView(el, node, opts) {
    if (!el) return;
    opts = opts || {};
    const key = node && node.node_type === 'station' ? stationKey(node) + '|' + runSeed() : '';
    if (el.dataset.approachKey === key && (key === '' || el.dataset.station)) return;
    el.dataset.approachKey = key;
    const seq = (el._approachSeq = (el._approachSeq || 0) + 1);
    if (!key) { clearApproachEl(el); return; }
    stationApproachFor(node).then(desc => {
      if (el._approachSeq !== seq) return;
      let div = 1;
      while (desc && ((opts.maxW && desc.w / div > opts.maxW) || (opts.maxH && desc.h / div > opts.maxH))) div++;
      paintApproachEl(el, desc, 1 / div);
    });
  }

  /* Station hail: a station event (station_interior scene, or none) at
     a station node, on a layer that speaks over comms (comm_mode
     'screen', layer or event) is seen from our bridge — demo
     station_approach: bridge on top, space behind, the station in the
     viewport. In-person layers fall through to the station interior. */
  function stationHailSpec(ev, node, layer) {
    if (!node || node.node_type !== 'station') return null;
    const comm = (layer && layer.comm_mode) || (ev && ev.comm_mode) || 'in_person';
    if (comm !== 'screen') return null;
    const st = ev && ev.scene_type;
    if (st && st !== 'station_interior') return null;
    return { bg: 'our_ship/bridge', bgBase: spaceFor(node), bgSprite: STATION_APPROACH_POOL };
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
    botanist:  'station/promenade', // demo canon: the promenade's hydroponic display
    bartender: 'station/cantina',
  };

  function stickyFrom(pickKey, list) { return stablePick('kind:' + pickKey, list); }

  /* Event instance key — the unit a pick is stable for. */
  function instanceKey(ev, node) {
    return ((ev && ev.id) || 'anon') + '@' + ((node && node.id) || '?');
  }

  /* A planet's biome belongs to the PLANET (node), not the event: the
     approach view, every landing scene and any later event at that stop
     agree on it. {biome} in authored paths resolves to this. */
  function biomeFor(ev, node) {
    return stickyFrom('biome:' + ((node && node.id) || (ev && ev.id) || 'anon'), PLANET_BIOMES);
  }

  /* Authored path tokens (demo expandPath + Bible §16): {species} from
     the event's NPC, {crop} from the run, {biome} from the planet.
     A token with nothing to fill it makes the path unusable → null
     (the layer falls back to an empty slot, never a 404 probe). */
  function expandPath(raw, ev, node, npcCtx) {
    if (!raw) return null;
    let out = String(raw);
    if (out.indexOf('{species}') !== -1) {
      const sp = npcCtx && npcCtx.species;
      if (!sp) return null;
      out = out.replace(/\{species\}/g, sp);
    }
    if (out.indexOf('{crop}') !== -1) {
      out = out.replace(/\{crop\}/g, (typeof STATE !== 'undefined' && STATE.crop) || 'wheat');
    }
    if (out.indexOf('{biome}') !== -1) out = out.replace(/\{biome\}/g, biomeFor(ev, node));
    return out;
  }

  function spaceFor(node) {
    const nt = node && node.node_type;
    if (nt === 'nebula') return 'space/nebula';
    if (nt === 'asteroid_field' || nt === 'asteroid') return 'space/asteroid_field';
    return 'space/deep';
  }

  /* An event may author its own room at the top level (same names and
     rules as a layer's bg / bgBase / bgSprite — e.g. our_ship/cargo for
     a cargo-bay event); its layers resolve against that. */
  function sceneSpecFor(ev, node, npcCtx) {
    const base = sceneTypeSpecFor(ev, node, npcCtx);
    if (!(ev.bg || ev.bgBase !== undefined || ev.bgSprite !== undefined)) return base;
    const slot = (v, inherited) => (v === undefined || v === 'inherit') ? inherited
      : (v ? expandPath(v, ev, node, npcCtx) : null);
    return {
      bg: (ev.bg && ev.bg !== 'inherit') ? (expandPath(ev.bg, ev, node, npcCtx) || base.bg) : base.bg,
      bgBase: slot(ev.bgBase, base.bgBase || null),
      bgSprite: slot(ev.bgSprite, base.bgSprite || null),
    };
  }
  function sceneTypeSpecFor(ev, node, npcCtx) {
    const st = ev.scene_type || null;
    const pickKey = instanceKey(ev, node);
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
        // A station stall: the vendor's own quarter of the market (human
        // or alien) or the mixed concourse — stable per event instance.
        if (disp === 'trader') {
          const own = (npc.species === 'human') ? 'station/market/human' : 'station/market/alien';
          return { bg: stablePick('market:' + pickKey, [own, 'station/market/mixed']) };
        }
        return { bg: 'station/promenade' };
      }
      case 'planet_surface': {
        // Arrival = the orbital approach; a layer/outcome that goes down
        // to the surface swaps in planet_surface/{biome} (same biome).
        return { bg: 'planet_surface/' + biomeFor(ev, node) + '/approach' };
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
        if (nt === 'planet') return { bg: 'planet_surface/' + biomeFor(ev, node) + '/approach' };
        if (nt === 'derelict') return { bg: 'ship_interior/derelict' };
        if (nt === 'anomaly') {
          const kind = stickyFrom(pickKey + ':anomaly', ANOMALY_KINDS);
          return { bg: 'anomaly/' + kind };
        }
        return { bg: spaceFor(node) };
      }
    }
  }

  /* ── per-layer backdrop (demo renderAll's layer view) ─────────────
     A layer may author `bg` / `bgBase` / `bgSprite` (same names and
     tokens as the demo + Bible §16). Each resolves against the event's
     own scene (sceneSpecFor):
       bg       — set and not 'inherit' → the layer's; otherwise the
                  event's (an empty bg can't blank the scene — demo rule)
       bgBase /
       bgSprite — absent or 'inherit' → the event's; '' / null → none
                  (a full-bleed interior drops the bridge's starfield
                  and viewport ship, like the demo's land_* outcomes);
                  a path → the layer's.
     Returns a concrete {bg, bgBase, bgSprite} (tokens expanded). */
  function layerSpecFor(ev, node, layer, npcCtx) {
    const base = stationHailSpec(ev, node, layer) || sceneSpecFor(ev, node, npcCtx);
    if (!layer) return base;
    const slot = (v, inherited) => (v === undefined || v === 'inherit') ? inherited
      : (v ? expandPath(v, ev, node, npcCtx) : null);
    return {
      bg: (layer.bg && layer.bg !== 'inherit') ? (expandPath(layer.bg, ev, node, npcCtx) || base.bg) : base.bg,
      bgBase: slot(layer.bgBase, base.bgBase || null),
      bgSprite: slot(layer.bgSprite, base.bgSprite || null),
    };
  }

  /* Outcome override (CLAUDE.md schema: scene_bg / scene_bg_base /
     scene_bg_sprite). Any of them set → the outcome's scene replaces
     the current one wholesale (an unset slot is empty — the demo's
     land_* outcomes clear bgBase/bgSprite the same way). None set →
     null: the outcome plays over the layer it resolved from. */
  function outcomeSpecFor(outcome, ev, node, npcCtx) {
    if (!outcome || !(outcome.scene_bg || outcome.scene_bg_base || outcome.scene_bg_sprite)) return null;
    return {
      bg: expandPath(outcome.scene_bg, ev, node, npcCtx),
      bgBase: expandPath(outcome.scene_bg_base, ev, node, npcCtx),
      bgSprite: expandPath(outcome.scene_bg_sprite, ev, node, npcCtx),
    };
  }

  /* ── backdrop painting ────────────────────────────────────────────
     Sequence counter guards in-flight resolutions against the player
     advancing to another event mid-probe (same pattern as the demo). */
  let _bgSeq = 0;
  let _paintedKey = null; // spec + instance currently on screen (layer swaps compare against it)

  function specKeyOf(spec, pickKey) {
    spec = spec || {};
    return pickKey + '|' + (spec.bg || '') + '|' + (spec.bgBase || '') + '|' + (spec.bgSprite || '');
  }

  /* spriteKey (optional): the instance the viewport ship is picked under
     — a recalled NPC (npc.recall, npcCtx.artKey) brings back the very
     ship image first met; everything else picks under pickKey. */
  function applyBackdropSpec(spec, pickKey, node, spriteKey) {
    const main   = document.getElementById('enc-backdrop');
    const base   = document.getElementById('enc-backdrop-base');
    const sprite = document.getElementById('enc-backdrop-sprite');
    if (!main || !base || !sprite) return;
    const mySeq = ++_bgSeq;
    spec = spec || {};
    _paintedKey = specKeyOf(spec, pickKey);
    main.dataset.scene = spec.bg || '';  // the authored path (tests + debugging); the image is the resolved pick

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

    // Approach mode (demo applyBackdrop opts.approachMode): the slot's own
    // background is suppressed; its child paints the node's station.
    const approachEl = document.getElementById('enc-approach-sprite');
    const approach = spec.bgSprite === STATION_APPROACH_POOL;
    sprite.classList.toggle('approach-mode', approach);
    if (approachEl && !approach) clearApproachEl(approachEl);
    if (!spec.bgSprite) {
      sprite.classList.add('hidden');
      sprite.style.backgroundImage = '';
      sprite.classList.remove('bobbing', 'fullbleed');
    } else if (approach) {
      sprite.style.backgroundImage = '';
      sprite.classList.remove('bobbing', 'fullbleed');
      stationApproachFor(node, spec.bgSprite).then(desc => {
        if (mySeq !== _bgSeq) return;
        sprite.classList.toggle('hidden', !desc || !approachEl);
        if (approachEl) paintApproachEl(approachEl, desc, 1);
      });
    } else {
      resolveSprite(spec.bgSprite).then(list => {
        if (mySeq !== _bgSeq) return;
        const path = pickSticky((spriteKey || pickKey) + '|vs:' + spec.bgSprite, list);
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
  // Ruling 47b (demo-npc :363-370): every loop holds the idle frame
  // 500ms, then cycles the talk frames over 1500ms — a 2000ms loop.
  const TALK_PAUSE_MS = 500;
  const TALK_CYCLE_MS = 1500;
  const TALK_LOOP_MS = TALK_PAUSE_MS + TALK_CYCLE_MS;

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
    // file:// launch: XHR is blocked, read the generated bundle instead.
    const bundled = window.TP_PORTABLE && window.TP_PORTABLE.sheets[url];
    if (bundled) return Promise.resolve(bundled);
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
    // npc.variant (scenes pass 2026-10-11): one pinned numbered folder —
    // the void entity is always drifter/unknown/1, never the other face.
    const pinned = Number.isInteger(npcCtx.variant) ? npcCtx.variant : null;
    const cacheKey = pinned ? folder + '#' + pinned : folder;
    if (_npcSheetCache.has(cacheKey)) return _npcSheetCache.get(cacheKey);
    const found = [];
    for (let i = pinned || 1; i <= (pinned || NPC_PROBE_MAX); i++) {
      const url = await probeImage(folder + '/' + i + '/spritesheet.png');
      if (url) found.push({ url, jsonUrl: folder + '/' + i + '/spritesheet.json' });
    }
    if (!found.length) { _npcSheetCache.set(cacheKey, null); return null; }
    // One face per disposition/species for the run, stable across a
    // reload (it re-rolled on load: same pirate, different face).
    const pick = stablePick('npc:' + folder, found);
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
    _npcSheetCache.set(cacheKey, desc);
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

  function setHeadTalking(on) {
    const head = document.getElementById('enc-subject-head');
    if (head) head.classList.toggle('talking', !!on);
  }
  function stopTalking() {
    if (_talkRAF) cancelAnimationFrame(_talkRAF);
    _talkRAF = null;
    setHeadTalking(false); // the emoji/portrait bob stops with the line
    // A line can finish while its spritesheet is still being probed.
    // Clear the deferred start as well as the live loop, otherwise the
    // eventual image load starts talking after the text is complete.
    _pendingLine = null;
    if (_activeSheet) setNpcFrame(_activeSheet, _activeSheet.idleIdx);
  }

  /* Runs the talk loop. The encounter's typewriter stops it when the
     spoken line lands (stopTalking); untilLanded=false (a caller with no
     typewriter) runs it for a duration proportional to the line. */
  function startTalking(line, untilLanded) {
    stopTalking();
    if (!_activeSheet) return;
    const sheet = _activeSheet;
    const frameMs = TALK_CYCLE_MS / sheet.talkIdxs.length;
    // Typed lines: a 60s safety cap only (slow text speed + a long line
    // outlasted the old length estimate, and the mouth stopped mid-line).
    _talkUntil = performance.now() + (untilLanded ? 60000 : Math.min(1200 + String(line || '').length * 35, 6500));
    const start = performance.now();
    function tick(now) {
      if (_activeSheet !== sheet) return;
      if (window.PauseBus && window.PauseBus.paused) { _talkRAF = requestAnimationFrame(tick); return; }
      if (now >= _talkUntil) { setNpcFrame(sheet, sheet.idleIdx); _talkRAF = null; setHeadTalking(false); return; }
      // rAF's timestamp is the frame's START time and can precede the
      // performance.now() captured above — a negative elapsed indexed
      // talkIdxs[-1] → undefined → crash (caught by fuzz, 2026-08-03).
      const elapsed = Math.max(0, now - start) % TALK_LOOP_MS;
      const idx = elapsed < TALK_PAUSE_MS ? sheet.idleIdx
        : sheet.talkIdxs[Math.min(sheet.talkIdxs.length - 1, Math.floor((elapsed - TALK_PAUSE_MS) / frameMs))];
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
    // A fought pirate's flinch must not carry over to the next guest
    // (combat parity 2026-10-11: the demo's head flinch replaced fx-hit).
    head.classList.remove('combat-hit', 'combat-shake');

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
        if (_pendingLine) { startTalking(_pendingLine, _pendingTyped); _pendingLine = null; }
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
      const path = folder + '/' + (Number.isInteger(npcCtx.variant) ? npcCtx.variant : 1) + '/' + stem + '.png';
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
  let _pendingTyped = false; // the pending line is being typed (stops when it lands)

  /* An event id can be drawn more than once in one run. Sticky art may
     remain keyed by id, but presentation state belongs to one entry:
     prior combat opacity and CRT classes must not survive a later draw
     of the same authored event. */
  function beginEvent() {
    _currentEvKey = null;
    _paintedKey = null;
    _currentSubjKey = null;
    stopTalking();
    _activeSheet = null;
  }

  function subjKeyFor(evKey, ctx) {
    return evKey + '|' + (ctx
      ? ctx.disposition + '/' + (ctx.job || '') + '/' + ctx.species + '/' + (ctx.variant || '') + '/' + (ctx.displayName || '')
      : 'none');
  }

  /* Called from renderEncounterState() on every layer paint.
     opts.subjectCtx — layer-level speaker override (demo's presentNpc
     machinery: a cantina layer can put the off-duty engineer in the
     frame while the event's default npc stays the bartender).
     opts.pose — layer pose class (hostile/listening/pleased). */
  let _ctx = null; // {ev, node, npcCtx} of the event on screen — outcome tokens resolve against it

  function render(ev, node, layer, npcCtx, line, opts) {
    opts = opts || {};
    const evKey = ev.id || 'anon';
    const instKey = instanceKey(ev, node);
    _ctx = { ev, node, npcCtx };
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
        if (window.hideCombatEndCard) window.hideCombatEndCard(); // combat parity: the end card never outlives its fight
      }
      const sp = document.getElementById('enc-backdrop-sprite');
      if (sp) { sp.style.opacity = ''; sp.style.transition = ''; sp.classList.remove('combat-hit', 'combat-shake', 'combat-pre-explode', 'combat-ftl-vanish', 'combat-enemy-charge', 'combat-low-hp'); }
      const subjEl2 = document.getElementById('enc-subject');
      if (subjEl2) { subjEl2.classList.remove('combat-crt-off', 'combat-locking', 'combat-ftl-vanish'); subjEl2.style.opacity = ''; }
      const plate = document.getElementById('enc-subject-name');
      if (plate) { plate.classList.remove('combat-crt-off-name', 'combat-ftl-vanish'); plate.style.opacity = ''; }
    }
    // Per-layer backdrop (demo canon): every layer paint resolves its
    // own bg/bgBase/bgSprite against the event's scene; a change from
    // what's on screen repaints (the main layer cross-fades — CSS
    // transition on .enc-backdrop, as in the demo). Same spec → no-op,
    // so re-renders (market close, revisits) don't flicker.
    const spec = layerSpecFor(ev, node, layer, npcCtx);
    if (specKeyOf(spec, instKey) !== _paintedKey) applyBackdropSpec(spec, instKey, node, npcCtx && npcCtx.artKey);
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
    // opts.deferTalk: the encounter types its beats in order and calls
    // talk() when the spoken line's own beat starts (owner ruling
    // 2026-10-11: the NPC talks only during its line).
    if (line && !opts.deferTalk) talk(line, false);
    else {
      _pendingLine = null;
      stopTalking();
    }
  }

  /* The spoken line's beat has started: talk until stopTalking(). */
  function talk(line, typed) {
    typed = typed !== false;
    if (_activeSheet) startTalking(line, typed);
    else { _pendingLine = line; _pendingTyped = typed; }  // sheet still probing — talk when it lands
    // Demo :946-956: a head with no spritesheet bobs while its
    // line types (CSS: .talking:not(.has-spritesheet)); stopTalking clears it.
    setHeadTalking(true);
  }

  /* Called from renderOutcomeView(). Outcomes may override the scene
     (scene_bg / scene_bg_base / scene_bg_sprite per CLAUDE.md schema). */
  function renderOutcome(outcome, npcCtx, opts) {
    opts = opts || {};
    const c = _ctx || {};
    const spec = outcomeSpecFor(outcome, c.ev, c.node, c.npcCtx);
    if (spec) {
      // Same instance key as the layers: an outcome naming the path a
      // layer already showed keeps that very image.
      const instKey = instanceKey(c.ev, c.node);
      if (specKeyOf(spec, instKey) !== _paintedKey) applyBackdropSpec(spec, instKey, c.node, c.npcCtx && c.npcCtx.artKey);
    }
    // Demo :5174 applySubject(s, 'listening', o): the speaker
    // listens on the outcome view unless the outcome authors its own pose.
    const subjEl = document.getElementById('enc-subject');
    if (subjEl) {
      subjEl.classList.remove('pose-hostile', 'pose-listening', 'pose-pleased');
      subjEl.classList.add('pose-' + ((outcome && outcome.pose) || 'listening'));
    }
    if (outcome && outcome.line && npcCtx && !opts.deferTalk) startTalking(outcome.line, false);
    else stopTalking();
  }

  /* Combat FX hook (combat.js): when we land a shot the captain's head
     flinches with their ship — red flash 150ms + shake (demo-combat
     applyEnemyDamage). Both classes clear themselves so the head never
     keeps a stale flash or a finished shake into the next beat. */
  function subjectFX(kind) {
    const head = document.getElementById('enc-subject-head');
    if (!head || kind !== 'hit') return;
    head.classList.add('combat-hit');
    setTimeout(() => head.classList.remove('combat-hit'), 150);
    head.classList.remove('combat-shake'); void head.offsetWidth; head.classList.add('combat-shake');
    clearTimeout(head._shakeT);
    head._shakeT = setTimeout(() => head.classList.remove('combat-shake'), 420);
  }

  /* New run: forget sticky picks + rolled sheet variants so the next
     run re-rolls its own cast. File-existence cache survives. */
  function clearRunCaches() {
    _paintedKey = null;
    _ctx = null;
    _npcSheetCache.clear();
    _currentEvKey = null;
    _currentSubjKey = null;
    _pendingLine = null;
    stopTalking();
    _activeSheet = null;
  }

  const SceneArt = { beginEvent, render, renderOutcome, subjectFX, clearRunCaches, stopTalking, talk, sceneSpecFor, layerSpecFor, outcomeSpecFor, expandPath, biomeFor,
    stationApproachFor, paintStationView, STATION_APPROACH_POOL };

  Object.assign(window, {
    // engine API
    SceneArt,
  });
})();

#!/usr/bin/env node
'use strict';
/* CLICKER SOAK — a seeded random player on the REAL UI (no stubs).
 *
 * Every step it lists what a player could click right now (visible, on
 * screen, the topmost thing at that point), picks one with a seeded RNG
 * and clicks it with the real mouse at a random point inside it. Now and
 * then it presses a key, drags, or reloads the page (save-quit) and comes
 * back with Continue — biased towards reloading mid-event and mid-minigame.
 * The page's Math.random is seeded too (per page load), so a run replays.
 *
 * Flags, each with the seed, a screenshot and the last actions:
 *   ERROR     a page error or console error
 *   TOKEN     NaN / undefined / {token} / [object …] in visible text
 *   SOFTLOCK  nothing clickable for SOFT_S seconds (keys pressed meanwhile)
 *   STUCK     clicking for STUCK_S seconds changes nothing
 *   OVERLAY   body says a modal is open but no overlay is shown (or the reverse)
 *   STATE     a resource/gold/morale/material invariant broken
 *   NOEND     the run used its budget without reaching an ending
 *   ESCAPED   the page navigated away from the game
 *   INJECTED  a typed ship name rendered as HTML (the soak types <i data-soak-inj>)
 *
 * Run (serves the repo itself when URL is not given):
 *   NODE_PATH=$HOME/.nvm/versions/node/v20.20.2/lib/node_modules \
 *     $HOME/.nvm/versions/node/v20.20.2/bin/node tools/clicker_soak.js
 * Env: SEEDS=1-24 (or 3,7,9)  WORKERS=4  PW_BROWSER=firefox  OUT=dir
 *      MAX_ACTIONS=5000  MAX_MIN=30  RELOAD_P=0.004  HEADED=1
 *      REPLAY=OUT/chromium-seed-7.trail.json  re-issues a recorded trail
 *
 * Replays: the page's Math.random is seeded per load and each action is
 * re-issued at its recorded moment, but the game also keeps real time
 * (typing, fades, minigame clocks), so a long replay can drift. It prints
 * the first action that met a different screen than recorded (a short run
 * matched for ~300 actions). Each finding therefore also keeps the game's
 * localStorage saves at that moment (finding.saves in OUT/<browser>-seed-N.json):
 * put them back in localStorage and press Continue to stand where it was.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const pw = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const BROWSER = process.env.PW_BROWSER === 'firefox' ? 'firefox' : 'chromium';
const OUT = path.resolve(process.env.OUT || path.join(ROOT, 'tools', 'soak_out'));
const WORKERS = +(process.env.WORKERS || 4);
const MAX_ACTIONS = +(process.env.MAX_ACTIONS || 5000);
const MAX_MS = +(process.env.MAX_MIN || 30) * 60000;
const RELOAD_P = +(process.env.RELOAD_P || 0.004);
const SOFT_S = +(process.env.SOFT_S || 25);
const STUCK_S = +(process.env.STUCK_S || 120);
const KEY = 'transplant_save_v1';
const isProbeMiss = t => /404|ERR_FILE_NOT_FOUND|Failed to load resource/.test(t);

function parseSeeds(s) {
  const out = [];
  for (const part of String(s || '1-8').split(',')) {
    const m = part.match(/^(\d+)-(\d+)$/);
    if (m) for (let i = +m[1]; i <= +m[2]; i++) out.push(i); else if (part) out.push(+part);
  }
  return out;
}
function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// A tiny static server (the game fetches modules over http).
function serve() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(ROOT)) { rsp.writeHead(403); return rsp.end(); }
      fs.readFile(p, (err, data) => {
        if (err) { rsp.writeHead(404); return rsp.end(); }
        rsp.writeHead(200, { 'Content-Type': types[path.extname(p).toLowerCase()] || 'application/octet-stream' });
        rsp.end(data);
      });
    }).listen(0, () => res({ srv, url: `http://localhost:${srv.address().port}/index.html` }));
  });
}

// ── in-page helpers ────────────────────────────────────────────────
// Seeds Math.random per page load: seed, then seed+1 after the first reload…
const initScript = ({ seed }) => {
  const n = +(sessionStorage.getItem('__soakLoads') || 0);
  sessionStorage.setItem('__soakLoads', String(n + 1));
  let a = (seed * 7919 + n * 104729) | 0;
  Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  window.open = () => null; // a log link would leave the game
};

// What a player could click right now.
const listCandidates = () => {
  const W = innerWidth, H = innerHeight;
  const SEL = 'button, a[href], [role=button], [onclick], input, select, textarea, label, canvas, summary, [tabindex]:not([tabindex="-1"]), .enc-choice, .stop-choice, .sel-card, .inv-tile';
  const set = new Set(document.querySelectorAll(SEL));
  // the game's cursors are pixel-art images: url(…) 12 2, pointer
  const pointer = c => /(^|,\s*)pointer$/.test(c);
  for (const el of document.querySelectorAll('body *')) if (pointer(getComputedStyle(el).cursor)) set.add(el);
  const out = [];
  for (const el of set) {
    const r = el.getBoundingClientRect();
    if (r.width < 3 || r.height < 3 || r.right < 1 || r.bottom < 1 || r.left > W - 1 || r.top > H - 1) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.pointerEvents === 'none') continue;
    // a pointer-styled child of a listed control is the same control
    if (el.parentElement && set.has(el.parentElement) && el.parentElement.getBoundingClientRect().width >= r.width && getComputedStyle(el.parentElement).cursor === cs.cursor && el.tagName !== 'BUTTON' && el.tagName !== 'CANVAS' && el.tagName !== 'INPUT') continue;
    // hit-test: try a few points inside it; keep the ones where it is on top
    const x0 = Math.max(r.left, 0), x1 = Math.min(r.right, W), y0 = Math.max(r.top, 0), y1 = Math.min(r.bottom, H);
    const pts = [[(x0 + x1) / 2, (y0 + y1) / 2], [x0 + (x1 - x0) * 0.25, y0 + (y1 - y0) * 0.3], [x0 + (x1 - x0) * 0.75, y0 + (y1 - y0) * 0.7]];
    const hits = pts.filter(([x, y]) => { const t = document.elementFromPoint(x, y); return t && (t === el || el.contains(t)); });
    if (!hits.length) continue;
    let op = 1; for (let e = el; e && e !== document.body; e = e.parentElement) op *= parseFloat(getComputedStyle(e).opacity);
    if (op < 0.05) continue;
    const txt = (el.innerText || el.value || el.title || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    const dis = el.disabled || el.getAttribute('aria-disabled') === 'true' || /\b(disabled|locked)\b/.test(typeof el.className === 'string' ? el.className : '');
    const id = el.id ? '#' + el.id : '';
    const cls = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    out.push({ desc: el.tagName.toLowerCase() + id + cls, txt, dis, canvas: el.tagName === 'CANVAS', input: el.tagName === 'INPUT' && /text|search|^$/.test(el.type || ''), hits: hits.map(([x, y]) => [Math.round(x), Math.round(y)]), r: [Math.round(x0), Math.round(y0), Math.round(x1 - x0), Math.round(y1 - y0)] });
  }
  return out;
};

const snapshot = () => {
  const act = document.querySelector('.screen.active');
  const ovs = [...document.querySelectorAll('.overlay.active')].map(o => o.id);
  const S = typeof STATE !== 'undefined' ? STATE : null;
  // (defined here: this function runs in the page, not in node)
  const TOKEN_RE = /\{[A-Za-z_.]{1,40}\}|\bundefined\b|\bNaN\b|\[object \w+\]/;
  // visible text, without the typewriting AI log
  const vis = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const t = n.nodeValue; if (!t || !t.trim()) continue;
    const p = n.parentElement; if (!p || p.closest('script,style,noscript,template')) continue;
    const r = p.getBoundingClientRect(); if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) continue;
    const cs = getComputedStyle(p); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    let op = 1, hidden = false; for (let e = p; e && e !== document.body; e = e.parentElement) { const c = getComputedStyle(e); op *= parseFloat(c.opacity); if (c.display === 'none' || c.visibility === 'hidden') { hidden = true; break; } }
    if (hidden || op < 0.05) continue;
    vis.push(t);
  }
  // the ship's name is whatever the player typed (the soak types {x} and NaN on purpose)
  let text = vis.join(' ');
  // …this run's, and earlier runs' in Records and the save slots
  const names = new Set(S && S.shipName ? [String(S.shipName)] : []);
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i); if (!/^transplant/.test(k)) continue;
    try { const o = JSON.parse(localStorage.getItem(k)); if (o && o.shipName) names.add(String(o.shipName)); if (o && Array.isArray(o.runs)) for (const r of o.runs) if (r && r.ship) names.add(String(r.ship)); } catch (e) {}
  }
  for (const nm of names) if (nm.trim()) for (const v of [nm, nm.toUpperCase()]) text = text.split(v).join('«ship»');
  // authored prose that says the word on purpose (grep modules/ before adding)
  for (const ok of [/'sustained' is undefined/gi]) text = text.replace(ok, '«prose»');
  let h = 0; for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  const bad = [];
  if (S) {
    try {
      for (const [k, v] of Object.entries(S.resources || {})) {
        const cap = typeof resMax === 'function' ? resMax(k) : 100;
        if (!Number.isFinite(v) || v < 0 || v > cap + 1e-6) bad.push(`resources.${k}=${v}`);
      }
      for (const r of S.crew || []) { const m = (S.crewMorale || {})[r]; if (!Number.isFinite(m) || m < 0 || m > 100) bad.push(`crewMorale.${r}=${m}`); }
      if (S.goldAmount != null && (!Number.isFinite(S.goldAmount) || S.goldAmount < 0)) bad.push(`gold=${S.goldAmount}`);
      if (S.daysElapsed != null && (!Number.isFinite(S.daysElapsed) || S.daysElapsed < 0)) bad.push(`days=${S.daysElapsed}`);
      for (const [m, q] of Object.entries(S.materials || {})) if (!Number.isFinite(q) || q < 0) bad.push(`materials.${m}=${q}`);
      for (const it of S.items || []) if (typeof it !== 'string') bad.push(`items has ${typeof it}`);
    } catch (e) { bad.push('invariant check threw: ' + e.message); }
  }
  const modal = document.body.classList.contains('modal-open');
  const shownOverlay = ovs.some(id => { const r = document.getElementById(id).getBoundingClientRect(); return r.width > 10 && r.height > 10; });
  const confirm = !!document.querySelector('.tp-confirm-overlay');
  // a typed name that became markup: the soak types <i data-soak-inj>
  const inj = [...document.querySelectorAll('[data-soak-inj]')].map(e => (e.parentElement && (e.parentElement.closest('[id]') || {}).id) || '?');
  return {
    inj: inj.length ? inj.join(',') : null,
    screen: act ? act.id : '', overlays: ovs.join(','), body: document.body.className, text, hash: h,
    tok: (() => { const m = text.match(TOKEN_RE); return m ? text.slice(Math.max(0, m.index - 60), m.index + 60) : null; })(),
    bad, modalNoOverlay: modal && !shownOverlay && !confirm && !document.body.classList.contains('pause-open'),
    ended: !!(S && S.ended), trail: S && S.trail, captain: S && S.captain, ai: S && S.ai, day: S && S.daysElapsed,
    ev: S && S.currentEvent && S.currentEvent.id, layer: S && S.layerStack ? S.layerStack.join('>') : '', node: S && S.currentId,
    minigame: ovs.some(o => /minigames|mining|engrepair/.test(o)) || (typeof COMBAT !== 'undefined' && !!COMBAT.active),
    combat: typeof COMBAT !== 'undefined' && !!COMBAT.active,
    href: location.href,
  };
};

// ── one run ────────────────────────────────────────────────────────
async function runSeed(browserObj, url, seed, replay) {
  const rng = mulberry32(seed * 2654435761);
  const pick = a => a[Math.floor(rng() * a.length)];
  const ctx = await browserObj.newContext({ viewport: { width: 960, height: 640 } });
  await ctx.addInitScript(initScript, { seed });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('[pageerror] ' + String(e.stack || e.message).slice(0, 400)));
  page.on('console', m => { if (m.type() === 'error' && !isProbeMiss(m.text())) errors.push('[console] ' + m.text().slice(0, 300)); });
  page.on('dialog', d => d.accept().catch(() => {}));
  ctx.on('page', p => { if (p !== page) p.close().catch(() => {}); });
  await ctx.route(r => !/^(http:\/\/localhost|file:|data:|blob:)/.test(r), r => r.abort());

  const trail = [];       // every action, replayable
  const findings = [];
  const seen = { screens: new Set(), overlays: new Set(), events: new Set(), reloads: 0, reloadMid: 0, endings: [], evSeq: [], diverged: null };
  const t0 = Date.now();
  let curScr = '';
  const log = (a) => { if (a.t == null) a.t = Date.now() - t0; if (!a.scr) a.scr = curScr; trail.push(a); };
  const stamp = a => { a.t = Date.now() - t0; return a; };
  const dir = path.join(OUT, `${BROWSER}-seed-${seed}`);
  const flagged = new Set();
  async function flag(kind, detail, snap) {
    const key = kind + ':' + String(detail).slice(0, 80);
    if (flagged.has(key)) return; flagged.add(key);
    fs.mkdirSync(dir, { recursive: true });
    const shot = path.join(dir, `${kind}-${findings.length}.png`);
    await page.screenshot({ path: shot }).catch(() => {});
    // the game's own saves at that moment: load them to look at the spot even
    // when a replay drifts (the page keeps real time; see REPLAY below)
    const saves = await page.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^transplant/.test(k)) o[k] = localStorage.getItem(k); } return o; }).catch(() => null);
    findings.push({ kind, detail: String(detail).slice(0, 800), saves, at: trail.length, t: Date.now() - t0, screen: snap && snap.screen, overlays: snap && snap.overlays, ev: snap && snap.ev, layer: snap && snap.layer, day: snap && snap.day, shot, last: trail.slice(-25) });
    console.log(`  [${BROWSER} seed ${seed}] ${kind}: ${String(detail).slice(0, 200)}`);
  }

  await page.goto(url);
  let snapFails = 0, lastHash = null, lastChange = Date.now(), noCandSince = null, errSeen = 0, actions = 0;
  let endedAt = null;

  const doReload = async (why) => {
    log(stamp({ k: 'reload', why }));
    seen.reloads++;
    await page.reload();
  };

  const replayQueue = replay ? replay.slice() : null;
  while (true) {
    if (actions >= MAX_ACTIONS || Date.now() - t0 > MAX_MS) break;
    if (replayQueue && !replayQueue.length) break;
    let snap;
    try { snap = await page.evaluate(snapshot); snapFails = 0; } catch (e) {
      // a navigation (reload) in flight throws once or twice; more is the harness
      if (++snapFails === 40) { await flag('HARNESS', 'state check keeps throwing: ' + e.message.slice(0, 300), null); break; }
      await page.waitForTimeout(300); continue;
    }
    curScr = snap.screen + (snap.combat ? '+combat' : '') + (snap.overlays ? '+' + snap.overlays : '') + (/pause-open/.test(snap.body) ? '+pause' : '');
    seen.screens.add(snap.screen); snap.overlays && snap.overlays.split(',').forEach(o => seen.overlays.add(o)); if (snap.ev && !seen.events.has(snap.ev)) { seen.events.add(snap.ev); seen.evSeq.push(snap.ev); }
    if (!/^http:\/\/localhost|^file:/.test(snap.href) || !/index\.html/.test(snap.href)) { await flag('ESCAPED', snap.href, snap); break; }
    while (errSeen < errors.length) await flag('ERROR', errors[errSeen++], snap);
    if (snap.tok) await flag('TOKEN', snap.tok, snap);
    if (snap.inj) await flag('INJECTED', 'a typed name became HTML inside #' + snap.inj, snap);
    if (snap.bad.length) await flag('STATE', snap.bad.join(' | '), snap);
    if (snap.modalNoOverlay) {
      // the class can lag one frame behind a closing overlay: look again
      await page.waitForTimeout(600);
      const s2 = await page.evaluate(snapshot).catch(() => null);
      if (s2 && s2.modalNoOverlay) await flag('OVERLAY', `body.modal-open with no overlay shown (screen ${s2.screen}, body "${s2.body}")`, s2);
    }
    if (snap.screen === 'screen-end') {
      if (!endedAt) { endedAt = Date.now(); seen.endings.push(snap.text.slice(0, 80)); log({ k: 'note', what: 'ending reached', day: snap.day }); }
      if (Date.now() - endedAt > 6000) break; // poke the end screen a little, then stop
    }
    const sig = snap.hash + '|' + snap.screen + '|' + snap.overlays + '|' + snap.ev + '|' + snap.layer + '|' + snap.day + '|' + snap.body;
    if (sig !== lastHash) { lastHash = sig; lastChange = Date.now(); }
    else if (Date.now() - lastChange > STUCK_S * 1000) { await flag('STUCK', `no change for ${STUCK_S}s on ${snap.screen} [${snap.overlays}] ev=${snap.ev} layer=${snap.layer}`, snap); lastChange = Date.now(); }

    // ── replay: re-issue the recorded action after its recorded delay ──
    // The page keeps time on its own (typing, timers), so a replay can drift:
    // each action notes the screen it met, and the first mismatch is reported.
    if (replayQueue) {
      const a = replayQueue.shift();
      const wait = a.t - (Date.now() - t0); if (wait > 0) await page.waitForTimeout(wait);
      const met = await page.evaluate(() => { const a = document.querySelector('.screen.active'), o = [...document.querySelectorAll('.overlay.active')].map(x => x.id).join(',');
        return (a ? a.id : '') + (typeof COMBAT !== 'undefined' && COMBAT.active ? '+combat' : '') + (o ? '+' + o : '') + (document.body.classList.contains('pause-open') ? '+pause' : ''); }).catch(() => curScr);
      if (a.scr && a.scr !== met && seen.diverged == null) { seen.diverged = trail.length; console.log(`  replay diverged at action ${trail.length}: recorded on ${a.scr}, met ${met}`); }
      if (a.k === 'reload') seen.reloads++;
      await perform(page, a).catch(() => {});
      trail.push(Object.assign({}, a, { scr: met, was: a.scr })); actions++;
      continue;
    }

    const cands = await page.evaluate(listCandidates).catch(() => []);
    if (!cands.length) {
      if (noCandSince == null) noCandSince = Date.now();
      else if (Date.now() - noCandSince > SOFT_S * 1000) { await flag('SOFTLOCK', `nothing clickable for ${SOFT_S}s on ${snap.screen} [${snap.overlays}] ev=${snap.ev} body="${snap.body}"`, snap); noCandSince = Date.now(); }
      // timed screens (title poster, departure) take a key; typing text takes
      // a click anywhere in the frame (snapDelivery): do what a player does
      const a = rng() < 0.5 ? { k: 'key', key: pick(['Space', 'Enter', 'x']) }
        : { k: 'click', x: 40 + Math.floor(rng() * 880), y: 40 + Math.floor(rng() * 560), what: '(the scene)', txt: '' };
      await page.waitForTimeout(400);
      stamp(a); await perform(page, a).catch(() => {}); log(a); actions++;
      continue;
    }
    noCandSince = null;

    // save-quit mid-run: biased towards mid-event / mid-minigame
    const mid = snap.minigame ? 'minigame' : snap.screen === 'screen-encounter' ? 'event' : snap.screen === 'screen-cruise' ? 'hub' : null;
    const hasSave = mid && await page.evaluate(k => !!localStorage.getItem(k), KEY);
    if (mid && hasSave && rng() < RELOAD_P * (mid === 'minigame' ? 12 : mid === 'event' ? 3 : 1)) {
      if (mid !== 'hub') seen.reloadMid++;
      await doReload(mid);
      // the player comes back with Continue: done by the clicker itself, biased below
      continue;
    }

    const a = stamp(choose(cands, snap, rng));
    try { await perform(page, a); } catch (e) { log(Object.assign(a, { err: e.message.slice(0, 80) })); actions++; continue; }
    log(a); actions++;
    await page.waitForTimeout(a.k === 'key' ? 120 : 160 + Math.floor(rng() * 260));
  }

  let fin = null;
  try { fin = await page.evaluate(snapshot); } catch (e) {}
  if (fin && fin.screen !== 'screen-end' && !replay) await flag('NOEND', `budget used (${actions} actions, ${Math.round((Date.now() - t0) / 60000)} min): ${fin.screen} [${fin.overlays}] trail=${fin.trail} day=${fin.day} ev=${fin.ev}`, fin);
  fs.mkdirSync(OUT, { recursive: true });
  const rec = { seed, browser: BROWSER, actions, ms: Date.now() - t0, end: fin && { screen: fin.screen, trail: fin.trail, captain: fin.captain, ai: fin.ai, day: fin.day }, endings: seen.endings, reloads: seen.reloads, reloadMid: seen.reloadMid, screens: [...seen.screens], overlays: [...seen.overlays].filter(Boolean), events: seen.events.size, evSeq: seen.evSeq, diverged: seen.diverged, findings };
  if (!replay) fs.writeFileSync(path.join(OUT, `${BROWSER}-seed-${seed}.trail.json`), JSON.stringify({ seed, browser: BROWSER, trail }, null, 0));
  fs.writeFileSync(path.join(OUT, `${BROWSER}-seed-${seed}${replay ? '.replay' : ''}.json`), JSON.stringify(rec, null, 1));
  await ctx.close();
  return rec;
}

// The detectors must see a planted fault before any run is trusted: a
// {token} in visible text, body.modal-open with no overlay, and a non-empty
// list of things to click. (A regex defined outside the page once made the
// token check throw in Firefox and match nothing in Chrome.)
async function selfTest(browserObj, url) {
  const ctx = await browserObj.newContext({ viewport: { width: 960, height: 640 } });
  const page = await ctx.newPage();
  const fails = [];
  try {
    await page.goto(url);
    await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && document.getElementById('btn-new'), null, { timeout: 30000 });
    const clean = await page.evaluate(snapshot);
    if (clean.tok) fails.push('token on a clean title screen: ' + clean.tok);
    if (!(await page.evaluate(listCandidates)).length) fails.push('nothing clickable on the title screen');
    // the crew slots, crop card and readouts carry only the game's image cursor
    await page.evaluate(() => { applySetupToState({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['pilot', 'engineer'], crop: 'wheat', ship: 'Q' }); STATE.stowaway = null; returnToHub(); });
    await page.waitForTimeout(600);
    const hub = (await page.evaluate(listCandidates)).map(c => c.desc).join(' ');
    for (const want of ['crew-slot', 'crop-card-mini', 'readout-cell']) if (!hub.includes(want)) fails.push('cruise ' + want + ' not seen as clickable');
    await page.evaluate(() => localStorage.removeItem('transplant_save_v1'));
    await page.evaluate(() => { const d = document.createElement('div'); d.id = 'soak-canary'; d.textContent = 'Fuel {canary.token} left'; d.style.cssText = 'position:fixed;left:20px;top:20px;z-index:99999;color:#fff;background:#000;padding:4px'; document.body.appendChild(d); });
    const t = await page.evaluate(snapshot);
    if (!t.tok || !/canary/.test(t.tok)) fails.push('planted {canary.token} not caught');
    await page.evaluate(() => { document.getElementById('soak-canary').textContent = 'Water NaN%'; });
    if (!(await page.evaluate(snapshot)).tok) fails.push('planted NaN not caught');
    await page.evaluate(() => { document.getElementById('soak-canary').innerHTML = '<i data-soak-inj>x</i>'; });
    if (!(await page.evaluate(snapshot)).inj) fails.push('planted markup from a typed name not caught');
    await page.evaluate(() => { document.getElementById('soak-canary').remove(); document.body.classList.add('modal-open'); });
    if (!(await page.evaluate(snapshot)).modalNoOverlay) fails.push('planted modal-open with no overlay not caught');
  } catch (e) { fails.push('self-test threw: ' + e.message.slice(0, 300)); }
  await ctx.close();
  return fails;
}

// Choose one action. Mostly a click on a random candidate; some keys and drags.
function choose(cands, snap, rng) {
  const r = rng();
  if (r < 0.02) return { k: 'click', x: Math.floor(rng() * 960), y: Math.floor(rng() * 640), what: '(a stray click)', txt: '' };
  if (r < 0.05) return { k: 'key', key: ['Escape', 'Enter', 'Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab', '1', '2', 'x'][Math.floor(rng() * 11)] };
  // weights: run-ending controls (quit, abandon, new game over a save) are
  // rarer than the rest so a run gets somewhere; disabled-looking ones rarer
  const w = cands.map(c => {
    let x = 1;
    if (c.dis) x *= 0.15;
    // a monkey that leans forward: back-outs and run-enders are rarer
    if (/quit|abandon|main menu|new game|title|◀/i.test(c.txt)) x *= 0.2;
    else if (!c.dis && /next|launch|continue|resume|depart/i.test(c.txt)) x *= 3;
    if (c.canvas) x *= 3; // minigames want many clicks
    return x;
  });
  const tot = w.reduce((a, b) => a + b, 0);
  let u = rng() * tot, i = 0;
  for (; i < w.length - 1; i++) { u -= w[i]; if (u <= 0) break; }
  const c = cands[i];
  const [hx, hy] = c.hits[Math.floor(rng() * c.hits.length)];
  // a random point in a canvas; the hit point (plus jitter) elsewhere
  let x = hx, y = hy;
  if (c.canvas) { x = c.r[0] + Math.floor(rng() * c.r[2]); y = c.r[1] + Math.floor(rng() * c.r[3]); }
  if (c.input && rng() < 0.5) return { k: 'type', x, y, text: ['Ripley', 'NaN', '{x}', '<i data-soak-inj>x</i>', ''][Math.floor(rng() * 5)], what: c.desc, txt: c.txt };
  if (rng() < 0.06) return { k: 'drag', x, y, x2: Math.floor(rng() * 960), y2: Math.floor(rng() * 640), what: c.desc, txt: c.txt };
  if (c.canvas && rng() < 0.3) return { k: 'hold', x, y, ms: 200 + Math.floor(rng() * 1200), what: c.desc };
  return { k: 'click', x, y, what: c.desc, txt: c.txt };
}

async function perform(page, a) {
  if (a.k === 'click') await page.mouse.click(a.x, a.y);
  else if (a.k === 'key') await page.keyboard.press(a.key);
  else if (a.k === 'type') { await page.mouse.click(a.x, a.y); await page.keyboard.press('ControlOrMeta+a').catch(() => {}); await page.keyboard.type(a.text); }
  else if (a.k === 'drag') { await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move((a.x + a.x2) / 2, (a.y + a.y2) / 2, { steps: 4 }); await page.mouse.move(a.x2, a.y2, { steps: 4 }); await page.mouse.up(); }
  else if (a.k === 'hold') { await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.waitForTimeout(a.ms); await page.mouse.up(); }
  else if (a.k === 'reload') await page.reload();
}

(async () => {
  const { srv, url: own } = process.env.URL ? { srv: null, url: process.env.URL } : await serve();
  // mishaps on (ruling 142): automated browsers get none unless they ask
  const url = (process.env.URL || own).replace(/index\.html.*$/, 'index.html') + '?mishaps=1';
  let browserObj = await pw[BROWSER].launch({ headless: !process.env.HEADED });
  fs.mkdirSync(OUT, { recursive: true });
  console.log(`clicker soak: ${BROWSER} ${url} → ${OUT}`);
  const st = await selfTest(browserObj, url);
  if (st.length) { console.log('SELF-TEST FAILED:', st); await browserObj.close(); if (srv) srv.close(); process.exit(2); }
  console.log('self-test: detectors catch a planted token, NaN, injected markup and a stray modal-open');
  const results = [];
  if (process.env.REPLAY) {
    const rec = JSON.parse(fs.readFileSync(process.env.REPLAY, 'utf8'));
    console.log(`replaying seed ${rec.seed} (${rec.trail.length} actions)`);
    results.push(await runSeed(browserObj, url, rec.seed, rec.trail));
  } else {
    const seeds = parseSeeds(process.env.SEEDS);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(WORKERS, seeds.length) }, async () => {
      while (next < seeds.length) {
        const seed = seeds[next++];
        try {
          const r = await runSeed(browserObj, url, seed);
          results.push(r);
          console.log(`seed ${seed}: ${r.end && r.end.screen} trail=${r.end && r.end.trail} day=${r.end && r.end.day} actions=${r.actions} ${Math.round(r.ms / 1000)}s reloads=${r.reloads}(${r.reloadMid} mid) events=${r.events} findings=${r.findings.length}`);
        } catch (e) {
          console.log(`seed ${seed}: HARNESS CRASH ${e.stack}`); results.push({ seed, crash: String(e.stack) });
          if (!browserObj.isConnected()) browserObj = await pw[BROWSER].launch({ headless: !process.env.HEADED }); // the browser itself died
        }
      }
    }));
  }
  await browserObj.close(); if (srv) srv.close();
  const all = results.flatMap(r => (r.findings || []).map(f => ({ seed: r.seed, ...f })));
  const byKind = {}; for (const f of all) byKind[f.kind] = (byKind[f.kind] || 0) + 1;
  console.log('\nSOAK:', results.length, 'runs;', 'endings', results.filter(r => r.end && r.end.screen === 'screen-end').length,
    '; screens', [...new Set(results.flatMap(r => r.screens || []))].join(' '), '; overlays', [...new Set(results.flatMap(r => r.overlays || []))].join(' '));
  console.log('FINDINGS:', all.length ? JSON.stringify(byKind) : 'none');
  for (const f of all) console.log(`  seed ${f.seed} ${f.kind} @${f.at}: ${f.detail.slice(0, 220)}`);
  process.exit(all.length || results.some(r => r.crash) ? 1 : 0);
})();

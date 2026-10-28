// Ruling 113: the observation-deck title menu. Poster → displays power on →
// intro → menu; skip safety; NEW GAME / CONTINUE hand over to the real
// startNewGame() / loadRun() after the departure; RECORDS opens the real
// panel; reduced motion; scaling through the perspective mapping; the three
// station navigation lights; pause / hidden tab; direct-file and offline
// opening; locked art and display registration. Real game data throughout:
// saves and records are written by the game's own functions.
// Pinned to the Earth view (?view=earth): the lights and the master parity
// are Earth's. The rotation, and the menu over Mars, are test_title_overlay.js's.
const { chromium } = require('playwright');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const URL = process.env.URL || 'http://localhost:8177/index.html';
const ROOT = path.resolve(__dirname, '../..');
const FILE_URL = require('url').pathToFileURL(path.join(ROOT, 'index.html')).href;
const EARTH = '?view=earth';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const errors = [];
let browser;

const MENU_DIR = 'resources/sprites/interface/menu/';
const ART = {
  'scene_master_leafclear_v1_1536x1024.png': '129557686e9273e1dda84e1e9462ddb4ab01989adee945c15f12a0cd36b4e914',
  'foreground_TIGHT_leafclear_v1_1536x1024.png': 'a369451fa2562a07f4fb53d0d08c1dd1720c04742fbbf9273bfc088b7511114f',
  'foreground_CONSERVATIVE_leafclear_v1_1536x1024.png': 'e01f99b94b943040781411e0088034e573e4ff177d250552d7ac8309aede79d5',
  'window_matte_tight_1536x1024.png': '84a8f2f7f555b1537c20f3b0c7ef875bfec97d9e90f9507a4c7007fd0a7c6299',
  'window_matte_conservative_1536x1024.png': 'bb72b0cd9054504ab9cd19c7748f56b9c3ac150146e0ce94e210305baa102dc3',
};
const POSTER_SHA = 'ea87e1c0a2890ab82a6854460df4fcb38b01462ec66ea836ed4c5c07cce831bd';
const LIGHTS = { 'navlight-antenna': [424.69, 123.44], 'navlight-arm': [517.81, 196.56], 'navlight-spire': [421.56, 259.06] };
const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');

async function open(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: opts.w || 960, height: opts.h || 640 }, reducedMotion: opts.rm ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  if (opts.onRequest) page.on('request', r => opts.onRequest(r.url()));
  page.ctx = ctx;
  await page.goto(opts.url || URL + EARTH);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.endings && MOD.failures && window.recordRun && window.TITLE_MENU && document.getElementById('screen-title').classList.contains('active'), null, { timeout: 30000 });
  return page;
}
// Real storage through the game's own code, then a fresh boot on the title.
async function seed(page, { save, records, invalid, far }) {
  await page.evaluate(({ save, records, invalid, far }) => {
    localStorage.clear();
    if (records) {
      applySetupToState({ trail: 'lunar', ai: 'marv', captain: 'veteran', crew: ['engineer', 'medic'], crop: 'wheat', ship: 'Kestrel' });
      STATE.stowaway = null; STATE.cropGrowth.health = 80; STATE.daysElapsed = 64; STATE.ended = false;
      window.renderEndScreen({ kind: 'ending', module: MOD.endings[0] }); window.showEndReport(); clearSave();
    }
    if (save) {
      applySetupToState({ trail: far ? 'interstellar' : 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer', 'medic'], crop: 'wheat', ship: 'Kestrel' });
      STATE.stowaway = null; STATE.daysElapsed = far ? 123 : 12; STATE.ended = false; STATE.currentEvent = null; saveRun();
    }
    if (invalid) localStorage.setItem(SAVE_KEY, invalid);
  }, { save, records, invalid: invalid || null, far: !!far });
  await page.reload();
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.endings && window.TITLE_MENU && document.getElementById('screen-title').classList.contains('active'), null, { timeout: 30000 });
  await page.evaluate(() => window.TITLE_VIEW && TITLE_VIEW.ready); // the poster's key waits for the composited room
}
const stage = page => page.evaluate(() => TITLE_MENU.stage);
// The player's quick path to an armed menu: a key on the poster, a key to
// skip the intro once the poster has faded, the arming beat.
async function toMenu(page) {
  await page.keyboard.press('Space'); await page.waitForTimeout(700);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => TITLE_MENU.stage === 'menu' && document.getElementById('title-buttons').classList.contains('visible'));
  await page.waitForTimeout(500);
}
const activeScreen = page => page.evaluate(() => (document.querySelector('.screen.active') || {}).id);
// Stage px -> screen px through the game frame's scale.
async function mapped(page, id, fx = 0.5, fy = 0.5) {
  return page.evaluate(([id, fx, fy]) => {
    const g = document.getElementById('game').getBoundingClientRect(), s = g.width / 960;
    const b = document.getElementById(id); let x = 0, y = 0, n = b;
    while (n && !n.classList.contains('title-disp')) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    const [sx, sy] = TITLE_MENU.mapPoint('upper', x + b.offsetWidth * fx, y + b.offsetHeight * fy);
    return [g.left + sx * s, g.top + sy * s];
  }, [id, fx, fy]);
}

(async () => {
  browser = await chromium.launch();

  console.log('— locked art: files, served bytes, poster');
  {
    for (const [f, h] of Object.entries(ART)) ok(sha(fs.readFileSync(path.join(ROOT, MENU_DIR, f))) === h, `${f} sha256 ${h.slice(0, 12)}…`);
    ok(sha(fs.readFileSync(path.join(ROOT, 'resources/sprites/interface/poster-title.jpg'))) === POSTER_SHA, 'poster-title.jpg is the owner poster ea87e1c0…');
    // MENU-002C1: the painting is the universal overlay over the Earth
    // background, composited once (test_title_overlay.js has the detail).
    const reqs = [];
    const page = await open({ onRequest: u => reqs.push(u) });
    const served = await page.evaluate(async () => {
      await TITLE_VIEW.ready;
      const img = document.getElementById('title-paint');
      return { arch: TITLE_VIEW.arch, shown: TITLE_VIEW.shown, nw: img.naturalWidth, nh: img.naturalHeight, src: img.getAttribute('src') };
    });
    ok(served.arch === 'composite' && served.shown === 'earth' && /^blob:/.test(served.src) && served.nw === 1536 && served.nh === 1024 && !reqs.some(u => /scene_master/.test(u)),
      `the title paints Earth through the universal overlay, one 1536×1024 composite (${served.src.slice(0, 22)}…); the master is never requested`);
    await page.ctx.close();
  }

  console.log('— display registration and painting fidelity');
  {
    const page = await open();
    await toMenu(page);
    const err = await page.evaluate(() => {
      const g = document.getElementById('game').getBoundingClientRect(); let worst = 0;
      for (const k of ['upper', 'lower']) {
        const d = document.getElementById('title-disp-' + k), [w, h] = TITLE_MENU.DISPLAYS[k].size;
        [[0, 0], [w, 0], [w, h], [0, h]].forEach(([x, y], i) => {
          const pr = document.createElement('div'); pr.style.cssText = `position:absolute;left:${x - 0.5}px;top:${y - 0.5}px;width:1px;height:1px;`;
          d.appendChild(pr); const r = pr.getBoundingClientRect(); pr.remove();
          const q = TITLE_MENU.DISPLAYS[k].quad[i];
          worst = Math.max(worst, Math.hypot((r.left + r.right) / 2 - g.left - q[0], (r.top + r.bottom) / 2 - g.top - q[1]));
        });
      }
      return worst;
    });
    ok(err <= 0.75, `both display planes land on their measured corners (max ${err.toFixed(3)} stage px)`);
    const paint = await page.evaluate(() => { const cs = getComputedStyle(document.getElementById('title-paint')); const r = document.getElementById('title-paint').getBoundingClientRect(), g = document.getElementById('game').getBoundingClientRect();
      return { tf: cs.transform, filter: cs.filter, anims: document.getElementById('title-paint').getAnimations().length, box: [r.left - g.left, r.top - g.top, r.width, r.height] }; });
    ok(paint.tf === 'none' && paint.filter === 'none' && paint.anims === 0 && JSON.stringify(paint.box) === '[0,0,960,640]', 'the painting fills the frame and never transforms, filters or animates');
    // At DPR 1.6 the frame is in source pixels: outside the displays and the
    // three light halos it must be the master (the leaf area too): exactly,
    // but for the composite's ±1-2 on pixels at a window's edge.
    await page.ctx.close();
    const ctx = await browser.newContext({ viewport: { width: 960, height: 640 }, deviceScaleFactor: 1.6 });
    const p2 = await ctx.newPage(); p2.on('pageerror', e => errors.push(e.message));
    await p2.goto(URL + EARTH); await p2.waitForFunction(() => window.TITLE_MENU && document.getElementById('screen-title').classList.contains('active'), null, { timeout: 30000 });
    await toMenu(p2); await p2.mouse.move(959, 639); await p2.evaluate(() => document.activeElement.blur());
    await p2.waitForFunction(() => getComputedStyle(document.getElementById('title-dim')).opacity === '0'); await p2.waitForTimeout(300);
    await p2.evaluate(() => document.getAnimations().filter(a => /^title-nav/.test(a.animationName)).forEach(a => { a.pause(); a.currentTime = a.effect.getTiming().duration + a.effect.getTiming().delay; }));
    const shotPath = path.join(require('os').tmpdir(), 'title_menu_dpr16_' + process.pid + '.png');
    await p2.locator('#game').screenshot({ path: shotPath });
    if (process.env.PY) {
      const out = require('child_process').execFileSync(process.env.PY, ['-I', '-c', `
import sys, json, numpy as np
from PIL import Image, ImageDraw
a = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(int)
m = np.asarray(Image.open(sys.argv[2]).convert('RGB')).astype(int)
mask = Image.new('L', (1536, 1024), 0); d = ImageDraw.Draw(mask)
for q in ([(84.48, 96.95), (296.31, 144.90), (295.07, 368.47), (80.98, 357.34)], [(82.64, 368.60), (292.42, 378.12), (291.49, 447.61), (81.49, 447.98)]):
    d.polygon([(x * 1.6, y * 1.6) for x, y in q], fill=255, outline=255, width=7)
dd = np.abs(a - m).max(2)
diff = dd > 0
ui = np.asarray(mask) > 0
win = np.asarray(Image.open(sys.argv[3]))[..., 3] < 255
edge = win.copy()
for _ in range(3): edge[1:] |= edge[:-1].copy(); edge[:-1] |= edge[1:].copy(); edge[:, 1:] |= edge[:, :-1].copy(); edge[:, :-1] |= edge[:, 1:].copy()
leaf = np.zeros_like(diff); leaf[667:733, 126:203] = True
print(json.dumps({'size': list(a.shape), 'outside': int((diff & ~ui).sum()), 'far': int((diff & ~ui & ~edge).sum()), 'max': int(dd[~ui].max()), 'leaf_outside_ui': int((diff & leaf & ~ui).sum()), 'inside': int((diff & ui).sum())}))
`, shotPath, path.join(ROOT, MENU_DIR, 'scene_master_leafclear_v1_1536x1024.png'), path.join(ROOT, MENU_DIR, 'menu_overlay.png')]).toString();
      const r = JSON.parse(out);
      ok(r.size[0] === 1024 && r.size[1] === 1536 && r.far === 0 && r.max <= 2, `DPR 1.6 menu frame = the leaf-clear master outside the two displays, but for ±${r.max} on ${r.outside} px at window edges (none farther than 3 px; UI inside: ${r.inside} px)`);
      ok(r.leaf_outside_ui === 0, 'the corrected leaf area matches the master');
    } else console.log('  · painting pixel check skipped (set PY to a python with numpy + Pillow)');
    try { fs.unlinkSync(shotPath); } catch (_) {}
    await ctx.close();
  }

  console.log('— poster → displays power on → intro → menu');
  {
    const page = await open();
    ok(await stage(page) === 'poster' && await page.evaluate(() => getComputedStyle(document.getElementById('poster')).opacity) === '1', 'opens on the poster');
    await page.evaluate(() => {
      window.__S = [];
      window.addEventListener('keydown', () => {
        const t0 = performance.now(), poster = document.getElementById('poster');
        (function tick() {
          const crt = {};
          for (const a of document.getAnimations()) if (a.animationName === 'title-crt-on' && a.effect.target.classList.contains('inner')) {
            const k = a.effect.target.parentElement.id.replace('title-disp-', ''), t = a.effect.getTiming();
            crt[k] = { delay: t.delay, active: a.currentTime > t.delay, done: a.playState === 'finished' || a.currentTime >= t.delay + t.duration, op: +getComputedStyle(a.effect.target).opacity };
          }
          __S.push({ t: performance.now() - t0, poster: +getComputedStyle(poster).opacity, crt, typed: document.getElementById('title-tagline').textContent.length, last: document.getElementById('title-tagline-3').textContent, stage: TITLE_MENU.stage });
          if (TITLE_MENU.stage !== 'menu' && performance.now() - t0 < 12000) requestAnimationFrame(tick); else __S.push({ end: true, stage: TITLE_MENU.stage, t: performance.now() - t0 });
        })();
      }, { capture: true, once: true });
    });
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => __S.length && __S[__S.length - 1].end, null, { timeout: 15000 });
    const S = await page.evaluate(() => __S), fr = S.filter(x => !x.end);
    const withBoth = fr.find(x => x.crt.upper && x.crt.lower);
    ok(withBoth && withBoth.crt.upper.delay === 600 && withBoth.crt.lower.delay === 720, 'power-on waits for the poster: upper display at 0.60 s, lower at 0.72 s (the poster fades in 0.6 s)');
    ok(!fr.some(x => x.poster > 0.02 && Object.values(x.crt).some(c => c.active || c.op > 0.001)), 'no display light while the poster is still showing');
    const firstType = fr.find(x => x.typed > 0);
    ok(firstType && firstType.crt.upper.done && firstType.crt.lower.done, `the intro types only after both displays are on (first letter at ${firstType && Math.round(firstType.t)} ms)`);
    const last = S[S.length - 1];
    ok(last.stage === 'menu' && fr.filter(x => x.stage === 'intro').pop().last === 'The plan is not good.', `the menu comes up by itself once the intro has typed (${Math.round(last.t)} ms)`);
    const m = await page.evaluate(() => ({ vis: document.getElementById('title-buttons').classList.contains('visible'), focus: document.activeElement.id, dim: getComputedStyle(document.getElementById('title-dim')).opacity }));
    ok(m.vis && m.focus === 'btn-new', 'menu: buttons up, NEW GAME focused');
    await page.waitForTimeout(1500);
    ok(await page.evaluate(() => getComputedStyle(document.getElementById('title-dim')).opacity) === '0', 'the intro dim lifts in the menu');
    await page.ctx.close();
  }

  console.log('— skip safety');
  {
    const page = await open();
    await page.evaluate(() => { window.__setup = 0; const real = startNewGame; startNewGame = function () { __setup++; return real.apply(this, arguments); }; });
    await page.keyboard.press('Enter'); await page.waitForTimeout(400);
    ok(await stage(page) === 'intro' && await page.evaluate(() => document.getElementById('title-tagline').textContent.length) === 0, 'the poster key does not also skip the intro');
    ok(await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('title-dim')).opacity)) > 0.25, 'the intro dims the room (30%)');
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter'); await page.waitForTimeout(80);
    ok(await page.evaluate(() => TITLE_MENU.stage === 'menu' && document.activeElement.id === 'btn-new' && !TITLE_MENU.armed), 'Enter skips to the menu: NEW GAME focused, not yet armed');
    await page.keyboard.down('Enter'); await page.keyboard.down('Enter'); await page.keyboard.down('Enter'); await page.keyboard.up('Enter');
    await page.waitForTimeout(800);
    ok(await stage(page) === 'menu' && await page.evaluate(() => __setup) === 0, 'a held Enter (repeat) does not press NEW GAME');
    await page.reload(); await page.waitForFunction(() => window.TITLE_MENU && document.getElementById('screen-title').classList.contains('active'));
    await page.evaluate(() => { window.__setup = 0; const real = startNewGame; startNewGame = function () { __setup++; return real.apply(this, arguments); }; });
    await page.keyboard.press('Space'); await page.waitForTimeout(800);
    await page.keyboard.press('Space'); await page.waitForTimeout(800);
    ok(await stage(page) === 'menu' && await page.evaluate(() => __setup) === 0, 'Space skips and does not press NEW GAME');
    await page.reload(); await page.waitForFunction(() => window.TITLE_MENU && document.getElementById('screen-title').classList.contains('active'));
    await page.evaluate(() => { window.__setup = 0; const real = startNewGame; startNewGame = function () { __setup++; return real.apply(this, arguments); }; });
    await page.mouse.click(700, 300); await page.waitForTimeout(900);
    const [nx, ny] = await mapped(page, 'btn-new');
    ok(await stage(page) === 'intro', 'still in the intro');
    await page.mouse.dblclick(nx, ny); await page.waitForTimeout(800);
    ok(await stage(page) === 'menu' && await page.evaluate(() => __setup) === 0, 'a double-click where NEW GAME will appear skips but does not press it');
    await page.ctx.close();
  }

  console.log('— NEW GAME → departure → the real setup wizard, and BACK');
  {
    const page = await open();
    await seed(page, {});
    await toMenu(page);
    await page.click('#btn-new');
    await page.waitForTimeout(250);
    const dep = await page.evaluate(() => ({ s: TITLE_MENU.stage, msg: document.getElementById('title-st-msg').textContent, screen: document.querySelector('.screen.active').id }));
    ok(dep.s === 'departing' && /Departure authorised/.test(dep.msg) && dep.screen === 'screen-title', 'NEW GAME plays the departure first (status: Departure authorised)');
    await page.waitForTimeout(1600);
    const mid = await page.evaluate(() => ({ s: TITLE_MENU.stage, fade: +getComputedStyle(document.getElementById('title-fade')).opacity, upper: +getComputedStyle(document.querySelector('#title-disp-upper .inner')).opacity }));
    ok(mid.s === 'departing' && mid.fade > 0.3 && mid.fade < 0.8 && mid.upper === 0, `the displays have powered down and the frame is fading out (fade ${mid.fade.toFixed(2)} at ≈1.85 s)`);
    await page.waitForFunction(() => document.getElementById('screen-setup').classList.contains('active'), null, { timeout: 5000 });
    ok(await page.evaluate(() => !!document.querySelector('#screen-setup #setup-right .sel-card')), 'then the real setup wizard (startNewGame) opens at its first step');
    // Type in the setup's own fields: the title takes no keys off-screen.
    await page.click('#btn-back');
    await page.waitForFunction(() => document.getElementById('screen-title').classList.contains('active') && TITLE_MENU.stage === 'menu');
    await page.waitForTimeout(500);
    const back = await page.evaluate(() => ({ focus: document.activeElement.id, vis: document.getElementById('title-buttons').classList.contains('visible'), fade: getComputedStyle(document.getElementById('title-fade')).opacity, lines: document.getElementById('title-tagline-3').textContent }));
    ok(back.focus === 'btn-new' && back.vis && back.fade === '0', 'setup BACK returns to the menu: buttons up, frame clear, NEW GAME focused');
    // Re-entering never stacks listeners: one ArrowDown moves one step.
    for (let i = 0; i < 2; i++) { await page.click('#btn-new'); await page.keyboard.press('x'); await page.waitForFunction(() => document.getElementById('screen-setup').classList.contains('active')); await page.click('#btn-back'); await page.waitForFunction(() => TITLE_MENU.stage === 'menu'); await page.waitForTimeout(500); }
    await page.keyboard.press('ArrowDown');
    ok(await page.evaluate(() => document.activeElement.id) === 'btn-continue', 'after three round trips one ArrowDown still moves exactly one button');
    await page.keyboard.press('Home'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
    await page.keyboard.press('x');
    ok(await activeScreen(page) === 'screen-setup', 'a key skips the departure straight into setup');
    ok(await page.evaluate(() => TITLE_MENU.stage === 'departed' && !document.getElementById('screen-title').classList.contains('live')), 'the title idles once it is not on screen');
    await page.ctx.close();
  }

  console.log('— CONTINUE → departure → the real saved voyage');
  {
    const page = await open();
    await seed(page, { save: true, records: true });
    await toMenu(page);
    const m = await page.evaluate(() => ({ dis: document.getElementById('btn-continue').getAttribute('aria-disabled'), cls: document.getElementById('btn-continue').classList.contains('disabled'), msg: document.getElementById('title-st-msg').textContent }));
    await page.mouse.move(959, 639); await page.evaluate(() => document.activeElement.blur()); await page.waitForTimeout(150);
    const idle = await page.evaluate(() => document.getElementById('title-st-msg').textContent);
    ok(m.dis === 'false' && !m.cls && idle === 'Saved voyage: MARS, day 12. Records on file.', `CONTINUE lit; SHIP STATUS reads the real save (${idle})`);
    const before = await page.evaluate(() => ({ s: localStorage.getItem('transplant_save_v1'), r: localStorage.getItem('transplant_records_v1') }));
    await page.click('#btn-continue'); await page.waitForTimeout(200);
    ok(await page.evaluate(() => TITLE_MENU.stage === 'departing' && /Resuming voyage/.test(document.getElementById('title-st-msg').textContent)), 'CONTINUE plays the departure (Resuming voyage.)');
    await page.waitForFunction(() => document.getElementById('screen-cruise').classList.contains('active'), null, { timeout: 6000 });
    const run = await page.evaluate(() => ({ trail: STATE.trail, day: STATE.daysElapsed, ship: STATE.shipName, nodes: STATE.nodes.length }));
    ok(run.trail === 'mars' && run.day === 12 && run.nodes > 0, `then loadRun() resumes the saved voyage on the cruise screen (${run.trail}, day ${run.day})`);
    const after = await page.evaluate(() => ({ r: localStorage.getItem('transplant_records_v1') }));
    ok(after.r === before.r, 'resuming leaves the records as they were');
    await page.ctx.close();
  }

  console.log('— invalid and corrupted saves');
  {
    const page = await open();
    for (const [name, raw] of [['not JSON', '{oops'], ['no map', JSON.stringify({ v: 1, nodes: [], currentId: 'x' })], ['old version', JSON.stringify({ v: 0, nodes: [{ id: 'a' }], currentId: 'a' })]]) {
      await seed(page, { invalid: raw });
      await toMenu(page);
      const r = await page.evaluate(() => ({ dis: document.getElementById('btn-continue').getAttribute('aria-disabled'), cls: document.getElementById('btn-continue').classList.contains('disabled'), stored: localStorage.getItem('transplant_save_v1') }));
      await page.mouse.move(959, 639); await page.evaluate(() => document.activeElement.blur()); await page.waitForTimeout(100);
      const msg = await page.evaluate(() => document.getElementById('title-st-msg').textContent);
      await page.focus('#btn-continue'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowUp'); await page.waitForTimeout(100);
      const hint = await page.evaluate(() => document.getElementById('title-st-msg').textContent);
      await page.keyboard.press('Enter'); await page.click('#btn-continue', { force: true }); await page.waitForTimeout(400);
      ok(r.dis === 'true' && r.cls && r.stored === null && msg === 'No saved voyage aboard.' && /No saved voyage/.test(hint) && await stage(page) === 'menu',
        `${name}: CONTINUE dark, the game clears the save (hasSave), status says so, Enter/click do nothing`);
    }
    // A save that goes bad after the menu came up: CONTINUE stays put.
    await seed(page, { save: true });
    await toMenu(page);
    await page.evaluate(() => localStorage.setItem('transplant_save_v1', '{broken'));
    await page.click('#btn-continue'); await page.waitForTimeout(400);
    ok(await stage(page) === 'menu' && await activeScreen(page) === 'screen-title' && await page.evaluate(() => document.getElementById('btn-continue').getAttribute('aria-disabled')) === 'true', 'a save that breaks while the menu is up: CONTINUE re-checks, stays on the menu and goes dark');
    await page.ctx.close();
  }

  console.log('— RECORDS: open, focus, close, persistence');
  {
    const page = await open();
    await seed(page, {});
    await toMenu(page);
    await page.mouse.move(959, 639);
    ok(await page.evaluate(() => document.getElementById('btn-records').getAttribute('aria-disabled') === 'true' && !document.getElementById('btn-records').hasAttribute('title')), 'no records: RECORDS dark, no flat tooltip');
    await page.click('#btn-records', { force: true }); await page.waitForTimeout(300);
    ok(!await page.evaluate(() => document.getElementById('overlay-records').classList.contains('active')), 'dark RECORDS opens nothing');
    await seed(page, { records: true });
    await toMenu(page);
    await page.focus('#btn-records'); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
    const o = await page.evaluate(() => ({ open: document.getElementById('overlay-records').classList.contains('active'), focus: document.activeElement.id, runs: document.querySelectorAll('#rec-runs .rec-run').length, stored: loadRecords().runs.length }));
    ok(o.open && o.focus === 'rec-x' && o.runs === o.stored && o.stored === 1, `Enter on RECORDS opens the real panel with the stored voyage (${o.runs}), focus on ×`);
    const tabs = [];
    for (let i = 0; i < 3; i++) { await page.keyboard.press('Tab'); tabs.push(await page.evaluate(() => document.activeElement.id)); }
    await page.keyboard.press('Shift+Tab'); tabs.push(await page.evaluate(() => document.activeElement.id));
    ok(JSON.stringify(tabs) === '["rec-clear","rec-x","rec-clear","rec-x"]', `Tab and Shift+Tab stay inside the panel (${tabs.join(' → ')})`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(350);
    const c = await page.evaluate(() => ({ open: document.getElementById('overlay-records').classList.contains('active'), focus: document.activeElement.id, pause: PauseMenu.isOpen() }));
    ok(!c.open && c.focus === 'btn-records' && !c.pause, 'Esc closes it, focus back on RECORDS, no pause terminal');
    await page.keyboard.press('Enter'); await page.waitForTimeout(350);
    await page.click('#rec-x'); await page.waitForTimeout(350);
    ok(await page.evaluate(() => document.activeElement.id) === 'btn-records', '× closes it, focus back on RECORDS');
    await page.click('#btn-records'); await page.waitForTimeout(300);
    const g = await page.evaluate(() => { const r = document.getElementById('game').getBoundingClientRect(); return { x: r.right - 12, y: r.bottom - 12 }; });
    await page.mouse.click(g.x, g.y); await page.waitForTimeout(350);
    ok(await page.evaluate(() => !document.getElementById('overlay-records').classList.contains('active') && document.activeElement.id === 'btn-records'), 'a click outside the card closes it, focus back on RECORDS');
    // Persistence: a reload shows the same; CLEAR (confirmed) persists too.
    await page.reload(); await page.waitForFunction(() => window.TITLE_MENU && document.getElementById('screen-title').classList.contains('active'));
    await toMenu(page);
    ok(await page.evaluate(() => document.getElementById('btn-records').getAttribute('aria-disabled') === 'false' && loadRecords().runs.length === 1), 'records persist across a reload');
    await page.click('#btn-records'); await page.waitForTimeout(300);
    await page.click('#rec-clear');
    ok(await page.evaluate(() => document.activeElement.id) === 'rec-no', 'CLEAR asks first, focus on KEEP');
    await page.click('#rec-yes'); await page.waitForTimeout(100);
    ok(await page.evaluate(() => loadRecords().runs.length === 0 && document.activeElement.id === 'rec-x'), 'YES clears them, focus stays in the panel');
    await page.keyboard.press('Escape'); await page.waitForTimeout(350);
    await page.reload(); await page.waitForFunction(() => window.TITLE_MENU && document.getElementById('screen-title').classList.contains('active'));
    await toMenu(page);
    ok(await page.evaluate(() => document.getElementById('btn-records').getAttribute('aria-disabled') === 'true' && localStorage.getItem('transplant_records_v1') === null), 'cleared records stay cleared after a reload');
    await page.ctx.close();
  }

  console.log('— keyboard and pointer through the perspective mapping');
  for (const [w, h] of [[960, 640], [1280, 800], [1920, 1080], [2560, 1440]]) {
    const page = await open({ w, h });
    await seed(page, { save: true, records: true });
    await toMenu(page);
    const sc = await page.evaluate(() => { const r = document.getElementById('game').getBoundingClientRect(); return { s: r.width / 960, sw: document.documentElement.scrollWidth, iw: innerWidth, sh: document.documentElement.scrollHeight, ih: innerHeight }; });
    let inside = 0, total = 0, outside = 0, outTotal = 0;
    for (const id of ['btn-new', 'btn-continue', 'btn-records']) {
      for (const [fx, fy] of [[0.5, 0.5], [0.06, 0.15], [0.94, 0.15], [0.94, 0.85], [0.06, 0.85]]) {
        const [x, y] = await mapped(page, id, fx, fy); total++;
        if (await page.evaluate(([x, y, id]) => { const e = document.elementFromPoint(x, y); return !!(e && e.closest('#' + id)); }, [x, y, id])) inside++;
      }
      for (const [fx, fy] of [[1.06, 0.5], [0.5, 1.12]]) {
        const [x, y] = await mapped(page, id, fx, fy); outTotal++;
        if (!await page.evaluate(([x, y, id]) => { const e = document.elementFromPoint(x, y); return !!(e && e.closest('#' + id)); }, [x, y, id])) outside++;
      }
    }
    ok(inside === total && outside === outTotal && sc.sw <= sc.iw && sc.sh <= sc.ih, `${w}×${h} (scale ${sc.s.toFixed(3)}): pointer hits follow the mapped buttons (${inside}/${total} in, ${outside}/${outTotal} out), no scrollbars`);
    const [rx, ry] = await mapped(page, 'btn-records');
    await page.mouse.click(rx, ry); await page.waitForTimeout(350);
    ok(await page.evaluate(() => document.getElementById('overlay-records').classList.contains('active')), `${w}×${h}: a real click on mapped RECORDS opens it`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    const seq = [];
    for (const k of ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowUp', 'End', 'Home']) { await page.keyboard.press(k); seq.push(await page.evaluate(() => document.activeElement.id.replace('btn-', ''))); }
    // Focus came back to RECORDS when the panel closed: down wraps to NEW GAME.
    ok(seq.join(',') === 'new,continue,records,continue,records,new', `${w}×${h}: arrows wrap, Home/End jump (${seq.join(' ')})`);
    await page.ctx.close();
  }

  console.log('— station navigation lights');
  {
    const page = await open();
    await toMenu(page);
    const L = await page.evaluate(ids => {
      const g = document.getElementById('game').getBoundingClientRect(), o = {};
      for (const id of ids) { const r = document.getElementById(id).getBoundingClientRect(); o[id] = [r.left + r.width / 2 - g.left, r.top + r.height / 2 - g.top]; }
      const anims = document.getAnimations().filter(a => /^title-nav/.test(a.animationName));
      const props = [...new Set(anims.flatMap(a => a.effect.getKeyframes().flatMap(k => Object.keys(k))))].filter(k => !['offset', 'computedOffset', 'easing', 'composite'].includes(k));
      return { pos: o, n: anims.length, names: anims.map(a => a.animationName + ':' + a.effect.getTiming().duration).sort(), props, order: [...document.getElementById('title-scene').children].map(e => e.id), inUi: !!document.querySelector('#title-ui .title-navlight') };
    }, Object.keys(LIGHTS));
    const err = Math.max(...Object.keys(LIGHTS).map(id => Math.hypot(L.pos[id][0] - LIGHTS[id][0], L.pos[id][1] - LIGHTS[id][1])));
    ok(err <= 0.1, `three lights on their anchors: antenna, docking arm, lower spire (max ${err.toFixed(3)} stage px)`);
    ok(L.n === 3 && JSON.stringify(L.names) === '["title-nav-blink:5200","title-nav-pulse:9400","title-nav-strobe:7700"]' && JSON.stringify(L.props) === '["opacity"]', `the tested timings (5.2 / 9.4 / 7.7 s), opacity only (${L.names.join(', ')})`);
    ok(JSON.stringify(L.order) === '["title-paint","title-navlights","title-dim","title-fade"]' && !L.inUi, 'painting → lights → intro dim → fade: the lights dim with the room, never over the interface');
    const peak = await page.evaluate(() => document.getAnimations().filter(a => /^title-nav/.test(a.animationName)).map(a => { const t = a.effect.getTiming(); const f = { 'title-nav-blink': 0.87, 'title-nav-strobe': 0.905, 'title-nav-pulse': 0.72 }[a.animationName]; a.pause(); a.currentTime = f * t.duration + t.delay; return +(+getComputedStyle(a.effect.target).opacity).toFixed(3); }).sort());
    ok(JSON.stringify(peak) === '[0.595,0.85,0.85]', `restrained peaks as approved (${peak.join(' / ')})`);
    await page.ctx.close();
    const rm = await open({ rm: true });
    ok(await rm.evaluate(() => getComputedStyle(document.getElementById('title-navlights')).display === 'none' && document.getAnimations().filter(a => /^title-nav/.test(a.animationName)).length === 0), 'reduced motion: no lights at all');
    await rm.ctx.close();
  }

  console.log('— pause terminal, hidden tab, other screens');
  {
    const page = await open();
    await toMenu(page);
    const playing = () => page.evaluate(() => document.getAnimations().filter(a => /^title-nav/.test(a.animationName)).map(a => a.playState));
    ok((await playing()).every(s => s === 'running'), 'lights run on the menu');
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    ok(await page.evaluate(() => PauseMenu.isOpen() && !document.getElementById('screen-title').classList.contains('live')) && (await playing()).every(s => s === 'paused'), 'ESC on the menu opens the pause terminal; the title\'s motion pauses');
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    ok((await playing()).every(s => s === 'running'), 'closing it resumes');
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    ok((await playing()).every(s => s === 'paused'), 'a hidden tab pauses the title\'s motion');
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    ok((await playing()).every(s => s === 'running'), 'visible again: running');
    // A departure doesn't wait out a hidden tab.
    await page.keyboard.press('Home'); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    ok(await activeScreen(page) === 'screen-setup', 'a departure lands at once if the tab is hidden');
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    // Keys on another screen are that screen's.
    for (let i = 0; i < 8 && !await page.evaluate(() => !!document.getElementById('ship-name-input')); i++) {
      await page.evaluate(() => { const cards = [...document.querySelectorAll('#setup-right .sel-card')]; if (document.getElementById('crew-count-badge').textContent) { cards[0].click(); cards[1].click(); } else cards[0].click(); document.getElementById('btn-next').click(); });
      await page.waitForTimeout(120);
    }
    const inp = await page.$('#ship-name-input');
    if (inp) { await inp.fill(''); await inp.type('Esc Enter x'); }
    ok(inp && await page.evaluate(() => document.getElementById('ship-name-input').value) === 'Esc Enter x' && await activeScreen(page) === 'screen-setup', 'typing on the setup screen reaches its field (the title takes no keys off-screen)');
    // Leaving mid-intro leaves no timers behind that steal focus later.
    await page.reload(); await page.waitForFunction(() => window.TITLE_MENU && document.getElementById('screen-title').classList.contains('active'));
    await page.keyboard.press('Space'); await page.waitForTimeout(1000);
    await page.evaluate(() => showScreen('screen-setup')); await page.waitForTimeout(7000);
    ok(await page.evaluate(() => TITLE_MENU.stage === 'intro' && document.activeElement.id !== 'btn-new' && !document.getElementById('screen-title').classList.contains('live')), 'leaving mid-intro stops its timers (no menu, no focus grab off-screen)');
    await page.ctx.close();
  }

  console.log('— reduced motion');
  {
    const page = await open({ rm: true });
    await seed(page, { save: true });
    await page.keyboard.press('Enter'); await page.waitForTimeout(700);
    const p = await page.evaluate(() => ({ lines: ['title-tagline', 'title-tagline-2', 'title-tagline-3'].map(id => document.getElementById(id).textContent), anims: document.getAnimations().filter(a => a.playState === 'running' && !(a instanceof CSSTransition) && a.effect.target.closest('#screen-title')).length, rm: document.getElementById('screen-title').classList.contains('rm') }));
    ok(p.rm && p.anims === 0 && p.lines[0] === 'Earth is dying.', 'lines appear whole, no CSS animation runs on the title');
    await page.waitForFunction(() => TITLE_MENU.stage === 'menu', null, { timeout: 6000 });
    await page.waitForTimeout(500);
    const t0 = Date.now();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('screen-setup').classList.contains('active'), null, { timeout: 3000 });
    ok(Date.now() - t0 < 1000, `the departure is a short fade (${Date.now() - t0} ms) into the real setup`);
    await page.ctx.close();
  }

  console.log('— opened from disk, and offline');
  {
    const ctx = await browser.newContext({ viewport: { width: 960, height: 640 } });
    const net = [];
    await ctx.route('**/*', r => { const u = r.request().url(); if (u.startsWith('file:') || u.startsWith('data:') || u.startsWith('blob:')) return r.continue(); net.push(u); return r.abort(); });
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push('file: ' + e.message));
    await page.goto(FILE_URL + EARTH);
    await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.endings && window.TITLE_MENU && document.getElementById('screen-title').classList.contains('active'), null, { timeout: 30000 });
    const r = await page.evaluate(async () => {
      await TITLE_VIEW.ready;
      await document.fonts.ready;
      const want = ["700 30px 'Barlow Semi Condensed'", "500 14px 'IBM Plex Mono'", "600 12.5px 'IBM Plex Mono'", "700 17px 'IBM Plex Mono'"];
      await Promise.all(want.map(f => document.fonts.load(f)));
      const img = document.getElementById('title-paint');
      // FontFace.family: Firefox keeps the quotes.
      return { portable: !!window.TP_PORTABLE, fonts: want.map(f => document.fonts.check(f) && [...document.fonts].some(ff => f.includes(ff.family.replace(/["']/g, '')) && ff.status === 'loaded')), img: img.complete && img.naturalWidth === 1536, arch: TITLE_VIEW.arch };
    });
    ok(r.portable && r.img && r.arch === 'composite' && r.fonts.every(Boolean), `file:// with the network blocked: portable data, the painting (composited from the bundled images: ${r.arch}) and the menu fonts all load from disk (${r.fonts.join('/')})`);
    await toMenu(page);
    await page.click('#btn-new'); await page.waitForFunction(() => document.getElementById('screen-setup').classList.contains('active'), null, { timeout: 5000 });
    ok(true, 'file://: NEW GAME reaches setup');
    ok(net.every(u => /fonts\.(googleapis|gstatic)\.com/.test(u)), `the only network requests are the game's existing Google Fonts link (${net.length}; the menu needs none)`);
    await ctx.close();
  }

  ok(!errors.length, 'page errors: ' + errors.slice(0, 3).join(' | '));
  console.log(`\ntitle_menu: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

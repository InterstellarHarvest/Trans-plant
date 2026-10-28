// MENU-002C1: the title's production renderer. ONE universal room overlay
// (menu_overlay.png) over separate background PNGs (backgrounds/), composited
// ONCE at 1536x1024 behind the poster and shown in the painting's own <img>
// (resources/sprites/interface/menu/code/background-views.js). Checks: the
// file layout and hashes; the three lossless optimisations (MENU-002E: Mars too) against their
// preserved sources (exact, decoded here); Mars V3 (MENU-002C2) against the
// preserved V2: registration and the changed-pixel footprint; Ringed V2-B
// (MENU-002H: skyfix B of V2) and Nebula V1, optimised the same way; the
// four-view rotation (MENU-002H: Earth, Mars V3, Ringed V2-B and Nebula V1,
// equal chance, one draw per load, tested with controlled randomness and a
// stack-checked draw count); the portable bundle; the default
// boot (no master, no bundle over http, no visible canvas); Earth against
// production at several sizes and densities; the composite at source; Mars on
// screen against the exact offline composite (every non-Earth view); selection, station lights, the
// departure line; the poster waiting for the view; recovery paths; the live UI
// and the real flows; file:// with the network blocked; performance.
//   URL=http://localhost:PORT/index.html        this branch, served
//   BASE_URL=http://localhost:PORT2/index.html  production main, served (parity; skipped if unset)
//   BASE_FILE=<dir>/index.html                  production main on disk (file:// timing; optional)
//   PREV_URL=http://localhost:PORT3/index.html  MENU-002C, served (comparison; optional)
//   MARS_URL=http://localhost:PORT4/index.html  MENU-002D, served: Mars V3 unoptimised (comparison; optional)
//   SHOTS=<dir>      keep the review screenshots     OUT=<file>  write the measurements as JSON
const { chromium } = require('playwright');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const URL = process.env.URL || 'http://localhost:8177/index.html';
const BASE_URL = process.env.BASE_URL || '';
const BASE_FILE = process.env.BASE_FILE || '';
const PREV_URL = process.env.PREV_URL || '';
const MARS_URL = process.env.MARS_URL || '';
const SHOTS = process.env.SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const OUT = process.env.OUT || '';
const ORIGIN = new (require('url').URL)(URL).origin;
const ROOT = path.resolve(__dirname, '../..');
const FILE_URL = require('url').pathToFileURL(path.join(ROOT, 'index.html')).href;
const FIREFOX = process.env.PW_BROWSER === 'firefox';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const note = m => console.log('  · ' + m);
const errors = [], consoleErrors = [], badResponses = [];
const M = {};  // measurements (OUT)
let browser;

const MENU = 'resources/sprites/interface/menu/';
const LOCKED = {  // the approved MENU-001 files, kept byte for byte
  'scene_master_leafclear_v1_1536x1024.png': '129557686e9273e1dda84e1e9462ddb4ab01989adee945c15f12a0cd36b4e914',
  'foreground_TIGHT_leafclear_v1_1536x1024.png': 'a369451fa2562a07f4fb53d0d08c1dd1720c04742fbbf9273bfc088b7511114f',
  'foreground_CONSERVATIVE_leafclear_v1_1536x1024.png': 'e01f99b94b943040781411e0088034e573e4ff177d250552d7ac8309aede79d5',
  'window_matte_tight_1536x1024.png': '84a8f2f7f555b1537c20f3b0c7ef875bfec97d9e90f9507a4c7007fd0a7c6299',
  'window_matte_conservative_1536x1024.png': 'bb72b0cd9054504ab9cd19c7748f56b9c3ac150146e0ce94e210305baa102dc3',
  'source/menu_overlay_alphafix002a_original.png': '75cbedaadd5062ac3cd78ccf1c18cc517233cf4ceeaad95923f07333a6f0b7ca', // the 002A alpha-fix overlay, unoptimised
  'source/mars_v2.png': '72aecea6722e5cb5d33660de35d7796a67aaaef9ec177afd77c7b04919a7d1f5', // Mars V2 as supplied (the source of V3)
  'source/mars_v3.png': '25d9496d2b9d32ff55f5da9b12b525f5a40314c98ab39f2d51df5ab0814e01a7', // Mars V3 as approved (the source of backgrounds/mars.png)
  'source/ringed_v2.png': '35022bee643b89d7010a5d642910cb3a32e90c900f1644bd0c416fb38e76a678', // ringed V2 as supplied (MENU-002F2): the historical source of V2-B
  'source/ringed_v2_skyfix_b.png': '75c0aea0a88e72cd1ed8e5c324e3943f0953b260420033861cb953853bd0279c', // Ringed V2-B as approved (skyfix B; the source of backgrounds/ringed.png)
  'source/nebula_v1.png': 'e4d037ebae8850d24d3a05ca117dbdaf745af24f8d11798a2f3e40fe54c4841a', // Nebula V1 as supplied and approved (the source of backgrounds/nebula.png)
  'source/paintings/wide_cinematic_space_scene_atmospheric_sci_fi_rea.png': 'dddfe84912726fbad26300b9697c5257fa529312083b25f9b474e603b4fa29d7', // the painting Mars V2 was registered from (make_mars_v3.py reads it)
  'source/paintings/wide_cinematic_space_scene_high_detail_sci_fi_ast.png': '785a71007f2246250d8073a843f61263b1bc8d6652094de6d67caddee5c77c32', // the illustration Ringed V2 was registered from
};
const RUNTIME = {
  'menu_overlay.png': '358819f27b854f44989ed11d6c1b212d5b22d612f86184c2aa024087d0563616',      // the ONE room overlay (optimisation A)
  'backgrounds/earth.png': 'aa9a9472271ed9f3d9ae34cefa154d4f968360f005c23b5fbd980365ea071b41',  // the master's exterior (optimisation B)
  'backgrounds/mars.png': '8f4363a1fc8c92fb93cf1ce9718ac1b5ec4392ff18292dc2b085fa886c5acded',   // Mars V3, approved, optimised as Earth (MENU-002E)
  'backgrounds/mars_v1.png': '70697f46d8358d013c49e0a323a6130d3b94fb67efc3592152b0c77e1ba3f31c', // Mars V1, rejected (kept)
  'backgrounds/ringed_v1.png': 'e083ce250eb83768c6063dc8a11486a2516ec4d6b9a26ea80bb2037e4d9a2077', // ringed V1 as supplied (MENU-002F1), rejected (kept)
  'backgrounds/ringed.png': 'b0bfa56f4675d02d83ae520e4292e54032794af0755d14a979ac38e3e1c12542',  // Ringed V2-B, approved, optimised as Earth (MENU-002H)
  'backgrounds/nebula.png': 'c43fd3f904c9b4e61943cb4bb2eaf58942ce252019463c491a02df7801b0fc35',  // Nebula V1, approved, optimised as Earth (MENU-002H)
};
const ACTIVE = ['earth', 'mars', 'ringed', 'nebula'];  // the rotation, in registry order: Math.random r draws ACTIVE[floor(r * 4)]
const MARGIN = 8;  // optimisation B keeps the master this far (source px) around every visible pixel
const KNOWN_404 = /sprites\/backgrounds\/space\/deep\/\d\.png$|sprites\/minigames\/mining\/bg[56]\.jpg$|sprites\/(npc|backgrounds\/station)\//;
const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');
const median = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const file = rel => fs.readFileSync(path.join(ROOT, MENU, rel));

// ── PNG in and out (8-bit RGB/RGBA, not interlaced), for exact source checks ──
function pngDecode(buf) {
  let p = 8, w, h, ct, bd, il; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bd = d[8]; ct = d[9]; il = d[12]; } else if (type === 'IDAT') idat.push(d); else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (bd !== 8 || il || (ct !== 2 && ct !== 6)) throw new Error(`unsupported PNG (depth ${bd}, colour type ${ct}, interlace ${il})`);
  const ch = ct === 6 ? 4 : 3, stride = w * ch, raw = zlib.inflateSync(Buffer.concat(idat)), d = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], s = y * (stride + 1) + 1, o = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? d[o + x - ch] : 0, b = y ? d[o - stride + x] : 0, c = x >= ch && y ? d[o - stride + x - ch] : 0;
      let v = raw[s + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      d[o + x] = v & 255;
    }
  }
  return { w, h, ch, d };
}
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = b => { let c = -1; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function pngEncode({ w, h, ch, d }) {
  const stride = w * ch, raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) d.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  const chunk = (t, b) => { const l = Buffer.alloc(4), c = Buffer.alloc(4), tb = Buffer.from(t, 'ascii'); l.writeUInt32BE(b.length); c.writeUInt32BE(crc32(Buffer.concat([tb, b]))); return Buffer.concat([l, tb, b, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = ch === 4 ? 6 : 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const rint = x => { const r = Math.round(x); return Math.abs(x % 1) === 0.5 && r % 2 ? r - 1 : r; };  // numpy's rint
function over(fg, bg) {  // straight-alpha "over", rounded once (the 002A/002C offline reference)
  const n = fg.w * fg.h, d = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) { const a = fg.d[i * 4 + 3] / 255; for (let c = 0; c < 3; c++) d[i * 3 + c] = rint(fg.d[i * 4 + c] * a + bg.d[i * bg.ch + c] * (1 - a)); }
  return { w: fg.w, h: fg.h, ch: 3, d };
}
function diff(A, B, U) {  // px that differ, largest channel difference, and how many lie outside U
  let n = 0, max = 0, out = 0;
  for (let i = 0; i < A.w * A.h; i++) {
    let m = 0; for (let c = 0; c < 3; c++) m = Math.max(m, Math.abs(A.d[i * A.ch + c] - B.d[i * B.ch + c]));
    if (m) { n++; max = Math.max(max, m); if (U && !U[i]) out++; }
  }
  return { n, max, outsideUnion: out };
}

async function open(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: opts.w || 960, height: opts.h || 640 }, deviceScaleFactor: opts.dpr || 1, reducedMotion: opts.rm ? 'reduce' : 'no-preference' });
  if (opts.random !== undefined) await ctx.addInitScript(r => { let v = r; try { const s = sessionStorage.getItem('__qa_random'); if (s !== null) v = +s; } catch (_) {} Math.random = () => v; }, opts.random);
  if (opts.init) await (Array.isArray(opts.init) ? ctx.addInitScript(...opts.init) : ctx.addInitScript(opts.init)); // a function, or [function, arg]
  if (opts.route) await opts.route(ctx);
  const page = await ctx.newPage();
  page.warnings = []; page.requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text()) && !opts.expectErrors) consoleErrors.push(m.text()); if (m.type() === 'warning') page.warnings.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400 && !KNOWN_404.test(r.url()) && !opts.expectErrors) badResponses.push(r.status() + ' ' + r.url()); });
  page.on('request', r => page.requests.push(r.url()));
  page.ctx = ctx;
  const q = [opts.view && 'view=' + opts.view, opts.arch && 'arch=' + opts.arch].filter(Boolean).join('&');
  await page.goto(opts.url || URL + (q ? '?' + q : ''), opts.noWait ? { waitUntil: 'domcontentloaded' } : undefined); // a held-back image would hold up 'load'
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.endings && window.TITLE_MENU && document.getElementById('screen-title').classList.contains('active'), null, { timeout: 30000 });
  if (!opts.noWait) await page.evaluate(() => window.TITLE_VIEW && TITLE_VIEW.ready);
  return page;
}
async function seed(page) {
  await page.evaluate(() => {
    localStorage.clear();
    applySetupToState({ trail: 'lunar', ai: 'marv', captain: 'veteran', crew: ['engineer', 'medic'], crop: 'wheat', ship: 'Kestrel' });
    STATE.stowaway = null; STATE.cropGrowth.health = 80; STATE.daysElapsed = 64; STATE.ended = false;
    window.renderEndScreen({ kind: 'ending', module: MOD.endings[0] }); window.showEndReport(); clearSave();
    applySetupToState({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer', 'medic'], crop: 'wheat', ship: 'Kestrel' });
    STATE.stowaway = null; STATE.daysElapsed = 12; STATE.ended = false; STATE.currentEvent = null; saveRun();
  });
  await page.reload();
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.endings && window.TITLE_MENU && document.getElementById('screen-title').classList.contains('active'), null, { timeout: 30000 });
  await page.evaluate(() => window.TITLE_VIEW && TITLE_VIEW.ready);
}
async function toMenu(page) {
  await page.keyboard.press('Space'); await page.waitForTimeout(700);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => TITLE_MENU.stage === 'menu' && document.getElementById('title-buttons').classList.contains('visible'));
  await page.waitForTimeout(500);
}
async function still(page) {
  await page.mouse.move(0, 0); await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.waitForFunction(() => getComputedStyle(document.getElementById('title-dim')).opacity === '0');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}
const shot = (page, name) => page.locator('#game').screenshot({ animations: 'disabled', caret: 'hide' }).then(b => { if (SHOTS && name) fs.writeFileSync(path.join(SHOTS, name + '.png'), b); return b; });
async function menuShot(opts, name) { const p = await open(opts); await toMenu(p); await still(p); const b = await shot(p, name); await p.ctx.close(); return b; }
async function bareShot(opts, name) { // the room alone: the menu at rest, the interface hidden
  const p = await open(opts); await toMenu(p); await still(p);
  await p.addStyleTag({ content: '#title-ui{visibility:hidden!important}' }); await p.waitForTimeout(150);
  const b = await shot(p, name); await p.ctx.close(); return b;
}
async function mapped(page, id) {
  return page.evaluate(id => {
    const g = document.getElementById('game').getBoundingClientRect(), s = g.width / 960;
    const b = document.getElementById(id); let x = 0, y = 0, n = b;
    while (n && !n.classList.contains('title-disp')) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    const [sx, sy] = TITLE_MENU.mapPoint('upper', x + b.offsetWidth / 2, y + b.offsetHeight / 2);
    return [g.left + sx * s, g.top + sy * s];
  }, id);
}
// A page that shows one reference composite in the painting's box (the
// released way: one <img>), to compare the runtime composite with on screen.
async function refShot(opts, png, name) {
  const p = await open({ ...opts, route: ctx => ctx.route('**/__ref.png', r => r.fulfill({ body: png, contentType: 'image/png' })) });
  await toMenu(p);
  await p.evaluate(() => new Promise(done => { const i = document.getElementById('title-paint'); i.addEventListener('load', done, { once: true }); i.src = '__ref.png'; }));
  await still(p); const b = await shot(p, name); await p.ctx.close(); return b;
}
// The composite bitmap the page shows, read back at 1536x1024.
const readBack = page => page.evaluate(() => { const i = document.getElementById('title-paint'); const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; c.getContext('2d').drawImage(i, 0, 0); return c.toDataURL('image/png'); })
  .then(u => pngDecode(Buffer.from(u.split(',')[1], 'base64')));

// Screen comparisons on the served origin. U = the union of the original
// openings and the alpha-fix footprint (where any background shows).
const PX_INIT = async dir => {
  const img = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('load ' + src.slice(0, 80))); i.src = src; });
  const data = async src => { const i = await img(src); const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; const x = c.getContext('2d'); x.drawImage(i, 0, 0); return { w: c.width, h: c.height, d: x.getImageData(0, 0, c.width, c.height).data }; };
  const tight = await data(dir + 'foreground_TIGHT_leafclear_v1_1536x1024.png'), ov = await data(dir + 'menu_overlay.png');
  const n = 1536 * 1024, U = new Uint8Array(n);
  for (let i = 0; i < n; i++) U[i] = tight.d[i * 4 + 3] < 255 || ov.d[i * 4 + 3] < 255 ? 1 : 0;
  const dist = (W, H) => {
    const s = 1536 / W, D = new Int32Array(W * H).fill(1e6);
    for (let y = 0; y < 1024; y++) for (let x = 0; x < 1536; x++) if (U[y * 1536 + x]) D[Math.min(H - 1, Math.floor(y / s)) * W + Math.min(W - 1, Math.floor(x / s))] = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let d = D[y * W + x]; if (x) d = Math.min(d, D[y * W + x - 1] + 1); if (y) { d = Math.min(d, D[(y - 1) * W + x] + 1); if (x) d = Math.min(d, D[(y - 1) * W + x - 1] + 1); if (x < W - 1) d = Math.min(d, D[(y - 1) * W + x + 1] + 1); } D[y * W + x] = d; }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { let d = D[y * W + x]; if (x < W - 1) d = Math.min(d, D[y * W + x + 1] + 1); if (y < H - 1) { d = Math.min(d, D[(y + 1) * W + x] + 1); if (x < W - 1) d = Math.min(d, D[(y + 1) * W + x + 1] + 1); if (x) d = Math.min(d, D[(y + 1) * W + x - 1] + 1); } D[y * W + x] = d; }
    return D;
  };
  window.PX = { img, data, U, dist };
};
async function pixPage() {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto(ORIGIN + '/' + MENU + 'window_matte_tight_1536x1024.png');
  await p.evaluate(PX_INIT, '/' + MENU);
  p.ctx = ctx;
  return p;
}
const b64 = buf => 'data:image/png;base64,' + buf.toString('base64');
// Two same-size frames: display px that differ, the largest channel
// difference, how far (display px) the farthest change is from the union,
// and how many changes sit beyond 3 px of it.
const cmp = (px, a, b) => px.evaluate(async ([a, b]) => {
  const E = await PX.data(a), V = await PX.data(b), W = E.w, H = E.h;
  if (W !== V.w || H !== V.h) return { size: false };
  const D = PX.dist(W, H); let n = 0, max = 0, far = 0, beyond3 = 0, ge4 = 0;
  for (let p = 0; p < W * H; p++) {
    const d = Math.max(Math.abs(E.d[p * 4] - V.d[p * 4]), Math.abs(E.d[p * 4 + 1] - V.d[p * 4 + 1]), Math.abs(E.d[p * 4 + 2] - V.d[p * 4 + 2]));
    if (!d) continue;
    n++; max = Math.max(max, d); far = Math.max(far, D[p]); if (D[p] > 3) beyond3++; if (d >= 4) ge4++;
  }
  return { size: true, W, H, n, max, far, beyond3, ge4 };
}, [b64(a), b64(b)]);
const fmt = r => `${r.W}×${r.H}: ${r.n} px differ (max ${r.max}, ${r.ge4} px ≥ 4), farthest ${r.far} px from a window`;
const menuReqs = p => p.requests.filter(u => /interface\/menu\/.*\.png|portable_data\.js/.test(u)).map(u => u.split(/interface\/menu\/|engine\/js\//).pop());

(async () => {
  browser = await chromium.launch();
  const px = await pixPage();

  console.log('— files: one universal overlay, backgrounds, preserved sources, menu code together');
  {
    for (const [f, h] of Object.entries(LOCKED)) ok(sha(file(f)) === h, `${f} unchanged (${h.slice(0, 12)}…)`);
    for (const [f, h] of Object.entries(RUNTIME)) ok(sha(file(f)) === h, `${f} = ${h.slice(0, 12)}… (${(file(f).length / 1048576).toFixed(2)} MB)`);
    const walk = d => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(d + e.name + '/') : [d + e.name]);
    const pngs = walk(MENU).filter(f => f.endsWith('.png')).map(f => f.slice(MENU.length)).sort();
    ok(JSON.stringify(pngs) === JSON.stringify([...Object.keys(RUNTIME), ...Object.keys(LOCKED)].sort()), `menu art: one overlay, four active backgrounds + two rejected references, the archived MENU-001 files and the preserved sources; no per-view room images (${pngs.length} PNGs, with the preserved sources)`);
    const code = walk(MENU + 'code/').map(f => f.slice(MENU.length + 5)).sort();
    ok(JSON.stringify(code) === JSON.stringify(['README.txt', 'artwork-manifest.json', 'background-effects.css', 'background-views.js', 'menu.css', 'menu.js']), `code/: ${code.join(', ')}`);
    const src = fs.readFileSync(path.join(ROOT, MENU, 'code/background-views.js'), 'utf8');
    const refs = [...new Set([...src.matchAll(/['"]([\w/-]+\.png)['"]/g)].map(m => m[1]))].sort();
    ok(JSON.stringify(refs) === JSON.stringify(['backgrounds/earth.png', 'backgrounds/mars.png', 'backgrounds/mars_v1.png', 'backgrounds/nebula.png', 'backgrounds/ringed.png', 'backgrounds/ringed_v1.png', 'menu_overlay.png']), `the views code names one foreground and the backgrounds only (${refs.join(', ')})`);
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const paintTag = (html.match(/<img[^>]*id="title-paint"[^>]*>/) || [''])[0];
    ok(!/src=/.test(paintTag) && !/scene_master/.test(html), `index.html: the painting's <img> has no source of its own and nothing names the master (${paintTag})`);
    ok(['code/menu.css', 'code/background-effects.css', 'code/menu.js', 'code/background-views.js'].every(f => html.includes('"' + MENU + f + '"')) && !/screen-title\.css|screens\/title(_views)?\.js/.test(html),
      'index.html loads the menu from code/ only');
    const rot = [...src.matchAll(/\{ id: '([\w-]+)', bg: DIR \+ '([\w/.]+)', station: (true|false), rotation: (true|false) \}/g)].map(m => ({ id: m[1], bg: m[2], rotation: m[4] === 'true' }));
    ok(rot.length === 6 && rot.filter(v => v.rotation).map(v => v.id).join() === ACTIVE.join(), `registered views ${rot.map(v => v.id).join(', ')}; the rotation is Earth, Mars, Ringed and Nebula (Mars V1 and ringed V1 rejected: QA views only)`);
    M.rotation = rot;
  }

  console.log('— the five lossless optimisations, against their preserved sources (decoded exactly)');
  {
    const ov0 = pngDecode(file('source/menu_overlay_alphafix002a_original.png')), ov = pngDecode(file('menu_overlay.png'));
    const master = pngDecode(file('scene_master_leafclear_v1_1536x1024.png')), earth = pngDecode(file('backgrounds/earth.png'));
    ok(ov.ch === 4 && earth.ch === 3 && [ov0, ov, master, earth].every(i => i.w === 1536 && i.h === 1024), 'all 1536×1024; the overlay RGBA, Earth RGB');
    const n = 1536 * 1024; let alphaSame = true, visSame = true, zeroed = 0, a0 = 0;
    for (let i = 0; i < n; i++) {
      const a = ov0.d[i * 4 + 3];
      if (ov.d[i * 4 + 3] !== a) alphaSame = false;
      if (a > 0) { for (let c = 0; c < 3; c++) if (ov.d[i * 4 + c] !== ov0.d[i * 4 + c]) visSame = false; } else { a0++; if (!ov.d[i * 4] && !ov.d[i * 4 + 1] && !ov.d[i * 4 + 2]) zeroed++; }
    }
    ok(alphaSame && visSame && zeroed === a0, `A, overlay: alpha identical on every pixel; RGB identical wherever alpha > 0; RGB 0 under all ${a0.toLocaleString()} fully transparent pixels`);
    // distance (chessboard) from the nearest pixel the overlay lets through
    const D = new Int32Array(n).fill(1e6);
    for (let i = 0; i < n; i++) if (ov0.d[i * 4 + 3] < 255) D[i] = 0;
    for (let y = 0; y < 1024; y++) for (let x = 0; x < 1536; x++) { const i = y * 1536 + x; let d = D[i]; if (x) d = Math.min(d, D[i - 1] + 1); if (y) { d = Math.min(d, D[i - 1536] + 1); if (x) d = Math.min(d, D[i - 1537] + 1); if (x < 1535) d = Math.min(d, D[i - 1535] + 1); } D[i] = d; }
    for (let y = 1023; y >= 0; y--) for (let x = 1535; x >= 0; x--) { const i = y * 1536 + x; let d = D[i]; if (x < 1535) d = Math.min(d, D[i + 1] + 1); if (y < 1023) { d = Math.min(d, D[i + 1536] + 1); if (x < 1535) d = Math.min(d, D[i + 1537] + 1); if (x) d = Math.min(d, D[i + 1535] + 1); } D[i] = d; }
    let keptSame = true, simplified = 0, simplifiedHidden = true;
    for (let i = 0; i < n; i++) {
      const same = earth.d[i * 3] === master.d[i * 3] && earth.d[i * 3 + 1] === master.d[i * 3 + 1] && earth.d[i * 3 + 2] === master.d[i * 3 + 2];
      if (D[i] <= MARGIN) { if (!same) keptSame = false; } else if (!same) { simplified++; if (ov0.d[i * 4 + 3] !== 255) simplifiedHidden = false; }
    }
    ok(keptSame && simplifiedHidden, `B, Earth: every pixel the overlay lets through, and ${MARGIN} px of real Earth around each, is the master's; the ${simplified.toLocaleString()} simplified pixels are all under fully opaque room`);
    const e = diff(over(ov, earth), master);
    ok(e.n === 0, `the optimised overlay over the optimised Earth = the approved master at 1536×1024 (${e.n} px differ)`);
    const v3 = pngDecode(file('source/mars_v3.png')), mars = pngDecode(file('backgrounds/mars.png'));
    let mKept = true, mSimplified = 0, mHidden = true;
    for (let i = 0; i < n; i++) {
      const same = mars.d[i * 3] === v3.d[i * 3] && mars.d[i * 3 + 1] === v3.d[i * 3 + 1] && mars.d[i * 3 + 2] === v3.d[i * 3 + 2];
      if (D[i] <= MARGIN) { if (!same) mKept = false; } else if (!same) { mSimplified++; if (ov0.d[i * 4 + 3] !== 255) mHidden = false; }
    }
    ok(mars.ch === 3 && mars.w === 1536 && mars.h === 1024 && mKept && mHidden, `C, Mars (MENU-002E): RGB 1536×1024 as V3; every pixel the overlay lets through, and ${MARGIN} px of real Mars around each, is V3's; the ${mSimplified.toLocaleString()} simplified pixels are all under fully opaque room`);
    const mc = diff(over(ov, mars), over(ov, v3));
    ok(mc.n === 0, `the overlay over the optimised Mars = the overlay over Mars V3 at 1536×1024 (${mc.n} px differ)`);
    const opt2 = {};
    for (const [L, name, srcF, optF] of [['D', 'Ringed (MENU-002H)', 'source/ringed_v2_skyfix_b.png', 'backgrounds/ringed.png'], ['E', 'Nebula (MENU-002H)', 'source/nebula_v1.png', 'backgrounds/nebula.png']]) {
      const S = pngDecode(file(srcF)), O = pngDecode(file(optF));
      let kept = true, simp = 0, hidden = true;
      for (let i = 0; i < n; i++) {
        const same = O.d[i * 3] === S.d[i * 3] && O.d[i * 3 + 1] === S.d[i * 3 + 1] && O.d[i * 3 + 2] === S.d[i * 3 + 2];
        if (D[i] <= MARGIN) { if (!same) kept = false; } else if (!same) { simp++; if (ov0.d[i * 4 + 3] !== 255) hidden = false; }
      }
      ok(S.ch === 3 && O.ch === 3 && O.w === 1536 && O.h === 1024 && kept && hidden, `${L}, ${name}: RGB 1536×1024 as its source; every pixel the overlay lets through, and ${MARGIN} px around each, is ${srcF}'s; the ${simp.toLocaleString()} simplified pixels are all under fully opaque room`);
      const dc = diff(over(ov, O), over(ov, S));
      ok(dc.n === 0, `the overlay over the optimised ${name.split(' ')[0]} = the overlay over its approved source at 1536×1024 (${dc.n} px differ)`);
      opt2[optF] = { before: file(srcF).length, after: file(optF).length, simplifiedPx: simp };
    }
    {  // Ringed V2-B = V2 with only the skyfix footprint changed (source/tools/skyfix_ab.py regenerates it)
      const A = pngDecode(file('source/ringed_v2.png')), B = pngDecode(file('source/ringed_v2_skyfix_b.png'));
      let ch = 0, x0 = 1536, x1 = -1, y0 = 1024, y1 = -1;
      for (let i = 0; i < n; i++) if (A.d[i * 3] !== B.d[i * 3] || A.d[i * 3 + 1] !== B.d[i * 3 + 1] || A.d[i * 3 + 2] !== B.d[i * 3 + 2]) { ch++; const x = i % 1536, y = (i / 1536) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      ok(ch === 434 && x0 >= 872 && x1 <= 1128 && y0 >= 63 && y1 <= 88, `Ringed V2-B vs V2 as supplied: only the two dark-sky duplicate stars' footprints differ (${ch} px, x ${x0}–${x1}, y ${y0}–${y1})`);
    }
    const U = new Uint8Array(n); const tight = pngDecode(file('foreground_TIGHT_leafclear_v1_1536x1024.png'));
    for (let i = 0; i < n; i++) U[i] = tight.d[i * 4 + 3] < 255 || ov.d[i * 4 + 3] < 255 ? 1 : 0;
    M.exact = {};
    for (const [view, f] of [['earth', 'backgrounds/earth.png'], ['mars', 'backgrounds/mars.png'], ['mars-v1', 'backgrounds/mars_v1.png'], ['ringed-v1', 'backgrounds/ringed_v1.png'], ['ringed', 'backgrounds/ringed.png'], ['nebula', 'backgrounds/nebula.png']]) {
      const bg = pngDecode(file(f)); M.exact[view] = over(ov, bg);
      if (view !== 'earth') { const d = diff(M.exact[view], over(ov0, bg)); ok(d.n === 0, `${view}: the optimised overlay composites exactly as the original one (${d.n} px differ)`); }
    }
    for (const view of ['mars', 'ringed', 'nebula']) {  // the same room around every active view as around Earth
      let open = 0, out = 0;
      for (let i = 0; i < n; i++) { if (ov.d[i * 4 + 3] < 255) open++; let m = 0; for (let c = 0; c < 3; c++) m = Math.max(m, Math.abs(M.exact[view].d[i * 3 + c] - M.exact.earth.d[i * 3 + c])); if (m && ov.d[i * 4 + 3] === 255) out++; }
      ok(out === 0, `${view} vs Earth through the same overlay: every difference lies in the ${open.toLocaleString()} px the overlay lets through (${out} px under opaque room)`);
    }
    M.union = U; M.master = master;
    M.optimisation = { overlay: { before: file('source/menu_overlay_alphafix002a_original.png').length, after: file('menu_overlay.png').length }, earth: { before: file('scene_master_leafclear_v1_1536x1024.png').length, after: file('backgrounds/earth.png').length }, mars: { before: file('source/mars_v3.png').length, after: file('backgrounds/mars.png').length }, ringed: opt2['backgrounds/ringed.png'], nebula: opt2['backgrounds/nebula.png'], simplifiedPx: simplified, marsSimplifiedPx: mSimplified, alpha0Px: a0 };
  }

  console.log('— Mars V3: V2 with its skylight repaired (exact, against the preserved V2)');
  {
    const v2 = pngDecode(file('source/mars_v2.png')), v3 = pngDecode(file('source/mars_v3.png'));
    const ov = pngDecode(file('menu_overlay.png'));
    ok([v2, v3].every(i => i.w === 1536 && i.h === 1024 && i.ch === 3), 'V2 and V3 both RGB 1536×1024 (the same registration)');
    let out = 0, inside = 0, vis = 0, visChanged = 0, x0 = 1536, x1 = -1, y1 = -1;
    for (let y = 0; y < 1024; y++) for (let x = 0; x < 1536; x++) {
      const i = y * 1536 + x, k = i * 3;
      const changed = v2.d[k] !== v3.d[k] || v2.d[k + 1] !== v3.d[k + 1] || v2.d[k + 2] !== v3.d[k + 2];
      const band = y < 24 && x >= 480;
      if (band && ov.d[i * 4 + 3] < 255) { vis++; if (changed) visChanged++; }
      if (!changed) continue;
      if (band) { inside++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } else out++;
    }
    ok(out === 0, `nothing outside the mirrored band changed: rows 24–1023 and x < 480 are V2 byte for byte (${out} px elsewhere)`);
    ok(inside > 0 && y1 <= 23 && x0 >= 480, `${inside.toLocaleString()} of the band's ${(24 * 1056).toLocaleString()} px rebuilt (x ${x0}–${x1}, rows 0–${y1}); ${visChanged.toLocaleString()} of the ${vis.toLocaleString()} the skylights show`);
    const mirror = im => { let same = 0, n = 0; for (let y = 0; y < 24; y++) for (let x = 530; x < 1536; x++) { n++; const a = (y * 1536 + x) * 3, b = ((48 - y) * 1536 + x) * 3; if (im.d[a] === im.d[b] && im.d[a + 1] === im.d[b + 1] && im.d[a + 2] === im.d[b + 2]) same++; } return same / n; };
    const m2 = mirror(v2), m3 = mirror(v3);
    ok(m2 === 1 && m3 < 0.02, `the defect: V2's rows 0–23 are row 24's mirror (${(m2 * 100).toFixed(1)}% of px); V3's are not (${(m3 * 100).toFixed(1)}%)`);
    M.marsV3 = { changedPx: inside, visiblePx: vis, visibleChanged: visChanged, bbox: [x0, 0, x1, y1], mirrorV2: m2, mirrorV3: m3, bytes: file('source/mars_v3.png').length };
  }

  console.log('— the portable bundle (file:// only)');
  {
    const { build, OUT: BUNDLE } = require('../build_portable.js');
    const cur = fs.readFileSync(path.join(ROOT, BUNDLE), 'utf8');
    ok(cur === build(), `${BUNDLE} is fresh (= tools/build_portable.js output, ${(cur.length / 1048576).toFixed(2)} MB)`);
    const imgs = JSON.parse(cur.slice(cur.indexOf('window.TP_PORTABLE = ') + 21).trim().replace(/;$/, '')).images;
    const menuKeys = Object.keys(imgs).filter(k => k.startsWith(MENU)).sort();
    const want = [MENU + 'backgrounds/earth.png', MENU + 'backgrounds/mars.png', MENU + 'backgrounds/nebula.png', MENU + 'backgrounds/ringed.png', MENU + 'menu_overlay.png'];
    ok(JSON.stringify(menuKeys) === JSON.stringify(want) && menuKeys.every(k => imgs[k] === b64(fs.readFileSync(path.join(ROOT, k)))),
      `it carries the overlay and the rotation's backgrounds (${menuKeys.map(k => k.slice(MENU.length)).join(', ')}), byte for byte`);
    ok(M.rotation.filter(v => v.rotation).every(v => menuKeys.includes(MENU + v.bg)), 'every rotation background is in the bundle (a disk launch never falls back)');
    M.bundle = { bytes: cur.length, menuImageBytes: menuKeys.reduce((n, k) => n + imgs[k].length, 0) };
  }

  console.log('— the default boot (no parameter): one of the four, composited once, behind the poster');
  {
    let canvases = null;
    if (BASE_URL) { const p = await open({ url: BASE_URL }); canvases = await p.evaluate(() => document.querySelectorAll('canvas').length); await p.ctx.close(); }
    for (const r of [0, 0.2499, 0.25, 0.4999, 0.5, 0.7499, 0.75, 0.9999]) {
      const view = ACTIVE[Math.floor(r * 4)], earth = view === 'earth';
      const p = await open({ random: r });
      const s = await p.evaluate(() => ({ v: TITLE_VIEW.shown, a: TITLE_VIEW.arch, fb: TITLE_VIEW.fallback || null, src: document.getElementById('title-paint').getAttribute('src'), nw: document.getElementById('title-paint').naturalWidth,
        imgs: document.querySelectorAll('#screen-title img').length, bg: !!document.getElementById('title-bg'), lights: !document.getElementById('title-navlights').hidden,
        titleCanvas: document.querySelectorAll('#screen-title canvas').length, canvases: document.querySelectorAll('canvas').length, portable: !!window.TP_PORTABLE }));
      const reqs = menuReqs(p);
      ok(s.v === view && s.a === 'composite' && !s.fb && /^blob:/.test(s.src) && s.nw === 1536 && s.imgs === 1 && !s.bg && s.lights === earth, `Math.random → ${r}: ${view}, one 1536×1024 composite in the painting's own <img>, station lights ${earth ? 'on' : 'off'}`);
      ok(JSON.stringify(reqs.sort()) === JSON.stringify([`backgrounds/${view}.png`, 'menu_overlay.png']) && !s.portable, `  requests only ${reqs.join(' + ')}: no master, no other background, no portable bundle over http`);
      ok(s.titleCanvas === 0 && (canvases === null || s.canvases === canvases), `  no canvas on the title; the page has ${s.canvases} canvases${canvases === null ? '' : ', as production'} (the composite's is never attached)`);
      await p.ctx.close();
    }
    const p = await open({ view: 'nowhere', random: 0.4 });
    ok(await p.evaluate(() => TITLE_VIEW.shown) === 'mars' && p.warnings.some(w => /not registered/.test(w)), 'an unknown ?view= warns and uses the rotation (→ 0.4: Mars)');
    await p.ctx.close();
  }

  console.log('— Earth vs the released Earth (production main), several sizes and densities');
  M.earthParity = {};
  if (BASE_URL) {
    for (const [w, h, dpr] of [[960, 640, 1], [960, 640, 1.25], [960, 640, 1.6], [960, 640, 2], [1280, 800, 1], [1920, 1080, 1]]) {
      const tag = `${w}x${h}_dpr${dpr}`, keep = w === 960 && dpr === 1;
      const r = await cmp(px, await menuShot({ url: BASE_URL, w, h, dpr }, keep ? `released_earth_menu_${tag}` : null), await menuShot({ view: 'earth', w, h, dpr }, keep ? `earth_menu_${tag}` : null));
      M.earthParity[tag] = r;
      note(`${w}×${h} DPR ${dpr}: ${fmt(r)}`);
    }
    const c = Object.values(M.earthParity);
    ok(c.every(r => r.size && r.max <= 2 && r.beyond3 === 0), `Earth within ±${Math.max(...c.map(r => r.max))} of production at every size and density, only at window edges (${c.reduce((n, r) => n + r.n, 0).toLocaleString()} px over ${c.length} frames; none ≥ 3 px from a window)`);
    // the room alone, for the review's edge crops
    if (SHOTS) for (const dpr of [1, 1.6]) { await bareShot({ url: BASE_URL, dpr }, `released_earth_controls-hidden_960x640_dpr${dpr}`); await bareShot({ view: 'earth', dpr }, `earth_controls-hidden_960x640_dpr${dpr}`); }
  } else note('skipped (set BASE_URL)');
  if (PREV_URL) {
    // The recovery path scales the two layers itself, so it also shows any
    // simplified Earth pixel that strays into a window edge: against 002C's
    // layers (the original files) it must be identical.
    M.layersVsPrev = {};
    for (const [w, h, dpr] of [[960, 640, 1], [960, 640, 1.25], [960, 640, 2], [1920, 1080, 1]]) {
      const r = await cmp(px, await menuShot({ url: PREV_URL + '?view=earth&arch=layers', w, h, dpr }), await menuShot({ view: 'earth', arch: 'layers', w, h, dpr }));
      M.layersVsPrev[`${w}x${h}_dpr${dpr}`] = r;
    }
    const c = Object.values(M.layersVsPrev);
    ok(c.every(r => r.n === 0), `the two-layer recovery path with the optimised files = 002C's layers with the originals, on screen, at 4 sizes (${c.map(r => r.n).join('/')} px): the margin keeps the scaled edges intact`);
  }
  if (MARS_URL) {
    // MENU-002E: the optimised Mars against Mars V3 as approved (002D), on
    // screen, through the composite and through the scaled recovery layers.
    M.marsVsV3 = {};
    for (const arch of ['composite', 'layers']) for (const [w, h, dpr] of [[960, 640, 1], [960, 640, 1.25], [960, 640, 2], [1920, 1080, 1]]) {
      const q = arch === 'layers' ? '&arch=layers' : '';
      const r = await cmp(px, await menuShot({ url: MARS_URL + '?view=mars' + q, w, h, dpr }), await menuShot({ view: 'mars', arch: arch === 'layers' ? 'layers' : undefined, w, h, dpr }));
      M.marsVsV3[`${arch}_${w}x${h}_dpr${dpr}`] = r;
    }
    const c = Object.entries(M.marsVsV3), comp = c.filter(([k]) => k.startsWith('composite')).map(([, r]) => r), lay = c.filter(([k]) => k.startsWith('layers')).map(([, r]) => r);
    ok(comp.every(r => r.n === 0), `the optimised Mars on screen = Mars V3 as approved (002D), through the composite, at 4 sizes (${comp.map(r => r.n).join('/')} px)`);
    // The recovery path scales the background by itself; a wide downscaling
    // filter (Firefox at DPR 1) can reach past the 8 px band at a window edge.
    ok(lay.every(r => r.max <= 1 && r.beyond3 === 0), `  and through the two-layer recovery path, at 4 sizes: ${lay.map(r => r.n).join('/')} px differ, max ${Math.max(...lay.map(r => r.max))}, all at window edges`);
  }

  console.log('— the composite at source (1536×1024, read back from the page)');
  M.source = {};
  for (const view of ['earth', 'mars', 'mars-v1', 'ringed-v1', 'ringed', 'nebula']) {
    const p = await open({ view });
    const B = await readBack(p); await p.ctx.close();
    const vsExact = diff(B, M.exact[view], M.union);
    const r = { w: B.w, h: B.h, vsExact };
    if (view === 'earth') r.vsMaster = diff(B, M.master, M.union);
    M.source[view] = r;
    ok(B.w === 1536 && B.h === 1024 && vsExact.max <= 2 && vsExact.outsideUnion === 0, `${view}: the browser's composite vs the exact offline "over": ${vsExact.n} px differ, max ${vsExact.max}, all at window pixels${r.vsMaster ? `; vs the approved master the same (${r.vsMaster.n} px, max ${r.vsMaster.max})` : ''}`);
  }

  console.log('— Mars on screen vs the exact offline composite (one <img>)');
  M.mars = {};
  for (const view of ['mars', 'mars-v1', 'ringed-v1', 'ringed', 'nebula']) {
    const ref = pngEncode(M.exact[view]);
    for (const [w, h, dpr] of [[960, 640, 1], [960, 640, 1.6], [960, 640, 2], [1920, 1080, 1]]) {
      const tag = `${view}_${w}x${h}_dpr${dpr}`;
      const r = await cmp(px, await refShot({ view, w, h, dpr }, ref), await menuShot({ view, w, h, dpr }, !/-v1$/.test(view) && w === 960 && dpr === 1 ? `${view}_menu_${w}x${h}_dpr${dpr}` : null));
      M.mars[tag] = r;
      note(`${tag}: ${fmt(r)}`);
    }
  }
  ok(Object.values(M.mars).every(r => r.max <= 2 && r.beyond3 === 0), 'Mars (V3), Ringed V2-B, Nebula V1, and the rejected Mars V1 and ringed V1, match the exact offline composite on screen (max ≤ 2, only at window edges)');
  if (SHOTS) for (const view of ['mars', 'ringed', 'nebula']) for (const dpr of [1, 1.6]) await bareShot({ view, dpr }, `${view}_controls-hidden_960x640_dpr${dpr}`);

  console.log('— selection, station lights, the departure line');
  for (const [view, station] of [['earth', true], ['mars', false], ['mars-v1', false], ['ringed-v1', false], ['ringed', false], ['nebula', false]]) {
    const p = await open({ view });
    const s = await p.evaluate(() => ({ v: TITLE_VIEW.shown, a: TITLE_VIEW.arch, st: TITLE_VIEW.station, disp: getComputedStyle(document.getElementById('title-navlights')).display, run: document.getAnimations().filter(a => /^title-nav/.test(a.animationName)).length,
      paint: document.getElementById('title-paint').getAttribute('src'), order: [...document.getElementById('title-scene').children].map(e => e.id).join(',') }));
    ok(s.v === view && s.a === 'composite' && /^blob:/.test(s.paint) && s.order === 'title-paint,title-navlights,title-dim,title-fade' && (station ? s.disp !== 'none' && s.run === 3 : s.disp === 'none' && s.run === 0),
      `?view=${view}: one composite in the painting's <img>; ${station ? 'the three station lights run' : 'no station, no lights'}`);
    await toMenu(p);
    const [nx, ny] = await mapped(p, 'btn-new');
    await p.mouse.click(nx, ny); await p.waitForTimeout(250);
    const msg = await p.evaluate(() => document.getElementById('title-st-msg').textContent);
    ok(msg === (station ? 'Departure authorised. Mind the station.' : 'Departure authorised. Safe travels.'), `${view}: NEW GAME says "${msg}"`);
    await p.ctx.close();
  }
  console.log('— the rotation: Earth, Mars, Ringed, Nebula, equal chance, one draw per fresh load (controlled randomness)');
  {
    const draw = async opts => { const p = await open({ ...opts, noWait: true }); const v = await p.evaluate(() => TITLE_VIEW.id); await p.ctx.close(); return v; };
    const count = vs => vs.reduce((c, v) => (c[v] = (c[v] || 0) + 1, c), {});
    const grid = [...Array(12)].map((_, i) => (i + 0.5) / 12);
    const g = [];
    for (const r of grid) g.push(await draw({ random: r }));
    ok(g.join() === ACTIVE.flatMap(v => [v, v, v]).join(), `default: Math.random over an even 12-point grid → ${JSON.stringify(count(g))} (each view one equal quarter of [0, 1))`);
    const gr = [];
    for (const r of grid) gr.push(await draw({ view: 'random', random: r }));
    ok(gr.join() === g.join(), `?view=random: the same draw, from the rotation only (${JSON.stringify(count(gr))}; never mars-v1 or ringed-v1)`);
    // a seeded generator in place of Math.random: varied, but the same every run
    const seeded = seed => { let a = seed >>> 0; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
    const sd = [];
    for (let s = 1; s <= 40; s++) sd.push(await draw({ init: [seeded, s] }));
    const c = count(sd);
    // Each page draws exactly what its generator's first value says (computed
    // here with the same generator). Not a balance test: the first values of
    // consecutive seeds are correlated, so 40 of them are not an even sample;
    // the grid above proves the equal quarters and tools/tests/
    // menu_rotation_stats.js tests real randomness over hundreds of loads.
    const want = [];
    const first = s => { let a = s >>> 0; a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    for (let s = 1; s <= 40; s++) want.push(ACTIVE[Math.floor(first(s) * 4)]);
    ok(sd.join() === want.join() && ACTIVE.every(v => c[v] > 0), `40 loads, seeded generators 1–40: every page drew ACTIVE[floor(first value × 4)] for its seed (${JSON.stringify(c)}; all four drawn; fixed seeds, so the result never depends on chance)`);
    M.rotationDraws = { grid: count(g), random: count(gr), seeded: c };
  }
  {
    // The draw happens once per load: count the Math.random calls made from
    // background-views.js through a whole session (stack-checked, real randomness).
    const countDraws = () => { const real = Math.random; window.__viewDraws = 0; Math.random = function () { if (/background-views\.js/.test(new Error().stack || '')) window.__viewDraws++; return real.apply(this, arguments); }; };
    const p = await open({ init: countDraws });
    const first = await p.evaluate(() => ({ n: __viewDraws, v: TITLE_VIEW.shown }));
    await toMenu(p);
    await p.click('#btn-new'); await p.keyboard.press('x');
    await p.waitForFunction(() => document.getElementById('screen-setup').classList.contains('active'), null, { timeout: 6000 });
    await p.click('#btn-back'); await p.waitForFunction(() => TITLE_MENU.stage === 'menu');
    const [rx, ry] = await mapped(p, 'btn-records'); await p.mouse.click(rx, ry); await p.waitForTimeout(350);
    await p.keyboard.press('Escape'); await p.waitForTimeout(1500);
    const end = await p.evaluate(() => ({ n: __viewDraws, v: TITLE_VIEW.shown }));
    ok(first.n === 1 && end.n === 1 && end.v === first.v, `exactly one draw per load (${first.n} at boot, ${end.n} after setup, BACK, RECORDS and idle; ${first.v} throughout)`);
    M.drawsPerLoad = end.n;
    await p.ctx.close();
  }
  {
    const p = await open({ random: 0.4 });
    await toMenu(p);
    await p.evaluate(() => { window.__loads = 0; for (const i of document.querySelectorAll('#title-scene img')) i.addEventListener('load', () => __loads++); window.__src = document.getElementById('title-paint').src; Math.random = () => 0.01; });
    await p.click('#btn-new'); await p.keyboard.press('x');
    await p.waitForFunction(() => document.getElementById('screen-setup').classList.contains('active'), null, { timeout: 6000 });
    await p.click('#btn-back'); await p.waitForFunction(() => TITLE_MENU.stage === 'menu');
    const b = await p.evaluate(() => ({ v: TITLE_VIEW.shown, loads: __loads, same: document.getElementById('title-paint').src === __src, imgs: document.querySelectorAll('#title-scene img').length }));
    ok(b.v === 'mars' && b.loads === 0 && b.same && b.imgs === 1, 'default draw mars; setup BACK keeps it (no new draw, nothing re-composited or reloaded)');
    const [rx, ry] = await mapped(p, 'btn-records'); await p.mouse.click(rx, ry); await p.waitForTimeout(350);
    await p.keyboard.press('Escape'); await p.waitForTimeout(2500);
    const m = await p.evaluate(() => ({ v: TITLE_VIEW.shown, loads: __loads, same: document.getElementById('title-paint').src === __src, lights: !document.getElementById('title-navlights').hidden }));
    ok(m.v === 'mars' && !m.loads && m.same && !m.lights, 'no change mid-session: RECORDS and back, then idle, still the same Mars picture, still no lights');
    await p.evaluate(() => sessionStorage.setItem('__qa_random', '0.01'));
    await p.reload(); await p.waitForFunction(() => window.TITLE_VIEW && document.getElementById('screen-title').classList.contains('active'), null, { timeout: 30000 });
    await p.evaluate(() => TITLE_VIEW.ready);
    ok(await p.evaluate(() => TITLE_VIEW.shown) === 'earth', 'a fresh page load draws again and can change the view (mars → earth)');
    await p.ctx.close();
    const st = [];
    for (const q of [{ random: 0.1 }, { random: 0.4 }, { random: 0.6 }, { random: 0.9 }, { view: 'mars' }]) { const p = await open(q); await toMenu(p); st.push(await p.evaluate(() => JSON.stringify([Object.keys(localStorage).sort(), Object.keys(sessionStorage).sort()]))); await p.ctx.close(); }
    ok(st.every(x => x === st[0]), 'nothing is stored for the view (localStorage and sessionStorage the same after each of the four draws and a forced view)');
  }

  console.log('— the poster waits for the view');
  {
    // Every stage change: was the composite on show by then?
    const watch = () => { window.__st = []; document.addEventListener('DOMContentLoaded', () => { const s = document.getElementById('screen-title'); if (!s) return; new MutationObserver(() => { const i = document.getElementById('title-paint'); window.__st.push({ stage: s.dataset.stage, t: performance.now(), shown: !!(window.TITLE_VIEW && TITLE_VIEW.shown), complete: i.complete && i.naturalWidth === 1536 }); }).observe(s, { attributes: true, attributeFilter: ['data-stage'] }); }); };
    const slow = ctx => ctx.route('**/menu_overlay.png', r => setTimeout(() => r.continue().catch(() => {}), 1500));
    const p = await open({ view: 'earth', noWait: true, init: watch, route: slow });
    const t0 = await p.evaluate(() => performance.now());
    await p.keyboard.press('Space'); await p.waitForTimeout(250); await p.keyboard.press('Space'); // the second key: still on the poster
    const mid = await p.evaluate(() => ({ stage: TITLE_MENU.stage, poster: getComputedStyle(document.getElementById('poster')).opacity, settled: TITLE_VIEW.settled }));
    await p.waitForFunction(() => TITLE_MENU.stage === 'intro', null, { timeout: 6000 });
    const at = await p.evaluate(() => window.__st.find(s => s.stage === 'intro'));
    await p.waitForTimeout(300);
    const after = await p.evaluate(() => TITLE_MENU.stage);
    ok(mid.stage === 'poster' && mid.poster === '1' && !mid.settled, 'a key before the room is ready leaves the poster up (overlay held back 1.5 s)');
    ok(at && at.shown && at.complete && at.t > t0, `the poster lifts only once the composite is on show (${Math.round(at.t - t0)} ms after the key)`);
    ok(after === 'intro', 'the waiting keys do not also skip the intro (skip safety)');
    await p.ctx.close();
    const q = await open({ view: 'mars', noWait: true, route: ctx => ctx.route('**/menu_overlay.png', () => {}), expectErrors: true }); // never answers
    await q.keyboard.press('Space');
    const t = Date.now();
    await q.waitForFunction(() => TITLE_MENU.stage !== 'poster', null, { timeout: 8000 });
    const waited = Date.now() - t;
    await q.waitForTimeout(700); await q.keyboard.press('Escape'); await q.waitForFunction(() => TITLE_MENU.stage === 'menu'); await q.waitForTimeout(500);
    await q.click('#btn-new'); await q.keyboard.press('x');
    await q.waitForFunction(() => document.getElementById('screen-setup').classList.contains('active'), null, { timeout: 6000 });
    ok(waited >= 3500 && waited < 6000, `a room that never arrives holds the poster ${(waited / 1000).toFixed(1)} s at most (4 s), then the menu works and NEW GAME reaches setup`);
    await q.ctx.close();
  }

  console.log('— recovery paths');
  {
    let p = await open({ view: 'mars', route: ctx => ctx.route('**/backgrounds/mars.png', r => r.fulfill({ status: 404, body: '' })), expectErrors: true });
    let s = await p.evaluate(() => ({ v: TITLE_VIEW.shown, a: TITLE_VIEW.arch, st: TITLE_VIEW.station, lights: !document.getElementById('title-navlights').hidden }));
    ok(s.v === 'earth' && s.a === 'composite' && s.st && s.lights && p.warnings.some(w => /showing Earth/.test(w)), 'a background that will not load: Earth instead, with its lights (warned)');
    await p.ctx.close();
    p = await open({ view: 'earth', init: () => { HTMLCanvasElement.prototype.toBlob = function () { throw new DOMException('test', 'SecurityError'); }; } });
    s = await p.evaluate(() => ({ v: TITLE_VIEW.shown, a: TITLE_VIEW.arch, fb: TITLE_VIEW.fallback, imgs: [...document.querySelectorAll('#title-scene img')].map(i => i.id + ':' + i.src.split('/').pop()).join(',') }));
    ok(s.v === 'earth' && s.a === 'layers' && s.fb === 'SecurityError' && s.imgs === 'title-bg:earth.png,title-paint:menu_overlay.png' && p.warnings.some(w => /composite unavailable/.test(w)), `an export the browser refuses: the same pair as two aligned layers (${s.imgs}; warned)`);
    await p.ctx.close();
    p = await open({ view: 'earth', route: ctx => ctx.route('**/menu_overlay.png', r => r.fulfill({ status: 404, body: '' })), expectErrors: true });
    s = await p.evaluate(() => ({ failed: TITLE_VIEW.failed, st: TITLE_VIEW.station, lights: !document.getElementById('title-navlights').hidden }));
    await toMenu(p);
    const [nx, ny] = await mapped(p, 'btn-new'); await p.mouse.click(nx, ny); await p.waitForTimeout(250);
    const msg = await p.evaluate(() => document.getElementById('title-st-msg').textContent);
    await p.keyboard.press('x'); await p.waitForFunction(() => document.getElementById('screen-setup').classList.contains('active'), null, { timeout: 6000 });
    ok(s.failed && !s.st && !s.lights && msg === 'Departure authorised. Safe travels.', 'no overlay at all: the room is not shown (no lights, the station-neutral line), the menu still works and NEW GAME reaches setup');
    await p.ctx.close();
  }

  console.log('— the live UI and the real flows');
  {
    if (BASE_URL) {
      const ui = [];
      for (const q of [{ url: BASE_URL }, ...ACTIVE.map(view => ({ view }))]) {
        const p = await open(q); await seed(p); await toMenu(p); await still(p);
        ui.push(await p.evaluate(() => [document.getElementById('title-ui').outerHTML, [...document.querySelectorAll('.title-disp')].map(d => getComputedStyle(d).transform).join('/')].join('|')));
        await p.ctx.close();
      }
      ok(ui.every(u => u === ui[0]), 'the whole #title-ui (markup, state, perspective transforms) is identical to production, on all four views');
    }
    for (const view of ['earth', 'mars', 'ringed', 'nebula']) {
      const p = await open({ view });
      await p.evaluate(() => { window.__ev = []; document.addEventListener('animationend', e => __ev.push(e.animationName), true); });
      await p.keyboard.press('Space');
      await p.waitForFunction(() => TITLE_MENU.stage === 'menu', null, { timeout: 15000 });
      const crt = await p.evaluate(() => __ev.filter(e => e === 'title-crt-on').length);
      await p.waitForTimeout(500);
      const [nx, ny] = await mapped(p, 'btn-new'); await p.mouse.click(nx, ny);
      await p.waitForTimeout(300); await p.keyboard.press('x'); // skip the departure
      await p.waitForFunction(() => document.getElementById('screen-setup').classList.contains('active'), null, { timeout: 6000 });
      await p.click('#btn-back'); await p.waitForFunction(() => TITLE_MENU.stage === 'menu');
      await seed(p); await toMenu(p);
      const [rx, ry] = await mapped(p, 'btn-records'); await p.mouse.click(rx, ry); await p.waitForTimeout(350);
      const rec = await p.evaluate(() => document.getElementById('overlay-records').classList.contains('active'));
      await p.keyboard.press('Escape'); await p.waitForTimeout(350);
      const [cx, cy] = await mapped(p, 'btn-continue'); await p.mouse.click(cx, cy);
      await p.waitForFunction(() => document.getElementById('screen-cruise').classList.contains('active'), null, { timeout: 6000 });
      ok(crt >= 2 && rec && await p.evaluate(() => STATE.trail === 'mars' && STATE.daysElapsed === 12), `${view}: poster → CRT ×2 → intro → menu; NEW GAME → departure (skipped) → setup → BACK; RECORDS opens; CONTINUE → the saved voyage`);
      await p.ctx.close();
      const r = await open({ view, rm: true });
      const s = await r.evaluate(() => ({ rm: document.getElementById('screen-title').classList.contains('rm'), lights: getComputedStyle(document.getElementById('title-navlights')).display, anims: [...document.querySelectorAll('#title-scene img')].reduce((n, i) => n + i.getAnimations().length, 0) }));
      await r.keyboard.press('Space'); await r.waitForFunction(() => TITLE_MENU.stage === 'menu', null, { timeout: 6000 }); await r.waitForTimeout(500);
      await r.click('#btn-new'); await r.waitForFunction(() => document.getElementById('screen-setup').classList.contains('active'), null, { timeout: 3000 });
      ok(s.rm && s.lights === 'none' && s.anims === 0, `${view}, reduced motion: static, no lights, the menu and NEW GAME work`);
      await r.ctx.close();
    }
  }

  console.log('— opened from disk (file://), network blocked');
  M.file = {};
  for (const view of ACTIVE) {
    const frames = [];
    let s;
    for (const mode of ['file', 'http']) {
      const ctx = await browser.newContext({ viewport: { width: 960, height: 640 } });
      const net = [];
      if (mode === 'file') await ctx.route('**/*', r => { const u = r.request().url(); if (u.startsWith('file:') || u.startsWith('data:') || u.startsWith('blob:')) return r.continue(); net.push(u); return r.abort(); });
      const p = await ctx.newPage(); const warn = [], reqs = [];
      p.on('pageerror', e => errors.push(mode + ': ' + e.message));
      p.on('request', r => reqs.push(r.url()));
      p.on('console', m => { if (m.type() === 'warning') warn.push(m.text()); if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) consoleErrors.push(mode + ': ' + m.text()); });
      const qs = `?view=${view}`;
      await p.goto((mode === 'file' ? FILE_URL : URL) + qs);
      await p.waitForFunction(() => typeof MOD !== 'undefined' && MOD.endings && window.TITLE_VIEW && document.getElementById('screen-title').classList.contains('active'), null, { timeout: 30000 });
      await p.evaluate(() => TITLE_VIEW.ready);
      const st = await p.evaluate(() => ({ shown: TITLE_VIEW.shown, arch: TITLE_VIEW.arch, fallback: TITLE_VIEW.fallback || null, portable: !!window.TP_PORTABLE }));
      await toMenu(p); await still(p);
      frames.push(await shot(p, mode === 'file' ? `file_${view}_menu_960x640` : null));
      if (mode === 'file') {
        await p.click('#btn-new'); await p.waitForFunction(() => document.getElementById('screen-setup').classList.contains('active'), null, { timeout: 5000 });
        s = { ...st, blocked: net.filter(u => !/fonts\.(googleapis|gstatic)\.com/.test(u)), warn: warn.filter(w => /title view/.test(w)), diskImages: reqs.filter(u => /interface\/menu\/.*\.png/.test(u)).map(u => u.split('/').pop()) };
      }
      await ctx.close();
    }
    const d = await cmp(px, frames[1], frames[0]);
    M.file[view] = { ...s, frameVsHttp: d };
    ok(s.portable && s.shown === view && s.arch === 'composite' && !s.fallback && !s.diskImages.length && !s.blocked.length && d.n === 0,
      `${view}: from disk, composited from the bundled images (no fallback, no image read from disk, no network); frame = the http frame (${d.n} px); NEW GAME reaches setup`);
    if (s.warn.length) note(s.warn.join(' | '));
  }

  {
    const draws = [];
    for (const r of [0.125, 0.375, 0.625, 0.875]) {
      const ctx = await browser.newContext({ viewport: { width: 960, height: 640 } });
      const net = [];
      await ctx.route('**/*', q => { const u = q.request().url(); if (u.startsWith('file:') || u.startsWith('data:') || u.startsWith('blob:')) return q.continue(); net.push(u); return q.abort(); });
      await ctx.addInitScript(v => { Math.random = () => v; }, r);
      const p = await ctx.newPage(); p.on('pageerror', e => errors.push('file: ' + e.message));
      await p.goto(FILE_URL);
      await p.waitForFunction(() => window.TITLE_VIEW && document.getElementById('screen-title').classList.contains('active'), null, { timeout: 30000 });
      await p.evaluate(() => TITLE_VIEW.ready);
      draws.push(await p.evaluate(() => `${TITLE_VIEW.shown}:${TITLE_VIEW.arch}:${TITLE_VIEW.fallback || 'none'}`) + (net.filter(u => !/fonts\.(googleapis|gstatic)\.com/.test(u)).length ? ':network' : ''));
      await ctx.close();
    }
    ok(draws.join() === ACTIVE.map(v => v + ':composite:none').join(), `from disk with no parameter, the rotation draws all four, each composited from the bundle (${draws.join(', ')})`);
  }

  console.log('— performance (median of 5 fresh loads, 960×640)');
  M.perf = {};
  // When the title screen comes up, and when its painting is on show.
  const timing = () => {
    // from the first parsed byte: from disk the title can come up before DOMContentLoaded
    const mo = new MutationObserver(() => { const s = document.getElementById('screen-title'); if (s && s.classList.contains('active')) { window.__titleAt = performance.now(); mo.disconnect(); } });
    mo.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    document.addEventListener('DOMContentLoaded', () => { const i = document.getElementById('title-paint'); if (i && /scene_master/.test(i.getAttribute('src') || '')) i.decode().then(() => { window.__paintReady = performance.now(); }, () => {}); });
  };
  const configs = [['released (production)', BASE_URL && { url: BASE_URL }, 'earth'], ['002C B composite', PREV_URL && { url: PREV_URL + '?view=earth&arch=composite', master: 'abort' }, 'earth'],
    ...ACTIVE.map(v => ['002H ' + v, { view: v }, v]),
    ['released from disk', BASE_FILE && { url: require('url').pathToFileURL(BASE_FILE).href }, 'earth'],
    ...ACTIVE.map(v => ['002H ' + v + ' from disk', { url: FILE_URL + '?view=' + v }, v])].filter(([, q]) => q);
  for (const [label, q, expect] of configs) {
    const runs = [];
    for (let i = 0; i < 5; i++) {
      const p = await open({ ...q, init: timing, route: q.master ? ctx => ctx.route('**/scene_master_leafclear_v1_1536x1024.png', r => r.abort()) : undefined });
      await p.waitForFunction(() => (window.TITLE_VIEW && TITLE_VIEW.timing && TITLE_VIEW.timing.ready) || window.__paintReady, null, { timeout: 10000 });
      const r = await p.evaluate(() => {
        const res = performance.getEntriesByType('resource').filter(e => /interface\/menu\/(menu_overlay|backgrounds\/|scene_master)|portable_data\.js/.test(e.name) && (e.encodedBodySize || e.decodedBodySize));
        const t = (window.TITLE_VIEW && TITLE_VIEW.timing) || {};
        const nav = performance.getEntriesByType('navigation')[0];
        return { bytes: res.reduce((n, e) => n + (e.encodedBodySize || e.decodedBodySize || 0), 0), files: res.map(e => e.name.split('/').pop()),
          ready: t.ready != null ? t.ready : window.__paintReady, title: window.__titleAt, dcl: nav ? nav.domContentLoadedEventEnd : null,
          draw: t.draw, encode: t.encode, blob: t.blobBytes, heap: performance.memory ? performance.memory.usedJSHeapSize : null, shown: window.TITLE_VIEW ? TITLE_VIEW.shown : 'earth' };
      });
      runs.push(r);
      await p.ctx.close();
    }
    const m = k => runs.every(r => r[k] != null) ? +median(runs.map(r => r[k])).toFixed(1) : null;
    const P = M.perf[label] = { bytes: runs[0].bytes, files: runs[0].files, dclMs: m('dcl'), titleMs: m('title'), readyMs: m('ready'), drawMs: m('draw'), encodeMs: m('encode'), blobBytes: runs[0].blob || null,
      posterWaitMs: +median(runs.map(r => Math.max(0, r.ready - r.title))).toFixed(1), jsHeapMB: runs[0].heap ? +(median(runs.map(r => r.heap)) / 1048576).toFixed(1) : null };
    note(`${label.padEnd(22)} ${P.files.length ? `${(P.bytes / 1048576).toFixed(2)} MiB (${P.files.join(' + ')})` : 'from disk'}; DOM ready ${P.dclMs} ms, title up ${P.titleMs} ms, painting ready ${P.readyMs} ms (a key at once waits ${P.posterWaitMs} ms)${P.encodeMs != null ? `; draw ${P.drawMs} + PNG ${P.encodeMs} ms` : ''}${P.jsHeapMB != null ? `; JS heap ${P.jsHeapMB} MB` : ''}`);
    ok(runs.every(r => r.shown === expect), `${label}: ${expect} shown in all 5 loads`);
  }

  await px.ctx.close();
  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  ok(!consoleErrors.length, 'no console errors' + (consoleErrors.length ? ': ' + consoleErrors.slice(0, 3).join(' | ') : ''));
  ok(!badResponses.length, 'no failed requests beyond the game\'s known optional probes' + (badResponses.length ? ': ' + badResponses.slice(0, 3).join(' | ') : ''));
  if (OUT) { delete M.exact; delete M.union; delete M.master; fs.writeFileSync(OUT, JSON.stringify({ browser: FIREFOX ? 'firefox' : 'chromium', ...M }, null, 1)); }
  console.log(`\ntitle_overlay: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

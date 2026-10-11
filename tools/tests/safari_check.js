// Real-Safari verification over WebDriver (safaridriver on :4444).
const fs = require('fs');
const WD = 'http://localhost:4444';
const URL = process.env.URL || 'http://localhost:8177/index.html';
const OUT = __dirname + '/safari';
fs.mkdirSync(OUT, { recursive: true });
let sid, pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
async function wd(method, path, body) {
  const r = await fetch(WD + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (j.value && j.value.error) throw new Error(path + ': ' + j.value.error + ' ' + j.value.message);
  return j.value;
}
const js = (fn, ...args) => wd('POST', `/session/${sid}/execute/sync`, { script: `return (${fn}).apply(null, arguments);`, args });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function shot(name) { const b64 = await wd('GET', `/session/${sid}/screenshot`); fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(b64, 'base64')); }
async function waitFor(fn, ms = 15000) { const t = Date.now(); while (Date.now() - t < ms) { if (await js(fn)) return true; await sleep(250); } return false; }
async function click(css) { const el = await wd('POST', `/session/${sid}/element`, { using: 'css selector', value: css }); return wd('POST', `/session/${sid}/element/${Object.values(el)[0]}/click`, {}); }

(async () => {
  const s = await wd('POST', '/session', { capabilities: { alwaysMatch: { browserName: 'safari' } } });
  sid = s.sessionId;
  try {
    await wd('POST', `/session/${sid}/window/rect`, { width: 1440, height: 900, x: 0, y: 0 });
    await wd('POST', `/session/${sid}/url`, { url: URL });
    ok(await waitFor(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster && typeof EVENTS !== 'undefined' && Object.keys(EVENTS).length > 100), 'modules + events load');
    await js(() => { window.__errs = []; window.addEventListener('error', e => window.__errs.push(String(e.message))); window.addEventListener('unhandledrejection', e => window.__errs.push('rej ' + e.reason)); });
    const ua = await js(() => navigator.userAgent);
    console.log('  UA:', ua);
    ok(/Version\/17.*Safari/.test(ua) && !/Chrome/.test(ua), 'running in real Safari');
    await shot('01_title');

    // Real clicks through the wizard: title → setup (Space/click), then boot via engine for speed.
    const scale = await js(() => { const r = document.getElementById('game').getBoundingClientRect(); return { w: r.width, h: r.height, iw: innerWidth, ih: innerHeight }; });
    ok(Math.abs(scale.h - scale.ih) < 2 || Math.abs(scale.w - scale.iw) < 2, `cabinet fills the window (${Math.round(scale.w)}×${Math.round(scale.h)} in ${scale.iw}×${scale.ih})`);
    ok(await js(() => document.querySelectorAll('.overlay .overlay, .screen .screen, .overlay .screen, .screen .overlay').length === 0), 'no nested overlays (Safari parser)');

    await js(() => { localStorage.removeItem('transplant_save_v1'); applySetupToState({ trail: 'mars', ai: 'chip', captain: 'medic', crew: ['engineer', 'botanist'], crop: 'zinnia', ship: 'Safari' }); STATE.stowaway = null; });
    await sleep(800);
    ok(await js(() => document.getElementById('screen-cruise').classList.contains('active')), 'cruise hub shows');
    ok(await js(() => document.getElementById('crop-icon').classList.contains('has-plant-sprite')), 'crop card plant sprite');
    await shot('02_cruise');

    // Real WebDriver clicks: crew dossier, growbay, stop menu → SCAN minigame.
    await click('.crew-slot:nth-child(2)'); await sleep(500);
    ok(await js(() => document.getElementById('overlay-crew').classList.contains('active')), 'real click opens a crew dossier');
    await shot('03_dossier');
    await js(() => { const b = document.querySelector('#overlay-crew .cd-close, #overlay-crew [class*=close]'); if (b) b.click(); else document.getElementById('overlay-crew').classList.remove('active'); });
    await sleep(300);
    await click('#crop-card-mini'); await sleep(600);
    ok(await js(() => document.getElementById('overlay-growbay').classList.contains('active') && /CHIP/.test(document.querySelector('.gb-aria-name').textContent)), 'growbay opens, speaks as CHIP');
    await shot('04_growbay');
    await js(() => closeGrowbay()); await sleep(300);
    await js(() => { const n = STATE.nodes.find(x => x.node_type === 'nebula' || x.node_type === 'anomaly' || x.node_type === 'void'); STATE.currentId = n.id; returnToHub(); });
    await sleep(300);
    await click('#stop-btn'); await sleep(300);
    await js(() => [...document.querySelectorAll('#stop-choices .stop-choice')].find(b => /SCAN/.test(b.textContent)).click());
    await sleep(600);
    const mg = await js(() => { const r = document.getElementById('overlay-minigames').getBoundingClientRect(); return { w: r.width, h: r.height }; });
    ok(mg.w > 500 && mg.h > 300, `SCAN minigame renders (${Math.round(mg.w)}×${Math.round(mg.h)})`);
    await click('#rstart'); await sleep(1500);
    await shot('05_scan');
    const d0 = await js(() => STATE.daysElapsed);
    await click('#mclose'); await sleep(400);
    ok(await js(d0 => STATE.daysElapsed > d0 && !document.getElementById('overlay-minigames').classList.contains('active'), d0), 'QUIT closes the game and spends the day');

    // Encounter + combat with real clicks on choices.
    await js(() => { document.body.classList.remove('stop-active'); document.getElementById('stop-btn').textContent = 'Stop'; enterEvent(STATE.byId[STATE.currentId], EVENTS.event_encounter_pirate_001); });
    await sleep(1200);
    await shot('06_encounter');
    let combat = false;
    for (let i = 0; i < 4 && !combat; i++) {
      await js(() => { const bs = [...document.querySelectorAll('#enc-choices .enc-choice:not(.locked)')]; const f = bs.find(x => /FIGHT|fire/i.test(x.textContent)) || bs[0]; if (f) f.click(); });
      await sleep(900);
      combat = await js(() => document.getElementById('screen-encounter').classList.contains('combat-mode'));
    }
    ok(combat, 'combat mounts in Safari');
    if (combat) {
      for (let i = 0; i < 5; i++) { await js(() => { const b = [...document.querySelectorAll('button, .enc-choice')].find(x => /FIRE LASER|FIRE AT CENTER/.test(x.textContent) && x.offsetParent); if (b) b.click(); }); await sleep(1300); }
      await shot('07_combat');
    }

    // Save → reload → Continue.
    await js(() => { STATE.currentEvent = null; STATE.ended = false; returnToHub(); STATE.crewPending = { engineer: true }; STATE.crewHP.engineer = 30; saveRun(); });
    const saved = await js(() => !!localStorage.getItem('transplant_save_v1'));
    ok(saved, 'saveRun writes localStorage');
    await wd('POST', `/session/${sid}/refresh`, {});
    await waitFor(() => typeof MOD !== 'undefined' && MOD.items && typeof hasSave === 'function');
    ok(await js(() => hasSave()), 'save survives a reload');
    await js(() => loadRun()); await sleep(300);
    ok(await js(() => STATE.crewPending.engineer === true && STATE.crewHP.engineer === 30 && STATE.crop === 'zinnia'), 'loadRun restores crew HP, pending wound, crop');

    // Short auto-play: random unlocked choices / travel for a while.
    await js(() => { window.__errs = []; window.addEventListener('error', e => window.__errs.push(String(e.message))); });
    await js(() => { window.openMinigame = (id, o, cb) => setTimeout(() => cb(['perfect', 'good', 'poor'][Math.floor(Math.random() * 3)]), 10); window.openMining = cb => setTimeout(() => cb({ inventory: {} }), 10); window.openEngineRepair = cb => setTimeout(() => cb({ fixedCount: 4, allFixed: true }), 10); });
    for (let step = 0; step < 160; step++) {
      const scr = await js(() => document.querySelector('.screen.active').id);
      if (scr === 'screen-end') break;
      await js(() => {
        if (document.getElementById('screen-encounter').classList.contains('active')) {
          const b = [...document.querySelectorAll('#enc-choices .enc-choice:not(.locked)')]; if (b.length) b[Math.floor(Math.random() * b.length)].click();
        } else if (document.getElementById('screen-cruise').classList.contains('active')) {
          document.body.classList.remove('stop-active'); const ids = [...nextAvailableNodes()]; if (ids.length) travelTo(ids[Math.floor(Math.random() * ids.length)]);
        }
      });
      await sleep(150);
    }
    const end = await js(() => ({ screen: document.querySelector('.screen.active').id, text: document.querySelector('.screen.active').innerText.slice(0, 80).replace(/\s+/g, ' '), errs: window.__errs }));
    console.log('  auto-play end:', end.screen, '—', end.text);
    ok(end.screen === 'screen-end', 'auto-play reaches an end screen');
    ok(!end.errs.length, 'no JS errors during auto-play' + (end.errs.length ? ': ' + end.errs.join(' | ') : ''));
    await shot('08_end');

    // A long arrival report (12 story flags → full Ship's Record) stays in
    // the frame: the card scrolls and Back / New Run stay reachable.
    await js(() => { localStorage.removeItem('transplant_save_v1'); applySetupToState({ trail: 'interstellar', ai: 'marv', captain: 'veteran', crew: ['engineer', 'pilot'], crop: 'wheat', ship: 'Safari' }); STATE.stowaway = null; });
    await sleep(500);
    await js(() => { Object.keys(MOD.flavor.flag_payoffs).slice(0, 12).forEach(f => STATE.flags.add(f)); STATE.daysElapsed = 100; triggerArrival(STATE.nodes.find(n => connectionsOf(n).length === 0)); });
    await sleep(900);
    await js(() => window.showEndReport()); await sleep(400);
    const rep = await js(() => {
      const g = document.getElementById('game').getBoundingClientRect(), c = document.getElementById('end-report-scroll');
      const btns = [...document.querySelectorAll('#end-report-actions .btn')].map(b => b.getBoundingClientRect());
      return { inFrame: btns.length === 2 && btns.every(r => r.top >= g.top - 1 && r.bottom <= g.bottom + 1), sh: c.scrollHeight, ch: c.clientHeight };
    });
    ok(rep.inFrame && rep.sh >= rep.ch, `end report: Back / New Run inside the frame (card ${rep.ch}px, content ${rep.sh}px)`);
    await shot('09_end_report');
  } catch (e) {
    fail++; console.log('  ✗ EXCEPTION ' + e.message);
    try { await shot('99_exception'); } catch (_) {}
  } finally {
    await wd('DELETE', `/session/${sid}`).catch(() => {});
  }
  console.log(`\nSafari: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

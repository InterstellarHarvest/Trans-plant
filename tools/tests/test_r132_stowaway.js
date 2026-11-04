// Stowaway offers say what they are (ruling 132): every welcome row shows its
// own deal and where the stowaway lands, two offers in one event never read
// the same, and with a full crew none promises a crew place.
const { chromium, firefox } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
const EVS = ['event_shipboard_005', 'event_shipboard_015', 'event_voyage_ship_001', 'event_voyage_trigger_006'];
let pass = 0, fail = 0, clipped = [];
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };
(async () => {
  const browser = await (process.env.PW_BROWSER === 'firefox' ? firefox : chromium).launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && typeof enterEvent === 'function');
  const rows = await page.evaluate(EVS => {
    const out = [];
    for (const [crew, who] of [[['engineer', 'pilot'], 'stowaway_chef'], [['engineer'], 'stowaway_chef'], [['engineer', 'pilot'], 'stowaway_inspector']]) {
      for (const id of EVS) {
        localStorage.removeItem('transplant_save_v1');
        applySetupToState({ trail: 'mars', ai: 'aria', captain: 'veteran', crew, crop: 'wheat', ship: 'T' });
        STATE.flags.add('departed');
        STATE.stowaway = { identity: MOD.flavor.stowaway_identities.find(i => i.id === who), revealed: true };
        enterEvent(STATE.byId[STATE.currentId], EVENTS[id]);
        finishAllTyping();
        const welcome = EVENTS[id].choices.filter(c => /^welcome/.test((choiceOutcome(c) || {}).stowaway_resolve || ''));
        const btns = [...document.querySelectorAll('#enc-choices .enc-choice:not(.leave)')];
        const subs = welcome.map(c => { const b = btns.find(x => x.querySelector('.ch-text').textContent === c.text); const t = b && b.querySelector('.ch-sub-text'); if (t && t.scrollWidth > t.clientWidth + 1) out.clipped = (out.clipped || []).concat(t.textContent); return t ? t.textContent : null; });
        out.push({ id, crew: crew.length, who, role: STATE.stowaway.identity.join_role, texts: welcome.map(c => c.text), subs });
      }
    }
    return { rows: out, clipped: out.clipped || [] };
  }, EVS).then(r => { clipped = r.clipped; return r.rows; });
  for (const r of rows) {
    const at = `${r.id} (${r.crew} crew, ${r.who})`;
    ok(r.subs.length === 2 && r.subs.every(Boolean), at + ': both welcome rows render');
    ok(new Set(r.subs).size === r.subs.length, at + ': the offers read differently: ' + r.subs.join(' / '));
    const full = r.crew >= 2 || !r.role;
    ok(r.subs.every(s => full ? / · passenger( · |$)/.test(s) : / · joins as /.test(s)), at + ': each says where they land: ' + r.subs.join(' / '));
    ok(r.texts.every(t => !/roster/i.test(t)), at + ': no offer promises the roster');
  }
  ok(!clipped.length, 'every sub-label fits its line: clipped ' + clipped.join(' / '));
  ok(!errors.length, 'no page errors: ' + errors.slice(0, 3).join(' | '));
  console.log('ruling 132: ' + pass + ' passed, ' + fail + ' failed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();

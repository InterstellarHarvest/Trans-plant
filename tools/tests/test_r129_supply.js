// Big supply costs on the row (ruling 129): a scaled water or food cost of
// BIG_SUPPLY_COST or more shows on the choice's sub-label for every AI, on
// every trail, and never on a row whose cost is smaller.
//   1. Every visible choice of every active event, on every trail, with an
//      AI that previews nothing: the rendered sub-label names each big cost.
//   2. The three Mars scenes the read-through traced deaths to carry it.
const { chromium, firefox } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };

(async () => {
  const browser = await (process.env.PW_BROWSER === 'firefox' ? firefox : chromium).launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && typeof enterEvent === 'function');
  const res = await page.evaluate(() => {
    const out = { checked: 0, big: 0, bad: [], named: {} };
    const start = trail => {
      localStorage.removeItem('transplant_save_v1');
      applySetupToState({ trail, ai: 'aria', captain: 'veteran', crew: ['medic', 'chef'], crop: 'wheat', ship: 'B' });
      STATE.stowaway = null; STATE.flags.add('departed'); STATE.goldAmount = 200;
      for (const k of ['fuel', 'food', 'water', 'o2', 'hull']) STATE.resources[k] = 80;
    };
    for (const trail of ['lunar', 'mars', 'interstellar']) {
      for (const ev of Object.values(EVENTS)) {
        if (ev.active === false || !ev.layers && !ev.choices) continue;
        start(trail);
        const want = (ev.node_type || [])[0];
        const node = STATE.nodes.find(n => n.node_type === want) || STATE.byId[STATE.currentId];
        STATE.currentId = node.id;
        try { enterEvent(node, ev); } catch (e) { out.bad.push(ev.id + ' enter: ' + e.message); continue; }
        if (typeof finishAllTyping === 'function') finishAllTyping();
        const shown = (ev.layers ? (currentLayer() || {}).choices : ev.choices) || [];
        const visible = shown.filter(choiceShown);
        const btns = [...document.querySelectorAll('#enc-choices .enc-choice:not(.leave)')];
        visible.forEach((ch, i) => {
          const b = btns[i]; if (!b) return;
          out.checked++;
          const sub = (b.querySelector('.ch-sub-text') || {}).textContent || '';
          if (b.classList.contains("locked")) return;
          const o = choiceCostOutcome(ch), p = o && withPctPreview(o);
          for (const k of ['water', 'food']) {
            const v0 = p && p.resources && p.resources[k];
            if (!Number.isFinite(v0) || v0 >= 0) continue;
            const v = -effectiveResDelta(k, v0, p), tag = '−' + v + ' ' + RES_LABEL[k];
            if (v >= BIG_SUPPLY_COST) {
              out.big++; out.named[ev.id + '@' + trail] = sub;
              if (!sub.includes(tag)) out.bad.push(trail + ' ' + ev.id + ' "' + (ch.text || ch.label) + '": sub "' + sub + '" lacks ' + tag);
            } else if (sub.includes(tag) && !/^(MARV|RESEARCH)/.test(sub)) out.bad.push(trail + ' ' + ev.id + ': small cost ' + tag + ' on the row');
          }
        });
      }
    }
    return out;
  });
  ok(res.checked > 1000, 'rendered rows checked: ' + res.checked);
  ok(res.big > 20, 'big costs found: ' + res.big);
  for (const b of res.bad.slice(0, 20)) ok(false, b);
  if (!res.bad.length) ok(true, '');
  for (const id of ['event_voyage_office_004', 'event_species_robot_006', 'event_general_040'])
    ok(res.named[id + '@mars'] && / H2O/.test(res.named[id + '@mars']), id + ' on Mars names its water cost (' + res.named[id + '@mars'] + ')');
  ok(!errors.length, 'no page errors: ' + errors.slice(0, 3).join(' | '));
  console.log('ruling 129: ' + pass + ' passed, ' + fail + ' failed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();

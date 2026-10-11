// Hunt 6 follow-ups (2026-10-11): event-minigame reload = quit, map
// placement rules, pirate voice in combat, choice column fits, Press
// Start 2P line boxes the same in every browser.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
let browser;
const errors = [];
async function boot(setup) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster);
  await page.evaluate(o => {
    localStorage.removeItem('transplant_save_v1');
    applySetupToState(Object.assign({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer', 'pilot'], crop: 'wheat', ship: 'D' }, o));
    STATE.stowaway = null;
  }, setup || {});
  await page.waitForTimeout(200);
  return page;
}

(async () => {
  browser = await chromium.launch();

  console.log('— a reload mid event-minigame is a quit');
  {
    const page = await boot({ crew: ['medic', 'pilot'] });
    const r = await page.evaluate(async () => {
      const ev = Object.values(EVENTS).find(e => (e.choices || []).some(c => c.launch_minigame));
      const ch = ev.choices.find(c => c.launch_minigame);
      STATE.resources.morale = 60; STATE.resources.food = 60;
      enterEvent(STATE.byId[STATE.currentId], ev);
      await new Promise(r => setTimeout(r, 300));
      if (typeof finishAllTyping === 'function') finishAllTyping();
      const b = [...document.querySelectorAll('#enc-choices .enc-choice')].find(x => x.textContent.includes(ch.text.slice(0, 20)));
      b.click(); await new Promise(r => setTimeout(r, 400));
      const begin = [...document.querySelectorAll('#ov button, #ov .btn')].find(x => /BEGIN/i.test(x.textContent));
      begin && begin.click(); await new Promise(r => setTimeout(r, 300));
      const base = ch.outcome || {}, poor = ((ch.tier_outcomes || {}).poor || {}).resources || {};
      const worst = Object.assign({}, base.resources || {}, poor);
      return { id: ev.id, day: STATE.daysElapsed, res: Object.assign({}, STATE.resources), losses: Object.fromEntries(Object.entries(worst).filter(([, v]) => v < 0)) };
    });
    await page.reload();
    await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.flavor);
    await page.evaluate(() => loadRun()); await page.waitForTimeout(400);
    const after = await page.evaluate(() => ({ ev: STATE.currentEvent && STATE.currentEvent.id, day: STATE.daysElapsed, res: Object.assign({}, STATE.resources), log: JSON.stringify((STATE.shipLog || []).slice(-2)) }));
    const lossOk = Object.entries(r.losses).every(([k, v]) => after.res[k] < r.res[k]);
    ok(!after.ev && after.day > r.day && lossOk && /abandoned partway/.test(after.log), `${r.id}: reload settles as a quit at the hub (days +${after.day - r.day}, losses ${JSON.stringify(r.losses)})`);
    await page.close();
  }

  console.log('— map placement rules');
  {
    const page = await boot();
    const r = await page.evaluate(() => {
      const out = { first: 0, last: 0, repeat: 0, n: 0 };
      for (const trail of ['lunar', 'mars', 'interstellar']) for (let k = 0; k < 60; k++) {
        generateMap(trail); out.n++;
        const sp = STATE.nodes.filter(n => /^node_spine_/.test(n.id)).sort((a, b) => a.position - b.position);
        const L = sp.length, third = Math.max(2, Math.floor((L - 1) / 3));
        if (sp.slice(1, third + 1).some(n => n.node_type === 'station')) out.first++;
        if (sp[L - 2].node_type === 'station') out.last++;
        for (let i = 1; i < L - 1; i++) if (sp[i].node_type === sp[i - 1].node_type) out.repeat++;
      }
      return out;
    });
    ok(r.first === r.n, `a station in the first third of every route (${r.first}/${r.n})`);
    ok(r.last === r.n, `the last stop before the destination is a station (${r.last}/${r.n})`);
    ok(r.repeat === 0, 'no two identical stops in a row on the spine');
    await page.close();
  }

  console.log('— the pirate speaks in combat');
  {
    const page = await boot();
    const r = await page.evaluate(async () => {
      const ev = Object.values(EVENTS).find(e => e.npc && e.npc.disposition === 'pirate' && JSON.stringify(e).includes('"triggerCombat":true'));
      enterEvent(STATE.byId[STATE.currentId], ev); window.triggerCombat({});
      await new Promise(r => setTimeout(r, 300));
      const pool = MOD.flavor.npc_disposition_lines.pirate.refuse;
      return { body: document.getElementById('enc-narr-body').textContent, pool };
    });
    ok(/“[^”]+”/.test(r.body), 'opening fire on a pirate gets their answer in quotes: ' + (r.body.match(/“[^”]+”/) || [''])[0].slice(0, 60));
    await page.close();
  }

  console.log('— choice columns fit');
  {
    const page = await boot({ crew: ['botanist', 'xenobiologist'] });
    const over = await page.evaluate(async () => {
      const bad = [];
      for (const id of ['event_derelict_001', 'event_encounter_pirate_001', 'event_encounter_boarding_001']) {
        enterEvent(STATE.byId[STATE.currentId], EVENTS[id]);
        await new Promise(r => setTimeout(r, 150));
        const c = document.getElementById('enc-choices');
        if (c.scrollHeight - c.clientHeight > 2) bad.push(id + ' +' + (c.scrollHeight - c.clientHeight));
      }
      return bad;
    });
    ok(!over.length, 'six-choice events fit their column ' + over.join(', '));
    await page.close();
  }

  console.log('— Press Start 2P line boxes match across browsers');
  {
    const page = await boot();
    const r = await page.evaluate(() => { showScreen('screen-cruise'); renderCruise(); const el = document.getElementById('day-counter'); const cs = getComputedStyle(el); return { lh: cs.lineHeight, fs: cs.fontSize }; });
    ok(r.lh === r.fs, `day counter line box = font size (${r.lh} / ${r.fs}), not the browser's "normal"`);
    await page.close();
  }

  ok(!errors.length, 'page errors: ' + errors.slice(0, 3).join(' | '));
  console.log(`\nhunt6c: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();

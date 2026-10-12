// Owner rulings 2026-10-10 (round 2): late arrival shows N DAYS LATE,
// resumable failures keep the run, growbay modifiers all act, SCAN acts.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
let browser;
async function boot(setup, page) {
  page = page || await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = page._errs || [];
  if (!page._errs) page.on('pageerror', e => errs.push(e.stack || e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster);
  await page.evaluate(o => {
    localStorage.removeItem('transplant_save_v1');
    applySetupToState(Object.assign({ trail: 'lunar', ai: 'marv', captain: 'veteran', crew: ['engineer', 'pilot'], crop: 'wheat', ship: 'D' }, o));
    STATE.stowaway = null;
  }, setup || {});
  await page.waitForTimeout(200);
  page._errs = errs;
  return page;
}
const toPenultimate = page => page.evaluate(() => {
  const last = STATE.nodes.find(n => connectionsOf(n).length === 0);
  const prev = STATE.nodes.find(n => connectionsOf(n).includes(last.id));
  STATE.currentId = prev.id;
  return last.id;
});
const step = page => page.evaluate(() => travelTo([...nextAvailableNodes()][0], { skipEvent: true }));
const end = page => page.evaluate(() => ({ screen: document.querySelector('.screen.active').id, title: document.getElementById('end-cine-title').textContent, btn2: getComputedStyle(document.getElementById('end-cine-btn2')).display !== 'none', day: document.getElementById('end-day-line') ? document.getElementById('end-day-line').textContent : '' }));

(async () => {
  browser = await chromium.launch();

  console.log('— late arrival');
  {
    const page = await boot();
    await toPenultimate(page);
    const lastId = await toPenultimate(page);
    await page.evaluate(() => { STATE.daysElapsed = STATE.baseDays; STATE.cropGrowth.lastTickDay = STATE.baseDays; STATE.resources.fuel = 0.1; });
    await step(page);
    await page.waitForTimeout(400);
    const e = await end(page);
    const failTitles = await page.evaluate(() => MOD.failures.map(f => f.title));
    ok(await page.evaluate(id => STATE.currentId === id, lastId) && !failTitles.includes(e.title), `arrived at the destination, not a failure (${e.title.replace(/\n/g, ' ')})`);
    await page.evaluate(() => window.showEndReport && window.showEndReport());
    await page.waitForTimeout(300);
    const day = await page.evaluate(() => document.getElementById('end-day-line').textContent);
    ok(e.screen === 'screen-end' && !/Form Letter|Dead Stop|We Regret|Adrift/i.test(e.title), `late + empty tank on the final leg still arrives (${e.title.replace(/\n/g, ' ')})`);
    ok(/\d+ DAYS LATE/.test(day), `end screen: "${day}"`);
    ok(await page.evaluate(() => !hasSave()), 'arrival clears the save');
    await page.close();
  }

  console.log('— resumable failures keep the run');
  {
    const page = await boot();
    await page.evaluate(() => { showScreen('screen-cruise'); STATE.cropGrowth.health = 0; checkFailure(); });
    await page.waitForTimeout(300);
    const a = await end(page);
    ok(a.btn2 && await page.evaluate(() => hasSave() && JSON.parse(localStorage.getItem('transplant_save_v1')).pendingFailure), `crop_dead (${a.title}): save kept with the failure pending`);
    await page.reload();
    await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster);
    await page.evaluate(() => loadRun());
    await page.waitForTimeout(400);
    const b = await end(page);
    ok(b.screen === 'screen-end' && b.btn2 && b.title === a.title, 'reload + Continue brings back the same choice');
    await page.click('#end-cine-btn2');
    await page.waitForTimeout(500);
    ok(await page.evaluate(() => document.querySelector('.screen.active').id === 'screen-cruise' && !STATE.ended && !JSON.parse(localStorage.getItem('transplant_save_v1')).pendingFailure), 'Keep flying → hub, normal save again');
    await page.evaluate(() => { STATE.cropGrowth.health = 50; STATE.flags.delete('crop_death_accepted'); STATE.resources.hull = 0; checkFailure(); });
    await page.waitForTimeout(300);
    ok(await page.evaluate(() => !hasSave()), 'a terminal failure (hull) still clears the save');
    await page.close();
    const p2 = await boot();
    await p2.evaluate(() => { showScreen('screen-cruise'); STATE.cropGrowth.health = 0; checkFailure(); });
    await p2.waitForTimeout(300);
    await p2.evaluate(() => window.showEndReport());
    ok(await p2.evaluate(() => !hasSave()), 'choosing View Report accepts the end — save cleared');
    await p2.close();
  }

  console.log('— growbay modifiers all act');
  {
    const page = await boot({ crew: ['botanist', 'engineer'] });
    const grow = async (setupFn) => page.evaluate(fn => {
      Math.random = () => 0.99; // no pest onset
      Object.assign(STATE.cropGrowth, { growth: 20, health: 80, pest: false, tenderId: 'none', tenderChosen: true, lastTickDay: STATE.daysElapsed }); // the player chose Nobody (else ruling 41's default botanist tends)
      STATE.orders.waterSplit = 50; STATE.resources.water = 80;
      (new Function(fn))();
      const g0 = STATE.cropGrowth.growth, h0 = STATE.cropGrowth.health;
      STATE.daysElapsed += 10; tickCropGrowth();
      return { dg: STATE.cropGrowth.growth - g0, dh: STATE.cropGrowth.health - h0 };
    }, setupFn);
    const base = await grow('');
    const osei = await grow("STATE.cropGrowth.tenderId = 'osei';");
    const pests = await grow('STATE.cropGrowth.pest = true;');
    const under = await grow('STATE.orders.waterSplit = 20;');
    const dry = await grow('STATE.resources.water = 0;');
    ok(Math.abs(osei.dg / base.dg - 1.15) < 0.02, `tender +15% growth (${base.dg.toFixed(2)} → ${osei.dg.toFixed(2)})`);
    ok(pests.dg < base.dg && pests.dh < 0, `pests slow growth and hurt (${pests.dg.toFixed(2)}, health ${pests.dh.toFixed(1)})`);
    ok(under.dg < base.dg, `underwatered slows growth (${under.dg.toFixed(2)})`);
    ok(dry.dg < base.dg && dry.dh < -20, `ship water dry: growth ${dry.dg.toFixed(2)}, health ${dry.dh.toFixed(1)}`);
    ok(base.dh > 0, `matched water recovers health (+${base.dh.toFixed(1)} over 10 days)`);
    const panel = await page.evaluate(() => {
      STATE.cropGrowth.tenderId = 'osei'; STATE.cropGrowth.pest = true;
      openGrowbay();
      const t = document.getElementById('overlay-growbay').innerText; closeGrowbay(); return t;
    });
    ok(!/\+0%/.test(panel) && /health\/day/.test(panel), 'panel shows real per-day numbers, no "+0%" rows');
    const gone = await page.evaluate(() => { STATE.cropGrowth.tenderId = 'osei'; killCrew('botanist'); openGrowbay(); const t = document.getElementById('overlay-growbay').innerText; closeGrowbay(); return /Osei tending/i.test(t); });
    ok(!gone, 'a dead tender tends nothing');
    ok(!page._errs.length, 'no page errors' + (page._errs.length ? ': ' + page._errs.join(' | ') : ''));
    await page.close();
  }

  console.log('— SCAN');
  {
    const page = await boot({ trail: 'mars' });
    const r = await page.evaluate(() => {
      Math.random = (() => { let x = 7; return () => (x = (x * 9301 + 49297) % 233280) / 233280; })();
      const lines = scoutAhead(1, false);
      const next = [...nextAvailableNodes()][0];
      const sc = STATE.scouted[next];
      showScreen('screen-cruise'); renderCruise();
      const ticker = document.getElementById('header-ticker').textContent;
      saveRun(); STATE.scouted = {}; loadRun();
      const kept = !!(STATE.scouted[next]);
      travelTo(next);
      return { lines, sc, ticker, kept, met: STATE.currentEvent && STATE.currentEvent.id, previews: document.querySelectorAll('#enc-choices .previewed').length };
    });
    ok(r.lines.length && r.sc, `good scan reports the next stop (${r.lines.join(' / ')})`);
    ok(!r.sc.ev || /SCAN · NEXT/.test(r.ticker), `ticker shows the hit ("${r.ticker}")`);
    ok(r.kept, 'scouted stops survive save/load');
    ok(!r.sc.ev || r.met === r.sc.ev, `the ship meets what the scan saw (${r.sc.ev} = ${r.met})`);
    await page.close();
    const p2 = await boot({ trail: 'mars', ai: 'aria' });
    const q = await p2.evaluate(() => {
      const lines = scoutAhead(2, true);
      const next = [...nextAvailableNodes()][0];
      const deep = Object.keys(STATE.scouted).length;
      const sc = STATE.scouted[next];
      if (sc.ev) { EVENTS[sc.ev]; }
      travelTo(next);
      const ev = STATE.currentEvent;
      const fixed = ev ? [...document.querySelectorAll('#enc-choices .enc-choice:not(.locked):not(.advance)')].length : 0;
      const prev = [...document.querySelectorAll('#enc-choices .previewed')].map(b => b.textContent);
      return { lines, deep, ev: ev && ev.id, intended: sc.ev, fixed, prev };
    });
    ok(q.deep >= 2, `perfect scan reaches two stops deep (${q.deep} scouted)`);
    ok(!q.intended || (q.ev === q.intended && (q.prev.length > 0 || q.fixed === 0)), `perfect intel: choices show outcomes on arrival (${q.prev.slice(0, 2).join(' / ')})`);
    // end-to-end through the Stop menu with a stubbed perfect scan
    const p3 = await boot({ trail: 'mars' });
    const e2e = await p3.evaluate(async () => {
      window.openMinigame = (k, o, cb) => setTimeout(() => cb('perfect'), 0);
      STATE.byId[STATE.currentId].node_type = 'nebula';
      showScreen('screen-cruise'); renderCruise();
      document.getElementById('stop-btn').click();
      await new Promise(r => setTimeout(r, 200));
      const scan = [...document.querySelectorAll('#stop-choices .stop-choice')].find(b => /SCAN/.test(b.textContent));
      if (!scan) return { err: 'no SCAN verb: ' + [...document.querySelectorAll('#stop-choices .stop-choice')].map(b => b.textContent.split('\n')[0]).join(',') };
      scan.click();
      await new Promise(r => setTimeout(r, 300));
      return { scouted: Object.keys(STATE.scouted).length, log: STATE.shipLog.slice(-1)[0].text };
    });
    ok(e2e.scouted > 0 && /SCAN — Clean lock/.test(e2e.log || ''), `Stop menu SCAN (perfect) → ${JSON.stringify(e2e).slice(0, 160)}`);
    ok(!p2._errs.length && !p3._errs.length, 'no page errors' + ([...p2._errs, ...p3._errs].length ? ': ' + [...p2._errs, ...p3._errs].join(' | ') : ''));
    await p2.close(); await p3.close();
  }

  console.log(`\nfollowups: ${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();

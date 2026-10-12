// Owner rulings 2026-10-10: AI passives (ARIA/MARV/REX/AJOY), captain
// Xenobiologist stand-in + Academic Research, inventory USE, saved-life text.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
let browser;
async function boot(setup) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.stack || e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster);
  await page.evaluate(o => {
    localStorage.removeItem('transplant_save_v1');
    applySetupToState(Object.assign({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer', 'pilot'], crop: 'wheat', ship: 'D' }, o));
    STATE.stowaway = null;
  }, setup || {});
  await page.waitForTimeout(200);
  page._errs = errs;
  return page;
}
// An event whose flat choices include a costed fixed outcome.
const COSTED = `Object.values(EVENTS).find(e => !e.layers && e.active !== false && (e.choices||[]).filter(c => c.outcome && typeof c.outcome === 'object' && !c.requires_crew && !c.requires_item && !c.requires_flag && !c.gate && !c.launch_minigame && Object.values(c.outcome.resources||{}).some(v => v < 0)).length >= 2 && !(e.choices||[]).some(c => c.requires_flag || c.showFlag || c.gold_cost))`;

(async () => {
  browser = await chromium.launch();

  console.log('— ARIA: +1 morale per leg');
  const legMorale = async ai => {
    const page = await boot({ ai });
    const m = await page.evaluate(() => { Math.random = () => 0.99; setCrewMorale(50); const n = [...nextAvailableNodes()][0]; travelTo(n, { skipEvent: true }); return crewMoraleRaw(); });
    await page.close(); return m;
  };
  const mA = await legMorale('aria'), mM = await legMorale('marv');
  ok(Math.abs(mA - mM - 1) < 1e-9, `ARIA leg morale ${mA.toFixed(2)} vs MARV ${mM.toFixed(2)}`);

  console.log('— MARV previews the costliest choice');
  {
    const page = await boot({ ai: 'marv' });
    const r = await page.evaluate(costed => {
      const ev = eval(costed);
      enterEvent(STATE.byId[STATE.currentId], ev);
      const p = [...document.querySelectorAll('#enc-choices .enc-choice.previewed')];
      return { ev: ev.id, n: p.length, text: p.map(b => b.innerText.replace(/\n/g, ' | ')) };
    }, COSTED);
    ok(r.n === 1 && /MARV · −\d+/.test(r.text[0]), `one MARV preview with a cost (${r.ev}: ${r.text[0]})`);
    await page.close();
    const p2 = await boot({ ai: 'aria' });
    const n2 = await p2.evaluate(costed => { enterEvent(STATE.byId[STATE.currentId], eval(costed)); return document.querySelectorAll('#enc-choices .previewed').length; }, COSTED);
    ok(n2 === 0, 'no preview without MARV');
    await p2.close();
  }

  console.log('— Academic captain: one Research per station leg');
  {
    const page = await boot({ ai: 'aria', captain: 'academic' });
    const r = await page.evaluate(costed => {
      const ev = eval(costed);
      const count = () => [...document.querySelectorAll('#enc-choices .previewed')].filter(b => /RESEARCH ·/.test(b.innerText)).length;
      enterEvent(STATE.byId[STATE.currentId], ev);
      const first = count();
      renderEncounterState();
      const rerender = count();
      returnToHub();
      enterEvent(STATE.byId[STATE.currentId], ev);
      const second = count();
      returnToHub();
      STATE.researchReady = true; // what a station arrival does
      enterEvent(STATE.byId[STATE.currentId], ev);
      const afterStation = count();
      return { first, rerender, second, afterStation };
    }, COSTED);
    ok(r.first === 1 && r.rerender === 1, `Research shows and survives a re-render (${JSON.stringify(r)})`);
    ok(r.second === 0 && r.afterStation === 1, 'spent until the next station');
    const sr = await page.evaluate(() => { const n = STATE.nodes.find(x => x.node_type === 'station'); STATE.researchReady = false; STATE.currentId = STATE.nodes[STATE.nodes.indexOf(n) - 1] ? STATE.nodes[STATE.nodes.indexOf(n) - 1].id : STATE.currentId; travelTo(n.id, { skipEvent: true }); return STATE.researchReady; }).catch(e => 'err ' + e.message);
    ok(sr === true, `station arrival recharges Research (${sr})`);
    await page.close();
  }

  console.log('— AJOY hindsight');
  {
    const page = await boot({ ai: 'ajoy' });
    const r = await page.evaluate(costed => {
      const ev = eval(costed);
      enterEvent(STATE.byId[STATE.currentId], ev);
      const btn = [...document.querySelectorAll('#enc-choices .enc-choice:not(.locked):not(.advance)')][0];
      btn.click();
      return { name: document.getElementById('enc-ai-name').textContent, text: document.getElementById('enc-ai-text').textContent };
    }, COSTED);
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => document.getElementById('enc-ai-text').textContent);
    ok(r.name === 'AJOY' && /“.+” would have (cost you|got you|meant|changed)/.test(after), `AJOY names an unpicked choice: "${after}"`);
    ok(!/!/.test(after), 'no exclamation (AJOY register)');
    await page.close();
  }

  console.log('— REX');
  {
    const page = await boot({ ai: 'rex' });
    await page.evaluate(() => {
      Math.random = () => 0.5;
      const ev = Object.values(EVENTS).find(e => JSON.stringify(e).includes('"triggerCombat":true'));
      enterEvent(STATE.byId[STATE.currentId], ev); window.triggerCombat({});
    });
    await page.waitForTimeout(450); // the panel paints after the 200ms choices → actions cross-dissolve
    await page.evaluate(() => [...document.querySelectorAll('#enc-choices .enc-choice')].find(b => /EVASIVE/.test(b.textContent)).click());
    await page.waitForTimeout(1500);
    const h1 = await page.evaluate(() => document.getElementById('combat-num-hull').textContent);
    await page.evaluate(() => [...document.querySelectorAll('#enc-choices .enc-choice')].find(b => /EVASIVE/.test(b.textContent)).click());
    await page.waitForTimeout(1500);
    const h2 = await page.evaluate(() => document.getElementById('combat-num-hull').textContent);
    ok(h1 === '100%' && h2 !== '100%', `REX: first enemy hit blocked, second lands (${h1} → ${h2})`);
    await page.close();
    const p2 = await boot({ ai: 'rex' });
    await p2.evaluate(() => openMinigame('engine', {}, () => {}));
    await p2.waitForTimeout(200);
    await p2.click('#rstart');
    await p2.waitForTimeout(300);
    ok(/\/ 4/.test(await p2.evaluate(() => document.querySelector('.eng-errs').textContent)), 'REX: engine sequence allows 4 errors');
    await p2.close();
  }

  console.log('— Xenobiologist captain stands in');
  {
    const find = `Object.values(EVENTS).find(e => !e.layers && (e.choices||[]).some(c => c.requires_crew === 'xenobiologist' && c.outcome && typeof c.outcome === 'object' && !c.launch_minigame && !c.requires_item && Object.values(c.outcome.resources||{}).some(v => v > 1)))`;
    const run = async setup => {
      const page = await boot(setup);
      const r = await page.evaluate(find => {
        const ev = eval(find);
        const ch = ev.choices.find(c => c.requires_crew === 'xenobiologist' && Object.values(c.outcome.resources||{}).some(v => v > 1));
        const k = Object.entries(ch.outcome.resources).find(([, v]) => v > 1)[0];
        if (k === 'morale') setCrewMorale(10); else STATE.resources[k] = 10; if (k === 'gold') STATE.goldAmount = 10; // morale is per crew member (owner ruling 15)
        enterEvent(STATE.byId[STATE.currentId], ev);
        const btn = [...document.querySelectorAll('#enc-choices .enc-choice')].find(b => b.textContent.includes((ch.text || '').slice(0, 20)));
        const sub = btn.innerText; const locked = btn.classList.contains('locked');
        if (!locked) btn.click();
        return { ev: ev.id, k, authored: ch.outcome.resources[k], after: k === 'gold' ? STATE.goldAmount : k === 'morale' ? crewMoraleRaw() : STATE.resources[k], locked, sub };
      }, find);
      await page.close(); return r;
    };
    const none = await run({ captain: 'veteran', crew: ['engineer', 'pilot'] });
    const cap = await run({ captain: 'xenobiologist', crew: ['engineer', 'pilot'] });
    const crew = await run({ captain: 'veteran', crew: ['xenobiologist', 'pilot'] });
    ok(none.locked, `no xeno at all: locked (${none.ev})`);
    ok(!cap.locked && /Captain stands in/.test(cap.sub), 'xeno captain unlocks it, marked as a stand-in');
    ok(cap.after - 10 === Math.floor(cap.authored / 2) && crew.after - 10 === crew.authored, `half the gains (${cap.k}: captain +${cap.after - 10}, crew +${crew.after - 10}, authored +${cap.authored})`);
  }

  console.log('— Inventory USE');
  {
    const page = await boot();
    const r = await page.evaluate(() => {
      showScreen('screen-cruise'); renderCruise();
      STATE.items = ['ration_brick', 'fuel_cell', 'medkit']; STATE.resources.food = 50; STATE.resources.fuel = 100;
      openInventory();
      const pick = id => { [...document.querySelectorAll('.inv-tile')].find(t => (t.dataset.id || t.getAttribute('data-id') || t.title || t.innerHTML).includes(id)).click(); };
      _invSelected = 'ration_brick'; renderInventory();
      const useBtn = document.getElementById('inv-use-btn');
      const label = useBtn.textContent; useBtn.click();
      const food = STATE.resources.food, items1 = STATE.items.slice();
      _invSelected = 'fuel_cell'; renderInventory();
      const fuelDisabled = document.getElementById('inv-use-btn').disabled;
      STATE.crewHP.engineer = 30; _invSelected = 'medkit'; renderInventory();
      document.getElementById('inv-use-btn').click();
      return { label, food, items1, fuelDisabled, hp: STATE.crewHP.engineer, items2: STATE.items.slice() };
    });
    ok(r.label === 'USE · +10 FOOD' && r.food === 60 && !r.items1.includes('ration_brick'), `ration brick: +10 food, consumed (${JSON.stringify(r)})`);
    ok(r.fuelDisabled, 'fuel cell disabled at a full tank');
    ok(r.hp === 100 && !r.items2.includes('medkit'), 'medkit heals the worst-hurt crew member');
    ok(!page._errs.length, 'no page errors' + (page._errs.length ? ': ' + page._errs.join(' | ') : ''));
    await page.close();
  }

  console.log('— Saved-life text');
  {
    const page = await boot({ crew: ['engineer', 'medic'] });
    const r = await page.evaluate(() => {
      Math.random = () => 0.01;
      const ev = Object.values(EVENTS).find(e => !e.layers && (e.choices||[]).some(c => c.outcome && c.outcome.severity === 'lethal' && !c.requires_crew && !c.requires_item && !c.requires_flag && !c.launch_minigame && !c.gate));
      enterEvent(STATE.byId[STATE.currentId], ev);
      const ch = ev.choices.find(c => c.outcome && c.outcome.severity === 'lethal' && !c.requires_crew && !c.requires_item && !c.requires_flag && !c.launch_minigame && !c.gate);
      handleChoiceClick(ch);
      return { ev: ev.id, crew: STATE.crew.slice() };
    });
    await page.waitForTimeout(2500);
    const body = await page.evaluate(() => document.getElementById('enc-narr-body').textContent);
    ok(r.crew.length === 2 && /refused to let it end there — (.+ is|you are) badly hurt, but alive/.test(body), `outcome text says who was saved (${r.ev})`);
    await page.close();
  }

  console.log(`\npassives: ${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();

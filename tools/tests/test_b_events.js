// Click every choice of every new Track-B event in the real engine.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
const IDS = ['event_general_033', 'event_general_034', 'event_general_035', 'event_general_036', 'event_general_037', 'event_general_038',
  'event_shipboard_011', 'event_shipboard_012', 'event_shipboard_013', 'event_shipboard_014', 'event_shipboard_015',
  'event_crisis_023', 'event_crisis_024', 'event_anomaly_005', 'event_nebula_004'];
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 780 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.stack || e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster);
  const meta = await page.evaluate(ids => ids.map(id => ({ id, fork: (EVENTS[id].node_type || []).includes('fork'),
    choices: EVENTS[id].choices.map(c => ({ text: c.text, crew: c.requires_crew, flag: c.outcome.sets_flag, fab: !!c.outcome.fabricator_repair })) })), IDS);
  for (const ev of meta) {
    for (let i = 0; i < ev.choices.length; i++) {
      const ch = ev.choices[i];
      await page.goto(URL);
      await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster);
      const solo = ev.id === 'event_shipboard_013';
      const crew = solo ? [] : [ch.crew || 'chef', ch.crew === 'medic' ? 'chef' : 'medic'];
      await page.evaluate(({ ev, crew, fork }) => {
        applySetupToState({ trail: 'interstellar', ai: 'ajoy', captain: 'veteran', crew, crop: 'wheat', ship: 'B' });
        STATE.stowaway = null;
        if (ev === 'event_shipboard_015') STATE.stowaway = { identity: MOD.flavor.stowaway_identities[2], revealed: false };
        if (ev.startsWith('event_crisis_02')) { STATE.fabricator = { wear: 0, broken: false }; STATE.fabricator.broken = ev === 'event_crisis_023'; STATE.fabricator.wear = 80; }
        const node = fork ? STATE.nodes.find(n => n.node_type === 'fork') : STATE.byId[STATE.currentId];
        STATE.currentId = node.id;
        enterEvent(node, EVENTS[ev]);
      }, { ev: ev.id, crew, fork: ev.fork });
      await page.waitForTimeout(500);
      const body = await page.evaluate(() => { if (typeof finishAllTyping === 'function') finishAllTyping(); return document.getElementById('enc-narr-body').textContent; });
      ok(!/\{[a-z]+\.[a-z]+\}/.test(body), `${ev.id}: unresolved token in body`);
      if (ev.id === 'event_shipboard_015') ok(/Pip Andrade/.test(body), 'shipboard_015 names the stowaway');
      const clicked = await page.evaluate(t => {
        const b = [...document.querySelectorAll('#enc-choices .enc-choice')].find(x => x.textContent.includes(t));
        if (!b || b.classList.contains('locked')) return 'locked:' + (b ? b.textContent : 'missing');
        b.click(); return 'ok';
      }, ch.text.slice(0, 24));
      ok(clicked === 'ok', `${ev.id}#${i} clickable (${clicked})`);
      await page.waitForTimeout(350);
      const st = await page.evaluate(() => ({
        outcome: STATE.outcomeMode, flags: [...STATE.flags], fabBroken: STATE.fabricator && STATE.fabricator.broken,
        wear: STATE.fabricator && STATE.fabricator.wear, revealed: STATE.stowaway && STATE.stowaway.revealed,
        text: document.getElementById('enc-narr-body').textContent,
      }));
      ok(st.outcome, `${ev.id}#${i} reached an outcome`);
      if (ch.flag) ok(st.flags.includes(ch.flag), `${ev.id}#${i} sets ${ch.flag}`);
      if (ch.fab) ok(st.fabBroken === false && st.wear <= 50, `${ev.id}#${i} repairs the fabricator`);
      if (ev.id === 'event_shipboard_015') ok(st.revealed === true, 'shipboard_015 counts as the reveal');
      if (ev.fork) {
        // Continue → the run must move on from the fork (no softlock).
        await page.evaluate(() => { const b = [...document.querySelectorAll('#enc-choices .enc-choice')].pop(); if (b) b.click(); });
        await page.waitForTimeout(500);
        const moved = await page.evaluate(() => {
          const fork = STATE.nodes.find(n => n.node_type === 'fork');
          return STATE.currentId !== fork.id || (typeof nextAvailableNodes === 'function' && [...nextAvailableNodes()].length === 1);
        });
        ok(moved, `${ev.id}#${i} fork resolves forward`);
      }
    }
    console.log(`  ${ev.id}: ${ev.choices.length} choices exercised`);
  }
  ok(!errors.length, 'page errors: ' + errors.join(' | '));
  console.log(`\nB events: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();

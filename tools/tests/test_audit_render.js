// Render-sweep fixes (2026-11-05, tools/render_sweep.js at 960×640):
// a choice column of seven or eight rows shows its last row (the leave
// row) without a scroll — the story panel gives up its 190px reserve and
// scrolls instead; an authored sub-label that a big water/food cost
// (ruling 129) pushes into "…" stays whole in the row's tooltip; the
// shortened subs of the derelict rescues and the toll keep their wording
// in `detail`.
const { chromium, firefox } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

(async () => {
  const browser = await (process.env.PW_BROWSER === 'firefox' ? firefox : chromium).launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const open = (id, flags, crew) => page.evaluate(async ({ id, flags, crew }) => {
    const w = ms => new Promise(r => setTimeout(r, ms));
    localStorage.removeItem('transplant_save_v1');
    applySetupToState({ trail: 'mars', ai: 'aria', captain: 'veteran', crew, crop: 'wheat', ship: 'T' });
    STATE.stowaway = null; STATE.flags.add('departed'); STATE.goldAmount = 300;
    for (const f of flags) STATE.flags.add(f);
    const ev = EVENTS[id];
    if (ev.after_event) STATE.seenEventIds.add(ev.after_event);
    if (ev.npc && ev.npc.species && ev.npc.species !== 'human') STATE.voyageSpecies = ev.npc.species;
    const node = STATE.nodes.find(n => n.node_type !== 'station' && n.node_type !== 'fork');
    enterEvent(node, ev); await w(150); finishAllTyping(); await w(200); fitEncounterColumns(); await w(60);
    const col = document.getElementById('enc-choices');
    const narr = document.getElementById('enc-narrative').getBoundingClientRect();
    const rows = [...col.children];
    const colBox = col.getBoundingClientRect();
    const last = rows[rows.length - 1].getBoundingClientRect();
    return {
      rows: rows.length, scroll: col.scrollHeight - col.clientHeight,
      lastShown: last.bottom <= colBox.bottom + 1 && last.bottom <= narr.top,
      lastText: rows[rows.length - 1].textContent.slice(0, 30),
      tips: rows.map(b => ({ text: (b.querySelector('.ch-text') || b).textContent, sub: (b.querySelector('.ch-sub-text') || {}).textContent || '', tip: [b.getAttribute('title'), b.getAttribute('data-tip-description')].filter(Boolean).join(' ') })),
    };
  }, { id, flags, crew });
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && typeof enterEvent === 'function');

  console.log('— a long choice column shows its last row');
  for (const [id, flags] of [['event_voyage_quest_053', ['tally_cashed']], ['event_voyage_quest_053', ['tally_disputed', 'tally_salvor']], ['event_voyage_quest_053', ['tally_salvaged']], ['event_encounter_toll_001', []]]) {
    const r = await open(id, flags, ['engineer', 'pilot', 'diplomat']);
    ok(r.scroll <= 1 && r.lastShown, `${id} ${flags.join('+') || '(no flags)'}: ${r.rows} rows, last "${r.lastText}" shown (column overflow ${r.scroll}px)`);
  }

  console.log('— a sub-label the cost pushed into "…" is whole in the tooltip');
  {
    const r = await open('event_species_water_006', [], ['engineer', 'diplomat', 'pilot']);
    const row = r.tips.find(t => /brackish/.test(t.text));
    ok(row && /FOOD|H2O/.test(row.sub) && row.tip.includes('Neither side wants you'), `water_006 "${row && row.text}": row "${row && row.sub}", tooltip holds the sub (${row && row.tip.slice(0, 120)})`);
  }

  console.log('— shortened subs keep their wording in the tooltip');
  {
    const r = await open('event_encounter_toll_001', [], ['diplomat', 'pilot']);
    const hag = r.tips.find(t => /haggle/i.test(t.text)), run = r.tips.find(t => /run the gap/i.test(t.text));
    ok(hag && /Asks about their upkeep/.test(hag.sub) && /standard of maintenance/.test(hag.tip), `toll Haggle: short sub (${hag && hag.sub}), maintenance line in the tooltip (${hag && hag.tip.slice(0, 120)})`);
    ok(run && /They will shoot/.test(run.sub) && /takes the helm/.test(run.tip), 'toll Run the gap: short sub, helm line in the tooltip');
  }
  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(`\naudit render: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();

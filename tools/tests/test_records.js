// Ruling 89 (owner 2026-10-15): run history and best scores. Every finished
// run is recorded once (arrivals with tier + score, failures with how they
// ended), the last 10 kept newest first; each destination keeps its best
// arrival (crop alive). The arrival report shows the score and NEW BEST.
// The title screen's RECORDS button opens the panel; CLEAR RECORDS empties it.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const errors = [];
let browser;
async function open(url) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url || URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.endingLines && MOD.failures && window.recordRun);
  await page.evaluate(() => localStorage.clear());
  return page;
}
// Plays one ending in the page: a fresh run (new art seed = new run id),
// then an arrival at a forced score, or a failure module by id.
const END = async (r) => {
  if (!r.same) applySetupToState({ trail: r.trail, ai: 'marv', captain: 'veteran', crew: ['engineer', 'medic'], crop: r.crop || 'wheat', ship: r.ship || 'Test Ship' });
  STATE.stowaway = null;
  STATE.cropGrowth.health = r.health != null ? r.health : 80;
  if (r.days != null) STATE.daysElapsed = r.days;
  if (r.items) STATE.items = r.items.slice();
  STATE.ended = false;
  const realV = window.scoreValue;
  if (r.score != null) window.scoreValue = () => r.score;
  try {
    if (r.fail) window.renderEndScreen({ kind: 'failure', module: MOD.failures.find(f => f.id === r.fail) });
    else window.renderEndScreen({ kind: 'ending', module: MOD.endings[0] });
    if (r.report) window.showEndReport();
  } finally { window.scoreValue = realV; }
  return { seed: STATE.artSeed, bracket: r.fail ? null : (r.score != null ? (r.health === 0 ? 'hollow' : (r.score >= 125 ? 'legendary' : r.score >= 85 ? 'good' : r.score >= 45 ? 'rough' : 'pyrrhic')) : scoreBracket()),
    day: document.getElementById('end-day-line').textContent, recs: loadRecords() };
};
const end = (page, r) => page.evaluate(new Function('r', 'return (' + END.toString() + ')(r)'), r);

(async () => {
  browser = await chromium.launch();

  console.log('— an arrival is recorded once, with its score on the report');
  {
    const page = await open();
    const a = await end(page, { trail: 'lunar', score: 112.7, days: 80, report: true });
    const e = a.recs.runs[0];
    ok(a.recs.runs.length === 1 && e.kind === 'arrival' && e.trail === 'lunar' && e.tone === 'good' && e.title === 'MOSTLY MADE IT' && e.score === 112, `entry: arrival, lunar, good, MOSTLY MADE IT, score 112 (${JSON.stringify({ k: e.kind, t: e.tone, s: e.score })})`);
    ok(e.ship === 'Test Ship' && e.crop === 'wheat' && e.captain === 'veteran' && e.days === 80 && e.crew === 2 && e.startCrew === 2 && e.id === a.seed, 'entry carries ship, crop, captain, days, crew and the run id');
    ok(/SCORE 112/.test(a.day) && /NEW BEST/.test(a.day), `report: "${a.day.trim()}"`);
    ok(a.recs.best.lunar && a.recs.best.lunar.id === a.seed, 'first lunar arrival is the lunar best');
    const again = await page.evaluate(() => { showEndReport(); window.renderEndScreen({ kind: 'ending', module: MOD.endings[0] }); showEndReport(); return loadRecords(); });
    ok(again.runs.length === 1, 'the same run rendered again stays one entry');
    // Rounding down keeps the number under its tier's line.
    const edge = await end(page, { trail: 'mars', score: 124.9, report: true });
    ok(edge.bracket === 'good' && edge.recs.runs[0].score === 124, `124.9 shows 124 (MOSTLY MADE IT), never 125 (${edge.recs.runs[0].score})`);
    const real = await page.evaluate(() => { applySetupToState({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer'], crop: 'tomato', ship: 'X' }); STATE.cropGrowth.health = 70; STATE.daysElapsed = 50;
      return { v: scoreValue(), shown: runScore(), b: scoreBracket() }; });
    ok(real.shown === Math.floor(real.v) && (real.shown >= 125) === (real.b === 'legendary'), `the real score: ${real.v.toFixed(2)} → ${real.shown} (${real.b})`);
    await page.close();
  }

  console.log('— bests');
  {
    const page = await open();
    const a = await end(page, { trail: 'mars', score: 100, days: 90, report: true });
    const lower = await end(page, { trail: 'mars', score: 90, days: 60, report: true });
    ok(lower.recs.best.mars.id === a.seed && !/NEW BEST/.test(lower.day) && /SCORE 90/.test(lower.day), 'a lower score: best kept, no NEW BEST');
    const tieSlow = await end(page, { trail: 'mars', score: 100, days: 120, report: true });
    ok(tieSlow.recs.best.mars.id === a.seed, 'a tie, but slower: best kept');
    const tieFast = await end(page, { trail: 'mars', score: 100, days: 70, report: true });
    ok(tieFast.recs.best.mars.id === tieFast.seed && /NEW BEST/.test(tieFast.day), 'a tie, and faster: the new best');
    const higher = await end(page, { trail: 'mars', score: 140, days: 100, report: true });
    ok(higher.recs.best.mars.id === higher.seed && higher.recs.best.mars.score === 140 && /NEW BEST/.test(higher.day), 'a higher score: NEW BEST');
    const hollow = await end(page, { trail: 'interstellar', score: 150, health: 0, report: true });
    ok(hollow.recs.runs[0].tone === 'hollow' && hollow.recs.runs[0].score === 150 && !hollow.recs.best.interstellar && !/NEW BEST/.test(hollow.day),
      'a dead-crop arrival is in the history with its score, never a best');
    ok(Object.keys(higher.recs.best).length === 1, 'bests are per destination');
    await page.close();
  }

  console.log('— failures');
  {
    const page = await open();
    const m = await end(page, { trail: 'lunar', fail: 'failure_mutiny_001' });
    const e = m.recs.runs[0];
    ok(m.recs.runs.length === 1 && e.kind === 'failure' && e.tone === 'mutiny' && e.title === 'OFFICIAL COMPLAINT' && e.score === null && !m.recs.best.lunar, 'a terminal failure is recorded at once: how it ended, no score, no best');
    const r = await page.evaluate(() => { showEndReport(); return document.getElementById('end-day-line').textContent; });
    ok(!/SCORE/.test(r), `a failure report shows no score ("${r.trim()}")`);
    // crop_dead offers Keep flying: not final until accepted.
    const cd = await end(page, { trail: 'mars', fail: 'failure_crop_dead_001', health: 0 });
    ok(cd.recs.runs.length === 1, 'a failure with a way on is not recorded yet');
    const kept = await page.evaluate(() => { endContinueRun(); return loadRecords().runs.length; });
    ok(kept === 1, 'Keep flying: still not recorded (the run goes on)');
    const cd2 = await end(page, { trail: 'mars', fail: 'failure_crop_dead_001', health: 0, report: true });
    ok(cd2.recs.runs.length === 2 && cd2.recs.runs[0].tone === 'crop_dead', 'reading its report accepts it: recorded');
    // no_fuel with the beacon aboard: recorded when the player starts over instead.
    const nf = await end(page, { trail: 'interstellar', fail: 'failure_no_fuel_001', items: ['emergency_beacon'] });
    const beaconUp = await page.evaluate(() => getComputedStyle(document.getElementById('end-cine-btn2')).display !== 'none');
    ok(beaconUp && nf.recs.runs.length === 2, 'no fuel with the beacon: the beacon is offered, not recorded yet');
    await page.close();
  }

  console.log('— keeps the last 10, newest first; bests outlive them');
  {
    const page = await open();
    await end(page, { trail: 'lunar', score: 130, report: true });
    for (let i = 0; i < 11; i++) await end(page, { trail: 'mars', score: 50 + i, report: true });
    const r = await page.evaluate(() => loadRecords());
    ok(r.runs.length === 10, `10 kept (${r.runs.length})`);
    ok(r.runs.every((e, i) => i === 0 || e.ts <= r.runs[i - 1].ts) && r.runs[0].score === 60 && r.runs[9].score === 51, 'newest first');
    ok(!r.runs.some(e => e.trail === 'lunar') && r.best.lunar && r.best.lunar.score === 130, 'the lunar best stays after its run drops off the list');
    const survives = await page.evaluate(() => { clearSave(); return !!localStorage.getItem('transplant_records_v1'); });
    ok(survives, 'records live apart from the run save (clearing the save keeps them)');
    await page.close();
  }

  console.log('— the title screen and the panel');
  {
    const page = await open();
    await page.reload(); await page.waitForFunction(() => window.recordRun);
    await page.keyboard.press('Space');
    await page.waitForFunction(() => document.getElementById('title-buttons').classList.contains('visible'), null, { timeout: 20000 });
    await page.waitForTimeout(700);
    const empty = await page.evaluate(() => { const b = document.getElementById('btn-records'); b.click();
      return { dis: b.classList.contains('disabled'), open: document.getElementById('overlay-records').classList.contains('active'),
        w: ['btn-new', 'btn-continue', 'btn-records'].map(id => Math.round(document.getElementById(id).getBoundingClientRect().width)) }; });
    ok(empty.dis && !empty.open, 'no records: RECORDS is dimmed and opens nothing');
    ok(new Set(empty.w).size === 1, `the three title buttons share one width (${empty.w.join('/')})`);
    // Seed through real endings, then back to the title.
    await end(page, { trail: 'lunar', score: 131, report: true });
    await end(page, { trail: 'mars', score: 97, report: true });
    await end(page, { trail: 'interstellar', fail: 'failure_mutiny_001' });
    await page.reload(); await page.waitForFunction(() => window.recordRun);
    await page.keyboard.press('Space');
    await page.waitForFunction(() => document.getElementById('title-buttons').classList.contains('visible'), null, { timeout: 20000 });
    await page.waitForTimeout(700);
    ok(await page.evaluate(() => !document.getElementById('btn-records').classList.contains('disabled')), 'with records: RECORDS is lit');
    await page.click('#btn-records'); await page.waitForTimeout(400);
    const p = await page.evaluate(() => {
      const card = document.getElementById('rec-card').getBoundingClientRect(), g = document.getElementById('game').getBoundingClientRect();
      const tones = [...document.querySelectorAll('#rec-runs .rec-tone')].map(t => ({ text: t.textContent, color: getComputedStyle(t).color }));
      const sv = getComputedStyle(document.getElementById('overlay-records'));
      return { open: document.getElementById('overlay-records').classList.contains('active'),
        best: [...document.querySelectorAll('#rec-best .rec-best')].map(b => b.textContent), runs: document.querySelectorAll('#rec-runs .rec-run').length, tones,
        want: { legendary: sv.getPropertyValue('--tier-legendary-color').trim(), mutiny: sv.getPropertyValue('--fail-mutiny-color').trim() },
        inFrame: card.top >= g.top && card.bottom <= g.bottom && card.left >= g.left && card.right <= g.right };
    });
    ok(p.open && p.inFrame, 'the panel opens, inside the frame');
    ok(p.best.length === 3 && /LUNAR\s*131/.test(p.best[0]) && /MARS\s*97/.test(p.best[1]) && /No arrival yet/.test(p.best[2]), `bests: ${p.best.map(b => b.replace(/\s+/g, ' ').slice(0, 24)).join(' | ')}`);
    ok(p.runs === 3 && /OFFICIAL COMPLAINT/.test(p.tones[0].text) && /MADE IT/.test(p.tones[2].text), 'three voyages, newest first');
    const rgb = hex => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };
    ok(p.tones[0].color === rgb(p.want.mutiny) && p.tones[2].color === rgb(p.want.legendary), 'outcomes wear the end screen\'s tier / failure colours');
    await page.keyboard.press('Escape'); await page.waitForTimeout(350);
    const closed = await page.evaluate(() => ({ rec: document.getElementById('overlay-records').classList.contains('active'), pause: !!document.querySelector('.pause-overlay.open, .pause-screen.open') }));
    ok(!closed.rec && !closed.pause, 'Esc closes the panel (and opens no pause menu)');
    await page.click('#btn-records'); await page.waitForTimeout(300);
    const g = await page.evaluate(() => { const r = document.getElementById('game').getBoundingClientRect(); return { x: r.left + 12, y: r.bottom - 12 }; });
    await page.mouse.click(g.x, g.y); await page.waitForTimeout(350);
    ok(await page.evaluate(() => !document.getElementById('overlay-records').classList.contains('active')), 'a click outside the card closes it');
    await page.click('#btn-records'); await page.waitForTimeout(300);
    await page.click('#rec-clear'); await page.click('#rec-no');
    ok(await page.evaluate(() => loadRecords().runs.length === 3 && getComputedStyle(document.getElementById('rec-clear')).display !== 'none'), 'CLEAR → KEEP leaves everything');
    await page.click('#rec-clear'); await page.click('#rec-yes');
    const cleared = await page.evaluate(() => ({ runs: loadRecords().runs.length, best: Object.keys(loadRecords().best).length, none: document.getElementById('rec-runs').textContent, btn: document.getElementById('rec-clear').disabled }));
    ok(cleared.runs === 0 && cleared.best === 0 && /No voyages/.test(cleared.none) && cleared.btn, 'CLEAR → YES empties the records');
    await page.click('#rec-x'); await page.waitForTimeout(300);
    ok(await page.evaluate(() => document.getElementById('btn-records').classList.contains('disabled')), 'and RECORDS dims again');
    await page.close();
  }

  console.log('— the report card keeps its size');
  {
    const page = await open();
    const r = await page.evaluate(async () => {
      applySetupToState({ trail: 'interstellar', ai: 'marv', captain: 'veteran', crew: ['engineer', 'medic'], crop: 'tomato', ship: 'Q' });
      STATE.cropGrowth.health = 90; STATE.soilSurveys = 3; STATE.daysElapsed = 333; STATE.ended = false;
      window.scoreValue = () => 133;
      window.renderEndScreen({ kind: 'ending', module: MOD.endings[0] }); window.showEndReport();
      const card = document.getElementById('end-report-card');
      await new Promise(r => setTimeout(r, 900));
      const sc = document.getElementById('end-report-scroll'), dl = document.getElementById('end-day-line');
      const scale = document.getElementById('game').getBoundingClientRect().width / 960;
      const lh = parseFloat(getComputedStyle(dl).lineHeight) || 18;
      return { h: Math.round(card.getBoundingClientRect().height / scale), scroll: sc.scrollHeight > sc.clientHeight + 1, day: dl.textContent,
        lines: Math.round(dl.querySelector('.day-best').getBoundingClientRect().top - dl.getBoundingClientRect().top) };
    });
    ok(!r.scroll && r.h <= 505, `day line with score, NEW BEST and the soil extra: no scrolling (card ${r.h} tall)`);
    ok(r.lines < 10, `score and NEW BEST sit on the day's first line ("${r.day.trim()}")`);
    await page.close();
  }

  console.log('— ?debug= records nothing');
  {
    const page = await open(URL.replace(/index\.html.*$/, 'index.html?debug=fixed_path'));
    const r = await end(page, { trail: 'lunar', score: 120, report: true });
    ok(r.recs.runs.length === 0 && !/NEW BEST/.test(r.day) && /SCORE 120/.test(r.day), 'debug run: the score shows, nothing is recorded');
    await page.close();
  }

  ok(!errors.length, 'page errors: ' + errors.slice(0, 3).join(' | '));
  console.log(`\nrecords: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();

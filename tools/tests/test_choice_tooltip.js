// Ruling 146: the drawn event-choice tooltip. Left of the hovered choice,
// its arrow on that choice even when clamped, never over the AI quote
// banner (owner: "ever"); a description box and a WHAT IT TAKES box (day
// blocks, pips, HELPING, cost chips, RISKY, one odds bar); no hands score
// anywhere, on the tooltip or the sub-label. The same box on the cruise
// Stop-menu jobs (and their day steps, beside the row) and on combat
// actions; the cruise AI bubble fades while one covers it.
const { chromium, firefox } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

(async () => {
  const browser = await (process.env.PW_BROWSER === 'firefox' ? firefox : chromium).launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster && typeof enterEvent === 'function' && EVENTS.event_adrift_001 && window.Tooltip);

  const open = (id, o) => page.evaluate(({ id, o }) => {
    localStorage.removeItem('transplant_save_v1');
    applySetupToState({ trail: 'mars', ai: o.ai || 'aria', captain: 'veteran', crew: o.crew || ['pilot', 'engineer'], crop: 'wheat', ship: 'Q' });
    STATE.stowaway = null; STATE.items = (o.items || []).slice();
    returnToHub();
    if (id === 'adrift') { STATE.resources.fuel = 0; openAdrift(); } else enterEvent(STATE.byId[STATE.currentId], EVENTS[id]);
    if (typeof finishAllTyping === 'function') finishAllTyping();
    document.querySelectorAll('#enc-choices .enc-choice').forEach(b => { b.style.opacity = 1; b.style.visibility = 'visible'; b.style.transform = 'none'; });
  }, { id, o });
  // Show the tooltip for the choice matching re; measure it in game space.
  const tipFor = (re, sel) => page.evaluate(({ src, sel }) => {
    const btn = [...document.querySelectorAll(sel)].find(b => new RegExp(src).test(b.textContent));
    if (!btn) return null;
    Tooltip.show(btn);
    const p = Tooltip.panel, game = document.getElementById('game'), g = game.getBoundingClientRect(), s = g.width / game.offsetWidth;
    const box = r => ({ top: (r.top - g.top) / s, bottom: (r.bottom - g.top) / s, left: (r.left - g.left) / s, right: (r.right - g.left) / s });
    const visible = p && p.classList.contains('visible') && !!btn.dataset.tipChoice;
    const pr = p ? box(p.getBoundingClientRect()) : null, br = box(btn.getBoundingClientRect());
    const row = btn.parentElement && btn.parentElement.closest('.stop-choice'), rowR = row ? box(row.getBoundingClientRect()) : null;
    const bub = document.getElementById('ai-bubble'), dimmed = !!(bub && bub.classList.contains('tip-dimmed'));
    const bar = document.getElementById('enc-ai-bar'), barR = bar.getBoundingClientRect().height ? box(bar.getBoundingClientRect()) : null;
    const a = p && p.querySelector('.tc-arrow'), ar = a && a.style.display !== 'none' ? box(a.getBoundingClientRect()) : null;
    const out = { visible, pr, br, barR, arrowY: ar ? (ar.top + ar.bottom) / 2 : null, text: p ? p.innerText.replace(/\s+/g, ' ') : '',
      chips: p ? [...p.querySelectorAll('.tc-chip')].map(c => c.className.split(' ')[1] + ':' + c.textContent) : [],
      odds: p ? [...p.querySelectorAll('.tc-odd')].map(o => o.querySelector('.tc-t').textContent + ' ' + o.querySelector('.tc-p').textContent) : [],
      segs: p ? p.querySelectorAll('.tc-bar span').length : 0, days: p ? [p.querySelectorAll('.tc-days b:not(.maybe)').length, p.querySelectorAll('.tc-days b.maybe').length] : null,
      risky: !!(p && p.querySelector('.tc-box.risky')), sub: (btn.querySelector('.ch-sub') || {}).textContent || '', hasSpec: !!btn.dataset.tipChoice, rowR, dimmed };
    Tooltip.hide();
    out.dimAfter = !!(bub && bub.classList.contains('tip-dimmed'));
    return out;
  }, { src: re.source, sel: sel || '#enc-choices .enc-choice' });
  const placed = (t, name) => {
    ok(t && t.visible, name + ': the drawn tooltip shows');
    if (!t || !t.visible) return;
    const lft = (t.rowR || t.br).left; // a day step: left of its job's row
    ok(t.pr.right <= lft - 8, `${name}: left of the choice (${Math.round(t.pr.right)} ≤ ${Math.round(lft)})`);
    ok(t.arrowY != null && t.arrowY >= t.br.top && t.arrowY <= t.br.bottom, `${name}: the arrow points at the choice (${Math.round(t.arrowY)} in ${Math.round(t.br.top)}–${Math.round(t.br.bottom)})`);
    ok(!t.barR || t.pr.top >= t.barR.bottom, `${name}: below the AI banner (${Math.round(t.pr.top)} ≥ ${t.barR && Math.round(t.barR.bottom)})`);
    ok(t.pr.bottom <= 640 && t.pr.top >= 0, `${name}: on the stage`);
    ok(!/Hands \d/i.test(t.text) && !/Hands \d/.test(t.sub), `${name}: no hands score`);
  };

  console.log('— Adrift: every kind of choice, placed');
  await open('adrift', { items: ['emergency_beacon'] });
  for (const re of [/BURN THE HULL/, /CRACK THE WATER/, /EMERGENCY BEACON/, /CALL FOR HELP/, /SHUT IT ALL DOWN/]) placed(await tipFor(re), re.source);
  const burn = await tipFor(/BURN THE HULL/);
  ok(burn.risky && /▲ RISKY/.test(burn.text), 'risky: tag and red border');
  ok(burn.days[0] === 2 && burn.days[1] === 0 && /2 days/.test(burn.text), 'two solid day blocks, "2 days"');
  ok(burn.chips.includes('b:-25 HULL') && burn.chips.some(c => /^b:ENGINEER -\d+/.test(c)) && burn.chips.some(c => /^b:-\d+ MORALE/.test(c)), `costs as red chips, one per figure (${burn.chips.join(', ')})`);
  ok(!burn.chips.some(c => /FUEL/.test(c)), 'no gain shown on an everyday choice (ruling 34)');
  ok(/outer plating/i.test(burn.text), 'the description box carries the detail');
  const call = await tipFor(/CALL FOR HELP/);
  ok(/CHANCE DECIDES/.test(call.text) && call.segs === 3 && call.odds.length === 3, `chance: one bar, three named results (${call.odds.join(' | ')})`);
  ok(call.odds.some(o => /^SOMEBODY CAME 40%$/.test(o)) && call.odds.some(o => /^THE WRONG SOMEBODY 20%$/.test(o)) && call.odds.some(o => /^NOBODY 40%$/.test(o)), 'each result named by its outcome title with its %');
  ok(call.days[0] === 5 && call.days[1] === 5 && /5–10 days/.test(call.text), 'a time range: 5 solid, 5 hollow');
  const beacon = await tipFor(/EMERGENCY BEACON/);
  ok(beacon.chips.some(c => /USES EMERGENCY BEACON/.test(c)) && !/USES EMERGENCY BEACON.*USES EMERGENCY BEACON/.test(beacon.text), 'a fact every result shares is one cost chip, said once');

  console.log('— a hands-on job: HELPING, odds, what would help');
  await open('event_asteroid_001', { crew: ['pilot', 'engineer'] });
  const std = await tipFor(/standard equipment/);
  placed(std, 'standard equipment');
  ok(/HELPING you · pilot · engineer/.test(std.text), `who's helping (${std.text.slice(0, 120)})`);
  ok(/HOW IT GOES/.test(std.text) && std.odds.length === 2 && /^CLEAN \d+%$/.test(std.odds[0]) && /^SHORT-HANDED \d+%$/.test(std.odds[1]), `clean or short-handed (${std.odds.join(' | ')})`);
  ok(/A portable drill would make it 90%\./.test(std.text), 'says what missing help would change');
  ok(/^●+○*\d+ days? · \d+% clean$/.test(std.sub.trim()), `sub-label: days and odds, no Hands (${std.sub})`);
  const drillHeld = await (async () => { await open('event_asteroid_001', { crew: ['pilot', 'engineer'], items: ['portable_drill'] }); return tipFor(/standard equipment/); })();
  ok(/portable drill/.test(drillHeld.text) && !/would make it/.test(drillHeld.text), 'with the drill aboard it is helping, and nothing is missing');
  const locked = await (async () => { await open('event_asteroid_001', { crew: ['pilot', 'engineer'] }); return tipFor(/with the portable drill/); })();
  placed(locked, 'a locked choice');
  ok(/Need: Portable Drill/.test(locked.text), 'a locked choice says what it needs');

  console.log('— the AI banner, however tall');
  await open('event_asteroid_001', { ai: 'marv' });
  await page.waitForTimeout(1500); // the scene's beats finish typing first, then the line is made long
  await page.evaluate(() => { if (typeof finishAllTyping === 'function') finishAllTyping(); });
  await page.waitForTimeout(300);
  await page.evaluate(() => { document.getElementById('enc-ai-text').textContent = 'A very long line, long enough to wrap. '.repeat(7); });
  const tall = await tipFor(/standard equipment/);
  ok(tall.barR && tall.barR.bottom > 60, `the banner runs long (${tall.barR && Math.round(tall.barR.bottom)}px)`);
  placed(tall, 'under a tall banner');
  const generic = await page.evaluate(() => {
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;left:300px;top:' + Math.round(document.getElementById('enc-ai-bar').getBoundingClientRect().bottom + 4) + 'px;width:80px;height:16px';
    el.dataset.tipDescription = 'A plain tooltip that would sit above its element.';
    document.getElementById('game').appendChild(el);
    Tooltip.show(el);
    const p = Tooltip.panel.getBoundingClientRect(), bar = document.getElementById('enc-ai-bar').getBoundingClientRect(), r = el.getBoundingClientRect();
    Tooltip.hide(); el.remove();
    return { top: p.top, barBottom: bar.bottom, elBottom: r.bottom };
  });
  ok(generic.top >= generic.barBottom && generic.top >= generic.elBottom, 'any tooltip near the banner flips below it and below its element');

  console.log('— nothing to say, nothing shown');
  await open('event_station_006', {});
  const chat = await tipFor(/Stop and chat/);
  ok(chat && !chat.hasSpec && !chat.visible, 'a choice with no time, cost or detail has no tooltip (as before)');
  await open('event_station_010', {});
  const q = await tipFor(/One question first/);
  ok(q && q.visible && q.risky && /It can go badly\./.test(q.text), 'a risky step with nothing else says so');

  console.log('— a fight, a ram, a minigame');
  await open('event_encounter_pirate_001', {});
  const ram = await tipFor(/^\s*Ram|RAM/);
  placed(ram, 'ram');
  ok(ram.odds.length === 2 && /YOU GET THROUGH/.test(ram.odds[0]) && /THEY HOLD/.test(ram.odds[1]) && /A FIGHT/.test(ram.text), `ram: the odds of getting through (${ram.odds.join(' | ')})`);
  const fire = await tipFor(/Open Fire/);
  ok(/the fight decides what it costs/i.test(fire.text), 'combat: the fight decides');
  await open('event_anomaly_006', {});
  const mg = await tipFor(/Time the pulses/);
  ok(/A minigame: how well you play decides the result\./.test(mg.text), 'minigame: said');

  console.log('— the Stop menu: jobs, day steps, the AI bubble');
  const stopAt = (type, quip) => page.evaluate(async ({ type, quip }) => {
    localStorage.removeItem('transplant_save_v1');
    applySetupToState({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer', 'pilot'], crop: 'wheat', ship: 'Q' });
    STATE.items = []; returnToHub(); STATE.resources.hull = 40; STATE.goldAmount = 200;
    const n = STATE.nodes.find(x => x.node_type === type); if (!n) return false;
    STATE.currentId = n.id; renderCruise();
    document.body.classList.remove('stop-active'); document.getElementById('stop-btn').click();
    await new Promise(r => setTimeout(r, 300));
    if (quip) pushCruiseLog('A quip about the ferns, long enough to make the bubble wide and tall.', { ai: true });
    return true;
  }, { type, quip });
  const SC = '#stop-choices .stop-choice';
  ok(await stopAt('station', true), 'a station on the map');
  const rep = await tipFor(/^\s*REPAIR/, SC);
  placed(rep, 'REPAIR');
  ok(rep.days[0] === 1 && /EFFORT/.test(rep.text) && /GAINS/.test(rep.text), `REPAIR: a day, effort, what it gives (${rep.text.slice(0, 100)})`);
  ok(rep.chips.includes('g:+30 HULL') && rep.chips.includes('b:-2 METAL') && rep.chips.includes('b:-1 SCRAP') && rep.chips.some(c => /^b:-\d+ MORALE$/.test(c)), `REPAIR: gains green, costs red (${rep.chips.join(', ')})`);
  ok(rep.chips.some(c => /^g:ENGINEER \+\d+ MORALE$/.test(c)), 'REPAIR: the engineer\'s lift (ruling 77)');
  ok(rep.dimmed && !rep.dimAfter, 'the AI bubble fades under the box, and comes back when it goes');
  const dd = await tipFor(/^\s*DRYDOCK/, SC);
  placed(dd, 'DRYDOCK');
  ok(dd.chips.some(c => /^b:-\d+ GOLD$/.test(c)) && dd.chips.includes('g:+30 HULL'), `DRYDOCK: the fee and the hull (${dd.chips.join(', ')})`);
  const rest = await tipFor(/^\s*REST/, SC);
  ok(rest.days[0] === 1 && rest.days[1] === 6 && /up to 7/.test(rest.text) && rest.chips.some(c => /^g:\+\d+ MORALE A DAY$/.test(c)), `REST: 1–7 days, morale a day (${rest.chips.join(', ')})`);
  await page.evaluate(async () => { [...document.querySelectorAll('#stop-choices .stop-choice')].find(b => /^\s*REST/.test(b.textContent)).click(); await new Promise(r => setTimeout(r, 300)); });
  const step = await tipFor(/^3$/, '.day-step');
  placed(step, 'a day step');
  ok(step.days[0] === 3 && step.chips.some(c => /^g:\+\d+ MORALE$/.test(c)), `a day step: its days and morale (${step.chips.join(', ')})`);
  ok(await stopAt('asteroid_field', false), 'an asteroid field on the map');
  const mine = await tipFor(/^\s*MINE/, SC);
  placed(mine, 'MINE');
  ok(/A minigame/.test(mine.text) && /Each run takes a day\./.test(mine.text), 'MINE: a minigame, a day a run');
  ok(!rep.text.includes('Hands') && !mine.text.includes('Hands'), 'no hands score on a Stop job');

  console.log('— combat actions');
  await open('event_encounter_pirate_001', { crew: ['botanist', 'chef'] });
  await page.waitForTimeout(250);
  await page.evaluate(() => { window.triggerCombat({}); });
  await page.waitForTimeout(500);
  await page.evaluate(() => { if (typeof finishAllTyping === 'function') finishAllTyping(); });
  const esc = await tipFor(/ATTEMPT ESCAPE/);
  placed(esc, 'ATTEMPT ESCAPE');
  ok(esc.risky && esc.chips.includes('b:-15 FUEL') && esc.days[0] > 0, `ATTEMPT ESCAPE: risky, the fuel, the days (${esc.chips.join(', ')})`);
  const harv = await tipFor(/OFFER HARVEST/);
  placed(harv, 'OFFER HARVEST');
  ok(harv.segs === 2 && /^THEY TAKE IT \d+%$/.test(harv.odds[0]) && /^THEY REFUSE \d+%$/.test(harv.odds[1]) && harv.chips.some(c => /^b:-\d+ FOOD$/.test(c)), `a tribute: the food, one odds bar (${harv.odds.join(' | ')})`);
  const laser = await tipFor(/FIRE LASER/);
  ok(laser && !laser.hasSpec && !laser.visible, 'an action with nothing to add has no box (as before)');

  console.log('— a real mouse');
  // The checks above call Tooltip.show; these move the mouse, as a player does.
  const mouseOn = async (sel, re) => {
    await page.mouse.move(5, 600); await page.waitForTimeout(150);
    const h = await page.evaluateHandle(({ sel, src }) => [...document.querySelectorAll(sel)].find(b => new RegExp(src).test(b.textContent)) || null, { sel, src: re.source });
    const el = h.asElement(); if (!el) return null;
    await el.scrollIntoViewIfNeeded(); await page.waitForTimeout(150);
    const r = await el.boundingBox();
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2, { steps: 4 }); await page.waitForTimeout(700);
    return page.evaluate(({ top, bottom }) => { const p = Tooltip.panel, a = p.querySelector('.tc-arrow'), ar = a && a.style.display !== 'none' ? a.getBoundingClientRect() : null;
      return { vis: p.classList.contains('visible') && p.classList.contains('tip-choice'), on: !!ar && (ar.top + ar.bottom) / 2 >= top && (ar.top + ar.bottom) / 2 <= bottom, text: p.innerText }; }, { top: r.y, bottom: r.y + r.height });
  };
  const away = async () => { await page.mouse.move(400, 600, { steps: 3 }); await page.waitForTimeout(300); return page.evaluate(() => ({ vis: Tooltip.panel.classList.contains('visible'), dim: !!document.querySelector('#ai-bubble.tip-dimmed') })); };
  let m = await mouseOn('#enc-choices .enc-choice', /ATTEMPT ESCAPE/);
  ok(m && m.vis && m.on, 'mouse on a combat action: the box, arrow on it');
  await open('event_asteroid_001', { crew: ['pilot', 'engineer'] });
  await page.waitForTimeout(1500);
  m = await mouseOn('#enc-choices .enc-choice', /standard equipment/);
  ok(m && m.vis && m.on && /HELPING/.test(m.text), 'mouse on an event choice: the box, arrow on it');
  await stopAt('asteroid_field', true);
  m = await mouseOn(SC, /^\s*FABRICATOR/);
  ok(m && m.vis && m.on, 'mouse on the last Stop job (scrolled into view): the box, arrow on it');
  m = await mouseOn(SC, /^\s*REPAIR/);
  ok(m && m.vis && m.on && await page.evaluate(() => !!document.querySelector('#ai-bubble.tip-dimmed')), 'mouse on REPAIR: the box, and the bubble fades');
  let gone = await away();
  ok(!gone.vis && !gone.dim, 'mouse away: the box goes, the bubble comes back');
  await page.evaluate(async () => { [...document.querySelectorAll('#stop-choices .stop-choice')].find(b => /^\s*REST/.test(b.textContent)).click(); await new Promise(r => setTimeout(r, 300)); });
  m = await mouseOn('.day-step', /^3$/);
  ok(m && m.vis && m.on && /3 days/.test(m.text), 'mouse on a day step: its own box');
  m = await mouseOn('.day-step', /^6$/);
  ok(m && m.vis && /6 days/.test(m.text), 'mouse on another step: the box swaps');
  await away();
  // An element with a drawn box and nothing else is still found by the mouse.
  await page.evaluate(() => { const el = document.createElement('button'); el.id = 'tc-only'; el.textContent = 'ONLY A BOX';
    el.style.cssText = 'position:absolute;left:700px;top:300px;width:200px;height:40px;z-index:9999';
    el.dataset.tipChoice = JSON.stringify({ desc: ['Only a drawn box.'], costs: [], notes: [], time: { lo: 1, hi: 1 } }); document.getElementById('game').appendChild(el); });
  m = await mouseOn('#tc-only', /ONLY A BOX/);
  ok(m && m.vis && /Only a drawn box/.test(m.text), 'a drawn box alone is enough for the mouse');
  await away(); await page.evaluate(() => document.getElementById('tc-only').remove());

  ok(!errors.length, 'no page errors: ' + errors.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

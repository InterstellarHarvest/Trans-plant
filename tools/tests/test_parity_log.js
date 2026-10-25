// Ship's Log parity (batch 2): the log records the voyage through the
// real engine — arrivals, event choices + outcomes with their REAL
// effects, a lore page, a death (memorial), a stowaway joining, a fight,
// crop milestones — in order, on the right day, in the active AI's
// voice (ai_companions log_templates); the demo journal layout
// (340×540 docked, DAY dividers, LEDs, badges, header/footer, expand
// title bar, memorial figure + name + DAY · TRAIL); the cruise column
// agrees; save/load keeps the whole journal; compaction caps it.
const { chromium } = require('playwright');
const path = require('path');
const URL = process.env.URL || 'http://localhost:8177/index.html';
const SHOTS = process.env.SHOTS || path.join(require('os').tmpdir(), 'transplant-shots-parity-log');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
let browser;
const errors = [];
const fs = require('fs');
try { fs.mkdirSync(SHOTS, { recursive: true }); } catch (_) {}
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name + '.png') }).catch(() => {});

async function boot(setup) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster && MOD.ai_companions && window.ShipLog);
  await page.evaluate(o => {
    localStorage.removeItem('transplant_save_v1');
    applySetupToState(Object.assign({ trail: 'mars', ai: 'rex', captain: 'veteran', crew: ['engineer', 'pilot'], crop: 'wheat', ship: 'D' }, o));
    STATE.stowaway = null;
    STATE.items = STATE.items.filter(i => i !== 'medkit');
  }, setup || {});
  await page.waitForTimeout(200);
  return page;
}
// Template → regex: the fixed words of the active AI's template, any
// token text in between (the voice is the template's own words).
const voiceRe = (page, key, ai) => page.evaluate(([key, ai]) => {
  const t = MOD.ai_companions.find(a => a.id === 'ai_' + ai).log_templates[key];
  const esc = t.split(/\{\w+\}/).map(p => p.replace(/\s+/g, ' ').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return esc.filter(Boolean).join('[\\s\\S]*');
}, [key, ai]).then(s => new RegExp(s));
const sinceMark = page => page.evaluate(() => STATE.shipLog.slice(window.__mark || 0));
const mark = page => page.evaluate(() => { window.__mark = STATE.shipLog.length; });

(async () => {
  browser = await chromium.launch();

  console.log('— a scripted voyage through the real engine (REX)');
  const page = await boot();
  const run = [];   // every new entry, in order
  {
    // 1. A travel leg → arrival entry with the leg's real cost.
    await mark(page);
    const leg = await page.evaluate(() => {
      const f0 = STATE.resources.fuel, d0 = STATE.daysElapsed;
      const next = [...nextAvailableNodes()][0];
      travelTo(next, { skipEvent: true });
      return { fuel: Math.round(STATE.resources.fuel - f0), days: STATE.daysElapsed - d0, day: STATE.daysElapsed, name: STATE.byId[STATE.currentId].name };
    });
    const e1 = await sinceMark(page); run.push(...e1);
    const arr = e1.find(e => /^Position:/.test(e.text));
    ok(arr && arr.type === 'event' && arr.voice === 'rex', 'arrival logged as a voiced event entry: ' + (arr && arr.text));
    ok(arr && arr.text.includes(leg.name) && arr.text.includes('−' + Math.abs(leg.fuel) + ' FUEL') && arr.text.includes(leg.days + (leg.days === 1 ? ' DAY' : ' DAYS')), `arrival states the real leg cost (${leg.fuel} fuel, ${leg.days} days)` + (arr ? '' : ' — no arrival entry') + (arr && !arr.text.includes('−' + Math.abs(leg.fuel) + ' FUEL') ? ' — logged: ' + arr.text : ''));
    ok(arr && arr.day === leg.day, 'arrival stamped with the arrival day ' + leg.day);
    ok(arr && (await voiceRe(page, 'arrival', 'rex')).test(arr.text), 'arrival in REX\'s template voice');
    ok(e1.indexOf(arr) === 0, 'the arrival entry leads the leg\'s lines');
    // A leg that changed a lot: the entry stays within its 120 characters
    // without cutting a fact, the days stay in it, the rest follows.
    const busy = await page.evaluate(() => {
      const r = ShipLog.begin({ fresh: true }), n0 = STATE.shipLog.length;
      Object.assign(STATE.resources, { fuel: STATE.resources.fuel - 13, food: STATE.resources.food - 9, water: STATE.resources.water - 11, o2: STATE.resources.o2 - 7, hull: STATE.resources.hull - 21 });
      STATE.goldAmount += 17; STATE.materials.scrap = (STATE.materials.scrap || 0) + 3; STATE.materials.metal = (STATE.materials.metal || 0) + 2;
      STATE.daysElapsed += 9;
      ShipLog.arrival(r, STATE.byId[STATE.currentId]);
      return STATE.shipLog.slice(n0).map(e => e.text);
    });
    ok(busy[0] && busy[0].length <= 120 && busy[0].includes('9 DAYS') && !busy[0].includes('…'), 'a busy leg\'s arrival keeps its days, no fact cut: ' + busy[0]);
    ok(busy[1] && /^Also: /.test(busy[1]) && /SCRAP|METAL|GOLD|O2/.test(busy[1]), 'the facts that did not fit follow on an "Also:" line: ' + busy[1]);

    // 2. An event choice → choice entry, then the outcome with real effects.
    await mark(page);
    const r2 = await page.evaluate(() => {
      const ev = EVENTS.event_crisis_007;
      STATE.resources.o2 = 50; setCrewMorale(60);
      const d0 = STATE.daysElapsed;
      enterEvent(STATE.byId[STATE.currentId], ev);
      const o0 = STATE.resources.o2, m0 = crewMoraleRaw();
      handleChoiceClick(ev.choices.find(c => /Seal off/.test(c.text)));
      const r = { o2: Math.round(STATE.resources.o2 - o0), day0: d0 };
      advanceAfterEvent();
      return r;
    });
    const e2 = await sinceMark(page); run.push(...e2);
    const ch = e2.find(e => e.type === 'choice');
    const out = e2[e2.indexOf(ch) + 1];
    ok(ch && /Thin Air/.test(ch.text) && /Seal off the empty decks/.test(ch.text) && ch.voice === 'rex', 'choice entry: title + choice taken — ' + (ch && ch.text));
    ok(ch && (await voiceRe(page, 'choice', 'rex')).test(ch.text), 'choice entry in REX\'s voice');
    ok(out && out.type === 'event' && /You seal the unused compartments/.test(out.text), 'outcome entry follows with the outcome in one line — ' + (out && out.text));
    ok(out && out.text.includes('+' + r2.o2 + ' O2') && /−5 MORALE/.test(out.text) && /1 DAY/.test(out.text), `outcome states the real effects (+${r2.o2} O2, −5 MORALE, 1 DAY)`);
    ok(out && (/Threat level (green|amber)/.test(out.text)), 'outcome in REX\'s voice (sitrep threat level)');
    ok(ch && ch.day === r2.day0 && out.day === r2.day0, 'choice + outcome carry the day the choice was made');
    ok(e2.every(e => e.text.length <= 120 || !e.voice), 'voiced entries within the 120-char cap');

    // 3. A lore outcome: log_lore → a parchment page.
    await mark(page);
    await page.evaluate(() => {
      const ev = EVENTS.event_nebula_001;
      STATE.resources.fuel = 40;
      enterEvent(STATE.byId[STATE.currentId], ev);
      // Pin the effort roll: a short-of-effort setback would change the
      // fuel this check reads (the roll is Math.random in handleChoiceClick).
      const rnd = Math.random; Math.random = () => 0;
      try { handleChoiceClick(ev.choices.find(c => /harvest gas/.test(c.text))); } finally { Math.random = rnd; }
      advanceAfterEvent();
    });
    const e3 = await sinceMark(page); run.push(...e3);
    const lore = e3.find(e => e.expand);
    ok(lore && lore.expand.kind === 'lore' && lore.expand.title === 'GAS ANALYZER PRINTOUT' && /nebulium/.test(lore.expand.text), 'log_lore outcome carries the authored long text');
    ok(lore && /\+12 FUEL/.test(lore.text), 'lore outcome still states its real effect (+12 FUEL)' + (lore && !/\+12 FUEL/.test(lore.text) ? ' — logged: ' + lore.text : ''));
    ok(lore && lore.expand.text.split('\n\n').length >= 4, 'lore keeps its paragraphs');
    ok(e3.some(e => e.link && /Emission_nebula/.test(e.link.url)), 'the event\'s science link lands as a 🔗 entry');

    // 4. A death in an event (engineer, no medic aboard → lethal lands).
    await mark(page);
    const r4 = await page.evaluate(() => {
      const ev = EVENTS.event_crisis_007;
      enterEvent(STATE.byId[STATE.currentId], ev);
      const name = crewNameOf('engineer');
      handleChoiceClick({ text: 'Send the engineer into the sealed deck', outcome: { crew_effect: { type: 'kill', target: 'specific_role', role: 'engineer' }, severity: 'lethal', time_cost: 'trivial', narrative: 'The bulkhead seals before the engineer is clear of it.' } });
      advanceAfterEvent();
      return { name, crew: STATE.crew.slice(), epitaphs: MOD.flavor.crew_epitaphs.map(e => e.replaceAll('[Name]', name)) };
    });
    const e4 = await sinceMark(page); run.push(...e4);
    const t4 = e4.map(e => e.type);
    const death = e4.find(e => e.type === 'death');
    ok(t4[0] === 'choice' && t4[1] === 'event' && t4[2] === 'death', 'order: choice → outcome → memorial (' + t4.join(',') + ')');
    ok(e4[1] && e4[1].text.includes('LOST ' + r4.name.toUpperCase()), 'outcome names the real loss: ' + (e4[1] && e4[1].text));
    ok(death && death.text.includes(r4.name) && /Crew now 1/.test(death.text) && death.voice === 'rex' && /^KIA:/.test(death.text), 'death line voiced by REX with the real effect: ' + (death && death.text));
    ok(death && death.crewId === 'kazuki' && death.crewName === r4.name, 'memorial carries the crew id (portrait) + name');
    const mt = death && death.expand && death.expand.text || '';
    ok(death && r4.epitaphs.some(ep => mt.startsWith(ep)) && mt.length > 200 && /Lost on day \d+, during “Thin Air”/.test(mt) && /Crew now 1/.test(mt), '📖 memorial is the long text (epitaph, who, cause, service, crew left) — not the epitaph again');
    ok(!r4.epitaphs.includes(death && death.text), 'the death row no longer repeats the epitaph verbatim');

    // 5. A stowaway joins (crew now 1 → room for them).
    await mark(page);
    await page.evaluate(() => {
      STATE.stowaway = { identity: { id: 'stow_wembly', name: 'Wembly Voss', story: 'A customs inspector who missed a shuttle.', join_role: 'medic' }, revealed: true };
      const ev = EVENTS.event_crisis_007;
      enterEvent(STATE.byId[STATE.currentId], ev);
      handleChoiceClick({ text: 'Welcome them aboard', outcome: { stowaway_resolve: 'welcome', time_cost: 'trivial', narrative: 'They stay.' } });
      advanceAfterEvent();
    });
    const e5 = await sinceMark(page); run.push(...e5);
    const st = e5.find(e => /New recruit: Wembly Voss, medic\. Strength 2/.test(e.text));
    ok(st && st.type === 'event' && st.voice === 'rex', 'stowaway joining logged in REX\'s voice: ' + (st && st.text));
    ok(e5.indexOf(st) > e5.findIndex(e => e.type === 'choice'), 'stowaway entry follows the choice that welcomed them');
    ok(e5.some(e => /\+WEMBLY VOSS ABOARD/.test(e.text)), 'outcome effects name the real join (+WEMBLY VOSS ABOARD)');

    // 6. A fight: Open Fire, then FTL escape.
    await mark(page);
    await page.evaluate(() => {
      Math.random = () => 0.5; STATE.resources.fuel = 60;
      enterEvent(STATE.byId[STATE.currentId], EVENTS.event_encounter_pirate_001);
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => { finishAllTyping(); handleChoiceClick(EVENTS.event_encounter_pirate_001.layers.intro.choices.find(c => c.text === 'Open Fire')); });
    await page.waitForTimeout(600);
    await page.evaluate(() => { const b = [...document.querySelectorAll('#enc-choices .enc-choice')].find(b => /ATTEMPT ESCAPE/.test(b.textContent)); b && b.click(); });
    await page.waitForFunction(() => document.getElementById('combat-end-overlay').classList.contains('show'), null, { timeout: 15000 }).catch(() => {});
    const fuelAfter = await page.evaluate(() => STATE.resources.fuel);
    const e6 = await sinceMark(page); run.push(...e6);
    const fch = e6.find(e => e.type === 'choice');
    const fight = e6.find(e => /Disengaged/.test(e.text));
    ok(fch && /Open Fire/.test(fch.text), 'fight: the choice that started it is logged — ' + (fch && fch.text));
    ok(fight && fight.type === 'event' && /−15 FUEL/.test(fight.text) && fuelAfter === 45 && (await voiceRe(page, 'fight_fled', 'rex')).test(fight.text), 'fight fled: REX voice + real −15 FUEL — ' + (fight && fight.text));
    await page.evaluate(() => { document.getElementById('combat-end-overlay').classList.remove('show'); advanceAfterEvent(); });

    // 7. Crop milestones (cruise checkCropMilestones on repaint).
    await mark(page);
    await page.evaluate(() => {
      STATE.cropGrowth.growth = 60; STATE.cropGrowth.lastTickDay = STATE.daysElapsed; renderCruise();
      STATE.cropGrowth.growth = 100; STATE.cropGrowth.lastTickDay = STATE.daysElapsed; renderCruise();
    });
    const e7 = await sinceMark(page); run.push(...e7);
    const fl = e7.find(e => /Growbay sitrep: Wheat at FLOWERING, 60%, health \d+/.test(e.text));
    const rd = e7.find(e => /Growbay: Wheat ready for harvest/.test(e.text));
    ok(fl && fl.voice === 'rex', 'crop milestone: FLOWERING at the real 60% — ' + (fl && fl.text));
    ok(rd && rd.expand && /THE REAL SCIENCE/.test(rd.expand.title) && /domesticated/.test(rd.expand.text), 'harvest-ready entry carries the crop\'s real_science page');

    // Order + days across the whole run.
    const days = run.map(e => e.day);
    ok(days.every((d, i) => !i || d >= days[i - 1]), 'days never run backwards across the run (' + days.join(',') + ')');
    const voicedNew = run.filter(e => e.voice);
    ok(voicedNew.length >= 12 && voicedNew.every(e => e.voice === 'rex'), voicedNew.length + ' voiced entries, all REX');
    console.log('    entry types in order: ' + run.map(e => (e.type || 'note')[0]).join(''));
  }

  console.log('— every AI voices the same choice in its own template');
  for (const ai of ['aria', 'marv', 'rex', 'chip', 'ajoy']) {
    await mark(page);
    await page.evaluate(ai => {
      STATE.activeAI = ai;
      const ev = EVENTS.event_crisis_012;
      enterEvent(STATE.byId[STATE.currentId], ev);
      handleChoiceClick(ev.choices.find(c => /condensation traps/.test(c.text)));
      advanceAfterEvent();
    }, ai);
    const e = await sinceMark(page);
    const c = e.find(x => x.type === 'choice'), o = e[e.indexOf(c) + 1];
    const reC = await voiceRe(page, 'choice', ai);
    const reO = [await voiceRe(page, 'outcome_good', ai), await voiceRe(page, 'outcome_bad', ai)];
    ok(c && c.voice === ai && reC.test(c.text) && o && reO.some(r => r.test(o.text)) && /H2O/.test(o.text), ai.toUpperCase() + ': ' + (c && c.text) + ' / ' + (o && o.text));
  }
  await page.evaluate(() => { STATE.activeAI = 'rex'; });

  console.log('— the journal (demo-shipslog layout)');
  {
    await page.evaluate(() => { returnToHub(); renderCruise(); openShipsLog(); });
    await page.waitForTimeout(450);
    const L = await page.evaluate(() => {
      const g = document.getElementById('game').getBoundingClientRect();
      const k = g.width / 960;
      const c = document.getElementById('slog-card');
      const r = c.getBoundingClientRect();
      const ov = getComputedStyle(document.getElementById('overlay-shipslog'));
      const rows = document.getElementById('slog-rows');
      const kids = [...rows.children];
      const dayNums = kids.filter(x => x.classList.contains('log-day')).map(x => +x.textContent.replace(/\D/g, ''));
      const led = t => { const e = rows.querySelector('.log-entry.' + t + ' .log-entry-led'); return e ? getComputedStyle(e).backgroundColor : null; };
      const firstRow = rows.querySelector('.log-entry .log-entry-text').textContent;
      const ai = document.querySelector('#cruise-aidialog').getBoundingClientRect();
      return {
        w: Math.round(r.width / k), h: Math.round(r.height / k), right: document.getElementById('game').clientWidth - (c.offsetLeft + c.offsetWidth), midY: Math.round(((r.top + r.bottom) / 2 - g.top) / k),
        overlapsAi: r.left < ai.right && r.right > ai.left, bg: ov.backgroundColor, paper: getComputedStyle(c).backgroundImage,
        border: getComputedStyle(c).borderTopColor + ' ' + getComputedStyle(c).borderTopWidth,
        dayNums, dayText: (kids.find(x => x.classList.contains('log-day')) || {}).textContent, dayRule: getComputedStyle(kids[0], '::before').borderTopStyle,
        rows: rows.querySelectorAll('.log-entry').length, logLen: STATE.shipLog.length,
        firstRow, firstLog: STATE.shipLog[0].text,
        atBottom: rows.scrollHeight - rows.scrollTop - rows.clientHeight < 4, scrollable: rows.scrollHeight > rows.clientHeight,
        leds: { choice: led('choice'), death: led('death'), event: led('event'), note: led('note') },
        meta: document.getElementById('slog-meta').textContent, footer: document.querySelector('#slog-card .log-footer').textContent.replace(/\s+/g, ' ').trim(),
        x: !!document.querySelector('#slog-card .log-header #slog-x'), title: document.querySelector('#slog-card .log-title').textContent,
        badges: [...rows.querySelectorAll('.log-entry-payload')].map(b => b.textContent),
        payloadCursor: getComputedStyle(rows.querySelector('.log-entry.has-payload')).cursor,
        textFont: getComputedStyle(rows.querySelector('.log-entry-text')).fontSize,
        sb: getComputedStyle(rows).scrollbarWidth, thumb: !!document.querySelector('#slog-rows-host .scroll-thumb'),
        shipName: STATE.shipName,
      };
    });
    ok(L.w === 340 && L.h === 540, `journal is 340×540 (${L.w}×${L.h})`);
    ok(L.right === 30 && Math.abs(L.midY - 320) <= 1, `docked right: 30px, vertically centred (right ${L.right}, mid ${L.midY})`);
    ok(L.overlapsAi, 'sits over the cruise AI-log column');
    ok(L.bg === 'rgba(4, 8, 16, 0.75)', 'backdrop rgba(4,8,16,0.75)');
    ok(/linear-gradient\(rgb\(232, 216, 160\).*rgb\(216, 200, 136\)/.test(L.paper) && L.border === 'rgb(90, 66, 38) 3px', 'parchment chrome (paper gradient, 3px brown edge)');
    ok(L.title === "SHIP'S LOG" && L.x, 'title + ✕ in the header');
    ok(L.meta === String(L.shipName).toUpperCase() + ' · MARS TRAIL', 'header sub-line SHIP · TRAIL: ' + L.meta);
    ok(/^VOICED BY REX · DAY \d+$/.test(L.footer), 'footer: ' + L.footer);
    ok(L.dayNums.length >= 3 && L.dayNums.every((d, i) => !i || d > L.dayNums[i - 1]) && /^DAY \d+$/.test(L.dayText) && L.dayRule === 'dashed', `── DAY N ── dividers, oldest first (${L.dayNums.join(',')})`);
    ok(L.rows === L.logLen && L.firstRow === L.firstLog.replace(/^\s*[◆▶]\s*/, ''), `flat lines, oldest first, one per entry (${L.rows}/${L.logLen})`);
    ok(L.scrollable && L.atBottom, 'auto-scrolled to the latest entry');
    ok(L.leds.choice === 'rgb(47, 106, 63)' && L.leds.death === 'rgb(160, 40, 40)' && L.leds.event === 'rgb(90, 66, 38)' && L.leds.note === 'rgb(138, 115, 80)', 'LEDs: CHOICE green, DEATH red, EVENT brown, NOTE slate — ' + JSON.stringify(L.leds));
    ok(L.badges.includes('🔗') && L.badges.includes('📖'), 'trailing 🔗 / 📖 badges');
    ok(L.payloadCursor !== 'auto' && L.payloadCursor !== 'default', 'payload rows are clickable (hand cursor)');
    ok(L.textFont === '17px' && L.sb === 'none' && L.thumb, 'VT323 17px lines, custom scrollbar');
    await page.evaluate(() => { const r = document.getElementById('slog-rows'); r.scrollTop = r.scrollHeight; });
    await shot(page, 'log_journal');

    // Memorial page.
    const M = await page.evaluate(async () => {
      const row = [...document.querySelectorAll('#slog-rows .log-entry.death')][0];
      row.click();
      await new Promise(r => setTimeout(r, 350));
      const card = document.getElementById('slog-expand-card');
      const p = card.querySelector('.slog-portrait');
      const spr = p && p.querySelector('.cd-portrait-sprite');
      return {
        open: window.shipsLogExpandOpen(), death: card.classList.contains('death-mode'), bg: getComputedStyle(card).backgroundImage,
        title: document.getElementById('slog-expand-title').textContent, titleColor: getComputedStyle(document.getElementById('slog-expand-title')).color,
        x: !!card.querySelector('.expand-header #slog-expand-close'),
        portrait: p ? { w: p.offsetWidth, h: p.offsetHeight, filter: getComputedStyle(p).filter, sprite: !!spr } : null,
        meta: card.querySelector('.slog-death-meta').innerText.replace(/\s+/g, ' ').trim(),
        body: document.getElementById('slog-expand-body').innerText, paras: document.querySelectorAll('#slog-expand-body p').length,
        w: card.offsetWidth,
      };
    });
    ok(M.open && M.death && /rgb\(26, 22, 32\)/.test(M.bg), 'death row opens the dark memorial chrome');
    ok(M.title === 'KAZUKI — KIA' || /KIA$/.test(M.title), 'expand title bar in REX\'s memorial title: ' + M.title);
    ok(M.titleColor === 'rgb(200, 144, 80)' && M.x, 'ember title + ✕ in the expand header');
    ok(M.portrait && M.portrait.w === 50 && M.portrait.h === 120 && M.portrait.sprite && /grayscale/.test(M.portrait.filter), 'full-figure 50×120 desaturated portrait');
    ok(/^IN MEMORIAM \S/.test(M.meta) && /DAY \d+ · MARS TRAIL$/.test(M.meta), 'IN MEMORIAM · NAME · DAY · TRAIL: ' + M.meta);
    ok(M.paras >= 4 && /Lost on day/.test(M.body) && M.w === 600, `memorial body is the long text (${M.paras} paragraphs), 600px page`);
    await shot(page, 'log_memorial');
    // Esc peels the memorial first, then the log.
    await page.keyboard.press('Escape'); await page.waitForTimeout(80);
    const esc1 = await page.evaluate(() => ({ exp: window.shipsLogExpandOpen(), log: document.getElementById('overlay-shipslog').classList.contains('active') }));
    ok(!esc1.exp && esc1.log, 'Esc closes the memorial only');

    // Lore page: parchment.
    const P = await page.evaluate(async () => {
      const row = [...document.querySelectorAll('#slog-rows .log-entry')].find(r => /hydrogen/i.test(r.textContent));
      row.click();
      await new Promise(r => setTimeout(r, 350));
      const card = document.getElementById('slog-expand-card');
      return { death: card.classList.contains('death-mode'), head: !!card.querySelector('.slog-death-header'), bg: getComputedStyle(card).backgroundImage, title: document.getElementById('slog-expand-title').textContent, paras: document.querySelectorAll('#slog-expand-body p').length };
    });
    ok(!P.death && !P.head && /rgb\(232, 216, 160\)/.test(P.bg) && P.title === 'GAS ANALYZER PRINTOUT' && P.paras >= 4, 'lore row opens the parchment page with the authored title + paragraphs');
    await shot(page, 'log_lore');
    await page.keyboard.press('Escape'); await page.waitForTimeout(60);
    await page.keyboard.press('Escape'); await page.waitForTimeout(350);
    ok(!(await page.evaluate(() => document.getElementById('overlay-shipslog').classList.contains('active'))), 'second Esc closes the log');
  }

  console.log('— cruise column agrees with the journal');
  {
    const C = await page.evaluate(() => {
      rebuildCruiseLog(8);
      const col = [...document.querySelectorAll('#ai-log .ai-entry')].map(e => e.textContent);
      const tail = STATE.shipLog.slice(-8).map(e => e.text.replace(/^\s*[◆▶]\s*/, ''));
      // b4 (demo-cruise .has-payload): the whole entry is clickable, 📖 at its end.
      const pe = [...document.querySelectorAll('#ai-log .ai-entry.has-payload')].find(e => { const i = e.querySelector('.ai-entry-payload'); return i && i.textContent === '\u{1F4D6}' && e.lastElementChild === i; });
      return { col, tail, book: !!pe };
    });
    ok(C.tail.every((t, i) => C.col[i] && C.col[i].includes(t)), 'the column\'s lines are the journal\'s latest entries');
    ok(C.book, 'the column shows 📖 on entries with a page');
    // Live push lands in both.
    const live = await page.evaluate(() => { window.pushCruiseLog('◆ Test line for both surfaces.'); return { log: STATE.shipLog.slice(-1)[0].text, col: [...document.querySelectorAll('#ai-log .ai-entry')].slice(-1)[0].textContent }; });
    ok(live.log === '◆ Test line for both surfaces.' && /Test line for both surfaces/.test(live.col), 'a live line lands in the column and the journal');
  }

  console.log('— save / load keeps the whole journal');
  {
    const S = await page.evaluate(() => {
      const before = JSON.stringify(STATE.shipLog);
      const saved = saveRun();
      const raw = localStorage.getItem('transplant_save_v1') || '';
      return { saved, n: STATE.shipLog.length, before, logBytes: before.length, saveBytes: raw.length };
    });
    ok(S.saved, 'saved at the hub');
    await page.reload();
    await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && window.ShipLog);
    const R = await page.evaluate(() => { loadRun(); openShipsLog(); return { after: JSON.stringify(STATE.shipLog), rows: document.querySelectorAll('#slog-rows .log-entry').length, deaths: document.querySelectorAll('#slog-rows .log-entry.death').length }; });
    ok(R.after === S.before, `reload keeps every entry byte-for-byte (${S.n} entries)`);
    ok(R.rows === S.n && R.deaths === 1, 'journal re-renders the whole record after the reload');
    console.log(`    size: shipLog ${S.logBytes} bytes for ${S.n} entries (${Math.round(S.logBytes / S.n)} B/entry); whole save ${S.saveBytes} bytes`);
    // Compaction: plain system lines go first; voiced, deaths, payloads stay.
    const K = await page.evaluate(() => {
      const keep = STATE.shipLog.filter(e => e.voice || e.type || e.expand || e.link).length;
      for (let i = 0; i < 700; i++) window.pushCruiseLog('◆ Filler line ' + i + ' about the hum of the engines.');
      const log = STATE.shipLog;
      return { n: log.length, kept: log.filter(e => e.voice || e.type || e.expand || e.link).length, keep, death: log.some(e => e.type === 'death'), bytes: JSON.stringify(log).length, nulls: log.some(e => Object.values(e).some(v => v === null)) };
    });
    ok(K.n === 600 && K.kept === K.keep && K.death, `capped at 600 entries; all ${K.keep} records/deaths/payloads kept`);
    ok(!K.nulls, 'stored entries carry no empty fields');
    console.log(`    capped journal: ${K.bytes} bytes at 600 entries`);
  }
  await page.close();

  console.log('— airlock death keeps its line and gets the memorial');
  {
    const p2 = await boot({ crew: ['engineer', 'pilot'] });
    const J = await p2.evaluate(async () => {
      const n = STATE.nodes.find(x => x.node_type === 'asteroid_field' || x.node_type === 'deep_space');
      if (n) STATE.currentId = n.id;
      renderCruise();
      openCrewDetail('pilot');
      await new Promise(r => setTimeout(r, 400));
      document.getElementById('cd-dismiss-btn').click(); document.getElementById('cd-confirm-ok').click();
      await new Promise(r => setTimeout(r, 2400));
      return STATE.shipLog.slice(-1)[0];
    });
    const isJettison = J && /jettisoned/.test(J.text);
    ok(!isJettison || (J.type === 'death' && J.crewId === 'reeves' && J.expand && /out the airlock/.test(J.expand.text)), 'airlock death: memorial page with the cause' + (isJettison ? '' : ' (safe dismissal here — not a death)'));
    await p2.close();
  }

  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

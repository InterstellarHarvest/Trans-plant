// Batch 4 (final re-audit), minigames / mining / engine repair / endings:
//  A1 engine-room REPAIR: a reload after the first fault is cleared is a
//     quit (day spent, abandoned line, effort tax kept); before it, a free
//     cancel.
//  A2 failure reports carry no score extras.
//  B1 mining AI-bar status upright; B2 MINING MODE chip shown, no dead
//     200px padding; B3 the haul card's SESSION row is this session's runs;
//     CRT: screen-mining.css no longer restyles the game-wide #crt-overlay.
//  B5 MEDICAL 'fedup' stays WALKED OUT (ABANDONED = a player quit).
//  B6 alien-world forage poison = ruling 3 medium (20 HP; solo −12 food).
//  31 end report = the demo card (stinger, one line, quote, Run Report in
//     view), module paragraphs behind READ THE COLONY REPORT; hull-zero one
//     sentence; every failure in its own colour (captain_lost included).
//  38 engine_fault crisis → the Simon ENGINE REPAIR minigame, played for real.
//  45 hull-breach OXYGEN bar pale ice, orange/red low-O2 warnings kept.
//  46b nothing presents the unbuilt asteroid_mining wrapper as real.
const { chromium } = require('playwright'); // Firefox: pw_firefox_shim.js (PW_BROWSER=firefox)
const URL = process.env.URL || 'http://localhost:8185/index.html';
const SHOTS = process.env.SHOTS || null;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
let browser;
const errors = [];
async function open() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster && MOD.flavor && MOD.failures);
  await page.evaluate(() => localStorage.removeItem('transplant_save_v1'));
  return page;
}
async function boot(setup) {
  const page = await open();
  await page.evaluate(o => {
    applySetupToState(Object.assign({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer', 'pilot'], crop: 'wheat', ship: 'D' }, o));
    STATE.stowaway = null;
  }, setup || {});
  await page.waitForTimeout(200);
  return page;
}
async function reloadAndContinue(page) {
  await page.reload();
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.flavor);
  await page.evaluate(() => loadRun());
  await page.waitForTimeout(400);
}
const shot = async (page, name) => { if (SHOTS) await page.locator('#game').screenshot({ path: SHOTS + '/' + name + '.png' }); };
// A plain (non-fork, non-station) stop for hub verbs; never depends on map luck.
const toPlainStop = page => page.evaluate(() => {
  let n = STATE.nodes.find(x => x.node_type !== 'fork' && x.node_type !== 'station' && connectionsOf(x).length > 0);
  if (!n) { n = STATE.nodes.find(x => connectionsOf(x).length > 0); n.node_type = 'asteroid_field'; }
  STATE.currentId = n.id; STATE.currentEvent = null; STATE.stationVisit = null;
  returnToHub(); renderCruise();
  return n.id;
});

(async () => {
  browser = await chromium.launch();

  // ── A1 ────────────────────────────────────────────────────────
  console.log('— A1: engine-room REPAIR — reload mid-repair is a quit, untouched is a free cancel');
  {
    const page = await boot();
    await toPlainStop(page);
    const openRepair = () => page.evaluate(async () => {
      document.body.classList.remove('stop-active'); document.getElementById('stop-btn').click();
      await new Promise(r => setTimeout(r, 80));
      const b = [...document.querySelectorAll('#stop-choices .stop-choice')].find(x => /^REPAIR/.test(x.querySelector('.stop-choice-body').textContent));
      if (!b || b.classList.contains('locked')) return null;
      b.click();
      return true;
    });
    await page.evaluate(() => { STATE.resources.hull = 50; STATE.materials.metal = 4; STATE.materials.scrap = 2; setCrewMorale(70); saveRun(); });
    ok(await openRepair(), 'REPAIR offered (hull 50, 4 metal + 2 scrap)');
    await page.waitForFunction(() => document.getElementById('overlay-engrepair').classList.contains('active'));
    const c0 = await page.evaluate(async () => {
      const taxed = crewMoraleRaw(), day = STATE.daysElapsed;
      document.getElementById('er-ec-abandon').click(); // nothing fixed yet
      await new Promise(r => setTimeout(r, 150));
      return { taxed, day, refunded: crewMoraleRaw(), dayAfter: STATE.daysElapsed, open: document.getElementById('overlay-engrepair').classList.contains('active') };
    });
    ok(c0.taxed < 70 && c0.refunded === 70 && c0.dayAfter === c0.day && !c0.open, `walking out before any fault is fixed: free cancel (tax ${c0.taxed} → ${c0.refunded}, day ${c0.day} → ${c0.dayAfter})`);
    ok(await openRepair(), 'REPAIR again');
    await page.waitForFunction(() => document.getElementById('overlay-engrepair').classList.contains('active'));
    const r1 = await page.evaluate(async () => {
      const saved0 = localStorage.getItem('transplant_save_v1') || '';
      document.getElementById('er-hs-breaker').click();
      await new Promise(r => setTimeout(r, 100));
      for (const id of ['B1', 'B2', 'B3', 'B4']) document.getElementById('er-br-' + id).click();
      return { saved0: /pendingAbandon/.test(saved0) };
    });
    await page.waitForFunction(() => document.getElementById('er-hs-breaker').classList.contains('fixed'));
    const r2 = await page.evaluate(() => ({ day: STATE.daysElapsed, morale: crewMoraleRaw(), hull: STATE.resources.hull, metal: STATE.materials.metal, scrap: STATE.materials.scrap,
      pend: (() => { try { return JSON.parse(localStorage.getItem('transplant_save_v1')).pendingAbandon || null; } catch (e) { return null; } })() }));
    ok(!r1.saved0 && r2.pend && r2.pend.verb === 'REPAIR', `the first cleared fault saves the job as begun (pendingAbandon ${JSON.stringify(r2.pend)})`);
    await reloadAndContinue(page);
    const r3 = await page.evaluate(() => ({ day: STATE.daysElapsed, morale: crewMoraleRaw(), hull: STATE.resources.hull, metal: STATE.materials.metal, scrap: STATE.materials.scrap,
      log: (STATE.shipLog || []).slice(-3).map(e => e.text).join(' | '), open: document.getElementById('overlay-engrepair').classList.contains('active') }));
    ok(r3.day === r2.day + 1, `reload mid-repair: the day is spent (${r2.day} → ${r3.day})`);
    ok(r3.morale === r2.morale && r3.morale < 70, `…the effort tax stands (morale ${r3.morale}, was 70 before the click)`);
    ok(r3.hull === 50 && r3.metal === 4 && r3.scrap === 2, `…nothing kept: hull ${r3.hull}, metal ${r3.metal}, scrap ${r3.scrap} (unspent)`);
    ok(/REPAIR — abandoned partway/.test(r3.log) && !r3.open, 'abandoned line in the log, back at the hub');
    await page.close();
  }

  // ── A2 + ruling 31 ───────────────────────────────────────────
  console.log('— ruling 31: the end report is the demo card; A2: no score extras on a failure');
  {
    const page = await boot({ crop: 'wheat' });
    const card = (bracket, trail, crop) => page.evaluate(async ({ bracket, trail, crop }) => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      STATE.trail = trail; STATE.crop = crop; STATE.cropGrowth.health = 90; STATE.soilSurveys = 2;
      for (const f of Object.keys(MOD.flavor.flag_payoffs || {}).slice(0, 8)) STATE.flags.add(f);
      const real = window.scoreBracket; window.scoreBracket = () => bracket;
      STATE.ended = false;
      window.renderEndScreen({ kind: 'ending', module: MOD.endings[0] });
      window.scoreBracket = real;
      await w(450);
      window.showEndReport();
      await w(700); // card rise
      const $ = id => document.getElementById(id);
      const rect = el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, h: r.height, w: r.width }; };
      const vis = el => el && getComputedStyle(el).display !== 'none' && !el.closest('[hidden]') && el.getBoundingClientRect().height > 0;
      const g = rect($('game')), c = rect($('end-report-card')), sc = $('end-report-scroll');
      const scale = $('game').getBoundingClientRect().width / 960;
      const inCard = el => { const r = rect(el); return r.top >= c.top - 1 && r.bottom <= c.bottom + 1; };
      const sv = document.getElementById('screen-end');
      const tok = getComputedStyle(sv).getPropertyValue('--tier-' + bracket + '-color').trim();
      const out = {
        title: $('end-report-title').textContent, titleColor: getComputedStyle($('end-report-title')).color, tok,
        lead: $('end-report-arrival').textContent, wantLead: ((MOD.endingLines.arrival_lines || {})[trail] || {})[crop],
        quote: $('end-report-quote').textContent, wantQuote: MOD.endingLines.tier_quotes[bracket],
        visible: ['end-report-title', 'end-report-arrival', 'end-report-quote', 'end-report-score', 'end-report-more'].every(id => vis($(id)) && inCard($(id))),
        actions: [...document.querySelectorAll('#end-report-actions .end-btn')].every(b => vis(b) && inCard(b)),
        noScroll: sc.scrollHeight <= sc.clientHeight + 1,
        cardW: Math.round(c.w / scale), cardH: Math.round(c.h / scale), inFrame: c.top >= g.top && c.bottom <= g.bottom,
        fullHidden: !vis($('end-report-full')) && !vis($('end-report-body')),
        body: $('end-report-body').textContent, moduleTitle: MOD.endings[0].title,
        more: $('end-report-more').textContent, extras: !!document.querySelector('#end-day-line .score-extras'),
        recordInFull: !!$('end-report-full').querySelector('.end-record-line'), recordVisible: [...document.querySelectorAll('#end-report .end-record-line')].some(vis),
      };
      $('end-report-more').click(); await w(80);
      out.open = { full: vis($('end-report-full')), title: $('end-report-full-title').textContent, titleVis: vis($('end-report-full-title')), bodyVis: vis($('end-report-body')),
        record: [...$('end-report-full').querySelectorAll('.end-record-line')].some(vis), more: $('end-report-more').textContent, aria: $('end-report-more').getAttribute('aria-expanded'),
        scrolled: sc.scrollTop > 0 || sc.scrollHeight <= sc.clientHeight + 1, actions: [...document.querySelectorAll('#end-report-actions .end-btn')].every(b => vis(b) && rect(b).bottom <= g.bottom + 1) };
      $('end-report-more').click(); await w(50);
      out.closedAgain = !vis($('end-report-full')) && /^READ THE COLONY REPORT/.test($('end-report-more').textContent);
      $('end-report-more').click(); await w(30);
      window.endBackToCinematic(); window.showEndReport(); await w(30);
      out.resetOnReopen = !vis($('end-report-full'));
      return out;
    }, { bracket, trail, crop });

    const r = await card('good', 'mars', 'wheat');
    ok(r.title === 'MOSTLY\nMADE IT', `title is the tier stinger, not the module title (${JSON.stringify(r.title)})`);
    ok(r.tok && r.titleColor === (await page.evaluate(t => { const d = document.createElement('div'); d.style.color = t; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; }, r.tok)), `…in the tier colour (${r.titleColor} = --tier-good-color ${r.tok})`);
    ok(r.lead === r.wantLead && !!r.wantLead, `one arrival line leads ("${(r.lead || '').slice(0, 40)}…")`);
    ok(r.quote === r.wantQuote, 'the tier quote under it');
    ok(r.visible && r.actions, 'title, line, quote, Run Report, expander and Back / New Run all visible inside the card');
    ok(r.noScroll && r.inFrame, `no scrolling needed (card ${r.cardW}×${r.cardH} in the 960×640 frame)`);
    ok(r.cardW === 600 && r.cardH <= 470, `demo card size: 600 wide, ${r.cardH} tall (demo ≈ 400 + the expander row)`);
    ok(r.fullHidden && /Arrival is procedural|colony/i.test(r.body), 'the module paragraphs are there but folded away');
    ok(r.more === 'READ THE COLONY REPORT ▾', `expander reads "${r.more}"`);
    ok(r.recordInFull && !r.recordVisible, "the Ship's Record folds away with the report");
    ok(r.open.full && r.open.bodyVis && r.open.titleVis && r.open.title === r.moduleTitle, `READ THE COLONY REPORT opens "${r.open.title}" and its paragraphs`);
    ok(r.open.record && r.open.aria === 'true' && /^HIDE THE COLONY REPORT/.test(r.open.more), `…with the Ship's Record; button now "${r.open.more}"`);
    ok(r.open.scrolled && r.open.actions, 'opened: the report scrolls into view, Back / New Run stay in the frame');
    ok(r.closedAgain && r.resetOnReopen, 'it folds back, and every visit to the report starts folded');
    ok(r.extras, 'arrival with soil surveys: SOIL SURVEYS extras show (score counts them)');
    await page.waitForTimeout(900); // the reopened card's fade + rise
    await shot(page, 'eng_end_mars_wheat_good_report');
    const r2 = await card('legendary', 'lunar', 'sweet_potato');
    ok(r2.title === 'MADE IT' && r2.lead === r2.wantLead && r2.visible && r2.noScroll, `lunar sweet potato legendary: MADE IT, its line, all in view (${r2.cardW}×${r2.cardH})`);
    await page.waitForTimeout(900);
    await shot(page, 'eng_end_lunar_potato_legendary_report');

    // Failures: every failure module renders in its own colour; reports lead
    // with the first paragraph; no score extras (A2).
    const fails = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      const $ = id => document.getElementById(id);
      const vis = el => el && getComputedStyle(el).display !== 'none' && !el.closest('[hidden]') && el.getBoundingClientRect().height > 0;
      const toRgb = t => { const d = document.createElement('div'); d.style.color = t; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
      const mods = MOD.failures.slice();
      // captain_lost "Command Vacant" lands with the crew batch (owner rulings
      // 29/30/48); render it from its module when present, else a stand-in.
      if (!mods.some(f => f.failure_type === 'captain_lost')) mods.push({ id: 'failure_captain_lost_standin', failure_type: 'captain_lost', title: 'Command Vacant', body: 'The captain is dead.\n\nThe crew hold a meeting in the galley.', epitaph: 'The captain\'s chair stayed empty.' });
      const out = [];
      STATE.soilSurveys = 3;
      for (const f of mods) {
        STATE.ended = false;
        window.renderEndScreen({ kind: 'failure', module: f });
        await w(60);
        const sv = $('screen-end');
        const tok = getComputedStyle(sv).getPropertyValue('--fail-' + f.failure_type + '-color').trim();
        const border = getComputedStyle(sv).getPropertyValue('--fail-' + f.failure_type + '-border').trim();
        const o = { type: f.failure_type, title: f.title, tok, border, cine: getComputedStyle($('end-cine-title')).color, want: tok ? toRgb(tok) : null, btn: $('end-cine-btn').textContent,
          cineBody: vis($('end-cine-body')) ? $('end-cine-body').textContent : null, cineQuote: vis($('end-cine-quote')) ? $('end-cine-quote').textContent : null };
        if (o.btn === 'View Report') {
          window.showEndReport(); await w(60);
          const paras = f.body.split(/\n\s*\n/);
          o.report = { title: $('end-report-title').textContent, color: getComputedStyle($('end-report-title')).color, lead: $('end-report-arrival').textContent, wantLead: paras[0].trim(),
            leadVis: vis($('end-report-arrival')), rest: $('end-report-body').textContent, wantRest: paras.slice(1).join('\n\n').trim(), more: $('end-report-more').textContent,
            extras: !!document.querySelector('#end-day-line .score-extras'), dayLine: $('end-day-line').textContent, cardBorder: getComputedStyle($('end-report-card')).borderTopColor, wantBorder: border ? toRgb(border) : null,
            quote: $('end-report-quote').textContent };
        }
        out.push(o);
      }
      return out;
    });
    const names = fails.map(f => f.type).join(', ');
    ok(fails.every(f => f.tok && f.cine === f.want), `every failure's cinematic title wears its own --fail-* colour (${names})`);
    ok(new Set(fails.map(f => f.want)).size === fails.length, 'no two failures share a colour');
    const cl = fails.find(f => f.type === 'captain_lost');
    ok(cl && cl.want === 'rgb(180, 120, 140)' && cl.btn === 'View Report', `captain_lost "Command Vacant": muted rose ${cl && cl.want}, with a report`);
    ok(cl && cl.report && cl.report.color === cl.want && cl.report.cardBorder === cl.report.wantBorder, 'captain_lost report title + card border in its colour');
    const hz = fails.find(f => f.type === 'hull_zero');
    ok(hz && hz.btn === 'New Run' && hz.cineBody === 'The hull came apart between heartbeats.' && !/\.\s+\S/.test(hz.cineBody), `hull-zero: one dry sentence on the cinematic ("${hz && hz.cineBody}")`);
    ok(hz && hz.cineQuote && /^— /.test(hz.cineQuote), 'hull-zero: + its quote (the epitaph)');
    const cg = fails.find(f => f.type === 'crew_gone');
    ok(cg && cg.btn === 'New Run' && cg.cineBody && /^Autopilot$/i.test(cg.title), 'crew_gone "Autopilot" stays cinematic-only (captain died alone)');
    const reps = fails.filter(f => f.report);
    ok(reps.length >= 5 && reps.every(f => f.report.color === f.want && f.report.cardBorder === f.report.wantBorder), `failure reports in their colours (${reps.map(f => f.type).join(', ')})`);
    ok(reps.every(f => f.report.lead === f.report.wantLead && f.report.leadVis && f.report.rest === f.report.wantRest), 'failure reports lead with the first paragraph; the rest is behind the expander');
    ok(reps.every(f => /^READ THE FULL REPORT/.test(f.report.more) || !f.report.wantRest), 'failure expander reads READ THE FULL REPORT');
    ok(reps.every(f => !f.report.extras && /THE VOYAGE ENDED HERE/.test(f.report.dayLine)), 'A2: no SOIL SURVEYS / CROP BONUS extras on any failure report (soil surveys = 3)');
    await page.evaluate(async () => { STATE.ended = false; window.renderEndScreen({ kind: 'failure', module: MOD.failures.find(f => f.failure_type === 'hull_zero') }); await new Promise(r => setTimeout(r, 900)); });
    await shot(page, 'eng_end_hull_zero_cine');
    await page.evaluate(async () => { STATE.ended = false; window.renderEndScreen({ kind: 'failure', module: MOD.failures.find(f => f.failure_type === 'mutiny') }); await new Promise(r => setTimeout(r, 300)); window.showEndReport(); await new Promise(r => setTimeout(r, 700)); });
    await shot(page, 'eng_end_mutiny_report');
    await page.close();
  }

  // ── B1 / B2 / B3 / CRT ───────────────────────────────────────
  console.log('— mining: upright status, MINING MODE chip, SESSION row, scanlines');
  {
    const page = await boot({ crew: ['engineer', 'pilot'] });
    await toPlainStop(page);
    await page.evaluate(() => { STATE.miningLifetime = { runs: 9, totalCracks: 80, totalMaterials: 120, totalHollows: 4, totalFragmentsLost: 3, bestChainEver: 9, bestTier: 'perfect' }; window.__haul = null; openMining(h => { window.__haul = h; }); });
    await page.waitForFunction(() => document.getElementById('overlay-mining').classList.contains('active') && document.querySelector('#mining-choices .crew-chip'));
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => {
      const $ = id => document.getElementById(id);
      const bar = document.querySelector('#mining-root .enc-ai-bar'), chip = document.querySelector('#mining-root .mining-mode-tag'), sector = $('sector-tag'), text = $('mining-ai-text');
      const R = el => el.getBoundingClientRect();
      const hud = document.querySelector('#mining-root .enc-resources') || $('hud-mining');
      const crt = $('crt-overlay'), ov = $('overlay-mining');
      const crtCss = getComputedStyle(crt);
      const miningRules = [...document.styleSheets].filter(s => /screen-mining\.css/.test(s.href || '')).flatMap(s => { try { return [...s.cssRules]; } catch (e) { return []; } }).filter(r => /crt-overlay/.test(r.selectorText || ''));
      const sameParent = crt.parentNode === ov.parentNode;
      return {
        style: getComputedStyle(text).fontStyle, text: text.textContent,
        chipDisp: getComputedStyle(chip).display, chipW: R(chip).width, chipIn: R(chip).left >= R(bar).left && R(chip).right <= R(bar).right + 0.5,
        sectorVis: !sector.hidden && R(sector).width > 0, sectorIn: sector.hidden || R(sector).right <= R(bar).right + 0.5,
        order: chip.compareDocumentPosition(sector) & Node.DOCUMENT_POSITION_FOLLOWING ? 'chip-then-sector' : 'other',
        hudClear: !hud || R(bar).right <= R(hud).left + 0.5, padR: getComputedStyle(bar).paddingRight, right: getComputedStyle(bar).right,
        crtBg: crtCss.backgroundImage, crtZ: crtCss.zIndex, ovZ: getComputedStyle(ov).zIndex, sameParent, miningRules: miningRules.length,
      };
    });
    ok(m.style === 'normal', `B1: AI-bar status text upright (font-style ${m.style}; "${m.text}")`);
    ok(m.chipDisp !== 'none' && m.chipW > 40 && m.chipIn, `B2: MINING MODE chip shown inside the AI bar (${Math.round(m.chipW)}px)`);
    ok(m.sectorVis && m.sectorIn && m.order === 'chip-then-sector', 'B2: …followed by the SECTOR chip, both inside the bar');
    ok(m.padR === '12px' && m.right === '200px' && m.hudClear, `B2: no dead 200px padding (padding-right ${m.padR}); the bar still stops short of the HUD (right ${m.right})`);
    ok(m.miningRules === 0, 'screen-mining.css no longer carries an unscoped #crt-overlay rule');
    ok(/rgba\(0, 0, 0, 0\.06\)/.test(m.crtBg) && m.crtZ === '200' && (!m.sameParent || +m.ovZ < 200), `scanlines over mining = the demo-mining value (0.06, game-wide overlay z ${m.crtZ} over the mining overlay z ${m.ovZ})`);
    await shot(page, 'eng_mining_armed');
    // Two runs in one session: BEGIN → EXIT MINING → MINE AGAIN → BEGIN → EXIT MINING.
    const run = () => page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      document.querySelector('#mining-choices .crew-chip').click(); await w(50);
      const begin = [...document.querySelectorAll('#mining-choices .enc-choice')].find(b => /BEGIN/.test(b.textContent));
      begin.click(); await w(400);
      [...document.querySelectorAll('#mining-choices .enc-choice')].find(b => /EXIT MINING/.test(b.textContent)).click();
    });
    await run();
    await page.waitForFunction(() => document.getElementById('haul-overlay').classList.contains('visible'));
    const first = await page.evaluate(() => !!document.querySelector('#haul-overlay .haul-session-label'));
    ok(!first, 'first run of the session: no SESSION row (it would repeat the run)');
    await page.evaluate(() => [...document.querySelectorAll('#haul-overlay .haul-btn')].find(b => /MINE AGAIN/.test(b.textContent)).click());
    await page.waitForFunction(() => document.querySelector('#mining-choices .crew-chip'));
    await run();
    await page.waitForFunction(() => document.getElementById('haul-overlay').classList.contains('visible'));
    await page.waitForTimeout(250);
    const s = await page.evaluate(() => {
      const lab = document.querySelector('#haul-overlay .haul-session-label');
      const vals = [...document.querySelectorAll('#haul-overlay .haul-stats.session .val')].map(v => v.textContent);
      return { label: lab && lab.textContent, vals, life: STATE.miningLifetime.runs };
    });
    ok(s.label === '— SESSION · 2 RUNS —', `B3: SESSION row counts this session's runs ("${s.label}", voyage total ${s.life})`);
    ok(s.vals.length === 4 && +s.vals[1] < 120, `B3: …and its numbers are this session's, not the voyage's (${s.vals.join(' / ')})`);
    await shot(page, 'eng_mining_haul');
    await page.evaluate(() => [...document.querySelectorAll('#haul-overlay .haul-btn')].find(b => /RETURN TO SHIP/.test(b.textContent)).click());
    await page.waitForFunction(() => window.__haul);
    const h = await page.evaluate(() => window.__haul.summary);
    ok(/11 runs this voyage/.test(h), `the voyage totals (saved miningLifetime) ride the MINE log line: "${h}"`);
    await page.close();
  }

  // ── B5 / B6 ──────────────────────────────────────────────────
  console.log('— B5 WALKED OUT kept; B6 alien forage poison = ruling 3 medium');
  {
    const page = await boot({ crew: ['engineer', 'pilot'] });
    const src = await page.evaluate(async () => (await (await fetch('engine/js/minigames.js')).text()));
    ok(/fedup:'WALKED OUT'/.test(src) && /ABANDONED is now the\s*\/\/\s*player's own QUIT/.test(src.replace(/\n\s*/g, '\n  ')), 'MEDICAL fedup reads WALKED OUT, and the code says why (ABANDONED = a player quit)');
    const quitTitle = await page.evaluate(async () => (await (await fetch('index.html')).text()).includes("renderOutcomeView({ title: 'ABANDONED'"));
    ok(quitTitle, '…the event quit outcome is the one titled ABANDONED');
    const r = await page.evaluate(() => {
      let planet = STATE.nodes.find(n => n.node_type === 'planet');
      if (!planet) { planet = STATE.nodes.find(n => n.node_type !== 'fork' && n.node_type !== 'station' && connectionsOf(n).length > 0); planet.node_type = 'planet'; }
      let seed = null;
      for (let s = 1; s < 600 && seed == null; s++) { STATE.artSeed = s; SceneArt.clearRunCaches(); if (SceneArt.biomeFor(null, planet) === 'alien') seed = s; }
      if (seed == null) return { none: true };
      STATE.artSeed = seed; SceneArt.clearRunCaches(); STATE.currentId = planet.id; STATE.traderAt = {};
      const go = () => {
        document.body.classList.remove('stop-active'); renderCruise(); document.getElementById('stop-btn').click();
        const rnd = Math.random; Math.random = () => 0.1;
        const real = window.openMinigame; window.openMinigame = (id, o, cb) => cb('good', { food: 10 });
        STATE.crew.forEach(c => { STATE.crewHP[c] = 90; });
        const hp0 = STATE.crew.map(crewHPOf).reduce((a, b) => a + b, 0), f0 = STATE.resources.food;
        [...document.querySelectorAll('#stop-choices .stop-choice')].find(b => /FORAGE/.test(b.textContent)).click();
        Math.random = rnd; window.openMinigame = real;
        return { hurt: hp0 - STATE.crew.map(crewHPOf).reduce((a, b) => a + b, 0), food: STATE.resources.food - f0, log: STATE.shipLog.slice(-1)[0].text };
      };
      STATE.resources.food = 50;
      return { crew: go() };
    });
    if (r.none) ok(true, 'no alien biome reachable on this map (skipped)');
    else {
      ok(r.crew.hurt === 20 && /−20 HP/.test(r.crew.log), `alien FORAGE poison: −20 HP, the medium of 10/20/35 (got −${r.crew.hurt}; "${r.crew.log.slice(-70)}")`);
    }
    const c = await page.evaluate(async () => (await (await fetch('engine/js/screens/cruise.js')).text()).match(/ALIEN_POISON_HP = [^,;]+/)[0]);
    ok(c === 'ALIEN_POISON_HP = 20', `the constant is ruling 3's medium (${c})`);
    await page.close();
  }

  // ── ruling 45 ────────────────────────────────────────────────
  console.log('— ruling 45: hull-breach OXYGEN bar pale ice, orange/red low-O2 warnings kept');
  {
    const page = await boot();
    await page.evaluate(() => { STATE.resources.o2 = 80; openMinigame('breach', {}, () => {}); });
    await page.waitForFunction(() => document.getElementById('rstart'));
    await page.evaluate(() => document.getElementById('rstart').click());
    await page.waitForFunction(() => document.getElementById('bcr-o2fill'));
    const c0 = await page.evaluate(() => getComputedStyle(document.getElementById('bcr-o2fill')).backgroundColor);
    ok(c0 === 'rgb(184, 230, 238)', `OXYGEN bar starts pale ice #b8e6ee (${c0})`);
    await shot(page, 'eng_breach_play');
    // Leave the holes open: the drain walks the bar through its warnings.
    let orange = false, red = false;
    try { await page.waitForFunction(() => getComputedStyle(document.getElementById('bcr-o2fill')).backgroundColor === 'rgb(232, 136, 48)', null, { timeout: 30000, polling: 100 }); orange = true; } catch (e) {}
    try { await page.waitForFunction(() => getComputedStyle(document.getElementById('bcr-o2fill')).backgroundColor === 'rgb(204, 51, 51)', null, { timeout: 30000, polling: 100 }); red = true; } catch (e) {}
    const pal = await page.evaluate(() => ({ orange: getComputedStyle(document.getElementById('overlay-minigames')).getPropertyValue('--orange').trim(), red: getComputedStyle(document.getElementById('overlay-minigames')).getPropertyValue('--red').trim() }));
    ok(orange, `low O2 turns the bar orange (--orange ${pal.orange})`);
    ok(red, `lower still: red (--red ${pal.red}), pulsing`);
    await page.evaluate(() => { if (typeof window.abortMinigame === 'function') window.abortMinigame(); });
    await page.close();
  }

  // ── ruling 38 ────────────────────────────────────────────────
  console.log('— ruling 38: engine_fault → the Simon ENGINE REPAIR minigame');
  {
    const page = await boot({ crew: ['pilot', 'medic'] });
    const d = await page.evaluate(() => {
      const ev = EVENTS.event_crisis_025;
      const all = Object.values(EVENTS);
      const launchers = all.filter(e => JSON.stringify(e).includes('"launch_minigame":"engine"')).map(e => e.id);
      const node = STATE.nodes.find(n => n.node_type !== 'fork' && n.node_type !== 'station') || STATE.nodes[0];
      return { ok: !!ev, title: ev && ev.title, launchers, eligible: ev && eventEligible(ev, node, activeTriggers()), once: ev && ev.once,
        tiers: ev && Object.keys(ev.choices.find(c => c.launch_minigame === 'engine').tier_outcomes || {}), bg: ev && ev.bg };
    });
    ok(d.ok && d.title === 'Engine Fault' && d.launchers.includes('event_crisis_025'), `event_crisis_025 "Engine Fault" launches the engine minigame (launchers: ${d.launchers.join(', ')})`);
    ok(d.eligible && d.once && d.tiers.join() === 'perfect,good,poor' && d.bg === 'our_ship/engine_error', 'eligible at an ordinary stop, once per run, perfect/good/poor outcomes, engine-room art');
    // It actually turns up: draw it from the real pool at ordinary stops.
    const freq = await page.evaluate(() => {
      const nodes = STATE.nodes.filter(n => n.node_type !== 'fork' && n.node_type !== 'station');
      let hits = 0, n = 0;
      for (let i = 0; i < 3000; i++) {
        const node = nodes[i % nodes.length];
        STATE.seenEventIds = new Set(); STATE.flags.add('departed'); STATE.hardStreak = 0; STATE.pityRelief = 0;
        const ev = selectEvent(node); n++; if (ev && ev.id === 'event_crisis_025') hits++;
      }
      return { p: hits / n, stops: nodes.length };
    });
    ok(freq.p > 0.01, `the pool draws it at ordinary stops (${(freq.p * 100).toFixed(1)}% a stop; ≈${(1 - Math.pow(1 - freq.p, freq.stops)).toFixed(2)} chance a run over ${freq.stops} stops)`);

    // Play it: watch the sequence, repeat it → perfect.
    const enter = () => page.evaluate(async () => {
      STATE.seenEventIds.delete('event_crisis_025');
      const node = STATE.byId[STATE.currentId];
      setCrewMorale(50); STATE.resources.fuel = 60; STATE.resources.hull = 70;
      enterEvent(node, EVENTS.event_crisis_025);
      await new Promise(r => setTimeout(r, 200));
      finishAllTyping();
      const leave = document.querySelector('#enc-choices .enc-choice.leave');
      return { leave: leave && leave.textContent, locked: leave && (leave.classList.contains('locked') || leave.disabled), day: STATE.daysElapsed,
        choices: [...document.querySelectorAll('#enc-choices .enc-choice:not(.leave)')].map(b => b.textContent),
        engLocked: [...document.querySelectorAll('#enc-choices .enc-choice:not(.leave)')].filter(b => /Engineer powers/.test(b.textContent)).map(b => b.classList.contains('locked') + ':' + b.textContent) };
    });
    const pick = (re) => page.evaluate(async src => {
      const b = [...document.querySelectorAll('#enc-choices .enc-choice:not(.leave)')].find(x => new RegExp(src).test(x.textContent));
      b.click(); await new Promise(r => setTimeout(r, 300));
    }, re);
    const e0 = await enter();
    ok(/CAN'T LEAVE \(DRIVE DOWN\)/.test(e0.leave) && e0.locked, `the leave row is locked: "${e0.leave}"`);
    ok(e0.choices.some(t => /restart sequence/i.test(t)) && e0.choices.some(t => /Limp mode/i.test(t)), 'restart sequence + limp mode offered');
    ok(e0.engLocked.length === 1 && /^true:.*Engineer/i.test(e0.engLocked[0]), `the engineer's rebuild is locked without an engineer (${e0.engLocked[0]})`);
    await shot(page, 'eng_engine_fault_event');
    await pick('restart sequence');
    await page.waitForFunction(() => document.getElementById('ov').classList.contains('open') && document.getElementById('rstart'));
    const title = await page.evaluate(() => document.getElementById('mtitle').textContent);
    ok(title === 'ENGINE REPAIR', `opens the Simon minigame (${title})`);
    await shot(page, 'eng_engine_ready');
    await page.evaluate(() => {
      window.__seq = [];
      const mo = new MutationObserver(ms => { for (const m of ms) if (m.target.classList && m.target.classList.contains('show')) window.__seq.push(+m.target.dataset.i); });
      mo.observe(document.getElementById('ga'), { attributes: true, subtree: true, attributeFilter: ['class'] });
      document.getElementById('rstart').click();
    });
    await page.waitForFunction(() => document.getElementById('estatus') && document.getElementById('estatus').textContent === 'YOUR TURN', null, { timeout: 15000 });
    await shot(page, 'eng_engine_play');
    const seq = await page.evaluate(() => window.__seq.slice());
    await page.evaluate(async s => { for (const i of s) { document.getElementById('en' + i).click(); await new Promise(r => setTimeout(r, 60)); } }, seq);
    await page.waitForFunction(() => document.getElementById('result').classList.contains('show'));
    const tier = await page.evaluate(() => document.getElementById('rtier').textContent);
    ok(seq.length === 4 && tier === 'EXCELLENT', `played the watched sequence ${seq.join('-')} back: ${tier}`);
    await page.evaluate(() => document.getElementById('rbquit').click());
    await page.waitForTimeout(250);
    const p = await page.evaluate(() => ({ day: STATE.daysElapsed, morale: crewMoraleRaw(), fuel: STATE.resources.fuel, hull: STATE.resources.hull, body: (document.getElementById('enc-body') || document.body).textContent }));
    ok(p.morale === 53 && p.fuel === 60 && p.hull === 70, `perfect: +3 morale to every crew member via addCrewMorale (${p.morale}), nothing lost`);
    ok(p.day - e0.day === 2, `perfect: the low time cost (${p.day - e0.day} days)`);

    // Poor: three wrong clicks → limp mode.
    const e1 = await enter();
    await pick('restart sequence');
    await page.waitForFunction(() => document.getElementById('rstart'));
    await page.evaluate(() => { window.__seq = []; const mo = new MutationObserver(ms => { for (const m of ms) if (m.target.classList && m.target.classList.contains('show')) window.__seq.push(+m.target.dataset.i); }); mo.observe(document.getElementById('ga'), { attributes: true, subtree: true, attributeFilter: ['class'] }); document.getElementById('rstart').click(); });
    await page.waitForFunction(() => document.getElementById('estatus') && document.getElementById('estatus').textContent === 'YOUR TURN', null, { timeout: 15000 });
    await page.evaluate(async () => { for (let k = 0; k < 3; k++) { const wrong = [0, 1, 2, 3, 4].find(i => i !== window.__seq[0]); document.getElementById('en' + wrong).click(); await new Promise(r => setTimeout(r, 80)); } });
    await page.waitForFunction(() => document.getElementById('result').classList.contains('show'));
    const t1 = await page.evaluate(() => document.getElementById('rtier').textContent);
    await page.evaluate(() => document.getElementById('rbquit').click());
    await page.waitForTimeout(250);
    const q = await page.evaluate(() => ({ day: STATE.daysElapsed, morale: crewMoraleRaw(), fuel: STATE.resources.fuel, hull: STATE.resources.hull }));
    ok(t1 === 'INSUFFICIENT' && q.fuel === 54 && q.hull === 66 && q.morale === 47, `three wrong clicks → limp mode: fuel −6, hull −4, morale −3 (${t1}; ${q.fuel}/${q.hull}/${q.morale})`);
    ok(q.day - e1.day === 4, `poor: limp mode costs the medium time (${q.day - e1.day} days)`);

    // Quit mid-game: gains nothing — the poor tier's losses AND its time.
    const e2 = await enter();
    await pick('restart sequence');
    await page.waitForFunction(() => document.getElementById('rstart'));
    await page.evaluate(() => document.getElementById('rstart').click());
    await page.waitForTimeout(300);
    await page.evaluate(() => document.getElementById('mclose').click());
    await page.waitForTimeout(300);
    const z = await page.evaluate(() => ({ day: STATE.daysElapsed, morale: crewMoraleRaw(), fuel: STATE.resources.fuel, hull: STATE.resources.hull, title: (document.querySelector('#enc-title') || {}).textContent }));
    ok(z.fuel === 54 && z.hull === 66 && z.morale === 47 && z.day - e2.day === 4, `✕ QUIT = the poor outcome, never better: fuel ${z.fuel}, hull ${z.hull}, morale ${z.morale}, +${z.day - e2.day} days`);

    // Limp mode outright: cheaper than failing the sequence, dearer than winning it.
    const e3 = await enter();
    await pick('Limp mode');
    await page.waitForTimeout(200);
    const l = await page.evaluate(() => ({ day: STATE.daysElapsed, morale: crewMoraleRaw(), fuel: STATE.resources.fuel, hull: STATE.resources.hull }));
    ok(l.fuel === 58 && l.morale === 48 && l.hull === 70 && l.day - e3.day === 4, `LIMP MODE: fuel −2, morale −2, the medium time (${l.fuel}/${l.morale}, +${l.day - e3.day} days)`);
    await page.close();
  }
  {
    const page = await boot({ crew: ['engineer', 'pilot'] });
    const r = await page.evaluate(async () => {
      STATE.seenEventIds.delete('event_crisis_025'); setCrewMorale(50); STATE.resources.fuel = 60;
      enterEvent(STATE.byId[STATE.currentId], EVENTS.event_crisis_025);
      await new Promise(r => setTimeout(r, 200)); finishAllTyping();
      const b = [...document.querySelectorAll('#enc-choices .enc-choice:not(.leave)')].find(x => /Engineer powers/.test(x.textContent));
      const d0 = STATE.daysElapsed;
      b.click(); await new Promise(r => setTimeout(r, 300));
      return { shown: !!b, fuel: STATE.resources.fuel, days: STATE.daysElapsed - d0, bg: getComputedStyle(document.querySelector('#screen-encounter .enc-backdrop') || document.body).backgroundImage };
    });
    ok(r.shown && r.fuel === 60 && r.days === 2, `engineer aboard: FIELD REPAIR rebuilds the coil — no losses, the low time (+${r.days} days)`);
    ok(/engine_fixed/.test(r.bg), 'the outcome shows the fixed engine room');
    await page.close();
  }

  // ── 46b ──────────────────────────────────────────────────────
  console.log('— 46b: the mining overlay is the route');
  {
    const page = await open();
    const r = await page.evaluate(async () => {
      const files = ['engine/js/minigames/mining.js', 'engine/js/screens/cruise.js', 'index.html'];
      const txt = {}; for (const f of files) txt[f] = await (await fetch(f)).text();
      const ev = Object.values(EVENTS).filter(e => /asteroid_mining/.test(JSON.stringify(e.scenario || '') + JSON.stringify(e.id)));
      return { routeNote: /IS the mining route \(owner ruling 46b/.test(txt['engine/js/minigames/mining.js']), wrapperEvents: ev.length,
        mineDirect: /function handleMineVerb\(\) \{\s*openMining\(/.test(txt['engine/js/screens/cruise.js']) };
    });
    ok(r.mineDirect && r.wrapperEvents === 0, 'MINE opens the mining overlay directly; no asteroid_mining wrapper event exists');
    ok(r.routeNote, 'mining.js records the overlay as the route (no wrapper claimed)');
    await page.close();
  }

  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 4).join(' | ') : ''));
  console.log(`\ntest_b4_mini: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();

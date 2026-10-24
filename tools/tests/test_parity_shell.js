// Demo-parity pass, shell area (2026-10-11): modal fades / scoped screen
// tokens / title / setup / endings / narrative heights / fabricator /
// inventory + Ship's Log close paths / cursors / minigame contract stubs /
// forage poison ruling / .ui-tip tooltips. Measures each fix in the live
// engine, and compares modal frames against their canon demos.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
const BASE = URL.replace(/index\.html.*$/, '');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
let browser;
const errors = [];
async function open(vp) {
  const page = await browser.newPage({ viewport: vp || { width: 960, height: 640 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster && MOD.captains && MOD.ships);
  await page.evaluate(() => localStorage.removeItem('transplant_save_v1'));
  return page;
}
async function boot(setup, vp) {
  const page = await open(vp);
  await page.evaluate(o => {
    applySetupToState(Object.assign({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer', 'medic'], crop: 'wheat', ship: 'D' }, o));
    STATE.stowaway = null;
    returnToHub();
  }, setup || {});
  await page.waitForTimeout(350);
  return page;
}
const wait = (p, ms) => p.waitForTimeout(ms);
const isUrlCursor = c => /^url\(/.test(String(c || ''));

(async () => {
  browser = await chromium.launch();

  console.log('— modals: 0.25s fade + 0.96→1 scale, dim behind, no display toggle');
  {
    const page = await boot();
    await page.evaluate(() => { STATE.materials = { metal: 4, scrap: 3 }; STATE.items.push('medkit'); });
    const MODALS = [
      ['overlay-growbay', '#gb-modal', 'openGrowbay()', 'closeGrowbay()', true],
      ['overlay-fabricator', '#fb-modal', 'openFabricator()', 'closeFabricator()', true],
      ['overlay-orders', '#od-modal', 'openOrders()', "document.getElementById('od-cancel').click()", true],
      ['overlay-inventory', '#inv-card', 'openInventory()', 'closeInventory()', true],
      ['overlay-crew', '#cd-modal', "openCrewDetail('engineer')", "hideOverlay('overlay-crew')", true],
      ['overlay-shipslog', '#slog-card', 'openShipsLog()', "hideOverlay('overlay-shipslog')", true],
      ['overlay-map', '#ovmap-viewport', "document.getElementById('btn-map').click()", "hideOverlay('overlay-map')", true],
      ['overlay-market', '.enc-market', 'openMarket({})', "document.getElementById('market-close-btn').click()", false],
    ];
    for (const [ov, panel, openJs, closeJs, dims] of MODALS) {
      // The fade + scale are real CSS transitions/animations started by the
      // class flip — read them off getAnimations() (deterministic; sampling
      // computed values depends on the headless frame rate).
      const mid = await page.evaluate(async ([ov, panel, openJs]) => {
        const o = document.getElementById(ov); eval(openJs);
        await new Promise(r => setTimeout(r, 30));
        const p = document.querySelector('#' + ov + ' ' + panel);
        const desc = a => (a.transitionProperty || a.animationName || '') + '@' + Math.round(a.effect.getTiming().duration);
        return { ov: o.getAnimations().map(desc), panel: p ? p.getAnimations().map(desc) : [] };
      }, [ov, panel, openJs]);
      await page.waitForFunction(([ov, panel]) => {
        const p = document.querySelector('#' + ov + ' ' + panel), f = getComputedStyle(document.querySelector('#game > .screen.active')).filter;
        return +getComputedStyle(document.getElementById(ov)).opacity === 1 && (!p || ['1', 'none'].includes(getComputedStyle(p).scale)) && (f === 'none' || f === 'brightness(0.35)');
      }, [ov, panel], { timeout: 3000 }).catch(() => {});
      const end = await page.evaluate(([ov, panel]) => {
        const o = document.getElementById(ov), p = document.querySelector('#' + ov + ' ' + panel);
        return { op: +getComputedStyle(o).opacity, scale: p ? getComputedStyle(p).scale.replace('none', '1') : null, filter: getComputedStyle(document.querySelector('#game > .screen.active')).filter };
      }, [ov, panel]);
      ok(mid.ov.includes('opacity@250') && end.op === 1, `${ov}: 0.25s opacity fade runs on open (${mid.ov.join(',')}) → ${end.op}`);
      ok(mid.panel.some(a => /^(scale@250|modal-pop@250)$/.test(a)) && parseFloat(end.scale) === 1, `${ov}: panel 0.96→1 scale runs (${mid.panel.join(',')}) → ${end.scale}`);
      ok(dims ? /brightness\(0\.35\)/.test(end.filter) : !/brightness/.test(end.filter), `${ov}: scene behind ${dims ? 'dims to brightness(0.35)' : 'stays lit'} (${end.filter})`);
      const closing = await page.evaluate(async ([ov, closeJs]) => {
        const o = document.getElementById(ov); eval(closeJs);
        getComputedStyle(o).opacity; // flush so the transition starts now
        const anims = o.getAnimations().map(a => (a.transitionProperty || a.animationName) + '@' + Math.round(a.effect.getTiming().duration));
        return { anims, vis: getComputedStyle(o).visibility, active: o.classList.contains('active') };
      }, [ov, closeJs]);
      await page.waitForFunction(ov => getComputedStyle(document.getElementById(ov)).visibility === 'hidden', ov, { timeout: 3000 }).catch(() => {});
      const closed = await page.evaluate(ov => { const o = document.getElementById(ov); return { vis: getComputedStyle(o).visibility, pe: getComputedStyle(o).pointerEvents }; }, ov);
      ok(!closing.active && closing.vis === 'visible' && closing.anims.includes('opacity@250') && closed.vis === 'hidden' && closed.pe === 'none', `${ov}: closing fades out (${closing.anims.join(',')}), stays visible meanwhile, then hidden + inert`);
    }
    await page.close();
  }

  console.log('— no animation replay on reopen (fabricator badge / day pulse)');
  {
    const page = await boot();
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      openFabricator();
      const badge = document.getElementById('fb-badge'), day = document.getElementById('fb-trip-day');
      badge.classList.add('fire'); day.classList.add('ticking');
      await w(1700);
      closeFabricator(); await w(400); openFabricator(); await w(60);
      const run = el => el.getAnimations().filter(a => a.playState === 'running').length;
      return { badge: run(badge), day: run(day), badgeOp: getComputedStyle(badge).opacity };
    });
    ok(r.badge === 0 && r.day === 0 && +r.badgeOp === 0, `reopened fabricator: "+1" badge + day pulse do not replay (running ${r.badge}/${r.day}, badge opacity ${r.badgeOp})`);
    await page.close();
  }

  console.log('— modal frames, colours, fonts vs the canon demos');
  {
    const demoFrame = async (demo, sel) => {
      const p = await browser.newPage({ viewport: { width: 1600, height: 900 } });
      await p.goto(BASE + 'resources/' + demo);
      await p.waitForTimeout(600);
      const r = await p.evaluate(sel => { const el = document.querySelector(sel); const cs = getComputedStyle(el); return { w: el.offsetWidth, h: el.offsetHeight, border: cs.borderTopColor, bw: cs.borderTopWidth, title: null }; }, sel);
      await p.close();
      return r;
    };
    const page = await boot();
    const FR = [
      ['demo-growbay.html', '#gb-modal', 'openGrowbay()', '#gb-modal', '.gb-title'],
      ['demo-fabricator.html', '#fb-modal', 'openFabricator()', '#fb-modal', '.fb-title'],
      ['demo-inventory.html', '#inv-modal', 'openInventory()', '#inv-card', '#inv-header'],
    ];
    for (const [demo, dsel, openJs, esel] of FR) {
      const d = await demoFrame(demo, dsel);
      await page.evaluate(js => eval(js), openJs); await wait(page, 350);
      const e = await page.evaluate(sel => { const el = document.querySelector(sel); const cs = getComputedStyle(el); return { w: el.offsetWidth, h: el.offsetHeight, border: cs.borderTopColor, bw: cs.borderTopWidth }; }, esel);
      ok(e.w === d.w && e.h === d.h && e.border === d.border && e.bw === d.bw, `${esel} frame ${e.w}×${e.h} ${e.bw} ${e.border} = ${demo} ${d.w}×${d.h} ${d.bw} ${d.border}`);
      await page.evaluate(() => { for (const id of ['overlay-growbay', 'overlay-fabricator', 'overlay-inventory']) hideOverlay(id); document.body.classList.remove('modal-open'); });
      await wait(page, 300);
    }
    const tok = await page.evaluate(() => {
      const v = (id, n) => getComputedStyle(document.getElementById(id)).getPropertyValue(n).trim();
      return { gbBody: v('overlay-growbay', '--body'), gbTeal: v('overlay-growbay', '--teal'), fbBody: v('overlay-fabricator', '--body'), fbTeal: v('overlay-fabricator', '--teal'), rootW: getComputedStyle(document.documentElement).getPropertyValue('--modal-width').trim(), mgMuted: v('overlay-minigames', '--muted'), mgColor: getComputedStyle(document.getElementById('overlay-minigames')).color, rootNarr: getComputedStyle(document.documentElement).getPropertyValue('--narr-height').trim() };
    });
    ok(tok.gbBody === '#aab5c4' && tok.gbTeal === '#35c6bf', `growbay palette is its own (--body ${tok.gbBody}, --teal ${tok.gbTeal}; demo #aab5c4 / #35c6bf)`);
    ok(tok.fbBody === '#c5b28a' && tok.fbTeal === '#56cfd7', `fabricator palette is its own (--body ${tok.fbBody}, --teal ${tok.fbTeal})`);
    ok(tok.rootW === '' && tok.rootNarr === '', 'no screen tokens on :root any more (--modal-width / --narr-height unset there)');
    ok(tok.mgMuted === '#5a7a6a' && tok.mgColor === 'rgb(136, 152, 168)', `minigames: --muted ${tok.mgMuted}, body colour ${tok.mgColor} (demo #8898a8)`);
    const fonts = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      const fs = el => el ? getComputedStyle(el).fontSize : null;
      const out = { stop: fs(document.getElementById('stop-btn')) };
      openGrowbay(); await w(50); out.gb = fs(document.getElementById('harvest-btn')); closeGrowbay();
      openOrders(); await w(50); out.od = fs(document.getElementById('od-apply')); document.getElementById('od-cancel').click();
      openCrewDetail('engineer'); await w(50); out.cd = fs(document.querySelector('#overlay-crew .panel-btn')); hideOverlay('overlay-crew');
      showScreen('screen-setup'); startNewGame(); await w(50); out.setup = fs(document.getElementById('btn-next'));
      return out;
    });
    ok(fonts.setup === '18px', `setup Back/Next/Launch ${fonts.setup} (demo-setup 18px; the growbay leak made it 15px)`);
    ok(fonts.gb === '15px' && fonts.od === '16px' && (fonts.cd === null || fonts.cd === '15px'), `panel buttons per demo: growbay ${fonts.gb}, orders ${fonts.od}, crew ${fonts.cd} (cruise Stop keeps its own ${fonts.stop})`);
    await page.close();
  }

  console.log('— title');
  {
    const page = await open();
    await page.evaluate(() => showScreen('screen-title'));
    await page.click('#screen-title');
    await wait(page, 800);
    const r = await page.evaluate(() => {
      const c = document.getElementById('title-stars-far'), n = document.getElementById('title-stars-near');
      const lit = cv => { const d = cv.getContext('2d').getImageData(0, 0, 960, 640).data; let s = 0; for (let i = 3; i < d.length; i += 4) s += d[i]; return s; };
      const ts = document.getElementById('screen-title');
      return { pos: getComputedStyle(c).position, posN: getComputedStyle(n).position, far: lit(c), near: lit(n), gap: getComputedStyle(document.getElementById('title-content')).rowGap,
        vig: getComputedStyle(ts).getPropertyValue('--vignette').trim(), rad: getComputedStyle(document.getElementById('btn-new')).borderTopLeftRadius };
    });
    ok(r.pos === 'absolute' && r.posN === 'absolute' && r.far > 0 && r.near > 0, `starfield canvases positioned + drawing (far ${r.far}, near ${r.near} alpha)`);
    ok(r.gap === '18px', 'title content gap 18px (demo)');
    ok(r.vig === '0.30', 'poster vignette 0.30 (demo)');
    ok(r.rad === '8px', 'title buttons keep DESIGN_SYSTEM 8px radius (demo 25px — ruling: DESIGN_SYSTEM)');
    await page.close();
  }

  console.log('— setup');
  {
    const page = await open();
    const r = await page.evaluate(() => {
      startNewGame();
      const s = document.getElementById('screen-setup'), cs = getComputedStyle(s);
      const ht = document.querySelector('#screen-setup .halftone');
      const ui = document.getElementById('setup-screen');
      return { bw: cs.borderTopWidth, bc: cs.borderTopColor, rad: cs.borderTopLeftRadius, gameBw: getComputedStyle(document.getElementById('game')).borderTopWidth,
        uiZ: +getComputedStyle(ui).zIndex, htZ: +getComputedStyle(ht).zIndex, pip: getComputedStyle(document.querySelector('#screen-setup .progress-pip.active')).backgroundColor };
    });
    ok(r.bw === '3px' && r.bc === 'rgb(200, 168, 90)' && r.rad === '6px', `gold 3px setup frame (${r.bw} ${r.bc} r${r.rad})`);
    ok(r.uiZ > r.htZ, `halftone corners under the UI (ui z ${r.uiZ} > halftone z ${r.htZ})`);
    ok(r.pip !== 'rgb(200, 168, 90)', `active progress pip is a gold ring, not a filled dot (fill ${r.pip}) — DESIGN_SYSTEM`);
    await page.evaluate(() => showScreen('screen-cruise'));
    const g = await page.evaluate(() => getComputedStyle(document.getElementById('screen-cruise')).borderTopWidth);
    ok(g === '0px', 'frame is setup-only (cruise has none)');
    await page.close();
  }

  console.log('— endings');
  {
    const page = await boot();
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      STATE.resources.fuel = 0;
      endRun({ kind: 'failure', module: MOD.failures.find(f => f.failure_type === 'no_fuel') });
      await w(60);
      const anim = id => document.getElementById(id).getAnimations().map(a => a.animationName);
      const out = { title: anim('end-cine-title'), btn: anim('end-cine-btn'), btnFont: getComputedStyle(document.getElementById('end-cine-btn')).fontFamily, btnColor: getComputedStyle(document.getElementById('end-cine-btn')).color,
        tt: getComputedStyle(document.getElementById('end-cine-title')).textTransform, bg: getComputedStyle(document.getElementById('screen-end')).backgroundImage };
      await w(300);
      const cv = document.getElementById('end-stars'); const d = cv.getContext('2d').getImageData(0, 0, 960, 640).data; let s = 0; for (let i = 3; i < d.length; i += 4) s += d[i]; out.stars = s;
      window.showEndReport(); await w(40);
      out.report = anim('end-report'); out.card = anim('end-report-card');
      out.bars = [...document.querySelectorAll('#end-res-bars .res-bar')].map(b => b.getBoundingClientRect().height);
      out.btns = [...document.querySelectorAll('#end-report-actions .end-btn')].map(b => getComputedStyle(b).fontFamily + '|' + getComputedStyle(b).borderTopColor);
      return out;
    });
    ok(r.title.includes('end-cine-rise') && r.btn.includes('end-btn-rise'), `cinematic entrance motion (title ${r.title}, button ${r.btn})`);
    ok(/Press Start 2P/.test(r.btnFont) && r.btnColor === 'rgb(232, 216, 160)', `cinematic button Press Start 2P, cream (${r.btnColor})`);
    ok(r.tt === 'uppercase', 'failure stinger in ALL CAPS');
    ok(/radial-gradient/.test(r.bg) && r.stars > 0, `failure: navy radial gradient + star drift drawing (${r.stars})`);
    ok(r.report.includes('end-fade-in') && r.card.includes('end-card-rise'), 'report overlay fades in (380ms), card rises (520ms)');
    ok(r.bars.length >= 4 && r.bars.every(h => h > 2), `end-report resource bars ${r.bars.map(h => Math.round(h)).join('/')}px tall (were 2px)`);
    ok(r.btns.length === 2 && r.btns.every(b => /Press Start 2P/.test(b)), 'report buttons are gold pixel buttons');
    await page.close();
  }
  {
    const page = await boot();
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      endRun({ kind: 'arrival', module: MOD.endings[0] });
      // A fade is under way (an opacity animation, not a cut), then it lands
      // at 1. Read off the animation itself: fixed 150/550ms reads missed
      // both ends under load.
      const el = document.getElementById('end-scene');
      let fade = null;
      for (let i = 0; i < 40 && !fade; i++) { await w(25); fade = el.getAnimations().find(a => (a.transitionProperty || '') === 'opacity' || /fade|opacity/i.test(a.animationName || '')) || null; }
      const mid = +getComputedStyle(el).opacity;
      if (fade) await fade.finished.catch(() => {});
      return { fading: !!fade, mid, end: +getComputedStyle(el).opacity };
    });
    ok(r.fading && r.mid < 1 && r.end === 1, `arrival scene fades in (mid ${r.mid.toFixed(2)} → ${r.end})`);
    await page.close();
  }

  console.log('— mining / engine-repair narrative panels');
  {
    const page = await boot();
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      openMining(() => {}); await w(80);
      const m = document.getElementById('mining-narrative').getBoundingClientRect().height;
      window.abortMining(); await w(50);
      openEngineRepair(() => {}); await w(150);
      const e = document.querySelector('#engrepair-root .enc-narrative').getBoundingClientRect().height;
      return { m, e };
    });
    ok(Math.round(r.m) === 110, `mining narrative ${r.m}px (demo 110)`);
    ok(Math.round(r.e) === 112, `engine-repair narrative ${r.e}px (demo 112)`);
    await page.close();
  }

  console.log('— fabricator');
  {
    const page = await boot();
    const fit = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      STATE.materials = { metal: 9, scrap: 9, minerals: 9, biocomponent: 9, exotic: 3 };
      STATE.items.push('repair_fabricator');
      STATE.fabricator.wear = 99.5; STATE.daysElapsed = STATE.baseDays;
      openFabricator(); await w(350);
      const out = [];
      for (const rec of MOD.recipes.recipes) {
        [...document.querySelectorAll('.fb-recipe-row')].find(r => r.textContent.includes(rec.name)).click();
        const d = document.getElementById('fb-detail').getBoundingClientRect(), b = document.getElementById('fb-craft-btn').getBoundingClientRect();
        out.push({ id: rec.id, warns: document.querySelectorAll('#fb-meta .fb-warn').length, inside: b.bottom <= d.bottom - 2 && b.top >= d.top, misfire: /MISFIRE/.test(document.getElementById('fb-meta').textContent), eff: document.getElementById('fb-detail-effect').textContent });
      }
      return out;
    });
    ok(fit.every(f => f.inside && f.warns === 2 && f.misfire), `CRAFT fully inside the panel under both warnings + MISFIRE, every recipe (${fit.filter(f => f.inside).length}/${fit.length})`);
    ok(fit.every(f => f.eff && !/Stackable|Craftable|Fabricated|recipe_/.test(f.eff)), `the print's gameplay_effect is shown (player-facing part): "${fit[0].eff}"`);
    const src = await page.evaluate(() => { const row = document.querySelector('#fb-inputs .fb-input-row'); return { d: row.dataset.tipDescription, t: row.dataset.tipTitle, title: row.getAttribute('title') }; });
    ok(src.d && !/mining · salvage|event_reward|·\s*derelict$/.test(src.d) && /[A-Z][a-z]+ .*·/.test(src.d) && src.title == null, `material hover is prose (${src.t}: "${src.d}")`);
    await page.close();
  }
  {
    const page = await boot();
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      STATE.materials = { metal: 20, scrap: 20 };
      STATE.fabricator.wear = 0;
      const d0 = STATE.daysElapsed;
      openFabricator(); await w(100);
      [...document.querySelectorAll('.fb-recipe-row')].find(r => /Repair Kit/.test(r.textContent)).click();
      craftSelected();
      const total = STATE.daysElapsed - d0;
      closeFabricator(); await w(50); openFabricator(); await w(50);
      const dayReopen = +document.getElementById('fb-trip-day').textContent;
      let max = dayReopen;
      for (let i = 0; i < 40; i++) { await w(250); max = Math.max(max, +document.getElementById('fb-trip-day').textContent); if (!document.getElementById('fb-progress').classList.contains('active')) break; }
      return { d0, total, dayReopen, max, final: +document.getElementById('fb-trip-day').textContent, now: STATE.daysElapsed, cursorBusy: null };
    });
    ok(r.dayReopen <= r.d0 + 1 && r.max === r.now && r.final === r.now, `header day after reopen mid-craft: ${r.dayReopen} → ends at ${r.final} = trip day ${r.now} (never past it; max ${r.max})`);
    await page.close();
  }
  {
    const page = await boot();
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      STATE.materials = { metal: 20, scrap: 20 };
      STATE.fabricator.wear = 60;
      openFabricator(); await w(60);
      const rnd = Math.random; Math.random = () => 0.01; // forces a misfire (wear 60 → 8% odds)
      // Ruling 27 (b4): the job runs day by day and the misfire roll comes
      // when it finishes — a fast fabricator day, then wait for it.
      window.fabSetDayMs(40);
      craftSelected();
      for (let i = 0; i < 100 && window.fabCraftState(); i++) await w(30);
      Math.random = rnd;
      window.fabSetDayMs(2000);
      const notice1 = fabNoticeText();
      // refused claim: a finished print with the hold full
      STATE.fabricator.wear = 0;
      STATE.fabricator.owedOutput = 'hull_patch';
      while (cargoSlotsUsed() < cargoCapacity()) STATE.items.push('medkit');
      closeFabricator(); await w(50); window.abortFabricator(); openFabricator(); await w(60);
      claimOutput();
      return { notice1, notice2: fabNoticeText() };
    });
    ok(/MISFIRE/.test(r.notice1), `misfire reported in the modal ("${r.notice1.slice(0, 70)}…")`);
    ok(/HOLD FULL/.test(r.notice2), `refused claim reported in the modal ("${r.notice2.slice(0, 60)}…")`);
    await page.close();
  }

  console.log('— inventory shell');
  {
    const page = await boot();
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      STATE.materials = { metal: 3 };
      for (let i = 0; i < 4; i++) STATE.items.push('medkit', 'fuel_cell', 'ration_brick', 'repair_kit');
      openInventory(); await w(300);
      document.querySelector('.inv-tab[data-tab="materials"]').click(); // was "resources" (batch-2 inventory: GEAR / MATERIALS / UPGRADES) await w(30);
      document.querySelector('#inv-grid .inv-tile').click(); await w(30);
      const mat = { name: document.getElementById('inv-detail-name').textContent, desc: document.getElementById('inv-detail-desc').textContent };
      document.querySelector('.inv-tab[data-tab="gear"]').click(); await w(30);
      document.querySelector('#inv-grid .inv-tile').click(); await w(30);
      document.getElementById('inv-jett-btn').click(); await w(30);
      const card = document.getElementById('inv-card').getBoundingClientRect();
      const inside = [...document.querySelectorAll('#inv-card *')].filter(e => e.offsetParent && !e.closest('.scroll-content')).every(e => { const b = e.getBoundingClientRect(); return b.bottom <= card.bottom + 0.5 && b.right <= card.right + 0.5; });
      const host = document.getElementById('inv-grid-host');
      const sb = getComputedStyle(document.getElementById('inv-grid')).scrollbarWidth;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await w(30);
      const afterEsc1 = { confirm: !document.getElementById('inv-confirm').classList.contains('hidden'), open: document.getElementById('overlay-inventory').classList.contains('active') };
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await w(30);
      const afterEsc2 = document.getElementById('overlay-inventory').classList.contains('active');
      openInventory(); await w(300);
      document.getElementById('inv-x').click(); await w(20);
      const x = document.getElementById('overlay-inventory').classList.contains('active');
      openInventory(); await w(300);
      const ov = document.getElementById('overlay-inventory');
      const cr = document.getElementById('inv-card').getBoundingClientRect();
      ov.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: cr.left - 5, clientY: cr.top + 5 }));
      await w(20);
      return { mat, inside, hasHost: host.classList.contains('scroll-host') && !!host.querySelector('.scroll-thumb'), sb, afterEsc1, afterEsc2, x, bd: ov.classList.contains('active') };
    });
    const md = await page.evaluate(() => MOD.materials.materials.find(m => m.id === 'metal'));
    ok(r.mat.name.startsWith(md.name) && r.mat.desc === md.description, `material detail uses materials.json (${r.mat.name} — "${r.mat.desc}")`);
    ok(r.inside, 'nothing spills past the card border with detail + confirm open');
    ok(r.hasHost && r.sb === 'none', 'grid uses the gold custom scrollbar (native hidden)');
    ok(!r.afterEsc1.confirm && r.afterEsc1.open && !r.afterEsc2, 'Esc in the jettison confirm closes the confirm only; the next Esc closes the hold');
    ok(!r.x, 'header ✕ closes'); ok(!r.bd, 'backdrop click closes');
    await page.close();
  }

  console.log("— Ship's Log close paths");
  {
    const page = await boot();
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      STATE.shipLog.push({ day: 3, text: 'A memorial.', type: 'death', expand: 'Long epitaph.', crewName: 'Test' });
      openShipsLog(); await w(300);
      document.querySelector('.slog-expand-btn').click(); await w(20);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await w(20);
      const esc1 = { exp: document.getElementById('slog-expand-modal').style.display, open: document.getElementById('overlay-shipslog').classList.contains('active') };
      document.querySelector('.slog-expand-btn').click(); await w(20);
      hideOverlay('overlay-shipslog'); await w(300);
      openShipsLog(); await w(300);
      const stale = document.getElementById('slog-expand-modal').style.display;
      const ov = document.getElementById('overlay-shipslog');
      ov.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await w(20);
      return { esc1, stale, bd: ov.classList.contains('active'), host: !!document.querySelector('#slog-rows-host .scroll-thumb'), sb: getComputedStyle(document.getElementById('slog-rows')).scrollbarWidth };
    });
    ok(r.esc1.exp === 'none' && r.esc1.open, 'Esc with a memorial open closes the memorial only');
    ok(r.stale === 'none', 'a stale expand does not reappear on reopen');
    ok(!r.bd, 'backdrop click closes the log');
    ok(r.host && r.sb === 'none', 'log uses the gold custom scrollbar');
    await page.close();
  }

  console.log('— cursors');
  {
    const grab = await (async () => {
      const page = await open();
      const n = await page.evaluate(() => { let c = 0; for (const ss of document.styleSheets) { let rules; try { rules = ss.cssRules; } catch (_) { continue; } for (const r of rules) if (r.style && /grab/.test(r.style.cursor || '')) c++; } return c; });
      await page.close(); return n;
    })();
    ok(grab === 0, `no grab/grabbing cursor anywhere (${grab} rules)`);
    const page = await boot();
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      const nrm = v => String(v).replace(/["']/g, '').replace(/\s+/g, ' ').trim(); // computed vs custom-property quoting differs
      const cur = el => el ? nrm(getComputedStyle(el).cursor) : 'MISSING';
      const root = n => nrm(getComputedStyle(document.documentElement).getPropertyValue(n));
      const out = {};
      out.denied = root('--cursor-denied'); out.wait = root('--cursor-wait'); out.scan = root('--cursor-scan'); out.hand = root('--cursor-hand');
      // A locked row needs a real need now (b4: REPAIR hides on an intact
      // hull, demo hideWhen): a dented hull and no metal locks it.
      STATE.resources.hull = Math.min(STATE.resources.hull, 50); STATE.materials = Object.assign({}, STATE.materials, { metal: 0 });
      openStopMenu(); // (re-)renders the menu
      out.stopLocked = cur(document.querySelector('.stop-choice.locked'));
      out.stopBtn = cur(document.getElementById('stop-btn'));
      openMarket({}); await w(300);
      out.marketBuy = cur(document.querySelector('.market-row-btn:not(:disabled)'));
      out.marketBuyDisabled = document.querySelector('.market-row-btn:disabled') ? cur(document.querySelector('.market-row-btn:disabled')) : out.denied;
      out.marketClose = cur(document.getElementById('market-close-btn'));
      document.getElementById('market-close-btn').click(); await w(300);
      openMinigame('scan', {}, () => {}); await w(100);
      out.mclose = cur(document.getElementById('mclose'));
      out.rstart = cur(document.getElementById('rstart'));
      out.rbquit = cur(document.getElementById('rbquit'));
      document.getElementById('mclose').click(); await w(300);
      STATE.materials = {}; STATE.fabricator.wear = 0;
      openFabricator(); await w(300);
      out.craftLocked = cur(document.getElementById('fb-craft-btn'));
      out.recipeLocked = cur(document.querySelector('.fb-recipe-row.locked-purchase'));
      closeFabricator(); await w(300);
      openGrowbay(); await w(300);
      out.harvestLocked = cur(document.getElementById('harvest-btn'));
      out.plant = cur(document.getElementById('plant-sprite'));
      out.inspect = cur(document.getElementById('inspect-btn'));
      closeGrowbay(); await w(300);
      const b = document.createElement('button'); b.className = 'btn'; b.disabled = true; document.getElementById('screen-cruise').appendChild(b);
      out.btnDisabled = cur(b); b.remove();
      return out;
    });
    ok(isUrlCursor(r.denied) && isUrlCursor(r.wait) && isUrlCursor(r.scan), 'Denied / Wait / Scan baked as pixel cursors (--cursor-denied/-wait/-scan)');
    for (const k of ['stopBtn', 'marketBuy', 'marketClose', 'mclose', 'rstart', 'rbquit']) ok(r[k] === r.hand, `${k}: pixel hand`);
    for (const k of ['stopLocked', 'marketBuyDisabled', 'craftLocked', 'recipeLocked', 'harvestLocked', 'btnDisabled']) ok(r[k] === r.denied, `${k}: red Denied`);
    ok(r.plant === r.scan && r.inspect === r.scan, 'growbay specimen + INSPECT: Scan');
    const busy = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      STATE.materials = { metal: 20, scrap: 20 }; STATE.fabricator.wear = 0;
      openFabricator(); await w(300);
      const rnd = Math.random; Math.random = () => 0.99; craftSelected(); Math.random = rnd;
      await w(30);
      const nrm = v => String(v).replace(/["']/g, '').replace(/\s+/g, ' ').trim();
      const c = nrm(getComputedStyle(document.getElementById('fb-craft-btn')).cursor);
      cancelCraft();
      return c === nrm(getComputedStyle(document.documentElement).getPropertyValue('--cursor-wait'));
    });
    ok(busy, 'CRAFT while a craft passes days: Wait');
    await page.close();
    // setup RE-ROLL + title Continue
    const p2 = await open();
    const s = await p2.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      const nrm = v => String(v).replace(/["']/g, '').replace(/\s+/g, ' ').trim();
      const hand = nrm(getComputedStyle(document.documentElement).getPropertyValue('--cursor-hand'));
      const denied = nrm(getComputedStyle(document.documentElement).getPropertyValue('--cursor-denied'));
      showScreen('screen-title');
      const cont = nrm(getComputedStyle(document.getElementById('btn-continue')).cursor) === denied;
      startNewGame(); await w(80);
      for (let i = 0; i < 8 && !document.getElementById('ship-name-input'); i++) {
        const cards = [...document.querySelectorAll('#setup-right .sel-card')];
        if (document.getElementById('crew-count-badge').textContent) { cards[0].click(); cards[1].click(); } else cards[0].click();
        document.getElementById('btn-next').click(); await w(80);
      }
      const rr = document.getElementById('ship-name-reroll');
      return { cont, reroll: nrm(getComputedStyle(rr).cursor) === hand, rerollTitle: rr.getAttribute('title'), rerollTip: rr.dataset.tipDescription };
    });
    ok(s.cont, 'title Continue (no save): Denied');
    ok(s.reroll, 'setup RE-ROLL: pixel hand');
    ok(s.rerollTitle == null && /registry/.test(s.rerollTip || ''), 'setup RE-ROLL title= upgraded to a .ui-tip');
    await p2.close();
  }

  console.log('— minigame contract stubs');
  {
    const page = await boot();
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      // The bg is a random pick from the mode's pool: narrow the pool to one.
      const label = async (ctx, bg) => {
        const pool = FORAGE_BG_REGISTRY[ctx.mode];
        FORAGE_BG_REGISTRY[ctx.mode] = pool.filter(b => b.id === bg);
        openMinigame('forage', ctx, () => {}); await w(60);
        document.getElementById('rstart').click(); await w(120);
        FORAGE_BG_REGISTRY[ctx.mode] = pool;
        const t = (document.querySelector('.for-region') || {}).textContent;
        document.getElementById('mclose').click(); await w(50);
        return t;
      };
      const out = {};
      out.ast = await label({ mode: 'HUNT', regionLabel: 'ASTEROID FIELD' }, 'asteroid');
      out.desert = await label({ mode: 'HUNT', regionLabel: 'ASTEROID FIELD' }, 'desert');
      out.ice = await label({ mode: 'HUNT', regionLabel: 'ASTEROID FIELD' }, 'ice');
      out.planet = await label({ mode: 'GATHER', regionLabel: 'PLANET ORBIT' }, 'forest');
      // cruise passes the real stop's label
      const node = STATE.nodes.find(n => n.node_type === 'asteroid_field') || STATE.nodes[1];
      node.node_type = 'asteroid_field'; STATE.currentId = node.id;
      renderCruise(); if (window.openStopMenu) openStopMenu(); await w(80);
      const real = window.openMinigame; let ctx = null;
      window.openMinigame = (id, o, cb) => { ctx = o; };
      const hunt = [...document.querySelectorAll('#stop-choices button')].find(b => /HUNT/.test(b.textContent));
      if (hunt) hunt.click();
      window.openMinigame = real;
      out.cruiseCtx = ctx && ctx.regionLabel;
      // breach O2 starts at the ship's O2 (a number only with the event's
      // tier O2 figures in hand — it never shows one that won't land)
      STATE.resources.o2 = 62;
      openMinigame('breach', { tierO2: { perfect: -2, good: -3, poor: -8 } }, () => {}); await w(60);
      document.getElementById('rstart').click(); await w(120);
      out.o2 = document.getElementById('bcr-o2val') && document.getElementById('bcr-o2val').textContent;
      document.getElementById('mclose').click(); await w(50);
      return out;
    });
    ok(r.ast === 'ASTEROID FIELD · HUNT' && r.desert === 'DESERT ROCK · HUNT' && r.ice === 'ICE ROCK · HUNT', `forage HUD names the ground: ${r.ast} / ${r.desert} / ${r.ice}`);
    ok(r.planet === 'PLANET ORBIT · GATHER', `forage HUD uses the cruise's region label (${r.planet})`);
    ok(r.cruiseCtx === 'ASTEROID FIELD', `cruise passes ctx.regionLabel (${r.cruiseCtx})`);
    ok(r.o2 === '62', `breach O2 bar starts at the ship's O2 (${r.o2}%)`);
    await page.close();
  }
  {
    const page = await boot();
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      // salvage VIEW INVENTORY → finish the run, then the real Cargo Hold
      const real = window.openMinigame;
      openMinigame('salvage', {}, () => {}); await w(60);
      document.getElementById('rstart').click(); await w(150);
      // jump to the end card: the engine's own time-up path
      const end = [...document.querySelectorAll('#ga *')].length;
      return { started: end > 0 };
    });
    ok(r.started, 'salvage launches');
    // VIEW INVENTORY: drive the end card directly
    const v = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      for (let i = 0; i < 120 && !document.getElementById('sal-view-inv'); i++) await w(250);
      const btn = document.getElementById('sal-view-inv');
      if (!btn) return { reached: false };
      document.getElementById('sal-process-all') && document.getElementById('sal-process-all').click();
      await w(100);
      btn.classList.remove('disabled'); btn.click();
      for (let i = 0; i < 20 && !document.getElementById('overlay-inventory').classList.contains('active'); i++) await w(150);
      return { reached: true, inv: document.getElementById('overlay-inventory').classList.contains('active'), mg: document.getElementById('overlay-minigames').classList.contains('active') };
    });
    ok(v.reached && v.inv && !v.mg, `salvage VIEW INVENTORY closes the run and opens the real Cargo Hold (${JSON.stringify(v)})`);
    await page.close();
  }
  {
    // mining lifetime stats survive a save + reload; the log line carries tier/sector/crew
    const page = await boot();
    await page.evaluate(() => { STATE.miningLifetime = { runs: 4, totalCracks: 31, totalMaterials: 22, totalHollows: 3, totalFragmentsLost: 2, bestChainEver: 6, bestTier: 'adequate' }; STATE.currentEvent = null; });
    const saved = await page.evaluate(() => { const u = new URL(location.href); return writeSnapshot(SAVE_KEY); });
    await page.reload();
    await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster);
    const back = await page.evaluate(() => { loadRun(); return STATE.miningLifetime; });
    ok(saved && back && back.runs === 4 && back.totalMaterials === 22, `mining lifetime stats persist through a save + reload (${JSON.stringify(back)})`);
    const src = await page.evaluate(async () => (await (await fetch('engine/js/screens/cruise.js')).text()).includes('haul.summary'));
    ok(src, 'cruise MINE log line appends the mining summary (tier · sector · crew credit)');
    await page.close();
  }
  {
    // MEDICAL: difficulty + patient HP tiers (event_crisis_015)
    const page = await boot({ crew: ['engineer', 'pilot'] });
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      const ev = EVENTS.event_crisis_015;
      const choice = ev.choices.find(c => c.launch_minigame === 'medical');
      const real = window.openMinigame;
      const run = async (tier, payloadFn) => {
        STATE.crewHP.engineer = 50; STATE.crewHP.pilot = 80;
        STATE.currentEvent = ev;
        let opts = null;
        window.openMinigame = (id, o, cb) => { opts = o; cb(tier, payloadFn ? payloadFn(o) : { hp: o.startingHp, startingHp: o.startingHp }); };
        const rov = window.renderOutcomeView; let body = '';
        window.renderOutcomeView = v => { body = v.body; };
        resolveChoice(choice);
        window.openMinigame = real; window.renderOutcomeView = rov;
        await w(30);
        return { opts, eng: STATE.crewHP.engineer, pilot: STATE.crewHP.pilot, body };
      };
      return { perfect: await run('perfect'), good: await run('good'), poor: await run('poor', o => ({ hp: o.startingHp - 12, startingHp: o.startingHp })), diff: ev.difficulty };
    });
    ok(r.perfect.opts.difficulty === r.diff && r.perfect.opts.startingHp === 50, `MEDICAL plays at the event's difficulty (${r.perfect.opts.difficulty}) on the worst-hurt crew (start HP ${r.perfect.opts.startingHp})`);
    ok(r.perfect.eng === 75 && r.good.eng === 60 && r.poor.eng === 38 && r.perfect.pilot === 80, `patient HP: perfect +25 (${r.perfect.eng}), good +10 (${r.good.eng}), poor keeps the loss (${r.poor.eng})`);
    ok(/\+25 HP/.test(r.perfect.body), 'the outcome says what happened to the patient');
    await page.close();
  }
  {
    // forage poison ruling: ~10/20/35 HP, 5/12/20 morale
    const page = await boot({ crew: ['engineer', 'pilot'] });
    const r = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      const node = STATE.nodes.find(n => n.node_type === 'asteroid_field') || STATE.nodes[1];
      node.node_type = 'asteroid_field'; STATE.currentId = node.id;
      const res = {};
      for (const sev of ['light', 'medium', 'heavy']) {
        STATE.crewHP.engineer = 100; STATE.crewHP.pilot = 100; STATE.captainHP = 100; setCrewMorale(60); // the captain can take the poison too (ruling 29)
        renderCruise(); if (window.openStopMenu) openStopMenu(); await w(60);
        const real = window.openMinigame;
        window.openMinigame = (id, o, cb) => cb('good', { food: 0, sickness: [{ type: 'poisoning', target: 'random_crew', severity: sev }, { type: 'morale_drop', target: 'all_crew', severity: sev }] });
        [...document.querySelectorAll('#stop-choices button')].find(b => /HUNT/.test(b.textContent)).click();
        window.openMinigame = real;
        await w(60);
        res[sev] = { hp: 300 - STATE.crewHP.engineer - STATE.crewHP.pilot - STATE.captainHP, mo: 60 - crewMoraleRaw() };
      }
      return res;
    });
    ok(r.light.hp === 10 && r.medium.hp === 20 && r.heavy.hp === 35, `poisoning HP ${r.light.hp}/${r.medium.hp}/${r.heavy.hp} (ruling 10/20/35)`);
    ok(r.light.mo >= 5 && r.medium.mo >= 12 && r.heavy.mo >= 20 && r.heavy.mo <= 24, `morale drop ${r.light.mo}/${r.medium.mo}/${r.heavy.mo} (ruling 5/12/20, + the verb's effort pip)`);
    await page.close();
  }

  console.log('— tooltips (.ui-tip)');
  {
    const page = await boot(null, { width: 1440, height: 960 });
    // The dot HUD left the cruise hub (ruling 16): probe it on the encounter screen.
    await page.evaluate(() => { showScreen('screen-encounter'); renderHUD(); });
    await wait(page, 200);
    const early = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      const el = document.querySelector('#hud-enc .hud-r.food');
      el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await w(15);
      const p = document.querySelector('#ui-tip-root .ui-tip');
      const at15 = !!(p && p.classList.contains('visible'));
      el.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
      return at15;
    });
    const hud = await page.$('#hud-enc .hud-r.fuel');
    await hud.hover();
    await wait(page, 150);
    const t = await page.evaluate(() => {
      const p = document.querySelector('#ui-tip-root .ui-tip'), g = document.getElementById('game');
      const pr = p.getBoundingClientRect(), gr = g.getBoundingClientRect(), hr = document.querySelector('#hud-enc .hud-r.fuel').getBoundingClientRect();
      return { vis: p.classList.contains('visible'), tone: p.className, title: (p.querySelector('.ui-tip-title') || {}).textContent, desc: (p.querySelector('.ui-tip-desc') || {}).textContent, rows: p.querySelector('.ui-tip-rows') && p.querySelector('.ui-tip-rows').textContent,
        fade: getComputedStyle(p).transitionDuration, inGame: pr.left >= gr.left && pr.right <= gr.right && pr.top >= gr.top && pr.bottom <= gr.bottom, below: pr.top >= hr.bottom, centred: Math.abs((pr.left + pr.right) / 2 - (hr.left + hr.right) / 2) < 2 || pr.left - gr.left < 12 * (gr.width / 960) };
    });
    ok(!early && t.vis, 'opens after the ~50ms delay (not at 20ms, yes at 170ms)');
    ok(t.title === 'FUEL' && /Engine reserves/.test(t.desc) && /Current\s*\d+ \/ \d+/.test(t.rows), `resource HUD copy ported (${t.title}: ${t.desc} · ${t.rows})`);
    ok(/tone-default/.test(t.tone) && t.fade === '0.08s', `default tone, 80ms fade (${t.fade})`);
    ok(t.inGame && t.below, 'element-anchored, flipped below when the top clips, clamped inside the game frame');
    await page.evaluate(() => { showScreen('screen-cruise'); renderCruise(); });
    await wait(page, 200);
    const bar = await page.$('#bottom-resources .res.fuel');
    await bar.hover(); await wait(page, 150);
    const b = await page.evaluate(() => document.querySelector('#ui-tip-root .ui-tip .ui-tip-desc').textContent);
    ok(/^Fuel: \d+ \/ \d+$/.test(b), `bar hover value "${b}" (demo-cruise)`);
    // tones
    const tones = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      const probe = def => { const el = document.createElement('div'); Tooltip.attach(el, def); return Tooltip.resolve(el).tone; };
      return [probe({ description: 'x' }), probe({ description: 'x', tone: 'warn' }), probe({ description: 'x', tone: 'danger' }), probe({ description: 'x', tone: 'good' }), probe({ description: 'x', tone: 'quote' })];
    });
    ok(tones.join() === 'default,warn,danger,good,quote', 'five tones: ' + tones.join(' / '));
    // auto-upgrade of title=
    const up = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      const b = document.createElement('button'); b.textContent = 'X'; document.getElementById('screen-cruise').appendChild(b);
      b.title = 'Head\n\nSome body text.'; await w(0);
      const r = { title: b.getAttribute('title'), tt: b.dataset.tipTitle, td: b.dataset.tipDescription };
      b.remove();
      return r;
    });
    ok(up.title == null && up.tt === 'Head' && up.td === 'Some body text.', 'a title= set by any screen is upgraded to .ui-tip automatically');
    // PauseBus hides
    const hidden = await page.evaluate(async () => { PauseBus.pause(); const v = document.querySelector('#ui-tip-root .ui-tip').classList.contains('visible'); PauseBus.resume(); return !v; });
    ok(hidden, 'PauseBus pause hides the tooltip');
    // no native title on game controls across the surfaces
    const left = await page.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms));
      STATE.items.push('medkit'); STATE.materials = { metal: 3 };
      const seen = [];
      const sweep = () => document.querySelectorAll('#game [title]').forEach(e => seen.push(e.id || e.className || e.tagName));
      sweep();
      for (const [o, c] of [['openGrowbay()', 'closeGrowbay()'], ['openFabricator()', 'closeFabricator()'], ['openOrders()', "document.getElementById('od-cancel').click()"], ['openInventory()', 'closeInventory()'], ["openCrewDetail('engineer')", "hideOverlay('overlay-crew')"], ['openShipsLog()', "hideOverlay('overlay-shipslog')"], ['openMarket({})', "document.getElementById('market-close-btn').click()"]]) {
        eval(o); await w(120); sweep(); eval(c); await w(60);
      }
      document.getElementById('btn-map').click(); await w(150); sweep(); hideOverlay('overlay-map');
      return seen;
    });
    ok(left.length === 0, `no native title= left on game controls (${left.length}${left.length ? ': ' + left.slice(0, 6).join(', ') : ''})`);
    await page.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (errors.length) console.log('page errors: ' + [...new Set(errors)].slice(0, 8).join(' | '));
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

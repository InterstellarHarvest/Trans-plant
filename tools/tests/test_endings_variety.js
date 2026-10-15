// Ruling 88 (owner 2026-10-15): more arrival endings. Every destination ×
// crop arrival line and every bracket's tier quote is a list; an arrival
// shows one of each, picked once per run from STATE.artSeed — so runs vary,
// a reload shows the same one, '{day}' is filled, and a plain string (an
// older module) still reads as one line.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const errors = [];
let browser;
async function open() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.endingLines && MOD.endings && window.SceneArt);
  return page;
}
async function boot(setup) {
  const page = await open();
  await page.evaluate(o => {
    localStorage.removeItem('transplant_save_v1');
    applySetupToState(Object.assign({ trail: 'lunar', ai: 'marv', captain: 'veteran', crew: ['engineer', 'medic'], crop: 'soybean', ship: 'D' }, o));
    STATE.stowaway = null;
  }, setup || {});
  await page.waitForTimeout(150);
  return page;
}
// Renders the arrival report under a given seed / trail / crop / bracket and reads its line + quote.
const READ = async ({ seed, trail, crop, bracket, dead }) => {
  if (seed != null) STATE.artSeed = seed;
  STATE.trail = trail; STATE.crop = crop;
  STATE.cropGrowth.health = dead ? 0 : 90;
  const real = window.scoreBracket;
  if (bracket) window.scoreBracket = () => bracket;
  STATE.ended = false;
  try { window.renderEndScreen({ kind: 'ending', module: MOD.endings[0] }); } finally { window.scoreBracket = real; }
  window.showEndReport();
  return { line: document.getElementById('end-report-arrival').textContent, quote: document.getElementById('end-report-quote').textContent };
};

(async () => {
  browser = await chromium.launch();

  console.log('— the lists');
  {
    const page = await boot();
    const d = await page.evaluate(() => {
      const L = MOD.endingLines, crops = MOD.crops.crops.map(c => c.id.replace(/^crop_/, '')).concat('noplant');
      const lens = [], all = [];
      for (const t of ['lunar', 'mars', 'interstellar']) for (const c of crops) { const v = L.arrival_lines[t][c]; lens.push(Array.isArray(v) ? v.length : 0); all.push(...[].concat(v)); }
      const q = ['legendary', 'good', 'rough', 'pyrrhic', 'hollow'].map(b => Array.isArray(L.tier_quotes[b]) ? L.tier_quotes[b].length : 0);
      const allQ = Object.values(L.tier_quotes).flat();
      return { lens, all, q, allQ, bang: all.concat(allQ).filter(s => s.includes('!')) };
    });
    ok(d.lens.length === 18 && d.lens.every(n => n >= 3), `18 destination × crop lists, 3+ lines each (${d.lens.join(',')})`);
    ok(new Set(d.all).size === d.all.length, `all ${d.all.length} arrival lines distinct`);
    ok(d.q.every(n => n >= 4) && new Set(d.allQ).size === d.allQ.length, `5 brackets, 4+ distinct quotes each (${d.q.join(',')})`);
    ok(!d.bang.length, 'no "!" in the copy (only ARIA and CHIP use it)');
    await page.close();
  }

  console.log('— one per run, varied across runs');
  {
    const page = await boot();
    const r = await page.evaluate(async (READ) => {
      const read = eval(READ);
      const L = MOD.endingLines, out = { combos: [], quotes: {}, stable: true, days: [] };
      for (const [trail, crop] of [['lunar', 'soybean'], ['mars', 'zinnia'], ['interstellar', 'wheat']]) {
        const seen = new Set(); let inList = true;
        for (let s = 1; s <= 80; s++) {
          const a = await read({ seed: s * 7919, trail, crop, bracket: 'good' });
          const b = await read({ seed: s * 7919, trail, crop, bracket: 'good' });
          if (a.line !== b.line || a.quote !== b.quote) out.stable = false;
          const list = L.arrival_lines[trail][crop];
          const hit = list.find(l => l === a.line || (l.includes('{day}') && new RegExp('^' + l.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace('\\{day\\}', '(\\d+)').replace('{day}', '(\\d+)') + '$').test(a.line)));
          if (!hit) inList = false;
          if (hit && hit.includes('{day}')) out.days.push(a.line);
          seen.add(hit || a.line);
        }
        out.combos.push({ trail, crop, seen: seen.size, of: L.arrival_lines[trail][crop].length, inList });
      }
      for (const b of ['legendary', 'good', 'rough', 'pyrrhic', 'hollow']) {
        const seen = new Set();
        for (let s = 1; s <= 80; s++) seen.add((await read({ seed: s * 104729, trail: 'mars', crop: 'wheat', bracket: b })).quote);
        out.quotes[b] = { seen: seen.size, of: L.tier_quotes[b].length, inList: [...seen].every(q => L.tier_quotes[b].includes(q)) };
      }
      out.noLeft = /\{day\}/.test(document.getElementById('end-report-arrival').textContent);
      return out;
    }, READ.toString());
    for (const c of r.combos) ok(c.inList && c.seen === c.of, `${c.trail} ${c.crop}: every line shows across 80 runs (${c.seen}/${c.of}), each from its list`);
    for (const [b, q] of Object.entries(r.quotes)) ok(q.inList && q.seen === q.of, `${b}: every quote shows across 80 runs (${q.seen}/${q.of})`);
    ok(r.stable, 'the same run renders the same line and quote twice');
    ok(r.days.length > 0 && r.days.every(l => !/\{day\}/.test(l) && /\d/.test(l)), `{day} becomes the arrival day ("${(r.days[0] || '').slice(0, 48)}…")`);
    await page.close();
  }

  console.log('— a dead crop reads a noplant line');
  {
    const page = await boot({ trail: 'interstellar', crop: 'tomato' });
    const r = await page.evaluate(async (READ) => {
      const read = eval(READ);
      const a = await read({ seed: 12345, trail: 'interstellar', crop: 'tomato', dead: true });
      return { a, list: MOD.endingLines.arrival_lines.interstellar.noplant, q: MOD.endingLines.tier_quotes.hollow };
    }, READ.toString());
    ok(r.list.includes(r.a.line) && r.q.includes(r.a.quote), `dead tomato at Far Garden: a noplant line and a hollow quote ("${r.a.line.slice(0, 40)}…")`);
    await page.close();
  }

  console.log('— a reload shows the same one');
  {
    const page = await boot({ trail: 'mars', crop: 'tomato' });
    const before = await page.evaluate(async (READ) => {
      const read = eval(READ);
      STATE.artSeed = 424242; STATE.ended = false;
      const saved = writeSnapshot(); // the save format itself (saveRun also refuses mid-encounter)
      const raw = localStorage.getItem('transplant_save_v1');
      const r = await read({ trail: 'mars', crop: 'tomato', bracket: 'rough' });
      localStorage.setItem('transplant_save_v1', raw); // an arrival clears the save; put the mid-run one back
      return Object.assign({ saved }, r);
    }, READ.toString());
    await page.reload();
    await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.endingLines && window.SceneArt);
    const after = await page.evaluate(async (READ) => {
      const read = eval(READ);
      const loaded = loadRun();
      return Object.assign({ loaded: !!loaded, seed: STATE.artSeed }, await read({ trail: 'mars', crop: 'tomato', bracket: 'rough' }));
    }, READ.toString());
    ok(before.saved && after.loaded, 'saved, reloaded, loaded');
    ok(after.seed === 424242, `the run's seed survives the save (${after.seed})`);
    ok(after.line === before.line && after.quote === before.quote, `same line and quote after a reload ("${before.line.slice(0, 40)}…")`);
    await page.evaluate(() => localStorage.removeItem('transplant_save_v1'));
    await page.close();
  }

  console.log('— a plain string still reads as one line');
  {
    const page = await boot();
    const r = await page.evaluate(async (READ) => {
      const read = eval(READ);
      const L = MOD.endingLines, keep = [L.arrival_lines.lunar.wheat, L.tier_quotes.good];
      L.arrival_lines.lunar.wheat = 'A single line.'; L.tier_quotes.good = 'A single quote.';
      const a = await read({ seed: 99, trail: 'lunar', crop: 'wheat', bracket: 'good' });
      [L.arrival_lines.lunar.wheat, L.tier_quotes.good] = keep;
      return a;
    }, READ.toString());
    ok(r.line === 'A single line.' && r.quote === 'A single quote.', 'string entries render as-is');
    await page.close();
  }

  ok(!errors.length, 'page errors: ' + errors.slice(0, 3).join(' | '));
  console.log(`\nendings_variety: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();

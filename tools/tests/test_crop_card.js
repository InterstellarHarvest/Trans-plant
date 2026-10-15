// Crop problems on the cruise card (ruling 86): the stage line names the
// worst problem in the alert amber with what to do on hover; pests pulse the
// plant, sickness drains its colour; the LED still lights; clearing the
// problem brings the stage back; reduced motion stills the pulse.
const { chromium, firefox } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
const SHOTS = process.env.SHOTS || null;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
(async () => {
  const browser = await (process.env.PW_BROWSER === 'firefox' ? firefox : chromium).launch();
  const errors = [];
  const run = async (reduced) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(URL);
    await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.crops && typeof applySetupToState === 'function');
    await page.evaluate(() => {
      localStorage.removeItem('transplant_save_v1');
      applySetupToState({ trail: 'mars', ai: 'aria', captain: 'veteran', crew: ['botanist', 'medic'], crop: 'wheat', ship: 'B' });
      STATE.flags.add('departed'); showScreen('screen-cruise');
      STATE.cropGrowth.growth = 40; STATE.cropGrowth.health = 80; STATE.cropGrowth.pest = false;
      STATE.orders.waterSplit = 70; STATE.cropGrowth.waterPlant = 70;
      renderCruise();
    });
    return page;
  };
  const read = page => page.evaluate(() => {
    const st = document.getElementById('crop-stage'), icon = document.getElementById('crop-icon'), led = document.getElementById('crop-alert-led');
    const alert = getComputedStyle(document.documentElement).getPropertyValue('--crop-alert-color').trim();
    const probe = document.createElement('span'); probe.style.color = 'var(--crop-alert-color)'; document.getElementById('crop-card-mini').appendChild(probe); const alertRgb = getComputedStyle(probe).color; probe.remove(); // the token lives on the cruise screen
    return { text: st.textContent, issue: st.classList.contains('issue'), tip: st.title || st.dataset.tipDescription || ((window.Tooltip && Tooltip.resolve && Tooltip.resolve(st)) || {}).description || '', color: getComputedStyle(st).color, alertRgb,
      pest: icon.classList.contains('pest'), sick: icon.classList.contains('sick'), led: led.classList.contains('on'), ledTip: led.title || led.dataset.tipDescription || ((window.Tooltip && Tooltip.resolve && Tooltip.resolve(led)) || {}).description || '',
      filter: getComputedStyle(icon).filter, anim: getComputedStyle(icon).animationName };
  });
  const set = (page, fn) => page.evaluate(fn).then(() => page.evaluate(() => renderCruise()));

  const page = await run(false);
  let r = await read(page);
  ok(r.text === 'VEGETATIVE' && !r.issue && !r.pest && !r.sick && !r.led, `healthy: the stage line shows the stage ("${r.text}"), no marks, LED off`);

  await set(page, () => { STATE.cropGrowth.pest = true; });
  r = await read(page);
  ok(r.text === 'PESTS: TREAT IT' && r.issue && r.color === r.alertRgb, `pests: "${r.text}" in the alert amber (${r.color} vs ${r.alertRgb}, issue ${r.issue})`);
  ok(/TREAT/.test(r.tip) && /crop treatment/.test(r.tip), `pests: hover says what to do ("${r.tip}")`);
  ok(r.pest && !r.sick && r.anim === 'crop-pest-pulse' && /drop-shadow/.test(r.filter), `pests: the plant pulses amber (${r.anim}; ${r.filter.slice(0, 60)})`);
  ok(r.led && /Pests/.test(r.ledTip), `the LED still lights (${r.ledTip})`);
  if (SHOTS) await (await page.$('#crop-card-mini')).screenshot({ path: SHOTS + '/crop_card_pests.png' });

  await set(page, () => { STATE.cropGrowth.health = 15; });
  r = await read(page);
  ok(r.text === 'PESTS: TREAT IT' && r.pest && r.sick && /saturate/.test(r.filter), `pests and sick: pests named first, the plant pale and pulsing (${r.filter.slice(0, 60)})`);

  await set(page, () => { STATE.cropGrowth.pest = false; });
  r = await read(page);
  ok(r.text === 'SICK' && r.issue && /growbay/.test(r.tip) && r.sick && !r.pest && /saturate/.test(r.filter), `sick: "${r.text}", pale plant, hover points at the growbay`);
  if (SHOTS) await (await page.$('#crop-card-mini')).screenshot({ path: SHOTS + '/crop_card_sick.png' });

  await set(page, () => { STATE.cropGrowth.health = 80; STATE.orders.waterSplit = 15; STATE.cropGrowth.waterPlant = 15; });
  r = await read(page);
  ok(r.text === 'THIRSTY' && r.issue && /Orders/.test(r.tip) && !r.sick && !r.pest, `thirsty: "${r.text}", hover points at Orders`);

  await set(page, () => { STATE.orders.waterSplit = 70; STATE.cropGrowth.waterPlant = 70; });
  r = await read(page);
  ok(r.text === 'VEGETATIVE' && !r.issue && r.tip === '' && !r.led, `dealt with: the stage line is back ("${r.text}")`);

  await set(page, () => { STATE.cropGrowth.health = 0; STATE.cropGrowth.pest = true; });
  r = await read(page);
  ok(r.text === 'DEAD' && !r.issue && !r.pest && !r.sick, `a dead crop reads DEAD, no problem marks`);
  await page.close();

  const quiet = await run(true);
  await set(quiet, () => { STATE.cropGrowth.pest = true; });
  r = await read(quiet);
  ok(r.pest && (r.anim === 'none' || r.anim === ''), `reduced motion: the pest glow holds still (${r.anim})`);
  await quiet.close();

  ok(!errors.length, 'page errors: ' + errors.join(' | '));
  console.log(`\ncrop card: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();

// Every captain stands in for their own background (ruling 130).
//   For each crew role: a row that needs it is locked with no one to cover
//   it, open to a captain of that background (marked as a stand-in), and
//   that captain gets half the gains a crew specialist gets; MARV's preview
//   names the halved figure. A merchant, academic or veteran captain covers
//   no crew role. "any" rows still need someone in the crew.
const { chromium, firefox } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
const ROLES = ['botanist', 'engineer', 'medic', 'pilot', 'chef', 'xenobiologist', 'diplomat'];
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };
let browser;
async function run(setup, role) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster && typeof enterEvent === 'function');
  const r = await page.evaluate(([setup, role]) => {
    localStorage.removeItem('transplant_save_v1');
    applySetupToState(Object.assign({ trail: 'lunar', ai: 'marv', crop: 'wheat', ship: 'D' }, setup));
    STATE.stowaway = null; STATE.flags.add('departed');
    // A flat event whose row needs the role, with a plain fixed gain.
    const fits = c => c.requires_crew === role && c.outcome && typeof c.outcome === 'object' && !c.launch_minigame && !c.requires_item && !c.requires_flag && !c.gate
      && Object.entries(c.outcome.resources || {}).some(([k, v]) => v > 1 && k !== 'morale');
    const ev = Object.values(EVENTS).find(e => e.active !== false && !e.layers && !e.requires_flag && (e.choices || []).some(fits));
    if (!ev) return { none: true };
    const ch = ev.choices.find(fits);
    const ent = Object.entries(ch.outcome.resources).filter(([kk, v]) => v > 1 && kk !== 'morale');
    const k = (ent.find(([kk]) => kk !== 'gold') || ent[0])[0];
    const get = () => k === 'gold' ? STATE.goldAmount : STATE.resources[k];
    if (k === 'gold') STATE.goldAmount = 10; else STATE.resources[k] = 10; STATE.researchReady = false;
    enterEvent(STATE.byId[STATE.currentId], ev);
    if (typeof finishAllTyping === 'function') finishAllTyping();
    const btn = [...document.querySelectorAll('#enc-choices .enc-choice')].find(b => b.textContent.includes(pricedText(interpolateStowawayTokens(ch.text), ch).slice(0, 18)));
    if (!btn) return { ev: ev.id, missing: true };
    const locked = btn.classList.contains('locked'), sub = btn.innerText, tip = btn.title || '';
    if (!locked) btn.click();
    return { ev: ev.id, k, authored: ch.outcome.resources[k], gain: get() - 10, locked, sub, tip };
  }, [setup, role]);
  r.errs = errs;
  await page.close();
  return r;
}
(async () => {
  browser = await (process.env.PW_BROWSER === 'firefox' ? firefox : chromium).launch();
  for (const role of ROLES) {
    const others = ROLES.filter(x => x !== role);
    const crew2 = [others[0], others[1]];
    const nobody = await run({ captain: 'veteran', crew: crew2 }, role);
    if (nobody.none) { ok(false, role + ': no flat event needs this role with a plain gain'); continue; }
    const cap = await run({ captain: role, crew: crew2 }, role);
    const spec = await run({ captain: 'veteran', crew: [role, others[0]] }, role);
    ok(!nobody.missing && nobody.locked, `${role}: locked with no one to cover it (${nobody.ev})`);
    ok(!cap.locked && /stands in|captain, half gains/.test(cap.sub), `${role} captain: open and marked as a stand-in (${cap.ev}: "${(cap.sub || '').replace(/\n/g, ' | ')}")`);
    ok(cap.gain < spec.gain && cap.gain <= Math.ceil(spec.gain / 2), `${role} captain gets about half the gain (${cap.k}: captain +${cap.gain}, specialist +${spec.gain})`);
    ok(!/MARV/.test(cap.sub) || cap.sub.includes('+' + cap.gain + ' '), `${role}: MARV's preview names the halved +${cap.gain} (${cap.sub})`);
    ok(!cap.errs.length && !spec.errs.length && !nobody.errs.length, role + ': no page errors ' + cap.errs.concat(spec.errs, nobody.errs).slice(0, 2).join(' | '));
  }
  for (const captain of ['merchant', 'academic', 'veteran']) {
    const r = await run({ captain, crew: ['botanist', 'engineer'] }, 'pilot');
    ok(r.none || r.locked, `${captain} captain covers no pilot row (${r.ev})`);
  }
  console.log('ruling 130: ' + pass + ' passed, ' + fail + ' failed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();

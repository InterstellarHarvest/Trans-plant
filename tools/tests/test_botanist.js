// Station botanist (owner ruling 2026-10-11): event_station_012 ports the
// demo-encounter promenade botanist (APPROACH THE BOTANIST / botanist_tip /
// botanist_sample) into the engine. Every choice is driven through the real
// encounter screen and checked against what its text says it does: the
// advice (water split + the talk-to-it growth modifier), the cuttings trade
// (crop for biocomponent), the treatment counter (gold after the CHIP /
// Merchant discount, crop health, pests, the crop treatment bottle), the
// one-shot locks, revisit copy, the walk-away row and save/reload.
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:8181/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
let browser;
const errors = [];
const EV = 'event_station_012';
async function boot(setup) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.crew_roster && MOD.flavor);
  await page.evaluate(o => {
    localStorage.removeItem('transplant_save_v1');
    applySetupToState(Object.assign({ trail: 'mars', ai: 'marv', captain: 'veteran', crew: ['engineer', 'pilot'], crop: 'wheat', ship: 'B' }, o));
    STATE.stowaway = null;
  }, setup || {});
  await page.waitForTimeout(200);
  return page;
}
// Puts the ship at a station and opens the botanist there. `pre` tunes the
// crop/gold/orders first.
async function enter(page, pre) {
  await page.evaluate(async (pre) => {
    const st = STATE.nodes.find(n => n.node_type === 'station');
    STATE.currentId = st.id;
    if (pre) {
      const cg = STATE.cropGrowth;
      if (pre.health != null) cg.health = pre.health;
      if (pre.pest != null) cg.pest = pre.pest;
      if (pre.talked != null) cg.talked = pre.talked;
      if (pre.split != null) setWaterSplit(pre.split);
      if (pre.gold != null) STATE.goldAmount = pre.gold;
      if (pre.bio != null) STATE.materials.biocomponent = pre.bio;
    }
    // The outcome's day would tick the crop's own daily health change on
    // top; hold that tick so each check sees exactly the choice's effect.
    STATE.cropGrowth.lastTickDay = 1e9;
    // clearCropPest() catches the growbay up first (soybean ruling), which
    // re-anchors lastTickDay — hold the tick again after it.
    if (!window._clearHeld) {
      const real = window.clearCropPest;
      window.clearCropPest = function () { const r = real.apply(this, arguments); STATE.cropGrowth.lastTickDay = 1e9; return r; };
      window._clearHeld = true;
    }
    enterEvent(st, EVENTS['event_station_012']);
    await new Promise(r => setTimeout(r, 350));
  }, pre || null);
}
async function view(page) {
  return page.evaluate(() => {
    finishAllTyping();
    const t = id => (document.getElementById(id) || {}).textContent || '';
    return {
      title: t('enc-narr-title'), body: t('enc-narr-body'), line: t('enc-dialog-line'), ai: t('enc-ai-text'),
      speaker: t('enc-dialog-name'),
      choices: [...document.querySelectorAll('#enc-choices .enc-choice')].map(b => ({
        text: (b.querySelector('.ch-text') || {}).textContent || '',
        sub: (b.querySelector('.ch-sub') || {}).textContent || '',
        locked: b.classList.contains('locked'),
      })),
    };
  });
}
const pick = (v, t) => v.choices.find(c => c.text.includes(t));
async function click(page, t) {
  const hit = await page.evaluate(t => {
    const b = [...document.querySelectorAll('#enc-choices .enc-choice')].find(x => (x.querySelector('.ch-text') || {}).textContent.includes(t));
    if (!b || b.classList.contains('locked')) return false;
    b.click(); return true;
  }, t);
  await page.waitForTimeout(380);
  return hit;
}
const snap = page => page.evaluate(() => ({
  gold: STATE.goldAmount, day: STATE.daysElapsed, health: STATE.cropGrowth.health, pest: STATE.cropGrowth.pest,
  talked: !!STATE.cropGrowth.talked, split: STATE.orders.waterSplit, plant: STATE.cropGrowth.waterPlant,
  bio: STATE.materials.biocomponent || 0, items: STATE.items.slice(), morale: STATE.resources.morale,
  outcome: STATE.currentOutcomeId, layer: STATE.layerStack && STATE.layerStack[STATE.layerStack.length - 1],
}));

(async () => {
  browser = await chromium.launch();

  console.log('— the event: data, pool, room, face');
  {
    const page = await boot();
    const r = await page.evaluate(() => {
      const ev = EVENTS['event_station_012'];
      const st = STATE.nodes.find(n => n.node_type === 'station');
      return { npc: ev.npc, once: ev.once, nodes: ev.node_type, elig: eventEligible(ev, st, activeTriggers()),
               notElsewhere: STATE.nodes.filter(n => n.node_type !== 'station' && n.node_type !== 'fork').every(n => !eventEligible(ev, n, activeTriggers())) };
    });
    ok(r.npc.disposition === 'station_crew' && r.npc.job === 'botanist' && r.npc.species === null && r.once === false, 'station_crew / botanist, species rolled, repeatable at every station (once: false)');
    ok(r.elig && r.notElsewhere, 'eligible at stations, nowhere else');
    // A sick or infested crop at a station makes the botanist far likelier
    // (trigger crop_sick / crop_pest weigh like a crisis).
    const draws = await page.evaluate(() => {
      const st = STATE.nodes.find(n => n.node_type === 'station');
      STATE.currentId = st.id;
      const count = () => { let n = 0; for (let i = 0; i < 400; i++) { STATE.hardStreak = 0; STATE.pityRelief = 0; if (selectEvent(st) && selectEvent(st).id === 'event_station_012') n++; } return n; };
      STATE.cropGrowth.pest = false; STATE.cropGrowth.health = 80;
      const calm = count();
      STATE.cropGrowth.pest = true;
      const pest = count();
      return { calm, pest };
    });
    ok(draws.pest > draws.calm * 2, `an infested crop brings the botanist out (${draws.calm}/400 calm → ${draws.pest}/400 with pests)`);
    await enter(page);
    await page.waitForTimeout(600);
    const art = await page.evaluate(() => ({
      bg: document.getElementById('enc-backdrop').style.backgroundImage,
      subj: document.getElementById('enc-subject-head').getAttribute('style') || '',
      plate: (document.getElementById('enc-subject-name') || {}).textContent,
      ctx: STATE.npcCtx,
    }));
    ok(/station\/promenade/.test(art.bg), 'backdrop: the promenade (demo canon: the hydroponic display) — ' + art.bg.slice(0, 60));
    ok(/sprites\/npc\/station_crew\/botanist\/[a-z]+\/\d\/spritesheet\.png/.test(art.subj), 'talking head: a botanist sheet from sprites/npc/station_crew/botanist (' + art.ctx.species + ')');
    ok(art.plate === 'STATION BOTANIST', 'name plate STATION BOTANIST');
    await page.close();
  }

  console.log('— the hub (demo copy, per-AI lines, revisit)');
  {
    const page = await boot({ ai: 'ajoy' });
    await enter(page);
    const v = await view(page);
    ok(v.title === 'STATION BOTANIST' && /third leaf pair on the dwarf wheat/.test(v.line), 'demo opener: title + the dwarf-wheat line');
    ok(v.ai === 'They will tell you everything you didn\'t ask. Listen anyway.', 'AJOY says her demo line');
    ok(v.choices.map(c => c.text.replace(/\s+/g, ' ').trim()).join(' | ') === '"What\'s the trick to healthy crops in transit?" | OFFER A SAMPLE | BUY CROP TREATMENT | BACK TO THE CONCOURSE', 'choices: advice · sample · treatment · back to the concourse');
    ok(/A cutting of your wheat/.test(pick(v, 'OFFER A SAMPLE').sub), 'the sample names the run\'s crop: ' + pick(v, 'OFFER A SAMPLE').sub);
    const s0 = await snap(page);
    await click(page, 'BACK TO THE CONCOURSE');
    const s1 = await snap(page);
    const cur = await page.evaluate(() => STATE.currentEvent);
    ok(!cur && s1.day === s0.day && s1.gold === s0.gold, 'walking away costs nothing and ends the visit');
    await page.close();
  }

  console.log('— advice: underwatered wheat');
  {
    const page = await boot();
    await enter(page, { split: 20, health: 70 });
    await click(page, 'trick to healthy crops');
    let v = await view(page);
    ok(v.body === 'They wipe their hands on the apron. The wipe makes things worse.' && v.line === "Light cycles, water cycles, conversation. Plants fed conversation grow 4% faster. Don't ask me why. Talk to your crop.", 'the demo tip line, verbatim (and its 4% is the real modifier)');
    ok(await page.evaluate(() => CROP_TALK_GROWTH) === 4, 'CROP_TALK_GROWTH is the 4 the line promises');
    ok(v.ai === 'Anecdotal claim. Mechanism: undetermined.', 'MARV keeps his demo line');
    ok(pick(v, 'DO IT THEIR WAY').sub.includes('Water split 20% → 50% · +4% growth'), 'DO IT THEIR WAY says what it does: ' + pick(v, 'DO IT THEIR WAY').sub);
    // The diagnosis reads the real crop (Bible: botanist.diagnose reads the crop state).
    await click(page, 'And my wheat?');
    v = await view(page);
    ok(/it wants 50 percent of the ship's water, and you give it 20\. They wince/.test(v.body) && v.line === 'Thirsty. Give it the water.', 'diagnosis: ' + v.body.slice(0, 40) + '… / "' + v.line + '"');
    ok(pick(v, 'DO IT THEIR WAY').sub.includes('Water split 20% → 50%'), 'the same advice is on offer from the diagnosis');
    await click(page, 'BACK');
    const before = await page.evaluate(() => ({ f: cropGrowthFactorAt(50) }));
    const s0 = await snap(page);
    await click(page, 'DO IT THEIR WAY');
    const s1 = await snap(page);
    ok(s1.split === 50 && s1.plant === 50, 'water split set to the crop\'s need (orders and growbay agree: 50)');
    ok(s1.talked, 'the crew talks to the crop now');
    ok(s1.day === s0.day && s1.gold === s0.gold && s1.health === s0.health && s1.morale === s0.morale, 'free, no days');
    ok(s1.layer === 'botanist' && !s1.outcome, 'back at the botanist (the visit goes on)');
    const logged = await page.evaluate(() => (STATE.shipLog || []).map(e => e.text).join('\n'));
    ok(/botanist's advice, taken: water split 20% → 50%; the crew talks to the wheat now \(\+4% growth\)/.test(logged), 'the cruise log records exactly what changed');
    const after = await page.evaluate(() => ({ f: cropGrowthFactorAt(50), h: STATE.cropGrowth.health }));
    ok(Math.abs((after.f - before.f) - after.h / 100 * 0.04) < 1e-9, `growth factor +4 points on the modifier sum (${before.f.toFixed(4)} → ${after.f.toFixed(4)})`);
    v = await view(page);
    ok(/still elbow-deep in the gel tray/.test(v.body) && /Did you have another question/.test(v.line), 'hub revisit copy (demo)');
    await click(page, 'trick to healthy crops');
    v = await view(page);
    ok(/back at the gel tray/.test(v.body) && v.line.length > 10 && !/grow 4% faster/.test(v.line), 'tip revisit: a line from the botanist advise pool: ' + v.line.slice(0, 70));
    ok(pick(v, 'DO IT THEIR WAY').locked && /Advice already taken/.test(pick(v, 'DO IT THEIR WAY').sub), 'the advice is one-shot (consume): ' + pick(v, 'DO IT THEIR WAY').sub);
    // The growbay lists the modifier with its real number.
    await click(page, 'BACK');
    await page.evaluate(() => { advanceAfterEvent(); });
    await page.waitForTimeout(200);
    const gb = await page.evaluate(() => { openGrowbay(); const t = document.getElementById('overlay-growbay').innerText; closeGrowbay(); return t; });
    ok(/Talked to daily/.test(gb) && /\+4% growth/.test(gb), 'growbay ACTIVE list: "Talked to daily · +4% growth"');
    // Save / reload keeps it.
    await page.evaluate(() => saveRun());
    await page.reload();
    await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.flavor);
    await page.evaluate(() => loadRun()); await page.waitForTimeout(300);
    const re = await page.evaluate(() => ({ talked: !!STATE.cropGrowth.talked, split: STATE.orders.waterSplit }));
    ok(re.talked && re.split === 50, 'save/reload keeps the habit and the split');
    await page.close();
  }

  console.log('— advice: the other crop states');
  {
    const page = await boot();
    await enter(page, { split: 85 });
    await click(page, 'trick to healthy crops');
    await click(page, 'And my wheat?');
    let v = await view(page);
    ok(/give it 85/.test(v.body) && /drowning/.test(v.body) && v.line === 'Drowning. Ease off.' && pick(v, 'DO IT THEIR WAY').sub.includes('Water split 85% → 50%'), 'overwatered by more than 20 (root rot): 85% → 50%');
    await click(page, 'DO IT THEIR WAY');
    let s = await snap(page);
    ok(s.split === 50 && s.layer === 'botanist_tip', 'taken from the diagnosis: lands, back to the tip');
    v = await view(page);
    ok(pick(v, 'DO IT THEIR WAY').locked, 'the tip\'s own DO IT THEIR WAY is spent too (one consume id)');
    await page.close();
  }
  {
    const page = await boot();
    await enter(page, { split: 62 }); // over by 12: the growbay calls it well-watered, no harm
    await click(page, 'trick to healthy crops');
    await click(page, 'And my wheat?');
    let v = await view(page);
    ok(/Somebody aboard can count/.test(v.body) && v.line === 'Water is right. Now talk to it.' && pick(v, 'DO IT THEIR WAY').sub.includes('+4% growth') && !/Water split/.test(pick(v, 'DO IT THEIR WAY').sub), 'water in a band the growbay doesn\'t punish: only the growth tip ("' + pick(v, 'DO IT THEIR WAY').sub + '")');
    await click(page, 'DO IT THEIR WAY');
    const s = await snap(page);
    ok(s.split === 62 && s.talked, 'split left alone (62), habit learned');
    await page.close();
  }
  {
    const page = await boot();
    await enter(page, { split: 50, talked: true });
    await click(page, 'trick to healthy crops');
    const v = await view(page);
    ok(pick(v, 'DO IT THEIR WAY').locked && /Already doing it their way/.test(pick(v, 'DO IT THEIR WAY').sub), 'nothing left to change → locked, never a no-op: ' + pick(v, 'DO IT THEIR WAY').sub);
    await page.close();
  }
  {
    const page = await boot();
    await page.evaluate(() => { STATE.resources.water = 0; });
    await enter(page, { split: 50 });
    await click(page, 'trick to healthy crops');
    await click(page, 'And my wheat?');
    const v = await view(page);
    ok(/tanks are dry/.test(v.body) && /empty tank/.test(v.line), 'dry tanks: the diagnosis doesn\'t call the water fine');
    await page.close();
  }
  {
    const page = await boot({ crew: ['botanist', 'pilot'] });
    await enter(page, { split: 20 });
    await click(page, 'trick to healthy crops');
    await click(page, 'And my wheat?');
    const v = await view(page);
    const need = await page.evaluate(() => Math.round(cropWaterNeed()));
    ok(need === 43 && /wants 43 percent/.test(v.body) && pick(v, 'DO IT THEIR WAY').sub.includes('20% → 43%'), 'a botanist aboard lowers the need (−15%): 43%');
    await click(page, 'DO IT THEIR WAY');
    ok((await snap(page)).split === 43, 'and the split lands on 43');
    await page.close();
  }
  {
    const page = await boot();
    await page.evaluate(() => { STATE.cropGrowth.health = 0; STATE.flags.add('crop_death_accepted'); });
    await enter(page);
    let v = await view(page);
    ok(pick(v, 'OFFER A SAMPLE').locked && pick(v, 'BUY CROP TREATMENT').locked && /No living crop/.test(pick(v, 'BUY CROP TREATMENT').sub), 'dead crop: sample and treatment locked ("No living crop")');
    await click(page, 'trick to healthy crops');
    await click(page, 'And my');
    v = await view(page);
    ok(/read the answer off your face/.test(v.body) && pick(v, 'DO IT THEIR WAY').locked && /No living crop/.test(pick(v, 'DO IT THEIR WAY').sub), 'dead crop: the botanist says so; the advice locks');
    await page.close();
  }

  console.log('— trading cuttings');
  {
    const page = await boot();
    await enter(page, { health: 80, bio: 1 });
    await click(page, 'OFFER A SAMPLE');
    let v = await view(page);
    ok(/cutting of the wheat/.test(v.body) && /Station-adapted cuttings/.test(v.line), 'the sample layer (demo body, cuttings line)');
    ok(v.ai === 'One cutting out, three biocomponents in. Exchange rate: favorable. Suspiciously.', 'MARV prices the swap truthfully');
    ok(pick(v, 'MAKE THE TRADE').sub === '+3 BIOCOMPONENT · −5 CROP', 'MAKE THE TRADE shows its terms: ' + pick(v, 'MAKE THE TRADE').sub);
    // Backing out costs nothing and doesn't spend the trade.
    await click(page, 'TAKE IT BACK');
    let s = await snap(page);
    ok(s.health === 80 && s.bio === 1 && s.layer === 'botanist', 'TAKE IT BACK: nothing moves');
    await click(page, 'OFFER A SAMPLE');
    const s0 = await snap(page);
    await click(page, 'MAKE THE TRADE');
    s = await snap(page);
    ok(s.health === 75 && s.bio === 4, `the trade lands: crop ${s0.health} → ${s.health}, biocomponent ${s0.bio} → ${s.bio}`);
    ok(s.gold === s0.gold && s.day === s0.day + 1 && s.outcome === 'botanist_traded', 'no gold; a day at the display (trivial)');
    v = await view(page);
    ok(v.title === 'CUTTINGS EXCHANGED' && v.speaker === 'STATION BOTANIST' && v.line.length > 5, 'outcome: CUTTINGS EXCHANGED with a botanist farewell line');
    // One-shot: back at this station, the trade is spent.
    await page.evaluate(() => advanceAfterEvent());
    await enter(page);
    await click(page, 'OFFER A SAMPLE');
    v = await view(page);
    ok(pick(v, 'MAKE THE TRADE').locked && /Sample already exchanged/.test(pick(v, 'MAKE THE TRADE').sub), 'same station again: "Sample already exchanged"');
    // A different station re-arms it.
    const other = await page.evaluate(async () => {
      const sts = STATE.nodes.filter(n => n.node_type === 'station');
      if (sts.length < 2) return null;
      STATE.currentId = sts[1].id; enterEvent(sts[1], EVENTS['event_station_012']);
      await new Promise(r => setTimeout(r, 300));
      return true;
    });
    if (other) {
      await click(page, 'OFFER A SAMPLE');
      v = await view(page);
      ok(!pick(v, 'MAKE THE TRADE').locked, 'a different station\'s botanist trades again');
    }
    await page.close();
  }
  {
    const page = await boot();
    await enter(page, { health: 10 });
    const v = await view(page);
    ok(pick(v, 'OFFER A SAMPLE').locked && /Too weak to take a cutting/.test(pick(v, 'OFFER A SAMPLE').sub), 'a crop at 10 health is too weak to cut');
    await page.close();
  }
  {
    const page = await boot();
    await enter(page, { health: 3 });
    const v = await view(page);
    ok(pick(v, 'OFFER A SAMPLE').locked, 'and at 3 it stays locked (a cutting could never kill it)');
    await page.close();
  }

  console.log('— the treatment counter');
  {
    const page = await boot();
    await enter(page, { health: 60, pest: true, gold: 50 });
    await click(page, 'BUY CROP TREATMENT');
    let v = await view(page);
    ok(/TREAT IT HERE — 12 gold/.test(pick(v, 'TREAT IT HERE').text) && pick(v, 'TREAT IT HERE').sub === '+25 CROP · PESTS CLEARED', 'full price, no discount: "— 12 gold", ' + pick(v, 'TREAT IT HERE').sub);
    ok(/18 gold/.test(pick(v, 'BOTTLE').text) && pick(v, 'BOTTLE').sub === '+CROP TREATMENT', 'bottle: "— 18 gold", ' + pick(v, 'BOTTLE').sub);
    const s0 = await snap(page);
    await click(page, 'TREAT IT HERE');
    const s = await snap(page);
    ok(s.gold === 38 && s.health === 85 && s.pest === false && s.day === s0.day + 1, `treated: −12 gold (${s0.gold}→${s.gold}), crop 60→${s.health}, pests cleared, a day`);
    await page.close();
  }
  {
    const page = await boot({ ai: 'chip', captain: 'merchant' });
    await enter(page, { health: 60, pest: false, gold: 50 });
    await click(page, 'BUY CROP TREATMENT');
    let v = await view(page);
    const mult = await page.evaluate(() => eventGoldMult());
    ok(Math.abs(mult - 0.765) < 1e-9, 'CHIP + Merchant at a station: ×0.765');
    ok(/— 9 gold/.test(pick(v, 'TREAT IT HERE').text) && /— 14 gold/.test(pick(v, 'BOTTLE').text), 'prices rewritten in the text: 12 → 9, 18 → 14');
    ok(pick(v, 'TREAT IT HERE').sub === '+25 CROP', 'no pests aboard → the preview doesn\'t promise to clear any: ' + pick(v, 'TREAT IT HERE').sub);
    ok(/CHIP's discount applies/.test(v.ai), 'CHIP\'s counter line');
    await click(page, 'BOTTLE');
    let s = await snap(page);
    ok(s.gold === 36 && s.items.filter(i => i === 'crop_treatment').length === 1, `bottle: charged 14 (50→${s.gold}), crop treatment in the hold`);
    const used = await page.evaluate(() => { const before = STATE.cropGrowth.health; STATE.cropGrowth.pest = true; const why = ITEM_USE.crop_treatment.can(); const msg = ITEM_USE.crop_treatment.use(); return { why, msg, d: STATE.cropGrowth.health - before, pest: STATE.cropGrowth.pest }; });
    ok(!used.why && used.d === 30 && used.pest === false, 'the bottle works from the hold: +30 crop, pests cleared');
    await page.close();
  }
  {
    const page = await boot({ ai: 'chip', captain: 'merchant' });
    await enter(page, { health: 60, pest: true, gold: 50 });
    await click(page, 'BUY CROP TREATMENT');
    await click(page, 'TREAT IT HERE');
    const s = await snap(page);
    ok(s.gold === 41 && s.health === 85 && !s.pest, `discounted treatment charges 9 (50→${s.gold})`);
    await page.close();
  }
  {
    const page = await boot({ crew: ['botanist', 'pilot'] });
    await enter(page, { health: 50, gold: 50 });
    await click(page, 'BUY CROP TREATMENT');
    const v = await view(page);
    ok(pick(v, 'TREAT IT HERE').sub === '+31 CROP', 'a botanist aboard: the preview says +31 (25 × 1.25)');
    await click(page, 'TREAT IT HERE');
    ok((await snap(page)).health === 81, 'and +31 lands');
    await page.close();
  }
  {
    const page = await boot();
    await enter(page, { health: 90, pest: false, gold: 50 });
    await click(page, 'BUY CROP TREATMENT');
    const v = await view(page);
    ok(pick(v, 'TREAT IT HERE').sub === '+10 CROP', 'near full health the preview shows what fits: ' + pick(v, 'TREAT IT HERE').sub);
    await click(page, 'TREAT IT HERE');
    ok((await snap(page)).health === 100, 'and the crop caps at 100');
    await page.close();
  }
  {
    const page = await boot();
    await enter(page, { health: 100, pest: false, gold: 50 });
    await click(page, 'BUY CROP TREATMENT');
    const v = await view(page);
    ok(pick(v, 'TREAT IT HERE').locked && /The crop is healthy/.test(pick(v, 'TREAT IT HERE').sub) && !pick(v, 'BOTTLE').locked, 'healthy crop: treating locks, the bottle stays on sale');
    await page.close();
  }
  {
    const page = await boot();
    await enter(page, { health: 100, pest: true, gold: 50 });
    await click(page, 'BUY CROP TREATMENT');
    const v = await view(page);
    ok(!pick(v, 'TREAT IT HERE').locked && pick(v, 'TREAT IT HERE').sub === 'PESTS CLEARED', 'full health but infested: pest clearing alone (' + pick(v, 'TREAT IT HERE').sub + ')');
    await page.close();
  }
  {
    const page = await boot();
    await enter(page, { health: 60, gold: 11 });
    await click(page, 'BUY CROP TREATMENT');
    let v = await view(page);
    ok(pick(v, 'TREAT IT HERE').locked && /Needs 12g/.test(pick(v, 'TREAT IT HERE').sub) && pick(v, 'BOTTLE').locked, 'short of gold: both locked ("Needs 12g")');
    // BACK returns to the hub with the revisit copy for the counter next time.
    await click(page, 'BACK');
    await click(page, 'BUY CROP TREATMENT');
    v = await view(page);
    ok(/still open/.test(v.body) && /Changed your mind/.test(v.line), 'counter revisit copy');
    await page.close();
  }

  ok(!errors.length, 'page errors: ' + errors.slice(0, 3).join(' | '));
  console.log(`\nbotanist: ${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();

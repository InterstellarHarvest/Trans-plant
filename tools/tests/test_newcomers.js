// Newcomers are people aboard (ruling 126): a welcomed stowaway riding as
// a passenger eats and is named on the cruise screen; every stowaway and
// rescued crew member has a CREW_ATLAS sheet that shows once delivered
// (crew strip, crew screen, the reveal scene's face) and the silhouette
// until then; the Pod Garden's gardener is Hester Quill.
const { chromium, firefox } = require('playwright');
const URL = process.env.URL || 'http://localhost:8177/index.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

(async () => {
  const browser = await (process.env.PW_BROWSER === 'firefox' ? firefox : chromium).launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => typeof MOD !== 'undefined' && MOD.items && MOD.flavor && typeof enterEvent === 'function' && typeof renderCruise === 'function');
  await page.evaluate(() => { localStorage.removeItem('transplant_save_v1'); });

  const setup = (crew) => page.evaluate(crew => {
    applySetupToState({ trail: 'mars', ai: 'marv', captain: 'veteran', crew, crop: 'wheat', ship: 'D' });
    STATE.stowaway = null; STATE.flags.add('departed');
    showScreen('screen-cruise'); renderCruise();
  }, crew);

  console.log('— a stowaway riding as a passenger');
  await setup(['engineer', 'pilot']);
  const rider = await page.evaluate(() => {
    const out = {};
    const auditor = MOD.flavor.stowaway_identities.find(s => s.id === 'stowaway_auditor');
    out.m0 = mouthsMult();
    out.chip0 = document.getElementById('cruise-passengers').textContent;
    // Welcomed with no crew role to take: a passenger for the rest of the way.
    STATE.stowaway = { identity: auditor, revealed: true };
    applyOutcomeEffects({ stowaway_resolve: 'welcome' });
    out.flag = STATE.flags.has('stowaway_passenger');
    out.m1 = mouthsMult();
    renderCruise();
    const chip = document.getElementById('cruise-passengers');
    out.chip1 = chip.textContent; out.tip1 = chip.title;
    out.visible = getComputedStyle(chip).display !== 'none';
    // A rescued passenger beside them: both named, each leaves when they do.
    STATE.passengers = [{ id: 'survivor_hester', name: 'Hester Quill', reward: null, farewell: null }];
    renderCruise();
    out.chip2 = chip.textContent; out.tip2 = chip.title; out.m2 = mouthsMult();
    // The strip's three cards never move for a passenger.
    out.slots = document.querySelectorAll('#crew-strip .crew-slot').length;
    return out;
  });
  ok(rider.chip0 === '', 'no passengers: no passenger line');
  ok(rider.flag && Math.abs((rider.m1 - rider.m0) - 1 / 3) < 1e-9, `the riding stowaway eats like one of the crew (mouths ${(rider.m0 * 3).toFixed(0)} → ${(rider.m1 * 3).toFixed(0)})`);
  ok(rider.visible && /PASSENGER/.test(rider.chip1) && /Meridian Slate/.test(rider.chip1) && /rides the rest of the way/.test(rider.tip1), `the cruise screen names them (${rider.chip1})`);
  ok(/PASSENGERS/.test(rider.chip2) && /Meridian Slate/.test(rider.chip2) && /Hester Quill/.test(rider.chip2) && /Hester Quill steps off at the next station/.test(rider.tip2) && Math.abs(rider.m2 - rider.m1 - 1 / 3) < 1e-9, `a rescued rider joins the line and eats too (${rider.chip2})`);
  ok(rider.slots === 3, 'the crew strip keeps its three cards');

  console.log('— newcomer portraits');
  await setup(['pilot']);
  const art = await page.evaluate(async () => {
    const out = {};
    const ids = [...MOD.flavor.stowaway_identities.map(s => s.id), 'survivor_mira', 'survivor_hester', 'dock_engineer_tal'];
    out.allInAtlas = ids.every(id => CREW_ATLAS[id] && CREW_ATLAS[id].sheet);
    out.allDelivered = ids.every(id => !NO_CREW_ART.has(id));
    // Every sheet loads (376×294, the roster's layout).
    out.sizes = await Promise.all(ids.map(id => new Promise(res => { const i = new Image(); i.onload = () => res(i.naturalWidth + 'x' + i.naturalHeight); i.onerror = () => res('missing ' + id); i.src = CREW_ATLAS[id].sheet; })));
    // A stowaway joins as botanist (Old Marrow): their own icon on the strip.
    const marrow = MOD.flavor.stowaway_identities.find(s => s.id === 'stowaway_gardener');
    STATE.stowaway = { identity: marrow, revealed: true };
    applyOutcomeEffects({ stowaway_resolve: 'welcome' });
    renderCruise();
    const card = () => [...document.querySelectorAll('#crew-strip .crew-slot')].find(s => /OLD MARROW/.test(s.textContent));
    out.own = { sprite: crewSpriteIdOf('botanist'), icon: card() && card().querySelector('.crew-icon').outerHTML };
    // A newcomer still waiting on art keeps the silhouette.
    NO_CREW_ART.add('stowaway_gardener');
    renderCruise();
    out.waiting = { sprite: crewSpriteIdOf('botanist'), icon: card() && card().querySelector('.crew-icon').outerHTML };
    NO_CREW_ART.delete('stowaway_gardener');
    // The roster crew are untouched.
    out.roster = crewSpriteIdOf('pilot');
    return out;
  });
  ok(art.allInAtlas && art.allDelivered, 'all ten newcomers have an atlas entry and their art');
  ok(art.sizes.every(s => s === '376x294'), `every newcomer sheet loads at 376×294 (${[...new Set(art.sizes)].join(', ')})`);
  ok(art.own.sprite === 'stowaway_gardener' && /has-sprite/.test(art.own.icon || '') && /data-crew-id="stowaway_gardener"/.test(art.own.icon || ''), 'a joined stowaway shows their own icon on the crew strip');
  ok(art.waiting.sprite === null && /👤/.test(art.waiting.icon || '') && !/has-sprite/.test(art.waiting.icon || ''), 'a newcomer still waiting on art keeps the silhouette');
  ok(art.roster === 'reeves', 'the roster pilot keeps their sheet');

  console.log('— the reveal scene');
  await setup(['engineer', 'pilot']);
  const reveal = async waiting => page.evaluate(waiting => {
    const chef = MOD.flavor.stowaway_identities.find(s => s.id === 'stowaway_chef');
    STATE.stowaway = { identity: chef, revealed: false };
    if (waiting) NO_CREW_ART.add('stowaway_chef');
    const n = STATE.nodes.find(x => x.node_type !== 'station' && x.node_type !== 'fork' && x !== STATE.nodes[0]);
    STATE.currentId = n.id;
    enterEvent(n, EVENTS.event_shipboard_001); finishAllTyping();
    return { revealed: STATE.stowaway.revealed, by: STATE.stowaway.revealedByEvent };
  }, waiting);
  const plate = () => page.evaluate(() => { const p = document.getElementById('enc-subject-name'); const s = document.getElementById('enc-subject'); return { shown: !document.getElementById('screen-encounter').classList.contains('no-subject'), name: p ? p.textContent : '', html: s ? s.innerHTML : '' }; });
  const r1 = await reveal(false);
  await page.waitForTimeout(800);
  const p1 = await plate();
  await page.evaluate(() => returnToHub());
  const r0 = await reveal(true);
  await page.waitForTimeout(400);
  const p0 = await plate();
  await page.evaluate(() => { returnToHub(); NO_CREW_ART.delete('stowaway_chef'); });
  ok(r1.revealed && r1.by === 'event_shipboard_001' && p1.shown && /BASTIAN OKE/.test(p1.name) && /spritesheet_stowaway_chef/.test(p1.html), `the reveal shows the stowaway's own face (plate "${p1.name}")`);
  ok(r0.revealed && !p0.shown, 'a stowaway still waiting on art: the reveal stays as written, no one in the frame');

  console.log('— the growbay (stills for now)');
  await setup([]);
  const gb = await page.evaluate(async () => {
    applyOutcomeEffects(EVENTS.event_derelict_010.choices.find(c => c.text === 'Knock on the last pod').outcome);
    applyOutcomeEffects(EVENTS.event_station_009.outcomes.bar_hire);
    renderCruise(); openGrowbay();
    await new Promise(r => setTimeout(r, 300));
    const sp = document.getElementById('crew-sprite');
    const out = { bg: sp.style.backgroundImage, pos: sp.style.backgroundPosition, w: sp.style.width, h: sp.style.height, empty: sp.classList.contains('empty') };
    // No animation plays for a still: the frame holds after a while.
    await new Promise(r => setTimeout(r, 2500));
    out.posLater = sp.style.backgroundPosition;
    document.getElementById('tender-slot').click();
    out.rows = [...document.querySelectorAll('#tender-picker .gb-picker-row')].map(r => ({ name: r.querySelector('.gb-picker-name').textContent, css: r.querySelector('.gb-tender-portrait').getAttribute('style') || '', emoji: r.querySelector('.gb-tender-portrait').textContent }));
    document.getElementById('tender-slot').classList.remove('open');
    // Waiting on art: the bay stands empty and the picker shows the emoji.
    NO_CREW_ART.add('survivor_hester');
    closeGrowbay(); openGrowbay();
    await new Promise(r => setTimeout(r, 200));
    out.waitingEmpty = document.getElementById('crew-sprite').classList.contains('empty');
    NO_CREW_ART.delete('survivor_hester');
    closeGrowbay();
    return out;
  });
  ok(!gb.empty && /spritesheet_survivor_hester/.test(gb.bg) && gb.pos === '-295px -1px' && gb.w === '80px' && gb.h === '192px', `the botanist rescue tends in the bay as her still portrait (${gb.pos}, ${gb.w}×${gb.h})`);
  ok(gb.posLater === gb.pos, 'a still plays no animation');
  const hRow = gb.rows.find(r => r.name === 'Hester Quill'), tRow = gb.rows.find(r => r.name === 'Tal Okafor');
  ok(hRow && /spritesheet_survivor_hester/.test(hRow.css) && tRow && /spritesheet_dock_engineer_tal/.test(tRow.css), 'the tender picker shows their own icons');
  ok(gb.waitingEmpty, 'a newcomer still waiting on art: the bay keeps its old empty look');

  console.log('— the gardener’s name');
  const names = await page.evaluate(() => {
    const ch = EVENTS.event_derelict_010.choices.find(c => c.text === 'Knock on the last pod');
    const pay = MOD.flavor.flag_payoffs.rescued_gardener;
    return { name: ch.outcome.crew_join.name, id: ch.outcome.crew_join.id, callbacks: Object.values(pay.callback).join(' ') };
  });
  ok(names.name === 'Hester Quill' && names.id === 'survivor_hester', 'The Pod Garden’s gardener is Hester Quill');
  ok(!/Ines/.test(names.callbacks), 'her callbacks no longer say Ines');

  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log(`newcomers: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

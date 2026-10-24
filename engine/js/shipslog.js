/* ────────────────────────────────────────────────────────────────
   SHIP'S LOG — the voyage's record (GAME_BIBLE §19, demo-shipslog.html)

   Two halves:
   1. RECORDING. Every significant thing that happens lands in
      STATE.shipLog in the active AI's voice (ai_companions.json
      log_templates): each resolved event (title + the choice taken,
      then the outcome in one line with its REAL effects — a diff of the
      ship before and after, never the authored numbers), deaths (a
      memorial with the long text behind 📖), stowaways joining, crop
      stage milestones, arrivals at every stop, and fights won / lost /
      fled / paid off. Everything still goes through cruise.js's
      pushLogEntry, so the cruise AI log column and this journal hold
      the same entries; the journal is just the whole record.
      While an outcome is being applied, the lines other systems push
      (a death, "standing orders changed", a full hold…) are held back
      and replayed AFTER the choice + outcome entries, so the record
      reads in order: what we chose, what it did, what followed.
   2. THE JOURNAL. The demo's 340×540 parchment journal docked over the
      AI-log column: flat LED lines under ── DAY N ── dividers, oldest
      first, scrolled to the latest; SHIP · TRAIL sub-line; VOICED BY
      footer; 🔗 / 📖 badges on clickable rows; a titled expand page —
      parchment for lore, the dark memorial (full figure or †, name,
      DAY · TRAIL) for deaths.
   ──────────────────────────────────────────────────────────────── */
(function () {
  const $ = id => document.getElementById(id);
  const MAX_ENTRY = 120;            // Bible §19 hard cap per entry
  const LOG_CAP = 600;              // journal entries kept in the save (see compact())
  const RES_KEYS = ['fuel', 'food', 'water', 'o2', 'hull']; // morale is per crew member: 'mo.<role>' (owner ruling 15)
  const RES_NAME = { fuel: 'FUEL', food: 'FOOD', water: 'H2O', o2: 'O2', hull: 'HULL', morale: 'MORALE', gold: 'GOLD' };
  // Growth stages — same 25/50/75/100 cut points and names every crop
  // uses in growbay.js CROP_META.stages.
  const STAGES = [[25, 'SPROUTING'], [50, 'VEGETATIVE'], [75, 'FLOWERING'], [99.999, 'MATURING']];
  const FIGHT_KIND = {
    victory_destroyed: 'won', victory_surrendered: 'won', victory_executed: 'won', enemy_retreat: 'won',
    defeated: 'lost', yielded: 'lost', escape: 'fled', tribute: 'paid',
  };
  // Neutral fallbacks — lint requires every AI to author every key, so
  // these only show if a template is missing.
  const FALLBACK = {
    choice: '{title}: chose “{choice}”.', outcome_good: '{line} {effects}.', outcome_bad: '{line} {effects}.',
    death: '{name} died. {crew_left}.', memorial_title: 'IN MEMORY OF {name}',
    stowaway_join: '{name} joined as {role}. Crew {crew_count}.', stowaway_passenger: '{name} rides as a passenger. Crew {crew_count}.',
    morale_zero: '{name} is at zero morale: leaves at the next station.', morale_back: '{name} is back to 25. Staying.',
    desertion: '{name} ({role}) walked off at {place}. {crew_left}.',
    crop_stage: '{crop}: {stage}, {growth}% grown, health {health}.', crop_ready: '{crop} ready to harvest. Health {health}.',
    arrival: 'Arrived at {place}. The leg cost {costs}.',
    fight_won: '{title}: won. {effects}.', fight_lost: '{title}: lost. {effects}.', fight_fled: '{title}: fled. {effects}.', fight_paid: '{title}: paid them off. {effects}.',
  };

  const ai = () => String(STATE.activeAI || 'marv');
  function aiDef(id) { return (MOD.ai_companions || []).find(x => x.id === 'ai_' + (id || ai())) || null; }
  function template(key) {
    const a = aiDef();
    return (a && a.log_templates && a.log_templates[key]) || FALLBACK[key] || '';
  }
  // Every filled sentence starts with a capital: an empty {line} leaves
  // "{effects}." leading ("nothing aboard changed." → "Nothing aboard
  // changed."), and a token can open any sentence after . ! ? or …
  // (closing quotes/brackets allowed). Only lowercase a–z is raised.
  const capSentences = s => s.replace(/^([\s"'“‘(]*)([a-z])/, (m, p, c) => p + c.toUpperCase())
    .replace(/([.!?…]["'”’)]*\s+["'“‘(]*)([a-z])/g, (m, p, c) => p + c.toUpperCase());
  function fill(t, tok) {
    return capSentences(String(t).replace(/\{(\w+)\}/g, (m, k) => (k in tok ? String(tok[k]) : '')).replace(/\s+/g, ' ').replace(/\s+([.,!?])/g, '$1').trim());
  }
  // A clipped name before a full stop read "…The….": one mark is enough.
  const voiced = (key, tok) => fill(template(key), tok).replace(/…\./g, '…');
  const cap1 = s => { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); };
  const clean = s => String(s == null ? '' : s).replace(/^\s*[◆▶]\s*/, '');
  // o: the outcome a narrative describes ({cost.water} states its real cost).
  function interp(s, o) {
    s = String(s || '');
    s = interpolateCostTokens(interpolateStowawayTokens(interpolateNpcTokens(s, STATE.npcCtx)), o);
    return s.replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim();
  }
  // First sentence of a narrative, cut at a word to fit `max`.
  function oneLine(text, max, o) {
    let s = interp(text, o).replace(/\s*\n+\s*/g, ' ');
    const m = s.match(/^.+?[.!?](?=\s|$)/);
    if (m) s = m[0];
    if (s.length <= max) return s;
    if (max < 12) return '';
    const cut = s.slice(0, max - 1);
    return cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 12)).replace(/[\s,;:—-]+$/, '') + '…';
  }
  function clip(s, max) { s = String(s || ''); return s.length <= max ? s : s.slice(0, max - 1).replace(/\s+\S*$/, '') + '…'; }
  function trailLabel() { return String((STATE.trail || 'deep')).toUpperCase() + ' TRAIL'; }
  function shipLabel() { return String(STATE.shipName || 'The Ship').toUpperCase(); }
  function crewLeft(n) { return n > 0 ? 'Crew now ' + n : 'No crew left'; }
  function roleTitle(role) { return String(role || 'crew').replace(/_/g, ' '); }

  // ── Real effects: a snapshot of everything an outcome can change ──
  const itemName = id => itemNameOf(id).toUpperCase();
  const matName = id => materialNameOf(id).replace(/_/g, ' ').toUpperCase();
  function snapshot() {
    const n = {};
    for (const k of RES_KEYS) n['res.' + k] = Number(STATE.resources[k]) || 0;
    n.gold = Number(STATE.goldAmount) || 0;
    for (const [m, q] of Object.entries(STATE.materials || {})) n['mat.' + m] = Number(q) || 0;
    for (const id of STATE.items || []) n['item.' + id] = (n['item.' + id] || 0) + 1;
    const names = {};
    for (const r of STATE.crew || []) {
      n['hp.' + r] = crewHPOf(r); names[r] = crewNameOf(r);
      n['mo.' + r] = crewMoraleOf(r); // per-crew morale (owner ruling 15)
    }
    // The captain's own HP (owner ruling 29) — "CAPTAIN −15 HP" in the record.
    n['hp.captain'] = captainHPOf(); names.captain = 'Captain';
    if (STATE.cropGrowth && STATE.cropGrowth.health > 0) n.crop = STATE.cropGrowth.health;
    if (STATE.fabricator) n.fab = STATE.fabricator.wear || 0;
    return { n, crew: (STATE.crew || []).slice(), names, broken: !!(STATE.fabricator && STATE.fabricator.broken), day: STATE.daysElapsed };
  }
  // [{text, w}] — what really changed between two snapshots. `drift`
  // (the ship's own daily consumption over the outcome's days, measured
  // around passDays) is taken back out: the days are listed instead.
  function facts(a, b, drift) {
    const out = [];
    const keys = new Set([...Object.keys(a.n), ...Object.keys(b.n)]);
    const d = k => Math.round(((b.n[k] || 0) - (a.n[k] || 0)) - (drift ? ((drift.b.n[k] || 0) - (drift.a.n[k] || 0)) : 0));
    const lost = a.crew.filter(r => !b.crew.includes(r));
    const joined = b.crew.filter(r => !a.crew.includes(r));
    for (const r of lost) out.push({ text: 'LOST ' + String(a.names[r] || r).toUpperCase(), w: 1000 });
    for (const r of joined) out.push({ text: '+' + String(b.names[r] || r).toUpperCase() + ' ABOARD', w: 900 });
    // Morale (owner ruling 15): a change every member shared reads as one
    // "+N MORALE"; anything else names who it moved.
    const moKeys = [...keys].filter(k => k.startsWith('mo.') && a.crew.includes(k.slice(3)) && b.crew.includes(k.slice(3)));
    const moD = moKeys.map(d);
    if (moD.length && moD.every(v => v === moD[0])) {
      if (moD[0]) out.push({ text: (moD[0] > 0 ? '+' : '−') + Math.abs(moD[0]) + ' MORALE', w: Math.abs(moD[0]) });
    } else {
      moKeys.forEach((k, i) => { const v = moD[i]; if (v) out.push({ text: String(b.names[k.slice(3)] || k.slice(3)).toUpperCase() + ' ' + (v > 0 ? '+' : '−') + Math.abs(v) + ' MORALE', w: Math.abs(v) }); });
    }
    for (const k of keys) {
      if (k.startsWith('mo.')) continue;
      const v = d(k);
      if (!v) continue;
      const sgn = v > 0 ? '+' : '−', av = Math.abs(v);
      if (k.startsWith('res.')) out.push({ text: sgn + av + ' ' + RES_NAME[k.slice(4)], w: av });
      else if (k === 'gold') out.push({ text: sgn + av + ' GOLD', w: av / 5 });
      else if (k.startsWith('mat.')) out.push({ text: sgn + av + ' ' + matName(k.slice(4)), w: av * 2 });
      else if (k.startsWith('item.')) out.push({ text: sgn + av + ' ' + itemName(k.slice(5)), w: 8 * av });
      else if (k.startsWith('hp.')) {
        const r = k.slice(3);
        if (lost.includes(r) || joined.includes(r)) continue;
        // The captain's death is the run's end, not an HP line.
        if (r === 'captain' && a.n[k] > 0 && b.n[k] <= 0) { out.push({ text: 'CAPTAIN LOST', w: 1000 }); continue; }
        out.push({ text: String(b.names[r] || a.names[r] || r).toUpperCase() + ' ' + sgn + av + ' HP', w: av / 2 });
      } else if (k === 'crop') out.push({ text: sgn + av + ' CROP', w: av / 2 });
      else if (k === 'fab') out.push({ text: (v > 0 ? '+' + av + '% FAB WEAR' : 'FAB REPAIRED'), w: 6 });
    }
    if (!a.broken && b.broken) out.push({ text: 'FABRICATOR BROKEN', w: 20 });
    out.sort((x, y) => y.w - x.w);
    const days = (b.day || 0) - (a.day || 0);
    if (days > 0) out.push({ text: days + (days === 1 ? ' DAY' : ' DAYS'), w: 0 });
    return out;
  }
  const factText = list => list.length ? list.map(f => f.text).join(', ') : 'nothing aboard changed';

  // ── Hold-back buffer (see header) ─────────────────────────────────
  let rec = null;          // the record in progress: {snap, buf, t0, t1}
  let eventSnap = null;    // the ship as it was when the current event began
  let fightChoice = null;  // the choice that started the current fight

  function capture(entryOrText, opts) {
    if (!rec) return false;
    rec.buf.push({ e: entryOrText, opts: opts || {}, day: STATE.daysElapsed });
    return true;
  }
  // opts.fresh: measure from now (a travel leg), not from the event's start.
  function begin(opts) {
    if (rec) return null; // nested: the outer record owns the buffer
    const r = { snap: (!(opts && opts.fresh) && eventSnap) || snapshot(), buf: [], t0: null, t1: null };
    rec = r;
    // Safety net: if the caller never closes it (an exception mid-apply),
    // the held lines are released at the end of this task.
    Promise.resolve().then(() => { if (rec === r) finish(r, null); });
    return r;
  }
  // Around passDays inside an outcome: the ship's own daily draw.
  function timeStart() { if (rec && !rec.t0) rec.t0 = snapshot(); }
  function timeEnd()   { if (rec && rec.t0 && !rec.t1) rec.t1 = snapshot(); }

  function push(entry, opts) {
    window.pushCruiseLog(entry, opts);
  }
  // minDay: lines held during a leg read as the arrival day (they
  // follow the arrival entry; days never run backwards in the record).
  function release(buf, minDay) {
    for (const it of buf) {
      const e = (it.e && typeof it.e === 'object') ? Object.assign({}, it.e) : { text: it.e };
      if (!Number.isFinite(e.day)) e.day = it.day;
      if (Number.isFinite(minDay) && e.day < minDay) e.day = minDay;
      push(e, it.opts);
    }
  }
  // Composes the voiced entries for a record: info = {kind:'event'|'fight',
  // title, choice, outcome, line, fight, day}. A null info just releases.
  function finish(r, info) {
    if (!r || rec !== r) return;
    rec = null;
    try { if (info) compose(r, info); }
    finally { release(r.buf); }
  }
  function compose(r, info) {
    const after = snapshot();
    const list = facts(r.snap, after, r.t0 && r.t1 ? { a: r.t0, b: r.t1 } : null);
    const day = r.snap.day;
    const title = clip(interp(info.title || 'The stop'), 34);
    const opts = { ai: true, instant: true };
    if (info.choice) {
      let ch = clip(interp(info.choice).replace(/[.!?]+$/, ''), 60);
      let text = voiced('choice', { title, choice: ch });
      if (text.length > MAX_ENTRY) text = voiced('choice', { title, choice: clip(ch, Math.max(12, ch.length - (text.length - MAX_ENTRY))) });
      push({ text, type: 'choice', day }, opts);
    }
    const o = info.outcome || {};
    let key, tok = { title };
    if (info.kind === 'fight') key = 'fight_' + (info.fight || 'won');
    else key = (isBad(list, o) ? 'outcome_bad' : 'outcome_good');
    // Fit: effects never truncated mid-fact; the line gives way first,
    // then any facts that still don't fit go to a follow-up line.
    let shown = list.slice(), rest = [];
    const build = line => voiced(key, Object.assign({}, tok, { line, effects: factText(shown) }));
    while (shown.length > 1 && build('').length > MAX_ENTRY) rest.unshift(shown.pop());
    let line = '';
    if (key.startsWith('outcome')) {
      const room = MAX_ENTRY - build('').length - 1;
      line = oneLine(info.line != null ? info.line : (o.narrative || o.body || ''), Math.min(70, room), o);
    }
    const entry = { text: build(line), type: 'event', day };
    if (info.lore) entry.expand = info.lore;
    push(entry, opts);
    if (rest.length) push({ text: 'Also: ' + factText(rest) + '.', type: 'event', day }, opts);
  }
  function isBad(list, o) {
    if (o && (o.tone === 'danger')) return true;
    if (o && (o.tone === 'success')) return false;
    let bad = 0, good = 0;
    for (const f of list) { if (/^LOST /.test(f.text) || f.text.charAt(0) === '−' || / −\d+ HP$/.test(f.text) || /BROKEN|WEAR/.test(f.text)) bad += f.w; else if (f.w) good += f.w; }
    return bad > good;
  }

  // Outcome log_lore (events JSON, lint-checked) → a parchment 📖 page.
  function loreOf(o) {
    const l = o && o.log_lore;
    if (!l || !l.text) return null;
    // Paragraph breaks survive (interp() flattens whitespace for one-liners).
    const text = String(l.text).split(/\n\s*\n/).map(p => interp(p, o)).filter(Boolean).join('\n\n');
    return { title: String(l.title || 'FROM THE LOG').toUpperCase(), text, kind: 'lore' };
  }

  // ── Public recording API (index.html / combat.js / crew.js hooks) ──
  const ShipLog = {
    fill, // test hook: the template fill (sentence capitals)
    capture, begin, timeStart, timeEnd,
    // An event begins: the record measures from here.
    eventStart() { eventSnap = snapshot(); fightChoice = null; },
    eventEnd() { eventSnap = null; fightChoice = null; },
    // A resolved event choice (flat, layered, minigame, ram/flee, leave).
    resolved(r, ev, choice, outcome, extra) {
      if (!r) return;
      const info = Object.assign({ kind: 'event', title: (ev && ev.title) || 'The stop', choice: choice && (choice.text || choice.label), outcome: outcome || {}, lore: loreOf(outcome) }, extra || {});
      finish(r, info);
      eventSnap = null;
    },
    fightStart(choice) { fightChoice = (choice && (choice.text || choice.label)) || null; },
    fightEnd(r, result, title) {
      if (!r) return;
      const ev = STATE.currentEvent;
      finish(r, { kind: 'fight', fight: FIGHT_KIND[result] || 'won', title: (ev && ev.title) || title || 'The fight', choice: fightChoice, outcome: {} });
      fightChoice = null; eventSnap = null;
    },
    // A crew member dies (killCrew / the airlock). Called BEFORE they are
    // removed so the memorial can read who they were.
    deathEntry(role, epitaph, opts) {
      opts = opts || {};
      const name = crewNameOf(role);
      const crewId = crewSpriteIdOf(role);
      const left = Math.max(0, (STATE.crew || []).filter(r => r !== role).length);
      const day = STATE.daysElapsed;
      const text = opts.text || voiced('death', { name, crew_left: crewLeft(left) });
      return { text, type: 'death', crewId: crewId || null, crewName: name, day,
               expand: { title: voiced('memorial_title', { name: String(name).toUpperCase() }), text: memorialText(role, name, epitaph, left, opts.cause), kind: 'memorial', trail: trailLabel() } };
    },
    // A stowaway resolved as crew (role) or a passenger (no role).
    stowaway(name, role) {
      const n = (STATE.crew || []).length;
      const text = role ? voiced('stowaway_join', { name, role: roleTitle(role), crew_count: n })
                        : voiced('stowaway_passenger', { name, crew_count: n });
      push({ text, type: 'event' }, { ai: true, instant: true });
    },
    // Per-crew morale (owner ruling 15): the warning when a member hits 0,
    // the all-clear when they're raised back, and the desertion entry
    // (composed BEFORE they leave — it reads who they were).
    moraleZero(role) {
      const name = crewNameOf(role);
      push({ text: voiced('morale_zero', { name }), type: 'event' }, { ai: true, instant: true });
    },
    moraleBack(role) {
      const name = crewNameOf(role);
      push({ text: voiced('morale_back', { name }), type: 'event' }, { ai: true, instant: true });
    },
    desertionEntry(role, node) {
      const name = crewNameOf(role);
      const left = Math.max(0, (STATE.crew || []).filter(r => r !== role).length);
      const place = clip((node && node.name) || 'the station', 40);
      return { text: clip(voiced('desertion', { name, role: roleTitle(role), place, crew_left: crewLeft(left) }), MAX_ENTRY), type: 'event', day: STATE.daysElapsed };
    },
    // A travel leg landed at `node` (r = begin({fresh:true}) before the
    // leg): "Arrived at X. The leg cost …", then whatever the leg logged.
    arrival(r, node) {
      if (!r || rec !== r) return;
      rec = null;
      try {
        const list = facts(r.snap, snapshot());
        const place = clip((node && node.name) || 'the next stop', 40);
        // Fit as the outcome lines do: no fact cut mid-word. The smallest
        // facts give way to a follow-up line; the leg's days never do (the
        // clip used to drop them first — they are listed last).
        // "The leg cost …" lists costs only; a gain the leg brought (the
        // chef's morale, a regen) goes on the "Also:" line.
        const isGain = f => /^\+/.test(f.text);
        const shown = list.filter(f => !isGain(f)), rest = list.filter(isGain);
        if (!shown.length) shown.push({ text: 'nothing', w: 0 });
        const build = () => voiced('arrival', { place, costs: factText(shown) });
        const dayFact = shown.length && / DAYS?$/.test(shown[shown.length - 1].text);
        while (shown.length > (dayFact ? 2 : 1) && build().length > MAX_ENTRY) rest.unshift(shown.splice(shown.length - (dayFact ? 2 : 1), 1)[0]);
        const opts = { ai: true, instant: true };
        push({ text: clip(build(), MAX_ENTRY), type: 'event', day: STATE.daysElapsed }, opts);
        if (rest.length) push({ text: clip('Also: ' + factText(rest) + '.', MAX_ENTRY), type: 'event', day: STATE.daysElapsed }, opts);
      } finally { release(r.buf, STATE.daysElapsed); }
    },
    // Crop growth crossed into a new stage (cruise.js checkCropMilestones).
    cropCheck() {
      const cg = STATE.cropGrowth;
      if (!STATE.crop || !cg || !(cg.health > 0)) return;
      const g = cg.growth || 0;
      const idx = g >= 100 ? STAGES.length : STAGES.findIndex(s => g <= s[0]);
      if (!Number.isInteger(cg.logStage)) { cg.logStage = idx; return; } // launch / old save: start from here
      if (idx < cg.logStage) { cg.logStage = idx; return; }               // harvested & replanted
      if (idx === cg.logStage) return;
      cg.logStage = idx;
      const crop = cap1(cropName());
      const tok = { crop, growth: Math.min(100, Math.round(g)), health: Math.round(cg.health) };
      if (idx >= STAGES.length) {
        // Harvest-ready is the crop's science moment: its crops.json
        // real_science opens as the parchment page behind 📖.
        const def = ((MOD.crops && MOD.crops.crops) || []).find(c => c.id === 'crop_' + STATE.crop);
        const entry = { text: voiced('crop_ready', tok), type: 'event' };
        if (def && def.real_science) entry.expand = { title: String(crop).toUpperCase() + ' — THE REAL SCIENCE', text: def.real_science, kind: 'lore' };
        push(entry, { ai: true, instant: true });
      } else if (idx > 0) {
        push({ text: voiced('crop_stage', Object.assign(tok, { stage: STAGES[idx][1] })), type: 'event' }, { ai: true, instant: true });
      }
    },
    // Storage form of an entry: no empty fields (saves stay small).
    store, compact,
    openEntry,
  };

  function causeOfDeath() {
    const ev = STATE.currentEvent;
    if (ev && ev.title) return 'during “' + interp(ev.title) + '”';
    const dep = STATE.deprived || {};
    const why = [['food', 'hunger'], ['water', 'thirst'], ['o2', 'thin air']].filter(([k]) => dep[k] > 0).map(([, w]) => w);
    if (why.length) return 'of ' + why.join(' and ');
    return 'aboard, between stops';
  }
  function memorialText(role, name, epitaph, left, cause) {
    const paras = [];
    if (epitaph) paras.push(clean(epitaph));
    const idn = STATE.crewIdentity && STATE.crewIdentity[role];
    const roster = ((MOD.crew_roster && (MOD.crew_roster.crew || MOD.crew_roster)) || []);
    const def = Array.isArray(roster) ? roster.find(c => c.role === role) : null;
    const who = idn ? (idn.story || '') : ((def && def.bio) || '');
    paras.push(name + ', ' + roleTitle(role) + '.' + (who ? ' ' + who : ''));
    const node = STATE.byId && STATE.byId[STATE.currentId];
    const served = idn && Number.isFinite(idn.joinedDay)
      ? 'Joined the crew on day ' + idn.joinedDay + '; served ' + Math.max(0, STATE.daysElapsed - idn.joinedDay) + ' days.'
      : 'Aboard since launch: ' + STATE.daysElapsed + ' days of the voyage.';
    paras.push('Lost on day ' + STATE.daysElapsed + ', ' + (cause || causeOfDeath()) + (node && node.name ? ', at ' + node.name : '') + '. ' + served + ' ' + crewLeft(left) + '.');
    const a = aiDef();
    const last = a && a.sample_lines && a.sample_lines.crew_death;
    if (last) paras.push('“' + last + '” — ' + (a.name || ai().toUpperCase()));
    return paras.join('\n\n');
  }

  function store(e) {
    const out = {};
    for (const [k, v] of Object.entries(e)) if (v != null && v !== '' && v !== false) out[k] = v;
    if (!Number.isFinite(out.day)) out.day = STATE.daysElapsed;
    if (out.text == null) out.text = '';
    return out;
  }
  // Keeps the journal inside LOG_CAP entries: the oldest plain system
  // lines (no voice, no type, no payload) go first; voiced records,
  // choices, deaths and anything with a 📖/🔗 are kept longest.
  function compact() {
    const log = STATE.shipLog;
    if (!Array.isArray(log) || log.length <= LOG_CAP) return;
    let over = log.length - LOG_CAP;
    for (let i = 0; i < log.length && over > 0; i++) {
      const e = log[i];
      if (e && !e.voice && !e.type && !e.expand && !e.link) { log.splice(i, 1); i--; over--; }
    }
    if (over > 0) log.splice(0, over);
  }

  // ── The journal ───────────────────────────────────────────────────
  const rowType = e => (e.type === 'death' || e.type === 'choice' || e.type === 'event') ? e.type : (e.type === 'sci' ? 'event' : 'note');
  function expandOf(e) {
    if (!e || !e.expand) return null;
    if (typeof e.expand === 'string') return { title: e.type === 'death' ? 'IN MEMORIAM' : 'FROM THE LOG', text: e.expand, kind: e.type === 'death' ? 'memorial' : 'lore' };
    return e.expand;
  }
  function renderShipsLog() {
    const rows = $('slog-rows');
    if (!rows) return;
    const entries = STATE.shipLog || [];
    $('slog-meta').textContent = shipLabel() + ' · ' + trailLabel();
    $('slog-voice').textContent = String((aiDef() && aiDef().name) || ai()).toUpperCase();
    $('slog-day').textContent = 'DAY ' + STATE.daysElapsed;
    rows.innerHTML = '';
    if (!entries.length) {
      rows.innerHTML = '<div class="slog-empty">Nothing logged yet. The voyage is young and the AI is saving its material.</div>';
      return;
    }
    let lastDay = null;
    for (const e of entries) {
      if (!e) continue;
      if (e.day !== lastDay) {
        const m = document.createElement('div');
        m.className = 'log-day';
        m.innerHTML = '<span>DAY ' + e.day + '</span>';
        rows.appendChild(m);
        lastDay = e.day;
      }
      const ex = expandOf(e);
      const link = e.link && e.link.url ? e.link : null;
      const row = document.createElement('div');
      row.className = 'log-entry ' + rowType(e) + (ex || link ? ' has-payload' : '');
      const led = document.createElement('span');
      led.className = 'log-entry-led';
      row.appendChild(led);
      const t = document.createElement('span');
      t.className = 'log-entry-text';
      t.textContent = clean(e.text);
      row.appendChild(t);
      if (ex || link) {
        const b = document.createElement('span');
        b.className = 'log-entry-payload' + (ex ? ' slog-expand-btn' : ' slog-link-btn');
        b.textContent = ex ? '📖' : '🔗';
        b.setAttribute('title', ex ? 'Read more' : (link.label || 'Open in new tab'));
        row.appendChild(b);
        row.addEventListener('click', () => {
          if (ex) openExpand(e);
          else window.open(link.url, '_blank', 'noopener');
        });
      }
      rows.appendChild(row);
    }
    // Latest entry in view (demo: auto-scroll to the bottom).
    rows.scrollTop = rows.scrollHeight;
  }
  function openExpand(e) {
    const ex = expandOf(e);
    if (!ex) return;
    const card = $('slog-expand-card');
    const death = e.type === 'death' || ex.kind === 'memorial';
    card.classList.toggle('death-mode', death);
    card.querySelectorAll('.slog-death-header').forEach(h => h.remove());
    $('slog-expand-title').textContent = ex.title || (death ? 'IN MEMORIAM' : 'FROM THE LOG');
    if (death) {
      const hdr = document.createElement('div');
      hdr.className = 'slog-death-header';
      const crewId = e.crewId;
      if (crewId && CREW_ATLAS[crewId]) {
        const p = document.createElement('div');
        p.className = 'slog-portrait';
        applyCrewPortrait(p, crewId, 50, 120); // the full figure, desaturated (memory, not a live face)
        hdr.appendChild(p);
      } else {
        const c = document.createElement('span');
        c.className = 'slog-candle';
        c.textContent = '†';
        hdr.appendChild(c);
      }
      const meta = document.createElement('div');
      meta.className = 'slog-death-meta';
      const strong = document.createElement('strong');
      strong.textContent = 'IN MEMORIAM';
      meta.appendChild(strong);
      meta.appendChild(document.createTextNode(String(e.crewName || 'NAME UNRECORDED').toUpperCase()));
      meta.appendChild(document.createElement('br'));
      const sub = document.createElement('span');
      sub.className = 'slog-death-sub';
      sub.textContent = 'DAY ' + e.day + ' · ' + (ex.trail || trailLabel());
      meta.appendChild(sub);
      hdr.appendChild(meta);
      card.insertBefore(hdr, $('slog-expand-host'));
    }
    const body = $('slog-expand-body');
    body.innerHTML = '';
    String(ex.text || '').split(/\n\s*\n/).forEach(para => {
      if (!para.trim()) return;
      const p = document.createElement('p');
      p.textContent = para.trim();
      body.appendChild(p);
    });
    body.scrollTop = 0;
    $('slog-expand-modal').style.display = 'flex';
  }
  function openShipsLog() {
    // A memorial/expand left open last time must not reappear.
    closeShipsLogExpand();
    showOverlay('overlay-shipslog');
    renderShipsLog();
  }
  // From the cruise column's 📖: the journal, opened on that entry's page.
  function openEntry(e) { openShipsLog(); openExpand(e); }
  function closeShipsLogExpand() { const m = $('slog-expand-modal'); if (m) m.style.display = 'none'; }

  const shipsLogExpandOpen = () => { const m = $('slog-expand-modal'); return !!m && m.style.display === 'flex'; };

  Object.assign(window, {
    // engine API
    ShipLog, openShipsLog, renderShipsLog, closeShipsLogExpand,
    shipsLogExpandOpen,
  });
})();

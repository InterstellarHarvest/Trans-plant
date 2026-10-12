/* ═══════════════════════════════════════════════════════════════════
   STATION VISIT — the demo's station_approach scenario, engine-side
   (demo-encounter.html ~2618-2800 + applyApproachIntroState /
   injectStationRoomNav ~3424-3690; owner ruling 2026-10-11, design A).

   Every station stop (except a delayed crisis, Push Engines or a fixed
   test-path event) runs:

     arrival event?  → the stop's drawn event when it isn't a station
                       event (a ship-board / any-node event) plays first
     APPROACH        → event_station_014 on our bridge, the station in the
                       viewport. 1 in 3 the dockmaster hails first; else
                       HAIL opens comms. DOCK carries the parking fee
                       (1 in 3, eventGold discounts). The leave row opens
                       the wave-off warning; CONFIRM · WAVE OFF closes the
                       stop's TRADE / MEDBAY / DRYDOCK / FAB SERVICE and
                       costs no time.
     DOCK            → crew skills recharge. A flat / comm-screen station
                       event (the docking queue, the inspector…) plays as
                       the docking itself; then the dock.
     DOCK (layer)    → station/dock: the stop's room (CANTINA / CLINIC /
                       OFFICE / PROMENADE / DOCKMASTER — the drawn
                       in-person station event) + MARKET (Market Row).
                       Each room: GO ELSEWHERE between rooms, its leave
                       row BACK TO DOCK; a room whose event resolved is
                       done for the visit. LEAVE STATION → the hub, which
                       is the demo's intro_returning (bridge, station in
                       view, services by comms, Resume = CONTINUE TRAVEL).

   State: STATE.stationVisit (saved) = { node, hailedFirst, fee, roomEv,
   kind, phase, captainHere, wavedOff, roomsDone[], inRoom }.
   Copy lives in modules/events/events_station.json event_station_014.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const APPROACH_ID = 'event_station_014';
  const MARKET_ID = 'event_station_013';
  const ROOM_BY_JOB = { bartender: 'cantina', medic: 'clinic', security: 'office', janitor: 'promenade', botanist: 'promenade', captain: 'dockmaster', engineer: 'dockmaster' };

  const approachEv = () => (typeof EVENTS !== 'undefined' && EVENTS[APPROACH_ID]) || null;
  const here = () => STATE.byId && STATE.byId[STATE.currentId];
  function visit() {
    const v = STATE.stationVisit;
    return v && v.node === STATE.currentId ? v : null;
  }
  const log = t => { if (typeof window.pushCruiseLog === 'function') window.pushCruiseLog(t); };

  /* Which dock room an event is (null: not a room). An in-person layered
     station event with a station NPC; `station_room` may name it. */
  function roomOf(ev) {
    if (!ev || !ev.layers) return null;
    if (ev.station_room) return ev.station_room;
    if ((ev.comm_mode || 'in_person') !== 'in_person') return null;
    const n = ev.npc;
    if (!n) return null;
    if (n.disposition === 'trader') return 'market';
    if (n.disposition === 'station_crew') return ROOM_BY_JOB[n.job] || 'promenade';
    return null;
  }
  // How the stop's drawn event plays: 'arrival' (before the approach — a
  // non-station event), 'room' (a dock room) or 'docking' (on DOCK).
  function kindOf(ev) {
    if (!ev) return null;
    if (!(ev.node_type || []).includes('station')) return 'arrival';
    return roomOf(ev) ? 'room' : 'docking';
  }

  function available() { return !!approachEv(); }

  function arrive(node, ev) {
    const a = approachEv();
    const fees = (a && a.parking_fees) || [];
    STATE.stationVisit = {
      node: node.id,
      hailedFirst: Math.random() < 1 / 3,
      fee: (fees.length && Math.random() < 1 / 3) ? Object.assign({}, fees[Math.floor(Math.random() * fees.length)], { cost: a.parking_cost || 5 }) : null,
      roomEv: ev ? ev.id : null,
      kind: kindOf(ev),
      phase: 'approach', captainHere: false, wavedOff: false, docked: false,
      roomsDone: [], inRoom: null,
    };
    const v = STATE.stationVisit;
    v.captainHere = v.hailedFirst;
    if (v.kind === 'arrival') { v.phase = 'arrival'; enterEvent(node, ev); return; }
    enterApproach(['intro']);
  }
  function enterApproach(stack, visits) {
    enterEvent(here(), approachEv(), { layerStack: stack, layerVisits: visits || [] });
  }

  /* {fee.*} tokens in the approach copy. */
  function feeText(str) {
    const v = visit();
    const f = v && v.fee;
    if (!str || !f) return str;
    const cost = typeof eventGold === 'function' ? eventGold(f.cost) : f.cost;
    return String(str).replace(/\{fee\.reason\}/g, f.reason).replace(/\{fee\.reason_lc\}/g, f.reason.toLowerCase())
      .replace(/\{fee\.cost\}/g, cost).replace(/\{fee\.detail\}/g, f.detail);
  }
  function dockChoice(base) {
    const v = visit();
    const ch = Object.assign({}, base);
    if (v && v.fee) {
      ch.gate = { gold: v.fee.cost };
      ch.gold_cost = v.fee.cost;
      ch.sub = v.fee.reason + ' · ' + v.fee.cost + ' gold'; // pricedText applies the discount; one line (owner rule: sub-labels fit one line)
      ch.detail = v.fee.detail; // the why goes to the tooltip
    }
    return ch;
  }
  function roomDef(key) {
    const a = approachEv();
    return (a && a.station_rooms && a.station_rooms[key]) || { label: String(key).toUpperCase(), sub: 'Walk over', nav: 'Walk over', back: 'Head back to the airlock' };
  }
  // The dock's rooms this visit: [{key, ev}] — the drawn room, then Market Row.
  function rooms() {
    const v = visit();
    const out = [];
    if (v && v.kind === 'room' && v.roomEv && EVENTS[v.roomEv]) out.push({ key: roomOf(EVENTS[v.roomEv]), ev: v.roomEv });
    if (EVENTS[MARKET_ID] && !out.some(r => r.ev === MARKET_ID)) out.push({ key: 'market', ev: MARKET_ID });
    return out;
  }
  const doneLock = (v, id) => (id !== MARKET_ID && v && v.roomsDone.includes(id)) ? 'Nothing more for you here this visit' : null;

  /* The approach layer as this visit has it. */
  function approachLayer(id, layer) {
    const v = visit();
    if (!v) return layer;
    const a = approachEv();
    const L = Object.assign({}, layer);
    const captain = a.station_captain;
    if (id === 'intro') {
      // First look: the dockmaster's welcome when they hailed first; back
      // on the intro later (NEVERMIND, BACK) comms are simply open.
      const firstLook = !(STATE._layerVisits && STATE._layerVisits.intro);
      const variant = v.hailedFirst && firstLook ? 'hailed' : v.captainHere ? 'open' : 'silent';
      const vr = (layer.variants || {})[variant] || {};
      L.body = vr.body || layer.body;
      L.line = v.fee && vr.line_fee ? vr.line_fee : vr.line;
      L.pose = vr.pose || layer.pose;
      L.npc = v.captainHere ? captain : null;
      L.choices = (layer.choices || []).filter(c => c.station === 'hail' ? !v.captainHere : c.station === 'dock' ? v.captainHere : true)
        .map(c => c.station === 'dock' ? dockChoice(c) : c);
    } else if (id === 'hail' || id === 'hail_polite' || id === 'hail_brief') {
      L.npc = captain;
      if (v.fee && layer.line_fee) L.line = layer.line_fee;
      L.choices = (layer.choices || []).map(c => c.station === 'dock' ? dockChoice(c) : c);
    } else if (id === 'docked') {
      L.npc = null;
      L.choices = rooms().map(r => {
        const d = roomDef(r.key);
        const lock = doneLock(v, r.ev);
        return Object.assign({ text: d.label, sub: d.sub, station: 'room', target: r.ev }, lock ? { station_locked: lock } : {});
      });
    }
    for (const k of ['body', 'line']) if (L[k]) L[k] = feeText(L[k]);
    return L;
  }

  /* A dock room's event, entered from the dock: GO ELSEWHERE on its entry
     layer (when there's somewhere else), an _elsewhere layer, and its leave
     row BACK TO DOCK. A copy — the authored event is untouched. */
  function wrap(ev, node) {
    const v = visit();
    if (!v || !ev || v.phase !== 'docked' || v.inRoom !== ev.id || !ev.layers) return ev;
    const a = approachEv();
    const mine = rooms().find(r => r.ev === ev.id);
    const myKey = mine ? mine.key : roomOf(ev);
    const others = rooms().filter(r => r.ev !== ev.id && !doneLock(v, r.ev));
    const w = Object.assign({}, ev, { layers: {} });
    for (const [k, l] of Object.entries(ev.layers)) { w.layers[k] = Object.assign({}, l); delete w.layers[k].leave_label; }
    w.leave_label = 'BACK TO DOCK';
    w.leave_sub = roomDef(myKey).back;
    w.no_leave = false;
    if (others.length) {
      const entry = ev.entryLayer || Object.keys(ev.layers)[0];
      const t = (a && a.elsewhere) || {};
      w.layers[entry].choices = (w.layers[entry].choices || []).concat([{ text: 'GO ELSEWHERE', sub: t.sub || 'Pick another corner of the ring', next: '_elsewhere' }]);
      w.layers._elsewhere = {
        title: t.title || 'ELSEWHERE ON THE STATION', body: t.body || 'Where to next?', ai: t.ai, pose: 'listening',
        leaveHidden: true,
        choices: others.map(r => ({ text: roomDef(r.key).label, sub: roomDef(r.key).nav, station: 'room', target: r.ev }))
          .concat([{ text: 'BACK TO DOCK', sub: t.dock_sub || 'Return to the airlock', station: 'to_dock' },
                   { text: 'BACK', sub: 'Return to the ' + roomDef(myKey).label.toLowerCase(), back: true }]),
      };
    }
    w._stationRoom = myKey;
    return w;
  }

  // Walking out of a room after shopping costs the haggling day (as the
  // leave row does). Returns true if the run ended.
  function settleShopping() {
    if (!STATE._shoppedThisEvent) return false;
    STATE._shoppedThisEvent = false;
    passDays(1); renderHUD();
    return checkFailure();
  }
  function returnToDock() {
    const v = visit();
    v.phase = 'docked'; v.inRoom = null;
    const seen = v._dockSeen;
    v._dockSeen = true; // before the entry save, so a reload remembers it
    enterApproach(['docked'], seen ? ['docked'] : []);
  }

  function act(choice) {
    const v = visit();
    if (!v) return false;
    switch (choice.station) {
      case 'hail':
        v.captainHere = true;
        return false; // its next: 'hail' carries on
      case 'dock': {
        v.docked = true; v.captainHere = true;
        if (typeof stationRecharge === 'function') stationRecharge();
        if (v.kind === 'docking' && v.roomEv && EVENTS[v.roomEv] && !v.roomsDone.includes(v.roomEv)) {
          v.phase = 'docking';
          enterEvent(here(), EVENTS[v.roomEv]);
          return true;
        }
        v.phase = 'docked';
        STATE.layerStack.push('docked');
        v._dockSeen = true;
        saveEventProgress();
        renderEncounterState();
        return true;
      }
      case 'room': {
        if (STATE.currentEvent && STATE.currentEvent.id !== APPROACH_ID && settleShopping()) return true;
        v.phase = 'docked'; v.inRoom = choice.target;
        enterEvent(here(), EVENTS[choice.target]);
        return true;
      }
      case 'to_dock':
        if (settleShopping()) return true;
        returnToDock();
        return true;
    }
    return false;
  }

  /* advanceAfterEvent's first word. true = handled (don't go to the hub). */
  function afterEvent() {
    const v = visit();
    const ev = STATE.currentEvent;
    if (!v || !ev) return false;
    if (v.phase === 'arrival') { v.phase = 'approach'; enterApproach(['intro']); return true; }
    if (v.phase === 'docking') {
      if (STATE.outcomeMode) v.roomsDone.push(ev.id);
      if (v.wavedOff) { v.phase = 'left'; return false; }
      returnToDock();
      return true;
    }
    if (v.phase === 'docked' && ev.id !== APPROACH_ID) {
      if (STATE.outcomeMode && ev.id !== MARKET_ID && !v.roomsDone.includes(ev.id)) v.roomsDone.push(ev.id);
      returnToDock();
      return true;
    }
    if (ev.id === APPROACH_ID) {
      if (v.phase === 'docked') {
        // LEAVE STATION: back on the bridge (the hub = intro_returning);
        // the dockmaster pings the comms once, as in the demo.
        const a = approachEv();
        if (a && a.farewell) log('◆ ' + a.farewell);
      }
      v.phase = 'left';
    }
    return false;
  }

  /* waves_off outcome field: this stop's services close. */
  function waveOff() {
    let v = visit();
    if (!v) { STATE.stationVisit = v = { node: STATE.currentId, roomsDone: [], phase: 'left' }; }
    v.wavedOff = true;
    const n = here();
    log('◆ Waved off at ' + ((n && n.name) || 'the station') + ' — no berth, so no market, medbay, drydock or fab service this stop.');
  }
  function servicesClosed() {
    const v = visit();
    return !!(v && v.wavedOff);
  }
  window.stationServicesClosed = servicesClosed; // cruise.js Stop menu

  window.StationVisit = { available, arrive, approachLayer, wrap, act, afterEvent, waveOff, servicesClosed, roomOf, kindOf, rooms };
})();

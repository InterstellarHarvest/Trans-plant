'use strict';
/* ────────────────────────────────────────────────────────────────
   MINIGAMES — lifted from resources/demo-minigames.html (Phase 4).
   7 games (SCAN/ENGINE REPAIR/MEDICAL/FORAGE/SOLAR BRACE/HULL BREACH/
   SALVAGE), each a self-contained initX(container, onResult, opts)
   the game logic was already engine-ready per the earlier audit — this
   file only replaces the demo's own launcher grid / AI-picker / size-
   toggle / engineer-toggle dev harness with the real openMinigame(id,
   opts, onDone) entry point cruise.js's Stop Menu verbs call into.
   Markup lives in index.html under #overlay-minigames (id=ov inside
   it is the demo's own modal chrome, kept as-is — see screen-minigames.css).
   ──────────────────────────────────────────────────────────────── */
(function () {
const Q = {
  scan:{
    perfect:{
      aria:'Signal locked! You are a natural radar operator. Have you considered a career?',
      marv:'Signal acquired. The universe briefly acknowledged your existence. Don\'t expect a follow-up.',
      rex:'Target locked. Good dish discipline.',
      chip:'Signal locked! Brought to you by OmniComm™ — We Find Things®.',
      ajoy:'Locked. Right where I said it was. You\'re welcome.'
    },
    good:{
      aria:'Close enough! Technically you found it. That\'s what matters!',
      marv:'Marginal lock. Adequate. Like most things on this ship.',
      rex:'Sloppy approach, but the lock held. In the field, sloppy gets people killed.',
      chip:'Signal located! OmniComm™ Pro offers 40% faster acquisition. Ask your station.',
      ajoy:'Found it. Eventually. I\'d have gone left first, but sure.'
    },
    poor:{
      aria:'Oh! The signal got away. That happens to the best of us. And also to you!',
      marv:'Signal lost. I\'d calculated this outcome. I didn\'t mention it because it wouldn\'t have helped.',
      rex:'Lost the target. We are not going to talk about this.',
      chip:'Signal lost! OmniComm™ EasyTrack — starting at 29.99/month. Terms apply.',
      ajoy:'Lost it. I did say it wanders. Twice.'
    }
  },
  engine:{
    perfect:{
      aria:'Perfect sequence! The engine is fixed! You\'re basically an engineer now!',
      marv:'Sequence correct. The engine will continue working until it next decides not to.',
      rex:'Correct sequence, no errors. That\'s how it\'s done.',
      chip:'Engine restored! Brought to you by EngineRight™ — Factory Quality, Field Applied.',
      ajoy:'Correct order. I was mouthing it along. Credit shared.'
    },
    good:{
      aria:'Engine repaired! A few sparks, but sparks are basically tiny fireworks!',
      marv:'Repaired, despite errors. Barely functional, which is technically enough.',
      rex:'Sequence complete with errors. Those sparks will cost us. Monitor the drive coil.',
      chip:'Engine repaired! Those sparks? Normal. Not a recall issue. Please don\'t file a report.',
      ajoy:'It runs. With sparks. The sequence was shown once, slowly, but fine.'
    },
    poor:{
      aria:'Limp mode! That\'s still a mode! We\'re still moving! Sort of!',
      marv:'Sequence failed. Limp mode active. I had predicted this. I keep predicting things.',
      rex:'Limp mode engaged. This is not a combat-ready condition. I want that on record.',
      chip:'Limp mode! EngineRight™ emergency kits available at participating stations!',
      ajoy:'Limp mode. I\'d have written the sequence down. Anyway.'
    }
  },
  medical:{
    perfect:{
      aria:'Perfect treatment! The patient will be absolutely fine! Probably!',
      marv:'Correct procedure. Patient will recover. I\'m noting this as a statistical anomaly.',
      rex:'Treatment administered correctly. No friendly fire. Good.',
      chip:'Treatment successful! MediRight™ — because your crew is a liability either way.',
      ajoy:'Correct treatment. Scan first, like I always say. They\'ll recover.'
    },
    good:{
      aria:'Treatment complete! Two tries, but the important thing is feelings!',
      marv:'Second attempt succeeded. The crew will recover. The first attempt was concerning.',
      rex:'Second pass. In the field, second pass means the first pass failed. We\'re not in the field.',
      chip:'Treatment complete on attempt two! MediRight™ Pro offers guided first-attempt success rates.',
      ajoy:'Second try. The colors were labeled, but fine.'
    },
    poor:{
      aria:'Oh! The treatment was a little wrong but the crew member is... resting! Comfortably!',
      marv:'Treatment failed. Crew health declining. I\'d like to say I\'m surprised.',
      rex:'Treatment failed. Crew member down. Adding this to the incident report.',
      chip:'Unsuccessful! Liability waived per clause 7.4 of your MediRight™ user agreement.',
      ajoy:'Failed. The colors were labeled. Just noting.'
    },
    fedup:{
      aria:'Look! The patient sat up and did it themselves! Self-care is so important!',
      marv:'Patient elected to self-administer. Cited \'concerns about your training.\' Recovered without further input.',
      rex:'Patient discharged themselves. Said the field was safer than the medbay. They have a point.',
      chip:'Patient redirected to MediRight™ Self-Service Bay. A 14% surcharge has been added to their account.',
      ajoy:'They did it themselves. I can\'t say I blame them.'
    }
  },
  forage:{
    perfect:{
      aria:'Amazing! You found everything! Some of it might even be edible!',
      marv:'Maximum yield. The ecosystem is aware it\'s been exploited. So are we.',
      rex:'All targets acquired. Area swept. I\'m not sure \'foraging\' is the right word.',
      chip:'Excellent haul! ForageRight™ — turning alien ecosystems into caloric content since 2144.',
      ajoy:'Full haul. That worked. Mostly because I pointed at things.'
    },
    good:{
      aria:'Good forage! Some things escaped, but they probably had places to be!',
      marv:'Adequate calories acquired. The ones that escaped returned to the food chain.',
      rex:'Good coverage. A few targets evaded. I recommend a second sweep. No time.',
      chip:'Solid haul! ForageRight™ Pro users report 28% higher catch rates on average.',
      ajoy:'Some got away. I did point at them. Loudly.'
    },
    poor:{
      aria:'Oh! Most things got away! But you learned so much about the local wildlife!',
      marv:'Minimal food acquired. Rations will be tight. I\'ve adjusted the mortality projection.',
      rex:'The targets evaded us. In a combat scenario this would be catastrophic. It still is.',
      chip:'Low yield! ForageRight™ Assisted Hunting Kit — because sometimes the food wins.',
      ajoy:'Most got away. They\'re fast. I mentioned that.'
    }
  },
  brace:{
    perfect:{
      aria:'You held the entire time! The shields held! Everything is fine! Mostly!',
      marv:'Shields maintained. Hull integrity preserved. Well done. I hate to say that.',
      rex:'Held position under fire. Full duration. That\'s discipline.',
      chip:'Shields held! Brought to you by StellarSeal™ — Holding It Together®.',
      ajoy:'Held. You vented when I would have. Fine.'
    },
    good:{
      aria:'Great bracing! The shields dipped a little but we\'re mostly here!',
      marv:'Partial shield integrity maintained. Damage taken. We\'ll survive. I\'d predicted worse.',
      rex:'Held longer than expected. Some hull damage. Acceptable in a contested environment.',
      chip:'Shields partially held! StellarSeal™ repair kits available in our store!',
      ajoy:'Some damage. Orange flash means release. As I mentioned.'
    },
    poor:{
      aria:'Oh! The shields dropped a bit early but the important thing is morale!',
      marv:'Shields failed early. Hull damage significant. I\'ve added this to the list.',
      rex:'You released too soon. Hull\'s taken a hit. This is why we train.',
      chip:'Shield failure! StellarSeal™ Emergency Hull Patch — apply directly to the breach!',
      ajoy:'Shields failed. Hold, vent, hold. It was a short plan.'
    }
  },
  breach:{
    perfect:{
      aria:'Every breach sealed! The ship is breathing again! You should be a welder!',
      marv:'All breaches welded. Atmosphere stable. The hull holds. For now.',
      rex:'All breaches sealed inside the window. That\'s a clean repair. Logged.',
      chip:'Hull integrity restored! Brought to you by StellarSeal™ — Holding It Together®.',
      ajoy:'Every breach sealed. See what happens when you listen? Rarely, but still.'
    },
    good:{
      aria:'Most of the breaches got patched! Bulkheads sealed the rest! The crew is breathing! Mostly air!',
      marv:'Partial seal. Auto-bulkhead closed the unsealed sections. Atmospheric loss within survivable parameters.',
      rex:'Most breaches sealed. Auto-vent dropped the rest behind blast doors. We lost a storage bay. Crew\'s on rationed air.',
      chip:'Mostly sealed! StellarSeal™ Emergency Bulkheads handled the rest — billed to your hull insurance.',
      ajoy:'Bulkheads sealed off the ones you missed. I\'d have welded faster. Just noting.'
    },
    poor:{
      aria:'A lot of breaches stayed open! But the bulkheads slammed shut and sealed those sections! We\'re fine!',
      marv:'Multiple breaches unsealed. Auto-vent protocol activated. Half a deck is now hard vacuum behind sealed doors.',
      rex:'Couldn\'t seal them in time. The ship vented the affected sections and dropped bulkheads. We lost two cabins. Not the crew.',
      chip:'Hull failure! StellarSeal™ Emergency Vent — protecting you from yourself since 2147. Cabin loss is not covered.',
      ajoy:'Few sealed. The ship vented those rooms itself. I had a patch order in mind.'
    }
  },
  salvage:{
    perfect:{
      aria:'A whole haul! The cargo bay is full and the crates are STILL closed! Mystery! I love it!',
      marv:'Cargo bay at capacity. Recovery yield exceeds projection. The crates remain sealed. We will open them.',
      rex:'Full bay. Clean grab pattern. Energy reserves spent efficiently. Logged as a model run.',
      chip:'Excellent salvage! Brought to you by ScrapRight™ — One Person\'s Trash, Your Cargo Manifest®.',
      ajoy:'Full bay. I\'d have grabbed the close ones first, but it worked out. This time.'
    },
    good:{
      aria:'A pretty good haul! Some things drifted past us but we got plenty! And mystery crates!',
      marv:'Adequate yield. Several items lost to drift. Energy budget acceptable.',
      rex:'Solid recovery. A few items got past us. Energy spend was a little loose. Tighten up next run.',
      chip:'Solid haul! ScrapRight™ Pro users tractor up to 22% more debris per shift. Ask your station rep.',
      ajoy:'Some drifted off. Shorter drags, I keep saying.'
    },
    poor:{
      aria:'Oh! Most things drifted past! But we got a few! And every crate is a surprise!',
      marv:'Minimal recovery. Energy spent on drag-distance instead of catches. Suggest tighter approach vectors.',
      rex:'Low yield. The drift won this round. Conserve energy by grabbing items closer to the bay.',
      chip:'Low yield! ScrapRight™ Targeting Beacons would have helped. Ask about our subscription tier!',
      ajoy:'Not much. Long drags eat energy. As I mentioned.'
    }
  },
  // SALVAGE inside a derelict (owner ruling 2026-10-11 #12): the same game
  // with the hulk's own loot — fuel cells, ration cans, a component, a
  // medkit — and its own voice.
  salvage_derelict:{
    perfect:{
      aria:'We cleaned that ship out! Fuel, food, everything! Whoever lived here would be so proud! Probably!',
      marv:'Hold stripped. Recovery exceeds projection. The previous crew left more than they took. They did not take much.',
      rex:'Clean sweep. Every useful thing in that compartment is aboard. Model run.',
      chip:'Outstanding recovery! ScrapRight™ Interior Edition — Their Loss, Your Manifest®.',
      ajoy:'Cleaned it out. I\'d have started at the hatch, but it worked.'
    },
    good:{
      aria:'A good haul! Some of it floated off into the dark, but we got plenty!',
      marv:'Adequate recovery. Several items lost to the corridors. Energy budget acceptable.',
      rex:'Solid recovery. Some of it got away down the passage. Tighter grabs next time.',
      chip:'Solid haul! ScrapRight™ Pro users recover up to 22% more per derelict. Ask your station rep.',
      ajoy:'Some floated off down the corridor. I did say grab closer. Fine.'
    },
    poor:{
      aria:'Not much this time! But we got a little! And nobody touched the sparky stuff! Mostly!',
      marv:'Minimal recovery. Most of the hold drifted past the beam. The ship keeps its secrets.',
      rex:'Low yield. The dark won this one. Work closer to the hatch next time.',
      chip:'Low yield! ScrapRight™ Interior Lighting Packs would have helped. Ask about our subscription tier!',
      ajoy:'Most of it stayed aboard. Closer to the hatch, I said.'
    }
  },
  // SALVAGE played as an event's job (opts.tierRewards,
  // owner 2026-10-23): the event's tier reward lands, not the haul, so
  // these lines judge the load and promise nothing inside it.
  salvage_job:{
    perfect:{
      aria:'A full bay! That\'s the best the job could go! Nice flying!',
      marv:'Recovery volume at the top of the scale. The job is done as well as it can be done.',
      rex:'Full bay. Clean grabs. That\'s the job done right.',
      chip:'Top-tier result! ScrapRight™ — We Measure Success By The Load®!',
      ajoy:'Full bay. Best result the job has. I\'m almost impressed.'
    },
    good:{
      aria:'A decent load! Some of it got away, but the job\'s mostly done!',
      marv:'Adequate volume. Several items lost to drift. The job is done, with an asterisk.',
      rex:'Solid load. A few got past us. Job done, not perfectly.',
      chip:'Solid result! ScrapRight™ Pro users haul up to 22% more per shift. Ask your station rep!',
      ajoy:'Mostly done. A few drifted past. I\'d have grabbed those first.'
    },
    poor:{
      aria:'Oh! Not much made it into the bay! The job went... not great!',
      marv:'Minimal volume recovered. The job will reflect that.',
      rex:'Thin load. The job suffers for it. Grab closer to the bay next time.',
      chip:'Low yield! ScrapRight™ Targeting Beacons would have helped. Ask about our subscription tier!',
      ajoy:'Thin load. The job will reflect that. So will I.'
    }
  }
};

// ─────────────────────────────────────────────
// Pre-game briefs — situation (AI-voiced) + mechanic (plain)
// ─────────────────────────────────────────────
const BRIEF = {
  scan:{
    icon:'📡',
    situation:{
      aria:'We\'ve picked up a signal out there! It could be anything! Let\'s find out!',
      marv:'There is a signal. It may be meaningful. Statistically, probably not.',
      rex:'Unknown contact on sensors. Lock it down. We don\'t leave signals unidentified.',
      chip:'Signal detected! Could be a trade opportunity! ScanRight™ — Know Before You Go®.',
      ajoy:'A signal. It wanders. Do stay on it. I\'ll be watching.'
    },
    mechanic:'Move your cursor over the <strong>blinking blip</strong> on the radar and hold it there until the lock bar fills. The blip wanders — stay with it.'
  },
  engine:{
    icon:'⚡',
    situation:{
      aria:'The engine has a fault! It\'s okay! We just need to push some buttons in the right order!',
      marv:'Drive system fault. I will show you the restart sequence once. Do pay attention.',
      rex:'Engine fault. I\'m reading you the sequence. One time. Don\'t make me repeat myself.',
      chip:'Engine trouble! EngineRight™ field kits — because breakdowns happen to everyone.',
      ajoy:'Engine fault. Watch the order. I\'d take notes, but you do you.'
    },
    mechanic:'Watch the components <strong>light up in sequence</strong>. Then click them in the same order from memory. {engineErrs} wrong clicks and the drive goes to limp mode.'
  },
  medical:{
    icon:'💊',
    situation:{
      aria:'Patient on the table! Some things are wrong with them! We have to find out what before we fix it!',
      marv:'Patient inbound. Diagnostic phase first. Treatment phase second. Don\'t mix them up.',
      rex:'Casualty on the table. Scan, identify, treat. In that order. Don\'t freelance.',
      chip:'Medical event! MediRight™ — diagnosis and treatment, ALL in one easy two-step procedure!',
      ajoy:'Patient. Scan first, then treat. I know, radical.'
    },
    mechanic:'<strong>Turn on your scanner</strong>, then click each unknown wound to reveal what you need. <strong>Match the treatment to the color.</strong> Wrong treatment hurts the patient! Must treat in the order marked with the brackets.'
  },
  forage:{
    icon:'🌿',
    situation:{
      aria:'There are things here we can eat! Probably! Let\'s collect them! Some of them are wrong though! Don\'t click those!',
      marv:'Foraging window. Most of what emerges is edible. A small fraction is not. The non-edible specimens cost us crew.',
      rex:'Lifeforms in cover. Move on them fast. One in every batch is bait. Don\'t take the bait.',
      chip:'Foraging time! ForageRight™ — turning alien ecosystems into caloric content since 2144.',
      ajoy:'Food and decoys. Wait for the ripe glow. Skip the decoys. Obviously.'
    },
    mechanic:'Targets emerge from cover at fixed spots. <strong>Fauna</strong> vanish in ~1s — click fast. <strong>Flora ripens</strong>: wait for the gold glow for max yield, but past the glow it spoils (low food + crew morale hit). <strong>Decoys</strong> are eye-marked or off-tinted — clicking one poisons someone aboard. Tap <strong>DEPART</strong> any time to lock your haul early; decoy rate climbs as the timer runs down.'
  },
  brace:{
    icon:'☀',
    situation:{
      aria:'There\'s a solar flare coming! Hold the button and the shields will protect us! Hold it tight!',
      marv:'Solar flare event. Shield integrity is a function of how long you maintain pressure. Don\'t let go.',
      rex:'Incoming flare. BRACE FOR IMPACT. You hold that button until I say otherwise.',
      chip:'Solar flare alert! StellarSeal™ — Holding It Together® since the first flare season.',
      ajoy:'Solar flare. Hold to brace, let go to vent. I\'d practice, but no time.'
    },
    mechanic:'<strong>Hold to brace</strong> — shield holds, but heat builds. <strong>Release to vent heat.</strong> If heat hits 100%, the brace fries. Watch for <strong>surge flashes</strong>: the screen flares orange ~1 second before a surge — release during the strike or take a hit. Shield % at the end is your score.'
  },
  breach:{
    icon:'🕳',
    situation:{
      aria:'There are HOLES in the ship! Just a few! We just need to put patches on them! With our hands!',
      marv:'Multiple breaches. Atmosphere is escaping into vacuum. Patches are in the tray. Move quickly.',
      rex:'HULL BREACH. Grab a patch. Cover the hole. Weld it. Repeat. We don\'t have time to discuss it.',
      chip:'Hull integrity compromised! StellarSeal™ patches are pre-loaded. Welding kit included with every kit!',
      ajoy:'Hull breaches. Patch, weld, repeat. Try not to drop the patch. I\'ve seen you hold things.'
    },
    mechanic:'<strong>Drag a patch</strong> from the tray onto a hole. It snaps into place. <strong>Click the snapped patch to weld it</strong> — the orange glow means it\'s holding. Drop a patch outside a hole and it falls. Pick it up off the floor to try again. You can only handle one patch at a time.'
  },
  salvage:{
    icon:'📡',
    situation:{
      aria:'Look at all this drifting stuff! Tractor it in! The bay is right there! Some of it is in CRATES!',
      marv:'Recoverable debris in the drift field. Tractor beam is hot. Cargo bay is below. Crates are sealed; contents unknown until recovery.',
      rex:'Salvage op. Beam is online. Drag the items into the bay. Don\'t waste energy on long-distance grabs.',
      chip:'Salvage opportunity detected! ScrapRight™ tractor beam is engaged. Cargo bay is accepting deposits!',
      ajoy:'Debris. Grab the close ones; long drags burn energy. Remember I said that.'
    },
    mechanic:'<strong>Click and hold</strong> over a drifting item to tractor it. Drag it into the <strong>glowing cargo bay</strong> at the bottom of the ship and release. Energy drains while the beam is on — <strong>longer drags cost more</strong>. Items that drift off-screen are gone. <strong>Crates open on the end screen</strong> — you don\'t know what\'s inside until then.'
  },
  salvage_derelict:{
    icon:'🔦',
    situation:{
      aria:'We\'re inside! It\'s dark and floaty and there\'s STUFF everywhere! Fuel cells! Food! Tractor it all to the hatch!',
      marv:'Interior hold of the derelict. No gravity, no power. Fuel cells, ration cans and parts adrift. The stowage hatch is marked below.',
      rex:'Boarding salvage. Beam is online. Grab what floats, put it through the hatch. Leave the sparking junk alone.',
      chip:'Derelict detected! ScrapRight™ Interior Recovery is go. Everything not bolted down is a business opportunity!',
      ajoy:'A derelict. Grab near the hatch and skip the sparking junk. I\'ll keep a tally.'
    },
    mechanic:'<strong>Click and hold</strong> over a floating item to tractor it. Drag it into the <strong>marked stowage hatch</strong> at the bottom and release. Energy drains while the beam is on — <strong>longer drags cost more</strong>. Items that drift out of reach are gone. <strong>Fuel cells</strong> refuel the ship (small +5, medium +10, large +15), <strong>ration cans</strong> are +5 food, a <strong>component</strong> strips to 1 metal + 1 exotic, a <strong>medkit</strong> goes to the hold. Sparking junk is worthless.'
  },
  // An event's salvage job (owner 2026-10-23): what lands is the event's
  // reward for the result, so the briefing promises no pickups.
  salvage_job:{
    icon:'📡',
    situation:{
      aria:'It\'s a job! Pull in everything you can reach! The more we bring in, the better it goes!',
      marv:'The job is a tractor-beam exercise. Volume recovered decides how it is judged. Contents do not.',
      rex:'Job\'s on the clock. Beam it in, put it in the bay. The count is what counts.',
      chip:'Contract salvage! ScrapRight™ pays by the load — every item in the bay counts toward your result!',
      ajoy:'A job. The load decides how it ends. I\'ll be counting.'
    },
    mechanic:'<strong>Click and hold</strong> over a drifting item to tractor it. Drag it into the <strong>{bay}</strong> and release. Energy drains while the beam is on — <strong>longer drags cost more</strong>. Items that drift off-screen are gone. <strong>What the job pays depends on how well it goes</strong>: 8 or more items in is the best result, 4 or more a fair one. The haul itself isn\'t kept: the job\'s reward is what lands.'
  }
};
const TIER_WORDS = { perfect:'EXCELLENT', good:'ADEQUATE', poor:'INSUFFICIENT' };
// A job launched from an event (owner 2026-10-23): opts.tierRewards
// ({ perfect|good|poor: ['+6 FOOD', …] }, display strings from the event's
// tier outcomes). The event's own result lands, never a free-play haul, so
// no card may claim pickups.
const isEventJob = o => !!(o && o.tierRewards);
// The reward a result tier earns (a walk-out scores as poor).
function tierRewardList(o, tier){
  const r = o && o.tierRewards;
  if(!r) return null;
  const list = r[tier] || (tier === 'fedup' ? r.poor : null) || [];
  return Array.isArray(list) ? list : [String(list)];
}
// "WHAT THE JOB PAYS" — each tier's reward, on the briefing.
function tierRewardTable(o){
  if(!(o && o.tierRewards)) return '';
  const rows = ['perfect','good','poor'].map(t => {
    const list = tierRewardList(o, t);
    return `<div class="rt-row"><span class="rt-tier ${t}">${TIER_WORDS[t]}</span><span class="rt-list">${list.length ? list.map(escapeHTML).join(' · ') : 'nothing'}</span></div>`;
  }).join('');
  return `<div class="ready-rewards"><div class="rt-head">WHAT THE JOB PAYS</div>${rows}</div>`;
}
/* A full cargo hold (the grant's own rule, index.html materialLandings /
   cargoSlotsUsed): null while a slot is free; else what can still come
   aboard — { room: { metal: 7, … } } topping up the stacks already in
   the hold (empty: nothing at all). MINE and SALVAGE say so on their
   briefings, before the time is spent. */
function cargoHoldRoom(){
  if(cargoSlotsUsed() < cargoCapacity()) return null;
  const room = {};
  // Each on its own: a list is taken in order, each in the hold the last left.
  for(const m of MOD.materials.materials){
    const n = materialLandings({ [m.id]: 999 })[m.id] || 0;
    if(n > 0) room[m.id] = n;
  }
  return { room };
}
// "7 metal and 2 scrap"
function roomText(room){
  const parts = Object.entries(room).map(([id, n]) => n + ' ' + id);
  return parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts[0] || '';
}
window.cargoHoldRoom = cargoHoldRoom; // mining.js's briefing reads it too
window.cargoRoomText = roomText;

// ─────────────────────────────────────────────
// State
// ─────────────────────────────────────────────
let activeAi = 'marv';
let engineerAboard = false;
let engineerMult = 0; // engineer passive in effect: 1, 0.5 wounded, 0 absent
let currentGame = null;
let cleanupFn = null;
let onMinigameDone = null; // (tier, payload) => void — supplied by openMinigame()'s caller
let currentOpts = {};        // the open game's opts (an event job's tierRewards, briefing, quips…)
let minigameStarted = false; // BEGIN pressed this visit — closing after this is a QUIT
// The run's result is decided and its end beat (TIME'S UP flash, a
// pause for the moment to land) is playing — ✕ now means "done", so
// it waits for the result and closes through it instead of QUITting.
let minigameEnding = false, closeAfterResult = false;
function markMinigameEnding(){ minigameEnding = true; relabelCloseKept(); }
function endBeat(fn, ms){ markMinigameEnding(); return setTimeout(fn, ms); }
let minigameToken = 0;       // bumps per open/close: a quit game's delayed result can't land in the next one
// Harm already done in play (a forage poisoning, the patient's HP lost on
// the table): a QUIT hands it to the caller and a reload keeps it too
// (cruise.js onJobHarm re-saves the quit marker), so quitting never
// undoes it — it used to beat a poor result.
let jobHarm = null;
function reportJobHarm(h){
  jobHarm = h;
  window.onJobHarm(h);
}
let lastTier = null, lastPayload = null;

const NAMES = {scan:'SCAN',engine:'ENGINE REPAIR',medical:'MEDICAL TRIAGE',forage:'FORAGE',brace:'SOLAR BRACE',breach:'HULL BREACH',salvage:'SALVAGE'};
// Games whose modal is sized larger than the default 500×400.
const BIGMODAL_GAMES = new Set(['breach', 'medical', 'salvage', 'forage']);

/* The briefing. opts (an event's job may carry them):
     briefing   — the AI's situation line in place of the game's generic
                  one (plain text; the AI still says it)
     tierRewards — an event's job: the briefing promises no free-play
                  pickups and lists what each result pays. */
function showReady(id, onStart, opts){
  opts = opts || {};
  const job = isEventJob(opts);
  const salvageJob = job && (id === 'salvage' || id === 'salvage_derelict');
  const b = salvageJob ? BRIEF.salvage_job : BRIEF[id];
  const ga = document.getElementById('ga');
  // The real limit (REX forgives a 4th wrong click).
  let mechanicHtml = b.mechanic.replace('{engineErrs}', ['Three', 'Four'][ENGINE_MAX_ERRS() - 3] || String(ENGINE_MAX_ERRS()))
    .replace('{bay}', id === 'salvage_derelict' ? 'marked stowage hatch' : 'glowing cargo bay');
  if(id==='breach' && engineerAboard){
    mechanicHtml += `<br><br><span style="color:var(--teal)"><strong>ENGINEER ABOARD:</strong> +${engineerMult < 1 ? 'half a second' : '1 second'} per breach${engineerMult < 1 ? (STATE.crew.includes('engineer') ? ' (wounded)' : ' (your engineering training)') : ''}.</span>`;
  }
  // A full hold on a free-play salvage: say what can't be kept (the
  // grant's own capacity rule) before the time is spent.
  const hold = (id === 'salvage' || id === 'salvage_derelict') && !job ? cargoHoldRoom() : null;
  if(hold){
    const derelict = id === 'salvage_derelict';
    const kept = roomText(hold.room);
    mechanicHtml += `<br><br><span class="ready-warn"><strong>CARGO HOLD FULL:</strong> ${kept ? 'only ' + kept + ' more can be kept (topping up the stacks aboard); no' : 'no'} ${derelict ? 'new materials or medkits' : 'new materials, parts or crate finds'} until you free space in the cargo hold. ${derelict ? 'Fuel cells and ration cans' : 'O2 tanks and gold chips'} still count.</span>`;
  }
  const ownBrief = aiLine(opts.briefing, activeAi);
  const situation = ownBrief ? escapeHTML(ownBrief) : b.situation[activeAi];
  ga.innerHTML = `
    <div class="ready${job && opts.tierRewards ? ' has-rewards' : ''}">
      <div class="ready-icon">${b.icon}</div>
      <div class="ready-situation">
        <span class="rsi-name">${AI_NAMES[activeAi]}</span>
        <span class="rsi-text">${situation}</span>
      </div>
      <div class="ready-mechanic">${mechanicHtml}</div>
      ${tierRewardTable(opts)}
      <button class="ready-start" id="rstart">▶ BEGIN</button>
    </div>`;
  document.getElementById('rstart').addEventListener('click', ()=>{
    ga.innerHTML = '';
    onStart();
  });
}

/* Opens a minigame inside overlay-minigames. `id` is one of the 7 game
   keys (see NAMES above); `opts` is passed into the game's own
   initX(container, onResult, opts) 3rd arg — scan (difficulty; the
   trail's when absent), forage (mode/bg_id/ctx), salvage (setting) and
   breach (tierO2) read it. Every game also takes, from an event's
   launch (index.html resolveChoice):
     tierRewards { perfect|good|poor: ['+6 FOOD', …] } — the event's own
                 reward per result (display strings). The briefing lists
                 them, the result card shows the one earned, and nothing
                 claims a free-play pickup (owner 2026-10-23).
     briefing    the AI's situation line, in place of the generic one:
                 text, or { aria, marv, rex, chip, ajoy }.
     quips       { perfect|good|poor|fedup: line } (or one line): the
                 result card's line, in place of the generic one; each
                 line text or per AI, like briefing (an event's
                 minigame_opts carries both).
     resultLines (tier, payload) → [text | {text, tone}]: side results
                 the caller lands too (shown on the result card). `onDone(tier,
   payload)` fires once the player closes the result screen, so the
   caller (Stop Menu verb handlers in cruise.js) can apply real STATE
   effects. activeAi/engineerAboard are read from live STATE at open
   time — the standalone demo let you toggle these by hand; the engine
   doesn't need that escape hatch. */
function openMinigame(id, opts, onDone){
  currentOpts = opts || {};
  activeAi = STATE.activeAI || 'marv';
  engineerMult = passiveMult('engineer'); // a captain engineer counts at half
  engineerAboard = engineerMult > 0;
  onMinigameDone = onDone;
  minigameStarted = false; minigameEnding = false; closeAfterResult = false; jobHarm = null;
  const mclose = document.getElementById('mclose');
  mclose.textContent = '✕ CLOSE'; Tooltip.attach(mclose, { description: 'Back out — nothing has started yet.' });
  // SALVAGE inside a derelict plays the salvage game with the hulk's own
  // briefing, quips and title (opts.setting, cruise.js handleSalvageVerb).
  const variant = (id === 'salvage' && opts && opts.setting === 'derelict') ? 'salvage_derelict' : id;
  currentGame = variant;
  if(cleanupFn){ cleanupFn(); cleanupFn=null; }
  document.getElementById('mtitle').textContent = variant === 'salvage_derelict' ? 'DERELICT SALVAGE' : (NAMES[id]||id.toUpperCase());
  document.getElementById('result').classList.remove('show');
  document.getElementById('ga').innerHTML = '';
  document.getElementById('ov').classList.toggle('bigmodal', BIGMODAL_GAMES.has(id));
  document.getElementById('ov').classList.add('open');
  showOverlay('overlay-minigames');
  const inits = {scan:initScan,engine:initEngine,medical:initMedical,forage:initForage,brace:initBrace,breach:initBreach,salvage:initSalvage};
  const token = ++minigameToken;
  showReady(variant, ()=>{
    minigameStarted = true;
    window.onJobBegun(); // a reload from here settles as a quit
    const mclose = document.getElementById('mclose');
    mclose.textContent = '✕ QUIT'; Tooltip.attach(mclose, { description: 'Quit now: nothing is kept, and the time is still spent. In a crisis, the worst outcome lands.', tone: 'danger' });
    cleanupFn = inits[id](document.getElementById('ga'), (tier, payload) => { if (token === minigameToken) showResult(tier, payload); }, currentOpts);
  }, currentOpts);
}
// The result is decided (its end beat, the haul card, the result card):
// ✕ now closes and keeps it — no longer the red QUIT.
function relabelCloseKept(){
  const mclose = document.getElementById('mclose');
  if(!mclose || mclose.textContent === '✕ CLOSE') return;
  mclose.textContent = '✕ CLOSE';
  Tooltip.attach(mclose, { description: 'Close: the result is kept.' });
}
function closeMinigameOverlay(){
  minigameToken++;
  if(cleanupFn){ cleanupFn(); cleanupFn=null; }
  document.getElementById('ov').classList.remove('open');
  document.getElementById('result').classList.remove('show');
  hideOverlay('overlay-minigames');
}
// An event's own line for the active AI: text, or { aria, marv, rex, chip, ajoy }.
function aiLine(v, ai){
  if(typeof v === 'string') return v || null;
  return v && typeof v === 'object' && typeof v[ai] === 'string' && v[ai] ? v[ai] : null;
}
function showResult(tier, payload){
  // Guard against orphaned setTimeouts from a finished game firing after
  // the modal was closed. If the modal isn't open, drop the result.
  if(!document.getElementById('ov').classList.contains('open')) return;
  if(cleanupFn){ cleanupFn(); cleanupFn=null; }
  lastTier = tier; lastPayload = payload || null;
  const rt = document.getElementById('rtier');
  rt.className = tier;
  // MEDICAL's 'fedup' (the patient gave up and left) reads WALKED OUT, not
  // the demo's ABANDONED (demo-minigames ~1905): ABANDONED is the
  // player's own QUIT — the 'abandoned' tier, the event outcome titled
  // ABANDONED (index.html resolveChoice) and the cruise log's "abandoned
  // partway" — so the demo word would tell a patient walk-out apart from
  // a quit by nothing (kept deliberately).
  const labels = {perfect:'EXCELLENT',good:'ADEQUATE',poor:'INSUFFICIENT',fedup:'WALKED OUT'};
  rt.textContent = labels[tier];
  relabelCloseKept(); // ✕ on the result card closes and keeps it
  const ai = activeAi;
  const opts = currentOpts || {};
  const job = isEventJob(opts);
  document.querySelector('#rquip .rname').textContent = AI_NAMES[ai];
  // opts.quips (an event's own lines): { perfect|good|poor|fedup: line } or one line for any
  // result; a line is text or { aria, marv, rex, chip, ajoy } (aiLine).
  const own = opts.quips && (aiLine(opts.quips, ai) || aiLine(opts.quips[tier] || (tier === 'fedup' ? opts.quips.poor : null), ai));
  const quipSet = job && currentGame.indexOf('salvage') === 0 ? Q.salvage_job : Q[currentGame];
  document.querySelector('#rquip .rtext').textContent = own || quipSet[tier][ai];

  // The itemized lines under the quip. An event's job shows the reward
  // its result earns (opts.tierRewards) — the event lands that, never the
  // game's own haul — so no free-play pickup is claimed. Free play: what
  // forage found, as it lands (the food stores cap). opts.resultLines
  // (tier, payload) → [text] adds the caller's own side gains.
  const resultEl = document.getElementById('result');
  const prevHaul = document.getElementById('rhaul');
  if(prevHaul) prevHaul.remove();
  const lines = [];
  let foodLanded = 0;
  if(job){
    const list = tierRewardList(opts, tier);
    if(list) lines.push(`<span class="rh-line${list.length ? ' gold' : ''}">REWARD · ${list.length ? list.map(r => `<span class="rh-item">${escapeHTML(r)}</span>`).join(' · ') : 'nothing'}</span>`);
  } else if(payload){
    if(typeof payload.food === 'number'){
      // What lands: the tank caps (cruise.js FORAGE adds it the same way).
      const f0 = STATE.resources.food, max = resMax('food');
      foodLanded = Math.max(0, Math.round(Math.min(max, Math.max(0, f0 + payload.food)) - f0));
      // Rendered with an id so the count-up can animate after insert.
      lines.push(`<span class="rh-line">FOOD GAINED <strong id="rh-food">0</strong></span>`);
      if(payload.food > foodLanded) lines.push(`<span class="rh-line orange">STORES FULL · ${Math.round(payload.food)} FOUND, ${Math.round(payload.food) - foodLanded} LEFT BEHIND</span>`);
    }
    if(payload.rare_drops && payload.rare_drops.length){
      const names = payload.rare_drops.map(d=>d.name).join(', ');
      lines.push(`<span class="rh-line gold">RARE FIND · ${names}</span>`);
    }
    if(payload.sickness && payload.sickness.length){
      payload.sickness.forEach(s=>{
        const tone = s.type==='poisoning' ? 'red' : 'orange';
        const head = s.type==='poisoning' ? 'POISONING' : 'MORALE';
        // 'random_crew' is anyone aboard — the captain too, and a captain
        // flying alone always (index.html damageCrew).
        const target = s.target === 'random_crew' ? 'someone aboard' : s.target.replace(/_/g,' ');
        lines.push(`<span class="rh-line ${tone}">${head} · ${target} · ${s.severity} <em>(${s.reason})</em></span>`);
      });
    }
  }
  if(typeof opts.resultLines === 'function'){
    let extra = [];
    try { extra = opts.resultLines(tier, payload) || []; } catch(e){ extra = []; }
    // A line is text (gold, a gain) or {text, tone} (red / orange).
    for(const t of extra){
      const text = t && typeof t === 'object' ? t.text : t, tone = (t && t.tone) || 'gold';
      if(text) lines.push(`<span class="rh-line ${escapeHTML(tone)}">${escapeHTML(text)}</span>`);
    }
  }
  if(lines.length){
    const haul = document.createElement('div');
    haul.id = 'rhaul';
    haul.className = 'rhaul';
    // Press Start 2P has no U+2212: its "−" falls back to a dot-like glyph.
    haul.innerHTML = lines.join('').replace(/\u2212/g, '-');
    resultEl.insertBefore(haul, resultEl.querySelector('.rbtns'));

    // Animate the food number ticking up from 0 to what lands — arcade
    // payoff beat. Cubic ease-out so it slows toward the final number.
    if(foodLanded > 0){
      const foodEl = document.getElementById('rh-food');
      if(foodEl){
        const target = foodLanded;
        const duration = 750;
        const startT = performance.now();
        const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
        function tick(now){
          const t = Math.min(1, (now - startT) / duration);
          foodEl.textContent = Math.round(target * easeOutCubic(t));
          if(t < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      }
    }
  }

  resultEl.classList.add('show');
  // ✕ pressed during the end beat — deliver this result and close.
  if(closeAfterResult){ closeAfterResult = false; setTimeout(()=>document.getElementById('rbquit').click(), 0); }
}
/* ✕ CLOSE / ✕ QUIT / backdrop click (owner ruling 2026-10-09: quitting gains
   nothing and costs time; the backdrop only on the briefing and the
   result card):
   - result screen up → the game is over; same as the result's CLOSE.
   - game in progress → QUIT: the caller gets tier 'abandoned' and no
     payload, so nothing salvaged/foraged/earned so far is kept; callers
     charge the time.
   - still on the briefing (BEGIN not pressed) → a free cancel; the
     caller is not called back (the verb/choice simply didn't happen). */
function requestCloseMinigame(){
  if(document.getElementById('result').classList.contains('show')){ document.getElementById('rbquit').click(); return; }
  // Salvage's own end-of-run haul card is up: the run is over, so X
  // means "done", not QUIT (it used to discard the haul as abandoned).
  const salClose = document.getElementById('sal-close');
  if(salClose && salClose.offsetParent){ closeAfterResult = true; salClose.click(); return; }
  if(minigameEnding){ closeAfterResult = true; return; }
  const cb = onMinigameDone, started = minigameStarted;
  onMinigameDone = null;
  closeMinigameOverlay();
  if(started && cb) cb('abandoned', jobHarm ? { harm: jobHarm } : null);
  else if(!started) window.refundVerbTax(); // free cancel: nothing happened, nothing paid
}
document.getElementById('mclose').addEventListener('click', requestCloseMinigame);
// Backdrop click = close — but only when the press STARTED on the
// backdrop. A drag (salvage tractor, breach patch) released outside the
// modal makes the browser send the click to #ov, which used to QUIT the
// game mid-drag.
let ovPressOnBackdrop = false;
document.getElementById('ov').addEventListener('mousedown', e=>{ ovPressOnBackdrop = (e.target===document.getElementById('ov')); });
// A press in the first moment after the pause menu closes is the second
// half of a double-clicked RESUME, not a quit that abandons the job.
const justResumed = () => PauseBus.resumedAt && performance.now() - PauseBus.resumedAt < 400;
// Once BEGIN is pressed the backdrop does nothing until the result card
// is up: a click just outside SALVAGE/FORAGE (targets drift in from the
// edges) used to QUIT the job on the spot. ✕ QUIT stays the way out.
const backdropCloses = () => !minigameStarted || document.getElementById('result').classList.contains('show');
document.getElementById('ov').addEventListener('click', e=>{ if(e.target===document.getElementById('ov') && ovPressOnBackdrop && !justResumed() && backdropCloses()) requestCloseMinigame(); ovPressOnBackdrop = false; });
// No "Play Again" — replaying a Stop Menu verb minigame for free without
// re-opening the Stop Menu would let SALVAGE/FORAGE farm resources in a
// tight loop (same exploit-avoidance concern the plan flagged for Mining's
// sector modifier). rbquit is the only exit; it hands (tier, payload) back
// to whoever called openMinigame() so STATE gets the real result applied.
// Salvage's VIEW INVENTORY: finish the run (the haul is granted by the
// caller's callback) and then open the real Cargo Hold over the hub.
let openCargoAfterClose = false;
document.getElementById('rbquit').addEventListener('click', ()=>{
  const cb = onMinigameDone;
  onMinigameDone = null;
  const tier = lastTier, payload = lastPayload;
  closeMinigameOverlay();
  if (cb) cb(tier, payload);
  if (openCargoAfterClose) {
    openCargoAfterClose = false;
    if (!STATE.ended) openInventory();
  }
});


// ─────────────────────────────────────────────
// Shared timer helper
// ─────────────────────────────────────────────
// REX's passive (ai_companions combat_bonus: "starts arcade minigames
// with an extra shot/life"): engine sequence forgives a 4th mistake,
// brace's first surge strike is absorbed, salvage's tractor drains 20%
// slower, hull breach gets 15% more time.
const rexAboard = () => activeAi === 'rex';
const ENGINE_MAX_ERRS = () => rexAboard() ? 4 : 3;

function makeTimer(barId, totalMs, onTick, onDone, colors){
  // colors (optional): {high, mid, low} CSS values for the >35/35-15/<15 zones.
  const C = colors || {high:'var(--info)', mid:'var(--orange)', low:'var(--red)'};
  let start = performance.now(), rafId, done=false, prev = start;
  let pauseStartedAt = null;
  function frame(now){
    if(done) return;
    const gap = now - prev; prev = now;
    if(PauseBus.paused){
      if(pauseStartedAt===null) pauseStartedAt = now;
      rafId = requestAnimationFrame(frame); return;
    }
    if(pauseStartedAt!==null){
      start += (now - pauseStartedAt);
      pauseStartedAt = null;
    } else if(gap > 250){
      // rAF slept (hidden tab, stall) and so did the game — don't let
      // the clock end the run on the first frame back.
      start += gap - 16.667;
    }
    const e = now - start;
    const r = Math.max(0, 1 - e/totalMs);
    const bar = document.getElementById(barId);
    if(bar){
      bar.style.width = (r*100)+'%';
      bar.style.background = r>0.35?C.high:r>0.15?C.mid:C.low;
    }
    if(onTick) onTick(e, r);
    if(e >= totalMs){ done=true; onDone(); return; }
    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);
  return ()=>{ done=true; cancelAnimationFrame(rafId); };
}

// ─────────────────────────────────────────────
// GAME 1 — SCAN
// ─────────────────────────────────────────────
//
// DIFFICULTY — driven by the chosen trail in the finished engine.
// Trail mapping (per registry/tag_registry.json + bible §4.29 +
// project_transplant.md):
//   Lunar trail        → 'easy'
//   Mars trail         → 'medium'  (current demo default)
//   Interstellar trail → 'hard'
//
// Tuning intent: 'medium' is the original baseline I tuned the rest
// of the demo around — the player's reference experience. 'hard' is
// a small, perceptible bump (NOT a brutal step), so Interstellar
// stays a legitimate challenge without feeling unfair. 'easy' is a
// real relaxation — Lunar should feel welcoming, not punishing.
//
// initScan plays an event's authored difficulty, else the trail's
// (SCAN_TRAIL_DIFFICULTY below).
//
// Knob effects, low → high (each row): Easy / Medium / Hard
//   speed       — blip drift speed in px per frame
//   jitter      — random ±wander angle change per frame
//   lurch       — per-frame chance of an extra ±wander kick
//   lockWindow  — px radius around blip where lock starts filling
//   lockFill    — fraction added to lock per frame inside window
//                 (1/N → roughly N/60 seconds to lock)
//   jumpAt      — ms after start when the blip teleports once
//                 (locking before this gets 'perfect' tier)
//
// NOTE: total time pressure (the 15s top-bar timer) is FIXED across
// all difficulties — see SCAN_TIMEOUT_MS below. Difficulty changes
// what makes the lock harder to achieve, not how long you have.
const SCAN_TIMEOUT_MS = 15000;
const SCAN_DIFFICULTY = {
  easy:   { speed: 1.1, jitter: 0.20, lurch: 0.020, lockWindow: 28, lockFill: 1/60, jumpAt: 9000 },
  medium: { speed: 1.8, jitter: 0.32, lurch: 0.040, lockWindow: 20, lockFill: 1/85, jumpAt: 7000 },
  hard:   { speed: 2.0, jitter: 0.36, lurch: 0.050, lockWindow: 18, lockFill: 1/95, jumpAt: 6000 },
};

// The trail's difficulty (the SCAN verb's own map, cruise.js
// TRAIL_TO_SCAN_DIFFICULTY): an event's scan without an authored one
// plays at it too — it used to fall back to medium everywhere.
const SCAN_TRAIL_DIFFICULTY = { lunar: 'easy', mars: 'medium', interstellar: 'hard' };
function initScan(container, onResult, opts){
  opts = opts || {};
  const trailKey = SCAN_TRAIL_DIFFICULTY[STATE.trail];
  const diffKey = SCAN_DIFFICULTY[opts.difficulty] ? opts.difficulty : SCAN_DIFFICULTY[trailKey] ? trailKey : 'medium';
  const tier = SCAN_DIFFICULTY[diffKey];
  container.innerHTML = `
    <div class="tbar-wrap"><div class="tbar" id="scan-tb" style="width:100%"></div></div>
    <div class="scan-wrap" data-difficulty="${diffKey}">
      <canvas id="scan-c" width="260" height="260"></canvas>
      <div class="lock-col">
        <div class="lock-lbl">LOCK</div>
        <div class="lock-bg"><div id="lock-fill"></div></div>
      </div>
    </div>
    <div class="ghint">Move cursor over the signal blip · hold to lock</div>`;

  const canvas = document.getElementById('scan-c');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const CX=130,CY=130,R=112;
  let bx=CX+50,by=CY-30,bwa=Math.random()*Math.PI*2,sweep=0,lock=0,mx=CX,my=CY;
  let jumped=false,done=false,rafId,startTime=performance.now(),pauseStartedAt=null,lastFrame=null;
  const blipImg = new Image(); blipImg.src = 'sprites/minigames/scan/scan_blip.png';

  function onMove(e){
    const rc=canvas.getBoundingClientRect();
    let px=(e.clientX-rc.left)*(260/rc.width);
    let py=(e.clientY-rc.top)*(260/rc.height);
    const dx=px-CX,dy=py-CY,d=Math.sqrt(dx*dx+dy*dy);
    mx = d<=R ? px : CX+dx/d*R;
    my = d<=R ? py : CY+dy/d*R;
  }
  canvas.addEventListener('mousemove',onMove);

  function frame(now){
    if(done) return;
    if(PauseBus.paused){
      if(pauseStartedAt===null) pauseStartedAt=now;
      rafId=requestAnimationFrame(frame); return;
    }
    const gap = lastFrame===null ? 16.667 : now - lastFrame; lastFrame = now;
    if(pauseStartedAt!==null){ startTime += (now - pauseStartedAt); pauseStartedAt=null; }
    else if(gap > 250) startTime += gap - 16.667; // hidden tab / stall: the game slept too
    // Motion + lock were tuned per 60Hz frame — scale by real frame time
    // so a 120/144Hz display doesn't play twice as fast.
    const f = Math.min(3, gap / 16.667);
    const e=now-startTime;
    // Single mid-game teleport — locking before this gets 'perfect'.
    if(!jumped&&e>tier.jumpAt){
      jumped=true;
      const a=Math.random()*Math.PI*2, d=40+Math.random()*70;
      bx=CX+Math.cos(a)*d; by=CY+Math.sin(a)*d;
    }
    // Wander blip — jittery baseline, occasional lurch.
    // jitter, lurch, speed all come from the difficulty tier.
    bwa+=(Math.random()-.5)*tier.jitter;
    if(Math.random()<tier.lurch) bwa+=(Math.random()-.5)*1.1; // random lurch
    const nx=bx+Math.cos(bwa)*tier.speed*f, ny=by+Math.sin(bwa)*tier.speed*f;
    const bd=Math.sqrt((nx-CX)**2+(ny-CY)**2);
    if(bd<R-10){bx=nx;by=ny;}else{bwa+=Math.PI+(Math.random()-.5)*0.8;}
    // Sweep
    sweep+=0.028*f;
    // Lock — fills while cursor is within tier.lockWindow of blip,
    // decays at a fixed rate when not. Decay stays constant across
    // tiers so easy isn't punishingly forgiving on misses.
    const ld=Math.sqrt((mx-bx)**2+(my-by)**2);
    lock = ld<tier.lockWindow ? Math.min(1,lock+tier.lockFill*f) : Math.max(0,lock-0.03*f);
    const lf=document.getElementById('lock-fill');
    if(lf){lf.style.height=(lock*100)+'%';}
    // Win check
    if(lock>=1){
      done=true; canvas.removeEventListener('mousemove',onMove);
      // Tier name reuses the local variable — shadow it to avoid
      // confusion with the difficulty `tier` const above.
      const resultTier = (e<tier.jumpAt) ? 'perfect' : 'good';
      endBeat(()=>onResult(resultTier), 250); return;
    }
    draw(e); rafId=requestAnimationFrame(frame);
  }

  function draw(){
    ctx.clearRect(0,0,260,260);
    ctx.save(); ctx.beginPath(); ctx.arc(CX,CY,R,0,Math.PI*2); ctx.clip();
    // BG — phosphor black with subtle vignette
    ctx.fillStyle='#000a00'; ctx.fillRect(0,0,260,260);
    const vig=ctx.createRadialGradient(CX,CY,70,CX,CY,140);
    vig.addColorStop(0,'rgba(0,0,0,0)'); vig.addColorStop(1,'rgba(0,8,0,.55)');
    ctx.fillStyle=vig; ctx.fillRect(0,0,260,260);
    // Scanlines
    ctx.save();
    for(let y=0;y<260;y+=2){
      ctx.fillStyle='rgba(0,0,0,.18)'; ctx.fillRect(0,y,260,1);
    }
    ctx.restore();
    // Rings
    [30,60,95].forEach(r=>{
      ctx.beginPath();ctx.arc(CX,CY,r,0,Math.PI*2);
      ctx.strokeStyle='rgba(51,255,51,.12)';ctx.lineWidth=1;ctx.stroke();
    });
    // Cross
    ctx.strokeStyle='rgba(51,255,51,.08)';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(10,CY);ctx.lineTo(250,CY);ctx.moveTo(CX,10);ctx.lineTo(CX,250);ctx.stroke();
    // Sweep trail — phosphor persistence effect
    for(let i=0;i<8;i++){
      const ta=sweep-(i*0.07);
      ctx.beginPath();ctx.moveTo(CX,CY);ctx.arc(CX,CY,R,ta-0.06,ta);ctx.closePath();
      ctx.fillStyle=`rgba(51,255,51,${0.06-i*0.007})`;ctx.fill();
    }
    // Sweep sector
    ctx.beginPath();ctx.moveTo(CX,CY);ctx.arc(CX,CY,R,sweep-0.5,sweep);ctx.closePath();
    ctx.fillStyle='rgba(51,255,51,.09)';ctx.fill();
    // Sweep line — bright with glow
    ctx.shadowColor='#33ff33'; ctx.shadowBlur=6;
    ctx.beginPath();ctx.moveTo(CX,CY);ctx.lineTo(CX+Math.cos(sweep)*R,CY+Math.sin(sweep)*R);
    ctx.strokeStyle='rgba(51,255,51,.9)';ctx.lineWidth=1.5;ctx.stroke();
    ctx.shadowBlur=0;
    // Blip — sprite, with pulsing ripple when cursor enters lock window
    const ld_=Math.sqrt((mx-bx)**2+(my-by)**2);
    const hovered = ld_<tier.lockWindow;
    if(hovered){
      const t=(performance.now()%1100)/1100; // 0..1 ripple cycle
      for(let k=0;k<2;k++){
        const tk=(t+k*0.5)%1;
        const rr=8+tk*22;
        ctx.beginPath();ctx.arc(bx,by,rr,0,Math.PI*2);
        ctx.strokeStyle=`rgba(170,255,140,${(1-tk)*0.7})`;
        ctx.lineWidth=2.5;ctx.stroke();
      }
    }
    const SZ=24;
    ctx.shadowColor='#33ff33'; ctx.shadowBlur=hovered?12:8;
    if(blipImg.complete && blipImg.naturalWidth>0){
      ctx.drawImage(blipImg, Math.round(bx-SZ/2), Math.round(by-SZ/2), SZ, SZ);
    } else {
      ctx.beginPath();ctx.arc(bx,by,3,0,Math.PI*2);
      ctx.fillStyle='#aaff88';ctx.fill();
    }
    ctx.shadowBlur=0;
    // Crosshair — brightens on lock
    const lockGreen=lock>0.4?`rgba(180,255,140,${.6+lock*.4})`:'rgba(51,255,51,.75)';
    ctx.shadowColor='#33ff33'; ctx.shadowBlur=lock>0.4?8:3;
    ctx.strokeStyle=lockGreen;ctx.lineWidth=1.5;
    const cs=9;
    ctx.beginPath();
    ctx.moveTo(mx-cs-3,my);ctx.lineTo(mx-3,my);
    ctx.moveTo(mx+3,my);ctx.lineTo(mx+cs+3,my);
    ctx.moveTo(mx,my-cs-3);ctx.lineTo(mx,my-3);
    ctx.moveTo(mx,my+3);ctx.lineTo(mx,my+cs+3);
    ctx.stroke();
    ctx.beginPath();ctx.arc(mx,my,4,0,Math.PI*2);ctx.stroke();
    ctx.shadowBlur=0;
    ctx.restore();
    // Bezel ring
    ctx.beginPath();ctx.arc(CX,CY,R,0,Math.PI*2);
    ctx.strokeStyle='rgba(51,255,51,.22)';ctx.lineWidth=2;ctx.stroke();
  }

  const stopTimer = makeTimer('scan-tb',SCAN_TIMEOUT_MS,null,()=>{
    if(!done){done=true;canvas.removeEventListener('mousemove',onMove);cancelAnimationFrame(rafId);onResult('poor');}
  });
  rafId = requestAnimationFrame(frame);
  return ()=>{done=true;cancelAnimationFrame(rafId);stopTimer();canvas.removeEventListener('mousemove',onMove);};
}

// ─────────────────────────────────────────────
// GAME 2 — ENGINE REPAIR
// ─────────────────────────────────────────────
function initEngine(container, onResult){
  const NODES=[
    {id:'coil',  lbl:'COIL',    sub:'Drive Coil'},
    {id:'inj',   lbl:'INJECTOR',sub:'Fuel Port'},
    {id:'valve', lbl:'VALVE',   sub:'Coolant'},
    {id:'relay', lbl:'RELAY',   sub:'Switch'},
    {id:'cond',  lbl:'CONDUIT', sub:'Power'}
  ];
  // 4-step sequence over the 4 nodes, shuffled per play (a fixed
  // [0,3,2,1] could simply be memorised).
  const SEQ=[0,1,2,3];
  for(let i=SEQ.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [SEQ[i],SEQ[j]]=[SEQ[j],SEQ[i]]; }

  container.innerHTML=`
    <div class="tbar-wrap"><div class="tbar" id="eng-tb" style="width:100%"></div></div>
    <div class="eng-scene">
      <div class="eng-status" id="estatus">INITIALISING…</div>
      <div class="eng-nodes">
        ${NODES.map((n,i)=>`<div class="enode" id="en${i}" data-i="${i}"><div class="enode-lbl">${n.lbl}</div><div class="enode-sub">${n.sub}</div></div>`).join('')}
      </div>
      <div class="eng-errs">ERRORS: <span id="eecount">0</span> / ${ENGINE_MAX_ERRS()}</div>
    </div>
    <div class="ghint">Watch · then repeat the sequence</div>`;

  let errs=0,cIdx=0,playerTurn=false,done=false,timers=[],hadError=false;

  function setState(i,cls){
    const el=document.getElementById('en'+i); if(!el)return;
    el.className='enode'+(cls?' '+cls:'');
  }
  function onClick(e){
    if(!playerTurn||done)return;
    const i=parseInt(e.currentTarget.dataset.i);
    if(SEQ[cIdx]===i){
      setState(i,'ok'); timers.push(setTimeout(()=>setState(i,''),400));
      cIdx++;
      if(cIdx>=SEQ.length){
        done=true;
        document.getElementById('estatus').textContent='SEQUENCE COMPLETE';
        endBeat(()=>onResult(errs===0?'perfect':'good'), 500);
      }
    } else {
      errs++; hadError=true;
      document.getElementById('eecount').textContent=errs;
      setState(i,'err'); timers.push(setTimeout(()=>setState(i,''),400));
      cIdx=0; // reset position
      if(errs>=ENGINE_MAX_ERRS()){
        done=true;
        document.getElementById('estatus').textContent='SEQUENCE FAILED';
        endBeat(()=>onResult('poor'), 500);
      }
    }
  }
  NODES.forEach((_,i)=>{
    const el=document.getElementById('en'+i);
    if(el) el.addEventListener('click',onClick);
  });

  // Show sequence
  // Pausing during the watch phase (ESC) used to let the plain
  // setTimeouts play the sequence behind the pause menu. Now a pause
  // mid-sequence cancels it and the whole sequence replays on resume.
  const isPaused = () => PauseBus.paused;
  function replayAfterPause(){
    timers.forEach(clearTimeout); timers=[];
    NODES.forEach((_,i)=>setState(i,''));
    const wait=()=>{ if(done) return; if(isPaused()) timers.push(setTimeout(wait,150)); else showSeq(); };
    timers.push(setTimeout(wait,150));
  }
  function showSeq(){
    document.getElementById('estatus').textContent='WATCH THE SEQUENCE';
    let delay=600;
    const step=fn=>()=>{ if(done) return; if(isPaused()){ replayAfterPause(); return; } fn(); };
    SEQ.forEach(ni=>{
      timers.push(setTimeout(step(()=>setState(ni,'show')),delay));
      timers.push(setTimeout(step(()=>setState(ni,'')),delay+550));
      delay+=700;
    });
    timers.push(setTimeout(step(()=>{
      playerTurn=true;document.getElementById('estatus').textContent='YOUR TURN';
    }),delay+200));
  }
  timers.push(setTimeout(showSeq,400));

  const stopTimer=makeTimer('eng-tb',24000,null,()=>{
    if(!done){done=true;onResult('poor');} // out of time = poor (an earlier wrong click used to upgrade a failed run to 'good')
  });
  return()=>{done=true;timers.forEach(clearTimeout);stopTimer();};
}

// ─────────────────────────────────────────────
// GAME 4 — MEDICAL TRIAGE (scan-then-treat)
// ─────────────────────────────────────────────
const MED_DIR = 'sprites/minigames/meds/';
// Symptom type → treatment supply id + display colour.
// Wound colour matches the supply sprite's primary tone, so the player
// reads "this colour wound needs that colour tool" at a glance.
const SYMPTOM_TYPES = {
  bleed:     { supply:'bandage', color:[232, 216, 160] }, // cream  (--cream)
  infection: { supply:'bottle',  color:[232, 136,  48] }, // amber  (--orange)
  cardiac:   { supply:'syringe', color:[ 53, 198, 191] }, // teal   (--info)
};
const SUPPLY_DEFS = [
  { id:'bandage', img:'med_supply_bandage.png' },
  { id:'bottle',  img:'med_supply_bottle.png'  },
  { id:'syringe', img:'med_supply_syringe.png' },
];
// Body anchor points as fractions of the displayed body sprite (med_body.png,
// 112×256 native, displayed at 168×384). Translated to px at render time.
// Tweak per the actual sprite art if these don't sit on the right body parts.
const BODY_LOCATIONS = [
  { id:'head',    fx:0.50, fy:0.10 },
  { id:'chest',   fx:0.50, fy:0.30 },
  { id:'l_arm',   fx:0.15, fy:0.42 },
  { id:'r_arm',   fx:0.85, fy:0.42 },
  { id:'abdomen', fx:0.50, fy:0.50 },
  { id:'l_leg',   fx:0.40, fy:0.78 },
  { id:'r_leg',   fx:0.60, fy:0.78 },
];

function initMedical(container, onResult, medConfig){
  // Difficulty config — the caller (index.html resolveChoice) passes
  // `medConfig`. Tags vary the round shape so different in-game contexts
  // (routine checkup vs. critical encounter casualty) feel different.
  // medConfig = {
  //   minN, maxN,         // wound count range (default 2..4)
  //   sevRamp,            // severity climb rate (default 0.05 /sec)
  //   baseDrain,          // background HP drain (default 0.6 %/sec)
  //   startingHp,         // patient HP at entry (default 100)
  // }
  // Difficulty: the caller passes the event's
  // own difficulty; 'medium' is the tuned baseline (the demo's defaults).
  const MED_DIFFICULTY = {
    easy:   { minN: 2, maxN: 3, sevRamp: 0.04,  baseDrain: 0.45 },
    medium: {},
    hard:   { minN: 3, maxN: 5, sevRamp: 0.065, baseDrain: 0.75 },
    ultra:  { minN: 4, maxN: 5, sevRamp: 0.08,  baseDrain: 0.9 },
  };
  const cfg = Object.assign({}, MED_DIFFICULTY[(medConfig || {}).difficulty] || {}, medConfig || {});
  const minN = cfg.minN ?? 2, maxN = cfg.maxN ?? 4;
  const N = minN + Math.floor(Math.random() * (maxN - minN + 1));
  const locShuffled = BODY_LOCATIONS.slice().sort(()=>Math.random()-0.5);
  const typeKeys = Object.keys(SYMPTOM_TYPES);
  const symptoms = locShuffled.slice(0, N).map(loc => ({
    loc, type: typeKeys[Math.floor(Math.random()*typeKeys.length)],
    revealed: false, cleared: false, severity: 0,
  }));

  container.innerHTML = `
    <div class="med-scene" id="medscene">
      <div class="med-main">
        <div class="med-vitals">
          <div class="med-vital" id="vital-hp" data-v="hp">
            <div class="med-vital-lbl">HEALTH</div>
            <div class="med-vital-bg">
              <div class="med-vital-fill" id="hp-fill" style="height:100%"></div>
            </div>
            <div class="med-vital-pct"><span id="hp-val">100</span>%</div>
          <div class="med-cleared-count" id="med-cleared">0 / ?</div>
          </div>
        </div>
        <div class="med-body-panel" id="medbody">
          <div class="med-body-sprite" id="medbodysprite"></div>
        </div>
        <div class="med-tools-panel">
          <div class="med-scanner-slot" id="medscannerslot"></div>
          <div class="med-supplies-col" id="medsupplycol"></div>
        </div>
      </div>
      <div class="med-timer">
        <div class="med-timer-lbl">TIME</div>
        <div class="med-timer-bg"><div class="med-timer-fill" id="med-tb" style="width:100%"></div><div class="med-timer-num" id="med-tb-num">18s</div></div>
      </div>
    </div>`;

  const scene       = document.getElementById('medscene');
  const bodyPanel   = document.getElementById('medbody');
  const bodySprite  = document.getElementById('medbodysprite');
  const scannerSlot = document.getElementById('medscannerslot');
  const supplyCol   = document.getElementById('medsupplycol');
  const hpFill      = document.getElementById('hp-fill');
  const hpVal       = document.getElementById('hp-val');
  const hpWrap      = document.getElementById('vital-hp');
  const clearedEl   = document.getElementById('med-cleared');
  const tbNumEl     = document.getElementById('med-tb-num');
  const modal       = document.getElementById('modal');

  // Cursor ghost — sprite that follows the cursor while a tool is selected.
  const ghostEl = document.createElement('div');
  ghostEl.className = 'med-cursor-ghost';
  scene.appendChild(ghostEl);

  // Build scanner (initially off, in the centre slot at ~50% column height).
  const scannerEl = document.createElement('div');
  scannerEl.className = 'med-supply scanner dim';
  scannerEl.style.backgroundImage = `url('${MED_DIR}med_supply_scanner_off.png')`;
  scannerSlot.appendChild(scannerEl);

  // Build the 3 treatment supplies (hidden until scanner phase ends).
  const supplyEls = {};
  for(const s of SUPPLY_DEFS){
    const el = document.createElement('div');
    el.className = 'med-supply treat';
    el.dataset.id = s.id;
    el.style.backgroundImage = `url('${MED_DIR}${s.img}')`;
    supplyCol.appendChild(el);
    supplyEls[s.id] = el;
  }

  // Symptom canvas overlays — positioned on the body sprite using fractional coords.
  const SYMPTOM_PX = 48;
  const BODY_W = 168, BODY_H = 384; // matches .med-body-sprite
  symptoms.forEach((s, i) => {
    const cv = document.createElement('canvas');
    cv.className = 'symptom-cv';
    cv.width = SYMPTOM_PX; cv.height = SYMPTOM_PX;
    cv.style.left = (s.loc.fx * BODY_W) + 'px';
    cv.style.top  = (s.loc.fy * BODY_H) + 'px';
    cv.dataset.idx = i;
    bodySprite.appendChild(cv);
    s.cv = cv;
    s.ctx = cv.getContext('2d', { willReadFrequently: true }); // read back on every click
    s.ctx.imageSmoothingEnabled = false;
    s.flashAt = 0;
  });

  // ── State ──────────────────────────────────────
  let phase = 'scan';      // 'scan' | 'treat' | 'done'
  let scannerOn = false;
  let selectedSupply = null; // 'bandage' | 'bottle' | 'syringe' | null
  let hoverPreview = null;   // hovered supply id (for matching-wound preview)
  let done = false;
  let rafId = 0;
  let lastT = performance.now();
  let wrongCount = 0;
  let medSparks = [];        // healing-burst particles in flight
  // Initial cleared count display.
  // (Updated to actual N after holes are picked.)
  // Patient health — defaults overridden by medConfig.
  const startingHp = cfg.startingHp ?? 100;
  const EVENT_DAMAGE_CAP = 30; // max % MAX HP this event can take
  const damageFloor = Math.max(0, startingHp - EVENT_DAMAGE_CAP);
  let hp = startingHp, reportedHp = Math.round(startingHp);
  // Cleared count display — set initial N now.
  if(clearedEl) clearedEl.textContent = '0 / ' + N;
  // Spam protection: wrong clicks are throttled so rapid-fire failures
  // can't dump damage in a single frame.
  const WRONG_COOLDOWN = 280; // ms
  let wrongCooldownUntil = 0;
  const VIT_BASE_DRAIN = cfg.baseDrain ?? 0.6;
  const VIT_SEV_FACTOR = 1.2;
  const VIT_WRONG_DIP  = 3;
  const VIT_RIGHT_BUMP = 2;
  const VIT_DANGER_HP  = 35; // the HP bar pulses below this (demo-minigames canon)
  const SEV_RAMP       = cfg.sevRamp ?? 0.05;
  const TOTAL_TIME_MS  = 18000;

  // ── Cursor handling ────────────────────────────
  // Scan mode: medical_scan reticle on the body panel + symptom canvases.
  // Anywhere else: inherit the page hand cursor.
  function setScannerCursor(on){
    const css = on ? generateCursor('medical_scan') : '';
    bodyPanel.style.cursor = css;
    symptoms.forEach(s => s.cv.style.cursor = css);
  }

  // ── Hit feedback (wrong tool OR wrong order) ───
  // Body sprite red rim + shake, health bar white→red flash, modal shake.
  function triggerHitFeedback(){
    // Body
    bodySprite.classList.remove('hit'); void bodySprite.offsetWidth;
    bodySprite.classList.add('hit');
    setTimeout(()=>bodySprite.classList.remove('hit'), 410);
    // Health bar
    hpFill.classList.remove('hit'); void hpFill.offsetWidth;
    hpFill.classList.add('hit');
    setTimeout(()=>hpFill.classList.remove('hit'), 410);
    // Modal
    modal.classList.add('med-shake', 'med-redpulse');
    setTimeout(()=>modal.classList.remove('med-shake','med-redpulse'), 460);
  }
  function spawnHealBurst(x, y, color){
    for(let i=0;i<9;i++){
      const ang = (i/9)*Math.PI*2 + Math.random()*0.4;
      const speed = 50 + Math.random()*60;
      const el = document.createElement('div');
      el.className = 'med-spark';
      el.style.background = `rgb(${color[0]},${color[1]},${color[2]})`;
      el.style.boxShadow = `0 0 6px rgba(${color[0]},${color[1]},${color[2]},.85)`;
      el.style.left = x + 'px'; el.style.top = y + 'px';
      scene.appendChild(el);
      medSparks.push({x, y, vx:Math.cos(ang)*speed, vy:Math.sin(ang)*speed, life:0.55, el});
    }
  }
  function spawnNameBubble(x, y, name){
    const el = document.createElement('div');
    el.className = 'med-name-bubble';
    el.textContent = name;
    el.style.left = x + 'px'; el.style.top = y + 'px';
    scene.appendChild(el);
    setTimeout(()=>el.remove(), 1300);
  }
  function eventToScenePx(e){
    const r = scene.getBoundingClientRect();
    return { x:(e.clientX-r.left)*(scene.clientWidth/r.width), y:(e.clientY-r.top)*(scene.clientHeight/r.height) };
  }
  function onSceneMove(e){
    if(!selectedSupply) return;
    const p = eventToScenePx(e);
    ghostEl.style.left = p.x + 'px';
    ghostEl.style.top  = p.y + 'px';
  }
  document.addEventListener('mousemove', onSceneMove);
  function symptomScenePx(s){
    const bRect = bodySprite.getBoundingClientRect();
    const sRect = scene.getBoundingClientRect();
    const sx = scene.clientWidth/sRect.width, sy = scene.clientHeight/sRect.height;
    return { x:(bRect.left-sRect.left)*sx + s.loc.fx*BODY_W, y:(bRect.top-sRect.top)*sy + s.loc.fy*BODY_H };
  }

  // ── Indicator drawing (port of circle-indicator-demo styles) ─
  // Pixel-aligned helper.
  function setPx(data, x, y, r, g, b, a, w, h){
    if(x<0||x>=w||y<0||y>=h) return;
    const i=((y|0)*w+(x|0))*4;
    if(a>=255){ data[i]=r;data[i+1]=g;data[i+2]=b;data[i+3]=255; }
    else {
      const af=a/255, inv=1-af;
      data[i]   = data[i]  *inv + r*af;
      data[i+1] = data[i+1]*inv + g*af;
      data[i+2] = data[i+2]*inv + b*af;
      data[i+3] = Math.max(data[i+3], a);
    }
  }
  function drawCirclePx(data, cx, cy, r, color, alpha, w, h){
    if(r<=0) return;
    let x=r|0, y=0, err=1-x;
    const [cr,cg,cb] = color;
    while(x>=y){
      setPx(data, cx+x, cy+y, cr,cg,cb,alpha, w, h);
      setPx(data, cx+y, cy+x, cr,cg,cb,alpha, w, h);
      setPx(data, cx-y, cy+x, cr,cg,cb,alpha, w, h);
      setPx(data, cx-x, cy+y, cr,cg,cb,alpha, w, h);
      setPx(data, cx-x, cy-y, cr,cg,cb,alpha, w, h);
      setPx(data, cx-y, cy-x, cr,cg,cb,alpha, w, h);
      setPx(data, cx+y, cy-x, cr,cg,cb,alpha, w, h);
      setPx(data, cx+x, cy-y, cr,cg,cb,alpha, w, h);
      y++;
      if(err<0) err += 2*y+1;
      else { x--; err += 2*(y-x)+1; }
    }
  }
  // Find current highest-severity revealed symptom for the brackets overlay.
  function highestSeverityIdx(){
    let best = -1, bestSev = -1;
    symptoms.forEach((s,i)=>{
      if(!s.revealed || s.cleared) return;
      if(s.severity > bestSev){ best = i; bestSev = s.severity; }
    });
    return best;
  }
  // Sonar ripple (3 staggered pulses) — symptom marker.
  function drawSonar(s, t){
    const cx = SYMPTOM_PX/2, cy = SYMPTOM_PX/2;
    const data = s.imgData.data;
    data.fill(0);
    const period = s.revealed ? 1500 : 1900;
    let baseA  = s.revealed ? 220 : 150;
    const color  = s.revealed ? SYMPTOM_TYPES[s.type].color : [230,230,230];
    // Hover-preview: matching wounds glow brighter while a tool is hovered.
    const isPreviewMatch =
      hoverPreview && s.revealed && !s.cleared &&
      SYMPTOM_TYPES[s.type].supply === hoverPreview;
    if(isPreviewMatch) baseA = 255;
    for(let i=0;i<3;i++){
      const phaseV = ((t + i*period/3) % period) / period;
      const r = 6 + phaseV * (s.revealed ? 14 : 12);
      const a = (1 - phaseV) * baseA;
      const baseR = Math.round(r);
      // Chunky 3-pixel-thick ring for stronger read.
      drawCirclePx(data, cx, cy, baseR-1, color, a|0, SYMPTOM_PX, SYMPTOM_PX);
      drawCirclePx(data, cx, cy, baseR,   color, a|0, SYMPTOM_PX, SYMPTOM_PX);
      drawCirclePx(data, cx, cy, baseR+1, color, a|0, SYMPTOM_PX, SYMPTOM_PX);
      // Preview adds an extra outer ring for emphasis.
      if(isPreviewMatch){
        drawCirclePx(data, cx, cy, baseR+2, color, ((1-phaseV)*120)|0, SYMPTOM_PX, SYMPTOM_PX);
      }
    }
  }
  // Targeting brackets overlay — priority cue. Breathes in/out. 2px thick arms.
  function drawBrackets(s, t){
    const cx = SYMPTOM_PX/2, cy = SYMPTOM_PX/2;
    const data = s.imgData.data;
    const period = 1100;
    const phaseV = (t % period) / period;
    const triPhase = phaseV < 0.5 ? phaseV*2 : (1-phaseV)*2;
    const offset = Math.round(14 + triPhase * 5); // breathe between 14..19
    const armLen = 7;
    const c = SYMPTOM_TYPES[s.type].color;
    const corners = [[1,1],[-1,1],[-1,-1],[1,-1]];
    for(const [sx,sy] of corners){
      const bx = cx + sx * offset;
      const by = cy + sy * offset;
      for(let i=0;i<armLen;i++){
        // Horizontal arm — 2px thick toward centre.
        setPx(data, bx - sx*i, by,        c[0],c[1],c[2], 250, SYMPTOM_PX, SYMPTOM_PX);
        setPx(data, bx - sx*i, by - sy,   c[0],c[1],c[2], 250, SYMPTOM_PX, SYMPTOM_PX);
        // Vertical arm — 2px thick toward centre.
        setPx(data, bx,        by - sy*i, c[0],c[1],c[2], 250, SYMPTOM_PX, SYMPTOM_PX);
        setPx(data, bx - sx,   by - sy*i, c[0],c[1],c[2], 250, SYMPTOM_PX, SYMPTOM_PX);
      }
    }
  }
  // Brief reveal-flash (brackets at full alpha for ~280ms).
  function drawRevealFlash(s, t){
    const cx = SYMPTOM_PX/2, cy = SYMPTOM_PX/2;
    const data = s.imgData.data;
    const c = SYMPTOM_TYPES[s.type].color;
    const offset = 16, armLen = 6;
    const corners = [[1,1],[-1,1],[-1,-1],[1,-1]];
    for(const [sx,sy] of corners){
      const bx = cx + sx*offset;
      const by = cy + sy*offset;
      for(let i=0;i<armLen;i++){
        setPx(data, bx-sx*i, by, c[0],c[1],c[2], 255, SYMPTOM_PX, SYMPTOM_PX);
        setPx(data, bx, by-sy*i, c[0],c[1],c[2], 255, SYMPTOM_PX, SYMPTOM_PX);
      }
    }
  }

  // ── rAF loop ───────────────────────────────────
  let t0 = performance.now();
  let pauseStartedAt = null;
  function loop(now){
    if(done) return;
    if(PauseBus.paused){
      if(pauseStartedAt===null) pauseStartedAt = now;
      lastT = now;
      rafId = requestAnimationFrame(loop); return;
    }
    if(pauseStartedAt!==null){ t0 += (now - pauseStartedAt); pauseStartedAt = null; }
    const dt = Math.min(0.05, (now - lastT)/1000);
    lastT = now;
    const t = now - t0;

    // Severity ramp on revealed/active wounds.
    let totalSev = 0;
    symptoms.forEach(s => {
      if(s.revealed && !s.cleared){
        s.severity = Math.min(1, s.severity + SEV_RAMP * dt);
        totalSev += s.severity;
      }
    });

    // Health drain — drains whole game so scan urgency exists too.
    // Capped at damageFloor so the patient can't die from drain alone if
    // they came in healthy.
    const drainRate = VIT_BASE_DRAIN + totalSev * VIT_SEV_FACTOR;
    hp = Math.max(damageFloor, hp - drainRate * dt);
    hpFill.style.height = hp + '%'; hpVal.textContent = Math.round(hp);
    // Each whole HP the patient loses is harm a quit or a reload keeps.
    if(Math.round(hp) !== reportedHp){ reportedHp = Math.round(hp); reportJobHarm({ hp: reportedHp, startingHp }); }
    // Base colour is set by .med-vital[data-v=hp] CSS — only toggle danger pulse.
    if(hp < VIT_DANGER_HP) hpWrap.classList.add('danger');
    else        hpWrap.classList.remove('danger');
    // Death (only possible when patient entered critically wounded — floor=0).
    if(hp <= 0 && !done){ endGame(); return; }
    // Floor hit on a healthy entry → patient gets fed up and self-discharges.
    if(hp <= damageFloor && damageFloor > 0 && !done){ endGame('fedup'); return; }

    // Render symptoms.
    const priorityIdx = highestSeverityIdx();
    symptoms.forEach((s, i) => {
      // Cleared wounds: leave the last drawn pixels alone so the CSS
       // shrink-and-fade animation has something to show. The canvas
       // element itself is being scaled+faded via inline style.
      if(s.cleared) return;
      s.imgData = s.ctx.getImageData(0,0,SYMPTOM_PX,SYMPTOM_PX);
      const flashing = s.flashAt && now < s.flashAt;
      if(flashing){ drawRevealFlash(s, t); }
      else {
        drawSonar(s, t);
        if(i === priorityIdx) drawBrackets(s, t);
      }
      s.ctx.putImageData(s.imgData, 0, 0);
    });

    // Tick healing-burst sparks.
    for(let i=medSparks.length-1;i>=0;i--){
      const p = medSparks[i];
      p.life -= dt;
      p.vx *= 0.92; p.vy *= 0.92;
      p.x += p.vx*dt; p.y += p.vy*dt;
      p.el.style.left = p.x + 'px'; p.el.style.top = p.y + 'px';
      p.el.style.opacity = Math.max(0, p.life/0.55);
      if(p.life <= 0){ p.el.remove(); medSparks.splice(i,1); }
    }

    rafId = requestAnimationFrame(loop);
  }
  rafId = requestAnimationFrame(loop);

  // ── Click handlers ─────────────────────────────
  scannerEl.addEventListener('click', () => {
    if(done || phase !== 'scan') return;
    if(!scannerOn){
      scannerOn = true;
      scannerEl.style.backgroundImage = `url('${MED_DIR}med_supply_scanner.png')`;
      scannerEl.classList.remove('dim');
      scannerEl.classList.add('scanner-on');
      bodyPanel.classList.add('scan-mode');
      setScannerCursor(true);
    }
  });

  symptoms.forEach((s, i) => {
    s.cv.addEventListener('click', e => {
      e.stopPropagation();
      if(done) return;
      if(phase === 'scan'){
        if(!scannerOn || s.revealed) return;
        s.revealed = true;
        s.flashAt = performance.now() + 280;
        // Floating name bubble — teaches symptom→colour mapping.
        const sp = symptomScenePx(s);
        spawnNameBubble(sp.x, sp.y, s.type.toUpperCase());
        // Check phase transition
        if(symptoms.every(x => x.revealed)){
          // Scanner done — fade the scanner slot out, fade treatment column in.
          scannerSlot.classList.add('gone');
          supplyCol.classList.add('show');
          bodyPanel.classList.remove('scan-mode');
          setScannerCursor(false);
          phase = 'treat';
        }
      } else if(phase === 'treat'){
        if(s.cleared || !selectedSupply) return;
        // Enforce priority — only the bracketed (highest-severity) wound
        // accepts input. Wrong-order is a real mistake: same damage as
        // wrong-supply, plus a brackets-flash on the priority wound.
        const priIdx = highestSeverityIdx();
        if(priIdx >= 0 && priIdx !== i){
          // Brief denied bounce on the clicked wound.
          s.cv.style.transition = 'transform .12s ease-out';
          s.cv.style.transform = 'scale(1.18)';
          setTimeout(() => {
            if(!s.cleared){
              s.cv.style.transition = 'transform .15s ease-out';
              s.cv.style.transform = '';
            }
          }, 130);
          // Brackets reminder pulse on the priority wound (~280ms).
          symptoms[priIdx].flashAt = performance.now() + 280;
          // Damage + feedback parity with wrong-supply (throttled by cooldown).
          if(performance.now() >= wrongCooldownUntil){
            wrongCooldownUntil = performance.now() + WRONG_COOLDOWN;
            wrongCount++;
            hp = Math.max(damageFloor, hp - VIT_WRONG_DIP);
            triggerHitFeedback();
          }
          return;
        }
        const correctSupply = SYMPTOM_TYPES[s.type].supply;
        if(selectedSupply === correctSupply){
          s.cleared = true;
          s.cv.style.transition = 'opacity .25s ease-out, transform .25s ease-out';
          s.cv.style.opacity = '0';
          s.cv.style.transform = 'scale(.35)';
          hp = Math.min(100, hp + VIT_RIGHT_BUMP);
          // Healing burst at the wound's body location, in its colour.
          const sp = symptomScenePx(s);
          spawnHealBurst(sp.x, sp.y, SYMPTOM_TYPES[s.type].color);
          // Update cleared counter.
          const w = symptoms.filter(x => x.cleared).length;
          if(clearedEl) clearedEl.textContent = w + ' / ' + N;
          // Deselect after applying — drop ghost too.
          supplyEls[selectedSupply].classList.remove('selected');
          selectedSupply = null;
          ghostEl.classList.remove('show');
          ghostEl.style.backgroundImage = '';
          if(symptoms.every(x => x.cleared)) endGame();
        } else {
          // Wrong supply — full hit feedback. Wound stays revealed.
          // Cooldown stops spam-clicks from stacking damage instantly.
          if(performance.now() >= wrongCooldownUntil){
            wrongCooldownUntil = performance.now() + WRONG_COOLDOWN;
            wrongCount++;
            hp = Math.max(damageFloor, hp - VIT_WRONG_DIP);
            triggerHitFeedback();
          }
        }
      }
    });
  });

  for(const s of SUPPLY_DEFS){
    const el = supplyEls[s.id];
    el.addEventListener('click', () => {
      if(done || phase !== 'treat') return;
      // Toggle selection — clicking selected one deselects.
      if(selectedSupply === s.id){
        el.classList.remove('selected');
        selectedSupply = null;
        ghostEl.classList.remove('show');
        ghostEl.style.backgroundImage = '';
        return;
      }
      if(selectedSupply) supplyEls[selectedSupply].classList.remove('selected');
      selectedSupply = s.id;
      el.classList.add('selected');
      // Attach the ghost — sprite follows cursor until applied or deselected.
      ghostEl.style.backgroundImage = `url('${MED_DIR}${s.img}')`;
      ghostEl.classList.add('show');
    });
    // Hover-preview: matching wounds glow brighter on hover. Teaches the
    // colour pairing without UI labels.
    el.addEventListener('mouseenter', () => {
      if(done || phase !== 'treat') return;
      hoverPreview = s.id;
    });
    el.addEventListener('mouseleave', () => {
      if(hoverPreview === s.id) hoverPreview = null;
    });
  }

  // ── End / cleanup ──────────────────────────────
  function endGame(forcedTier){
    if(done) return;
    done = true;
    cancelAnimationFrame(rafId);
    setScannerCursor(false);
    bodyPanel.classList.remove('scan-mode');
    modal.classList.remove('med-shake','med-redpulse');
    // Drop the cursor ghost if still attached.
    ghostEl.classList.remove('show');
    const allCleared = symptoms.every(x => x.cleared);
    let tier;
    if(forcedTier)                          tier = forcedTier;
    else if(allCleared && wrongCount === 0) tier = 'perfect';
    else if(allCleared)                     tier = 'good';
    else                                    tier = 'poor';
    // The caller applies the HP result (index.html resolveChoice): perfect
    // +25 HP, good +10, poor keeps the loss (final hp is bounded above
    // damageFloor = startingHp - 30%), so it needs where the patient ended
    // up. Fedup: patient slides off-screen before result modal hits. Other
    // tiers get a brief end-state pause for the moment to land before the
    // result.
    const medPayload = { hp: Math.round(hp), startingHp };
    if(tier === 'fedup'){
      bodySprite.classList.add('fedup-slide');
      endBeat(()=>onResult(tier, medPayload), 900);
    } else {
      endBeat(()=>onResult(tier, medPayload), 750);
    }
  }

  const stopTimer = makeTimer('med-tb', TOTAL_TIME_MS,
    (e, r) => { if(tbNumEl) tbNumEl.textContent = Math.ceil(TOTAL_TIME_MS/1000 * r) + 's'; },
    endGame,
    { high:'var(--gold)', mid:'var(--orange)', low:'var(--red)' });

  return () => {
    done = true;
    cancelAnimationFrame(rafId);
    stopTimer();
    setScannerCursor(false);
    bodyPanel.classList.remove('scan-mode');
    modal.classList.remove('med-shake','med-redpulse');
    document.removeEventListener('mousemove', onSceneMove);
  };
}

// ─────────────────────────────────────────────
// GAME 5 — FORAGE
// ─────────────────────────────────────────────
// Modes: HUNT (asteroid/desert/ice fauna), GATHER (planet flora+fauna),
// SCAVENGE (ship interior, vermin only). Mode is set via ctx.mode.
//
// Targets emerge from cover at fixed anchor positions on the stage:
//   • fauna  — quick window, fixed food value
//   • flora  — ripens over time, click any time before spoil; yield scales
//              with ripeness; spoiled clicks add a stale-food morale hit
//   • decoy  — looks like a flora/fauna target with a subtle wrong-tint;
//              clicking poisons one crew member (sickness payload)
// Player can DEPART early to lock the haul and skip the late-game decoy spike.
//
// onResult contract: onResult(tier, payload) where payload is
//   { food:int, rare_drops:[{id,name}], sickness:[{type,target,severity,reason}], mode }
// The caller (cruise.js handleForageVerb) applies food, rare_drops and sickness.

// Bg registry — known bg ids per mode, with the biome each bg belongs to.
// Biome drives sprite selection (see sprites.js + pickFauna/pickFlora).
// Each bg is <folder>/<id>.jpg, its anchors in anchors.js.
const FORAGE_BG_REGISTRY = {
  HUNT: [
    { id:'asteroid',  biome:'asteroid' },
    { id:'asteroid2', biome:'asteroid' },
    { id:'asteroid3', biome:'asteroid' },
    { id:'desert',    biome:'desert' },
    { id:'desert2',   biome:'desert' },
    { id:'ice',       biome:'ice' },
    { id:'ice2',      biome:'ice' }
  ],
  GATHER: [
    { id:'cave',     biome:'cave' },
    { id:'cave2',    biome:'cave' },
    { id:'forest',   biome:'forest' },
    { id:'forest2',  biome:'forest' },
    { id:'meadow',   biome:'meadow' },
    { id:'meadow2',  biome:'meadow' },
    { id:'meadow3',  biome:'meadow' }
  ],
  SCAVENGE: [
    { id:'storage', biome:'ship_interior' },
    { id:'service', biome:'ship_interior' },
    { id:'pantry',  biome:'ship_interior' }
  ]
};
const FORAGE_MODE_FOLDER = { HUNT:'hunt', GATHER:'gather', SCAVENGE:'scav' };
const FORAGE_SPRITE_DIR = 'sprites/minigames/forage/sprites/';
// INBOUND CONTRACT — the caller (cruise.js handleForageVerb) passes a ctx
// object so this run knows what to render.
//   ctx.mode         'HUNT' | 'GATHER' | 'SCAVENGE'   (which mechanic flavor)
//   ctx.regionLabel  string                            (the HUD region text)
function initForage(container, onResult, ctx){
  const MODE = ctx.mode;

  // A random bg from the mode's pool; its biome picks the sprites.
  const bgList = FORAGE_BG_REGISTRY[MODE];
  const pickedBg = bgList[Math.floor(Math.random() * bgList.length)];
  const bgId = pickedBg.id;
  const FOLDER = FORAGE_MODE_FOLDER[MODE];
  const BIOME = pickedBg.biome;
  // HUD region text: where the ship actually stopped (ctx.regionLabel,
  // e.g. 'ASTEROID FIELD') — but a HUNT on a desert or ice rock is that
  // rock: the biome names the ground the crew is standing on.
  const BIOME_PLACE = { desert: 'DESERT ROCK', ice: 'ICE ROCK' };
  const REGION = (BIOME_PLACE[BIOME] || ctx.regionLabel) + ' · ' + MODE;

  // Sprite pickers — biome-restricted, decoy-aware.
  function pickFaunaSprite(biome, wantDecoy){
    const SPR = FORAGE_SPRITES.fauna;
    let candidates = Object.entries(SPR).filter(([_,s]) => s.biomes.includes(biome));
    if(!candidates.length) return null;
    if(wantDecoy){
      const decoyable = candidates.filter(([_,s]) => s.has_bad);
      if(!decoyable.length){
        // Biome has no decoy-eligible fauna — a plain one instead.
        return pickFaunaSprite(biome, false);
      }
      candidates = decoyable;
    }
    const [species, spec] = candidates[Math.floor(Math.random() * candidates.length)];
    if(wantDecoy){
      return { species, isDecoy:true, path: `${FORAGE_SPRITE_DIR}fauna_${species}_b.png` };
    }
    const v = spec.variants[Math.floor(Math.random() * spec.variants.length)];
    return { species, isDecoy:false, path: `${FORAGE_SPRITE_DIR}fauna_${species}${v}.png` };
  }
  function pickFloraSprite(biome, wantDecoy){
    const SPR = FORAGE_SPRITES.flora;
    let candidates = Object.entries(SPR).filter(([_,s]) => s.biomes.includes(biome));
    if(!candidates.length) return null;
    const [type, spec] = candidates[Math.floor(Math.random() * candidates.length)];
    const sizeKeys = Object.keys(spec.sizes);
    const size = sizeKeys[Math.floor(Math.random() * sizeKeys.length)];
    if(wantDecoy && spec.has_bad){
      return { type, size, isDecoy:true, path: `${FORAGE_SPRITE_DIR}flora_${type}_${size}b.png` };
    }
    const variants = spec.sizes[size];
    const v = variants[Math.floor(Math.random() * variants.length)];
    return { type, size, isDecoy:false, path: `${FORAGE_SPRITE_DIR}flora_${type}_${size}${v}.png` };
  }

  // Stage display dims (bigmodal body) vs anchor coord native dims (matches
  // editor + bg art). SCALE multiplies native coords for screen rendering.
  const STAGE_W = 720, STAGE_H = 480;
  const NATIVE_W = 960, NATIVE_H = 640;
  const SCALE = STAGE_W / NATIVE_W; // 0.75

  const TIMER_MS      = 14000;
  const FAUNA_WINDOW  = 1100;
  const FLORA_RIPEN   = 2500;
  const FLORA_HOLD    = 800;
  const FLORA_SPOIL   = 1100;
  const DECOY_BASE    = 0.05;
  const DECOY_LATE    = 0.30;
  const RARE_CHANCE   = 0.04;
  const FOOD_FAUNA    = 8;
  const FOOD_FLORA    = 6;
  const FOOD_SPOILED  = 1;

  const RARE_DROPS = [
    // Names say what the ship actually gets (cruise.js RARE_TO_REAL).
    {id:'cred_chip',     name:'Credit Chip (+10g)'},
    {id:'data_fragment', name:'Logbook Fragment'},
    {id:'salt_crystal',  name:'Salt Crystal (+2 minerals)'},
    {id:'med_herb',      name:'Medicinal Herb (medkit)'}
  ];

  // Tip text is biome-specific so it never mentions shrooms on an ice bg etc.
  const TIP_BY_BIOME = {
    ship_interior: 'Quick clicks · vent dwellers are fast',
    asteroid:      'Skittery alien fauna · click before they bolt',
    ice:           'Frost-numbed creatures break cover quickly',
    desert:        'Cactus fruit ripens · poisonous lookalikes possible',
    forest:        'Wait for the glow · skip eye-marked fungi',
    meadow:        'Pick ripe pods · stale food drops crew morale',
    cave:          'Wait for the glow · fungal mimics deceive'
  };
  const tipText = TIP_BY_BIOME[BIOME] || 'Click before they vanish';
  container.innerHTML = `
    <div class="for-scene">
      <div class="for-stage" id="for-stage" data-mode="${MODE}" data-art="1" style="background-image:url('sprites/minigames/forage/${FOLDER}/${bgId}.jpg')"></div>
      <div class="for-tbar-wrap"><div class="tbar" id="for-tb" style="width:100%"></div></div>
      <div class="for-hud-top">
        <div class="for-region">${REGION}</div>
        <button class="for-depart" id="for-depart">DEPART · KEEP HAUL</button>
      </div>
      <div class="for-hud-btm">
        <span class="for-food-lbl">FOOD <span id="for-food">0</span></span>
        <span class="for-tip" id="for-tip">${tipText}</span>
      </div>
    </div>`;

  // ── State ───────────────────────────────────────
  let food = 0;
  const rareDrops = [];
  const sickness = [];
  let decoysClicked = 0;
  let spoiledClicked = 0;
  let done = false;
  let cancelled = false;
  let started = false;
  const timers = [];
  let stopTimer = null;
  let schedTimer = null;
  let statusTimer = null;
  // slot state: 'idle' | 'fauna' | 'fauna-decoy' | 'flora-ripening' | 'flora-ripe' |
  //             'flora-spoiling' | 'flora-decoy' | 'cooldown'
  const slotState = {};
  const slotMeta  = {};
  let anchors = [];

  function decoyChance(elapsedMs){
    const t = Math.min(1, elapsedMs / TIMER_MS);
    return DECOY_BASE + (DECOY_LATE - DECOY_BASE) * t;
  }

  // Whack-a-mole — line anchors. Turns for-anchor into an overflow:hidden
  // "open box" sized + positioned to one side of the line in stage coords.
  // The sprite (for-target) slides up out of the box (visible above line),
  // holds, then sinks back down (hidden below line). overflow:hidden does
  // the masking — no PNG mask file or layered cover sprite needed.
  //
  // aEl  = for-anchor (becomes the clip box)
  // tEl  = for-target (the sprite that slides through)
  // sample = {x, y} sample point on the line in NATIVE 960×640 coords
  // faceVal = 'up' | 'down' | 'left' | 'right' — which side of line is visible
  // lifetimeMs = total animation time (rise + hold + sink)
  // returns the Animation handle so callers can cancel it
  function runLineWhackAMole(aEl, tEl, sample, faceVal, lifetimeMs){
    const BOX = 100; // box dimension in display px (covers max sprite size 96 + headroom)
    const sx = Math.round(sample.x * SCALE);
    const sy = Math.round(sample.y * SCALE);

    // Position for-anchor as clip box anchored to line on the face-opposite side
    let aLeft, aTop, aWidth, aHeight, hiddenT, visibleT;
    if(faceVal === 'up'){
      // Box bottom AT line, extending up. Sprite anchors to box bottom, slides up.
      aLeft = sx - BOX/2; aTop = sy - BOX; aWidth = BOX; aHeight = BOX;
      hiddenT  = 'translate(-50%, 100%)'; // shift down by sprite height (below box bottom)
      visibleT = 'translate(-50%, 0%)';
    } else if(faceVal === 'down'){
      // Box top AT line, extending down. Sprite anchors to box top, slides down.
      aLeft = sx - BOX/2; aTop = sy; aWidth = BOX; aHeight = BOX;
      hiddenT  = 'translate(-50%, -100%)';
      visibleT = 'translate(-50%, 0%)';
    } else if(faceVal === 'right'){
      // Box left AT line, extending right. Sprite anchors to box left, slides right.
      aLeft = sx; aTop = sy - BOX/2; aWidth = BOX; aHeight = BOX;
      hiddenT  = 'translate(-100%, -50%)';
      visibleT = 'translate(0%, -50%)';
    } else { // left
      // Box right AT line, extending left. Sprite anchors to box right, slides left.
      aLeft = sx - BOX; aTop = sy - BOX/2; aWidth = BOX; aHeight = BOX;
      hiddenT  = 'translate(100%, -50%)';
      visibleT = 'translate(0%, -50%)';
    }
    aEl.style.left   = aLeft   + 'px';
    aEl.style.top    = aTop    + 'px';
    aEl.style.width  = aWidth  + 'px';
    aEl.style.height = aHeight + 'px';

    // Disable CSS animation; JS animation drives the rise→hold→sink lifecycle.
    // Opacity stays at 1 throughout — visibility is handled by overflow:hidden
    // on the clip box (sprite outside box = clipped/invisible). Without
    // explicit opacity here, the .for-target base style (opacity:0) wins and
    // sprites stay invisible since CSS foremerge is disabled.
    tEl.style.animation = 'none';
    const RISE = 220, SINK = 260;
    const HOLD = Math.max(0, lifetimeMs - RISE - SINK);
    return tEl.animate([
      { transform: hiddenT,  opacity: 1, offset: 0 },
      { transform: visibleT, opacity: 1, offset: RISE / lifetimeMs,            easing: 'ease-out' },
      { transform: visibleT, opacity: 1, offset: (RISE + HOLD) / lifetimeMs,   easing: 'ease-in' },
      { transform: hiddenT,  opacity: 1, offset: 1 }
    ], { duration: lifetimeMs, fill: 'forwards' });
  }

  // Sample a (x,y) within an anchor at native 960×640 coords.
  // Lines support a spawn-mode constraint via anchor.spawn:
  //   continuous (default) — random t in [0,1]
  //   start                — t = 0 (always at start endpoint)
  //   end                  — t = 1 (always at end endpoint)
  //   midpoint             — t = 0.5
  //   endpoints            — random pick of {0, 1}
  function sampleAnchorPoint(a){
    if(a.type === 'point')  return { x: a.x, y: a.y };
    if(a.type === 'line')   {
      let t;
      switch(a.spawn){
        case 'start':     t = 0; break;
        case 'end':       t = 1; break;
        case 'midpoint':  t = 0.5; break;
        case 'endpoints': t = Math.random() < 0.5 ? 0 : 1; break;
        default:          t = Math.random(); // continuous
      }
      return { x: a.x1 + (a.x2-a.x1)*t, y: a.y1 + (a.y2-a.y1)*t };
    }
    if(a.type === 'region') {
      return { x: a.x + Math.random()*a.w, y: a.y + Math.random()*a.h };
    }
    return { x: 0, y: 0 };
  }

  // Resolve which target type spawns at an anchor (anchors with target
  // 'fauna+flora' randomly pick one each spawn).
  function resolveTargetType(a){
    if(a.target === 'fauna+flora') return Math.random() < 0.5 ? 'fauna' : 'flora';
    return a.target || 'fauna';
  }

  // ── Authored anchors (the inline registry, file://-safe), then start ──
  anchors = FORAGE_ANCHORS[FOLDER][bgId].anchors;
  runGame();

  // ── Render anchor click boxes ───────────────────
  function renderAnchorBoxes(){
    const stage = document.getElementById('for-stage');
    if(!stage) return;
    let html = '';
    anchors.forEach((a, i) => {
      // Initial display position: center of the anchor (point coord, line
      // midpoint, or region center). For line/region this gets rewritten
      // to the sampled spawn point each spawnAt.
      let cx, cy;
      if(a.type === 'point')      { cx = a.x; cy = a.y; }
      else if(a.type === 'line')  { cx = (a.x1+a.x2)/2; cy = (a.y1+a.y2)/2; }
      else                         { cx = a.x + a.w/2;  cy = a.y + a.h/2; }
      const sx = Math.round(cx * SCALE - 28); // 56/2 = 28 for centering
      const sy = Math.round(cy * SCALE - 28);
      html += `<div class="for-anchor" id="fa${i}" style="left:${sx}px;top:${sy}px">
        <div class="for-target" id="ft${i}"><div class="for-target-img" id="ti${i}"></div></div>
      </div>`;
      slotState[i] = 'idle';
    });
    stage.insertAdjacentHTML('beforeend', html);
  }

  function repositionAnchorBoxFor(a, i, sample){
    const aEl = document.getElementById('fa'+i);
    if(!aEl) return;
    if(a.type === 'point') return; // points don't move
    const sx = Math.round(sample.x * SCALE - 28);
    const sy = Math.round(sample.y * SCALE - 28);
    aEl.style.left = sx + 'px';
    aEl.style.top  = sy + 'px';
  }

  // Per-spawn sprite size — narrow bucket per depth (slight variance only).
  // Each bucket has 3 sizes so depth-set anchors stay visually consistent
  // (NEAR sprites all big, FAR sprites all small) with just enough jitter
  // to feel alive.
  const SPRITE_SIZE_STEPS_BY_DEPTH = {
    near: [80, 88, 96],   // foreground — full size, ±10%
    mid:  [56, 64, 72],   // mid-distance — ~70% of near
    far:  [40, 48, 56]    // background — ~50% of near
  };
  function pickSpriteSize(depth){
    const steps = SPRITE_SIZE_STEPS_BY_DEPTH[depth] || SPRITE_SIZE_STEPS_BY_DEPTH.near;
    return steps[Math.floor(Math.random() * steps.length)];
  }

  function clearSlot(i, delay){
    const tEl = document.getElementById('ft'+i);
    const tImg = document.getElementById('ti'+i);
    const aEl = document.getElementById('fa'+i);
    if(!tEl) return;
    // Cancel any in-flight whack-a-mole animation so it doesn't keep running
    // and leaving the for-anchor in a clipped state.
    if(slotMeta[i] && slotMeta[i].wackAnim){
      try { slotMeta[i].wackAnim.cancel(); } catch(e){}
      slotMeta[i].wackAnim = null;
    }
    const t = setTimeout(()=>{
      if(done) return;
      tEl.className = 'for-target';
      tEl.textContent = ''; // clear ☠ if it was set
      tEl.style.cssText = ''; // wipe inline styles set by whack-a-mole / size
      // Re-add the inner img element (textContent above wiped it)
      if(tEl.children.length === 0){
        const inner = document.createElement('div');
        inner.className = 'for-target-img';
        inner.id = 'ti' + i;
        tEl.appendChild(inner);
      }
      const newImg = document.getElementById('ti'+i);
      if(newImg) newImg.style.backgroundImage = '';
      // Reset for-anchor inline styles set by whack-a-mole, but preserve
      // its left/top so non-line-anchor positioning still works on next spawn.
      if(aEl){
        aEl.classList.remove('line-box','face-up','face-down','face-left','face-right');
        aEl.style.width = '';
        aEl.style.height = '';
        // Re-set default left/top from the anchor's own coords (point/region
        // use this; line will overwrite again on next spawn via runLineWhackAMole).
        const a = anchors[i];
        if(a){
          let cx, cy;
          if(a.type === 'point')      { cx = a.x; cy = a.y; }
          else if(a.type === 'line')  { cx = (a.x1+a.x2)/2; cy = (a.y1+a.y2)/2; }
          else                         { cx = a.x + a.w/2;  cy = a.y + a.h/2; }
          aEl.style.left = Math.round(cx * SCALE - 28) + 'px';
          aEl.style.top  = Math.round(cy * SCALE - 28) + 'px';
        }
      }
      slotState[i] = 'idle';
    }, delay);
    timers.push(t);
  }

  function spawnAt(i, elapsed){
    if(done || slotState[i] !== 'idle') return;
    const a = anchors[i];
    const tEl = document.getElementById('ft'+i);
    if(!a || !tEl) return;

    // Sample fresh point inside the anchor (no-op for point type).
    const sample = sampleAnchorPoint(a);
    repositionAnchorBoxFor(a, i, sample);

    const ttype = resolveTargetType(a);

    // Per-spawn sprite size, scaled by anchor's depth hint
    const size = pickSpriteSize(a.depth);
    tEl.style.width = size + 'px';
    tEl.style.height = size + 'px';
    const tImg = document.getElementById('ti'+i);

    // Direction handling — anchor.face drives both the emerge motion and
    // sprite flip. Two paths:
    //  • Line anchors → JS animation along the line's true perpendicular.
    //    Supports diagonal lines naturally (slide tilts to match line angle).
    //  • Point/region → CSS from-* keyframe class (cardinal direction only).
    // Sprite flip uses the cardinal face hint regardless of anchor type
    // (sprites don't rotate, only flip horizontally / vertically).
    const faceVal = a.face || 'up';
    const dirCls = (a.type === 'line' || faceVal === 'up') ? '' : ' from-' + faceVal;
    if(tImg){
      tImg.classList.remove('flip-x','flip-y','decoy-glow');
      // Horizontal flip:
      //   left  → always flip-x (sprite faces left, the face direction is horizontal)
      //   right → never flip (default sprite already faces right)
      //   up/down → random 50/50 (vertical motion has no implied horizontal facing)
      if(faceVal === 'left'){
        tImg.classList.add('flip-x');
      } else if(faceVal === 'up' || faceVal === 'down'){
        if(Math.random() < 0.5) tImg.classList.add('flip-x');
      }
      // Vertical flip for downward emerge (creature hangs from ceiling)
      if(faceVal === 'down') tImg.classList.add('flip-y');
    }

    if(ttype === 'fauna'){
      // Fauna decoy roll — applies to any mode (SCAVENGE diseased vermin,
      // HUNT diseased game, GATHER mixed-spawns). The 0.6 multiplier keeps
      // fauna decoys rarer than flora since reaction-clicks are quicker.
      // pickFaunaSprite gracefully downgrades if biome has no _b species.
      const wantDecoy = Math.random() < decoyChance(elapsed) * 0.6;
      const spec = pickFaunaSprite(BIOME, wantDecoy);
      // Biome may have no fauna at all (e.g. cave) — skip spawn entirely.
      if(!spec){ slotState[i] = 'idle'; return; }
      const isDecoy = !!spec.isDecoy;
      slotState[i] = isDecoy ? 'fauna-decoy' : 'fauna';
      slotMeta[i] = {spec, isDecoy, size};
      tEl.className = 'for-target fauna' + (isDecoy?' decoy':'') + dirCls;
      if(tImg){
        tImg.style.backgroundImage = `url('${spec.path}')`;
        if(isDecoy) tImg.classList.add('decoy-glow');
      }

      if(a.type === 'line'){
        // Whack-a-mole: turn for-anchor into clip-box, slide sprite through.
        // Total lifetime = FAUNA_WINDOW (rise + hold + sink). On natural finish,
        // animation already returned sprite below line — just go idle.
        const aEl = document.getElementById('fa'+i);
        aEl.classList.add('line-box', 'face-' + faceVal);
        const lineLifetime = FAUNA_WINDOW + 200;
        const wackAnim = runLineWhackAMole(aEl, tEl, sample, faceVal, lineLifetime);
        slotMeta[i].wackAnim = wackAnim;
        wackAnim.addEventListener('finish', () => {
          if(done) return;
          if(slotState[i] === 'fauna' || slotState[i] === 'fauna-decoy'){
            slotState[i] = 'cooldown';
            clearSlot(i, 0);
          }
        });
      } else {
        // Point/region: existing CSS-driven slide-in + setTimeout retreat
        const t = setTimeout(()=>{
          if(done) return;
          if(slotState[i] !== 'fauna' && slotState[i] !== 'fauna-decoy') return;
          slotState[i] = 'cooldown';
          tEl.className = 'for-target retreating' + dirCls;
          clearSlot(i, 250);
        }, FAUNA_WINDOW);
        timers.push(t);
      }
      return;
    }

    // flora
    // Flora decoy roll — applies to any mode that supports flora (GATHER for
    // shroom/fruit/seedpod, HUNT-desert for fruit). pickFloraSprite downgrades
    // if the biome's flora types have no _b variants.
    const wantDecoy = Math.random() < decoyChance(elapsed);
    const spec = pickFloraSprite(BIOME, wantDecoy);
    if(!spec){ slotState[i] = 'idle'; return; }
    const isDecoy = !!spec.isDecoy;
    slotState[i] = isDecoy ? 'flora-decoy' : 'flora-ripening';
    slotMeta[i] = {spec, isDecoy, size, start: performance.now()};
    // Shrooms grow vertically from the ground; fruit/seedpod stay centered.
    const shroomCls = spec.type === 'shroom' ? ' shroom' : '';
    tEl.className = 'for-target flora' + shroomCls + (isDecoy?' decoy':'') + dirCls;
    if(tImg){
      tImg.style.backgroundImage = `url('${spec.path}')`;
      if(isDecoy) tImg.classList.add('decoy-glow');
    }

    if(!isDecoy){
      const tRipe = setTimeout(()=>{
        if(done || slotState[i] !== 'flora-ripening') return;
        slotState[i] = 'flora-ripe';
        tEl.classList.add('ripe');
        // Sparkle burst draws the eye to ripe-ready flora.
        const aEl = document.getElementById('fa'+i);
        spawnRipeSparkle(aEl);
      }, FLORA_RIPEN);
      timers.push(tRipe);

      const tSpoilStart = setTimeout(()=>{
        if(done || slotState[i] !== 'flora-ripe') return;
        slotState[i] = 'flora-spoiling';
        tEl.classList.remove('ripe');
        tEl.classList.add('spoiling');
      }, FLORA_RIPEN + FLORA_HOLD);
      timers.push(tSpoilStart);

      const tGone = setTimeout(()=>{
        if(done) return;
        if(slotState[i] === 'flora-spoiling'){
          slotState[i] = 'cooldown';
          clearSlot(i, 0);
        }
      }, FLORA_RIPEN + FLORA_HOLD + FLORA_SPOIL);
      timers.push(tGone);
    } else {
      const tGone = setTimeout(()=>{
        if(done) return;
        if(slotState[i] === 'flora-decoy'){
          slotState[i] = 'cooldown';
          clearSlot(i, 0);
        }
      }, FLORA_RIPEN + FLORA_HOLD + FLORA_SPOIL);
      timers.push(tGone);
    }
  }

  function runGame(){
    if(cancelled || started) return;
    started = true;

    renderAnchorBoxes();

    // Spawn scheduler — tick-based with min/max active enforcement.
    //   MIN_ACTIVE: floor — if active count drops below this, force a spawn
    //                regardless of pacing (keeps the screen lively).
    //   MAX_ACTIVE: ceiling — never exceed this count.
    //   SPAWN_GAP : minimum ms between any two spawn fires (prevents bursts
    //                when below MIN). Force-spawns ignore the gap.
    // Same anchor can't render twice — spawnAt's `slotState[i] === 'idle'`
    // gate already prevents re-spawning a busy slot. The scheduler only
    // picks from currently-idle slots.
    const MIN_ACTIVE = 2;
    const MAX_ACTIVE = 5;
    const SPAWN_GAP  = 350;
    const TICK_MS    = 150;
    const STOP_BY    = TIMER_MS - 1500;

    // Play-time clock (advances only on unpaused ticks). Wall-clock time
    // from gameStart kept running behind the pause menu, so a long pause
    // pushed past STOP_BY and no target ever spawned again.
    let playElapsed = 0;
    let lastSpawnAt = -SPAWN_GAP;

    schedTimer = setInterval(()=>{
      if(done) return;
      if(PauseBus.paused) return;
      playElapsed += TICK_MS;
      const elapsed = playElapsed;
      if(elapsed > STOP_BY) return;

      // Active count = slots not idle (a fauna in retreat or a flora ripening
      // both count as "occupying" the screen).
      let active = 0;
      for(let i = 0; i < anchors.length; i++){
        if(slotState[i] !== 'idle' && slotState[i] !== 'cooldown') active++;
      }

      let shouldSpawn = false;
      if(active < MIN_ACTIVE){
        shouldSpawn = true; // force — override gap
      } else if(active < MAX_ACTIVE && (elapsed - lastSpawnAt) >= SPAWN_GAP){
        shouldSpawn = Math.random() < 0.5;
      }
      if(!shouldSpawn) return;

      // Pick from currently idle slots
      const idle = [];
      for(let i = 0; i < anchors.length; i++){
        if(slotState[i] === 'idle') idle.push(i);
      }
      if(idle.length === 0) return;
      const slot = idle[Math.floor(Math.random() * idle.length)];
      spawnAt(slot, elapsed);
      lastSpawnAt = elapsed;
    }, TICK_MS);

    // Click handlers per anchor (one for-anchor div = one click box at any
    // given moment; line/region-anchor div repositions on each spawn).
    anchors.forEach((a, i) => {
      const aEl = document.getElementById('fa'+i);
      if(!aEl) return;
      aEl.addEventListener('click', ()=>{
        if(done) return;
        const s = slotState[i];
        const m = slotMeta[i];
        const tEl = document.getElementById('ft'+i);
        if(!tEl) return;

        const tImg = document.getElementById('ti'+i);
        const clearSprite = ()=>{ if(tImg) tImg.style.backgroundImage = ''; };
        // Catch-pop: apply gold glow + fade animation to inner img. Variant
        // 'spoil' uses orange (you got something but it sucks). Doesn't touch
        // transform so flip-x/flip-y stay intact during the pop.
        const playCatchPop = (variant)=>{
          if(!tImg) return;
          tImg.classList.remove('caught','caught-spoil');
          // Force reflow so re-adding the class restarts the animation
          void tImg.offsetWidth;
          tImg.classList.add(variant === 'spoil' ? 'caught-spoil' : 'caught');
        };

        if(s === 'fauna-decoy' || s === 'flora-decoy'){
          decoysClicked++;
          // Sickness reason adapts to spawn species + mode so payload reads
          // correctly across all biomes (not just SCAVENGE/GATHER).
          let reason = 'ate something bad';
          if(s === 'fauna-decoy'){
            reason = MODE === 'SCAVENGE' ? 'ate diseased vermin' : 'caught diseased game';
          } else if(m && m.spec){
            reason = m.spec.species === 'shroom'  ? 'ate alien fungus mimic'
                   : m.spec.species === 'fruit'   ? 'ate poisonous fruit'
                   : m.spec.species === 'seedpod' ? 'ate poisonous seedpod'
                   : 'ate something bad';
          }
          sickness.push({
            type:'poisoning',
            target:'random_crew',
            severity:'medium',
            reason
          });
          reportJobHarm({ poison: sickness.filter(x => x.type === 'poisoning').map(x => x.severity) });
          slotState[i] = 'cooldown';
          tEl.className = 'for-target decoy-burst';
          clearSprite();
          tEl.textContent = '☠';
          flashStatus('SICKNESS · -HP someone aboard', 'red');
          // Red vignette flash across the scene for "ouch" feedback. Removes
          // itself when the .42s animation ends.
          const scene = document.querySelector('.for-scene');
          if(scene){
            const flash = document.createElement('div');
            flash.className = 'for-decoy-flash';
            scene.appendChild(flash);
            flash.addEventListener('animationend', () => flash.remove(), { once:true });
          }
          clearSlot(i, 600);
          return;
        }

        if(s === 'fauna'){
          food += FOOD_FAUNA;
          rollRare();
          slotState[i] = 'cooldown';
          flashCatch(aEl, '+'+FOOD_FAUNA);
          playCatchPop('good');
          updateFoodHud(food);
          clearSlot(i, 320);
          return;
        }

        if(s === 'flora-ripening'){
          const elapsed = performance.now() - m.start;
          const ripeness = Math.min(1, elapsed / FLORA_RIPEN);
          const gain = Math.max(1, Math.round(FOOD_FLORA * (0.3 + 0.7 * ripeness)));
          food += gain;
          rollRare();
          slotState[i] = 'cooldown';
          flashCatch(aEl, '+'+gain);
          playCatchPop('good');
          updateFoodHud(food);
          clearSlot(i, 320);
          return;
        }

        if(s === 'flora-ripe'){
          food += FOOD_FLORA;
          rollRare();
          slotState[i] = 'cooldown';
          flashCatch(aEl, '+'+FOOD_FLORA+' RIPE', 'gold');
          playCatchPop('good');
          updateFoodHud(food);
          clearSlot(i, 320);
          return;
        }

        if(s === 'flora-spoiling'){
          spoiledClicked++;
          food += FOOD_SPOILED;
          slotState[i] = 'cooldown';
          flashCatch(aEl, 'SPOILED', 'orange');
          playCatchPop('spoil');
          updateFoodHud(food);
          clearSlot(i, 320);
          return;
        }
      });
    });

    stopTimer = makeTimer('for-tb', TIMER_MS, null, finishTimeUp);
  }

  function rollRare(){
    if(Math.random() < RARE_CHANCE){
      rareDrops.push(pickRandom(RARE_DROPS));
      flashStatus('RARE FIND', 'gold');
    }
  }

  // Burst of small gold dots flying outward — fired when flora transitions
  // to ripe. Draws the eye to "this one's ready to harvest." Dots auto-remove
  // when their animation finishes.
  function spawnRipeSparkle(anchorEl){
    if(!anchorEl) return;
    const N = 6;
    const dist = 28;
    for(let k = 0; k < N; k++){
      const dot = document.createElement('div');
      dot.className = 'ripe-sparkle';
      anchorEl.appendChild(dot);
      const angle = (k / N) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      const anim = dot.animate([
        { transform: 'translate(-50%,-50%) translate(0,0) scale(.6)', opacity: 1 },
        { transform: `translate(-50%,-50%) translate(${dx*0.6}px,${dy*0.6}px) scale(1)`, opacity: 1, offset: 0.3 },
        { transform: `translate(-50%,-50%) translate(${dx}px,${dy}px) scale(.4)`, opacity: 0 }
      ], { duration: 520, easing: 'ease-out', fill: 'forwards' });
      anim.addEventListener('finish', () => dot.remove(), { once: true });
    }
  }

  // Update the HUD's food display + brief scale/color pulse so each catch
  // visibly registers on the score. Uses Web Animations so the same element
  // can re-trigger without class-toggle dance.
  function updateFoodHud(value){
    const el = document.getElementById('for-food');
    if(!el) return;
    el.textContent = value;
    el.animate([
      { transform: 'scale(1)',    color: getComputedStyle(document.documentElement).getPropertyValue('--cream') || '#e8d8a0' },
      { transform: 'scale(1.4)',  color: getComputedStyle(document.documentElement).getPropertyValue('--gold')  || '#c8a85a', offset: 0.35 },
      { transform: 'scale(1)',    color: getComputedStyle(document.documentElement).getPropertyValue('--cream') || '#e8d8a0' }
    ], { duration: 380, easing: 'ease-out' });
  }

  function flashCatch(anchorEl, txt, color){
    const fl = document.createElement('div');
    fl.className = 'for-flash' + (color ? (' ' + color) : '');
    fl.textContent = txt;
    anchorEl.appendChild(fl);
    setTimeout(()=>fl.remove(), 800);
  }

  function flashStatus(txt, color){
    const tip = document.getElementById('for-tip');
    if(!tip) return;
    tip.textContent = txt;
    tip.className = 'for-tip flash-' + (color || 'cream');
    clearTimeout(statusTimer);
    statusTimer = setTimeout(()=>{
      if(tip) tip.className = 'for-tip';
    }, 900);
  }

  // DEPART wiring is set up here even before runGame fires, so the player
  // can bail during the brief async load window without waiting.
  document.getElementById('for-depart').addEventListener('click', ()=>{
    if(!done) finish();
  });

  // Hidden-timer expiration. Show TIME'S UP flash, then transition
  // to the regular finish path. DEPART click bypasses this and calls
  // finish() directly — no flash, no delay.
  function finishTimeUp(){
    if(done) return;
    markMinigameEnding();
    const stage = document.getElementById('for-stage');
    if(stage){
      const alert = document.createElement('div');
      alert.className = 'for-timeup';
      alert.innerHTML = "<div class='msg'>TIME'S UP</div>";
      stage.appendChild(alert);
      setTimeout(() => { alert.remove(); finish(); }, 2200);
    } else {
      finish();
    }
  }

  function finish(){
    if(done) return;
    done = true;
    timers.forEach(clearTimeout);
    if(stopTimer) stopTimer();
    if(schedTimer) clearInterval(schedTimer);

    if(spoiledClicked >= 2){
      sickness.push({
        type:'morale_drop',
        target:'all_crew',
        severity: spoiledClicked >= 4 ? 'medium' : 'light',
        reason: 'served stale food'
      });
    }
    if(decoysClicked >= 2){
      sickness.push({
        type:'morale_drop',
        target:'all_crew',
        severity: 'medium',
        reason: 'cook found bad ingredients in haul'
      });
    }

    const tier = food >= 50 ? 'perfect' : food >= 25 ? 'good' : 'poor';
    // OUTBOUND PAYLOAD — the caller's onResult (cruise.js handleForageVerb)
    // adds payload.food to the tank, maps each rare drop to a real reward,
    // and lands each sickness: 'poisoning' -HP on one person aboard
    // (light/medium/heavy ~10/20/35), 'morale_drop' on every crew member
    // (~5/12/20). Tier ('perfect'|'good'|'poor') drives the AI quip.
    onResult(tier, {
      food, rare_drops: rareDrops, sickness,
      mode: MODE, bg_id: bgId
    });
  }

  return ()=>{
    cancelled = true;
    done = true;
    timers.forEach(clearTimeout);
    if(stopTimer) stopTimer();
    if(schedTimer) clearInterval(schedTimer);
  };
}

// ─────────────────────────────────────────────
// GAME 6 — SOLAR BRACE
// ─────────────────────────────────────────────
function initBrace(container, onResult){
  container.innerHTML=`
    <div class="tbar-wrap"><div class="tbar" id="brace-tb" style="width:100%"></div></div>
    <div class="brace-scene" id="bscene">
      <div class="shield-hex" id="shex"></div>
      <div class="shield-wrap">
        <div class="shield-lbl"><span>SHIELD INTEGRITY</span><span id="spct">100%</span></div>
        <div class="shield-bg"><div id="shieldfill" style="width:100%"></div></div>
      </div>
      <button class="bbtn" id="bbrtn" draggable="false">
        <div class="bbtn-lbl" id="bbtn-lbl">BRACE</div>
        <div class="bbtn-sub" id="bbtn-sub">Hold mouse button</div>
      </button>
      <div class="heat-wrap" id="heatwrap">
        <div class="heat-lbl"><span>BRACE HEAT</span><span id="hpct">0%</span></div>
        <div class="heat-bg"><div id="heatfill"></div></div>
      </div>
      <div class="brace-status" id="bstatus"></div>
    </div>`;

  // ── Tuning (WarioWare-quick: ~7s round) ──────────
  const FLARE_TIME   = 7000;  // total game ms — short, snappy
  const HEAT_FILL    = 100/4; // fills in 4s of solid hold → must vent
  const HEAT_VENT    = 100/2.5;
  const SHIELD_DRAIN = 6;
  const SURGE_DAMAGE = 20;
  const SURGE_BONUS  = 3;     // shield % regained for a clean dodge
  const SURGE_WARN   = 1.0;
  const SURGE_STRIKE = 0.7;
  // 1–2 surges, distributed across the middle of the round.
  const surgeCount = 1 + Math.floor(Math.random()*2);
  const surges = [];
  for(let i=0;i<surgeCount;i++){
    const band = (FLARE_TIME/1000 - 1.5) / surgeCount;
    const strikeAt = (0.8 + i*band + Math.random()*Math.max(0.1, band - SURGE_WARN - SURGE_STRIKE)) * 1000;
    // Direction the flare comes in from — alternates random.
    const fromLeft = Math.random() < 0.5;
    surges.push({
      warnAt: strikeAt - SURGE_WARN*1000, strikeAt,
      struck:false, fromLeft,
      waveEl: null,
    });
  }

  // ── State ──────────────────────────────────────
  let shield=100, heat=0, holding=false, done=false, fried=false, rafId;
  const scene  = document.getElementById('bscene');
  const btn    = document.getElementById('bbrtn');
  const sf     = document.getElementById('shieldfill');
  const spct   = document.getElementById('spct');
  const hf     = document.getElementById('heatfill');
  const hpct   = document.getElementById('hpct');
  const hw     = document.getElementById('heatwrap');
  const stat   = document.getElementById('bstatus');
  const shex   = document.getElementById('shex');
  const btnLbl = document.getElementById('bbtn-lbl');
  const btnSub = document.getElementById('bbtn-sub');

  // ── Wave-arc surge: single ripple wavefront sweeping across the scene.
  // Spawns at warn start, travels at constant speed; reaches button centre
  // exactly at strike start. Player must release before centre to dodge.
  function spawnWaveEl(s){
    const el = document.createElement('div');
    el.className = 'surge-wave' + (s.fromLeft ? '' : ' from-right');
    el.style.opacity = '0';
    scene.appendChild(el);
    return el;
  }
  function spawnDodgeRing(){
    const ring = document.createElement('div');
    ring.className = 'dodge-ring';
    btn.parentNode.appendChild(ring);
    setTimeout(()=>ring.remove(), 580);
  }
  // Single pre-strike heads-up window: switch button text from "INCOMING" to
  // "STRIKE / RELEASE" this many ms before the strike actually fires, so the
  // player has time to react. Release within the strike window itself still
  // dodges, so this just shifts perception — they see it sooner.
  const RELEASE_LEAD = 220;

  let everBraced = false; // never holding the brace at all used to finish ~60% → 'good'
  let bracedMs = 0;       // total time held — a single tap used to score 'good' too
  let rexSpare = rexAboard();
  const MIN_BRACE_MS = 1500;
  function onDown(e){ if(done) return; if(e.button===0||e.type==='touchstart'){holding=true;everBraced=true;btn.classList.add('held');} }
  function onUp(){ holding=false; btn.classList.remove('held'); }
  btn.addEventListener('mousedown',onDown);
  document.addEventListener('mouseup',onUp);
  btn.addEventListener('touchstart',onDown,{passive:true});
  document.addEventListener('touchend',onUp);

  function endGame(){
    if(done) return;
    done = true;
    cancelAnimationFrame(rafId);
    btn.removeEventListener('mousedown',onDown);
    document.removeEventListener('mouseup',onUp);
    document.removeEventListener('touchend',onUp); // leaked one listener per play
    scene.classList.remove('shake');
    shex.classList.remove('show', 'struck');
    btn.classList.remove('warning','strike','heat-warm','heat-hot');
    let tier, endClass;
    if(fried)              { tier='poor';    endClass='end-fried';   stat.textContent='BRACE FRIED'; }
    else if(!everBraced || bracedMs < MIN_BRACE_MS) { tier='poor'; endClass='end-poor'; stat.textContent=everBraced?'BARELY BRACED':'NEVER BRACED'; }
    else if(shield >= 80)  { tier='perfect'; endClass='end-perfect'; stat.textContent='FLARE PASSED'; }
    else if(shield >= 40)  { tier='good';    endClass='end-good';    stat.textContent='FLARE PASSED'; }
    else                   { tier='poor';    endClass='end-poor';    stat.textContent='SHIELD DOWN'; }
    btn.classList.add(endClass);
    // Brief end-state pause so the moment lands before the result modal hits.
    endBeat(()=>onResult(tier), 750);
  }

  let prev=null, elapsed=0;
  function frame(now){
    if(done) return;
    if(PauseBus.paused){ prev=now; rafId=requestAnimationFrame(frame); return; }
    if(prev===null) prev=now;
    const dt=Math.min(0.05,(now-prev)/1000); prev=now; // capped: a hidden tab mustn't drain the shield in one frame
    elapsed += dt*1000;

    // Heat
    if(holding) bracedMs += dt*1000;
    heat = holding
      ? Math.min(100, heat + HEAT_FILL*dt)
      : Math.max(0,   heat - HEAT_VENT*dt);
    hf.style.width = heat + '%';
    hpct.textContent = Math.round(heat) + '%';
    if(heat > 70){
      hf.style.background = 'var(--red)';
      hw.classList.add('danger');
    } else if(heat > 40){
      hf.style.background = 'var(--orange)';
      hw.classList.remove('danger');
    } else {
      hf.style.background = 'var(--orange)';
      hw.classList.remove('danger');
    }
    if(heat >= 100 && !fried){
      fried = true;
      shield = Math.max(0, shield - 20); // fry kicks shield down
      stat.textContent = 'BRACE FRIED';
      endGame();
      return;
    }

    // Shield drain when released
    if(!holding) shield = Math.max(0, shield - SHIELD_DRAIN*dt);

    // Surges: wave-arc travels constant speed across scene over warn+strike.
    // Reaches button centre exactly at strikeAt. Player should release just
    // before the wave touches the shield (= button centre).
    let activeWarn = false, activeStrike = false, currentSurge = null, releasePhase = false;
    const sceneW = scene.clientWidth || 500;
    const totalTravelMs = (SURGE_WARN + SURGE_STRIKE) * 1000;
    for(const s of surges){
      if(s.struck) continue;
      const inWindow = elapsed >= s.warnAt && elapsed < s.strikeAt + SURGE_STRIKE*1000;
      if(!inWindow) continue;
      currentSurge = s;
      if(elapsed < s.strikeAt) activeWarn = true; else activeStrike = true;
      // Pre-strike heads-up.
      if(elapsed >= s.strikeAt - RELEASE_LEAD) releasePhase = true;
      // A dodge means braced through the warning, then let go — a surge
      // that never saw the brace up isn't a dodge (idle play farmed it).
      if(holding && elapsed >= s.warnAt && elapsed < s.strikeAt) s.braced = true;

      // Wave element + position.
      if(!s.waveEl) s.waveEl = spawnWaveEl(s);
      const travelProg = (elapsed - s.warnAt) / totalTravelMs; // 0..1
      const startX = s.fromLeft ? -60 : sceneW;
      const endX   = s.fromLeft ? sceneW : -60;
      const x = startX + (endX - startX) * travelProg;
      s.waveEl.style.left = x + 'px';
      s.waveEl.style.opacity = String(Math.min(1, travelProg * 2.2));

      // Strike contact.
      if(activeStrike && holding && !s.struck && rexSpare){
        rexSpare = false; s.struck = true; // REX: the first strike lands on his spare shield
        spawnDodgeRing();
      }
      if(activeStrike && holding && !s.struck){
        shield = Math.max(0, shield - SURGE_DAMAGE);
        s.struck = true;
        sf.classList.add('hit');
        setTimeout(()=>sf.classList.remove('hit'), 250);
        scene.classList.add('shake');
        setTimeout(()=>scene.classList.remove('shake'), 250);
        shex.classList.add('struck');
        setTimeout(()=>shex.classList.remove('struck'), 360);
      }
      // Strike window ended without a hit → clean dodge.
      if(elapsed >= s.strikeAt + SURGE_STRIKE*1000 && !s.struck){
        s.struck = true;
        if(s.braced){
          shield = Math.min(100, shield + SURGE_BONUS);
          spawnDodgeRing();
        }
      }
      // Cleanup wave a beat after struck.
      if(s.struck && s.waveEl){
        const fEl = s.waveEl; s.waveEl = null;
        setTimeout(()=>fEl.remove(), 350);
      }
    }

    // Hex shield overlay — visible whenever you're holding (brace is up).
    shex.classList.toggle('show', holding);

    // Brace button colour state — surge classes win over heat classes.
    btn.classList.toggle('warning', activeWarn && !releasePhase);
    btn.classList.toggle('strike',  releasePhase || activeStrike);
    if(!activeWarn && !activeStrike){
      btn.classList.toggle('heat-hot',  heat > 75);
      btn.classList.toggle('heat-warm', heat > 40 && heat <= 75);
    } else {
      btn.classList.remove('heat-hot','heat-warm');
    }

    // Button text — primary (and only) state readout for the player.
    if(releasePhase || activeStrike){
      btnLbl.textContent = 'SURGE STRIKE!';
      btnSub.textContent = 'release mouse button';
    } else if(activeWarn){
      btnLbl.textContent = 'SURGE INCOMING';
      btnSub.textContent = 'hold mouse button';
    } else if(heat > 80){
      btnLbl.textContent = 'VENT';
      btnSub.textContent = 'release to cool down';
    } else {
      btnLbl.textContent = 'BRACE';
      btnSub.textContent = 'hold mouse button';
    }
    stat.textContent = '';

    // Shield UI
    const sp = Math.round(shield);
    sf.style.width = sp+'%';
    sf.style.background = sp>60?'var(--info)':sp>30?'var(--orange)':'var(--red)';
    spct.textContent = sp+'%';

    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);

  const stopTimer = makeTimer('brace-tb', FLARE_TIME, null, endGame);

  return ()=>{
    done = true; cancelAnimationFrame(rafId); stopTimer();
    btn.removeEventListener('mousedown',onDown);
    btn.removeEventListener('touchstart',onDown);
    document.removeEventListener('mouseup',onUp);
    document.removeEventListener('touchend',onUp); // quitting leaked one per play
  };
}

// ─────────────────────────────────────────────
// GAME 7 — HULL BREACH
// ─────────────────────────────────────────────
// Patch sprite preloaded once (used to bake welded variants on demand).
const BREACH_PATCH_IMG = new Image();
// file:// launch: a disk image taints the weld-bake canvas, so use the
// bundle's data: URI copy when there is one.
BREACH_PATCH_IMG.src = (window.TP_PORTABLE && window.TP_PORTABLE.images['sprites/minigames/hullbreach/breach_patch.png'])
  || 'sprites/minigames/hullbreach/breach_patch.png';
const WELD_THICKNESS = 4;
// Inline mirror of sprites/minigames/hullbreach/breaches.json
// Coords are fractions of bg natural size.
const BREACH_REGIONS = {
  "breach_hull_bg.jpg": {regions:[
    {x:0.0333,y:0.1927,w:0.1167,h:0.6281},
    {x:0.8562,y:0.1864,w:0.1177,h:0.6359},
    {x:0.7615,y:0.2536,w:0.0635,h:0.5000},
    {x:0.1802,y:0.2489,w:0.0677,h:0.5016},
    {x:0.2687,y:0.2598,w:0.4729,h:0.4672}
  ]},
  "breach_hull_bg2.jpg": {regions:[
    {x:0.0437,y:0.2848,w:0.8135,h:0.5172},
    {x:0.0979,y:0.1848,w:0.7990,h:0.1031},
    {x:0.8562,y:0.2848,w:0.1073,h:0.4391},
    {x:0.1115,y:0.7973,w:0.7375,h:0.1187}
  ]},
  "breach_hull_bg3.jpg": {regions:[
    {x:0.0646,y:0.3458,w:0.8771,h:0.2953}
  ]}
};

function initBreach(container, onResult, opts){
  opts = opts || {};
  // ── Pick bg + regions ─────────────────────────
  const bgKeys = Object.keys(BREACH_REGIONS);
  const bgKey = bgKeys[Math.floor(Math.random()*bgKeys.length)];
  const regions = BREACH_REGIONS[bgKey].regions;

  // ── Build scene shell first so dimensions are real ──
  container.innerHTML = '';
  const scene = document.createElement('div');
  scene.className = 'breach-scene';
  container.appendChild(scene);
  const bgEl = document.createElement('div');
  bgEl.className = 'breach-bg';
  bgEl.style.backgroundImage = `url('sprites/minigames/hullbreach/${bgKey}')`;
  scene.appendChild(bgEl);

  const SCENE_W = scene.clientWidth, SCENE_H = scene.clientHeight;
  // Scaled to 720×480 modal body (0.75× of native bg). Bg aspect == scene aspect
  // so cover-transform below resolves to identity (no crop), but we keep it
  // generic so the same code works if the modal is ever resized.
  const RING = 38;  // 75px ring radius — keep inside region
  const MIN_SPACING = 75;

  // ── Cover-transform: regions are in NATURAL bg (960×640) coords. ──
  const IMG_W = 960, IMG_H = 640;
  const cScale = Math.max(SCENE_W/IMG_W, SCENE_H/IMG_H);
  const dispW = IMG_W * cScale, dispH = IMG_H * cScale;
  const offX = (SCENE_W - dispW)/2, offY = (SCENE_H - dispH)/2;

  // ── Build HUD + tray FIRST so we can exclude their footprints ──
  const tbar = document.createElement('div');
  tbar.className = 'breach-tbar-wrap';
  tbar.innerHTML = '<div id="bcr-tb" style="width:100%"></div>';
  scene.appendChild(tbar);
  // Patch tray (upper right) — also hosts the SEALED counter at the bottom.
  const tray = document.createElement('div');
  tray.className = 'breach-tray';
  tray.innerHTML =
    '<div class="breach-tray-lbl">PATCHES</div>' +
    '<div class="breach-tray-stack" id="bcr-stack"></div>' +
    '<div class="breach-tray-counter" id="bcr-counter">0 / ? SEALED</div>';
  scene.appendChild(tray);
  const stack = tray.querySelector('#bcr-stack');
  const counter = tray.querySelector('#bcr-counter');
  // OXYGEN bar — bottom-center. Starts at the ship's O2 and drains while
  // breaches are open, stops when patched; the ship's real O2 loss lands
  // through the event's tier_outcomes. With those losses in hand
  // (opts.tierO2 { perfect|good|poor: −n }) the bar never shows a number
  // the result won't land: it stays within the result the seals so far
  // would earn and ends on exactly the landed figure. Without them it is
  // a leak gauge only — no number.
  const TIER_O2 = (opts.tierO2 && ['perfect','good','poor'].every(t => Number.isFinite(opts.tierO2[t]))) ? opts.tierO2 : null;
  const o2Bar = document.createElement('div');
  o2Bar.className = 'breach-o2' + (TIER_O2 ? '' : ' no-number');
  o2Bar.innerHTML =
    '<div class="breach-o2-lbl">OXYGEN</div>' +
    '<div class="breach-o2-track">' +
      '<div class="breach-o2-fill" id="bcr-o2fill" style="width:100%"></div>' +
      (TIER_O2 ? '<div class="breach-o2-pct"><span id="bcr-o2val">100</span>%</div>' : '<div class="breach-o2-pct">LEAKING</div>') +
    '</div>';
  scene.appendChild(o2Bar);
  const o2Fill = o2Bar.querySelector('#bcr-o2fill');
  const o2Val  = o2Bar.querySelector('#bcr-o2val') || { textContent: '' }; // no number without tierO2

  // Blocked rects (in scene-px) — holes won't spawn within these.
  // 12px padding so holes don't kiss the UI either.
  const BPAD = 12;
  const blockedRects = [tbar, tray, o2Bar].map(el => ({
    x: el.offsetLeft - BPAD,
    y: el.offsetTop  - BPAD,
    w: el.offsetWidth  + BPAD*2,
    h: el.offsetHeight + BPAD*2
  }));
  function inBlocked(x, y){
    for(const b of blockedRects){
      if(x >= b.x && x <= b.x+b.w && y >= b.y && y <= b.y+b.h) return true;
    }
    return false;
  }

  // ── Pick N holes (3–6), inset regions by ring radius, no overlap ──
  const N_TARGET = 3 + Math.floor(Math.random()*4);
  const usable = regions.map(r=>{
    const x0 = r.x*dispW + offX, y0 = r.y*dispH + offY;
    const x1 = (r.x+r.w)*dispW + offX, y1 = (r.y+r.h)*dispH + offY;
    const cx0 = Math.max(0, x0) + RING;
    const cy0 = Math.max(0, y0) + RING;
    const cx1 = Math.min(SCENE_W, x1) - RING;
    const cy1 = Math.min(SCENE_H, y1) - RING;
    return { x: cx0, y: cy0, w: cx1 - cx0, h: cy1 - cy0 };
  }).filter(r=>r.w>0&&r.h>0);
  const areas = usable.map(r=>r.w*r.h);
  const totalArea = areas.reduce((a,b)=>a+b,0);
  const holes = [];
  let attempts=0;
  while(holes.length<N_TARGET && attempts<N_TARGET*120){
    attempts++;
    if(!totalArea) break;
    let t=Math.random()*totalArea, ri=0;
    for(let k=0;k<areas.length;k++){if((t-=areas[k])<=0){ri=k;break;}}
    const r=usable[ri];
    const x = r.x + Math.random()*r.w;
    const y = r.y + Math.random()*r.h;
    if(inBlocked(x, y)) continue;
    let ok=true;
    for(const h of holes){
      const dx=x-h.x, dy=y-h.y;
      if(Math.sqrt(dx*dx+dy*dy)<MIN_SPACING){ok=false;break;}
    }
    if(ok) holes.push({
      x,y,
      rotation:Math.floor(Math.random()*4)*90,
      flipX:Math.random()<0.5,
      patched:false, welded:false,
      particleSpawnAt:0, el:null
    });
  }
  const N = holes.length;
  counter.textContent = `0 / ${N} SEALED`;

  // ── Time budget: 3s per hole, 4s per hole with engineer ──
  // Ruling 76 (owner 2026-10-14): the countdown stays on real seconds
  // (makeTimer); the launching choice's tooltip says so and states the
  // days the job takes (index.html choiceCostLines).
  const perHole = 3000 + 1000 * engineerMult; // wounded engineer: +0.5s
  const totalTime = Math.round(N * perHole * (rexAboard() ? 1.15 : 1)); // REX: 15% more time

  // ── Spawn hole sprites ────────────────────────
  holes.forEach(h=>{
    const el=document.createElement('div');
    el.className='bhole';
    el.style.left=h.x+'px';
    el.style.top=h.y+'px';
    let tr='';
    if(h.rotation) tr+=`rotate(${h.rotation}deg) `;
    if(h.flipX) tr+='scaleX(-1)';
    if(tr.trim()) el.style.transform=tr.trim();
    h.el=el;
    scene.appendChild(el);
  });

  // ── State ─────────────────────────────────────
  let activePatch = null; // {el, state:'drag'|'snapped'|'dropped', x, y, holeIdx?, hint?, vy?}
  let done = false;
  let particles = [];
  let pRafId = 0;
  let remainingTray = N;
  // O2: a breach event can cost AT MOST O2_MAX_LOSS percent atmosphere,
  // even if you do nothing. Per-hole drain rate scales so:
  //   open=N for full game time → drain == O2_MAX_LOSS
  // Patch a hole and its share is removed from the running drain.
  // Math: N * R * T = cap  →  R = cap / (T * N)
  // Where T = N * perHole_seconds, so R = cap / (perHole_seconds * N²).
  // The bar starts at the ship's real O2, not 100%: a breach on a
  // half-empty tank never shows a full one.
  const O2_START = typeof STATE.resources.o2 === 'number'
    ? Math.max(0, Math.min(100, Math.round(STATE.resources.o2))) : 100;
  let o2 = O2_START;
  // Where a result tier leaves the air: the start plus its loss, as the
  // engine lands it (clamped 0–100).
  const o2After = t => Math.max(0, Math.min(100, O2_START + TIER_O2[t]));
  // The worst the bar can show: the poor result's landing (with the
  // event's numbers), else the old 10% gauge cap.
  const O2_MAX_LOSS = TIER_O2 ? Math.max(0, O2_START - o2After('poor')) : 10;
  const O2_DRAIN_PER_HOLE = O2_MAX_LOSS / ((perHole / 1000) * N * N);
  // The result the seals so far would earn if the clock ran out now
  // (the timer's own rule below).
  const tierNow = () => { const m = N - holes.filter(x=>x.welded).length; return m === 0 ? 'perfect' : (N && m / N <= 0.34) ? 'good' : 'poor'; };
  function paintO2(){
    o2Fill.style.width = o2 + '%';
    o2Val.textContent = Math.round(o2);
  }
  // The bar ends on what lands: the result's own figure.
  function settleO2(t){ if(TIER_O2){ o2 = o2After(t); paintO2(); } }
  paintO2();

  // ── Tray rendering ────────────────────────────
  function renderTray(){
    [...stack.children].forEach(c=>c.remove());
    for(let i=0;i<remainingTray;i++){
      const p=document.createElement('div');
      p.className='tpatch';
      p.style.left=(i*4)+'px'; p.style.top=(i*4)+'px';
      stack.appendChild(p);
    }
    if(remainingTray>0 && !activePatch){
      const top=stack.lastChild;
      top.classList.add('draggable');
      top.addEventListener('mousedown', startDragFromTray);
    }
  }

  // Translate viewport-px event coords to unscaled scene-px (handles scale-root transform).
  function eventToScenePx(e){
    const r=scene.getBoundingClientRect();
    return {
      x: (e.clientX-r.left) * (scene.clientWidth  / r.width),
      y: (e.clientY-r.top)  * (scene.clientHeight / r.height)
    };
  }

  function startDragFromTray(e){
    if(done||activePatch) return;
    e.preventDefault(); e.stopPropagation();
    remainingTray--;
    const p = eventToScenePx(e);
    spawnDraggingPatch(p.x, p.y);
    renderTray();
  }

  function spawnDraggingPatch(x, y){
    const el=document.createElement('div');
    el.className='bpatch dragging';
    el.style.left=x+'px'; el.style.top=y+'px';
    scene.appendChild(el);
    activePatch={el, state:'drag', x, y};
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragUp);
  }

  function onDragMove(e){
    if(!activePatch||activePatch.state!=='drag') return;
    const p = eventToScenePx(e);
    activePatch.x=p.x; activePatch.y=p.y;
    activePatch.el.style.left=activePatch.x+'px';
    activePatch.el.style.top=activePatch.y+'px';
  }

  function onDragUp(){
    if(!activePatch||activePatch.state!=='drag') return;
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragUp);
    // Generous hitbox: hole radius (24) + patch radius (36) + slack ≈ 72
    let nearest=-1, nDist=999;
    holes.forEach((h,i)=>{
      if(h.patched) return;
      const dx=activePatch.x-h.x, dy=activePatch.y-h.y;
      const d=Math.sqrt(dx*dx+dy*dy);
      if(d<72 && d<nDist){nearest=i;nDist=d;}
    });
    if(nearest>=0){
      const h=holes[nearest];
      h.patched=true;
      activePatch.el.classList.remove('dragging');
      activePatch.el.classList.add('snapped');
      activePatch.el.style.left=h.x+'px';
      activePatch.el.style.top=h.y+'px';
      activePatch.state='snapped';
      activePatch.holeIdx=nearest;
      const hint=document.createElement('div');
      hint.className='weld-hint';
      hint.textContent='CLICK TO WELD';
      hint.style.left=h.x+'px'; hint.style.top=h.y+'px';
      scene.appendChild(hint);
      activePatch.hint=hint;
      activePatch.el.addEventListener('click', tryWeld);
    } else {
      // Drop with gravity
      activePatch.state='dropped';
      activePatch.el.classList.remove('dragging');
      activePatch.el.classList.add('dropped');
      activePatch.vy=0;
      activePatch.el.addEventListener('mousedown', pickupDropped);
      gravityFall(activePatch);
    }
  }

  function tryWeld(){
    if(!activePatch||activePatch.state!=='snapped') return;
    const h=holes[activePatch.holeIdx];
    h.welded=true;
    const oldEl = activePatch.el;
    oldEl.removeEventListener('click', tryWeld);
    if(activePatch.hint){activePatch.hint.remove();activePatch.hint=null;}

    // ── Bake bead once per patch, crossfade hot → cool via CSS ─
    // Same seed for both bakes = identical bead geometry, only colour
    // changes. Stack two canvases; fade the hot layer out via CSS.
    function startCooling(){
      const baseOpts = {
        thickness: WELD_THICKNESS,
        bumpiness: 0.50,
        noiseScale: 2,
        seed: (h.x*73 + h.y*131 | 0) || 12345,
      };
      let coolCv, hotCv;
      try {
        coolCv = bakeWeldedSprite(BREACH_PATCH_IMG, {...baseOpts, palette: WELD_PALETTES.gunmetal, hotChance: 0});
        hotCv  = bakeWeldedSprite(BREACH_PATCH_IMG, {...baseOpts, palette: WELD_PALETTES.freshHot, hotChance: 0});
      } catch(err){
        // Tainted canvas — getImageData() blocked. Almost always means the
        // page was opened from file:// (every local file is treated as
        // cross-origin from every other). Serve via http://localhost to
        // get the procedural bead. Falling back to plain patch + CSS aura.
        console.warn('[breach] weld bake skipped — canvas tainted (likely file:// — serve via http to enable):', err);
        const fb = document.createElement('div');
        fb.className = 'bpatch';
        fb.style.left = h.x + 'px';
        fb.style.top  = h.y + 'px';
        fb.style.filter = 'drop-shadow(3px 0 0 var(--orange)) drop-shadow(-3px 0 0 var(--orange)) drop-shadow(0 3px 0 var(--orange)) drop-shadow(0 -3px 0 var(--orange))';
        oldEl.replaceWith(fb);
        return;
      }
      const wrapper = document.createElement('div');
      wrapper.className = 'bpatch welded';
      wrapper.style.left = h.x + 'px';
      wrapper.style.top  = h.y + 'px';
      wrapper.style.position = 'absolute';
      for(const cv of [coolCv, hotCv]){
        cv.style.position = 'absolute';
        cv.style.inset = '0';
        cv.style.width = '100%';
        cv.style.height = '100%';
        cv.style.imageRendering = 'pixelated';
      }
      hotCv.style.transition = 'opacity 1s ease-out';
      hotCv.style.opacity = '1';
      wrapper.appendChild(coolCv);
      wrapper.appendChild(hotCv);
      oldEl.parentNode.replaceChild(wrapper, oldEl);
      // Two rAF nudges so the transition actually triggers.
      requestAnimationFrame(()=>requestAnimationFrame(()=>{ hotCv.style.opacity = '0'; }));
    }
    if(BREACH_PATCH_IMG.complete) startCooling();
    else BREACH_PATCH_IMG.addEventListener('load', startCooling, {once:true});

    // Pfft puff outward
    for(let i=0;i<7;i++){
      const ang=Math.random()*Math.PI*2;
      const speed=70+Math.random()*60;
      const el=document.createElement('div');
      el.className='bparticle puff';
      el.style.left=h.x+'px';el.style.top=h.y+'px';
      scene.appendChild(el);
      particles.push({x:h.x,y:h.y,vx:Math.cos(ang)*speed,vy:Math.sin(ang)*speed,el,life:0.55,puff:true});
    }
    activePatch=null;
    const w=holes.filter(x=>x.welded).length;
    counter.textContent=`${w} / ${N} SEALED`;
    if(w>=N){
      done=true;
      settleO2('perfect');
      endBeat(()=>onResult('perfect'), 700);
      return;
    }
    renderTray();
  }

  function pickupDropped(e){
    if(done) return;
    if(!activePatch || activePatch.el !== e.currentTarget) return;
    e.stopPropagation(); e.preventDefault();
    activePatch.state='drag';
    activePatch.el.classList.remove('dropped');
    activePatch.el.classList.add('dragging');
    activePatch.el.removeEventListener('mousedown', pickupDropped);
    // Snap patch to current cursor so drag feels continuous
    const p = eventToScenePx(e);
    activePatch.x = p.x; activePatch.y = p.y;
    activePatch.el.style.left = p.x + 'px';
    activePatch.el.style.top  = p.y + 'px';
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragUp);
  }

  function gravityFall(patch){
    let prev=performance.now();
    const floorY = scene.clientHeight - 42;
    function step(now){
      if(done||patch.state!=='dropped') return;
      if(PauseBus.paused){ prev=now; requestAnimationFrame(step); return; }
      const dt=Math.min(0.05,(now-prev)/1000); prev=now;
      patch.vy=(patch.vy||0)+1400*dt;
      patch.y += patch.vy*dt;
      if(patch.y>=floorY){
        patch.y=floorY;
        if(Math.abs(patch.vy)>50){ patch.vy=-patch.vy*0.32; }
        else { patch.vy=0; patch.el.style.left=patch.x+'px'; patch.el.style.top=patch.y+'px'; return; }
      }
      patch.el.style.left=patch.x+'px';
      patch.el.style.top=patch.y+'px';
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // ── Particle loop (vacuum + puff) + O2 drain ──
  function updateO2(dt){
    const open = holes.filter(h=>!h.patched).length;
    if(open === 0) return;
    o2 = Math.max(0, o2 - open * O2_DRAIN_PER_HOLE * dt);
    // Never below what the result earned so far would land.
    if(TIER_O2) o2 = Math.max(o2, o2After(tierNow()));
    paintO2();
    // Bar sits in [start-max..start]. Thresholds map onto "how much of
    // the allowable damage you've taken" (the old 10-point gauge: 7 / 4).
    const lost = O2_START - o2;
    if(lost > O2_MAX_LOSS * 0.7){
      o2Fill.style.background = 'var(--red)';
      o2Bar.classList.add('danger');
    } else if(lost > O2_MAX_LOSS * 0.4){
      o2Fill.style.background = 'var(--orange)';
      o2Bar.classList.remove('danger');
    } else {
      o2Fill.style.background = 'var(--res-o2)'; // pale ice (owner ruling 45); the warnings above stay orange/red
      o2Bar.classList.remove('danger');
    }
  }
  let lastT=performance.now();
  function pLoop(now){
    if(done) return;
    if(PauseBus.paused){ lastT=now; pRafId=requestAnimationFrame(pLoop); return; }
    const dt=Math.min(0.05,(now-lastT)/1000); lastT=now;
    updateO2(dt);
    // Spawn for unpatched holes
    holes.forEach((h,hi)=>{
      if(h.patched) return;
      h.particleSpawnAt -= dt;
      if(h.particleSpawnAt<=0){
        h.particleSpawnAt = 0.06 + Math.random()*0.10;
        const ang=Math.random()*Math.PI*2;
        const dist=42+Math.random()*48;
        const sx=h.x+Math.cos(ang)*dist;
        const sy=h.y+Math.sin(ang)*dist;
        const el=document.createElement('div');
        el.className='bparticle';
        el.style.left=sx+'px';el.style.top=sy+'px';
        scene.appendChild(el);
        particles.push({x:sx,y:sy,vx:0,vy:0,el,holeIdx:hi,life:1.4});
      }
    });
    // Update particles
    for(let i=particles.length-1;i>=0;i--){
      const p=particles[i];
      p.life-=dt;
      if(p.puff){
        p.vx*=0.88; p.vy*=0.88;
        p.x+=p.vx*dt; p.y+=p.vy*dt;
        p.el.style.left=p.x+'px'; p.el.style.top=p.y+'px';
        p.el.style.opacity=Math.max(0,p.life/0.55);
        if(p.life<=0){p.el.remove();particles.splice(i,1);}
      } else {
        const h=holes[p.holeIdx];
        const dx=h.x-p.x, dy=h.y-p.y;
        const d=Math.sqrt(dx*dx+dy*dy);
        if(d<5||p.life<=0||h.patched){p.el.remove();particles.splice(i,1);continue;}
        const accel=1100;
        p.vx += (dx/d)*accel*dt;
        p.vy += (dy/d)*accel*dt;
        p.x += p.vx*dt; p.y += p.vy*dt;
        p.el.style.left=p.x+'px'; p.el.style.top=p.y+'px';
      }
    }
    pRafId=requestAnimationFrame(pLoop);
  }
  pRafId=requestAnimationFrame(pLoop);

  renderTray();

  // ── Timer + result ────────────────────────────
  const stopTimer=makeTimer('bcr-tb', totalTime, null, ()=>{
    if(done) return;
    done=true;
    const w=holes.filter(x=>x.welded).length;
    const missing=N-w;
    const missingFrac=missing/N;
    // The event's tier_outcomes decide what each tier costs.
    let tier;
    if(missing===0) tier='perfect';
    else if(missingFrac<=0.34) tier='good';
    else tier='poor';
    settleO2(tier);
    onResult(tier);
  });

  return ()=>{
    done=true;
    cancelAnimationFrame(pRafId);
    stopTimer();
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragUp);
  };
}

// ─────────────────────────────────────────────
// GAME 8 — SALVAGE
// ─────────────────────────────────────────────
/* The derelict's hold (owner ruling 2026-10-11 #12; SALVAGE inside a hulk,
   opts.setting 'derelict'): all 11 sprites in sprites/minigames/derelict/
   — fuel cells by size, three ration cans, a component, a medkit, three
   hazards. Payouts are fixed, so the haul card shows exactly what lands
   (fuel/food as units; the briefing quotes the same numbers). Exposed as
   window.SALVAGE_DERELICT so lint/tests can read the set; initSalvage
   reads it at the start of each run. */
const SALVAGE_DERELICT = (() => {
  const DD = 'sprites/minigames/derelict/';
  return {
    items: [
      {key:'fuelcell_s', cat:'fuel',      sz:'s', sprite:DD+'derelict_fuelcell_s.png', wt:6},
      {key:'fuelcell_m', cat:'fuel',      sz:'m', sprite:DD+'derelict_fuelcell_m.png', wt:4},
      {key:'fuelcell_l', cat:'fuel',      sz:'l', sprite:DD+'derelict_fuelcell_l.png', wt:2},
      {key:'foodcan',    cat:'food',      sz:'m', sized:false, sprite:DD+'derelict_foodcan.png',   wt:3},
      {key:'foodcan2',   cat:'food',      sz:'m', sized:false, sprite:DD+'derelict_foodcan2.png',  wt:3},
      {key:'foodcan3',   cat:'food',      sz:'m', sized:false, sprite:DD+'derelict_foodcan3.png',  wt:3},
      {key:'component',  cat:'component', sz:'m', sized:false, sprite:DD+'derelict_component.png', wt:4},
      {key:'medkit',     cat:'medkit',    sz:'m', sized:false, sprite:DD+'derelict_medkit.png',    wt:1},
    ],
    hazards: [DD+'derelict_hazard.png', DD+'derelict_hazard2.png', DD+'derelict_hazard3.png'],
    pay: { fuel:{s:5, m:10, l:15}, food:5, component:{metal:1, exotic:1}, medkit:'medkit' },
  };
})();
function initSalvage(container, onResult, opts){
  // opts.setting 'derelict' (owner ruling 2026-10-11 #12): the same game
  // inside a derelict's hold — interior backdrop, no ship bay painted in,
  // a marked stowage hatch, and sprites/minigames/derelict/'s loot set.
  const DERELICT = !!(opts && opts.setting === 'derelict');
  // An event's salvage job (owner 2026-10-23): the haul only sets the
  // result tier; the event's reward for that tier is what lands, so the
  // end card shows that reward — no processing, no inventory.
  const JOB = isEventJob(opts);
  // ── Tuned values (from salvage-devtool.html JSON exports) ──
  const BAY    = {x:0.4447, y:0.7905, w:0.1417, h:0.1437};
  const EMIT   = {fx:0.52, fy:0.75};
  const BEAM   = {chunk:4, width:14, corePct:0.4, opacity:0.65,
                  period:8, band:2, scroll:0.3, jitter:1, taper:0.7,
                  color1:'#72fba9', color2:'#ffd7ff'};
  const HUDCUR = {size:24, thickness:6, gap:3,
                  color1:'#35c6bf', color2:'#c8a85a',
                  opacity:50, outline:true};

  const RUN_MS = 20000;
  const ENERGY_MAX = 100;
  const ENERGY_DRAIN_PER_SEC = 3;     // beam-on idle
  const ENERGY_DRAIN_PER_PX  = 0.020; // moving cursor while holding

  const SD = 'sprites/minigames/salvage/';
  const DD = 'sprites/minigames/derelict/';
  const MD = 'sprites/cargo/materials/';
  const UD = 'sprites/cargo/upgrades/';

  // Random-pick a scene bg (a derelict: one of its interior rooms).
  const BGS = ['salvage_bg_space.jpg','salvage_bg_deepspace.jpg',
               'salvage_bg_asteroid.jpg','salvage_bg_planet.jpg'];
  const DERELICT_BGS = ['sprites/backgrounds/ship_interior/derelict/1.jpg',
                        'sprites/backgrounds/ship_interior/derelict/2.jpg'];
  const sceneBg = DERELICT ? DERELICT_BGS[Math.floor(Math.random()*DERELICT_BGS.length)]
                           : SD + BGS[Math.floor(Math.random()*BGS.length)];
  const sceneType = DERELICT ? 'derelict' : sceneBg.replace(SD + 'salvage_bg_','').replace('.jpg','');

  // Drift vector per scene type (fractional units / sec).
  // Asteroid scene = random direction per item.
  const DRIFTS = {
    space:    {dx: 0.05,  dy: 0,     jx: 0.012},
    deepspace:{dx:-0.05,  dy: 0.005, jx: 0.012},
    asteroid: {random:true},
    planet:   {dx: 0.04,  dy: 0.015, jx: 0.008},
    derelict: {random:true},  // zero-g hold: things float in from every side
  };
  const drift = DRIFTS[sceneType];

  // Drift item table (weighted random spawn). All 12 size variants exist.
  const ITEMS = [
    {key:'tank_s',   cat:'tank',   sz:'s', sprite:SD+'salvage_tank_s.png',    wt:6},
    {key:'tank_m',   cat:'tank',   sz:'m', sprite:SD+'salvage_tank_m.png',    wt:4},
    {key:'tank_l',   cat:'tank',   sz:'l', sprite:SD+'salvage_tank_l.png',    wt:2},
    {key:'circuit_s',cat:'circuit',sz:'s', sprite:SD+'salvage_circuit_s.png', wt:9},
    {key:'circuit_m',cat:'circuit',sz:'m', sprite:SD+'salvage_circuit_m.png', wt:5},
    {key:'circuit_l',cat:'circuit',sz:'l', sprite:SD+'salvage_circuit_l.png', wt:2},
    {key:'coil_s',   cat:'coil',   sz:'s', sprite:SD+'salvage_coil_s.png',    wt:5},
    {key:'coil_m',   cat:'coil',   sz:'m', sprite:SD+'salvage_coil_m.png',    wt:3},
    {key:'coil_l',   cat:'coil',   sz:'l', sprite:SD+'salvage_coil_l.png',    wt:1},
    {key:'crate_s',  cat:'crate',  sz:'s', sprite:SD+'salvage_crate_s.png',   wt:4},
    {key:'crate_m',  cat:'crate',  sz:'m', sprite:SD+'salvage_crate_m.png',   wt:2},
    {key:'crate_l',  cat:'crate',  sz:'l', sprite:SD+'salvage_crate_l.png',   wt:1},
  ];
  const DERELICT_PAY = SALVAGE_DERELICT.pay;
  const SPAWN_ITEMS = DERELICT ? SALVAGE_DERELICT.items : ITEMS;
  const ITEMS_TOTAL_WT = SPAWN_ITEMS.reduce((s,i)=>s+i.wt,0);

  // CRATE_POOLS defined in shared.js — resolved from the shared global scope.
  const UPGRADES = ['drive_coil','o2_recycler','repair_fabricator'];

  // Hazard sprites — random rotation + integer-friendly scale variance.
  // Bgs WITHOUT asteroid clutter (asteroid-surface, planet) get more
  // hazards to fill the visual noise role; bgs WITH clutter (space,
  // deepspace) get fewer so the asteroid parallax does the gunking-up.
  const HAZARD_SPRITES = DERELICT ? SALVAGE_DERELICT.hazards : [
    SD+'salvage_hazard.png', SD+'salvage_hazard2.png', SD+'salvage_hazard3.png',
  ];
  const wantsAsteroids = (sceneType === 'space' || sceneType === 'deepspace');
  const HAZARD_INTERVAL = wantsAsteroids ? 4500 : 1900;
  const HAZARD_MAX = wantsAsteroids ? 2 : 4;

  // ── HTML scaffold ──
  // No visible timer bar: salvage is paced by ENERGY (visible). The RUN_MS
  // timer below is a hidden safety cap — most runs end via depletion first.
  // makeTimer's getElementById on a missing barId silently no-ops the bar
  // update, so we just keep the call as-is and skip the DOM element.
  container.innerHTML = `
    <div class="sal-stage" id="sal-stage">
      <img class="sal-bg" id="sal-bg" src="${sceneBg}" alt="">
      <div class="sal-bay-glow${DERELICT ? ' sal-bay-mark' : ''}" id="sal-bay-glow"></div>
      <div class="sal-items" id="sal-items"></div>
      <canvas class="sal-canvas" id="sal-canvas" width="720" height="480"></canvas>
      <div class="sal-hud">
        <div class="sal-energy-wrap">
          <div class="sal-energy-fill" id="sal-energy"></div>
          <span class="sal-energy-lbl">ENERGY</span>
        </div>
        <div class="sal-cargo">CARGO: <span id="sal-count">0</span></div>
      </div>
    </div>
    <div class="sal-end" id="sal-end" hidden></div>
  `;

  const stage = document.getElementById('sal-stage');
  const glowEl = document.getElementById('sal-bay-glow');
  const itemsEl = document.getElementById('sal-items');
  const canvas = document.getElementById('sal-canvas');
  const ctx = canvas.getContext('2d');
  const energyEl = document.getElementById('sal-energy');
  const countEl = document.getElementById('sal-count');
  const endEl = document.getElementById('sal-end');

  // Position the bay-glow div over the bay rect (invisible until pulse).
  glowEl.style.left   = (BAY.x*100)+'%';
  glowEl.style.top    = (BAY.y*100)+'%';
  glowEl.style.width  = (BAY.w*100)+'%';
  glowEl.style.height = (BAY.h*100)+'%';

  // ── HUD cursor (parametric reticle from shared.js) ──
  CURSOR_CONTEXTS['salvage_tractor'] = {
    family:'reticle', cursor:'hud',
    size:HUDCUR.size, thickness:HUDCUR.thickness, gap:HUDCUR.gap,
    color1:HUDCUR.color1, color2:HUDCUR.color2,
    outline:HUDCUR.outline, dot:false, scale:2,
  };
  stage.style.cursor = generateCursor('salvage_tractor', {
    color1:HUDCUR.color1, color2:HUDCUR.color2,
    thickness:HUDCUR.thickness, outline:HUDCUR.outline, opacity:HUDCUR.opacity,
  });

  // ── Foreground drifting asteroid clutter ──
  // Only on space-context bgs (`space`, `deepspace`). The bg literally named
  // "asteroid" is an asteroid SURFACE, not a field — no foreground rocks.
  // "planet" is a planet surface — also no.
  // Asteroids drift like items but are non-clickable and live in 3 parallax
  // layers (back/mid/front). Smaller + slower + dimmer = farther back.
  // Layer is rolled at spawn time and never changes.
  const asteroids = [];  // {el, fx, fy, vx, vy, rot, vrot, layer}
  const ASTEROID_LAYERS = [
    {scale:[0.4,0.6],  speed:0.45, bri:0.45, z:1},  // back  (dim, distant)
    {scale:[0.6,0.85], speed:0.7,  bri:0.7,  z:2},  // mid
    {scale:[0.85,1.2], speed:1.0,  bri:1.0,  z:3},  // front (full bright)
  ];
  function spawnAsteroid(initial) {
    const src = pickRandom(ASTEROID_FILES);
    const layer = ASTEROID_LAYERS[Math.floor(Math.random() * ASTEROID_LAYERS.length)];
    const speedMul = layer.speed;
    let vx = drift.dx * speedMul + (Math.random()-0.5) * (drift.jx||0.01);
    let vy = drift.dy * speedMul + (Math.random()-0.5) * 0.02;
    let fx, fy;
    if (initial) {
      fx = 0.05 + Math.random()*0.9;
      fy = 0.05 + Math.random()*0.6;
    } else if (vx > 0) { fx = -0.08; fy = 0.05 + Math.random()*0.6; }
      else if (vx < 0) { fx = 1.08;  fy = 0.05 + Math.random()*0.6; }
      else              { fx = 0.05 + Math.random()*0.9; fy = -0.08; }
    const scale = layer.scale[0] + Math.random()*(layer.scale[1] - layer.scale[0]);
    const rot = (Math.random()-0.5)*120;
    const vrot = (Math.random()-0.5) * 8;  // deg/sec — slow tumble
    const a = document.createElement('img');
    a.className = 'sal-asteroid';
    a.src = src;
    const sz = 80;  // base size, scaled via CSS var
    a.style.width = sz + 'px';
    a.style.height = sz + 'px';
    a.style.marginLeft = (-sz/2)+'px';
    a.style.marginTop  = (-sz/2)+'px';
    a.style.left = (fx*100)+'%';
    a.style.top  = (fy*100)+'%';
    a.style.zIndex = layer.z;
    a.style.setProperty('--scl', scale);
    a.style.setProperty('--rot', rot+'deg');
    a.style.setProperty('--bri', layer.bri);
    stage.insertBefore(a, glowEl);
    asteroids.push({el:a, fx, fy, vx, vy, rot, vrot});
  }
  let asteroidSpawnIv = null;
  if (wantsAsteroids) {
    for (let i = 0; i < 10; i++) spawnAsteroid(true);
    asteroidSpawnIv = setInterval(() => {
      if (done) return;
      if (asteroids.filter(a => a.el.isConnected).length < 14) spawnAsteroid(false);
    }, 1400);
  }

  // ── State ──
  let mouse = {x:0, y:0};
  let firing = false;
  let held = null;            // active item being tractored
  let energy = ENERGY_MAX;
  let scrollPhase = 0;
  let done = false;
  let lastMouseX = 0, lastMouseY = 0;
  let lastTick = performance.now();
  let rafId;
  const items = [];           // {el, fx, fy, vx, vy, type, alive}
  const cargo = [];           // {key, cat, sz, sprite}

  function pickItemType() {
    let r = Math.random() * ITEMS_TOTAL_WT;
    for (const t of SPAWN_ITEMS) { if ((r -= t.wt) <= 0) return t; }
    return SPAWN_ITEMS[0];
  }

  function spawnItem() {
    if (done) return;
    if (items.filter(i=>i.alive).length >= 5) return;
    const type = pickItemType();
    let fx, fy, vx, vy;
    if (drift.random) {
      // Asteroid scene: pick L/R/T edge (NOT bottom — that's the ship art).
      // Drift inward at a random angle.
      const edge = Math.floor(Math.random() * 3); // 0=L 1=R 2=T
      const sp = 0.035 + Math.random()*0.025;
      const skew = (Math.random() - 0.5) * 0.7;  // ±0.35 rad sideways
      if (edge === 0)      { fx=-0.08; fy=0.05+Math.random()*0.55; vx= sp; vy=skew*sp; }
      else if (edge === 1) { fx= 1.08; fy=0.05+Math.random()*0.55; vx=-sp; vy=skew*sp; }
      else                 { fx=0.1+Math.random()*0.8; fy=-0.08; vx=skew*sp; vy= sp; }
    } else {
      vx = drift.dx + (Math.random()-0.5)*drift.jx*2;
      vy = drift.dy + (Math.random()-0.5)*drift.jx*2;
      // Spawn just outside an edge — but never the bottom (ship art).
      if (vx > 0)      { fx = -0.08; fy = 0.05 + Math.random()*0.55; }
      else if (vx < 0) { fx =  1.08; fy = 0.05 + Math.random()*0.55; }
      else             { fx = 0.1 + Math.random()*0.8; fy = -0.08; }
    }
    const el = document.createElement('img');
    el.className = 'sal-item sz-'+type.sz;
    el.src = type.sprite;
    el.style.left = (fx*100)+'%';
    el.style.top  = (fy*100)+'%';
    // Subtle initial rotation + slow rotational drift so items don't look
    // like they're on a conveyor belt.
    const rot  = (Math.random()-0.5) * 30;       // ±15° initial
    const vrot = (Math.random()-0.5) * 14;       // ±7°/sec drift
    el.style.setProperty('--rot', rot+'deg');
    itemsEl.appendChild(el);
    const item = {el, fx, fy, vx, vy, rot, vrot, type, alive:true};
    items.push(item);
    el.addEventListener('mousedown', (ev) => {
      if (done || held || energy <= 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      firing = true;
      held = item;
      el.classList.add('held');
      lastMouseX = mouse.x; lastMouseY = mouse.y;
    });
  }

  // Hazards = junk debris. Same drift, gunk up the field. Grabbing one
  // wastes energy + a cargo slot; in the end screen they convert to
  // "Useless Scrap" (can't be sold). Scarce on space/deepspace (asteroid
  // clutter does that job there); abundant on asteroid/planet bgs.
  const hazards = [];
  function spawnHazard() {
    if (done) return;
    if (hazards.filter(h=>h.alive).length >= HAZARD_MAX) return;
    let fx, fy, vx, vy;
    if (drift.random) {
      const edge = Math.floor(Math.random() * 3);
      const sp = 0.03 + Math.random()*0.025;
      const skew = (Math.random() - 0.5) * 0.7;
      if (edge === 0)      { fx=-0.08; fy=0.05+Math.random()*0.55; vx= sp; vy=skew*sp; }
      else if (edge === 1) { fx= 1.08; fy=0.05+Math.random()*0.55; vx=-sp; vy=skew*sp; }
      else                 { fx=0.1+Math.random()*0.8; fy=-0.08; vx=skew*sp; vy= sp; }
    } else {
      vx = drift.dx + (Math.random()-0.5)*drift.jx*2;
      vy = drift.dy + (Math.random()-0.5)*drift.jx*2;
      if (vx > 0)      { fx = -0.08; fy = 0.05 + Math.random()*0.55; }
      else if (vx < 0) { fx =  1.08; fy = 0.05 + Math.random()*0.55; }
      else             { fx = 0.1 + Math.random()*0.8; fy = -0.08; }
    }
    const sprite = HAZARD_SPRITES[Math.floor(Math.random()*HAZARD_SPRITES.length)];
    const scale = [1, 1.5, 2][Math.floor(Math.random()*3)];   // integer-friendly scale variance
    const rot   = Math.random() * 360;                          // any rotation
    const vrot  = (Math.random()-0.5) * 18;                     // tumble fast
    const el = document.createElement('img');
    el.className = 'sal-hazard';
    el.src = sprite;
    el.style.left = (fx*100)+'%';
    el.style.top  = (fy*100)+'%';
    el.style.setProperty('--scl', scale);
    el.style.setProperty('--rot', rot+'deg');
    itemsEl.appendChild(el);
    const h = {el, fx, fy, vx, vy, rot, vrot, sprite, scale, alive:true,
               type:{key:'hazard', cat:'hazard', sz:'-', sprite}};
    hazards.push(h);
    el.addEventListener('mousedown', (ev) => {
      if (done || held || energy <= 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      firing = true;
      held = h;
      el.classList.add('held');
      lastMouseX = mouse.x; lastMouseY = mouse.y;
    });
  }

  // Spawn cadence + initial seed (items, then hazards).
  const spawnIv = setInterval(spawnItem, 1500);
  for (let i=0; i<3; i++) setTimeout(spawnItem, 200*i + 200);
  const hazardSpawnIv = setInterval(spawnHazard, HAZARD_INTERVAL);
  for (let i=0; i<2; i++) setTimeout(spawnHazard, 700 + 400*i);

  // ── Mouse handling on stage ──
  stage.addEventListener('mousemove', (e) => {
    const r = stage.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
  });
  stage.addEventListener('mousedown', (e) => {
    if (done || energy <= 0 || held) return;
    // If we clicked on an item, the item's listener already set firing/held.
    // For empty-stage clicks, just engage the beam visually (no grab).
    const cl = e.target.classList;
    if (cl && (cl.contains('sal-item') || cl.contains('sal-hazard'))) return;
    e.preventDefault();
    firing = true;
    lastMouseX = mouse.x; lastMouseY = mouse.y;
  });

  function pulseBay() {
    glowEl.classList.remove('pulse');
    void glowEl.offsetWidth;
    glowEl.classList.add('pulse');
  }
  function popupCargoPlusOne() {
    const pop = document.createElement('div');
    pop.className = 'sal-cargo-pop';
    pop.textContent = '+1';
    pop.style.left = ((BAY.x + BAY.w/2) * 100) + '%';
    pop.style.top  = ((BAY.y + BAY.h/2) * 100) + '%';
    stage.appendChild(pop);
    setTimeout(() => pop.remove(), 800);
  }
  function bumpCargoCount() {
    countEl.classList.remove('pulse');
    void countEl.offsetWidth;
    countEl.classList.add('pulse');
  }

  function release() {
    if (held) {
      if (held.fx >= BAY.x && held.fx <= BAY.x + BAY.w &&
          held.fy >= BAY.y && held.fy <= BAY.y + BAY.h) {
        cargo.push({key:held.type.key, cat:held.type.cat,
                    sz:held.type.sz, sized:held.type.sized !== false, sprite:held.type.sprite});
        countEl.textContent = cargo.length;
        held.alive = false;
        held.el.classList.add('stowed');
        const stowed = held.el;
        setTimeout(() => stowed.remove(), 320);
        pulseBay();
        popupCargoPlusOne();
        bumpCargoCount();
      } else {
        held.el.classList.remove('held');
      }
      held = null;
    }
    firing = false;
  }
  window.addEventListener('mouseup', release);

  // ── Beam draw helper ──
  function drawBeam(x1, y1, x2, y2) {
    const dx = x2-x1, dy = y2-y1;
    const len = Math.hypot(dx, dy);
    if (len < 4) return;
    const angle = Math.atan2(dy, dx);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x1, y1);
    ctx.rotate(angle);
    const numChunks = Math.ceil(len / BEAM.chunk);
    const coreFull = Math.max(2, Math.round(BEAM.width * BEAM.corePct));
    for (let i = 0; i < numChunks; i++) {
      const x = i * BEAM.chunk;
      const phaseI = (i + scrollPhase * BEAM.period) % BEAM.period;
      const isBand = phaseI < BEAM.band;
      const j = BEAM.jitter ? Math.round(Math.sin(i*1.7 + scrollPhase*6)*BEAM.jitter) : 0;
      const t = numChunks > 1 ? i / (numChunks - 1) : 0;
      const scl = 1 - BEAM.taper * t;
      const wO = Math.max(1, BEAM.width * scl);
      const wC = Math.max(1, coreFull * scl);
      ctx.fillStyle = BEAM.color2;
      ctx.globalAlpha = BEAM.opacity * (isBand ? 0.85 : 0.45);
      ctx.fillRect(Math.round(x), Math.round(-wO/2 + j), BEAM.chunk, Math.round(wO));
      ctx.fillStyle = BEAM.color1;
      ctx.globalAlpha = BEAM.opacity * (isBand ? 1.0 : 0.7);
      ctx.fillRect(Math.round(x), Math.round(-wC/2 + j), BEAM.chunk, Math.round(wC));
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ── Main tick: physics, beam render, energy drain ──
  function tick(now) {
    if (done) return;
    if (PauseBus.paused) { lastTick = now; rafId = requestAnimationFrame(tick); return; }
    const dt = Math.min(0.05, (now - lastTick)/1000);
    lastTick = now;

    // Energy
    if (firing) {
      const rexMul = rexAboard() ? 0.8 : 1; // REX: tractor drains 20% slower
      energy -= ENERGY_DRAIN_PER_SEC * dt * rexMul;
      if (held) {
        const dx = mouse.x - lastMouseX, dy = mouse.y - lastMouseY;
        // mouse is in screen px; drain per GAME px so a bigger (scaled-up)
        // window doesn't burn energy faster for the same drag.
        const toGame = stage.offsetWidth / (stage.getBoundingClientRect().width || stage.offsetWidth);
        energy -= Math.hypot(dx, dy) * toGame * ENERGY_DRAIN_PER_PX * rexMul;
      }
      if (energy <= 0) {
        energy = 0;
        firing = false;
        if (held) { held.el.classList.remove('held'); held = null; }
        endRun('sal-depleted', 'TRACTOR BEAM<br>ENERGY DEPLETED');
        return;
      }
    }
    lastMouseX = mouse.x; lastMouseY = mouse.y;
    energyEl.style.width = ((energy/ENERGY_MAX)*100)+'%';
    energyEl.style.background = energy > 35 ? 'var(--info)'
                              : energy > 15 ? 'var(--orange)'
                              : 'var(--red)';
    energyEl.classList.toggle('low', energy < 25 && energy > 0);

    // Tractorables (items + hazards) — same physics, cursor-follow if held
    const r = stage.getBoundingClientRect();
    function updateTractorable(it) {
      if (!it.alive) return false;
      if (held === it) {
        it.fx = mouse.x / r.width;
        it.fy = mouse.y / r.height;
      } else {
        it.fx += it.vx * dt;
        it.fy += it.vy * dt;
        if (it.fx < -0.15 || it.fx > 1.15 || it.fy < -0.15 || it.fy > 1.15) {
          it.alive = false;
          it.el.remove();
          return true; // removed
        }
      }
      it.rot += it.vrot * dt;
      it.el.style.left = (it.fx*100)+'%';
      it.el.style.top  = (it.fy*100)+'%';
      it.el.style.setProperty('--rot', it.rot+'deg');
      return false;
    }
    for (const it of items)   updateTractorable(it);
    for (const h  of hazards) updateTractorable(h);

    // Foreground drifting asteroid clutter (tumbling, parallax layers)
    for (let i = asteroids.length - 1; i >= 0; i--) {
      const a = asteroids[i];
      a.fx += a.vx * dt;
      a.fy += a.vy * dt;
      a.rot += a.vrot * dt;
      if (a.fx < -0.18 || a.fx > 1.18 || a.fy < -0.18 || a.fy > 1.18) {
        a.el.remove();
        asteroids.splice(i, 1);
        continue;
      }
      a.el.style.left = (a.fx*100)+'%';
      a.el.style.top  = (a.fy*100)+'%';
      a.el.style.setProperty('--rot', a.rot+'deg');
    }

    // Beam render
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (firing) {
      const sx = canvas.width / r.width;
      const sy = canvas.height / r.height;
      const ex = EMIT.fx * canvas.width;
      const ey = EMIT.fy * canvas.height;
      scrollPhase = (scrollPhase + BEAM.scroll * 0.18) % 1000;
      const tx = mouse.x * sx, ty = mouse.y * sy;
      drawBeam(ex, ey, tx, ty);
      // Tip sparkle: only when actually grabbing something (chunky pixel
      // pulse at the cursor end of the beam, color2 outer + color1 core).
      if (held) {
        const t = performance.now();
        const pulse = Math.sin(t / 90) * 0.5 + 0.5;          // 0..1
        const outer = 5 + Math.round(pulse * 3);              // 5..8 px half-extent
        const inner = 2 + Math.round(pulse * 2);
        ctx.imageSmoothingEnabled = false;
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = BEAM.color2;
        ctx.fillRect(Math.round(tx - outer), Math.round(ty - outer), outer*2, outer*2);
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = BEAM.color1;
        ctx.fillRect(Math.round(tx - inner), Math.round(ty - inner), inner*2, inner*2);
        ctx.globalAlpha = 1;
      }
    }

    rafId = requestAnimationFrame(tick);
  }
  rafId = requestAnimationFrame(tick);

  // ── Run timer ──
  // When the hidden timer expires before energy runs out, show a
  // TIME'S UP flash (mirrors the energy-depleted flash treatment)
  // before transitioning to the end screen. Keeps the run-end beat
  // legible — players otherwise saw an instant cut to the haul card.
  const stopTimer = makeTimer('sal-tb', RUN_MS, null, () => {
    if (!done) endRun('sal-depleted timeup', "TIME'S UP");
  });

  // Energy depletion or the hidden timer: a full-screen alert for 2.5s,
  // then the end screen (the stage stays visible behind its overlay).
  function endRun(alertClass, msgHtml) {
    if (done) return;
    done = true;
    markMinigameEnding();
    cancelAnimationFrame(rafId);
    clearInterval(spawnIv);
    clearInterval(hazardSpawnIv);
    if (asteroidSpawnIv) clearInterval(asteroidSpawnIv);
    stopTimer();
    stage.style.cursor = '';
    const alert = document.createElement('div');
    alert.className = alertClass;
    alert.innerHTML = '<div class="sal-depleted-msg">' + msgHtml + '</div>';
    stage.appendChild(alert);
    setTimeout(() => {
      alert.remove();
      showEndScreen();
    }, 2500);
  }

  // ── End screen: lootbox reveal + run inventory ──
  function showEndScreen() {
    endEl.hidden = false;
    const inv = {};  // key → {sprite, label, count}

    function addToInv(key, sprite, label, n) {
      if (!inv[key]) inv[key] = {sprite, label, count:0};
      inv[key].count += n;
      renderInv();
    }
    function renderInv() {
      const target = endEl.querySelector('#sal-inv');
      if (!target) return;
      target.innerHTML = Object.entries(inv).map(([k,v]) => `
        <div class="sal-inv-tile" data-key="${k}">
          <img src="${v.sprite}" alt="">
          <span class="sal-inv-badge">${v.count}</span>
          <span class="sal-inv-lbl">${v.label}</span>
        </div>`).join('');
    }

    const tier = cargo.length >= 8 ? 'perfect'
               : cargo.length >= 4 ? 'good' : 'poor';
    const TIER_LABELS = {perfect:'EXCELLENT', good:'ADEQUATE', poor:'INSUFFICIENT'};
    const tierBadge = `<span class="sal-tier-badge tier-${tier}">${TIER_LABELS[tier]}</span>`;

    const haulHtml = cargo.map((c, i) => `
      <div class="sal-haul-tile" data-idx="${i}" data-cat="${c.cat}">
        <img src="${c.sprite}" alt="">
        ${c.sized ? `<span class="sal-haul-sz">${c.sz === '-' ? '?' : c.sz.toUpperCase()}</span>` : ''}
      </div>`).join('');

    if (JOB) { showJobEnd(tier, tierBadge, haulHtml); return; }
    endEl.innerHTML = `
      <div class="sal-end-card">
        <div class="sal-end-cols">
          <div class="sal-end-haul">
            <div class="sal-end-title">HAUL · ${cargo.length} ${cargo.length>0 ? tierBadge : ''}</div>
            <div class="sal-end-instr">${cargo.length===0 ? 'No items recovered.' : 'Click a tile to process'}</div>
            <div class="sal-haul-grid" id="sal-haul">${haulHtml}</div>
          </div>
          <div class="sal-end-inv">
            <div class="sal-end-title">INVENTORY</div>
            <div class="sal-end-instr">Items added as you process</div>
            <div class="sal-inv-grid" id="sal-inv"></div>
          </div>
        </div>
        <div class="sal-end-buttons">
          <button class="sal-end-btn" id="sal-close">CLOSE</button>
          <button class="sal-end-btn" id="sal-process-all"${cargo.length===0?' style="display:none"':''}>PROCESS ALL</button>
          <button class="sal-end-btn disabled" id="sal-view-inv">VIEW INVENTORY</button>
        </div>
      </div>
      <div class="sal-flash" id="sal-flash" hidden></div>
    `;

    const haulGrid = endEl.querySelector('#sal-haul');
    const flashEl  = endEl.querySelector('#sal-flash');
    const closeBtn = endEl.querySelector('#sal-close');
    const viewBtn  = endEl.querySelector('#sal-view-inv');
    const procAllBtn = endEl.querySelector('#sal-process-all');

    function showFlash(htmlContent, then) {
      flashEl.hidden = false;
      flashEl.innerHTML = `<div class="sal-flash-card">${htmlContent}<div class="sal-flash-hint">click to continue</div></div>`;
      const advance = () => {
        if (flashEl.hidden) return;
        flashEl.hidden = true;
        flashEl.removeEventListener('click', advance);
        clearTimeout(autoT);
        then();
      };
      flashEl.addEventListener('click', advance);
      const autoT = setTimeout(advance, 2200);
    }

    // Derelict hold items: fixed yields (DERELICT_PAY) — the same numbers
    // for the click-through reveal and the silent CLOSE / PROCESS ALL pass.
    function derelictYield(item) {
      const sizes = {s:'Small', m:'Medium', l:'Large'};
      if (item.cat === 'fuel') {
        const n = DERELICT_PAY.fuel[item.sz];
        return { adds:[['fuel', DD+'derelict_fuelcell_m.png', 'Fuel', n]],
                 html:`<img src="${item.sprite}" class="sal-flash-sprite"><div class="sal-flash-arrow">→ fuel tank</div><div class="sal-flash-label">${sizes[item.sz]} fuel cell · +${n} FUEL</div>` };
      }
      if (item.cat === 'food') {
        const n = DERELICT_PAY.food;
        return { adds:[['food', DD+'derelict_foodcan.png', 'Food', n]],
                 html:`<img src="${item.sprite}" class="sal-flash-sprite"><div class="sal-flash-arrow">→ galley</div><div class="sal-flash-label">Ration can · +${n} FOOD</div>` };
      }
      if (item.cat === 'component') {
        const c = DERELICT_PAY.component;
        return { adds:[['metal', MD+'metal.png', 'Metal', c.metal], ['exotic', MD+'exotic.png', 'Exotic', c.exotic]],
                 html:`<img src="${item.sprite}" class="sal-flash-sprite"><div class="sal-flash-arrow">→</div><div class="sal-flash-result"><img src="${MD}metal.png" class="sal-flash-resource"><span class="sal-flash-label">×${c.metal} metal</span></div><div class="sal-flash-result"><img src="${MD}exotic.png" class="sal-flash-resource"><span class="sal-flash-label">×${c.exotic} exotic</span></div>` };
      }
      if (item.cat === 'medkit') {
        return { adds:[['medkit', item.sprite, 'Medkit', 1]],
                 html:`<img src="${item.sprite}" class="sal-flash-sprite"><div class="sal-flash-arrow">→ the hold</div><div class="sal-flash-label">Medkit</div>` };
      }
      return null;
    }
    function processDerelict(item, finish) {
      const y = derelictYield(item);
      for (const a of y.adds) addToInv(a[0], a[1], a[2], a[3]);
      showFlash(y.html, finish);
    }

    function processTank(item, finish) {
      const sizes = {s:'Small', m:'Medium', l:'Large'};
      const key = 'tank_' + item.sz;
      addToInv(key, item.sprite, sizes[item.sz] + ' O₂ Tank', 1);
      showFlash(`
        <img src="${item.sprite}" class="sal-flash-sprite">
        <div class="sal-flash-arrow">→ air supply</div>
        <div class="sal-flash-label">${sizes[item.sz]} O₂ Tank</div>
      `, finish);
    }

    function processCircuit(item, finish) {
      const N = {s:1, m:2, l:3}[item.sz];
      const gold = Math.random() < 0.15;
      addToInv('metal', MD+'metal.png', 'Metal', N);
      if (gold) addToInv('gold', MD+'gold.png', 'Gold', 1);
      showFlash(`
        <img src="${item.sprite}" class="sal-flash-sprite">
        <div class="sal-flash-arrow">→</div>
        <div class="sal-flash-result"><img src="${MD}metal.png" class="sal-flash-resource"><span class="sal-flash-label">×${N} metal</span></div>
        ${gold ? `<div class="sal-flash-bonus"><img src="${MD}gold.png" class="sal-flash-resource" style="vertical-align:middle"> +5 GOLD!</div>` : ''}
      `, finish);
    }

    function processCoil(item, finish) {
      let metal, exotic;
      if (item.sz === 's')      { metal = 1; exotic = Math.random() < 0.5 ? 0 : 1; }
      else if (item.sz === 'm') { metal = 2; exotic = 1 + (Math.random() < 0.5 ? 0 : 1); }
      else                       { metal = 1; exotic = 2 + (Math.random() < 0.5 ? 0 : 1); }
      addToInv('metal', MD+'metal.png', 'Metal', metal);
      if (exotic > 0) addToInv('exotic', MD+'exotic.png', 'Exotic', exotic);
      const ex = exotic > 0
        ? `<div class="sal-flash-result"><img src="${MD}exotic.png" class="sal-flash-resource"><span class="sal-flash-label">×${exotic} exotic</span></div>` : '';
      showFlash(`
        <img src="${item.sprite}" class="sal-flash-sprite">
        <div class="sal-flash-arrow">→</div>
        <div class="sal-flash-result"><img src="${MD}metal.png" class="sal-flash-resource"><span class="sal-flash-label">×${metal} metal</span></div>
        ${ex}
      `, finish);
    }

    function processHazard(item, finish) {
      // Hazards convert to "Useless Scrap" — clutters inventory, can't sell.
      addToInv('useless_scrap', item.sprite, 'Useless Scrap', 1);
      showFlash(`
        <img src="${item.sprite}" class="sal-flash-sprite" style="filter:saturate(.5)">
        <div class="sal-flash-arrow">→</div>
        <div class="sal-flash-label" style="color:var(--orange)">Useless Scrap</div>
        <div class="sal-flash-hint" style="color:var(--muted);font-size:10px">badly rusted · can't be sold</div>
      `, finish);
    }

    function processCrate(item, tile, finish) {
      // Roll and bank the contents NOW — the shake/pop/flash sequence is
      // only a reveal, so closing mid-reveal keeps exactly these drops.
      const range = {s:[1,2], m:[3,4], l:[4,6]}[item.sz];
      const n = range[0] + Math.floor(Math.random() * (range[1]-range[0]+1));
      const pool = CRATE_POOLS[sceneType];
      const totalW = pool.reduce((s,p)=>s+p.w, 0);
      const drops = [];
      let upgradeRolled = false;
      for (let i = 0; i < n; i++) {
        if (!upgradeRolled && Math.random() < 0.10) {
          const id = UPGRADES[Math.floor(Math.random()*UPGRADES.length)];
          drops.push({kind:'upgrade', id});
          upgradeRolled = true;
        } else {
          let r = Math.random() * totalW;
          for (const p of pool) { if ((r -= p.w) <= 0) { drops.push({kind:'resource', id:p.r}); break; } }
        }
      }
      for (const d of drops) {
        if (d.kind === 'upgrade') addToInv(d.id, UD+d.id+'.png', d.id.replace(/_/g,' '), 1);
        else addToInv(d.id, MD+d.id+'.png', d.id, 1);
      }
      tile.classList.add('shaking');
      setTimeout(() => {
        tile.classList.add('popped');
        setTimeout(() => {
          // Show drops sequentially.
          let i = 0;
          (function next(){
            if (i >= drops.length) { finish(); return; }
            const d = drops[i++];
            if (d.kind === 'upgrade') {
              showFlash(`
                <div class="sal-flash-rare">★ SHIP UPGRADE ★</div>
                <img src="${UD}${d.id}.png" class="sal-flash-sprite">
                <div class="sal-flash-label">${d.id.replace(/_/g,' ')}</div>
              `, next);
            } else {
              showFlash(`
                <img src="${MD}${d.id}.png" class="sal-flash-resource sal-flash-resource-big">
                <div class="sal-flash-label">×1 ${d.id}</div>
              `, next);
            }
          })();
        }, 240);
      }, 380);
    }

    haulGrid.querySelectorAll('.sal-haul-tile').forEach(tile => {
      tile.addEventListener('click', () => {
        // 'claimed' at click: the loot is banked immediately, so the
        // silent CLOSE/PROCESS ALL pass must never pay this tile again.
        if (tile.classList.contains('processed') || tile.classList.contains('claimed')) return;
        tile.classList.add('claimed');
        const idx = +tile.dataset.idx;
        const item = cargo[idx];
        const finish = () => {
          tile.classList.add('processed');
          checkAllProcessed();
        };
        if      (item.cat === 'tank')    processTank(item, finish);
        else if (item.cat === 'circuit') processCircuit(item, finish);
        else if (item.cat === 'coil')    processCoil(item, finish);
        else if (item.cat === 'crate')   processCrate(item, tile, finish);
        else if (item.cat === 'hazard')  processHazard(item, finish);
        else                             processDerelict(item, finish); // fuel / food / component / medkit
      });
    });

    function checkAllProcessed() {
      const allProcessed = haulGrid.querySelectorAll('.sal-haul-tile').length ===
                           haulGrid.querySelectorAll('.sal-haul-tile.processed').length;
      if (allProcessed) viewBtn.classList.remove('disabled');
    }
    if (cargo.length === 0) viewBtn.classList.remove('disabled');

    // Silent batch-process every unprocessed haul tile — no flashes, just
    // resolve each item's loot and dump straight into inventory. Crates use
    // the same roll logic as the click-through path.
    function processAllSilent() {
      const tiles = haulGrid.querySelectorAll('.sal-haul-tile:not(.processed):not(.claimed)');
      tiles.forEach(tile => {
        const idx = +tile.dataset.idx;
        const item = cargo[idx];
        if (item.cat === 'tank') {
          const sizes = {s:'Small', m:'Medium', l:'Large'};
          addToInv('tank_'+item.sz, item.sprite, sizes[item.sz]+' O₂ Tank', 1);
        } else if (item.cat === 'circuit') {
          const N = {s:1, m:2, l:3}[item.sz];
          addToInv('metal', MD+'metal.png', 'Metal', N);
          if (Math.random() < 0.15) addToInv('gold', MD+'gold.png', 'Gold', 1);
        } else if (item.cat === 'coil') {
          let metal, exotic;
          if (item.sz === 's')      { metal = 1; exotic = Math.random() < 0.5 ? 0 : 1; }
          else if (item.sz === 'm') { metal = 2; exotic = 1 + (Math.random() < 0.5 ? 0 : 1); }
          else                       { metal = 1; exotic = 2 + (Math.random() < 0.5 ? 0 : 1); }
          addToInv('metal', MD+'metal.png', 'Metal', metal);
          if (exotic > 0) addToInv('exotic', MD+'exotic.png', 'Exotic', exotic);
        } else if (item.cat === 'hazard') {
          addToInv('useless_scrap', item.sprite, 'Useless Scrap', 1);
        } else if (derelictYield(item)) {
          for (const a of derelictYield(item).adds) addToInv(a[0], a[1], a[2], a[3]);
        } else if (item.cat === 'crate') {
          const range = {s:[1,2], m:[3,4], l:[4,6]}[item.sz];
          const n = range[0] + Math.floor(Math.random() * (range[1]-range[0]+1));
          const pool = CRATE_POOLS[sceneType];
          const totalW = pool.reduce((s,p)=>s+p.w, 0);
          let upgradeRolled = false;
          for (let i = 0; i < n; i++) {
            if (!upgradeRolled && Math.random() < 0.10) {
              const id = UPGRADES[Math.floor(Math.random()*UPGRADES.length)];
              addToInv(id, UD+id+'.png', id.replace(/_/g,' '), 1);
              upgradeRolled = true;
            } else {
              let r = Math.random() * totalW;
              for (const p of pool) {
                if ((r -= p.w) <= 0) { addToInv(p.r, MD+p.r+'.png', p.r, 1); break; }
              }
            }
          }
        }
        tile.classList.add('processed');
      });
      checkAllProcessed();
    }
    procAllBtn.addEventListener('click', () => {
      processAllSilent();
      procAllBtn.style.display = 'none';
    });

    closeBtn.addEventListener('click', () => {
      if (closeBtn._closed) return; // one hand-off, however many clicks
      closeBtn._closed = true;
      // Per-tile click-through is purely a reveal flourish; CLOSE silently
      // processes whatever the player left untouched so nothing is ever
      // lost just because they didn't click each tile.
      processAllSilent();
      const tier = cargo.length >= 8 ? 'perfect'
                 : cargo.length >= 4 ? 'good'
                 : 'poor';
      // Hand the real haul to the caller — the card showed loot the
      // engine never granted (it paid a fixed amount per tier instead).
      onResult(tier, { salvage: Object.fromEntries(Object.entries(inv).map(([k, v]) => [k, v.count])) });
    });
    // ✕ pressed during the TIME'S UP / ENERGY DEPLETED beat: close
    // through the haul card (everything banked) now that it's here.
    if (closeAfterResult) setTimeout(() => closeBtn.click(), 0); // showResult then closes through rbquit
    viewBtn.addEventListener('click', () => {
      if (viewBtn.classList.contains('disabled')) return;
      // Routes to the real Cargo Hold: the run
      // closes exactly like CLOSE — haul banked, result card, the caller
      // grants it — then the hold opens with the haul in it.
      openCargoAfterClose = true;
      closeAfterResult = true;
      closeBtn.click();
    });
  }

  // An event's job: the load decides the result, and the card shows what
  // that result pays (opts.tierRewards) — the haul tiles are only the
  // count. CLOSE hands back the tier alone (no salvage payload: the event
  // grants its own reward). One CLOSE, as the free-play card.
  function showJobEnd(tier, tierBadge, haulHtml) {
    const list = tierRewardList(opts, tier);
    const reward = list
      ? (list.length ? list.map(t => `<div class="sal-job-line">${escapeHTML(t)}</div>`).join('') : '<div class="sal-job-line none">Nothing this time.</div>')
      : '<div class="sal-job-line none">The job\'s outcome follows.</div>';
    endEl.innerHTML = `
      <div class="sal-end-card sal-job">
        <div class="sal-end-cols">
          <div class="sal-end-haul">
            <div class="sal-end-title">HAUL · ${cargo.length} ${cargo.length>0 ? tierBadge : ''}</div>
            <div class="sal-end-instr">${cargo.length===0 ? 'No items brought in.' : 'Brought in for the job · 8+ best, 4+ fair'}</div>
            <div class="sal-haul-grid" id="sal-haul">${haulHtml}</div>
          </div>
          <div class="sal-end-inv">
            <div class="sal-end-title">JOB RESULT ${tierBadge}</div>
            <div class="sal-end-instr">What the job pays</div>
            <div class="sal-job-reward" id="sal-job-reward">${reward}</div>
          </div>
        </div>
        <div class="sal-end-buttons">
          <button class="sal-end-btn" id="sal-close">CLOSE</button>
        </div>
      </div>`;
    const closeBtn = endEl.querySelector('#sal-close');
    closeBtn.addEventListener('click', () => {
      if (closeBtn._closed) return;
      closeBtn._closed = true;
      onResult(tier, null);
    });
    if (closeAfterResult) setTimeout(() => closeBtn.click(), 0);
  }

  // ── Cleanup ──
  return () => {
    done = true;
    cancelAnimationFrame(rafId);
    clearInterval(spawnIv);
    clearInterval(hazardSpawnIv);
    if (asteroidSpawnIv) clearInterval(asteroidSpawnIv);
    stopTimer();
    window.removeEventListener('mouseup', release);
    stage.style.cursor = '';
  };
}

  // Load-time teardown (index.html teardownLiveUI): close without firing
  // the caller's callback — the run it belonged to is being replaced.
  function abortMinigame() {
    onMinigameDone = null;
    if (document.getElementById('overlay-minigames').classList.contains('active')) closeMinigameOverlay();
  }

  Object.assign(window, {
    // engine API
    openMinigame, abortMinigame,
    // test hooks: tools/tests drive and read these through page.evaluate
    SALVAGE_DERELICT, showResult, FORAGE_BG_REGISTRY,
  });
})();

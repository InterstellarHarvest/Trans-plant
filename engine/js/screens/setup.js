'use strict';
/* ────────────────────────────────────────────────────────────────
   SETUP SCREEN — migrated from resources/demo-setup.html.
   Dev-controls panel and viewport-scaling harness stripped. The
   Launch button (final step's Next) now calls the engine's
   applySetupToState(sel) instead of showing an alert.
   ──────────────────────────────────────────────────────────────── */
(function () {
  const $ = id => document.getElementById(id);

  // ── Starfield backdrop ───────────────────────────────────────
  const starCtx = $('setup-stars').getContext('2d');
  const stars = [];
  for (let i = 0; i < 70; i++) {
    stars.push({ x: Math.random() * 960, y: Math.random() * 640, r: Math.random() * 1 + 0.2, phase: Math.random() * Math.PI * 2, drift: Math.random() * 0.03 + 0.01 });
  }
  function drawStars() {
    if (PauseBus.paused) { requestAnimationFrame(drawStars); return; }
    starCtx.clearRect(0, 0, 960, 640);
    const now = performance.now() / 1000;
    for (const s of stars) {
      s.x += s.drift;
      if (s.x > 960) { s.x = 0; s.y = Math.random() * 640; }
      starCtx.globalAlpha = 0.25 + Math.sin(now * 1.2 + s.phase) * 0.2;
      starCtx.fillStyle = '#8899aa';
      starCtx.beginPath(); starCtx.arc(s.x, s.y, s.r, 0, Math.PI * 2); starCtx.fill();
    }
    starCtx.globalAlpha = 1;
    requestAnimationFrame(drawStars);
  }
  drawStars();

  // ── Setup data ─────────────────────────────────────────────────
  const STEPS = [
    {
      key: 'trail', label: 'Choose Your Trail', cat: 'Destination',
      desc: 'How far are you willing to go? Shorter trails are safer. Longer trails have more opportunities — and more things that can go wrong.',
      options: [
        { id: 'lunar',        icon: '\u{1F319}', sprite: 'sprites/interface/trails/moon.png',         name: 'Lunar Trail',        desc: 'Three months. Established corridors. You\'ll be fine. Probably.',        stat: '10 nodes · 1 fork · Easy',   flavor: 'The sensible choice. You will not tell stories about this trip.' },
        { id: 'mars',         icon: '\u{1F534}', sprite: 'sprites/interface/trails/mars.png',         name: 'Mars Trail',         desc: 'Eight months. Some charted territory. Some not.',                        stat: '13 nodes · 2 forks · Medium', flavor: 'The map has helpful annotations like “here be problems.”' },
        { id: 'interstellar', icon: '✦',    sprite: 'sprites/interface/trails/interstellar.png', name: 'Interstellar Trail', desc: 'Fourteen months. Charts stop being useful around month six.',            stat: '15 nodes · 3 forks · Hard',   flavor: 'The destination is called Far Garden. It was named by an optimist.' }
      ]
    },
    {
      key: 'ai', label: 'Choose Your AI', cat: 'Ship Computer',
      desc: 'Your AI companion narrates the journey, comments on every decision, and has a passive effect on gameplay. You will hear from them a lot.',
      options: [
        { id: 'aria', icon: '☀',    sprite: 'sprites/interface/AI/aria.png', name: 'ARIA', desc: 'Relentlessly positive. Factually questionable.', stat: 'Passive: Morale +1', flavor: 'ARIA believes in you. ARIA believes in everything.' },
        { id: 'marv', icon: '\u{1F311}', sprite: 'sprites/interface/AI/marv.png', name: 'MARV', desc: 'Clinically depressed. 400% smarter than everyone.', stat: 'Passive: Reveals hidden details', flavor: 'MARV has already calculated your odds.' },
        { id: 'rex',  icon: '⚔',    sprite: 'sprites/interface/AI/rex.png',  name: 'REX', desc: 'Retired military. Everything is a threat.', stat: 'Passive: Combat bonus', flavor: 'REX was decommissioned for "excessive initiative."' },
        { id: 'chip', icon: '\u{1F4B0}', sprite: 'sprites/interface/AI/chip.png', name: 'CHIP', desc: 'Corporate-issued. Full of Terms of Service.', stat: 'Passive: Station prices -15%', flavor: 'CHIP was free with purchase of the ship.' },
        { id: 'ajoy', icon: '\u{1F60F}', sprite: 'sprites/interface/AI/ajoy.png', name: 'AJOY', desc: 'Passive-aggressive. Backseat driver. A joy.', stat: 'Passive: Shows what you missed', flavor: 'AJOY will help you make better decisions. AJOY will make sure you know about it.' }
      ]
    },
    {
      key: 'captain', label: 'Choose Your Background', cat: 'Captain',
      desc: 'What did you study? Your background gives you a discounted version of a crew specialist\'s skills.',
      options: [
        { id: 'botanist',      icon: '\u{1F33F}', sprite: 'sprites/interface/careers/botanist.png',      name: 'Botanist',      desc: 'You know plants. Not as well as Dr. Osei, but enough.',                   stat: 'Crop care +7%',       flavor: 'Your parents asked what you\'d do with that degree. This.' },
        { id: 'engineer',      icon: '\u{1F527}', sprite: 'sprites/interface/careers/engineer.png',      name: 'Engineer',      desc: 'You can fix things. Not as fast as Kazuki.',                              stat: 'Fab wear -10%',       flavor: 'The ship makes sounds it shouldn\'t. You recognize most of them.' },
        { id: 'medic',         icon: '\u{1F48A}', sprite: 'sprites/interface/careers/medic.png',         name: 'Medic',         desc: 'You passed the exam. You are not a doctor.',                              stat: '15% lethal→injury', flavor: 'The residency was... there were circumstances.' },
        { id: 'pilot',         icon: '\u{1F680}', sprite: 'sprites/interface/careers/pilot.png',         name: 'Pilot',         desc: 'You can fly. Slightly better than expected.',                             stat: 'Fuel -5%',            flavor: 'You are statistically correct 68% of the time.' },
        { id: 'chef',          icon: '\u{1F373}', sprite: 'sprites/interface/careers/chef.png',          name: 'Chef',          desc: 'You can make algae taste like something other than regret.',              stat: 'Food -7%',            flavor: 'You know 47 ways to prepare algae. Forty-six are bad.' },
        { id: 'xenobiologist', icon: '\u{1F9EC}', sprite: 'sprites/interface/careers/xenobiologist.png', name: 'Xenobiologist', desc: 'You studied aliens. You have never met one.',                             stat: 'Anomaly safer',       flavor: 'Your thesis was theoretical. Everything is about to become very applied.' },
        { id: 'diplomat',      icon: '\u{1F91D}', sprite: 'sprites/interface/careers/diplomat.png',      name: 'Diplomat',      desc: 'Very good at making people feel heard while doing nothing.',              stat: 'Credits +15',         flavor: 'Your crew does not find this reassuring.' },
        { id: 'merchant',      icon: '\u{1F4CA}', sprite: 'sprites/interface/careers/merchant.png',      name: 'Merchant',      desc: 'You ran a business.',                                                     stat: 'Prices -10%',         flavor: 'You are going to run this mission like a business.' },
        { id: 'academic',      icon: '\u{1F4DA}', sprite: 'sprites/interface/careers/academic.png',      name: 'Academic',      desc: 'You have a PhD. In what is not immediately relevant.',                    stat: 'Research options',    flavor: 'Your grant funding was cut. You are in space. These events are related.' },
        { id: 'veteran',       icon: '\u{1F396}', sprite: 'sprites/interface/careers/veteran.png',       name: 'Veteran',       desc: 'You served. Where is classified.',                                        stat: 'Combat screen-clear', flavor: 'You don\'t talk about it.' }
      ]
    },
    {
      key: 'crew', label: 'Choose Your Crew', cat: 'Crew (0–2)',
      desc: 'Pick up to two crew members. Each has passive skills, active skills, and narrative unlocks. Or take none and fly solo.',
      multi: true, max: 2,
      options: [
        { id: 'botanist',      icon: '\u{1F33F}', crewId: 'osei',     name: 'Dr. Osei — Botanist', desc: 'Knows every plant. Has opinions about all of them.', stat: 'Crop care · Greenhouse Protocol' },
        { id: 'engineer',      icon: '\u{1F527}', crewId: 'kazuki',   name: 'Kazuki — Engineer', desc: 'Fixes things. Eats twice as much.', stat: 'Hull repair · Emergency Patch' },
        { id: 'medic',         icon: '\u{1F48A}', crewId: 'vasquez',  name: 'Dr. Vasquez — Medic', desc: 'Chronically anxious. Excellent at their job.', stat: 'Crew health · Treatment' },
        { id: 'pilot',         icon: '\u{1F680}', crewId: 'reeves',   name: 'Reeves — Pilot', desc: 'Overconfident. Correct 78% of the time.', stat: 'Fuel · Push Engines' },
        { id: 'chef',          icon: '\u{1F373}', crewId: 'reyes',    name: 'Reyes — Chef', desc: 'The most important person on the ship.', stat: 'Food · Special Meal' },
        { id: 'xenobiologist', icon: '\u{1F9EC}', crewId: 'tanaka',   name: 'Dr. Tanaka — Xenobiologist', desc: 'Deeply excited about everything that could kill them.', stat: 'Alien analysis' },
        { id: 'diplomat',      icon: '\u{1F91D}', crewId: 'hargrove', name: 'Hargrove — Diplomat', desc: 'Useless except in the one specific situation.', stat: 'Negotiation' }
      ]
    },
    {
      key: 'crop', label: 'Choose Your Crop', cat: 'The Mission',
      desc: 'This is what you\'re keeping alive. Different crops need different resources, resist different threats.',
      options: [
        { id: 'wheat',        icon: '\u{1F33E}', sprite: 'sprites/interface/crops/wheat.png',    name: 'Wheat', desc: 'Reliable. Predictable. Monoculture-vulnerable.', stat: 'Food: high', flavor: 'You will never feel clever for picking wheat, but you probably won\'t regret it.' },
        { id: 'tomato',       icon: '\u{1F345}', sprite: 'sprites/interface/crops/tomato.png',   name: 'Tomatoes', desc: 'High maintenance. High reward. High drama.', stat: 'Food: highest · Morale +2', flavor: 'They will demand your attention and you will give it to them.' },
        { id: 'sweet_potato', icon: '\u{1F360}', sprite: 'sprites/interface/crops/potato.png',   name: 'Sweet Potatoes', desc: 'NASA\'s top pick.', stat: 'Hardiest', flavor: 'The ship computer approves of this choice. It will mention this.' },
        { id: 'soybean',      icon: '\u{1FAD8}', sprite: 'sprites/interface/crops/soybeans.png', name: 'Soybeans', desc: 'Fixes nitrogen. Resists contamination.', stat: 'Self-sustaining', flavor: 'The engineer of crops.' },
        { id: 'zinnia',       icon: '\u{1F338}', sprite: 'sprites/interface/crops/zinnia.png',   name: 'Zinnias', desc: 'No food value. High morale. Hard mode.', stat: 'Morale +8', flavor: 'The bravest or stupidest choice you can make.' }
      ]
    },
    {
      key: 'ship', label: 'Name Your Ship', cat: 'The Ship',
      desc: 'Every ship needs a name. This one is yours. Name it well. Or don\'t. It doesn\'t know.',
      nameInput: true
    }
  ];

  let step = 0;
  const sel = { trail: null, ai: null, captain: null, crew: [], crop: null, ship: '' };

  const TYPE_SPEED_MS = 25;
  let twTimers = [];
  function typewriteDescription(text) {
    twTimers.forEach(clearTimeout);
    twTimers = [];
    const el = $('setup-description');
    el.innerHTML = '';
    const span = document.createElement('span');
    const cursor = document.createElement('span');
    cursor.className = 'tw-cursor';
    el.appendChild(span);
    el.appendChild(cursor);
    let i = 0;
    (function tick() {
      if (i < text.length) {
        span.textContent += text[i++];
        twTimers.push(setTimeout(tick, TYPE_SPEED_MS));
      } else {
        cursor.remove();
      }
    })();
  }

  function buildPips() {
    const wrap = $('setup-progress');
    wrap.innerHTML = '';
    for (let i = 0; i < STEPS.length; i++) {
      if (i > 0) {
        const line = document.createElement('div');
        line.className = 'pip-line' + (i <= step ? ' done' : '');
        wrap.appendChild(line);
      }
      const pip = document.createElement('div');
      pip.className = 'progress-pip' + (i < step ? ' done' : '') + (i === step ? ' active' : '');
      wrap.appendChild(pip);
    }
  }

  let typedStep = -1;
  const scrollMemory = {};
  function saveScroll() {
    scrollMemory[step] = { left: $('setup-left').scrollTop, right: $('setup-right').scrollTop };
  }

  function render() {
    const s = STEPS[step];
    const freshStep = typedStep !== step;
    const mem = scrollMemory[step];
    const restoreLeft  = freshStep ? (mem ? mem.left  : 0) : $('setup-left').scrollTop;
    const restoreRight = freshStep ? (mem ? mem.right : 0) : $('setup-right').scrollTop;

    $('setup-step-label').textContent = s.label;
    $('setup-category-title').textContent = s.cat;
    if (typedStep !== step) {
      typedStep = step;
      typewriteDescription(s.desc);
    }
    $('setup-flavor').textContent = '';
    $('btn-back').classList.remove('disabled'); // step 0 exits to the title menu
    $('btn-back').innerHTML = step === 0 ? '<span class="chevron">◀</span> Menu' : '<span class="chevron">◀</span> Back';

    const nextBtn = $('btn-next');
    const needsChoice = !s.multi && !s.nameInput;
    const blocked = needsChoice && !sel[s.key];
    if (step === STEPS.length - 1) {
      nextBtn.className = 'panel-btn accent-teal';
      nextBtn.innerHTML = 'Launch <span class="chevron">▶</span>';
    } else {
      nextBtn.className = 'panel-btn accent-gold';
      nextBtn.innerHTML = 'Next <span class="chevron">▶</span>';
    }
    if (blocked) nextBtn.className += ' disabled';
    $('crew-count-badge').textContent = s.key === 'crew' ? (sel.crew.length + '/2 selected') : '';
    if (freshStep) buildPips();

    const right = $('setup-right');
    right.innerHTML = '';

    if (s.nameInput) {
      right.innerHTML =
        '<div id="ship-name-wrap">' +
        '<img src="sprites/ships/default.png" alt="" class="ship-bob" style="display:block; margin-bottom:8px; image-rendering:pixelated; image-rendering:crisp-edges;">' +
        '<div style="font-family:\'Press Start 2P\'; font-size:8px; color:#5a7a6a; letter-spacing:2px; text-transform:uppercase; margin-bottom:10px">Ship Name</div>' +
        '<input type="text" id="ship-name-input" value="' + sel.ship + '" placeholder="The Verdant Ark" maxlength="30">' +
        '</div>';
      $('ship-name-input').addEventListener('input', e => { sel.ship = e.target.value; });
      $('setup-flavor').textContent = 'It doesn\'t know its name. It doesn\'t need to. You do.';
      return;
    }

    for (const opt of s.options) {
      const isMulti = s.multi;
      const isSel = isMulti ? sel[s.key].includes(opt.id) : sel[s.key] === opt.id;

      const card = document.createElement('div');
      card.className = 'sel-card' + (isSel ? ' selected' : '') + (isMulti ? ' crew-card' : '');
      const iconHtml = opt.crewId
        ? '<div class="card-icon has-sprite" style="' + crewIconCss(opt.crewId, 'var(--card-icon-size)') + '">' + opt.icon + '</div>'
        : opt.sprite
          ? '<div class="card-icon has-sprite" style="background-image: url(\'' + opt.sprite + '\')">' + opt.icon + '</div>'
          : '<div class="card-icon">' + opt.icon + '</div>';
      card.innerHTML =
        '<div class="card-led"></div>' +
        iconHtml +
        '<div class="card-info">' +
          '<div class="card-name">' + opt.name + '</div>' +
          '<div class="card-desc">' + opt.desc + '</div>' +
          (opt.stat ? '<div class="card-stat">' + opt.stat + '</div>' : '') +
        '</div>';
      card.addEventListener('click', () => {
        if (isMulti) {
          const idx = sel[s.key].indexOf(opt.id);
          if (idx >= 0) sel[s.key].splice(idx, 1);
          else if (sel[s.key].length < s.max) sel[s.key].push(opt.id);
        } else {
          sel[s.key] = opt.id;
        }
        $('setup-flavor').textContent = opt.flavor || '';
        render();
      });
      right.appendChild(card);
    }

    if (!s.multi && sel[s.key]) {
      const found = s.options.find(o => o.id === sel[s.key]);
      if (found) $('setup-flavor').textContent = found.flavor || '';
    }

    requestAnimationFrame(() => {
      $('setup-left').scrollTop  = restoreLeft;
      $('setup-right').scrollTop = restoreRight;
    });
  }

  function nextStep() {
    const cur = STEPS[step];
    // Hard gate (bug fix): the render pass dims the button, but the
    // gate must live HERE — a click with nothing selected would send
    // undefined into applySetupToState/generateMap and wreck the run.
    if (!cur.multi && !cur.nameInput && !sel[cur.key]) {
      const btn = $('btn-next');
      btn.classList.remove('shake'); void btn.offsetWidth; btn.classList.add('shake');
      $('setup-flavor').textContent = 'Pick one. The void will wait.';
      return;
    }
    if (cur.key === 'crew' && sel.crew.length < 2) {
      const msg = sel.crew.length === 0
        ? '⚠ No crew selected.\n\nYou will be flying solo. Are you sure?'
        : '⚠ Only ' + sel.crew.length + ' of 2 crew selected.\n\nProceed with an incomplete crew?';
      if (!confirm(msg)) return;
    }
    if (step < STEPS.length - 1) { saveScroll(); step++; render(); }
    else { applySetupToState(sel); }
  }
  function prevStep() {
    if (step > 0) { saveScroll(); step--; render(); }
    // Step 0: BACK returns to the main menu (title). Selections keep —
    // coming back resumes the wizard where it was.
    else if (typeof showScreen === 'function') showScreen('screen-title');
  }

  $('btn-back').addEventListener('click', prevStep);
  $('btn-next').addEventListener('click', nextStep);

  render();
})();

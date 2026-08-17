'use strict';
/* ────────────────────────────────────────────────────────────────
   TITLE SCREEN — migrated from resources/demo-title.html.
   Dev-controls panel and viewport-scaling harness stripped; visual
   tuning values below are the demo's own DEFAULTS baked in as
   constants. btn-new is wired to startNewGame() (engine-level,
   defined in index.html's main script).
   ──────────────────────────────────────────────────────────────── */
(function () {
  const $ = id => document.getElementById(id);

  const TAGLINES = [
    { text: 'Earth is dying.', color: '#7a8a7a' },
    { text: 'You have a ship, a crop, and a plan.', color: '#7a8a7a' },
    { text: 'The plan is not good.', color: '#4a5a4a' },
  ];
  const TAG_SIZE_PX = 25;
  const TYPE_SPEED_MS = 50;
  const LINE_PAUSE_MS = 800;

  // ── Parallax starfield ───────────────────────────────────────
  const farCvs = $('title-stars-far'), farCtx = farCvs.getContext('2d');
  const nearCvs = $('title-stars-near'), nearCtx = nearCvs.getContext('2d');
  let farStars = [], nearStars = [];
  const cfg = {
    far: { count: 120, dx: 8, dy: 2, color: '#8899aa', twinkle: 45 },
    near: { count: 18, dx: 22, color: '#c8d0d8' },
  };

  function makeLayer(arr, count, type) {
    arr.length = 0;
    for (let i = 0; i < count; i++) {
      arr.push({
        x: Math.random() * 960, y: Math.random() * 640,
        r: type === 'far' ? Math.random() * 1.2 + 0.3 : Math.random() * 1.6 + 0.8,
        phase: Math.random() * Math.PI * 2,
        drift: Math.random() * 0.6 + 0.4,
      });
    }
  }
  makeLayer(farStars, cfg.far.count, 'far');
  makeLayer(nearStars, cfg.near.count, 'near');

  function drawFrame() {
    if (PauseBus.paused) { requestAnimationFrame(drawFrame); return; }
    const now = performance.now() / 1000;

    farCtx.clearRect(0, 0, 960, 640);
    const fTwk = cfg.far.twinkle / 100;
    for (const s of farStars) {
      s.x += (cfg.far.dx / 100) * s.drift;
      s.y += (cfg.far.dy / 100) * s.drift;
      if (s.x > 960) { s.x = 0; s.y = Math.random() * 640; }
      if (s.x < 0) { s.x = 960; s.y = Math.random() * 640; }
      if (s.y > 640) s.y = 0; if (s.y < 0) s.y = 640;
      farCtx.globalAlpha = 0.35 + (1 - fTwk) * 0.5 + Math.sin(now * 1.5 + s.phase) * fTwk * 0.35;
      farCtx.fillStyle = cfg.far.color;
      farCtx.beginPath(); farCtx.arc(s.x, s.y, s.r, 0, Math.PI * 2); farCtx.fill();
    }
    farCtx.globalAlpha = 1;

    nearCtx.clearRect(0, 0, 960, 640);
    for (const s of nearStars) {
      s.x += (cfg.near.dx / 100) * s.drift;
      if (s.x > 960) { s.x = -2; s.y = Math.random() * 640; }
      if (s.x < -2) { s.x = 960; s.y = Math.random() * 640; }
      nearCtx.globalAlpha = 0.6 + Math.sin(now * 0.8 + s.phase) * 0.2;
      nearCtx.fillStyle = cfg.near.color;
      nearCtx.beginPath(); nearCtx.arc(s.x, s.y, s.r, 0, Math.PI * 2); nearCtx.fill();
    }
    nearCtx.globalAlpha = 1;
    requestAnimationFrame(drawFrame);
  }
  drawFrame();

  // ── Typewriter ───────────────────────────────────────────────
  let twTimers = [];
  function typewrite(el, text, speed, color, onDone) {
    el.innerHTML = '';
    el.style.color = color;
    el.style.fontSize = TAG_SIZE_PX + 'px';
    const span = document.createElement('span');
    const cursor = document.createElement('span');
    cursor.className = 'tw-cursor';
    cursor.style.background = color;
    el.appendChild(span);
    el.appendChild(cursor);
    let i = 0;
    (function tick() {
      if (i < text.length) {
        span.textContent += text[i]; i++;
        twTimers.push(setTimeout(tick, speed));
      } else {
        cursor.style.visibility = 'hidden';
        if (onDone) onDone();
      }
    })();
  }

  function playIntro() {
    twTimers.forEach(t => clearTimeout(t));
    twTimers = [];
    $('title-buttons').classList.remove('visible');
    $('title-tagline').innerHTML = '';
    $('title-tagline-2').innerHTML = '';
    $('title-tagline-3').innerHTML = '';

    setTimeout(() => {
      typewrite($('title-tagline'), TAGLINES[0].text, TYPE_SPEED_MS, TAGLINES[0].color, () => {
        setTimeout(() => {
          typewrite($('title-tagline-2'), TAGLINES[1].text, TYPE_SPEED_MS, TAGLINES[1].color, () => {
            setTimeout(() => {
              typewrite($('title-tagline-3'), TAGLINES[2].text, TYPE_SPEED_MS + 10, TAGLINES[2].color, () => {
                setTimeout(() => $('title-buttons').classList.add('visible'), 400);
              });
            }, LINE_PAUSE_MS);
          });
        }, LINE_PAUSE_MS);
      });
    }, 400);
  }

  // ── Poster dismiss ───────────────────────────────────────────
  let posterDismissed = false;
  function dismissPoster() {
    if (posterDismissed) return;
    posterDismissed = true;
    $('screen-title').classList.add('poster-dismissed');
    setTimeout(playIntro, 600);
  }
  function onSceneInput(e) {
    if (e && e.target && e.target.closest && e.target.closest('.retro-btn')) return;
    if (!posterDismissed) dismissPoster();
  }
  $('screen-title').addEventListener('click', onSceneInput);
  $('screen-title').addEventListener('keydown', onSceneInput);

  // Only listen for the "any key" dismiss while the title screen is
  // actually the active screen, so keystrokes on later screens (e.g.
  // typing a ship name) don't get intercepted by this handler.
  window.addEventListener('keydown', e => {
    if (!$('screen-title').classList.contains('active')) return;
    onSceneInput(e);
  });

  $('btn-new').addEventListener('click', () => startNewGame());
  // Continue — designed into the title demo, live now that run
  // persistence exists (engine-level saveRun/loadRun in index.html).
  // Enabled state is refreshed each time the buttons become visible.
  function refreshContinue() {
    const has = typeof hasSave === 'function' && hasSave();
    const btn = $('btn-continue');
    btn.classList.toggle('disabled', !has);
    const led = btn.querySelector('.btn-led');
    if (led) led.style.background = has ? '#5fa85f' : '#333';
  }
  $('btn-continue').addEventListener('click', () => {
    if (typeof hasSave !== 'function' || !hasSave()) return;
    loadRun();
  });
  const _buttonsEl = $('title-buttons');
  new MutationObserver(() => {
    if (_buttonsEl.classList.contains('visible')) refreshContinue();
  }).observe(_buttonsEl, { attributes: true, attributeFilter: ['class'] });
  refreshContinue();
})();

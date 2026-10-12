#!/usr/bin/env node
'use strict';
/* Code lint (the engine and the test batteries; lint_modules.js covers the
 * data). Each rule is a habit that once let two copies of something drift:
 *   - every battery uses the shared URL default, so run_all.sh (and either
 *     browser's server) reaches it: an agent port left behind (8184, 8225)
 *     ran a battery against a dead server or another tree.
 *   - every class/id selector in the engine's CSS is used by the engine
 *     (or, for shared.css, by a page that links it): screen CSS copied out of
 *     the demos kept the demos' dev-harness rules long after the engine
 *     stopped drawing them.
 *   - every "ruling N" a comment cites is in docs/RULINGS.md.
 *   - comments carry no process tags (batch/hunt/audit names): they say
 *     why, not which pass wrote them.
 *   - the game's thresholds live once, in index.html's THRESHOLDS script:
 *     a bare resource / morale / HP / fab-wear line, a crew cap of 2, a
 *     crops.json fallback or a second copy of the wounded multiplier or
 *     the crew water tiers is an error (four copies of the low-resource
 *     lines once disagreed). A line that means a different number says so
 *     with `// lint-ok: threshold`.
 *   - the registry's low_* / fab_low thresholds equal RES_LOW, MORALE_LOW
 *     and FAB_LOW_WEAR; fabricator.js's misfire numbers equal recipes.json
 *     _meta (prose on both sides, so nothing else ties them).
 *   - index.html never re-exports a top-level function declaration
 *     (window.X = X or Object.assign(window, {X})): a classic script's
 *     declarations are already window properties, and the copies piled up.
 *   - the crew role <-> crew id map and the AI display names live once, in
 *     index.html's shared helpers: six copies of the role map and three of
 *     the AI names had grown across the engine.
 *   - (warning) an engine window export nothing outside its file reads is
 *     dead weight on the one shared global scope.
 * Run from anywhere: node tools/lint_code.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const TESTS = path.join(ROOT, 'tools', 'tests');
const errors = [], warnings = [];
const err = m => errors.push(m);
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const warn = m => warnings.push(m);

// ── Batteries: one URL default ──────────────────────────────────────
const URL_DEFAULT = "const URL = process.env.URL || 'http://localhost:8177/index.html';";
for (const f of fs.readdirSync(TESTS).filter(f => /^test_.*\.js$/.test(f)).sort()) {
  const src = fs.readFileSync(path.join(TESTS, f), 'utf8');
  if (!src.includes(URL_DEFAULT)) err(`tools/tests/${f}: missing the shared URL default (${URL_DEFAULT})`);
  // Any other localhost address is a hard-coded server the env can't redirect.
  src.split('\n').forEach((line, i) => {
    if (line.includes(URL_DEFAULT)) return;
    const m = line.match(/['"`]https?:\/\/localhost:\d+[^'"`]*['"`]/);
    if (m) err(`tools/tests/${f}:${i + 1}: hard-coded server ${m[0]} — derive it from URL`);
  });
}

// ── Source scanning ─────────────────────────────────────────────────
// lineOf(src)(offset) → 1-based line number.
function lineOf(src) {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') starts.push(i + 1);
  return off => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (starts[m] <= off) lo = m; else hi = m - 1; } return lo + 1; };
}
const blank = s => s.replace(/[^\n]/g, ' ');
// Splits JS into code (comments blanked, offsets kept) and its comments.
// Knows strings, template literals (with ${} nesting) and regex literals,
// so a '//' inside 'http://' or /\/\// is not a comment.
function scanJs(src, base = 0) {
  const out = [], comments = [], tpl = [];
  let i = 0, depth = 0, prev = '', word = '';
  const n = src.length;
  const KW = /^(return|typeof|case|in|of|delete|void|throw|new|else|do|yield|await|instanceof)$/;
  const template = () => { // after a backtick or a ${…} closing brace
    while (i < n) {
      const c = src[i];
      if (c === '\\') { out.push(src.substr(i, 2)); i += 2; continue; }
      if (c === '`') { out.push(c); i++; return; }
      if (c === '$' && src[i + 1] === '{') { out.push('${'); i += 2; tpl.push(depth); return; }
      out.push(c); i++;
    }
  };
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && (d === '/' || d === '*')) {
      let j = d === '/' ? src.indexOf('\n', i) : src.indexOf('*/', i + 2) + 2;
      if (j < (d === '/' ? 0 : 2)) j = n;
      comments.push({ off: base + i, text: src.slice(i, j) });
      out.push(blank(src.slice(i, j))); i = j; continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      out.push(src.slice(i, j + 1)); i = j + 1; prev = c; word = ''; continue;
    }
    if (c === '`') { out.push(c); i++; template(); prev = '`'; word = ''; continue; }
    if (c === '/' && (prev === '' || '(,=:[!&|?{};+-*%<>~^'.includes(prev) || (/\w/.test(prev) && KW.test(word)))) {
      let j = i + 1, cls = false;
      while (j < n && src[j] !== '\n' && (cls || src[j] !== '/')) { if (src[j] === '\\') j++; else if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; j++; }
      j++; while (j < n && /\w/.test(src[j])) j++;
      out.push(src.slice(i, j)); i = j; prev = '/'; word = ''; continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      if (tpl.length && tpl[tpl.length - 1] === depth) { tpl.pop(); out.push(c); i++; template(); prev = '`'; word = ''; continue; }
      depth--;
    }
    out.push(c); i++;
    if (!/\s/.test(c)) { word = /[\w$]/.test(c) ? (/[\w$]/.test(prev) ? word + c : c) : ''; prev = c; }
  }
  return { code: out.join(''), comments };
}
const scanCss = (src, base = 0) => {
  const comments = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, (m, off) => { comments.push({ off: base + off, text: m }); return blank(m); });
  return { code, comments };
};
// An HTML page: markup attribute values, inline script code, <style>
// blocks, and every comment (with offsets into the page).
function scanHtml(src) {
  const scripts = [], styles = [], comments = [];
  let markup = src.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, (m, a, body, z, off) => {
    if (!/\ssrc=/.test(a)) { const s = scanJs(body, off + a.length); scripts.push(s.code); comments.push(...s.comments); }
    return blank(m);
  });
  markup = markup.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (m, a, body, z, off) => {
    const s = scanCss(body, off + a.length); styles.push({ off: off + a.length, code: s.code }); comments.push(...s.comments);
    return blank(m);
  });
  markup = markup.replace(/<!--[\s\S]*?-->/g, (m, off) => { comments.push({ off, text: m }); return blank(m); });
  const attrs = [...markup.matchAll(/\s[\w:-]+\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m => m[1] !== undefined ? m[1] : m[2]);
  return { scripts, styles, comments, attrs };
}
function walkJs(dir) {
  let out = [];
  for (const f of fs.readdirSync(path.join(ROOT, dir)).sort()) {
    const p = path.join(dir, f);
    if (fs.statSync(path.join(ROOT, p)).isDirectory()) out = out.concat(walkJs(p));
    else if (f.endsWith('.js') && f !== 'portable_data.js') out.push(p);
  }
  return out;
}

const INDEX = read('index.html');
const indexScan = scanHtml(INDEX);
// Engine JS: every script index.html loads plus anything under engine/js
// (portable_data.js is generated module data, not code).
const ENGINE_JS = [...new Set([
  ...[...INDEX.matchAll(/<script\s+src="([^"]+)"/g)].map(m => m[1]),
  ...walkJs('engine/js'),
])].filter(f => !f.endsWith('portable_data.js') && fs.existsSync(path.join(ROOT, f)));
const jsScans = ENGINE_JS.map(f => ({ file: f, src: read(f), ...scanJs(read(f)) }));
const SCREEN_CSS = fs.readdirSync(path.join(ROOT, 'resources')).filter(f => /^screen-.*\.css$/.test(f)).sort().map(f => 'resources/' + f);
const cssScans = ['resources/shared.css', ...SCREEN_CSS].map(f => ({ file: f, src: read(f), ...scanCss(read(f)) }));

// ── CSS: no unused class/id selectors ───────────────────────────────
// A selector token is used when it appears as a whole word in the
// comment-stripped engine source; for shared.css also in any resources
// page that links it (the demos are canon). A token that starts with a
// prefix the code builds classes from ('tier-' + t, `sz-${s}`) counts as
// used. Anything else unused belongs in tools/css_allow.json (exact
// token + reason).
{
  const words = text => new Set(text.match(/[\w-]+/g) || []);
  const prefixes = text => {
    const out = new Set();
    for (const m of text.matchAll(/['"`\s]([A-Za-z][\w-]*[-_])['"`]\s*\+/g)) out.add(m[1]);
    for (const m of text.matchAll(/([A-Za-z][\w-]*[-_])\$\{/g)) out.add(m[1]);
    return out;
  };
  const engineText = [indexScan.attrs.join('\n'), ...indexScan.scripts, ...jsScans.map(s => s.code)].join('\n');
  const demoText = fs.readdirSync(path.join(ROOT, 'resources')).filter(f => f.endsWith('.html')).sort()
    .map(f => read('resources/' + f)).filter(h => /href="[^"]*shared\.css"/.test(h))
    .map(h => { const s = scanHtml(h); return [s.attrs.join('\n'), ...s.scripts].join('\n'); }).join('\n');
  const engine = { words: words(engineText), prefixes: prefixes(engineText) };
  const shared = { words: words(engineText + '\n' + demoText), prefixes: prefixes(engineText + '\n' + demoText) };

  const ALLOW_FILE = 'tools/css_allow.json';
  const allow = JSON.parse(read(ALLOW_FILE)).allow || {};
  for (const [tok, why] of Object.entries(allow)) {
    if (!/^[.#]-?[A-Za-z_][\w-]*$/.test(tok)) err(`${ALLOW_FILE}: "${tok}" is not one exact .class or #id token`);
    if (typeof why !== 'string' || why.trim().length < 10) err(`${ALLOW_FILE}: "${tok}" needs a reason`);
  }
  const allowHit = new Set();
  const sheets = [
    ...indexScan.styles.map(s => ({ file: 'index.html', code: s.code, off: s.off, line: lineOf(INDEX), corpus: engine })),
    ...cssScans.map(s => ({ file: s.file, code: s.code, off: 0, line: lineOf(s.src), corpus: s.file.endsWith('shared.css') ? shared : engine })),
  ];
  for (const sh of sheets) {
    const seen = new Set();
    for (const m of sh.code.matchAll(/([^{}]+)\{/g)) {
      const sel = m[1].trim();
      if (!sel || sel.startsWith('@') || /^(from|to|\d+(\.\d+)?%)\b/.test(sel)) continue;
      const at = sh.off + m.index + (m[1].length - m[1].trimStart().length);
      for (const t of sel.replace(/\[[^\]]*\]/g, '').replace(/url\([^)]*\)/g, '').matchAll(/([.#])(-?[A-Za-z_][\w-]*)/g)) {
        const tok = t[1] + t[2], name = t[2];
        if (seen.has(tok)) continue;
        seen.add(tok);
        if (sh.corpus.words.has(name)) continue;
        if ([...sh.corpus.prefixes].some(p => name.startsWith(p) && name.length > p.length)) continue;
        if (allow[tok]) { allowHit.add(tok); continue; }
        err(`${sh.file}:${sh.line(at)}: ${tok} is never used by the engine${sh.corpus === shared ? ' or a page that links shared.css' : ''} — delete the rule (or list it in ${ALLOW_FILE} with a reason)`);
      }
    }
  }
  for (const tok of Object.keys(allow)) if (!allowHit.has(tok)) err(`${ALLOW_FILE}: "${tok}" is no longer an unused selector — drop the entry`);
}

// ── Comments: every cited ruling is in the register ─────────────────
// Engine and CSS comments cite owner rulings by number ("ruling 15",
// "rulings 29/30", "ruling 46a", "owner ruling 2026-10-11 #12");
// docs/RULINGS.md is the register they point at.
const allComments = [
  ...indexScan.comments.map(c => ({ file: 'index.html', line: lineOf(INDEX), ...c })),
  ...jsScans.flatMap(s => { const l = lineOf(s.src); return s.comments.map(c => ({ file: s.file, line: l, ...c })); }),
  ...cssScans.flatMap(s => { const l = lineOf(s.src); return s.comments.map(c => ({ file: s.file, line: l, ...c })); }),
];
const fileOrder = ['index.html', ...ENGINE_JS, ...cssScans.map(s => s.file)];
allComments.sort((a, b) => fileOrder.indexOf(a.file) - fileOrder.indexOf(b.file) || a.off - b.off);
{
  const RULINGS = 'docs/RULINGS.md';
  const listed = new Set([...read(RULINGS).matchAll(/^(\d+)\.\s/gm)].map(m => +m[1]));
  const missing = new Map();
  for (const c of allComments) {
    const text = c.text.replace(/\b20\d\d-\d\d-\d\d\b/g, m => 'D'.repeat(m.length));
    for (const m of text.matchAll(/\brulings?\s+((?:\d+[a-z]?|D{10}\s*#\d+)(?:\s*(?:\/|,|&|and)\s*\d+[a-z]?\b(?!-))*)/gi)) {
      for (const num of m[1].replace(/D{10}\s*#/, '').match(/\d+/g)) {
        if (!listed.has(+num) && !missing.has(num)) missing.set(num, `${c.file}:${c.line(c.off + m.index)}`);
      }
    }
  }
  for (const [num, where] of missing) err(`${where}: cites ruling ${num}, which is not in ${RULINGS}`);
}

// ── Comments: no process tags ───────────────────────────────────────
// Batch/hunt/audit/pass names and hotfix shas say which pass wrote a
// line, not why the code is the way it is. Hex colours are skipped; bare
// A9/B4 audit items only count inside parentheses.
const CHATTER_IS_ERROR = true;
{
  const TAGS = [
    /\bb[1-9]\b/g,                        // b4, b5 (lower case: the batch names)
    /\bbatch\s*\d+\b/gi,
    /\bhunt\s*(?:20\d\d-\d\d-\d\d|\d+[a-z]?)\b/gi,
    /\b(?:re-)?audit\s+[AB]\s?\d+\b/gi,
    /\bre-audit\b|\baudit\s+fix\b/gi,
    /\bCodex\s+[A-Z]\d+\b/g,
    /\bparity\s+(?:pass|batch|audit)\b/gi,
    /\bscenes\s?[AB]\b/g,
    /\bhotfix\s+[0-9a-f]{6,}\b/gi,
  ];
  const hits = [];
  for (const c of allComments) {
    const text = c.text.replace(/#[0-9a-fA-F]{3,8}\b/g, blank);
    const found = [];
    for (const re of TAGS) for (const m of text.matchAll(re)) found.push({ at: m.index, tag: m[0] });
    for (const p of text.matchAll(/\(([^()]*)\)/g))
      for (const m of p[1].matchAll(/(?<![\w-])[AB]\d{1,2}(?![\w-])/g)) found.push({ at: p.index + 1 + m.index, tag: m[0] });
    let end = -1; // "(re-audit B5)" is one tag, not two
    for (const f of found.sort((a, b) => a.at - b.at || b.tag.length - a.tag.length)) {
      if (f.at < end) continue;
      end = f.at + f.tag.length;
      hits.push(`${c.file}:${c.line(c.off + f.at)}: process tag "${f.tag.replace(/\s+/g, ' ')}" in a comment`);
    }
  }
  if (hits.length) {
    if (CHATTER_IS_ERROR || process.env.LINT_CHATTER === 'error') hits.forEach(err);
    else {
      console.warn(`lint_code: warning: ${hits.length} process tag(s) in engine/CSS comments (LINT_CHATTER=error to fail); first 10:`);
      hits.slice(0, 10).forEach(h => console.warn('  ~ ' + h));
    }
  }
}

// ── Engine source: one copy of each threshold ───────────────────────
// Code only: comments and string/template contents become spaces (line
// numbers kept), so prose like "morale < 30" in a comment never trips.
function codeOnly(src) {
  let out = '', i = 0, st = 'code', prev = '';
  const esc = () => { out += ' ' + (src[i + 1] === '\n' ? '\n' : ' '); i += 2; }; // an escape keeps its newline
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (st === 'code') {
      if (c === '/' && n === '/') { st = 'line'; out += '  '; i += 2; continue; }
      if (c === '/' && n === '*') { st = 'block'; out += '  '; i += 2; continue; }
      if (c === "'" || c === '"' || c === '`') { st = c; out += c; i++; continue; }
      // A regex literal: a slash where an operand starts.
      if (c === '/' && /[(,=:[!&|?{};+\-*%<>~^]|^$/.test(prev)) { st = 're'; out += c; i++; continue; }
      out += c; if (!/\s/.test(c)) prev = c; i++; continue;
    }
    if (st === 'line') { if (c === '\n') { st = 'code'; out += c; } else out += ' '; i++; continue; }
    if (st === 'block') { if (c === '*' && n === '/') { st = 'code'; out += '  '; i += 2; continue; } out += c === '\n' ? c : ' '; i++; continue; }
    if (st === 're') {
      if (c === '\\') { esc(); continue; }
      if (c === '[') { st = 'reclass'; out += ' '; i++; continue; }
      if (c === '/' || c === '\n') { st = 'code'; prev = 'x'; out += c; i++; continue; }
      out += ' '; i++; continue;
    }
    if (st === 'reclass') { if (c === '\\') { esc(); continue; } if (c === ']') st = 're'; out += c === '\n' ? c : ' '; i++; continue; }
    // A string or template literal (a template's ${…} is skipped with it).
    if (c === '\\') { esc(); continue; }
    if (c === st) { st = 'code'; prev = 'x'; out += c; i++; continue; }
    if (c === '\n' && st !== '`') st = 'code';
    out += c === '\n' ? c : ' '; i++;
  }
  return out;
}
// index.html's inline scripts; markup, CSS and src= tags blanked (line
// numbers kept).
function inlineScripts(html) {
  let out = '', at = 0;
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    out += blank(html.slice(at, m.index));
    out += /\bsrc=/.test(m[1]) ? blank(m[0]) : blank('<script' + m[1] + '>') + m[2] + blank('</script>');
    at = m.index + m[0].length;
  }
  return out + blank(html.slice(at));
}
const ENGINE = [{ rel: 'index.html', raw: fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8') }];
(function walk(dir) {
  for (const f of fs.readdirSync(path.join(ROOT, dir)).sort()) {
    const rel = dir + '/' + f;
    if (fs.statSync(path.join(ROOT, rel)).isDirectory()) walk(rel);
    else if (f.endsWith('.js') && f !== 'portable_data.js') ENGINE.push({ rel, raw: fs.readFileSync(path.join(ROOT, rel), 'utf8') });
  }
})('engine/js');
for (const e of ENGINE) {
  e.code = codeOnly(e.rel === 'index.html' ? inlineScripts(e.raw) : e.raw).split('\n');
  e.lines = e.raw.split('\n');
}

const THRESHOLD_RULES = [
  // A resource against a bare number (0 = empty is fine).
  { re: /\b(?:r|res|resources)\.(?:fuel|food|water|o2|hull)\s*(?:<=?|>=?)\s*(\d+(?:\.\d+)?)/g, ok: v => v === 0, say: 'a resource line — use RES_LOW / RES_CRITICAL / resMax' },
  // Morale against a bare number (0 = mutiny / walk-off, 100 = full).
  { re: /\b(?:mo|morale)\s*(?:<=?|>=?)\s*(\d+(?:\.\d+)?)/g, ok: v => v === 0 || v === 100, say: 'a morale line — use MORALE_LOW / MORALE_CRISIS (or name it where it lives)' },
  // HP against a bare number (0 = dead, 100 = unhurt).
  { re: /\b(?:hp|captainHP|(?:hpOf|crewHPOf|captainHPOf)\([^()]*\))\s*(?:<=?|>=?)\s*(\d+(?:\.\d+)?)/g, ok: v => v === 0 || v === 100, say: 'an HP line — use CREW_WOUNDED_HP / CREW_CRITICAL_HP (or name it)' },
  // Fab wear against a bare number, or a bare 100 ceiling around it.
  { re: /\bwear\w*\b(?:\s*\|\|\s*0\s*\))?\s*(?:<=?|>=?)\s*(\d+(?:\.\d+)?)/g, ok: v => v === 0, say: 'a fab wear line — use FAB_WEAR_MAX / FAB_LOW_WEAR / FAB_SERVICE_WEAR' },
  { re: /Math\.min\(\s*100\s*,[^;]*\bwear|\b100\s*-\s*\(?\s*[\w.]*wear/gi, say: 'a fab wear ceiling — use FAB_WEAR_MAX' },
  // The crew cap.
  { re: /\bcrew\.length\s*(?:<=?|>=?|[!=]==?)\s*2\b|\bcrew\.slice\(\s*0\s*,\s*2\s*\)/g, say: 'the crew cap — use CREW_MAX' },
  // A second copy of the wounded multiplier.
  { re: /CREW_WOUNDED_HP\s*\)?\s*\?\s*[\d.]+\s*:/g, say: 'the wounded multiplier — use woundedMult(who)' },
  // A crops.json fallback written out.
  { re: /\b(?:healthy_threshold|sick_threshold|water_need|maturity_days)\s*\)*\s*\|\|\s*\d+/g, say: 'a crops.json fallback — use CROP_*_DEFAULT' },
];
const LINT_OK = /\/\/\s*lint-ok:\s*threshold\b/;
for (const e of ENGINE) {
  e.code.forEach((line, i) => {
    if (LINT_OK.test(e.lines[i] || '')) return;
    for (const rule of THRESHOLD_RULES) {
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(line))) {
        if (rule.ok && rule.ok(Number(m[1]))) continue;
        err(`${e.rel}:${i + 1}: ${rule.say}: ${m[0].trim()}`);
      }
    }
  });
}
// The crew's water tiers: index.html crewWaterDrainRate only.
for (const e of ENGINE) e.code.forEach((line, i) => {
  if (/ratio\s*>=\s*0\.7\b/.test(line) && !(e.rel === 'index.html' && /^\s*if \(ratio >= 0\.7\) return 1;/.test(line)))
    err(`${e.rel}:${i + 1}: a copy of the crew water tiers — call crewWaterDrainRate(plantPct)`);
});

// ── The named thresholds agree with the registry and recipes.json ───
const html = ENGINE[0].raw;
const block = (html.match(/<script>\s*'use strict';\s*\/\*[─\s]*THRESHOLDS\b[\s\S]*?<\/script>/) || [''])[0].replace(/^<script>|<\/script>$/g, '');
let T = null;
try { T = vm.runInNewContext(block + ';({ RES_LOW, MORALE_LOW, FAB_WEAR_MAX, FAB_LOW_WEAR })'); }
catch (e) { err(`index.html: can't read the THRESHOLDS script (${e.message})`); }
if (T) {
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'registry', 'tag_registry.json'), 'utf8'));
  const trig = (reg.trigger && reg.trigger.values) || {};
  const below = v => { const m = String((v && v.threshold) || '').match(/below\s+(\d+(?:\.\d+)?)%/); return m ? Number(m[1]) : null; };
  const want = Object.assign({}, T.RES_LOW, { morale: T.MORALE_LOW });
  for (const [k, at] of Object.entries(want)) {
    const r = below(trig['low_' + k]);
    if (r !== at) err(`registry trigger low_${k}: threshold ${r == null ? 'missing' : '"below ' + r + '%"'} but the engine fires below ${at} (${k === 'morale' ? 'MORALE_LOW' : 'RES_LOW.' + k})`);
  }
  for (const k of Object.keys(trig)) if (/^low_/.test(k) && !(k.slice(4) in want)) err(`registry trigger ${k}: no engine threshold (RES_LOW / MORALE_LOW)`);
  const fh = below(trig.fab_low);
  if (fh == null || T.FAB_WEAR_MAX - fh !== T.FAB_LOW_WEAR) err(`registry trigger fab_low: "fab health below ${fh}%" but the engine fires above ${T.FAB_LOW_WEAR}% wear (FAB_LOW_WEAR)`);
}
{
  const fab = fs.readFileSync(path.join(ROOT, 'engine', 'js', 'screens', 'fabricator.js'), 'utf8');
  const meta = (JSON.parse(fs.readFileSync(path.join(ROOT, 'modules', 'recipes', 'recipes.json'), 'utf8'))._meta) || {};
  const num = name => { const m = fab.match(new RegExp('const ' + name + ' = ([\\d.]+);')); return m ? Number(m[1]) : null; };
  const curveSrc = (fab.match(/const MISFIRE_CURVE = (\[[^;]*\]);/) || [])[1];
  const curve = curveSrc ? JSON.parse(curveSrc) : null;
  const metaCurve = [...String(meta.misfire_curve || '').matchAll(/(\d+)hp=(\d+(?:\.\d+)?)%/g)].map(m => [Number(m[1]), Number(m[2]) / 100]);
  if (!curve || JSON.stringify(curve) !== JSON.stringify(metaCurve)) err(`fabricator.js MISFIRE_CURVE ${curveSrc} ≠ recipes.json _meta.misfire_curve ${JSON.stringify(metaCurve)}`);
  const outs = String(meta.misfire_outcomes || '');
  const surplus = (outs.match(/~(\d+)% produces fab_surplus/) || [])[1];
  if (surplus == null || Number(surplus) / 100 !== num('MISFIRE_SURPLUS_CHANCE')) err(`fabricator.js MISFIRE_SURPLUS_CHANCE ${num('MISFIRE_SURPLUS_CHANCE')} ≠ recipes.json _meta.misfire_outcomes "~${surplus}% produces fab_surplus"`);
  const brk = (outs.match(/Below (\d+)% health/) || [])[1];
  if (brk == null || Number(brk) !== num('MISFIRE_BREAK_HEALTH')) err(`fabricator.js MISFIRE_BREAK_HEALTH ${num('MISFIRE_BREAK_HEALTH')} ≠ recipes.json _meta.misfire_outcomes "Below ${brk}% health"`);
}

// ── Globals: exports and shared maps (own scope: its helpers are local) ──
{
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const walk = d => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? walk(d + '/' + e.name) : [d + '/' + e.name]);
const ENGINE = walk('engine/js').filter(f => f.endsWith('.js') && !f.endsWith('portable_data.js'));
const lineOf = (src, i) => src.slice(0, i).split('\n').length;
// index.html's inline classic scripts (no src), with their offsets.
const INDEX = read('index.html');
const inlineScripts = [...INDEX.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => ({ code: m[1], at: m.index + m[0].indexOf(m[1]) }));
// Keys of every Object.assign(window, { ... }) in src (shorthand or key: value).
function assignKeys(src) {
  const out = [];
  for (const m of src.matchAll(/Object\.assign\(\s*window\s*,\s*\{([\s\S]*?)\}\s*\)/g)) {
    for (const part of m[1].replace(/\/\/.*$/gm, '').split(',')) {
      const k = part.trim().split(':')[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(k)) out.push({ name: k, line: lineOf(src, m.index) });
    }
  }
  return out;
}

// ── index.html: no re-exports of top-level function declarations ──
{
  const fns = new Set();
  for (const { code } of inlineScripts) for (const m of code.matchAll(/^(?:async )?function ([A-Za-z_$][\w$]*)/gm)) fns.add(m[1]);
  for (const m of INDEX.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=(?!=)\s*([A-Za-z_$][\w$]*)?/g)) {
    if (fns.has(m[1])) err(`index.html:${lineOf(INDEX, m.index)}: window.${m[1]} = … re-exports a top-level function declaration (already a window property) — delete it`);
  }
  for (const k of assignKeys(INDEX)) if (fns.has(k.name)) err(`index.html:${k.line}: Object.assign(window, {${k.name}}) re-exports a top-level function declaration (already a window property) — delete it`);
}

// ── One copy of the shared maps (index.html SHARED HELPERS) ─────────
{
  const SHARED_MAPS = [
    { what: 'the crew role -> crew id map', re: /\bbotanist['"]?\s*:\s*['"]osei['"]|\bosei['"]?\s*:\s*['"]botanist['"]/, home: /^const CREWID_OF_ROLE = /, use: 'CREWID_OF_ROLE / ROLE_OF_CREWID' },
    { what: 'the AI display names', re: /\baria['"]?\s*:\s*['"]ARIA['"]|['"]ARIA['"]\s*,\s*['"]MARV['"]/, home: /^const AI_NAMES = /, use: 'AI_NAMES' },
  ];
  for (const rel of ['index.html', ...ENGINE]) {
    read(rel).split('\n').forEach((line, i) => {
      for (const m of SHARED_MAPS) {
        if (m.re.test(line) && !(rel === 'index.html' && m.home.test(line))) err(`${rel}:${i + 1}: a second copy of ${m.what} — read ${m.use} (index.html shared helpers)`);
      }
    });
  }
}

// ── Engine window exports something outside the file reads ──────────
{
  const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
  const readers = ['index.html', ...ENGINE, ...walk('tools').filter(f => f.endsWith('.js'))];
  const text = Object.fromEntries(readers.map(f => [f, stripComments(read(f))]));
  for (const rel of ENGINE) {
    const src = read(rel);
    const names = [...src.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)].map(m => ({ name: m[1], line: lineOf(src, m.index) })).concat(assignKeys(src));
    for (const { name, line } of names) {
      const re = new RegExp('\\b' + name.replace(/\$/g, '\\$') + '\\b');
      if (!readers.some(f => f !== rel && re.test(text[f]))) warn(`${rel}:${line}: window.${name} is exported but nothing outside the file reads it (engine, index.html, tools/**) — make it local`);
    }
  }
}
}

if (warnings.length) {
  console.warn(`lint_code: ${warnings.length} warning(s):\n`);
  warnings.forEach(w => console.warn('  - ' + w));
  console.warn('');
}
if (errors.length) {
  console.error(`lint_code: ${errors.length} issue(s) found:\n`);
  errors.forEach(e => console.error('  - ' + e));
  process.exit(1);
}
console.log('lint_code: clean.');

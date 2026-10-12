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
 *     why, not which pass wrote them. Warning-only until the comment pass
 *     lands; LINT_CHATTER=error (or CHATTER_IS_ERROR) makes it fail.
 * Run from anywhere: node tools/lint_code.js
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const TESTS = path.join(ROOT, 'tools', 'tests');
const errors = [];
const err = m => errors.push(m);
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

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

// ── Comments: no process tags (warning until the comment pass) ──────
// Batch/hunt/audit/pass names and hotfix shas say which pass wrote a
// line, not why the code is the way it is. Hex colours are skipped; bare
// A9/B4 audit items only count inside parentheses.
const CHATTER_IS_ERROR = false;
{
  const TAGS = [
    /\bb[1-9]\b/g,                        // b4, b5 (lower case: the batch names)
    /\bbatch\s*\d+\b/gi,
    /\bhunt\s*(?:20\d\d-\d\d-\d\d|\d+[a-z]?)\b/gi,
    /\b(?:re-)?audit\s+[AB]\s?\d+\b/gi,
    /\bCodex\s+[A-Z]\d+\b/g,
    /\bparity\s+(?:pass|batch)\b/gi,
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

if (errors.length) {
  console.error(`lint_code: ${errors.length} issue(s) found:\n`);
  errors.forEach(e => console.error('  - ' + e));
  process.exit(1);
}
console.log('lint_code: clean.');

// Builds the manual: docs/manual/src/*.html (in name order) → docs/manual/index.html,
// with a table of contents from every <h1 id> / <h2 id> / <h3 id>.
// With --pdf, also prints docs/manual/Trans-plant-Manual.pdf through
// Playwright's Chromium (the page renders its Mermaid diagrams first).
//   node tools/build_manual.js            # page only
//   node tools/build_manual.js --pdf      # page + PDF (Playwright under nvm node 20)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'docs', 'manual');
const SRC = path.join(DIR, 'src');

const parts = fs.readdirSync(SRC).filter(f => f.endsWith('.html')).sort();
let html = parts.map(f => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n');

// Table of contents: part titles (h1) and sections (h2) with an id.
const heads = [...html.matchAll(/<h([12]) id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g)]
  .map(m => ({ level: +m[1], id: m[2], text: m[3].replace(/<[^>]+>/g, '').trim() }));
let toc = '<nav class="toc"><div class="pixel">CONTENTS</div><ol>';
let open = false;
for (const h of heads) {
  if (h.level === 1) { if (open) toc += '</ol></li>'; toc += `<li><a href="#${h.id}">${h.text}</a><ol>`; open = true; }
  else toc += `<li><a href="#${h.id}">${h.text}</a></li>`;
}
if (open) toc += '</ol></li>';
toc += '</ol></nav>';
html = html.replace('<!--TOC-->', toc);

let commit = 'unknown';
try { commit = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); } catch (_) {}
html = html.replace('{{commit}}', commit).replace('{{date}}', new Date().toISOString().slice(0, 10));

fs.writeFileSync(path.join(DIR, 'index.html'), html);
console.log(`build_manual: wrote docs/manual/index.html (${parts.length} parts, ${heads.length} headings)`);

if (process.argv.includes('--pdf')) {
  const { chromium } = require('playwright');
  const http = require('http');
  (async () => {
    // Serve the repo so the page's relative images load as they do on Pages.
    const types = { '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.js': 'text/javascript' };
    const server = http.createServer((req, res) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(res);
    }).listen(0);
    const port = server.address().port;
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1000, height: 1400 } });
    await page.goto(`http://localhost:${port}/docs/manual/index.html`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    // Every Mermaid block has rendered to an <svg> (or there are none).
    await page.waitForFunction(() => [...document.querySelectorAll('.mermaid')].every(m => m.querySelector('svg')), null, { timeout: 60000 });
    await page.pdf({ path: path.join(DIR, 'Trans-plant-Manual.pdf'), format: 'A4', printBackground: true, margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' } });
    await browser.close();
    server.close();
    console.log('build_manual: wrote docs/manual/Trans-plant-Manual.pdf');
  })().catch(e => { console.error(e); process.exit(1); });
}

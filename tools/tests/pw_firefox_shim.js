// Firefox runs of the regression (owner rule: test in Chrome and Firefox).
// Preloaded by run_all.sh when PW_BROWSER=firefox: every battery's
// `const { chromium } = require('playwright')` launches Firefox instead.
if (process.env.PW_BROWSER === 'firefox') {
  const pw = require('playwright');
  pw.chromium.launch = (...a) => pw.firefox.launch(...a);
  pw.chromium.launchPersistentContext = (...a) => pw.firefox.launchPersistentContext(...a);
}

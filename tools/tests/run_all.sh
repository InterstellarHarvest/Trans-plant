#!/bin/bash
# Trans-plant regression: every battery in tools/tests + lint + fuzz + UI
# sweep over http and file://. Needs `python3 -m http.server 8177` running
# from the repo root and Playwright under nvm node 20. PW_BROWSER=firefox
# runs the whole routine in Firefox (both browsers before a push).
cd "$(dirname "$0")"
NVM=$HOME/.nvm/versions/node/v20.20.2
export NODE_PATH=$NVM/lib/node_modules
export URL=${URL:-http://localhost:8177/index.html}
# PW_BROWSER=firefox runs everything in Firefox (Playwright's own build).
if [ "$PW_BROWSER" = "firefox" ]; then export NODE_OPTIONS="--require \"$(pwd)/pw_firefox_shim.js\""; echo "browser: firefox"; fi
FILE="file://$(cd ../.. && pwd | sed 's/ /%20/g')/index.html"
for t in test_*.js; do
  r=$($NVM/bin/node "$t" 2>&1)
  echo "$t: $(echo "$r" | grep -E 'passed|failed|errors:' | tail -1)"
  echo "$r" | grep -E '✗|Error' | head -4
done
cd ../..
$NVM/bin/node tools/lint_modules.js 2>&1 | tail -1
FUZZ_URL="${URL%index.html}index.html?debug=fixed_path" $NVM/bin/node tools/fuzz_playthrough.js 2>&1 | tail -2
FUZZ_URL="$FILE?debug=fixed_path" $NVM/bin/node tools/fuzz_playthrough.js 2>&1 | tail -2
SWEEP_URL="$URL" $NVM/bin/node tools/ui_sweep.js 2>&1 | tail -2
SWEEP_URL="$FILE" $NVM/bin/node tools/ui_sweep.js 2>&1 | tail -2

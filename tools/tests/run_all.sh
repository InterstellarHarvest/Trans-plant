#!/bin/bash
# Trans-plant regression: every battery in tools/tests, both lints, the fuzz
# and the UI sweep over http and file://. Playwright under nvm node 20.
#   bash tools/tests/run_all.sh             full suite (before a release)
#   SMOKE=1 bash tools/tests/run_all.sh     the smoke subset (smoke.txt): per change
#   PW_BROWSER=firefox bash …               the same in Firefox (both browsers before a push)
# With no URL given it serves the repo itself on a free port for the run, so
# two runs (both browsers at once, a worktree) never share one server.
cd "$(dirname "$0")"
NVM=$HOME/.nvm/versions/node/v20.20.2
export NODE_PATH=$NVM/lib/node_modules
ROOT="$(cd ../.. && pwd)"
if [ -z "$URL" ]; then
  PORT=$(python3 -c 'import socket; s = socket.socket(); s.bind(("", 0)); print(s.getsockname()[1])')
  (cd "$ROOT" && exec python3 -m http.server "$PORT" >/dev/null 2>&1) & SRV=$!
  trap 'kill $SRV 2>/dev/null' EXIT
  export URL="http://localhost:$PORT/index.html"
  for _ in $(seq 1 50); do curl -s -o /dev/null "$URL" && break; sleep 0.1; done
fi
echo "server: $URL"
# PW_BROWSER=firefox runs everything in Firefox (Playwright's own build).
if [ "$PW_BROWSER" = "firefox" ]; then export NODE_OPTIONS="--require \"$(pwd)/pw_firefox_shim.js\""; echo "browser: firefox"; fi
FILE="file://$(echo "$ROOT" | sed 's/ /%20/g')/index.html"
if [ -n "$SMOKE" ]; then export SMOKE; TESTS=$(grep -v '^#' smoke.txt | grep -v '^$'); echo "smoke: $(echo $TESTS | wc -w | tr -d ' ') batteries"; else TESTS=$(ls test_*.js); fi
T0=$SECONDS
for t in $TESTS; do
  s=$SECONDS
  r=$($NVM/bin/node "$t" 2>&1)
  echo "$t: $(echo "$r" | grep -E 'passed|failed|errors:' | tail -1) ($((SECONDS - s))s)"
  echo "$r" | grep -E -A3 '✗|Error' | head -12 # a failure's detail lines follow it
done
cd "$ROOT"
$NVM/bin/node tools/lint_modules.js 2>&1 | tail -1
$NVM/bin/node tools/lint_code.js 2>&1 | tail -4
FUZZ_URL="${URL%index.html}index.html?debug=fuzz" $NVM/bin/node tools/fuzz_playthrough.js 2>&1 | tail -2
if [ -z "$SMOKE" ]; then
  FUZZ_URL="$FILE?debug=fuzz" $NVM/bin/node tools/fuzz_playthrough.js 2>&1 | tail -2
  SWEEP_URL="$URL" $NVM/bin/node tools/ui_sweep.js 2>&1 | sed -n '/^FLAGS:/,$p'
fi
# From FLAGS: on, whole: a flag list spans lines (tail -2 once showed a bare "]").
SWEEP_URL="$FILE" $NVM/bin/node tools/ui_sweep.js 2>&1 | sed -n '/^FLAGS:/,$p'
echo "total: $((SECONDS - T0))s"

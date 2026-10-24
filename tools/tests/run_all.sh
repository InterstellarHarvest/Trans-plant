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
# A battery is judged by its exit status and its closing "N passed, M
# failed" line (test_multigrant: "errors:"). A check line that happens to
# say "passed" is not a summary: no summary means it CRASHED.
for t in $TESTS; do
  s=$SECONDS
  r=$($NVM/bin/node "$t" 2>&1); st=$?
  sum=$(echo "$r" | grep -E '[0-9]+ passed, [0-9]+ failed' | tail -1)
  [ -z "$sum" ] && sum=$(echo "$r" | grep -E '^errors:' | tail -1)
  if [ -z "$sum" ]; then sum="CRASHED (exit $st, no summary)"
  elif [ $st -ne 0 ] || echo "$sum" | grep -qE '[1-9][0-9]* failed|^errors: [^n]'; then sum="FAILED — $sum (exit $st)"; fi
  echo "$t: $sum ($((SECONDS - s))s)"
  echo "$r" | grep -E -A3 '✗|Error' | head -12 # a failure's detail lines follow it
  case "$sum" in CRASHED*) echo "$r" | tail -4;; esac
done
cd "$ROOT"
# The fuzz and the sweep end on a summary (VIOLATIONS: / FLAGS:, kept whole
# from there on: a flag list spans lines). A harness that died before it
# prints its last lines and exit status instead, so a crash never reads clean.
summary() { # summary <first summary word> <command…>
  local head="$1"; shift
  local out st; out=$("$@" 2>&1); st=$?
  if echo "$out" | grep -q "^$head"; then echo "$out" | sed -n "/^$head/,\$p"; else echo "$out" | tail -8; fi
  [ $st -ne 0 ] && echo "($(basename "${@: -1}") exited $st)"
  return 0
}
$NVM/bin/node tools/lint_modules.js 2>&1 | tail -1
$NVM/bin/node tools/lint_code.js 2>&1 | tail -4
summary VIOLATIONS: env FUZZ_URL="${URL%index.html}index.html?debug=fuzz" $NVM/bin/node tools/fuzz_playthrough.js
if [ -z "$SMOKE" ]; then
  summary VIOLATIONS: env FUZZ_URL="$FILE?debug=fuzz" $NVM/bin/node tools/fuzz_playthrough.js
  summary FLAGS: env SWEEP_URL="$URL" $NVM/bin/node tools/ui_sweep.js
fi
summary FLAGS: env SWEEP_URL="$FILE" $NVM/bin/node tools/ui_sweep.js
echo "total: $((SECONDS - T0))s"

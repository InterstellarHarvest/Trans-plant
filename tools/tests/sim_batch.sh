#!/bin/bash
# Balance sims in parallel: W workers, each with its own static server, each
# running sim.js for every policy × trail cell; the results merge into one
# file for analyze.py.
#   bash tools/tests/sim_batch.sh <workers> <runsPerCellPerWorker> <policies> <trails> <out.json>
#   e.g. bash tools/tests/sim_batch.sh 8 20 greedy,random lunar,mars,interstellar /tmp/balance.json
#        python3 tools/tests/analyze.py /tmp/balance.json
# Each worker's JSON and log stay in <out>_logs/ (w<i>.json, w<i>.log): a
# worker that crashes is named here with the end of its log.
cd "$(dirname "$0")/../.."
W=${1:-4}; N=${2:-10}; POL=${3:-greedy,random}; TR=${4:-lunar,mars,interstellar}; OUT=${5:-/tmp/balance.json}
NVM=$HOME/.nvm/versions/node/v20.20.2
export NODE_PATH=$NVM/lib/node_modules
BASE=${SIM_PORT_BASE:-8300}
LOGS="${OUT%.json}_logs"
rm -rf "$LOGS"; mkdir -p "$LOGS"
pids=(); srv=()
for i in $(seq 0 $((W - 1))); do
  python3 -m http.server $((BASE + i)) >/dev/null 2>&1 & srv+=($!)
done
sleep 1
for i in $(seq 0 $((W - 1))); do
  SIM_URL="http://localhost:$((BASE + i))/index.html?debug=econ" $NVM/bin/node tools/tests/sim.js "$N" "$POL" "$TR" "$LOGS/w$i.json" > "$LOGS/w$i.log" 2>&1 & pids+=($!)
done
for i in "${!pids[@]}"; do
  wait "${pids[$i]}"; st=$?
  if [ $st -ne 0 ] || [ ! -s "$LOGS/w$i.json" ]; then
    echo "worker $i exited $st; $LOGS/w$i.log ends:"; tail -5 "$LOGS/w$i.log" | sed 's/^/  /'
  fi
done
kill "${srv[@]}" 2>/dev/null; wait "${srv[@]}" 2>/dev/null
python3 - "$OUT" "$LOGS"/w*.json <<'EOF'
import json, sys
out, parts = sys.argv[1], sys.argv[2:]
R, E = [], []
for p in parts:
    try: d = json.load(open(p))
    except Exception as e: E.append(f'{p}: {e}'); continue
    R += d['results']; E += d['errors']
json.dump({'results': R, 'errors': E}, open(out, 'w'))
print(f'{len(R)} runs from {len(parts)} workers, {len(E)} errors → {out}')
for e in E[:10]: print('  ' + str(e)[:200])
EOF
echo "worker logs: $LOGS"

# Per-verb deltas from sim.js's verb sampler (stats.vd): score, days, resources,
# gold and materials each cruise verb moved, per trail.
#   python3 tools/tests/analyze_verbs.py /tmp/balance.json   (sim_batch.sh output)
import json, sys, statistics as st, collections
R = []
for f in sys.argv[1:]: R += json.load(open(f))['results']
g = collections.defaultdict(list)
for r in R:
    for v in r['stats'].get('vd', []): g[(r['trail'], v['v'])].append(v)
def med(x): return round(st.median(x), 2) if x else None
def mean(x): return round(sum(x) / len(x), 2) if x else None
for t in ['lunar', 'mars', 'interstellar']:
    print('====', t)
    for (tt, v), xs in sorted(g.items()):
        if tt != t: continue
        dr = collections.defaultdict(list)
        for x in xs:
            for k, d in x['dr'].items(): dr[k].append(d)
        print(f"{v:16} n={len(xs):3} dScore mean={mean([x['ds'] for x in xs]):6} med={med([x['ds'] for x in xs]):6} pos%={round(100*sum(1 for x in xs if x['ds']>0)/len(xs))} | days mean={mean([x['dd'] for x in xs])} | gold {mean([x['dg'] for x in xs])} mats {mean([x['dm'] for x in xs])} | " + ' '.join(f"{k}:{mean(d)}" for k, d in dr.items() if k != 'o2'))

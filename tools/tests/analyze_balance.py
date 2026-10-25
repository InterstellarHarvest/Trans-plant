import json, sys, collections, statistics as st
# Difficulty summary per trail and policy (rulings 96–99): win share, ending
# tiers, late arrivals, the crop at arrival, how often the low-O2 and
# low-fuel crises fire, failure causes, the score spread and the morale the
# effort pips cost.
#   python3 tools/tests/analyze_balance.py <sim.json> [more.json ...]
LOW = {
    'low_o2': {'event_crisis_007', 'event_crisis_008', 'event_crisis_041', 'event_crisis_042', 'event_shipboard_010'},
    'low_fuel': {'event_crisis_003', 'event_crisis_004', 'event_crisis_033', 'event_crisis_034', 'event_crisis_035', 'event_general_020'},
}
R = []
for p in sys.argv[1:]: R += json.load(open(p))['results']
groups = collections.defaultdict(list)
for r in R: groups[(r['trail'], r['policy'])].append(r)
def pct(n, d): return f"{100 * n / d:5.1f}%" if d else '   - '
def q(xs, f):
    xs = sorted(xs); return round(xs[int(f * (len(xs) - 1))]) if xs else None
for trail in ['lunar', 'mars', 'interstellar']:
    for pol in sorted({p for (t, p) in groups if t == trail}):
        rs = groups[(trail, pol)]; n = len(rs)
        wins = [r for r in rs if r['end'] and r['end']['kind'] == 'ending']
        tiers = collections.Counter(r['end']['bracket'] for r in wins)
        late = sum(1 for r in wins if r['days'] > r['baseDays'])
        crop = sum(1 for r in wins if r['crop'] and r['crop']['h'] > 0)
        fails = collections.Counter(str((r['end'] or {}).get('type') or 'none') for r in rs if not (r['end'] and r['end']['kind'] == 'ending'))
        ids = lambda r: set(r['stats'].get('eventIds') or []) | {f[0] for f in r['stats'].get('fires') or []}
        low = {k: sum(1 for r in rs if ids(r) & v) for k, v in LOW.items()}
        under = {k: sum(1 for r in rs if r['stats']['mins'][k] < 25) for k in ('o2', 'fuel')}
        scores = [r['end']['score'] for r in wins if r['end'].get('score') is not None]
        tax = [r['stats'].get('effortTax', {}) for r in rs]
        ev_tax = st.mean([t.get('event', 0) for t in tax]) if tax else 0
        verb_tax = st.mean([t.get('verb', 0) for t in tax]) if tax else 0
        days = [r['days'] / r['baseDays'] for r in wins]
        print(f"{trail:12} {pol:8} n={n:3} win {pct(len(wins), n)} | tiers " + ' '.join(f"{k} {pct(tiers[k], len(wins))}" for k in ('legendary', 'good', 'rough', 'pyrrhic', 'hollow'))
              + f" | late {pct(late, len(wins))} | crop alive {pct(crop, len(wins))}")
        print(f"{'':21} low_o2 {pct(low['low_o2'], n)} (o2<25 {pct(under['o2'], n)}) low_fuel {pct(low['low_fuel'], n)} (fuel<25 {pct(under['fuel'], n)})"
              f" | score p10/50/90 {q(scores, .1)}/{q(scores, .5)}/{q(scores, .9)} | days/base p50 {q([d * 100 for d in days], .5)}% p90 {q([d * 100 for d in days], .9)}%"
              f" | effort tax per crew: events {ev_tax:.1f} verbs {verb_tax:.1f}")
        print(f"{'':21} failures {dict(fails.most_common())}")

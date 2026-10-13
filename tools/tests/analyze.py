import json, sys, statistics as st, collections, glob, os
# Event difficulty tiers, for the early/late draw split (ruling 58).
TIER = {}
for f in glob.glob(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'modules', 'events', '*.json')):
    d = json.load(open(f))
    for ev in (d if isinstance(d, list) else d.get('events', [])):
        if isinstance(ev, dict) and 'id' in ev:
            t = ev.get('difficulty') or 'medium'
            TIER[ev['id']] = t[0] if isinstance(t, list) else t
d = json.load(open(sys.argv[1]))
R = d['results']
print('runs', len(R), 'errors', len(d['errors']), collections.Counter(e[:60] for e in d['errors']).most_common(5))
def med(xs): return round(st.median(xs), 1) if xs else None
def pct(xs, q):
    xs = sorted(xs); return round(xs[int(q * (len(xs) - 1))], 1) if xs else None
groups = collections.defaultdict(list)
for r in R: groups[(r['trail'], r['policy'])].append(r)
for trail in ['lunar', 'mars', 'interstellar']:
    print('\n=====', trail)
    for pol in sorted({p for (t, p) in groups if t == trail}):
        rs = groups.get((trail, pol))
        if not rs: continue
        outs = collections.Counter((r['end'] or {}).get('kind') == 'ending' and ('WIN:' + r['end']['bracket']) or ('FAIL:' + str((r['end'] or {}).get('type'))) for r in rs)
        wins = sum(1 for r in rs if r['end'] and r['end']['kind'] == 'ending')
        line = f"{pol:8} n={len(rs):3} win={100*wins/len(rs):5.1f}% days={med([r['days'] for r in rs])}/{rs[0]['baseDays']} (p90 {pct([r['days'] for r in rs],0.9)}) "
        for k in ['fuel', 'food', 'water', 'o2', 'hull', 'morale']:
            line += f"{k}={med([r['res'][k] for r in rs if k in r['res']])}(min {med([r['stats']['mins'][k] for r in rs])}) "
        line += f"gold={med([r['gold'] for r in rs])} goldMax={med([r['stats']['goldMax'] for r in rs])} crew={med([r['crew'] for r in rs])} mats={med([r['mats'] for r in rs])}"
        print(line)
        print('   outcomes', dict(outs))
        S = [r['stats'] for r in rs]
        print('   days: travel', med([s['travelDays'] for s in S]), 'event', med([s['eventDays'] for s in S]), 'verb', med([s['verbDays'] for s in S]),
              '| events', med([s['events'] for s in S]), 'combat', sum(s['combat'] for s in S), '| travelFuel', med([s['travelFuel'] for s in S]),
              '| harvests', sum(s['harvests'] for s in S), 'harvestFood', sum(s['harvestFood'] for s in S), 'forageFood', med([s['forageFood'] for s in S]),
              '| goldIn', med([s['goldIn'] for s in S]), 'goldOut', med([s['goldOut'] for s in S]), 'trader', sum(s['traderBuys'] for s in S), 'lockedGoldChoices', med([s['lockedGold'] for s in S]),
              '| deprivedDays', sum(s['deprivedDays'] for s in S), 'pests', sum(s['pests'] for s in S), 'cropDead', sum(1 for s in S if s['cropDeadAt'] is not None))
        vb = collections.Counter()
        for s in S: vb.update(s['verbs'])
        print('   verbs', dict(vb), 'itemUses', dict(sum((collections.Counter(s['itemUses']) for s in S), collections.Counter())))
        ad = collections.defaultdict(lambda: [0, 0])
        for s in S:
            for k, v in s['resDelta'].items(): ad[k][0] += v['pos']; ad[k][1] += v['neg']
        print('   authored event deltas/run', {k: (round(v[0] / len(S), 1), round(v[1] / len(S), 1)) for k, v in ad.items()})
        crop = [r['crop'] for r in rs if r['crop']]
        print('   crop end growth med', med([c['g'] for c in crop]), 'health med', med([c['h'] for c in crop]), 'floats', sum(1 for s in S if s['floats']), 'nan', sum(len(s['nan']) for s in S))
        # People and money (balance pass): the captain's death ends the run
        # (captain_lost with crew, crew_gone alone); crew lost = the setup
        # crew not aboard at the end, desertions counted apart.
        n = len(rs)
        cap = sum(1 for r in rs if (r['end'] or {}).get('type') in ('captain_lost', 'crew_gone'))
        mut = sum(1 for r in rs if (r['end'] or {}).get('type') == 'mutiny')
        des = sum(s.get('desertions', 0) for s in S)
        lost = sum(max(0, len(r['cfg']['crew']) - r['crew']) for r in rs)
        cropd = sum(1 for s in S if s['cropDeadAt'] is not None)
        print(f"   people: captain deaths {cap}/{n} ({100*cap/n:.1f}%), mutiny {mut}/{n}, desertions {des} ({des/n:.2f}/run), crew lost or left {lost} ({lost/n:.2f}/run), crop died {cropd}/{n} ({100*cropd/n:.1f}%)")
        src = collections.defaultdict(float)
        for s in S:
            for k, v in s.get('ledger', {}).items():
                if not (k.startswith('gold|') and v[0] > 0): continue
                _, tag, stack = k.split('|', 2)
                src[tag or next((f for f in stack.split('<') if f not in ('evaluate', 'step', '<anon>')), 'other')] += v[0]
        top = sorted(src.items(), key=lambda kv: -kv[1])[:6]
        print('   gold in/run by source', {k: round(v / n, 1) for k, v in top}, '| goods sold/run', round(sum(s.get('goodsSold', 0) for s in S) / n, 2),
              'trader gold', round(sum(s.get('goodsGold', 0) for s in S) / n, 1), 'fence would pay', round(sum(s.get('fenceWouldPay', 0) for s in S) / n, 1))
        # Draws by half of the trail (legs flown; event order when a run
        # predates eventFrac): the hard share, and how often the late half
        # repeats a hard event.
        half = {'early': collections.Counter(), 'late': collections.Counter()}
        lateHard = collections.Counter()
        for s in S:
            ids = s['eventIds']; fr = s.get('eventFrac') or [i / max(1, len(ids)) for i in range(len(ids))]
            for i, eid in enumerate(ids):
                h = 'late' if fr[i] > 0.5 else 'early'
                t = TIER.get(eid, '?'); half[h][t] += 1
                if h == 'late' and t in ('hard', 'ultra'): lateHard[eid] += 1
        share = {h: f"{100 * (c['hard'] + c['ultra']) / max(1, sum(c.values())):.1f}% of {round(sum(c.values()) / n, 1)}/run" for h, c in half.items()}
        print('   hard+ultra share', share, '| late hard draws', dict(lateHard.most_common(8)))

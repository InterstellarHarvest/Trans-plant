"""Rebuild the event dashboard's data from a Trans-plant checkout.
usage: python3 -I tools/build_dashboard_data.py <repo> <outdir> [sim.json]
Writes events.json, pool_by_stop.json, triggered.json, trail_tiers.json,
species.json, flavor_pools.json —
the dashboard artifact's attached datasets (upload them after content
changes). sim.json: tools/tests/sim_batch.sh output (greedy runs), for the
trail draw shares; without it trail_tiers.json has no draw numbers.
"""
import json, glob, os, re, sys, collections, statistics

repo, out = sys.argv[1], sys.argv[2]
sim = sys.argv[3] if len(sys.argv) > 3 else None
os.makedirs(out, exist_ok=True)

STOP = {'any': 'Any stop', 'station': 'Station', 'derelict': 'Derelict', 'anomaly': 'Anomaly', 'nebula': 'Nebula',
        'asteroid_field': 'Asteroid field', 'fork': 'Fork', 'planet': 'Planet', 'void': 'Void'}
TRIG = {'journey_end': 'Arrival', 'journey_start': 'Departure', 'journey_mid': 'Midway', 'low_water': 'Water low',
        'low_fuel': 'Fuel low', 'low_food': 'Food low', 'low_o2': 'Air low', 'low_hull': 'Hull low', 'low_morale': 'Morale low',
        'crop_pest': 'Crop pests', 'crop_sick': 'Crop sick', 'crop_dead': 'Crop dead', 'fab_broken': 'Fabricator broken',
        'fab_low': 'Fabricator worn', 'delayed_crisis': 'Delayed injury', 'engine_strain': 'Engine strain',
        'post_combat': 'After a fight', 'full_cargo': 'Hold full', 'empty_cargo': 'Hold empty',
        'behind_schedule': 'Behind schedule', 'solo_run': 'Flying solo', 'crew_dead': 'Crew member died',
        'stowaway_aboard': 'Stowaway', 'crew_injured': 'Crew injured', 'crewmate_injured': 'Crewmate injured',
        'station_arrival': 'Station arrival', 'crop_thriving': 'Crop thriving', 'well_funded': 'Rich in gold'}
TRAIL = {'lunar': 'Lunar', 'mars': 'Mars', 'interstellar': 'Interstellar'}

items = {}
idoc = json.load(open(os.path.join(repo, 'modules/items/items.json')))
for it in (idoc if isinstance(idoc, list) else idoc.get('items', [])):
    if isinstance(it, dict) and it.get('id'):
        nm = it.get('name') or it['id']
        items[it['id']] = nm
        items[re.sub(r'_\d+$', '', re.sub(r'^item_', '', it['id']))] = nm

evs = []
for f in sorted(glob.glob(os.path.join(repo, 'modules/events/*.json'))):
    d = json.load(open(f))
    for e in (d if isinstance(d, list) else d.get('events', [])):
        if isinstance(e, dict) and e.get('id') and e.get('active', True) is not False:
            evs.append(e)

def choices(e):
    out = list(e.get('choices') or [])
    for l in (e.get('layers') or {}).values():
        out += l.get('choices') or []
    for v in e.get('standard_variants') or []:
        out += v.get('choices') or []
    return out

def species(e):
    n = [e.get('npc')] + [l.get('npc') for l in (e.get('layers') or {}).values()]
    out = {x['species'] for x in n if isinstance(x, dict) and x.get('species')}
    m = re.match(r'event_species_([a-z]+)_', e['id'])  # a species' hazards and forks have no face
    if m and m.group(1) != 'fortune': out.add(m.group(1))
    return sorted(out)

def role(e):
    n = e.get('npc') or next((l.get('npc') for l in (e.get('layers') or {}).values() if l.get('npc')), None)
    if isinstance(n, dict) and n.get('disposition'):
        return {'pirate': 'Pirates', 'trader': 'Traders', 'drifter': 'Drifters', 'station_crew': 'Station crew'}.get(n['disposition'], n['disposition'])
    return 'Other'

base_p = os.path.join(repo, 'tools/pool_baseline_ids.json')
BASE = set(json.load(open(base_p))) if os.path.exists(base_p) else set()
notes_p = os.path.join(repo, 'resources/pool500/notes.json')
NOTES = json.load(open(notes_p)) if os.path.exists(notes_p) else {}

def tier(e):
    t = e.get('difficulty')
    return t[0] if isinstance(t, list) else (t or 'medium')

rows = []
for e in evs:
    trig = e.get('trigger') or ['any']
    nt = e.get('node_type') or ['any']
    needs = []
    if e.get('requires_item'): needs.append(items.get(e['requires_item'], e['requires_item']) + ' aboard')
    if e.get('requires_flag'): needs.append('earlier: ' + e['requires_flag'].replace('_', ' '))
    if e.get('requires_crop_alive'): needs.append('a living crop')
    if e.get('requires_role'): needs.append(' and '.join('a ' + r + ' in the crew' for r in ([e['requires_role']] if isinstance(e['requires_role'], str) else e['requires_role'])))
    kind = 'Every station' if e['id'] == 'event_station_013' else ('Stop pool' if 'any' in trig else 'Triggered')
    rows.append({
        'id': e['id'], 'title': e.get('title', ''), 'tier': tier(e),
        'stops': ', '.join(STOP.get(n, n) for n in nt),
        'when': ', '.join(TRIG.get(t, t) for t in trig if t != 'any') or 'Drawn at a stop',
        'kind': kind, 'repeat': 'One-shot' if e.get('once') else 'Repeatable',
        'trails': ', '.join(TRAIL.get(t, t) for t in e['trail']) if e.get('trail') else 'All',
        'needs': '; '.join(needs), 'science': 'Yes' if e.get('science_link') else '',
        'minigame': 'Yes' if any(c.get('launch_minigame') for c in choices(e)) else '',
        'species': ', '.join(x.capitalize() for x in species(e)),
        'added': (NOTES.get(e['id'], {}).get('batch', 'new') if e['id'] not in BASE else 'Original') if BASE else 'Original',
    })
json.dump(rows, open(os.path.join(out, 'events.json'), 'w'), ensure_ascii=False)

# Stop pool by type and tier (Market Row and the approach play at every station: left out).
TIERS = ['easy', 'medium', 'hard', 'ultra']
def market(e): return e.get('station_approach') or any(c.get('open_market') for c in choices(e)) and e.get('node_type') == ['station'] and 'market' in e.get('title', '').lower()
pool = []
for key, label in STOP.items():
    for t in TIERS:
        sel = [e for e in evs if 'any' in (e.get('trigger') or ['any']) and not e.get('station_approach') and e['id'] != 'event_station_013'
               and tier(e) == t and key in (e.get('node_type') or ['any'])]
        pool.append({'stop': label, 'tier': t, 'events': len(sel), 'one_shot': sum(1 for e in sel if e.get('once')),
                     'repeatable': sum(1 for e in sel if not e.get('once'))})
ORDER = ['Any stop', 'Planet', 'Asteroid field', 'Nebula', 'Anomaly', 'Derelict', 'Void', 'Station', 'Fork']
pool.sort(key=lambda r: (ORDER.index(r['stop']) if r['stop'] in ORDER else 99, TIERS.index(r['tier'])))
json.dump(pool, open(os.path.join(out, 'pool_by_stop.json'), 'w'), ensure_ascii=False)

# Triggered events by condition.
tc = collections.defaultdict(lambda: collections.Counter())
for e in evs:
    trig = e.get('trigger') or ['any']
    if 'any' in trig:
        continue
    for t in trig:
        tc[TRIG.get(t, t)][tier(e)] += 1
trows = [{'trigger': k, 'events': sum(v.values()), **{t: v.get(t, 0) for t in TIERS}} for k, v in tc.items()]
trows.sort(key=lambda r: (-r['events'], r['trigger']))
json.dump(trows, open(os.path.join(out, 'triggered.json'), 'w'), ensure_ascii=False)

# Trail pools and draws.
mr = json.load(open(os.path.join(repo, 'modules/maps/map_rules.json')))['trails']
simR = json.load(open(sim))['results'] if sim else []
byid = {e['id']: e for e in evs}
tt = []
for tk, tl in TRAIL.items():
    rules = mr[tk]
    w0 = rules['event_difficulty_weights']
    w1 = (rules.get('late_difficulty') or {}).get('weights_at_arrival') or w0
    runs = [r for r in simR if r['trail'] == tk and r['policy'] == 'greedy']
    draws = [[i for i in r['stats']['eventIds'] if i and i in byid] for r in runs]
    allD = [tier(byid[i]) for x in draws for i in x]
    per = statistics.median(len(x) for x in draws) if draws else None
    for t in TIERS:
        elig = [e for e in evs if tier(e) == t and (not e.get('trail') or tk in e['trail'])
                and 'any' in (e.get('trigger') or ['any']) and not e.get('station_approach') and e['id'] != 'event_station_013']
        tt.append({'trail': tl, 'tier': t, 'eligible': len(elig), 'weight_start': w0.get(t, 0), 'weight_arrival': w1.get(t, 0),
                   'draw_share_pct': round(100 * allD.count(t) / len(allD), 1) if allD else None,
                   'draws_per_run': per, 'sim_runs': len(runs)})
json.dump(tt, open(os.path.join(out, 'trail_tiers.json'), 'w'), ensure_ascii=False)
# Species: every event that pins one, by who you meet.
ROLES = ['Pirates', 'Traders', 'Drifters', 'Station crew', 'Other']  # Other: hazards, forks, payoffs
sp = []
for k in ['insect', 'rock', 'water', 'reptile', 'robot', 'unknown', 'human']:
    sel = [e for e in evs if k in species(e)]
    sp.append({'species': k.capitalize(), 'events': len(sel), **{r: sum(1 for e in sel if role(e) == r) for r in ROLES},
               **{t: sum(1 for e in sel if tier(e) == t) for t in TIERS}})
json.dump(sp, open(os.path.join(out, 'species.json'), 'w'), ensure_ascii=False)

# The other random pools: every string in each flavor pool.
def leaves(x):
    if isinstance(x, str): return 1
    if isinstance(x, list): return sum(leaves(i) for i in x)
    if isinstance(x, dict): return sum(leaves(v) for v in x.values())
    return 0
fl = json.load(open(os.path.join(repo, 'modules/flavor/flavor_pools.json')))
fp = [{'pool': k.replace('_', ' '), 'strings': leaves(v)} for k, v in fl.items() if not k.startswith('_')]
fp.sort(key=lambda r: -r['strings'])
json.dump(fp, open(os.path.join(out, 'flavor_pools.json'), 'w'), ensure_ascii=False)
print(len(rows), 'events;', len(pool), 'pool rows;', len(trows), 'triggers;', len(tt), 'trail rows')

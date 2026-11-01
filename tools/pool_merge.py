"""Pool 500: merge a batch's lane drafts into the game.
usage: python3 -I tools/pool_merge.py b1
Reads resources/pool500/drafts/<batch>_*.json. Events go to
modules/events/events_species.json or events_voyage.json by id (a repeat id
replaces), flag payoffs and flavor_additions to flavor_pools.json, the writers' notes (tagged with the batch) to
resources/pool500/notes.json for the check and the batch report.
"""
import glob, json, os, sys

batch = sys.argv[1]
drafts = sorted(glob.glob(f'resources/pool500/drafts/{batch}_*.json'))
if not drafts:
    sys.exit('no drafts for ' + batch)
EV = 'modules/events/events_species.json'
VO = 'modules/events/events_voyage.json'
FL = 'modules/flavor/flavor_pools.json'
NO = 'resources/pool500/notes.json'
files = {f: {e['id']: e for e in json.load(open(f, encoding='utf8'))} for f in (EV, VO)}
flavor = json.load(open(FL, encoding='utf8'))
notes = json.load(open(NO, encoding='utf8')) if os.path.exists(NO) else {}
added = 0
for p in drafts:
    d = json.load(open(p, encoding='utf8'))
    for e in d['events']:
        home = files[VO if e['id'].startswith('event_voyage_') else EV]
        added += e['id'] not in home
        home[e['id']] = e
    flavor['flag_payoffs'].update(d.get('flag_payoffs') or {})
    for pool, lines in (d.get('flavor_additions') or {}).items():
        flavor[pool] += [x for x in lines if x not in flavor[pool]]
    for k, v in (d.get('notes') or {}).items():
        notes[k] = dict(v, batch=batch, lane=d.get('lane'))
for f, home in files.items():
    json.dump([home[k] for k in sorted(home)], open(f, 'w', encoding='utf8'), ensure_ascii=False, indent=2)
    open(f, 'a').write('\n')
json.dump(flavor, open(FL, 'w', encoding='utf8'), ensure_ascii=False, indent=2)
open(FL, 'a').write('\n')
json.dump(notes, open(NO, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print(f'{batch}: {added} new events from {len(drafts)} drafts; {sum(map(len, files.values()))} in the pool files')

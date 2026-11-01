"""Pool 500: merge a batch's lane drafts into the game.
usage: python3 -I tools/pool_merge.py b1
Reads resources/pool500/drafts/<batch>_*.json. Events go to
modules/events/events_species.json (a repeat id replaces), flag payoffs to
flavor_pools.json, the writers' notes (tagged with the batch) to
resources/pool500/notes.json for the check and the batch report.
"""
import glob, json, os, sys

batch = sys.argv[1]
drafts = sorted(glob.glob(f'resources/pool500/drafts/{batch}_*.json'))
if not drafts:
    sys.exit('no drafts for ' + batch)
EV = 'modules/events/events_species.json'
FL = 'modules/flavor/flavor_pools.json'
NO = 'resources/pool500/notes.json'
events = {e['id']: e for e in json.load(open(EV, encoding='utf8'))}
flavor = json.load(open(FL, encoding='utf8'))
notes = json.load(open(NO, encoding='utf8')) if os.path.exists(NO) else {}
added = 0
for p in drafts:
    d = json.load(open(p, encoding='utf8'))
    for e in d['events']:
        added += e['id'] not in events
        events[e['id']] = e
    flavor['flag_payoffs'].update(d.get('flag_payoffs') or {})
    for k, v in (d.get('notes') or {}).items():
        notes[k] = dict(v, batch=batch, lane=d.get('lane'))
out = [events[k] for k in sorted(events)]
json.dump(out, open(EV, 'w', encoding='utf8'), ensure_ascii=False, indent=2)
open(EV, 'a').write('\n')
json.dump(flavor, open(FL, 'w', encoding='utf8'), ensure_ascii=False, indent=2)
open(FL, 'a').write('\n')
json.dump(notes, open(NO, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print(f'{batch}: {added} new events from {len(drafts)} drafts; {len(out)} in events_species.json')

"""Pool 500: one readable document per batch, for the owner's text review.
usage: python3 -I tools/pool_review_doc.py b1 resources/NEW_EVENTS_POOL500_B1.md
"""
import json, sys, collections

batch, out = sys.argv[1], sys.argv[2]
evs = [e for f in ('species', 'voyage') for e in json.load(open(f'modules/events/events_{f}.json', encoding='utf8'))]
notes = json.load(open('resources/pool500/notes.json', encoding='utf8'))
sel = [e for e in evs if notes.get(e['id'], {}).get('batch') == batch]
AIS = ['aria', 'marv', 'rex', 'chip', 'ajoy']

def fx(o):
    bits = []
    for k, v in (o.get('resources') or {}).items():
        if v: bits.append(f'{k} {v:+}')
    for k, v in (o.get('materials') or {}).items(): bits.append(f'+{v} {k}')
    g = o.get('item_grant')
    if g: bits.append('gets ' + ', '.join([g] if isinstance(g, str) else g))
    if o.get('item_consume'): bits.append(f"spends {o['item_consume']}")
    if o.get('crop_health'): bits.append(f"crop {o['crop_health']:+}")
    if o.get('severity'): bits.append(o['severity'])
    if o.get('crew_effect'): bits.append(o['crew_effect'].get('type', ''))
    if o.get('sets_flag'): bits.append(f"flag {o['sets_flag']}")
    bits.append(str(o.get('time_cost', f"{o.get('time_days')} days")))
    return ' · '.join(bits)

def choice(w, c, ev):
    gate = c.get('requires_crew') or c.get('requires_item') or c.get('requires_flag') or c.get('gate') or ''
    tag = f' [{json.dumps(gate) if isinstance(gate, dict) else gate}]' if gate else ''
    w(f"- **{c.get('text')}**{tag}" + (f" ({c['sub']})" if c.get('sub') else ''))
    o = c.get('outcome')
    if isinstance(o, str): o = (ev.get('outcomes') or {}).get(o)
    if c.get('triggerCombat'): w('  - Starts a fight.')
    if c.get('open_market'): w('  - Opens the market.')
    if c.get('next'): w(f"  - Goes to: {c['next']}")
    if isinstance(o, dict):
        w(f"  - {o.get('title', '')+': ' if o.get('title') else ''}{o.get('narrative') or o.get('body')}")
        w(f"  - *{fx(o)}*")
    for t, x in (c.get('tier_outcomes') or {}).items():
        w(f"  - {t}: {x.get('narrative')}")

L = []
w = L.append
w(f'# Pool 500, batch {batch[1:]}: read-through\n')
w(f'{len(sel)} events. ' + ', '.join(f'{v} {k}' for k, v in collections.Counter(e['difficulty'] for e in sel).items()) + '.\n')
lane = None
for e in sel:
    n = notes.get(e['id'], {})
    if n.get('lane') != lane:
        lane = n.get('lane'); w(f'\n---\n\n## {str(lane).capitalize()}\n')
    w(f"\n### {e['title']} ({e['difficulty']})\n")
    w(f"`{e['id']}` · {', '.join(e['node_type'])} · {'one-shot' if e['once'] else 'repeatable'}"
      + (f" · needs {e['requires_flag']}" if e.get('requires_flag') else '') + (f" · {', '.join(e['trigger'])}" if e['trigger'] != ['any'] else '') + '\n')
    w(f"*Inspired by:* {n.get('inspired_by')}. {n.get('how')}\n")
    if e.get('science_link'): w(f"*Science:* {e['science_link']['label']} ({e['science_link']['url']}). {e['science_link']['text']}\n")
    if e.get('layers'):
        for k, l in e['layers'].items():
            w(f"**{l.get('title', k)}**\n"); w(l.get('body', '') + '\n')
            if l.get('line'): w(f"> {l['line']}\n")
            for a in AIS: w(f"- {a.upper()}: {(l.get('ai') or {}).get(a)}")
            w('')
            for c in l.get('choices') or []: choice(w, c, e)
            w('')
    else:
        w(e['body'] + '\n')
        for a in AIS: w(f"- {a.upper()}: {e['ai_flavor'].get(a)}")
        w('')
        for c in e.get('choices') or []: choice(w, c, e)
open(out, 'w', encoding='utf8').write('\n'.join(L) + '\n')
print(out, len(L), 'lines')

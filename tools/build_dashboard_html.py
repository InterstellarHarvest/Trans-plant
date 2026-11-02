"""The event dashboard as one self-contained local page: no server, no network.
usage: python3 -I tools/build_dashboard_html.py <repo> <out.html> [sim.json]
Runs build_dashboard_data.py, then writes tools/event_dashboard_template.html
with its datasets inlined. sim.json: sim_batch.sh output, for the draw figures.
"""
import datetime, glob, json, os, subprocess, sys, tempfile

repo, out = sys.argv[1], sys.argv[2]
sim = sys.argv[3:4]
here = os.path.dirname(os.path.abspath(__file__))
with tempfile.TemporaryDirectory() as d:
    subprocess.run([sys.executable, '-I', os.path.join(here, 'build_dashboard_data.py'), repo, d] + sim, check=True)
    data = {os.path.basename(f)[:-5]: json.load(open(f, encoding='utf8')) for f in glob.glob(os.path.join(d, '*.json'))}
page = open(os.path.join(here, 'event_dashboard_template.html'), encoding='utf8').read()
blob = json.dumps(data, ensure_ascii=False).replace('</', '<\\/')
page = page.replace('/*__DATA__*/{}', blob).replace('__BUILT__', datetime.date.today().isoformat())
open(out, 'w', encoding='utf8').write(page)
print(f"{out}: {len(data['events'])} events")

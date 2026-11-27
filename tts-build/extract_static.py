"""Collect, from the HTML, the texts the pages send to speechSynthesis (data-say, data-say-host,
data-lire targets, flashcard arrays). Output: tts-build/phrases_static.json"""
import re, json, html, os, subprocess
from html.parser import HTMLParser
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
def norm(t): return re.sub(r"\s+", " ", html.unescape(t)).strip()
class ById(HTMLParser):
    def __init__(s, ids):
        super().__init__(convert_charrefs=True); s.ids=ids; s.stack=[]; s.out={}
    def handle_starttag(s, tag, attrs):
        a=dict(attrs)
        if tag in ("br","img","input","meta","link","hr","source"): return
        s.stack.append(a.get("id") if a.get("id") in s.ids else None)
    def handle_endtag(s, tag):
        if tag in ("br","img","input","meta","link","hr","source"): return
        if s.stack: s.stack.pop()
    def handle_data(s, d):
        for i in s.stack:
            if i: s.out[i]=s.out.get(i,"")+d
files = subprocess.run(["git","-c","core.quotepath=off","ls-files","*.html"],cwd=ROOT,capture_output=True,text=True).stdout.splitlines()
out = {}
for f in files:
    s = open(os.path.join(ROOT,f), encoding="utf-8", errors="ignore").read()
    if "SpeechSynthesis" not in s: continue
    found = set()
    for m in re.finditer(r'data-say(?:-host)?="([^"]+)"', s): found.add(norm(m.group(1)))
    for m in re.finditer(r"data-say(?:-host)?='([^']+)'", s): found.add(norm(m.group(1)))
    ids = set(re.findall(r'data-lire="([^"]+)"', s))
    if ids:
        p = ById(ids); p.feed(s)
        for v in p.out.values(): found.add(norm(v))
    for m in re.finditer(r'push\(\["cartes","[^"]+",(\[\[.*?\]\])\]\)', s):
        try:
            for c in json.loads(m.group(1)):
                found.add(norm(c[3] if len(c) > 3 and c[3] else c[0]))
        except Exception: pass
    found = {x for x in found if x and len(x) < 6000}
    if found: out[f] = sorted(found)
json.dump(out, open(os.path.join(ROOT,"tts-build","phrases_static.json"),"w",encoding="utf-8"), ensure_ascii=False, indent=0)
u = set(x for v in out.values() for x in v)
print("pages", len(out), "unique", len(u), "chars", sum(map(len,u)))

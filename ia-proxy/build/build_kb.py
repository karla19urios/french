"""Builds ia-proxy/src/kb.json: the text of every lesson of the site, split into chunks,
with a BM25 inverted index. The Worker uses it to give Claude the relevant parts of the course.
Run after changing the site:   python3 ia-proxy/build/build_kb.py   (then commit and push)"""
import re, subprocess, html, json, unicodedata, sys
from html.parser import HTMLParser
import os
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
N = lambda s: unicodedata.normalize("NFC", s)
files = subprocess.run(["git","-c","core.quotepath=off","ls-files","*.html"],cwd=ROOT,capture_output=True,text=True).stdout.splitlines()
SKIP_TAGS = {"script","style","noscript","svg","template","select","option","button","nav","footer"}
class P(HTMLParser):
    def __init__(s):
        super().__init__(convert_charrefs=True); s.out=[]; s.skip=0; s.gate=0; s.depth_gate=0
    def handle_starttag(s,tag,attrs):
        a=dict(attrs)
        if s.gate: s.depth_gate+= (tag not in ("br","img","input","meta","link","hr")); return
        if a.get("id")=="site-gate-overlay": s.gate=1; s.depth_gate=1; return
        if tag in SKIP_TAGS: s.skip+=1
        if tag in ("p","div","li","h1","h2","h3","h4","tr","section","article","br","dt","dd","summary","details"): s.out.append("\n")
        if tag in ("h1","h2","h3","h4"): s.out.append("## ")
        if tag=="input" and a.get("data-a"): s.out.append("[" + a["data-a"].split("|")[0] + "]")
    def handle_endtag(s,tag):
        if s.gate:
            if tag not in ("br","img","input","meta","link","hr"): s.depth_gate-=1
            if s.depth_gate<=0: s.gate=0
            return
        if tag in SKIP_TAGS and s.skip: s.skip-=1
        if tag in ("td","th"): s.out.append(" | ")
    def handle_data(s,d):
        if not s.skip and not s.gate: s.out.append(d)
def page_text(raw):
    p=P(); p.feed(raw); t="".join(p.out)
    t=re.sub(r"[ \t ]+"," ",t); t=re.sub(r"\n\s*\n+","\n",t)
    lines=[l.strip() for l in t.split("\n") if len(l.strip())>2]
    return "\n".join(lines)
pages=[]
for f in files:
    f=N(f)
    if f.startswith(("ia-proxy/",)) : continue
    raw=open(f"{ROOT}/{f}",encoding="utf-8",errors="ignore").read()
    m=re.search(r"<title>([^<]*)</title>",raw); title=html.unescape(m.group(1)).strip() if m else f
    pages.append({"path":f,"title":title,"text":page_text(raw)})

import urllib.parse
OUT = os.path.join(ROOT, "ia-proxy", "src", "kb.json")
BASE = "https://karla19urios.github.io/french/"
HUBS = ("index.html", "grammaire.html", "lectures.html", "ateliers.html", "niveaux.html", "estudiantes.html", "tcf.html")
STOP = set("""je tu il elle nous vous ils elles on le la les l un une des de du d et ou est sont a ai as ont pas ne n ce cet cette ces c se s sa son ses mon ma mes ton ta tes leur leurs notre nos votre vos pour dans sur avec par au aux plus tres bien mais si qu
the of and to is in it you for are with this that""".split())

def norm(s):
    s = unicodedata.normalize("NFD", s.lower())
    return "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
def toks(s):
    out = []
    for t in re.findall(r"[a-z]+", norm(s)):
        if t in STOP: continue
        if len(t) < 2 and t != "y": continue
        if len(t) > 4 and t.endswith(("s", "x")): t = t[:-1]
        out.append(t)
    return out
def level(path):
    seg = path.split("/")[0]
    if seg.endswith(".html"):
        return "TCF" if seg.startswith("tcf") else "TEF" if seg.startswith("tef") else "Général"
    return seg.replace("Workshops-", "Workshops ").replace("-", "/")

site_map, chunks = [], []
for p in pages:
    path = p["path"]
    if path.split("/")[-1] in HUBS: continue
    url = BASE + urllib.parse.quote(path)
    lvl = level(path)
    pid = len(site_map)
    site_map.append({"t": p["title"], "u": url, "l": lvl})
    # split on headings, then into ~1400-char pieces
    secs, cur, head = [], [], p["title"]
    for line in p["text"].split("\n"):
        if line.startswith("## "):
            if cur: secs.append((head, cur))
            head, cur = line[3:].strip(), []
        else:
            cur.append(line)
    if cur: secs.append((head, cur))
    for head, lines in secs:
        buf = ""
        for line in lines:
            if len(buf) + len(line) > 1400 and len(buf) > 300:
                chunks.append({"p": pid, "h": head[:120], "x": buf.strip()}); buf = ""
            buf += line + "\n"
        if len(buf.strip()) > 40:
            chunks.append({"p": pid, "h": head[:120], "x": buf.strip()})

# inverted index for BM25 (title/heading terms counted 3x)
postings, lens = {}, []
for i, c in enumerate(chunks):
    terms = toks(c["x"]) + 3 * toks(c["h"] + " " + site_map[c["p"]]["t"])
    lens.append(len(terms))
    tf = {}
    for t in terms: tf[t] = tf.get(t, 0) + 1
    for t, n in tf.items(): postings.setdefault(t, []).extend([i, n])
N = len(chunks)
# drop terms that appear almost everywhere (no signal) to save space
postings = {t: v for t, v in postings.items() if len(v) // 2 < 0.5 * N}
kb = {"map": site_map, "chunks": chunks, "lens": lens, "avg": sum(lens) / N, "idx": postings}
s = json.dumps(kb, ensure_ascii=False, separators=(",", ":"))
open(OUT, "w", encoding="utf-8").write(s)
print("pages", len(site_map), "chunks", N, "terms", len(postings), "bytes", len(s.encode()))

"""A2 gap-fill dialogues: one Quebec voice per character (instead of one voice for the whole scene).

The written lines were removed from the lessons (listening only), so the speakers are read from the
version just before that change (git commit bda92b2~1). Each dialogue's spoken text (the data-say of
its "Écouter la scène" button, which may spell numbers out) is aligned with the written lines to know
who says what, then synthesized with SSML, one <voice> per turn. The MP3 replaces assets/tts/<key>.mp3
(key = hash of the data-say text, so assets/tts.js plays it with no page change).
Run: python3 tts-build/a2_dialogues.py [--dry]
"""
import re, os, sys, json, html, glob, time, difflib, subprocess, urllib.request, urllib.error
sys.path.insert(0, os.path.dirname(__file__))
from generate import cyrb53, norm, load_secret

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
FEM = {"Inès", "Lucie", "Maman", "Cliente", "Lou", "Alice", "Nina", "Vendeuse", "Léa", "Maya", "Sarah",
       "Nora", "Sofia", "Amina", "Clara", "Nouvelle", "Nadia", "Voyageuse", "Réceptionniste"}
MEN = ["fr-CA-AntoineNeural", "fr-CA-JeanNeural", "fr-CA-ThierryNeural"]
WOMAN = "fr-CA-SylvieNeural"
WOMAN2 = "fr-FR-DeniseNeural"   # Quebec has a single female voice: a second woman in the scene speaks with a voice from France

def plain(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s))).strip()

def words(s):
    return re.findall(r"[\w'’-]+", s.lower())

def turns_for(lines, spoken):
    """split the spoken text into consecutive turns, one per written line"""
    toks = list(re.finditer(r"\S+", spoken))
    sw = [words(t.group(0))[0] if words(t.group(0)) else "" for t in toks]
    lw, owner = [], []
    for i, (_, txt) in enumerate(lines):
        for w in words(txt): lw.append(w); owner.append(i)
    who = [None] * len(toks)
    for a, b, n in difflib.SequenceMatcher(None, sw, lw, autojunk=False).get_matching_blocks():
        for k in range(n): who[a + k] = owner[b + k]
    cur = 0
    for i in range(len(who)):          # unmatched words (spelled-out numbers…) stay with the previous turn
        if who[i] is None or who[i] < cur: who[i] = cur
        cur = who[i]
    out = []
    for t, w in zip(toks, who):
        if out and out[-1][0] == w: out[-1][1].append(t.group(0))
        else: out.append([w, [t.group(0)]])
    return [(lines[w][0], " ".join(ws)) for w, ws in out]

def dialogues():
    n = 0
    for f in sorted(glob.glob(os.path.join(ROOT, "A2/Actividades A2/*.html"))):
        rel = os.path.relpath(f, ROOT)
        old = subprocess.run(["git", "show", "bda92b2~1:" + rel], cwd=ROOT, capture_output=True, text=True).stdout
        for d in re.finditer(r'<div class="dial">(.*?)</button></div></div>', old, re.S):
            blk = d.group(1)
            lines = [(plain(a), plain(b)) for a, b in re.findall(r'<span class="qui">(.*?)</span><span class="dit">(.*?)</span>', blk)]
            spoken = html.unescape(re.search(r'data-say="([^"]+)"', blk).group(1))
            names = list(dict.fromkeys(w for w, _ in lines))
            voices, men = {}, 0
            women = 0
            for nm in names:
                if nm in FEM:
                    voices[nm] = (WOMAN if women == 0 else WOMAN2, "+0%"); women += 1
                else:
                    voices[nm] = (MEN[(n + men) % 3], "+0%"); men += 1
            n += 1
            yield rel, spoken, turns_for(lines, spoken), voices

def ssml(turns, voices):
    body = "".join(
        f'<voice name="{voices[w][0]}"><prosody rate="-6%" pitch="{voices[w][1]}">{html.escape(t, quote=False)}'
        f'<break time="300ms"/></prosody></voice>' for w, t in turns)
    return f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="fr-CA">{body}</speak>'

def main():
    dry = "--dry" in sys.argv
    key, region = (None, None) if dry else load_secret()
    url = f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1"
    mpath = os.path.join(ROOT, "assets", "tts", "manifest.json")
    manifest = json.load(open(mpath, encoding="utf-8"))
    for rel, spoken, turns, voices in dialogues():
        k = cyrb53(norm(spoken))
        assert k in manifest, (rel, spoken[:40])
        assert norm(" ".join(t for _, t in turns)) == norm(spoken)
        if dry:
            print(rel.split("/")[-1][:24], {n: v[0][6:-6] + (" aigu" if v[1] != "+0%" else "") for n, v in voices.items()})
            for w, t in turns: print("     ", w, "|", t)
            continue
        for attempt in range(6):
            try:
                req = urllib.request.Request(url, data=ssml(turns, voices).encode("utf-8"), method="POST", headers={
                    "Ocp-Apim-Subscription-Key": key, "User-Agent": "course-site-tts",
                    "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3"})
                data = urllib.request.urlopen(req, timeout=120).read()
                open(os.path.join(ROOT, "assets", "tts", k + ".mp3"), "wb").write(data)
                manifest[k] = "dialogue:" + ",".join(v[0][6:-6] for v in voices.values())
                break
            except urllib.error.HTTPError as e:
                if e.code in (429, 500, 502, 503, 504): time.sleep(15 * (attempt + 1)); continue
                print("HTTP", e.code, rel); break
        print("ok", rel.split("/")[-1][:30], manifest[k], flush=True)
        time.sleep(3.5)
    if not dry:
        json.dump(manifest, open(mpath, "w", encoding="utf-8"), separators=(",", ":"))

if __name__ == "__main__":
    main()

"""B1 listening scenes: one voice per character, instead of the device's robot reading the whole scene.

Each B1 lesson holds two scenes (<div class="dial">): the written turns, and an "Écouter la scène"
button whose data-say carries the spoken text. The turns are aligned with that spoken text to know who
says what, then synthesized with SSML, one <voice> per turn. The MP3 lands on assets/tts/<key>.mp3
(key = hash of the data-say text), so assets/tts.js picks it up with no change to any lesson.

Voices follow the site's convention: Quebec first (one woman, three men), a France voice only when a
scene needs a second woman. VOICES below says who speaks with what, read off the scenes themselves:
the roles that name a gender (Serveuse, Candidat) keep it, and the neutral ones (Agent, Témoin) take
whichever voice contrasts with the other speaker, so a learner can always tell the two apart.

Run: python3 tts-build/b1_dialogues.py [--dry]
"""
import re, os, sys, json, html, glob, time, difflib, urllib.request, urllib.error
sys.path.insert(0, os.path.dirname(__file__))
from generate import cyrb53, norm, load_secret

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "assets", "tts")
FORMAT = "audio-24khz-48kbitrate-mono-mp3"
RATE = "-6%"          # same reading speed as the rest of the site
BREAK = "300ms"       # silence between turns
DELAY = 3.5           # seconds between requests (free tier is rate limited)

W1 = "fr-CA-SylvieNeural"      # the only Quebec woman
W2 = "fr-FR-DeniseNeural"      # a second woman, for the one scene with two
M1 = "fr-CA-AntoineNeural"
M2 = "fr-CA-JeanNeural"
M3 = "fr-CA-ThierryNeural"

# lesson number -> speaker -> voice.  "Annonce" covers Annonce 1…6 (one station PA voice);
# "" is a turn that continues the previous speaker.
VOICES = {
    "01": {"Annonce": W1,                                    # platform announcements, one voice
           "Standardiste": W1, "Appelant": M1},              # the caller names himself: Thomas Nguyen
    "02": {"Serveuse": W1, "Client": M2,
           "Locataire": W1, "Propriétaire": M3},             # "Bonjour Monsieur Keller" -> the owner is a man
    "03": {"Recruteuse": W1, "Candidat": M1,
           "Nadia": W1, "Yann": M2},
    "04": {"Conseiller": M3, "Cliente": W1,
           "Animateur": M1, "Sociologue": M2, "Élue locale": W1},   # three speakers on the radio set
    "05": {"Visiteuse": W1, "Agent": M3,
           "Étudiante": W1, "Secrétaire": M1},
    "06": {"Policier": M2, "Témoin": W1,
           "Vendeur": M1, "Client": M3},                     # two men: two different men's voices
    "07": {"Cliente": W1, "Réceptionniste": M2,
           "Commentateur": M3},
    "08": {"Présentatrice": W1,
           "Journaliste": M1},
    "09": {"Brève 1": W1, "Brève 2": W1,                     # one bulletin reader for both briefs
           "Médecin": W1, "Patient": M2},
    "10": {"Journaliste": M3, "Candidate": W1,
           "Animatrice": W1, "Invitée": W2},                 # two women: the second takes a France voice
}


def plain(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s))).strip()


def words(s):
    return re.findall(r"[\w'’-]+", s.lower())


def turns_for(lines, spoken):
    """Split the spoken text into consecutive turns, one per written line."""
    toks = list(re.finditer(r"\S+", spoken))
    sw = [words(t.group(0))[0] if words(t.group(0)) else "" for t in toks]
    lw, owner = [], []
    for i, (_, txt) in enumerate(lines):
        for w in words(txt):
            lw.append(w)
            owner.append(i)
    who = [None] * len(toks)
    for a, b, n in difflib.SequenceMatcher(None, sw, lw, autojunk=False).get_matching_blocks():
        for k in range(n):
            who[a + k] = owner[b + k]
    cur = 0
    for i in range(len(who)):       # unmatched words (spelled-out numbers…) stay with the previous turn
        if who[i] is None or who[i] < cur:
            who[i] = cur
        cur = who[i]
    out = []
    for t, w in zip(toks, who):
        if out and out[-1][0] == w:
            out[-1][1].append(t.group(0))
        else:
            out.append([w, [t.group(0)]])
    return [(lines[w][0], " ".join(ws)) for w, ws in out]


def voice_for(lesson, speaker):
    table = VOICES[lesson]
    if speaker in table:
        return table[speaker]
    if speaker.split()[0] in table:          # "Annonce 3" -> "Annonce"
        return table[speaker.split()[0]]
    raise KeyError(f"lesson {lesson}: no voice for {speaker!r}")


def scenes():
    for f in sorted(glob.glob(os.path.join(ROOT, "B1/Actividades B1/*.html"))):
        rel = os.path.relpath(f, ROOT)
        lesson = os.path.basename(f)[:2]
        s = open(f, encoding="utf-8").read()
        for m in re.finditer(r'<div class="dial">(.*?)</button></div></div>', s, re.S):
            blk = m.group(1)
            lieu = plain(re.search(r'<div class="lieu">(.*?)</div>', blk).group(1)) if '<div class="lieu">' in blk else ""
            raw = [(plain(a), plain(b)) for a, b in
                   re.findall(r'<span class="qui">(.*?)</span><span class="dit">(.*?)</span>', blk)]
            lines, last = [], None
            for who, txt in raw:                 # an empty name continues the previous speaker
                last = who or last
                lines.append((last, txt))
            spoken = html.unescape(re.search(r'data-say="([^"]+)"', blk).group(1))
            yield rel, lesson, lieu, spoken, turns_for(lines, spoken)


def ssml(lesson, turns):
    body = "".join(
        f'<voice name="{voice_for(lesson, who)}"><prosody rate="{RATE}">'
        f'{html.escape(txt, quote=False)}<break time="{BREAK}"/></prosody></voice>'
        for who, txt in turns)
    return ('<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" '
            f'xml:lang="fr-CA">{body}</speak>')


def main():
    dry = "--dry" in sys.argv
    key, region = (None, None) if dry else load_secret()
    url = f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1"
    mpath = os.path.join(OUT, "manifest.json")
    manifest = json.load(open(mpath, encoding="utf-8"))

    for rel, lesson, lieu, spoken, turns in scenes():
        k = cyrb53(norm(spoken))
        # the aligner must account for every spoken word, or someone's line would be read by the wrong voice
        assert norm(" ".join(t for _, t in turns)) == norm(spoken), rel
        cast = {}
        for who, _ in turns:
            cast.setdefault(who, voice_for(lesson, who))
        if dry:
            print(f'\n### {rel.split("/")[-1][:40]}  ·  {lieu}   [{k}]')
            for who, v in cast.items():
                print(f'     {who:16} {v}')
            for who, txt in turns:
                print(f'       {who:16} | {txt[:96]}')
            continue
        for attempt in range(6):
            try:
                req = urllib.request.Request(url, data=ssml(lesson, turns).encode("utf-8"), method="POST",
                                             headers={"Ocp-Apim-Subscription-Key": key,
                                                      "User-Agent": "course-site-tts",
                                                      "Content-Type": "application/ssml+xml",
                                                      "X-Microsoft-OutputFormat": FORMAT})
                data = urllib.request.urlopen(req, timeout=120).read()
                open(os.path.join(OUT, k + ".mp3"), "wb").write(data)
                manifest[k] = "dialogue:" + ",".join(sorted({v[6:-6] for v in cast.values()}))
                print(f'ok {rel.split("/")[-1][:34]:34} {len(data):7} o  {manifest[k]}', flush=True)
                break
            except urllib.error.HTTPError as e:
                wait = int(e.headers.get("Retry-After") or 0) or 15 * (attempt + 1)
                if e.code in (429, 500, 502, 503, 504):
                    print(f'  HTTP {e.code}, waiting {wait}s', flush=True)
                    time.sleep(wait)
                    continue
                print(f'  HTTP {e.code} on {rel}', flush=True)
                break
            except Exception as e:
                print("  network error, retrying:", type(e).__name__, flush=True)
                time.sleep(15)
        json.dump(manifest, open(mpath, "w", encoding="utf-8"), separators=(",", ":"))
        time.sleep(DELAY)


if __name__ == "__main__":
    main()

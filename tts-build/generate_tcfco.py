"""Audio for tcf-comprehension-orale.html (10 model exams) with Azure Quebec voices (fr-CA).

One MP3 per listening unit, named like the page's audio ids:
  Famille 1  eX-qN-ans  : the 4 sentences, each announced by its letter, 3 s of silence between them
  Famille 2  eX-qN-p    : the question someone asks
             eX-qN-ans  : the 4 possible reactions, announced by letter, 3 s between them (another voice)
  Famille 3  eX-qN-doc  : the conversation, speaker A and speaker B with two different voices,
                          then the narrator reads the question, as in the real exam
The narrator (letters and questions) is always Thierry; the other voices rotate between questions.

Input : tts-build/tcfco_exams.json (the EXAMS array of the page)
Output: tcf-co/audio/<id>.mp3 and tcf-co/audio/list.json (ids that have an MP3)
Secret: ~/.config/azure-tts.env (see generate.py). Resumable. Run: python3 tts-build/generate_tcfco.py [--limit N]
"""
import json, os, sys, time, html, urllib.request, urllib.error

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "tcf-co", "audio")
FORMAT = "audio-24khz-48kbitrate-mono-mp3"
DELAY = 3.2
NARR = "fr-CA-ThierryNeural"
CAST = ["fr-CA-SylvieNeural", "fr-CA-AntoineNeural", "fr-CA-JeanNeural"]
# speaker pairs for the conversations: always one woman and one man, in both orders
PAIRS = [("fr-CA-SylvieNeural", "fr-CA-AntoineNeural"), ("fr-CA-JeanNeural", "fr-CA-SylvieNeural"),
         ("fr-CA-SylvieNeural", "fr-CA-JeanNeural"), ("fr-CA-AntoineNeural", "fr-CA-SylvieNeural")]
LETTERS = "ABCD"

def load_secret():
    env = {}
    for line in open(os.path.expanduser("~/.config/azure-tts.env"), encoding="utf-8"):
        if "=" in line:
            k, v = line.strip().split("=", 1); env[k] = v
    return env["AZURE_TTS_KEY"], env["AZURE_TTS_REGION"]

def x(t):
    return html.escape(t, quote=False)

def say(voice, inner, rate="-4%"):
    return f'<voice name="{voice}"><prosody rate="{rate}">{inner}</prosody></voice>'

def lettered(items, voice):
    parts = []
    for i, t in enumerate(items):
        lead = '<break time="3000ms"/>' if i else ""
        parts.append(say(NARR, f'{lead}{LETTERS[i]}.<break time="500ms"/>') + say(voice, x(t)))
    return "".join(parts)

def units(exams):
    """yield (id, ssml body)"""
    for e in exams:
        for q in e["questions"]:
            qid = f'e{e["id"]}-q{q["n"]}'
            k = e["id"] * 41 + q["n"]
            if q["fam"] == 1:
                yield qid + "-ans", lettered(q["sentences"], CAST[k % 3])
            elif q["fam"] == 2:
                a, b = CAST[k % 3], CAST[(k + 1) % 3]
                yield qid + "-p", say(a, x(q["prompt"]))
                yield qid + "-ans", lettered(q["options"], b)
            else:
                va, vb = PAIRS[k % len(PAIRS)]
                body = []
                for line in q["document"].split("\n"):
                    line = line.strip()
                    if not line: continue
                    sp, txt = line.split(":", 1)
                    body.append(say(va if sp.strip() == "A" else vb, x(txt.strip()) + '<break time="350ms"/>'))
                body.append(say(NARR, '<break time="1200ms"/>' + x(q["consigne"])))
                yield qid + "-doc", "".join(body)

def main():
    limit = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else None
    key, region = load_secret()
    url = f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1"
    exams = json.load(open(os.path.join(ROOT, "tts-build", "tcfco_exams.json"), encoding="utf-8"))
    os.makedirs(OUT, exist_ok=True)
    allu = list(units(exams))
    todo = [(i, s) for i, s in allu if not os.path.exists(os.path.join(OUT, i + ".mp3"))]
    print(f"units: {len(allu)}, to generate: {len(todo)}", flush=True)
    for n, (uid, body) in enumerate(todo[:limit], 1):
        ssml = f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="fr-CA">{body}</speak>'
        for attempt in range(6):
            try:
                req = urllib.request.Request(url, data=ssml.encode("utf-8"), method="POST", headers={
                    "Ocp-Apim-Subscription-Key": key, "User-Agent": "course-site-tts",
                    "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": FORMAT})
                data = urllib.request.urlopen(req, timeout=120).read()
                tmp = os.path.join(OUT, uid + ".part")
                open(tmp, "wb").write(data); os.replace(tmp, os.path.join(OUT, uid + ".mp3"))
                break
            except urllib.error.HTTPError as e:
                wait = int(e.headers.get("Retry-After") or 0) or (15 * (attempt + 1))
                if e.code in (429, 500, 502, 503, 504):
                    print(f"  HTTP {e.code}, waiting {wait}s", flush=True); time.sleep(wait); continue
                print(f"  HTTP {e.code} for {uid}, skipped", flush=True); break
            except Exception as e:
                print("  network error, retrying:", type(e).__name__, flush=True); time.sleep(15)
        if n % 25 == 0: print(f"  {n}/{len(todo)}", flush=True)
        time.sleep(DELAY)
    done = sorted(i for i, _ in allu if os.path.exists(os.path.join(OUT, i + ".mp3")))
    json.dump(done, open(os.path.join(OUT, "list.json"), "w"), separators=(",", ":"))
    print(f"finished: {len(done)} of {len(allu)} MP3", flush=True)

if __name__ == "__main__":
    main()

"""Generate one MP3 per phrase with Azure neural voices (Quebec French), for every text the site speaks.

Input : tts-build/phrases_static.json + tts-build/phrases_runtime.json  ({page: [texts]})
Output: assets/tts/<key>.mp3 and assets/tts/manifest.json  ({key: voice})
Key   : cyrb53 hash of the whitespace-normalized text (same function as assets/tts.js)
Secret: ~/.config/azure-tts.env with AZURE_TTS_KEY and AZURE_TTS_REGION (never printed)

Resumable: phrases whose MP3 already exists are skipped. Run:  python3 tts-build/generate.py [--limit N]
"""
import json, os, re, sys, time, html, urllib.request, urllib.error

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "assets", "tts")
FORMAT = "audio-24khz-48kbitrate-mono-mp3"
DELAY = 3.2          # seconds between requests (free F0 tier is rate limited)

def norm(t):
    return re.sub(r"\s+", " ", t).strip()

def cyrb53(s, seed=0):
    M = 0xFFFFFFFF
    imul = lambda a, b: (a * b) & M
    h1, h2 = (0xdeadbeef ^ seed) & M, (0x41c6ce57 ^ seed) & M
    units = s.encode("utf-16-le")
    for i in range(0, len(units), 2):
        ch = units[i] | (units[i + 1] << 8)
        h1 = imul(h1 ^ ch, 2654435761)
        h2 = imul(h2 ^ ch, 1597334677)
    h1 = imul(h1 ^ (h1 >> 16), 2246822507)
    h1 ^= imul(h2 ^ (h2 >> 13), 3266489909)
    h2 = imul(h2 ^ (h2 >> 16), 2246822507)
    h2 ^= imul(h1 ^ (h1 >> 13), 3266489909)
    return format(4294967296 * (2097151 & h2) + (h1 & M), "x")

def load_secret():
    env = {}
    p = os.path.expanduser("~/.config/azure-tts.env")
    for line in open(p, encoding="utf-8"):
        if "=" in line:
            k, v = line.strip().split("=", 1); env[k] = v
    return env["AZURE_TTS_KEY"], env["AZURE_TTS_REGION"]

def request(url, key, data=None, headers=None):
    h = {"Ocp-Apim-Subscription-Key": key, "User-Agent": "course-site-tts"}
    h.update(headers or {})
    req = urllib.request.Request(url, data=data, headers=h, method="POST" if data else "GET")
    return urllib.request.urlopen(req, timeout=120)

def main():
    limit = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else None
    key, region = load_secret()
    base = f"https://{region}.tts.speech.microsoft.com/cognitiveservices"
    voices = json.load(request(base + "/voices/list", key))
    ca = sorted(v["ShortName"] for v in voices if v.get("Locale") == "fr-CA" and v["ShortName"].endswith("Neural"))
    fem = [v["ShortName"] for v in voices if v["ShortName"] in ca and v.get("Gender") == "Female"]
    mal = [v["ShortName"] for v in voices if v["ShortName"] in ca and v.get("Gender") == "Male"]
    # alternate women and men so lessons hear several Quebec voices
    rota = []
    for i in range(max(len(fem), len(mal)) * 2):
        src = fem if i % 2 == 0 else mal
        if src: rota.append(src[(i // 2) % len(src)])
    print("voices:", ", ".join(ca), flush=True)

    texts = set()
    for name in ("phrases_static.json", "phrases_runtime.json"):
        p = os.path.join(ROOT, "tts-build", name)
        if os.path.exists(p):
            for v in json.load(open(p, encoding="utf-8")).values():
                texts.update(norm(x) for x in v if norm(x))
    os.makedirs(OUT, exist_ok=True)
    mpath = os.path.join(OUT, "manifest.json")
    manifest = json.load(open(mpath, encoding="utf-8")) if os.path.exists(mpath) else {}
    todo = sorted(t for t in texts if cyrb53(t) not in manifest or not os.path.exists(os.path.join(OUT, cyrb53(t) + ".mp3")))
    print(f"phrases: {len(texts)}, already done: {len(texts) - len(todo)}, to generate: {len(todo)}", flush=True)
    done = 0
    for t in todo[:limit]:
        k = cyrb53(t)
        voice = rota[int(k, 16) % len(rota)]
        ssml = (f'<speak version="1.0" xml:lang="fr-CA"><voice name="{voice}">'
                f'<prosody rate="-6%">{html.escape(t, quote=False)}</prosody></voice></speak>')
        for attempt in range(6):
            try:
                r = request(base + "/v1", key, ssml.encode("utf-8"),
                            {"Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": FORMAT})
                open(os.path.join(OUT, k + ".mp3"), "wb").write(r.read())
                manifest[k] = voice
                break
            except urllib.error.HTTPError as e:
                wait = int(e.headers.get("Retry-After") or 0) or (15 * (attempt + 1))
                if e.code in (429, 500, 502, 503, 504):
                    print(f"  HTTP {e.code}, waiting {wait}s", flush=True); time.sleep(wait); continue
                print(f"  HTTP {e.code} for a {len(t)}-char phrase, skipped", flush=True); break
            except Exception as e:
                print("  network error, retrying:", type(e).__name__, flush=True); time.sleep(15)
        done += 1
        if done % 25 == 0:
            json.dump(manifest, open(mpath, "w", encoding="utf-8"), separators=(",", ":"))
            print(f"  {done}/{len(todo)}", flush=True)
        time.sleep(DELAY)
    json.dump(manifest, open(mpath, "w", encoding="utf-8"), separators=(",", ":"))
    print(f"finished: {len(manifest)} MP3 in total", flush=True)

if __name__ == "__main__":
    main()

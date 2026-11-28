"""Builds ia-proxy/src/nav.json: the pages of the site that are not lessons — la portada, los
índices de nivel, las listas de gramática y de lecturas, el vocabulario, los talleres y las
páginas del TCF y del TEF.

build_kb.py no las ve: están hechas casi sólo de enlaces y botones, que el extractor de texto
descarta, así que se quedan fuera de kb.json. Pero son justo adonde hay que mandar a alguien que
pregunta «¿dónde encuentro las lecturas de A2?». Esto las lista con su título y su URL para que
el asistente pueda orientar sin inventarse direcciones.

Correr después de añadir o quitar páginas:   python3 ia-proxy/build/build_nav.py
"""
import json, os, re, subprocess, unicodedata, urllib.parse

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BASE = "https://karla19urios.github.io/french/"
N = lambda s: unicodedata.normalize("NFC", s)

# el archivo de marcadores exportado del navegador que quedó suelto entre las lecciones
FUERA = {"A1.2/Grammaire A1.2/Verbes présent.html"}


def seccion(rel):
    """De qué parte del sitio es la página, con las mismas etiquetas que usa kb.json."""
    p = rel.split("/")[0]
    if p.startswith(("A1", "A2", "B1", "B2")) and "." in p or p in ("A1", "A2", "B1", "B2"):
        return p
    if p == "Vocabulaire":
        return "Vocabulaire"
    if p.startswith("Workshops"):
        return "Ateliers " + p.replace("Workshops-", "")
    base = os.path.basename(rel).lower()
    if base.startswith("tcf"):
        return "TCF"
    if base.startswith("tef"):
        return "TEF"
    return "Général"


def titulo(texto, rel):
    m = re.search(r"<title[^>]*>(.*?)</title>", texto, re.S | re.I)
    if m:
        t = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", m.group(1))).strip()
        t = (t.replace("&amp;", "&").replace("&#x27;", "'").replace("&#39;", "'")
              .replace("&quot;", '"').replace("&lt;", "<").replace("&gt;", ">"))
        if t:
            return t
    return os.path.splitext(os.path.basename(rel))[0]


def main():
    archivos = subprocess.run(["git", "-c", "core.quotepath=off", "ls-files", "*.html"],
                              cwd=ROOT, capture_output=True, text=True).stdout.splitlines()
    kb = json.load(open(os.path.join(ROOT, "ia-proxy/src/kb.json"), encoding="utf-8"))
    # kb.json guarda URL absolutas y con %XX: comparar por la ruta ya descodificada
    yaEstan = set()
    for m in kb["map"]:
        try:
            yaEstan.add(N(urllib.parse.unquote(urllib.parse.urlparse(m["u"]).path)))
        except Exception:
            pass

    nav = []
    for rel in sorted(archivos):
        rel = N(rel)
        if rel in FUERA or rel.startswith("tts-build/"):
            continue
        if N("/french/" + rel) in yaEstan:
            continue                      # ya la conoce por kb.json, no hace falta repetirla
        ruta = os.path.join(ROOT, rel)
        if not os.path.isfile(ruta):
            continue
        texto = open(ruta, encoding="utf-8", errors="replace").read()
        nav.append({"t": titulo(texto, rel), "l": seccion(rel),
                    "u": BASE + urllib.parse.quote(rel)})

    destino = os.path.join(ROOT, "ia-proxy/src/nav.json")
    json.dump(nav, open(destino, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"{len(nav)} páginas de navegación -> ia-proxy/src/nav.json")
    for x in nav:
        print(f"  [{x['l']:14}] {x['t'][:52]:52} {x['u'][len(BASE):]}")


if __name__ == "__main__":
    main()

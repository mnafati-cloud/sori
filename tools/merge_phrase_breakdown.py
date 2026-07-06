# -*- coding: utf-8 -*-
"""Fusionne la décomposition mot-à-mot + construction des PHRASES (workflow
'sori-phrase-breakdown') dans docs/extra.js.

Chaque fichier de sortie = [{"id","words":[["bout_kr","sens_fr"],...],"build":"..."}].
On ajoute EXTRA[id]["words"] et EXTRA[id]["build"] avec garde-fous :
  - words : liste non vide de paires [str, str] (bout coréen non vide, glose non vide)
  - build : chaîne non vide
Sinon l'entrée est ignorée (loggée) — showTrivia dégrade proprement sans ces champs.

Usage : python tools/merge_phrase_breakdown.py <dossier_out>
        (le dossier contient les fichiers batch_*.json vérifiés)
"""
import json, io, os, sys, glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXTRA = os.path.join(ROOT, "docs", "extra.js")
OUTDIR = sys.argv[1] if len(sys.argv) > 1 else "."

def loadjs(path):
    raw = io.open(path, encoding="utf-8").read()
    return json.loads(raw[raw.index("{"):raw.rindex(";")])

def valid_words(w):
    if not isinstance(w, list) or not w:
        return False
    for p in w:
        if not (isinstance(p, (list, tuple)) and len(p) == 2):
            return False
        if not (isinstance(p[0], str) and p[0].strip() and isinstance(p[1], str) and p[1].strip()):
            return False
    return True

extra = loadjs(EXTRA)
files = sorted(glob.glob(os.path.join(OUTDIR, "batch_*.json")))
print("fichiers de sortie trouvés :", len(files))

added = 0
skipped_bad = 0
skipped_noid = 0
seen = set()
for path in files:
    try:
        rows = json.load(io.open(path, encoding="utf-8"))
    except Exception as e:
        print("  ⚠️ illisible:", os.path.basename(path), e)
        continue
    for r in rows:
        rid = r.get("id")
        if rid is None or rid not in extra:
            skipped_noid += 1
            continue
        words = r.get("words")
        build = r.get("build")
        if not valid_words(words) or not (isinstance(build, str) and build.strip()):
            skipped_bad += 1
            continue
        # normaliser en listes de 2 éléments (JSON pur)
        extra[rid]["words"] = [[p[0], p[1]] for p in words]
        extra[rid]["build"] = build.strip()
        seen.add(rid)
        added += 1

out = ("// Contenu d'aide généré + enrichi (merge_extra/merge_pack/merge_gloss) — ne pas éditer à la main\n"
       "window.EXTRA = ")
out += json.dumps(extra, ensure_ascii=False, separators=(",", ":")) + ";\n"
io.open(EXTRA, "w", encoding="utf-8", newline="\n").write(out)

total_words = sum(1 for v in extra.values() if v.get("words"))
print("ajoutés (words+build) :", added, "| ignorés format:", skipped_bad, "| id inconnu:", skipped_noid)
print("TOTAL entrées EXTRA avec 'words' :", total_words)

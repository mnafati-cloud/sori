# -*- coding: utf-8 -*-
"""Fusionne le vocabulaire de BASE des phrases (workflow 'sori-phrase-basewords')
dans docs/extra.js, sous EXTRA[id]["base"] = [[lemme_kr, sens_fr], ...].

Sert à l'exercice « Structure de phrase » (structure.js) : on montre ces lemmes,
l'apprenant devine particules/conjugaison.

Garde-fous : base = liste non vide de paires [str, str] non vides. Sinon ignoré (loggé).
Usage : python tools/merge_basewords.py <dossier_out>   (contient batch_*.json vérifiés)
"""
import json, io, os, sys, glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXTRA = os.path.join(ROOT, "docs", "extra.js")
OUTDIR = sys.argv[1] if len(sys.argv) > 1 else "."

def loadjs(path):
    raw = io.open(path, encoding="utf-8").read()
    return json.loads(raw[raw.index("{"):raw.rindex(";")])

def valid_base(b):
    if not isinstance(b, list) or not b:
        return False
    for p in b:
        if not (isinstance(p, (list, tuple)) and len(p) == 2
                and isinstance(p[0], str) and p[0].strip()
                and isinstance(p[1], str) and p[1].strip()):
            return False
    return True

extra = loadjs(EXTRA)
files = sorted(glob.glob(os.path.join(OUTDIR, "batch_*.json")))
print("fichiers de sortie :", len(files))

added = bad = noid = 0
for path in files:
    try:
        rows = json.load(io.open(path, encoding="utf-8"))
    except Exception as e:
        print("  illisible:", os.path.basename(path), e); continue
    for r in rows:
        rid = r.get("id")
        if rid is None or rid not in extra:
            noid += 1; continue
        b = r.get("base")
        if not valid_base(b):
            bad += 1; continue
        extra[rid]["base"] = [[p[0].strip(), p[1].strip()] for p in b]
        added += 1

out = ("// Contenu d'aide généré + enrichi (merge_extra/merge_pack/merge_gloss) — ne pas éditer à la main\n"
       "window.EXTRA = ")
out += json.dumps(extra, ensure_ascii=False, separators=(",", ":")) + ";\n"
io.open(EXTRA, "w", encoding="utf-8", newline="\n").write(out)

total = sum(1 for v in extra.values() if v.get("base"))
print("ajoutés (base):", added, "| ignorés format:", bad, "| id inconnu:", noid)
print("TOTAL entrées EXTRA avec 'base':", total)

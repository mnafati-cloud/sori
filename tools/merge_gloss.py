# -*- coding: utf-8 -*-
"""Fusionne les gloses mot-a-mot (workflow 'sori-gloses') dans docs/extra.js.

Lit les fichiers <gloss_out>/ver_<b>.json (corriges) ; a defaut gen_<b>.json.
Chaque fichier = [{"id","ex","gl":[...]}]. On ajoute EXTRA[id]["gl"] = gl
UNIQUEMENT si len(gl) == nombre de mots de EXTRA[id]["ex"] (garde-fou d'alignement,
car app.js decoupe la phrase par espaces et zippe mot<->glose).

Usage: python tools/merge_gloss.py <gloss_out_dir>
"""
import json, io, sys, glob, os

ROOT = r"C:\Users\33785\dev\sori"
EXTRA = ROOT + r"\docs\extra.js"
DATA = ROOT + r"\docs\data.js"
OUTDIR = sys.argv[1] if len(sys.argv) > 1 else (
    r"C:\Users\33785\AppData\Local\Temp\claude"
    r"\C--Users-33785-OneDrive-Documents-Unity-Projects-My-project--8-"
    r"\8b4bfa48-bf4b-41f0-aeec-bbbdee7858c9\scratchpad\gloss_out")
NB = 30


def loadjs(path):
    raw = io.open(path, encoding="utf-8").read()
    return json.loads(raw[raw.index("{"):raw.rindex(";")])


extra = loadjs(EXTRA)
data = loadjs(DATA)
ids = {it["id"] for it in data["items"]}

added = mism = missing_id = 0
mism_samples, missing_batches = [], []

for b in range(NB):
    path = None
    for cand in ("ver_%d.json" % b, "gen_%d.json" % b):
        p = os.path.join(OUTDIR, cand)
        if os.path.exists(p):
            path = p
            break
    if not path:
        missing_batches.append(b)
        continue
    try:
        rows = json.load(io.open(path, encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        print("  ! lot %d illisible (%s): %s" % (b, os.path.basename(path), exc))
        missing_batches.append(b)
        continue
    for r in rows:
        iid, gl = str(r.get("id", "")), r.get("gl")
        if iid not in extra or not extra[iid].get("ex") or not isinstance(gl, list):
            if iid not in ids:
                missing_id += 1
            continue
        toks = [t for t in str(extra[iid]["ex"]).split() if t]
        if len(gl) == len(toks) and toks:
            extra[iid]["gl"] = [str(g) for g in gl]
            added += 1
        else:
            mism += 1
            if len(mism_samples) < 8:
                mism_samples.append("%s: %d gloses / %d mots" % (iid, len(gl), len(toks)))

# garde-fou : aucune cle extra hors du deck
bad = [k for k in extra if k not in ids]
assert not bad, "ids extra inconnus (annule): %s" % bad[:5]

out = "// Contenu d'aide généré + enrichi (merge_extra/merge_pack/merge_gloss) — ne pas éditer à la main\nwindow.EXTRA = "
out += json.dumps(extra, ensure_ascii=False, separators=(",", ":")) + ";\n"
io.open(EXTRA, "w", encoding="utf-8", newline="\n").write(out)

with_gl = sum(1 for v in extra.values() if isinstance(v, dict) and v.get("gl"))
print("gloses ajoutees/mises a jour : %d" % added)
print("desalignements ignores       : %d %s" % (mism, mism_samples[:8] if mism else ""))
print("lots manquants               : %s" % (missing_batches or "aucun"))
print("entrees EXTRA avec gl (total): %d / %d avec phrase" %
      (with_gl, sum(1 for v in extra.values() if isinstance(v, dict) and v.get("ex"))))

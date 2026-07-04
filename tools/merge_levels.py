# -*- coding: utf-8 -*-
"""Fusionne les niveaux CEFR (workflow 'sori-niveaux') dans docs/extra.js.

Chaque item du deck recoit EXTRA[id]["cefr"] in {A1,A2,B1,B2,C1}.
Les entrees EXTRA manquantes sont CREEES (minimales : {"cefr": "..."}).
Lit ver_<b>.json (calibres) ; a defaut cls_<b>.json. Format [{"id","cefr"}].

Usage: python tools/merge_levels.py <dossier_lvl_out>
"""
import json, io, sys, os

ROOT = r"C:\Users\33785\dev\sori"
EXTRA = ROOT + r"\docs\extra.js"
DATA = ROOT + r"\docs\data.js"
OUTDIR = sys.argv[1] if len(sys.argv) > 1 else (
    r"C:\Users\33785\AppData\Local\Temp\claude"
    r"\C--Users-33785-OneDrive-Documents-Unity-Projects-My-project--8-"
    r"\8b4bfa48-bf4b-41f0-aeec-bbbdee7858c9\scratchpad\lvl_out")
NB = 30
VALID = {"A1", "A2", "B1", "B2", "C1"}


def loadjs(path):
    raw = io.open(path, encoding="utf-8").read()
    return json.loads(raw[raw.index("{"):raw.rindex(";")])


extra = loadjs(EXTRA)
data = loadjs(DATA)
ids = {it["id"] for it in data["items"]}

added = updated = bad_cefr = unknown_id = 0
missing_batches = []
seen_ids = set()

for b in range(NB):
    path = None
    for cand in ("ver_%d.json" % b, "cls_%d.json" % b):
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
        print("  ! lot %d illisible: %s" % (b, exc))
        missing_batches.append(b)
        continue
    for r in rows:
        iid = str(r.get("id", ""))
        cefr = str(r.get("cefr", "")).upper().strip()
        if iid not in ids:
            unknown_id += 1
            continue
        if cefr not in VALID:
            bad_cefr += 1
            continue
        seen_ids.add(iid)
        if iid in extra and isinstance(extra[iid], dict):
            if extra[iid].get("cefr") != cefr:
                extra[iid]["cefr"] = cefr; updated += 1
        else:
            extra[iid] = {"cefr": cefr}; added += 1

# garde-fou : aucune cle extra hors du deck
badk = [k for k in extra if k not in ids]
assert not badk, "ids extra inconnus (annule): %s" % badk[:5]

out = "// Contenu d'aide généré + enrichi (merge_extra/merge_pack/merge_gloss/merge_levels) — ne pas éditer à la main\nwindow.EXTRA = "
out += json.dumps(extra, ensure_ascii=False, separators=(",", ":")) + ";\n"
io.open(EXTRA, "w", encoding="utf-8", newline="\n").write(out)

with_cefr = sum(1 for v in extra.values() if isinstance(v, dict) and v.get("cefr"))
missing_items = [i for i in ids if i not in seen_ids]
print("cefr : %d crees, %d mis a jour" % (added, updated))
print("rejets : %d cefr invalides, %d ids inconnus" % (bad_cefr, unknown_id))
print("lots manquants : %s" % (missing_batches or "aucun"))
print("items du deck SANS cefr : %d %s" % (len(missing_items), missing_items[:8]))
print("entrees EXTRA avec cefr : %d / %d items du deck" % (with_cefr, len(ids)))
# distribution
import collections
dist = collections.Counter(extra[i]["cefr"] for i in ids if i in extra and extra[i].get("cefr"))
print("distribution :", {k: dist[k] for k in ["A1", "A2", "B1", "B2", "C1"] if k in dist})

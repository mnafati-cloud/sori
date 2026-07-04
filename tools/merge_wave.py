# -*- coding: utf-8 -*-
"""Intègre une VAGUE DE CONTENU riche (workflow 'sori-contenu-vN') qui a produit,
par item : fr, kr, type, theme, cefr, ex?, exFr?, note?, conj?.

Chaîne complète SAUF gloses (gl) et audio (faits après) :
  1. dédup par kr (vs deck existant + interne), écrit tools/packs/<nom>.json (fr/kr/type/theme)
  2. build_data.py -> data.js (ids pack-sha1(kr), garde-fou d'ids)
  3. merge dans extra.js : ex/exFr/note/conj/cefr pour chaque nouvel id
  4. émet <dir>/new_ex_ids.json (ids neufs ayant un ex) pour le passage gloses ensuite

Usage: python tools/merge_wave.py <dossier_cells> <nom_pack>   (ex: pack-2026-07-v5)
"""
import json, io, sys, os, hashlib, subprocess, collections, glob, re

ROOT = r"C:\Users\33785\dev\sori"
DATA = ROOT + r"\docs\data.js"
EXTRA = ROOT + r"\docs\extra.js"
CELLS_DIR = sys.argv[1]
NAME = sys.argv[2]
PACK = ROOT + r"\tools\packs\%s.json" % NAME
VALID_CEFR = {"A1", "A2", "B1", "B2", "C1"}


def loadjs(path):
    raw = io.open(path, encoding="utf-8").read()
    return json.loads(raw[raw.index("{"):raw.rindex(";")])


def read_cells():
    """Auto-detecte les cellules presentes (ver_<k> prioritaire, gen_<k> en repli) —
       indépendant du nombre de cellules de la vague."""
    idxs = set()
    for p in glob.glob(os.path.join(CELLS_DIR, "gen_*.json")) + glob.glob(os.path.join(CELLS_DIR, "ver_*.json")):
        m = re.search(r"_(\d+)\.json$", os.path.basename(p))
        if m:
            idxs.add(int(m.group(1)))
    rows, missing = [], []
    for k in sorted(idxs):
        path = None
        for cand in ("ver_%d.json" % k, "gen_%d.json" % k):
            p = os.path.join(CELLS_DIR, cand)
            if os.path.exists(p):
                path = p
                break
        try:
            rows += json.load(io.open(path, encoding="utf-8"))
        except Exception as exc:  # noqa: BLE001
            print("  ! cellule %d illisible: %s" % (k, exc))
            missing.append(k)
    return rows, missing


seed = loadjs(DATA)
existing_kr = {it["kr"] for it in seed["items"]}
extra = loadjs(EXTRA)

rows, missing = read_cells()
pack, trivia, skipped, seen_kr = [], {}, 0, set()
for it in rows:
    kr = (it.get("kr") or "").strip()
    fr = (it.get("fr") or "").strip()
    if not kr or not fr or kr in existing_kr or kr in seen_kr:
        skipped += 1
        continue
    seen_kr.add(kr)
    typ = it.get("type") if it.get("type") in ("word", "phrase") else "word"
    theme = (it.get("theme") or "divers").strip()
    pack.append({"fr": fr, "kr": kr, "type": typ, "theme": theme})
    pid = "pack-" + hashlib.sha1(kr.encode("utf-8")).hexdigest()[:8]
    e = {}
    ex = (it.get("ex") or "").strip()
    if ex and len(ex) <= 70:
        e["ex"] = ex
        exfr = (it.get("exFr") or "").strip()
        if exfr:
            e["exFr"] = exfr
    conj = (it.get("conj") or "").strip()
    if conj:
        e["conj"] = conj
    note = (it.get("note") or "").strip()
    if note and len(note) <= 110:
        e["note"] = note
    cefr = str(it.get("cefr") or "").upper().strip()
    if cefr in VALID_CEFR:
        e["cefr"] = cefr
    if e:
        trivia[pid] = e

io.open(PACK, "w", encoding="utf-8", newline="\n").write(json.dumps(pack, ensure_ascii=False, indent=1))
print("pack: %d items neufs ecrits, %d ignores (doublons/vides)" % (len(pack), skipped))
if missing:
    print("  cellules manquantes: %s" % missing)

# regeneration (garde-fou d'ids integre)
r = subprocess.run([sys.executable, ROOT + r"\tools\build_data.py"],
                   capture_output=True, text=True, encoding="utf-8")
print(r.stdout[-400:] if r.stdout else "")
if r.returncode != 0:
    print(r.stderr[-600:]); sys.exit("ABANDON: build_data a echoue")

# validation : tous les items du pack presents apres regen
seed2 = loadjs(DATA)
ids2 = {it["id"] for it in seed2["items"]}
missing_items = [p["kr"] for p in pack
                 if "pack-" + hashlib.sha1(p["kr"].encode()).hexdigest()[:8] not in ids2]
assert not missing_items, "items du pack absents apres regen: %s" % missing_items[:5]

# merge trivia + cefr dans extra.js
added = 0
new_ex_ids = []
for pid, e in trivia.items():
    if pid in ids2:
        cur = extra.get(pid, {})
        cur.update(e)              # nouveaux ids : creation ; jamais d'ecrasement d'un ex existant (ids neufs)
        extra[pid] = cur
        added += 1
        if e.get("ex"):
            new_ex_ids.append(pid)
bad = [k for k in extra if k not in ids2]
assert not bad, "ids extra inconnus (annule): %s" % bad[:5]

out = ("// Contenu d'aide généré + enrichi (merge_extra/merge_pack/merge_gloss/merge_levels/merge_wave)"
       " — ne pas éditer à la main\nwindow.EXTRA = ")
out += json.dumps(extra, ensure_ascii=False, separators=(",", ":")) + ";\n"
io.open(EXTRA, "w", encoding="utf-8", newline="\n").write(out)

# liste des ids neufs avec ex (pour le passage gloses ensuite)
io.open(os.path.join(CELLS_DIR, "new_ex_ids.json"), "w", encoding="utf-8", newline="\n").write(
    json.dumps(new_ex_ids, ensure_ascii=False))

dist = collections.Counter(v["cefr"] for v in extra.values()
                           if isinstance(v, dict) and v.get("cefr"))
print("extra: +%d entrees (total %d)" % (added, len(extra)))
print("nouveaux ids avec ex (a gloser ensuite): %d" % len(new_ex_ids))
print("items deck total: %d" % len(seed2["items"]))
print("distribution cefr:", {k: dist[k] for k in ["A1", "A2", "B1", "B2", "C1"] if k in dist})

# -*- coding: utf-8 -*-
"""Intègre un lot du workflow 'contenu-vague-N' :
   1. écrit le pack JSON (fr/kr/type/theme) dans tools/packs/
   2. régénère docs/data.js (build_data.py — garde-fou d'ids inclus)
   3. fusionne le trivia (ex/exFr/conj/note) des nouveaux items dans docs/extra.js
Usage: python merge_pack.py <workflow_output.json> <nom_pack>"""
import json, io, sys, hashlib, subprocess

WF, NAME = sys.argv[1], sys.argv[2]
ROOT = r"C:\Users\33785\dev\sori"
DATA = ROOT + r"\docs\data.js"
EXTRA = ROOT + r"\docs\extra.js"
PACK = ROOT + r"\tools\packs\%s.json" % NAME

wf = json.loads(io.open(WF, encoding="utf-8").read())
lots = wf["result"]["lots"]

raw = io.open(DATA, encoding="utf-8").read()
seed = json.loads(raw[raw.index("{"):raw.rindex(";")])
existing_kr = {it["kr"] for it in seed["items"]}

pack, trivia, skipped = [], {}, []
seen_kr = set()
for lot in lots:
    for it in lot["items"]:
        kr = it["kr"].strip()
        fr = it["fr"].strip()
        if not kr or not fr or kr in existing_kr or kr in seen_kr:
            skipped.append(kr); continue
        seen_kr.add(kr)
        pack.append({"fr": fr, "kr": kr, "type": it["type"], "theme": it["theme"].split(" ")[0]})
        pid = "pack-" + hashlib.sha1(kr.encode("utf-8")).hexdigest()[:8]
        entry = {}
        if it.get("ex", "").strip():
            if len(it["ex"].strip()) <= 70:
                entry["ex"] = it["ex"].strip()
                if it.get("exFr", "").strip(): entry["exFr"] = it["exFr"].strip()
        if it.get("conj", "").strip(): entry["conj"] = it["conj"].strip()
        if it.get("note", "").strip() and len(it["note"].strip()) <= 110: entry["note"] = it["note"].strip()
        if entry: trivia[pid] = entry

io.open(PACK, "w", encoding="utf-8", newline="\n").write(json.dumps(pack, ensure_ascii=False, indent=1))
print("pack: %d items ecrits, %d ignores (doublons/vides): %s" % (len(pack), len(skipped), skipped[:6]))

# regeneration (le garde-fou d'ids tourne dedans)
r = subprocess.run([sys.executable, ROOT + r"\tools\build_data.py"], capture_output=True, text=True, encoding="utf-8")
print(r.stdout[-400:] if r.stdout else "")
if r.returncode != 0:
    print(r.stderr[-500:]); sys.exit("ABANDON: build_data a echoue")

# validation post-regen : tous les items du pack sont presents
raw = io.open(DATA, encoding="utf-8").read()
seed2 = json.loads(raw[raw.index("{"):raw.rindex(";")])
ids2 = {it["id"] for it in seed2["items"]}
missing = [p["kr"] for p in pack if "pack-" + hashlib.sha1(p["kr"].encode()).hexdigest()[:8] not in ids2]
assert not missing, "items du pack absents apres regen: %s" % missing[:5]

# merge trivia
raw = io.open(EXTRA, encoding="utf-8").read()
extra = json.loads(raw[raw.index("{"):raw.rindex(";")])
added = 0
for pid, e in trivia.items():
    if pid in ids2 and pid not in extra:
        extra[pid] = e; added += 1
bad = [k for k in extra if k not in ids2]
assert not bad, "ids extra inconnus: %s" % bad[:5]
out = "// Contenu d'aide généré + enrichi (merge_extra/merge_pack) — ne pas éditer à la main\nwindow.EXTRA = "
out += json.dumps(extra, ensure_ascii=False, separators=(",", ":")) + ";\n"
io.open(EXTRA, "w", encoding="utf-8", newline="\n").write(out)
print("trivia: +%d entrees (total %d)" % (added, len(extra)))
print("items total: %d" % len(seed2["items"]))

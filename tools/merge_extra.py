# -*- coding: utf-8 -*-
"""Fusionne les entrées d'enrichissement (workflow) dans docs/extra.js.
Règles: une entrée existante avec 'ex' n'est JAMAIS écrasée (contenu déjà vérifié);
on ne fait qu'ajouter conj / compléter les items nouveaux."""
import json, io, sys

WF   = sys.argv[1]
EXTRA = r"C:\Users\33785\dev\sori\docs\extra.js"
DATA  = r"C:\Users\33785\dev\sori\docs\data.js"

raw = io.open(DATA, encoding="utf-8").read()
seed = json.loads(raw[raw.index("{"):raw.rindex(";")])
valid_ids = {it["id"] for it in seed["items"]}

raw = io.open(EXTRA, encoding="utf-8").read()
extra = json.loads(raw[raw.index("{"):raw.rindex(";")])

wf = json.loads(io.open(WF, encoding="utf-8").read())
batches = wf["result"]["batches"]

stats = dict(processed=0, new_full=0, conj_added=0, kept_existing=0, bad_id=0, empty=0, long_ex=0)
for b in batches:
    for e in b["entries"]:
        stats["processed"] += 1
        i = str(e.get("id", "")).strip()
        ex, exfr = e.get("ex", "").strip(), e.get("exFr", "").strip()
        note, conj = e.get("note", "").strip(), e.get("conj", "").strip()
        if i not in valid_ids:
            stats["bad_id"] += 1; continue
        if not (ex or note or conj):
            stats["empty"] += 1; continue
        cur = extra.get(i)
        if cur and cur.get("ex"):
            # contenu vérifié existant : on n'ajoute QUE la conjugaison
            if conj and not cur.get("conj"):
                cur["conj"] = conj; stats["conj_added"] += 1
            else:
                stats["kept_existing"] += 1
            continue
        entry = cur or {}
        if ex:
            if len(ex) > 70: stats["long_ex"] += 1; continue
            entry["ex"] = ex
            if exfr: entry["exFr"] = exfr
        if note: entry["note"] = note
        if conj: entry["conj"] = conj; stats["conj_added"] += 1
        if entry:
            extra[i] = entry
            if ex: stats["new_full"] += 1

out = "// Contenu d'aide généré + enrichi (merge_extra.py) — ne pas éditer à la main\nwindow.EXTRA = "
out += json.dumps(extra, ensure_ascii=False, separators=(",", ":")) + ";\n"
io.open(EXTRA, "w", encoding="utf-8", newline="\n").write(out)

# validation finale
raw = io.open(EXTRA, encoding="utf-8").read()
check = json.loads(raw[raw.index("{"):raw.rindex(";")])
assert all(k in valid_ids for k in check), "id inconnu après merge !"
print("STATS", json.dumps(stats, ensure_ascii=False))
print("total entrées extra.js:", len(check))
print("avec ex:", sum(1 for v in check.values() if v.get("ex")))
print("avec conj:", sum(1 for v in check.values() if v.get("conj")))
print("avec note:", sum(1 for v in check.values() if v.get("note")))

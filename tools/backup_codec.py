#!/usr/bin/env python3
"""Relit les exports Sori v1 et cloud v2 sans perte ; miroir de docs/backup.js.

Retour arrière : python tools/backup_codec.py export-cloud.json --out export-v1.json
Les fichiers de progression restent hors du dépôt public.
"""
import argparse
import json

FIELDS = ["s", "i", "d", "e", "ok", "ko", "S", "D", "sk", "lp", "sus"]
RLOG_FIELDS = [0, 1, 4]


def unpack(data):
    def invalid():
        raise ValueError("Sauvegarde Sori invalide ou format non pris en charge")

    if not isinstance(data, dict) or data.get("app") != "sori" or not isinstance(data.get("state"), dict):
        invalid()
    if data.get("v") == 1 and "encoding" not in data:
        return data
    enc = data.get("encoding")
    state = data["state"]
    if (data.get("v") != 2 or not isinstance(enc, dict) or enc.get("codec") != "sori-compact-v1"
            or not isinstance(enc.get("strings"), list) or not all(isinstance(s, str) for s in enc["strings"])
            or not isinstance(state.get("items"), dict) or not isinstance(state.get("rlog"), list)):
        invalid()
    items = {}
    for iid, row in state["items"].items():
        if not isinstance(row, list) or not row or type(row[0]) is not int or not 0 <= row[0] < (1 << len(FIELDS)):
            invalid()
        it, pos = {}, 1
        for i, field in enumerate(FIELDS):
            if row[0] & (1 << i):
                if pos >= len(row):
                    invalid()
                it[field] = row[pos]
                pos += 1
        if pos < len(row):
            extra = row[pos]
            pos += 1
            if not isinstance(extra, dict) or any(k in FIELDS for k in extra):
                invalid()
            it.update(extra)
        if pos != len(row):
            invalid()
        items[iid] = it
    rlog = []
    for row in state["rlog"]:
        if not isinstance(row, list):
            invalid()
        out = row.copy()
        for i in RLOG_FIELDS:
            if i >= len(row):
                continue
            n = row[i]
            if type(n) is not int or not 0 <= n < len(enc["strings"]):
                invalid()
            out[i] = enc["strings"][n]
        rlog.append(out)
    out = dict(data, v=1, state=dict(state, items=items, rlog=rlog))
    del out["encoding"]
    return out


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("export")
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    with open(args.export, encoding="utf-8") as source:
        restored = unpack(json.load(source))
    with open(args.out, "w", encoding="utf-8") as target:
        json.dump(restored, target, ensure_ascii=False, separators=(",", ":"))

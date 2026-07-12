# -*- coding: utf-8 -*-
"""Construit la police d'affiche hangul embarquée (refonte v69 « Encre & sceau »).

Nanum Myeongjo Bold (OFL, Google Fonts), SOUS-ENSEMBLE limité aux caractères réellement
présents dans le deck (data.js kr) + les phrases d'exemple (extra.js ex) + une réserve
d'interface (salutations, ponctuation, chiffres, latin de base) — ~2 500 glyphes au lieu
de 11 172, pour un woff2 léger, hors-ligne comme le reste (sw.js ASSETS).

⚠️ À RELANCER après chaque vague de contenu (de nouveaux caractères pourraient manquer ;
un glyphe absent retombe sur la police système sans casser — juste moins joli).

Usage : python tools/make_font.py <chemin/NanumMyeongjo-Bold.ttf>
Sortie : docs/fonts/nanum-myeongjo-bold-sub.woff2
"""
import io, json, os, re, sys, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else "NanumMyeongjo-Bold.ttf"
OUT_DIR = os.path.join(ROOT, "docs", "fonts")
OUT = os.path.join(OUT_DIR, "nanum-myeongjo-bold-sub.woff2")

def loadjs(path):
    raw = io.open(path, encoding="utf-8").read()
    return json.loads(raw[raw.index("{"):raw.rindex(";")])

chars = set()
seed = loadjs(os.path.join(ROOT, "docs", "data.js"))
for it in seed["items"]:
    chars.update(it.get("kr", ""))
extra = loadjs(os.path.join(ROOT, "docs", "extra.js"))
for v in extra.values():
    chars.update(v.get("ex", "") or "")

# réserve d'interface : salutations de l'accueil, sceau, marque, ponctuation, latin, chiffres
chars.update("소리좋은아침이에요오후예저녁끝하루수고했어완료 .,!?~·—-()[]0123456789"
             "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZàâçéèêëîïôùûüœ'’ %/+×")
chars.discard("\n"); chars.discard("\t")

os.makedirs(OUT_DIR, exist_ok=True)
txt = os.path.join(OUT_DIR, "_charset.txt")
io.open(txt, "w", encoding="utf-8").write("".join(sorted(chars)))
print("caractères uniques :", len(chars))

subprocess.check_call([sys.executable, "-m", "fontTools.subset", SRC,
    "--text-file=" + txt, "--flavor=woff2", "--output-file=" + OUT,
    "--layout-features=*", "--no-hinting", "--desubroutinize"])
os.remove(txt)
print("OK :", OUT, "=", os.path.getsize(OUT), "octets")

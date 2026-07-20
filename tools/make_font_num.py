# -*- coding: utf-8 -*-
"""Construit la police MANUSCRITE des nombres du thème « Takbon » (v106).

Caveat (OFL, Google Fonts) — écriture au stylo, lisible, pas surjouée (demande
user : « manuscrit… pas quelque chose de trop poussé »). Sert aux nombres du
thème (compteur de révision, intervalles, stats, J-x) — le sous-ensemble couvre
tout le latin français car ces éléments mêlent chiffres et mots (« re-vu »,
« aujourd'hui », « 879 cartes »). Variable épinglée en graisse 700 → woff2
léger, chargée à l'usage seulement (@font-face), précachée (sw.js ASSETS).

Source TTF (non commitée, re-téléchargeable) :
  https://github.com/google/fonts/raw/main/ofl/caveat/Caveat%5Bwght%5D.ttf

Usage : python tools/make_font_num.py <chemin/Caveat[wght].ttf>
Sortie : docs/fonts/caveat-bold-sub.woff2
"""
import os, sys, subprocess, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else "Caveat[wght].ttf"
OUT_DIR = os.path.join(ROOT, "docs", "fonts")
OUT = os.path.join(OUT_DIR, "caveat-bold-sub.woff2")

# même couverture que make_font_fr.py : ASCII, Latin-1, Œœ, ponctuation typographique
UNICODES = "U+0020-007E,U+00A0-00FF,U+0152-0153,U+2013-2014,U+2018-2019,U+201C-201D,U+2026,U+2039-203A,U+00B7"

os.makedirs(OUT_DIR, exist_ok=True)
with tempfile.TemporaryDirectory() as td:
    pinned = os.path.join(td, "caveat-700.ttf")
    subprocess.check_call([sys.executable, "-m", "fontTools.varLib.instancer",
                           SRC, "wght=700", "-o", pinned])
    subprocess.check_call([sys.executable, "-m", "fontTools.subset", pinned,
                           "--unicodes=" + UNICODES, "--flavor=woff2",
                           "--output-file=" + OUT,
                           "--layout-features=*", "--no-hinting", "--desubroutinize"])
print("OK :", OUT, "=", os.path.getsize(OUT), "octets")

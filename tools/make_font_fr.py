# -*- coding: utf-8 -*-
"""Construit la police d'affiche FRANÇAISE du thème « Takbon » (v104).

Alegreya (OFL, Google Fonts) — serif humaniste à l'ADN calligraphique : du
caractère pour le texte français d'affiche (prompts, notes, options), sans
être manuscrite. Variable font épinglée en graisse 700 puis sous-ensemble
latin français (ASCII + Latin-1 + Œœ + ponctuation typographique) → woff2
léger, hors-ligne comme le reste (sw.js ASSETS). Chargée uniquement quand le
thème Takbon l'utilise (@font-face ne télécharge qu'à l'usage).

Source TTF (non commitée, re-téléchargeable) :
  https://github.com/google/fonts/raw/main/ofl/alegreya/Alegreya%5Bwght%5D.ttf

Usage : python tools/make_font_fr.py <chemin/Alegreya[wght].ttf>
Sortie : docs/fonts/alegreya-bold-sub.woff2
"""
import os, sys, subprocess, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else "Alegreya[wght].ttf"
OUT_DIR = os.path.join(ROOT, "docs", "fonts")
OUT = os.path.join(OUT_DIR, "alegreya-bold-sub.woff2")

# latin complet pour le français : ASCII, Latin-1 (accents), Œœ, tirets/guillemets/…
UNICODES = "U+0020-007E,U+00A0-00FF,U+0152-0153,U+2013-2014,U+2018-2019,U+201C-201D,U+2026,U+2039-203A,U+00B7"

os.makedirs(OUT_DIR, exist_ok=True)
with tempfile.TemporaryDirectory() as td:
    pinned = os.path.join(td, "alegreya-700.ttf")
    subprocess.check_call([sys.executable, "-m", "fontTools.varLib.instancer",
                           SRC, "wght=700", "-o", pinned])
    subprocess.check_call([sys.executable, "-m", "fontTools.subset", pinned,
                           "--unicodes=" + UNICODES, "--flavor=woff2",
                           "--output-file=" + OUT,
                           "--layout-features=*", "--no-hinting", "--desubroutinize"])
print("OK :", OUT, "=", os.path.getsize(OUT), "octets")

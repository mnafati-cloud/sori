# -*- coding: utf-8 -*-
"""Icônes PWA « dojang » (v133, choix user 22/07 sur planche de 4 propositions) :
fond NOIR pur pleine surface (maskable), grand carré-sceau VERMILLON incliné (-4°)
plein cadre, 소리 gravé en encre (myeongjo) dedans. Remplace le design v110
(소리 blanc + petit sceau sous le ㅣ — « le point rouge » que l'user n'aimait pas).

Usage : python tools/make_icons.py [chemin/NanumMyeongjo-Bold.ttf]
  Le TTF n'est PAS versionné (3 Mo) — source OFL :
  https://raw.githubusercontent.com/google/fonts/main/ofl/nanummyeongjo/NanumMyeongjo-Bold.ttf
  Repli sans argument : Batang (myeongjo système Windows, batang.ttc).
Rendu en 4x puis réduction LANCZOS (bords nets).
Zone sûre maskable (cercle 40 % — spec W3C) : carré 0.60·S à coins 16 % → coin le plus
lointain à ~0.385·S du centre, dedans avec marge.
⚠️ v112 : remplacer les OCTETS d'une icône à URL constante ne re-déclenche PAS la
re-frappe du WebAPK. Le déclencheur fiable = changer l'URL dans manifest.json → à
CHAQUE évolution d'icône : incrémenter le suffixe (-v3 → -v4…) ICI et dans
manifest.json, index.html (2 liens) et sw.js (ASSETS)."""
import os, sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INK, SEAL, SEAL_INK = (0, 0, 0, 255), (228, 88, 74, 255), (31, 15, 11, 255)

def load_font(px):
    if len(sys.argv) > 1:
        return ImageFont.truetype(sys.argv[1], px)
    return ImageFont.truetype(r"C:\Windows\Fonts\batang.ttc", px, index=0)

def make(size, path):
    S = size * 4                                   # supersampling 4x
    img = Image.new("RGBA", (S, S), INK)           # fond PLEIN (requis pour maskable)
    sq = int(S * 0.60)                             # côté du sceau
    pad = int(sq * 0.20)                           # marge de rotation (canvas ≤ S)
    canvas = Image.new("RGBA", (sq + 2 * pad, sq + 2 * pad), (0, 0, 0, 0))
    ds = ImageDraw.Draw(canvas)
    ds.rounded_rectangle([pad, pad, pad + sq, pad + sq],
                         radius=int(sq * 0.16), fill=SEAL)
    font = load_font(int(sq * 0.44))
    text = "소리"
    b = ds.textbbox((0, 0), text, font=font)
    w, h = b[2] - b[0], b[3] - b[1]
    ds.text((pad + (sq - w) / 2 - b[0], pad + (sq - h) / 2 - b[1] - sq * 0.02),
            text, font=font, fill=SEAL_INK)
    canvas = canvas.rotate(4, resample=Image.BICUBIC, expand=False,
                           center=(canvas.width / 2, canvas.height / 2))
    img.alpha_composite(canvas, ((S - canvas.width) // 2, (S - canvas.height) // 2))
    img = img.resize((size, size), Image.LANCZOS).convert("RGB")
    img.save(path)
    print("ok", path, size)

make(192, os.path.join(ROOT, "docs", "icon-192-v3.png"))
make(512, os.path.join(ROOT, "docs", "icon-512-v3.png"))

# -*- coding: utf-8 -*-
"""Icônes PWA « Takbon » (v110, évolution demandée user) : fond NOIR pur pleine
surface (maskable), 소리 en myeongjo BLANC avec halo lumineux (l'estampage),
carré-sceau vermillon incliné en signature.

Usage : python tools/make_icons.py [chemin/NanumMyeongjo-Bold.ttf]
  Le TTF n'est PAS versionné (3 Mo) — source OFL :
  https://raw.githubusercontent.com/google/fonts/main/ofl/nanummyeongjo/NanumMyeongjo-Bold.ttf
  Repli sans argument : Batang (myeongjo système Windows, batang.ttc).
Rendu en 4x puis réduction LANCZOS (bords nets). Zone sûre maskable : cercle 40 %.
⚠️ L'icône WebAPK installée se met à jour avec un DÉLAI système Android (v73)."""
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

INK, HANJI, SEAL = (0, 0, 0, 255), (255, 255, 255, 255), (228, 88, 74, 255)

def load_font(px):
    if len(sys.argv) > 1:
        return ImageFont.truetype(sys.argv[1], px)
    return ImageFont.truetype(r"C:\Windows\Fonts\batang.ttc", px, index=0)

def make(size, path):
    S = size * 4                                   # supersampling 4x
    img = Image.new("RGBA", (S, S), INK)           # fond PLEIN (requis pour maskable)
    d = ImageDraw.Draw(img)
    font = load_font(int(S * 0.335))
    text = "소리"
    bbox = d.textbbox((0, 0), text, font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx, ty = (S - w) / 2 - bbox[0], (S - h) / 2 - bbox[1] - S * 0.045
    # halo « takbon » : le texte blanc flouté sous le texte net — le blanc frotté respire
    halo = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(halo).text((tx, ty), text, font=font, fill=(255, 255, 255, 150))
    halo = halo.filter(ImageFilter.GaussianBlur(radius=S * 0.022))
    img.alpha_composite(halo)
    d.text((tx, ty), text, font=font, fill=HANJI)
    # carré-sceau incliné (-4°), posé en signature sous la fin du mot — dans la zone sûre
    sq = int(S * 0.105)
    seal = Image.new("RGBA", (sq * 2, sq * 2), (0, 0, 0, 0))
    ds = ImageDraw.Draw(seal)
    ds.rounded_rectangle([sq // 2, sq // 2, sq // 2 + sq, sq // 2 + sq],
                         radius=int(sq * 0.22), fill=SEAL)
    seal = seal.rotate(4, resample=Image.BICUBIC)  # PIL : sens anti-horaire → visuel -4°
    px = int(tx + w - sq * 0.55)                   # sous le coin droit du texte
    py = int(ty + h + S * 0.035)
    # zone sûre maskable = CERCLE de rayon 0.40·S (spec W3C), pas le carré des 80 % :
    # ramener radialement le CENTRE du sceau pour que son coin le plus lointain reste dedans
    import math
    cx, cy = px + sq / 2, py + sq / 2
    half_diag = sq * 0.75                          # demi-diagonale (coins arrondis, marge incluse)
    r_max = 0.40 * S - half_diag
    dx, dy = cx - S / 2, cy - S / 2
    r = math.hypot(dx, dy)
    if r > r_max:
        k = r_max / r
        px, py = int(S / 2 + dx * k - sq / 2), int(S / 2 + dy * k - sq / 2)
    img.alpha_composite(seal, (px - sq // 2, py - sq // 2))
    img = img.resize((size, size), Image.LANCZOS)
    img.save(path)
    print("ok", path, size)

make(192, r"C:\Users\33785\dev\sori\docs\icon-192.png")
make(512, r"C:\Users\33785\dev\sori\docs\icon-512.png")

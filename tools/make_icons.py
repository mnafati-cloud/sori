# -*- coding: utf-8 -*-
"""Icônes PWA : carré arrondi sarcelle avec 소리 (police Malgun Gothic)."""
from PIL import Image, ImageDraw, ImageFont

def make(size, path):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = size // 5
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=(13, 148, 136, 255))
    try:
        font = ImageFont.truetype(r"C:\Windows\Fonts\malgunbd.ttf", int(size * 0.40))
    except OSError:
        font = ImageFont.truetype(r"C:\Windows\Fonts\malgun.ttf", int(size * 0.40))
    text = "소리"
    bbox = d.textbbox((0, 0), text, font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text(((size - w) / 2 - bbox[0], (size - h) / 2 - bbox[1]), text, font=font, fill=(255, 255, 255, 255))
    img.save(path)
    print("ok", path)

make(192, r"C:\Users\33785\dev\sori\app\icon-192.png")
make(512, r"C:\Users\33785\dev\sori\app\icon-512.png")

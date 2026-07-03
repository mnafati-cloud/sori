# Packs en RESERVE (non actifs)

Contenu genere + verifie natif, PAS encore dans le deck.
(b2-avance.json ACTIVE le 2026-07-03 -> tools/packs/pack-b2-avance.json)
ACTIVATION (1 commande, cf. MAINTENANCE.md R11):
    python tools/merge_pack.py tools/packs-staged/b2-avance.json pack-b2-avance
puis: python tools/make_audio.py ; tests ; release normale (R7).
Ne JAMAIS editer le contenu a la main sans re-verification native.

# -*- coding: utf-8 -*-
"""Genere les MP3 natifs (edge-tts, ko-KR-SunHiNeural) du deck.

Deux familles de fichiers, meme voix :
  - MOT     : docs/audio/<id>.mp3      (tous les items du deck, kr)
  - PHRASE  : docs/audio/<id>-ex.mp3   (phrase d'exemple EXTRA[id].ex, si presente)

Usage:  python tools/make_audio.py            -> mots + phrases
        python tools/make_audio.py --words     -> mots seuls
        python tools/make_audio.py --ex        -> phrases seules
Relançable: saute les MP3 deja presents et valides (>1 Ko).
Sorties: docs/audio/<id>.mp3, docs/audio/<id>-ex.mp3, docs/audio/index.js
         index.js exporte window.AUDIO (mots) et window.AUDIO_EX (phrases).
"""

import asyncio
import json
import re
import sys
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
DATA_JS = ROOT / "docs" / "data.js"
EXTRA_JS = ROOT / "docs" / "extra.js"
AUDIO_DIR = ROOT / "docs" / "audio"
INDEX_JS = AUDIO_DIR / "index.js"

VOICE = "ko-KR-SunHiNeural"
RATE = "-15%"
MIN_SIZE = 1024  # octets — en dessous, fichier considere invalide
CONCURRENCY = 4
MAX_ROUNDS = 3  # tentatives globales sur les fichiers manques
EX_SUFFIX = "-ex"


def _loadjs(path: Path):
    raw = path.read_text(encoding="utf-8")
    return json.loads(raw[raw.index("{"): raw.rindex(";")].strip())


def load_items():
    return _loadjs(DATA_JS)["items"]


def load_extra():
    return _loadjs(EXTRA_JS) if EXTRA_JS.exists() else {}


def clean_kr(kr: str) -> str:
    # retire les parentheses (coreennes ou latines) et leur contenu
    text = re.sub(r"[(（][^)）]*[)）]", "", kr)
    return re.sub(r"\s+", " ", text).strip()


def select_word_targets(items):
    """(id, texte, chemin) pour chaque item du deck."""
    out = []
    for it in items:
        text = clean_kr(it.get("kr", ""))
        if text:
            out.append((str(it["id"]), text, AUDIO_DIR / f"{it['id']}.mp3"))
    return out


def select_ex_targets(extra):
    """(id, phrase, chemin <id>-ex.mp3) pour chaque EXTRA avec une phrase d'exemple."""
    out = []
    for iid, e in extra.items():
        if not isinstance(e, dict):
            continue
        text = clean_kr(e.get("ex", "") or "")
        if text:
            out.append((str(iid), text, AUDIO_DIR / f"{iid}{EX_SUFFIX}.mp3"))
    return out


def is_valid(path: Path) -> bool:
    return path.exists() and path.stat().st_size > MIN_SIZE


async def synth_one(sem, text, path, failures):
    if is_valid(path):
        return False  # deja fait
    async with sem:
        try:
            communicate = edge_tts.Communicate(text, VOICE, rate=RATE)
            await communicate.save(str(path))
            if not is_valid(path):
                path.unlink(missing_ok=True)
                failures.append((path.stem, "fichier trop petit"))
                return False
            return True
        except Exception as exc:  # noqa: BLE001 — erreurs reseau ponctuelles
            path.unlink(missing_ok=True)
            failures.append((path.stem, f"{type(exc).__name__}: {exc}"))
            return False


async def generate(targets, label):
    """targets = liste de (id, texte, chemin)."""
    sem = asyncio.Semaphore(CONCURRENCY)
    for round_no in range(1, MAX_ROUNDS + 1):
        pending = [(i, t, p) for i, t, p in targets if not is_valid(p)]
        if not pending:
            break
        print(f"[{label}] Round {round_no}: {len(pending)} fichier(s) a generer")
        failures = []
        results = await asyncio.gather(
            *(synth_one(sem, t, p, failures) for i, t, p in pending)
        )
        print(f"  -> {sum(1 for r in results if r)} genere(s), {len(failures)} echec(s)")
        for stem, err in failures[:5]:
            print(f"     ECHEC {stem}: {err}")
        if failures and round_no < MAX_ROUNDS:
            await asyncio.sleep(3)


def write_index(word_ids_order, ex_ids_order):
    """Reconstitue les deux listes depuis les fichiers reellement presents et valides.
       - MOT    : *.mp3 sans le suffixe -ex
       - PHRASE : *-ex.mp3 -> id de base."""
    words_present, ex_present = set(), set()
    for p in AUDIO_DIR.glob("*.mp3"):
        if p.stat().st_size <= MIN_SIZE:
            continue
        if p.stem.endswith(EX_SUFFIX):
            ex_present.add(p.stem[: -len(EX_SUFFIX)])
        else:
            words_present.add(p.stem)

    def ordered(order, present):
        seen = set(order)
        return [i for i in order if i in present] + [i for i in sorted(present) if i not in seen]

    words = ordered(word_ids_order, words_present)
    exs = ordered(ex_ids_order, ex_present)
    content = (
        "window.AUDIO = " + json.dumps(words, ensure_ascii=False) + ";\n"
        "window.AUDIO_EX = " + json.dumps(exs, ensure_ascii=False) + ";\n"
    )
    INDEX_JS.write_bytes(content.encode("utf-8"))  # UTF-8 sans BOM
    return words, exs


def main():
    do_words = "--ex" not in sys.argv
    do_ex = "--words" not in sys.argv
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)

    word_targets = select_word_targets(load_items()) if do_words else []
    ex_targets = select_ex_targets(load_extra()) if do_ex else []
    print(f"Cibles: {len(word_targets)} mots, {len(ex_targets)} phrases")

    if word_targets:
        asyncio.run(generate(word_targets, "MOT"))
    if ex_targets:
        asyncio.run(generate(ex_targets, "PHRASE"))

    # pour l'ordre stable de l'index il faut TOUJOURS connaitre l'ordre cible des deux familles
    all_words = select_word_targets(load_items())
    all_ex = select_ex_targets(load_extra())
    words, exs = write_index([i for i, _, _ in all_words], [i for i, _, _ in all_ex])

    miss_w = [i for i, _, p in word_targets if not is_valid(p)]
    miss_e = [i for i, _, p in ex_targets if not is_valid(p)]
    total_bytes = sum(p.stat().st_size for p in AUDIO_DIR.glob("*.mp3"))

    print(f"MP3 mots  : {len(words)} valides" + (f" / {len(word_targets)} demandes" if do_words else " (index seul)"))
    print(f"MP3 phrase: {len(exs)} valides" + (f" / {len(ex_targets)} demandes" if do_ex else " (index seul)"))
    print(f"Taille totale audio: {total_bytes / 1024 / 1024:.2f} Mo")
    if miss_w:
        print(f"MANQUANTS mots ({len(miss_w)}): {', '.join(miss_w[:10])}")
    if miss_e:
        print(f"MANQUANTS phrases ({len(miss_e)}): {', '.join(miss_e[:10])}")
    if miss_w or miss_e:
        sys.exit(1)
    print("OK — tous les audios demandes sont presents.")


if __name__ == "__main__":
    main()

# -*- coding: utf-8 -*-
"""Genere les MP3 natifs (edge-tts, ko-KR-SunHiNeural) pour tous les items du deck.

Usage: python tools/make_audio.py
Relançable: saute les MP3 deja presents et valides (>1 Ko).
Sorties: docs/audio/<id>.mp3 + docs/audio/index.js
"""

import asyncio
import json
import re
import sys
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
DATA_JS = ROOT / "docs" / "data.js"
AUDIO_DIR = ROOT / "docs" / "audio"
INDEX_JS = AUDIO_DIR / "index.js"

VOICE = "ko-KR-SunHiNeural"
RATE = "-15%"
MIN_SIZE = 1024  # octets — en dessous, fichier considere invalide
CONCURRENCY = 4
MAX_ROUNDS = 3  # tentatives globales sur les fichiers manques


def load_items():
    raw = DATA_JS.read_text(encoding="utf-8")
    start = raw.index("{")
    end = raw.rindex(";")
    data = json.loads(raw[start:end].strip())
    return data["items"]


def clean_kr(kr: str) -> str:
    # retire les parentheses (coreennes ou latines) et leur contenu
    text = re.sub(r"[(（][^)）]*[)）]", "", kr)
    return re.sub(r"\s+", " ", text).strip()


def select_targets(items):
    targets = []
    for it in items:
        text = clean_kr(it.get("kr", ""))
        if text:
            targets.append((str(it["id"]), text))
    return targets


def is_valid(path: Path) -> bool:
    return path.exists() and path.stat().st_size > MIN_SIZE


async def synth_one(sem, item_id, text, failures):
    path = AUDIO_DIR / f"{item_id}.mp3"
    if is_valid(path):
        return False  # deja fait
    async with sem:
        try:
            communicate = edge_tts.Communicate(text, VOICE, rate=RATE)
            await communicate.save(str(path))
            if not is_valid(path):
                path.unlink(missing_ok=True)
                failures.append((item_id, "fichier trop petit"))
                return False
            return True
        except Exception as exc:  # noqa: BLE001 — erreurs reseau ponctuelles
            path.unlink(missing_ok=True)
            failures.append((item_id, f"{type(exc).__name__}: {exc}"))
            return False


async def generate(targets):
    sem = asyncio.Semaphore(CONCURRENCY)
    for round_no in range(1, MAX_ROUNDS + 1):
        pending = [(i, t) for i, t in targets if not is_valid(AUDIO_DIR / f"{i}.mp3")]
        if not pending:
            break
        print(f"Round {round_no}: {len(pending)} fichier(s) a generer")
        failures = []
        results = await asyncio.gather(
            *(synth_one(sem, i, t, failures) for i, t in pending)
        )
        print(f"  -> {sum(1 for r in results if r)} genere(s), {len(failures)} echec(s)")
        for item_id, err in failures[:5]:
            print(f"     ECHEC {item_id}: {err}")
        if failures and round_no < MAX_ROUNDS:
            await asyncio.sleep(3)


def write_index(target_ids):
    present = sorted(
        p.stem for p in AUDIO_DIR.glob("*.mp3") if p.stat().st_size > MIN_SIZE
    )
    # ordre stable: ids cibles d'abord (ordre du seed), puis eventuels extras
    ordered = [i for i in target_ids if i in set(present)]
    extras = [i for i in present if i not in set(ordered)]
    ids = ordered + extras
    content = "window.AUDIO = " + json.dumps(ids, ensure_ascii=False) + ";"
    INDEX_JS.write_bytes(content.encode("utf-8"))  # UTF-8 sans BOM
    return ids


def main():
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    items = load_items()
    targets = select_targets(items)
    print(f"Cibles: {len(targets)} items (tous)")

    asyncio.run(generate(targets))

    target_ids = [i for i, _ in targets]
    ids = write_index(target_ids)
    missing = [i for i in target_ids if not is_valid(AUDIO_DIR / f"{i}.mp3")]
    total_bytes = sum(p.stat().st_size for p in AUDIO_DIR.glob("*.mp3"))

    print(f"MP3 valides: {len(ids)} / {len(target_ids)} attendus")
    print(f"Taille totale: {total_bytes / 1024 / 1024:.2f} Mo")
    if missing:
        print(f"MANQUANTS ({len(missing)}): {', '.join(missing)}")
        sys.exit(1)
    print("OK — tous les audios sont presents.")


if __name__ == "__main__":
    main()

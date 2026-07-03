# -*- coding: utf-8 -*-
"""Construit app/data.js depuis le snapshot Anki + contenu additionnel (kit voyage).
Échelle de maîtrise par item (stage):
  0 nouveau · 1 QCM KR→FR facile · 2 QCM KR→FR piégeux · 3 QCM FR→KR · 4 rappel indicé · 5 rappel pur
Mapping Anki -> stage (production = carte forward, reconnaissance = carte inverse):
  fwd jamais vue        -> 0 (ou 1/2 si l'inverse a été étudiée / est mature)
  fwd en apprentissage  -> 2
  fwd review ivl<7      -> 3 ; 7<=ivl<21 -> 4 ; ivl>=21 -> 5 (itv conservé, due conservée)
  ennemi (lapses fwd+rev >= 4) -> plafonné stage 2, due aujourd'hui
"""
import sqlite3, json, datetime, re, collections, hashlib, io

DB = r"C:\Users\33785\dev\sori\tools\snapshot.anki2"
OUT = r"C:\Users\33785\dev\sori\docs\data.js"
SEP = "\x1f"
TODAY = datetime.date(2026, 7, 3)

conn = sqlite3.connect(DB)
cur = conn.cursor()
crt = cur.execute("select crt from col").fetchone()[0]
crt_day0 = datetime.date.fromtimestamp(crt)

# ---------- lecture des notes + cartes ----------
notes = {}
for nid, tags, flds in cur.execute("select id, tags, flds from notes"):
    p = flds.split(SEP)
    notes[nid] = {"tags": tags.split(), "front": (p[0] if p else "").strip(),
                  "back": (p[1] if len(p) > 1 else "").strip()}

cards = {}
for nid, typ, queue, due, ivl, reps, lapses in cur.execute(
        "select nid, type, queue, due, ivl, reps, lapses from cards"):
    cards[nid] = {"type": typ, "queue": queue, "due": due, "ivl": ivl,
                  "reps": reps, "lapses": lapses}

fwd, rev = {}, {}
for nid, n in notes.items():
    c = cards.get(nid)
    if not c:
        continue
    entry = {**n, **c, "nid": nid}
    if "reverse" in n["tags"]:
        rev[n["front"]] = entry            # front d'une inverse = coréen
    else:
        fwd[nid] = entry

def theme_of(tags):
    for t in tags:
        if t.startswith(("a2::", "b1::")):
            return t
    return "divers"

def is_phrase(front, back, theme):
    if "grammaire" in theme or theme.endswith("_phrase"):
        return True
    return back.endswith((".", "?", "!")) or front.endswith((".", "?", "!"))

def due_date(c):
    """Date d'échéance réelle d'une carte review, sinon aujourd'hui."""
    if c["type"] == 2 and c["queue"] in (2, -3):
        d = crt_day0 + datetime.timedelta(days=c["due"])
        return max(d, TODAY)
    return TODAY

items = []
for nid, f in sorted(fwd.items()):
    theme = theme_of(f["tags"])
    r = rev.get(f["back"])          # inverse correspondante (par mot coréen)
    lapses = f["lapses"] + (r["lapses"] if r else 0)
    enemy = lapses >= 4

    if f["type"] == 0:               # jamais vue en production
        stage = 0
        if r and r["reps"] > 0:
            stage = 2 if (r["type"] == 2 and r["ivl"] >= 21) else 1
        due = TODAY if stage > 0 else None
        itv = 0
    elif f["type"] in (1, 3):        # apprentissage
        stage, itv, due = 2, 1, TODAY
    else:                            # review
        ivl = f["ivl"]
        if ivl >= 21:   stage, itv = 5, min(ivl, 90)
        elif ivl >= 7:  stage, itv = 4, ivl
        else:           stage, itv = 3, max(ivl, 1)
        due = due_date(f)

    if enemy and stage > 2:
        stage, itv, due = 2, 1, TODAY

    items.append({
        "id": str(nid), "fr": f["front"], "kr": f["back"],
        "type": "phrase" if is_phrase(f["front"], f["back"], theme) else "word",
        "theme": theme, "stage": stage, "itv": itv,
        "due": due.isoformat() if due else None,
        "enemy": enemy,
    })

# ---------- kit voyage ----------
KIT = [
    # (fr, kr, sous-theme)
    ("Nous sommes deux.", "두 명이에요.", "resto"),
    ("Le menu, s'il vous plaît.", "메뉴 주세요.", "resto"),
    ("Un comme ça, s'il vous plaît.", "이거 하나 주세요.", "resto"),
    ("Moins épicé, s'il vous plaît.", "덜 맵게 해 주세요.", "resto"),
    ("Où sont les toilettes ?", "화장실이 어디예요?", "resto"),
    ("Je vais payer.", "계산할게요.", "resto"),
    ("À emporter, s'il vous plaît.", "포장해 주세요.", "resto"),
    ("C'était délicieux.", "맛있었어요.", "resto"),
    ("Vous me recommandez quoi ?", "추천해 주세요.", "resto"),
    ("Allez à cette adresse, s'il vous plaît.", "여기로 가 주세요.", "transport"),
    ("À l'aéroport, s'il vous plaît.", "공항으로 가 주세요.", "transport"),
    ("Arrêtez-vous ici, s'il vous plaît.", "여기서 세워 주세요.", "transport"),
    ("Ce métro va à Myeongdong ?", "이 지하철이 명동에 가요?", "transport"),
    ("Deux billets, s'il vous plaît.", "표 두 장 주세요.", "transport"),
    ("Où est-ce que je change (de ligne) ?", "어디에서 갈아타요?", "transport"),
    ("J'ai réservé.", "예약했어요.", "hotel"),
    ("Je voudrais faire le check-in.", "체크인하고 싶어요.", "hotel"),
    ("Quel est le mot de passe wifi ?", "와이파이 비밀번호가 뭐예요?", "hotel"),
    ("Je voudrais rester une nuit de plus.", "하루 더 묵고 싶어요.", "hotel"),
    ("Puis-je laisser mes bagages ?", "짐을 맡길 수 있어요?", "hotel"),
    ("C'est combien, ça ?", "이거 얼마예요?", "achats"),
    ("Vous avez ça ?", "이거 있어요?", "achats"),
    ("La carte, ça marche ?", "카드 돼요?", "achats"),
    ("C'est seulement en espèces ?", "현금만 돼요?", "achats"),
    ("Pas besoin de sac.", "봉투 필요 없어요.", "achats"),
    ("Vous avez un médicament contre le rhume ?", "감기약 있어요?", "urgence"),
    ("Un antidouleur, s'il vous plaît.", "진통제 주세요.", "urgence"),
    ("J'ai une allergie.", "알레르기가 있어요.", "urgence"),
    ("Appelez la police, s'il vous plaît.", "경찰을 불러 주세요.", "urgence"),
    ("J'ai perdu mon passeport.", "여권을 잃어버렸어요.", "urgence"),
    ("J'ai perdu mon téléphone.", "핸드폰을 잃어버렸어요.", "urgence"),
    ("Je ne comprends pas bien.", "잘 모르겠어요.", "communication"),
    ("Écrivez-le, s'il vous plaît.", "써 주세요.", "communication"),
    ("Vous pouvez nous prendre en photo ?", "사진을 찍어 주세요.", "communication"),
    ("Puis-je prendre une photo ?", "사진 찍어도 돼요?", "communication"),
    ("Je parle un peu coréen.", "한국어를 조금 해요.", "communication"),
    ("Parlez-vous anglais ?", "영어 할 수 있어요?", "communication"),
    ("Ça va, merci.", "괜찮아요, 감사합니다.", "communication"),
    ("Un instant, s'il vous plaît. / Pardon (pour passer)", "잠시만요.", "communication"),
    ("Y a-t-il une supérette près d'ici ?", "이 근처에 편의점이 있어요?", "communication"),
    ("À quelle heure fermez-vous ?", "몇 시에 문을 닫아요?", "communication"),
]
# phrases du deck à rattacher au kit (déjà existantes -> tag kit, pas de doublon)
KIT_EXISTING_KR = {
    "물 좀 주세요.", "계산서 주세요.", "카드로 계산할게요.", "얼마나 걸려요?",
    "천천히 말해 주세요", "다시 말해 주세요", "도와주세요", "배가 아파요.",
    "병원에 가야 해요.", "프랑스에서 왔어요.", "실례합니다", "그냥 볼게요.",
    "너무 맵지 않게 해 주세요.", "해산물 알레르기가 있어요.",
}
by_kr = {it["kr"]: it for it in items}
kit_count_existing = 0
for kr in KIT_EXISTING_KR:
    if kr in by_kr:
        by_kr[kr]["kit"] = True
        kit_count_existing += 1
knum = 0
for fr, kr, sub in KIT:
    if kr in by_kr:                      # déjà dans le deck -> juste tagger
        by_kr[kr]["kit"] = True
        kit_count_existing += 1
        continue
    knum += 1
    # id STABLE dérivé du texte coréen (insensible à l'ordre de la liste KIT
    # -> la progression survit aux régénérations futures)
    kid = "kit-" + hashlib.sha1(kr.encode("utf-8")).hexdigest()[:8]
    items.append({
        "id": kid, "fr": fr, "kr": kr, "type": "phrase",
        "theme": "voyage::" + sub, "stage": 0, "itv": 0, "due": None,
        "enemy": False, "kit": True,
    })

# ---------- packs de contenu additionnels (tools/packs/*.json) ----------
# Chaque pack: [{fr, kr, type, theme, kit?}] — ids STABLES par hash du coréen,
# dédupliqués par kr contre tout l'existant. Les packs survivent aux régénérations.
import glob, os
PACKS_DIR = r"C:\Users\33785\dev\sori\tools\packs"
pack_count = 0
by_kr_all = {it["kr"]: it for it in items}
for pf in sorted(glob.glob(os.path.join(PACKS_DIR, "*.json"))):
    for p in json.load(io.open(pf, encoding="utf-8")):
        kr = p["kr"].strip()
        if kr in by_kr_all:
            continue                          # déjà dans le deck -> on ne duplique jamais
        pid = "pack-" + hashlib.sha1(kr.encode("utf-8")).hexdigest()[:8]
        it = {
            "id": pid, "fr": p["fr"].strip(), "kr": kr,
            "type": p.get("type", "word"), "theme": p.get("theme", "divers"),
            "stage": 0, "itv": 0, "due": None, "enemy": False,
        }
        if p.get("kit"): it["kit"] = True
        items.append(it); by_kr_all[kr] = it; pack_count += 1

# ---------- groupes de confusion (mots seulement) ----------
def root(kr):
    r = kr
    for suf in ("하다", "되다", "나다", "스럽다", "롭다"):
        if r.endswith(suf) and len(r) > len(suf):
            return r[: -len(suf)]
    return r[:-1] if r.endswith("다") and len(r) > 1 else r

words = [it for it in items if it["type"] == "word" and len(it["kr"]) >= 1]
for it in words:
    r = root(it["kr"])
    scored = []
    for other in words:
        if other["id"] == it["id"] or other["kr"] == it["kr"]:
            continue
        o = root(other["kr"])
        s = 0
        if r and o and r[0] == o[0]: s += 3            # même 1re syllabe
        if len(r) > 1 and len(o) > 1 and r[-1] == o[-1]: s += 2   # même dernière syllabe
        if other["theme"] == it["theme"]: s += 2
        if abs(len(o) - len(r)) <= 1: s += 1
        if s >= 3:
            scored.append((s, other["id"]))
    scored.sort(key=lambda x: -x[0])
    if scored:
        it["conf"] = [sid for _, sid in scored[:6]]

# ---------- stats & écriture ----------
st = collections.Counter(it["stage"] for it in items)
enemies = sum(1 for it in items if it["enemy"])
kit_total = sum(1 for it in items if it.get("kit"))
meta = {
    "generated": TODAY.isoformat(), "version": 1,
    "counts": {"items": len(items), "words": len(words),
               "phrases": len(items) - len(words), "enemies": enemies,
               "kit": kit_total, "stages": {str(k): v for k, v in sorted(st.items())}},
}
# ---------- GARDE-FOU: aucun id existant ne doit disparaître (règle d'or n°2) ----------
new_ids = {it["id"] for it in items}
if os.path.exists(OUT):
    raw_prev = io.open(OUT, encoding="utf-8").read()
    prev = json.loads(raw_prev[raw_prev.index("{"):raw_prev.rindex(";")])
    lost = [it["id"] for it in prev["items"] if it["id"] not in new_ids]
    if lost:
        raise SystemExit("ABANDON: %d ids disparaîtraient (progression du téléphone orpheline) ! Exemples: %s"
                         % (len(lost), lost[:5]))

payload = {"meta": meta, "items": items}
with open(OUT, "w", encoding="utf-8") as f:
    f.write("// Généré par tools/build_data.py — ne pas éditer à la main\n")
    f.write("window.SEED = ")
    f.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    f.write(";\n")

print(json.dumps(meta, ensure_ascii=False, indent=1))
print("packs: %d items ajoutés depuis tools/packs/" % pack_count)
print("kit: %d nouvelles + %d existantes rattachées" % (knum, kit_count_existing))
conf_cov = sum(1 for it in words if it.get("conf"))
print("confusion sets: %d/%d mots couverts" % (conf_cov, len(words)))
conn.close()

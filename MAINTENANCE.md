# MAINTENANCE.md — Manuel de maintenance de Sori

> **À qui s'adresse ce manuel.** À un mainteneur (humain ou IA) qui ne connaît pas le projet.
> Suis les recettes **à la lettre**, dans l'ordre, sans improviser. Chaque recette est une
> checklist : coche chaque case avant de passer à la suivante. Si une étape échoue et que le
> manuel ne dit pas quoi faire : **arrête-toi et n'envoie rien**. Un repo non poussé ne casse rien.
>
> **Le fait central qui gouverne tout** : la progression de l'utilisateur (des mois de révisions)
> vit dans le localStorage de SON téléphone Android, et nulle part ailleurs. Le repo est sans état.
> Une release ratée se répare en 5 minutes par un revert. Une progression détruite est
> irrécupérable (au mieux : le dernier export OneDrive). Toutes les règles découlent de ça.

---

## Sommaire

1. [Vue d'ensemble](#1-vue-densemble)
2. [Architecture détaillée](#2-architecture-détaillée)
3. [Contrats de données](#3-contrats-de-données)
4. [L'échelle de maîtrise et la planification](#4-léchelle-de-maîtrise-et-la-planification)
5. [Recettes pas-à-pas](#5-recettes-pas-à-pas)
6. [Pièges connus (vécus)](#6-pièges-connus-vécus)
7. [Checklist de non-régression avant tout push](#7-checklist-de-non-régression-avant-tout-push)
8. [Glossaire](#8-glossaire)

---

## 1. Vue d'ensemble

- **Quoi** : Sori, PWA de révision de coréen FR⇄KR (QCM progressifs, rappel, écoute, kit voyage).
- **Pour qui** : un seul utilisateur (mehdi.nafati@hotmail.fr), niveau A2→B1, sur Android,
  30-60 min/jour. Départ en Corée : le contenu et le rythme sont calés sur ce voyage.
- **Où** : prod = https://mnafati-cloud.github.io/sori/ — GitHub Pages sert `docs/` de la
  branche `main` du repo public `mnafati-cloud/sori`.
- **Avec quoi** : vanilla JS, zéro dépendance runtime, zéro bundler, zéro backend. Outillage :
  Python 3.12 (scripts `tools/`), Node 20 (`node --test`), Git Bash et PowerShell 5.1 sous Windows 11.
- **Environnement local** : le repo vit dans `C:\Users\33785\dev\sori` — **hors OneDrive**,
  c'est voulu (voir piège P5). Ne le déplace jamais dans un dossier synchronisé.

---

## 2. Architecture détaillée

### 2.1 Les quatre couches

```
┌───────────────────────────────────────────────────────────────────────┐
│ COUCHE 4 — ÉTAT (téléphone uniquement)                                │
│   localStorage "sori-state-v1" : progression {s,i,d,ok,ko} par id,    │
│   journal, réglages, session en cours. JAMAIS dans le repo.           │
├───────────────────────────────────────────────────────────────────────┤
│ COUCHE 3 — CONTENU GÉNÉRÉ (dans docs/, poussé avec l'app)             │
│   data.js   → window.SEED   (1079 items) — généré par build_data.py   │
│   extra.js  → window.EXTRA  (trivia)     — géré par merge_extra.py    │
│   audio/*.mp3 + audio/index.js → window.AUDIO — par make_audio.py     │
│   Aucune logique dedans. Ne s'éditent PAS à la main (sauf R2).        │
├───────────────────────────────────────────────────────────────────────┤
│ COUCHE 2 — APPLICATION  docs/app.js (653 lignes)                      │
│   UI, exercices, TTS/MP3, import/export, service worker registration. │
│   SEUL fichier autorisé à lire/écrire le localStorage.                │
├───────────────────────────────────────────────────────────────────────┤
│ COUCHE 1 — MOTEUR PUR  docs/engine.js (95 lignes)                     │
│   computeAnswer, selectDue, pickNew, pickDistractors, computeStreak,  │
│   DEF_SET, STEP. Zéro DOM, zéro window, zéro localStorage.            │
│   Double environnement : navigateur (root.ENGINE) ET Node             │
│   (module.exports). Comportement CONTRACTUEL, verrouillé par          │
│   tests/engine.test.mjs (20 tests).                                   │
└───────────────────────────────────────────────────────────────────────┘

Ordre de chargement (docs/index.html, NE PAS le changer) :
  data.js → extra.js → audio/index.js → engine.js → app.js
```

### 2.2 Le flux de données complet

```
        MACHINE DE DEV (Windows)                          TÉLÉPHONE (Android)
┌─────────────────────────────────────────────┐
│ tools/snapshot.anki2                        │
│  (collection Anki figée, GITIGNORÉE,        │
│   n'existe QUE sur cette machine)           │
│        │                                    │
│        │ python tools/build_data.py         │
│        │  (+ table KIT dans le script)      │
│        ▼                                    │
│ docs/data.js  = window.SEED ────────────────┼───┐
│                                             │   │
│ lot JSON produit par un workflow IA         │   │
│        │ python tools/merge_extra.py lot    │   │  git push origin main
│        ▼                                    │   │       │
│ docs/extra.js = window.EXTRA ───────────────┼───┼──▶ GitHub Pages
│                                             │   │  https://mnafati-cloud.github.io/sori/
│ docs/data.js (items kit/enemy)              │   │       │
│        │ python tools/make_audio.py         │   │       │ service worker network-first
│        │  (edge-tts, ko-KR-SunHiNeural)     │   │       ▼
│        ▼                                    │   │ ┌──────────────────────────────┐
│ docs/audio/*.mp3 + audio/index.js ──────────┼───┘ │ app installée (PWA)          │
└─────────────────────────────────────────────┘     │ localStorage sori-state-v1   │
                                                    │        │ Stats → 📤 Exporter │
                                                    │        ▼                     │
                                                    │ sori-export-AAAA-MM-JJ.json  │
                                                    └────────┼─────────────────────┘
                                                             │ partage vers OneDrive
                                                             ▼
                                              analyse par Claude (items à fort `ko`)
                                                             │
                                                             ▼
                                              prochain lot de trivia → extra.js (boucle)
```

### 2.3 Qui a le droit de toucher quoi

| Fichier | Modifiable ? | Comment |
|---|---|---|
| `docs/engine.js` | Oui, mais DANGER | Uniquement via la recette **R6** (tests d'abord) |
| `docs/app.js` | Oui | Librement, sous les règles d'or (recettes R4, R5) |
| `docs/data.js` | **Jamais à la main** | Uniquement régénéré par `tools/build_data.py` (R1) |
| `docs/extra.js` | Oui, avec précaution | Via `tools/merge_extra.py` ou la recette **R2** |
| `docs/audio/*` | **Jamais à la main** | Uniquement via `tools/make_audio.py` (R3) |
| `docs/sw.js` | Bump seulement | `CACHE` +1 à chaque release ; `ASSETS` si fichier ajouté. Ne jamais changer la stratégie network-first |
| `docs/index.html` | Rarement | Ne pas toucher l'ordre des `<script>` |
| `docs/style.css` | Oui | Librement (tout passe par les variables `:root`) |
| `docs/manifest.json` | Rarement | Additions seulement (ex. `shortcuts`) |
| `tools/*.py` | Oui | Ce sont des outils de build, pas du code de prod |
| `tests/engine.test.mjs` | Oui | Toujours dans le MÊME commit que le changement d'engine.js qu'il verrouille |
| `.gitignore` | **Ne jamais affaiblir** | Il protège les données personnelles |
| `tools/snapshot.anki2` | **Ne jamais supprimer, ne jamais pousser** | Sans lui, `build_data.py` ne peut plus tourner |

---

## 3. Contrats de données

**La règle qui chapeaute tout : ADDITIF SEULEMENT.**

| Interdit à jamais | Toujours permis |
|---|---|
| Renommer la clé `sori-state-v1` | Ajouter des champs à `ST.items[id]`, `ST.set`, aux items du seed, aux entrées EXTRA |
| Changer la sémantique de `s`, `i`, `d`, `ok`, `ko` | Ajouter des types d'exercices, des modes, des écrans |
| Réutiliser ou renuméroter un `id` | Ajouter des items (ids NOUVEAUX) |
| Supprimer un champ qu'un vieil export contient | Déprécier un champ (le laisser mort, ne plus le lire) |
| Supprimer un item du seed déjà poussé | Marquer un item comme retiré (nouveau champ), sans le supprimer |

### 3.1 Un item du SEED (`docs/data.js`, `window.SEED.items[]`)

```json
{
  "id": "1763106836914",
  "fr": "Bonjour",
  "kr": "안녕하세요",
  "type": "word",
  "theme": "a2::expressions",
  "stage": 5,
  "itv": 90,
  "due": "2027-02-09",
  "enemy": false,
  "kit": true,
  "conf": ["1779706066159", "1779706066160"]
}
```

| Champ | Type | Obligatoire | Signification |
|---|---|---|---|
| `id` | string | oui | Identifiant ÉTERNEL. Deux formats : timestamp Anki (`"1763106836914"`) pour les items issus du snapshot ; `"kit-"` + 8 hex du SHA-1 du texte coréen (`"kit-3f2a9b1c"`) pour les phrases ajoutées par le script. Jamais réutilisé, jamais changé. |
| `fr` | string | oui | Face française. |
| `kr` | string | oui | Face coréenne (hangul). Peut contenir des parenthèses explicatives — retirées avant TTS/MP3. |
| `type` | `"word"` \| `"phrase"` | oui | Détermine les exercices (word bank réservé aux phrases, Écoute réservée aux mots). |
| `theme` | string | oui | `"a2::famille"`, `"b1::travail"`, `"voyage::resto"`, `"divers"`… Sert aux distracteurs et au regroupement du kit. |
| `stage` | int 0-5 | oui | Position de DÉPART sur l'échelle (héritée d'Anki). Écrasée par le delta local dès la première réponse. |
| `itv` | int (jours) | oui | Intervalle de départ. |
| `due` | `"AAAA-MM-JJ"` ou `null` | oui | Échéance de départ. `null` = jamais introduit (stage 0). |
| `enemy` | bool | oui | Item à ≥4 échecs Anki (leech). Alimente le boss fight et la priorisation du trivia. |
| `kit` | bool | non (absent = false) | Fait partie du kit de survie voyage (54 phrases). |
| `conf` | array d'ids | non | Jusqu'à 6 ids de « sosies » (confusion réelle), calculés par build_data.py. Distracteurs prioritaires dès le stage 2. |

`window.SEED.meta` contient `generated`, `version`, `counts` (items/words/phrases/enemies/kit/stages)
— purement informatif, affiché nulle part, mais utile pour valider un rebuild.

### 3.2 Une entrée EXTRA (`docs/extra.js`, `window.EXTRA`)

Objet indexé par id d'item du seed :

```json
"1763265164777": {
  "ex":   "오늘은 바람이 아주 시원해요.",
  "exFr": "Aujourd'hui, le vent est très frais.",
  "note": "≠ 시내 (centre-ville), 시다 (acide).",
  "conj": "시원해요 / 시원했어요"
}
```

| Champ | Type | Règle |
|---|---|---|
| clé | string | DOIT être un id existant du seed. `merge_extra.py` rejette les autres, et son assert final plante si un id inconnu s'est glissé. |
| `ex` | string | Phrase d'exemple en coréen. **≤ 70 caractères** (contrainte d'affichage, appliquée par merge_extra.py). |
| `exFr` | string | Traduction de `ex`. Optionnelle mais fortement recommandée. |
| `note` | string | UNE ligne : piège, hanja, irrégularité. Affichée avec 💡. |
| `conj` | string | Conjugaisons (stocké par merge_extra.py, pas encore affiché par app.js — champ en attente, ne pas le supprimer). |

Règle éditoriale de `merge_extra.py` : une entrée existante qui a déjà un `ex` n'est **jamais
écrasée** (contenu déjà vérifié) ; seul `conj` peut y être ajouté.

### 3.3 L'index audio (`docs/audio/index.js`)

```js
window.AUDIO = ["1763107175562", "1763107259609", "kit-3f2a9b1c", ...];
```

Simple liste d'ids : la présence d'un id signifie que `docs/audio/<id>.mp3` existe et fait
plus de 1 Ko. `app.js` en fait un `Set` ; `speak(texte, id)` joue le MP3 si l'id y est, sinon
retombe sur le TTS du téléphone. Ce fichier est ENTIÈREMENT régénéré par `make_audio.py` —
ne jamais l'éditer à la main.

### 3.4 L'état localStorage (clé `sori-state-v1`)

```json
{
  "v": 1,
  "items": {
    "1763106836914": { "s": 4, "i": 8, "d": "2026-07-10", "ok": 12, "ko": 3 }
  },
  "log": {
    "2026-07-03": { "ok": 25, "ko": 4, "n": 29, "listen": 10 }
  },
  "intro": { "2026-07-03": 12 },
  "set": { "newPerDay": 12, "kitFirst": true, "rate": 0.9, "listenN": 10,
           "sessionMax": 120, "mute": false, "autoplay": true, "voice": "Google 한국의" },
  "sess": { "d": "2026-07-03", "q": ["id1", "id2"], "p": 3, "pen": 15 },
  "lastExport": "2026-06-28"
}
```

| Champ | Signification | Précisions |
|---|---|---|
| `v` | version du schéma d'état | Actuellement 1. `loadState()` accepte `v>=1`. Passer à 2 exigerait une vraie migration — hors périmètre de ce manuel, ne le fais pas. |
| `items[id]` | **delta** par item : `s` stage, `i` intervalle (jours), `d` due (`AAAA-MM-JJ`), `ok`/`ko` compteurs | N'existe que pour les items déjà touchés. Chaque champ est optionnel : `eff(id)` prend le champ du delta s'il existe, sinon celui du seed. C'est le pattern **seed + delta** — le seed peut évoluer, le delta local prime toujours. |
| `log[date]` | journal quotidien : `ok`, `ko`, `n` (total), `listen` | Alimente le streak et la rétention 7 jours. |
| `intro[date]` | nombre de nouvelles cartes introduites ce jour | Plafonne l'introduction à `set.newPerDay`. |
| `set` | réglages, fusionnés avec `DEF_SET` au chargement | **Migration douce** : `Object.assign({}, DEF_SET, s.set)` — une nouvelle clé de DEF_SET arrive automatiquement chez l'utilisateur avec sa valeur par défaut, ses valeurs existantes sont préservées. |
| `sess` | session Réviser en cours : date, file d'ids, position, en-attente | Survit au kill de l'app par Android. Restaurée si même jour. `null` hors session. |
| `lastExport` | date du dernier export | Déclenche le bandeau de rappel après 7 jours. |

### 3.5 L'export JSON (bouton 📤 Exporter, onglet Stats)

```json
{
  "app": "sori",
  "v": 1,
  "exportedAt": "2026-07-03T18:12:00.000Z",
  "seedVersion": 1,
  "state": { ...copie intégrale de l'état localStorage... }
}
```

- Nom de fichier : `sori-export-AAAA-MM-JJ.json`. Destination : OneDrive (via le partage Android).
- L'import (📥) vérifie `app === "sori"`, demande confirmation, **remplace** l'état local en le
  passant par la même migration douce que le chargement : un vieil export reste valide à vie.
- Ces fichiers sont des **données personnelles** : gitignorés (`sori-export-*.json`), jamais dans le repo.

---

## 4. L'échelle de maîtrise et la planification

### 4.1 Les 6 stages et leurs exercices

| Stage | Nom | Exercice servi par `renderReview()` |
|---|---|---|
| 0 | nouveau | Aucun — pas encore introduit. L'introduction (via `pickNew`) pose `{s:1, i:0, d:aujourd'hui}`. |
| 1 | QCM facile | `exoQcmKr2Fr` : KR affiché (+🔊) → choisir le FR parmi 4. Distracteurs SANS les confusions. |
| 2 | QCM piégeux | `exoQcmKr2Fr` : idem, mais les distracteurs `conf` (sosies) passent en premier. |
| 3 | production débutante | Phrase de ≥3 mots → `exoBuild` (word bank : reconstituer la phrase avec des chips). Sinon → `exoQcmFr2Kr` (FR affiché → choisir le KR). |
| 4 | rappel indicé | `exoRecall(hinted=true)` : FR affiché + première syllabe du KR → dire à voix haute → « Montrer » → auto-évaluation Encore/Bien. **40 % du temps** (tirage aléatoire) : `exoRecallRev` (rappel inversé KR→FR) pour entretenir la lecture. |
| 5 | rappel pur | `exoRecall(hinted=false)` : FR seul, sans indice. Même rotation 40 % de rappel inversé. |

### 4.2 Les règles de planification EXACTES (`ENGINE.computeAnswer`)

Constantes contractuelles (verrouillées par le test « valeurs contractuelles ») :

```
STEP = {2:1, 3:2, 4:4, 5:8}      // intervalle (jours) EN ARRIVANT à ce stage
DEF_SET = { newPerDay:12, kitFirst:true, rate:0.9, listenN:10,
            sessionMax:120, mute:false, autoplay:true }
```

**Bonne réponse :**
- Si `stage < 5` : `stage+1`, `itv = STEP[nouveau stage]` (repli `1` pour le stage 1, absent de STEP), `due = aujourd'hui + itv`.
- Si `stage == 5` : le stage reste 5, `itv = min(120, max(14, round(itv × 2.2)))`, `due = aujourd'hui + itv`.

**Mauvaise réponse :**
- `stage = max(1, stage − 2)`, `itv = 0`, `due = aujourd'hui`. En plus, `app.js` re-pioche
  l'item 3 à 5 cartes plus loin dans la session en cours.

**POURQUOI ces nombres (à défendre, pas à retoucher sans la recette R6) :**
- **STEP doublant (1→2→4→8 j)** : espacement expansif classique pendant la phase d'acquisition.
  Chaque promotion double l'attente — assez serré pour consolider, assez lâche pour ne pas
  engorger la file quotidienne.
- **×2.2 au stage 5** : croissance exponentielle de maintenance, légèrement plus prudente que
  le facteur 2.5 de SM-2 (Anki), car le rappel pur auto-évalué est plus indulgent qu'un vrai test.
- **Plancher 14 j** : un item qui vient d'atteindre le rappel pur ne revient pas avant deux
  semaines — sinon les 193 items du stage 5 noieraient la file.
- **Plafond 120 j** : garantit au moins ~3 passages par an et évite qu'un `due` s'enfuie au-delà
  de l'horizon d'usage (le voyage en Corée). Sans plafond, ×2.2 enverrait des items à 2 ans.
- **Échec = −2 stages (plancher 1)** : la sanction fait REDESCENDRE l'item vers une forme
  d'exercice plus facile (un rappel raté redevient un QCM) — c'est le cœur du concept d'échelle.
  Plancher 1 et pas 0 : l'item reste « en cours », il ne redevient jamais « nouveau ».
- **`itv=0, due=aujourd'hui`** : un item raté est re-testé le jour même, jamais reporté.

### 4.3 La file du jour (`buildQueue`)

1. Échues = items avec `stage ≥ 1` et `due ≤ aujourd'hui` (`selectDue`).
2. Nouvelles = jusqu'à `newPerDay − intro[aujourd'hui]` items de stage 0, kit d'abord si
   `kitFirst`, puis par id croissant (`pickNew`). Chacune est immédiatement posée à
   `{s:1, i:0, d:aujourd'hui}` et comptée dans `intro`.
3. Mélange, puis coupe à `sessionMax` (120). Le reste devient `PENDING`, proposé en fin de
   session par le bouton « Continuer (N en attente) ».

### 4.4 Ce qui compte pour la planification — et ce qui ne compte pas

| Mode | Touche la planification ? | Détail |
|---|---|---|
| Réviser (file du jour) | **OUI** | Chaque réponse passe par `applyAnswer`. |
| Boss fight (⚔️, 20 ennemies les plus faibles) | **OUI** | Vraies révisions (`BONUS=false`). Candidats : `enemy && 1 ≤ stage ≤ 4`, triés stage puis `ko`. |
| Entraînement libre (10 items stage ≥ 2) | non | `BONUS=true` : le journal est incrémenté, pas la planification. |
| Écoute (10 mots stage ≥ 2, 1 sur 2 en dictée) | non | Journal seulement (`kind: "listen"`). |
| Voyage (liste kit + drill) | non | Aucun enregistrement. |

---

## 5. Recettes pas-à-pas

> Toutes les commandes se lancent depuis `C:\Users\33785\dev\sori` (Git Bash : `cd /c/Users/33785/dev/sori`).
> Avant tout script Python qui affiche du coréen : `export PYTHONIOENCODING=utf-8` (Git Bash)
> ou `$env:PYTHONIOENCODING="utf-8"` (PowerShell). Voir piège P6.

### R1 — Ajouter du vocabulaire (nouveaux items dans le seed)

**Principe.** `docs/data.js` est entièrement régénéré par `tools/build_data.py` à partir de
`tools/snapshot.anki2` (figé) + des tables codées dans le script. Les ids sont stables
(timestamp Anki ou hash du texte coréen), donc un rebuild ne touche pas la progression.
On n'ajoute JAMAIS un item en éditant data.js à la main.

- [ ] 1. Vérifie que `tools/snapshot.anki2` existe (`ls tools/snapshot.anki2`). S'il manque : STOP,
      le rebuild est impossible (le fichier n'existe que sur cette machine, il est gitignoré).
- [ ] 2. Ouvre `tools/build_data.py` et mets à jour la constante `TODAY` (ligne ~16) à la date du
      jour : `TODAY = datetime.date(2026, 7, 15)` par exemple. (Elle sert d'ancre aux échéances.)
- [ ] 3. **Cas A — nouvelle phrase du kit voyage** : ajoute un tuple à la table `KIT` :
      `("Encore un peu, s'il vous plaît.", "조금 더 주세요.", "resto"),`
      Sous-thèmes valides : `resto`, `transport`, `hotel`, `achats`, `urgence`, `communication`
      (ce sont les clés de `TRIP_LABELS` dans app.js — un autre sous-thème s'afficherait sous
      « Essentiels du deck », pas de crash mais évite). **Ne retire JAMAIS une ligne déjà
      poussée** : son id (hash du coréen) doit continuer d'exister.
- [ ] 4. **Cas B — vocabulaire général (hors kit)** : le mécanisme n'existe pas encore dans le
      script. Ajoute EXACTEMENT ce bloc dans `build_data.py`, juste APRÈS la boucle du kit et
      juste AVANT le commentaire `# ---------- groupes de confusion` (pour que les nouveaux
      mots reçoivent leurs distracteurs) :

      ```python
      # ---------- ajouts hors Anki (id haché stable, comme le kit) ----------
      NEW_ITEMS = [
          # (fr, kr, theme, type) — NE JAMAIS retirer une ligne déjà poussée
          ("le pourboire", "팁", "b1::resto", "word"),
      ]
      for fr, kr, theme, typ in NEW_ITEMS:
          if kr in by_kr:
              continue            # déjà dans le deck -> ne rien faire
          it = {
              "id": "new-" + hashlib.sha1(kr.encode("utf-8")).hexdigest()[:8],
              "fr": fr, "kr": kr, "type": typ, "theme": theme,
              "stage": 0, "itv": 0, "due": None, "enemy": False,
          }
          items.append(it)
          by_kr[kr] = it
      ```
      Ensuite, ajouter un mot = ajouter un tuple à `NEW_ITEMS`.
- [ ] 5. Lance le build : `python tools/build_data.py`. Il imprime les compteurs (`meta`).
      Vérifie que le nombre d'items a augmenté du nombre attendu, ni plus ni moins.
- [ ] 6. **Garde-fou anti-perte — vérifie qu'AUCUN id existant n'a disparu** :

      ```bash
      python - <<'EOF'
      import io, json, subprocess
      old = subprocess.run(["git","show","HEAD:docs/data.js"], capture_output=True).stdout.decode("utf-8")
      new = io.open("docs/data.js", encoding="utf-8").read()
      def ids(raw):
          d = json.loads(raw[raw.index("{"):raw.rindex(";")])
          return {it["id"] for it in d["items"]}
      o, n = ids(old), ids(new)
      print("ids disparus :", sorted(o - n) or "AUCUN (OK)")
      print("ids nouveaux :", sorted(n - o))
      EOF
      ```
      Le résultat DOIT être `ids disparus : AUCUN (OK)`. Sinon :
      `git checkout -- docs/data.js` et cherche l'erreur — ne pousse rien.
- [ ] 7. Si les nouveaux items sont `kit` (ou `enemy`) : génère leur audio → recette **R3**.
- [ ] 8. `node --test tests/` → tout vert.
- [ ] 9. Test local (serveur + vérifier que les nouveaux items apparaissent : une phrase kit se
      voit immédiatement dans l'onglet Voyage ; un mot stage 0 apparaîtra dans les nouvelles
      cartes du jour).
- [ ] 10. Release → recette **R7**.

### R2 — Ajouter ou modifier du trivia (`docs/extra.js`)

**Cas A — lot produit par un workflow IA** (fichier JSON au format
`{"result":{"batches":[{"entries":[{"id":"...","ex":"...","exFr":"...","note":"...","conj":"..."}]}]}}`) :

- [ ] 1. `python tools/merge_extra.py chemin/vers/lot.json`
- [ ] 2. Lis les STATS imprimées : `bad_id` doit être 0 (sinon le lot référence des ids inexistants
      — corrige le lot, pas le seed) ; `long_ex` = exemples > 70 caractères rejetés.
- [ ] 3. Le script s'auto-valide (assert « id inconnu après merge ! »). S'il plante :
      `git checkout -- docs/extra.js` et recommence.
- [ ] 4. Passe au point commun ci-dessous.

**Cas B — correction ponctuelle à la main.** `extra.js` est une seule longue ligne JSON :
ne l'édite pas dans un éditeur, passe par Python :

- [ ] 1. Adapte et exécute (l'id DOIT exister dans le seed ; `ex` ≤ 70 caractères) :

      ```bash
      python - <<'EOF'
      import io, json
      P = "docs/extra.js"
      raw = io.open(P, encoding="utf-8").read()
      extra = json.loads(raw[raw.index("{"):raw.rindex(";")])
      extra["1763106836914"] = {
          "ex":   "안녕하세요, 처음 뵙겠습니다.",
          "exFr": "Bonjour, enchanté (première rencontre).",
          "note": "Registre poli standard. Entre amis proches : 안녕.",
      }
      out = "// Contenu d'aide généré + enrichi — ne pas éditer à la main\nwindow.EXTRA = "
      out += json.dumps(extra, ensure_ascii=False, separators=(",", ":")) + ";\n"
      io.open(P, "w", encoding="utf-8", newline="\n").write(out)
      print("OK,", len(extra), "entrées")
      EOF
      ```

**Point commun aux deux cas — validation obligatoire :**

- [ ] 2. Vérifie JSON + ids contre le seed :

      ```bash
      python - <<'EOF'
      import io, json
      raw = io.open("docs/data.js", encoding="utf-8").read()
      seed_ids = {it["id"] for it in json.loads(raw[raw.index("{"):raw.rindex(";")])["items"]}
      raw = io.open("docs/extra.js", encoding="utf-8").read()
      extra = json.loads(raw[raw.index("{"):raw.rindex(";")])
      bad = [k for k in extra if k not in seed_ids]
      longs = [k for k, v in extra.items() if len(v.get("ex","")) > 70]
      print("entrées :", len(extra), "| ids inconnus :", bad or "aucun", "| ex trop longs :", longs or "aucun")
      EOF
      ```
      `ids inconnus : aucun` est obligatoire. Sinon : `git checkout -- docs/extra.js`.
- [ ] 3. Test local : réponds à une carte qui a du trivia — l'encart (exemple + 💡) doit
      s'afficher après la réponse, correctement encodé (pas de `?` ni de caractères cassés).
- [ ] 4. Release → **R7**.

### R3 — Étendre l'audio natif

**Principe.** `tools/make_audio.py` génère un MP3 par item `kit` ou `enemy` (voix
`ko-KR-SunHiNeural` via edge-tts, réseau requis), puis régénère `docs/audio/index.js`.
Il est **relançable** : il saute les MP3 déjà présents et valides (> 1 Ko).

- [ ] 1. Une seule fois par machine : `pip install edge-tts`.
- [ ] 2. `export PYTHONIOENCODING=utf-8` puis `python tools/make_audio.py`.
- [ ] 3. Lis la sortie : `MP3 valides: X / X attendus` et `OK — tous les audios sont presents.`
      En cas d'échecs réseau, le script fait 3 tentatives ; s'il sort en erreur avec des
      MANQUANTS, relance-le simplement (il reprend où il en était).
- [ ] 4. Contrôle la taille totale imprimée : le budget raisonnable est < 10 Mo au total
      (~14 Ko par item). Au-delà, demande avant de pousser.
- [ ] 5. Pour cibler PLUS d'items que kit/enemy : dans `select_targets()` de make_audio.py,
      la condition est `if it.get("kit") or it.get("enemy"):`. Élargis-la explicitement, par
      exemple `if it.get("kit") or it.get("enemy") or it["stage"] >= 4:` — jamais « tous les
      items » d'un coup sans valider le budget taille à l'étape 4.
- [ ] 6. Test local : ouvre l'onglet Voyage, tape 🔊 sur une phrase — le son doit être la voix
      neurale (féminine, naturelle), pas le TTS du téléphone/PC.
- [ ] 7. `git status` : les nouveaux `.mp3` et `docs/audio/index.js` sont bien là, rien d'autre.
- [ ] 8. Release → **R7** (les MP3 ne sont pas dans `ASSETS` du service worker — c'est normal,
      ils se mettent en cache à la première lecture ; `audio/index.js` y est déjà).

### R4 — Changer un réglage par défaut

**Principe.** Les défauts vivent dans `DEF_SET` (docs/engine.js, ligne ~12) et sont verrouillés
par le test « DEF_SET et STEP : valeurs contractuelles » (tests/engine.test.mjs, fin de fichier).

- [ ] 1. **Ajouter une NOUVELLE clé** (ex. `krScale: 1.0`) : ajoute-la dans `DEF_SET`
      (engine.js) ET dans le `assert.deepEqual` du test contractuel. Même commit.
      La migration douce (`Object.assign({}, DEF_SET, s.set)`) la fera apparaître chez
      l'utilisateur avec sa valeur par défaut, sans toucher ses réglages existants.
- [ ] 2. **Changer la valeur d'une clé existante** : même manœuvre (les deux fichiers), MAIS
      sache que ça ne changera RIEN pour l'utilisateur actuel — ses réglages sont déjà
      persistés dans `ST.set` et priment sur les défauts. Si le changement doit s'appliquer
      chez lui, il devra le faire dans l'écran Réglages ; dis-le dans le message de commit.
      N'écris JAMAIS de code qui force une valeur par-dessus `ST.set`.
- [ ] 3. **Interdits** : renommer une clé, en supprimer une, changer son unité ou son sens.
- [ ] 4. Si le réglage a une UI : ajoute le contrôle dans `renderStats()` (app.js) sur le modèle
      des existants — un `<label>` + un handler `onchange` qui fait `ST.set.maClé = …; save();`.
- [ ] 5. `node --test tests/` → vert. Test local (l'écran Réglages fonctionne, la valeur se
      persiste après rechargement). Release → **R7**.

### R5 — Ajouter un exercice

- [ ] 1. Écris la fonction `exoMonExo(it)` dans app.js, à côté des autres. Modèle obligatoire :
      construire une `card` avec `el(...)`, échapper TOUT texte avec `esc(...)`, jouer l'audio
      avec `speak(it.kr, it.id)` (jamais l'API TTS en direct), et **terminer chaque chemin par
      exactement un appel** `afterAnswer(it, ok, showTrivia(card, it))` — c'est lui qui
      journalise, planifie, re-pioche les ratés et avance la file. Aucun `setTimeout(render)`
      à toi.
- [ ] 2. Branche-le dans le dispatch de `renderReview()` (app.js, bloc
      `if(it.stage<=2) … else if(it.stage===3) … else …`) avec une condition claire sur
      `it.stage` / `it.type`.
- [ ] 3. **Règle de design gravée** : chaque exercice doit avoir une variante muette — il ne doit
      JAMAIS être impossible de répondre avec `ST.set.mute` actif. (`speak()` est déjà no-op
      en mode muet ; assure-toi que la réponse ne dépend pas d'avoir entendu le son, ou
      prévois un repli comme le fait le mode Écoute.)
- [ ] 4. Le CSS va dans style.css en réutilisant les variables `:root` (`--panel2`, `--acc`, `--ok`,
      `--ko`…) et les classes existantes (`.card`, `.opts`, `.chip`, `.btn`).
- [ ] 5. Si l'exercice a besoin d'une logique pure non triviale (tokenisation, comparaison
      normalisée…) : mets-la dans engine.js + un test dans tests/engine.test.mjs, pas dans app.js.
- [ ] 6. `node --test tests/` → vert. Test local : provoque l'exercice (au besoin en modifiant
      TEMPORAIREMENT la condition de dispatch pour le forcer, puis en la remettant), réponse
      bonne ET mauvaise, vérifie la progression de la file. Release → **R7**.

### R6 — Modifier la planification (DANGER : procédure tests d'abord)

**C'est la modification la plus risquée du projet** : `computeAnswer` pilote la progression
stockée sur le téléphone. Procédure stricte, dans CET ordre :

- [ ] 1. Écris D'ABORD le comportement cible dans `tests/engine.test.mjs` : modifie les
      assertions existantes (promotion, ×2.2, plancher 14, plafond 120, rétrogradation, STEP…)
      pour qu'elles décrivent le NOUVEAU comportement voulu.
- [ ] 2. `node --test tests/` → les tests touchés échouent, TOUS les autres restent verts.
      Si un test que tu n'as pas modifié tombe, tu as mal évalué l'impact : STOP, reviens en
      arrière (`git checkout -- tests/`).
- [ ] 3. Modifie `computeAnswer` (et/ou `STEP`) dans `docs/engine.js`. RIEN d'autre. Pas de
      changement dans app.js, pas de changement de la forme du retour `{s, i, d}`.
- [ ] 4. `node --test tests/` → 100 % vert.
- [ ] 5. Contrôle de bon sens — simule la vie d'un item sans jamais échouer :

      ```bash
      node -e "
      const E = require('./docs/engine.js');
      let it = {stage:0, itv:0}, t = '2026-07-03';
      for (let k = 0; k < 12; k++) {
        const r = E.computeAnswer(it, true, t);
        console.log('stage', r.s, ' itv', r.i, ' due', r.d);
        it = {stage: r.s, itv: r.i}; t = r.d;
      }"
      ```
      La suite d'intervalles doit être croissante, plafonnée à 120, sans valeur négative ni NaN.
- [ ] 6. Vérifie que la SÉMANTIQUE n'a pas bougé : `s` reste un entier 0-5, `i` des jours,
      `d` une date `AAAA-MM-JJ`. Si ta modification change l'un de ces sens (nouvelle échelle,
      autres unités…), c'est une migration d'état — **hors périmètre de ce manuel, ne le fais
      pas seul, abandonne la modification**.
- [ ] 7. Mesure l'effet sur la charge : un plafond abaissé ou un STEP réduit peut faire échoir
      des centaines d'items d'un coup chez l'utilisateur (leurs `due` existants ne changent
      pas, mais les prochains intervalles oui). Écris une ligne dans le message de commit qui
      décrit l'effet attendu (« intervalles stage 5 raccourcis d'un tiers » etc.).
- [ ] 8. Release → **R7**.

### R7 — Déployer (release)

- [ ] 1. `node --test tests/` → tout vert (20 tests minimum). Rouge = STOP.
- [ ] 2. Bump le cache : dans `docs/sw.js`, incrémente `const CACHE = "sori-v7";` → `"sori-v8"`.
      Si tu as AJOUTÉ un fichier dans `docs/` (hors `.mp3`) : ajoute-le aussi à `ASSETS`.
- [ ] 3. Test local complet :
      ```bash
      python -m http.server 8123 --directory docs
      ```
      Ouvre http://localhost:8123 : réponds à une carte dans Réviser, lance une Écoute, ouvre
      Voyage (tape un 🔊), ouvre Stats, fais un Export. Aucune erreur dans la console (F12).
- [ ] 4. Contrôle du staging :
      ```bash
      git status
      ```
      Vérifie ligne par ligne. INTERDITS dans le commit : `*.anki2`, `sori-export-*.json`,
      fichiers hors sujet. Puis `git add <fichiers précis>` (jamais `git add -A` sans avoir lu
      le status), et `git commit -m "..."` (message : quoi + pourquoi + effet utilisateur).
- [ ] 5. Push :
      ```bash
      git push origin main
      ```
      Si ça bloque ou demande un mot de passe (session non interactive), méthode token :
      ```bash
      TOKEN=$(printf 'protocol=https\nhost=github.com\n' | git credential fill | sed -n 's/^password=//p')
      B64=$(printf 'x-access-token:%s' "$TOKEN" | base64 -w0)
      git -c http.extraHeader="Authorization: Basic $B64" push origin main
      ```
      Ne jamais afficher le token, ne jamais l'écrire dans un fichier.
- [ ] 6. Vérification post-déploiement → recette **R8**.

### R8 — Vérifier après déploiement

- [ ] 1. CI : la GitHub Action « CI » du push doit être verte
      (https://github.com/mnafati-cloud/sori/actions). Rouge = recette **R9** immédiatement.
- [ ] 2. Attends 1 à 2 minutes (build GitHub Pages), puis :
      ```bash
      curl -s https://mnafati-cloud.github.io/sori/sw.js | grep CACHE
      ```
      Tu dois voir la NOUVELLE version (`sori-v8`). Si l'ancienne s'affiche encore : attends
      une minute et réessaie — ne relance pas de push.
- [ ] 3. Si tu as touché data.js ou extra.js, vérifie qu'ils sont bien servis :
      ```bash
      curl -s https://mnafati-cloud.github.io/sori/data.js | head -c 300
      ```
- [ ] 4. Sur le téléphone : ouvrir simplement l'app. Le service worker est network-first — il
      récupère la mise à jour tout seul au chargement. Fermer/rouvrir l'app une fois si besoin.
      **Ne JAMAIS « Effacer les données du site »** pour forcer une mise à jour (piège P1).
- [ ] 5. Contrôle fonctionnel sur téléphone : une carte de Réviser + le compteur du jour qui
      s'incrémente. C'est suffisant.

### R9 — Restaurer si tout casse

**Rappel : le repo est SANS ÉTAT.** La progression est dans le téléphone de l'utilisateur et
n'est pas affectée par un déploiement cassé (au pire l'app ne charge plus — la progression
attend, intacte, dans le localStorage). Un revert git suffit TOUJOURS à réparer la prod.

- [ ] 1. Identifie le commit fautif : `git log --oneline -10`.
- [ ] 2. Annule-le proprement (PAS de `git reset --hard` sur du poussé, PAS de force push) :
      ```bash
      git revert <sha_fautif> --no-edit
      ```
      Plusieurs commits fautifs : un `git revert` par commit, du plus récent au plus ancien.
- [ ] 3. Le revert a probablement remis l'ANCIEN `CACHE` dans sw.js : rouvre `docs/sw.js` et
      donne-lui une version ENCORE JAMAIS UTILISÉE (ex. si v8 était cassée et le revert remet
      v7 : mets v9). Amende : `git add docs/sw.js && git commit --amend --no-edit`.
- [ ] 4. `node --test tests/` → vert, puis push (méthode de R7 étape 5).
- [ ] 5. Vérifie la prod (R8, étapes 2 et 4).
- [ ] 6. Cas extrême — la progression du téléphone est perdue ou corrompue (téléphone cassé,
      mauvaise manipulation) : elle se restaure depuis le dernier export OneDrive de
      l'utilisateur, via Stats → 📥 Importer. C'est SON fichier, sur SON OneDrive — il n'existe
      aucune copie dans le repo, et c'est voulu.

---

## 6. Pièges connus (vécus)

### P1 — Le service worker qui sert du périmé
- **Symptôme** : tu pousses, mais le téléphone montre l'ancienne version pendant des jours.
- **Cause** : c'est l'histoire d'avant la v4 — un service worker cache-first sert le cache pour
  toujours. Depuis la v4, `sw.js` est **network-first avec `fetch(…, {cache:"no-cache"})`** :
  chaque requête revalide auprès du serveur (un 304 via ETag ne coûte presque rien), le cache
  ne sert QUE hors-ligne.
- **Règles** : ne JAMAIS revenir à une stratégie cache-first. Toujours bump `CACHE` à chaque
  release (ça purge les vieux caches à l'activation). Si une mise à jour ne paraît pas : c'est
  presque toujours GitHub Pages qui n'a pas fini de déployer (2 min) — vérifie avec le `curl`
  de R8 avant d'accuser le téléphone.
- **Interdit absolu** : « Effacer les données du site » dans Chrome Android comme remède —
  ça supprime AUSSI le localStorage, donc toute la progression.

### P2 — Les voix TTS asynchrones sur Android
- **Symptôme** : le coréen est lu avec un accent français, ou aucune voix au premier chargement.
- **Cause** : `speechSynthesis.getVoices()` renvoie une liste VIDE au chargement de la page sur
  Android ; les voix arrivent plus tard, de façon asynchrone.
- **Ce que fait le code (à préserver)** : `pickVoice()` est appelé au boot, ré-appelé sur
  l'événement `onvoiceschanged`, ET rappelé en dernier recours dans `ttsSpeak()` si `KOVOICE`
  est null. Ne « simplifie » jamais ça en un choix de voix unique au boot.
- **Si l'appareil n'a pas de voix coréenne** : l'écran Stats affiche déjà la marche à suivre
  (installer la voix coréenne du moteur « Synthèse vocale Google »). Les items kit/enemy ont
  leur MP3 natif embarqué, indépendant du téléphone.

### P3 — `curl -d` avec de l'UTF-8 → 400 sur l'API GitHub
- **Symptôme** : un appel à l'API GitHub avec un corps JSON contenant du coréen/des accents,
  passé en `-d "..."` inline, répond 400 Bad Request.
- **Cause** : l'encodage de la ligne de commande Windows mutile l'UTF-8 avant que curl ne l'envoie.
- **Remède** : écrire le JSON dans un fichier en UTF-8 **sans BOM**, puis :
  ```bash
  curl -s -X POST -H "Authorization: Basic $B64" -H "Content-Type: application/json" \
       --data-binary "@corps.json" https://api.github.com/...
  ```
  Jamais de JSON non-ASCII inline dans `-d`.

### P4 — PowerShell 5.1 écrit de l'UTF-16 par défaut
- **Symptôme** : un fichier de `docs/` régénéré via `Out-File`/`>` PowerShell rend l'app blanche
  (le navigateur ne lit pas l'UTF-16/BOM comme du JS).
- **Remède** : ne génère JAMAIS un fichier de `docs/` avec PowerShell. Utilise les scripts
  Python fournis (ils écrivent UTF-8 sans BOM, fins de ligne contrôlées). Si PowerShell est
  inévitable : `Out-File -Encoding utf8` et vérifie le résultat.

### P5 — git et OneDrive ne cohabitent pas
- **Fait** : le repo est dans `C:\Users\33785\dev\sori`, délibérément HORS OneDrive. OneDrive
  verrouille des fichiers de `.git/` en pleine synchro et crée des conflits silencieux.
- **Règles** : ne déplace jamais le repo dans un dossier synchronisé. Le partage des données va
  dans l'autre sens uniquement : les EXPORTS de l'utilisateur (générés sur son téléphone)
  atterrissent sur OneDrive ; le code, lui, vit dans `dev/` et sur GitHub.

### P6 — Encodage console : `UnicodeEncodeError` dans les scripts Python
- **Symptôme** : `build_data.py`/`make_audio.py` plantent en imprimant du hangul
  (`UnicodeEncodeError: 'charmap' codec…`) sur console Windows cp1252.
- **Remède** : avant tout script Python : `export PYTHONIOENCODING=utf-8` (Git Bash) ou
  `$env:PYTHONIOENCODING="utf-8"` (PowerShell). Les FICHIERS produits sont corrects dans tous
  les cas (ouverts avec `encoding="utf-8"`) — seul l'affichage console casse.

### P7 — Pourquoi les ids kit sont des hash (et doivent le rester)
- **Histoire** : à l'origine, les phrases du kit étaient numérotées `kit-001`, `kit-002`… en
  SAUTANT celles déjà présentes dans le deck Anki. Le jour où un snapshot absorbait une phrase
  du kit, tous les numéros suivants se décalaient : la progression localStorage pointait sur
  les mauvais items (corrigé au commit `8130664`).
- **Depuis** : `id = "kit-" + sha1(texte_coréen)[:8]` — insensible à l'ordre de la liste et aux
  régénérations. **Ne change jamais** la fonction de hash, la casse, ni la troncature à 8 : le
  moindre changement orphelinerait la progression kit de l'utilisateur.
- **Corollaire** : corriger le TEXTE coréen d'une phrase kit change son id → c'est un NOUVEL
  item (l'ancien doit rester dans la liste). Pour une correction de texte, demande d'abord.

### P8 — Chemins et dates codés en dur dans `tools/`
- `build_data.py` : `TODAY` est une date FIXE (ligne ~16) — mets-la à jour avant chaque rebuild,
  sinon les échéances du seed sont ancrées dans le passé. `OUT` pointe sur `docs\data.js`
  (il a un jour pointé sur `app\`, dossier mort — c'est corrigé, ne le « restaure » pas).
- `make_icons.py` : écrit encore vers `...\sori\app\icon-*.png` — **chemin périmé**. Si tu dois
  régénérer les icônes, corrige d'abord les deux chemins vers `docs\` (lignes 21-22).

---

## 7. Checklist de non-régression avant tout push

À dérouler INTÉGRALEMENT avant `git push`, quel que soit le changement :

- [ ] 1. `node --test tests/` : 100 % vert (20 tests minimum, 0 fail, 0 cancelled).
- [ ] 2. La clé `sori-state-v1` et la sémantique de `s`/`i`/`d`/`ok`/`ko` sont inchangées
      (`git diff docs/app.js docs/engine.js` relu à cet œil).
- [ ] 3. Si `data.js` a été régénéré : le garde-fou « ids disparus : AUCUN » de R1.6 est passé.
- [ ] 4. Si `extra.js` a changé : la validation JSON + ids de R2.2 est passée.
- [ ] 5. Si `DEF_SET` a changé : uniquement des AJOUTS de clés, et le test contractuel mis à
      jour dans le même commit.
- [ ] 6. `CACHE` bumpé dans `docs/sw.js` (jamais deux releases avec la même version) ;
      tout nouveau fichier de `docs/` ajouté à `ASSETS`.
- [ ] 7. Test local fait : une carte de chaque mode + un export, console navigateur sans erreur.
- [ ] 8. `git status` relu ligne à ligne : AUCUN `*.anki2`, AUCUN `sori-export-*.json`,
      aucun fichier hors sujet dans le staging.
- [ ] 9. `docs/data.js` et `docs/audio/index.js` n'ont PAS été édités à la main (seulement
      régénérés par leurs scripts).
- [ ] 10. Le message de commit dit quoi, pourquoi, et l'effet visible pour l'utilisateur.

---

## 8. Glossaire

| Terme | Définition |
|---|---|
| **SRS** | Spaced Repetition System — répétition espacée : plus on réussit un item, plus il revient tard. |
| **Échelle de maîtrise / stage** | La position 0-5 d'un item : 0 nouveau · 1 QCM facile · 2 QCM piégeux · 3 production (QCM FR→KR ou word bank) · 4 rappel indicé · 5 rappel pur. Réussir monte d'un stage, échouer descend de deux (plancher 1). |
| **Seed** | Le contenu de base : `window.SEED` dans `docs/data.js`, généré depuis le snapshot Anki. 1079 items. Ne s'édite jamais à la main. |
| **Delta** | L'entrée `ST.items[id]` du localStorage : ce que l'utilisateur a fait de l'item (`s,i,d,ok,ko`). Prime toujours sur le seed (fonction `eff()`). |
| **Snapshot Anki** | `tools/snapshot.anki2` — copie figée de l'ancienne collection Anki, source du seed. Fossile : les nouveaux contenus n'en viennent plus. Gitignoré, existe uniquement sur la machine de dev. |
| **Ennemie (leech)** | Item avec ≥ 4 échecs dans l'historique Anki (`enemy: true`). 79 au total. Ciblées par le boss fight et prioritaires pour le trivia. |
| **Kit (de survie voyage)** | Les 54 phrases indispensables du voyage en Corée (`kit: true`, thèmes `voyage::*`). Introduites en priorité si `kitFirst`, drillées dans l'onglet Voyage, toutes dotées d'un MP3 natif. |
| **Conf / sosies** | Le champ `conf` d'un item : jusqu'à 6 ids de mots qui lui ressemblent (même syllabe initiale/finale, même thème). Servent de distracteurs « piégeux » dès le stage 2. |
| **Distracteurs** | Les mauvaises réponses d'un QCM. Cascade : sosies (`conf`) → même thème/type → même type. Jamais l'item lui-même, jamais deux fois la même valeur. |
| **Due / itv** | `due` = date à laquelle l'item doit être revu (`AAAA-MM-JJ`) ; `itv` = intervalle en jours qui a produit cette date. |
| **File / PENDING** | La session du jour : items échus + nouvelles, plafonnée à `sessionMax` (120). Le surplus est « en attente » (PENDING), proposé en fin de session. |
| **Bonus / Entraînement libre** | Mode de 10 cartes qui ne touche PAS la planification (contrairement au boss fight, qui compte). |
| **Boss fight** | Session ciblée sur les 20 ennemies les plus faibles. Compte pour la planification. |
| **Dictée** | Dans le mode Écoute (1 question sur 2) : on entend le mot, on choisit le HANGUL parmi des sosies. |
| **Shadowing** | Technique du drill Voyage : écouter la phrase puis la répéter à voix haute immédiatement. |
| **Trivia / EXTRA** | L'encart d'aide affiché après une réponse (exemple, note, piège) : `window.EXTRA` dans `docs/extra.js`, curé par lots via `merge_extra.py`. |
| **Migration douce** | Au chargement ET à l'import : `Object.assign({}, DEF_SET, s.set)` + valeurs par défaut pour les conteneurs manquants. Un vieil état/export reste valide à vie ; les champs inconnus sont préservés. |
| **Service worker (SW)** | `docs/sw.js` — rend l'app 100 % hors-ligne. Stratégie **network-first** : réseau d'abord (mises à jour immédiates), cache en secours (hors-ligne). `CACHE` = nom de version du cache, à bump à chaque release. |
| **PWA** | Progressive Web App : le site installé comme une app Android (manifest + service worker). |
| **GitHub Pages** | L'hébergement statique : la branche `main`, dossier `docs/`, servie sur https://mnafati-cloud.github.io/sori/. Déploiement automatique ~1-2 min après chaque push. |
| **edge-tts** | Bibliothèque Python qui appelle la synthèse vocale neurale de Microsoft Edge — produit les MP3 natifs (`ko-KR-SunHiNeural`). |
| **Streak** | Nombre de jours consécutifs avec au moins une réponse (🔥). Aujourd'hui pas encore joué ne casse pas la série en cours. |

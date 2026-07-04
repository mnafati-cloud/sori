# MAINTENANCE.md — Manuel de maintenance de Sori

> **À qui s'adresse ce manuel.** À un mainteneur (humain ou IA) qui ne connaît pas le projet.
> Suis les recettes **à la lettre**, dans l'ordre, sans improviser. Chaque recette est une
> checklist : coche chaque case avant de passer à la suivante. Si une étape échoue et que le
> manuel ne dit pas quoi faire : **arrête-toi et n'envoie rien**. Un repo non poussé ne casse rien.
>
> **Le fait central qui gouverne tout** : la progression de l'utilisateur (des mois de révisions)
> vit dans le localStorage de SON téléphone Android. Les seuls filets sont l'export manuel
> OneDrive et la sauvegarde cloud quotidienne (dépôt privé `sori-data`, recette R15). Le repo
> est sans état. Une release ratée se répare en 5 minutes par un revert. Une progression
> détruite est irrécupérable. Toutes les règles découlent de ça.

---

## Sommaire

1. [Vue d'ensemble](#1-vue-densemble)
2. [Architecture détaillée](#2-architecture-détaillée)
3. [Contrats de données](#3-contrats-de-données)
4. [L'échelle de maîtrise et la planification](#4-léchelle-de-maîtrise-et-la-planification)
5. [Recettes pas-à-pas (R1-R18)](#5-recettes-pas-à-pas)
6. [Pièges connus (vécus) (P1-P12)](#6-pièges-connus-vécus)
7. [Checklist de non-régression avant tout push](#7-checklist-de-non-régression-avant-tout-push)
8. [Glossaire](#8-glossaire)

---

## 1. Vue d'ensemble

- **Quoi** : Sori, PWA de révision de coréen FR⇄KR — QCM progressifs, rappel, saisie hangul,
  entraîneur de nombres à l'oreille, écoute (active et passive), kit voyage, dictionnaire
  personnel, simulations dialoguées, bilan de niveau (3 profils + chrono), quêtes/badges/XP,
  événements, 4 thèmes graphiques, mode avion, sauvegarde + restauration cloud, rapports de
  problème 🐞.
- **Pour qui** : un seul utilisateur (mehdi.nafati@hotmail.fr), niveau A2→B1, sur Android,
  30-60 min/jour. Départ en Corée le 2026-10-01 : le contenu et le rythme sont calés sur ce voyage.
- **Où** : prod = https://mnafati-cloud.github.io/sori/ — GitHub Pages sert `docs/` de la
  branche `main` du repo public `mnafati-cloud/sori`. Sauvegardes : repo **privé**
  `mnafati-cloud/sori-data`.
- **Avec quoi** : vanilla JS, zéro dépendance runtime, zéro bundler, zéro backend. Outillage :
  Python 3.12 (scripts `tools/`), Node 20 (`node --test`, `node --check`), Git Bash et
  PowerShell 5.1 sous Windows 11.
- **Volumes actuels (v27)** : 2154 items dans le seed (1684 mots, 470 phrases, 79 ennemies,
  54 kit), 1774 entrées de trivia dont **1628 phrases d'exemple gloses mot-à-mot (`gl`)**,
  **2154 MP3 de mots + 1628 MP3 de phrases (`-ex.mp3`), ~61 Mo**, 37 tests Node, `CACHE` = `sori-v27`.
  Ces compteurs bougent à chaque vague de contenu : la SOURCE DE VÉRITÉ est
  `window.SEED.meta.counts` (dans `docs/data.js`) — vérifie-la plutôt que de recopier ces
  nombres à l'aveugle.
- **Environnement local** : le repo vit dans `C:\Users\33785\dev\sori` — **hors OneDrive**,
  c'est voulu (voir piège P5). Ne le déplace jamais dans un dossier synchronisé.

---

## 2. Architecture détaillée

### 2.1 Les couches

```
┌───────────────────────────────────────────────────────────────────────┐
│ COUCHE 4 — ÉTAT (téléphone uniquement, JAMAIS dans le repo)           │
│   localStorage "sori-state-v1"  : progression complète (§3.4)         │
│   localStorage "sori-theme"     : thème choisi (themes.js, §3.6)      │
│   localStorage "sori-gh-token"  : jeton cloud (app.js, §3.6)          │
│   Cache Storage "sori-vNN"      : cache du service worker             │
│   Cache Storage "sori-audio-store" : audio hors-ligne « mode avion »  │
├───────────────────────────────────────────────────────────────────────┤
│ COUCHE 3 — CONTENU (dans docs/, poussé avec l'app)                    │
│   GÉNÉRÉ (jamais à la main) :                                         │
│     data.js  → window.SEED  (~2154 items) — tools/build_data.py       │
│     extra.js → window.EXTRA (~1774 trivia)— merge_extra.py/merge_pack │
│     audio/*.mp3 (mots + phrases -ex) → AUDIO/AUDIO_EX — make_audio.py  │
│   ÉDITÉ À LA MAIN (données pures, recettes dédiées) :                 │
│     events-data.js    → window.EVENTS_DATA  (R10)                     │
│     scenarios-data.js → window.SCENARIOS    (R13)                     │
├───────────────────────────────────────────────────────────────────────┤
│ COUCHE 2 — APPLICATION  docs/app.js                                   │
│   UI, exercices, XP/combo, TTS/MP3, son WebAudio (sfx), annulation    │
│   (UNDO), rapports 🐞, import/export, cloud backup + restore,         │
│   mode avion, intégration des modules.                                │
│   SEUL fichier autorisé à lire/écrire "sori-state-v1".                │
├───────────────────────────────────────────────────────────────────────┤
│ COUCHE 1b — MODULES AUTONOMES (le pattern contractuel, §2.3)          │
│   themes.js · events.js · search.js · exam.js · quests.js ·           │
│   player.js · scenarios.js · typing.js · numbers.js — table en §2.4   │
├───────────────────────────────────────────────────────────────────────┤
│ COUCHE 1 — MOTEUR PUR  docs/engine.js (~200 lignes)                   │
│   computeAnswerLegacy (GELÉ), computeAnswer étendu (ease adaptatif),  │
│   easeOf, isLeech, retention7, selectDue, pickNew, pickDistractors,   │
│   computeStreak, DEF_SET, STEP, EASE. Zéro DOM, zéro window, zéro     │
│   localStorage. Double environnement (root.ENGINE / module.exports).  │
│   Comportement CONTRACTUEL : tests/engine.test.mjs (20 tests, legacy) │
│   + tests/adaptive.test.mjs (17 tests, extension).                    │
└───────────────────────────────────────────────────────────────────────┘
```

### 2.2 Ordre de chargement (docs/index.html — NE PAS le changer)

```
<head>  : style.css → themes.css → themes.js     (thème posé AVANT le premier rendu)
<body>  : data.js → extra.js → audio/index.js → player.js → engine.js
          → events-data.js → events.js → search.js → exam.js
          → scenarios-data.js → scenarios.js → quests.js → typing.js → numbers.js → app.js
          → (script inline) enregistrement du service worker
```

Règles de cet ordre :
- `themes.js` DOIT être dans `<head>`, après le `<meta name="theme-color">` et les `<link>` CSS
  (sinon flash de thème au chargement) ;
- chaque `*-data.js` se charge AVANT son moteur (`events-data.js` avant `events.js`, etc.) ;
- tous les modules et `engine.js` se chargent AVANT `app.js` (qui les consomme) ;
- `app.js` teste `if(window.SORI_X)` avant chaque intégration : un module manquant ne casse
  pas l'app — mais ne compte pas là-dessus pour désordonner les scripts.

### 2.3 LE PATTERN MODULE CONTRACTUEL — la convention du projet

Tout module de `docs/` (existant ou futur) respecte CE contrat. C'est ce qui permet à un
mainteneur de toucher un module sans risquer la progression :

1. **IIFE double environnement** :
   ```js
   (function(root){ "use strict";
     /* partie PURE : zéro DOM, zéro localStorage, RNG injectable */
     /* partie RENDU : renderXxx(container, opts) */
     var SORI_X = { renderXxx: renderXxx, pure: { ... } };
     if (typeof module !== "undefined" && module.exports) module.exports = SORI_X;
     else root.SORI_X = SORI_X;
   })(typeof self !== "undefined" ? self : this);
   ```
   (Exceptions historiques, navigateur seulement : `themes.js`, `player.js`, `scenarios.js` —
   même esprit, sans `module.exports`.)
2. **ZÉRO localStorage dans le module.** L'état ENTRE par `opts` (ex. `log`, `dismissed`,
   `history`, `state.qdone`) et SORT par des callbacks (`onClaim`, `onDismiss`, `onFinish`,
   `setBest`…) — c'est `app.js` qui persiste dans `ST` et appelle `save()`.
   Seule exception : `themes.js` et SA clé séparée `sori-theme` (jamais `sori-state-v1`).
3. **Intégration UNIQUEMENT dans app.js**, dans le render de l'onglet concerné, gardée par
   `if(window.SORI_X){...}`. Un module ne parle jamais à un autre module.
4. **CSS auto-injecté** une seule fois (`<style id="x-styles">`), classes préfixées
   (`.event-*`, `.quest-*`, `.exam-*`, `.search-*`), en n'utilisant QUE les variables `:root`
   de style.css (donc compatible avec les 4 thèmes sans rien faire).
5. **Tout texte passe par `esc(...)`** (copie locale dans chaque module — volontaire, zéro
   couplage).
6. **Données absentes = comportement neutre.** Tableau vide, champ manquant, type inconnu :
   le module ne rend rien ou ignore, sans crash.

### 2.4 La table des MODULES — qui expose quoi, qui l'appelle, ce qu'il a le droit de faire

| Fichier | API exposée | Appelé où dans app.js | Droits / interdits |
|---|---|---|---|
| `themes.js` (+`themes.css`) | `window.SORI_THEMES = { list, get(), set(id) }` | Chargé dans `<head>` (autonome). Le `<select id="theme">` de `renderStats()` appelle `SORI_THEMES.set(id)` | SEUL module autorisé à toucher localStorage, et UNIQUEMENT la clé `sori-theme`. Pose la classe `theme-*` sur `<html>`, met à jour `<meta name="theme-color">`. Valeur inconnue → défaut `seoul`. |
| `events-data.js` | `window.EVENTS_DATA = [...]` (données pures) | — | LE fichier à éditer pour gérer un événement (R10 / MAINTENANCE-EVENTS.md). Zéro logique dedans. |
| `events.js` | `SORI_EVENTS.renderCards(container, {today, log, dismissed, onDismiss})` + `pure.activeEvents / pure.eventProgress` | Haut de `renderStats()`. Masquage persisté par app.js dans `ST.evDismiss` via `onDismiss(id)` | Zéro localStorage. 0 événement actif ⇒ ne rend RIEN. Type inconnu ignoré sans crash. |
| `search.js` | `SORI_SEARCH.renderPanel(container, {items, extra, onSpeak})` + `pure.normFr / choseong / isChoseongQuery / buildIndex / search` | `renderTrip()` (« Mon dictionnaire ») | N'écrit AUCUN état (ni ST, ni localStorage). Audio délégué via `onSpeak(kr, id)`. Index construit une fois (contenu statique), `stage`/`theme` rafraîchis aux rendus suivants. |
| `exam.js` | `SORI_EXAM.renderCard(container, {items, extra, speak, history, onFinish, onExit, random})` + `pure.buildExam / summarize / gradeOf / availability` | `renderStats()`. Historique = `ST.exams` (lecture seule), résultat ajouté par app.js via `onFinish(r)` (qui pose la date et `save()`) | **ZÉRO effet sur la planification** — rien ne va vers engine.js, aucun stage/itv/due ne bouge. Zéro localStorage. RNG injectable (tests). Deck étudié < 20 questions possibles ⇒ bouton remplacé par un message. **3 PROFILS** choisis sur la carte (`beginner` 🌱 A1-A2 thèmes a2:: seulement, strates 5/5/2 ; `standard` 🎯 A2-B1 tout le deck, le bilan classique ; `advanced` 🔥 B1+ stage ≥ 3, thèmes b1/b2 pondérés ×2, distracteurs `conf` sans cadeau) — le profil n'est PAS dans l'API, il vit dans le module. **Chrono 10 min optionnel** : ne bloque JAMAIS l'examen, il CONSTATE le dépassement. **Champs ADDITIFS** sur le résultat : `profile` et `timeSec`/`overtime` (une entrée `ST.exams` sans `profile` compte comme `standard`). **Rétrocompat prouvée** : `buildExam(items, rnd)` (2 args) === `buildExam(items, rnd, "standard")`, même flux RNG. |
| `quests.js` | `SORI_QUESTS.renderCard(container, {today, log, state, onClaim, compact})` + `pure.dailyQuests / questProgress / claimable / badges` | 2 endroits : fin de session dans `renderReview()` (`compact:true`) ET `renderStats()` (complet, avec badges) | Zéro localStorage. Réclamation → `onClaim(questId, bonusXp)` : app.js pose `ST.qdone.ids[id]=true` et crédite l'XP. **Ids de quêtes et de badges ÉTERNELS** (P11). Principe : des PLANCHERS, jamais des plafonds. |
| `player.js` | `SORI_PLAYER.renderCard(container, {tracks, rate, audioBase})`, `.stop()`, `pure.MODES / filterTracks` | `renderListen()` (carte « Écoute passive ») | Zéro localStorage, zéro écriture ST. UN SEUL élément `Audio` réutilisé (exigence Android/MediaSession). Utilitaires recopiés volontairement (zéro couplage). |
| `scenarios-data.js` | `window.SCENARIOS = [...]` (données pures, vérifiées par relecture native) | — | LE fichier à éditer pour un scénario (R13). Ids éternels (clés de `ST.scen`). |
| `scenarios.js` | `SORI_SCENARIOS.renderList(container, {speak, onAnswer, getBest, setBest})` | `renderTrip()`. Records persistés par app.js dans `ST.scen[id]` via `setBest` ; journalisation via `onAnswer(ok)` → `logAnswer(ok, "scenario")` | Zéro localStorage. Ne touche pas la planification (journal seulement). |
| `typing.js` | `SORI_TYPING.render(container, {item, speak, onResult})` + `pure.normalize / judge` | Dispatch de `renderReview()` : stage 5, `type==="word"`, **opt-in** `ST.set.typing===true`, 50 % du temps. Verdict → `onResult(ok)` → `afterAnswer(it, ok, false, "type")` | Zéro localStorage. Saisie à l'IME coréen : normalize NFC + juge Levenshtein syllabique (exact/presque/espacement) ; en cas d'écart, l'UTILISATEUR tranche (faute de frappe IME vs vraie erreur). Jamais bloquant sans clavier coréen (lien « je ne peux pas taper » → auto-évaluation). Kind journalisé : `type`. |
| `numbers.js` | `SORI_NUMBERS.renderCard(container, {speak, onAnswer, random})` + `pure.sino / native / nativeCounter / price / time / date / quantity / makeExercise` | `renderListen()` (onglet Écoute) : `if(window.SORI_NUMBERS){ SORI_NUMBERS.renderCard($screen, { speak:(txt)=>ttsSpeak(txt), onAnswer:(ok)=>logAnswer(ok,"nombres") }); }` | **ZÉRO localStorage, zéro écriture ST.** Génère à l'infini des exercices prix/heures/dates/quantités (4 modes cochables). `speak` reçoit du **TEXTE BRUT** (les nombres aléatoires n'ont PAS de MP3 → `ttsSpeak`, PAS `speak(kr,id)`). Convertisseurs purs verrouillables (sino sans 일 initial, natif déterminant, 유월/시월…), RNG injectable, hors bornes ⇒ `""`. **ZÉRO effet planification** ; journalisé par app.js sous le kind `nombres`. |

### 2.5 Le flux de données complet

```
        MACHINE DE DEV (Windows)                            TÉLÉPHONE (Android)
┌──────────────────────────────────────────────┐
│ tools/snapshot.anki2 (figé, gitignoré)       │
│   +  table KIT (dans build_data.py)          │
│   +  tools/packs/*.json (packs durables) ◀── │ ── vague de contenu : workflow IA
│        │                                     │    → python tools/merge_pack.py (R11)
│        │ python tools/build_data.py          │      (écrit le pack, régénère, fusionne
│        │  (garde-fou d'ids INTÉGRÉ)          │       le trivia des nouveaux items)
│        ▼                                     │
│ docs/data.js  = window.SEED ─────────────────┼───┐
│                                              │   │
│ lot JSON de trivia (workflow IA)             │   │  git push origin main
│        │ python tools/merge_extra.py lot     │   │       │
│        ▼                                     │   │       ▼
│ docs/extra.js = window.EXTRA ────────────────┼───┼──▶ GitHub Pages (public)
│                                              │   │  https://mnafati-cloud.github.io/sori/
│ docs/data.js (TOUS les items)                │   │       │ SW network-first
│        │ python tools/make_audio.py          │   │       ▼
│        ▼                                     │   │ ┌────────────────────────────────┐
│ docs/audio/*.mp3 + audio/index.js ───────────┼───┘ │ app installée (PWA)            │
└──────────────────────────────────────────────┘     │ localStorage sori-state-v1     │
                                                     │   │ Stats → 📤 Exporter        │
                 analyse par Claude (R15/R16)        │   │ (partage vers OneDrive)    │
                        ▲                            │   │                            │
                        │                            │   │ auto-backup quotidien      │
              GitHub repo PRIVÉ sori-data ◀──────────┼───┘ (jeton sori-gh-token)      │
              exports/latest.json                    └────────────────────────────────┘
              exports/sori-export-AAAA-MM-JJ.json
```

### 2.6 Qui a le droit de toucher quoi

| Fichier | Modifiable ? | Comment |
|---|---|---|
| `docs/engine.js` | Oui, mais DANGER | `computeAnswerLegacy` : **JAMAIS** (gelé à vie). Le reste : recette **R6** (tests d'abord). |
| `docs/app.js` | Oui | Librement, sous les règles d'or (recettes R4, R5). Seul fichier à toucher `sori-state-v1`. |
| `docs/data.js` | **Jamais à la main** | Régénéré par `tools/build_data.py` (R1, R11). |
| `docs/extra.js` | Oui, avec précaution | Via `merge_extra.py`, `merge_pack.py` ou la recette **R2** (édition Python). |
| `docs/audio/*` | **Jamais à la main** | Uniquement via `tools/make_audio.py` (R3). |
| `docs/events-data.js` | Oui | Recette **R10** = `MAINTENANCE-EVENTS.md`. Ids éternels. |
| `docs/scenarios-data.js` | Oui, avec précaution | Recette **R13**. Ids éternels, contenu à faire vérifier. |
| `docs/events.js`, `search.js`, `exam.js`, `quests.js`, `player.js`, `scenarios.js`, `typing.js`, `numbers.js` | Oui, avec précaution | Respecter le pattern §2.3. Mettre à jour la page de test `docs/design/*-test.html` correspondante dans le même commit. Pour quests.js : recette **R12**. Ajouter/retirer un module : recette **R17**. |
| `docs/themes.js` + `docs/themes.css` | Oui | Recette **R14**. Ne jamais retirer/renommer un thème existant. |
| `docs/sw.js` | Bump seulement | `CACHE` +1 à chaque release ; `ASSETS` si fichier JS/CSS ajouté. Ne jamais revenir à du cache-first. Ne JAMAIS purger `"sori-audio-store"`. |
| `docs/index.html` | Rarement | Ne pas toucher l'ordre des `<script>` (§2.2). |
| `docs/style.css` | Oui | Librement (tout passe par les variables `:root`). Vérifier le rendu dans les 4 thèmes. |
| `docs/manifest.json` | Rarement | Additions seulement. |
| `docs/design/*` | Oui | Pages de test autonomes, non référencées par l'app (pas dans ASSETS). Les enrichir est encouragé. |
| `tools/*.py` | Oui | Outils de build, pas du code de prod. |
| `tools/packs/*.json` | **Additif seulement** | Ne JAMAIS retirer un item d'un pack déjà poussé (son id disparaîtrait du seed — le garde-fou du build refusera de toute façon). |
| `tests/*.mjs` | Oui | Toujours dans le MÊME commit que le changement d'engine.js qu'ils verrouillent. |
| `.gitignore` | **Ne jamais affaiblir** | Il protège les données personnelles. |
| `tools/snapshot.anki2` | **Ne jamais supprimer, ne jamais pousser** | Sans lui, `build_data.py` ne peut plus tourner. |

---

## 3. Contrats de données

**La règle qui chapeaute tout : ADDITIF SEULEMENT.**

| Interdit à jamais | Toujours permis |
|---|---|
| Renommer la clé `sori-state-v1` | Ajouter des champs à `ST.items[id]`, `ST.log[date]`, `ST.set`, aux items du seed, aux entrées EXTRA |
| Changer la sémantique de `s`, `i`, `d`, `e`, `ok`, `ko` | Ajouter des types d'exercices, des modes, des écrans, des modules |
| Réutiliser ou renuméroter un `id` (item, événement, quête, badge, scénario) | Ajouter du contenu avec des ids NOUVEAUX |
| Supprimer un champ qu'un vieil export contient | Déprécier un champ (le laisser mort, ne plus le lire) |
| Supprimer un item du seed déjà poussé | Marquer un item comme retiré (nouveau champ), sans le supprimer |

### 3.1 Un item du SEED (`docs/data.js`, `window.SEED.items[]`)

```json
{
  "id": "1763106836914",
  "fr": "Bonjour", "kr": "안녕하세요",
  "type": "word", "theme": "a2::expressions",
  "stage": 5, "itv": 90, "due": "2027-02-09",
  "enemy": false, "kit": true,
  "conf": ["1779706066159", "1779706066160"]
}
```

| Champ | Type | Obligatoire | Signification |
|---|---|---|---|
| `id` | string | oui | Identifiant ÉTERNEL. **Trois formats** : timestamp Anki (`"1763106836914"`) pour les items du snapshot ; `"kit-"` + 8 hex du SHA-1 du texte coréen pour les phrases de la table KIT ; `"pack-"` + 8 hex du SHA-1 du coréen pour les items des packs `tools/packs/`. Jamais réutilisé, jamais changé. |
| `fr` / `kr` | string | oui | Faces. `kr` peut contenir des parenthèses explicatives — retirées avant TTS/MP3. |
| `type` | `"word"` \| `"phrase"` | oui | Détermine les exercices (word bank réservé aux phrases, Écoute active réservée aux mots). |
| `theme` | string | oui | `"a2::famille"`, `"b1::travail"`, `"voyage::resto"`, `"divers"`… Distracteurs, regroupement kit, thèmes faibles du bilan. |
| `stage` | int 0-5 | oui | Position de DÉPART sur l'échelle. Écrasée par le delta local dès la première réponse. |
| `itv` | int (jours) | oui | Intervalle de départ. |
| `due` | `"AAAA-MM-JJ"` ou `null` | oui | Échéance de départ. `null` = jamais introduit (stage 0). |
| `enemy` | bool | oui | Item à ≥4 échecs Anki (leech historique). Boss fight + priorisation trivia. |
| `kit` | bool | non | Kit de survie voyage (54 phrases). |
| `conf` | array d'ids | non | Jusqu'à 6 « sosies » (calculés par build_data.py). Distracteurs prioritaires dès le stage 2. |

`window.SEED.meta` contient `generated`, `version`, `counts` — informatif, sert à valider un
rebuild (source de vérité du compte : `SEED.meta.counts`, ~2154 items à la v26).

### 3.2 Une entrée EXTRA (`docs/extra.js`, `window.EXTRA`)

Objet indexé par id d'item du seed (~1774 entrées à la v26) :

```json
"1763265164777": { "ex": "오늘은 바람이 아주 시원해요.", "exFr": "Aujourd'hui, le vent est très frais.",
                   "note": "≠ 시내 (centre-ville), 시다 (acide).", "conj": "시원해요 / 시원했어요",
                   "gl": ["aujourd'hui (오늘)", "le vent (sujet)", "très", "être frais (poli, 시원하다)"] }
```

| Champ | Règle |
|---|---|
| clé | DOIT être un id existant du seed. `merge_extra.py`/`merge_pack.py` rejettent les autres et s'auto-valident par assert. |
| `ex` | Phrase d'exemple KR, **≤ 70 caractères** (contrainte d'affichage, appliquée par les scripts). |
| `exFr` | Traduction de `ex`. |
| `note` | UNE ligne (piège, hanja, anti-confusion), ≤ 110 caractères. Affichée avec 💡. |
| `conj` | Conjugaisons — **affichée** dans l'encart trivia (préfixe 활용) depuis la v8. |
| `gl` | **Gloses mot-à-mot** (v27) : tableau FR aligné 1:1 avec `ex.split(espaces)`. Rempli par `merge_gloss.py` (recette R19). Alimente la traduction d'un mot au clic (réglage opt-in `wordgloss`). **Invariant CRITIQUE : `gl.length === ex.trim().split(/\s+/).length`** — app.js zippe mot↔glose par index ; sinon la fonctionnalité se désactive silencieusement pour cette entrée. |

Règle éditoriale : une entrée existante qui a déjà un `ex` n'est **jamais écrasée** (contenu
déjà vérifié) ; seuls `conj` et `gl` peuvent y être ajoutés.

### 3.3 L'index audio (`docs/audio/index.js`)

```js
window.AUDIO    = ["1763106836914", "kit-3f2a9b1c", "pack-a1b2c3d4", ...];   // MP3 de MOT   <id>.mp3
window.AUDIO_EX = ["1763265164777", ...];                                    // MP3 de PHRASE <id>-ex.mp3
```

Deux familles, même voix `ko-KR-SunHiNeural` :
- **AUDIO** — un MP3 par item du deck (`<id>.mp3`). 2154/2154 à la v27. `app.js` → `AUDIO_IDS` ;
  `speak(texte, id)` joue le MP3 si présent, sinon TTS du téléphone.
- **AUDIO_EX** (v27) — un MP3 par phrase d'exemple (`<id>-ex.mp3`), pour les ids ayant un `ex`.
  1628 à la v27. `app.js` → `AUDIO_EX_IDS` ; `speakEx(id, texte)` joue `<id>-ex.mp3`, sinon TTS.
  Alimente le bouton 🔊 de l'encart trivia (réglage opt-in `exaudio`).

Total audio ~61 Mo. La présence d'un id ⇒ le fichier existe et fait > 1 Ko. Fichier `index.js`
ENTIÈREMENT régénéré par `make_audio.py` — jamais à la main. Le bouton « Mode avion » télécharge
les DEUX familles dans le cache `sori-audio-store`.

### 3.4 L'état localStorage (clé `sori-state-v1`) — CONTRAT COMPLET

```json
{
  "v": 1,
  "items": { "1763106836914": { "s": 4, "i": 8, "d": "2026-07-10", "e": 2.25, "ok": 12, "ko": 3 } },
  "log": {
    "2026-07-03": {
      "ok": 25, "ko": 4, "n": 29, "listen": 10, "xp": 310,
      "ok1": 18, "ko1": 3, "so": 96, "sn": 104,
      "k": { "qcm2": { "o": 6, "x": 1, "t": 210, "c": 7 }, "rec5": { "o": 4, "x": 2, "t": 350, "c": 6 } }
    }
  },
  "intro": { "2026-07-03": 12 },
  "xp": 12480,
  "set": { "newPerDay": 12, "kitFirst": true, "rate": 0.9, "listenN": 10, "sessionMax": 120,
           "mute": false, "autoplay": true, "adaptive": false, "typing": false, "report": false,
           "voice": "Google 한국의" },
  "sess": { "d": "2026-07-03", "q": ["id1", "id2"], "p": 3, "pen": 15 },
  "scen": { "resto": 7 },
  "qdone": { "d": "2026-07-03", "ids": { "reponses30": true } },
  "exams": [ { "date": "2026-06-28", "profile": "standard", "score": 31, "total": 40, "pct": 78,
               "grade": "A2+ / B1 en approche", "timeSec": 420, "overtime": false,
               "sections": { "A": { "ok": 10, "n": 12, "pct": 83 } }, "weak": ["b1::travail"] } ],
  "evDismiss": { "seoul-2026": true },
  "reports": [ { "d": "2026-07-03T18:12:00.000Z",
                 "ctx": { "tab": "review", "carte": { "id": "1763106836914", "kr": "안녕하세요", "stage": 4 },
                          "pos": "3/29", "derniereReponse": { "id": "…", "kr": "…", "ok": false, "kind": "rec5" } },
                 "txt": "l'audio ne se lance pas sur cette carte" } ],
  "lastExport": "2026-06-28",
  "lastCloud": "2026-07-03"
}
```

| Champ | Signification | Précisions |
|---|---|---|
| `v` | version du schéma | Actuellement 1. `loadState()` accepte `v>=1`. Passer à 2 exigerait une vraie migration — hors périmètre, ne le fais pas. |
| `items[id]` | **delta** par item : `s` stage, `i` intervalle (jours), `d` due, `e` ease adaptative (float 2 déc., clampée [1.3, 3.0]), `ok`/`ko` compteurs | N'existe que pour les items déjà touchés. Chaque champ optionnel : `eff(id)` prend le delta s'il existe, sinon le seed. `e` absent ⇒ seed paresseux via `easeOf()` (ALGORITHM.md §3). Pattern **seed + delta** : le seed peut évoluer, le delta prime. |
| `log[date]` | journal quotidien | `ok`/`ko`/`n` : compteurs globaux · `listen` : réponses des exercices d'écoute (kinds `listen`+`dictee`) · `xp` : XP gagnée ce jour (réponses + bonus de quêtes) · `ok1`/`ko1` : réponses **comptées** (1re présentation espacée non anticipée — la mesure « propre » de rétention) · `so`/`sn` : sommes des intervalles legacy (`so`) vs adaptatif (`sn`) sur les succès comptés (le « shadow » de la phase 1, cf. R16) · `k` : télémétrie par type d'exercice. |
| `log[date].k[kind]` | `{o, x, t, c}` par exercice | `o`=réussites, `x`=échecs, `t`=somme des temps de réponse en **dixièmes de seconde**, `c`=réponses chronométrées. Kinds existants : `qcm1` (stage 0-1), `qcm2` (stage 2), `qcm3` (FR→KR), `build`, `rec4`, `rec5`, `recrev`, `type` (saisie hangul), `listen`, `dictee`, `scenario`, `nombres` (entraîneur numbers.js). Champ absent ⇒ 0, jamais d'erreur. |
| `intro[date]` | nouvelles cartes introduites ce jour | Plafonne l'introduction à `set.newPerDay`. |
| `xp` | XP cumulée (entier) | Réponse juste : 10 + bonus combo (jusqu'à +20) ; réponse fausse : 2 ; quête réclamée : +30/50/80. Niveaux 급 par paliers (`XP_LEVELS` dans app.js) — plancher, jamais un plafond. |
| `set` | réglages, fusionnés avec `DEF_SET` au chargement | **Migration douce** : `Object.assign({}, DEF_SET, s.set)`. `DEF_SET` (engine.js) = `{newPerDay:12, kitFirst:true, rate:0.9, listenN:10, sessionMax:120, mute:false, autoplay:true, adaptive:false, typing:false, report:false}` — verrouillé par le test contractuel (P10). `voice` s'ajoute quand l'utilisateur choisit une voix TTS. `adaptive` = bascule phase 2 (R16) ; `typing` = saisie hangul au stage 5 (opt-in) ; `report` = affiche le bouton 🐞 de la topbar (opt-in Réglages ; `wireReport()` met `#report.hidden = ST.set.report !== true`). |
| `sess` | session Réviser en cours : `d` date, `q` file d'ids, `p` position, `pen` en-attente | Survit au kill de l'app par Android. Restaurée si même jour. `null` hors session. |
| `scen` | meilleurs scores des scénarios : `{scenarioId: répliquesDuPremierCoup}` | Clés = ids de `SCENARIOS` — éternels (P11). Sert au badge « Scénarios parfaits ». |
| `qdone` | quêtes réclamées AUJOURD'HUI : `{d: date, ids: {questId: true}}` | Réinitialisé quand `d` ≠ aujourd'hui. Clés = ids de quêtes (éternels, P11). |
| `exams` | historique des bilans de niveau (append-only) | Un objet `summarize()` + `date` par bilan. Ne jamais réécrire les entrées passées. Champs ADDITIFS depuis v20 : `profile` (`beginner`/`standard`/`advanced` ; absent ⇒ `standard`) et `timeSec`/`overtime` (chrono). Un vieux bilan sans ces champs reste valide. |
| `evDismiss` | événements masqués : `{eventId: true}` | PERMANENT — c'est pour ça qu'un id d'événement ne se recycle jamais (P11). |
| `reports` | feedbacks 🐞 de l'utilisateur (append, **cap 100**) | Apparu en v24. Chaque entrée = `{d: ISO, ctx:{tab, carte:{id,kr,stage}, pos, derniereReponse:{id,kr,ok,kind}}, txt}`. Écrit par app.js (`openReportModal`) quand `ST.set.report===true` ; le cap est appliqué par `slice(-99)` avant `push`. **Embarqué dans chaque sauvegarde cloud** → c'est le canal de feedback que Claude LIT en priorité (P12, R18). N'est JAMAIS auto-effacé — l'utilisateur ne les voit pas, seul un compteur s'affiche dans Stats. |
| `lastExport` | date du dernier export (manuel OU cloud) | Bandeau de rappel après 7 jours. |
| `lastCloud` | date de la dernière sauvegarde cloud réussie | L'auto-backup de fin de session ne tourne qu'une fois par jour (`lastCloud !== aujourd'hui`). |

**Variables de SESSION (RAM seulement — JAMAIS persistées dans `sori-state-v1`).** À connaître
pour ne pas les confondre avec l'état :
- `LASTANS` (`{id, kr, ok, kind}`) : la dernière réponse notée, posée par `afterAnswer`. Sert
  UNIQUEMENT à remplir `ctx.derniereReponse` d'un rapport 🐞. Perdue au rechargement.
- `UNDO` : snapshot COMPLET d'un niveau (copie de `ST.items`, du `log` du jour, `xp`, combo,
  file de session) pris par `armUndo()` avant chaque réponse ; `undoLast()` le restaure puis le
  vide. **Annulation 1 seul niveau**, anti-clic-accidentel. Non persisté : rouvrir l'app = pas
  d'annulation disponible.
- `COOLDOWN` (via `armCooldown()`, classe CSS `cooldown` 450 ms) : verrou anti-misclic à
  l'apparition d'une carte (les boutons ignorent les taps pendant 450 ms). Pur affichage/timing.
- Le **son de feedback** (`sfx(ok)`) est du WebAudio synthétisé à la volée (aucun fichier),
  coupé si `ST.set.mute`. Rien à persister non plus.

### 3.5 L'export JSON et les sauvegardes cloud

```json
{ "app": "sori", "v": 1, "exportedAt": "2026-07-03T18:12:00.000Z",
  "seedVersion": 1, "state": { ...copie intégrale de l'état localStorage... } }
```

- **Sauvegarde cloud** (Stats → ☁️, + auto 1×/jour en fin de session) : le MÊME payload, poussé
  via l'API GitHub dans le repo **privé** `mnafati-cloud/sori-data` : `exports/latest.json`
  (écrasé) + `exports/sori-export-AAAA-MM-JJ.json` (un par jour). Jeton fine-grained (dépôt
  sori-data, permission Contents) stocké UNIQUEMENT sur le téléphone (`sori-gh-token`),
  jamais inclus dans un export. C'est le canal principal (voir R18). Lecture côté PC : recette **R15**.
- **Restauration cloud** (Stats → ↓ Restaurer, depuis v26) : `cloudRestore()` télécharge
  `exports/latest.json` du même repo, vérifie `app === "sori"`, demande confirmation (affiche la
  date de la sauvegarde) et **remplace** l'état local via `applyImportedState` (migration douce).
  Backup + restore = le cloud gère TOUT le cycle de vie de la progression, sans passer par un fichier.
- **Export/Import fichier = secours HORS-LIGNE** (repliés dans un `<details>` de Stats depuis v26) :
  - Export manuel (📤) : fichier `sori-export-AAAA-MM-JJ.json`, partagé vers OneDrive.
  - Import (📥) : vérifie `app === "sori"`, demande confirmation, **remplace** l'état local en le
    passant par la même migration douce que le chargement (`applyImportedState`) : un vieil export
    reste valide à vie.
- Ces fichiers sont des **données personnelles** : gitignorés (`sori-export-*.json`), jamais
  dans un repo public.

### 3.6 Les AUTRES clés de stockage du téléphone (à connaître pour ne pas les casser)

| Stockage | Clé | Écrite par | Contenu |
|---|---|---|---|
| localStorage | `sori-state-v1` | app.js UNIQUEMENT | La progression (§3.4). |
| localStorage | `sori-theme` | themes.js UNIQUEMENT | L'id du thème (`seoul`/`nuit`/`hanji`/`dansaekhwa`). Valeur inconnue ⇒ défaut. |
| localStorage | `sori-gh-token` | app.js (`setGhToken`) | Jeton GitHub fine-grained du cloud backup. JAMAIS exporté, JAMAIS loggé. |
| Cache Storage | `sori-vNN` | service worker | Cache réseau de l'app (purgé à chaque bump de CACHE). |
| Cache Storage | `sori-audio-store` | app.js (bouton « Mode avion ») | Les ~2154 MP3 (tout le deck) téléchargés pour le hors-ligne total. **Le SW ne doit JAMAIS le purger** (exclusion explicite dans `activate` — ne la retire pas). |

---

## 4. L'échelle de maîtrise et la planification

### 4.1 Les 6 stages et leurs exercices

| Stage | Nom | Exercice servi par `renderReview()` (kind journalisé) |
|---|---|---|
| 0 | nouveau | Aucun — pas encore introduit. L'introduction (via `pickNew`) pose `{s:1, i:0, d:aujourd'hui}`. |
| 1 | QCM facile | `exoQcmKr2Fr` (`qcm1`) : KR affiché (+🔊) → choisir le FR parmi 4. Distracteurs SANS les confusions. |
| 2 | QCM piégeux | `exoQcmKr2Fr` (`qcm2`) : idem, distracteurs `conf` (sosies) en premier. |
| 3 | production débutante | Phrase de ≥3 mots → `exoBuild` (`build`, word bank). Sinon → `exoQcmFr2Kr` (`qcm3`). |
| 4 | rappel indicé | `exoRecall(hinted=true)` (`rec4`) : FR + première syllabe → auto-évaluation. **40 %** du temps : `exoRecallRev` (`recrev`, KR→FR). |
| 5 | rappel pur | `exoRecall(hinted=false)` (`rec5`) : FR seul. Même rotation 40 % de `recrev`. Si `ST.set.typing` (opt-in Réglages) : 50 % des MOTS passent en **saisie hangul** (`type`, module typing.js). |

### 4.2 Les règles de planification — legacy GELÉE + extension adaptative

**Constantes contractuelles** (verrouillées par les tests) :

```
STEP = {2:1, 3:2, 4:4, 5:8}      // intervalle (jours) EN ARRIVANT à ce stage
DEF_SET = { newPerDay:12, kitFirst:true, rate:0.9, listenN:10, sessionMax:120,
            mute:false, autoplay:true, adaptive:false, typing:false, report:false,
            exaudio:false, wordgloss:false }
```

**La planification LEGACY (`computeAnswerLegacy`, GELÉE À VIE — ne se modifie JAMAIS)** :
- Bonne réponse, `stage < 5` : `stage+1`, `itv = STEP[nouveau stage]` (repli 1 pour le stage 1),
  `due = aujourd'hui + itv`.
- Bonne réponse, `stage == 5` : stage reste 5, `itv = min(120, max(14, round(itv × 2.2)))`.
- Mauvaise réponse : `stage = max(1, stage − 2)`, `itv = 0`, `due = aujourd'hui`, et `app.js`
  re-pioche l'item 3 à 5 cartes plus loin dans la session.

**POURQUOI ces nombres (à défendre, pas à retoucher)** : STEP doublant = espacement expansif
d'acquisition ; ×2.2 = maintenance légèrement plus prudente que SM-2 (l'auto-évaluation est
indulgente) ; plancher 14 j = les 193 items du stage 5 ne noient pas la file ; plafond 120 j =
≥ ~3 passages/an, aligné sur l'horizon voyage ; échec = −2 stages (plancher 1) = redescendre
vers un exercice plus facile sans redevenir « nouveau » ; `itv=0` = re-testé le jour même.

**L'EXTENSION ADAPTATIVE (`computeAnswer(it, ok, today, adaptive)`)** — spec complète :
`ALGORITHM.md`. Résumé opérationnel :
- retourne `{s, i, d, e, counted, early, iLegacy, iAdaptive}` ;
- **`adaptive=false` (phase 1, l'état ACTUEL) : `s/i/d` = sortie legacy BIT-À-BIT** (verrouillé
  par le test « phase 1 » d'adaptive.test.mjs) ; `e` (ease par mot) et `counted` sont calculés
  et stockés quand même — c'est la phase « ombre » ;
- `adaptive=true` (phase 2, bascule utilisateur — R16) : paliers et croissance mis à l'échelle
  par l'ease `e` (gain +0.05 par succès compté, perte 0.244 atténuée si échec tardif, gel en
  re-vu de session et en révision anticipée type boss fight), crédit de retard, plancher
  stage 5 scalé. Le chemin d'ÉCHEC est inchangé (filet de sécurité) ;
- constantes dans `ENGINE.EASE`. **`EASE_LOSS` est DÉRIVÉ de `TARGET_RETENTION` (0.83) — ne
  jamais l'éditer à la main.** Réglage : `TARGET_RETENTION` seul, bornes [0.78, 0.88] (R16).

### 4.3 La file du jour (`buildQueue`)

1. Échues = items avec `stage ≥ 1` et `due ≤ aujourd'hui` (`selectDue`).
2. Nouvelles = jusqu'à `newPerDay − intro[aujourd'hui]` items de stage 0, kit d'abord si
   `kitFirst`, puis par id croissant (`pickNew`). Chacune posée à `{s:1, i:0, d:aujourd'hui}`.
3. Mélange, coupe à `sessionMax` (120). Le reste = PENDING (« Continuer (N en attente) »).

### 4.4 Ce qui compte pour la planification — et ce qui ne compte pas

| Mode | Planification ? | Journal ? | Détail |
|---|---|---|---|
| Réviser (file du jour) | **OUI** | oui (+XP) | Chaque réponse passe par `applyAnswer`. |
| Boss fight (⚔️, 20 ennemies les plus faibles) | **OUI**¹ | oui (+XP) | `BONUS=false`. ¹ En phase 2 adaptative, un succès trop anticipé (< 75 % de l'intervalle) devient un no-op de planification — c'est voulu (ALGORITHM.md). |
| Entraînement libre (10 items stage ≥ 2) | non | oui (sans XP) | `BONUS=true`. |
| Écoute active (10 mots stage ≥ 2, 1 sur 2 en dictée) | non | oui (`listen`/`dictee`) | |
| Écoute passive (player.js) | non | **non** | Aucun enregistrement. |
| Voyage (liste kit + drill) | non | non | |
| Dictionnaire (search.js) | non | non | |
| Scénarios (scenarios.js) | non | oui (`scenario`) + record `ST.scen` | |
| Bilan de niveau (exam.js) | **non, par contrat** | non (historique `ST.exams` seulement) | C'est un thermomètre, pas un exercice. |
| Quêtes (quests.js) | non | XP seulement (`log.xp`, `ST.xp`) | Réclamation via `onClaim`. |

---

## 5. Recettes pas-à-pas

> Toutes les commandes se lancent depuis `C:\Users\33785\dev\sori` (Git Bash : `cd /c/Users/33785/dev/sori`).
> Avant tout script Python qui affiche du coréen : `export PYTHONIOENCODING=utf-8` (Git Bash)
> ou `$env:PYTHONIOENCODING="utf-8"` (PowerShell). Voir piège P6.

### R1 — Ajouter du vocabulaire (nouveaux items dans le seed)

**Principe.** `docs/data.js` est entièrement régénéré par `tools/build_data.py` à partir de
`tools/snapshot.anki2` (figé) + la table `KIT` du script + les packs `tools/packs/*.json`.
Les ids sont stables (timestamp Anki, ou hash du texte coréen pour kit/packs), donc un rebuild
ne touche pas la progression. **Le garde-fou anti-perte d'ids est INTÉGRÉ au build** : il
abandonne (SystemExit) si un id existant disparaît. On n'ajoute JAMAIS un item en éditant
data.js à la main.

- [ ] 1. Vérifie que `tools/snapshot.anki2` existe (`ls tools/snapshot.anki2`). S'il manque : STOP,
      le rebuild est impossible (fichier gitignoré, présent uniquement sur cette machine).
- [ ] 2. Ouvre `tools/build_data.py` et mets à jour la constante `TODAY` (ligne ~16) à la date du
      jour. (Elle sert d'ancre aux échéances.)
- [ ] 3. **Cas A — nouvelle phrase du kit voyage** : ajoute un tuple à la table `KIT` :
      `("Encore un peu, s'il vous plaît.", "조금 더 주세요.", "resto"),`
      Sous-thèmes valides : `resto`, `transport`, `hotel`, `achats`, `urgence`, `communication`
      (clés de `TRIP_LABELS` dans app.js). **Ne retire JAMAIS une ligne déjà poussée.**
- [ ] 4. **Cas B — vocabulaire général (hors kit)** : passe par un PACK. Deux options :
      - une **vague de contenu** produite par un workflow IA → recette **R11** (merge_pack.py) ;
      - un **petit ajout manuel** → crée ou complète un fichier `tools/packs/pack-AAAA-MM-nom.json` :
        ```json
        [ {"fr": "le pourboire", "kr": "팁", "type": "word", "theme": "b1::resto"},
          {"fr": "…", "kr": "…", "type": "phrase", "theme": "voyage::resto", "kit": true} ]
        ```
        Règles : `type` ∈ {word, phrase} ; items dédupliqués par `kr` contre tout l'existant
        (un doublon est ignoré sans erreur) ; id généré = `pack-` + sha1(kr)[:8] ;
        **ne retire JAMAIS un item d'un pack déjà poussé**.
- [ ] 5. Lance le build : `python tools/build_data.py`. Il imprime `meta` (compteurs), le nombre
      d'items venus des packs, la couverture des confusions. Vérifie que le total a augmenté du
      nombre attendu, ni plus ni moins. **S'il ABANDONNE avec « ids disparaîtraient »** : tu as
      retiré du contenu quelque part (pack, ligne KIT) — remets-le, ne contourne JAMAIS le garde-fou.
- [ ] 6. (Double-vérification optionnelle mais recommandée avant commit) :
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
      print("ids nouveaux :", len(n - o))
      EOF
      ```
      Le résultat DOIT être `ids disparus : AUCUN (OK)`.
- [ ] 7. Génère l'audio des nouveaux items → recette **R3** (le script cible TOUT le deck et
      saute l'existant).
- [ ] 8. `node --test tests/` → tout vert.
- [ ] 9. Test local : une phrase kit apparaît dans l'onglet Voyage ; un mot stage 0 apparaîtra
      dans les nouvelles cartes du jour ; le dictionnaire (onglet Voyage, recherche) trouve les
      nouveaux items.
- [ ] 10. Release → recette **R7** (committer AUSSI le pack `tools/packs/*.json`).

### R2 — Ajouter ou modifier du trivia (`docs/extra.js`)

**Cas A — lot produit par un workflow IA** (format
`{"result":{"batches":[{"entries":[{"id","ex","exFr","note","conj"}]}]}}`) :

- [ ] 1. `python tools/merge_extra.py chemin/vers/lot.json`
- [ ] 2. Lis les STATS imprimées : `bad_id` doit être 0 (sinon le lot référence des ids
      inexistants — corrige le lot, pas le seed) ; `long_ex` = exemples > 70 caractères rejetés.
- [ ] 3. Le script s'auto-valide (assert). S'il plante : `git checkout -- docs/extra.js`, recommence.
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
      out = "// Contenu d'aide généré + enrichi (merge_extra/merge_pack) — ne pas éditer à la main\nwindow.EXTRA = "
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
- [ ] 3. Test local : réponds à une carte qui a du trivia — l'encart (exemple + 활용 + 💡) doit
      s'afficher après la réponse, correctement encodé, avec le bouton « Continuer → ».
- [ ] 4. Release → **R7**.

### R3 — Étendre l'audio natif

**Principe.** `tools/make_audio.py` génère les MP3 (voix `ko-KR-SunHiNeural`, rate −15 %, via
edge-tts — réseau requis), puis régénère `docs/audio/index.js` (les DEUX manifestes `AUDIO` +
`AUDIO_EX`). Deux familles : **mots** `<id>.mp3` (tout le deck) et **phrases d'exemple**
`<id>-ex.mp3` (chaque `EXTRA[id].ex`). Il est **relançable** : il saute les MP3 déjà présents et
valides (> 1 Ko). Après un ajout de contenu (R1/R11), il ne génère donc QUE les nouveaux.
Options : `--words` (mots seuls), `--ex` (phrases seules), rien = les deux.

- [ ] 1. Une seule fois par machine : `pip install edge-tts`.
- [ ] 2. `export PYTHONIOENCODING=utf-8` puis `python tools/make_audio.py` (ou `--ex` après une
      vague de gloses/trivia qui n'a ajouté que des phrases).
- [ ] 3. Lis la sortie : `MP3 mots : X valides` / `MP3 phrase: Y valides` et `OK — tous les audios demandes sont presents.`
      En cas d'échecs réseau, le script fait 3 tentatives ; s'il sort en erreur avec des
      MANQUANTS, relance-le simplement (il reprend où il en était).
- [ ] 4. Contrôle la taille totale imprimée : ~13 Ko par item, ~28 Mo pour ~2154 items. Si la
      taille totale saute anormalement (> +20 % pour quelques items), demande avant de pousser.
- [ ] 5. Test local : onglet Voyage, tape 🔊 sur une NOUVELLE phrase — voix neurale féminine,
      pas le TTS du PC/téléphone.
- [ ] 6. `git status` : les nouveaux `.mp3` et `docs/audio/index.js` sont là, rien d'autre.
- [ ] 7. Release → **R7**. Les MP3 ne sont pas dans `ASSETS` du service worker — c'est normal :
      ils se mettent en cache à la première lecture, et l'utilisateur peut TOUT télécharger via
      le bouton « Mode avion » (cache `sori-audio-store`, jamais purgé par le SW).

### R4 — Changer un réglage par défaut

**Principe.** Les défauts vivent dans `DEF_SET` (docs/engine.js) et sont verrouillés par le
test « DEF_SET et STEP : valeurs contractuelles » (fin de tests/engine.test.mjs). Voir P10.

- [ ] 1. **Ajouter une NOUVELLE clé** (ex. `krScale: 1.0`) : ajoute-la dans `DEF_SET`
      (engine.js) **ET** dans le `assert.deepEqual` du test contractuel. MÊME commit.
      La migration douce la fera apparaître chez l'utilisateur avec sa valeur par défaut.
- [ ] 2. **Changer la valeur d'une clé existante** : même manœuvre (les deux fichiers), MAIS
      ça ne changera RIEN pour l'utilisateur actuel — ses réglages persistés priment.
      N'écris JAMAIS de code qui force une valeur par-dessus `ST.set`.
- [ ] 3. **Interdits** : renommer une clé, en supprimer une, changer son unité ou son sens.
- [ ] 4. Si le réglage a une UI : ajoute le contrôle dans `renderStats()` (app.js) sur le modèle
      des existants — `<label>` + handler `onchange` qui fait `ST.set.maClé = …; save();`.
- [ ] 5. `node --test tests/` → vert. Test local (Réglages fonctionne, la valeur persiste après
      rechargement). Release → **R7**.

### R5 — Ajouter un exercice

- [ ] 1. Écris la fonction `exoMonExo(it)` dans app.js, à côté des autres. Modèle obligatoire :
      construire une `card` avec `el(...)`, échapper TOUT texte avec `esc(...)`, jouer l'audio
      avec `speak(it.kr, it.id)` (jamais l'API TTS en direct), poser `EXO_T0` si tu veux le
      temps de réponse, et **terminer chaque chemin par exactement un appel**
      `afterAnswer(it, ok, showTrivia(card, it), "monkind")` — c'est lui qui journalise
      (planification, XP, télémétrie `k.monkind`), re-pioche les ratés et avance la file.
      Aucun `setTimeout(render)` à toi.
- [ ] 2. Choisis un `kind` NOUVEAU et stable (il devient une clé du journal `k` — additif,
      jamais renommé ensuite ; les quêtes peuvent s'y référer via `MEASURES` de quests.js).
- [ ] 3. Branche-le dans le dispatch de `renderReview()` (bloc `if(it.stage<=2) … else …`)
      avec une condition claire sur `it.stage` / `it.type`.
- [ ] 4. **Règle de design gravée** : chaque exercice doit avoir une variante muette — jamais
      impossible de répondre avec `ST.set.mute` actif.
- [ ] 5. Le CSS va dans style.css en réutilisant les variables `:root` — puis vérifie le rendu
      dans les 4 thèmes (Réglages → Style graphique).
- [ ] 6. Logique pure non triviale (tokenisation, comparaison…) → engine.js + un test, pas app.js.
- [ ] 7. `node --test tests/` → vert. Test local : provoque l'exercice (au besoin en forçant
      TEMPORAIREMENT la condition de dispatch), réponse bonne ET mauvaise. Release → **R7**.

### R6 — Modifier la planification (DANGER : procédure tests d'abord)

**La modification la plus risquée du projet.** Deux niveaux :

**NIVEAU 0 — `computeAnswerLegacy` : INTERDIT.** Cette fonction est gelée à vie (référence
phase 1, shadow, tests d'équivalence — ALGORITHM.md §2.3). La « modifier » = migration d'état
déguisée. Si on te le demande, la réponse est : on ajuste le chemin ADAPTATIF ou
`TARGET_RETENTION` (R16), jamais le legacy.

**NIVEAU 1 — le chemin adaptatif de `computeAnswer` / les constantes EASE** :

- [ ] 1. Écris D'ABORD le comportement cible dans `tests/adaptive.test.mjs` (et
      `tests/engine.test.mjs` si une constante contractuelle bouge).
- [ ] 2. `node --test tests/` → SEULS les tests que tu as modifiés échouent. Si un autre test
      tombe — en particulier « phase 1 (adaptive=false) : planification bit-à-bit legacy » —
      tu as mal évalué l'impact : STOP, `git checkout -- tests/`.
- [ ] 3. Modifie `docs/engine.js`. RIEN d'autre. Pas de changement de la forme du retour
      `{s,i,d,e,counted,early,iLegacy,iAdaptive}`.
      Rappel : `EASE_LOSS` est DÉRIVÉ de `TARGET_RETENTION` — ne l'édite jamais directement.
- [ ] 4. `node --test tests/` → 100 % vert (37 tests).
- [ ] 5. Contrôle de bon sens — simule la vie d'un item sans jamais échouer :
      ```bash
      node -e "
      const E = require('./docs/engine.js');
      let it = {stage:0, itv:0, due:null, ok:0, ko:0}, t = '2026-07-03';
      for (let k = 0; k < 12; k++) {
        const r = E.computeAnswer(it, true, t, true);
        console.log('stage', r.s, ' itv', r.i, ' due', r.d, ' e', r.e);
        it = {stage: r.s, itv: r.i, due: r.d, ok: k+1, ko: 0, e: r.e}; t = r.d;
      }"
      ```
      Intervalles croissants, plafonnés à 120, `e` dans [1.3, 3.0], aucun NaN.
- [ ] 6. Vérifie que la SÉMANTIQUE n'a pas bougé : `s` entier 0-5, `i` jours, `d` date ISO,
      `e` float 2 décimales. Sinon c'est une migration d'état — **abandonne**.
- [ ] 7. Mesure l'effet sur la charge (les `due` existants ne changent pas, les prochains
      intervalles oui) et décris l'effet attendu dans le message de commit.
- [ ] 8. Release → **R7**.

### R7 — Déployer (release)

- [ ] 1. `node --test tests/` → tout vert (37 tests minimum : 20 + 17). Rouge = STOP.
- [ ] 2. Syntaxe (ce que la CI fera) : `for f in docs/*.js docs/audio/index.js; do node --check "$f" || break; done` — aucune erreur.
- [ ] 3. Bump le cache : dans `docs/sw.js`, incrémente `const CACHE` de 1 (ex. `"sori-v18"` → `"sori-v19"`).
      Fichier JS/CSS AJOUTÉ dans `docs/` (hors `.mp3` et `design/`) : ajoute-le aussi à `ASSETS`.
      Ne touche NI à la stratégie network-first NI à l'exclusion `"sori-audio-store"`.
- [ ] 4. Test local complet :
      ```bash
      python -m http.server 8123 --directory docs
      ```
      Ouvre http://localhost:8123 (si le contenu semble périmé : piège P9) et déroule :
      - **Réviser** : une carte (bonne + mauvaise réponse), l'encart trivia + « Continuer → » ;
      - **Écoute** : la carte « Écoute passive » s'affiche, une série d'écoute active tourne ;
      - **Voyage** : recherche dans « Mon dictionnaire », un scénario se lance, 🔊 sur une
        phrase du kit (voix neurale) ;
      - **Stats** : quêtes + badges affichés, carte « Bilan de niveau » présente, événement
        actif visible (s'il y en a un aujourd'hui), Réglages OK, un Export part.
      Aucune erreur dans la console (F12).
- [ ] 5. Contrôle du staging : `git status`, relu ligne par ligne. INTERDITS : `*.anki2`,
      `sori-export-*.json`, fichiers hors sujet. Puis `git add <fichiers précis>` (jamais
      `git add -A` sans avoir lu le status), `git commit -m "..."` (quoi + pourquoi + effet
      utilisateur).
- [ ] 6. Push : `git push origin main`. Si ça bloque (session non interactive), méthode token :
      ```bash
      TOKEN=$(printf 'protocol=https\nhost=github.com\n' | git credential fill | sed -n 's/^password=//p')
      B64=$(printf 'x-access-token:%s' "$TOKEN" | base64 -w0)
      git -c http.extraHeader="Authorization: Basic $B64" push origin main
      ```
      Ne jamais afficher le token, ne jamais l'écrire dans un fichier.
- [ ] 7. Vérification post-déploiement → recette **R8**.

### R8 — Vérifier après déploiement

- [ ] 1. CI : la GitHub Action « CI » du push doit être verte — elle fait `node --test` PUIS
      `node --check` sur tous les JS (https://github.com/mnafati-cloud/sori/actions).
      Rouge = recette **R9** immédiatement.
- [ ] 2. Attends 1 à 2 minutes (build GitHub Pages), puis :
      ```bash
      curl -s https://mnafati-cloud.github.io/sori/sw.js | grep CACHE
      ```
      Tu dois voir la NOUVELLE version. Si l'ancienne s'affiche : attends une minute et
      réessaie — ne relance pas de push.
- [ ] 3. Si data.js / extra.js touchés :
      `curl -s https://mnafati-cloud.github.io/sori/data.js | head -c 300`
- [ ] 4. Sur le téléphone : ouvrir simplement l'app (SW network-first = mise à jour auto).
      Fermer/rouvrir une fois si besoin. **Ne JAMAIS « Effacer les données du site »** (P1).
- [ ] 5. Contrôle fonctionnel : une carte de Réviser + le compteur du jour. C'est suffisant.

### R9 — Restaurer si tout casse

**Rappel : le repo est SANS ÉTAT.** La progression est dans le téléphone (+ copies : OneDrive,
cloud sori-data) et n'est pas affectée par un déploiement cassé. Un revert git suffit TOUJOURS.

- [ ] 1. Identifie le commit fautif : `git log --oneline -10`.
- [ ] 2. `git revert <sha_fautif> --no-edit` (PAS de reset --hard sur du poussé, PAS de force
      push). Plusieurs commits fautifs : un revert par commit, du plus récent au plus ancien.
- [ ] 3. Le revert a probablement remis l'ANCIEN `CACHE` dans sw.js : donne-lui une version
      ENCORE JAMAIS UTILISÉE (si v18 était cassée et le revert remet v17 : mets v19).
      `git add docs/sw.js && git commit --amend --no-edit`.
- [ ] 4. `node --test tests/` → vert, puis push (méthode de R7 étape 6).
- [ ] 5. Vérifie la prod (R8, étapes 2 et 4).
- [ ] 6. Progression du téléphone perdue/corrompue (cas extrême) : restauration par
      Stats → 📥 Importer, depuis (au choix) le dernier export OneDrive de l'utilisateur, ou
      `exports/latest.json` du repo privé sori-data (récupération : R15 — télécharger, puis
      transférer le fichier au téléphone).

### R10 — Gérer les événements (countdown, bannière, défi)

**→ Recette complète dans `MAINTENANCE-EVENTS.md`** (le fichier dédié, à la racine). Résumé :
- UN SEUL fichier à éditer : `docs/events-data.js` (données pures). Le moteur `events.js` et
  app.js ne bougent pas.
- 3 types : `countdown` (cible = `to`, jalons), `message`, `challenge` (goal : exactement une
  clé parmi reviews/ok/listen/days, lue dans `ST.log` sur `[from, to)`).
- Visibilité : `from <= aujourd'hui < to` (`to` EXCLU).
- **id unique et jamais réutilisé** (clé de `ST.evDismiss` — P11).
- Validation : page de test `docs/design/events-test.html` (« TOUT VERT »), puis release R7.

### R11 — Ajouter une VAGUE DE CONTENU (workflow → pack → audio → release)

**Principe.** Une vague = un lot d'items vérifiés (produits par un workflow IA + relecture
native) intégrés en une passe : pack durable + seed régénéré + trivia fusionné + MP3. Le tout
orchestré par `tools/merge_pack.py`. Les packs sont DURABLES : fusionnés à chaque régénération
future du seed, ids stables `pack-<sha1(kr)[:8]>`.

- [ ] 1. Entrée attendue : un fichier JSON de workflow au format
      `{"result":{"lots":[{"items":[{"fr","kr","type","theme","ex"?,"exFr"?,"conj"?,"note"?}]}]}}`.
      Contraintes qualité : `type` ∈ {word, phrase} ; `theme` au format `niveau::sujet` ;
      `ex` ≤ 70 caractères (sinon ignoré) ; `note` ≤ 110 (sinon ignorée).
- [ ] 2. `export PYTHONIOENCODING=utf-8`, et mets à jour `TODAY` dans `tools/build_data.py`.
- [ ] 3. Lance l'intégration (choisis un nom de pack daté, ex. `pack-2026-08-vague3`) :
      ```bash
      python tools/merge_pack.py chemin/vers/workflow_output.json pack-2026-08-vague3
      ```
      Le script : (1) écrit `tools/packs/pack-2026-08-vague3.json` (dédupliqué par `kr` contre
      tout l'existant — les doublons sont listés « ignores », c'est NORMAL) ; (2) relance
      `build_data.py` (garde-fou d'ids inclus — abandon si un id disparaîtrait) ; (3) vérifie
      que chaque item du pack est présent après regen ; (4) fusionne le trivia des NOUVEAUX
      items dans `docs/extra.js` (jamais d'écrasement d'entrées existantes).
- [ ] 4. Lis la sortie : `pack: N items ecrits`, les compteurs `meta`, `trivia: +N entrees`,
      `items total: N`. Le total doit augmenter exactement du nombre d'items écrits au pack.
      Si « ABANDON » : rien n'a été poussé, lis le message, corrige le lot — jamais le garde-fou.
- [ ] 5. Audio des nouveaux items : `python tools/make_audio.py` → recette **R3** étapes 3-6
      (il ne génère que les manquants ; vérifie `OK — tous les audios sont presents.`).
- [ ] 6. Validation extra.js : le check de **R2.2** (`ids inconnus : aucun`).
- [ ] 7. `node --test tests/` → vert ; `node --check` sur data.js/extra.js/audio/index.js.
- [ ] 8. Test local : recherche un des nouveaux mots dans « Mon dictionnaire » (onglet Voyage),
      écoute son MP3, vérifie son trivia.
- [ ] 9. Release → **R7**. À committer : `tools/packs/<pack>.json`, `docs/data.js`,
      `docs/extra.js`, les nouveaux `docs/audio/*.mp3`, `docs/audio/index.js`, `docs/sw.js`
      (bump). RIEN d'autre.

### R12 — Ajouter une quête du jour ou un badge (`docs/quests.js`)

**Principe.** Les 3 quêtes du jour sont choisies DÉTERMINISTIQUEMENT (hash de la date) dans
`POOL` : 1 par palier {facile, moyen, ambitieux} — rien n'est stocké côté sélection. Les badges
sont CALCULÉS à chaque rendu, jamais stockés. La seule persistance : `ST.qdone`
(réclamées aujourd'hui) et l'XP créditée — via `onClaim`, côté app.js.

- [ ] 1. **IDS ÉTERNELS (P11)** : choisis un id NEUF, jamais vu dans l'historique git de
      quests.js. Vérifie : `git log -p --all -- docs/quests.js | grep '"mon-id"'` → rien.
      Un id de quête réclamée aujourd'hui vit dans `ST.qdone.ids` ; un id recyclé hériterait
      d'un état étranger.
- [ ] 2. **Nouvelle quête** : ajoute un objet `{id, emoji, label, measure, target}` dans UN des
      trois tableaux de `POOL`. `measure` doit exister dans `MEASURES` (mesures actuelles :
      `n`, `listen`, `xp`, `build_ok`, `qcm2_ok`, `rec5_ok`, `dictee_ok`, `scenario`).
      Mesure inexistante ⇒ progression toujours 0 (pas de crash, mais quête morte).
      Nouvelle mesure = une fonction PURE qui lit UNIQUEMENT `ST.log[today]` (champ absent ⇒ 0).
      Le bonus XP est fixé par PALIER (`TIER_BONUS` : 30/50/80) — pas par quête.
      Note : modifier la composition d'un tableau de POOL change quelles quêtes tombent quel
      jour (hash % longueur) — sans conséquence (aucune sélection n'est stockée).
- [ ] 3. **Nouveau badge** : ajoute une ligne `B("mon-id", "🏵️", "Label court", "Condition
      lisible", <condition bool>, "détail")` dans `badges()`. La condition se calcule depuis
      `state` (fourni par app.js). S'il te faut une donnée nouvelle : ajoute-la ADDITIVEMENT à
      `itemsSummary` (ou `state`) dans le bloc `SORI_QUESTS.renderCard` de `renderStats()`
      d'app.js. Un badge ne se retire jamais ; il peut redevenir « non acquis » si la condition
      n'est plus remplie (c'est accepté : rien n'est stocké).
- [ ] 4. La quête/le badge doit être un **PLANCHER, jamais un plafond** : rien ne se bloque,
      la progression continue de s'afficher au-delà de 100 % (« 37/20 ✨ »).
- [ ] 5. Mets à jour la page de test `docs/design/quests-test.html` (un check pour le nouvel
      élément) dans le même commit.
- [ ] 6. `node --check docs/quests.js` ; `node --test tests/` (la partie pure de quests.js est
      chargeable sous Node si tu veux ajouter des tests).
- [ ] 7. Test local : Stats → la quête/le badge s'affiche ; fin de session → le mode compact
      montre les 3 quêtes ; réclame une quête finie → +XP, bouton disparaît, pas de double
      réclamation après re-rendu.
- [ ] 8. Release → **R7**.

### R13 — Ajouter un scénario de simulation (`docs/scenarios-data.js`)

**Principe.** Un scénario = un dialogue à choix, données pures dans `window.SCENARIOS`,
joué par `scenarios.js`. Structure :

```js
{ id: "pharmacie",            // ÉTERNEL (clé du record ST.scen) — jamais réutilisé
  emoji: "💊", title: "À la pharmacie",
  intro: "Contexte en français…",
  steps: [
    { npc: "어디가 아프세요?", npcFr: "Où avez-vous mal ?",
      tip: "Optionnel : note culturelle affichée après la bonne réponse.",
      choices: [
        { kr: "머리가 아파요.", fr: "J'ai mal à la tête.", ok: true,  why: "Pourquoi c'est juste." },
        { kr: "머리를 사요.",   fr: "J'achète une tête.",   ok: false, why: "Pourquoi c'est un piège." }
      ] }
  ] }
```

- [ ] 1. **Contenu vérifié d'abord** : le coréen des répliques doit être validé (relecture
      native ou source fiable) AVANT intégration — c'est la règle historique de ce fichier.
- [ ] 2. **Chaque step a EXACTEMENT UN choix `ok:true`** et chaque choix (bon ou piège) a un
      `why` instructif. 2 à 4 choix par step.
- [ ] 3. `id` neuf et éternel (P11 ; `git log -p --all -- docs/scenarios-data.js | grep '"mon-id"'`
      → rien). **N'agrandis pas les `steps` d'un scénario existant déjà poussé** : le record
      `ST.scen[id]` et le badge « Scénarios parfaits » comparent au nombre de répliques —
      préfère un NOUVEAU scénario.
- [ ] 4. Le fichier est une seule longue ligne JSON après `window.SCENARIOS = ` : édite-le par
      Python (même technique que R2 Cas B, en gardant le commentaire d'en-tête), ou très
      soigneusement — puis :
      `node --check docs/scenarios-data.js` ET
      `node -e "const w={};new Function('window',require('fs').readFileSync('docs/scenarios-data.js','utf8'))(w);const s=w.SCENARIOS;console.log(s.length,'scénarios');s.forEach(sc=>sc.steps.forEach((st,i)=>{const n=st.choices.filter(c=>c.ok).length;if(n!==1)throw sc.id+' step '+i+' : '+n+' bonnes réponses';}));console.log('1 seul ok par step : OK')"`
- [ ] 5. Test local : onglet Voyage → la simulation apparaît avec son compteur de répliques →
      joue-la EN ENTIER (bonne et mauvaise réponse au moins une fois) → l'écran de fin affiche
      le score, « Rejouer » et « Retour » fonctionnent, le record s'enregistre (revisite la liste).
- [ ] 6. L'audio des répliques passe par le TTS (`ttsSpeak`), pas par des MP3 : rien à générer.
- [ ] 7. Release → **R7**.

### R14 — Ajouter un thème graphique (`docs/themes.css` + `docs/themes.js`)

**Principe.** Un thème = une classe `.theme-<id>` posée sur `<html>` qui surcharge les
variables `:root` de style.css (`--bg --panel --panel2 --line --txt --dim --acc --acc2 --ok
--ko --warn --r` + `--glow --grad`), plus une entrée dans le tableau `THEMES` de themes.js.
Stockage : clé localStorage `sori-theme` (SÉPARÉE de la progression). Sans JS/classe, l'app
garde le `:root` de style.css — jamais de page cassée.

- [ ] 1. Dans `themes.css` : copie un bloc thème existant (le plus proche visuellement) et
      renomme en `.theme-monid`. Surcharge les variables, puis les couleurs codées en dur
      listées en tête de fichier (`.opts button.good/.bad/:active`, `.btn.ok/.ko`, texte des
      `.chip`) — à spécificité minimale, comme les blocs existants.
- [ ] 2. Dans `themes.js` : ajoute `{id:"monid", label:"Mon thème", cls:"theme-monid",
      color:"#rrggbb"}` au tableau `THEMES` (`color` = couleur de la barre système,
      `<meta name="theme-color">`). MÊME commit que le CSS.
- [ ] 3. **Ne retire et ne renomme JAMAIS un thème existant** : la valeur stockée retomberait
      silencieusement sur le défaut (pas de crash, mais préférence utilisateur perdue).
      Le défaut reste `seoul` sauf décision explicite de l'utilisateur.
- [ ] 4. Contraste : texte normal ≥ 4.5:1 sur `--bg` et `--panel` (vérifie au moins --txt/--dim
      et les boutons good/bad). `color-scheme` correct (dark/light).
- [ ] 5. Test : `docs/design/theme-test.html` (page de comparaison), puis l'app → Réglages →
      Style graphique → sélectionne le nouveau thème → parcours les 4 onglets + une carte
      répondue (options good/bad lisibles) + les cartes des modules (quêtes, bilan, recherche).
      Recharge la page : le thème persiste, zéro flash au chargement.
- [ ] 6. `node --check docs/themes.js`. themes.css/themes.js sont déjà dans `ASSETS` du SW —
      rien à y ajouter, mais bump `CACHE` comme toujours. Release → **R7**.

### R15 — Lire et analyser les sauvegardes cloud (repo privé sori-data)

**Principe.** L'app pousse chaque jour un export JSON complet (§3.5) dans le repo GitHub
**privé** `mnafati-cloud/sori-data` : `exports/latest.json` (toujours le plus récent) et
`exports/sori-export-AAAA-MM-JJ.json` (un par jour de session). C'est LA source pour analyser
la progression sans rien demander au téléphone (items à fort `ko`, distribution des ease,
rétention, critères de la phase 2 — R16).

- [ ] 1. Récupère un token GitHub côté PC (Git Credential Manager, comme pour le push) et
      télécharge **HORS du repo** (jamais dans `dev/sori` — même gitignoré, on ne joue pas) :
      ```bash
      cd /c/Users/33785/dev/sori
      TOKEN=$(printf 'protocol=https\nhost=github.com\n' | git credential fill | sed -n 's/^password=//p')
      B64=$(printf 'x-access-token:%s' "$TOKEN" | base64 -w0)
      curl -s -H "Authorization: Basic $B64" -H "Accept: application/vnd.github.raw" \
        "https://api.github.com/repos/mnafati-cloud/sori-data/contents/exports/latest.json" \
        -o "$TEMP/sori-latest.json"
      python -c "import json,io,os; d=json.load(io.open(os.environ['TEMP']+'/sori-latest.json',encoding='utf-8')); print(d['exportedAt'], len(d['state']['items']), 'items touches')"
      ```
      Ne JAMAIS afficher `$TOKEN`. Si la réponse est du JSON avec un champ `content` (pas le
      brut) : c'est l'API sans l'en-tête raw — décode `content` en base64.
- [ ] 2. Un export daté précis : remplace `latest.json` par `sori-export-AAAA-MM-JJ.json`.
      Lister ce qui existe :
      `curl -s -H "Authorization: Basic $B64" "https://api.github.com/repos/mnafati-cloud/sori-data/contents/exports" | python -c "import json,sys;[print(x['name']) for x in json.load(sys.stdin)]"`
- [ ] 3. Analyses types (sur `d['state']`) : items à retravailler = tri par `ko` décroissant de
      `state.items` ; rétention propre = Σ`ok1`/(Σ`ok1`+Σ`ko1`) du `log` sur la fenêtre voulue ;
      shadow phase 1 = Σ`sn`/Σ`so` ; distribution des `e` ; jours actifs, XP, etc. (§3.4 donne
      tous les champs).
- [ ] 4. **Hygiène données personnelles** : le fichier reste dans `$TEMP`, il est SUPPRIMÉ après
      analyse (`rm "$TEMP/sori-latest.json"`), il ne se colle jamais en entier dans un commit,
      un ticket ou un fichier du repo. Les conclusions (agrégats, listes de mots) oui ; l'état
      brut, non.
- [ ] 5. Si l'API répond 404/403 : le token PC n'a pas accès au repo privé — demande à
      l'utilisateur (ne crée PAS de nouveau token toi-même, ne touche pas à celui du téléphone).

### R16 — Phase 2 de l'algorithme adaptatif (bascule, vérification, rollback)

**Contexte.** Depuis la v9, l'app est en **phase 1 « ombre »** (ALGORITHM.md §7) :
`ST.set.adaptive=false` (défaut), la planification est BIT-À-BIT le legacy (verrouillé par
test), mais chaque réponse accumule `e` (ease par mot), `ok1/ko1` (rétention propre) et
`so/sn` (intervalles legacy vs adaptatif — le « shadow »). La phase 2 est une BASCULE
UTILISATEUR, pas une release.

- [ ] 1. **Critères de passage** (à vérifier sur un export réel — R15) :
      - ≥ 300 révisions comptées (Σ `ok1`+`ko1` du journal) ;
      - distribution des `e` cohérente : les 79 ennemies majoritairement < 1.9, écart-type
        global > 0.2 (sinon l'adaptativité n'apporte rien), < 15 % au plancher hors leeches ;
      - projection de charge Σ`sn`/Σ`so` ∈ [0.85, 1.15] (l'adaptatif ne fait pas exploser la pile) ;
      - **consigner la baseline** (dans le message de commit ou une note) : rétention comptée
        7 j/30 j, revues/jour, taille de pile due.
- [ ] 2. **Bascule** : l'utilisateur coche « Planification adaptative » dans Réglages
      (→ `ST.set.adaptive=true`). AUCUN changement de code, aucun push, aucune due réécrite —
      le nouveau calcul s'applique au fil des réponses. `so/sn` continuent d'être journalisés
      (le shadow devient l'audit inverse).
- [ ] 3. **Vérification à ~30 jours** (export réel vs baseline) — cibles d'ALGORITHM.md §7 :
      rétention comptée 30 j dans [0.81, 0.85] ; rétention de la strate intervalle ≥ 7 j
      ≥ baseline ; charge ≤ 1.15× baseline ; taux d'échec des ennemies en baisse ≥ 5 points ;
      leeches (`isLeech`) ≤ 20 items (liste remise à l'utilisateur pour retravail mnémonique).
- [ ] 4. **Ajustement si hors cible** : UNIQUEMENT via `TARGET_RETENTION` (engine.js) —
      bornes [0.78, 0.88], pas de ±0.02 max par ajustement, au plus 1×/mois, hors-ligne,
      par commit git. Jamais `EASE_LOSS` à la main (dérivé). Règle : rétention < 0.80 et
      charge acceptée → monter à 0.85 ; charge intenable → descendre à 0.80 ; sinon ne rien
      toucher. ⚠️ Un changement de `TARGET_RETENTION` modifie des valeurs attendues dans
      `tests/adaptive.test.mjs` : mets-les à jour dans le MÊME commit (procédure R6 niveau 1).
- [ ] 5. **Rollback** : décocher le toggle (`adaptive=false`) restaure la planification legacy
      immédiatement — les `e` restent stockés, inertes. Si deux ajustements de
      `TARGET_RETENTION` ne suffisent pas : rollback + post-mortem sur l'export. Le système
      legacy reste intact en dessous, par construction.

### R17 — Ajouter (ou retirer) un module UI

**Principe.** Tout écran/exercice autonome est un MODULE CONTRACTUEL (§2.3). L'ajout suit
TOUJOURS le même pattern en 6 points — c'est ainsi que `numbers.js` (v21) a été ajouté sans
toucher au moteur ni à l'état. **Un module ne lit/écrit JAMAIS localStorage** : l'état entre
par `opts`, sort par des callbacks branchés dans app.js.

- [ ] 1. **Le fichier** `docs/monmodule.js` : IIFE double environnement (§2.3), partie
      `pure` testable sans DOM + `renderXxx(container, opts)`. CSS auto-injecté une fois
      (`<style id="monmodule-styles">`), classes préfixées `.mon-*`, variables `:root`
      uniquement (compatible 4 thèmes). Tout texte par `esc(...)`. Données absentes ⇒ neutre.
- [ ] 2. **Le `<script>` dans `docs/index.html`** : ajoute `<script src="./monmodule.js"></script>`
      APRÈS ses données éventuelles (`*-data.js`) et **AVANT `app.js`** (§2.2). Ne réordonne rien
      d'autre.
- [ ] 3. **L'intégration dans `app.js`** UNIQUEMENT, gardée par `if(window.SORI_MONMODULE){...}`,
      dans le `render*()` de l'onglet concerné. L'état sort/rentre par callbacks : `speak` →
      `ttsSpeak` (texte brut, pas de MP3) ou `speak(kr,id)` (item du deck) ; journalisation →
      `logAnswer(ok, "monkind")` (un kind NEUF, additif) ; records → `ST.<champ>` via un setter.
      L'app doit rester fonctionnelle si le module ou ses données manquent.
- [ ] 4. **`ASSETS` dans `docs/sw.js`** : ajoute `"./monmodule.js"` à la liste (sinon pas de
      hors-ligne pour ce fichier).
- [ ] 5. **Bump `CACHE`** (`sori-vNN` → `sori-vNN+1`) — comme toute release qui touche `docs/`.
- [ ] 6. **Doc** : une ligne dans la table §2.4 (API, où c'est appelé, droits/interdits), et si
      le module introduit un champ d'état ou un kind de journal, documente-le en §3.4.
      Optionnel mais encouragé : une page de test `docs/design/monmodule-test.html`.
- [ ] 7. **Retirer un module** = l'inverse : retirer le `<script>`, le bloc `if(...)` d'app.js,
      la ligne `ASSETS`, bumper `CACHE`. NE SUPPRIME PAS le fichier ni ses ids/kinds de la doc
      d'un coup — un kind de journal déjà écrit reste dans l'historique des utilisateurs
      (additif à vie) ; garde-le documenté comme « retiré », ne le recycle jamais.
- [ ] 8. `node --check docs/monmodule.js` ; `node --test tests/` (37 vert) ; test local
      (l'écran s'affiche, une réponse bonne ET une mauvaise). Release → **R7**.

### R18 — Sauvegarde & restauration cloud (le canal principal de progression)

**Principe.** Depuis la v11 (backup) et la v26 (restore), le repo **privé**
`mnafati-cloud/sori-data` est le canal de progression à DOUBLE SENS. L'utilisateur n'a plus à
manipuler de fichier : le cloud sauvegarde ET restaure tout seul. L'export/import fichier est un
SECOURS hors-ligne (replié dans un `<details>` de Stats).

- [ ] 1. **Sauvegarde (côté app)** : `cloudBackup()` pousse le payload complet (§3.5) via l'API
      GitHub dans `exports/latest.json` (écrasé) + `exports/sori-export-AAAA-MM-JJ.json` (daté).
      Déclenchée par le bouton ☁️ de Stats ET automatiquement en fin de session **1×/jour**
      (`ST.lastCloud !== aujourd'hui`). Jeton `sori-gh-token`, local au téléphone, jamais exporté.
- [ ] 2. **Restauration (côté app)** : bouton **↓ Restaurer** de Stats → `cloudRestore()` :
      télécharge `exports/latest.json`, vérifie `app === "sori"` + `state` présent, affiche la
      date, demande confirmation, puis `applyImportedState(data.state)` — MÊME migration douce
      que le chargement (`Object.assign({}, DEF_SET, s.set)`, conteneurs par défaut) : une
      sauvegarde ancienne reste valide à vie. Un vieil état sans `reports`/`profile`/`report`
      s'aligne tout seul.
- [ ] 3. **Secours fichier (hors-ligne)** : Export 📤 (partage `sori-export-AAAA-MM-JJ.json` vers
      OneDrive) et Import 📥 (relit un fichier, même `applyImportedState`). À utiliser quand le
      cloud est indisponible (pas de réseau, pas de jeton).
- [ ] 4. **Comment MOI (Claude) je lis les données** — à chaque analyse de progression :
      1. Récupère un token PC (Git Credential Manager, cf. R15) — **jamais** celui du téléphone.
      2. `GET https://api.github.com/repos/mnafati-cloud/sori-data/contents/exports/latest.json`
         (en-tête `Accept: application/vnd.github.raw` pour le brut, sinon décode `content` en
         base64), fichier téléchargé **HORS du repo**, dans `$TEMP` — la mécanique exacte est en R15.
      3. **LIS `state.reports` EN PREMIER** (P12) : ce sont les feedbacks 🐞 écrits par
         l'utilisateur, avec le contexte de la carte. Ils dictent les priorités avant toute
         analyse d'agrégats. Ils ne sont JAMAIS auto-effacés → recoupe les dates (`d`) pour ne
         pas retraiter un feedback déjà traité.
      4. Ensuite seulement : agrégats (`items` triés par `ko`, rétention `ok1/ko1`, shadow
         `sn/so`, distribution `e` — R15/R16).
      5. Hygiène données personnelles (R15) : le fichier reste dans `$TEMP`, supprimé après
         analyse ; jamais collé en entier dans un commit ou un fichier du repo.

### R19 — Générer/fusionner les gloses mot-à-mot (`EXTRA[id].gl`)

**Principe.** Chaque phrase d'exemple (`EXTRA[id].ex`) peut porter un tableau `gl` de gloses FR,
**une par mot** (eojeol séparé par espaces). Il alimente la « traduction d'un mot au clic »
(réglage opt-in `wordgloss`). La contrainte vitale est l'ALIGNEMENT : `gl.length` DOIT égaler le
nombre de mots de `ex` — app.js zippe par index. Génération par le workflow multi-agent
`sori-gloses` (génération + relecture adversariale vs `exFr`), fusion par `tools/merge_gloss.py`.

- [ ] 1. **Préparer l'entrée** : un script écrit `[{i,id,head,ex,exFr,ntok}]` par phrase, puis le
      découpe en petits fichiers de lot `in_<b>.json` (les agents lisent par CHEMIN, pas via
      `args` — trop volumineux). `ntok = len(ex.split())` sert de garde-fou dans le prompt.
- [ ] 2. **Lancer le workflow `sori-gloses`** (30 lots × ~55 phrases) : stage `gen` écrit
      `gen_<b>.json = [{id,ex,gl}]` ; stage `verif` (pipeline) relit et corrige vers `ver_<b>.json`.
      Règle de glose : nom+particule = sens+rôle ; verbe/adjectif conjugué = sens + **forme du
      dictionnaire** entre parenthèses ; ≤ ~40 caractères.
- [ ] 3. **Fusionner** : `python tools/merge_gloss.py <dossier_gloss_out>`. Il préfère `ver_<b>`,
      retombe sur `gen_<b>`, et **n'ajoute `gl` QUE si `len(gl) == len(ex.split())`** (les
      désalignements sont comptés et ignorés, pas écrits). Garde-fou d'ids inclus (aucune clé
      hors seed). Lis la sortie : `gloses ajoutees`, `desalignements ignores`, `lots manquants`.
- [ ] 4. Si des lots manquent ou beaucoup de désalignements : relance juste ces lots du workflow
      (les fichiers `in_<b>.json` sont là), re-fusionne. `merge_gloss.py` est idempotent.
- [ ] 5. **Audio des phrases** si de nouvelles `ex` sont apparues : `python tools/make_audio.py --ex`.
- [ ] 6. `node --test tests/` (37 vert), test local (réglage 👆 activé → taper un mot affiche sa
      glose ; réglage 🔊 activé → le bouton lit la phrase). Bump `CACHE`. Release → **R7**.

---

## 6. Pièges connus (vécus)

### P1 — Le service worker qui sert du périmé
- **Symptôme** : tu pousses, mais le téléphone montre l'ancienne version pendant des jours.
- **Cause** : histoire d'avant la v4 — un SW cache-first sert le cache pour toujours. Depuis,
  `sw.js` est **network-first avec `fetch(…, {cache:"no-cache"})`** : chaque requête revalide
  (304 via ETag quasi gratuit), le cache ne sert QUE hors-ligne. Le SW n'intercepte pas le
  cross-origin (api.github.com — nécessaire au cloud backup).
- **Règles** : ne JAMAIS revenir à du cache-first. Toujours bump `CACHE` (purge des vieux
  caches à l'activation — SAUF `sori-audio-store`, exclusion à préserver). Si une mise à jour
  ne paraît pas : c'est presque toujours GitHub Pages qui n'a pas fini (2 min) — vérifie avec
  le `curl` de R8 avant d'accuser le téléphone.
- **Interdit absolu** : « Effacer les données du site » comme remède — ça supprime AUSSI le
  localStorage, donc toute la progression.

### P2 — Les voix TTS asynchrones sur Android
- **Symptôme** : coréen lu avec un accent français, ou aucune voix au premier chargement.
- **Cause** : `speechSynthesis.getVoices()` renvoie une liste VIDE au chargement sur Android ;
  les voix arrivent en asynchrone.
- **À préserver** : `pickVoice()` est appelé au boot, ré-appelé sur `onvoiceschanged`, ET en
  dernier recours dans `ttsSpeak()`. Ne « simplifie » jamais ça. Depuis la v14, TOUT le deck a
  son MP3 natif — le TTS ne reste critique que pour les scénarios et les textes hors deck.

### P3 — `curl -d` avec de l'UTF-8 → 400 sur l'API GitHub
- **Cause** : l'encodage de la ligne de commande Windows mutile l'UTF-8 inline.
- **Remède** : JSON dans un fichier UTF-8 **sans BOM**, puis `--data-binary "@corps.json"`.
  Jamais de JSON non-ASCII inline dans `-d`.

### P4 — PowerShell 5.1 écrit de l'UTF-16 par défaut
- **Symptôme** : un fichier de `docs/` régénéré via `Out-File`/`>` PowerShell rend l'app blanche.
- **Remède** : ne génère JAMAIS un fichier de `docs/` avec PowerShell. Les scripts Python
  écrivent UTF-8 sans BOM. Si PowerShell est inévitable : `-Encoding utf8` + vérifier.

### P5 — git et OneDrive ne cohabitent pas
- Le repo est dans `C:\Users\33785\dev\sori`, délibérément HORS OneDrive (verrous sur `.git/`,
  conflits silencieux). Ne le déplace jamais. Les exports de l'utilisateur vont sur OneDrive ;
  le code vit dans `dev/` et sur GitHub.

### P6 — Encodage console : `UnicodeEncodeError` dans les scripts Python
- **Remède** : avant tout script : `export PYTHONIOENCODING=utf-8` (Git Bash) ou
  `$env:PYTHONIOENCODING="utf-8"` (PowerShell). Les FICHIERS produits sont corrects dans tous
  les cas — seul l'affichage console casse.

### P7 — Pourquoi les ids kit/pack sont des hash (et doivent le rester)
- **Histoire** : les phrases du kit étaient numérotées `kit-001`… en sautant les doublons ; un
  changement de la liste décalait tous les numéros et orphelinait la progression (corrigé au
  commit `8130664`).
- **Depuis** : `id = "kit-"/"pack-" + sha1(texte_coréen)[:8]` — insensible à l'ordre et aux
  régénérations. **Ne change jamais** la fonction de hash, la casse, ni la troncature à 8.
- **Corollaire** : corriger le TEXTE coréen d'une phrase kit/pack change son id → c'est un
  NOUVEL item (l'ancien doit rester dans la liste/le pack). Pour une correction de texte,
  demande d'abord.

### P8 — Dates codées en dur dans `tools/`
- `build_data.py` : `TODAY` est une date FIXE (ligne ~16) — mets-la à jour avant chaque
  rebuild, sinon les échéances du seed sont ancrées dans le passé.
- `make_icons.py` : chemins corrigés vers `docs\` (l'ancien bug `app\` est réparé — ne le
  « restaure » pas).

### P9 — Cache navigateur en test local : l'index audio (ou data.js) qui SEMBLE périmé
- **Symptôme** : tu viens de régénérer `data.js` / `audio/index.js` / un module, tu recharges
  http://localhost:8123… et la page montre toujours l'ancien contenu (nouveau mot introuvable,
  MP3 « manquant » alors que le fichier existe).
- **Cause** : `python -m http.server` n'envoie aucun `Cache-Control` → le navigateur applique
  son cache heuristique ; et si un service worker s'est enregistré sur localhost lors d'un test
  précédent, il sert en plus SON cache.
- **Remède, dans l'ordre** : (1) DevTools ouverts → onglet Network → coche « Disable cache » →
  recharge ; (2) rechargement forcé Ctrl+Shift+R ; (3) fenêtre de navigation privée ;
  (4) dernier recours : change de port (`--directory docs 8124`) — un autre origin = zéro cache.
  Sur LOCALHOST uniquement, DevTools → Application → Service Workers → « Unregister » est
  acceptable. **Sur le téléphone, jamais** (P1).
- **Réflexe** : avant de « déboguer » un contenu régénéré qui n'apparaît pas, vérifie d'abord
  le fichier sur disque (`grep` l'id dedans) — si le disque est bon, c'est CE piège.

### P10 — `DEF_SET` est verrouillé par un test contractuel
- **Fait** : le test « DEF_SET et STEP : valeurs contractuelles » (fin de
  `tests/engine.test.mjs`) fait un `assert.deepEqual` sur l'objet ENTIER.
- **Conséquence** : TOUTE modification de `DEF_SET` (même un simple ajout de clé) fait échouer
  les tests — et donc la CI — tant que le test n'est pas mis à jour dans le **même commit**.
  Ce n'est pas une corvée, c'est le garde-fou : il force la relecture de la règle « additif
  seulement » (R4). Ne « répare » jamais en supprimant le test.

### P11 — Un id de quête, d'événement ou de scénario ne se réutilise JAMAIS
- **Fait** : le téléphone stocke des états indexés par ces ids : `ST.evDismiss[eventId]`
  (masquage, PERMANENT), `ST.qdone.ids[questId]` (réclamée aujourd'hui), `ST.scen[scenarioId]`
  (record, permanent). Les ids de badges sont aussi des identités affichées.
- **Conséquence** : un id recyclé HÉRITE de l'état de l'ancien — un nouvel événement qui reprend
  un id masqué n'apparaîtra JAMAIS chez l'utilisateur, sans erreur nulle part. C'est le bug le
  plus silencieux du projet.
- **Règle** : retirer un objet du fichier de données = OK ; réutiliser son id = JAMAIS.
  Avant de créer un id : `git log -p --all -- <fichier> | grep '"mon-id"'` → aucune occurrence.

### P12 — Les feedbacks 🐞 de l'utilisateur sont dans `state.reports` de la sauvegarde cloud
- **Fait** : quand l'utilisateur écrit un rapport 🐞 (bouton opt-in), il est stocké dans
  `ST.reports` (§3.4) et **embarqué dans chaque sauvegarde cloud** (`exports/latest.json` du
  repo privé sori-data). L'utilisateur ne les voit plus après envoi (seul un compteur dans
  Stats) : il COMPTE sur toi pour les lire. Ils ne sont JAMAIS auto-effacés (cap 100).
- **Conséquence** : si tu analyses la progression sans lire `state.reports`, tu passes à côté du
  seul canal où l'utilisateur te parle directement — avec le contexte exact (onglet, carte,
  dernière réponse) de chaque souci.
- **Règle** : à CHAQUE analyse d'un export cloud, **lis `state.reports` EN PREMIER** (R18 point
  4) et traite-les en priorité avant les agrégats. Recoupe les dates (`d`) pour ne pas
  retraiter un feedback déjà pris en compte à une analyse précédente.

### P13 — L'alignement mot↔glose de `EXTRA[id].gl` (désactivation silencieuse)
- **Fait** : la « traduction d'un mot au clic » (v27) zippe PAR INDEX les mots de `ex`
  (`ex.trim().split(/\s+/)`) avec le tableau `gl`. `showTrivia` n'active la fonctionnalité pour
  une entrée QUE si `gl.length === nombre de mots` — sinon la phrase s'affiche normale, sans
  spans cliquables, **sans aucune erreur**.
- **Conséquence** : régénérer une phrase `ex` (changer un mot, ajouter/retirer un espace, coller
  une ponctuation) sans régénérer `gl` casse l'alignement → la glose disparaît en silence pour
  cette carte. Un `gl` écrit à la main avec un décompte faux fait pareil.
- **Règle** : `gl` se régénère TOUJOURS par la recette R19 (le workflow tokenise comme le JS, et
  `merge_gloss.py` refuse d'écrire un `gl` désaligné). Le découpage Python `ex.split()` et le JS
  `ex.trim().split(/\s+/)` DOIVENT rester équivalents — ne change ni l'un ni l'autre isolément.
  Contrôle rapide : `sum(1 for v in EXTRA.values() if v.get('gl') and len(v['gl'])!=len(v['ex'].split()))` doit être 0.

---

## 7. Checklist de non-régression avant tout push

À dérouler INTÉGRALEMENT avant `git push`, quel que soit le changement :

- [ ] 1. `node --test tests/` : 100 % vert (37 tests minimum — 20 engine + 17 adaptive, 0 fail,
      0 cancelled).
- [ ] 2. `node --check` sur chaque JS de `docs/` modifié ou ajouté (la CI le fait sur TOUS —
      un fichier de données mal formé casse l'app entière au chargement).
- [ ] 3. La clé `sori-state-v1` et la sémantique de `s`/`i`/`d`/`e`/`ok`/`ko` sont inchangées
      (`git diff docs/app.js docs/engine.js` relu à cet œil). `computeAnswerLegacy` : intouché.
- [ ] 4. Si `data.js` a été régénéré : le build a fini SANS « ABANDON » (garde-fou d'ids
      intégré) ; en cas de doute, la double-vérification R1.6 est passée.
- [ ] 5. Si `extra.js` a changé : la validation JSON + ids de R2.2 est passée.
- [ ] 6. Si `DEF_SET` a changé : uniquement des AJOUTS de clés, et le test contractuel mis à
      jour dans le même commit (P10).
- [ ] 7. Si un id a été créé (item, événement, quête, badge, scénario) : il est NEUF (jamais
      dans l'historique git du fichier — P11). Aucun id existant modifié ou supprimé.
- [ ] 8. `CACHE` bumpé dans `docs/sw.js` (jamais deux releases avec la même version) ; tout
      nouveau fichier JS/CSS de `docs/` ajouté à `ASSETS` ; l'exclusion `sori-audio-store`
      toujours en place.
- [ ] 9. Test local fait (serveur 8123, piège P9 en tête) : une carte de Réviser (avec trivia +
      « Continuer → »), une série d'Écoute + la carte Écoute passive + l'entraîneur de nombres
      (une série 🔢), Voyage (recherche + un scénario + 🔊 kit), Stats (quêtes/badges, carte Bilan
      avec ses 3 profils, réglages, un export OU une sauvegarde cloud). Modules touchés
      smoke-testés via leur page `docs/design/*-test.html` quand elle existe.
      Console navigateur sans erreur.
- [ ] 10. `git status` relu ligne à ligne : AUCUN `*.anki2`, AUCUN `sori-export-*.json`, aucun
      fichier hors sujet. Les packs `tools/packs/*.json` nouveaux SONT à committer.
- [ ] 11. `docs/data.js`, `docs/extra.js` et `docs/audio/*` n'ont PAS été édités à la main
      (seulement via leurs scripts / recettes).
- [ ] 12. Le message de commit dit quoi, pourquoi, et l'effet visible pour l'utilisateur.

---

## 8. Glossaire

| Terme | Définition |
|---|---|
| **SRS** | Spaced Repetition System — répétition espacée : plus on réussit un item, plus il revient tard. |
| **Échelle de maîtrise / stage** | Position 0-5 d'un item : 0 nouveau · 1 QCM facile · 2 QCM piégeux · 3 production (QCM FR→KR ou word bank) · 4 rappel indicé · 5 rappel pur. Réussir monte d'un stage, échouer descend de deux (plancher 1). |
| **Seed** | Le contenu de base : `window.SEED` dans `docs/data.js` (~2154 items ; compte exact = `SEED.meta.counts`), généré depuis le snapshot Anki + table KIT + packs. Ne s'édite jamais à la main. |
| **Delta** | L'entrée `ST.items[id]` du localStorage : ce que l'utilisateur a fait de l'item (`s,i,d,e,ok,ko`). Prime toujours sur le seed (fonction `eff()`). |
| **Pack** | Fichier `tools/packs/*.json` de contenu durable (vagues de vocabulaire vérifiées). Fusionné à CHAQUE régénération du seed, ids stables `pack-<hash>`, dédupliqué par texte coréen. |
| **Snapshot Anki** | `tools/snapshot.anki2` — copie figée de l'ancienne collection Anki, source historique du seed. Fossile gitignoré, uniquement sur la machine de dev. |
| **Ennemie (leech historique)** | Item avec ≥ 4 échecs dans l'historique Anki (`enemy: true`, 79 items). Boss fight + priorité trivia. |
| **Leech (adaptatif)** | `isLeech()` : ease au plancher (1.3) ET `ko ≥ 8`. Dérivé, jamais stocké. Affiché dans Stats (« Sangsues »). |
| **Ease (`e`)** | Multiplicateur personnel par mot (1.3-3.0, défaut neutre 2.2), cœur de l'algorithme adaptatif (ALGORITHM.md). Accumulé depuis la v9 (phase ombre), utilisé par la planification seulement si `set.adaptive=true`. |
| **Phase 1 / phase 2** | Phase 1 « ombre » : planification legacy bit-à-bit, ease et métriques accumulées. Phase 2 : `adaptive=true`, planification à l'ease. Bascule et critères : R16. |
| **Shadow (`so`/`sn`)** | Sommes journalières des intervalles qu'auraient donnés legacy (`so`) et adaptatif (`sn`) sur les succès comptés — pour comparer les deux systèmes sans risque. |
| **Révision comptée (`ok1`/`ko1`)** | 1re présentation espacée du jour, non anticipée (`counted`). La mesure « propre » de rétention (`retention7`). |
| **Kit (de survie voyage)** | Les 54 phrases indispensables du voyage (`kit: true`). Introduites en priorité si `kitFirst`, drillées dans Voyage, MP3 natifs. |
| **Conf / sosies** | Champ `conf` : jusqu'à 6 ids de mots ressemblants. Distracteurs « piégeux » dès le stage 2. |
| **File / PENDING** | Session du jour : échues + nouvelles, plafonnée à `sessionMax` (120). Le surplus est proposé en fin de session. |
| **Bonus / Entraînement libre** | 10 cartes qui ne touchent PAS la planification (contrairement au boss fight, qui compte). |
| **Boss fight** | Session sur les 20 ennemies les plus faibles. Compte pour la planification (en phase 2, les succès trop anticipés deviennent des no-ops — voulu). |
| **Dictée** | Mode Écoute, 1 question sur 2 : on entend le mot, on choisit le HANGUL parmi des sosies. |
| **Écoute passive** | Module `player.js` : playlist MP3 mains-libres, écran verrouillé, contrôles MediaSession (4 modes : kit, ennemies, en cours, tout le connu). Aucun enregistrement. |
| **Mode avion** | Bouton des Réglages : télécharge tous les MP3 du deck (~2154) dans le cache `sori-audio-store` (jamais purgé par le SW) pour un hors-ligne total. |
| **Trivia / EXTRA** | Encart d'aide après une réponse (exemple, 활용 conjugaison, 💡 note) : `window.EXTRA`, curé par lots via merge_extra/merge_pack. |
| **Scénario** | Simulation dialoguée (`scenarios-data.js` + `scenarios.js`) : répliques NPC + choix commentés. Record « du premier coup » dans `ST.scen`. |
| **Bilan de niveau** | Examen blanc TOPIK-lite (module `exam.js`) : 40 questions, 4 sections stratifiées, historique `ST.exams`. ZÉRO effet sur la planification. **3 profils** (Débutant/Standard/Avancé) + **chrono 10 min optionnel** (constate, ne bloque pas). Champs additifs `profile`/`timeSec`/`overtime` ; `buildExam` reste rétrocompatible en 2 args. |
| **Nombres à l'oreille** | Module `numbers.js` (onglet Écoute) : prix/heures/dates/quantités générés à l'infini, TTS en texte brut (pas de MP3). Convertisseurs purs (sino/natif/…). ZÉRO effet planification ; kind de journal `nombres`. |
| **Rapport 🐞** | Feedback utilisateur (bouton opt-in `ST.set.report`) stocké dans `ST.reports` (cap 100), embarqué dans la sauvegarde cloud pour lecture par Claude (P12, R18). Non auto-effacé. |
| **Quêtes du jour** | 3 objectifs quotidiens déterministes (hash de la date, module `quests.js`), bonus XP à réclamer. Des planchers, jamais des plafonds. |
| **Badges** | 13 jalons calculés à la volée (streak, mots mûrs, collection…). Jamais stockés. |
| **XP / niveaux 급** | Points par réponse (+ bonus quêtes), paliers 9급→초단 (`XP_LEVELS`). Plancher motivant, jamais bloquant. |
| **Événement** | Carte temporaire de l'écran Stats (countdown/message/challenge), pure donnée dans `events-data.js`. Recette R10 / MAINTENANCE-EVENTS.md. |
| **Thème** | Habillage graphique (`themes.css`/`themes.js`) : seoul (défaut) · nuit · hanji · dansaekhwa. Clé localStorage `sori-theme`. |
| **Cloud backup / restore** | Sauvegarde quotidienne automatique + bouton ☁️ vers le repo privé `sori-data` (API GitHub, jeton `sori-gh-token` local au téléphone) ; restauration par le bouton ↓ (`cloudRestore` télécharge `latest.json`, migration douce). Canal principal de progression (R18). Lecture par Claude : R15/R18. |
| **Due / itv** | `due` = date de prochaine révision (`AAAA-MM-JJ`) ; `itv` = intervalle en jours qui a produit cette date. |
| **Migration douce** | Au chargement ET à l'import : `Object.assign({}, DEF_SET, s.set)` + défauts pour les conteneurs manquants. Un vieil état/export reste valide à vie ; les champs inconnus sont préservés. |
| **Service worker (SW)** | `docs/sw.js` — hors-ligne + mises à jour. **Network-first** ; `CACHE` à bump à chaque release ; n'intercepte pas le cross-origin ; ne purge jamais `sori-audio-store`. |
| **PWA** | Progressive Web App : le site installé comme une app Android (manifest + service worker). |
| **GitHub Pages** | Hébergement statique : branche `main`, dossier `docs/`, ~1-2 min de déploiement après push. |
| **edge-tts** | Bibliothèque Python appelant la synthèse neurale Microsoft Edge — produit les MP3 (`ko-KR-SunHiNeural`, rate −15 %). |
| **Streak** | Jours consécutifs avec au moins une réponse (🔥). Aujourd'hui pas encore joué ne casse pas la série. |
| **Saisie hangul (typing)** | Module `typing.js` : au stage 5 (mots), taper la réponse à l'IME coréen au lieu de l'auto-évaluation. Opt-in `ST.set.typing`, 50 % du temps. Juge syllabique tolérant (NFC, Levenshtein ≤ 1, espacement), l'utilisateur tranche les fautes de frappe IME. Kind `type`. |
| **Pages de test (`docs/design/`)** | Pages HTML autonomes par module (events-test, quests-test, exam-test, search-test, player-test, theme-test, typing-test, numbers-test) : vraies données + vrai moteur + checks automatiques. À enrichir à chaque évolution du module concerné. |

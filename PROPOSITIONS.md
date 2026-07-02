# Sori — propositions d'évolution

> Basé sur la lecture du code réel au 2026-07-03 : `docs/app.js` (moteur, 478 lignes), `docs/style.css`, `docs/sw.js`, `tools/build_data.py`. État du deck : **1079 items** (809 mots, 270 phrases), 79 ennemies, 54 phrases kit, répartition stages `{0:118, 1:177, 2:67, 3:116, 4:408, 5:193}`. Contexte : un seul utilisateur (A2→B1), téléphone Android, 30-60 min/jour, **départ Corée le 1er octobre 2026 (J-90)**, itérations rapides par Claude, GitHub Pages, pas de backend.

---

## 1. Vision

D'ici le 1er octobre, Sori doit transformer un vocabulaire *reconnu* (601 items aux stages 4-5) en vocabulaire *produit* : les 54 phrases du kit sorties sans réfléchir, les 79 ennemies vaincues, et la production FR→KR entraînée dans les deux sens à tous les niveaux. L'app doit être utilisable **partout** (silencieuse au bureau et dans le métro, audio riche à la maison) et la progression doit être **inviolable** : quel que soit le rythme des mises à jour poussées par Claude, pas un seul `s/itv/due` ne doit se perdre. Le moteur reste minuscule et sans dépendance ; c'est le **contenu** (trivia, exemples, hanja) qui s'enrichit chaque semaine.

---

## 2. Quick wins (< 1 h chacun, par ordre de priorité)

Les 4 premiers sont des **protections de progression** — à faire avant toute autre évolution.

1. **Corriger le chemin de sortie de `build_data.py`** — ligne 14 : `OUT = r"...\sori\app\data.js"`, mais le dossier `app/` n'existe plus (l'app vit dans `docs/`). Le prochain rebuild plantera ou écrira dans le vide pendant que l'app servira l'ancien seed. → `OUT = r"...\sori\docs\data.js"`. *(5 min)*
2. **Chaîne de migration d'état** — `loadState()` (app.js l.17) fait `if(s && s.v===1) return s;` : le jour où on passe à `v:2`, **toute la progression est silencieusement jetée**. Remplacer dès maintenant par `migrate(s)` (boucle sur une table `MIGRATIONS`, voir §8.3), avec backup automatique du raw dans `localStorage["sori-backup-v"+ancienneVersion]` avant migration. *(30 min)*
3. **Faire passer `importState()` par la même `migrate()`** — actuellement l'import remplace `ST` sans regarder `state.v` : importer un vieil export dans une app plus récente contournerait les migrations. *(10 min)*
4. **IDs kit stables** — `build_data.py` l.162 numérote `kit-%03d` en sautant les phrases déjà dans le deck : si un futur snapshot/contenu absorbe une phrase du KIT, **tous les ids suivants se décalent** et la progression kit en localStorage est orpheline. Dériver l'id du texte : `"kit-" + hash_court(kr)`. À faire *maintenant*, tant que le kit est jeune (une mini-migration mappe les anciens ids). *(30 min)*
5. **Mode silencieux** — toggle 🔇 dans `#topbar`, persisté dans `ST.set.mute`. `speak()` devient no-op si mute (l'app autoplay actuellement `speak(it.kr)` à chaque carte KR→FR et dans Écoute — ingérable au bureau, cf. §5.1). *(20 min)*
6. **Retour haptique** — `navigator.vibrate(40)` sur erreur, `vibrate(15)` sur bonne réponse (Android OK). C'est le feedback du mode silencieux. *(10 min)*
7. **Réécoute lente** — bouton 🐢 à côté du 🔊 : `speak(it.kr, {rate:0.6})`. Une prononciation qu'on n'a pas décomposée ne s'apprend pas. *(15 min)*
8. **Boss fight** — bouton « Ennemies (x) » sur l'écran de fin de session et dans Stats : file dédiée = `items.filter(it => it.enemy && it.stage<=3)`, mode bonus (sans toucher la planif) ou réel au choix. Les 79 ennemies ont déjà le flag, il n'y a juste aucun mode qui les cible. *(45 min)*
9. **Compte à rebours** — « Séoul : J-90 » dans Stats et sur l'écran de fin de session (`const TRIP_DATE="2026-10-01"`). Le deadline est le meilleur moteur de motivation disponible, il est gratuit. *(15 min)*
10. **Version visible + bannière de mise à jour** — `const APP_V=13` dans app.js, affichée en pied de Stats ; au boot, si `APP_V !== ST.lastSeenV`, toast « Mise à jour vX : <1 ligne de changelog> » puis `ST.lastSeenV=APP_V`. Résout « je ne sais jamais si le téléphone a la dernière version ». *(30 min)*
11. **Rappel d'export** — `ST.lastExport` horodaté dans `exportState()` ; si > 7 jours, bandeau discret en haut de Réviser : « Pense à exporter (dernier : il y a 9 j) ». *(20 min)*
12. **Raccourcis d'app** — `manifest.json` → `"shortcuts": [Réviser, Écoute, Voyage]` (appui long sur l'icône Android). *(15 min)*
13. **Reprise de session** — Android tue l'onglet en arrière-plan ; la file `Q`/`QPOS` est perdue et `buildQueue()` re-mélange (les re-pioches d'items ratés disparaissent). Persister `ST.session = {ids:Q, pos:QPOS, date:todayStr()}` à chaque réponse, restaurer si même jour. *(45 min)*

---

## 3. Apprentissage & exercices

### 3.1 Les deux sens à tous les niveaux (demande n°3)

**Constat sur le code** : l'échelle est unidimensionnelle. Stages 1-2 = reconnaissance (KR→FR), stages 3-5 = production. Conséquence : les **408 items au stage 4** et 193 au stage 5 ne repassent *plus jamais* en KR→FR (sauf le mode Écoute, limité aux mots et hors planification). Or lire un panneau à Séoul, c'est de la reconnaissance rapide.

**Option A — rotation d'exercices (recommandée, ~2 h, sans migration)** :
aux stages 4-5, une révision sur trois est posée dans le sens inverse.

```js
// dans renderReview(), à la place du dispatch actuel
const reverse = it.stage>=4 && ((it.ok + it.ko) % 3 === 2);
if (reverse) exoRecallKr2Fr(it);        // KR affiché (+🔊) → dire le sens → auto-éval
else if (it.stage<=2) exoQcmKr2Fr(it);  // inchangé
...
```

Même planificateur, même `applyAnswer` : un échec en reco rétrograde l'item pareil (c'est voulu : s'il ne sait plus le lire, il ne le « maîtrise » pas). Zéro changement de schéma d'état.

**Option B — double piste (v2 d'état, si l'option A ne suffit pas)** :
deux planifications par item — production (héritée telle quelle de v1, **aucune perte**) et reconnaissance (nouvelle).

```js
// ST.items[id] v2 :
{ s, i, d, ok, ko,      // piste production (= v1, intouchée)
  rs, ri, rd }           // piste reconnaissance
// migration v1→v2 : rs = min(s,5), rd = due décalée de itv/2 (désynchronise les deux pistes)
```

Risque : doubler la charge quotidienne → plafonner les revues reco à ~30/jour au début (`ST.set.recoMax`). À ne lancer qu'après 3-4 semaines d'option A, si le besoin est prouvé par les stats.

### 3.2 Construction de phrases façon Duolingo (demande n°5)

Les **270 phrases** passent aujourd'hui par le même QCM que les mots. Au stage 3 (production débutante), remplacer le QCM par un **word bank** :

- Tokens = `it.kr.replace(/[.?!]$/,"").split(" ")` (le coréen du deck est espacé : « 이거 하나 주세요 » → 3 chips), la ponctuation finale réapparaît automatiquement.
- Intrus : 2-3 tokens piochés dans les phrases de `it.conf` puis du même thème (même logique en cascade que `distractors()`).
- UI : chips `--panel2` mélangées en bas, zone de construction en haut, tap pour ajouter/retirer, bouton Valider. Comparaison sur la séquence exacte.
- Fallback : phrases < 3 tokens → QCM classique. Phrases ≥ stage 4 : garder le rappel (produire *sans* banque de mots est l'étape supérieure, le word bank ne doit pas devenir un plafond).
- Fichier : nouvel exo `exoWordBank(it)` dans app.js (ou `engine.js`/`exos.js` après le refactor §8.4). Effort : ~1 journée avec le CSS.

### 3.3 Dictée (pont écoute → écriture, quand l'audio est possible)

Nouvel exo pour mots aux stages 4-5 quand `!ST.set.mute` : 🔊 seul (pas de texte) → taper en hangul (clavier coréen Android à installer une fois) → comparaison normalisée :

```js
const norm = s => s.normalize("NFC").replace(/[\s.?!,]/g,"");
```

Bouton « c'était une faute de frappe » qui requalifie en bonne réponse (l'auto-honnêteté marche déjà pour le rappel, même philosophie). En mode muet, l'item retombe sur le rappel indicé classique.

### 3.4 Rappel tapé (écriture hangul, silencieux OK)

Le rappel pur (stage 5) est auto-évalué — confortable, donc menteur les mauvais jours. Réglage `ST.set.typedRecall` : au stage 5, taper la réponse au lieu de « Montrer ». Même normalisation que la dictée. C'est aussi l'exercice qui fait vraiment répéter l'orthographe hangul (ㅐ/ㅔ, consonnes finales).

### 3.5 Cloze sur les phrases

Stage 4 des phrases : afficher la phrase KR avec un mot masqué (`___`), 4 choix pour le trou (le mot du deck s'il y figure, sinon un token « plein » aléatoire). Travaille la structure sans le coût complet du rappel. ~2 h après le word bank (réutilise la tokenisation).

### 3.6 Ennemies dynamiques

`enemy` est figé au build (lapses Anki d'avant la migration). Le nouveau critère local : `it.ko >= 4 && it.ko > it.ok` → badge « ennemie » à l'affichage + entrée dans le boss fight + priorité d'enrichissement trivia (§4.3). Une fonction `isEnemy(it)` unique remplace les lectures directes du flag.

### 3.7 Matrice cible des exercices

| Niv | Aujourd'hui | Cible silencieux | Cible audio dispo |
|---|---|---|---|
| 1 | QCM KR→FR facile | idem, **sans autoplay** | + autoplay |
| 2 | QCM KR→FR piégeux (conf) | idem | + option « écoute d'abord » (KR masqué 1 s) |
| 3 | QCM FR→KR | mots : QCM · phrases : **word bank** | idem + replay 🐢 |
| 4 | rappel indicé | + **cloze** (phrases) · rotation KR→FR 1/3 | mots : **dictée** |
| 5 | rappel pur auto-évalué | **rappel tapé** (option) · rotation KR→FR 1/3 | **dictée** |

---

## 4. Contenu enrichi (demande n°2)

### 4.1 `docs/extra.js`, séparé du seed

Nouveau fichier généré/curé **hors** de `build_data.py` — le seed (Anki, figé) et l'enrichissement (vivant, produit par Claude) ne doivent pas partager un fichier, sinon chaque rebuild du seed menace le contenu éditorial.

```js
// docs/extra.js — curé par Claude, jamais touché par build_data.py
window.EXTRA = { version: 1, byId: {
  "1763106836914": {
    ex:   [["안녕하세요, 처음 뵙겠습니다.", "Bonjour, enchanté (première rencontre)."]],
    note: "Registre poli standard (해요체). Entre amis proches : 안녕.",
    mn:   "안녕 = « paix » — littéralement « êtes-vous en paix ? »",
    hj:   [["安","안","paisible"],["寧","녕","tranquille"]],
    fa:   null,                       // faux ami / piège éventuel
    conj: null                        // pour les verbes, cf. §4.6
  },
}};
```

Chargé dans `index.html` entre `data.js` et `app.js` ; l'app tolère son absence (`window.EXTRA || {byId:{}}`) et l'absence d'entrée par item — le contenu peut donc arriver par vagues sans jamais bloquer une release. Si le fichier dépasse ~500 KB, le découper en `extra-a2.js` / `extra-b1.js`.

### 4.2 Affichage : la boîte trivia après réponse

Après chaque réponse (bonne *ou* mauvaise), sous le feedback actuel :

- **Phrase d'exemple** : KR en semi-gras + 🔊 + traduction en `--dim` ;
- **Note/mnémo** : une ligne ;
- **Chips hanja** : `安 안 paisible` — tap = liste des mots du deck partageant ce hanja (§4.4) ;
- **Piège** : « ≠ 예약 *réservation* » dérivé de `conf` + note `fa`.

Point d'intégration précis : `afterAnswer()` enchaîne aujourd'hui sur `setTimeout(render, 750/1500)`. Quand l'item a du trivia, remplacer le timer par un bouton « Continuer → » (tap-to-continue) : on lit à son rythme, ou on tape immédiatement pour passer. C'est le seul changement de rythme de l'app, et il est opt-in par la présence de contenu.

### 4.3 Plan de production du contenu (côté Claude)

L'app est prête dès que §4.1-4.2 sont posés ; le contenu arrive ensuite par lots hebdomadaires de ~100 fiches, dans cet ordre de rentabilité :

1. les **79 ennemies** (c'est là que les mnémos et les pièges changent la donne),
2. les **54 phrases kit** (exemples de variantes réelles : « 이거 두 개 주세요 »),
3. les **116 items stage 3** (en pleine transition vers la production),
4. le reste par thème.

Chaque export JSON analysé par Claude fournit la liste des items à fort `ko` → priorisation automatique du lot suivant.

### 4.4 Hanja & familles de mots

Le champ `hj` de §4.1 permet une vue « Familles » : index inversé construit au boot (`hanja → [ids]`), affiché depuis la fiche d'un mot ou un écran dédié. Exemple concret avec le deck actuel : 학교 / 학생 / 대학교 partagent 學(학) — visualiser la famille transforme trois mots isolés en un système. Exercice bonus ultérieur : « ces 4 mots partagent un hanja, que veut-il dire ? ». C'est l'investissement contenu au meilleur ratio pour le passage B1.

### 4.5 Faux amis & pièges

Les groupes `conf` alimentent déjà les QCM piégeux mais restent invisibles pour l'apprenant. La note `fa` les rend explicites : « 가르치다 *enseigner* ≠ 가리키다 *montrer du doigt* ». Règle éditoriale : n'écrire `fa` que quand la confusion est réelle (attestée par les stats `ko` ou classique connue), pas systématiquement.

### 4.6 Conjugaisons (phase B1, septembre)

Pour les verbes/adjectifs : `conj: {pres:"먹어요", past:"먹었어요", fut:"먹을 거예요", neg:"안 먹어요"}` dans extra.js. Affiché dans la fiche mot d'abord ; plus tard, exo « cloze de conjugaison » (phrase d'exemple avec le verbe au présent → produire le passé). Ne pas commencer avant que word bank et dictée soient en place.

### 4.7 Navigateur de deck + fiche item

Il n'existe aujourd'hui **aucun moyen de consulter le deck** (1079 items invisibles hors révision). Écran « Explorer » (accessible depuis Stats) : recherche FR/KR, filtres thème/stage/ennemie/kit, tap → fiche : les deux faces, 🔊, stats perso (`ok/ko`, prochaine échéance), trivia complet, bouton « re-planifier pour demain » (utile quand on croise un mot dont on doute). Effort : ~1 journée, très gros confort d'usage quotidien.

---

## 5. Audio & modes d'usage (demande n°4)

### 5.1 Trois profils d'usage, une règle de design

**Constat sur le code** : `exoQcmKr2Fr()` et le mode Écoute font de l'**autoplay TTS** (`speak(it.kr)` au rendu de la carte, + après chaque réponse). Sur Android, le volume média n'est pas coupé par le mode sonnerie-silencieuse → l'app parle au bureau. Inversement le mode silencieux ne doit rien coûter pédagogiquement.

- **Silencieux** 🔇 (quick win n°5) : aucun `speak()`, feedback par vibration (n°6), l'onglet Écoute se replie sur un mode **Lecture** : le KR s'affiche 1,5 s puis disparaît → QCM. Même muscle (décodage rapide) sans le son.
- **Discret** : pas d'autoplay, mais le bouton 🔊 reste actif (écouteurs ponctuels).
- **Audio** : autoplay comme aujourd'hui + dictée + écoute passive.

**Règle de design à graver dans le README : aucun exercice ne doit *exiger* l'audio — chaque exo a sa variante muette (cf. matrice §3.7).**

### 5.2 Choix de la voix TTS

`pickVoice()` prend la première voix `ko*`. Réglage « Voix coréenne » listant `speechSynthesis.getVoices()` filtrées ko (persisdé par `voiceURI` dans `ST.set.voice`), + une ligne d'aide : « Installer *Synthèse vocale Google* et la voix coréenne dans les réglages Android pour une voix neurale nettement meilleure ». Gratuit et sensible.

### 5.3 Audio pré-généré pour le kit (`edge-tts`)

La qualité TTS navigateur varie ; pour les 54 phrases du kit — celles qu'il faut *imiter* — pré-générer des MP3 avec une voix neurale :

```python
# tools/gen_audio.py  (pip install edge-tts)
# voix: ko-KR-SunHiNeural  →  docs/audio/kit/<id>.mp3  (~54 × 25 KB ≈ 1,4 MB)
```

L'app joue `<audio src>` si le fichier existe, sinon retombe sur `speak()`. GitHub Pages absorbe 1,4 MB sans discussion. C'est aussi la **clé technique du point suivant**.

### 5.4 Écoute passive / mains libres (mode « podcast »)

Boucle du kit écran verrouillé : FR (TTS ou MP3 pré-généré aussi) → pause 2 s (pour se tester) → KR ×2 → item suivant. **Point honnête** : `speechSynthesis` est tué par Android quand l'écran s'éteint ; seuls des `<audio>` + **MediaSession API** (contrôles lecture sur l'écran de verrouillage) rendent le mode fiable. Donc : ce mode dépend de §5.3 et pré-génère aussi les FR (voix `fr-FR-DeniseNeural`, +1,4 MB). Cas d'usage : cuisine, marche, trajets — du volume d'exposition gratuit.

### 5.5 Shadowing outillé

Le drill Voyage dit « répète à voix haute » sans outillage. Ajouter : replay 🐢 (n°7), replay **par segments** (un bouton par token, réutilise la tokenisation du word bank : « 덜 / 맵게 / 해 주세요 »), et **s'enregistrer/réécouter** (MediaRecorder, en mémoire, non sauvegardé) pour se comparer au modèle. Pas de scoring automatique de prononciation — au-delà du raisonnable sans serveur, et s'entendre suffit à corriger 80 % des écarts.

---

## 6. Visuel & UX (demande n°6)

La base slate/teal est bonne — tout passe par les variables `:root` de style.css, donc les thèmes sont quasi gratuits.

- **Thème « Hanji » clair** : l'écran sombre est difficile en plein soleil — réel à Séoul en octobre. Second jeu de variables (`body.light`) : fond papier `#f5f1e8`, texte encre `#1c1917`, accent conservé. Toggle dans Réglages + suivre `prefers-color-scheme` par défaut. ~20 lignes de CSS.
- **Accent « dancheong »** optionnel : variante `--acc:#c0392b` (rouge des temples) — un swap de 3 variables, pour le plaisir.
- **Micro-animations CSS pur** (aucune lib) : carte qui entre (`translateY(8px)`+fade 150 ms), pulse vert sur `.good`, shake 200 ms sur `.bad`, flamme du streak qui ondule en `keyframes`. Budget : ~30 lignes.
- **Lisibilité hangul** : `line-height:1.4` sur `.big-kr` ; slider « taille du coréen » (`ST.set.krScale` 1.0-1.3 appliqué en `font-size:calc()`). Les syllabes denses (병원, 짧다) méritent de l'air. **Pas de romanisation** — à A2 c'est une béquille qui ralentit le décodage ; position assumée, ne pas l'ajouter.
- **Ergonomie une main** : les options QCM sont aujourd'hui en haut de l'écran sur un grand téléphone. Passer les cartes d'exercice en `display:flex; min-height:100%` avec question centrée et `.opts`/`.row` poussées en bas (`margin-top:auto`) → tout se joue dans la zone du pouce. Swipe gauche/droite sur l'écran de rappel = Encore/Bien (30 lignes de `touchstart/touchend`).
- **Tap-to-continue** : les `setTimeout(render, 750/1500)` imposent leur rythme ; dès que la boîte trivia existe (§4.2), le « Continuer → » devient le standard des mauvaises réponses (on veut relire), le timer court restant pour les bonnes.
- **Badge « à réviser »** sur l'onglet Réviser au chargement (pastille avec le nombre d'échues) ; `navigator.setAppBadge(n)` en bonus sur l'icône installée (supporté Chrome/Android, silencieusement ignoré ailleurs).
- **Widgets Android** : pas d'API widget pour les PWA — dire non clairement. Les `shortcuts` du manifest (quick win n°12) + le badge sont le maximum honnête.

---

## 7. Gamification & motivation

- **« Cap sur Séoul — J-90 »** : bloc en tête de Stats avec les 3 jauges qui comptent, cibles explicites pour le 1er octobre :
  - Kit : **54/54 au stage ≥ 3** (produites, pas juste reconnues) ;
  - Ennemies : **79/79 vaincues** (stage ≥ 4 — la stat `beaten` existe déjà) ;
  - Vocabulaire actif : **700/1079 au stage ≥ 4** (601 aujourd'hui → +100, réaliste).
  Chaque jauge affiche le rythme requis (« 6 phrases kit/semaine ») recalculé depuis J-x.
- **Gel de streak** : 1 joker/semaine consommé automatiquement (`ST.frozen`), affiché « 🔥 12 (1 gel utilisé) ». Un streak cassé pour une soirée d'imprévu démotive plus qu'il ne discipline.
- **Quête du jour** : 3 cases sous la barre de progression — `20 révisions · 1 série Écoute (ou Lecture si muet) · 3 phrases kit`. Le compteur `#daycount` du topbar devient un anneau qui se remplit avec la quête.
- **Boss fight hebdo** : le mode ennemies (quick win n°8) avec score et historique (`ST.boss:[{date,score,n}]`) — « samedi, 12/15, record battu ». Les ennemies enrichies en trivia (§4.3) d'abord : on ne re-bat pas un boss sans nouvelle arme.
- **Badges sobres** (pas de pluie de confettis, ça jure avec le ton de l'app) : première ennemie vaincue, 7/30/90 jours, kit resto complet, premier rappel tapé parfait, 100 dictées. `ST.badges:{id:date}`, écran Stats, une ligne discrète à l'obtention.
- **Bilan hebdo dans l'export** : section `summary` auto-calculée en tête du JSON exporté (semaine : réponses, taux, nouvelles ennemies, stages franchis) — c'est ce que Claude lit en premier, et ça formalise la boucle humaine déjà en place.

---

## 8. Architecture & modularité (demande n°1)

### 8.1 Quatre couches, quatre artefacts, un contrat

| Couche | Artefact | Change quand | Versionné par |
|---|---|---|---|
| Moteur | `app.js` (+ `engine.js` extrait) | à chaque release | `APP_V` |
| Seed (contenu de base) | `data.js` (généré) | rebuild contenu | `SEED.meta.version` |
| Enrichissement | `extra.js` (curé par Claude) | chaque semaine | `EXTRA.version` |
| Progression | localStorage `sori-state-v1` | à chaque réponse | `ST.v` |

**Le contrat qui protège tout : la progression ne référence le contenu que par `id`, et un `id` est éternel.** Le pattern seed+delta de `eff()` est déjà exactement le bon (le seed peut évoluer, seuls les deltas locaux priment) — il faut le sanctuariser, pas le réinventer.

### 8.2 Règles de stabilité (à coller en tête d'app.js)

| Interdit à jamais | Toujours permis |
|---|---|
| Renommer `sori-state-v1` (la clé, pas le contenu) | Ajouter des champs à `ST.items[id]`, `ST.set`, aux items du seed |
| Changer la sémantique de `s`/`i`/`d`/`ok`/`ko` | Ajouter des types d'exercices, des modes, des écrans |
| Réutiliser ou renuméroter un `id` | Ajouter des items (nouveaux ids) |
| Supprimer un champ qu'un vieil export contient | Déprécier un champ (le laisser mort dans l'état) |
| Sortir une release qui écrit `v:N+1` sans migration N→N+1 | |

### 8.3 Migrations d'état

```js
const STATE_V = 2;
const MIGRATIONS = {
  1: st => { /* v1→v2 : ex. ids kit re-hashés, ST.session ajouté */ st.v = 2; return st; },
};
function migrate(st){
  while (st.v < STATE_V) {
    localStorage.setItem(`sori-backup-v${st.v}-${todayStr()}`, JSON.stringify(st)); // filet
    st = MIGRATIONS[st.v](st);
  }
  return st;
}
// loadState() ET importState() passent par migrate(). Jamais de retour à l'état vierge
// si un état existe : en cas d'échec de parse, on garde le raw dans sori-quarantine et on alerte.
```

Même logique côté seed : si `SEED.meta.version` dépasse ce que le moteur connaît, bandeau « mets à jour l'app » plutôt que comportement indéfini.

### 8.4 Extraire `engine.js` + tests Node (zéro dépendance)

Les fonctions pures d'app.js — `applyAnswer`, la logique de `buildQueue`, `distractors`, `streak`, `migrate`, le futur `merge` — partent dans `docs/engine.js`, chargé avant app.js, avec le pont classique :

```js
// fin d'engine.js
if (typeof module !== "undefined") module.exports = { applyAnswer, migrate, ... };
```

Tests dans `tools/tests/engine.test.mjs`, lancés par `node --test` (runner intégré, rien à installer) :

- montée d'échelle 0→5 et plafond d'intervalle (`min(120, …)`), rétrogradation `max(1, s-2)` ;
- **chaque migration préserve stage/itv/due de chaque item** (le test anti-cauchemar) ;
- distracteurs : jamais l'item lui-même, jamais deux `fr` identiques, priorité aux `conf` dès stage 2 ;
- file : respecte `newPerDay`, `sessionMax`, `kitFirst`, n'introduit pas deux fois le même jour ;
- merge d'imports : idempotent, max de stage, sommes de compteurs.

### 8.5 Le contenu sort du script Python

Le snapshot Anki est un fossile (l'app remplace Anki) ; les futurs ajouts (vocab B1, nouvelles phrases kit) ne viendront plus de lui. Restructurer :

```
tools/build_data.py      # fusionne : snapshot figé + content/*.json → docs/data.js
content/kit.json         # le KIT sort du .py (données ≠ code)
content/items_b1.json    # nouveaux items ajoutés par Claude, mêmes champs que le seed
```

Ajouter un mot B1 = éditer un JSON + relancer le build. `build_data.py` garde la responsabilité des groupes `conf` (recalculés sur l'ensemble).

### 8.6 CI minimale (GitHub Actions)

`.github/workflows/check.yml` (~25 lignes) : sur chaque push → `node --test tools/tests/` + `python tools/check_data.py` qui valide `docs/data.js` : JSON parsable, ids uniques, tous les `conf` pointent vers des ids existants, `kit` = 54, stages ∈ 0-5. Échec = mail GitHub. C'est l'assurance-vie du duo « Claude pousse vite / le téléphone recharge tout seul ».

### 8.7 Process de release (demande n°7)

```
tools/release.ps1 :
  1. node --test                        → stop si rouge
  2. python tools/check_data.py         → stop si rouge
  3. bump APP_V (app.js) + CACHE "sori-vN" (sw.js) + 1 ligne CHANGELOG.md
  4. git commit + push
Téléphone : ouvrir l'app en ligne → sw network-first sert la nouvelle version
            → toast « v14 : dictée ajoutée » (quick win n°10) confirme la mise à jour.
```

Une commande, pas d'étape mentale à retenir, impossible de pousser sans tests.

---

## 9. Synchro & données

- **Position honnête** : sans backend, localStorage est la source de vérité et l'export JSON est à la fois la sauvegarde et le canal vers Claude. Tout ce qui suit renforce ce flux au lieu de le remplacer.
- **Rappel d'export** (quick win n°11) + **résumé lisible** en tête d'export (§7) : le fichier OneDrive devient auto-porteur pour l'analyse.
- **Import « Remplacer ou Fusionner »** : `importState()` ne propose que le remplacement. Ajouter le merge : par item, garder le delta au **stage max** (à stage égal, le `due` le plus tardif), additionner `ok/ko`, fusionner `log` par date (sommes), `set` local conservé. → utiliser Sori sur PC au bureau *en silencieux* et sur téléphone le soir devient réaliste : un export/import hebdo dans chaque sens suffit, sans serveur ni conflit destructif.
- **Backups locaux automatiques** : avant chaque migration (§8.3) + un snapshot hebdo glissant `sori-backup-weekly` (écrasé). Protège du « j'ai importé le mauvais fichier » — avec un bouton « Restaurer le backup » dans Stats.
- **Hygiène du quota** : `ST.log` grandit sans borne (une clé par jour actif). Tailler à 400 jours au boot ; l'historique complet vit dans les exports OneDrive.
- **Ce qu'on ne fera pas** (et pourquoi, pour ne pas y revenir) : File System Access en écriture — non supporté sur Android ; notifications push quotidiennes — impossible sans serveur (l'alarme Android + le badge d'icône font le travail) ; sync via token GitHub sur le téléphone — un token à portée de push sur un repo public est un risque disproportionné pour un problème déjà résolu par OneDrive.

---

## 10. Priorisation finale

Impact : ▲ fort / ► moyen. Effort : S < 1 h · M = ½-1 j · L > 1 j. Vagues calées sur J-90.

| # | Proposition | Impact | Effort | Quand |
|---|---|---|---|---|
| 1 | Fix `OUT` build_data.py (§2.1) | ▲ (débloque tout rebuild) | S | **Vague 0 — cette semaine** |
| 2 | Migrations d'état + import migré + backups (§2.2-3, §8.3) | ▲ (anti-perte) | S | Vague 0 |
| 3 | IDs kit stables (§2.4) | ▲ (anti-perte) | S | Vague 0 |
| 4 | Mode silencieux + vibration (§2.5-6) | ▲ (usage quotidien) | S | Vague 0 |
| 5 | Reprise de session (§2.13) | ▲ | S | Vague 0 |
| 6 | Version visible + toast release (§2.10) | ► | S | Vague 0 |
| 7 | Boss fight ennemies (§2.8) | ► | S | Vague 0 |
| 8 | J-90, rappel export, 🐢, shortcuts (§2.7/9/11/12) | ► | S | Vague 0 |
| 9 | `engine.js` + tests + CI + release.ps1 (§8.4-8.7) | ▲ (vélocité sûre) | M | **Vague 1 — juillet** |
| 10 | Rotation deux sens, option A (§3.1) | ▲ | S/M | Vague 1 |
| 11 | Word bank phrases (§3.2) | ▲ | M | Vague 1 |
| 12 | extra.js + boîte trivia + tap-to-continue (§4.1-4.2) | ▲ | M | Vague 1 |
| 13 | Contenu trivia : 79 ennemies puis kit (§4.3) | ▲ | M (récurrent) | Vague 1 → continu |
| 14 | Thème clair Hanji + micro-animations + une main (§6) | ► | M | Vague 1 |
| 15 | Dictée + rappel tapé (§3.3-3.4) | ▲ | M | **Vague 2 — août** |
| 16 | Navigateur de deck + fiche item (§4.7) | ► | M | Vague 2 |
| 17 | MP3 kit via edge-tts + voice picker (§5.2-5.3) | ► | M | Vague 2 |
| 18 | Écoute passive MediaSession (§5.4) | ► | M | Vague 2 |
| 19 | Quête du jour + jauges « Cap sur Séoul » + gel streak (§7) | ► | M | Vague 2 |
| 20 | Cloze + ennemies dynamiques (§3.5-3.6) | ► | S/M | Vague 2 |
| 21 | Familles hanja (vue + exo) (§4.4) | ► | M | **Vague 3 — septembre** |
| 22 | Merge multi-appareils (§9) | ► | M | Vague 3 |
| 23 | Shadowing outillé (segments, enregistrement) (§5.5) | ► | M | Vague 3 |
| 24 | Conjugaisons B1 (§4.6) | ► | L (contenu) | Vague 3 / après départ |
| 25 | Double piste reco/prod, option B (§3.1) | ► | L | Seulement si l'option A montre ses limites |

**Lecture recommandée du backlog** : la vague 0 verrouille la progression et l'usage quotidien (tout est < 1 h) ; la vague 1 installe les fondations pédagogiques (deux sens, phrases, trivia) et industrielles (tests, CI) ; la vague 2 enrichit les modes ; la vague 3 est le sprint « voyage ». Au 1er octobre : kit automatique, ennemies vaincues, et une app qui tient dans la poche, en silence comme en son.

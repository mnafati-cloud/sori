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
- **Volumes actuels** : 7997 items dans le seed, 7471 phrases d'exemple glosées (`gl`),
  **7997 MP3 de mots + 7471 MP3 de phrases (`-ex.mp3`), ~254 Mo**, **43 tests Node**, `CACHE` = `sori-v41`.
  ⚠️ **L'audio (~254 Mo, ~15500 fichiers) devient lourd** : à sortir du repo Pages (CDN/host séparé) — l'artefact Actions et le mode avion grossissent.
- **v48 (Progrès : maîtrise par niveau + vitesse)** : deux visualisations dans `renderStats`.
  (1) **📊 Ta maîtrise par niveau** : une barre par bande CEFR = `mas[b]/tot[b]` où `mas`=items
  `stage>=4` et `tot`=items du niveau (via `EXTRA[id].cefr`), + ligne « tu travailles le <bande la
  première <80%> ». C'est l'**image de niveau toujours à jour** tirée des données stockées (bien plus
  fiable que le test one-shot `placement.js` — insight user). CSS `.levelbars/.lvlrow/.lvltrack/.lvlfill(.work)`.
  (2) **Nouveaux mots — 14 jours** : bar chart de `ST.intro[jour]` (déjà loggé, jour→count persistant)
  + « ≈ N mots/jour cette semaine ». Mesure l'EXPOSITION (pas la rétention). CACHE `sori-v48`.
- **v67 (retrait de l'exercice « Structure de phrase »)** : décision user après essai réel (« je n'en
  vois pas l'intérêt au final » — 9 réponses le 07/07, 7/7 après le fix v62, plus jamais rouvert).
  Retiré : le bloc SORI_STRUCTURE de `renderExercices` (l'onglet Exercices = nombres + simulations).
  **CONSERVÉ (dormant, convention placement.js)** : `docs/structure.js` chargé (index.html + ASSETS),
  `tests/structure.test.mjs`, le contenu `EXTRA[id].base` des 981 phrases (contrat additif — jamais de
  suppression de champ), `ST.strPos` (inerte). Réactivation = recâbler le bloc dans renderExercices
  (cf. v59/v62). Le kind `structure` reste dans les stats historiques. CACHE `sori-v67`.
- **v66 (livré par l'user depuis une autre machine)** : progression de niveau en graphiques (retour
  rapport 🐞, commit `f957518`, doc à compléter par lui).
- **v65 (OBSERVABILITÉ — « pour bien décider a posteriori, il faut avoir bien loggué »)** : audit demandé
  par l'user (« tu récupères toutes les exceptions ? tu distingues tous les types d'exercices ? »). Constat :
  exceptions JS = RIEN (catch(e){} muets partout), échecs d'auto-backup cloud AVALÉS (jeton expire
  2026-12-31 → arrêt silencieux), fast-track/undo non comptés, ni heure ni temps de réponse au journal.
  Ajouts (tous ADDITIFS dans l'état, embarqués dans la sauvegarde cloud → **à LIRE à chaque analyse,
  comme state.reports — P12 étendu à `state.errors`**) :
  (1) **`ST.errors`** (cap 50, dédup consécutive msg+src avec compteur `n`) : `logErr(type,msg,src)` +
  handlers globaux `error`/`unhandledrejection` (jamais de throw, tab contexte) ; `autoCloudBackup`
  logge ses échecs (type `cloud`).
  (2) **`ST.rlog` passe à 7 champs** : `[date, id, note, elapsed, kind, rt(dixièmes de s, cap 600),
  minuteDuJour]` — hésitation + patterns circadiens pour le fit/analyses. Entrées 4 champs (≤v63) et
  5 champs (v64) restent valides, segmenter par longueur. **RLOG_CAP 10000→8000 = BUDGET CLOUD**
  (8000×~55 o ≈ 440 Ko, état ~600 Ko brut → ~800 Ko base64, limite API ~1 Mo — ne pas remonter sans refaire le calcul).
  (3) **`ST.log[j].known`** (fast-track « Je le sais » — avant, usage invisible, inféré par heuristique)
  et **`ST.log[j].undo`** (taux de mis-clics).
  (4) **`ST.vlog`** `[[date,"vNN"],…]` (cap 50) au boot via `caches.keys()` — borne les changements de
  RÉGIME de notation (v58/v64) pour le fit Phase B.
  Vérifié preview (exception+rejet capturés, vlog posé, entrée 7 champs rt=148/min=1425, known=1,
  undo→pop rlog+compteur), 60 tests. CACHE `sori-v65`. **Ce qui reste HORS de portée (assumé) : console
  téléphone, réseau, appareil — on ne voit QUE ce que l'app écrit dans son état.**
  **REVUE ADVERSARIALE v65 (6 confirmés) — correctifs intégrés** :
  (a) MAJEUR, TDZ : `typeof TAB` dans logErr THROW avant l'init de `let TAB` (typeof ne protège pas la
  TDZ) → une erreur au BOOT était avalée — le cas exact que la couche devait capturer. Fix : lecture de
  TAB isolée dans son propre try.
  (b) MAJEUR, **BOMBE BUDGET CLOUD** : le poste dominant de l'état n'est PAS le rlog mais **ST.items
  (~84 o × cartes touchées ≈ 673 Ko à deck complet)** → l'export dépassera la limite API ~1 Mo vers
  l'automne 2026 ; sauvegarde ET restauration casseraient avec des messages TROMPEURS (« refus API
  jeton ? », « hors ligne ? »). Mitigé : garde de taille dans cloudBackup (logErr au-delà de 700 Ko).
  **CHANTIER PLANIFIÉ (avant sept. 2026) : sortir rlog/errors du fichier restaurable (fichier cloud
  séparé) et/ou compacter ST.items.** Pour Phase B : l'historique complet au-delà du FIFO =
  union des snapshots quotidiens datés `exports/sori-export-*.json` (archive de facto).
  (c) filet d'erreurs PRÉCOCE : 16 scripts se chargent avant app.js — SyntaxError amont/crash du boot
  étaient invisibles. Fix : inline `<script>` en tête d'index.html → clé SÉPARÉE `sori-earlyerrs`
  (cap 20, ne touche jamais sori-state-v1), drainée dans ST.errors au boot (marqueur `[avant-boot]`).
  (d) save() de logErr déplacé dans la branche « nouvelle entrée » (une rafale dédupliquée ne sérialise
  plus ~600 Ko en boucle) ; (e) rejets-objets : message dérivé (JSON.stringify) au lieu de
  « [object Object] » qui fusionnait des causes distinctes sous la dédup ; (f) fenêtre rlog à ~670
  rév/j ≈ 12 j glissants — assumé, cf. (b) snapshots datés. Vérifié preview : earlyerrs drainée
  `[avant-boot]` + clé nettoyée, 2 rejets-objets → 2 messages JSON distincts.
- **v64 (la stabilité ne grimpe vite que sur la PRODUCTION sans aide)** : retour user affûté — le rappel
  indicé (1re syllabe = indice énorme en coréen, « fausse impression de savoir ») et le sens inversé
  (KR→FR = direction facile) créditaient Bien(3) comme un rappel pur → une carte pouvait atteindre le badge
  « maîtrisée » (stage 4) par QCM→indice→sens inversé SANS avoir jamais produit le mot sans aide, avec S
  gonflée sur la compétence facile (mesuré en preview : un recrev juste faisait S 3→21 j ; plafonné → 7 j).
  Fix (validé par AskUserQuestion, choix « production d'abord ») : **`KIND_MAXGRADE rec4:3→2, recrev:3→2`**
  (build reste 3 = seule production des phrases ; typing inchangé — l'arbitrage faute-de-frappe existe déjà).
  `gradeButtons` : si `maxG<=2` → paire binaire Encore/Bien (une seule note positive possible, crédit 2 en
  interne, précédent v58 QCM) — condition `grade4 !== false && maxG > 2`. Le stage grimpe TOUJOURS à chaque
  succès (les exercices durcissent) ; seule la CROISSANCE de S est tempérée (w15=0.2315). + **métrique honnête
  « ancrées »** : fin de session et popin « Cartes maîtrisées » affichent `stage>=4 && itv>=14` (« maîtrisée »
  = a grimpé l'échelle ≠ ancrée en mémoire). Vérifié preview (état piloté 2 cartes + sus sur le reste du deck,
  Math.random forcé : rec4 binaire note 2, recrev binaire note 2 stage 3→4, rec5 4 boutons note 3, écran fin
  + popin, 0 erreur console). CACHE `sori-v64`. **LEÇON : sur une échelle d'exercices, le plafond de note doit
  refléter l'AIDE (indice) ET la DIRECTION (compréhension vs production) — sinon le planificateur espace des
  mots que l'user sait reconnaître mais pas produire (le biais exactement dans le mauvais sens pour un voyage).**
  **REVUE ADVERSARIALE (2 lentilles + réfutation, 7 confirmés) — correctifs intégrés au même lot** :
  (1) MAJEUR, la note plafonnée nourrissait AUSSI `fsrsNextD` → D dérivait en cliquet vers ~9,8 (point fixe
  mesuré sur le moteur réel ; une carte parfaitement connue convergeait vers la D d'une leech, et le facteur
  (11-D) freinait même les rec5 non plafonnés : +48 % de révisions/an). Fix : **dissociation des canaux** —
  `fsrsSchedule(it, G, today, {gradeD})` : S suit G (plafonné, pénalité w15 = l'intention), **D suit
  `opts.gradeD`** (la note réellement choisie, transmise brute par `gradeButtons`→`afterAnswer`→`applyAnswer`).
  Sans l'option : comportement inchangé (rétrocompatible). Test dédié (60 tests). Vérifié preview : recrev
  « Bien » → S=7.216 (freinée) / D=4.992 (=canal 3) au lieu de D=5.799.
  (2) MAJEUR (dormant), en mode « Production séparée » (reverse ON) la carte recto ne voyait QUE recrev →
  plafond 2 À VIE sans échappatoire. Fix : `maxGradeFor(it, kind)` — recrev sur une carte recto en mode
  reverse = exercice CANONIQUE (pas « aidé ») → plafond 3.
  (3) mineur, undo × RLOG_CAP : à 10 000 entrées, push+splice laissait la longueur inchangée → l'entrée
  annulée restait. Fix : marqueur `UNDO.rlogPushed` posé par `logReview`, consommé par `undoLast` (pop).
  (4) mineur, `.g4row{gap:6px}` était morte (perdait contre `.row{gap:10px}` déclarée après) → `.row.g4row`.
  (5-7) nits : tooltip « 4 boutons » précisé (rappel SANS AIDE seulement), commentaire v63→v64, double
  `BASE_IDS.map(eff)` de l'écran de fin factorisé. **BONUS journal : `rlog` gagne un 5e champ ADDITIF `kind`**
  (`[date,id,noteplafonnée,elapsed,kind]`) → le fit Phase B pourra distinguer un 2 CHOISI d'un 2 IMPOSÉ et
  segmenter par type d'exercice (les vieilles entrées à 4 champs restent valides). **PIÈGE re-confirmé en
  preview : le cache heuristique du navigateur sert un engine.js périmé après édition — `fetch(url,
  {cache:"reload"})` puis reload avant toute vérification (cf. gotcha v16).**
- **v63 (livré par l'user depuis une autre machine)** : Stats — niveau actuel, ETA vers le niveau suivant,
  graphes succès & maîtrise/jour (commit `6e2751d`, doc à compléter par lui).
- **v60-v61 (livrés par l'user depuis une autre machine — doc à compléter par lui)** : `v60` = bouton 🔊 au
  rappel pour réécouter le mot pendant la notation ; `v61` = clic sur le n° de version (Réglages) → historique
  des versions. (Détails non documentés ici : commits `aa5164d` / `40ef703`. Signalés pour ne pas laisser de
  trou dans la numérotation des CACHE `sori-vNN`.)
- **v62 (Structure : démarrage FACILE -> DUR)** : retour user — l'exercice v59 tirait le pool AU HASARD
  (Fisher-Yates global), il est tombé direct sur une phrase difficile (un proverbe C1 de 9 mots) et a
  abandonné (« trop dur »). Fix en deux temps : (1) `renderExercices` (app.js) **trie le pool facile->dur**
  = `nb de mots (kr.split(" ")) ASC, puis niveau CEFR (LVL_RANK) ASC, puis longueur kr, puis id` (cefr
  absent → rang B1) ; (2) `structure.js` parcourt le pool trié par **`rampOrder(n, rng, win=6)`** (fonction
  PURE exportée dans `SORI_STRUCTURE.pure`) = mélange PAR FENÊTRES de 6 → garde « les faciles d'abord » tout
  en variant l'ordre d'une série à l'autre ; `pick()` avance via un pointeur `ptr` (au lieu d'un
  `order.pop()` sur un shuffle global). Invariant testé : chaque fenêtre de sortie ne contient QUE ses index
  d'entrée (aucune phrase dure ne remonte). **Nouveau `tests/structure.test.mjs`** (6 tests : permutation
  exacte, faciles-d'abord, déterminisme, non-identité, win par défaut, n=0/1) → **59 tests**. Vérifié preview
  (pool 583 : 1re carte = `내일 뭐 해요?` A1 3 mots ; les 10 premières toutes A1 3 mots ; reveal + décompo OK ;
  0 erreur console). **Revue adversariale 3 lentilles via Workflow → 1 défaut MAJEUR rattrapé** : le curseur
  `ptr`/`order` vivait UNIQUEMENT dans la fermeture de `renderCard`, recréée à chaque changement d'onglet
  (l'app ouvre sur Progrès, `renderExercices` ne tourne qu'au switch → nouvelle fermeture `ptr=0`). Comme
  `rampOrder(win=6)` mélange PAR fenêtres, la 1re série d'une visite tire toujours dans {0..11} → un débutant
  faisant ≤1 série/visite serait resté **bloqué sur les 12 phrases les plus faciles** (571/583 = 97,9 %
  inatteignables). **Correctif** : persister la position via **`ST.strPos`** (racine, additif, init loadState +
  applyImportedState) ; `renderCard` reçoit `startPos` (entrée) et émet `onPos(pos)` (sortie → `save()`), comme
  `scenarios.js` (getBest/setBest) — le module ne touche TOUJOURS pas localStorage. `pick()` amorce `ptr` depuis
  `startPos` (borné/wrap) → la rampe facile→dur progresse ENTRE les visites, tout le pool est atteignable. Vérifié
  preview (2 fermetures successives = 0 recouvrement de phrases ; pos 300→4 mots A2, pos 560→6 mots B1/B2 ;
  câblage réel : strPos 0→2 dans localStorage). Rétrocompat : exercice autonome (télémétrie seule), aucune
  donnée SR touchée ; `ST.strPos` défaut 0. CACHE `sori-v62`. **LEÇON : un tri « facile d'abord » sans état
  persistant = mur silencieux ; la revue adversariale a échangé un défaut visible (proverbe C1 en 1er) qui en
  cachait un pire (98 % du pool gelé). La progression d'un exercice « sans SR » doit quand même persister.**
- **v59 (exercice « Structure de phrase » — particules & conjugaison)** : demande user (travailler les
  particules qu'il confond). Nouvel exercice AUTONOME (comme numbers/scenarios, PAS de répétition espacée)
  dans l'onglet Exercices. Principe : phrase en FR + **vocabulaire de base** (lemmes sans grammaire) →
  l'apprenant devine la phrase KR complète (particules/conjugaison/ordre) DANS SA TÊTE → « Montrer » →
  révèle le KR + décompo mot-à-mot + construction (données v56) → **auto-évaluation** (✗/✓, série de 10).
  Aucune saisie/construction dans l'app (choix user). Module `docs/structure.js` (IIFE, CSS injecté,
  `SORI_STRUCTURE.renderCard(container, {pool, speak, onAnswer})`, zéro état persistant). `renderExercices`
  construit le pool = phrases ≥3 mots ayant `EXTRA[id].base` + `words`. **Contenu** : `EXTRA[id].base`
  = `[[lemme_kr, sens_fr], …]` (forme dictionnaire, particules/terminaisons retirées) généré pour les
  **981 phrases** via workflow `sori-phrase-basewords` (gen→vérif native) + `tools/merge_basewords.py`.
  Ajouté à index.html (script) + sw.js (ASSETS). Vérifié preview (rendu + vraies données : « ensoleillé »
  → base 햇볕/잘/들다 → 햇볕이 잘 들다 + décompo/construction). **extra.js ~2,5 Mo.** CACHE `sori-v59`. 53 tests.
- **v58 (plafond de note par difficulté d'exercice — piège des 4 boutons)** : retour user juste — la
  difficulté de l'exercice monte avec le stade (QCM→indice→sans aide→écrit), mais FSRS suppose un test
  de rappel constant → un « Bien » sur un QCM (reconnaissance facile) gonflait la stabilité à tort.
  Fix : `KIND_MAXGRADE = {qcm1/2/3:2, build/rec4/recrev:3, rec5/type:4}` ; `afterAnswer` calcule
  `G = ok ? min(grade||3, maxG) : 1` (la note effective est **plafonnée par l'aide de l'exercice**).
  `gradeButtons` n'affiche que les notes atteignables (rappel indicé → 3 boutons, pas de « Facile » ;
  sans aide → 4). Effet : **QCM correct = Difficile(2)**, la stabilité ne grimpe qu'avec une vraie preuve
  de mémoire, et ça aligne montée de stade ↔ montée de stabilité. Vérifié preview (QCM→journal note 2,
  indice→3 boutons, sans aide→4 + Facile→note 4). CACHE `sori-v58`. 53 tests.
- **v57 (petits gains : notation 4 boutons + « je le sais déjà »)** : choix user.
  **(1) 4 boutons** — `applyAnswer(it, ok, grade)` et `afterAnswer(…, grade)` portent une note 1-4
  (1 Encore/Again · 2 Difficile/Hard · 3 Bien/Good · 4 Facile/Easy) ; FSRS l'utilise (w15 pénalité Hard,
  w16 bonus Easy), legacy reste binaire (utilise `ok`). Helper `gradeButtons(row, it, kind)` = 4 boutons
  si `ST.set.grade4` sinon 2 ; utilisé par `exoRecall` + `exoRecallRev` (QCM/build restent binaires).
  `ok = note≥2` (Hard/Good/Easy = pass). CSS `.g4row/.btn.g4`. DEF_SET `grade4:true` + toggle Réglages.
  **(2) Fast-track** — bouton `✓ Je le sais` dans l'en-tête si `stage<4` ; `markKnown(id)` planifie LOIN
  sans tester (FSRS : `S=max(21,W[3])`, `D=fsrsInitD(4)`, stage 5, dû à +~21j ; legacy : stage 5, itv 21) et
  **ne logge PAS** dans `ST.rlog` (déclaratif, ne doit pas biaiser le fit). Réutilise `.rev-actions`
  (re-ajouté au CSS, retiré en v47). Vérifié preview : 4 boutons (Facile→S 5→35, journal note 4),
  fast-track (stage 5, S 21, dû +21j, avance, 0 journal, masqué si stage≥4). CACHE `sori-v57`. 53 tests.
- **v56 (décomposition mot-à-mot + construction des PHRASES)** : demande user (« quand on traduit une
  phrase entière, un trivia qui explique les mots et leur construction »). **Rendu** : `showTrivia` affiche,
  pour une carte `type:phrase`, un bloc **« 📝 Mot à mot »** (une ligne par bout : `EXTRA[id].words`
  = `[[bout_kr, sens_fr], …]`) puis **« 🔧 Construction »** (`EXTRA[id].build`). Dégradation propre si absents.
  CSS `.wbreak/.wbrow/.wbk/.wbg`. **Contenu** : `words`+`build` générés pour **981 phrases multi-mots** via
  workflow `sori-phrase-breakdown` (36 lots × gen→vérif native adversariale ; la vérif a corrigé irréguliers,
  particules, typos coréennes). Fusion `tools/merge_phrase_breakdown.py <dossier_out>` (garde-fous : paires
  [str,str] non vides, build non vide). Intégrité : 981/981 avec words, recouvrement 981/981 (les bouts
  concaténés = la phrase), 0 sans build. **⚠️ extra.js pèse maintenant ~2,4 Mo** (parsé au chargement ;
  acceptable, ordre de grandeur < audio, mais à surveiller). CACHE `sori-v56`. 53 tests.
- **v55 (bouton « Réviser 10 cartes » : fragilité FSRS-native)** : le bouton v54 (créé par l'user)
  triait « fragile » via `stage`+`easeOf` (notions legacy). Depuis FSRS actif, le vrai « fragile » =
  **récupérabilité la plus basse** (proba de rappel maintenant). Ajout `cardRetrievability(it)` =
  `fsrsR(elapsed, S)` avec `S` = stabilité FSRS si présente, sinon amorcée depuis l'intervalle (cohérent
  avec la migration) → mesure unifiée en mode FSRS comme Classique. `reviewMoreQueue` trie par R croissant
  (au bord de l'oubli d'abord), puis ko, puis id, puis shuffle. Vérifié preview : sélectionne exactement
  les 10 R les plus bas du deck. CACHE `sori-v55`. 53 tests. (Analyse données user : FSRS actif, 209/1025
  cartes avec état FSRS, journal 637 rév., rétention mesurée 71% mais échantillon minuscule/biaisé fragiles
  court-intervalle — trop tôt, vrai diagnostic = fit Phase B ~2-3 sem.)
- **v54 (bouton « Réviser 10 cartes » — créé par l'user)** : révision anticipée à la demande sur la fin
  de session ; `reviewMoreQueue(n)` (fragiles d'abord). ⚠️ FSRS compte les révisions anticipées (reprogramme).
- **v53 (planificateur FSRS — Phase A)** : passage du SM-2-maison à **FSRS** (Free Spaced Repetition
  Scheduler, modèle DSR). Demande user. **Moteur pur** dans `engine.js` : `fsrsR`/`fsrsIntervalDays`/
  `fsrsNextInterval`/`fsrsInitS`/`fsrsInitD`/`fsrsNextD`/`fsrsSuccS`/`fsrsFailS`/`fsrsSchedule` + `easeToD`.
  Formules **FSRS-5** (19 poids par défaut, DECAY=-0.5, FACTOR=19/81) — **vérifiées mot pour mot vs
  ts-fsrs** par revue adversariale. Courbe R(t,S)=(1+F·t/S)^DECAY ; intervalle I=(S/F)·(Rd^(1/DECAY)-1)
  (à Rd=0.9, I=S). `S`=stabilité (jours), `D`=difficulté (1-10). **10 tests dédiés** (`tests/fsrs.test.mjs`,
  valeurs connues + propriétés) → 53 tests. **DEF_SET** += `scheduler:"fsrs"` (défaut), `fsrsRetention:0.9`.
  **app.js** : `applyAnswer` bascule sur `ST.set.scheduler` ('fsrs'/'legacy') ; en FSRS note binaire
  juste→Good(3)/faux→Again(1) ; `eff()` expose `S`,`D` ; échec = re-vu en session (i=0,d=today) comme legacy.
  **Migration NON destructive** (paresseuse, au 1er passage FSRS d'une carte existante) : `S ← itv`,
  `D ← easeToD(ease)` ; les due existantes ne sont pas réécrites ; le stage (exercice) évolue comme avant.
  **Journal `ST.rlog`** (compact `[date,id,note,elapsed]`, FIFO **RLOG_CAP=10000** ≈400 Ko pour ne pas
  casser la sauvegarde cloud GitHub ~1 Mo) → part dans `exportPayload` (state:ST) pour **fit hors-ligne
  des poids perso** (optimiseur Python, routine mensuelle du mainteneur). `undoLast` retire l'entrée de
  journal annulée (`UNDO.rlogLen`) ; `logAnswer` garde-fou `r.iLegacy||0` ; `loadState`/`applyImportedState`
  init `rlog:[]`. **Toggle Réglages** « 🧠 Algorithme » (FSRS/Classique, pas de reload) + « Rétention cible ».
  **Rollback = repli 'legacy' en un clic** (S/D restent inertes). Vérifié preview (défaut fsrs, carte neuve
  S₀=3.173, migration, échec, journal, undo, repli legacy, effet rétention) + **revue adversariale 2 lentilles**
  (formules EXACTES ; 3 correctifs : undo orphelin, plafond journal 40000→10000, rlog init import). CACHE `sori-v53`.
  ⏳ Phase B (~3-4 sem.) : fitter les poids perso depuis `rlog` de l'export cloud. Piège connu : boss fight
  (révision anticipée) est compté par FSRS (le legacy le neutralisait) — correct pour FSRS, à surveiller.
- **v52 (retour au deck SIMPLE : split recto/verso désactivé, l'inversé redevient un exercice alternatif)** :
  doute user (juste) — le split (v51) **doublait le deck (~15k cartes) pour un gain marginal** (le suivi
  séparé reconnaissance/production ne vaut pas ×2 la charge pour un débutant). `DEF_SET.reverse` → **false**
  (défaut). Migration UNE FOIS dans `loadState` (`if(s.reverseMig!==1){ s.set.reverse=false; s.reverseMig=1 }`)
  → bascule l'utilisateur v51 vers OFF, puis le toggle Réglages reste libre. Le code recto/verso reste
  **dormant** (réactivable via le toggle). **Nouvelle échelle carte-unique** (branche `reverse OFF` du
  dispatch) : niv 1 = QCM KR→FR · niv 2 = production FR→KR + 1re syllabe · **niv 3+ = alternance ~50/50
  production (sans aide) / sens inversé (compréhension KR→FR)** + hangul au sommet → l'inversé est un
  exercice ALTERNATIF testé à parité, SANS doubler les cartes. Les états verso (ST.items[…␞]) de v51
  restent orphelins/inertes (ALL_IDS=BASE_IDS). Vérifié preview : ALL_IDS=7997, migration one-time,
  dispatch 2 sens à parité au niv 3, 0 erreur. CACHE `sori-v52`. 43 tests.
- **v51 (recto/verso : compréhension et production en cartes séparées à maîtrise indépendante — Phase 2, RETIRÉ en v52)** :
  demande user. Chaque **MOT** a désormais 2 cartes : **recto** (compréhension KR→FR, id de base, état
  `ST.items[id]` — INCHANGÉ, score préservé) et **verso** (production FR→KR, id = base + `REV` (U+241E),
  état `ST.items[id+REV]`). Les phrases n'ont pas de verso. Mécanisme : `SEED_BY_ID` augmenté d'un seed
  verso par mot (partage kr/fr, stage/itv/due=0, enemy/kit=false, rev=true) ; `BASE_IDS`/`REV_IDS` ;
  `ALL_IDS = base(+verso si ST.set.reverse!==false)` → **tout le moteur (buildQueue/selectDue/pickNew)
  gère les verso sans réécriture**. Helpers `isRev`/`baseId`/`mateOf`/`introduceCards`. **Résolutions via
  `baseId`** : audio (`speak`), trivia/glose/cefr (`showTrivia`), note du récap SESSFAIL. `distractors`
  puise dans `BASE_IDS` (exclut la base de la réponse pour un verso → pas de doublon). **Dispatch** : verso
  = QCM FR→KR(1)→rappel+syllabe(2-3)→sans aide(4+)/hangul ; recto mot = QCM KR→FR(1)→rappel du sens(2+).
  Pill « 🔄 production » / « 👂 compréhension ». **Introduction CONJOINTE** (`introduceCards` : paires
  recto+verso) — mots neufs = les deux ensemble ; backlog (recto déjà connu) = verso seul, progressif.
  **Stats** : compteurs/barres via `baseItems` (pas ×2) ; « à réviser » et « deck abordé » corrects.
  **Réglage** `reverse` (DEF_SET, défaut TRUE) toggle Réglages → `location.reload()` (ALL_IDS figé au load).
  Migration : score de compréhension jamais touché ; production = compétence neuve, démarre à 0 (honnête).
  ⚠️ **DOUBLE la charge de révision** à terme (rollout limité par newPerDay). Vérifié en preview
  (14944 cartes, dispatch 2 sens, maîtrise indépendante, save/restore, reverse-off=v50, dico sans doublon)
  + **revue adversariale 4 lentilles** (2 bugs corrigés : SESSFAIL note & openPlacement cefr via baseId).
  CACHE `sori-v51`. 43 tests. Rollback instantané = réglage reverse OFF.
- **v50 (échelle d'exercices raccourcie — on atteint le rappel vite)** : retour user « trop de temps
  sur l'introduction (QCM) ». Le QCM couvrait 3 stades ; le principe pédagogique (le RAPPEL fait
  apprendre, pas la reconnaissance) veut qu'on y arrive vite. Nouveau dispatch dans `renderReview` :
  **MOTS** — stade 1 = QCM (KR→FR) · 2-3 = rappel + 1ʳᵉ syllabe (production FR→KR, amorti sur 2 stades
  pour ne pas brutaliser les cartes existantes) · 4+ = rappel sans aide (+ 25% rappel inversé du sens,
  saisie hangul au sommet). **PHRASES** — 1 = QCM · 2+ = construction word-bank (+35% rappel du sens à
  partir du stade 4). `exoQcmFr2Kr` n'est plus appelé (gardé pour la Phase 2 recto/verso). Migration :
  stades stockés inchangés (le score est préservé) ; les cartes déjà montées voient un exercice plus
  dur — c'est voulu. Impact mesuré sur la sauvegarde user : 100 mots stade 2 + ~180 stade 3 passent au
  rappel-indicé, pas au rappel sec. Vérifié en preview stade par stade. CACHE `sori-v50`. 43 tests.
  ⏳ Phase 2 (v51) : séparer recto (compréhension KR→FR) / verso (production FR→KR) en 2 cartes à
  maîtrise indépendante (`ST.rev` store), introduites ensemble ; fwd = `ST.items` existant (score gardé).
- **v49 (retrait du test de niveau)** : suite au choix user (« le supprimer »). Retiré le bouton
  `#goplc` « 🎯 Évaluer mon niveau » du lanceur + son câblage `onclick=openPlacement`. `placement.js`
  reste **chargé mais dormant** et `openPlacement()` reste défini (réactivable : re-ajouter le bouton).
  Les barres « maîtrise par niveau » (v48) remplacent le test one-shot. `ST.placement` (déjà écrit chez
  les users l'ayant passé) devient inutilisé, non lu. CACHE `sori-v49`.
- **v47 (retrait de l'UI de mise de côté — le batch a fait son job)** : user « le nettoyage a
  fonctionné, vire les machins, et pas de "Trop dur" ». Retirés : bouton `🚫 Trop dur` de la carte,
  section `🎚️ Niveau` des Réglages (🧹/↩︎), helpers `cleanAboveLevel/countAboveLevel/restoreSuspended/
  suspendedCount/isAboveLevel/userBandIdx/BAND_IDX`, CSS `.rev-actions`. **CONSERVÉ (mécanisme invisible)** :
  le flag `sus` (`eff().sus`), l'exclusion dans `buildQueue`, le saut à l'affichage (`if(it.sus){QPOS++…}`)
  et l'exclusion du compteur lanceur (`dueN`). → les ~163 cartes rangées sur le tel du user **restent
  rangées** ; plus aucune UI pour (dé)ranger. Pour réintégrer plus tard (quand il monte en B1) : re-coder
  un `restoreSuspended` (`for id: delete ST.items[id].sus`) ou re-run ciblé. CACHE `sori-v47`.
- **v46 (mettre de côté les cartes trop dures — réversible)** : le fix v44 empêche d'*introduire*
  des cartes trop dures mais celles **déjà en rotation** (phrases B1 lancées quand `newPerDay` était à
  100) reviennent comme échues. Ajout d'un flag `sus` sur l'état d'item (`eff().sus`), exclu de
  `buildQueue` (`.filter(it=>!it.sus)`) et sauté à l'affichage même dans une session sauvegardée
  (`if(it.sus){QPOS++;…}`). **Bouton `🚫 Trop dur`** dans l'en-tête de révision (range + avance).
  **Réglages → section 🎚️ Niveau** : `🧹 Ranger les cartes au-dessus de mon niveau (N)` =
  `cleanAboveLevel()` (suspend tout item `eff().stage>=1` dont `BAND_IDX[cefr] > placement.idx`,
  défaut A2) + `↩︎ Réintégrer` = `restoreSuspended()`. **Piège corrigé** : compter/ranger via
  `eff(id).stage` (pas `ST.items[id].s`) — une carte peut être en rotation via le seed Anki SANS delta.
  Le compteur du lanceur (`dueN`) exclut aussi les rangées. Vérifié (seed simulé A2) : 163 B1+ rangées,
  file = A1/A2 seulement, réintégration = 163. CACHE `sori-v46`.
  ⏳ Reste (proposé) : découpage mot-à-mot des phrases sur la carte.
- **v45 (bouton Quitter sur la révision)** : `leaveReview()` (saveSess + retour accueil, session gardée) ;
  bouton `✕ Quitter` dans `.rev-head`, exempté du cooldown (`.escbtn`). CACHE `sori-v45`.
- **v44 (introduction des nouvelles cartes par niveau — le plus simple/fréquent d'abord)** :
  `engine.pickNew` accepte un 4e param optionnel `rankOf(item)→number` ; tri = rank croissant, puis
  kit, puis id (rétro-compatible : sans rankOf, comportement inchangé). `app.js` fournit `newRank` :
  `LVL_RANK{A1:1…C1:5}*10 + (type==='phrase'?5:0)` → **A1 avant C1, mots avant phrases**, niveau
  inconnu = rang B1. Utilisé dans `buildQueue` ET `learnMoreQueue`. **Motivation (retour user)** : un
  débutant (A2) recevait des phrases de grammaire B1 (`theme b1::grammaire`) en désordre id —
  incompréhensibles (traduction de phrase entière sans décomposition, mots inconnus). Désormais on
  monte du bas. Vérifié : 100 premières nouvelles = 100 % A1, 0 phrase. CACHE `sori-v44`.
  ⚠️ Le réglage utilisateur `newPerDay` reste dans SON état (non modifiable par le code) — conseiller ~10-15.
  ⏳ Reste à discuter : rendre les PHRASES décomposables (breakdown mot-à-mot sur la carte, pas juste la
  traduction globale) — les items `phrase` n'ont pas de `gl` ; ce serait un chantier de contenu.
- **v43 (nav repensée : 3 onglets + accueil-lanceur)** : bottom-nav **Réviser · Exercices · Progrès**
  (au lieu de Réviser/Écoute/Voyage/Stats). `render()` route review→renderReview, exercices→
  **renderExercices** (nombres + simulations regroupés), progres→`renderStats` (défaut/accueil).
  **Dictionnaire** sorti dans une icône **🔍 de l'en-tête** (`wireDico`/`openDico`, overlay `.modal.wide`,
  accessible partout). **Accueil = lanceur** : `renderStats` commence par une carte « ▶ Réviser · N
  cartes » (N = dues + nouvelles restantes) + « 🎯 Évaluer mon niveau », PUIS countdown + métriques.
  `renderListen`/`renderTrip` conservés mais non routés (réactivables). CACHE `sori-v43`.
- **v42 (élagage + révision illimitée)** : retour user « l'app doit être utile ». **Ajouté** : bouton
  « ➕ Apprendre 10 nouvelles cartes » sur l'écran fin-de-session (`learnMoreQueue`) — introduit des
  cartes stage 0 À LA DEMANDE avec VRAIE progression (au-delà du plafond `newPerDay`), répétable →
  « réviser autant que je veux ». **Retiré** (code/modules gardés, réactivables) : entraînement libre
  (`bonusQueue` remplacé) ; boss fight (bouton fin-de-session) ; kit voyage / phrases isolées + drill
  (renderTrip → dico + simulations only) ; écoute passive (player) + compréhension QCM/dictée
  (renderListen → **nombres uniquement**). Onglets restants : Réviser · Écoute=nombres · Voyage=dico+
  simulations · Stats. CACHE `sori-v42`.
- **v41 (liste officielle AVANCÉ — COMPLÈTE)** : +588 mots officiels C1, deck 7409→7997. **La liste
  graduée officielle 국립국어원/TOPIK est couverte à ~100 %** (6640/6642). Distribution finale :
  A1 848 / A2 1462 / B1 2866 / B2 1957 / **C1 864**. Recette R22 terminée (débutant+interm.+avancé).
- **v40 (liste officielle INTERMÉDIAIRE)** : +2960 mots officiels B1/B2, deck 4449→7409. **Fix** :
  `merge_gloss.py` rendu agnostique du nombre de lots (glob au lieu de `NB=30` — sinon >30 lots = gloses tronquées silencieusement).
- **DÉPLOIEMENT = GitHub ACTIONS (plus le build legacy)** : le build Pages « legacy » (Jekyll) hangait
  sur ce repo (~140 Mo, 8000+ fichiers). On a basculé sur un **workflow Actions** :
  `.github/workflows/pages.yml` (checkout → `upload-pages-artifact path:docs` → `deploy-pages`), et
  `build_type` Pages = `workflow` (mis via `PUT /repos/.../pages -d '{"build_type":"workflow"}'`).
  Chaque push sur main déclenche le run « Deploy Pages ». **Piège** : l'étape `deploy-pages` renvoie
  souvent « Deployment failed, try again later » (bug flaky de l'action) → **re-lancer le run**
  (`POST /repos/.../actions/runs/<id>/rerun`), ça passe en 1-2 essais. NE créer qu'UN run à la fois
  (les runs concurrents se bloquent). `docs/.nojekyll` reste (hygiène). Le token PC a le scope `workflow`.
- **v39 (LISTE OFFICIELLE + recalibrage)** : intégration de la liste graduée officielle 국립국어원/TOPIK
  (source : `raw.githubusercontent.com/julienshim/combined_korean_vocabulary_list/master/results.tsv`,
  6642 mots, colonnes word/pos/hanja/nikl_level(초급/중급)/topik_level(A/B/C)). **Mapping officiel→CEFR**
  (on GARDE 5 bandes) : 초급+A=A1 ; 초급 autre & (∅+A)=A2 ; 중급+A/B/∅ & ∅+B=B1 ; 중급+C=B2 ; ∅+C=C1.
  **Recalibrage** : ~1946 de nos mots re-taggés sur leur niveau OFFICIEL (`EXTRA.cefr`). **Vague débutant** :
  +699 mots officiels A1/A2 manquants (workflow `sori-officiel-debutant` : l'IA produit fr/ex/exFr/note/conj,
  `kr`+`cefr` FIXES officiels), chaîne complète (merge_wave→gloss→audio→intégrité). Deck 3750→4449.
  Distribution : A1 848 / A2 1462 / B1 1172 / B2 691 / C1 276. **Reste ~2773 중급 (intermédiaire) + avancé
  à couvrir** (recette R22, par vagues). `cefr` provenance mixte : officiel (recalibré/vague) ou modèle.
- **v38** : examen `placement.js` repensé en **RAPPEL + auto-évaluation** (montre KR → Révéler → « Je
  savais »/« Je ne savais pas », ZÉRO hasard) au lieu du QCM (validable par élimination). `makeQuestion` retiré.
- **v37** : 1re version de `placement.js` (QCM adaptatif). Popin d'explication sur les tuiles de Stats (v36).
- **v32 (vague 7)** : **+617 items neufs** (deck 3133 → 3750), chaîne complète nourrie (recette R21).
  Domaines inédits (voyage, mode, argent, logement, politique, finance, environnement, 사자성어,
  onomatopées) + phrases. Distribution CEFR : **A1 480 / A2 1264 / B1 1244 / B2 603 / C1 159**.
- **v31 (vague 6)** : **+581 items neufs** (deck 2552 → 3133), chaîne complète nourrie (recette R21,
  `merge_wave.py` désormais agnostique du nombre de cellules). Ciblé B1/B2/C1 + phrases situationnelles.
- **v30 (vague 5)** : **+398 items neufs** (deck 2154 → 2552), ciblés par niveau, chaîne COMPLÈTE
  nourrie (data + trivia ex/exFr/note/conj + `cefr` + glose `gl` + MP3 mot + MP3 phrase). Recette
  **R21** (`merge_wave.py`).
- **v29** : **niveau CEFR sur tous les items** (`EXTRA[id].cefr`, recette R20 — estimation modèle) =
  fondation invisible pour l'estimation de niveau + le ciblage de contenu. **Stats dégamifiées** : XP
  total et niveau 급 retirés (tuiles + fin de session) au profit de « cartes maîtrisées » et « deck
  abordé » ; `ST.xp` continue en coulisse.
- **v28 (UX)** : Réglages sortis dans une **surcouche `openSettings()`** (roue ⚙️ du header), plus dans
  `renderStats()`. **Gamification en veille** : quêtes/badges (`SHOW_QUESTS`) et bilan de niveau
  (`SHOW_EXAM`) gardés en code mais non rendus (drapeaux en tête d'app.js, données préservées).
  Auto-sauvegarde cloud **à chaque fin de bloc** (throttle 5 min, `ST.lastCloudTs`). Restauration
  protégée par une confirmation **à minuteur** (`confirmRestore`).
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
| `exam.js` | `SORI_EXAM.renderCard(container, {items, extra, speak, history, onFinish, onExit, random})` + `pure.buildExam / summarize / gradeOf / availability` | `renderStats()`. Historique = `ST.exams` (lecture seule), résultat ajouté par app.js via `onFinish(r)` (qui pose la date et `save()`) | **ZÉRO effet sur la planification** — rien ne va vers engine.js, aucun stage/itv/due ne bouge. Zéro localStorage. RNG injectable (tests). Deck étudié < 20 questions possibles ⇒ bouton remplacé par un message. **Masqué depuis v28** (`SHOW_EXAM=false` en tête d'app.js — module chargé, `ST.exams` intact ; repasser à `true` pour réafficher). **3 PROFILS** choisis sur la carte (`beginner` 🌱 A1-A2 thèmes a2:: seulement, strates 5/5/2 ; `standard` 🎯 A2-B1 tout le deck, le bilan classique ; `advanced` 🔥 B1+ stage ≥ 3, thèmes b1/b2 pondérés ×2, distracteurs `conf` sans cadeau) — le profil n'est PAS dans l'API, il vit dans le module. **Chrono 10 min optionnel** : ne bloque JAMAIS l'examen, il CONSTATE le dépassement. **Champs ADDITIFS** sur le résultat : `profile` et `timeSec`/`overtime` (une entrée `ST.exams` sans `profile` compte comme `standard`). **Rétrocompat prouvée** : `buildExam(items, rnd)` (2 args) === `buildExam(items, rnd, "standard")`, même flux RNG. |
| `quests.js` | `SORI_QUESTS.renderCard(container, {today, log, state, onClaim, compact})` + `pure.dailyQuests / questProgress / claimable / badges` | 2 endroits (fin de session `renderReview()` `compact:true` ET `renderStats()` complet), **tous deux gardés par `SHOW_QUESTS`** | **Masqué depuis v28** (`SHOW_QUESTS=false` en tête d'app.js — module chargé, `ST.qdone` intact ; repasser à `true` pour réafficher). Zéro localStorage. Réclamation → `onClaim(questId, bonusXp)` : app.js pose `ST.qdone.ids[id]=true` et crédite l'XP. **Ids de quêtes et de badges ÉTERNELS** (P11). Retour prévu SOUS FORME DE CÉLÉBRATION (animation/son), pas un bloc statique. |
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
| `cefr` | **Niveau CEFR** (v29) `A1`/`A2`/`B1`/`B2`/`C1` — **présent sur TOUS les items du deck** (les ~380 sans autre trivia ont une entrée EXTRA minimale `{"cefr":…}`). Rempli par `merge_levels.py` (recette R20). **Estimation par modèle** (workflow `sori-niveaux`, grille de fréquence + calibrage), PAS une liste officielle TOPIK — provenance à garder en tête pour toute « estimation de niveau ». Fondation de l'estimation adaptative et du ciblage de contenu. Distribution v32 : A1 480 · A2 1264 · B1 1244 · B2 603 · C1 159. |

Règle éditoriale : une entrée existante qui a déjà un `ex` n'est **jamais écrasée** (contenu
déjà vérifié) ; seuls `conj`, `gl` et `cefr` peuvent y être ajoutés.

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
| `lastExport` | date du dernier export (manuel OU cloud) | Sert au secours fichier ; le bandeau de rappel de Stats se base désormais sur `lastCloud`. |
| `lastCloud` | date de la dernière sauvegarde cloud réussie | Affichage « dernière sauvegarde » + bandeau de rappel Stats (silencieux si < 7 j). |
| `lastCloudTs` | **v28** — timestamp ms de la dernière tentative d'auto-backup | Throttle de l'auto-sauvegarde **par bloc** : `autoCloudBackup()` ne repart que si `Date.now() - lastCloudTs > 5 min`. Champ additif racine (pas dans `set`) ; absent ⇒ traité comme 0. |

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
- [ ] 4. Si le réglage a une UI : ajoute le contrôle dans **`openSettings()`** (app.js — la
      surcouche ⚙️, plus `renderStats()` depuis v28) sur le modèle des existants — `<label>` +
      handler `onchange` qui fait `ST.set.maClé = …; save();` (le handler doit interroger `set`,
      l'élément de la carte, pas le document).
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
manipuler de fichier : le cloud sauvegarde ET restaure tout seul. Les boutons vivent dans la
**surcouche Réglages** (`openSettings()`, ouverte par la roue ⚙️ du header — depuis v28, plus dans
`renderStats()`). L'export/import fichier est un SECOURS hors-ligne (replié dans un `<details>`).

- [ ] 1. **Sauvegarde (côté app)** : `cloudBackup()` pousse le payload complet (§3.5) via l'API
      GitHub dans `exports/latest.json` (écrasé) + `exports/sori-export-AAAA-MM-JJ.json` (daté).
      Déclenchée par le bouton ☁️ ET automatiquement (`autoCloudBackup()`) **à chaque fin de bloc**
      (Réviser, boss, Écoute) avec un **throttle de 5 min** via `ST.lastCloudTs` (v28 — avant : 1×/jour).
      Jeton `sori-gh-token`, local au téléphone, jamais exporté.
- [ ] 2. **Restauration (côté app)** : bouton **↓ Restaurer** → `cloudRestore()` : télécharge
      `exports/latest.json`, vérifie `app === "sori"` + `state` présent, puis **confirmation à
      MINUTEUR** `confirmRestore(when, loss)` (v28) : modale rappelant ce qui sera perdu, bouton
      **Confirmer grisé ~5 s** (compte à rebours visible), **Annuler cliquable à tout instant**
      (clic hors carte = annuler). Sur confirmation → `applyImportedState(data.state)` — MÊME
      migration douce que le chargement (`Object.assign({}, DEF_SET, s.set)`, conteneurs par
      défaut) : une sauvegarde ancienne reste valide à vie ; l'overlay se ferme.
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

### R20 — Classer/fusionner les niveaux CEFR (`EXTRA[id].cefr`)

**Principe.** Chaque item du deck porte un niveau CEFR (`A1`/`A2`/`B1`/`B2`/`C1`) dans `EXTRA[id].cefr`.
C'est la **fondation** de l'estimation de niveau (examen adaptatif) et du ciblage des vagues de
contenu. **Estimation par modèle** (workflow `sori-niveaux`), PAS une liste officielle TOPIK :
à traiter comme un signal solide mais approximatif — toute UI qui l'expose doit dire « estimation ».

- [ ] 1. **Préparer l'entrée** : un script écrit `[{i,id,kr,fr,type,domain}]` par item (domain =
      thème SANS son préfixe de niveau, pour ne pas biaiser le jugement), découpé en lots
      `in_<b>.json` (lus par CHEMIN). Le préfixe de thème a2/b1/b2 est un simple héritage d'écriture,
      pas un calibrage — on re-juge le mot sur sa fréquence réelle.
- [ ] 2. **Lancer le workflow `sori-niveaux`** (30 lots × ~72 items) : stage `Classer` écrit
      `cls_<b>.json = [{id,cefr}]` ; stage `Calibrer` relit et corrige (rabaisse les mots trop
      hauts, monte les rares) vers `ver_<b>.json`. Grille ancrée sur la FRÉQUENCE (pas la longueur),
      règle « en cas de doute, bande la plus basse ».
- [ ] 3. **Fusionner** : `python tools/merge_levels.py <dossier_lvl_out>`. Préfère `ver_<b>`,
      retombe sur `cls_<b>`, valide `cefr ∈ {A1,A2,B1,B2,C1}`, **crée une entrée EXTRA minimale**
      pour les items sans trivia. Garde-fou d'ids. Lis la sortie : `créés/mis à jour`, `lots
      manquants`, **la distribution** (une majorité A1-B1, B2 minoritaire, C1 exceptionnel = sain ;
      si tout part en B1/B2 → le calibrage a surestimé, relance le stage Calibrer).
- [ ] 4. Idempotent : re-lançable, met à jour `cefr` sans toucher `ex`/`gl`/`note`. Bump `CACHE`,
      `node --test tests/` (37 vert), release → **R7**. (Invisible dans l'app tant qu'aucune UI ne
      lit `cefr` — c'est une donnée de fondation.)

### R21 — Ajouter une VAGUE DE CONTENU RICHE (toutes les features nourries)

**Principe.** Chaque nouvel item DOIT nourrir TOUTE la chaîne, sinon on crée des trous (un mot sans
audio, une phrase sans glose, un item sans niveau faussent les stats/évaluations). L'orchestration
(vague 5, +398 items) enchaîne 5 étapes ; `tools/merge_wave.py` fait le cœur.

- [ ] 1. **Liste anti-doublon** : écrire `existing_kr.json` (tous les `kr` du deck) que les agents
      lisent pour ne pas régénérer un mot présent.
- [ ] 2. **Workflow `sori-contenu-vN`** (cellules niveau × domaine) : chaque agent génère N items
      NEUFS `{fr, kr, type, theme, cefr, ex, exFr, note?, conj?}` (theme = `<niveau>::<domaine>`,
      kr en forme dico pour verbes/adj), stage `Verifier` = relecture native + anti-doublon +
      calibrage niveau → `ver_<k>.json`. Pondérer les cellules vers les bandes MINCES (cf. la
      distribution `cefr`) pour la validité des évaluations.
- [ ] 3. **`python tools/merge_wave.py <dir_cells> pack-AAAA-MM-vN`** : dédup (kr vs deck + interne),
      écrit `tools/packs/<nom>.json`, régénère `data.js` (garde-fou d'ids), fusionne
      `ex/exFr/note/conj/cefr` dans `extra.js`, émet `new_ex_ids.json` (ids neufs avec `ex`).
- [ ] 4. **Gloses** (R19) sur les nouvelles phrases : construire l'entrée depuis `new_ex_ids.json`
      (ou « items EXTRA avec `ex` mais sans `gl` »), workflow `sori-gloses-vN`, `merge_gloss.py`.
- [ ] 5. **Audio** (R3) : `python tools/make_audio.py` (mots + phrases) — relançable, ne génère que
      les nouveaux `<id>.mp3` et `<id>-ex.mp3`, régénère `AUDIO`/`AUDIO_EX`.
- [ ] 6. **Contrôle d'intégrité OBLIGATOIRE** : pour chaque id neuf, vérifier data + `cefr` + `ex` +
      `gl` (aligné) + MP3 mot (∈ AUDIO) + MP3 phrase (∈ AUDIO_EX) = **zéro trou**. Puis `node --check`
      les JS, `node --test` (37 vert), bump `CACHE`, release → **R7**. Commit incluant les `.mp3`.

### R22 — Combler la LISTE OFFICIELLE (niveaux authentiques, par vagues)

**Principe.** La couverture cible est la liste graduée officielle (국립국어원 NIKL + TOPIK). On la
récupère, on **recalibre** nos mots présents sur leur niveau officiel, et on **génère les manquants**
par vagues — le mot ET son niveau sont fournis (autorité), l'IA ne produit que le contenu pédagogique.

- [ ] 1. **Récupérer la liste** : `curl -L https://raw.githubusercontent.com/julienshim/combined_korean_vocabulary_list/master/results.tsv`
      (6642 mots ; colonnes rank/word/pos/hanja/expl/nikl_level/topik_level). Sans clé API.
- [ ] 2. **Mapping officiel→CEFR** (5 bandes, cf. §1 v39) : 초급+A=A1 ; 초급 autre=A2 ; 중급+A/B/∅=B1 ;
      중급+C=B2 ; ∅(hors NIKL)+C=C1 ; ∅+A=A2 ; ∅+B=B1. Nettoyer les mots (retirer digits homonymes,
      exclure 접사/조사/어미).
- [ ] 3. **Recalibrer** : pour chaque item du deck dont `kr` (ou base sans 하다) est dans la liste,
      écrire `EXTRA[id].cefr` = niveau mappé. (~1946 mots à la v39.)
- [ ] 4. **Générer les manquants** (par niveau, débutant→haut) : workflow `sori-officiel-<niveau>`,
      entrée `{word,pos,hanja,expl,cefr}` par lot ; l'agent produit `{fr,kr(=word),type:word,theme,
      cefr(=fourni),ex,exFr,note?,conj?}`. Puis chaîne **R21** (merge_wave → gloss R19 → audio R3 →
      intégrité). Reste à faire après v39 : ~2773 mots 중급 (intermédiaire) + l'avancé.

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

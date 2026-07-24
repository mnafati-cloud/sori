# CLAUDE.md — Sori : brief opérationnel

## Le projet en 5 lignes
Sori est une PWA **vanilla JS** (zéro dépendance, zéro build, zéro backend) de révision de coréen FR⇄KR,
remplaçante d'Anki pour **UN SEUL utilisateur**, sur **SON téléphone Android**.
Prod : **https://mnafati-cloud.github.io/sori/** — GitHub Pages sert le dossier `docs/` de la branche `main`.
La progression vit **dans le localStorage du téléphone** (clé `sori-state-v1`), avec pour seuls filets l'export manuel OneDrive et la sauvegarde cloud quotidienne (dépôt privé `sori-data`) : le repo est sans état, une release ratée se répare par un revert, mais une progression perdue est irrécupérable.
Manuel complet (contrats de données, recettes pas-à-pas, pièges vécus) : **`MAINTENANCE.md`** — lis-le avant toute modification non triviale. Événements : **`MAINTENANCE-EVENTS.md`**. Algorithme adaptatif : **`ALGORITHM.md`**.

## RÈGLES D'OR — à ne JAMAIS violer
1. **Ne jamais casser le schéma localStorage `sori-state-v1`.** Ne renomme jamais la clé. Ne change jamais la sémantique de `s`/`i`/`d`/`e`/`ok`/`ko`. Additif seulement : un nouveau réglage = une nouvelle clé dans `DEF_SET` (engine.js) **ET la mise à jour du test contractuel `tests/engine.test.mjs` (assert.deepEqual sur DEF_SET) dans le MÊME commit** — la migration douce de `loadState()` fait le reste. `DEF_SET` actuel = `{newPerDay:12, kitFirst:true, rate:0.9, listenN:10, sessionMax:120, mute:false, autoplay:true, adaptive:false, typing:false, report:false, exaudio:false, wordgloss:false, reverse:false, scheduler:"fsrs", fsrsRetention:0.9, grade4:true, fsrsPersonal:true, aura:"auto"}` (`fsrsPersonal` = poids FSRS ajustés aux données de l'utilisateur, cf. MAINTENANCE v81 ; toggle rollback vers les génériques. `aura` = halo de difficulté en révision : "auto"/"always"/"never", v136).
2. **Un id est ÉTERNEL — tous les ids.** Items du seed (`docs/data.js`), événements (`events-data.js`, clés de `ST.evDismiss`), quêtes et badges (`quests.js`, clés de `ST.qdone`), scénarios (`scenarios-data.js`, clés de `ST.scen`) : ne jamais changer, réutiliser ni supprimer un id existant. La progression du téléphone ne référence le contenu que par id.
3. **Ne jamais pousser `tools/snapshot.anki2` ni `sori-export-*.json`.** Données personnelles, repo PUBLIC. Ils sont dans `.gitignore` — ne l'affaiblis jamais. Les exports lus depuis le cloud `sori-data` (recette R15) ne doivent JAMAIS finir dans un repo.
4. **`node --test tests/` doit être 100 % vert avant chaque push** (37 tests minimum : 20 engine + 17 adaptive). En plus : `node --check` sur chaque JS de `docs/` modifié (la CI le fait sur tous). Un test rouge = tu ne pousses pas, point.
5. **Bump `CACHE` dans `docs/sw.js`** (+1, ex. `sori-v18` → `sori-v19`) à chaque release qui touche `docs/`. Fichier JS/CSS ajouté dans `docs/` = aussi l'ajouter à `ASSETS` dans sw.js. Ne JAMAIS retirer l'exclusion du cache `"sori-audio-store"` dans `activate` (c'est l'audio hors-ligne téléchargé par l'utilisateur).
6. **`docs/engine.js` = logique pure, contractuelle.** Aucun accès DOM, `window`, ou localStorage dedans. `computeAnswerLegacy` est **GELÉ À VIE** (référence phase 1 + shadow — ne le modifie sous aucun prétexte). Le reste se modifie uniquement via la recette R6 de MAINTENANCE.md (tests d'abord).
7. **Ne jamais éditer à la main les fichiers générés** : `docs/data.js` (par `tools/build_data.py`), `docs/audio/index.js` + les `.mp3` (par `tools/make_audio.py`), `docs/extra.js` (par `merge_extra.py`/`merge_pack.py` ou la recette R2). Nouveau contenu → packs `tools/packs/*.json` (recettes R1/R11).
8. **Toujours tester en local avant de pousser** : serveur local + une carte de chaque onglet (Réviser, Écoute, Voyage, Stats) + les modules touchés (checklist §7 de MAINTENANCE.md).
9. **Ne jamais conseiller ni déclencher « Effacer les données du site »** sur le téléphone : cela détruit le localStorage, donc toute la progression.
10. **Dans le doute : ne pousse pas.** Demande, ou fais moins.

## Architecture — les couches et LE pattern
```
Couche 1  docs/engine.js       moteur pur (planification legacy GELÉE + adaptative, file,
                               distracteurs, ease) — testé sous Node, contractuel
Couche 1b MODULES autonomes    themes.js · events.js · search.js · exam.js · quests.js ·
                               player.js · scenarios.js · typing.js · numbers.js ·
                               placement.js (test de niveau adaptatif) — voir pattern
Couche 2  docs/app.js          UI + exercices + audio + import/export + cloud backup/restore +
                               son (WebAudio) + annulation + rapports 🐞 + Réglages en surcouche
                               (⚙️ header → openSettings) — SEUL fichier qui lit/écrit
                               localStorage "sori-state-v1". Gamification en veille : drapeaux
                               SHOW_QUESTS/SHOW_EXAM en tête (quêtes/bilan masqués, modules gardés)
Couche 3  contenu généré       data.js (SEED ~2154 items) · extra.js (EXTRA : trivia ex/exFr/
                               conj/note + gloses mot-à-mot `gl`) · audio/*.mp3 (mot `<id>.mp3`
                               + phrase `<id>-ex.mp3`) + audio/index.js (AUDIO + AUDIO_EX) ·
                               + données éditées :
                               events-data.js (EVENTS_DATA) · scenarios-data.js (SCENARIOS)
Couche 4  état                 localStorage téléphone : "sori-state-v1" (progression),
                               "sori-theme" (themes.js), "sori-gh-token" (jeton cloud) —
                               jamais dans le repo
```
**LE PATTERN MODULE CONTRACTUEL** (la convention du projet — tout nouveau module s'y conforme) :
- IIFE double environnement : `module.exports` sous Node ET `root.SORI_X` dans le navigateur — la partie pure (`SORI_X.pure`) est testable sans DOM ;
- exemple canonique récent : `numbers.js` (entraîneur de nombres à l'oreille) — `SORI_NUMBERS.pure` = convertisseurs nombre→hangul (sino/native/price/time/date/quantity) + `makeExercise`, tous purs ; `renderCard` branché dans `renderListen()` d'app.js ;
- **ZÉRO accès localStorage** dans le module (seule exception : themes.js et SA clé `sori-theme`) — l'état entre et sort via `opts` et des callbacks (`onClaim`, `onDismiss`, `onFinish`, `setBest`…) que `app.js` branche sur `ST` ;
- l'intégration se fait **UNIQUEMENT dans app.js** (un bloc `if(window.SORI_X){...}` dans le render de l'onglet) — l'app doit marcher si le module ou ses données sont absents ;
- le CSS est injecté par le module (préfixe `.module-*`, une seule fois) en n'utilisant QUE les variables `:root` de style.css ; tout texte passe par `esc(...)`.

**Ordre de chargement (docs/index.html, NE PAS le changer)** :
`<head>` : style.css → themes.css → **themes.js** (avant le rendu : zéro flash de thème) ;
fin de `<body>` : `data.js → extra.js → audio/index.js → player.js → engine.js → events-data.js → events.js → search.js → exam.js → scenarios-data.js → scenarios.js → quests.js → typing.js → numbers.js → app.js` → enregistrement du service worker.
Règle : les `*-data.js` avant leur moteur, tous les modules avant `app.js`, `engine.js` avant `app.js`.

## Carte du repo
```
docs/                 l'app servie telle quelle par GitHub Pages
  index.html          coquille + ordre de chargement des scripts
  app.js              couche application — seul accès à sori-state-v1 (UI, exercices, audio,
                      son WebAudio, annulation, rapports 🐞, import/export, cloud backup+restore)
  engine.js           moteur pur contractuel (legacy gelé + ease adaptatif)
  style.css           styles de base (variables :root)   themes.css + themes.js  4 thèmes
  data.js             SEED généré (~7997 items ; voir SEED.meta.counts)  extra.js  EXTRA (~7471 phrases
                      d'exemple avec gloses `gl` ; niveau `cefr` sur tous — liste officielle 국립국어원/TOPIK ~100%)
  audio/              MP3 natifs mots `<id>.mp3` (7997) + phrases `<id>-ex.mp3` (7471) ~254 Mo + index.js
  .github/workflows/pages.yml  déploiement Pages via GitHub Actions (upload-pages-artifact + deploy-pages)
  events-data.js + events.js       événements (countdown/message/challenge)
  search.js           dictionnaire FR⇄KR + choseong      exam.js  bilan TOPIK-lite (3 profils + chrono)
  quests.js           quêtes du jour + badges            player.js  écoute passive MediaSession
  scenarios-data.js + scenarios.js  simulations dialoguées
  typing.js           saisie hangul (production tapée, stage 5, opt-in ST.set.typing)
  numbers.js          entraîneur de nombres à l'oreille (prix/heures/dates/quantités, onglet Écoute)
  conversation.js     conversation IA en coréen (STT navigateur → LLM Anthropic/OpenAI → TTS) ;
                      clés API dans localStorage "sori-conv-cfg" (JAMAIS dans ST/export cloud)
  placement.js        test de niveau ADAPTATIF (escalier par bande cefr → estimation CEFR/TOPIK)
  .nojekyll           DÉSACTIVE Jekyll sur GitHub Pages (obligatoire : 7000+ fichiers → builds fiables)
  sw.js               service worker network-first (CACHE à bump)   manifest.json, icônes
  design/             pages de test autonomes (events-test, quests-test, exam-test,
                      search-test, player-test, theme-test, typing-test, numbers-test,
                      variant-a/b/c) — pas dans ASSETS
tools/                scripts de build Python :
  build_data.py       seed depuis snapshot.anki2 + KIT + packs ; garde-fou anti-perte d'ids INTÉGRÉ
  merge_pack.py       intègre une vague de contenu (pack + regen + trivia) — recette R11
  make_audio.py       MP3 edge-tts, relançable : mots (`<id>.mp3`) + phrases (`<id>-ex.mp3`, `--ex`)
  merge_gloss.py      fusionne les gloses mot-à-mot du workflow 'sori-gloses' dans extra.js (recette R19)
  merge_levels.py     fusionne les niveaux CEFR (workflow 'sori-niveaux') dans extra.js (recette R20)
  merge_wave.py       intègre une VAGUE de contenu riche : data + trivia + cefr en une passe (recette R21)
  merge_extra.py      fusionne un lot de trivia          make_icons.py  icônes (chemins OK)
  packs/              packs de contenu durables (*.json, ids pack-hash, fusionnés à chaque regen)
  packs-staged/       RÉSERVE : packs prêts mais non activés (actuellement vidée — voir README)
tools/snapshot.anki2  collection Anki figée, GITIGNORÉE — n'existe que sur cette machine.
                      Sans elle, build_data.py ne tourne pas. Ne jamais la supprimer.
tests/                engine.test.mjs (20, verrouille le legacy) + adaptive.test.mjs (17, ease)
.github/workflows/ci.yml   CI : node --test + node --check sur tous les JS de l'app
ALGORITHM.md          spec complète de l'ease adaptatif (constantes, phases, critères §7)
MAINTENANCE.md        LE manuel : contrats de données, recettes R1-R22, pièges P1-P12, checklist
MAINTENANCE-EVENTS.md recette R10 complète (gérer les événements)
PROPOSITIONS.md       backlog historique d'évolutions
```

## Commandes clés
```bash
# Serveur local (puis ouvrir http://localhost:8123)
python -m http.server 8123 --directory docs

# Tests du moteur (OBLIGATOIRE avant push) — 37 tests
node --test tests/

# Syntaxe de tous les JS de l'app (ce que fait la CI)
for f in docs/*.js docs/audio/index.js; do node --check "$f" || break; done

# Régénérer le seed — écrase docs/data.js ; ABANDONNE tout seul si un id disparaît.
# Ids stables (hash), progression du téléphone intacte. Mettre à jour TODAY (ligne ~16) d'abord.
python tools/build_data.py

# Intégrer une VAGUE DE CONTENU (workflow -> pack + seed + trivia) — recette R11
python tools/merge_pack.py chemin/vers/workflow_output.json pack-AAAA-MM-nom

# Générer les MP3 manquants — pip install edge-tts, réseau requis, relançable
python tools/make_audio.py            # mots + phrases d'exemple
python tools/make_audio.py --ex       # phrases d'exemple seules (<id>-ex.mp3)

# Fusionner les gloses mot-à-mot (sortie du workflow 'sori-gloses') dans extra.js — recette R19
python tools/merge_gloss.py <dossier_gloss_out>

# Fusionner les niveaux CEFR (sortie du workflow 'sori-niveaux') dans extra.js — recette R20
python tools/merge_levels.py <dossier_lvl_out>

# Intégrer une VAGUE de contenu riche (data+trivia+cefr) puis gloses + audio — recette R21
python tools/merge_wave.py <dossier_cellules> pack-AAAA-MM-vN

# Fusionner un lot de trivia seul dans extra.js
python tools/merge_extra.py chemin/vers/lot.json
```
> Avant tout script Python qui affiche du coréen : `export PYTHONIOENCODING=utf-8` (piège P6).

### Push GitHub — la méthode token (si `git push` simple bloque ou demande un mot de passe)
```bash
cd /c/Users/33785/dev/sori
TOKEN=$(printf 'protocol=https\nhost=github.com\n' | git credential fill | sed -n 's/^password=//p')
B64=$(printf 'x-access-token:%s' "$TOKEN" | base64 -w0)
git -c http.extraHeader="Authorization: Basic $B64" push origin main
```
Le token vient du Git Credential Manager déjà configuré (`credential.helper=manager`). Ne jamais
afficher `$TOKEN` dans un log, ne jamais l'écrire dans un fichier du repo.

## Processus de release en 7 étapes
1. `node --test tests/` → 37 tests, tout vert. Sinon STOP.
2. `node --check` sur chaque JS de `docs/` modifié (la CI le refera sur tous — autant l'attraper ici).
3. Si data.js / extra.js / audio / packs touchés : le garde-fou d'ids a tourné dans le build ; valider extra.js (recette R2.2), compter les items (`meta.counts`).
4. Bump `CACHE` dans `docs/sw.js` (+1) ; `ASSETS` à jour si fichier JS/CSS ajouté dans `docs/`.
5. Test local : `python -m http.server 8123 --directory docs` → une carte de chaque onglet + les modules touchés + un export. Console (F12) sans erreur.
6. `git add` ciblé (vérifier avec `git status` : AUCUN .anki2, AUCUN sori-export-*.json) → commit → push (méthode token ci-dessus).
7. Déploiement = **GitHub Actions** (plus le build Pages legacy — voir MAINTENANCE §1). Le push déclenche le run **« Deploy Pages »**. ⚠️ l'étape `deploy-pages` échoue souvent (« Deployment failed, try again later ») → **re-lancer le run** (`POST /repos/mnafati-cloud/sori/actions/runs/<id>/rerun`), ça passe en 1-2 essais ; n'avoir qu'UN run à la fois. Vérifier ensuite `curl -s https://mnafati-cloud.github.io/sori/sw.js | grep CACHE`. Sur le téléphone, le service worker network-first récupère la mise à jour au prochain ouvrir/fermer.

## Réflexes de sécurité
- Si un rebuild de data.js est en jeu : le build ABANDONNE tout seul si un id disparaît — si ça arrive, ne « répare » pas en supprimant le garde-fou, cherche l'id manquant (un pack ou une ligne KIT retirés ?).
- Si extra.js a changé : valider JSON + ids contre le seed (MAINTENANCE.md R2.2).
- `computeAnswerLegacy` (engine.js) ne se modifie JAMAIS. La planification se règle par `TARGET_RETENTION` (bornes [0.78, 0.88]) — jamais `EASE_LOSS` à la main (dérivé).
- Si quelque chose casse en prod : `git revert` + nouveau bump de CACHE (MAINTENANCE.md R9). Jamais de force push, jamais de reset --hard sur du poussé.
- Si une étape échoue et que la doc ne dit pas quoi faire : STOP, ne rien pousser, demander.

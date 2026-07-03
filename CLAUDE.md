# CLAUDE.md — Sori : brief opérationnel

## Le projet en 5 lignes
Sori est une PWA **vanilla JS** (zéro dépendance, zéro build, zéro backend) de révision de coréen FR⇄KR,
remplaçante d'Anki pour **UN SEUL utilisateur**, sur **SON téléphone Android**.
Prod : **https://mnafati-cloud.github.io/sori/** — GitHub Pages sert le dossier `docs/` de la branche `main`.
La progression vit **uniquement dans le localStorage du téléphone** : le repo est sans état, une release ratée se répare par un revert, mais une progression perdue est irrécupérable.
Manuel complet (contrats de données, recettes pas-à-pas, pièges vécus) : **`MAINTENANCE.md`** — lis-le avant toute modification non triviale.

## RÈGLES D'OR — à ne JAMAIS violer
1. **Ne jamais casser le schéma localStorage `sori-state-v1`.** Ne renomme jamais la clé. Ne change jamais la sémantique de `s`/`i`/`d`/`ok`/`ko`. Additif seulement : un nouveau réglage = une nouvelle clé dans `DEF_SET` (engine.js), la migration douce de `loadState()` fait le reste.
2. **Ne jamais changer, réutiliser ou supprimer l'id d'un item existant** dans `docs/data.js`. La progression du téléphone ne référence le contenu que par id. Un id est éternel.
3. **Ne jamais pousser `tools/snapshot.anki2` ni `sori-export-*.json`.** Données personnelles, repo PUBLIC. Ils sont dans `.gitignore` — ne l'affaiblis jamais.
4. **`node --test tests/` doit être 100 % vert avant chaque push.** 20 tests minimum. Un test rouge = tu ne pousses pas, point.
5. **Bump `CACHE` dans `docs/sw.js`** (`sori-v7` → `sori-v8`) à chaque release qui touche `docs/`. Fichier ajouté dans `docs/` = aussi l'ajouter à `ASSETS` dans sw.js.
6. **`docs/engine.js` = logique pure.** Aucun accès DOM, `window`, ou localStorage dedans. Son comportement est contractuel (verrouillé par `tests/engine.test.mjs`) : modification uniquement via la recette R6 de MAINTENANCE.md (tests d'abord).
7. **Ne jamais éditer `docs/data.js` à la main** (fichier généré). Contenu éditorial → `docs/extra.js` (via `tools/merge_extra.py`). Nouveaux items → `tools/build_data.py`.
8. **Toujours tester en local avant de pousser** : serveur local + une carte de chaque mode (Réviser, Écoute, Voyage, Stats).
9. **Ne jamais conseiller ni déclencher « Effacer les données du site »** sur le téléphone : cela détruit le localStorage, donc toute la progression.
10. **Dans le doute : ne pousse pas.** Demande, ou fais moins.

## Architecture en 10 lignes
```
Couche 1  docs/engine.js   moteur pur (planification, file, distracteurs) — testé sous Node, contractuel
Couche 2  docs/app.js      UI + exercices + audio + import/export — SEUL fichier qui lit/écrit localStorage
Couche 3  contenu généré   docs/data.js (SEED, par tools/build_data.py) · docs/extra.js (trivia, par
                           tools/merge_extra.py) · docs/audio/*.mp3 + index.js (par tools/make_audio.py)
Couche 4  état             localStorage "sori-state-v1" — sur le téléphone SEULEMENT, jamais dans le repo
```
Ordre de chargement (index.html) : `data.js → extra.js → audio/index.js → engine.js → app.js`.
Qui touche quoi : engine.js → recette R6 uniquement · app.js/style.css → libre sous les règles d'or ·
data.js / audio/ → uniquement via les scripts tools/ · extra.js → merge_extra.py ou recette R2 ·
sw.js → bump CACHE + ASSETS, ne jamais revenir à du cache-first.

## Carte du repo
```
docs/            l'app servie telle quelle par GitHub Pages (index.html, app.js, engine.js,
                 style.css, sw.js, manifest.json, data.js, extra.js, audio/, icônes)
tools/           scripts de build Python : build_data.py (seed), make_audio.py (MP3),
                 merge_extra.py (trivia), make_icons.py (icônes — chemin à corriger avant usage)
tools/snapshot.anki2   collection Anki figée, GITIGNORÉE — n'existe que sur cette machine.
                       Sans elle, build_data.py ne tourne pas. Ne jamais la supprimer.
tests/           engine.test.mjs — verrouille le comportement contractuel du moteur
.github/workflows/ci.yml   CI : node --test à chaque push
PROPOSITIONS.md  backlog d'évolutions (25 propositions en 4 vagues) — la feuille de route
MAINTENANCE.md   LE manuel : contrats de données, recettes R1-R9, pièges P1-P8, checklist
```

## Commandes clés
```bash
# Serveur local (puis ouvrir http://localhost:8123)
python -m http.server 8123 --directory docs

# Tests du moteur (OBLIGATOIRE avant push)
node --test tests/

# Régénérer le seed — ATTENTION : écrase docs/data.js entièrement.
# Ids stables (hash), progression du téléphone intacte. Mettre à jour TODAY dans le script d'abord.
python tools/build_data.py

# Générer les MP3 manquants (kit + ennemies) — pip install edge-tts, réseau requis, relançable
python tools/make_audio.py

# Fusionner un lot de trivia dans extra.js
python tools/merge_extra.py chemin/vers/lot.json
```

### Push GitHub — la méthode token (si `git push` simple bloque ou demande un mot de passe)
```bash
cd /c/Users/33785/dev/sori
TOKEN=$(printf 'protocol=https\nhost=github.com\n' | git credential fill | sed -n 's/^password=//p')
B64=$(printf 'x-access-token:%s' "$TOKEN" | base64 -w0)
git -c http.extraHeader="Authorization: Basic $B64" push origin main
```
Le token vient du Git Credential Manager déjà configuré (`credential.helper=manager`). Ne jamais
afficher `$TOKEN` dans un log, ne jamais l'écrire dans un fichier du repo.

## Processus de release en 6 étapes
1. `node --test tests/` → tout vert. Sinon STOP.
2. Si data.js / extra.js / audio touchés : valider le JSON et l'absence d'ids disparus (recettes R1/R2 de MAINTENANCE.md).
3. Bump `CACHE` dans `docs/sw.js` (+1) ; `ASSETS` à jour si fichier ajouté.
4. Test local : `python -m http.server 8123 --directory docs` → parcourir une carte de chaque mode, faire un export.
5. `git add` ciblé (vérifier avec `git status` : AUCUN .anki2, AUCUN sori-export-*.json) → commit → push (méthode token ci-dessus).
6. Vérifier : CI GitHub Actions verte, puis `curl -s https://mnafati-cloud.github.io/sori/sw.js | grep CACHE` montre la nouvelle version (Pages met ~1-2 min). Ouvrir l'app sur le téléphone : le service worker network-first récupère la mise à jour tout seul.

## Réflexes de sécurité
- Si un rebuild de data.js est en jeu : exécuter le garde-fou « ids disparus : AUCUN » (MAINTENANCE.md R1.6) avant tout commit.
- Si extra.js a changé : valider JSON + ids contre le seed (MAINTENANCE.md R2.2).
- Si quelque chose casse en prod : `git revert` + nouveau bump de CACHE (MAINTENANCE.md R9). Jamais de force push, jamais de reset --hard sur du poussé.
- Si une étape échoue et que la doc ne dit pas quoi faire : STOP, ne rien pousser, demander.

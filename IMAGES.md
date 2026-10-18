# Illustrations et rappel visuel — v174

Ce fichier et `tools/images/` sont le point de reprise du projet : aucune
information de la conversation n'est nécessaire pour continuer la bibliothèque.
Style approuvé : **2, trait au pinceau**, blanc chaud et lavis gris sur fond noir,
accent vermillon discret. Toutes les illustrations sont générées, jamais prises
sur le Web. La bibliothèque contient **603 images publiées** : les 3 premières
(우산, 사과, 고양이), puis deux lots de 100 et deux lots de 200 mots distincts.

| Lot | A1 | A2 | B1 | Questions image → coréen | Aides après réponse | Poids WebP |
| --- | --- | --- | --- | --- | --- | --- |
| `a-2026-10-17` (v171) | 71 | 29 | 0 | 86 | 14 | 2,95 Mo |
| `a-2026-10-17-02` (v172) | 34 | 66 | 0 | 78 | 22 | 2,98 Mo |
| `a-2026-10-18` (v173) | 70 | 130 | 0 | 51 | 149 | 6,87 Mo |
| `objects-2026-10-18` (v174) | 11 | 21 | 168 | 114 | 86 | 4,63 Mo |

La bibliothèque complète pèse **17,52 Mo** (17 521 958 octets). Elle ne couvre pas
tout le deck ; les images sont chargées à la demande.

## Comportement dans l'app

Les images sont des variantes de la fiche existante, dans **Réviser** : aucun
nouvel id de carte, aucun intervalle supplémentaire. En mode carte unique,
une occasion de production sur deux peut devenir une question image → coréen,
à partir du niveau 3. La compréhension reste inchangée. La règle est
`(ok + ko) % 4 === 1` sur les tours de production ; appliquer simplement `% 2`
aurait sélectionné toutes les productions. En mode recto/verso, seul le verso
est concerné, une fois sur deux (`% 2 === 0`), à partir du rappel sans indice
(niveau 4 dans ce mode). Les variantes à indice restent telles quelles.

L'image n'est éligible que si son association au **sens et à l'id** est validée
avec `usage: question`. Sans entrée, avec `usage: support`, module absent,
réglage désactivé, erreur réseau, fichier corrompu ou délai de chargement dépassé
(1,6 s), le tour utilise l'exercice habituel. **Aucune carte vide ni pénalité.**
Le bouton « Utiliser le texte » propose aussi ce repli, conservé pour ce tour.
Une réponse déjà affichée reste une correction même si l'image disparaît à la
reprise. Aucun téléchargement de toute la bibliothèque au démarrage.

L'utilisateur écrit en coréen sans traduction ni choix, ou répond oralement avant
de toucher « J'ai répondu à voix haute ». Le clic sur l'image ne révèle rien.
Entrée pendant une composition IME ne soumet pas la réponse. Aucun audio de la
réponse avant la tentative. Après : mot, français, exemple, notes et audio au
toucher. L'image se réduit avec le clavier et après réponse. Le dictionnaire
charge l'image au dépliage ; les autres exercices l'affichent seulement après
réponse pour ne pas donner la solution.

`set.images` est activé par défaut et désactivable dans Réglages. Le mode texte
reste disponible pour l'accessibilité ; l'alt de la question ne donne pas le mot.
Une réussite lexicale ne valide pas les particules ou constructions de phrases.
L'entraînement de phrases existant reste indépendant ; des scènes à décrire
nécessiteraient un corpus et une validation sémantique propres.

## Notation

| Cas | Suite | Planification |
| --- | --- | --- |
| Mot exact / variante explicitement admise | Correction, puis choix de la note | Bien normalement ; Difficile/Facile selon l'effort ressenti |
| « Je ne sais pas » | Réponse immédiate, bouton Encore | Vrai oubli : note 1 |
| Réponse différente | Réponse immédiate et choix oubli / faute de frappe / ambiguïté | Pas de note automatique |
| Oubli confirmé | Encore | Note 1 |
| Faute de frappe confirmée | Auto-évaluation du rappel | Pas de faux oubli imposé par le clavier |
| Autre lexème plausible ou image ambiguë | Correction puis Continuer sans noter | Ni réussite ni échec ; la carte reste due |
| Réponse orale | Correction et auto-évaluation | Même notes que le rappel libre |

Le réglage à deux boutons conserve Encore/Bien ; quatre boutons donnent les
notes 1–4. Aucune note n'est déduite automatiquement de la vitesse. La première
tentative est verrouillée : retaper après correction ne crée pas une réussite.
Le kind `image` a le même plafond 4 que `rec5`, et passe par `afterAnswer`.
Contrairement au kind historique `type` (protection v144), un oubli explicite
sur image n'est **pas** remonté de 1 à 2. FSRS et le moteur legacy ne changent pas.
`tools/fsrs_fit.py` reconnaît `image` comme rappel libre, y compris Difficile.

Une seule note par occurrence ; rechargement et annulation conservent la phase
de correction. Le champ additif `ST.imageReview` contient seulement
`{d,id,p,n,asset,phase}` pour la tentative courante (environ 200 octets), jamais
l'image ou le texte saisi. `rlog` garde son format à 7 champs, avec `kind=image` ;
le codec compact v2 compresse déjà ce champ. `log[jour].imageTypo` et
`imageNeutral` comptent les exceptions. Les rapports incluent l'asset et la phase.
Les exports/imports transportent ces champs sans recopier le catalogue.

## Bibliothèque et pipeline Git

| Fichier | Rôle |
| --- | --- |
| `tools/images/inventory.json` | Source éditable : id, coréen, sens, sujet, usage, réponses et statut |
| `tools/images/style.md` | Prompt de style versionné |
| `tools/images/style-reference.png` | Planche approuvée : utiliser uniquement la colonne 02 |
| `tools/images/generate.py` | Génération payante explicite via API ; produit des candidats |
| `tools/images/pipeline.mjs` | Import, encodage, validation, publication déterministe du manifeste |
| `tools/images/reviews/*.json` | Prompt exact, provenance, hashes, encodage, décision et revue visuelle |
| `tools/images/batches/*.json` | Sélections par niveau, ordre de génération, reprises et revue de chaque sujet |
| `tools/images/review.mjs` | Planche HTML de contrôle à 96, 160 et 512 px, candidats ou assets publiés |
| `docs/images/*.webp` | Assets publics approuvés, 512 × 512, nom contenant leur hash |
| `docs/images-data.js` | Manifeste généré ; ne pas éditer à la main |
| `docs/images.js` | Module d'affichage, comparaison, repli et téléchargement, sans localStorage |
| `.github/workflows/images.yml` | Génération manuelle, lots bornés, résultats en artefacts, aucun déploiement automatique |

Installation reproductible : Node 20, Python 3.12, puis :

```bash
npm ci --prefix tools/images --ignore-scripts
node tools/images/pipeline.mjs status
node tools/images/pipeline.mjs check
```

Sharp est une dépendance **d'outillage seulement**, verrouillée dans
`tools/images/package-lock.json`. L'app reste vanilla, sans build et sans API.
Les candidats et dépendances locales sont ignorés par Git ; la source de style,
les recettes, les décisions et les WebP publiés sont versionnés.

### 1. Préparer le sens

Ajouter une entrée `queued` à l'inventaire en reprenant l'id réel de `data.js`.
Ne jamais identifier une fiche par son seul coréen : 배 ventre et 배 poire ont des
ids différents. Ne pas modifier les ids existants, ni régénérer `data.js`.

`usage: question` exige un objet suffisamment univoque et `accepted` contenant
le mot canonique. Seules les variantes du **même mot ciblé** vont dans `accepted`.
Un autre mot plausible va dans `alternatives` (neutre, pas de crédit automatique).
컵/잔, 밥/쌀/벼 et les mots dont le sens dépend de la couleur nécessitent une
revue explicite ; laisser `usage: support` en cas de doute. `subject` décrit la
forme, le cadrage et les exclusions. Ne pas générer une décoration abstraite
pour en faire artificiellement une question.

### 2. Générer les candidats

La commande ci-dessous est une simulation **gratuite** :

```bash
python tools/images/generate.py --ids 1763266607347 --limit 1
```

Pour appeler l'API, configurer `OPENAI_API_KEY` par le gestionnaire de secrets de
l'environnement puis ajouter `--execute`. Ne jamais mettre la clé dans Git,
dans la ligne de commande ou dans `docs/`. Le modèle par défaut est
`gpt-image-1`, qualité medium, 1024 × 1024, une image par requête, avec la
référence de style jointe. Les prompts et paramètres exacts restent dans le
reçu de génération. Le coût dépend du tarif du fournisseur, pas d'un prix figé
dans ce dépôt. Une image approuvée ne sera pas régénérée sans remettre son
statut à `queued`. Il n'y a **aucun retry payant automatique** ; après un timeout,
vérifier la facturation avant de recommencer.

Depuis GitHub : définir le secret Actions `OPENAI_API_KEY`, ouvrir **Generate
image candidates**, saisir les ids et la limite (1–10), lancer manuellement.
Le workflow n'a que `contents: read` ; il rend un artefact `image-candidates`
conservé 30 jours. Il ne committe rien et n'approuve aucune image. La CI des
push/PR vérifie les fichiers existants sans clé ni génération payante.

Un agent disposant d'un outil de génération peut également utiliser :

```bash
node tools/images/pipeline.mjs prompt 1763266607347
# Fournir ce prompt exact + tools/images/style-reference.png au générateur.
node tools/images/pipeline.mjs import 1763266607347 /chemin/image-generee.png codex-imagegen
```

L'import refuse les planches non carrées, les petites images et les fichiers
invalides. Il effectue seulement une réduction à 512 et un encodage WebP qualité
82, sans recadrage ou retouche du dessin. Cible 20–60 Ko, plafond strict 80 Kio.
Les 603 fichiers actuels ont été générés avec l'outil Codex puis importés
de cette manière. L'API payante n'est pas nécessaire pour tester/publier une
image déjà générée. Son accès réel exige la clé et l'autorisation réseau vers
`api.openai.com` ; ne pas contourner une restriction réseau.

### 3. Examiner, approuver et publier

Inspecter `candidates/<id>-<hash-source>/image.webp` à 512, 160 et 96 px sur les
fonds réels de l'app. Vérifier : objet/sens correct, silhouette entière,
anatomie et usages coréens plausibles, absence de texte/logo, style 2, absence
d'ambiguïté injustifiée. La CI vérifie la technique, **pas le sens de l'image**.
Une autre session/une autre personne peut faire cette revue à partir du dépôt.

```bash
node tools/images/review.mjs a-2026-10-17
# Ouvrir tools/images/candidates/review-a-2026-10-17.html dans un navigateur.
node tools/images/review.mjs a-2026-10-17-02
# Même revue pour le deuxième lot, avec son propre fichier HTML.
node tools/images/review.mjs a-2026-10-18
# Troisième lot : 200 images, avec les revues et usages dans le JSON du lot.
node tools/images/review.mjs objects-2026-10-18
# Quatrième lot : 200 nouveaux mots, priorité A1/A2 puis objets concrets B1.
node tools/images/pipeline.mjs approve ID tools/images/candidates/ID-HASH NOM_RELECTEUR 'Constats visuels et décision pédagogique'
node tools/images/pipeline.mjs check
```

La planche fonctionne aussi après un clone neuf : les entrées approuvées pointent
vers les WebP versionnés. Pour un lot encore en préparation, un fichier local
`candidates/batch-<nom-du-lot>/<id>.json` peut contenir
`{"candidate":"tools/images/candidates/ID-HASH"}` afin d'afficher le candidat.
La planche signale les recettes modifiées et ne donne aucune approbation automatique.

Le lot `a-2026-10-17` est terminé. Ses niveaux viennent de `EXTRA[id].cefr`,
vérifiés avec les ids et sens du SEED. L'ordre commence par les A1. Cinq premiers
dessins ont été repris car leurs couleurs naturelles dominaient ; leurs hashes
et le motif de rejet sont conservés dans le lot. Les recettes suivantes verrouillent
explicitement le blanc chaud et le gris, sans changer le prompt global déjà validé.
Les 14 usages `support` comprennent notamment les agrumes, le riz/repas, le kimchi,
les ramyeon, le kimbap, le dentifrice et le chiot : le dessin seul ne suffit pas à
imposer un lexème précis. Les autres lectures plausibles sont des réponses neutres.

Le deuxième lot `a-2026-10-17-02` est terminé et ne réutilise aucun id du premier.
Il poursuit les objets A1/A2 : aliments, vêtements, mobilier, appareils, transports,
corps et nature. Chaque source a été examinée, puis chaque WebP à 96 et 160 px
sur fond sombre. Les 22 aides comprennent les boissons, la laitue, les aliments
ambigus en monochrome et certains détails du corps. Les autres réponses
plausibles (바지 pour 청바지, 기차 pour 지하철, 베개 pour 쿠션…) sont neutres.
Le cadrage de 다리 a été régénéré ; le hash rejeté et le motif sont conservés.
La génération de 어깨 a été refusée par le fournisseur sans livrer d'image :
la sélection a été remplacée par 달력. L'entrée rejetée et ce remplacement sont
documentés dans le lot, sans compter comme images publiées.

Le troisième lot `a-2026-10-18` ajoute 200 nouveaux sens A1/A2, sans réutiliser
les ids déjà illustrés. Il étend les objets quotidiens, lieux, plats coréens,
activités, parties du corps et phénomènes naturels. Les 200 visuels ont été
examinés en grand format, puis les WebP à 96 et 160 px sur fond sombre ;
`visualReviews` et `displaySizeReviews` conservent les hashes contrôlés.
Les 149 aides couvrent notamment les catégories, les recettes et les sens
impossibles à imposer par une image seule. 도서관, 태권도 et 무궁화 ont été
reclassés en aides après examen. Les réponses voisines plausibles restent
neutres pour les 51 questions. Le cadrage de 허리 a été régénéré : la personne
entière place ses mains à la taille ; le premier hash et son rejet sont conservés.
Les 200 WebP pèsent 6 866 988 octets, avec un maximum de 58 142 octets par image.

Le quatrième lot `objects-2026-10-18` ajoute 200 mots sans réutiliser aucun id
ni mot coréen de l'inventaire existant : 11 A1, 21 A2, puis 168 B1 concrets.
Il privilégie les objets faciles à reconnaître : aliments, animaux, appareils,
ustensiles, vêtements et transports. Ses 114 questions n'acceptent que le mot
ciblé ; les autres lectures plausibles restent neutres. Les 86 aides couvrent
les lieux, parties du corps, plats précis et objets ambigus en monochrome.
La patate douce, le sèche-linge, le cure-dent, le bol à riz et le surligneur
ont été reclassés en aides après examen. Les cadrages du repassage, de
l'humidificateur et du téléphérique ont été régénérés ; les trois hashes rejetés
et leurs motifs sont conservés. Chaque visuel a été examiné en grand format,
puis à 96 et 160 px, avec les hashes source et WebP dans le JSON du lot.
Les 200 WebP pèsent 4 634 388 octets, soit environ 23 Ko par image.

L'approbation copie le WebP sous un nom immuable avec hash, écrit une revue dans
`reviews/`, met à jour l'inventaire et reconstruit le manifeste. La référence de
style partagée est lue et hachée une fois par reconstruction ; chaque asset et
sa revue restent contrôlés individuellement. Pour retirer
une mauvaise image, passer son statut à `rejected`, puis lancer `build` : la
carte revient au texte. Ne jamais réutiliser une URL pour des pixels différents.
Pour changer le sens, le prompt ou les variantes, refaire explicitement la
revue : `check` refuse une validation qui ne correspond plus à l'inventaire.

Versionner ensemble l'inventaire, la revue, l'asset et le manifeste. Bump du
CACHE dans `docs/sw.js` à chaque release. Ne pas ajouter les images à `ASSETS`.
Puis appliquer la release habituelle de `CLAUDE.md` ; le push sur main publie
sur GitHub Pages. Aucun chemin `/workspace`, résultat de chat ou clé n'est
nécessaire pour relancer cette chaîne sur une autre machine.

## Hors connexion et limites

`sori-image-store` survit aux changements de version comme le cache audio.
Chargement à la demande, cache-first sur les URLs avec hash. Les images ne sont
jamais dupliquées dans le cache de version. Un fichier indécodable est évincé ;
la question revient au texte. Les erreurs de quota ne bloquent pas la révision.

Réglages → Télécharger les illustrations prépare les assets validés, vérifie
leur décodage et donne les échecs éventuels. Après un téléchargement complet,
les versions obsolètes sont retirées. Plafond automatique : 1 024 fichiers de
80 Kio maximum (80 Mio) ; le téléchargement global refuse de dépasser ce budget.
Avant une bibliothèque plus grande, prévoir des lots sélectifs et revoir le
budget de stockage Android. Ne jamais vider les données du site du téléphone.

## Vérification avant release

```bash
node tools/images/pipeline.mjs check
node --test tests/*.mjs
for f in docs/*.js docs/audio/index.js; do node --check "$f" || exit 1; done
node tools/images_smoke.cjs
node tools/production_smoke.cjs
node tools/ui_repairs_smoke.cjs
node tools/backup_smoke.cjs
```

Les tests navigateur utilisent Playwright 1.63.0 et Chromium (installation comme
dans la CI). `images_smoke.cjs` couvre IME, résultat avant note, oubli/typo/neutre,
rechargement, annulation, deux/quatre notes, absence de manifeste/module/image,
404, corruption, timeout, navigation pendant le chargement, dictionnaire,
six thèmes, deux tailles mobiles, téléchargement, mise à jour réelle du worker,
préservation du cache audio et mode avion. Les captures sont dans le dossier
ignoré `browser-results/images/`.

Validation v174 : **198 tests Node**, 3 tests Python et les quatre suites navigateur
passent ; les **603 images** sont décodées et leur téléchargement hors ligne est
testé, ainsi que le repli textuel et la préservation des caches lors de la mise à jour.

L'extension du catalogue se poursuit avec l'entrée `queued` restante (주전자),
puis un inventaire explicite des autres objets. Les estimations antérieures de 800–1 200
objets ne constituent pas une classification terminée. Les exercices libres sur
une galerie d'images et les scènes grammaticales sont des extensions distinctes ;
la présente livraison intègre le rappel visuel dans l'exercice principal.

# Production de phrases — v195

Dans **Réviser**, l’utilisateur écrit une phrase entière en coréen à partir d’une
consigne française, sans mots proposés ni structure révélée. Le module est actif
par défaut (`set.production`), indépendant de la saisie d’un mot au niveau 5.

Le corpus contient 50 situations, cinq par objectif : lieu d’une action,
destinataire, addition, restriction, bornes, contraste, condition, but d’un
déplacement, simultanéité et proposition qui précise un nom. Les suffixes sont
expliqués **après** la tentative. Ce corpus ne prétend pas couvrir toute la
grammaire coréenne.

## Correction hors ligne

`docs/production-data.js` décrit les consignes, le vocabulaire requis, les
formulations admises, des confusions précises et leur explication. Les variantes
sont des produits finis de segments explicitement écrits, pas une analyse
générale du coréen. Les espaces entre mots restent significatifs ; NFC, espaces
répétés, virgules et ponctuation déclarative finale sont normalisés.

Depuis v195, le corpus accepte notamment `일을 해요` / `공부를 해요`, leurs
formes en cours d’action (`일을 하고 있어요`), `걸어가요` pour les trajets,
plusieurs positions des compléments et du sujet, les deux ordres d’actions
simultanées et les modifieurs en `고 있는`. Les variantes sont déclarées par
situation : aucune suppression générale des espaces ou des particules, aucun
succès déduit de quelques mots présents dans une phrase.

- Réponse reconnue : le sens de la consigne est validé. Plusieurs registres,
  ordres de compléments et constructions équivalentes sont admis.
- Confusion reconnue : retour ciblé sur la portée ou la relation exprimée.
  Une seconde tentative est possible ; après deux essais erronés, exemple expliqué.
- Toute autre réponse : la réponse proposée et son explication s’affichent
  **immédiatement**, sans clic supplémentaire et **sans note**, jamais déclarée
  fausse. Une faute de vocabulaire non répertoriée suit aussi ce chemin. Les essais
  sauvegardés sur l’ancien écran « non reconnue » affichent aussi la réponse à la
  reprise. Il n’y a aucun appel réseau ou LLM pour évaluer la phrase.

Le premier verdict est conservé avant d’afficher le retour. Une correction après
aide ou après une réponse non évaluée ne devient pas un succès autonome.
« Je ne sais pas » compte comme un besoin de reprise ; « Passer sans note » reste
neutre avant toute erreur identifiée. Après une erreur, le bouton devient
« Arrêter cet essai » et conserve cette première observation.

Une formulation équivalente crédite le même objectif de sens, mais seule sa
forme réellement utilisée est inscrite dans `forms` : par exemple, une réponse
en 밖에 + négation n’atteste pas l’utilisation de 만.

## Révision et progression

Une situation devient disponible quand tous ses mots requis sont au stade 4 ou 5
et non suspendus. Aucune substitution par du vocabulaire inconnu. Quatre phrases
au maximum par jour, une par objectif ; la première ouvre la séance, les suivantes
arrivent après huit réponses ordinaires ou à la fin de la file. Les places prévues
sont déduites du plafond des cartes lors de la construction d’une nouvelle file.
Une ancienne session reste reprenable sans réécriture de ses identifiants.

Les objectifs encore inexplorés passent avant les reprises échues. Les contextes
changent à la prochaine présentation si un autre est disponible. Les intervalles
de réussite sont 1, 3, 7, 14 et 30 jours ; une erreur redescend d’un palier et fait
revenir l’objectif le lendemain. Une réponse non évaluée ne change pas le palier.
Depuis v195, un passage sans note ou une réponse non reconnue au premier essai
laisse une pause de deux jours avant de reproposer cet objectif (`offerAfter`).
Cette date est indépendante de la maîtrise et de `due`. Elle est retirée à la
prochaine tentative notée ; les autres objectifs restent disponibles pendant
la pause. Les anciennes observations ne sont pas reclassées rétroactivement.
Le panneau **Construire sans aide** de Progrès présente les dix objectifs,
réussites autonomes, reprises et formes effectivement produites.

## Contrat d’état

`docs/production.js` est un module IIFE Node/navigateur, sans stockage. Seul
`app.js` écrit le nouvel objet additif `ST.production` :

- `v:1`, `seq` : version du schéma et identifiant de tentative ;
- `skills` : dix objectifs, compteurs, palier, prochaine date, dernier contexte,
  au plus trois contextes réussis et six formes attestées par objectif ;
- `day` : jour, nombre de places consommées, objectifs déjà proposés, compteur
  d’espacement entre phrases ;
- `active` : situation en cours, premier verdict, tentatives, étape et retour
  codé. Une copie du seul objectif concerné permet d’annuler la dernière note ;
- `recent` : au plus 32 observations compactes, sans réponse textuelle ni copie
  du corpus.

Depuis v195, `active.reason` et les nouvelles entrées de `recent.reason`
distinguent l’action terminale : `recognized` (réponse évaluée correcte),
`unrecognized` (hors corpus), `revealed` (exemple demandé), `skipped` (passage
volontaire), `attempts-exhausted` (deux erreurs identifiées), `legacy-unverified`
(reprise d’un ancien écran v166). `outcome` conserve la notation fondée sur le
premier essai : `recognized` après une première erreur reste donc `incorrect`.
Les entrées historiques sans `reason` restent inchangées et ambiguës ; ne pas
les assimiler à des réponses erronées ou à des passages volontaires.

Recharger conserve le premier verdict et la correction affichée. Le texte en
cours de saisie reste dans la vue et n’est pas enregistré. Annuler une note
restaure l’objectif et retire l’observation, sans rendre une réponse déjà vue
éligible au rappel autonome du même jour. Les transitions terminales sont
idempotentes. Une tentative commencée avant minuit reste reprenable.

La progression des cartes (`items`), leurs dates, FSRS et `rlog` restent séparés.
Les exports v1 et la compaction v2 transportent l’objet tel quel. La simulation
d’un an vérifie que cet état reste sous 10 Ko. Un schéma futur ou l’absence du
module désactive cette intégration sans effacer son état ni bloquer les cartes.
Les deux fichiers sont dans le précache du service worker.

## Validation et maintenance

```bash
node --test tests/*.mjs
for f in docs/*.js docs/audio/index.js; do node --check "$f" || exit 1; done
NODE_PATH=<installation-playwright>/node_modules node tools/production_smoke.cjs
NODE_PATH=<installation-playwright>/node_modules node tools/backup_smoke.cjs
```

Les tests vérifient toutes les variantes et confusions du corpus, ainsi que des
phrases indépendantes, les espaces, la portée, les équivalents, l’absence de
faux échec, la reprise, les limites, l’annulation et les sauvegardes. Le test de
la vraie PWA couvre IME, huit cartes intercalées, rechargement, mode avion,
réglage, six thèmes et écrans mobiles étroits. Le test de sauvegarde effectue
l’export/import réel et la restauration cloud simulée avec un essai en cours.

Pour ajouter un contenu : conserver éternellement les ids existants, ajouter les
variantes dans le corpus et des exemples indépendants dans les tests. Une nouvelle
confusion ne doit être déclarée incorrecte que si **toute** la phrase reconnue
contredit la consigne ; ne jamais déduire un échec de la seule absence d’un suffixe.

# MAINTENANCE-EVENTS.md — R10 : Gérer les événements

> Complément de `MAINTENANCE.md` (mêmes règles de prudence : suis la checklist à la lettre,
> si une étape échoue et que ce manuel ne dit pas quoi faire, arrête-toi et ne pousse rien).
>
> **Le fait central** : un événement (compte à rebours, bannière, défi) n'est QUE de la donnée.
> Gérer les événements = éditer **UN SEUL fichier**, `docs/events-data.js`. Le moteur
> (`docs/events.js`) et l'app (`docs/app.js`) ne se touchent pas. L'app fonctionne parfaitement
> avec **zéro** événement actif — un tableau vide `[]` est un état normal, pas un bug.

---

## R10.0 — Comment ça marche (1 minute de lecture)

```
docs/events-data.js   window.EVENTS_DATA = [ {événement}, ... ]   ← LE fichier à éditer
        │
        ▼
docs/events.js        moteur autonome (jamais à modifier pour gérer un événement)
  • pur    : SORI_EVENTS.pure.activeEvents(data, today)   → filtre from <= today < to, trie
             SORI_EVENTS.pure.eventProgress(ev, today, log) → J-x / avancement du défi
  • rendu  : SORI_EVENTS.renderCards(container, {today, log, dismissed, onDismiss})
             → des .card dans l'écran Stats ; 0 événement actif = RIEN de rendu
        │
        ▼
docs/app.js           appelle renderCards dans renderStats() ; persiste le « masquer »
                      dans ST.evDismiss = {id:true} (progression téléphone — intouchable)
```

**Cycle de vie automatique** : un événement apparaît le jour `from`, disparaît le matin du
jour `to` (le jour `to` est EXCLU — un countdown vers le départ s'éteint le matin du départ,
et c'est le moment où l'événement suivant peut prendre le relais avec `from` = ce même jour).
Personne n'a besoin de « nettoyer » : un événement passé est invisible, il peut rester dans
le fichier comme trace, ou être retiré plus tard.

---

## R10.1 — Les invariants (à ne JAMAIS violer)

| Règle | Pourquoi |
|---|---|
| Dates au format ISO `"AAAA-MM-JJ"` uniquement | C'est ce que comparent `activeEvents` et le journal `ST.log`. Autre format = événement silencieusement ignoré. |
| Visibilité = `from <= aujourd'hui < to` (`to` EXCLU) | Contrat du moteur, verrouillé par la page de test. Ne « corrige » jamais ça en incluant `to`. |
| `id` unique, et **jamais réutilisé** même après retrait | Le masquage utilisateur (`ST.evDismiss` sur SON téléphone) est indexé par id. Un id recyclé hériterait du masquage de l'ancien événement — la nouvelle carte n'apparaîtrait jamais. |
| L'app doit marcher avec `window.EVENTS_DATA = []` | C'est l'état par défaut entre deux événements. Ne pars jamais du principe qu'il y a « au moins un » événement. |
| `docs/events-data.js` ne contient QUE des données | Aucune fonction, aucun accès DOM/localStorage. La moindre logique va dans `events.js` (et là, ce n'est plus la recette R10 — demande d'abord). |
| Un `type` inconnu est ignoré sans crash | C'est voulu (compat avant/arrière). Ne l'« améliore » pas en erreur bloquante. |
| Additif seulement dans les structures | Ajouter un champ optionnel à un type : OK. Renommer/supprimer un champ existant ou changer son sens : NON (des données déjà poussées le référencent). |

---

## R10.2 — Les 3 types v1 (exemples copiables)

### Type `countdown` — compte à rebours (J-x + barre de progression + jalons)

La date **cible** est `to` (jour J = jour `to`). Affiche « J-x », une barre de progression
de `from` vers `to`, et le jalon atteint le plus récent.

```js
  { id: "seoul-2026", type: "countdown",
    from: "2026-07-01", to: "2026-10-01",
    title: "Départ pour Séoul", emoji: "🇰🇷",
    milestones: [
      { at: 90, label: "J-90 — le kit voyage commence maintenant" },
      { at: 30, label: "J-30 — objectif : tout le kit au niveau 4+" },
      { at: 7,  label: "J-7 — drill audio tous les jours !" },
    ] },
```

| Champ | Obligatoire | Signification |
|---|---|---|
| `milestones` | non | Jalons `{at, label}` : le `label` s'affiche dès que joursRestants ≤ `at`. Plusieurs atteints → le plus petit `at` gagne. |

### Type `message` — bannière simple pendant une période

```js
  { id: "post-voyage", type: "message",
    from: "2026-10-01", to: "2026-10-22",
    title: "En Corée !", emoji: "🎒",
    text: "Mode terrain : le kit voyage est ton ami." },
```

### Type `challenge` — objectif chiffré, progression lue dans le journal

La progression est calculée automatiquement depuis `ST.log` (le journal quotidien), sur les
jours `[from, to)`. `goal` contient **exactement une** clé :

| Clé de `goal` | Compte quoi |
|---|---|
| `reviews` | total de réponses (somme des `n` du journal) |
| `ok` | total de bonnes réponses |
| `listen` | total de réponses du mode Écoute |
| `days` | nombre de jours actifs (≥ 1 réponse) |

```js
  { id: "defi-sept-2026", type: "challenge",
    from: "2026-09-01", to: "2026-10-01",
    title: "Défi de septembre", emoji: "🏁",
    text: "500 réponses avant le départ.",
    goal: { reviews: 500 } },
```

---

## R10.3 — Ajouter un événement (checklist)

- [ ] 1. Ouvre `docs/events-data.js`. Choisis un des 3 types ci-dessus et copie l'exemple
      dans le tableau `window.EVENTS_DATA` (une virgule après l'objet précédent).
- [ ] 2. Donne-lui un `id` **neuf** : minuscules-tirets, parlant, jamais vu dans l'historique
      git de ce fichier. Vérifie : `git log -p --all -- docs/events-data.js | grep "mon-id"`
      → aucune occurrence.
- [ ] 3. Renseigne `from`/`to` en ISO. Rappel : visible de `from` inclus à `to` **exclu**.
- [ ] 4. Valide la syntaxe : `node -e "const w={};new Function('window',require('fs').readFileSync('docs/events-data.js','utf8'))(w);console.log(w.EVENTS_DATA.length,'événements OK')"`
- [ ] 5. Vérifie l'unicité des ids : `node -e "const w={};new Function('window',require('fs').readFileSync('docs/events-data.js','utf8'))(w);const ids=w.EVENTS_DATA.map(e=>e.id);if(new Set(ids).size!==ids.length)throw 'ID EN DOUBLE';console.log('ids uniques OK')"`
- [ ] 6. Teste visuellement → **R10.6**.
- [ ] 7. Release → recette **R7** de MAINTENANCE.md (bump `CACHE` dans sw.js, tests, push).

## R10.4 — Modifier un événement

- [ ] 1. Modifier `title`, `emoji`, `text`, `milestones`, `goal`, ou repousser `to` : libre.
- [ ] 2. **Ne change PAS l'`id`** (sinon c'est un nouvel événement : le masquage utilisateur
      de l'ancien ne s'applique plus — parfois c'est voulu, alors retire l'ancien ET crée
      un nouvel id, ne « recycle » jamais).
- [ ] 3. Changer le `type` d'un événement existant = interdit. Retire l'ancien, crée-en un neuf.
- [ ] 4. Valide + teste + release comme en R10.3 (étapes 4 à 7).

## R10.5 — Retirer un événement

- [ ] 1. Supprime son objet du tableau (ou laisse-le : passé sa date `to`, il est invisible —
      le supprimer n'est qu'une question de propreté du fichier).
- [ ] 2. **N'utilise JAMAIS son `id` pour un futur événement** (invariant R10.1).
- [ ] 3. Valide + teste + release comme en R10.3 (étapes 4 à 7).

## R10.6 — Tester (page de test dédiée)

- [ ] 1. Serveur local :
      ```bash
      python -m http.server 8198 --directory docs
      ```
- [ ] 2. Ouvre **http://localhost:8198/design/events-test.html** : la page charge les VRAIES
      données + le VRAI moteur + le VRAI style, et rend les cartes à plusieurs dates simulées
      côte à côte, avec une batterie de checks automatiques en haut.
      **Attendu : « TOUT VERT »** (le titre de l'onglet commence par ✔).
- [ ] 3. Pour vérifier TON nouvel événement : ajoute un panneau dans le tableau `PANELS` de
      la page de test avec une date à l'intérieur de sa fenêtre `[from, to)` (et une juste
      après `to` pour vérifier sa disparition). Ces ajouts peuvent rester : la page de test
      n'est pas servie par l'app.
- [ ] 4. Vérifie aussi l'app elle-même : http://localhost:8198 → onglet **Stats** → la carte
      apparaît si l'événement est actif AUJOURD'HUI (sinon, c'est normal qu'il n'y ait rien).
- [ ] 5. Console navigateur (F12) : aucune erreur.

---

## R10.7 — Trois idées d'événements futurs, prêtes à copier

**1. Retour de voyage — révision « souvenirs »** (réactiver ce qui a servi sur place) :

```js
  { id: "souvenirs-2026", type: "message",
    from: "2026-10-22", to: "2026-11-15",
    title: "De retour — ancre tes souvenirs", emoji: "📸",
    text: "Les phrases que tu as VÉCUES en Corée sont en mémoire fraîche : c'est maintenant qu'elles se gravent. Refais le drill du kit voyage cette semaine." },
```

**2. Défi 30 jours** (régularité — un jour actif = au moins une réponse) :

```js
  { id: "defi-30j-hiver-2026", type: "challenge",
    from: "2026-11-15", to: "2026-12-20",
    title: "Défi 30 jours", emoji: "🔥",
    text: "30 jours actifs sur 35 — la régularité bat l'intensité.",
    goal: { days: 30 } },
```

**3. Événement saisonnier — 설날 (Nouvel An lunaire coréen)** :

```js
  { id: "seollal-2027", type: "countdown",
    from: "2027-01-15", to: "2027-02-07",
    title: "설날 — Nouvel An coréen", emoji: "🌕",
    milestones: [
      { at: 14, label: "새해 복 많이 받으세요 — apprends à le souhaiter !" },
      { at: 3,  label: "J-3 — thème famille + politesse au menu" },
    ] },
```

> ⚠️ La date de 설날 change chaque année (calendrier lunaire) — vérifie-la avant de créer
> l'événement de l'année visée (2027 : le 7 février ; mets `to` au jour de la fête).

---

## R10.8 — Ce qui n'est PAS couvert par cette recette

- **Ajouter un nouveau TYPE d'événement** : c'est une modification de `docs/events.js`
  (une fonction `cardMonType` + une branche dans `renderCards` + éventuellement
  `eventProgress`). Même esprit que la recette R5 de MAINTENANCE.md : classes CSS via le
  préfixe `.event-*` et les variables `:root`, tout texte passé par `esc(...)`, et un type
  inconnu doit RESTER ignoré sans crash. Ajoute des checks dans
  `docs/design/events-test.html` dans le même commit.
- **Toucher au masquage** (`ST.evDismiss`) : c'est du territoire `app.js` / progression
  téléphone → règles d'or de CLAUDE.md, pas cette recette.

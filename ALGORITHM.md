# ALGORITHM.md — Ease adaptatif calibré (v1)

> Spécification implémentable de l'algorithme adaptatif de Sori.
> Base retenue : proposition **« ease »** (SM-2 binaire par item), avec l'intégralité des 8 correctifs
> de sa critique, plus deux emprunts au « thermostat » (compteurs propres `ok1/ko1` pour la mesure,
> cible de rétention exposée comme constante nommée) et un emprunt à « dsr » (garde leech, tests de propriétés).
> Les trois propositions et critiques d'origine sont dans `PROPOSITIONS.md`.

---

## 1. Décision et justification

**Base choisie : « ease » corrigée** — un seul champ additif `e` par item, greffé sur l'échelle de stages
existante, avec `e = 2.2` strictement équivalent au moteur actuel : c'est la seule des trois propositions
dont le pire cas est borné par construction et dont le rollback est un booléen. **Correctifs intégrés** :
cible recalibrée à 83 % (la 87,5 % d'origine faisait saigner toute la collection vers le plancher à la
rétention réelle 76-86 %), règle explicite pour les révisions anticipées du boss fight, échec tardif
atténué, trou `i=0` bouché, crédit de retard généralisé à tous les stages, seed dépollué des re-vus,
plancher stage 5 mis à l'échelle, garde leech. **Compromis assumés** : pas de modèle continu
difficulté/stabilité (dsr — plus précis mais 3 modes de défaillance non bornés, dont l'inflation ×27 en
boss fight) ; pas de régulateur global automatique (thermostat — pour ce profil trous 2-11 j + binge,
le contrôleur est soit gelé soit en panique, et sa cible 88-90 % est inatteignable) ; l'ease reste un
signal qui mélange rappel court et rappel long (limitation connue de SM-2, atténuée par le gel de
session et l'atténuation des échecs tardifs) ; la cible 83 % est un choix manuel, ajusté hors-ligne
sur les exports, pas une boucle fermée.

---

## 2. Le modèle — formules exactes (pseudo-code JS pur pour `docs/engine.js`)

Conventions : dates ISO `'YYYY-MM-DD'`, item = état effectif tel que produit par `eff()` dans
`docs/app.js` : `{ id, stage, itv, due, ok, ko, e? }`. Toutes les fonctions sont **pures**
(aucun accès DOM/localStorage/horloge), exportées dans l'objet `ENGINE` et testables par `node --test`.

### 2.1 Constantes

```js
const EASE_START = 2.2;                 // = multiplicateur actuel → défaut strictement neutre
const EASE_MIN   = 1.3, EASE_MAX = 3.0; // clamp live
const SEED_MIN   = 1.6, SEED_MAX = 2.8; // clamp du seed (plus serré : l'évidence future garde le dernier mot)
const TARGET_RETENTION = 0.83;          // milieu-haut de la bande historique 76-86 %. Bouton manuel, bornes [0.78, 0.88]
const EASE_GAIN  = 0.05;                // succès sur révision espacée comptée
const EASE_LOSS  = Math.round(EASE_GAIN * TARGET_RETENTION / (1 - TARGET_RETENTION) * 1000) / 1000;
                                        // = 0.244 ; équilibre = LOSS/(LOSS+GAIN) = 83 %. UNE seule source de vérité :
                                        // ne JAMAIS éditer EASE_LOSS à la main, seulement TARGET_RETENTION.
const EARLY_RATIO     = 0.75;           // en-dessous de 75 % de l'intervalle prévu = révision anticipée
const LATE_CREDIT_CAP = 2;              // le crédit de retard ne dépasse jamais ×2 le palier / l'intervalle
const MAX_ITV  = 120;                   // plafond existant, inchangé
const S5_FLOOR = 14;                    // plancher stage 5 de référence (mis à l'échelle par e, cf. 2.4)
const LEECH_KO = 8;                     // seuil d'affichage leech
const STEP = {2:1, 3:2, 4:4, 5:8};      // inchangé
```

### 2.2 Helpers

```js
function round2(x){ return Math.round(x * 100) / 100; }
function clampEase(e){ return Math.min(EASE_MAX, Math.max(EASE_MIN, e)); }

// addDays(dstr, n) existe déjà dans engine.js. Ajout symétrique :
function daysBetween(a, b){            // entier de jours signé b - a
  return Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 864e5);
}

// date de la dernière révision NOTÉE, reconstruite sans champ nouveau :
//  - itv >= 1 : la planification a posé due = revue + itv  → revue = due - itv
//  - itv == 0 : l'échec a posé due = jour de l'échec       → revue = due
function prevReviewDate(it){ return it.itv >= 1 ? addDays(it.due, -it.itv) : it.due; }

// ease effective : champ stocké si présent, sinon seed dérivé des compteurs (lazy), sinon neutre
function easeOf(it){
  if (typeof it.e === "number") return clampEase(it.e);
  const n = (it.ok || 0) + (it.ko || 0);
  if (n < 4) return EASE_START;                       // pas assez de données → comportement actuel
  const acc = it.ok / n;                              // ratio POLLUÉ par les re-vus intra-session
  const p = Math.min(1, Math.max(0, 2 - 1 / acc));    // dépollution exacte sous le modèle « chaque échec
                                                      // suivi d'un re-vu réussi » : acc=0.667→p=0.5,
                                                      // acc=0.889→p=0.875 ; acc<=0.5 → p=0 (gère acc=0)
  return round2(Math.min(SEED_MAX, Math.max(SEED_MIN,
    EASE_START + 2.4 * (p - TARGET_RETENTION))));
}

function isLeech(it){                                 // dérivé, jamais stocké
  return easeOf(it) <= EASE_MIN + 0.001 && (it.ko || 0) >= LEECH_KO;
}
```

### 2.3 Planification legacy (gelée)

L'actuel `computeAnswer` (engine.js lignes 23-33) est **renommé `computeAnswerLegacy` et gelé** :
il sert de mode phase 1, de shadow pour la comparaison, et de référence des tests d'équivalence.
Signature et comportement inchangés : `computeAnswerLegacy(it, ok, today) -> {s, i, d}`.

### 2.4 La transition — `computeAnswer` étendu

```js
// computeAnswer(it, ok, today, adaptive) -> { s, i, d, e, counted, early, iLegacy, iAdaptive }
//  - adaptive=false (phase 1) : s/i/d = SORTIE LEGACY BIT-À-BIT ; e et counted sont quand même calculés
//  - adaptive=true  (phase 2) : s/i/d = planification adaptative ci-dessous
//  - counted : true si « révision espacée comptée » (1re présentation notée du jour, non anticipée)
//              → sert au gate de l'ease ET aux compteurs ok1/ko1 du journal
function computeAnswer(it, ok, today, adaptive){

  /* ---- 1. temps réellement écoulé ---- */
  const known   = !!it.due;                                        // item jamais planifié (stage 0 neuf) → false
  const elapsed = known ? Math.max(0, daysBetween(prevReviewDate(it), today)) : 0;
  const late    = Math.max(0, elapsed - (it.itv || 0));            // itv=0 → tout l'écoulé est du retard
  const early   = ok && it.itv >= 1 && elapsed < EARLY_RATIO * it.itv;  // succès anticipé (boss fight)
  const counted = known && elapsed >= 1 && !early;

  /* ---- 2. ease ---- */
  let e = easeOf(it);
  if (ok) {
    if (counted) e = clampEase(e + EASE_GAIN);
    // succès anticipé ou re-vu de session (elapsed=0) : ease GELÉE — pas d'inflation, pas de double peine
  } else if (elapsed >= 1) {
    // échec espacé : perte ATTÉNUÉE par le retard (évidence confondue quand on revient bien après la due)
    const prescribed = Math.max(1, it.itv);
    e = clampEase(e - EASE_LOSS * prescribed / (prescribed + late));
    // à l'heure : ×1 (pleine perte 0.244) ; itv=2 revu à 13 j : ×2/13 ≈ perte 0.038
  }
  // échec en re-vu de session (elapsed=0) : ease gelée
  e = round2(e);

  /* ---- 3. planification legacy (shadow + mode phase 1) ---- */
  const leg = computeAnswerLegacy(it, ok, today);

  /* ---- 4. planification adaptative ---- */
  let s = it.stage, i = it.itv, d = it.due;
  if (ok) {
    if (early) {
      // succès anticipé : AUCUN changement de planification — pas de ratchet de stage,
      // pas d'inflation d'intervalle. Seul le compteur ok bouge (côté app.js).
    } else if (it.stage < 5) {
      s = it.stage + 1;
      const ladder = Math.max(1, Math.round((STEP[s] || 1) * e / EASE_START));  // paliers mis à l'échelle
      // crédit de retard généralisé : survivre à un trou EST la mesure de la courbe d'oubli,
      // crédit = moitié du temps démontré, borné à ×LATE_CREDIT_CAP le palier
      const credit = Math.min(Math.floor(elapsed / 2), LATE_CREDIT_CAP * ladder);
      i = Math.min(MAX_ITV, Math.max(ladder, credit));
      d = addDays(today, i);
    } else {
      // stage 5 : croissance ×e (remplace ×2.2), crédit de retard = +retard/2, borné à ×2 l'intervalle
      const base   = Math.min(2 * it.itv, it.itv + Math.floor(late / 2));
      const floor5 = Math.round(S5_FLOOR * e / EASE_START);        // plancher scalé : 8 j à e=1.3, 14 à 2.2, 19 à 3.0
      i = Math.min(MAX_ITV, Math.max(floor5, Math.round(base * e)));
      d = addDays(today, i);
    }
  } else {
    s = Math.max(1, it.stage - 2); i = 0; d = today;               // chemin d'échec INCHANGÉ (filet de sécurité)
  }

  const chosen = adaptive ? { s, i, d } : leg;
  return { s: chosen.s, i: chosen.i, d: chosen.d, e, counted, early,
           iLegacy: leg.i, iAdaptive: ok ? i : 0 };
}
```

### 2.5 Mesure de rétention (pour Stats et vérification — PAS un contrôleur)

```js
// retention7(log, today) -> { r, n }  — rétention 7 jours glissants sur 1res présentations comptées
// (fenêtre hier → J-7, jamais le jour en cours ; fallback ok/ko pour les jours antérieurs au déploiement)
function retention7(log, today){
  let ok = 0, ko = 0;
  for (let k = 1; k <= 7; k++){
    const d = log[addDays(today, -k)];
    if (!d) continue;
    ok += (d.ok1 !== undefined ? d.ok1 : d.ok || 0);
    ko += (d.ko1 !== undefined ? d.ko1 : d.ko || 0);
  }
  const n = ok + ko;
  return { r: n > 0 ? ok / n : null, n };
}
```

### 2.6 Exports ajoutés à `ENGINE`

```js
const ENGINE = { addDays, daysBetween, computeAnswer, computeAnswerLegacy, easeOf, isLeech,
                 prevReviewDate, retention7, selectDue, pickNew, computeStreak,
                 pickDistractors, shuffle, sample, DEF_SET, STEP,
                 EASE: { EASE_START, EASE_MIN, EASE_MAX, SEED_MIN, SEED_MAX, TARGET_RETENTION,
                         EASE_GAIN, EASE_LOSS, EARLY_RATIO, LATE_CREDIT_CAP, MAX_ITV, S5_FLOOR, LEECH_KO } };
```

### 2.7 Points d'intégration dans `docs/app.js` (~10 lignes)

```js
// eff() : exposer l'ease stockée (peut rester undefined, easeOf gère)
//   ... ok: d.ok||0, ko: d.ko||0, e: d.e,

// applyAnswer : passer le flag, stocker e, transmettre le résultat au journal
function applyAnswer(it, ok){
  const r = ENGINE.computeAnswer(it, ok, todayStr(), ST.set.adaptive === true);
  setItem(it.id, { s:r.s, i:r.i, d:r.d, e:r.e, ok: it.ok+(ok?1:0), ko: it.ko+(ok?0:1) });
  return r;                                   // afterAnswer le passe à logAnswer
}

// logAnswer(ok, kind, r) : compteurs propres + shadow phase 1
//   if (r && r.counted){ if(ok) l.ok1=(l.ok1||0)+1; else l.ko1=(l.ko1||0)+1;
//     if (ok){ l.so=(l.so||0)+r.iLegacy; l.sn=(l.sn||0)+r.iAdaptive; } }

// DEF_SET (engine.js) : + adaptive:false  — la migration douce Object.assign l'ajoute toute seule
```

Le boss fight (`startBoss`, `BONUS=false`) **ne change pas** : c'est `computeAnswer` qui reconnaît
désormais la révision anticipée et la neutralise. Le mode bonus (`BONUS=true`) ne touche toujours rien.

---

## 3. Champs d'état — ADDITIFS uniquement — et migration des 1080 items

| Portée | Champ | Type | Rôle | Fallback si absent |
|---|---|---|---|---|
| Item (`ST.items[id]`) | `e` | float, 2 déc. | ease personnelle | `easeOf()` : seed dérivé de ok/ko, sinon 2.2 |
| Journal (`ST.log[date]`) | `ok1`, `ko1` | int | réponses **comptées** (1re présentation espacée, non anticipée) | `retention7` retombe sur ok/ko |
| Journal (phase 1) | `so`, `sn` | int | sommes des intervalles legacy / adaptatif sur succès comptés (shadow) | ignorés |
| Réglages (`ST.set`) | `adaptive` | bool | phase 2 activée | `false` |

**Migration des ~1080 items : aucune, par construction.** `easeOf()` est un **seed paresseux dérivé** :
tant qu'un item n'a pas reçu de réponse post-déploiement, son ease est recalculée à la volée depuis les
compteurs `ok/ko` déjà stockés ; la première réponse écrit `e` (via `setItem`). Zéro script batch,
zéro réécriture du localStorage au boot, zéro écriture des due existantes.

- Item **neuf** (< 4 réponses) : `e = 2.2` → intervalles identiques au système actuel.
- Item **existant** : seed dépollué `p = clamp01(2 − 1/acc)` puis `e = clamp(2.2 + 2.4×(p − 0.83), 1.6, 2.8)`.
  Exemples : ok=8/ko=8 (acc=0.5 ⇒ p=0, jamais réussi une révision espacée) → **1.6** ;
  acc=0.667 (vrai 50 %) → **1.6** ; acc=0.889 (vrai ~87,5 %) → **2.31** ; acc=1 sur 20 revues → **2.61**.
  Les 79 « ennemies » atterrissent bas, les mots maîtrisés au-dessus de 2.2 — sans liste codée en dur.
- **Rollback** : `ST.set.adaptive=false` restaure la planification actuelle immédiatement (les `e`
  restent stockés, inertes) ; supprimer les champs `e` remet l'état à zéro ; l'ancienne app ignore
  tous les champs nouveaux (export/import compatibles dans les deux sens).

---

## 4. Garde-fous numériques

**Bornes de chaque paramètre :**

| Quantité | Min | Max | Mécanisme |
|---|---|---|---|
| `e` (live) | 1.3 | 3.0 | `clampEase`, arrondi 2 déc. |
| `e` (seed) | 1.6 | 2.8 | clamp dédié — seules les réponses réelles atteignent les extrêmes |
| `TARGET_RETENTION` | 0.78 | 0.88 | manuel (cf. §5) ⇒ `EASE_LOSS` ∈ [0.177, 0.367] |
| `i` sur succès | 1 | 120 | clamp final |
| `i` sur échec | 0 | 0 | inchangé, re-vu en session, `d = today` |
| plancher stage 5 | 8 (e=1.3) | 19 (e=3.0) | `round(14×e/2.2)` — supprime le saut ×2.8 des ennemies |
| crédit de retard (s<5) | 0 | 2× palier | `min(⌊elapsed/2⌋, 2×ladder)` |
| crédit de retard (s=5) | 0 | `base ≤ 2×itv` | `min(2×itv, itv+⌊late/2⌋)` |
| `elapsed` | 0 | — | `max(0, …)` ; `due` absent → 0 (aucun NaN possible) |
| stage inconnu | — | — | `STEP[s] \|\| 1` conservé (garde stage 0 existante) |

**Dynamique honnête** (simulée, pas devinée) : depuis 2.2, **4 échecs espacés pleins** touchent le
plancher 1.3 ; **16 succès comptés** montent au plafond 3.0. Dérive espérée par révision comptée :
+0.001 à p=0.83 (≈ neutre), −0.008 à p=0.80, +0.009 à p=0.86 — bornée à ±0.01/rev sur toute la bande
historique : **la collection ne saigne pas**.

**Trous (2-11 j, profil réel)** : succès après trou → crédit `⌊elapsed/2⌋` à tous les stages
(l'info de survie n'est plus jetée) ; échec après trou → perte × `itv/(itv+late)` (évidence confondue).
Un item échoué dont le re-vu de session n'a pas eu lieu (`i=0`, session interrompue) redevient une
vraie révision comptée dès le lendemain via `prevReviewDate` — **plus de gel à vie**.

**Binge (500 cartes post-trou à ~70 %)** : re-vus de session `elapsed=0` → ease gelée (pas de double
peine ni d'inflation) ; échecs majoritairement tardifs → atténués. Dérive nette du binge type :
**≈ +5 points d'ease cumulés** (contre −35 avec la proposition d'origine) — un jour aberrant ne peut
pas couler la collection.

**Révisions anticipées (boss fight)** : succès avec `elapsed < 0.75×itv` → **no-op complet**
(ni ease, ni stage, ni intervalle, ni due — seul `ok` s'incrémente). Trois boss fights consécutifs ne
font gagner ni stage ni ease. Échec anticipé → reset de stage + perte d'ease (oublier avant l'échéance
est une évidence valide) ; échec le même jour qu'une révision notée (`elapsed=0`) → reset de stage mais
ease gelée. Les révisions anticipées **n'entrent jamais** dans `ok1/ko1` (métrique non biaisée).

**Leech** : `e` au plancher **et** `ko ≥ 8` ⇒ `isLeech()` vrai — affiché à l'utilisateur (badge dans
Stats / liste dédiée) pour retravailler le mnémonique. Pas de suspension automatique en v1.

---

## 5. Le thermostat global : NON retenu comme contrôleur, retenu comme instrument

**Rejeté en boucle fermée**, pour les trois raisons quantifiées de sa critique : (1) cible 88-90 %
inatteignable pour une rétention réelle 76-86 % → le « régulateur » sature à G_MIN en 4-5 jours et
devient une constante ×0.6 (+67 % de charge) ; (2) la fenêtre 7 j re-consomme le même jour de binge
jusqu'à 7 fois ; (3) signal non stratifié (Simpson) : l'injection de vocabulaire neuf masque la
rétention mature et fait osciller le contrôleur. Pour ce profil (trous 2-11 j, binge), il est soit
gelé soit en panique.

**Ce qu'on garde du thermostat :**
- **La mesure propre** : `ok1/ko1` (1res présentations comptées) + `retention7()`, affichée dans Stats
  et exportée — c'est l'instrument de vérification du §7.
- **Le bouton, en manuel** : `TARGET_RETENTION` est LA constante de calage absolu.
  - *Mesure* : rétention comptée sur 30 j depuis l'export JSON, stratifiée par intervalle prévu (<7 j / ≥7 j).
  - *Cadence* : ajustement **hors-ligne, au plus 1×/mois**, par le mainteneur (Claude analyse l'export),
    commit git de la constante — jamais en cours de session, jamais automatique.
  - *Bornes* : `TARGET_RETENTION` ∈ [0.78, 0.88], pas de ±0.02 max par ajustement.
  - *Règle de décision* : rétention comptée < 0.80 sur 30 j **et** charge acceptée → monter à 0.85 ;
    charge/jour intenable → descendre à 0.80. Sinon ne rien toucher.

---

## 6. Plan de tests — `tests/engine.test.mjs` (node:test)

Les tests existants sur `computeAnswerLegacy` restent tels quels (contrat gelé). Nouveaux cas :

**Équivalence et divergences documentées**
1. `e` absent + n<4, révisions **à l'heure** : `computeAnswer(…, true)` ≡ `computeAnswerLegacy` bit-à-bit
   sur toute la grille (s ∈ 0..5, i ∈ {0,1,2,4,8,14,40,120}, succès/échec).
2. `adaptive=false` : s/i/d ≡ legacy sur TOUS les cas, y compris en retard et anticipé (garantie phase 1).
3. Divergence **assumée** en retard au stage 5 (adaptive) : itv=22, revu +4 j, e=2.2 → i=round(24×2.2)=53
   ≠ legacy 48 — le test fige le nouveau comportement (la claim « bit-à-bit » d'origine était fausse ici).

**Clamps et invariants (tests de propriétés, RNG seedé)**
4. Jamais `e` hors [1.3, 3.0] ni non-arrondi ; jamais `i` hors [1,120] sur succès ; échec ⇒ `{i:0, d:today}` ;
   `computeAnswer` ne mute pas son entrée ; aucun NaN pour due absent / stage 0 / itv 0.
5. Monotonie du crédit : à item égal, succès à elapsed2 > elapsed1 ⇒ i(elapsed2) ≥ i(elapsed1), borné ×2.

**Cas pathologiques des critiques**
6. **Gel de session** : deux échecs + re-vus le même jour ⇒ l'ease ne bouge qu'une fois (le premier échec).
7. **Boss fight** : (a) 3 succès anticipés sur 3 jours consécutifs (itv=9) ⇒ s, i, d, e strictement inchangés ;
   (b) succès noté le matin puis échec boss l'après-midi ⇒ stage−2, d=today, ease gelée (elapsed=0).
8. **Trou i=0** : item échoué sans re-vu, revu 10 j après ⇒ `counted=true`, succès ⇒ i = max(palier, min(5, 2×palier)),
   ease +0.05 — plus de gel à vie.
9. **Échec tardif atténué** : itv=2 échoué à 13 j ⇒ perte ≈ 0.244×2/13 ≈ 0.038 ; à l'heure ⇒ 0.244 pleine.
10. **Seed dépollué** : acc=0.5→1.6 ; 0.667→1.6 ; 0.889→2.31 ; 1.0 (n=20)→2.61 ; n<4→2.2 ; `e` déjà présent → intact ; acc=0 sans NaN.
11. **Plancher stage 5 scalé** : e=1.3, graduation i=round(8×1.3/2.2)=5 puis plancher 8 ⇒ plus de saut ×2.8.
12. **Leech** : e=1.3 & ko=8 ⇒ `isLeech` vrai ; e=1.3 & ko=3 ⇒ faux.

**Simulations (Monte-Carlo, RNG seedé, assertions chiffrées)**
13. Dérive : 200 révisions comptées à l'heure — p=0.83 ⇒ |e−2.2| < 0.3 ; p=0.875 ⇒ e ≥ 2.8 ;
    p=0.76 ⇒ e ≤ 1.5 (voulu : mot dur = intervalles courts) **et** leech déclenché si ko ≥ 8.
14. **Charge 90 j profil réel** (1080 items, mélange p ∈ {0.9, 0.8, 0.6}, sessions avec trous uniformes
    2-11 j + binge de rattrapage) : total de révisions comptées ≤ 1.25× la même simulation en legacy,
    et les items p=0.6 reçoivent ≥ 1.3× plus d'expositions que les p=0.9.
15. `retention7` : fenêtre hier→J-7, fallback ok/ko sur anciens jours, `r=null` si fenêtre vide.

---

## 7. Déploiement en 2 phases et vérification sur les exports réels

### Phase 1 — Observation (« ombre »), ~2 semaines (jusqu'à mi-juillet 2026)

Livrer le code complet avec `ST.set.adaptive=false` (défaut). Garanti par le test 2 : **la planification
est bit-à-bit celle d'aujourd'hui**. Pendant ce temps s'accumulent : les `e` (écrits à chaque réponse),
`ok1/ko1` (rétention propre), `so/sn` (intervalles legacy vs adaptatif sur les succès comptés).

**Critères de passage en phase 2** (analyse d'un export JSON) :
- ≥ 300 révisions comptées enregistrées ;
- distribution de `e` cohérente : les 79 ennemies majoritairement < 1.9, écart-type global > 0.2
  (sinon l'adaptativité n'apporte rien), < 15 % au plancher hors leeches ;
- projection de charge `Σsn/Σso` ∈ [0.85, 1.15] (l'adaptatif ne fait pas exploser la pile) ;
- baseline consignée : rétention comptée 7 j/30 j, revues/jour, taille de pile due.

### Phase 2 — Activation

Basculer `ST.set.adaptive=true` (toggle Réglages). Aucune due existante n'est réécrite : le nouveau
calcul s'applique aux réponses au fil de l'eau. Les champs `so/sn` continuent d'être journalisés
(le shadow devient l'audit inverse). Rollback = re-basculer le toggle.

### Vérification que ça marche MIEUX qu'avant (export réel, 30 j post-activation vs baseline phase 1)

| Métrique (calcul depuis l'export) | Cible de succès |
|---|---|
| Rétention comptée 30 j `Σok1/(Σok1+Σko1)` | dans [0.81, 0.85] (cible 0.83 ± 2 pts) — au-dessus de la baseline si elle était < 0.81 |
| Rétention stratifiée, strate intervalle ≥ 7 j | ≥ baseline de la même strate (tue le confondant de composition) |
| Charge : revues comptées/jour (moyenne 30 j) | ≤ 1.15× baseline, tendance décroissante en fin de fenêtre |
| Taux d'échec 30 j des 79 ennemies | en baisse ≥ 5 points vs baseline (plus d'expositions courtes) |
| Intervalle médian des items `e ≥ 2.5` au stage 5 | > médiane baseline des stage 5 (les faciles coûtent moins) |
| Leeches (`isLeech`) | liste ≤ 20 items, remise à l'utilisateur pour retravail mnémonique |

Si après 30 j la rétention comptée sort de [0.78, 0.88] ou la charge dépasse 1.25× : ajuster
`TARGET_RETENTION` selon la règle du §5 (1 seul ajustement, puis re-mesurer 30 j). Si deux ajustements
ne suffisent pas, rollback `adaptive=false` et post-mortem sur l'export — le système actuel reste
intact en dessous, par construction.

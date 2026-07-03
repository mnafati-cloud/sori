/* Sori — events-data.js : LES DONNÉES des événements.
   ══════════════════════════════════════════════════════════════════════
   C'EST LE SEUL FICHIER À ÉDITER pour ajouter, retirer ou modifier un
   événement. Le moteur (docs/events.js) et l'app n'ont jamais besoin de
   changer. Recette complète : MAINTENANCE-EVENTS.md (R10), à la racine.

   INVARIANTS — à respecter à la lettre :
   - Dates ISO "AAAA-MM-JJ". Un événement est visible si
       from <= aujourd'hui < to
     Le jour `to`, il a DISPARU (ex. un compte à rebours vers le départ
     s'éteint le matin même du départ — c'est voulu).
   - `id` : unique dans ce fichier, et JAMAIS réutilisé même après retrait
     (il sert de clé au « masqué par l'utilisateur » stocké dans sa
     progression : un id recyclé hériterait du masquage de l'ancien).
   - Ce fichier ne contient QUE des données. Un tableau vide `[]` est
     parfaitement valide : l'app fonctionne exactement pareil sans
     aucun événement.
   - Un `type` inconnu du moteur est ignoré silencieusement (pas de
     crash) : on peut pousser des données d'un futur type sans risque.

   ── LES 3 TYPES (v1) ────────────────────────────────────────────────

   1) type: "countdown" — compte à rebours (J-x + barre + jalons).
      La date CIBLE du compte à rebours est `to` (jour J = jour `to`).
      `milestones` (optionnel) : jalons {at, label} — le label s'affiche
      dès que joursRestants <= at ; si plusieurs sont atteints, le plus
      récent (le `at` le plus petit) gagne.

      { id: "exemple-countdown", type: "countdown",
        from: "2026-07-01", to: "2026-10-01",
        title: "Départ pour Séoul", emoji: "🇰🇷",
        milestones: [
          { at: 90, label: "J-90 — le kit voyage commence maintenant" },
          { at: 30, label: "J-30 — objectif : tout le kit au niveau 4+" },
          { at: 7,  label: "J-7 — drill audio tous les jours !" },
        ] },

   2) type: "message" — simple bannière informative pendant une période.

      { id: "exemple-message", type: "message",
        from: "2026-10-01", to: "2026-10-22",
        title: "En Corée !", emoji: "🎒",
        text: "Mode terrain : le kit voyage est ton ami." },

   3) type: "challenge" — objectif chiffré sur une période, progression
      lue automatiquement dans le journal quotidien (ST.log).
      `goal` : exactement UNE clé parmi :
        reviews : total de réponses         (somme des `n` du journal)
        ok      : total de bonnes réponses  (somme des `ok`)
        listen  : total de réponses Écoute  (somme des `listen`)
        days    : nombre de jours actifs    (jours avec au moins 1 réponse)
      Seuls les jours de [from, to) comptent.

      { id: "exemple-challenge", type: "challenge",
        from: "2026-09-01", to: "2026-10-01",
        title: "Défi de septembre", emoji: "🏁",
        text: "500 réponses avant le départ.",
        goal: { reviews: 500 } },

   ────────────────────────────────────────────────────────────────────── */
window.EVENTS_DATA = [
  { id: "seoul-2026", type: "countdown",
    from: "2026-07-01", to: "2026-10-01",
    title: "Départ pour Séoul", emoji: "🇰🇷",
    milestones: [
      { at: 90, label: "J-90 — le kit voyage commence maintenant" },
      { at: 30, label: "J-30 — objectif : tout le kit au niveau 4+" },
      { at: 7,  label: "J-7 — drill audio tous les jours !" },
    ] },

  { id: "post-voyage", type: "message",
    from: "2026-10-01", to: "2026-10-22",
    title: "En Corée !", emoji: "🎒",
    text: "Mode terrain : le kit voyage est ton ami." },
];

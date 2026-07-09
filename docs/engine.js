/* Sori — engine.js : moteur pur (planification, sélection, distracteurs).
   AUCUNE dépendance DOM / localStorage / window : ce fichier est chargé
   avant app.js dans le navigateur (root.ENGINE) et testé tel quel sous
   Node (module.exports) via `node --test tests/`.
   Règle d'or : le comportement ici est CONTRACTUEL — il pilote la
   progression stockée en localStorage. Toute modification passe par les
   tests de tests/engine.test.mjs. */
(function(root){
  "use strict";

  /* ================= constantes partagées ================= */
  const DEF_SET = { newPerDay:12, kitFirst:true, rate:0.9, listenN:10, sessionMax:120, mute:false, autoplay:true, adaptive:false, typing:false, report:false, exaudio:false, wordgloss:false, reverse:false, scheduler:"fsrs", fsrsRetention:0.9, grade4:true };
  const STEP = {2:1, 3:2, 4:4, 5:8};   // intervalle (jours) en arrivant à ce stage

  /* ===== ease adaptatif (ALGORITHM.md) — constantes =====
     NE JAMAIS éditer EASE_LOSS à la main : dérivé de TARGET_RETENTION (une seule source de vérité). */
  const EASE_START = 2.2;                 // = multiplicateur actuel -> défaut strictement neutre
  const EASE_MIN   = 1.3, EASE_MAX = 3.0; // clamp live
  const SEED_MIN   = 1.6, SEED_MAX = 2.8; // clamp du seed dérivé
  const TARGET_RETENTION = 0.83;          // bouton manuel, bornes [0.78, 0.88] (cf. ALGORITHM.md §5)
  const EASE_GAIN  = 0.05;
  const EASE_LOSS  = Math.round(EASE_GAIN * TARGET_RETENTION / (1 - TARGET_RETENTION) * 1000) / 1000; // 0.244
  const EARLY_RATIO     = 0.75;           // < 75% de l'intervalle prévu = révision anticipée (boss fight)
  const LATE_CREDIT_CAP = 2;
  const MAX_ITV  = 120;
  const S5_FLOOR = 14;                    // plancher stage 5 de référence (scalé par e)
  const LEECH_KO = 8;

  /* ================= dates ================= */
  function addDays(dstr, n){ const d=new Date(dstr+"T12:00:00"); d.setDate(d.getDate()+n);
    return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
  function daysBetween(a, b){            // entier de jours signé b - a
    return Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 864e5);
  }

  /* ================= ease adaptatif — helpers purs ================= */
  function round2(x){ return Math.round(x * 100) / 100; }
  function clampEase(e){ return Math.min(EASE_MAX, Math.max(EASE_MIN, e)); }

  /* date de la dernière révision NOTÉE, reconstruite sans champ nouveau :
     itv>=1 : due = revue + itv -> revue = due - itv ; itv==0 : revue = due (jour de l'échec) */
  function prevReviewDate(it){ return it.itv >= 1 ? addDays(it.due, -it.itv) : it.due; }

  /* ease effective : champ stocké si présent, sinon seed paresseux dérivé de ok/ko, sinon neutre */
  function easeOf(it){
    if (typeof it.e === "number") return clampEase(it.e);
    const n = (it.ok || 0) + (it.ko || 0);
    if (n < 4) return EASE_START;
    const acc = it.ok / n;                              // pollué par les re-vus intra-session
    const p = Math.min(1, Math.max(0, 2 - 1 / acc));    // dépollution (acc<=0.5 -> p=0 ; gère acc=0)
    return round2(Math.min(SEED_MAX, Math.max(SEED_MIN,
      EASE_START + 2.4 * (p - TARGET_RETENTION))));
  }

  function isLeech(it){                                 // dérivé, jamais stocké
    return easeOf(it) <= EASE_MIN + 0.001 && (it.ko || 0) >= LEECH_KO;
  }

  /* ================= planification LEGACY (GELÉE) =================
     Comportement historique, contractuel : sert de mode phase 1 (adaptive=false),
     de shadow de comparaison et de référence des tests d'équivalence. NE PAS MODIFIER. */
  function computeAnswerLegacy(it, ok, today){
    let s = it.stage, itv = it.itv, due;
    if(ok){
      if(s<5){ s = s+1; itv = STEP[s] || 1; }
      else { itv = Math.min(120, Math.max(14, Math.round(itv*2.2))); }
      due = addDays(today, itv);
    } else {
      s = Math.max(1, s-2); itv = 0; due = today;
    }
    return { s, i:itv, d:due };
  }

  /* ================= planification étendue (ALGORITHM.md §2.4) =================
     computeAnswer(it, ok, today, adaptive) -> {s,i,d,e,counted,early,iLegacy,iAdaptive}
     adaptive=false : s/i/d = SORTIE LEGACY BIT-À-BIT ; e/counted calculés quand même (phase ombre). */
  function computeAnswer(it, ok, today, adaptive){
    /* 1. temps réellement écoulé */
    const known   = !!it.due;
    const elapsed = known ? Math.max(0, daysBetween(prevReviewDate(it), today)) : 0;
    const late    = Math.max(0, elapsed - (it.itv || 0));
    const early   = !!(ok && it.itv >= 1 && elapsed < EARLY_RATIO * it.itv);
    const counted = known && elapsed >= 1 && !early;

    /* 2. ease */
    let e = easeOf(it);
    if (ok) {
      if (counted) e = clampEase(e + EASE_GAIN);
      // succès anticipé ou re-vu de session : ease GELÉE
    } else if (elapsed >= 1) {
      const prescribed = Math.max(1, it.itv);
      e = clampEase(e - EASE_LOSS * prescribed / (prescribed + late));  // échec tardif atténué
    }
    e = round2(e);

    /* 3. planification legacy (shadow + mode phase 1) */
    const leg = computeAnswerLegacy(it, ok, today);

    /* 4. planification adaptative */
    let s = it.stage, i = it.itv, d = it.due;
    if (ok) {
      if (early) {
        // révision anticipée (boss fight) : no-op complet de planification
      } else if (it.stage < 5) {
        s = it.stage + 1;
        const ladder = Math.max(1, Math.round((STEP[s] || 1) * e / EASE_START));
        const credit = Math.min(Math.floor(elapsed / 2), LATE_CREDIT_CAP * ladder);
        i = Math.min(MAX_ITV, Math.max(ladder, credit));
        d = addDays(today, i);
      } else {
        const base   = Math.min(2 * it.itv, it.itv + Math.floor(late / 2));
        const floor5 = Math.round(S5_FLOOR * e / EASE_START);
        i = Math.min(MAX_ITV, Math.max(floor5, Math.round(base * e)));
        d = addDays(today, i);
      }
    } else {
      s = Math.max(1, it.stage - 2); i = 0; d = today;   // chemin d'échec INCHANGÉ
    }

    const chosen = adaptive ? { s, i, d } : leg;
    return { s: chosen.s, i: chosen.i, d: chosen.d, e, counted, early,
             iLegacy: leg.i, iAdaptive: ok ? i : 0 };
  }

  /* ================= rétention mesurée (instrument, PAS un contrôleur) ================= */
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

  /* items échus : en apprentissage (stage>=1) et due atteinte */
  function selectDue(effItems, today){
    const due = [];
    effItems.forEach(it => {
      if(it.stage>=1 && it.due && it.due<=today) due.push(it.id);
    });
    return due;
  }

  /* nouvelles cartes à introduire : stage 0.
     Ordre : rankOf croissant (plus simple/fréquent d'abord — ex. A1 avant B1, mots avant phrases),
     puis kit prioritaire (option), puis id. rankOf est optionnel (défaut 0 = comportement historique). */
  function pickNew(effItems, slots, kitFirst, rankOf){
    if(!(slots>0)) return [];
    const news = effItems.filter(it=>it.stage===0);
    const rk = typeof rankOf === "function" ? rankOf : function(){ return 0; };
    news.sort((a,b)=> (rk(a)-rk(b)) || (kitFirst ? (b.kit?1:0)-(a.kit?1:0) : 0) || (a.id<b.id?-1:1));
    return news.slice(0, slots).map(it=>it.id);
  }

  /* ================= journal ================= */
  function computeStreak(log, today, addDaysFn){
    const ad = addDaysFn || addDays;
    let n=0, d=today;
    const l0 = log[d];
    if(!l0 || l0.n===0){ d = ad(d,-1); }        // aujourd'hui pas encore fait -> compter depuis hier
    while(log[d] && log[d].n>0){ n++; d = ad(d,-1); }
    return n;
  }

  /* ================= hasard ================= */
  function shuffle(a, rnd){ const r = rnd || Math.random;
    for(let i=a.length-1;i>0;i--){ const j=Math.floor(r()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
  function sample(arr, n, excl, rnd){
    const pool = arr.filter(x=>!excl.has(x));
    shuffle(pool, rnd); return pool.slice(0,n);
  }

  /* ================= distracteurs =================
     Cascade : confusions (dès stage 2) -> même thème/type -> même type.
     Jamais l'item lui-même, jamais un id deux fois, jamais la même valeur
     de champ que l'item. opts.random : RNG injectable (tests). */
  function pickDistractors(it, n, field, seedById, allIds, opts){
    const rnd = (opts && opts.random) || Math.random;
    const out=[], seen=new Set([it.id]);
    const push = id => { const o=seedById[id]; if(o && !seen.has(id) && o[field]!==it[field==="fr"?"fr":"kr"]){ out.push(id); seen.add(id);} };
    if(it.stage>=2) (it.conf||[]).forEach(id=>{ if(out.length<n) push(id); });
    if(out.length<n){
      const theme = allIds.filter(id=>{ const o=seedById[id]; return o.theme===it.theme && o.type===it.type; });
      sample(theme, n-out.length+2, seen, rnd).forEach(id=>{ if(out.length<n) push(id); });
    }
    if(out.length<n){
      const any = allIds.filter(id=>seedById[id].type===it.type);
      sample(any, n-out.length+3, seen, rnd).forEach(id=>{ if(out.length<n) push(id); });
    }
    return out.slice(0,n);
  }

  /* ================= FSRS (Free Spaced Repetition Scheduler) — planificateur DSR =================
     3 variables par carte : S (stabilité = jours pour R→90%), D (difficulté 1-10), R (récupérabilité).
     Remplace UNIQUEMENT le timing ; l'échelle de stades reste pour le choix d'exercice.
     Formules FSRS-5 (19 poids), DECAY=-0.5 fixe. Poids par défaut = entraînés sur ~700M révisions réelles.
     Notes binaires de Sori : faux → Again(1), juste → Good(3). Poids perso à ajuster HORS-LIGNE
     (optimiseur Python) depuis le journal ST.rlog. Sources : expertium.github.io/Algorithm.html,
     borretti.me/article/implementing-fsrs-in-100-lines, open-spaced-repetition/ts-fsrs. */
  const FSRS_W = [0.40255,1.18385,3.173,15.69105,7.1949,0.5345,1.4604,0.0046,1.54575,0.1192,1.01925,1.9395,0.11,0.29605,2.2698,0.2315,2.9898,0.51655,0.6621];
  const FSRS_DECAY = -0.5;
  const FSRS_FACTOR = 19/81;          // = 0.9^(1/DECAY) - 1 : garantit R=0.9 quand t=S
  const FSRS_S_MIN = 0.1, FSRS_S_MAX = 36500, FSRS_DR = 0.9;
  function fsrsClampS(s){ return Math.min(FSRS_S_MAX, Math.max(FSRS_S_MIN, s)); }
  function fsrsClampD(d){ return Math.min(10, Math.max(1, d)); }
  function round3(x){ return Math.round(x*1000)/1000; }
  function fsrsR(t, S){ return Math.pow(1 + FSRS_FACTOR * t / S, FSRS_DECAY); }                     // récupérabilité après t jours
  function fsrsIntervalDays(S, Rd){ return (S / FSRS_FACTOR) * (Math.pow(Rd, 1/FSRS_DECAY) - 1); }  // intervalle exact pour viser Rd
  function fsrsNextInterval(S, Rd, maxItv){ return Math.min(maxItv||MAX_ITV, Math.max(1, Math.round(fsrsIntervalDays(S, Rd||FSRS_DR)))); }
  function fsrsInitS(G, w){ w=w||FSRS_W; return fsrsClampS(w[Math.min(3, Math.max(0, G-1))]); }      // stabilité initiale par note
  function fsrsInitD(G, w){ w=w||FSRS_W; return fsrsClampD(w[4] - Math.exp(w[5]*(G-1)) + 1); }       // difficulté initiale par note
  function fsrsNextD(D, G, w){                                                                        // MAJ difficulté + retour à la moyenne
    w=w||FSRS_W;
    const lin = D + (-w[6]*(G-3))*(10-D)/9;
    return fsrsClampD(w[7]*fsrsInitD(4, w) + (1-w[7])*lin);
  }
  function fsrsSuccS(D, S, R, G, w){                                                                  // stabilité après rappel réussi (croît)
    w=w||FSRS_W;
    const hard = G===2 ? w[15] : 1, easy = G===4 ? w[16] : 1;
    const inc = Math.exp(w[8]) * (11-D) * Math.pow(S, -w[9]) * (Math.exp(w[10]*(1-R))-1) * hard * easy;
    return fsrsClampS(S * (1 + inc));
  }
  function fsrsFailS(D, S, R, w){                                                                     // stabilité post-oubli (≤ S)
    w=w||FSRS_W;
    const post = w[11] * Math.pow(D, -w[12]) * (Math.pow(S+1, w[13]) - 1) * Math.exp(w[14]*(1-R));
    return fsrsClampS(Math.min(post, S));
  }
  function easeToD(e){ return fsrsClampD(10 - (Math.min(3, Math.max(1.3, e)) - 1.3)/1.7 * 9); }       // ease Sori (1.3 dur→3 facile) → D (10 dur→1 facile)

  /* planification FSRS d'UNE réponse. it = état effectif (S?, D? optionnels ; sinon amorcés).
     G = note 1..4 (Sori binaire : 1 échec, 3 succès). opts = {w, retention, maxItv}.
     Retourne { S, D, i, d, stage, elapsed, counted }. Le stage (exercice) suit la règle existante. */
  function fsrsSchedule(it, G, today, opts){
    opts = opts || {};
    const w = opts.w || FSRS_W, Rd = opts.retention || FSRS_DR, maxItv = opts.maxItv || MAX_ITV;
    /* v64 — deux canaux : la STABILITÉ suit G (note plafonnée par l'aide de l'exercice, pénalité
       w15 voulue) ; la DIFFICULTÉ suit opts.gradeD (la note réellement choisie) — sinon chaque 2
       IMPOSÉ par le plafond ferait dériver D en cliquet vers ~9.8 (une carte parfaitement connue
       finirait notée comme une leech, et le facteur (11-D) freinerait AUSSI les révisions non
       plafonnées). Sans opts.gradeD : comportement inchangé. */
    const GD = opts.gradeD || G;
    const success = G >= 2;
    const known = !!it.due;
    const elapsed = known ? Math.max(0, daysBetween(prevReviewDate(it), today)) : 0;
    const stage = success ? Math.min(5, (it.stage||0) + 1) : Math.max(1, (it.stage||1) - 2);
    let S = (typeof it.S === "number") ? it.S : null;
    let D = (typeof it.D === "number") ? it.D : null;

    if(S === null || D === null){
      const hasHistory = ((it.ok||0)+(it.ko||0)) > 0 || (it.itv||0) >= 1;
      if(!hasHistory){                                   // vraie 1re révision d'une carte neuve
        const s0 = fsrsInitS(G, w), d0 = fsrsInitD(GD, w);
        const i = success ? fsrsNextInterval(s0, Rd, maxItv) : 0;
        return { S: round3(s0), D: round3(d0), i, d: success ? addDays(today, i) : today, stage, elapsed, counted:false };
      }
      S = fsrsClampS(Math.max(0.5, it.itv || 1));         // migration : S ← intervalle actuel
      D = easeToD(easeOf(it));                            //             D ← ease
    }

    if(elapsed < 1){                                      // re-vu de session / anticipé : S/D gelés
      if(!success) return { S: round3(S), D: round3(D), i:0, d: today, stage, elapsed, counted:false };
      const i = fsrsNextInterval(S, Rd, maxItv);
      return { S: round3(S), D: round3(D), i, d: addDays(today, i), stage, elapsed, counted:false };
    }

    const R = fsrsR(elapsed, S);                          // révision COMPTÉE
    const D2 = fsrsNextD(D, GD, w);
    if(!success){
      const S2 = fsrsFailS(D, S, R, w);
      return { S: round3(S2), D: round3(D2), i:0, d: today, stage, elapsed, counted:true };  // échec = re-vu en session (comme legacy)
    }
    const S2 = fsrsSuccS(D, S, R, G, w);
    const i = fsrsNextInterval(S2, Rd, maxItv);
    return { S: round3(S2), D: round3(D2), i, d: addDays(today, i), stage, elapsed, counted:true };
  }

  /* ================= export double environnement ================= */
  const ENGINE = { addDays, daysBetween, computeAnswer, computeAnswerLegacy, easeOf, isLeech,
                   prevReviewDate, retention7, selectDue, pickNew, computeStreak,
                   pickDistractors, shuffle, sample, DEF_SET, STEP,
                   fsrsSchedule, fsrsR, fsrsIntervalDays, fsrsNextInterval, fsrsInitS, fsrsInitD,
                   fsrsNextD, fsrsSuccS, fsrsFailS, easeToD,
                   FSRS: { W: FSRS_W, DECAY: FSRS_DECAY, FACTOR: FSRS_FACTOR, S_MIN: FSRS_S_MIN, S_MAX: FSRS_S_MAX, DR: FSRS_DR },
                   EASE: { EASE_START, EASE_MIN, EASE_MAX, SEED_MIN, SEED_MAX, TARGET_RETENTION,
                           EASE_GAIN, EASE_LOSS, EARLY_RATIO, LATE_CREDIT_CAP, MAX_ITV, S5_FLOOR, LEECH_KO } };
  if (typeof module !== "undefined" && module.exports) module.exports = ENGINE;
  else root.ENGINE = ENGINE;
})(typeof self !== "undefined" ? self : this);

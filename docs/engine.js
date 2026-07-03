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
  const DEF_SET = { newPerDay:12, kitFirst:true, rate:0.9, listenN:10, sessionMax:120, mute:false, autoplay:true, adaptive:false, typing:false, report:false };
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

  /* nouvelles cartes à introduire : stage 0, kit prioritaire (option), puis id */
  function pickNew(effItems, slots, kitFirst){
    if(!(slots>0)) return [];
    const news = effItems.filter(it=>it.stage===0);
    news.sort((a,b)=> (kitFirst ? (b.kit?1:0)-(a.kit?1:0) : 0) || (a.id<b.id?-1:1));
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

  /* ================= export double environnement ================= */
  const ENGINE = { addDays, daysBetween, computeAnswer, computeAnswerLegacy, easeOf, isLeech,
                   prevReviewDate, retention7, selectDue, pickNew, computeStreak,
                   pickDistractors, shuffle, sample, DEF_SET, STEP,
                   EASE: { EASE_START, EASE_MIN, EASE_MAX, SEED_MIN, SEED_MAX, TARGET_RETENTION,
                           EASE_GAIN, EASE_LOSS, EARLY_RATIO, LATE_CREDIT_CAP, MAX_ITV, S5_FLOOR, LEECH_KO } };
  if (typeof module !== "undefined" && module.exports) module.exports = ENGINE;
  else root.ENGINE = ENGINE;
})(typeof self !== "undefined" ? self : this);

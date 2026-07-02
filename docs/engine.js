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
  const DEF_SET = { newPerDay:12, kitFirst:true, rate:0.9, listenN:10, sessionMax:120, mute:false, autoplay:true };
  const STEP = {2:1, 3:2, 4:4, 5:8};   // intervalle (jours) en arrivant à ce stage

  /* ================= dates ================= */
  function addDays(dstr, n){ const d=new Date(dstr+"T12:00:00"); d.setDate(d.getDate()+n);
    return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }

  /* ================= planification =================
     Réponse à une carte : nouveau {s: stage, i: intervalle, d: due}.
     Succès stage<5 -> stage+1, itv=STEP[s] ; stage 5 -> itv borné [14,120], ×2.2.
     Échec -> stage=max(1, s-2), itv=0, due=aujourd'hui. */
  function computeAnswer(it, ok, today){
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
  const ENGINE = { addDays, computeAnswer, selectDue, pickNew, computeStreak,
                   pickDistractors, shuffle, sample, DEF_SET, STEP };
  if (typeof module !== "undefined" && module.exports) module.exports = ENGINE;
  else root.ENGINE = ENGINE;
})(typeof self !== "undefined" ? self : this);

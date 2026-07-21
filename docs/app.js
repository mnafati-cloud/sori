/* Sori — moteur de révision coréen (échelle de maîtrise + QCM intelligents + TTS) */
"use strict";

/* ================= état & persistance ================= */
const LS_KEY = "sori-state-v1";
const SEED_BY_ID = {};
SEED.items.forEach(it => SEED_BY_ID[it.id] = it);

/* v77 : DISCRIMINANTS de glose — des mots coréens DISTINCTS partageaient une définition française
   identique, donc en production FR→KR le prompt ne disait pas lequel produire (retour user 2026-07-14 :
   « ça manque de trivia sur des mots proches »). On enrichit SEULEMENT ces gloses en collision d'un
   discriminant court, clé = kr. La source de vérité reste Anki (tools/build_data.py) ; ce patch en
   place survit à une régénération de data.js et se retire d'un bloc. Discriminants validés avec l'user. */
const GLOSS_FIX = {
  "공휴일":"Jour férié (officiel)", "휴일":"Jour de congé / repos",
  "오래":"Longtemps (durée)", "오래간만":"Ça fait longtemps (qu'on s'est vus)",
  "혼자":"Seul (sans personne autour)", "외롭다":"Se sentir seul (solitude)",
  "떠나다":"Partir (quitter un lieu)", "출발하다":"Partir (se mettre en route)",
  "얘기":"Histoire (récit, ce qu'on raconte)", "이야기":"Histoire (récit, ce qu'on raconte)", "역사":"Histoire (la discipline, le passé)",
  "계획":"Plan (projet, intention)", "지도":"Plan (carte géographique)",
  "임차하다":"Louer (prendre en location — locataire)", "임대하다":"Louer (donner en location — propriétaire)",
  "경험":"Expérience (vécu personnel)", "경력":"Expérience (professionnelle)",
  "힘들다":"Difficile (pénible, effort)", "어렵다":"Difficile (ardu, complexe)",
  "분명하다":"Clair (évident, net)", "맑다":"Clair (limpide, ensoleillé)",
  "어린이":"Enfant (les enfants, général)", "아이":"Enfant (gamin, petit)",
  "아줌마":"Madame (familier, « tata »)", "아주머니":"Madame (poli)",
  "휴지통":"Corbeille (à papier)", "쓰레기통":"Poubelle (ordures)",
  "관심":"Intérêt (attention, curiosité)", "재미":"Intérêt (plaisir, amusement)",
  "장소":"Endroit (lieu précis)", "곳":"Endroit (lieu, vague)",
  "하지만":"Mais (courant)", "그러나":"Mais (écrit, formel)", "그렇지만":"Mais quand même / pourtant",
  "항상":"Toujours (habituellement)", "언제나":"Toujours (en toute occasion)",
  "가격":"Prix (tarif, commercial)", "값":"Prix (valeur, ce que ça vaut)",
  "이렇다":"Être comme ceci (ce que je montre / présent)", "그렇다":"Être comme ça / c'est le cas (déjà évoqué)",
  "그래서":"Donc (résultat)", "그러니까":"Donc (c'est pourquoi)",
  /* v80 : PRÉVENTION (collisions de glose sans erreur encore — go user) : mêmes discriminants,
     seulement là où la glose du mot est nue et la distinction nette (le jumeau est déjà marqué). */
  "들어가다":"Entrer (en s'éloignant)", "들어오다":"Entrer (vers ici)",
  "카페":"Café (le lieu)", "생선":"Poisson (à manger)",
  "이제":"Désormais / à partir de maintenant", "지금":"Maintenant (à l'instant présent)",
  "같이":"Ensemble (courant)", "함께":"Ensemble (soutenu)",
  "좋아하다":"Aimer bien / apprécier",
  /* v82 : rapports in-app 16-17/07. Séries démonstratives 이/그/저 (le FR ne distingue pas ci/là/là-bas)
     pour personnes ET choses ; verbe directionnel 나가다 (calque de 들어가다) ; interrogatifs 무슨/어느 ;
     + note de polysémie sur l'HOMOGRAPHE 위 (estomac ↔ au-dessus — le coréen est ambigu, pas le français). */
  "나가다":"Sortir (en s'éloignant)",
  "이분":"Cette personne-ci (près de moi)", "그분":"Cette personne-là (près de toi / dont on parle)", "저분":"Cette personne là-bas (loin de nous deux)",
  "이것":"Ceci (près de moi)", "그것":"Ça (près de toi / dont on parle)", "저것":"Ça là-bas (loin de nous deux)",
  "무슨":"Quel type de… (quelle sorte de)", "어느":"Lequel (choix parmi un ensemble connu)",
  "위":"Estomac (l'organe) — 위 signifie aussi « au-dessus / le haut »",
  /* v92 : rapports in-app 18/07 (« Pas 나다 ? » sur 생기다 ; « différence avec 정류장 ? » sur 정거장) */
  "나다":"Sortir, pousser (émaner de soi : bruit, odeur, fièvre, feuille)",
  "생기다":"Apparaître, se former (survenir : problème, occasion)",
  "정류장":"Arrêt de bus (le mot courant)",
  "정거장":"Station, arrêt (terme large : train, métro)"
};
SEED.items.forEach(it => { if(GLOSS_FIX[it.kr]) it.fr = GLOSS_FIX[it.kr]; });

/* ===== cartes VERSO (production FR→KR) — Phase 2 =====
   Chaque MOT a une carte "recto" (compréhension KR→FR, id de base, état dans ST.items[id])
   ET une carte "verso" (production FR→KR, id = base + REV, état séparé dans ST.items[revId]).
   Maîtrise indépendante : ce sont deux ids distincts, planifiés séparément par le moteur.
   Le seed verso PARTAGE kr/fr/type du recto (aucune duplication de data.js). L'audio, les gloses
   et le niveau CEFR se résolvent toujours via l'id de BASE (baseId). Actif seulement si ST.set.reverse. */
const REV = "␞";                         // séparateur improbable dans un id de base
const BASE_IDS = SEED.items.map(it => it.id);
function isRev(id){ return typeof id === "string" && id.endsWith(REV); }
function baseId(id){ return isRev(id) ? id.slice(0, -REV.length) : id; }
const REV_IDS = [];
SEED.items.forEach(it => {
  if(it.type === "word"){                     // production d'une phrase entière = trop dur ⇒ mots seulement
    const rid = it.id + REV;
    /* démarre FRAIS (stade 0, jamais échu) : la production est une compétence neuve,
       indépendante du score de compréhension. enemy/kit remis à zéro (propres au recto). */
    SEED_BY_ID[rid] = Object.assign({}, it, { id: rid, rev: true, stage: 0, itv: 0, due: null, enemy: false, kit: false });
    REV_IDS.push(rid);
  }
});

function todayStr(){ const d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
/* moteur pur (planification, sélection, distracteurs) : docs/engine.js, chargé avant ce fichier */
const addDays = ENGINE.addDays;

const DEF_SET = ENGINE.DEF_SET;
let ST = loadState();
function loadState(){
  /* Migration douce : champs inconnus préservés, nouveaux réglages -> défauts.
     Une mise à jour de l'app ne perd JAMAIS la progression. */
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(raw){
      const s = JSON.parse(raw);
      if(s && s.v>=1){
        s.items = s.items||{}; s.log = s.log||{}; s.intro = s.intro||{}; s.rlog = s.rlog||[];
        s.set = Object.assign({}, DEF_SET, s.set||{});
        s.xp = s.xp||0;
        s.strPos = s.strPos||0;                    // v62 : position persistée de l'exercice Structure (rampe facile->dur)
        s.errors = s.errors||[]; s.vlog = s.vlog||[];   // v65 : exceptions capturées + journal de versions
        s.rep = s.rep||{d:"",m:{}};                     // v71 : derniers contacts des vues blanches (reprise)
        s.conv = s.conv||[];                            // v89 : conversations IA enregistrées (cap 12×40 msgs ≈ 30 Ko max)
        /* v52 : split recto/verso retiré (doublait le deck). Bascule UNE FOIS les utilisateurs
           qui l'avaient activé (v51) vers OFF ; le toggle Réglages reste libre ensuite. */
        if(s.reverseMig !== 1){ s.set.reverse = false; s.reverseMig = 1; }
        /* v68 : adaptive n'est lu qu'en mode legacy — le laisser à true minerait un futur rollback
           (planif adaptative silencieuse au lieu du legacy gelé). Désamorcé une fois. */
        if(s.adapMig !== 1){ if(s.set.scheduler !== "legacy") s.set.adaptive = false; s.adapMig = 1; }
        return s;
      }
    }
  }catch(e){}
  return { v:1, items:{}, log:{}, intro:{}, rlog:[], xp:0, set: Object.assign({}, DEF_SET) };
}
/* niveaux façon échelle coréenne (급) — plancher, jamais un plafond */
const XP_LEVELS = [[0,"9급"],[1000,"8급"],[2500,"7급"],[5000,"6급"],[8000,"5급"],
                   [12000,"4급"],[17000,"3급"],[23000,"2급"],[30000,"1급"],[40000,"초단"]];
function levelName(xp){ let n=XP_LEVELS[0][1]; for(const [t,l] of XP_LEVELS){ if(xp>=t) n=l; } return n; }
const EXTRA = (typeof window!=="undefined" && window.EXTRA) || {};
/* v28 : gamification mise en veille — à réintroduire un jour SOUS FORME DE CÉLÉBRATION
   (animation/son), pas comme un bloc qui apparaît. Modules TOUJOURS chargés, données
   préservées (ST.qdone, ST.exams intacts). Repasser à true pour réafficher tel quel. */
const SHOW_QUESTS = false;   // quêtes du jour + badges (quests.js)
const SHOW_EXAM   = false;   // bilan de niveau périodique (exam.js)
function save(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(ST)); }catch(e){} }

/* ===== v65 : capture d'EXCEPTIONS — avant, les catch silencieux et les erreurs globales
   laissaient l'app muette en cas de casse sur le téléphone (zéro visibilité à l'analyse).
   Anneau borné ST.errors (additif), embarqué dans chaque sauvegarde cloud → lu à chaque
   analyse, comme les rapports 🐞. Garde-fous : le handler ne throw JAMAIS, dédup du même
   message (compteur n), cap 50. */
const ERR_CAP = 50;
function logErr(type, msg, src){
  try{
    ST.errors = ST.errors || [];
    msg = String(msg || "?").slice(0, 300); src = String(src || "").slice(0, 120);
    /* TAB est un `let` déclaré PLUS BAS : avant son initialisation (boot), même `typeof TAB`
       throw (TDZ — typeof ne protège que les identifiants NON déclarés). Lecture isolée pour
       que l'entrée survive à un crash du top-level (revue v65). */
    let tab = "?";
    try{ if(typeof TAB === "string") tab = TAB; }catch(_){}
    const last = ST.errors[ST.errors.length - 1];
    if(last && last.msg === msg && last.src === src){
      last.n = (last.n||1) + 1; last.d = new Date().toISOString();
      /* pas de save() ici : une erreur en RAFALE dédupliquée ne doit pas sérialiser l'état
         (~600 Ko) en boucle — les compteurs partiront avec le prochain save organique. */
    } else {
      ST.errors.push({ d: new Date().toISOString(), type, msg, src, tab, n: 1 });
      if(ST.errors.length > ERR_CAP) ST.errors.splice(0, ST.errors.length - ERR_CAP);
      save();
    }
  }catch(_){}
}
/* bascule depuis le filet PRÉCOCE de index.html (clé séparée sori-earlyerrs — les scripts amont
   et le haut d'app.js se chargent AVANT ces handlers ; sans le filet, une SyntaxError de data.js
   ou un crash du boot resteraient invisibles). */
try{
  if(window.__earlyErrH){
    window.removeEventListener("error", window.__earlyErrH);
    window.removeEventListener("unhandledrejection", window.__earlyErrH);
  }
}catch(_){}
window.addEventListener("error", e => logErr("js", e.message, (e.filename || "") + ":" + (e.lineno || 0)));
window.addEventListener("unhandledrejection", e => {
  /* dérive un message UTILE quel que soit e.reason (objet sans .message → JSON, pas "[object Object]") */
  let m = "?";
  try{
    const r = e && e.reason;
    if(r && typeof r.message === "string" && r.message) m = r.message;
    else if(typeof r === "string" && r) m = r;
    else if(r && typeof r === "object"){ try{ m = JSON.stringify(r).slice(0, 200); }catch(_){ m = Object.prototype.toString.call(r); } }
    else if(r !== undefined && r !== null && r !== "") m = String(r);
  }catch(_){}
  logErr("promise", m, "");
});
try{
  const early = JSON.parse(localStorage.getItem("sori-earlyerrs") || "[]") || [];
  if(early.length){
    early.forEach(x => logErr(x.type || "js", String(x.msg || "?") + " [avant-boot]", x.src || ""));
    localStorage.removeItem("sori-earlyerrs");
  }
}catch(_){}

/* v65 : journal de VERSIONS (ST.vlog = [[date, "vNN"], …]) — borne les changements de régime
   (ex. plafonds de note v58/v64) pour le fit Phase B. Source = cache SW actif (même mécanisme
   que l'affichage de version v35) ; enregistré au boot suivant l'activation, c'est suffisant. */
(function(){
  try{
    if(typeof caches === "undefined" || !caches.keys) return;
    caches.keys().then(keys => {
      const nums = keys.map(k => /^sori-v(\d+)$/.exec(k)).filter(Boolean).map(m => +m[1]);
      if(!nums.length) return;
      const v = "v" + Math.max(...nums);
      ST.vlog = ST.vlog || [];
      const last = ST.vlog[ST.vlog.length - 1];
      if(!last || last[1] !== v){ ST.vlog.push([todayStr(), v]); if(ST.vlog.length > 50) ST.vlog.splice(0, ST.vlog.length - 50); save(); }
    }).catch(() => {});
  }catch(_){}
})();

/* état effectif d'un item = seed + delta local */
function eff(id){
  const seed = SEED_BY_ID[id];
  const d = ST.items[id] || {};
  return {
    id, fr:seed.fr, kr:seed.kr, type:seed.type, theme:seed.theme,
    kit:!!seed.kit, enemy:!!seed.enemy, conf:seed.conf||[],
    stage: d.s!==undefined ? d.s : seed.stage,
    itv:   d.i!==undefined ? d.i : seed.itv,
    due:   d.d!==undefined ? d.d : seed.due,
    ok: d.ok||0, ko: d.ko||0,
    e: d.e,                       // ease adaptative (undefined -> seed paresseux via easeOf)
    S: d.S, D: d.D,               // FSRS : stabilité (jours) & difficulté (1-10) — undefined = amorcé au 1er passage
    lp: d.lp || 0,                // v68 : rattrapage post-lapse restant (production forcée)
    sus: !!d.sus,                 // "mise de côté" : exclue de toute file tant que vrai (réversible)
    rev: !!seed.rev,              // carte verso (production FR→KR) vs recto (compréhension KR→FR)
  };
}
function setItem(id, patch){
  const cur = ST.items[id] || {};
  ST.items[id] = Object.assign(cur, patch);
  save();
}
/* recto seul, ou recto + verso si le mode production est actif (réglage `reverse`).
   Tout le moteur (buildQueue/selectDue/pickNew) itère ALL_IDS → gère les cartes verso sans réécriture. */
const ALL_IDS = (ST.set.reverse !== false) ? BASE_IDS.concat(REV_IDS) : BASE_IDS.slice();

/* ================= journal & stats (télémétrie additive) =================
   Par jour : compteurs globaux ok/ko/n + par TYPE d'exercice (k), temps de
   réponse agrégés, et compteurs "propres" ok1/ko1 + shadow so/sn (ALGORITHM.md). */
function logAnswer(ok, kind, r, rt){
  sfx(ok);                                  // feedback sonore immédiat (tous les modes journalisés)
  const t = todayStr();
  const l = ST.log[t] || (ST.log[t]={ok:0,ko:0,n:0,listen:0});
  l.n++; if(kind==="listen"||kind==="dictee"){ l.listen++; }
  if(ok) l.ok++; else l.ko++;
  if(kind){
    l.k = l.k || {};
    const kk = l.k[kind] = l.k[kind] || {o:0,x:0,t:0,c:0};
    if(ok) kk.o++; else kk.x++;
    if(rt && rt>0 && rt<60000){ kk.t += Math.round(rt/100); kk.c++; }  // dixièmes de seconde
  }
  if(r && r.counted){                       // 1re présentation espacée non anticipée
    if(ok) l.ok1=(l.ok1||0)+1; else l.ko1=(l.ko1||0)+1;
    if(ok){ l.so=(l.so||0)+(r.iLegacy||0); l.sn=(l.sn||0)+(r.iAdaptive||0); }   // shadow legacy (0 en mode FSRS)
  }
  save(); updateDayCount();
}
let EXO_T0 = 0;   // début d'affichage de l'exercice courant (temps de réponse)

/* ===== v73 : sons « encre & papier » (WebAudio généré, zéro asset) — respecte le mute =====
   Matière sonore = bruit filtré (papier, plume, tampon), plus d'oscillateurs électroniques.
   Volumes bas exprès : ~600 réponses/jour, le son doit accompagner, jamais fatiguer. */
let ACTX = null, NOISE = null;
function actx(){
  ACTX = ACTX || new (window.AudioContext||window.webkitAudioContext)();
  if(ACTX.state === "suspended") ACTX.resume();
  if(!NOISE){
    NOISE = ACTX.createBuffer(1, Math.floor(ACTX.sampleRate/2), ACTX.sampleRate);
    const d = NOISE.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i] = Math.random()*2 - 1;
  }
  return ACTX;
}
/* une « voix » de bruit filtré : type/freq(→sweep)/durée/pic */
function paperVoice(ctx, t0, o){
  const src = ctx.createBufferSource(); src.buffer = NOISE; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = o.type; f.Q.value = o.q || 1;
  f.frequency.setValueAtTime(o.freq, t0);
  if(o.sweep) f.frequency.exponentialRampToValueAtTime(o.sweep, t0 + o.dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(o.peak, t0 + (o.attack || 0.008));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  src.connect(f); f.connect(g); g.connect(ctx.destination);
  src.start(t0); src.stop(t0 + o.dur + 0.02);
}
function toneVoice(ctx, t0, o){
  const osc = ctx.createOscillator(); osc.type = o.type || "sine";
  osc.frequency.setValueAtTime(o.freq, t0);
  if(o.sweep) osc.frequency.exponentialRampToValueAtTime(o.sweep, t0 + o.dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(o.peak, t0 + (o.attack || 0.006));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  osc.connect(g); g.connect(ctx.destination);
  osc.start(t0); osc.stop(t0 + o.dur + 0.02);
}
function sfx(ok){
  if(ST.set.mute) return;
  try{
    const ctx = actx(), t = ctx.currentTime;
    if(ok){
      /* trait de plume : bref, clair, vers le grave (le geste s'achève) */
      paperVoice(ctx, t, {type:"bandpass", freq:4200, sweep:2400, q:2.2, dur:0.09, peak:0.09});
    } else {
      /* raté : frottement sourd, papier qu'on froisse à moitié */
      paperVoice(ctx, t, {type:"lowpass", freq:420, sweep:240, dur:0.22, peak:0.12, attack:0.015});
      toneVoice(ctx, t, {type:"sine", freq:130, sweep:95, dur:0.18, peak:0.05});
    }
  }catch(e){}
}
/* tampon : coup sourd + claque de bruit — joué quand le sceau 끝 se pose */
function sfxStamp(){
  if(ST.set.mute) return;
  try{
    const ctx = actx(), t = ctx.currentTime;
    toneVoice(ctx, t, {type:"sine", freq:96, sweep:62, dur:0.16, peak:0.30, attack:0.004});
    paperVoice(ctx, t, {type:"lowpass", freq:800, dur:0.045, peak:0.16, attack:0.003});
  }catch(e){}
}
/* petit clic feutré : tuiles-tampon et interrupteurs */
function sfxTick(){
  if(ST.set.mute) return;
  try{
    const ctx = actx(), t = ctx.currentTime;
    paperVoice(ctx, t, {type:"highpass", freq:2600, dur:0.02, peak:0.05, attack:0.003});
  }catch(e){}
}
/* délégué : tout toggle (tuile de mode, interrupteur de réglage) fait tic */
document.addEventListener("click", e=>{ if(e.target.closest(".num-mode")) sfxTick(); });
document.addEventListener("change", e=>{
  if(e.target instanceof HTMLInputElement && e.target.type === "checkbox") sfxTick();
});

/* ===== annulation de la dernière réponse (clic accidentel) — 1 niveau ===== */
let UNDO = null;
function armUndo(){
  const t = todayStr();
  UNDO = {
    items: JSON.parse(JSON.stringify(ST.items)),
    log: ST.log[t] ? JSON.parse(JSON.stringify(ST.log[t])) : null,
    xp: ST.xp||0, combo: COMBO, sessfail: [...SESSFAIL],
    q: [...Q], qpos: QPOS,
    rlogPushed: false,                 // FSRS : posé par logReview → undoLast retire l'entrée (fiable même à RLOG_CAP)
    failpos: new Map(FAILPOS), consol: new Set(CONSOL), pending: PENDING,   // v68 : transitoires de session (sinon l'undo les désynchronise)
    repIds: new Set(REPRISE_IDS),
    rep: ST.rep ? { d: ST.rep.d, m: Object.assign({}, ST.rep.m) } : null,     // v71
  };
}
function undoLast(){
  if(!UNDO) return;
  const t = todayStr();
  ST.items = UNDO.items;
  if(UNDO.log === null) delete ST.log[t]; else ST.log[t] = UNDO.log;
  ST.xp = UNDO.xp; COMBO = UNDO.combo; SESSFAIL = UNDO.sessfail;
  Q = UNDO.q; QPOS = UNDO.qpos;
  FAILPOS = UNDO.failpos || new Map(); CONSOL = UNDO.consol || new Set();   // v68
  REPRISE_IDS = UNDO.repIds || new Set();
  if(UNDO.rep !== undefined && UNDO.rep !== null) ST.rep = UNDO.rep;          // v71
  if(typeof UNDO.pending === "number") PENDING = UNDO.pending;
  if(ST.rlog && UNDO.rlogPushed && ST.rlog.length) ST.rlog.pop();  // retire l'entrée poussée depuis le snapshot (à RLOG_CAP, comparer les longueurs mentait)
  /* v65 : compteur d'annulations (télémétrie) — mesure le taux de mis-clics, invisible avant
     (l'undo restaure le log du jour, donc on incrémente APRÈS la restauration). */
  const lu = ST.log[t] || (ST.log[t] = {ok:0,ko:0,n:0,listen:0});
  lu.undo = (lu.undo||0) + 1;
  UNDO = null;
  save(); saveSess(); updateDayCount(); render();
}
function updateDayCount(){
  const l = ST.log[todayStr()];
  document.getElementById("daycount").textContent = String(l ? l.n : 0);
}
/* ===== rapport de problème (bouton 🐞 optionnel) =====
   Les rapports vivent dans ST.reports -> embarqués dans chaque sauvegarde cloud,
   Claude les lit à la prochaine analyse. Contexte capturé automatiquement. */
let LASTANS = null;   // dernière réponse notée {id, kr, ok} (posée par afterAnswer)
function reportCtx(){
  const c = { tab: TAB };
  try{
    if(TAB==="review" && Q && QPOS < Q.length){
      const it = eff(Q[QPOS]);
      c.carte = { id: it.id, kr: it.kr, stage: it.stage };
      c.pos = (QPOS+1) + "/" + Q.length;
    }
    if(LASTANS) c.derniereReponse = LASTANS;
  }catch(e){}
  return c;
}
function openReportModal(){
  const ctx = reportCtx();                     // figé à l'OUVERTURE (la carte d'où l'on vient)
  const back = el(`<div class="modal-back">
    <div class="card modal">
      <h2>Signaler un problème</h2>
      <p class="dim">${ctx.carte ? "Carte : "+esc(ctx.carte.kr)+" ("+esc(ctx.pos||"")+")" : "Onglet : "+esc(ctx.tab)}
        — le contexte et l'heure sont joints automatiquement.</p>
      <textarea id="rpttxt" rows="5" placeholder="Décris le souci ou la remarque…"></textarea>
      <div class="row" style="margin-top:10px">
        <button class="btn ghost" id="rptcancel">Annuler</button>
        <button class="btn" id="rptsend">Enregistrer</button>
      </div></div></div>`);
  back.querySelector("#rptcancel").onclick = ()=>back.remove();
  back.addEventListener("click", e=>{ if(e.target===back) back.remove(); });
  back.querySelector("#rptsend").onclick = ()=>{
    const txt = back.querySelector("#rpttxt").value.trim();
    if(!txt){ back.remove(); return; }
    ST.reports = (ST.reports||[]).slice(-99);          // cap: garder les 100 derniers
    ST.reports.push({ d: new Date().toISOString(), ctx, txt });
    save();
    back.querySelector(".modal").innerHTML = `<h2>Noté</h2>
      <p class="dim">Partira avec la prochaine sauvegarde cloud — Claude le lira.</p>`;
    setTimeout(()=>back.remove(), 1200);
  };
  document.body.appendChild(back);
  back.querySelector("#rpttxt").focus();
}
function wireReport(){
  const b = document.getElementById("report");
  if(!b) return;
  b.hidden = ST.set.report !== true;
  b.onclick = openReportModal;
}

/* bouton muet global (l'app reste 100% utilisable sans audio) */
/* v69 : haut-parleur en SVG (fini l'émoji 🔊 dans le chrome) */
const SVG_SPK = '<svg viewBox="0 0 24 24"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 010 7"/></svg>';
const SVG_SPK_OFF = '<svg viewBox="0 0 24 24"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M17 9.5l5 5M22 9.5l-5 5"/></svg>';
function wireMute(){
  const b = document.getElementById("mute");
  if(!b) return;
  const paint = ()=>{ b.innerHTML = ST.set.mute ? SVG_SPK_OFF : SVG_SPK; b.title = ST.set.mute ? "Réactiver le son" : "Couper le son"; };
  b.onclick = ()=>{ ST.set.mute = !ST.set.mute; if(ST.set.mute) try{speechSynthesis.cancel();}catch(e){} save(); paint(); };
  paint();
}
/* roue ⚙️ du header : ouvre les Réglages en surcouche depuis n'importe quel onglet */
function wireSettings(){
  const b = document.getElementById("settings");
  if(b) b.onclick = openSettings;
}
/* icône 🔍 du header : ouvre le dictionnaire (search.js) en surcouche, accessible partout */
function wireDico(){
  const b = document.getElementById("dico");
  if(b) b.onclick = openDico;
}
function openDico(){
  if(!window.SORI_SEARCH) return;
  const back = el(`<div class="modal-back"></div>`);
  const box = el(`<div class="card modal wide"><h2>Dictionnaire</h2>
    <div class="dico-body"></div>
    <div class="row" style="margin-top:14px"><button class="btn ghost" id="dicoclose">Fermer</button></div></div>`);
  back.appendChild(box);
  SORI_SEARCH.renderPanel(box.querySelector(".dico-body"), {
    items: BASE_IDS.map(eff),        // dictionnaire = vocabulaire de base (pas de doublon recto/verso)
    extra: EXTRA,
    onSpeak: (kr, id)=>speak(kr, id)
  });
  box.querySelector("#dicoclose").onclick = ()=>back.remove();
  back.addEventListener("click", e=>{ if(e.target===back) back.remove(); });
  document.body.appendChild(back);
}
/* petite popin d'explication (tuiles de stats cliquables — demande 🐞) */
function openInfo(title, body){
  const back = el(`<div class="modal-back"><div class="card modal">
    <h2>${esc(title)}</h2>
    <p class="dim" style="margin-top:6px; line-height:1.55">${esc(body)}</p>
    <div class="row" style="margin-top:14px"><button class="btn ghost" id="infoclose">Compris</button></div>
  </div></div>`);
  back.querySelector("#infoclose").onclick = ()=>back.remove();
  back.addEventListener("click", e=>{ if(e.target===back) back.remove(); });
  document.body.appendChild(back);
}
/* test de niveau adaptatif en surcouche (placement.js) — estime la bande CEFR/TOPIK */
function openPlacement(){
  const back = el(`<div class="modal-back"></div>`);
  const box = el(`<div style="width:100%; max-width:560px; max-height:92vh; overflow:auto"></div>`);
  back.appendChild(box);
  back.addEventListener("click", e=>{ if(e.target===back){ back.remove(); render(); } });  // tap dehors = abandonner
  document.body.appendChild(back);
  SORI_PLACEMENT.renderTest(box, {
    items: BASE_IDS.map(eff).map(it=>({ id:it.id, kr:it.kr, fr:it.fr, type:it.type, cefr:(EXTRA[it.id]||{}).cefr })),   // test de niveau = mots de base (dormant depuis v49)
    speak: (kr,id)=>speak(kr,id),
    onFinish: r=>{ ST.placement = Object.assign({ date: todayStr() }, r); save(); },
    onExit: ()=>{ back.remove(); render(); }
  });
}
function streak(){ return ENGINE.computeStreak(ST.log, todayStr(), addDays); }

/* ================= audio : MP3 natifs prioritaires, TTS en secours ================= */
const AUDIO_IDS = new Set((typeof window!=="undefined" && window.AUDIO) || []);
const AUDIO_EX_IDS = new Set((typeof window!=="undefined" && window.AUDIO_EX) || []);   // phrases d'exemple (<id>-ex.mp3)
let CURAUDIO = null;
let KOVOICE = null;
function koVoices(){
  if(!("speechSynthesis" in window)) return [];
  return speechSynthesis.getVoices().filter(v=>/^ko/i.test(v.lang||""));
}
function pickVoice(){
  const vs = koVoices();
  KOVOICE = (ST.set.voice && vs.find(v=>v.name===ST.set.voice)) || vs[0] || null;
}
if("speechSynthesis" in window){
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}
function koVoiceMissing(){
  if(!("speechSynthesis" in window)) return true;
  const all = speechSynthesis.getVoices();
  return all.length>0 && !all.some(v=>/^ko/i.test(v.lang||""));
}
function speak(text, id){
  if(ST.set.mute) return;
  /* 1) audio natif pré-généré si disponible (indépendant du TTS du téléphone).
     Indexé par l'id de BASE : une carte verso (␞) réutilise le MP3 du mot. */
  const aid = baseId(id);
  if(aid && AUDIO_IDS.has(String(aid))){
    try{
      if(CURAUDIO) CURAUDIO.pause();
      try{ speechSynthesis.cancel(); }catch(e){}
      CURAUDIO = new Audio("./audio/"+aid+".mp3");
      CURAUDIO.playbackRate = ST.set.rate || 0.9;
      CURAUDIO.play().catch(()=>ttsSpeak(text));
      return;
    }catch(e){}
  }
  ttsSpeak(text);
}
/* prononciation de la phrase d'exemple (audio natif <id>-ex.mp3, repli TTS) */
function speakEx(id, text){
  if(ST.set.mute) return;
  if(id && AUDIO_EX_IDS.has(String(id))){
    try{
      if(CURAUDIO) CURAUDIO.pause();
      try{ speechSynthesis.cancel(); }catch(e){}
      CURAUDIO = new Audio("./audio/"+id+"-ex.mp3");
      CURAUDIO.playbackRate = ST.set.rate || 0.9;
      CURAUDIO.play().catch(()=>ttsSpeak(text));
      return;
    }catch(e){}
  }
  ttsSpeak(text);
}
function ttsSpeak(text){
  if(!("speechSynthesis" in window)) return;
  try{
    if(!KOVOICE) pickVoice();            // les voix chargent en asynchrone sur Android
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/\(.*?\)/g,""));
    u.lang = "ko-KR"; if(KOVOICE) u.voice = KOVOICE;
    u.rate = ST.set.rate || 0.9;
    speechSynthesis.speak(u);
  }catch(e){}
}

/* ================= planification (logique dans engine.js) =================
   Deux planificateurs, choisis par ST.set.scheduler :
   - "fsrs"   : modèle DSR moderne (stabilité/difficulté par carte) — défaut.
   - "legacy" : échelle de stades + ease (ALGORITHM.md) — repli/rollback.
   Dans les deux cas le STAGE (choix d'exercice) évolue pareil. */
/* Poids FSRS ACTIFS : personnalisés (fit Phase B, engine.FSRS.W_PERSONAL) par défaut, ou
   génériques si ST.set.fsrsPersonal===false (rollback 1-clic). Les poids ne sont JAMAIS stockés
   dans l'état — seul le booléen l'est — pour qu'un refit d'engine.js atteigne l'utilisateur. */
function fsrsW(){ return (ST.set.fsrsPersonal !== false ? ENGINE.FSRS.W_PERSONAL : ENGINE.FSRS.W) || ENGINE.FSRS.W; }
  // repli || ENGINE.FSRS.W : si un app.js neuf voyait un engine.js périmé sans W_PERSONAL (course de
  // propagation CDN < 1 s), markKnown indexe WW[3] directement — sans ce garde il lèverait un TypeError.
function applyAnswer(it, ok, grade, gradeRaw, kind, rt){
  const G = grade || (ok ? 3 : 1);   // note FSRS : 1 Encore(Again) · 2 Difficile(Hard) · 3 Bien(Good) · 4 Facile(Easy)
  const GD = gradeRaw || G;          // note BRUTE (non plafonnée) → canal difficulté (v64, cf. engine.fsrsSchedule)
  /* v68 : rattrapage post-lapse — quand une carte MÛRE (S>=7) est ratée, ses 2 prochaines
     révisions forcent la PRODUCTION : c'est elle qui a lâché, et le tirage recrev plafonné
     ralentissait la reconstruction de +48% vs FSRS nominal (audit). GATE (revue v68) : seulement
     les cartes qui PEUVENT voir rec5/type (mot, pas une carte recto en mode Production séparée),
     sinon lp resterait bloqué à vie ; logique COMMUNE aux deux planificateurs (le dispatch lit lp
     quel que soit le mode — un rollback legacy ne doit pas verrouiller le rec5 forcé). */
  let lpNext;
  const canProd = it.type === "word" && !((ST.set.reverse !== false) && !it.rev);
  const prevS = (typeof it.S === "number") ? it.S : (it.itv || 0);
  if(!ok && prevS >= 7 && canProd) lpNext = 2;
  else if(ok && (kind === "rec5" || kind === "type") && (it.lp|0) > 0) lpNext = it.lp - 1;
  if(ST.set.scheduler !== "legacy"){
    const t = todayStr();
    const r = ENGINE.fsrsSchedule(it, G, t, { w: fsrsW(), retention: ST.set.fsrsRetention || 0.9, gradeD: GD,
                                              fuzz: it.id + "|" + t });   // v68 : désynchronise les cohortes
    const patch = { s:r.stage, i:r.i, d:r.d, S:r.S, D:r.D, ok: it.ok+(ok?1:0), ko: it.ko+(ok?0:1) };
    if(lpNext !== undefined) patch.lp = lpNext;
    setItem(it.id, patch);
    logReview(it.id, G, r.elapsed, kind, rt);   // journal (fit hors-ligne des poids) — toutes les révisions
    return { s:r.stage, i:r.i, d:r.d, counted:r.counted };
  }
  const r = ENGINE.computeAnswer(it, ok, todayStr(), ST.set.adaptive === true);
  const lpatch = { s:r.s, i:r.i, d:r.d, e:r.e, ok: it.ok+(ok?1:0), ko: it.ko+(ok?0:1) };
  if(lpNext !== undefined) lpatch.lp = lpNext;   // v68 : lp vit dans les DEUX modes (rollback sûr)
  setItem(it.id, lpatch);
  return r;
}
/* journal de révisions — enregistrements compacts pour l'ajustement HORS-LIGNE des poids FSRS
   (optimiseur Python sur l'export cloud) ET les analyses de comportement.
   Format v65 : [date, id, note, jours écoulés, kind, tempsRéponse(dixièmes de s, plafonné 600),
   minuteDuJour]. Les vieilles entrées à 4 (≤v63) ou 5 (v64) champs restent valides — le fit
   segmente par longueur. Le kind distingue un 2 CHOISI d'un 2 IMPOSÉ par le plafond ; rt et
   l'heure permettent hésitation & patterns circadiens. */
/* Plafond FIFO : BUDGET CLOUD. rlog au cap = 8000 × ~55 o ≈ 440 Ko. ⚠️ Le poste DOMINANT de
   l'état est AILLEURS : ST.items ≈ 84 o × cartes touchées (≈ 673 Ko à deck complet, 7997) —
   le budget total dépassera la limite API ~1 Mo à l'automne 2026 au rythme d'intro actuel.
   Garde de taille dans cloudBackup (alerte > 700 Ko) ; correctif de fond planifié (journal dans
   un fichier cloud séparé, cf. MAINTENANCE v65). NE PAS remonter ce cap sans refaire le calcul.
   Pour le fit Phase B : l'historique COMPLET (au-delà du FIFO) se reconstruit en unionnant les
   snapshots quotidiens datés de sori-data (exports/sori-export-AAAA-MM-JJ.json). */
const RLOG_CAP = 8000;
function logReview(id, G, elapsed, kind, rt){
  ST.rlog = ST.rlog || [];
  const now = new Date();
  ST.rlog.push([todayStr(), id, G, elapsed|0, kind || "",
                Math.min(600, Math.round((rt || 0) / 100)), now.getHours()*60 + now.getMinutes()]);
  if(ST.rlog.length > RLOG_CAP) ST.rlog.splice(0, ST.rlog.length - RLOG_CAP);
  if(UNDO) UNDO.rlogPushed = true;   // marqueur consommé par undoLast (fiable même à RLOG_CAP)
  save();   // le push arrive APRÈS le save() de setItem → persister explicitement
}
/* « je le sais déjà » : fast-track d'un mot déjà connu → planifié LOIN, sans le tester.
   PAS de journal FSRS (ce n'est pas un vrai rappel, ça biaiserait le fit). FSRS & Classique. */
function markKnown(id){
  const t = todayStr();
  if(ST.set.scheduler !== "legacy"){
    const WW = fsrsW();
    const S = Math.max(21, WW[3]);                          // stabilité confortable (poids actifs)
    const D = Math.round(ENGINE.fsrsInitD(4, WW)*1000)/1000; // difficulté « Facile »
    const i = ENGINE.fuzzInterval(ENGINE.fsrsNextInterval(S, ST.set.fsrsRetention||0.9, ENGINE.EASE.MAX_ITV),
                                  id + "|" + t, ENGINE.EASE.MAX_ITV);   // v68 : fuzz aussi (sinon cohorte « Je le sais » synchronisée)
    setItem(id, { s:5, i, d:addDays(t,i), S:Math.round(S*1000)/1000, D });
  } else {
    setItem(id, { s:5, i:21, d:addDays(t,21) });
  }
  /* v65 : compteur quotidien (télémétrie) — l'usage du fast-track était invisible à l'analyse
     (pas de rlog, exprès) ; il fallait l'inférer par heuristique S-sans-journal. */
  const l = ST.log[t] || (ST.log[t] = {ok:0,ko:0,n:0,listen:0});
  l.known = (l.known||0) + 1;
  save();
}

/* rang d'introduction des nouvelles cartes : plus petit = introduit en premier.
   Priorité au NIVEAU (A1 avant C1 — donc les mots les plus fréquents d'abord),
   puis, à niveau égal, les MOTS avant les PHRASES (une phrase suppose de connaître ses mots).
   Sans niveau connu → milieu (rang B1) pour ne pas doubler les vraies bases. */
const LVL_RANK = { A1:1, A2:2, B1:3, B2:4, C1:5 };
function newRank(it){
  const lv = (EXTRA[baseId(it.id)]||{}).cefr;    // le verso hérite du niveau CEFR de sa base
  const base = (LVL_RANK[lv] || 3) * 10;
  /* dans un niveau : mots avant phrases. Recto et verso ont le MÊME rang — ils sont
     introduits ensemble par introduceCards (paire recto+verso). */
  return base + (it.type==="phrase" ? 5 : 0);
}

/* pendant recto↔verso d'une carte (pour l'introduction conjointe). null si pas de verso. */
function mateOf(id){
  if(ST.set.reverse === false) return null;
  if(isRev(id)) return baseId(id);
  return (SEED_BY_ID[id] && SEED_BY_ID[id].type === "word") ? id + REV : null;
}
/* introduit des cartes neuves (stade 0→1) en PAIRES recto+verso quand c'est possible
   (« les deux jeux introduits conjointement »). Respecte le budget `slots`. Retourne les ids introduits. */
function introduceCards(picked, slots, t){
  const introduced = [], seen = new Set();
  for(const id of picked){
    if(introduced.length >= slots) break;
    if(seen.has(id)) continue;
    const group = [id];
    const m = mateOf(id);
    if(m && !seen.has(m) && SEED_BY_ID[m] && eff(m).stage === 0 && !eff(m).sus) group.push(m);
    if(introduced.length + group.length > slots) continue;   // v68 : une paire ne déborde pas le budget (la coupe éjecterait une échue à sa place)
    for(const g of group){
      if(seen.has(g) || eff(g).sus) continue;   // v68 : jamais ré-introduire une carte rangée
      seen.add(g);
      setItem(g, { s:1, i:0, d:t });
      ST.intro[t] = (ST.intro[t]||0) + 1;
      introduced.push(g);
    }
  }
  return introduced;
}

/* ===== v71 : REPRISE intra-journée =====
   La stabilité réelle d'une vraie nouveauté est ~0,2 jour (≈5 h, mesuré : 69% à J+1) — or le
   système ne retouchait les fragiles que le lendemain. À chaque NOUVELLE file du même jour, on
   remet en tête les cartes RATÉES aujourd'hui et INTRODUITES aujourd'hui dont le dernier contact
   date de ≥ REPRISE_GAP_MIN, en VUES BLANCHES (mécanique v68 : réussie = entraînement pur, zéro
   effet FSRS ; ratée = vrai échec). Le dernier contact vient du journal du jour (minuteDuJour,
   v65) ; les vues blanches elles-mêmes ne journalisent pas → leur heure vit dans ST.rep
   (champ racine ADDITIF {d, m:{id:minute}}, remis à zéro chaque jour) sinon elles seraient
   re-proposées en boucle. Désactivable : REPRISE_ON. */
const REPRISE_ON = true, REPRISE_MAX = 12, REPRISE_GAP_MIN = 150;
let REPRISE = [];   // ids sélectionnés par le dernier buildQueue → semés dans CONSOL par renderReview
function repriseQueue(dueSet, t){
  if(!REPRISE_ON || !Array.isArray(ST.rlog) || !ST.rlog.length) return [];
  const now = new Date(), nowMin = now.getHours()*60 + now.getMinutes();
  const before = new Set(), info = new Map();
  for(const e of ST.rlog){
    if(!Array.isArray(e) || e.length < 4) continue;
    if(e[0] !== t){ before.add(e[1]); continue; }
    const o = info.get(e[1]) || { fail:false, allSameDay:true, last:-1 };
    if(e[2] === 1) o.fail = true;
    if((e[3]|0) >= 1) o.allSameDay = false;
    const mod = (e.length > 6 && typeof e[6] === "number") ? e[6] : null;
    if(mod !== null && mod > o.last) o.last = mod;
    info.set(e[1], o);
  }
  const cands = [];
  info.forEach((o, id) => {
    if(dueSet.has(id)) return;                                  // déjà échue → vraie révision, pas de doublon
    const it = eff(id);
    if(!it || it.sus || it.stage < 1) return;
    const introToday = o.allSameDay && !before.has(id);          // toutes les entrées du jour à elapsed<1 et rien avant = introduite aujourd'hui
    if(!o.fail && !introToday) return;                           // cible : ratées du jour OU vraies nouveautés du jour
    let last = o.last;
    if(ST.rep && ST.rep.d === t && typeof (ST.rep.m||{})[id] === "number") last = Math.max(last, ST.rep.m[id]);
    if(last < 0) return;                                         // pas d'heure connue (vieilles entrées 4-5 champs)
    if(nowMin - last < REPRISE_GAP_MIN) return;                  // touchée il y a moins de ~2 h 30
    cands.push({ id, fail: o.fail ? 1 : 0, last });
  });
  cands.sort((a, b) => (b.fail - a.fail) || (a.last - b.last));  // ratées d'abord, puis les plus anciennes
  return cands.slice(0, REPRISE_MAX).map(c => c.id);
}

/* file du jour : échues + nouvelles (plus simple/fréquent d'abord) */
function buildQueue(){
  const t = todayStr();
  const effAll = ALL_IDS.map(eff).filter(it=>!it.sus);   // les cartes mises de côté sont exclues de tout
  let due = ENGINE.selectDue(effAll, t);
  const cap = ST.set.sessionMax || 120;
  /* v68 : les nouvelles n'entrent que s'il RESTE de la place sous le plafond (comportement Anki) —
     avant, elles concurrençaient les échues à égalité dans la coupe, et le budget d'intro était
     consommé même pour une carte coupée jamais montrée. */
  const introToday = ST.intro[t]||0;
  let slots = Math.max(0, Math.min((ST.set.newPerDay||0) - introToday, cap - due.length));
  if(slots>0){
    /* on pioche large (×2 : recto+verso) puis introduceCards forme les paires dans la limite du budget */
    const picked = ENGINE.pickNew(effAll, slots*2, ST.set.kitFirst, newRank);
    introduceCards(picked, slots, t).forEach(id => due.push(id));
    save();
  }
  /* v68 : si la file déborde quand même (retour d'absence), écarter les cartes les MOINS à risque
     (R le plus haut) — avant, la coupe post-shuffle écartait au hasard, fragiles comprises. */
  if(due.length > cap){
    const byId = {}; effAll.forEach(x => { byId[x.id] = x; });
    const R = new Map(due.map(id => [id, cardRetrievability(byId[id])]));   // mémoïsé, pas dans le comparateur (revue v68)
    due.sort((a,b) =>
      ((byId[a].itv===0 && byId[a].due<=t)?0:1) - ((byId[b].itv===0 && byId[b].due<=t)?0:1)   // ratées du jour d'abord (leur R=1.0 les faisait couper en premier)
      || R.get(a) - R.get(b));
    PENDING = due.length - cap;
    due = due.slice(0, cap);
  } else PENDING = 0;
  shuffle(due);
  /* v71 : la REPRISE passe en tête (vues blanches, hors cap — ≤ REPRISE_MAX) */
  REPRISE = repriseQueue(new Set(due), t);
  if(REPRISE.length) due = REPRISE.concat(due);
  return due;
}
let PENDING = 0;
const shuffle = ENGINE.shuffle;

/* ================= distracteurs (logique dans engine.js) ================= */
function distractors(it, n, field){
  /* pool = ids de BASE uniquement (une carte verso a le même kr/fr que sa base → doublons).
     Pour une carte verso, exclure aussi l'id de base de la réponse (sinon une option identique à la bonne). */
  const pool = it.rev ? BASE_IDS.filter(x => x !== baseId(it.id)) : BASE_IDS;
  return ENGINE.pickDistractors(it, n, field, SEED_BY_ID, pool);
}

/* ================= UI ================= */
const $screen = document.getElementById("screen");
let TAB = "progres";   // accueil = Progrès (lanceur : bouton Réviser + niveau + métriques)
/* NAV = vrai pendant un rendu d'ARRIVÉE (changement d'onglet ou ouverture de l'app) :
   dans ce cas AUCUN son automatique. La prononciation auto ne se déclenche qu'en
   PROGRESSION (passage à la carte suivante après une réponse). */
let NAV = false;
document.getElementById("tabs").addEventListener("click", e=>{
  const b = e.target.closest("button"); if(!b) return;
  TAB = b.dataset.tab;
  document.querySelectorAll("#tabs button").forEach(x=>x.classList.toggle("active", x===b));
  NAV = true; render(); NAV = false;
});
function el(html){ const t=document.createElement("template"); t.innerHTML=html.trim(); return t.content.firstChild; }
let COOLDOWN_T = null;
function armCooldown(){
  /* anti-misclick : 450 ms de blocage des boutons quand une nouvelle carte apparaît
     (le doigt arrive parfois sur l'écran au moment du changement) */
  $screen.classList.add("cooldown");
  clearTimeout(COOLDOWN_T);
  COOLDOWN_T = setTimeout(()=>$screen.classList.remove("cooldown"), 450);
}
/* v113 : Takbon = UNE page, jamais de défilement en exercice (retour user « des fois je dois
   faire défiler » + « le texte toujours trop petit » — les deux se réconcilient en rendant la
   taille ADAPTATIVE). Par défaut le texte est GRAND ; si la carte (.card.center) déborde de
   #screen, on descend par paliers cumulatifs tk-fit1→3 (styles themes.css) jusqu'à tenir.
   Re-mesuré à chaque mutation du contenu (révélation, trivia, notes, Continuer), au resize
   (clavier) et au chargement des polices. Les transforms des animations « pressées » ne
   changent pas la hauteur de layout : mesurer pendant l'animation est sûr. */
const TK_FITS = ["tk-fit1","tk-fit2","tk-fit3"];
function takbonFit(){
  if(!isTakbon() || !$screen.querySelector(".card.center")){ $screen.classList.remove(...TK_FITS); return; }
  $screen.classList.remove(...TK_FITS);
  /* mesure de LAYOUT (offsetTop/offsetHeight), PAS scrollHeight : le débordement scrollable
     inclut les boîtes TRANSFORMÉES — au keyframe 0% la presse (scale 1.55) gonflait la mesure
     de ~230px et surcotait les paliers (fit3 au lieu de fit1). offset* ignore les transforms →
     décision juste dès la première frame, aucun ressaut visible. #screen est position:relative
     (themes.css) pour que offsetTop soit relatif à lui. */
  const padB = parseFloat(getComputedStyle($screen).paddingBottom) || 0;
  const fits = () => {
    let bottom = 0;
    for(const ch of $screen.children) bottom = Math.max(bottom, ch.offsetTop + ch.offsetHeight);
    return bottom + padB <= $screen.clientHeight + 1;
  };
  for(let i = 0; !fits() && i < TK_FITS.length; i++) $screen.classList.add(TK_FITS[i]);
}
let TK_FIT_RAF = 0;
function queueTakbonFit(){ cancelAnimationFrame(TK_FIT_RAF); TK_FIT_RAF = requestAnimationFrame(takbonFit); }
/* childList seulement : les changements de classe de takbonFit ne re-déclenchent pas l'observer */
new MutationObserver(queueTakbonFit).observe($screen, { childList:true, subtree:true });
window.addEventListener("resize", queueTakbonFit);
if(document.fonts && document.fonts.ready) document.fonts.ready.then(queueTakbonFit);
function render(){
  $screen.innerHTML="";
  if(TAB==="review"){ renderReview(); armCooldown(); }
  else if(TAB==="exercices") renderExercices();
  else renderStats();   // "progres" (accueil)
  updateDayCount();
}
/* onglet Exercices : les entraînements annexes (nombres à l'oreille + simulations) */
function renderExercices(){
  if(window.SORI_NUMBERS){
    SORI_NUMBERS.renderCard($screen, {
      speak: (txt)=>ttsSpeak(txt),
      onAnswer: (ok)=>logAnswer(ok, "nombres")
    });
  }
  /* 🧩 Structure de phrase : RETIRÉ de l'onglet en v67 (user : « je n'en vois pas l'intérêt »).
     structure.js reste chargé mais DORMANT (comme placement.js) ; le contenu EXTRA[id].base
     (981 phrases) et ST.strPos restent — réactivable en recâblant ce bloc (cf. MAINTENANCE v59/v62). */
  if(window.SORI_SCENARIOS && window.SCENARIOS){
    ST.scen = ST.scen || {};
    const scBox = el(`<div></div>`);
    SORI_SCENARIOS.renderList(scBox, {
      speak: (txt)=>ttsSpeak(txt),
      onAnswer: (ok)=>logAnswer(ok, "scenario"),
      getBest: (id)=>ST.scen[id],
      setBest: (id, v)=>{ ST.scen[id]=v; save(); }
    });
    $screen.appendChild(scBox);
  }
  /* v83→v89 : Conversation IA — désormais un ÉCRAN dédié (liste des conversations enregistrées,
     reprise, suppression, nouvelle avec ou sans scénario). Ici : juste la carte-lanceur. */
  if(window.SORI_CONVERSATION){
    const n = (ST.conv||[]).length;
    const cvCard = el(`<div class="card"><h2>Conversation</h2>
      <div class="row" style="margin-top:8px"><button class="btn" id="goconv">Ouvrir${n ? " · " + n + " enregistrée" + (n>1?"s":"") : ""}</button></div></div>`);
    cvCard.querySelector("#goconv").onclick = openConversation;
    $screen.appendChild(cvCard);
  }
}
/* v89 : écran Conversation (module conversation.js) — prend tout l'écran, retour → Exercices.
   Le contexte du modèle = SES mots maîtrisés (stage>=4) + ses 8 mots les plus fragiles
   (récupérabilité FSRS la plus basse) que le modèle glisse dans la conversation.
   Les conversations vivent dans ST.conv (→ sauvegarde cloud) : cap 12 conversations × 40
   messages stockés (~30 Ko max — budget cloud v65 respecté). */
const CONV_MAX = 12, CONV_MAX_MSGS = 40;
function openConversation(){
  const mastered = BASE_IDS
    .filter(id => SEED_BY_ID[id].type === "word")
    .map(id => eff(id))
    .filter(it => !it.sus && it.stage >= 4);
  const frag = mastered
    .map(it => ({ kr: SEED_BY_ID[it.id].kr, r: cardRetrievability(it) }))
    .sort((a,b) => a.r - b.r).slice(0, 8).map(x => x.kr);
  $screen.innerHTML = "";
  SORI_CONVERSATION.renderHome($screen, {
    cfg: convCfg,
    words: mastered.map(it => SEED_BY_ID[it.id].kr),
    fragiles: frag,
    speak: (txt)=>ttsSpeak(txt),
    store: {
      list: ()=> ST.conv || [],
      create: (sc)=>{
        ST.conv = ST.conv || [];
        if(ST.conv.length >= CONV_MAX){
          alert("Maximum " + CONV_MAX + " conversations — supprime-en une ancienne d'abord.");
          return null;
        }
        const t = todayStr();
        const conv = { id: "c" + Date.now().toString(36), t: "", d: t, u: t, sc: sc || null, h: [] };
        ST.conv.push(conv); save();
        return conv;
      },
      save: (conv)=>{
        conv.u = todayStr();
        if(conv.h && conv.h.length > CONV_MAX_MSGS) conv.h = conv.h.slice(-CONV_MAX_MSGS);
        save();
      },
      remove: (id)=>{ ST.conv = (ST.conv||[]).filter(c => c.id !== id); save(); }
    },
    onExit: ()=>{ NAV = true; render(); NAV = false; }
  });
}

/* ---------- mode Réviser ---------- */
let Q = null, QPOS = 0, BONUS = false, COMBO = 0, SESSFAIL = [];
/* la session en cours survit à un kill de l'app (Android) */
function saveSess(){
  ST.sess = (BONUS || !Q) ? null : { d:todayStr(), q:Q, p:QPOS, pen:PENDING,
    fp:[...FAILPOS], co:[...CONSOL], rp:[...REPRISE_IDS] };   // v68/v71 : sinon un kill transforme les vues blanches en révisions réelles
  save();
}
/* quitter la révision en cours → retour à l'accueil. La session est CONSERVÉE
   (saveSess), donc « ▶ Réviser » reprend exactement où on s'était arrêté. */
function leaveReview(){
  saveSess();
  TAB = "progres";
  document.querySelectorAll("#tabs button").forEach(x=>x.classList.toggle("active", x.dataset.tab==="progres"));
  NAV = true; render(); NAV = false;
}
function renderReview(){
  if(!Q){
    const s = ST.sess;
    /* v74 : une session commencée hier soir et non finie reste REPRENABLE (cas du passage de minuit) —
       avant, s.d===today échouait et jetait la file, perdant la place. On tolère hier ; au-delà, on reconstruit. */
    if(s && (s.d===todayStr() || s.d===addDays(todayStr(),-1)) && Array.isArray(s.q) && s.p < s.q.length){
      Q = s.q; QPOS = s.p; PENDING = s.pen||0; BONUS = false;   // reprise
      FAILPOS = new Map(s.fp||[]); CONSOL = new Set(s.co||[]); REPRISE_IDS = new Set(s.rp||[]);   // v68/v71 : transitoires restaurés
    } else {
      Q = buildQueue(); QPOS = 0; BONUS = false; COMBO = 0; SESSFAIL = [];
      FAILPOS.clear(); CONSOL.clear();                            // v68 : jamais de marqueurs d'une file précédente
      REPRISE_IDS = new Set(REPRISE);                             // v71 : marqueur d'affichage dédié
      REPRISE.forEach(id => CONSOL.add(id)); REPRISE = [];        // v71 : les reprises sont des vues blanches
      saveSess();
    }
  }
  if(QPOS >= Q.length){
    ST.sess = null; save();
    autoCloudBackup();                       // sauvegarde cloud silencieuse (1x/jour max)
    const t=todayStr(), l=ST.log[t]||{ok:0,ko:0};
    /* v74 : ne plus annoncer « tout est à jour » sur la seule base du débordement de session (PENDING).
       Recompter ce qui est RÉELLEMENT dû/disponible maintenant — exactement comme le lanceur — pour
       capter les cartes fraîchement échues (minuit franchi, révisions étalées sur la journée). */
    const effAll = ALL_IDS.map(eff).filter(x=>!x.sus);
    const stage0all = effAll.filter(x=>x.stage===0).length;
    const newLeft = Math.min(Math.max(0,(ST.set.newPerDay||0)-(ST.intro[t]||0)), stage0all);
    const remaining = ENGINE.selectDue(effAll, t).length + newLeft;
    const more = remaining>0 ? `<button class="btn ghost" id="more">Continuer les révisions (${remaining} en attente)</button>` : "";
    /* v73 : le sceau se POSE, son calé sur l'impact ; v74 : seulement si plus rien n'est réellement dû */
    if(remaining===0 && !NAV) setTimeout(sfxStamp, 170);
    $screen.appendChild(el(`<div class="card center">
      ${remaining>0
        ? `<div class="seal-wrap"><div class="done-kr">수고했어요</div></div><h2>Session terminée — il en reste</h2>`
        : `<div class="seal-wrap"><div class="dojang"><span>끝</span></div><div class="done-kr">오늘 끝.</div></div><h2>Tout est à jour</h2>`}
      <p class="dim">${l.ok||0} bonnes réponses aujourd'hui${l.ko?`, ${l.ko} à retravailler`:""}.</p>
      <p class="dim">${(m=>`${m.length} cartes maîtrisées, dont ${m.filter(it=>it.itv>=14).length} ancrées (intervalle ≥ 2 semaines)`)(BASE_IDS.map(eff).filter(it=>it.stage>=4))}.</p>
      <div class="row" style="margin-top:12px">
        ${more}
        <button class="btn ghost" id="reviewmore">Réviser 10 de plus</button>
        <button class="btn ghost" id="learnmore">Apprendre 10 nouvelles</button>
      </div>
      <p class="dim note" style="margin-top:8px">Autant de fois que tu veux — ces cartes comptent dans ta progression.</p></div>`));
    /* récap : les mots ratés de la session, à réécouter d'un tap */
    if(SESSFAIL.length){
      const rec = el(`<div class="card"><h2>À retravailler (${SESSFAIL.length})</h2>
        <p class="dim">Les ratés de cette session — tape un mot pour l'écouter.</p>
        <div class="list"></div></div>`);
      const list = rec.querySelector(".list");
      SESSFAIL.slice(0,10).forEach(id=>{
        const o = SEED_BY_ID[id]; if(!o) return;
        const xn = (EXTRA[baseId(id)]||{}).note;      // note résolue via l'id de base (cartes verso)
        const row = el(`<div class="item"><div class="txt"><div class="kr">${esc(o.kr)}</div>
          <div class="fr">${esc(o.fr)}${xn?` — ${esc(xn)}`:""}</div></div>
          <button class="speak">${SVG_SPK}</button></div>`);
        row.onclick = ()=>speak(o.kr, id);
        list.appendChild(row);
      });
      $screen.appendChild(rec);
    }
    const m=document.getElementById("more");
    if(m) m.onclick = ()=>{ Q=null; render(); };
    document.getElementById("reviewmore").onclick = ()=>{
      const q = reviewMoreQueue(10);
      if(!q.length){ alert("Aucune carte commencée à réviser pour l'instant — apprends-en de nouvelles !"); return; }
      Q = q; QPOS = 0; BONUS = false; FAILPOS.clear(); CONSOL.clear(); REPRISE_IDS.clear(); render();
    };
    document.getElementById("learnmore").onclick = ()=>{
      const q = learnMoreQueue(10);
      if(!q.length){ alert("Bravo — tu as déjà commencé toutes les cartes du deck !"); return; }
      Q = q; QPOS = 0; BONUS = false; FAILPOS.clear(); CONSOL.clear(); REPRISE_IDS.clear(); render();
    };
    /* 🎯 quêtes du jour en mode compact (fin de session) — masqué v28 (SHOW_QUESTS) */
    if(SHOW_QUESTS && window.SORI_QUESTS){
      const qd = (ST.qdone && ST.qdone.d===t) ? ST.qdone : (ST.qdone = {d:t, ids:{}});
      SORI_QUESTS.renderCard($screen, {
        today: t, log: ST.log, compact: true,
        state: { xp: ST.xp||0, streak: streak(), qdone: qd.ids },
        onClaim: (id, bonus)=>{
          qd.ids[id] = true;
          ST.xp = (ST.xp||0) + bonus;
          const ld = ST.log[t] || (ST.log[t]={ok:0,ko:0,n:0,listen:0});
          ld.xp = (ld.xp||0) + bonus;
          save(); render();
        }
      });
    }
    return;
  }
  const it = eff(Q[QPOS]);
  /* carte mise de côté (rangée par le nettoyage niveau) : on la saute, même si elle traîne
     encore dans une session sauvegardée. Garde l'effet du nettoyage sans aucune UI. */
  if(it.sus){ QPOS++; saveSess(); return renderReview(); }
  /* v106 : bouton « Je le sais » retiré (jamais utilisé — 0 fois en 15 jours de données ;
     markKnown reste défini, dormant). .rev-top/.rev-count : en Takbon la barre est masquée
     et le compteur devient l'affichage principal (themes.css). */
  const head = el(`<div class="rev-top">
    <div class="progressbar"><div style="width:${Math.round(100*QPOS/Q.length)}%"></div></div>
    <div class="rev-head">
      <div class="dim"><span class="rev-count">${QPOS+1} / ${Q.length}</span>
        ${it.rev?'<span class="pill stage">production</span>':(ST.set.reverse!==false && it.type==="word"?'<span class="pill">compréhension</span>':"")}
        ${it.enemy?'<span class="pill enemy">ennemie</span>':""}
        ${REPRISE_IDS.has(it.id)?'<span class="pill">reprise</span>':""}
        <span class="pill stage">niv ${it.stage}</span>
        ${COMBO>=3?`<span class="pill stage">×${COMBO}</span>`:""}</div>
      <div class="rev-actions">
        <button class="escbtn" id="quitrev" title="Quitter la révision (la progression est gardée)">Quitter</button>
      </div>
    </div></div>`);
  $screen.appendChild(head);
  head.querySelector("#quitrev").onclick = leaveReview;
  EXO_T0 = Date.now();
  /* v78 : une PHRASE conjuguée (≥2 mots, PAS un bloc lexical en forme dictionnaire) passe par le
     chemin phrase — compréhension + construction par étiquettes (la grammaire est DONNÉE par les
     chips). Avant, le seuil ≥3 mots laissait les phrases courtes filer en production libre FR→KR,
     où le français ne peut pas spécifier le connecteur/la politesse (retour user : « rien n'indiquait
     quelle construction faire »). On garde en production : les blocs en 다 (손을 씻다 = une seule
     forme) et les expressions d'un seul mot. */
  const krCore = it.kr.trim().replace(/[.?!…]+$/, "");
  const isPhrase = it.type==="phrase" && krCore.split(" ").length>=2 && !/다$/.test(krCore);
  const revMode = ST.set.reverse !== false;
  const typingTop = it.stage===5 && ST.set.typing===true && window.SORI_TYPING && Math.random()<0.5;
  function typingExo(){
    SORI_TYPING.render($screen, { item: it, speak:(kr,id)=>speak(kr,id), onResult: ok=>afterAnswer(it, ok, false, "type") });
  }
  if(it.rev){
    /* ===== carte VERSO — PRODUCTION FR→KR (mots) : QCM(1) → rappel+syllabe(2-3) → sans aide(4+) → hangul(5) ===== */
    if(it.stage<=1) exoQcmFr2Kr(it);
    else if(it.stage<=3) exoRecall(it, true);
    else if(typingTop) typingExo();
    else exoRecall(it, false);
  } else if(isPhrase){
    /* ===== PHRASES (recto unique) : QCM(1) → construction(2+) + parfois rappel du sens ===== */
    if(it.stage<=1) exoQcmKr2Fr(it);
    else if(it.stage>=4 && Math.random()<0.35) exoRecallRev(it);
    else exoBuild(it);
  } else if(it.stage<=1){
    exoQcmKr2Fr(it);                             // QCM compréhension KR→FR (les deux modes)
  } else if(revMode){
    /* ===== carte RECTO — COMPRÉHENSION KR→FR : la production est sur la carte verso ===== */
    exoRecallRev(it);                            // montre KR, rappelle le sens (auto-évalué)
  } else {
    /* ===== CARTE UNIQUE (mode par défaut) — une seule carte teste LES DEUX SENS :
       niv 1 = QCM (géré au-dessus) · niv 2 = production FR→KR + 1re syllabe (amorce) ·
       niv 3+ = ALTERNANCE production (sans aide) / sens INVERSÉ (compréhension KR→FR), + hangul au sommet.
       L'inversé est ainsi un exercice ALTERNATIF dès le niveau 3, testé au même titre que le sens normal. */
    if(it.stage<=2){
      exoRecall(it, true);                       // production + 1re syllabe
    } else if(it.lp > 0){
      exoRecall(it, false);                      // v68 : rattrapage post-lapse — production forcée (2 révisions)
    } else if(typingTop && it.type==="word" && Math.random()<0.5){
      typingExo();
    } else if(((it.ok + it.ko) % 2) === 0){
      /* v68 : alternance DÉTERMINISTE par carte (parité des réponses) — l'ancien tirage par rendu
         laissait 6% des cartes sans AUCUNE production sur 4 révisions (écart de stabilité ×13
         entre les extrêmes), et quitter/rouvrir re-tirait l'exercice. */
      exoRecallRev(it);                          // sens inversé (compréhension) — alternative à parité
    } else {
      exoRecall(it, false);                      // production sans aide
    }
  }
}
/* apprendre plus de nouvelles cartes À LA DEMANDE (au-delà du plafond quotidien),
   avec VRAIE progression (ça compte dans la planification). Répond au besoin
   « je veux réviser autant que je veux » : répétable, chaque lot fait avancer le deck. */
function learnMoreQueue(n){
  const t = todayStr();
  const picked = ENGINE.pickNew(ALL_IDS.map(eff).filter(it=>!it.sus), n*2, ST.set.kitFirst, newRank);   // ×2 recto+verso ; !sus : les rangées ne reviennent pas par ce chemin (v68)
  const news = introduceCards(picked, n, t);                                        // paires recto+verso
  if(news.length) save();
  return shuffle(news.slice());
}
/* récupérabilité FSRS estimée « maintenant » d'une carte (proba de rappel) — plus BASSE = plus fragile.
   Unifiée : utilise la stabilité FSRS S si présente, sinon l'amorce depuis l'intervalle (comme la migration),
   d'où une mesure cohérente pour toutes les cartes, en mode FSRS comme Classique. */
function cardRetrievability(it){
  const S = (typeof it.S === "number") ? it.S : Math.max(0.5, it.itv || 1);
  const elapsed = it.due ? Math.max(0, ENGINE.daysBetween(ENGINE.prevReviewDate(it), todayStr())) : 0;
  return ENGINE.fsrsR(elapsed, S);
}
/* réviser plus de cartes À LA DEMANDE (au-delà des échues du jour), les plus FRAGILES d'abord :
   fragilité FSRS = récupérabilité la plus basse (cartes au bord de l'oubli), puis les plus souvent ratées.
   Répond au besoin « j'ai fini mes révisions et j'ai encore du temps » : révision anticipée, vraie planif
   (ça compte). Les cartes de la file qu'on vient de terminer sont dépriorisées (pas resservies en boucle). */
function reviewMoreQueue(n){
  const doneNow = new Set(Q||[]);
  const t = todayStr();
  const cands = ALL_IDS.map(eff).filter(it=>!it.sus && it.stage>=1);   // cartes déjà commencées, hors mises de côté
  const R = new Map(cands.map(it=>[it.id, cardRetrievability(it)]));   // calcul une seule fois par carte
  cands.sort((a,b)=>
    (doneNow.has(a.id)?1:0)-(doneNow.has(b.id)?1:0)     // pas revues à l'instant → d'abord
    || ((a.due && a.due<=t)?0:1)-((b.due && b.due<=t)?0:1)   // v68 : échues/ratées du jour d'abord (leur R vaut 1.0 à elapsed 0 et les reléguait en queue)
    || R.get(a.id)-R.get(b.id)                           // récupérabilité la plus basse = au bord de l'oubli
    || (b.ko-a.ko)                                        // puis les plus souvent ratées
    || (a.id<b.id?-1:1));                                 // départage stable
  return shuffle(cands.slice(0,n).map(it=>it.id));
}
/* boss fight — DORMANT (aucun bouton câblé depuis v42 ; audit v68). Si réactivé : refuser de
   démarrer si ST.sess existe (sinon écrase la session en cours) et recalculer PENDING. */
function bossCandidates(){
  return ALL_IDS.map(eff).filter(it=>it.enemy && !it.sus && it.stage>=1 && it.stage<=4)
    .sort((a,b)=>a.stage-b.stage || (a.ko-b.ko));
}
function startBoss(){
  const c = bossCandidates().slice(0,20).map(it=>it.id);
  if(!c.length) return;
  Q = shuffle(c); QPOS = 0; BONUS = false;   // vraies révisions : ça compte pour la planif
  TAB = "review";
  document.querySelectorAll("#tabs button").forEach(x=>x.classList.toggle("active", x.dataset.tab==="review"));
  saveSess(); render();
}
/* découpe une phrase KR en eojeol (mots séparés par des espaces).
   DOIT correspondre exactement au découpage qui a servi à générer EXTRA[id].gl
   (Python ex.split()) sinon l'alignement mot↔glose casse. */
function exTokens(ex){ return String(ex==null?"":ex).trim().split(/\s+/).filter(Boolean); }

/* encart d'aide (phrase d'exemple, faux ami, note hanja) — contenu dans extra.js.
   Deux options opt-in (Réglages) greffées sur la phrase d'exemple :
     • ST.set.exaudio  → bouton 🔊 (audio natif de la phrase)
     • ST.set.wordgloss→ chaque mot cliquable affiche sa traduction (EXTRA[id].gl) */
function showTrivia(card, it){
  const bid = baseId(it.id);          // trivia/glose/cefr indexés par l'id de base (partagés recto/verso)
  const x = EXTRA[bid];
  if(!x) return false;
  const toks = x.ex ? exTokens(x.ex) : [];
  const glossOn = ST.set.wordgloss===true && Array.isArray(x.gl) && x.gl.length===toks.length && toks.length>0;
  const bits = [];
  if(x.ex){
    const exHtml = glossOn
      ? toks.map((w,i)=>`<span class="w" data-i="${i}">${esc(w)}</span>`).join(" ")
      : esc(x.ex);
    const spk = ST.set.exaudio===true ? ` <button class="exspeak" title="Écouter la phrase">${SVG_SPK}</button>` : "";
    bits.push(`<div class="tkr">${exHtml}${spk}</div>${x.exFr?`<div class="tfr">${esc(x.exFr)}</div>`:""}`);
  }
  if(x.conj) bits.push(`<div class="tconj">활용 ${esc(x.conj)}</div>`);
  if(x.note) bits.push(`<div class="tnote">${esc(x.note)}</div>`);
  /* décomposition d'une PHRASE : chaque bout de la phrase + son sens, puis la construction (grammaire).
     Répond au besoin « quand on traduit une phrase entière, expliquer les mots et leur construction ».
     Contrat : EXTRA[id].words = [[bout_kr, sens_fr], …] ; EXTRA[id].build = "explication". */
  if(it.type==="phrase" && Array.isArray(x.words) && x.words.length){
    const rows = x.words.map(p=>`<div class="wbrow"><span class="wbk">${esc(p[0])}</span><span class="wbg">${esc(p[1]||"")}</span></div>`).join("");
    bits.unshift(`<div class="wbreak"><div class="wbt">Mot à mot</div>${rows}</div>`);
  }
  if(it.type==="phrase" && x.build) bits.push(`<div class="tnote tbuild"><b>Construction :</b> ${esc(x.build)}</div>`);
  if(!bits.length) return false;
  const box = el(`<div class="trivia">${bits.join("")}</div>`);
  /* 🔊 phrase */
  const sp = box.querySelector(".exspeak");
  if(sp) sp.onclick = ev=>{ ev.stopPropagation(); speakEx(bid, x.ex); };
  /* tap-mot → glose (barre insérée juste sous la phrase) */
  if(glossOn){
    const bar = el(`<div class="glossbar" hidden></div>`);
    box.querySelector(".tkr").after(bar);
    box.querySelectorAll(".w").forEach(w=>{
      w.onclick = ev=>{
        ev.stopPropagation();
        const i = +w.dataset.i;
        box.querySelectorAll(".w.on").forEach(o=>o.classList.remove("on"));
        w.classList.add("on");
        bar.hidden = false;
        bar.innerHTML = `<b>${esc(toks[i])}</b> — ${esc(x.gl[i]||"?")}`;
      };
    });
  }
  card.appendChild(box);
  return true;
}
/* plafond de note FSRS par EXERCICE (l'aide fournie borne la preuve de mémoire) :
   reconnaissance (QCM) = Difficile(2) max ; rappel indicé/construction/sens = Bien(3) ;
   rappel sans aide / écrit = Facile(4). Empêche une réponse assistée de gonfler la stabilité. */
/* v64 (retour user) : le rappel INDICÉ (1re syllabe = indice énorme) et le sens INVERSÉ (KR→FR,
   direction facile) ne créditent plus que Difficile(2) — la stabilité ne grimpe vite que sur une
   preuve de PRODUCTION sans aide (rec5/type). build reste à 3 : seule vraie « production » des phrases. */
const KIND_MAXGRADE = { qcm1:2, qcm2:2, qcm3:2, build:3, rec4:2, recrev:2, rec5:4, type:4 };
function maxGradeFor(it, kind){
  /* en mode « Production séparée » (reverse ON), le rappel inversé est l'exercice CANONIQUE de la
     carte recto (la production vit sur sa carte verso) → pas un exercice « aidé », plafond normal.
     Sans ça, une carte recto ne pourrait JAMAIS créditer mieux que Difficile (revue adversariale v64). */
  if(kind === "recrev" && ST.set.reverse !== false && it && !it.rev) return 3;
  return KIND_MAXGRADE[kind] || 3;
}
/* v68 — re-vus INTRA-SESSION de consolidation (audit : rétention à J+1 des vraies nouveautés = 69%
   alors que le modèle suppose 91% ; et le re-vu d'échec arrive ~30-45 s après = mémoire courte).
   Deux files transitoires (session courante ; perdues à la reprise, dégradation douce) :
   - FAILPOS  : position de l'échec → si le re-vu réussi arrive à <3 cartes d'écart (fin de file),
     c'est de la mémoire immédiate → vue BLANCHE (aucun crédit, la carte reste due) ; sinon crédit
     normal + une vue de consolidation planifiée à +20-30 cartes.
   - CONSOL   : ids dont la prochaine présentation est une vue BLANCHE (exercice joué, journalisé
     dans les stats du jour, mais AUCUNE replanification/stage) ; une vue blanche RATÉE redevient
     un échec réel. Les vraies nouveautés (1re exposition réussie) reçoivent une vue à +8-12. */
let FAILPOS = new Map(), CONSOL = new Set(), REPRISE_IDS = new Set();   // v71 : pill « reprise » (sous-ensemble de CONSOL)
function afterAnswer(it, ok, sawTrivia, kind, grade, capMax){
  LASTANS = { id: it.id, kr: it.kr, ok, kind };   // contexte pour les rapports 🐞
  armUndo();                                // photo AVANT toute mutation (annulation possible)
  const maxG = (capMax !== undefined) ? capMax : maxGradeFor(it, kind);   // v76 : override de plafond (indice 다) sans toucher `kind` (stats/lp/quêtes)
  const Graw = ok ? (grade || 3) : 1;                    // la note réellement CHOISIE (Bien par défaut)
  const G = ok ? Math.min(Graw, maxG) : 1;               // note plafonnée par l'aide (canal stabilité)
  const rt = EXO_T0 ? Date.now() - EXO_T0 : 0;           // temps de réponse (ms) — agrégats ET journal (v65)
  let blanc = false;
  if(!BONUS && CONSOL.has(it.id)){ CONSOL.delete(it.id); REPRISE_IDS.delete(it.id); if(ok) blanc = true; }   // consolidation réussie = blanche ; ratée = échec réel
  if(blanc){                                                     // v71 : heure du contact (les vues blanches ne journalisent pas)
    const nw = new Date(), td = todayStr();
    if(!ST.rep || ST.rep.d !== td) ST.rep = { d: td, m: {} };
    ST.rep.m[it.id] = nw.getHours()*60 + nw.getMinutes();
  }
  if(!BONUS && ok && FAILPOS.has(it.id)){
    const gap = QPOS - FAILPOS.get(it.id);
    FAILPOS.delete(it.id);
    if(gap < 3){ blanc = true; PENDING++; }              // re-vu immédiat (clamp fin de file) : pas de crédit — la carte reste DUE, comptée en attente (revue v68)
    else if(!blanc){                                     // rattrapage crédité → consolidation à +20-30 cartes
      const p = Math.min(Q.length, QPOS + 20 + Math.floor(Math.random()*11));
      Q.splice(p, 0, it.id); CONSOL.add(it.id);
    }
  } else if(!BONUS && !blanc && ok && it.stage === 1 && (it.ok|0) === 0 && (it.ko|0) === 0){
    const p = Math.min(Q.length, QPOS + 8 + Math.floor(Math.random()*5));   // vraie nouveauté : consolider le jour même
    Q.splice(p, 0, it.id); CONSOL.add(it.id);
  }
  const r = (BONUS || blanc) ? null : applyAnswer(it, ok, G, Graw, kind, rt);
  logAnswer(ok, kind || "review", r, rt);
  /* combo & XP (plancher motivant, jamais bloquant) */
  if(ok) COMBO++; else { COMBO = 0; if(!SESSFAIL.includes(it.id)) SESSFAIL.push(it.id); }
  if(!BONUS){
    const gain = ok ? 10 + 2*Math.min(Math.max(COMBO-1,0), 10) : 2;
    ST.xp = (ST.xp||0) + gain;
    const l = ST.log[todayStr()]; if(l) l.xp = (l.xp||0) + gain;
  }
  if(!ok && !BONUS){ // re-poser dans la session, 3-5 cartes plus loin
    FAILPOS.set(it.id, QPOS);                            // v68 : mémorise la position d'échec (crédit du re-vu conditionné à l'écart)
    const pos = Math.min(Q.length, QPOS + 3 + Math.floor(Math.random()*3));
    Q.splice(pos, 0, it.id);
  }
  QPOS++;
  saveSess();
  /* TOUJOURS au clic (cohérent, fini les avances-surprises) + annulation à portée de pouce */
  const row = el(`<div class="row" style="margin-top:12px">
    <button class="btn ghost" id="undo" title="annuler cette réponse" style="flex:0 0 25%">↶</button>
    <button class="btn ghost" id="cont">Continuer</button></div>`);
  row.querySelector("#cont").onclick = ()=>{ UNDO = null; render(); };
  row.querySelector("#undo").onclick = undoLast;
  ($screen.querySelector(".card:last-of-type") || $screen).appendChild(row);
  row.scrollIntoView({block:"nearest", behavior:"smooth"});
}
/* stage 1-2 : QCM coréen -> français */
function exoQcmKr2Fr(it){
  const ds = distractors(it, 3, "fr");
  const opts = shuffle([it.id, ...ds]);
  const card = el(`<div class="card center">
    <div class="dim">Que veut dire…</div>
    <div class="big-kr ${it.type==="phrase"?"phrase":""}">${esc(it.kr)}</div>
    <button class="speak" title="écouter">${SVG_SPK}</button>
    <div class="opts"></div></div>`);
  card.querySelector(".speak").onclick = ()=>speak(it.kr, it.id);
  const box = card.querySelector(".opts");
  opts.forEach(id=>{
    const o = SEED_BY_ID[id];
    const b = el(`<button>${esc(o.fr)}</button>`);
    b.onclick = ()=>{
      const ok = id===it.id;
      box.querySelectorAll("button").forEach(x=>x.disabled=true);
      b.classList.add(ok?"good":"bad");
      const goodBtn = [...box.children].find(x=>x.textContent===SEED_BY_ID[it.id].fr);
      goodBtn?.classList.add("good");
      /* compacter : ne garder que la bonne réponse (+ la tienne si fausse) -> Continuer visible sans défiler */
      [...box.children].forEach(x=>{ if(x!==b && x!==goodBtn) x.remove(); });
      speak(it.kr, it.id);
      afterAnswer(it, ok, showTrivia(card, it), it.stage<=1?"qcm1":"qcm2");
    };
    box.appendChild(b);
  });
  $screen.appendChild(card);
  if(ST.set.autoplay && !NAV) speak(it.kr, it.id);
}
/* stage 3 : QCM français -> coréen */
function exoQcmFr2Kr(it){
  const ds = distractors(it, 3, "kr");
  const opts = shuffle([it.id, ...ds]);
  const card = el(`<div class="card center">
    <div class="dim">Comment dit-on…</div>
    <div class="big-fr">${esc(it.fr)}</div>
    <div class="opts"></div></div>`);
  const box = card.querySelector(".opts");
  opts.forEach(id=>{
    const o = SEED_BY_ID[id];
    const b = el(`<button class="kr">${esc(o.kr)}</button>`);
    b.onclick = ()=>{
      const ok = id===it.id;
      box.querySelectorAll("button").forEach(x=>x.disabled=true);
      b.classList.add(ok?"good":"bad");
      const goodBtn = [...box.children].find(x=>x.textContent===SEED_BY_ID[it.id].kr);
      goodBtn?.classList.add("good");
      [...box.children].forEach(x=>{ if(x!==b && x!==goodBtn) x.remove(); });
      speak(it.kr, it.id);
      afterAnswer(it, ok, showTrivia(card, it), "qcm3");
    };
    box.appendChild(b);
  });
  $screen.appendChild(card);
}
/* stage 4-5 : rappel (indicé ou pur), auto-évalué */
/* boutons d'auto-évaluation après « Montrer » : 4 notes FSRS (Encore/Difficile/Bien/Facile)
   si ST.set.grade4, sinon binaire (Encore/Bien). La note (1-4) affine la planification FSRS
   (Difficile = pénalité w15, Facile = bonus w16). ok = note ≥ 2 (pour combo/rétention). */
function gradeButtons(row, it, kind, capMax){
  row.innerHTML = "";
  const maxG = (capMax !== undefined) ? capMax : maxGradeFor(it, kind);   // capMax : override v76 (indice 다 = plafond levé, `kind` reste rec4)
  const wire = (b, ok, g) => { b.onclick = ()=>{ [...row.children].forEach(x=>x.disabled=true); afterAnswer(it, ok, false, kind, g, maxG); }; return b; };
  /* v69 : l'INTERVALLE résultant s'affiche sous chaque note — la conséquence du choix devient
     visible. Prévisualisation EXACTE : mêmes options que applyAnswer (plafond, gradeD, fuzz). */
  const ivl = g => {
    if(ST.set.scheduler === "legacy") return "";
    /* vue BLANCHE à venir (v68 : consolidation, ou re-vu immédiat de fin de file) :
       la réponse ne replanifiera rien — afficher un intervalle serait mentir. */
    if(CONSOL.has(it.id) || (FAILPOS.has(it.id) && (QPOS - FAILPOS.get(it.id)) < 3)) return "";
    try{
      const t = todayStr();
      const r = ENGINE.fsrsSchedule(it, Math.min(g, maxG), t,
        { w: fsrsW(), retention: ST.set.fsrsRetention || 0.9, gradeD: g, fuzz: it.id + "|" + t });
      return `<span class="ans-ivl">${g === 1 ? "re-vu" : (r.i <= 0 ? "aujourd'hui" : r.i + " j")}</span>`;
    }catch(_){ return ""; }
  };
  /* plafond ≤ Difficile (exercice aidé) : une seule note positive possible → paire binaire,
     comme le QCM. On transmet la note BRUTE (Bien) : afterAnswer plafonne pour la stabilité,
     la difficulté D reste sur la note choisie (v64, dissociation des canaux). */
  if(ST.set.grade4 !== false && maxG > 2){
    row.classList.add("g4row");
    /* on n'offre que les notes atteignables : ex. rappel indicé → pas de « Facile » (plafond Bien). */
    const defs = [["Encore","btn ko",false,1],["Difficile","btn",true,2],["Bien","btn ok",true,3],["Facile","btn",true,4]];
    defs.filter(d => d[3] <= maxG).forEach(([lbl,cls,ok,g]) =>
      row.append(wire(el(`<button class="${cls} g4"><b>${lbl}</b>${ivl(g)}</button>`), ok, g)));
  } else {
    row.append(
      wire(el(`<button class="btn ko g4"><b>Encore</b>${ivl(1)}</button>`), false, 1),
      wire(el(`<button class="btn ok g4"><b>Bien</b>${ivl(3)}</button>`),   true,  3));   // brute ; afterAnswer plafonne (canal S)
  }
}
/* v103 : le thème « Takbon » change le DÉCLENCHEUR de révélation — des creux à toucher
   (.slots/.slot-wide/.slots-h, stylés dans themes.css) au lieu du bouton Montrer. Source de
   vérité = la CLASSE réellement posée sur <html> (pas localStorage, qui peut désynchroniser
   si un autre onglet change le thème — revue v103) ; le select de Réglages re-rend l'écran. */
function isTakbon(){ try{ return document.documentElement.classList.contains("theme-takbon"); }catch(_){ return false; } }
function exoRecall(it, hinted){
  /* indice (v76) : ENGINE.hintPlan choisit une position TOURNANTE (compteur ok+ko) et n'expose que
     l'attaque (jamo) quand révéler le bloc donnerait le mot (1 syll, radical d'un verbe 2 syll).
     meaningful=false (on est tombé sur le 다 prévisible) → l'indice ne donne rien → on LÈVE le plafond
     (recCap=Facile) SANS changer `kind` (reste rec4 : stats/lp/quêtes intacts — revue v76) ; sinon
     indice réel → rec4 plafonné à Difficile (inchangé v64). Le rappel SANS aide reste rec5. */
  let hint = "", recKind = "rec5", recCap;
  if(hinted){
    const plan = ENGINE.hintPlan(it.kr, (it.ok||0) + (it.ko||0));
    recKind = "rec4";
    recCap = plan.meaningful ? undefined : 4;   // undefined -> plafond normal rec4 (Difficile) ; 4 -> Facile permis
    hint = `<div class="hint2">` + plan.tiles.map(u =>
        u.t === "gap"  ? `<span class="hgap"></span>`
      : u.t === "show" ? `<span class="hs show">${esc(u.ch)}</span>`
      : u.t === "jamo" ? `<span class="hs jamo">${esc(u.ch)}</span>`
      :                  `<span class="hs"></span>`
    ).join("") + `</div>`;
  }
  /* v115 (rapports 🐞 21/07) : plus d'instruction au-dessus du mot, plus de zone encadrée à
     cliquer (bouton Montrer / creux Takbon v103) — toucher la carte, mot compris, révèle.
     Les tuiles d'indice redeviennent un AFFICHAGE pur. Flux inchangé (kind/capMax/notes). */
  const card = el(`<div class="card center">
    <div class="big-fr">${esc(it.fr)}</div>${hint}
    <div class="feedback"></div>
    <div class="tapreveal">touche pour révéler</div>
    <div class="row" style="margin-top:12px"></div></div>`);
  card.onclick = ()=>{
    card.onclick = null;                          // une seule révélation ; ensuite les taps vont aux notes
    card.querySelector(".tapreveal").remove();
    /* mot révélé + bouton 🔊 pour le réécouter pendant la notation */
    card.querySelector(".feedback").innerHTML = `<span class="kr">${esc(it.kr)}</span> <button class="speak" title="écouter">${SVG_SPK}</button>`;
    card.querySelector(".feedback .speak").onclick = ()=>speak(it.kr, it.id);
    speak(it.kr, it.id);
    showTrivia(card, it);        // lisible pendant l'auto-évaluation
    gradeButtons(card.querySelector(".row"), it, recKind, recCap);
  };
  $screen.appendChild(card);
}
/* stage 4-5 (variante) : rappel inversé — je vois le coréen, je donne le sens */
function exoRecallRev(it){
  /* v115 (rapports 🐞 21/07) : plus d'instruction, plus d'icône 🔊 ni de zone à cliquer —
     toucher la carte (le mot compris) révèle le sens ; après, toucher le mot le fait réécouter. */
  const card = el(`<div class="card center">
    <div class="big-kr ${it.type==="phrase"?"phrase":""}">${esc(it.kr)}</div>
    <div class="feedback"></div>
    <div class="tapreveal">touche pour révéler</div>
    <div class="row" style="margin-top:12px"></div></div>`);
  card.onclick = ()=>{
    card.onclick = null;
    card.querySelector(".tapreveal").remove();
    card.querySelector(".feedback").innerHTML = `<span class="kr">${esc(it.fr)}</span>`;
    card.querySelector(".big-kr").onclick = ()=>speak(it.kr, it.id);   // réécoute au tap sur le mot
    showTrivia(card, it);
    gradeButtons(card.querySelector(".row"), it, "recrev");
  };
  $screen.appendChild(card);
  if(ST.set.autoplay && !NAV) speak(it.kr, it.id);
}
/* stage 3 (phrases) : construction de phrase façon Duolingo */
function exoBuild(it){
  const answer = it.kr.trim();
  const tokens = answer.split(" ");
  const pool = shuffle(tokens.map((w,i)=>({w, k:i})));
  const built = [];
  const card = el(`<div class="card center">
    <div class="dim">Construis la phrase</div>
    <div class="big-fr">${esc(it.fr)}</div>
    <div class="built"></div>
    <div class="pool"></div>
    <div class="feedback"></div></div>`);
  const $built = card.querySelector(".built");
  const $pool  = card.querySelector(".pool");
  function paint(){
    $built.innerHTML = built.length ? "" : `<span class="dim">touche les mots dans l'ordre…</span>`;
    built.forEach((t,idx)=>{
      const b = el(`<button class="chip">${esc(t.w)}</button>`);
      b.onclick = ()=>{ built.splice(idx,1); pool.push(t); paint(); };
      $built.appendChild(b);
    });
    $pool.innerHTML = "";
    pool.forEach((t,idx)=>{
      const b = el(`<button class="chip src">${esc(t.w)}</button>`);
      b.onclick = ()=>{ pool.splice(idx,1); built.push(t); paint(); if(!pool.length) check(); };
      $pool.appendChild(b);
    });
  }
  function check(){
    const got = built.map(t=>t.w).join(" ");
    const ok = got === answer;
    card.querySelector(".feedback").innerHTML =
      ok ? `<span style="color:var(--ok)">✓ ${esc(answer)}</span>`
         : `<span style="color:var(--ko)">✗</span> <span class="kr">${esc(answer)}</span>`;
    [...card.querySelectorAll(".chip")].forEach(b=>b.disabled=true);
    speak(answer, it.id);
    afterAnswer(it, ok, showTrivia(card, it), "build");
  }
  paint();
  $screen.appendChild(card);
}

/* ---------- mode Écoute ---------- */
let LQ=null, LPOS=0, LSCORE=0;
function renderListen(){
  /* Écoute = UNIQUEMENT l'entraîneur de NOMBRES à l'oreille (numbers.js).
     v42 : écoute passive (player) + compréhension QCM/dictée retirées (peu utiles).
     Le code du QCM plus bas est conservé mais devenu inatteignable (return ci-dessous) —
     réactivable en retirant player/QCM du masquage. */
  if(window.SORI_NUMBERS){
    SORI_NUMBERS.renderCard($screen, {
      speak: (txt)=>ttsSpeak(txt),
      onAnswer: (ok)=>logAnswer(ok, "nombres")
    });
  } else {
    $screen.appendChild(el(`<div class="card center"><p class="dim">Entraîneur de nombres indisponible.</p></div>`));
  }
  return;
  if(!("speechSynthesis" in window)){
    $screen.appendChild(el(`<div class="card center"><h2>👂 Écoute</h2>
      <p class="dim">La synthèse vocale n'est pas disponible sur cet appareil.</p></div>`));
    return;
  }
  if(!LQ){
    const pool = ALL_IDS.map(eff).filter(it=>it.stage>=2 && it.type==="word");
    shuffle(pool); LQ = pool.slice(0, ST.set.listenN||10).map(it=>it.id); LPOS=0; LSCORE=0;
    if(!LQ.length){
      $screen.appendChild(el(`<div class="card center"><h2>👂 Écoute</h2>
        <p class="dim">Étudie d'abord quelques mots en mode Réviser.</p></div>`));
      LQ=null; return;
    }
  }
  if(LPOS>=LQ.length){
    autoCloudBackup();                       // fin de bloc Écoute → sauvegarde cloud (throttle 5 min)
    $screen.appendChild(el(`<div class="card center"><div class="done-banner">👂</div>
      <h2>${LSCORE} / ${LQ.length}</h2><p class="dim">compréhension à l'oreille</p>
      <button class="btn" id="again" style="margin-top:10px">Encore une série</button></div>`));
    document.getElementById("again").onclick=()=>{ LQ=null; render(); };
    return;
  }
  const it = eff(LQ[LPOS]);
  EXO_T0 = Date.now();
  /* une fois sur deux : dictée — on choisit le HANGUL entendu (distracteurs sosies) */
  const dictee = LPOS % 2 === 1;
  const field = dictee ? "kr" : "fr";
  const ds = distractors(it, 3, field);
  const opts = shuffle([it.id, ...ds]);
  const card = el(`<div class="card center">
    <div class="dim">Écoute ${LPOS+1}/${LQ.length} — ${dictee?"quel mot as-tu entendu ?":"qu'est-ce que ça veut dire ?"}</div>
    <button class="speak" style="font-size:3rem; margin:14px 0">🔊</button>
    <div class="opts"></div>
    <div class="feedback" style="min-height:2.4em; margin-top:10px"></div></div>`);
  card.querySelector(".speak").onclick=()=>speak(it.kr, it.id);
  const box = card.querySelector(".opts");
  opts.forEach(id=>{
    const o=SEED_BY_ID[id];
    const b = el(`<button ${dictee?'class="kr"':""}>${esc(dictee?o.kr:o.fr)}</button>`);
    b.onclick=()=>{
      const ok=id===it.id;
      box.querySelectorAll("button").forEach(x=>x.disabled=true);
      b.classList.add(ok?"good":"bad");
      if(ok) LSCORE++;
      else {
        const target = dictee ? SEED_BY_ID[it.id].kr : SEED_BY_ID[it.id].fr;
        [...box.children].find(x=>x.textContent===target)?.classList.add("good");
      }
      card.querySelector(".feedback").innerHTML = `<span class="kr">${esc(it.kr)}</span> — ${esc(it.fr)}`;
      logAnswer(ok, dictee?"dictee":"listen", null, EXO_T0 ? Date.now()-EXO_T0 : 0);
      LPOS++;
      setTimeout(render, ok?800:1700);
    };
    box.appendChild(b);
  });
  $screen.appendChild(card);
  const speakOnLand = !NAV;   // pas de son auto si on vient juste d'arriver sur l'onglet Écoute
  setTimeout(()=>{ if(speakOnLand) speak(it.kr, it.id); }, 250);
}

/* ---------- mode Voyage ---------- */
const TRIP_LABELS = { resto:"🍜 Restaurant", transport:"🚕 Transports", hotel:"🏨 Hôtel",
  achats:"🛍️ Achats", urgence:"🚨 Urgences & santé", communication:"💬 Communication", deck:"⭐ Essentiels du deck" };
let DRILL=null, DPOS=0;
function renderTrip(){
  if(DRILL){ renderDrill(); return; }
  /* 🔍 Mon dictionnaire — recherche FR⇄KR dans tout le deck (search.js) */
  if(window.SORI_SEARCH){
    $screen.appendChild(el(`<div class="section-title">Mon dictionnaire</div>`));
    SORI_SEARCH.renderPanel($screen, {
      items: BASE_IDS.map(eff),        // pas de doublon recto/verso
      extra: EXTRA,
      onSpeak: (kr, id)=>speak(kr, id)
    });
  }
  /* simulations interactives (scenarios.js) — l'état "meilleur score" est additif dans ST.scen */
  if(window.SORI_SCENARIOS && window.SCENARIOS){
    ST.scen = ST.scen || {};
    const scBox = el(`<div></div>`);
    SORI_SCENARIOS.renderList(scBox, {
      speak: (txt)=>ttsSpeak(txt),
      onAnswer: (ok)=>logAnswer(ok, "scenario"),
      getBest: (id)=>ST.scen[id],
      setBest: (id, v)=>{ ST.scen[id]=v; save(); },
    });
    $screen.appendChild(scBox);
  }
  /* v42 : « kit de survie » (phrases isolées + drill audio) RETIRÉ (peu utile).
     Voyage = dictionnaire + simulations. renderDrill/DRILL/TRIP_LABELS conservés
     mais inatteignables (DRILL jamais réactivé ici) — réactivables si besoin. */
}
function renderDrill(){
  if(DPOS>=DRILL.length){
    $screen.appendChild(el(`<div class="card center"><div class="done-banner">🧳</div>
      <h2>Drill terminé</h2><button class="btn" id="back" style="margin-top:10px">Retour au kit</button></div>`));
    document.getElementById("back").onclick=()=>{ DRILL=null; render(); };
    return;
  }
  const it = eff(DRILL[DPOS]);
  const card = el(`<div class="card center">
    <div class="dim">Drill ${DPOS+1}/${DRILL.length} — écoute puis répète à voix haute</div>
    <div class="big-fr">${esc(it.fr)}</div>
    <div class="feedback"></div>
    <div class="row" style="margin-top:10px">
      <button class="btn ghost" id="hear">🔊 Réécouter</button>
      <button class="btn" id="rev">Voir + suivant</button>
    </div></div>`);
  let revealed=false;
  card.querySelector("#hear").onclick=()=>speak(it.kr, it.id);
  card.querySelector("#rev").onclick=()=>{
    if(!revealed){
      card.querySelector(".feedback").innerHTML=`<span class="kr">${esc(it.kr)}</span>`;
      card.querySelector("#rev").textContent="Suivant →"; revealed=true; speak(it.kr, it.id);
    } else { DPOS++; render(); }
  };
  $screen.appendChild(card);
  if(!NAV) speak(it.kr, it.id);   // drill : silencieux à l'arrivée, sonore en progression
}

/* ---------- Stats & réglages ---------- */
/* accueil = Progrès : LANCEUR (action d'abord) puis métriques. */
/* ===== historique de maîtrise (pour suivre la progression de niveau dans le temps) =====
   Snapshot quotidien du nb de cartes maîtrisées (stade≥4) par bande CEFR, stocké dans
   ST.lvlhist (clé ADDITIVE, préservée par loadState). Capté 1×/jour à l'ouverture de
   l'accueil. Sert au graphe "maîtrise gagnée/jour" et à l'ETA vers le niveau suivant.
   Sans ce journal, ces séries seraient impossibles (l'état ne garde que la maîtrise ACTUELLE). */
function lvlTotal(snap){ return snap ? ((snap.A1||0)+(snap.A2||0)+(snap.B1||0)+(snap.B2||0)+(snap.C1||0)) : 0; }
function captureLevelSnapshot(baseItems){
  const t = todayStr();
  ST.lvlhist = ST.lvlhist || {};
  if(ST.lvlhist[t]) return;                     // déjà capté aujourd'hui
  const snap = {A1:0,A2:0,B1:0,B2:0,C1:0};
  baseItems.forEach(it=>{ if(it.stage>=4){ const c=(EXTRA[it.id]||{}).cefr; if(snap[c]!==undefined) snap[c]++; } });
  ST.lvlhist[t] = snap;
  const days = Object.keys(ST.lvlhist).sort();  // borne l'historique (~400 jours)
  if(days.length > 400) days.slice(0, days.length-400).forEach(d=>delete ST.lvlhist[d]);
  save();
}
function renderStats(){
  const t=todayStr(), l=ST.log[t]||{ok:0,ko:0,n:0};
  const items = ALL_IDS.map(eff);              // recto + verso (pour le compteur du lanceur)
  const baseItems = items.filter(it=>!it.rev); // deck de compréhension : les métriques affichées comptent le vocabulaire, pas ×2
  captureLevelSnapshot(baseItems);             // journalise la maîtrise du jour (1×/jour)
  const stages=[0,0,0,0,0,0];
  baseItems.forEach(it=>stages[it.stage]++);
  const enemies = baseItems.filter(it=>it.enemy);
  const beaten = enemies.filter(it=>it.stage>=4).length;
  const matures = baseItems.filter(it=>it.stage>=4).length;   // cartes solides (niv ≥ 4)
  const seen = baseItems.filter(it=>it.stage>=1).length;       // cartes déjà abordées
  const r7 = ENGINE.retention7(ST.log, t);
  const ret = r7.r===null ? null : Math.round(100*r7.r);
  const leeches = baseItems.filter(it=>ENGINE.isLeech(it));

  /* ===== LANCEUR : l'action évidente en haut. Compte recto ET verso (tout ce qui est à réviser). ===== */
  const dueN = ENGINE.selectDue(items.filter(it=>!it.sus), t).length;   // les cartes rangées ne comptent pas
  const stage0all = items.filter(it=>it.stage===0 && !it.sus).length;   // introduisibles (recto + verso)
  const newLeft = Math.min(Math.max(0, (ST.set.newPerDay||0) - (ST.intro[t]||0)), stage0all);
  const todo = dueN + newLeft;
  /* v74 : HÉROS d'accueil — salut selon l'heure + CTA. Série de jours (streak + points) RETIRÉE
     sur retour user (« je ne vois pas l'intérêt »). streak() reste pour events/quests. */
  const hour = new Date().getHours();
  const greet = hour < 6 ? "안녕하세요" : hour < 12 ? "좋은 아침이에요" : hour < 18 ? "좋은 오후예요" : "좋은 저녁이에요";
  $screen.appendChild(el(`<div class="hero">
    <div class="hero-kr">${greet}</div>
  </div>`));
  const launch = el(`<button class="btn cta" id="goreview">Réviser<span class="num">${todo>0?`${todo} carte${todo>1?"s":""}`:"tout est à jour"}</span></button>`);
  launch.onclick = ()=>{
    TAB="review";
    document.querySelectorAll("#tabs button").forEach(x=>x.classList.toggle("active", x.dataset.tab==="review"));
    NAV=true; render(); NAV=false;
  };
  /* test de niveau one-shot retiré (v49) : les barres « maîtrise par niveau » sont plus
     fiables et toujours à jour. placement.js reste chargé mais dormant (réactivable). */
  $screen.appendChild(launch);
  const jx = Math.round((new Date("2026-10-01T12:00:00") - new Date(t+"T12:00:00"))/864e5);
  const evSeoul = window.SORI_EVENTS && !((ST.evDismiss||{})["seoul-2026"]);   // la carte événement affiche déjà le compte à rebours
  if(jx > 0 && !evSeoul) $screen.appendChild(el(`<div class="korea-line"><span>Départ pour la Corée</span><b class="num">J − ${jx}</b></div>`));

  /* événements actifs (countdown départ, défis…) — events-data.js / MAINTENANCE-EVENTS.md */
  if(window.SORI_EVENTS){
    ST.evDismiss = ST.evDismiss || {};
    SORI_EVENTS.renderCards($screen, {
      today: t, log: ST.log, dismissed: ST.evDismiss,
      onDismiss: id => { ST.evDismiss[id] = true; save(); }
    });
  }

  /* stats réelles (v28.1) : plus d'XP/niveau — gamification retirée. Mesures de PROGRÈS.
     Chaque tuile est cliquable → popin d'explication (demande utilisateur 🐞 v36). */
  /* v99 : 6 tuiles (grille équilibrée 3×2, retour user) — la 6e = « ancrées », la métrique honnête
     de v64 qui vivait enterrée dans une infobulle. Paires logiques côte à côte :
     aujourd'hui|réussite · maîtrisées|ancrées · ennemies|deck. */
  const anchored = baseItems.filter(it=>it.stage>=4 && it.itv>=14).length;
  const grid = el(`<div class="statgrid">
    <div class="stat"><div class="n">${l.n}</div><div class="l">réponses aujourd'hui</div></div>
    <div class="stat"><div class="n">${ret===null?"—":ret+" %"}</div><div class="l">réussite (7 j)</div></div>
    <div class="stat"><div class="n">${matures}</div><div class="l">cartes maîtrisées</div></div>
    <div class="stat"><div class="n">${anchored}</div><div class="l">ancrées</div></div>
    <div class="stat"><div class="n">${beaten}/${enemies.length}</div><div class="l">ennemies vaincues</div></div>
    <div class="stat"><div class="n">${seen} / ${baseItems.length}</div><div class="l">deck abordé</div></div>
  </div>`);
  const STAT_INFO = [
    ["Réponses aujourd'hui", "Le nombre de cartes que tu as répondues aujourd'hui, tous exercices confondus (QCM, rappel, écoute…)."],
    ["Réussite (7 jours)", "Ton taux de bonnes réponses sur les 7 derniers jours. On ne compte que la PREMIÈRE fois que tu vois chaque carte dans la journée — c'est le vrai test de mémoire, pas les re-essais."],
    ["Cartes maîtrisées", "Les cartes arrivées HAUT dans l'échelle de maîtrise (niv ≥ 4). Attention : monter l'échelle ≠ ancré durablement — la tuile « ancrées » à côté compte celles qui ont fait leurs preuves ; l'écart entre les deux, c'est ce qui reste à consolider."],
    ["Ancrées", "Les cartes maîtrisées dont l'intervalle a atteint 2 SEMAINES ou plus : tu les as retrouvées après de longs écarts sans les revoir — la vraie mémoire durable, la mesure la plus exigeante de cet écran. Elle grimpe naturellement avec le temps."],
    ["Ennemies vaincues", "Tes mots les plus ratés (les « ennemies ») que tu as réussi à ramener à un bon niveau (niv ≥ 4). Le premier chiffre = domptées, le second = total de tes ennemies."],
    ["Deck abordé", "Combien de cartes du deck tu as déjà commencé à étudier (vues au moins une fois), sur le total disponible. Le reste attend d'être introduit (30 nouvelles/jour dans tes réglages)."]
  ];
  grid.querySelectorAll(".stat").forEach((tile,i)=>{
    tile.classList.add("tap");
    tile.onclick = ()=>openInfo(STAT_INFO[i][0], STAT_INFO[i][1]);
  });
  $screen.appendChild(grid);

  /* ===== NIVEAU & PROGRESSION — niveau actuel (d'après les acquis), % + ETA vers le suivant,
     et deux graphes quotidiens (maîtrise gagnée/jour, réussite/jour). Maîtrise = stade≥4. ===== */
  const BANDS = ["A1","A2","B1","B2","C1"];
  const tot={A1:0,A2:0,B1:0,B2:0,C1:0}, mas={A1:0,A2:0,B1:0,B2:0,C1:0}, intro={A1:0,A2:0,B1:0,B2:0,C1:0};
  baseItems.forEach(it=>{ const c=(EXTRA[it.id]||{}).cefr; if(tot[c]!==undefined){ tot[c]++; if(it.stage>=4) mas[c]++; if(it.stage>=1) intro[c]++; } });
  const pct = b => tot[b] ? Math.round(100*mas[b]/tot[b]) : 0;
  let working = null;
  for(const b of BANDS){ if(tot[b] && mas[b]/tot[b] < 0.8){ working = b; break; } }             // niveau en cours : 1re bande < 80%
  const acquired = BANDS.filter(b=>tot[b] && mas[b]/tot[b] >= 0.8);                               // bandes solides (≥80%)
  const nextBand = working ? BANDS[BANDS.indexOf(working)+1] : null;
  const need = working ? Math.max(0, Math.ceil(0.8*tot[working]) - mas[working]) : 0;             // cartes restantes vers le seuil du niveau suivant

  const dd=(a,b)=>Math.round((new Date(a+"T12:00:00")-new Date(b+"T12:00:00"))/86400000);
  /* v108 : vitesse récente = cartes maîtrisées/jour sur 7 j (repli 21 j si historique court).
     La fenêtre de 21 j gardait la vague de rattrapage de début juillet au dénominateur : le
     rythme affiché restait ~3× le régime réel et l'ETA semblait figée (retour user « toujours
     19 jours, ça ne monte pas, ça ne descend pas »). */
  const paceFrom = win => {
    const p = Object.keys(ST.lvlhist||{}).sort().filter(d=>dd(t,d)<=win).map(d=>({d, tt:lvlTotal(ST.lvlhist[d])}));
    if(p.length<2) return null;
    const a=p[0], b=p[p.length-1], span=dd(b.d,a.d);
    return (span>=1 && b.tt>a.tt) ? (b.tt-a.tt)/span : null;
  };
  const pace = paceFrom(7) != null ? paceFrom(7) : paceFrom(21);
  const paceTxt = pace!=null ? (Math.round(pace*10)/10) : null;
  const nextPct = working ? Math.min(100, Math.round(100*(mas[working]/(0.8*tot[working])))) : 100;   // % du chemin vers le palier suivant
  $screen.appendChild(el(`<div class="card"><h2>Ton niveau</h2>
    <p style="margin:2px 0 8px"><span class="dim note">Niveau actuel (d'après tes acquis)</span><br>
      <b style="font-size:1.6rem;color:var(--acc)">${working||"tout acquis"}</b>${acquired.length?` <span class="dim note">· ${acquired.join(" · ")} acquis</span>`:""}${working&&nextBand?`<br><span class="dim note">Prochain palier : <b>${nextBand}</b> — ${nextPct}% du chemin</span>`:""}</p>
    <div class="levelbars">${BANDS.map(b=>`
      <div class="lvlrow">
        <span class="lvlname">${b}</span>
        <span class="lvltrack"><span class="lvlfill${b===working?" work":""}" style="width:${pct(b)}%"></span></span>
        <span class="lvlpct">${pct(b)}% <span class="dim note-xs">(${mas[b]}/${tot[b]})</span></span>
      </div>`).join("")}</div></div>`));

  /* 🧗 gain quotidien vers le prochain niveau (%/jour) — Δ maîtrise du niveau en cours ÷ son seuil (80%), 14 j */
  const gWin=[]; for(let i=13;i>=0;i--) gWin.push(addDays(t,-i));
  const wb = working, tgt = wb ? 0.8*tot[wb] : 0;
  let lastW=null;
  Object.keys(ST.lvlhist||{}).sort().forEach(d=>{ if(dd(gWin[0],d)>0){ const s=ST.lvlhist[d]; if(s) lastW = s[wb]||0; } });   // baseline avant la fenêtre
  const pg=gWin.map(d=>{ const s=(ST.lvlhist||{})[d]; if(!s||!wb) return {d,p:null}; const w=s[wb]||0; const dg=(lastW==null)?null:Math.max(0,w-lastW); lastW=w; return {d, p:(dg==null||tgt<=0)?null:(dg/tgt*100)}; });
  const anyPg = pg.some(x=>x.p!=null && x.p>0);
  const mxp = Math.max(0.5,...pg.map(x=>x.p||0));
  $screen.appendChild(el(`<div class="card"><h2>Gain vers le niveau suivant — 14 j</h2>
    <p class="dim note" style="margin-bottom:6px">${wb?`Chaque barre = <b>% du chemin</b> vers <b>${nextBand||"le niveau suivant"}</b> gagné ce jour-là (cartes solidifiées ÷ seuil du niveau).`:"Tous les niveaux du deck sont acquis."}</p>
    ${wb ? (anyPg
      ? `<div class="bars">${pg.map(x=>`<div class="b"><div style="height:${x.p==null?2:Math.max(2,Math.round(70*x.p/mxp))}px${x.d===t?";background:var(--acc)":""}${x.p==null?";opacity:.25":""}"></div><span>${x.p==null?"·":(Math.round(x.p*10)/10)}</span></div>`).join("")}</div>`
      : `<p class="dim note">L'historique se construit — les barres apparaîtront au fil de tes jours de révision.</p>`) : ""}</div>`));

  /* ⏳ temps estimé vers CHAQUE niveau à venir (cumulé) — cartes restantes ÷ vitesse récente.
     v108 : PLANCHER D'INTRODUCTION — finir un niveau exige d'abord d'INTRODUIRE ses cartes
     pas encore vues (≤ newPerDay/jour) ; sans ce plancher l'ETA promettait de maîtriser des
     cartes qui n'existaient pas encore dans la rotation (le « 19 j » impossible du retour user).
     ETA = max(restantes-à-maîtriser ÷ rythme, restantes-à-introduire ÷ nouvelles/jour). */
  const wi = BANDS.indexOf(working);
  const upcoming = (wi>=0 ? BANDS.slice(wi) : []).filter(b=>tot[b] && mas[b]/tot[b] < 0.8);
  const npd = Math.max(0, ST.set.newPerDay||0);
  let cum=0, cumIntro=0;
  const etas = upcoming.map(b=>{
    cum      += Math.max(0, Math.ceil(0.8*tot[b]) - mas[b]);
    cumIntro += Math.max(0, Math.ceil(0.8*tot[b]) - intro[b]);
    if(!pace) return {b, days:null};
    const dInt = npd>0 ? Math.ceil(cumIntro/npd) : 0;
    return {b, days: Math.max(Math.ceil(cum/pace), dInt)};
  });
  const mxe = Math.max(1,...etas.map(x=>x.days||0));
  /* v79 : libellé clarifié (retour user) — le 1er barreau est le niveau EN COURS (le « niveau actuel »
     affiché plus haut) ; « X j » = temps pour l'AMENER à 80 % (le finir), pas pour « l'atteindre ». */
  $screen.appendChild(el(`<div class="card"><h2>Temps pour valider chaque niveau</h2>
    <p class="dim note" style="margin-bottom:6px">Jours estimés pour amener chaque niveau à <b>80 % de maîtrise</b> (le seuil « acquis »)${paceTxt!=null?`, à ton rythme des 7 derniers jours (~${paceTxt} carte${pace>=2?"s":""}/j) et d'introduction (${npd} nouvelles/j)`:""}.</p>
    ${etas.length ? (pace
      ? `<div class="bars">${etas.map(x=>`<div class="b"><div style="height:${Math.max(2,Math.round(70*x.days/mxe))}px"></div><span>${x.b===working?"finir "+x.b:x.b}<br>${x.days} j</span></div>`).join("")}</div>
         <p class="dim note" style="margin-top:6px">Estimation <b>optimiste</b> : basée sur ta vitesse des derniers jours, qui ralentit quand tu introduis moins de nouvelles cartes.</p>`
      : `<p class="dim note">Estimation dispo dès quelques jours d'historique de maîtrise (ta vitesse récente est encore inconnue).</p>`)
      : `<p class="dim">Tous les niveaux du deck sont acquis.</p>`}</div>`));

  /* 📈 réussite / jour (14 j) — % de bonnes réponses au 1er essai (compteurs propres ok1/ko1) */
  const sWin=[]; for(let i=13;i>=0;i--){ const d=addDays(t,-i); const L=ST.log[d]||{}; const o=(L.ok1!=null?L.ok1:L.ok)||0, k=(L.ko1!=null?L.ko1:L.ko)||0, n=o+k; sWin.push({d,p:n?Math.round(100*o/n):null}); }
  const sDays=sWin.filter(x=>x.p!=null);
  const sAvg = sDays.length ? Math.round(sDays.reduce((s,x)=>s+x.p,0)/sDays.length) : null;
  $screen.appendChild(el(`<div class="card"><h2>Réussite quotidienne — 14 jours</h2>
    <p class="dim note" style="margin-bottom:6px">% de bonnes réponses au 1er essai chaque jour${sAvg!=null?` — moyenne ≈ <b>${sAvg}%</b>`:""}.</p>
    <div class="bars">${sWin.map(x=>`<div class="b"><div style="height:${x.p==null?2:Math.max(2,Math.round(70*x.p/100))}px${x.d===t?";background:var(--acc)":""}${x.p==null?";opacity:.25":""}" title="${x.p==null?"pas de révision":x.p+'%'}"></div><span>${x.p==null?"·":x.p}</span></div>`).join("")}</div></div>`));

  if(leeches.length){
    $screen.appendChild(el(`<div class="card">
      <h2>Sangsues (${leeches.length})</h2>
      <p class="dim">Ces mots résistent à la répétition — change d'angle : mnémotechnique, phrase à toi, post-it.
      ${leeches.slice(0,8).map(x=>`<span class="pill">${esc(x.kr)}</span>`).join("")}${leeches.length>8?"…":""}</p></div>`));
  }

  /* 🎯 quêtes du jour + badges (quests.js) — état additif ST.qdone — masqué v28 (SHOW_QUESTS) */
  if(SHOW_QUESTS && window.SORI_QUESTS){
    const qd = (ST.qdone && ST.qdone.d===t) ? ST.qdone : (ST.qdone = {d:t, ids:{}});
    SORI_QUESTS.renderCard($screen, {
      today: t, log: ST.log,
      state: { xp: ST.xp||0, streak: streak(),
        itemsSummary: { matures: items.filter(it=>it.stage>=4).length,
          beatenEnemies: beaten, totalEnemies: enemies.length,
          stage3plus: items.filter(it=>it.stage>=3).length, totalItems: items.length },
        scen: ST.scen||{}, examCount: (ST.exams||[]).length, qdone: qd.ids },
      onClaim: (id, bonus)=>{
        qd.ids[id] = true;
        ST.xp = (ST.xp||0) + bonus;
        const ld = ST.log[t] || (ST.log[t]={ok:0,ko:0,n:0,listen:0});
        ld.xp = (ld.xp||0) + bonus;
        save(); render();
      }
    });
  }

  /* 🎓 bilan de niveau périodique (exam.js) — historique additif ST.exams — masqué v28 (SHOW_EXAM) */
  if(SHOW_EXAM && window.SORI_EXAM){
    ST.exams = ST.exams || [];
    SORI_EXAM.renderCard($screen, {
      items: items, extra: EXTRA,
      speak: (kr,id)=>speak(kr,id),
      history: ST.exams,
      onFinish: r => { ST.exams.push(Object.assign({}, r, {date: todayStr()})); save(); },
      onExit: () => render()
    });
  }

  /* ⚔️ Boss fight retiré de Stats (v28) : c'est une ACTION, il reste accessible en fin de session. */

  /* avertissement voix coréenne absente (sinon accent français sur le hangul !) */
  if(koVoiceMissing()){
    $screen.appendChild(el(`<div class="card" style="border-color:var(--ko)">
      <h2>Voix coréenne absente</h2>
      <p class="dim">Ton appareil lit le coréen avec une voix française. Pour corriger sur Android :
      <b>Paramètres → Gestion générale (ou Système) → Synthèse vocale → moteur "Synthèse vocale Google"
      → ⚙️ → Installer les données de voix → 한국어 (coréen)</b>, puis redémarre l'app.
      Les phrases du kit voyage ont aussi leur audio natif intégré (indépendant du téléphone).</p></div>`));
  }
  /* rappel de sauvegarde : la progression ne vit que sur cet appareil.
     Tu (le cloud est le canal principal) : on ne prévient QUE si aucune sauvegarde cloud récente. */
  const cloudDays = ST.lastCloud ? Math.round((new Date(t+"T12:00:00") - new Date(ST.lastCloud+"T12:00:00"))/86400000) : null;
  const cloudRecent = cloudDays!==null && cloudDays < 7;
  if(!cloudRecent){
    $screen.appendChild(el(`<div class="card" style="border-color:var(--warn)">
      <h2>Sauvegarde</h2><p class="dim">${ghToken()?"Aucune sauvegarde cloud récente":"Sauvegarde cloud pas encore activée"} —
      ta progression ne vit que sur cet appareil. Ouvre <b>Réglages</b> pour la sauvegarder dans le cloud (ou exporter un fichier).</p></div>`));
  }

  const mx = Math.max(...stages,1);
  const labels=["nouv.","QCM","QCM+","FR→KR","indice","rappel"];
  const bars = el(`<div class="card"><h2>Échelle de maîtrise</h2><div class="bars">${
    stages.map((n,i)=>`<div class="b"><div style="height:${Math.round(80*n/mx)}px"></div><span>${labels[i]}<br>${n}</span></div>`).join("")
  }</div></div>`);
  $screen.appendChild(bars);

  /* activité des 7 derniers jours (aujourd'hui en accent) */
  const week = [];
  for(let i=6;i>=0;i--){ const d=addDays(t,-i); week.push({d, n:(ST.log[d]||{}).n||0}); }
  const mx7 = Math.max(...week.map(x=>x.n),1);
  const WD = ["D","L","M","M","J","V","S"];
  $screen.appendChild(el(`<div class="card"><h2>Activité — 7 jours</h2><div class="bars">${
    week.map(x=>`<div class="b"><div style="height:${Math.max(2,Math.round(70*x.n/mx7))}px${x.d===t?";background:var(--acc)":""}"></div><span>${WD[new Date(x.d+"T12:00:00").getDay()]}<br>${x.n}</span></div>`).join("")
  }</div></div>`));

  /* vitesse de progression : nouveaux mots découverts par jour (ST.intro) sur 14 jours */
  const days14 = [];
  for(let i=13;i>=0;i--){ const d=addDays(t,-i); days14.push({d, n: ST.intro[d]||0}); }
  const mxN = Math.max(...days14.map(x=>x.n),1);
  const sum7 = days14.slice(7).reduce((s,x)=>s+x.n,0);
  const avg7 = Math.round(sum7/7*10)/10;
  $screen.appendChild(el(`<div class="card"><h2>Nouveaux mots — 14 jours</h2>
    <p class="dim note" style="margin-bottom:6px">Ton rythme de découverte${avg7>0?` — ≈ <b>${avg7}</b> mots/jour cette semaine`:""}.</p>
    <div class="bars">${days14.map(x=>`<div class="b"><div style="height:${Math.max(2,Math.round(70*x.n/mxN))}px${x.d===t?";background:var(--acc)":""}"></div><span>${x.n}</span></div>`).join("")}</div></div>`));

}

/* Note : les cartes « mises de côté » (flag `sus` sur l'état d'item, posé une fois par le
   nettoyage niveau de v46) restent exclues de partout (buildQueue + saut à l'affichage +
   compteur du lanceur). Plus d'UI pour en ajouter/retirer — mécanisme invisible. */

/* ===== Réglages en surcouche (ouverts par la roue ⚙️ du header, depuis n'importe quel onglet) ===== */
function openSettings(){
  const back = el(`<div class="modal-back"></div>`);
  const set = el(`<div class="card modal wide settings"><h2>Réglages</h2>
    <label>Nouvelles cartes / jour <input type="number" id="npd" min="0" max="50" value="${ST.set.newPerDay}"></label>
    <label>Taille max de session <input type="number" id="smax" min="20" max="500" step="10" value="${ST.set.sessionMax||120}"></label>
    <label>Prioriser le kit voyage <input type="checkbox" id="kf" ${ST.set.kitFirst?"checked":""}></label>
    <label>Prononcer automatiquement <input type="checkbox" id="ap" ${ST.set.autoplay?"checked":""}></label>
    <label title="FSRS = algorithme moderne (modèle mémoire stabilité/difficulté par carte, ~25% de révisions en moins). Classique = échelle de stades historique.">Algorithme de répétition
      <select id="sched"><option value="fsrs" ${ST.set.scheduler!=="legacy"?"selected":""}>FSRS (moderne)</option><option value="legacy" ${ST.set.scheduler==="legacy"?"selected":""}>Classique</option></select></label>
    <label title="Rétention cible FSRS : proba de te souvenir au moment de la révision. Plus haut = plus de révisions, meilleure mémoire. Défaut 0.90.">Rétention cible (FSRS) <input type="number" id="fsrsret" min="0.7" max="0.97" step="0.01" value="${ST.set.fsrsRetention||0.9}"></label>
    <label title="Poids FSRS ajustés À TES données réelles (fit du 15/07 : le modèle générique te surestimait, R prédit ≈0.89 vs réel ≈0.78). Coché = intervalles calés sur ta mémoire. Décoché = poids génériques (rollback).">Poids FSRS personnalisés <input type="checkbox" id="fsrsperso" ${ST.set.fsrsPersonal!==false?"checked":""}></label>
    <label title="Au rappel SANS AIDE : 4 boutons (Encore/Difficile/Bien/Facile). Les exercices aidés (QCM, indice, sens inversé) restent à 2 boutons — leur note est plafonnée à Difficile. Note plus fine → FSRS mieux calibré.">Notation à 4 boutons <input type="checkbox" id="g4" ${ST.set.grade4!==false?"checked":""}></label>
    <label title="Intervalles personnalisés par mot (ALGORITHM.md), UNIQUEMENT en mode Classique. Laisser décoché ~2 semaines : l'app observe d'abord.">
      Planification adaptative (mode Classique) <input type="checkbox" id="adap" ${ST.set.adaptive?"checked":""}></label>
    <label title="Chaque mot devient DEUX cartes à maîtrise séparée : comprendre (KR→FR) et produire (FR→KR). Recommandé, mais double la charge de révision.">Production séparée (recto/verso) <input type="checkbox" id="rev" ${ST.set.reverse!==false?"checked":""}></label>
    <label>Saisie au clavier coréen (niv 5) <input type="checkbox" id="typ" ${ST.set.typing?"checked":""}></label>
    <label>Bouton rapport de problème <input type="checkbox" id="rpt" ${ST.set.report?"checked":""}></label>
    <label>Audio de la phrase d'exemple <input type="checkbox" id="exau" ${ST.set.exaudio?"checked":""}></label>
    <label title="Dans l'encart d'exemple, taper un mot affiche sa traduction française.">Traduction d'un mot au clic <input type="checkbox" id="wgl" ${ST.set.wordgloss?"checked":""}></label>
    <label>Vitesse de la voix <input type="number" id="rate" min="0.5" max="1.2" step="0.1" value="${ST.set.rate}"></label>
    ${koVoices().length>1 ? `<label>Voix coréenne <select id="voice">${
      koVoices().map(v=>`<option value="${esc(v.name)}" ${ST.set.voice===v.name?"selected":""}>${esc(v.name)}</option>`).join("")
    }</select></label>` : ""}
    ${window.SORI_THEMES ? `<label>Style graphique <select id="theme">${
      SORI_THEMES.list.map(th=>`<option value="${th.id}" ${SORI_THEMES.get()===th.id?"selected":""}>${esc(th.label)}</option>`).join("")
    }</select></label>` : ""}
    <div class="section-title" style="margin-top:14px">Conversation</div>
    <label>Fournisseur <select id="cvprov" title="Anthropic (Claude Haiku) répond depuis le navigateur ; OpenAI bloque les appels navigateur — option gardée pour un futur proxy.">
      <option value="anthropic" ${convCfg().prov!=="openai"?"selected":""}>Anthropic</option>
      <option value="openai" ${convCfg().prov==="openai"?"selected":""}>OpenAI</option></select></label>
    <label>Clé OpenAI <input type="password" id="cvok" placeholder="${convCfg().ok?"•••• configurée ••••":"sk-…"}" autocomplete="off"></label>
    <label>Clé Anthropic <input type="password" id="cvak" placeholder="${convCfg().ak?"•••• configurée ••••":"sk-ant-…"}" autocomplete="off"></label>
    <label title="Transcription vocale par Gemini (enregistrement audio + contexte de la conversation) — bien meilleure sur un accent d'apprenant que la reconnaissance du navigateur.">Clé Gemini (voix) <input type="password" id="cvgk" placeholder="${convCfg().gk?"•••• configurée ••••":"AQ.… / AIza…"}" autocomplete="off"></label>
    <label title="Coché : le micro enregistre puis transcrit via Gemini (précis, ~3 s). Décoché : reconnaissance instantanée du navigateur (moins fiable).">Voix par Gemini <input type="checkbox" id="cvstt" ${convCfg().stt!==false?"checked":""}></label>
    <label title="Durée de vie du cache du gros contexte (ton vocabulaire) chez Anthropic. Coché = 1 heure : partagé entre toutes tes conversations de l'heure et il survit aux pauses (écriture ×2, lectures ×0,1). Décoché = 5 minutes (écriture ×1,25).">Cache long (1 h) <input type="checkbox" id="cvttl" ${convCfg().ttl5!==true?"checked":""}></label>
    <label title="Après chaque réponse du partenaire, une petite traduction mot à mot se charge sous la bulle (appel séparé, ~0,1 centime).">Mot à mot sous les réponses <input type="checkbox" id="cvgl" ${convCfg().gl!==false?"checked":""}></label>
    <div class="section-title" style="margin-top:14px">Mode avion</div>
    <div class="row" style="margin-top:6px"><button class="btn ghost" id="dlaudio">Télécharger tout l'audio (${AUDIO_IDS.size + AUDIO_EX_IDS.size} fichiers)</button></div>
    <p class="dim" id="dlstatus" style="margin-top:6px">Mots + phrases d'exemple, disponibles hors connexion (avion, métro coréen).</p>
    <div class="section-title" style="margin-top:14px">Sauvegarde cloud (le canal principal)</div>
    <p class="dim" style="margin-top:4px">Ta progression part toute seule dans le cloud (à chaque fin de bloc) — c'est ta sauvegarde ET ce que Claude lit. Rien d'autre à faire.</p>
    <label>Jeton d'accès <input type="password" id="ghtok" placeholder="${ghToken()?"•••• configuré ••••":"github_pat_…"}" autocomplete="off"></label>
    <div class="row" style="margin-top:8px">
      <button class="btn" id="cloud">Sauvegarder maintenant</button>
      <button class="btn ghost" id="cloudrestore">↓ Restaurer</button>
    </div>
    <p class="dim" id="cloudstatus" style="margin-top:8px">${
      ghToken() ? (ST.lastCloud ? "Dernière sauvegarde cloud : "+ST.lastCloud+" · auto à chaque fin de bloc." : "Jeton configuré — aucune sauvegarde encore.")
                : "Colle un jeton GitHub fine-grained (dépôt sori-data, permission Contents) pour activer la sauvegarde automatique."}${
      (ST.reports||[]).length ? " · "+ST.reports.length+" rapport(s) joint(s) à la prochaine sauvegarde." : ""}</p>
    <details style="margin-top:14px"><summary class="dim">Sauvegarde fichier (secours hors-ligne)</summary>
      <p class="dim" style="margin-top:6px">Optionnel. Un fichier JSON à garder toi-même (ex. sans jeton cloud). Le cloud ci-dessus fait déjà tout.</p>
      <div class="row" style="margin-top:6px">
        <button class="btn ghost" id="exp">Exporter</button>
        <button class="btn ghost" id="imp">Importer</button>
      </div>
      <input type="file" id="impfile" accept=".json,application/json">
    </details>
    <p class="dim note" style="margin-top:16px; text-align:center">Sori — version <b id="appver">…</b></p>
    <div class="row" style="margin-top:8px"><button class="btn ghost" id="setclose">Fermer</button></div></div>`);
  back.appendChild(set);
  /* version = le cache actif du service worker (source unique : ce qui tourne VRAIMENT
     sur l'appareil, pas ce que le repo prétend) -> l'utilisateur sait ce qu'il a. */
  (function(){
    const av = set.querySelector("#appver");
    if(!av) return;
    /* clic sur la version → popin historique (versions/commits/dates, tirés de GitHub) */
    av.style.cursor = "pointer";
    av.style.textDecoration = "underline dotted";
    av.title = "Voir l'historique des versions";
    av.onclick = openVersionHistory;
    if(typeof caches==="undefined" || !caches.keys){ av.textContent = "—"; return; }
    caches.keys().then(keys=>{
      const nums = keys.map(k=>/^sori-v(\d+)$/.exec(k)).filter(Boolean).map(m=>+m[1]);
      av.textContent = nums.length ? "v"+Math.max(...nums) : "—";
    }).catch(()=>{ av.textContent = "—"; });
  })();
  set.querySelector("#npd").onchange = e=>{ ST.set.newPerDay=Math.max(0,+e.target.value||0); save(); };
  set.querySelector("#smax").onchange= e=>{ ST.set.sessionMax=Math.max(20,+e.target.value||120); save(); };
  set.querySelector("#kf").onchange  = e=>{ ST.set.kitFirst=e.target.checked; save(); };
  set.querySelector("#ap").onchange  = e=>{ ST.set.autoplay=e.target.checked; save(); };
  set.querySelector("#adap").onchange= e=>{ ST.set.adaptive=e.target.checked; save(); };
  set.querySelector("#sched").onchange = e=>{ ST.set.scheduler=e.target.value; save(); };
  set.querySelector("#fsrsret").onchange = e=>{ ST.set.fsrsRetention=Math.min(0.97, Math.max(0.7, +e.target.value||0.9)); save(); };
  set.querySelector("#fsrsperso").onchange = e=>{ ST.set.fsrsPersonal=e.target.checked; save(); };
  set.querySelector("#g4").onchange = e=>{ ST.set.grade4=e.target.checked; save(); };
  set.querySelector("#typ").onchange = e=>{ ST.set.typing=e.target.checked; save(); };
  set.querySelector("#rev").onchange = e=>{ ST.set.reverse=e.target.checked; save(); location.reload(); };  // ALL_IDS fixé au chargement → recharger
  set.querySelector("#rpt").onchange = e=>{ ST.set.report=e.target.checked; save(); wireReport(); };
  set.querySelector("#cvprov").onchange = e=>{ setConvCfg({prov: e.target.value}); };
  set.querySelector("#cvok").onchange = e=>{ setConvCfg({ok: e.target.value.trim()});
    e.target.value=""; e.target.placeholder = convCfg().ok ? "•••• configurée ••••" : "sk-…"; };
  set.querySelector("#cvak").onchange = e=>{ setConvCfg({ak: e.target.value.trim()});
    e.target.value=""; e.target.placeholder = convCfg().ak ? "•••• configurée ••••" : "sk-ant-…"; };
  set.querySelector("#cvgk").onchange = e=>{ setConvCfg({gk: e.target.value.trim()});
    e.target.value=""; e.target.placeholder = convCfg().gk ? "•••• configurée ••••" : "AQ.… / AIza…"; };
  set.querySelector("#cvgl").onchange = e=>{ setConvCfg({gl: e.target.checked ? null : false}); };  // ON = défaut (clé retirée)
  set.querySelector("#cvstt").onchange = e=>{ setConvCfg({stt: e.target.checked ? null : false}); };
  set.querySelector("#cvttl").onchange = e=>{ setConvCfg({ttl5: e.target.checked ? null : true}); };  // coché = 1 h (défaut)
  set.querySelector("#exau").onchange= e=>{ ST.set.exaudio=e.target.checked; save(); };
  set.querySelector("#wgl").onchange = e=>{ ST.set.wordgloss=e.target.checked; save(); };
  set.querySelector("#rate").onchange= e=>{ ST.set.rate=Math.min(1.2,Math.max(0.5,+e.target.value||0.9)); save(); };
  const vsel = set.querySelector("#voice");
  if(vsel) vsel.onchange = e=>{ ST.set.voice = e.target.value; save(); pickVoice(); ttsSpeak("안녕하세요"); };
  const tsel = set.querySelector("#theme");
  /* v103 : re-rendre l'écran derrière la modale — Takbon change le déclencheur de révélation
     (creux vs bouton Montrer), la carte affichée doit suivre le thème immédiatement, sinon
     des creux orphelins restent sans style dans les autres thèmes (revue v103). */
  if(tsel) tsel.onchange = e=>{ SORI_THEMES.set(e.target.value); NAV = true; render(); NAV = false; };
  set.querySelector("#exp").onclick  = exportState;
  set.querySelector("#imp").onclick  = ()=>set.querySelector("#impfile").click();
  set.querySelector("#impfile").onchange = importState;
  set.querySelector("#dlaudio").onclick = async ()=>{
    const st = set.querySelector("#dlstatus");
    const btn = set.querySelector("#dlaudio"); btn.disabled = true;
    try{
      const cache = await caches.open("sori-audio-store");
      const urls = [...AUDIO_IDS].map(id=>"./audio/"+id+".mp3")
        .concat([...AUDIO_EX_IDS].map(id=>"./audio/"+id+"-ex.mp3"));   // mots + phrases
      let done = 0, added = 0, fail = 0;
      const CONC = 6;
      async function one(url){
        if(!(await cache.match(url))){
          try{ await cache.add(url); added++; }catch(e){ fail++; }
        }
        done++;
        if(done % 40 === 0 || done === urls.length)
          st.textContent = `Téléchargement… ${done}/${urls.length}` + (fail?` (${fail} échecs)`:"");
      }
      for(let i=0; i<urls.length; i+=CONC) await Promise.all(urls.slice(i, i+CONC).map(one));
      st.textContent = fail ? `${done-fail}/${urls.length} audios hors-ligne (${fail} échecs — relance pour compléter).`
                            : `Tout l'audio est disponible hors connexion (${urls.length} fichiers).`;
    }catch(e){ st.textContent = "Échec (connexion ?) — relance pour reprendre où c'était."; }
    btn.disabled = false;
  };
  set.querySelector("#ghtok").onchange = e=>{ setGhToken(e.target.value); e.target.value=""; back.remove(); openSettings(); };
  set.querySelector("#cloud").onclick = async ()=>{
    const st = set.querySelector("#cloudstatus");
    st.textContent = "Envoi en cours…";
    const r = await cloudBackup();
    st.textContent = r.ok ? "Sauvegardé dans le cloud ("+todayStr()+")." : "Échec : "+r.msg;
  };
  set.querySelector("#cloudrestore").onclick = async ()=>{
    const st = set.querySelector("#cloudstatus");
    st.textContent = "Lecture du cloud…";
    const r = await cloudRestore();
    if(r.ok){ back.remove(); return; }   // restauration OK : render() déjà relancé, on ferme l'overlay
    st.textContent = "Restauration : "+r.msg;
  };
  set.querySelector("#setclose").onclick = ()=>back.remove();
  back.addEventListener("click", e=>{ if(e.target===back) back.remove(); });
  document.body.appendChild(back);
}
/* ===== Historique des versions (popin ouverte au clic sur le n° de version) =====
   Données tirées EN DIRECT de l'API publique GitHub (repo public, sans jeton) : chaque
   release est un commit « vNN: … ». Repli propre hors-ligne / si limite d'API atteinte. */
function vhStyleOnce(){
  if(document.getElementById("vh-style")) return;
  const s = document.createElement("style"); s.id = "vh-style";
  s.textContent = `
    .vh-list{max-height:62vh;overflow-y:auto;margin-top:4px;text-align:left}
    .vh-item{display:flex;gap:10px;align-items:flex-start;padding:8px 2px;border-bottom:1px solid rgba(128,128,128,.18)}
    .vh-item:last-child{border-bottom:0}
    .vh-tag{flex:0 0 auto;font-weight:700;font-size:.72rem;border:1px solid var(--acc);color:var(--acc);border-radius:6px;padding:1px 6px;margin-top:2px;min-width:34px;text-align:center}
    .vh-title{font-size:.9rem;line-height:1.3}
    .vh-meta{font-size:.72rem;opacity:.6;margin-top:2px}`;
  document.head.appendChild(s);
}
function openVersionHistory(){
  vhStyleOnce();
  const back = el(`<div class="modal-back"></div>`);
  const box = el(`<div class="card modal wide"><h2>Historique des versions</h2>
    <div id="vhlist" class="vh-list"><p class="dim">Chargement…</p></div>
    <div class="row" style="margin-top:8px"><button class="btn ghost" id="vhclose">Fermer</button></div></div>`);
  back.appendChild(box);
  box.querySelector("#vhclose").onclick = ()=>back.remove();
  back.addEventListener("click", e=>{ if(e.target===back) back.remove(); });
  document.body.appendChild(back);
  const list = box.querySelector("#vhlist");
  const ghUrl = "https://github.com/mnafati-cloud/sori/commits/main";
  /* v98 : l'API est PAGINÉE (60 commits par page) — « Charger la suite » remonte jusqu'à la v1 */
  const PER_PAGE = 60;
  const moreRow = el(`<div class="row" style="margin-top:8px"><button class="btn ghost" style="display:none">Charger la suite</button></div>`);
  list.after(moreRow);
  const moreBtn = moreRow.querySelector("button");
  let page = 1, loading = false;
  async function loadPage(){
    if(loading) return;
    loading = true; moreBtn.disabled = true;
    try{
      const r = await fetch("https://api.github.com/repos/mnafati-cloud/sori/commits?sha=main&per_page=" + PER_PAGE + "&page=" + page,
                            { headers:{ "Accept":"application/vnd.github+json" }, cache:"no-store" });
      if(!r.ok) throw new Error(r.status);
      const commits = await r.json();
      if(!Array.isArray(commits)) throw new Error("format");
      if(page === 1){
        list.innerHTML = "";
        if(!commits.length){ list.innerHTML = `<p class="dim">Aucune version trouvée.</p>`; return; }
      }
      list.insertAdjacentHTML("beforeend", commits.map(c=>{
        const msg  = ((c.commit && c.commit.message) || "").split("\n")[0];
        const iso  = c.commit && c.commit.author && c.commit.author.date;
        const dstr = iso ? new Date(iso).toLocaleDateString("fr-FR", {day:"2-digit", month:"short", year:"numeric"}) : "";
        const mv   = /^v(\d+)\s*[:\-–—]\s*/.exec(msg);   // v97 : accepte aussi le tiret cadratin — (commits ≥ v81)
        const tag  = mv ? `<span class="vh-tag">v${mv[1]}</span>` : `<span class="vh-tag" style="opacity:.45">·</span>`;
        const title= mv ? msg.slice(mv[0].length).trim() : msg;
        const sha  = (c.sha || "").slice(0,7);
        return `<div class="vh-item">${tag}<div class="vh-body"><div class="vh-title">${esc(title)}</div>
          <div class="vh-meta">${esc(dstr)}${sha?` · ${esc(sha)}`:""}</div></div></div>`;
      }).join(""));
      moreBtn.style.display = commits.length === PER_PAGE ? "" : "none";   // page pleine = il y a une suite
      page++;
    }catch(e){
      if(page === 1){
        list.innerHTML = `<p class="dim">Impossible de charger l'historique (hors-ligne, ou limite GitHub atteinte).<br>
          Il reste consultable sur <a href="${ghUrl}" target="_blank" rel="noopener">GitHub</a>.</p>`;
      }
      moreBtn.style.display = "none";
    }finally{
      loading = false; moreBtn.disabled = false;
    }
  }
  moreBtn.onclick = loadPage;
  loadPage();
}
/* ===== Conversation (IA) — config HORS de ST : les clés API ne partent JAMAIS dans la
   sauvegarde cloud (le state ST est exporté vers sori-data ; même modèle que sori-gh-token).
   {prov: "openai"|"anthropic", ok: clé OpenAI, ak: clé Anthropic} */
const CONV_CFG_KEY = "sori-conv-cfg";
function convCfg(){ try{ return JSON.parse(localStorage.getItem(CONV_CFG_KEY) || "{}") || {}; }catch(e){ return {}; } }
function setConvCfg(patch){
  try{
    const c = Object.assign(convCfg(), patch);
    Object.keys(c).forEach(k => { if(c[k] === "" || c[k] == null) delete c[k]; });   // champ vidé = retiré
    localStorage.setItem(CONV_CFG_KEY, JSON.stringify(c));
  }catch(e){}
}
/* ================= sauvegarde cloud (GitHub, dépôt privé sori-data) =================
   Jeton fine-grained stocké UNIQUEMENT sur l'appareil (clé séparée, jamais dans un export). */
const GH_KEY = "sori-gh-token";
const GH_REPO = "mnafati-cloud/sori-data";
function ghToken(){ try{ return localStorage.getItem(GH_KEY)||""; }catch(e){ return ""; } }
function setGhToken(t){ try{ t ? localStorage.setItem(GH_KEY, t.trim()) : localStorage.removeItem(GH_KEY); }catch(e){} }
/* v86 : les clés API de la Conversation arrivent TOUTES SEULES depuis le dépôt PRIVÉ sori-data
   (config/conv-cfg.json, déposé côté PC) — le localStorage ne circule pas entre appareils/contextes
   et taper une clé de 108 caractères au téléphone est irréaliste. Le jeton GitHub déjà présent
   (sauvegarde cloud) sert de porte. Ne remplit que ce qui MANQUE (jamais d'écrasement local). */
async function fetchConvKeys(){
  try{
    const c = convCfg();
    if((c.ak && c.ok && c.gk) || !ghToken()) return;
    const res = await fetch("https://api.github.com/repos/" + GH_REPO + "/contents/config/conv-cfg.json",
      { headers: { "Authorization": "Bearer " + ghToken(), "Accept": "application/vnd.github.raw" } });
    if(!res.ok) return;                       // 404 = pas de fichier déposé, silencieux
    const cfg = await res.json().catch(() => null);
    if(!cfg) return;
    const patch = {};
    if(cfg.ak && !c.ak) patch.ak = cfg.ak;
    if(cfg.ok && !c.ok) patch.ok = cfg.ok;
    if(cfg.gk && !c.gk) patch.gk = cfg.gk;    // v93 : clé Gemini (voix)
    if(Object.keys(patch).length) setConvCfg(patch);
  }catch(e){}
}
fetchConvKeys();   // au boot, en arrière-plan — cfg est relu à chaque envoi, aucun re-render requis
function exportPayload(){
  return JSON.stringify({app:"sori", v:1, exportedAt:new Date().toISOString(),
    seedVersion:SEED.meta.version, state:ST});
}
async function ghPut(path, content, H){
  const url = "https://api.github.com/repos/"+GH_REPO+"/contents/"+path;
  let sha;
  try{ const g = await fetch(url, {headers:H}); if(g.ok) sha = (await g.json()).sha; }catch(e){}
  const body = { message: "backup "+todayStr(), content };
  if(sha) body.sha = sha;
  const r = await fetch(url, {method:"PUT", headers:H, body: JSON.stringify(body)});
  return r.ok;
}
async function cloudBackup(){
  const tok = ghToken();
  if(!tok) return {ok:false, msg:"aucun jeton configuré"};
  const b64 = btoa(unescape(encodeURIComponent(exportPayload())));
  /* v65 (revue) : GARDE DE TAILLE — l'API Contents plafonne ~1 Mo/fichier ; au-delà, sauvegarde
     ET restauration cassent avec des messages trompeurs (« refus API », « introuvable »). Le poste
     DOMINANT est ST.items (~84 o × cartes touchées → ~673 Ko à deck complet), pas le rlog. On
     alerte AVANT le mur ; le vrai correctif (journal dans un fichier cloud séparé / compaction
     des items) est planifié — cf. MAINTENANCE v65. */
  const bytes = Math.floor(b64.length * 3 / 4);
  if(bytes > 700 * 1024){
    logErr("cloud", "export " + Math.round(bytes/1024) + " Ko — approche la limite API ~1 Mo : sortir le rlog du fichier restaurable / compacter items (plan MAINTENANCE v65)", "");
  }
  const H = { "Authorization": "Bearer "+tok, "Accept": "application/vnd.github+json" };
  try{
    const ok1 = await ghPut("exports/latest.json", b64, H);
    const ok2 = ok1 && await ghPut("exports/sori-export-"+todayStr()+".json", b64, H);
    if(ok1 && ok2){ ST.lastCloud = todayStr(); ST.lastExport = todayStr(); save(); return {ok:true}; }
    return {ok:false, msg:"refus API (jeton invalide/expiré ?)"};
  }catch(e){ return {ok:false, msg:"hors ligne ?"}; }
}
function autoCloudBackup(){   // silencieux, fin de bloc, throttle 5 min (largement sous les limites GitHub)
  if(!ghToken()) return;
  const now = Date.now();
  if(now - (ST.lastCloudTs||0) < 5*60*1000) return;   // champ additif ST.lastCloudTs (ms)
  ST.lastCloudTs = now; save();                       // consomme la fenêtre avant l'await (anti double-tir)
  /* v65 : un échec de sauvegarde automatique n'est plus AVALÉ — loggué dans ST.errors
     (jeton expiré, hors-ligne persistant, API en panne : visible à la prochaine analyse). */
  cloudBackup().then(r => { if(r && !r.ok) logErr("cloud", "auto-backup : " + (r.msg || "?"), ""); }).catch(() => {});
}
/* migration douce commune (import fichier OU restauration cloud) */
function applyImportedState(state){
  const s = state;
  s.items = s.items||{}; s.log = s.log||{}; s.intro = s.intro||{}; s.rlog = s.rlog||[];
  s.set = Object.assign({}, DEF_SET, s.set||{});
  s.strPos = s.strPos||0;                    // v62 : position persistée de l'exercice Structure
  s.errors = s.errors||[]; s.vlog = s.vlog||[];   // v65
  s.rep = s.rep||{d:"",m:{}};                     // v71
  s.conv = s.conv||[];                            // v89 : conversations IA enregistrées
  s.v = s.v || 1;
  ST = s; save(); Q = null;
  NAV = true; render(); NAV = false;   // v73 : rendu d'ARRIVÉE — pas de coup de tampon post-restauration
}
/* confirmation à MINUTEUR pour une action irréversible : le bouton Confirmer reste grisé
   quelques secondes (compte à rebours visible), Annuler est cliquable à tout instant.
   Renvoie une Promise<bool>. Clic hors carte = Annuler. */
function confirmRestore(when, loss){
  return new Promise(resolve=>{
    const back = el(`<div class="modal-back">
      <div class="card modal">
        <h2>Restaurer depuis le cloud</h2>
        <p class="dim">Ceci <b>remplace définitivement</b> la progression de cet appareil
          (<b>${esc(loss)}</b>) par la sauvegarde cloud du <b>${esc(when)}</b>.</p>
        <p class="dim">Utile seulement si tu changes de téléphone ou repars de zéro. Au moindre doute : Annuler.</p>
        <div class="row" style="margin-top:14px">
          <button class="btn ghost" id="rscancel">Annuler</button>
          <button class="btn danger" id="rsok" disabled>Confirmer (5)</button>
        </div></div></div>`);
    const okb = back.querySelector("#rsok");
    let n = 5;
    const iv = setInterval(()=>{
      n--;
      if(n>0){ okb.textContent = "Confirmer ("+n+")"; }
      else { okb.textContent = "Confirmer la restauration"; okb.disabled = false; clearInterval(iv); }
    }, 1000);
    const done = v=>{ clearInterval(iv); back.remove(); resolve(v); };
    back.querySelector("#rscancel").onclick = ()=>done(false);
    back.addEventListener("click", e=>{ if(e.target===back) done(false); });   // clic dehors = annuler
    okb.onclick = ()=>{ if(!okb.disabled) done(true); };
    document.body.appendChild(back);
  });
}
async function cloudRestore(){
  const tok = ghToken();
  if(!tok) return {ok:false, msg:"aucun jeton configuré"};
  try{
    const r = await fetch("https://api.github.com/repos/"+GH_REPO+"/contents/exports/latest.json",
      { headers:{ "Authorization":"Bearer "+tok, "Accept":"application/vnd.github+json" }, cache:"no-store" });
    if(!r.ok) return {ok:false, msg:"introuvable dans le cloud"};
    const j = await r.json();
    const data = JSON.parse(decodeURIComponent(escape(atob(j.content.replace(/\n/g,"")))));
    if(data.app!=="sori" || !data.state) return {ok:false, msg:"contenu invalide"};
    const when = (data.exportedAt||"").slice(0,16).replace("T"," ");
    const todayN = (ST.log[todayStr()]||{}).n || 0;
    const loss = `${ST.xp||0} XP · ${levelName(ST.xp||0)} · ${todayN} révision(s) aujourd'hui`;
    if(await confirmRestore(when, loss)){
      applyImportedState(data.state);
      return {ok:true, when};
    }
    return {ok:false, msg:"annulé"};
  }catch(e){ return {ok:false, msg:"hors ligne ?"}; }
}

async function exportState(){
  ST.lastExport = todayStr(); save();
  const payload = JSON.stringify({app:"sori", v:1, exportedAt:new Date().toISOString(),
    seedVersion:SEED.meta.version, state:ST}, null, 1);
  const name = "sori-export-"+todayStr()+".json";
  const file = new File([payload], name, {type:"application/json"});
  if(navigator.canShare && navigator.canShare({files:[file]})){
    try{ await navigator.share({files:[file], title:name}); return; }catch(e){}
  }
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([payload],{type:"application/json"}));
  a.download=name; a.click(); URL.revokeObjectURL(a.href);
}
function importState(e){
  const f=e.target.files[0]; if(!f) return;
  const r=new FileReader();
  r.onload=()=>{
    try{
      const data=JSON.parse(r.result);
      if(data.app!=="sori"||!data.state) throw 0;
      if(confirm("Remplacer la progression locale par ce fichier ?")){
        applyImportedState(data.state);   // même migration douce qu'au chargement
      }
    }catch(_){ alert("Fichier invalide."); }
  };
  r.readAsText(f);
}

/* ================= util ================= */
function esc(s){ return String(s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

/* go */
wireMute();
wireReport();
wireSettings();
wireDico();
document.querySelectorAll("#tabs button").forEach(x=>x.classList.toggle("active", x.dataset.tab===TAB));
NAV = true; render(); NAV = false;   // ouverture de l'app sur l'onglet TAB : pas de son auto (arrivée)

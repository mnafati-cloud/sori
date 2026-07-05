/* Sori — moteur de révision coréen (échelle de maîtrise + QCM intelligents + TTS) */
"use strict";

/* ================= état & persistance ================= */
const LS_KEY = "sori-state-v1";
const SEED_BY_ID = {};
SEED.items.forEach(it => SEED_BY_ID[it.id] = it);

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
        /* v52 : split recto/verso retiré (doublait le deck). Bascule UNE FOIS les utilisateurs
           qui l'avaient activé (v51) vers OFF ; le toggle Réglages reste libre ensuite. */
        if(s.reverseMig !== 1){ s.set.reverse = false; s.reverseMig = 1; }
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

/* ===== sons de feedback (WebAudio généré, discret, immédiat) — respecte le mute ===== */
let ACTX = null;
function sfx(ok){
  if(ST.set.mute) return;
  try{
    ACTX = ACTX || new (window.AudioContext||window.webkitAudioContext)();
    if(ACTX.state === "suspended") ACTX.resume();
    const t = ACTX.currentTime;
    const g = ACTX.createGain(); g.connect(ACTX.destination);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(ok ? 0.10 : 0.13, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (ok ? 0.22 : 0.28));
    const o = ACTX.createOscillator(); o.connect(g);
    if(ok){ o.type = "sine"; o.frequency.setValueAtTime(880, t); o.frequency.setValueAtTime(1318.5, t + 0.08); }
    else  { o.type = "triangle"; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.24); }
    o.start(t); o.stop(t + (ok ? 0.24 : 0.3));
  }catch(e){}
}

/* ===== annulation de la dernière réponse (clic accidentel) — 1 niveau ===== */
let UNDO = null;
function armUndo(){
  const t = todayStr();
  UNDO = {
    items: JSON.parse(JSON.stringify(ST.items)),
    log: ST.log[t] ? JSON.parse(JSON.stringify(ST.log[t])) : null,
    xp: ST.xp||0, combo: COMBO, sessfail: [...SESSFAIL],
    q: [...Q], qpos: QPOS,
    rlogLen: (ST.rlog||[]).length,     // FSRS : pour retirer l'entrée de journal en cas d'annulation
  };
}
function undoLast(){
  if(!UNDO) return;
  const t = todayStr();
  ST.items = UNDO.items;
  if(UNDO.log === null) delete ST.log[t]; else ST.log[t] = UNDO.log;
  ST.xp = UNDO.xp; COMBO = UNDO.combo; SESSFAIL = UNDO.sessfail;
  Q = UNDO.q; QPOS = UNDO.qpos;
  if(ST.rlog && typeof UNDO.rlogLen === "number" && ST.rlog.length > UNDO.rlogLen) ST.rlog.length = UNDO.rlogLen;  // retire l'entrée de journal annulée
  UNDO = null;
  save(); saveSess(); updateDayCount(); render();
}
function updateDayCount(){
  const l = ST.log[todayStr()];
  document.getElementById("daycount").textContent = "📚 " + (l ? l.n : 0);
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
      <h2>🐞 Signaler un problème</h2>
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
    back.querySelector(".modal").innerHTML = `<h2>✅ Noté</h2>
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
function wireMute(){
  const b = document.getElementById("mute");
  if(!b) return;
  const paint = ()=>{ b.textContent = ST.set.mute ? "🔇" : "🔊"; b.title = ST.set.mute ? "Réactiver le son" : "Couper le son"; };
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
  const box = el(`<div class="card modal wide"><h2>🔍 Dictionnaire</h2>
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
function applyAnswer(it, ok){
  if(ST.set.scheduler !== "legacy"){
    const G = ok ? 3 : 1;   // Sori binaire : juste → Good(3), faux → Again(1)
    const r = ENGINE.fsrsSchedule(it, G, todayStr(), { retention: ST.set.fsrsRetention || 0.9 });
    setItem(it.id, { s:r.stage, i:r.i, d:r.d, S:r.S, D:r.D, ok: it.ok+(ok?1:0), ko: it.ko+(ok?0:1) });
    logReview(it.id, G, r.elapsed);   // journal (fit hors-ligne des poids) — toutes les révisions
    return { s:r.stage, i:r.i, d:r.d, counted:r.counted };
  }
  const r = ENGINE.computeAnswer(it, ok, todayStr(), ST.set.adaptive === true);
  setItem(it.id, { s:r.s, i:r.i, d:r.d, e:r.e, ok: it.ok+(ok?1:0), ko: it.ko+(ok?0:1) });
  return r;
}
/* journal de révisions — enregistrements compacts [date, id, note, jours écoulés] pour
   l'ajustement HORS-LIGNE des 21 poids FSRS (optimiseur Python sur l'export cloud).
   Plafonné (FIFO) pour borner localStorage/cloud. */
/* plafond du journal : FIFO. 10000 entrées ≈ ~400 Ko → la sauvegarde cloud (state:ST, GitHub
   Contents API ~1 Mo/fichier) ne peut pas échouer silencieusement, et c'est amplement assez
   pour ajuster les poids FSRS (fit hors-ligne sur l'historique récent). */
const RLOG_CAP = 10000;
function logReview(id, G, elapsed){
  ST.rlog = ST.rlog || [];
  ST.rlog.push([todayStr(), id, G, elapsed|0]);
  if(ST.rlog.length > RLOG_CAP) ST.rlog.splice(0, ST.rlog.length - RLOG_CAP);
  save();   // le push arrive APRÈS le save() de setItem → persister explicitement
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
    for(const g of group){
      if(seen.has(g)) continue;
      seen.add(g);
      setItem(g, { s:1, i:0, d:t });
      ST.intro[t] = (ST.intro[t]||0) + 1;
      introduced.push(g);
    }
  }
  return introduced;
}

/* file du jour : échues + nouvelles (plus simple/fréquent d'abord) */
function buildQueue(){
  const t = todayStr();
  const effAll = ALL_IDS.map(eff).filter(it=>!it.sus);   // les cartes mises de côté sont exclues de tout
  const due = ENGINE.selectDue(effAll, t);
  // introduction de nouvelles
  const introToday = ST.intro[t]||0;
  let slots = Math.max(0, (ST.set.newPerDay||0) - introToday);
  if(slots>0){
    /* on pioche large (×2 : recto+verso) puis introduceCards forme les paires dans la limite du budget */
    const picked = ENGINE.pickNew(effAll, slots*2, ST.set.kitFirst, newRank);
    introduceCards(picked, slots, t).forEach(id => due.push(id));
    save();
  }
  shuffle(due);
  const cap = ST.set.sessionMax || 120;
  PENDING = Math.max(0, due.length - cap);      // reste pour plus tard
  return due.slice(0, cap);
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
}

/* ---------- mode Réviser ---------- */
let Q = null, QPOS = 0, BONUS = false, COMBO = 0, SESSFAIL = [];
/* la session en cours survit à un kill de l'app (Android) */
function saveSess(){
  ST.sess = (BONUS || !Q) ? null : { d:todayStr(), q:Q, p:QPOS, pen:PENDING };
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
    if(s && s.d===todayStr() && Array.isArray(s.q) && s.p < s.q.length){
      Q = s.q; QPOS = s.p; PENDING = s.pen||0; BONUS = false;   // reprise
    } else {
      Q = buildQueue(); QPOS = 0; BONUS = false; COMBO = 0; SESSFAIL = [];
      saveSess();
    }
  }
  if(QPOS >= Q.length){
    ST.sess = null; save();
    autoCloudBackup();                       // sauvegarde cloud silencieuse (1x/jour max)
    const t=todayStr(), l=ST.log[t]||{ok:0,ko:0};
    const more = PENDING>0 ? `<button class="btn ghost" id="more">Continuer les révisions (${PENDING} en attente)</button>` : "";
    $screen.appendChild(el(`<div class="card center">
      <div class="done-banner">${PENDING>0?"💪":"🎉"}</div>
      <h2>${PENDING>0?"Session terminée !":"Tout est à jour !"}</h2>
      <p class="dim">${l.ok||0} bonnes réponses aujourd'hui${l.ko?`, ${l.ko} à retravailler`:""}.</p>
      <p class="dim">✅ ${BASE_IDS.map(eff).filter(it=>it.stage>=4).length} cartes maîtrisées au total.</p>
      <div class="row" style="margin-top:12px">
        ${more}
        <button class="btn" id="learnmore">➕ Apprendre 10 nouvelles cartes</button>
      </div>
      <p class="dim" style="margin-top:8px; font-size:.8rem">Autant de fois que tu veux — ces cartes comptent dans ta progression.</p></div>`));
    /* récap : les mots ratés de la session, à réécouter d'un tap */
    if(SESSFAIL.length){
      const rec = el(`<div class="card"><h2>📌 À retravailler (${SESSFAIL.length})</h2>
        <p class="dim">Les ratés de cette session — tape un mot pour l'écouter.</p>
        <div class="list"></div></div>`);
      const list = rec.querySelector(".list");
      SESSFAIL.slice(0,10).forEach(id=>{
        const o = SEED_BY_ID[id]; if(!o) return;
        const xn = (EXTRA[baseId(id)]||{}).note;      // note résolue via l'id de base (cartes verso)
        const row = el(`<div class="item"><div class="txt"><div class="kr">${esc(o.kr)}</div>
          <div class="fr">${esc(o.fr)}${xn?` — 💡 ${esc(xn)}`:""}</div></div>
          <button class="speak">🔊</button></div>`);
        row.onclick = ()=>speak(o.kr, id);
        list.appendChild(row);
      });
      $screen.appendChild(rec);
    }
    const m=document.getElementById("more");
    if(m) m.onclick = ()=>{ Q=null; render(); };
    document.getElementById("learnmore").onclick = ()=>{
      const q = learnMoreQueue(10);
      if(!q.length){ alert("Bravo — tu as déjà commencé toutes les cartes du deck !"); return; }
      Q = q; QPOS = 0; BONUS = false; render();
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
  const head = el(`<div>
    <div class="progressbar"><div style="width:${Math.round(100*QPOS/Q.length)}%"></div></div>
    <div class="rev-head">
      <div class="dim">${QPOS+1} / ${Q.length}
        ${it.rev?'<span class="pill" style="color:var(--acc)">🔄 production</span>':(ST.set.reverse!==false && it.type==="word"?'<span class="pill">👂 compréhension</span>':"")}
        ${it.enemy?'<span class="pill enemy">ennemie</span>':""}
        <span class="pill stage">niv ${it.stage}</span>
        ${COMBO>=3?`<span class="pill" style="color:var(--acc)">🔥 combo ×${COMBO}</span>`:""}</div>
      <button class="escbtn" id="quitrev" title="Quitter la révision (la progression est gardée)">✕ Quitter</button>
    </div></div>`);
  $screen.appendChild(head);
  head.querySelector("#quitrev").onclick = leaveReview;
  EXO_T0 = Date.now();
  const isPhrase = it.type==="phrase" && it.kr.split(" ").length>=3;
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
    } else if(typingTop && it.type==="word" && Math.random()<0.5){
      typingExo();
    } else if(Math.random()<0.5){
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
  const picked = ENGINE.pickNew(ALL_IDS.map(eff), n*2, ST.set.kitFirst, newRank);   // ×2 : recto+verso, plus simple/fréquent d'abord
  const news = introduceCards(picked, n, t);                                        // paires recto+verso
  if(news.length) save();
  return shuffle(news.slice());
}
/* boss fight : affronter ses ennemies (les mots les plus ratés), les plus faibles d'abord */
function bossCandidates(){
  return ALL_IDS.map(eff).filter(it=>it.enemy && it.stage>=1 && it.stage<=4)
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
    const spk = ST.set.exaudio===true ? ` <button class="exspeak" title="Écouter la phrase">🔊</button>` : "";
    bits.push(`<div class="tkr">${exHtml}${spk}</div>${x.exFr?`<div class="tfr">${esc(x.exFr)}</div>`:""}`);
  }
  if(x.conj) bits.push(`<div class="tconj">활용 ${esc(x.conj)}</div>`);
  if(x.note) bits.push(`<div class="tnote">💡 ${esc(x.note)}</div>`);
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
function afterAnswer(it, ok, sawTrivia, kind){
  LASTANS = { id: it.id, kr: it.kr, ok, kind };   // contexte pour les rapports 🐞
  armUndo();                                // photo AVANT toute mutation (annulation possible)
  const r = BONUS ? null : applyAnswer(it, ok);
  logAnswer(ok, kind || "review", r, EXO_T0 ? Date.now()-EXO_T0 : 0);
  /* combo & XP (plancher motivant, jamais bloquant) */
  if(ok) COMBO++; else { COMBO = 0; if(!SESSFAIL.includes(it.id)) SESSFAIL.push(it.id); }
  if(!BONUS){
    const gain = ok ? 10 + 2*Math.min(Math.max(COMBO-1,0), 10) : 2;
    ST.xp = (ST.xp||0) + gain;
    const l = ST.log[todayStr()]; if(l) l.xp = (l.xp||0) + gain;
  }
  if(!ok && !BONUS){ // re-poser dans la session, 3-5 cartes plus loin
    const pos = Math.min(Q.length, QPOS + 3 + Math.floor(Math.random()*3));
    Q.splice(pos, 0, it.id);
  }
  QPOS++;
  saveSess();
  /* TOUJOURS au clic (cohérent, fini les avances-surprises) + annulation à portée de pouce */
  const row = el(`<div class="row" style="margin-top:12px">
    <button class="btn ghost" id="undo" title="annuler cette réponse" style="flex:0 0 25%">↶</button>
    <button class="btn" id="cont">Continuer →</button></div>`);
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
    <button class="speak" title="écouter">🔊</button>
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
function exoRecall(it, hinted){
  /* indice : 1re syllabe révélée, les autres en tuiles douces (espaces = respiration) */
  let hint = "";
  if(hinted){
    const chars = [...it.kr];
    hint = `<div class="hint2">` + chars.map((c,i)=>
      c===" " ? `<span class="hgap"></span>`
      : (i===0 ? `<span class="hs show">${esc(c)}</span>` : `<span class="hs"></span>`)
    ).join("") + `</div>`;
  }
  const card = el(`<div class="card center">
    <div class="dim">${hinted?"Rappel avec indice":"Rappel"} — dis-le à voix haute</div>
    <div class="big-fr">${esc(it.fr)}</div>${hint}
    <div class="feedback"></div>
    <div class="row" style="margin-top:12px">
      <button class="btn" id="show">Montrer</button>
    </div></div>`);
  card.querySelector("#show").onclick = ()=>{
    card.querySelector(".feedback").innerHTML = `<span class="kr">${esc(it.kr)}</span>`;
    speak(it.kr, it.id);
    showTrivia(card, it);        // lisible pendant l'auto-évaluation
    const row = card.querySelector(".row");
    row.innerHTML = "";
    const again = el(`<button class="btn ko">Encore</button>`);
    const good  = el(`<button class="btn ok">Bien</button>`);
    const kind = hinted ? "rec4" : "rec5";
    again.onclick = ()=>{ again.disabled=good.disabled=true; afterAnswer(it, false, false, kind); };
    good.onclick  = ()=>{ again.disabled=good.disabled=true; afterAnswer(it, true, false, kind); };
    row.append(again, good);
  };
  $screen.appendChild(card);
}
/* stage 4-5 (variante) : rappel inversé — je vois le coréen, je donne le sens */
function exoRecallRev(it){
  const card = el(`<div class="card center">
    <div class="dim">Rappel inversé — que veut dire…</div>
    <div class="big-kr ${it.type==="phrase"?"phrase":""}">${esc(it.kr)}</div>
    <button class="speak" title="écouter">🔊</button>
    <div class="feedback"></div>
    <div class="row" style="margin-top:12px"><button class="btn" id="show">Montrer</button></div></div>`);
  card.querySelector(".speak").onclick = ()=>speak(it.kr, it.id);
  card.querySelector("#show").onclick = ()=>{
    card.querySelector(".feedback").innerHTML = `<span class="kr">${esc(it.fr)}</span>`;
    showTrivia(card, it);
    const row = card.querySelector(".row");
    row.innerHTML = "";
    const again = el(`<button class="btn ko">Encore</button>`);
    const good  = el(`<button class="btn ok">Bien</button>`);
    again.onclick = ()=>{ again.disabled=good.disabled=true; afterAnswer(it, false, false, "recrev"); };
    good.onclick  = ()=>{ again.disabled=good.disabled=true; afterAnswer(it, true, false, "recrev"); };
    row.append(again, good);
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
      ok ? `<span style="color:var(--ok)">✔ ${esc(answer)}</span>`
         : `<span style="color:var(--ko)">✘</span> <span class="kr">${esc(answer)}</span>`;
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
    $screen.appendChild(el(`<div class="section-title">🔍 Mon dictionnaire</div>`));
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
function renderStats(){
  const t=todayStr(), l=ST.log[t]||{ok:0,ko:0,n:0};
  const items = ALL_IDS.map(eff);              // recto + verso (pour le compteur du lanceur)
  const baseItems = items.filter(it=>!it.rev); // deck de compréhension : les métriques affichées comptent le vocabulaire, pas ×2
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
  const launch = el(`<div class="card center">
    <button class="btn" id="goreview" style="width:100%; font-size:1.1rem; padding:15px">▶ Réviser${todo>0?` · ${todo} carte${todo>1?"s":""}`:""}</button>
    <p class="dim" style="margin-top:6px; font-size:.82rem">${todo>0?"à revoir ou à découvrir aujourd'hui":"tout est à jour — tu peux apprendre de nouvelles cartes"}</p>
  </div>`);
  launch.querySelector("#goreview").onclick = ()=>{
    TAB="review";
    document.querySelectorAll("#tabs button").forEach(x=>x.classList.toggle("active", x.dataset.tab==="review"));
    NAV=true; render(); NAV=false;
  };
  /* test de niveau one-shot retiré (v49) : les barres « maîtrise par niveau » sont plus
     fiables et toujours à jour. placement.js reste chargé mais dormant (réactivable). */
  $screen.appendChild(launch);

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
  const grid = el(`<div class="statgrid">
    <div class="stat"><div class="n">🔥 ${streak()}</div><div class="l">jours d'affilée</div></div>
    <div class="stat"><div class="n">${l.n}</div><div class="l">réponses aujourd'hui</div></div>
    <div class="stat"><div class="n">${ret===null?"—":ret+" %"}</div><div class="l">réussite (7 j)</div></div>
    <div class="stat"><div class="n">${beaten}/${enemies.length}</div><div class="l">ennemies vaincues</div></div>
    <div class="stat"><div class="n">${matures}</div><div class="l">cartes maîtrisées</div></div>
    <div class="stat"><div class="n">${seen} / ${baseItems.length}</div><div class="l">deck abordé</div></div>
  </div>`);
  const STAT_INFO = [
    ["🔥 Jours d'affilée", "Le nombre de jours consécutifs où tu as étudié au moins une carte. Rate un jour et le compteur repart de zéro — c'est ta régularité."],
    ["Réponses aujourd'hui", "Le nombre de cartes que tu as répondues aujourd'hui, tous exercices confondus (QCM, rappel, écoute…)."],
    ["Réussite (7 jours)", "Ton taux de bonnes réponses sur les 7 derniers jours. On ne compte que la PREMIÈRE fois que tu vois chaque carte dans la journée — c'est le vrai test de mémoire, pas les re-essais."],
    ["Ennemies vaincues", "Tes mots les plus ratés (les « ennemies ») que tu as réussi à ramener à un bon niveau (niv ≥ 4). Le premier chiffre = domptées, le second = total de tes ennemies."],
    ["Cartes maîtrisées", "Les cartes arrivées HAUT dans l'échelle de maîtrise (niv ≥ 4 : rappel avec indice, rappel pur ou saisie hangul). Tu les connais solidement, pas juste en reconnaissance."],
    ["Deck abordé", "Combien de cartes du deck tu as déjà commencé à étudier (vues au moins une fois), sur le total disponible. Le reste attend d'être introduit (30 nouvelles/jour dans tes réglages)."]
  ];
  grid.querySelectorAll(".stat").forEach((tile,i)=>{
    tile.classList.add("tap");
    tile.onclick = ()=>openInfo(STAT_INFO[i][0], STAT_INFO[i][1]);
  });
  $screen.appendChild(grid);

  /* ===== Ta maîtrise par niveau (CEFR) — l'image de niveau TOUJOURS À JOUR, tirée des
     données stockées (stade≥4 = maîtrisé) plutôt que d'un test one-shot. % vers le niveau suivant. */
  const BANDS = ["A1","A2","B1","B2","C1"];
  const tot={A1:0,A2:0,B1:0,B2:0,C1:0}, mas={A1:0,A2:0,B1:0,B2:0,C1:0};
  baseItems.forEach(it=>{ const c=(EXTRA[it.id]||{}).cefr; if(tot[c]!==undefined){ tot[c]++; if(it.stage>=4) mas[c]++; } });
  const pct = b => tot[b] ? Math.round(100*mas[b]/tot[b]) : 0;
  let working = null;
  for(const b of BANDS){ if(tot[b] && mas[b]/tot[b] < 0.8){ working = b; break; } }
  $screen.appendChild(el(`<div class="card"><h2>📊 Ta maîtrise par niveau</h2>
    <p class="dim" style="margin-top:2px;font-size:.85rem">${working
      ? `Tu travailles le <b>${working}</b> — ${pct(working)}% maîtrisé. Chaque barre = mots solides (niv ≥ 4) sur le total du niveau.`
      : `Tous les niveaux du deck sont solides. 🏆`}</p>
    <div class="levelbars">${BANDS.map(b=>`
      <div class="lvlrow">
        <span class="lvlname">${b}</span>
        <span class="lvltrack"><span class="lvlfill${b===working?" work":""}" style="width:${pct(b)}%"></span></span>
        <span class="lvlpct">${pct(b)}% <span class="dim" style="font-size:.72rem">(${mas[b]}/${tot[b]})</span></span>
      </div>`).join("")}</div></div>`));

  if(leeches.length){
    $screen.appendChild(el(`<div class="card">
      <h2>🩸 Sangsues (${leeches.length})</h2>
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
      <h2>🗣️ Voix coréenne absente</h2>
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
      <h2>⚠️ Sauvegarde</h2><p class="dim">${ghToken()?"Aucune sauvegarde cloud récente":"Sauvegarde cloud pas encore activée"} —
      ta progression ne vit que sur cet appareil. Ouvre <b>⚙️ Réglages</b> pour la sauvegarder dans le cloud (ou exporter un fichier).</p></div>`));
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
    <p class="dim" style="font-size:.82rem;margin-bottom:6px">Ton rythme de découverte${avg7>0?` — ≈ <b>${avg7}</b> mots/jour cette semaine`:""}.</p>
    <div class="bars">${days14.map(x=>`<div class="b"><div style="height:${Math.max(2,Math.round(70*x.n/mxN))}px${x.d===t?";background:var(--acc)":""}"></div><span>${x.n}</span></div>`).join("")}</div></div>`));

}

/* Note : les cartes « mises de côté » (flag `sus` sur l'état d'item, posé une fois par le
   nettoyage niveau de v46) restent exclues de partout (buildQueue + saut à l'affichage +
   compteur du lanceur). Plus d'UI pour en ajouter/retirer — mécanisme invisible. */

/* ===== Réglages en surcouche (ouverts par la roue ⚙️ du header, depuis n'importe quel onglet) ===== */
function openSettings(){
  const back = el(`<div class="modal-back"></div>`);
  const set = el(`<div class="card modal wide settings"><h2>⚙️ Réglages</h2>
    <label>Nouvelles cartes / jour <input type="number" id="npd" min="0" max="50" value="${ST.set.newPerDay}"></label>
    <label>Taille max de session <input type="number" id="smax" min="20" max="500" step="10" value="${ST.set.sessionMax||120}"></label>
    <label>Prioriser le kit voyage <input type="checkbox" id="kf" ${ST.set.kitFirst?"checked":""}></label>
    <label>Prononcer automatiquement <input type="checkbox" id="ap" ${ST.set.autoplay?"checked":""}></label>
    <label title="FSRS = algorithme moderne (modèle mémoire stabilité/difficulté par carte, ~25% de révisions en moins). Classique = échelle de stades historique.">🧠 Algorithme de répétition
      <select id="sched"><option value="fsrs" ${ST.set.scheduler!=="legacy"?"selected":""}>FSRS (moderne)</option><option value="legacy" ${ST.set.scheduler==="legacy"?"selected":""}>Classique</option></select></label>
    <label title="Rétention cible FSRS : proba de te souvenir au moment de la révision. Plus haut = plus de révisions, meilleure mémoire. Défaut 0.90.">Rétention cible (FSRS) <input type="number" id="fsrsret" min="0.7" max="0.97" step="0.01" value="${ST.set.fsrsRetention||0.9}"></label>
    <label title="Intervalles personnalisés par mot (ALGORITHM.md), UNIQUEMENT en mode Classique. Laisser décoché ~2 semaines : l'app observe d'abord.">
      Planification adaptative (mode Classique) <input type="checkbox" id="adap" ${ST.set.adaptive?"checked":""}></label>
    <label title="Chaque mot devient DEUX cartes à maîtrise séparée : comprendre (KR→FR) et produire (FR→KR). Recommandé, mais double la charge de révision.">🔄 Production séparée (recto/verso) <input type="checkbox" id="rev" ${ST.set.reverse!==false?"checked":""}></label>
    <label>Saisie au clavier coréen (niv 5) <input type="checkbox" id="typ" ${ST.set.typing?"checked":""}></label>
    <label>🐞 Bouton rapport de problème <input type="checkbox" id="rpt" ${ST.set.report?"checked":""}></label>
    <label>🔊 Audio de la phrase d'exemple <input type="checkbox" id="exau" ${ST.set.exaudio?"checked":""}></label>
    <label title="Dans l'encart d'exemple, taper un mot affiche sa traduction française.">👆 Traduction d'un mot au clic <input type="checkbox" id="wgl" ${ST.set.wordgloss?"checked":""}></label>
    <label>Vitesse de la voix <input type="number" id="rate" min="0.5" max="1.2" step="0.1" value="${ST.set.rate}"></label>
    ${koVoices().length>1 ? `<label>Voix coréenne <select id="voice">${
      koVoices().map(v=>`<option value="${esc(v.name)}" ${ST.set.voice===v.name?"selected":""}>${esc(v.name)}</option>`).join("")
    }</select></label>` : ""}
    ${window.SORI_THEMES ? `<label>Style graphique <select id="theme">${
      SORI_THEMES.list.map(th=>`<option value="${th.id}" ${SORI_THEMES.get()===th.id?"selected":""}>${esc(th.label)}</option>`).join("")
    }</select></label>` : ""}
    <div class="section-title" style="margin-top:14px">✈️ Mode avion</div>
    <div class="row" style="margin-top:6px"><button class="btn ghost" id="dlaudio">Télécharger tout l'audio (${AUDIO_IDS.size + AUDIO_EX_IDS.size} fichiers)</button></div>
    <p class="dim" id="dlstatus" style="margin-top:6px">Mots + phrases d'exemple, disponibles hors connexion (avion, métro coréen).</p>
    <div class="section-title" style="margin-top:14px">☁️ Sauvegarde cloud (le canal principal)</div>
    <p class="dim" style="margin-top:4px">Ta progression part toute seule dans le cloud (à chaque fin de bloc) — c'est ta sauvegarde ET ce que Claude lit. Rien d'autre à faire.</p>
    <label>Jeton d'accès <input type="password" id="ghtok" placeholder="${ghToken()?"•••• configuré ••••":"github_pat_…"}" autocomplete="off"></label>
    <div class="row" style="margin-top:8px">
      <button class="btn" id="cloud">☁️ Sauvegarder maintenant</button>
      <button class="btn ghost" id="cloudrestore">↓ Restaurer</button>
    </div>
    <p class="dim" id="cloudstatus" style="margin-top:8px">${
      ghToken() ? (ST.lastCloud ? "Dernière sauvegarde cloud : "+ST.lastCloud+" · auto à chaque fin de bloc." : "Jeton configuré — aucune sauvegarde encore.")
                : "Colle un jeton GitHub fine-grained (dépôt sori-data, permission Contents) pour activer la sauvegarde automatique."}${
      (ST.reports||[]).length ? " · 🐞 "+ST.reports.length+" rapport(s) joint(s) à la prochaine sauvegarde." : ""}</p>
    <details style="margin-top:14px"><summary class="dim">Sauvegarde fichier (secours hors-ligne)</summary>
      <p class="dim" style="margin-top:6px">Optionnel. Un fichier JSON à garder toi-même (ex. sans jeton cloud). Le cloud ci-dessus fait déjà tout.</p>
      <div class="row" style="margin-top:6px">
        <button class="btn ghost" id="exp">📤 Exporter</button>
        <button class="btn ghost" id="imp">📥 Importer</button>
      </div>
      <input type="file" id="impfile" accept=".json,application/json">
    </details>
    <p class="dim" style="margin-top:16px; text-align:center; font-size:.8rem">Sori — version <b id="appver">…</b></p>
    <div class="row" style="margin-top:8px"><button class="btn ghost" id="setclose">Fermer</button></div></div>`);
  back.appendChild(set);
  /* version = le cache actif du service worker (source unique : ce qui tourne VRAIMENT
     sur l'appareil, pas ce que le repo prétend) -> l'utilisateur sait ce qu'il a. */
  (function(){
    const av = set.querySelector("#appver");
    if(!av) return;
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
  set.querySelector("#typ").onchange = e=>{ ST.set.typing=e.target.checked; save(); };
  set.querySelector("#rev").onchange = e=>{ ST.set.reverse=e.target.checked; save(); location.reload(); };  // ALL_IDS fixé au chargement → recharger
  set.querySelector("#rpt").onchange = e=>{ ST.set.report=e.target.checked; save(); wireReport(); };
  set.querySelector("#exau").onchange= e=>{ ST.set.exaudio=e.target.checked; save(); };
  set.querySelector("#wgl").onchange = e=>{ ST.set.wordgloss=e.target.checked; save(); };
  set.querySelector("#rate").onchange= e=>{ ST.set.rate=Math.min(1.2,Math.max(0.5,+e.target.value||0.9)); save(); };
  const vsel = set.querySelector("#voice");
  if(vsel) vsel.onchange = e=>{ ST.set.voice = e.target.value; save(); pickVoice(); ttsSpeak("안녕하세요"); };
  const tsel = set.querySelector("#theme");
  if(tsel) tsel.onchange = e=>SORI_THEMES.set(e.target.value);
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
      st.textContent = fail ? `⚠️ ${done-fail}/${urls.length} audios hors-ligne (${fail} échecs — relance pour compléter).`
                            : `✅ Tout l'audio est disponible hors connexion (${urls.length} fichiers).`;
    }catch(e){ st.textContent = "❌ Échec (connexion ?) — relance pour reprendre où c'était."; }
    btn.disabled = false;
  };
  set.querySelector("#ghtok").onchange = e=>{ setGhToken(e.target.value); e.target.value=""; back.remove(); openSettings(); };
  set.querySelector("#cloud").onclick = async ()=>{
    const st = set.querySelector("#cloudstatus");
    st.textContent = "Envoi en cours…";
    const r = await cloudBackup();
    st.textContent = r.ok ? "✅ Sauvegardé dans le cloud ("+todayStr()+")." : "❌ Échec : "+r.msg;
  };
  set.querySelector("#cloudrestore").onclick = async ()=>{
    const st = set.querySelector("#cloudstatus");
    st.textContent = "Lecture du cloud…";
    const r = await cloudRestore();
    if(r.ok){ back.remove(); return; }   // restauration OK : render() déjà relancé, on ferme l'overlay
    st.textContent = "❌ Restauration : "+r.msg;
  };
  set.querySelector("#setclose").onclick = ()=>back.remove();
  back.addEventListener("click", e=>{ if(e.target===back) back.remove(); });
  document.body.appendChild(back);
}
/* ================= sauvegarde cloud (GitHub, dépôt privé sori-data) =================
   Jeton fine-grained stocké UNIQUEMENT sur l'appareil (clé séparée, jamais dans un export). */
const GH_KEY = "sori-gh-token";
const GH_REPO = "mnafati-cloud/sori-data";
function ghToken(){ try{ return localStorage.getItem(GH_KEY)||""; }catch(e){ return ""; } }
function setGhToken(t){ try{ t ? localStorage.setItem(GH_KEY, t.trim()) : localStorage.removeItem(GH_KEY); }catch(e){} }
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
  cloudBackup();
}
/* migration douce commune (import fichier OU restauration cloud) */
function applyImportedState(state){
  const s = state;
  s.items = s.items||{}; s.log = s.log||{}; s.intro = s.intro||{}; s.rlog = s.rlog||[];
  s.set = Object.assign({}, DEF_SET, s.set||{});
  s.v = s.v || 1;
  ST = s; save(); Q = null; render();
}
/* confirmation à MINUTEUR pour une action irréversible : le bouton Confirmer reste grisé
   quelques secondes (compte à rebours visible), Annuler est cliquable à tout instant.
   Renvoie une Promise<bool>. Clic hors carte = Annuler. */
function confirmRestore(when, loss){
  return new Promise(resolve=>{
    const back = el(`<div class="modal-back">
      <div class="card modal">
        <h2>⚠️ Restaurer depuis le cloud</h2>
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

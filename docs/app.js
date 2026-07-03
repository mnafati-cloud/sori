/* Sori — moteur de révision coréen (échelle de maîtrise + QCM intelligents + TTS) */
"use strict";

/* ================= état & persistance ================= */
const LS_KEY = "sori-state-v1";
const SEED_BY_ID = {};
SEED.items.forEach(it => SEED_BY_ID[it.id] = it);

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
        s.items = s.items||{}; s.log = s.log||{}; s.intro = s.intro||{};
        s.set = Object.assign({}, DEF_SET, s.set||{});
        s.xp = s.xp||0;
        return s;
      }
    }
  }catch(e){}
  return { v:1, items:{}, log:{}, intro:{}, xp:0, set: Object.assign({}, DEF_SET) };
}
/* niveaux façon échelle coréenne (급) — plancher, jamais un plafond */
const XP_LEVELS = [[0,"9급"],[1000,"8급"],[2500,"7급"],[5000,"6급"],[8000,"5급"],
                   [12000,"4급"],[17000,"3급"],[23000,"2급"],[30000,"1급"],[40000,"초단"]];
function levelName(xp){ let n=XP_LEVELS[0][1]; for(const [t,l] of XP_LEVELS){ if(xp>=t) n=l; } return n; }
const EXTRA = (typeof window!=="undefined" && window.EXTRA) || {};
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
  };
}
function setItem(id, patch){
  const cur = ST.items[id] || {};
  ST.items[id] = Object.assign(cur, patch);
  save();
}
const ALL_IDS = SEED.items.map(it=>it.id);

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
    if(ok){ l.so=(l.so||0)+r.iLegacy; l.sn=(l.sn||0)+r.iAdaptive; }   // shadow legacy vs adaptatif
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
  };
}
function undoLast(){
  if(!UNDO) return;
  const t = todayStr();
  ST.items = UNDO.items;
  if(UNDO.log === null) delete ST.log[t]; else ST.log[t] = UNDO.log;
  ST.xp = UNDO.xp; COMBO = UNDO.combo; SESSFAIL = UNDO.sessfail;
  Q = UNDO.q; QPOS = UNDO.qpos;
  UNDO = null;
  save(); saveSess(); updateDayCount(); render();
}
function updateDayCount(){
  const l = ST.log[todayStr()];
  document.getElementById("daycount").textContent = l ? l.n : 0;
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
function streak(){ return ENGINE.computeStreak(ST.log, todayStr(), addDays); }

/* ================= audio : MP3 natifs prioritaires, TTS en secours ================= */
const AUDIO_IDS = new Set((typeof window!=="undefined" && window.AUDIO) || []);
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
  /* 1) audio natif pré-généré si disponible (indépendant du TTS du téléphone) */
  if(id && AUDIO_IDS.has(String(id))){
    try{
      if(CURAUDIO) CURAUDIO.pause();
      try{ speechSynthesis.cancel(); }catch(e){}
      CURAUDIO = new Audio("./audio/"+id+".mp3");
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

/* ================= planification (logique dans engine.js) ================= */
function applyAnswer(it, ok){
  const r = ENGINE.computeAnswer(it, ok, todayStr(), ST.set.adaptive === true);
  setItem(it.id, { s:r.s, i:r.i, d:r.d, e:r.e, ok: it.ok+(ok?1:0), ko: it.ko+(ok?0:1) });
  return r;
}

/* file du jour : échues + nouvelles (kit prioritaire) */
function buildQueue(){
  const t = todayStr();
  const effAll = ALL_IDS.map(eff);
  const due = ENGINE.selectDue(effAll, t);
  // introduction de nouvelles
  const introToday = ST.intro[t]||0;
  let slots = Math.max(0, (ST.set.newPerDay||0) - introToday);
  if(slots>0){
    for(const id of ENGINE.pickNew(effAll, slots, ST.set.kitFirst)){
      setItem(id, { s:1, i:0, d:t });
      due.push(id);
      ST.intro[t] = (ST.intro[t]||0)+1;
    }
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
  return ENGINE.pickDistractors(it, n, field, SEED_BY_ID, ALL_IDS);
}

/* ================= UI ================= */
const $screen = document.getElementById("screen");
let TAB = "review";
document.getElementById("tabs").addEventListener("click", e=>{
  const b = e.target.closest("button"); if(!b) return;
  TAB = b.dataset.tab;
  document.querySelectorAll("#tabs button").forEach(x=>x.classList.toggle("active", x===b));
  render();
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
  else if(TAB==="listen"){ renderListen(); armCooldown(); }
  else if(TAB==="trip") renderTrip();
  else renderStats();
  updateDayCount();
}

/* ---------- mode Réviser ---------- */
let Q = null, QPOS = 0, BONUS = false, COMBO = 0, SESSFAIL = [];
/* la session en cours survit à un kill de l'app (Android) */
function saveSess(){
  ST.sess = (BONUS || !Q) ? null : { d:todayStr(), q:Q, p:QPOS, pen:PENDING };
  save();
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
    const more = PENDING>0 ? `<button class="btn" id="more">Continuer (${PENDING} en attente)</button>` : "";
    const boss = bossCandidates();
    const bossBtn = boss.length ? `<button class="btn ghost" id="boss">⚔️ Boss fight (${Math.min(boss.length,20)} ennemies)</button>` : "";
    $screen.appendChild(el(`<div class="card center">
      <div class="done-banner">${PENDING>0?"💪":"🎉"}</div>
      <h2>${PENDING>0?"Session terminée !":"Tout est à jour !"}</h2>
      <p class="dim">${l.ok||0} bonnes réponses aujourd'hui${l.ko?`, ${l.ko} à retravailler`:""}.</p>
      <p class="dim">✨ +${l.xp||0} XP aujourd'hui · ${esc(levelName(ST.xp||0))} (${ST.xp||0} XP)</p>
      <div class="row" style="margin-top:12px">
        ${more}
        <button class="btn ghost" id="bonus">Entraînement libre (10)</button>
      </div>
      ${bossBtn ? `<div class="row" style="margin-top:10px">${bossBtn}</div>` : ""}</div>`));
    /* récap : les mots ratés de la session, à réécouter d'un tap */
    if(SESSFAIL.length){
      const rec = el(`<div class="card"><h2>📌 À retravailler (${SESSFAIL.length})</h2>
        <p class="dim">Les ratés de cette session — tape un mot pour l'écouter.</p>
        <div class="list"></div></div>`);
      const list = rec.querySelector(".list");
      SESSFAIL.slice(0,10).forEach(id=>{
        const o = SEED_BY_ID[id]; if(!o) return;
        const row = el(`<div class="item"><div class="txt"><div class="kr">${esc(o.kr)}</div>
          <div class="fr">${esc(o.fr)}${EXTRA[id]&&EXTRA[id].note?` — 💡 ${esc(EXTRA[id].note)}`:""}</div></div>
          <button class="speak">🔊</button></div>`);
        row.onclick = ()=>speak(o.kr, id);
        list.appendChild(row);
      });
      $screen.appendChild(rec);
    }
    const m=document.getElementById("more");
    if(m) m.onclick = ()=>{ Q=null; render(); };
    document.getElementById("bonus").onclick = ()=>{ Q = bonusQueue(); QPOS=0; BONUS=true; render(); };
    const bb=document.getElementById("boss");
    if(bb) bb.onclick = startBoss;
    /* 🎯 quêtes du jour en mode compact (fin de session) */
    if(window.SORI_QUESTS){
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
  const head = el(`<div>
    <div class="progressbar"><div style="width:${Math.round(100*QPOS/Q.length)}%"></div></div>
    <div class="dim" style="margin-top:6px">${QPOS+1} / ${Q.length}
      ${it.enemy?'<span class="pill enemy">ennemie</span>':""}
      <span class="pill stage">niv ${it.stage}</span>
      ${COMBO>=3?`<span class="pill" style="color:var(--acc)">🔥 combo ×${COMBO}</span>`:""}</div></div>`);
  $screen.appendChild(head);
  EXO_T0 = Date.now();
  if(it.stage<=2) exoQcmKr2Fr(it);
  else if(it.stage===3){
    if(it.type==="phrase" && it.kr.split(" ").length>=3) exoBuild(it);
    else exoQcmFr2Kr(it);
  }
  else {
    /* les deux sens aux hauts niveaux : 40% de rappel inversé (KR->FR) */
    if(Math.random()<0.4) exoRecallRev(it);
    else if(it.stage===5 && ST.set.typing===true && it.type==="word"
            && window.SORI_TYPING && Math.random()<0.5){
      /* production ultime : taper la réponse avec l'IME coréen (typing.js) */
      SORI_TYPING.render($screen, {
        item: it,
        speak: (kr,id)=>speak(kr,id),
        onResult: ok=>afterAnswer(it, ok, false, "type")
      });
    }
    else exoRecall(it, it.stage===4);
  }
}
function bonusQueue(){
  const pool = ALL_IDS.map(eff).filter(it=>it.stage>=2);
  shuffle(pool); return pool.slice(0,10).map(it=>it.id);
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
/* encart d'aide (phrase d'exemple, faux ami, note hanja) — contenu dans extra.js */
function showTrivia(card, it){
  const x = EXTRA[it.id];
  if(!x) return false;
  const bits = [];
  if(x.ex) bits.push(`<div class="tkr">${esc(x.ex)}</div>${x.exFr?`<div class="tfr">${esc(x.exFr)}</div>`:""}`);
  if(x.conj) bits.push(`<div class="tconj">활용 ${esc(x.conj)}</div>`);
  if(x.note) bits.push(`<div class="tnote">💡 ${esc(x.note)}</div>`);
  if(!bits.length) return false;
  card.appendChild(el(`<div class="trivia">${bits.join("")}</div>`));
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
  if(ST.set.autoplay) speak(it.kr, it.id);
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
  if(ST.set.autoplay) speak(it.kr, it.id);
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
  /* écoute passive (playlist mains-libres, écran verrouillé) — docs/player.js */
  if(window.SORI_PLAYER){
    SORI_PLAYER.renderCard($screen, {
      tracks: ALL_IDS.map(eff).map(it=>({
        id: it.id, kr: it.kr, fr: it.fr, stage: it.stage,
        enemy: !!it.enemy, kit: !!it.kit,
        hasAudio: AUDIO_IDS.has(String(it.id))
      })),
      rate: ST.set.rate || 0.9
    });
  }
  /* 🔢 entraîneur de nombres (numbers.js) — nombres générés à la volée, TTS texte brut (pas de MP3) */
  if(window.SORI_NUMBERS){
    SORI_NUMBERS.renderCard($screen, {
      speak: (txt)=>ttsSpeak(txt),
      onAnswer: (ok)=>logAnswer(ok, "nombres")
    });
  }
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
    <div class="opts"></div></div>`);
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
      card.appendChild(el(`<div class="feedback"><span class="kr">${esc(it.kr)}</span> — ${esc(it.fr)}</div>`));
      logAnswer(ok, dictee?"dictee":"listen", null, EXO_T0 ? Date.now()-EXO_T0 : 0);
      LPOS++;
      setTimeout(render, ok?800:1700);
    };
    box.appendChild(b);
  });
  $screen.appendChild(card);
  setTimeout(()=>speak(it.kr, it.id), 250);
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
      items: ALL_IDS.map(eff),
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
  const kit = ALL_IDS.map(eff).filter(it=>it.kit);
  const groups = {};
  kit.forEach(it=>{
    const g = it.theme.startsWith("voyage::") ? it.theme.split("::")[1] : "deck";
    (groups[g]=groups[g]||[]).push(it);
  });
  $screen.appendChild(el(`<div class="card center"><h2>🧳 Kit de survie voyage</h2>
    <p class="dim">${kit.length} phrases essentielles. Écoute, répète à voix haute (shadowing), puis drille.</p>
    <button class="btn" id="drill">▶ Drill audio</button></div>`));
  document.getElementById("drill").onclick=()=>{ DRILL=shuffle(kit.map(x=>x.id)); DPOS=0; render(); };
  Object.keys(TRIP_LABELS).forEach(g=>{
    if(!groups[g]) return;
    $screen.appendChild(el(`<div class="section-title">${TRIP_LABELS[g]}</div>`));
    const list = el(`<div class="list"></div>`);
    groups[g].forEach(it=>{
      const row = el(`<div class="item"><div class="txt">
        <div class="kr">${esc(it.kr)}</div><div class="fr">${esc(it.fr)}</div></div>
        <span class="pill stage">niv ${it.stage}</span><button class="speak">🔊</button></div>`);
      row.querySelector(".speak").onclick=(e)=>{ e.stopPropagation(); speak(it.kr, it.id); };
      row.onclick=()=>speak(it.kr, it.id);
      list.appendChild(row);
    });
    $screen.appendChild(list);
  });
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
  speak(it.kr, it.id);
}

/* ---------- Stats & réglages ---------- */
function renderStats(){
  const t=todayStr(), l=ST.log[t]||{ok:0,ko:0,n:0};
  /* événements actifs (countdown départ, défis…) — données : events-data.js, recette : MAINTENANCE-EVENTS.md */
  if(window.SORI_EVENTS){
    ST.evDismiss = ST.evDismiss || {};        // champ additif, migration douce implicite
    SORI_EVENTS.renderCards($screen, {
      today: t, log: ST.log, dismissed: ST.evDismiss,
      onDismiss: id => { ST.evDismiss[id] = true; save(); }
    });
  }
  const items = ALL_IDS.map(eff);
  const stages=[0,0,0,0,0,0];
  items.forEach(it=>stages[it.stage]++);
  const enemies = items.filter(it=>it.enemy);
  const beaten = enemies.filter(it=>it.stage>=4).length;
  // rétention 7 jours (mesure propre : 1res présentations comptées, fenêtre hier -> J-7)
  const r7 = ENGINE.retention7(ST.log, t);
  const ret = r7.r===null ? null : Math.round(100*r7.r);
  // sangsues : ease au plancher + échecs répétés -> à retravailler autrement
  const leeches = items.filter(it=>ENGINE.isLeech(it));

  $screen.appendChild(el(`<div class="statgrid">
    <div class="stat"><div class="n">🔥 ${streak()}</div><div class="l">jours d'affilée</div></div>
    <div class="stat"><div class="n">${l.n}</div><div class="l">réponses aujourd'hui</div></div>
    <div class="stat"><div class="n">${ret===null?"—":ret+" %"}</div><div class="l">réussite (7 j)</div></div>
    <div class="stat"><div class="n">${beaten}/${enemies.length}</div><div class="l">ennemies vaincues</div></div>
    <div class="stat"><div class="n">${esc(levelName(ST.xp||0))}</div><div class="l">niveau</div></div>
    <div class="stat"><div class="n">${ST.xp||0}</div><div class="l">XP total</div></div>
  </div>`));

  if(leeches.length){
    $screen.appendChild(el(`<div class="card">
      <h2>🩸 Sangsues (${leeches.length})</h2>
      <p class="dim">Ces mots résistent à la répétition — change d'angle : mnémotechnique, phrase à toi, post-it.
      ${leeches.slice(0,8).map(x=>`<span class="pill">${esc(x.kr)}</span>`).join("")}${leeches.length>8?"…":""}</p></div>`));
  }

  /* 🎯 quêtes du jour + badges (quests.js) — état additif ST.qdone */
  if(window.SORI_QUESTS){
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

  /* 🎓 bilan de niveau périodique (exam.js) — historique additif ST.exams, zéro effet sur la planif */
  if(window.SORI_EXAM){
    ST.exams = ST.exams || [];
    SORI_EXAM.renderCard($screen, {
      items: items, extra: EXTRA,
      speak: (kr,id)=>speak(kr,id),
      history: ST.exams,
      onFinish: r => { ST.exams.push(Object.assign({}, r, {date: todayStr()})); save(); },
      onExit: () => render()
    });
  }

  const bossN = Math.min(bossCandidates().length, 20);
  if(bossN){
    const bcard = el(`<div class="card center"><h2>⚔️ Boss fight</h2>
      <p class="dim">Affronte tes mots les plus ratés en QCM ciblés (${bossN} au menu).</p>
      <button class="btn" id="boss2">Lancer le combat</button></div>`);
    bcard.querySelector("#boss2").onclick = startBoss;
    $screen.appendChild(bcard);
  }

  /* avertissement voix coréenne absente (sinon accent français sur le hangul !) */
  if(koVoiceMissing()){
    $screen.appendChild(el(`<div class="card" style="border-color:var(--ko)">
      <h2>🗣️ Voix coréenne absente</h2>
      <p class="dim">Ton appareil lit le coréen avec une voix française. Pour corriger sur Android :
      <b>Paramètres → Gestion générale (ou Système) → Synthèse vocale → moteur "Synthèse vocale Google"
      → ⚙️ → Installer les données de voix → 한국어 (coréen)</b>, puis redémarre l'app.
      Les phrases du kit voyage ont aussi leur audio natif intégré (indépendant du téléphone).</p></div>`));
  }
  /* rappel d'export : la sauvegarde ne vit que sur cet appareil */
  const lastX = ST.lastExport;
  const days = lastX ? Math.round((new Date(t+"T12:00:00") - new Date(lastX+"T12:00:00"))/86400000) : null;
  if(days===null || days>=7){
    $screen.appendChild(el(`<div class="card" style="border-color:var(--warn)">
      <h2>⚠️ Sauvegarde</h2><p class="dim">${days===null?"Aucun export encore fait":"Dernier export il y a "+days+" j"} —
      ta progression ne vit que sur cet appareil. Exporte-la (bouton ci-dessous) et partage vers OneDrive.</p></div>`));
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

  const set = el(`<div class="card settings"><h2>Réglages</h2>
    <label>Nouvelles cartes / jour <input type="number" id="npd" min="0" max="50" value="${ST.set.newPerDay}"></label>
    <label>Taille max de session <input type="number" id="smax" min="20" max="500" step="10" value="${ST.set.sessionMax||120}"></label>
    <label>Prioriser le kit voyage <input type="checkbox" id="kf" ${ST.set.kitFirst?"checked":""}></label>
    <label>Prononcer automatiquement <input type="checkbox" id="ap" ${ST.set.autoplay?"checked":""}></label>
    <label title="Intervalles personnalisés par mot (ALGORITHM.md). Laisser décoché ~2 semaines : l'app observe d'abord.">
      Planification adaptative <input type="checkbox" id="adap" ${ST.set.adaptive?"checked":""}></label>
    <label>Saisie au clavier coréen (niv 5) <input type="checkbox" id="typ" ${ST.set.typing?"checked":""}></label>
    <label>🐞 Bouton rapport de problème <input type="checkbox" id="rpt" ${ST.set.report?"checked":""}></label>
    <label>Vitesse de la voix <input type="number" id="rate" min="0.5" max="1.2" step="0.1" value="${ST.set.rate}"></label>
    ${koVoices().length>1 ? `<label>Voix coréenne <select id="voice">${
      koVoices().map(v=>`<option value="${esc(v.name)}" ${ST.set.voice===v.name?"selected":""}>${esc(v.name)}</option>`).join("")
    }</select></label>` : ""}
    ${window.SORI_THEMES ? `<label>Style graphique <select id="theme">${
      SORI_THEMES.list.map(th=>`<option value="${th.id}" ${SORI_THEMES.get()===th.id?"selected":""}>${esc(th.label)}</option>`).join("")
    }</select></label>` : ""}
    <div class="row" style="margin-top:12px">
      <button class="btn ghost" id="exp">📤 Exporter</button>
      <button class="btn ghost" id="imp">📥 Importer</button>
    </div>
    <input type="file" id="impfile" accept=".json,application/json">
    <div class="section-title" style="margin-top:14px">✈️ Mode avion</div>
    <div class="row" style="margin-top:6px"><button class="btn ghost" id="dlaudio">Télécharger tout l'audio (~17 Mo)</button></div>
    <p class="dim" id="dlstatus" style="margin-top:6px">Rend chaque prononciation disponible hors connexion (avion, métro coréen).</p>
    <div class="section-title" style="margin-top:14px">☁️ Sauvegarde cloud (GitHub privé)</div>
    <label>Jeton d'accès <input type="password" id="ghtok" placeholder="${ghToken()?"•••• configuré ••••":"github_pat_…"}" autocomplete="off"></label>
    <div class="row" style="margin-top:8px">
      <button class="btn" id="cloud">☁️ Sauvegarder maintenant</button>
    </div>
    <p class="dim" id="cloudstatus" style="margin-top:8px">${
      ghToken() ? (ST.lastCloud ? "Dernière sauvegarde cloud : "+ST.lastCloud+" · auto 1×/jour en fin de session." : "Jeton configuré — aucune sauvegarde encore.")
                : "Colle un jeton GitHub fine-grained (dépôt sori-data, permission Contents) pour activer la sauvegarde automatique."}${
      (ST.reports||[]).length ? " · 🐞 "+ST.reports.length+" rapport(s) joint(s) à la prochaine sauvegarde." : ""}</p></div>`);
  $screen.appendChild(set);
  set.querySelector("#npd").onchange = e=>{ ST.set.newPerDay=Math.max(0,+e.target.value||0); save(); };
  set.querySelector("#smax").onchange= e=>{ ST.set.sessionMax=Math.max(20,+e.target.value||120); save(); };
  set.querySelector("#kf").onchange  = e=>{ ST.set.kitFirst=e.target.checked; save(); };
  set.querySelector("#ap").onchange  = e=>{ ST.set.autoplay=e.target.checked; save(); };
  set.querySelector("#adap").onchange= e=>{ ST.set.adaptive=e.target.checked; save(); };
  set.querySelector("#typ").onchange = e=>{ ST.set.typing=e.target.checked; save(); };
  set.querySelector("#rpt").onchange = e=>{ ST.set.report=e.target.checked; save(); wireReport(); };
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
      const ids = [...AUDIO_IDS];
      let done = 0, added = 0, fail = 0;
      const CONC = 6;
      async function one(id){
        const url = "./audio/"+id+".mp3";
        if(!(await cache.match(url))){
          try{ await cache.add(url); added++; }catch(e){ fail++; }
        }
        done++;
        if(done % 40 === 0 || done === ids.length)
          st.textContent = `Téléchargement… ${done}/${ids.length}` + (fail?` (${fail} échecs)`:"");
      }
      for(let i=0; i<ids.length; i+=CONC) await Promise.all(ids.slice(i, i+CONC).map(one));
      st.textContent = fail ? `⚠️ ${done-fail}/${ids.length} audios hors-ligne (${fail} échecs — relance pour compléter).`
                            : `✅ Tout l'audio est disponible hors connexion (${ids.length} fichiers).`;
    }catch(e){ st.textContent = "❌ Échec (connexion ?) — relance pour reprendre où c'était."; }
    btn.disabled = false;
  };
  set.querySelector("#ghtok").onchange = e=>{ setGhToken(e.target.value); e.target.value=""; render(); };
  set.querySelector("#cloud").onclick = async ()=>{
    const st = set.querySelector("#cloudstatus");
    st.textContent = "Envoi en cours…";
    const r = await cloudBackup();
    st.textContent = r.ok ? "✅ Sauvegardé dans le cloud ("+todayStr()+")." : "❌ Échec : "+r.msg;
  };
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
function autoCloudBackup(){   // silencieux, au plus 1x/jour, fin de session
  if(ghToken() && ST.lastCloud !== todayStr()) cloudBackup();
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
      if(confirm("Remplacer la progression locale par cet export ?")){
        /* même migration douce qu'au chargement : un vieil export reste valide */
        const s = data.state;
        s.items = s.items||{}; s.log = s.log||{}; s.intro = s.intro||{};
        s.set = Object.assign({}, DEF_SET, s.set||{});
        s.v = s.v || 1;
        ST = s; save(); Q=null; render();
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
render();

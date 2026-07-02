/* Sori — moteur de révision coréen (échelle de maîtrise + QCM intelligents + TTS) */
"use strict";

/* ================= état & persistance ================= */
const LS_KEY = "sori-state-v1";
const SEED_BY_ID = {};
SEED.items.forEach(it => SEED_BY_ID[it.id] = it);

function todayStr(){ const d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function addDays(dstr, n){ const d=new Date(dstr+"T12:00:00"); d.setDate(d.getDate()+n);
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }

const DEF_SET = { newPerDay:12, kitFirst:true, rate:0.9, listenN:10, sessionMax:120, mute:false, autoplay:true };
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
        return s;
      }
    }
  }catch(e){}
  return { v:1, items:{}, log:{}, intro:{}, set: Object.assign({}, DEF_SET) };
}
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
  };
}
function setItem(id, patch){
  const cur = ST.items[id] || {};
  ST.items[id] = Object.assign(cur, patch);
  save();
}
const ALL_IDS = SEED.items.map(it=>it.id);

/* ================= journal & stats ================= */
function logAnswer(ok, kind){
  const t = todayStr();
  const l = ST.log[t] || (ST.log[t]={ok:0,ko:0,n:0,listen:0});
  l.n++; if(kind==="listen"){ l.listen++; }
  if(ok) l.ok++; else l.ko++;
  save(); updateDayCount();
}
function updateDayCount(){
  const l = ST.log[todayStr()];
  document.getElementById("daycount").textContent = l ? l.n : 0;
}
/* bouton muet global (l'app reste 100% utilisable sans audio) */
function wireMute(){
  const b = document.getElementById("mute");
  if(!b) return;
  const paint = ()=>{ b.textContent = ST.set.mute ? "🔇" : "🔊"; b.title = ST.set.mute ? "Réactiver le son" : "Couper le son"; };
  b.onclick = ()=>{ ST.set.mute = !ST.set.mute; if(ST.set.mute) try{speechSynthesis.cancel();}catch(e){} save(); paint(); };
  paint();
}
function streak(){
  let n=0, d=todayStr();
  const l0 = ST.log[d];
  if(!l0 || l0.n===0){ d = addDays(d,-1); }        // aujourd'hui pas encore fait -> compter depuis hier
  while(ST.log[d] && ST.log[d].n>0){ n++; d = addDays(d,-1); }
  return n;
}

/* ================= TTS coréen ================= */
let KOVOICE = null;
function pickVoice(){
  const vs = speechSynthesis.getVoices();
  KOVOICE = vs.find(v=>/^ko/i.test(v.lang)) || null;
}
if("speechSynthesis" in window){
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}
function speak(text){
  if(ST.set.mute) return;
  if(!("speechSynthesis" in window)) return;
  try{
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/\(.*?\)/g,""));
    u.lang = "ko-KR"; if(KOVOICE) u.voice = KOVOICE;
    u.rate = ST.set.rate || 0.9;
    speechSynthesis.speak(u);
  }catch(e){}
}

/* ================= planification ================= */
const STEP = {2:1, 3:2, 4:4, 5:8};   // intervalle (jours) en arrivant à ce stage
function applyAnswer(it, ok){
  let s = it.stage, itv = it.itv, due;
  if(ok){
    if(s<5){ s = s+1; itv = STEP[s] || 1; }
    else { itv = Math.min(120, Math.max(14, Math.round(itv*2.2))); }
    due = addDays(todayStr(), itv);
  } else {
    s = Math.max(1, s-2); itv = 0; due = todayStr();
  }
  setItem(it.id, { s, i:itv, d:due, ok: it.ok+(ok?1:0), ko: it.ko+(ok?0:1) });
}

/* file du jour : échues + nouvelles (kit prioritaire) */
function buildQueue(){
  const t = todayStr();
  const due = [];
  ALL_IDS.forEach(id => {
    const it = eff(id);
    if(it.stage>=1 && it.due && it.due<=t) due.push(id);
  });
  // introduction de nouvelles
  const introToday = ST.intro[t]||0;
  let slots = Math.max(0, (ST.set.newPerDay||0) - introToday);
  if(slots>0){
    const news = ALL_IDS.map(eff).filter(it=>it.stage===0);
    news.sort((a,b)=> (ST.set.kitFirst ? (b.kit?1:0)-(a.kit?1:0) : 0) || (a.id<b.id?-1:1));
    for(const it of news.slice(0, slots)){
      setItem(it.id, { s:1, i:0, d:t });
      due.push(it.id);
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
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function sample(arr, n, excl){
  const pool = arr.filter(x=>!excl.has(x));
  shuffle(pool); return pool.slice(0,n);
}

/* ================= distracteurs ================= */
function distractors(it, n, field){
  const out=[], seen=new Set([it.id]);
  const push = id => { const o=SEED_BY_ID[id]; if(o && !seen.has(id) && o[field]!==it[field==="fr"?"fr":"kr"]){ out.push(id); seen.add(id);} };
  if(it.stage>=2) (it.conf||[]).forEach(id=>{ if(out.length<n) push(id); });
  if(out.length<n){
    const theme = ALL_IDS.filter(id=>{ const o=SEED_BY_ID[id]; return o.theme===it.theme && o.type===it.type; });
    sample(theme, n-out.length+2, seen).forEach(id=>{ if(out.length<n) push(id); });
  }
  if(out.length<n){
    const any = ALL_IDS.filter(id=>SEED_BY_ID[id].type===it.type);
    sample(any, n-out.length+3, seen).forEach(id=>{ if(out.length<n) push(id); });
  }
  return out.slice(0,n);
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
function render(){
  $screen.innerHTML="";
  if(TAB==="review") renderReview();
  else if(TAB==="listen") renderListen();
  else if(TAB==="trip") renderTrip();
  else renderStats();
  updateDayCount();
}

/* ---------- mode Réviser ---------- */
let Q = null, QPOS = 0, BONUS = false;
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
      Q = buildQueue(); QPOS = 0; BONUS = false;
      saveSess();
    }
  }
  if(QPOS >= Q.length){
    ST.sess = null; save();
    const t=todayStr(), l=ST.log[t]||{ok:0,ko:0};
    const more = PENDING>0 ? `<button class="btn" id="more">Continuer (${PENDING} en attente)</button>` : "";
    const boss = bossCandidates();
    const bossBtn = boss.length ? `<button class="btn ghost" id="boss">⚔️ Boss fight (${Math.min(boss.length,20)} ennemies)</button>` : "";
    $screen.appendChild(el(`<div class="card center">
      <div class="done-banner">${PENDING>0?"💪":"🎉"}</div>
      <h2>${PENDING>0?"Session terminée !":"Tout est à jour !"}</h2>
      <p class="dim">${l.ok||0} bonnes réponses aujourd'hui${l.ko?`, ${l.ko} à retravailler`:""}.</p>
      <div class="row" style="margin-top:12px">
        ${more}
        <button class="btn ghost" id="bonus">Entraînement libre (10)</button>
      </div>
      ${bossBtn ? `<div class="row" style="margin-top:10px">${bossBtn}</div>` : ""}</div>`));
    const m=document.getElementById("more");
    if(m) m.onclick = ()=>{ Q=null; render(); };
    document.getElementById("bonus").onclick = ()=>{ Q = bonusQueue(); QPOS=0; BONUS=true; render(); };
    const bb=document.getElementById("boss");
    if(bb) bb.onclick = startBoss;
    return;
  }
  const it = eff(Q[QPOS]);
  const head = el(`<div>
    <div class="progressbar"><div style="width:${Math.round(100*QPOS/Q.length)}%"></div></div>
    <div class="dim" style="margin-top:6px">${QPOS+1} / ${Q.length}
      ${it.enemy?'<span class="pill enemy">ennemie</span>':""}
      <span class="pill stage">niv ${it.stage}</span></div></div>`);
  $screen.appendChild(head);
  if(it.stage<=2) exoQcmKr2Fr(it);
  else if(it.stage===3){
    if(it.type==="phrase" && it.kr.split(" ").length>=3) exoBuild(it);
    else exoQcmFr2Kr(it);
  }
  else {
    /* les deux sens aux hauts niveaux : 40% de rappel inversé (KR->FR) */
    if(Math.random()<0.4) exoRecallRev(it);
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
  if(x.note) bits.push(`<div class="tnote">💡 ${esc(x.note)}</div>`);
  if(!bits.length) return false;
  card.appendChild(el(`<div class="trivia">${bits.join("")}</div>`));
  return true;
}
function afterAnswer(it, ok, sawTrivia){
  logAnswer(ok, "review");
  if(!BONUS) applyAnswer(it, ok);
  if(!ok && !BONUS){ // re-poser dans la session, 3-5 cartes plus loin
    const pos = Math.min(Q.length, QPOS + 3 + Math.floor(Math.random()*3));
    Q.splice(pos, 0, it.id);
  }
  QPOS++;
  saveSess();
  const base = ok ? 750 : 1500;
  setTimeout(render, sawTrivia ? base + 1600 : base);
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
  card.querySelector(".speak").onclick = ()=>speak(it.kr);
  const box = card.querySelector(".opts");
  opts.forEach(id=>{
    const o = SEED_BY_ID[id];
    const b = el(`<button>${esc(o.fr)}</button>`);
    b.onclick = ()=>{
      const ok = id===it.id;
      box.querySelectorAll("button").forEach(x=>x.disabled=true);
      b.classList.add(ok?"good":"bad");
      if(!ok) [...box.children].find(x=>x.textContent===SEED_BY_ID[it.id].fr)?.classList.add("good");
      speak(it.kr);
      afterAnswer(it, ok, showTrivia(card, it));
    };
    box.appendChild(b);
  });
  $screen.appendChild(card);
  if(ST.set.autoplay) speak(it.kr);
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
      if(!ok) [...box.children].find(x=>x.textContent===SEED_BY_ID[it.id].kr)?.classList.add("good");
      speak(it.kr);
      afterAnswer(it, ok, showTrivia(card, it));
    };
    box.appendChild(b);
  });
  $screen.appendChild(card);
}
/* stage 4-5 : rappel (indicé ou pur), auto-évalué */
function exoRecall(it, hinted){
  const hint = hinted ? `<div class="hint">${esc(it.kr[0])}${"▮".repeat(Math.max(1,[...it.kr.replace(/\s/g,"")].length-1))}</div>` : "";
  const card = el(`<div class="card center">
    <div class="dim">${hinted?"Rappel avec indice":"Rappel"} — dis-le à voix haute</div>
    <div class="big-fr">${esc(it.fr)}</div>${hint}
    <div class="feedback"></div>
    <div class="row" style="margin-top:12px">
      <button class="btn" id="show">Montrer</button>
    </div></div>`);
  card.querySelector("#show").onclick = ()=>{
    card.querySelector(".feedback").innerHTML = `<span class="kr">${esc(it.kr)}</span>`;
    speak(it.kr);
    showTrivia(card, it);        // lisible pendant l'auto-évaluation
    const row = card.querySelector(".row");
    row.innerHTML = "";
    const again = el(`<button class="btn ko">Encore</button>`);
    const good  = el(`<button class="btn ok">Bien</button>`);
    again.onclick = ()=>afterAnswer(it, false);
    good.onclick  = ()=>afterAnswer(it, true);
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
  card.querySelector(".speak").onclick = ()=>speak(it.kr);
  card.querySelector("#show").onclick = ()=>{
    card.querySelector(".feedback").innerHTML = `<span class="kr">${esc(it.fr)}</span>`;
    showTrivia(card, it);
    const row = card.querySelector(".row");
    row.innerHTML = "";
    const again = el(`<button class="btn ko">Encore</button>`);
    const good  = el(`<button class="btn ok">Bien</button>`);
    again.onclick = ()=>afterAnswer(it, false);
    good.onclick  = ()=>afterAnswer(it, true);
    row.append(again, good);
  };
  $screen.appendChild(card);
  if(ST.set.autoplay) speak(it.kr);
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
    speak(answer);
    afterAnswer(it, ok, showTrivia(card, it));
  }
  paint();
  $screen.appendChild(card);
}

/* ---------- mode Écoute ---------- */
let LQ=null, LPOS=0, LSCORE=0;
function renderListen(){
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
  /* une fois sur deux : dictée — on choisit le HANGUL entendu (distracteurs sosies) */
  const dictee = LPOS % 2 === 1;
  const field = dictee ? "kr" : "fr";
  const ds = distractors(it, 3, field);
  const opts = shuffle([it.id, ...ds]);
  const card = el(`<div class="card center">
    <div class="dim">Écoute ${LPOS+1}/${LQ.length} — ${dictee?"quel mot as-tu entendu ?":"qu'est-ce que ça veut dire ?"}</div>
    <button class="speak" style="font-size:3rem; margin:14px 0">🔊</button>
    <div class="opts"></div></div>`);
  card.querySelector(".speak").onclick=()=>speak(it.kr);
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
      logAnswer(ok, "listen");
      LPOS++;
      setTimeout(render, ok?800:1700);
    };
    box.appendChild(b);
  });
  $screen.appendChild(card);
  setTimeout(()=>speak(it.kr), 250);
}

/* ---------- mode Voyage ---------- */
const TRIP_LABELS = { resto:"🍜 Restaurant", transport:"🚕 Transports", hotel:"🏨 Hôtel",
  achats:"🛍️ Achats", urgence:"🚨 Urgences & santé", communication:"💬 Communication", deck:"⭐ Essentiels du deck" };
let DRILL=null, DPOS=0;
function renderTrip(){
  if(DRILL){ renderDrill(); return; }
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
      row.querySelector(".speak").onclick=(e)=>{ e.stopPropagation(); speak(it.kr); };
      row.onclick=()=>speak(it.kr);
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
  card.querySelector("#hear").onclick=()=>speak(it.kr);
  card.querySelector("#rev").onclick=()=>{
    if(!revealed){
      card.querySelector(".feedback").innerHTML=`<span class="kr">${esc(it.kr)}</span>`;
      card.querySelector("#rev").textContent="Suivant →"; revealed=true; speak(it.kr);
    } else { DPOS++; render(); }
  };
  $screen.appendChild(card);
  speak(it.kr);
}

/* ---------- Stats & réglages ---------- */
function renderStats(){
  const t=todayStr(), l=ST.log[t]||{ok:0,ko:0,n:0};
  const items = ALL_IDS.map(eff);
  const stages=[0,0,0,0,0,0];
  items.forEach(it=>stages[it.stage]++);
  const enemies = items.filter(it=>it.enemy);
  const beaten = enemies.filter(it=>it.stage>=4).length;
  // rétention 7 jours
  let ok7=0,ko7=0;
  for(let i=0;i<7;i++){ const d=ST.log[addDays(t,-i)]; if(d){ ok7+=d.ok; ko7+=d.ko; } }
  const ret = (ok7+ko7)? Math.round(100*ok7/(ok7+ko7)) : null;

  $screen.appendChild(el(`<div class="statgrid">
    <div class="stat"><div class="n">🔥 ${streak()}</div><div class="l">jours d'affilée</div></div>
    <div class="stat"><div class="n">${l.n}</div><div class="l">réponses aujourd'hui</div></div>
    <div class="stat"><div class="n">${ret===null?"—":ret+" %"}</div><div class="l">réussite (7 j)</div></div>
    <div class="stat"><div class="n">${beaten}/${enemies.length}</div><div class="l">ennemies vaincues</div></div>
  </div>`));

  const bossN = Math.min(bossCandidates().length, 20);
  if(bossN){
    const bcard = el(`<div class="card center"><h2>⚔️ Boss fight</h2>
      <p class="dim">Affronte tes mots les plus ratés en QCM ciblés (${bossN} au menu).</p>
      <button class="btn" id="boss2">Lancer le combat</button></div>`);
    bcard.querySelector("#boss2").onclick = startBoss;
    $screen.appendChild(bcard);
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

  const set = el(`<div class="card settings"><h2>Réglages</h2>
    <label>Nouvelles cartes / jour <input type="number" id="npd" min="0" max="50" value="${ST.set.newPerDay}"></label>
    <label>Taille max de session <input type="number" id="smax" min="20" max="500" step="10" value="${ST.set.sessionMax||120}"></label>
    <label>Prioriser le kit voyage <input type="checkbox" id="kf" ${ST.set.kitFirst?"checked":""}></label>
    <label>Prononcer automatiquement <input type="checkbox" id="ap" ${ST.set.autoplay?"checked":""}></label>
    <label>Vitesse de la voix <input type="number" id="rate" min="0.5" max="1.2" step="0.1" value="${ST.set.rate}"></label>
    <div class="row" style="margin-top:12px">
      <button class="btn ghost" id="exp">📤 Exporter</button>
      <button class="btn ghost" id="imp">📥 Importer</button>
    </div>
    <input type="file" id="impfile" accept=".json,application/json">
    <p class="dim" style="margin-top:10px">Exporte ta progression régulièrement (partage vers OneDrive) —
    c'est ta sauvegarde, et c'est ce que Claude lit pour adapter le contenu.</p></div>`);
  $screen.appendChild(set);
  set.querySelector("#npd").onchange = e=>{ ST.set.newPerDay=Math.max(0,+e.target.value||0); save(); };
  set.querySelector("#smax").onchange= e=>{ ST.set.sessionMax=Math.max(20,+e.target.value||120); save(); };
  set.querySelector("#kf").onchange  = e=>{ ST.set.kitFirst=e.target.checked; save(); };
  set.querySelector("#ap").onchange  = e=>{ ST.set.autoplay=e.target.checked; save(); };
  set.querySelector("#rate").onchange= e=>{ ST.set.rate=Math.min(1.2,Math.max(0.5,+e.target.value||0.9)); save(); };
  set.querySelector("#exp").onclick  = exportState;
  set.querySelector("#imp").onclick  = ()=>set.querySelector("#impfile").click();
  set.querySelector("#impfile").onchange = importState;
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
render();

/* Sori — lecteur de scénarios de simulation (dialogues interactifs).
   Données: window.SCENARIOS (scenarios-data.js). Module autonome, sans accès
   localStorage: l'état (meilleur score) passe par opts.getBest/setBest. */
(function(root){
  "use strict";

  function el(html){ const t=document.createElement("template"); t.innerHTML=html.trim(); return t.content.firstChild; }
  function esc(s){ return String(s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

  let CUR = null;   // {sc, pos, firstTry, tries}

  function renderList(container, opts){
    CUR = null;
    const data = root.SCENARIOS || [];
    if(!data.length) return;
    container.appendChild(el(`<div class="section-title">Simulations — joue la scène</div>`));
    const list = el(`<div class="list"></div>`);
    data.forEach(sc=>{
      const best = opts.getBest ? opts.getBest(sc.id) : null;
      const row = el(`<div class="item"><div class="txt">
        <div class="kr">${esc(sc.title)}</div>
        <div class="fr">${sc.steps.length} répliques${best!=null?` · record ${best}/${sc.steps.length} du premier coup`:""}</div>
      </div><span class="pill stage">jouer</span></div>`);
      row.onclick = ()=>{ CUR = {sc, pos:0, firstTry:0, answered:false}; renderPlay(container, opts); };
      list.appendChild(row);
    });
    container.appendChild(list);
  }

  function renderPlay(container, opts){
    container.innerHTML = "";
    const {sc} = CUR;
    if(CUR.pos >= sc.steps.length){ return renderEnd(container, opts); }
    const step = sc.steps[CUR.pos];

    container.appendChild(el(`<div>
      <div class="progressbar"><div style="width:${Math.round(100*CUR.pos/sc.steps.length)}%"></div></div>
      <div class="dim" style="margin-top:6px">${esc(sc.title)} — ${CUR.pos+1}/${sc.steps.length}
        <button class="btn small ghost" id="scquit" style="float:right">quitter</button></div></div>`));
    container.querySelector("#scquit").onclick = ()=>{ container.innerHTML=""; renderList(container, opts); };

    const card = el(`<div class="card">
      <div class="npc"><div class="npc-kr">${esc(step.npc)}</div><div class="npc-fr">${esc(step.npcFr)}</div>
        <button class="speak" title="réécouter"><svg viewBox="0 0 24 24" style="width:22px;height:22px;stroke:currentColor;stroke-width:1.6;fill:none;stroke-linecap:round;stroke-linejoin:round;vertical-align:middle"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 010 7"/></svg></button></div>
      <div class="dim center" style="margin:10px 0 6px">Ta réplique :</div>
      <div class="opts"></div>
      <div class="feedback"></div></div>`);
    card.querySelector(".speak").onclick = ()=>opts.speak && opts.speak(step.npc);
    const box = card.querySelector(".opts");
    let firstShot = true;

    step.choices.forEach(ch=>{
      const b = el(`<button><span class="kr" style="font-size:1.15rem">${esc(ch.kr)}</span><br>
        <span class="dim" style="font-size:.82rem">${esc(ch.fr)}</span></button>`);
      b.onclick = ()=>{
        if(ch.ok){
          box.querySelectorAll("button").forEach(x=>x.disabled=true);
          b.classList.add("good");
          if(firstShot) CUR.firstTry++;
          if(opts.onAnswer) opts.onAnswer(firstShot);
          if(opts.speak) opts.speak(ch.kr);
          const fb = card.querySelector(".feedback");
          fb.innerHTML = `<div class="trivia"><div class="tfr">✓ ${esc(ch.why)}</div>${step.tip?`<div class="tnote">💡 ${esc(step.tip)}</div>`:""}</div>`;
          const row = el(`<div class="row" style="margin-top:10px"><button class="btn" id="scnext">${CUR.pos+1>=sc.steps.length?"Terminer":"Suite"}</button></div>`);
          row.querySelector("#scnext").onclick = ()=>{ CUR.pos++; renderPlay(container, opts); };
          card.appendChild(row);
        } else {
          /* mauvaise réplique : elle s'explique puis se retire — on rejoue l'étape */
          firstShot = false;
          b.classList.add("bad"); b.disabled = true;
          card.querySelector(".feedback").innerHTML = `<div class="trivia"><div class="tfr">✘ ${esc(ch.why)}</div></div>`;
        }
      };
      box.appendChild(b);
    });
    container.appendChild(card);
    if(opts.speak) opts.speak(step.npc);
  }

  function renderEnd(container, opts){
    const {sc, firstTry} = CUR;
    const total = sc.steps.length;
    const perfect = firstTry === total;
    if(opts.setBest){
      const prev = opts.getBest ? opts.getBest(sc.id) : null;
      if(prev==null || firstTry>prev) opts.setBest(sc.id, firstTry);
    }
    container.innerHTML = "";
    container.appendChild(el(`<div class="card center">
      <div class="done-kr">${perfect?"완벽해요":"끝"}</div>
      <h2>${esc(sc.title)} — terminé</h2>
      <p class="dim">${firstTry}/${total} répliques du premier coup${perfect?" — scène parfaite !":""}</p>
      <div class="row" style="margin-top:12px">
        <button class="btn ghost" id="screplay">Rejouer</button>
        <button class="btn" id="scback">Retour</button>
      </div></div>`));
    container.querySelector("#screplay").onclick = ()=>{ CUR={sc, pos:0, firstTry:0}; renderPlay(container, opts); };
    container.querySelector("#scback").onclick = ()=>{ container.innerHTML=""; renderList(container, opts); };
  }

  root.SORI_SCENARIOS = { renderList };
})(typeof self !== "undefined" ? self : this);

/* Production sans aide : moteur déterministe + vue, aucun accès au stockage.
   L'app persiste chaque transition avant de rendre la correction. */
(function(root){
  "use strict";
  const data = typeof module!=="undefined" && module.exports ? require("./production-data.js") : root.SORI_PRODUCTION_DATA;
  const ready = !!(data && data.items && data.goals);
  const LIMIT=4, GAP=8, INTERVALS=[1,3,7,14,30], RECENT=32;
  const items = new Map((ready?data.items:[]).map(x=>[x.id,x]));
  const goals = ready?data.goals:[];
  const copy = x=>JSON.parse(JSON.stringify(x));
  const record = x=>x && typeof x==="object" && !Array.isArray(x);
  const count = x=>Number.isSafeInteger(x)&&x>=0?x:0;
  const dateOK = x=>typeof x==="string" && /^\d{4}-\d{2}-\d{2}$/.test(x);
  function normalize(text){
    return String(text||"").normalize("NFC").replace(/[\u200b\ufeff]/g,"")
      .replace(/[,，]/g," ").trim().replace(/[.!。！]+$/u,"").trim().replace(/\s+/gu," ");
  }
  function expand(parts){
    return parts.reduce((phrases,part)=>phrases.flatMap(a=>(Array.isArray(part)?part:[part]).map(b=>[a,b].filter(Boolean).join(" "))),[""]);
  }
  const compiled = new Map();
  function compile(item){
    if(compiled.has(item.id)) return compiled.get(item.id);
    const yes=new Map(), no=new Map();
    item.accept.forEach(rule=>expand(rule.parts).forEach(x=>yes.set(normalize(x),rule.form)));
    item.wrong.forEach((rule,i)=>expand(rule.parts).forEach(x=>no.set(normalize(x),i)));
    const result={yes,no}; compiled.set(item.id,result); return result;
  }
  function grade(itemId,text){
    const value=normalize(text), item=items.get(itemId);
    if(!value) return {status:"empty"};
    if(!item || value.length>500) return {status:"unverified"};
    const {yes,no}=compile(item);
    if(yes.has(value)) return {status:"correct",form:yes.get(value)};
    if(no.has(value)) return {status:"incorrect",code:no.get(value)};
    return {status:"unverified"};
  }
  function state(raw,today){
    if(raw && raw.v!==1) return null; // préserver un schéma futur (rollback de l'app)
    const s=raw?copy(raw):{v:1,skills:{},recent:[],seq:0};
    if(!s.skills || typeof s.skills!=="object" || Array.isArray(s.skills)) s.skills={};
    if(goals.some(g=>s.skills[g.id]!==undefined && !record(s.skills[g.id]))) return null;
    s.recent=Array.isArray(s.recent)?s.recent.slice(-RECENT):[];
    s.seq=count(s.seq);
    if(!s.day || s.day.d!==today) s.day={d:today,n:0,done:[],since:GAP};
    s.day.n=Math.min(LIMIT,count(s.day.n));
    s.day.since=Math.min(GAP,count(s.day.since));
    s.day.done=Array.isArray(s.day.done)?[...new Set(s.day.done.filter(id=>goals.some(g=>g.id===id)))]:[];
    if(s.active && (!items.has(s.active.item) || !["input","retry","unverified","done"].includes(s.active.phase))) s.active=null;
    return s;
  }
  function eligible(known){
    const words=known instanceof Set?known:new Set(known||[]);
    return (ready?data.items:[]).filter(x=>x.needs.every(w=>words.has(w)));
  }
  function candidates(raw,today,known){
    const s=state(raw,today); if(!s) return [];
    const available=eligible(known);
    return goals.filter(g=>!s.day.done.includes(g.id) &&
      (!dateOK(s.skills[g.id]?.due) || s.skills[g.id].due<=today) && available.some(x=>x.goal===g.id))
      .sort((a,b)=>{
        const x=s.skills[a.id],y=s.skills[b.id];
        // Les objectifs jamais essayés passent avant les reprises du lendemain.
        return Number(!!x?.n)-Number(!!y?.n) || String(x?.due||"").localeCompare(String(y?.due||"")) || goals.indexOf(a)-goals.indexOf(b);
      }).map(g=>{
        const choices=available.filter(x=>x.goal===g.id), n=count(s.skills[g.id]?.n);
        return choices.find((x,i)=>i>=n%choices.length && x.id!==s.skills[g.id]?.last) || choices.find(x=>x.id!==s.skills[g.id]?.last) || choices[0];
      });
  }
  function remaining(raw,today,known){
    const s=state(raw,today); if(!s) return 0;
    const active=s.active && s.active.phase!=="done" ? 1 : 0;
    return active+Math.min(Math.max(0,LIMIT-s.day.n),candidates(s,today,known).length);
  }
  function begin(raw,today,known,{end=false,force=false}={}){
    const s=state(raw,today); if(!s) return s;
    // v167 : reprendre aussi les essais laissés sur l'ancien écran « non reconnue ».
    if(s.active?.phase==="unverified") return finish(s,today,"unverified");
    if(s.active) return s;
    if(s.day.n>=LIMIT || (!end && !force && s.day.since<GAP)) return s;
    const item=candidates(s,today,known)[0]; if(!item) return s;
    s.seq++;
    s.active={id:s.seq,item:item.id,day:today,phase:"input",tries:0,first:null};
    s.day.n++; s.day.done.push(item.goal); s.day.since=0;
    return s;
  }
  function tick(raw,today){
    const s=state(raw,today); if(s) s.day.since=Math.min(GAP,s.day.since+1); return s;
  }
  function addDays(day,n){
    const d=new Date(day+"T12:00:00Z"); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10);
  }
  function finish(s,today,result){
    const a=s.active, item=items.get(a.item);
    if(a.phase==="done") return s;
    const old=s.skills[item.goal];
    a.before=old?copy(old):null;
    const skill=old?copy(old):{n:0,ok:0,ko:0,step:0,contexts:[],forms:[]};
    skill.n=count(skill.n)+1; skill.last=item.id;
    skill.ok=count(skill.ok); skill.ko=count(skill.ko); skill.step=Math.min(INTERVALS.length,count(skill.step));
    skill.contexts=Array.isArray(skill.contexts)?skill.contexts.slice(-3):[];
    skill.forms=Array.isArray(skill.forms)?skill.forms.slice(-6):[];
    // Une formulation inconnue ou une correction après aide ne devient jamais un succès autonome.
    const outcome=a.first==="correct"?"correct":a.first==="incorrect"?"incorrect":"unverified";
    if(skill.at!==today){
      if(outcome==="correct"){
        skill.ok++; skill.step=Math.min(INTERVALS.length,skill.step+1);
        if(!skill.contexts.includes(item.id)) skill.contexts=[...skill.contexts,item.id].slice(-3);
        if(a.form && !skill.forms.includes(a.form)) skill.forms=[...skill.forms,a.form].slice(-6);
        skill.due=addDays(today,INTERVALS[skill.step-1]); skill.at=today;
      }else if(outcome==="incorrect"){
        skill.ko++; skill.step=Math.max(0,skill.step-1); skill.due=addDays(today,1); skill.at=today;
      }
    }
    s.skills[item.goal]=skill;
    a.phase="done"; a.result=result; a.outcome=outcome;
    if(a.day!==today && !s.day.done.includes(item.goal)){
      s.day.done.push(item.goal); s.day.n=Math.min(LIMIT,s.day.n+1);
    }
    s.recent.push({id:a.id,d:today,item:item.id,outcome}); s.recent=s.recent.slice(-RECENT);
    return s;
  }
  function submit(raw,today,text){
    const s=state(raw,today), a=s?.active;
    if(!a || a.phase==="done") return s;
    const g=grade(a.item,text); if(g.status==="empty") return s;
    a.tries=Math.min(9,count(a.tries)+1);
    if(!a.first) a.first=g.status;
    a.code=g.code??null;
    if(g.status==="correct"){
      if(a.first==="correct") a.form=g.form;
      return finish(s,today,"correct");
    }
    if(g.status==="unverified") return finish(s,today,"unverified");
    a.phase="retry";
    if(a.tries>=2) return finish(s,today,"solution");
    return s;
  }
  function reveal(raw,today){
    const s=state(raw,today), a=s?.active; if(!a || a.phase==="done") return s;
    if(!a.first) a.first="incorrect";
    return finish(s,today,a.first==="unverified"?"unverified":"solution");
  }
  function skip(raw,today){
    const s=state(raw,today); if(!s?.active || s.active.phase==="done") return s;
    if(!s.active.first) s.active.first="unverified";
    return finish(s,today,"skipped");
  }
  function undo(raw,today){
    const s=state(raw,today), a=s?.active; if(!a || a.phase!=="done" || a.cancelled) return s;
    const goal=items.get(a.item).goal;
    if(a.before===null) delete s.skills[goal]; else if(a.before) s.skills[goal]=a.before;
    s.recent=s.recent.filter(x=>x.id!==a.id);
    a.cancelled=true; a.outcome="unverified"; delete a.before;
    // La réponse a été vue : ne pas permettre de la rejouer comme rappel autonome.
    return s;
  }
  function advance(raw,today){
    const s=state(raw,today); if(s?.active?.phase==="done") s.active=null; return s;
  }
  const esc = x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function css(){
    if(document.getElementById("production-style")) return;
    const style=document.createElement("style"); style.id="production-style";
    style.textContent=`
      .production-card{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:22px;max-width:680px;margin:12px auto;width:100%;box-sizing:border-box}
      .production-meta{color:var(--dim);font-size:13px;display:flex;justify-content:space-between;gap:12px}
      .production-card .production-prompt{font-size:24px;line-height:1.4;margin:20px 0;text-transform:none;letter-spacing:normal;color:var(--txt)}
      .production-card label{display:block;color:var(--dim);font-size:14px;margin-bottom:8px}
      .production-input{box-sizing:border-box;width:100%;min-height:104px;resize:vertical;border:1px solid var(--line);border-radius:12px;padding:14px;background:var(--bg);color:var(--txt);font:22px/1.5 sans-serif;scroll-margin-bottom:24px}
      .production-input:focus{outline:2px solid var(--acc);outline-offset:2px}
      .production-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}
      .production-actions .btn{flex:1;min-height:46px;white-space:normal}
      .production-note{font-size:14px;color:var(--dim);line-height:1.55;margin:12px 0}
      .production-feedback{border-left:3px solid var(--acc);padding:10px 14px;margin:18px 0;line-height:1.55}
      .production-answer{font-size:24px;line-height:1.5;overflow-wrap:anywhere;margin:12px 0}
      .production-progress{border:1px solid var(--line);border-radius:var(--r);padding:16px;margin:16px 0;background:var(--panel)}
      .production-progress summary{cursor:pointer;line-height:1.5;font-weight:600}
      .production-progress ul{padding:0;list-style:none;margin:12px 0}
      .production-progress li{padding:10px 0;border-top:1px solid var(--line)}
      .production-progress small{display:block;color:var(--dim);line-height:1.5}
      @media(max-width:400px){.production-card{padding:16px}.production-prompt{font-size:22px}}
    `;
    document.head.appendChild(style);
  }
  function renderCard(container,{state:raw,today,onAction}){
    const s=state(raw,today), a=s?.active, item=items.get(a?.item); if(!item) return false;
    css();
    const card=document.createElement("section"); card.className="production-card";
    const done=a.phase==="done", retry=a.phase==="retry";
    const feedback=retry?item.wrong[a.code]?.feedback:"";
    let result="";
    if(done){
      result=a.cancelled?"Note annulée. Cette phrase ne compte pas dans ta progression.":a.outcome==="correct"?"Réussi sans aide.":a.outcome==="incorrect"?(a.result==="correct"?"Corrigé après aide. Cette construction reviendra pour un essai sans aide.":"À reprendre sans aide lors d’une prochaine révision."):"Sans note : cette tentative ne change pas ta maîtrise.";
    }
    card.innerHTML=`<div class="production-meta"><span>Construire une phrase</span><span>${esc(Math.max(1,s.day.n))} / ${LIMIT} aujourd’hui</span></div>
      <h2 class="production-prompt">${esc(item.prompt)}</h2>
      ${done?`<div class="production-feedback" role="status">${esc(result)}</div>
        <div class="production-note">Une formulation possible</div><p class="production-answer" lang="ko">${esc(item.answer)}</p>
        <p>${esc(item.explanation)}</p>
        ${a.outcome==="correct"?`<p class="production-note">Forme utilisée : ${esc(a.form)}.</p>`:""}
        <div class="production-actions"><button class="btn" data-action="advance">Continuer</button>${!a.cancelled && a.outcome!=="unverified"?'<button class="btn ghost" data-action="undo">Annuler la note</button>':""}</div>`:
        `<form class="production-form"><label for="production-answer">Écris la phrase entière en coréen.</label>
        <textarea id="production-answer" class="production-input" lang="ko" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="500" aria-describedby="production-help"></textarea>
        <div id="production-help" class="production-note">Sans mots proposés. Tu peux employer une autre formulation.</div>
        ${retry?`<div class="production-feedback" role="status">${esc(feedback)} Tu peux corriger ta phrase.</div>`:""}
        <div class="production-actions"><button class="btn" type="submit">Vérifier</button><button class="btn ghost" type="button" data-action="reveal">${retry?"Voir un exemple":"Je ne sais pas"}</button></div>
        <div class="production-actions"><button class="btn ghost" type="button" data-action="skip">${a.first==="incorrect"?"Arrêter cet essai":"Passer sans note"}</button></div></form>`}`;
    container.appendChild(card);
    let busy=false, composing=false;
    const input=card.querySelector("textarea");
    function act(action,text){
      if(busy) return;
      if(action==="submit" && (composing || !normalize(text))) return;
      busy=true;
      card.querySelectorAll("button").forEach(b=>b.disabled=true);
      onAction(action,text);
    }
    card.querySelectorAll("[data-action]").forEach(b=>b.onclick=()=>act(b.dataset.action));
    if(input){
      input.addEventListener("compositionstart",()=>{composing=true;});
      input.addEventListener("compositionend",()=>{composing=false;});
      input.addEventListener("keydown",event=>{
        if(event.key==="Enter" && !event.shiftKey && !event.isComposing && !composing && event.keyCode!==229){event.preventDefault();act("submit",input.value);}
      });
      card.querySelector("form").onsubmit=event=>{event.preventDefault();act("submit",input.value);};
      // Pas d'autofocus : conserver le contrôle du clavier mobile et la consigne visible.
    }
    return true;
  }
  function renderProgress(container,{state:raw,today,known,enabled,onReview}){
    if(!ready) return;
    css(); const s=state(raw,today); if(!s) return;
    const available=new Set(eligible(known).map(x=>x.goal));
    const autonomous=goals.filter(g=>count(s.skills[g.id]?.ok)>0).length;
    const div=document.createElement("details"); div.className="production-progress";
    div.innerHTML=`<summary>Construire sans aide · ${autonomous} / ${goals.length} objectifs réussis</summary>
      <p class="production-note">Quatre phrases au maximum par jour dans Réviser, avec du vocabulaire déjà solide. Seul le premier essai compte. Les reprises après correction restent distinctes.</p>
      <ul>${goals.map(g=>{
        const k=s.skills[g.id], text=!available.has(g.id)?"En attente de vocabulaire solide":!k?.n?"À découvrir":`${count(k.ok)} réussite${count(k.ok)>1?"s":""} sans aide · ${count(k.ko)} à reprendre${k.due?" · retour le "+k.due:""}`;
        return `<li>${esc(g.label)}<small>${esc(g.forms)}</small><small>${esc(text)}</small>${k?.forms?.length?`<small>Formes produites : ${esc(k.forms.join(", "))}</small>`:""}</li>`;
      }).join("")}</ul>
      ${!enabled?'<p class="production-note">La production de phrases est désactivée dans les réglages.</p>':remaining(s,today,known)>0?'<button class="btn primary production-review">Construire une phrase</button>':'<p class="production-note">Les prochaines phrases apparaîtront au fil de tes révisions.</p>'}`;
    container.appendChild(div);
    const button=div.querySelector("button"); if(button) button.onclick=onReview;
  }
  const api={ready,pure:{normalize,expand,grade,state,eligible,candidates,remaining,begin,tick,submit,reveal,skip,undo,advance,LIMIT,GAP,INTERVALS},renderCard,renderProgress};
  if(typeof module!=="undefined" && module.exports) module.exports=api;
  else root.SORI_PRODUCTION=api;
})(typeof globalThis!=="undefined"?globalThis:this);

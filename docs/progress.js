/* Progression du programme : calculs purs et présentation, sans stockage ni planification. */
(function(root){
  "use strict";
  const BANDS = ["A1", "A2", "B1", "B2", "C1"], TARGET = 0.8;
  const count = n => Number.isFinite(n) ? Math.max(0, n) : 0;
  const total = snap => BANDS.reduce((s,b)=>s+count((snap||{})[b]),0);
  const dayNumber = d => Date.parse(d+"T12:00:00Z") / 864e5;
  const addDays = (d,n) => new Date((dayNumber(d)+n)*864e5).toISOString().slice(0,10);
  function summarize(items, extra={}){
    const rows = BANDS.map(b=>({band:b,total:0,mastered:0,introduced:0,availableIntroduced:0,suspended:0,blocked:0}));
    for(const it of items||[]){
      if(it.rev) continue;
      const row=rows.find(x=>x.band===(extra[it.id]||{}).cefr);
      if(!row) continue;
      row.total++;
      if(it.stage>=4) row.mastered++;
      if(it.stage>=1) row.introduced++;
      if(it.stage>=1 && (!it.sus || it.stage>=4)) row.availableIntroduced++;
      if(it.sus){row.suspended++;if(it.stage<4)row.blocked++;}
    }
    return rows.map(r=>({...r, target:Math.ceil(TARGET*r.total),
      pct:r.total?100*r.mastered/r.total:0,
      remaining:Math.max(0,Math.ceil(TARGET*r.total)-r.mastered)}));
  }
  function recentPace(history,today){
    const dates=Object.keys(history||{}).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d) && d<=today).sort();
    for(const window of [7,21]){
      const days=dates.filter(d=>dayNumber(today)-dayNumber(d)<=window);
      if(days.length<2) continue;
      const from=days[0], to=days.at(-1), span=dayNumber(to)-dayNumber(from);
      if(span<3) continue;
      // Un rythme nul ou négatif récent ne doit pas être remplacé par un ancien rythme positif.
      return {perDay:(total(history[to])-total(history[from]))/span,span,from,to};
    }
    return null;
  }
  function model({items=[],extra={},history={},today,newPerDay=0}){
    const rows=summarize(items,extra);
    const snapshot=Object.fromEntries(rows.map(r=>[r.band,r.mastered]));
    const hist={...history,[today]:snapshot}; // le même état courant pour les barres ET la projection
    const pace=recentPace(hist,today), current=rows.find(r=>r.total && r.remaining>0)||null;
    let remaining=0, unseen=0, blocked=false;
    const forecasts=rows.filter(r=>r.total && r.remaining>0).map(r=>{
      remaining+=r.remaining;
      unseen+=Math.max(0,r.target-r.availableIntroduced);
      blocked=blocked || r.total-r.blocked<r.target;
      const reason=blocked?"suspended":unseen>0 && !(newPerDay>0)?"paused":
        !pace?"history":pace.perDay<=0?"stalled":null;
      return {band:r.band,remaining,unseen,reason,days:reason?null:
        Math.max(Math.ceil(remaining/pace.perDay),newPerDay>0?Math.ceil(unseen/newPerDay):0)};
    });
    const trend=Array.from({length:14},(_,i)=>{
      const day=addDays(today,i-13), prev=hist[addDays(day,-1)], now=hist[day];
      return {day,points:current && prev && now?
        100*(count(now[current.band])-count(prev[current.band]))/current.total:null};
    });
    return {rows,snapshot,current,pace,forecasts,trend};
  }
  const esc = s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const number = n=>n.toLocaleString("fr-FR",{maximumFractionDigits:1});
  const duration = days=>days<60?`≈ ${days} jours`:`≈ ${Math.ceil(days/30)} mois`;
  function renderCards(container,opts){
    const m=model(opts), current=m.current;
    if(!document.getElementById("progress-styles")){
      const style=document.createElement("style");style.id="progress-styles";
      style.textContent=`.progress-card .progress-head{font-size:1.3rem;color:var(--acc)}
        .progress-levels{display:grid;gap:14px;margin:16px 0}.progress-label{display:flex;justify-content:space-between;gap:10px;font-size:.85rem}
        .progress-track{height:7px;background:var(--cel-dim);position:relative;margin-top:5px;border-radius:3px}
        .progress-fill{height:100%;background:var(--acc);border-radius:3px}.progress-target{position:absolute;left:80%;top:-3px;height:13px;border-left:2px solid var(--txt)}
        .progress-trend{display:flex;gap:3px;margin-top:16px}.progress-day{flex:1;min-width:0;text-align:center;font-size:.7rem;color:var(--dim);padding:0;background:transparent;border:0;box-shadow:none;border-radius:0}
        .progress-day[aria-pressed=true]{color:var(--txt)}.progress-day[aria-pressed=true] .progress-date{text-decoration:underline}
        .progress-plot{height:74px;position:relative;border-top:0}.progress-plot:before{content:"";position:absolute;top:50%;left:0;right:0;border-top:1px solid var(--dim)}
        .progress-bar{position:absolute;left:10%;width:80%;background:var(--acc)}.progress-negative{background:var(--ko)}
        .progress-date{display:block;margin-top:4px;white-space:nowrap}.progress-detail{margin:10px 0 0;font-size:.85rem}
        .progress-projections{display:grid;gap:12px;margin:14px 0}.progress-projection{display:grid;grid-template-columns:1fr auto;gap:4px 10px}
        .progress-projection .progress-track{grid-column:1 / -1;height:5px}.progress-projection .progress-fill{background:var(--cel)}
        .progress-caption{margin:8px 0 0}.progress-card summary{cursor:pointer;color:var(--dim);font-size:.85rem}`;
      document.head.appendChild(style);
    }
    function append(html){const node=document.createElement("div");node.className="card progress-card";node.innerHTML=html;container.appendChild(node);return node;}
    const completed=m.rows.filter(r=>r.total && !r.remaining).map(r=>r.band);
    append(`<h2>Progression du programme</h2>
      <p class="progress-head">${current?`Objectif actuel : <b>${esc(current.band)} à 80 %</b>`:"Tous les seuils du programme sont atteints"}</p>
      ${completed.length?`<p class="dim note">Seuil de 80 % atteint : ${esc(completed.join(" · "))}.</p>`:""}
      <p class="dim note">Chaque barre indique la part des cartes maîtrisées dans cette catégorie. Le repère est à 80 %. Ce suivi des cartes ne certifie pas ton niveau de coréen.</p>
      <div class="progress-levels">${m.rows.filter(r=>r.total).map(r=>`<div data-band="${esc(r.band)}">
        <div class="progress-label"><b>${esc(r.band)}</b><span>${esc(number(r.pct))} % · ${r.mastered} / ${r.total}</span></div>
        <div class="progress-track" role="meter" aria-label="Cartes ${esc(r.band)} maîtrisées" aria-valuenow="${r.mastered}" aria-valuemin="0" aria-valuemax="${r.total}"><div class="progress-fill" style="width:${r.pct}%"></div><span class="progress-target"></span></div>
        ${r.suspended?`<span class="dim note-xs">${r.suspended} cartes mises de côté, incluses dans le total.</span>`:""}</div>`).join("")}</div>
      ${current?`<p>Objectif ${esc(current.band)} : <b>${current.target} cartes maîtrisées</b> (80 %), soit ${current.remaining} de plus.</p>`:""}`);
    if(current){
      const max=Math.max(.1,...m.trend.map(x=>Math.abs(x.points||0)));
      const available=m.trend.some(x=>x.points!==null);
      const date = d=>d.slice(8)+"/"+d.slice(5,7);
      const labels=m.trend.map(x=>date(x.day)+" : "+(x.points===null?"relevé manquant":
        (x.points>0?"+":"")+x.points.toLocaleString("fr-FR",{maximumFractionDigits:2})+" point(s) de pourcentage"));
      const card=append(`<h2>Évolution de ${esc(current.band)}</h2>
        <p class="dim note">Historique des <b>14 derniers jours</b> (${esc(date(m.trend[0].day))}–${esc(date(opts.today))}) — variation quotidienne en points de pourcentage.</p>
        <div class="progress-trend">${m.trend.map((x,i)=>{
          const p=x.points;
          return `<button class="progress-day" type="button" aria-label="${esc(labels[i])}" aria-pressed="${i===13}"><div class="progress-plot">${p?`<div class="progress-bar${p<0?" progress-negative":""}" style="${p<0?"top":"bottom"}:50%;height:${Math.max(1,34*Math.abs(p)/max)}px"></div>`:""}</div><span class="progress-date">${esc(x.day.slice(8))}</span></button>`;
        }).join("")}</div><p class="progress-detail" aria-live="polite">${esc(labels[13])}</p>
        <p class="dim note progress-caption">Touche un jour pour le détail. Zéro signifie une maîtrise stable.${!available?" Les variations apparaîtront après deux relevés sur des jours consécutifs.":""}</p>`);
      const buttons=[...card.querySelectorAll('.progress-day')];
      buttons.forEach((button,i)=>button.onclick=()=>{
        buttons.forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
        card.querySelector('.progress-detail').textContent=labels[i];
      });
    }
    if(m.forecasts.length){
      const max=Math.max(1,...m.forecasts.map(x=>x.days||0));
      const reasons={suspended:"Cartes mises de côté à reprendre",paused:"Introduction de cartes en pause",history:"Historique encore trop court",stalled:"Rythme récent stable ou en baisse"};
      append(`<h2>Estimation pour terminer les catégories</h2>
        <p class="dim note">Temps estimé à partir d’aujourd’hui pour atteindre <b>80 % des cartes</b>. Les délais sont <b>cumulés</b> : terminer B2 inclut le travail restant en B1 et dans les catégories précédentes.</p>
        <div class="progress-projections">${m.forecasts.map(x=>`<div class="progress-projection" data-forecast="${esc(x.band)}"><b>Terminer ${esc(x.band)}</b><span>${esc(x.days===null?"—":duration(x.days))}</span>
          ${x.days!==null?`<div class="progress-track"><div class="progress-fill" style="width:${100*x.days/max}%"></div></div>`:`<span class="dim note">${esc(reasons[x.reason])}.</span>`}</div>`).join("")}</div>
        <details><summary>Comment lire ces estimations</summary><p class="dim note">${m.pace?`Rythme net récent : ${esc(number(m.pace.perDay))} cartes maîtrisées par jour sur ${m.pace.span} jours, toutes catégories confondues. `:"Il faut au moins trois jours entre les relevés pour estimer un rythme. "}La projection suppose que ce rythme se maintient et que les nouvelles cartes sont introduites jusqu’à la limite réglée (${esc(number(count(opts.newPerDay)))} par jour). Les révisions, pauses et cartes mises de côté peuvent rallonger le délai. Ce sont des ordres de grandeur, pas des dates promises ni une estimation de certification CECR.</p></details>`);
    }
    return m;
  }
  const api={pure:{BANDS,TARGET,summarize,recentPace,model,duration},renderCards};
  if(typeof module!=="undefined" && module.exports)module.exports=api;
  else root.SORI_PROGRESS=api;
})(typeof window!=="undefined"?window:globalThis);

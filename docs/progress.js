/* Progression du programme : calculs purs et présentation, sans stockage ni planification. */
(function(root){
  "use strict";
  const BANDS = ["A1", "A2", "B1", "B2", "C1"];
  const count = n => Number.isFinite(n) ? Math.max(0, n) : 0;
  const total = snap => BANDS.reduce((s,b)=>s+count((snap||{})[b]),0);
  const dayNumber = d => Date.parse(d+"T12:00:00Z") / 864e5;
  const addDays = (d,n) => new Date((dayNumber(d)+n)*864e5).toISOString().slice(0,10);
  const percent = (n,total) => total ? Math.floor(1000*n/total)/10 : 0;
  function summarize(items, extra={}){
    const rows = BANDS.map(b=>({band:b,total:0,mastered:0,introduced:0,suspended:0,pausedNew:0,pausedLearning:0}));
    for(const it of items||[]){
      if(it.rev) continue;
      const row=rows.find(x=>x.band===(extra[it.id]||{}).cefr);
      if(!row) continue;
      row.total++;
      if(it.stage>=4) row.mastered++;
      if(it.stage>=1) row.introduced++;
      if(it.sus){
        row.suspended++;
        if(it.stage<1) row.pausedNew++;
        if(it.stage<4) row.pausedLearning++;
      }
    }
    return rows.map(r=>({...r,unseen:r.total-r.introduced,remaining:r.total-r.mastered,
      introPct:percent(r.introduced,r.total),masteredPct:percent(r.mastered,r.total)}));
  }
  /* La file ordonnée vient du moteur de l'app. Simulation des seules introductions,
     à quota quotidien plein : mêmes paires et même fenêtre de candidats (2 × quota)
     qu'introduceCards. Aucun changement de carte ni simulation de réponses futures. */
  function introductionPlan(queue,newPerDay){
    let day=0;
    const budget=Math.floor(count(newPerDay)),last={},ahead={},cost={},left={};
    queue.forEach((it,i)=>{
      cost[it.band]=(cost[it.band]||0)+1;
      if(it.base!==false){left[it.band]=(left[it.band]||0)+1;if(ahead[it.band]===undefined)ahead[it.band]=i;}
    });
    const byId=new Map(queue.map(it=>[it.id,it]));
    if(budget>0 && !queue.some(it=>byId.has(it.mate))){
      queue.forEach((it,i)=>{if(it.base!==false)last[it.band]=Math.ceil((i+1)/budget);});
      return {last,ahead,cost,reason:null};
    }
    // Retirer les candidats en O(1) garde le calcul fluide sur téléphone, même
    // avec des milliers de paires et un petit quota (pas de filtre du deck par jour).
    const index=new Map(queue.map((it,i)=>[it.id,i]));
    const next=queue.map((_,i)=>i+1<queue.length?i+1:-1),prev=queue.map((_,i)=>i-1);
    let head=queue.length?0:-1;
    while(head>=0 && budget>0){
      day++;
      const selected=new Set(),candidates=[];
      for(let i=head;i>=0&&candidates.length<budget*2;i=next[i])candidates.push(queue[i]);
      for(const it of candidates){
        if(selected.size>=budget)break;
        if(selected.has(it.id))continue;
        const group=[it],mate=byId.get(it.mate);
        if(mate && !selected.has(mate.id) && mate.id!==it.id)group.push(mate);
        if(selected.size+group.length>budget)continue;
        for(const x of group){
          selected.add(x.id);
          if(x.base!==false && --left[x.band]===0)last[x.band]=day;
        }
      }
      if(!selected.size)break;
      selected.forEach(id=>{
        const i=index.get(id),before=prev[i],after=next[i];
        if(before<0)head=after;else next[before]=after;
        if(after>=0)prev[after]=before;
        byId.delete(id);
      });
    }
    return {last,ahead,cost,reason:head>=0?(budget>0?"quota":"paused"):null};
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
  function dailyTrend(history,today,band="all",bands=BANDS){
    const value=s=>!s?null:band==="all"?
      (bands.every(b=>Number.isFinite(s[b]))?bands.reduce((n,b)=>n+s[b],0):null):
      (Number.isFinite(s[band])?s[band]:null);
    return Array.from({length:14},(_,i)=>{
      const day=addDays(today,i-13),prev=value(history[addDays(day,-1)]),now=value(history[day]);
      return {day,delta:prev===null||now===null?null:now-prev};
    });
  }
  function model({items=[],extra={},history={},today,newPerDay=0,introductionQueue}){
    const rows=summarize(items,extra);
    const snapshot=Object.fromEntries(rows.map(r=>[r.band,r.mastered]));
    const hist={...history,[today]:snapshot}; // le même état courant pour les barres ET la projection
    // Repli autonome (tests/données recto seules). En production, utiliser l'ordre réel du moteur.
    const queue=introductionQueue || BANDS.flatMap(b=>items.filter(it=>!it.rev&&!it.sus&&it.stage===0&&(extra[it.id]||{}).cefr===b)
      .map(it=>({id:it.id,band:b,base:true})));
    const plan=introductionPlan(queue,newPerDay),pace=recentPace(hist,today);
    const current=rows.find(r=>r.band===queue[0]?.band)||null;
    let work=0;
    const forecasts=rows.filter(r=>r.total).map(r=>{
      work+=r.remaining-r.pausedLearning;
      const discovery={days:0,reason:null,blocked:r.pausedNew,ahead:plan.ahead[r.band]||0,cost:plan.cost[r.band]||0};
      if(r.unseen){
        discovery.reason=r.pausedNew?"suspended":plan.last[r.band]===undefined?(plan.reason||"unavailable"):null;
        discovery.days=discovery.reason?null:plan.last[r.band];
      }
      const reason=!r.remaining?null:r.pausedLearning?"suspended":discovery.reason ||
        (!pace?"history":pace.perDay<=0?"stalled":null);
      const mastery={days:reason?null:!r.remaining?0:Math.max(discovery.days,Math.ceil(work/pace.perDay)),
        reason,blocked:r.pausedLearning,work};
      return {band:r.band,discovery,mastery};
    }).filter(f=>f.discovery.days!==0 || f.mastery.days!==0);
    const bands=rows.filter(r=>r.total).map(r=>r.band),trends={};
    ["all",...BANDS].forEach(b=>{trends[b]=dailyTrend(hist,today,b,bands);});
    return {rows,snapshot,current,pace,forecasts,trends};
  }
  const esc = s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const number = n=>n.toLocaleString("fr-FR",{maximumFractionDigits:1});
  const duration = days=>days<60?`≈ ${days} jours`:`≈ ${Math.ceil(days/30)} mois`;
  function renderCards(container,opts){
    const m=model(opts),current=m.current;
    if(!document.getElementById("progress-styles")){
      const style=document.createElement("style");style.id="progress-styles";
      style.textContent=`.progress-card .progress-head{font-size:1.2rem;color:var(--acc)}
        .progress-levels{display:grid;gap:20px;margin:16px 0}.progress-level-title{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:7px}
        .progress-label{display:flex;justify-content:space-between;gap:10px;font-size:.8rem;margin-top:8px}
        .progress-track{height:6px;background:var(--panel2);margin-top:4px;border-radius:3px;overflow:hidden}
        .progress-fill{height:100%;background:var(--acc);border-radius:3px}.progress-intro .progress-fill{background:var(--dim)}
        .progress-filter{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:12px 0;font-size:.85rem}
        .progress-filter select{min-width:0;max-width:65%;font:inherit;color:var(--txt);background:var(--panel2);border:1px solid var(--line);border-radius:6px;padding:8px}
        .progress-trend{display:flex;gap:3px;margin-top:12px}.progress-day{flex:1;min-width:0;text-align:center;font-size:.7rem;color:var(--dim);padding:0;background:transparent;border:0;box-shadow:none;border-radius:0}
        .progress-day[aria-pressed=true]{color:var(--txt)}.progress-day[aria-pressed=true] .progress-date{text-decoration:underline}
        .progress-plot{height:74px;position:relative}.progress-plot:before{content:"";position:absolute;top:50%;left:0;right:0;border-top:1px solid var(--dim)}
        .progress-bar{position:absolute;left:10%;width:80%;background:var(--acc)}.progress-negative{background:var(--ko)}
        .progress-missing{position:absolute;top:30px;left:0;right:0;background:var(--panel);line-height:14px}
        .progress-date{display:block;margin-top:4px;white-space:nowrap}.progress-detail{margin:10px 0 0;font-size:.85rem}
        .progress-projections{display:grid;gap:20px;margin:16px 0}.progress-projection h3{margin:0 0 6px;font-size:1rem}
        .progress-estimate{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);gap:4px 12px;align-items:baseline;margin-top:8px;font-size:.85rem}
        .progress-estimate .progress-result{text-align:right}.progress-estimate .progress-track{grid-column:1 / -1;margin:0;height:4px}
        .progress-estimate[data-goal=discovery] .progress-fill{background:var(--dim)}.progress-caption{margin:8px 0 0}
        .progress-card summary{cursor:pointer;color:var(--dim);font-size:.85rem}.progress-card details p{margin-bottom:0}`;
      document.head.appendChild(style);
    }
    function append(html){const node=document.createElement("div");node.className="card progress-card";node.innerHTML=html;container.appendChild(node);return node;}
    const completed=m.rows.filter(r=>r.total&&!r.unseen).map(r=>r.band);
    function meter(row,kind){
      const intro=kind==="intro",label=intro?"Abordées":"Maîtrisées",n=intro?row.introduced:row.mastered,pct=intro?row.introPct:row.masteredPct;
      return `<div class="progress-${kind}"><div class="progress-label"><span>${label}</span><span>${esc(number(pct))} % · ${n} / ${row.total}</span></div>
        <div class="progress-track" role="meter" aria-label="Cartes ${esc(row.band)} ${label.toLowerCase()}" aria-valuenow="${n}" aria-valuemin="0" aria-valuemax="${row.total}"><div class="progress-fill" style="width:${100*n/row.total}%"></div></div></div>`;
    }
    append(`<h2>Progression du programme</h2>
      <p class="progress-head">${current?`Prochaines nouvelles cartes : <b>${esc(current.band)}</b>`:
        m.rows.some(r=>r.unseen)?"Les cartes encore à découvrir sont mises de côté.":"Toutes les cartes ont été abordées."}</p>
      ${completed.length?`<p class="dim note">Entièrement abordé : ${esc(completed.join(" · "))}.</p>`:""}
      <p class="dim note">Abordées : les cartes entrées dans tes révisions. Maîtrisées : celles acquises au fil des exercices ; ce nombre peut baisser après un oubli. Les deux barres vont jusqu’à 100 %.</p>
      <div class="progress-levels">${m.rows.filter(r=>r.total).map(r=>`<div data-band="${esc(r.band)}">
        <div class="progress-level-title"><b>${esc(r.band)}</b><span class="dim note-xs">${r.unseen?`${r.unseen} à découvrir`:"Entièrement abordé"}</span></div>
        ${meter(r,"intro")}${meter(r,"mastery")}
        ${r.suspended?`<p class="dim note-xs progress-caption">${r.suspended} cartes mises de côté, incluses dans les totaux.</p>`:""}</div>`).join("")}</div>
      <details><summary>Découverte et maîtrise</summary><p class="dim note">Les nouvelles cartes suivent l’ordre A1 → A2 → B1 → B2 → C1. Tu peux commencer la catégorie suivante pendant que tu consolides la précédente. La maîtrise complète n’est pas une condition de passage. Ces mesures suivent le contenu de l’app, pas une certification de niveau de langue.</p></details>`);
    const date=d=>d.slice(8)+"/"+d.slice(5,7);
    const trendCard=append(`<h2>Évolution des cartes maîtrisées</h2>
      <label class="progress-filter">Afficher <select aria-label="Niveau du graphique"><option value="all">Tous les niveaux</option>${m.rows.filter(r=>r.total).map(r=>`<option value="${esc(r.band)}">${esc(r.band)}</option>`).join("")}</select></label>
      <p class="dim note">Variation nette quotidienne sur les <b>14 derniers jours</b> (${esc(date(m.trends.all[0].day))}–${esc(date(opts.today))}).</p>
      <div class="progress-trend"></div><p class="progress-detail" aria-live="polite"></p>
      <p class="dim note progress-flat"></p>
      <p class="dim note progress-caption">Touche un jour pour le détail. Zéro = aucun changement net ; « · » = relevé manquant.</p>`);
    function drawTrend(band){
      const trend=m.trends[band],max=Math.max(1,...trend.map(x=>Math.abs(x.delta||0)));
      const labels=trend.map(x=>date(x.day)+" : "+(x.delta===null?"relevé manquant":
        (x.delta>0?"+":"")+number(x.delta)+" carte"+(Math.abs(x.delta)>1?"s":"")+" maîtrisée"+(Math.abs(x.delta)>1?"s":"")));
      trendCard.querySelector('.progress-trend').innerHTML=trend.map((x,i)=>`<button class="progress-day" type="button" aria-label="${esc(labels[i])}" aria-pressed="${i===13}"><div class="progress-plot">${x.delta?
        `<div class="progress-bar${x.delta<0?" progress-negative":""}" style="${x.delta<0?"top":"bottom"}:50%;height:${Math.max(1,34*Math.abs(x.delta)/max)}px"></div>`:
        x.delta===null?'<span class="progress-missing">·</span>':""}</div><span class="progress-date">${esc(x.day.slice(8))}</span></button>`).join("");
      const buttons=[...trendCard.querySelectorAll('.progress-day')],detail=trendCard.querySelector('.progress-detail');
      detail.textContent=labels[13];
      buttons.forEach((button,i)=>button.onclick=()=>{
        buttons.forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
        detail.textContent=labels[i];
      });
      const observed=trend.filter(x=>x.delta!==null),flat=trendCard.querySelector('.progress-flat');
      flat.textContent=!observed.length?"Les variations apparaîtront après deux relevés sur des jours consécutifs.":
        observed.every(x=>x.delta===0)?(band==="all"?"Le nombre de cartes maîtrisées est stable sur les jours renseignés.":
        `${band} est stable sur les jours renseignés. Choisis « Tous les niveaux » pour voir l’ensemble de ta progression.`):"";
      flat.hidden=!flat.textContent;
    }
    drawTrend("all");trendCard.querySelector('select').onchange=e=>drawTrend(e.target.value);
    if(m.forecasts.length){
      const longest=Math.max(1,...m.forecasts.flatMap(f=>[f.discovery.days||0,f.mastery.days||0]));
      const reasons={paused:"Nouvelles cartes en pause",history:"Historique encore trop court",stalled:"Rythme récent stable ou en baisse",
        quota:"Quota insuffisant pour une paire de cartes",unavailable:"Cartes absentes de la file actuelle"};
      function result(r){
        if(r.reason==="suspended")return `${r.blocked} carte${r.blocked>1?"s":""} à réactiver`;
        return r.reason?reasons[r.reason]:r.days===0?"Déjà fait":duration(r.days);
      }
      function estimate(r,goal,label){
        return `<div class="progress-estimate" data-goal="${goal}"><span>${label}</span><b class="progress-result">${esc(result(r))}</b>${r.days>0?
          `<div class="progress-track"><div class="progress-fill" style="width:${100*r.days/longest}%;min-width:1px"></div></div>`:""}</div>`;
      }
      append(`<h2>Délais pour parcourir et maîtriser</h2>
        <p class="dim note">Deux objectifs à <b>100 %</b> : découvrir toutes les cartes, puis les maîtriser. Chaque délai part d’aujourd’hui et inclut le travail encore prioritaire des catégories précédentes. Les lignes ne s’additionnent pas.</p>
        <div class="progress-projections">${m.forecasts.map(f=>`<div class="progress-projection" data-forecast="${esc(f.band)}"><h3>${esc(f.band)}</h3>
          ${estimate(f.discovery,"discovery","Tout aborder")}${estimate(f.mastery,"mastery","Tout maîtriser")}
          ${f.discovery.days>0&&f.discovery.ahead?`<p class="dim note-xs progress-caption">${f.discovery.ahead} introductions prioritaires avant les nouvelles cartes ${esc(f.band)}.</p>`:""}</div>`).join("")}</div>
        <details><summary>Comment sont calculés les délais</summary><p class="dim note">Découverte : la file actuelle, à quota plein de ${esc(number(count(opts.newPerDay)))} introductions par jour, avec les paires recto/verso si elles sont activées. Les pauses et les révisions prioritaires peuvent allonger ce délai.</p>
        <p class="dim note">Maîtrise : ${m.pace?`projection du gain net récent (${esc(number(m.pace.perDay))} cartes/jour sur ${m.pace.span} jours)`:
        "au moins trois jours entre les relevés sont nécessaires pour estimer un rythme"}, sur les cartes actives à consolider jusqu’à cette catégorie. Ce délai ne peut pas être plus court que la découverte. Les deux activités avancent en parallèle. Les cartes mises de côté ne sont pas réactivées par ce calcul ; elles doivent l’être pour atteindre 100 % si elles ne sont pas encore acquises.</p>
        <p class="dim note">Ce sont des ordres de grandeur, pas des dates promises. Les estimations se recalculent avec tes acquis et tes réglages.</p></details>`);
    }
    return m;
  }
  const api={pure:{BANDS,summarize,recentPace,introductionPlan,dailyTrend,model,duration,percent},renderCards};
  if(typeof module!=="undefined" && module.exports)module.exports=api;
  else root.SORI_PROGRESS=api;
})(typeof window!=="undefined"?window:globalThis);

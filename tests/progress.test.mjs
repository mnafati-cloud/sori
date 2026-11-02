import test from 'node:test';
import assert from 'node:assert/strict';
import P from '../docs/progress.js';
const {model,recentPace,summarize,introductionPlan,percent}=P.pure;
const today='2026-11-02';
function fixture(){
  const items=[],extra={};
  for(const band of ['A1','A2','B1','B2'])for(let i=0;i<100;i++){
    const id=band+i;
    items.push({id,stage:i<(band==='A1'?100:band==='A2'?80:band==='B1'?2:0)?4:0});
    extra[id]={cefr:band};
  }
  return {items,extra,today,newPerDay:10,history:{'2026-10-26':{A1:100,A2:73,B1:2,B2:0,C1:0}}};
}
const forecast=(m,b)=>m.forecasts.find(x=>x.band===b);
test('aucun seuil à 80 % : introduction et maîtrise vont chacune à 100 %',()=>{
  const m=model(fixture()),a=m.rows.find(x=>x.band==='A2');
  assert.equal(m.current.band,'A2');
  assert.equal(a.introduced,80);assert.equal(a.mastered,80);
  assert.equal(a.unseen,20);assert.equal(a.remaining,20);
  assert.equal(a.introPct,80);assert.equal(a.masteredPct,80);
  assert.equal(P.pure.TARGET,undefined);
});
test('les introductions A2 restantes sont incluses dans les délais B1 et B2',()=>{
  const m=model(fixture());
  assert.equal(forecast(m,'A2').discovery.days,2);
  assert.equal(forecast(m,'B1').discovery.days,12);
  assert.equal(forecast(m,'B2').discovery.days,22);
  assert.equal(forecast(m,'B1').discovery.ahead,20);
  assert.equal(forecast(m,'B2').discovery.ahead,118);
  assert.equal(forecast(m,'B1').mastery.days,118);
  assert.equal(forecast(m,'B2').mastery.days,218);
});
test('commencer B1 ne demande pas de maîtriser 100 % d’A2',()=>{
  const o=fixture();o.items.filter(x=>x.id.startsWith('A2')&&!x.stage).forEach(x=>x.stage=1);
  const m=model(o);
  assert.equal(m.current.band,'B1');
  assert.equal(forecast(m,'A2').discovery.days,0);
  assert.equal(forecast(m,'A2').mastery.days,20);
  assert.equal(forecast(m,'B1').discovery.days,10);
});
test('par défaut, le graphe global montre les gains A2 même si B1 est stable',()=>{
  const o=fixture();o.history['2026-11-01']={A1:100,A2:75,B1:2,B2:0,C1:0};
  const m=model(o);
  assert.equal(m.trends.all.at(-1).delta,5);
  assert.equal(m.trends.A2.at(-1).delta,5);
  assert.equal(m.trends.B1.at(-1).delta,0);
});
test('le rythme et les barres utilisent les acquis actuels sans modifier les données fournies',()=>{
  const o=fixture();o.history[today]={A1:100,A2:75,B1:2,B2:0,C1:0};
  const original=JSON.stringify(o),m=model(o);
  assert.equal(m.pace.perDay,1);assert.equal(m.snapshot.A2,80);
  assert.equal(JSON.stringify(o),original);
});
test('une baisse récente ne réutilise pas la croissance plus ancienne',()=>{
  const history={'2026-10-12':{A1:5},'2026-10-26':{A1:80},[today]:{A1:75}};
  assert.equal(recentPace(history,today).perDay,-5/7);
  const o=fixture();o.history={'2026-10-12':{A1:1},'2026-10-26':{A1:100,A2:90,B1:2}};
  const f=forecast(model(o),'A2');
  assert.equal(f.mastery.reason,'stalled');assert.equal(f.mastery.days,null);
  assert.equal(f.discovery.days,2);
});
test('historique trop court : découverte calculable, maîtrise sans date inventée',()=>{
  const o=fixture();o.history={'2026-11-01':{A1:1}};
  const f=forecast(model(o),'A2');
  assert.equal(f.mastery.reason,'history');assert.equal(f.discovery.days,2);
});
test('historique ancien de repli et dates futures ignorées',()=>{
  const o=fixture();o.history={'2026-10-20':{A1:100,A2:67,B1:2},'2026-12-01':{A1:9999}};
  const p=model(o).pace;assert.equal(p.span,13);assert.equal(p.perDay,1);assert.equal(p.to,today);
});
test('introduction en pause : les cartes déjà abordées peuvent encore être maîtrisées',()=>{
  const o=fixture();o.newPerDay=0;
  assert.equal(forecast(model(o),'A2').discovery.reason,'paused');
  assert.equal(forecast(model(o),'B1').mastery.reason,'paused');
  o.items.filter(x=>x.id.startsWith('A2')&&!x.stage).forEach(x=>x.stage=1);
  assert.equal(forecast(model(o),'A2').discovery.days,0);
  assert.equal(forecast(model(o),'A2').mastery.days,20);
});
test('le quota impose un plancher à la maîtrise, sans ajouter deux activités parallèles',()=>{
  const o=fixture();o.newPerDay=1;o.history={'2026-10-26':{A1:1}};
  assert.equal(forecast(model(o),'B1').mastery.days,118);
  assert.equal(forecast(model(o),'B1').discovery.days,118);
});
test('cartes abordées puis suspendues : découverte conservée, maîtrise bloquée localement',()=>{
  const o=fixture();o.items.filter(x=>x.id.startsWith('A2')&&!x.stage).forEach(x=>{x.stage=1;x.sus=true;});
  const m=model(o),f=forecast(m,'A2');
  assert.equal(m.rows.find(x=>x.band==='A2').introduced,100);
  assert.equal(f.discovery.days,0);assert.equal(f.mastery.reason,'suspended');assert.equal(f.mastery.blocked,20);
  assert.equal(forecast(m,'B1').discovery.days,10);
  assert.equal(forecast(m,'B1').mastery.reason,null);
});
test('cartes jamais abordées suspendues : pas de faux 100 %, niveaux suivants accessibles',()=>{
  const o=fixture();o.items.filter(x=>x.id.startsWith('A2')&&!x.stage).forEach(x=>x.sus=true);
  const m=model(o);
  assert.equal(forecast(m,'A2').discovery.reason,'suspended');assert.equal(forecast(m,'A2').discovery.blocked,20);
  assert.equal(m.current.band,'B1');assert.equal(forecast(m,'B1').discovery.days,10);
});
test('variation quotidienne : baisses conservées, pas de gain fictif entre relevés manquants',()=>{
  const o=fixture();o.history={'2026-10-29':{B1:1},'2026-10-31':{B1:5},'2026-11-01':{B1:4}};
  const trend=model(o).trends.B1;
  assert.equal(trend.length,14);assert.equal(trend.find(x=>x.day==='2026-10-31').delta,null);
  assert.equal(trend.find(x=>x.day==='2026-11-01').delta,-1);assert.equal(trend.at(-1).delta,-2);
  assert.equal(model(o).trends.all.at(-1).delta,null);
});
test('recto seul pour les pourcentages, aucun arrondi à 100 % avant achèvement',()=>{
  const rows=summarize([{id:'a',stage:4},{id:'b',stage:0},{id:'v',stage:4,rev:true}],{a:{cefr:'A1'},b:{cefr:'A1'},v:{cefr:'A1'}});
  assert.equal(rows[0].total,2);assert.equal(rows[0].masteredPct,50);
  assert.equal(percent(7996,7997),99.9);assert.equal(percent(7997,7997),100);
});
test('programme abordé mais à consolider, puis entièrement maîtrisé',()=>{
  const o=fixture();o.items.forEach(x=>{if(!x.stage)x.stage=1;});
  assert.equal(model(o).current,null);assert.equal(forecast(model(o),'B1').discovery.days,0);
  o.items.forEach(x=>x.stage=4);
  assert.equal(model(o).current,null);assert.deepEqual(model(o).forecasts,[]);
  assert.equal(model({today}).rows.reduce((n,r)=>n+r.total,0),0);
});
test('file réelle : les versos consomment le quota sans doubler le vocabulaire affiché',()=>{
  const q=[{id:'a',band:'A2',mate:'ar',base:true},{id:'ar',band:'A2',mate:'a',base:false},
    {id:'b',band:'B1',mate:'br',base:true},{id:'br',band:'B1',mate:'b',base:false}];
  const plan=introductionPlan(q,2);
  assert.equal(plan.last.A2,1);assert.equal(plan.last.B1,2);
  assert.equal(plan.ahead.B1,2);assert.equal(plan.cost.B1,2);
});
test('paires : quota impair, et quota trop petit pour introduire une paire',()=>{
  const q=Array.from({length:3},(_,i)=>[
    {id:'x'+i,band:i<2?'A2':'B1',mate:'r'+i,base:true},{id:'r'+i,band:i<2?'A2':'B1',mate:'x'+i,base:false}
  ]).flat();
  assert.equal(introductionPlan(q,3).last.B1,3);
  assert.equal(introductionPlan(q,1).reason,'quota');
});
test('une catégorie ultérieure déjà abordée n’attend pas les précédentes',()=>{
  const o=fixture();o.items.filter(x=>x.id.startsWith('B1')).forEach(x=>x.stage=1);
  assert.equal(forecast(model(o),'B1').discovery.days,0);assert.equal(model(o).current.band,'A2');
});
test('les versos prioritaires d’une catégorie déjà découverte comptent avant les cartes suivantes',()=>{
  const o=fixture();o.introductionQueue=[{id:'a1-r',band:'A1',base:false},{id:'a2',band:'A2',base:true}];
  o.newPerDay=1;
  const m=model(o);
  assert.equal(m.current.band,'A1');
  assert.equal(forecast(m,'A2').discovery.days,2);
});

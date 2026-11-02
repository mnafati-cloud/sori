import test from 'node:test';
import assert from 'node:assert/strict';
import P from '../docs/progress.js';
const {model,recentPace,summarize,duration}=P.pure;
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
test('progression : pourcentage de chaque catégorie sur une seule échelle, seuil distinct',()=>{
  const m=model(fixture());
  assert.equal(m.current.band,'B1');
  assert.equal(m.current.pct,2);
  assert.equal(m.current.target,80);
  assert.equal(m.current.remaining,78);
  assert.equal(m.rows.find(x=>x.band==='A2').remaining,0);
});
test('projections cumulées : finir B2 inclut le reste de B1',()=>{
  const m=model(fixture());
  assert.equal(m.pace.perDay,1);
  assert.deepEqual(m.forecasts.map(x=>[x.band,x.remaining,x.days]),[['B1',78,78],['B2',158,158]]);
  assert.equal(duration(158),'≈ 6 mois');
});
test('le rythme et les barres utilisent les acquis actuels, sans modifier les données fournies',()=>{
  const o=fixture();o.history[today]={A1:100,A2:75,B1:2};
  const original=JSON.stringify(o),m=model(o);
  assert.equal(m.pace.perDay,1);
  assert.equal(m.snapshot.A2,80);
  assert.equal(JSON.stringify(o),original);
});
test('une baisse récente ne réutilise pas la croissance plus ancienne',()=>{
  const history={'2026-10-12':{A1:5},'2026-10-26':{A1:80},[today]:{A1:75}};
  assert.equal(recentPace(history,today).perDay,-5/7);
  const o=fixture();o.history={'2026-10-12':{A1:1},'2026-10-26':{A1:100,A2:90,B1:2}};
  assert.equal(model(o).forecasts[0].reason,'stalled');
  assert.equal(model(o).forecasts[0].days,null);
});
test('historique trop court : aucun délai, même avec un bond sur un jour',()=>{
  const o=fixture();o.history={'2026-11-01':{A1:1}};
  assert.equal(model(o).forecasts[0].reason,'history');
});
test('historique ancien de repli et dates futures ignorées',()=>{
  const o=fixture();o.history={'2026-10-20':{A1:100,A2:67,B1:2},'2026-12-01':{A1:9999}};
  const p=model(o).pace;
  assert.equal(p.span,13);assert.equal(p.perDay,1);assert.equal(p.to,today);
});
test('introduction suspendue : pas de promesse de terminer des cartes jamais vues',()=>{
  const o=fixture();o.newPerDay=0;
  const m=model(o);assert.equal(m.forecasts[0].reason,'paused');assert.equal(m.forecasts[0].days,null);
  o.items.filter(x=>x.id.startsWith('B1')).forEach(x=>{if(!x.stage)x.stage=1;});
  assert.equal(model(o).forecasts[0].days,78,'les cartes déjà introduites peuvent progresser');
  assert.equal(model(o).forecasts[1].reason,'paused');
});
test('le quota de nouvelles cartes impose un minimum de durée',()=>{
  const o=fixture();o.newPerDay=1;o.history={'2026-10-26':{A1:1}};
  assert.equal(model(o).forecasts[0].days,78);
});
test('cartes mises de côté : compter sans effacer les acquis, signaler un seuil inaccessible',()=>{
  const o=fixture();o.items.filter(x=>x.id.startsWith('B1') && x.stage===0).forEach(x=>{x.sus=true;});
  const m=model(o);
  assert.equal(m.current.total,100);assert.equal(m.current.mastered,2);assert.equal(m.current.suspended,98);
  assert.equal(m.forecasts[0].reason,'suspended');assert.equal(m.forecasts[1].reason,'suspended');
});
test('les cartes suspendues non maîtrisées ne réduisent pas le travail d’introduction estimé',()=>{
  const o=fixture();o.newPerDay=1;o.history={'2026-10-26':{A1:1}};
  o.items.filter(x=>x.id.startsWith('B1') && !x.stage).slice(0,10).forEach(x=>{x.stage=1;x.sus=true;});
  assert.equal(model(o).forecasts[0].days,78);
});
test('variation quotidienne : baisse conservée, aucun gain fictif sur un trou dans les relevés',()=>{
  const o=fixture();o.history={
    '2026-10-29':{B1:1},'2026-10-31':{B1:5},'2026-11-01':{B1:4}
  };
  const trend=model(o).trend;
  assert.equal(trend.length,14);
  assert.equal(trend.find(x=>x.day==='2026-10-31').points,null);
  assert.equal(trend.find(x=>x.day==='2026-11-01').points,-1);
  assert.equal(trend.at(-1).points,-2);
});
test('un historique plat se distingue des jours sans relevé',()=>{
  const o=fixture();o.history={'2026-11-01':{B1:2}};
  assert.equal(model(o).trend.at(-1).points,0);
  assert.equal(model(o).trend.at(-2).points,null);
});
test('recto seul, seuil arrondi, données absentes et programme terminé',()=>{
  const items=[{id:'a',stage:4},{id:'b',stage:0},{id:'a-rev',stage:4,rev:true}];
  assert.equal(summarize(items,{a:{cefr:'A1'},b:{cefr:'A1'},'a-rev':{cefr:'A1'}})[0].target,2);
  assert.equal(model({today}).current,null);
  const o=fixture();o.items.forEach(x=>x.stage=4);
  assert.equal(model(o).current,null);assert.deepEqual(model(o).forecasts,[]);
});

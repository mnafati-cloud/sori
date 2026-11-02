/* Stats sur téléphone : calculs, réponse/annulation, thèmes et hors-ligne.
   Données entièrement synthétiques ; aucune sauvegarde personnelle. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),vm=require('node:vm');
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const E=require('../docs/engine.js'),P=require('../docs/progress.js').pure;
const root=path.resolve(__dirname,'../docs'),artifacts=path.resolve('browser-results/progress');
fs.mkdirSync(artifacts,{recursive:true});
const ctx={window:{}};
for(const name of ['data','extra'])vm.runInNewContext(fs.readFileSync(path.join(root,name+'.js'),'utf8'),ctx);
const seed=ctx.window.SEED.items,extra=ctx.window.EXTRA;
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date());
const counts={},items={};
for(const b of P.BANDS){
  const pool=seed.filter(x=>extra[x.id]?.cefr===b),n=Math.ceil(pool.length*(b==='A1'?1:b==='A2'?.8:b==='B1'?.02:0));
  counts[b]=n;
  pool.forEach((x,i)=>items[x.id]={s:i<n?5:0,i:i<n?20:0,d:i<n?E.addDays(today,20):null,ok:i<n?4:0,ko:0});
}
const probe=seed.find(x=>extra[x.id]?.cefr==='B1' && items[x.id].s===0 && x.type==='word');
items[probe.id]={s:3,i:1,d:today,S:4,D:5,ok:3,ko:0,lp:2};
const lvlhist={};
for(let i=14;i>=0;i--)lvlhist[E.addDays(today,-i)]={...counts,A2:counts.A2-i};
delete lvlhist[E.addDays(today,-5)]; // pas de zéro inventé à la place d'un relevé absent
lvlhist[today]={...counts,B1:counts.B1-5}; // ancien relevé du matin : il doit être rafraîchi
const initial={v:1,freshOk:1,reverseMig:1,adapMig:1,audioCleanMig:1,items,lvlhist,
  set:{...E.DEF_SET,production:false,reverse:false,mute:true,autoplay:false,typing:false,images:false,newPerDay:10},
  sess:{d:today,q:[probe.id],p:0,pen:0},log:{},intro:{},rlog:[]};
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.json':'application/json','.png':'image/png','.webp':'image/webp','.mp3':'audio/mpeg'};
const server=http.createServer((req,res)=>{
  let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(file===root)file=path.join(root,'index.html');
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(file,(err,bytes)=>{if(err){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(bytes);});
});
let browser,page;
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url='http://127.0.0.1:'+server.address().port+'/';
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true,timezoneId:'Asia/Seoul'});
  await context.addInitScript(data=>{if(!localStorage.getItem('sori-state-v1'))localStorage.setItem('sori-state-v1',JSON.stringify(data));},initial);
  page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);
  await page.getByRole('heading',{name:'Progression du programme',exact:true}).waitFor();
  assert.match(await page.locator('.progress-head').innerText(),/Prochaines nouvelles cartes : A2/);
  const text=await page.locator('.progress-card').allTextContents();
  assert.match(text.join(' '),/14 derniers jours/);
  assert.match(text.join(' '),/catégories précédentes/);
  assert.doesNotMatch(text.join(' '),/Niveau actuel|Prochain palier|niveau suivant|seuil|à 80 %/i);
  assert.equal(await page.locator('.progress-target').count(),0);
  assert.equal(await page.locator('.progress-intro [role="meter"]').count(),5);
  assert.equal(await page.locator('.progress-mastery [role="meter"]').count(),5);
  assert.equal(await page.evaluate(()=>ST.lvlhist[todayStr()].B1),counts.B1);
  assert.deepEqual(await page.evaluate(()=>ST.items),initial.items,'ouvrir les stats ne modifie aucune carte');
  const before=await page.evaluate(()=>({items:JSON.stringify(ST.items),rlog:JSON.stringify(ST.rlog),history:JSON.stringify(ST.lvlhist)}));
  const forecast=await page.evaluate(()=>SORI_PROGRESS.pure.model({items:BASE_IDS.map(eff),extra:EXTRA,history:ST.lvlhist,today:todayStr(),newPerDay:ST.set.newPerDay}));
  assert.equal(forecast.current.band,'A2');
  const fA2=forecast.forecasts.find(x=>x.band==='A2'),fB1=forecast.forecasts.find(x=>x.band==='B1');
  assert.ok(fB1.discovery.days>fA2.discovery.days);
  assert.equal(fB1.discovery.ahead,forecast.rows.find(x=>x.band==='A2').unseen);
  const filter=page.getByLabel('Niveau du graphique');
  assert.equal(await filter.inputValue(),'all');
  assert.ok(await page.locator('.progress-bar').count()>0,'les gains A2 sont visibles au démarrage');
  assert.ok(await page.locator('.progress-missing').count()>0);
  await filter.selectOption('B1');
  assert.equal(await page.locator('.progress-bar').count(),0,'B1 reste stable');
  assert.match(await page.locator('.progress-flat').innerText(),/B1 est stable/);
  await page.locator('.progress-card').nth(1).screenshot({path:path.join(artifacts,'b1-stable.png')});
  await filter.selectOption('A2');assert.ok(await page.locator('.progress-bar').count()>0);
  await filter.selectOption('all');
  for(const theme of await page.evaluate(()=>SORI_THEMES.list.map(x=>x.id))){
    await page.evaluate(id=>SORI_THEMES.set(id),theme);
    for(const width of [320,412]){
      await page.setViewportSize({width,height:915});
      const overflow=await page.evaluate(()=>{
        const cards=[...document.querySelectorAll('.progress-card')];
        return cards.some(x=>x.scrollWidth>x.clientWidth+1) || document.documentElement.scrollWidth>innerWidth;
      });
      assert.equal(overflow,false,'aucun débordement : '+theme+' / '+width);
    }
  }
  await page.evaluate(()=>SORI_THEMES.set('encre'));
  await page.screenshot({path:path.join(artifacts,'stats-mobile.png'),fullPage:true});
  for(const [i,name] of ['levels','trend','forecasts'].entries()){
    await page.locator('.progress-card').nth(i).screenshot({path:path.join(artifacts,name+'.png')});
  }
  await page.locator('.progress-day').nth(0).click();
  assert.equal(await page.locator('.progress-detail').innerText(),await page.locator('.progress-day').nth(0).getAttribute('aria-label'));
  assert.deepEqual(await page.evaluate(()=>({items:JSON.stringify(ST.items),rlog:JSON.stringify(ST.rlog),history:JSON.stringify(ST.lvlhist)})),before);
  // Réponse réelle puis annulation : la photo de maîtrise suit les deux opérations.
  await page.locator('#tabs [data-tab="review"]').click();
  await page.locator('.card.center .big-fr').click();
  await page.locator('.g4').filter({hasText:'Bien'}).click();
  await page.waitForFunction(id=>ST.items[id].s===4,probe.id);
  await page.waitForTimeout(1500); // laisser finir le tampon/avance automatique avant la navigation
  await page.locator('#tabs [data-tab="progres"]').click();
  assert.equal(await page.evaluate(()=>ST.lvlhist[todayStr()].B1),counts.B1+1);
  await page.evaluate(()=>{undoLast();TAB='progres';render();});
  assert.equal(await page.evaluate(()=>ST.lvlhist[todayStr()].B1),counts.B1);
  assert.deepEqual(await page.evaluate(()=>ST.items),initial.items);
  assert.deepEqual(await page.evaluate(()=>ST.rlog),[]);
  await page.reload();assert.equal(await page.evaluate(()=>ST.lvlhist[todayStr()].B1),counts.B1);
  // La baisse, les trous et les pauses restent visibles, sans fausse date.
  await page.evaluate(()=>{
    ST.lvlhist[addDays(todayStr(),-1)].B1+=10;ST.set.newPerDay=0;render();
  });
  assert.ok(await page.locator('.progress-negative').count()>0);
  assert.match(await page.locator('.progress-projections').innerText(),/Nouvelles cartes en pause/);
  // Finir la découverte de A2 fait passer les prochaines nouveautés à B1,
  // même avec des A2 encore loin de la maîtrise. Une suspension reste intacte.
  const switched=await page.evaluate(()=>{
    for(const it of BASE_IDS.map(eff))if((EXTRA[it.id]||{}).cefr==='A2'&&it.stage===0)ST.items[it.id].s=1;
    const paused=BASE_IDS.find(id=>(EXTRA[id]||{}).cefr==='B1'&&ST.items[id].s===0);
    ST.items[paused].s=1;ST.items[paused].sus=true;ST.set.newPerDay=10;
    const before=JSON.stringify(ST.items);render();return {before,after:JSON.stringify(ST.items)};
  });
  assert.equal(switched.before,switched.after);
  assert.match(await page.locator('.progress-head').innerText(),/Prochaines nouvelles cartes : B1/);
  assert.match(await page.locator('[data-forecast="A2"] [data-goal="discovery"]').innerText(),/Déjà fait/);
  assert.match(await page.locator('[data-forecast="B1"] [data-goal="mastery"]').innerText(),/1 carte à réactiver/);
  await page.screenshot({path:path.join(artifacts,'paused-and-negative.png'),fullPage:true});
  // Module facultatif : aucun blocage du lanceur ni de l'onglet Exercices s'il manque.
  await page.evaluate(()=>{window.SORI_PROGRESS=undefined;render();});
  assert.equal(await page.locator('#goreview').count(),1);
  await page.locator('#tabs [data-tab="exercices"]').click();
  await page.getByRole('heading',{name:"Les nombres à l'oreille",exact:true}).waitFor();
  await page.reload();
  // Comparaison à la vraie introduction de l'app en mode recto/verso :
  // deux paires A2 et une paire B1, quota impair de trois cartes par jour.
  const paired=await browser.newContext({timezoneId:'Asia/Seoul'});
  await paired.addInitScript(data=>localStorage.setItem('sori-state-v1',JSON.stringify(data)),
    {...initial,set:{...initial.set,reverse:true}});
  const pairPage=await paired.newPage();pairPage.on('pageerror',e=>errors.push(e.message));
  await pairPage.goto(url);
  const comparison=await pairPage.evaluate(()=>{
    const base=BASE_IDS.map(eff);
    const chosen=[...base.filter(it=>it.type==='word'&&(EXTRA[it.id]||{}).cefr==='A2').slice(0,2),
      base.find(it=>it.type==='word'&&(EXTRA[it.id]||{}).cefr==='B1')];
    ST.items=Object.fromEntries(ALL_IDS.map(id=>[id,{s:0,sus:true}]));ST.intro={};
    chosen.forEach(it=>{ST.items[it.id]={s:0};ST.items[mateOf(it.id)]={s:0};});
    const sorted=()=>ENGINE.pickNew(ALL_IDS.map(eff).filter(it=>!it.sus),Infinity,false,newRank);
    const queue=sorted().map(id=>({id,band:EXTRA[baseId(id)].cefr,base:!isRev(id),mate:mateOf(id)}));
    const plan=SORI_PROGRESS.pure.introductionPlan(queue,3),actual={};
    for(let day=1;day<=3;day++){
      const ids=introduceCards(sorted().slice(0,6),3,addDays(todayStr(),day));
      ids.filter(id=>!isRev(id)).forEach(id=>{actual[EXTRA[id].cefr]=day;});
    }
    return {planned:plan.last,actual,remaining:sorted().length};
  });
  assert.deepEqual(comparison.planned,comparison.actual);
  assert.deepEqual(comparison.actual,{A2:2,B1:3});assert.equal(comparison.remaining,0);
  await paired.close();
  // Le nouveau module fait partie du cache de l'app et se recharge sans réseau.
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.waitForFunction(async()=>{
    const name=(await caches.keys()).find(k=>/^sori-v\d+$/.test(k));
    return !!name && !!(await (await caches.open(name)).match('./progress.js'));
  });
  await context.setOffline(true);await page.reload();
  await page.getByRole('heading',{name:'Progression du programme',exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(artifacts,'summary.json'),JSON.stringify({ok:true,themes:6,widths:[320,412],offline:true,answerUndo:true,pageErrors:errors},null,2));
  console.log(JSON.stringify({ok:true,artifacts,pageErrors:errors}));
})().catch(async e=>{
  console.error(e);if(page){try{await page.screenshot({path:path.join(artifacts,'failure.png'),fullPage:true});fs.writeFileSync(path.join(artifacts,'failure.txt'),await page.locator('body').innerText());}catch(_){}}
  process.exitCode=1;
}).finally(async()=>{if(browser)await browser.close();await new Promise(r=>server.close(r));});

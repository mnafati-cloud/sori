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
for(let i=14;i>=0;i--)lvlhist[E.addDays(today,-i)]={...counts,A2:counts.A2-i,B1:counts.B1-(i%3)};
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
  assert.match(await page.locator('.progress-head').innerText(),/B1 à 80/);
  const text=await page.locator('.progress-card').allTextContents();
  assert.match(text.join(' '),/14 derniers jours/);
  assert.match(text.join(' '),/cumulés/);
  assert.doesNotMatch(text.join(' '),/Niveau actuel|Prochain palier|niveau suivant/);
  assert.equal(await page.evaluate(()=>ST.lvlhist[todayStr()].B1),counts.B1);
  assert.deepEqual(await page.evaluate(()=>ST.items),initial.items,'ouvrir les stats ne modifie aucune carte');
  const before=await page.evaluate(()=>({items:JSON.stringify(ST.items),rlog:JSON.stringify(ST.rlog),history:JSON.stringify(ST.lvlhist)}));
  const forecast=await page.evaluate(()=>SORI_PROGRESS.pure.model({items:BASE_IDS.map(eff),extra:EXTRA,history:ST.lvlhist,today:todayStr(),newPerDay:ST.set.newPerDay}));
  assert.equal(forecast.current.band,'B1');
  assert.ok(forecast.forecasts[1].days>=forecast.forecasts[0].days);
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
  assert.match(await page.locator('.progress-projections').innerText(),/Introduction de cartes en pause/);
  await page.screenshot({path:path.join(artifacts,'paused-and-negative.png'),fullPage:true});
  // Module facultatif : aucun blocage du lanceur ni de l'onglet Exercices s'il manque.
  await page.evaluate(()=>{window.SORI_PROGRESS=undefined;render();});
  assert.equal(await page.locator('#goreview').count(),1);
  await page.locator('#tabs [data-tab="exercices"]').click();
  await page.getByRole('heading',{name:"Les nombres à l'oreille",exact:true}).waitFor();
  await page.reload();
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

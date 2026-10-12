/* Régressions issues de l'audit : contexte des rapports, notes lexicales et tampon.
   Vraie PWA, état synthétique, aucun accès au dépôt privé de sauvegardes. */
const fs=require("node:fs"),path=require("node:path"),http=require("node:http"),vm=require("node:vm");
const assert=require("node:assert/strict"),{chromium}=require("playwright");
const E=require("../docs/engine.js"),D=require("../docs/production-data.js");
const root=path.resolve(__dirname,"../docs"),artifacts=path.resolve("browser-results/ui-repairs");
fs.mkdirSync(artifacts,{recursive:true});
const ctx={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,"data.js"),"utf8"),ctx);
const seed=ctx.window.SEED.items,known=new Set(D.items.flatMap(x=>x.needs));
const ordinary=seed.find(x=>x.kr==="안녕하세요");
const day=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul"}).format(new Date());
const initial={v:1,freshOk:1,reverseMig:1,adapMig:1,audioCleanMig:1,
  items:Object.fromEntries(seed.filter(x=>known.has(x.kr)).map(x=>[x.id,{s:5,i:30,d:E.addDays(day,30),ok:0,ko:0}])),
  set:{...E.DEF_SET,report:true,reverse:false,mute:true,autoplay:false,newPerDay:0},
  sess:{d:day,q:[ordinary.id],p:0,pen:0}};
initial.items[ordinary.id]={s:1,i:1,d:day,ok:1,ko:0};
const mime={".html":"text/html",".js":"text/javascript",".css":"text/css",".woff2":"font/woff2",".json":"application/json",".png":"image/png"};
const server=http.createServer((req,res)=>{
  let file=path.resolve(root,"."+decodeURIComponent(new URL(req.url,"http://localhost").pathname));
  if(file===root) file=path.join(root,"index.html");
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(file,(err,bytes)=>{if(err){res.writeHead(404);res.end();return;}res.writeHead(200,{"Content-Type":mime[path.extname(file)]||"application/octet-stream"});res.end(bytes);});
});
let browser,page;
(async()=>{
  await new Promise(r=>server.listen(0,"127.0.0.1",r));
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true,timezoneId:"Asia/Seoul"});
  await context.addInitScript(data=>{if(!localStorage.getItem("sori-state-v1"))localStorage.setItem("sori-state-v1",JSON.stringify(data));},initial);
  page=await context.newPage();const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto("http://127.0.0.1:"+server.address().port+"/");
  await page.locator('#tabs [data-tab="review"]').click();
  await page.locator(".production-input").waitFor();
  // Rapport réellement enregistré depuis la situation visible, même si Q pointe ailleurs.
  await page.evaluate(()=>{LASTANS={id:Q[QPOS],kr:SEED_BY_ID[Q[QPOS]].kr,ok:true};});
  await page.locator("#report").click();
  assert.match(await page.locator(".modal").innerText(),/Phrase : J’étudie à la maison/);
  await page.locator("#rpttxt").fill("Signalement synthétique de la situation affichée.");
  await page.locator("#rptsend").click();
  await page.locator(".modal-back").waitFor({state:"hidden"});
  const report=await page.evaluate(()=>ST.reports.at(-1));
  assert.equal(report.ctx.production.id,"place-home");assert.equal(report.ctx.production.phase,"input");
  assert.equal(report.ctx.carte,undefined);assert.equal(report.ctx.derniereReponse,undefined);
  await page.locator(".production-input").fill("집에 공부해요");
  await page.getByRole("button",{name:"Vérifier",exact:true}).click();
  const retry=await page.evaluate(()=>reportCtx());
  assert.equal(retry.production.phase,"retry");assert.equal(retry.production.first,"incorrect");
  assert.equal(retry.production.tries,1);
  await page.locator(".production-input").fill("집에서 한국어를 공부하고 있어요");
  await page.getByRole("button",{name:"Vérifier",exact:true}).click();
  const done=await page.evaluate(()=>reportCtx());
  assert.equal(done.production.phase,"done");assert.equal(done.production.result,"unverified");
  assert.equal(done.production.outcome,"incorrect");assert.equal(done.production.tries,2);
  await page.reload();await page.locator('#tabs [data-tab="review"]').click();
  assert.deepEqual(await page.evaluate(()=>ST.reports.at(-1)),report,"rapport conservé après recharge");
  assert.deepEqual(await page.evaluate(()=>reportCtx()),done);
  // Un exercice suspendu ne remplace pas le contexte d'une carte ordinaire visible.
  await page.evaluate(()=>{ST.set.production=false;render();});
  assert.equal(await page.evaluate(()=>reportCtx().carte.kr),ordinary.kr);
  assert.equal(await page.evaluate(()=>reportCtx().production),undefined);
  await page.locator('#tabs [data-tab="progres"]').click();
  assert.equal(await page.evaluate(()=>reportCtx().production),undefined);
  // Les trois notes sont accessibles après réponse ET dans le dictionnaire.
  for(const kr of ["전체","전부","전"]){
    const fr=await page.evaluate(kr=>{
      const it=SEED.items.find(x=>x.kr===kr);ST.items[it.id]={s:1,i:1,d:todayStr(),ok:0,ko:0};
      Q=[it.id];QPOS=0;TAB="review";render();return it.fr;
    },kr);
    await page.getByRole("button",{name:fr,exact:true}).click();
    await page.locator("#cont").waitFor();
    const note=await page.locator(".trivia .tnote").innerText();
    for(const word of ["전체","전부","전 직원"])assert.ok(note.includes(word),kr+" : "+word);
    await page.locator("#dicorev").click();await page.locator(".search-input").fill(kr);
    const row=page.locator(".search-hit").filter({has:page.locator(".kr").getByText(kr,{exact:true})});
    await row.click();assert.equal(await row.locator(".tnote").innerText(),note.replace(/^※\s*/,""));
    await page.screenshot({path:path.join(artifacts,kr+"-comparison.png")});
    await page.locator("#dicoclose").click();
  }
  // Contrôle du vrai DOM et des minuteries : l'animation normale n'est pas une panne.
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.clock.install();
  await page.evaluate(id=>{
    SORI_THEMES.set("takbon");ST.errors=[];Q=[id];QPOS=0;ST.items[id]={s:3,i:1,d:todayStr(),ok:0,ko:0};
    TAB="review";render();
  },ordinary.id);
  await page.clock.runFor(1000);
  await page.evaluate(()=>{STAMP_NEXT={kr:"습득",label:"maîtrisée"};armCooldown();nextCard();});
  await page.clock.runFor(150);assert.equal(await page.locator(".stamp-over").count(),1);
  assert.deepEqual(await page.evaluate(()=>ST.errors),[]);
  await page.clock.runFor(600);assert.equal(await page.locator(".stamp-over.out").count(),1);
  assert.deepEqual(await page.evaluate(()=>ST.errors),[]);
  await page.clock.runFor(1400);assert.equal(await page.locator(".stamp-over").count(),0);
  assert.deepEqual(await page.evaluate(()=>ST.errors),[]);
  // Simuler la perte du callback de fin : le filet retire le tampon ET avance la carte.
  await page.evaluate(()=>{
    const timer=window.setTimeout;
    window.setTimeout=(fn,ms,...args)=>ms===700?0:timer(fn,ms,...args);
    try{STAMP_NEXT={kr:"습득",label:"maîtrisée"};armCooldown();nextCard();}
    finally{window.setTimeout=timer;}
  });
  await page.clock.runFor(1000);assert.equal(await page.locator(".stamp-over").count(),1);
  assert.deepEqual(await page.evaluate(()=>ST.errors),[]);
  await page.clock.runFor(500);assert.equal(await page.locator(".stamp-over").count(),0);
  assert.equal(await page.locator(".big-kr").count(),1);
  assert.match(JSON.stringify(await page.evaluate(()=>ST.errors)),/mot invisible.*couvert/);
  const repaired=await page.evaluate(()=>{
    const word=document.querySelector(".big-kr");word.style.opacity="0";healInvisibleWords();
    return getComputedStyle(word).opacity;
  });
  assert.equal(repaired,"1","un vrai mot transparent est toujours réparé");
  assert.deepEqual(errors,[]);
  const summary={browser:await browser.version(),productionReports:true,reportReload:true,lexicalNotes:3,
    normalStamp:true,stuckStampRecovered:true,invisibleWordRecovered:true,pageErrors:errors};
  fs.writeFileSync(path.join(artifacts,"summary.json"),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
})().catch(async error=>{
  console.error(error);process.exitCode=1;fs.writeFileSync(path.join(artifacts,"failure.txt"),String(error.stack||error));
  if(page)await page.screenshot({path:path.join(artifacts,"failure.png")}).catch(()=>{});
}).finally(async()=>{if(browser)await browser.close();await new Promise(r=>server.close(r));});

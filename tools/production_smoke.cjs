/* Vraie PWA, clavier/IME mobile, entrelacement, mode avion et rechargement.
   Données synthétiques uniquement. Même installation Playwright que backup_smoke.cjs. */
const fs=require("node:fs"), path=require("node:path"), http=require("node:http"), vm=require("node:vm");
const assert=require("node:assert/strict"), {chromium}=require("playwright");
const D=require("../docs/production-data.js"), E=require("../docs/engine.js");
const root=path.resolve(__dirname,"../docs"), artifacts=path.resolve(process.env.SORI_PRODUCTION_ARTIFACTS||"browser-results/production");
fs.mkdirSync(artifacts,{recursive:true});
const seedContext={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,"data.js"),"utf8"),seedContext);
const seed=seedContext.window.SEED.items, known=new Set(D.items.flatMap(x=>x.needs));
const ordinary=seed.filter(x=>x.type==="word" && !known.has(x.kr)).slice(0,8);
const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul"}).format(new Date());
const initial={v:1,freshOk:1,reverseMig:1,adapMig:1,audioCleanMig:1,xp:0,
  items:Object.fromEntries(seed.map(x=>[x.id,{s:known.has(x.kr)?5:0,i:known.has(x.kr)?30:0,d:known.has(x.kr)?E.addDays(today,30):null,ok:0,ko:0}])),
  set:{...E.DEF_SET,reverse:false,mute:true,autoplay:false,newPerDay:0},log:{},intro:{},rlog:[],
  sess:{d:today,q:ordinary.map(x=>x.id),p:0,pen:0},rep:{d:today,m:{}}};
ordinary.forEach(x=>initial.items[x.id]={s:1,i:1,d:today,e:2.2,ok:1,ko:0});
const mime={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".woff2":"font/woff2",".png":"image/png"};
const server=http.createServer((req,res)=>{
  let file=path.resolve(root,"."+decodeURIComponent(new URL(req.url,"http://localhost").pathname));
  if(file===root) file=path.join(root,"index.html");
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(file,(err,bytes)=>{if(err){res.writeHead(404);res.end();return;}res.writeHead(200,{"Content-Type":mime[path.extname(file)]||"application/octet-stream"});res.end(bytes);});
});
let browser,page;
(async()=>{
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const url="http://127.0.0.1:"+server.address().port+"/";
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:412,height:915},timezoneId:"Asia/Seoul",isMobile:true,hasTouch:true});
  await context.addInitScript(data=>{if(!localStorage.getItem("sori-state-v1")) localStorage.setItem("sori-state-v1",JSON.stringify(data));},initial);
  page=await context.newPage();const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto(url);await page.locator("#goreview").waitFor();
  assert.match(await page.locator("#goreview").innerText(),/4 phrases/);
  await page.locator('#tabs [data-tab="review"]').click();
  await page.locator(".production-input").waitFor();
  assert.equal(await page.locator(".production-prompt").textContent(),"J’étudie à la maison.");
  assert.equal(await page.locator(".production-card .opts, .production-card .chips").count(),0);
  const before=await page.evaluate(()=>({items:JSON.stringify(ST.items),rlog:JSON.stringify(ST.rlog),q:Q.slice(),p:QPOS}));
  await page.screenshot({path:path.join(artifacts,"first-phrase.png")});
  // Une validation pendant la composition IME ne doit ni noter ni avancer.
  await page.locator(".production-input").fill("집에서 공부해요".normalize("NFD"));
  await page.locator(".production-input").evaluate(input=>{
    input.dispatchEvent(new CompositionEvent("compositionstart",{bubbles:true}));
    input.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",isComposing:true,bubbles:true}));
  });
  assert.equal(await page.evaluate(()=>ST.production.active.first),null);
  await page.locator(".production-input").evaluate(input=>input.dispatchEvent(new CompositionEvent("compositionend",{bubbles:true})));
  await page.getByRole("button",{name:"Vérifier",exact:true}).click();
  await page.getByText("Réussi sans aide.",{exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>({items:JSON.stringify(ST.items),rlog:JSON.stringify(ST.rlog),q:Q.slice(),p:QPOS})),before,"une production ne modifie pas les cartes ni FSRS");
  await page.reload();await page.locator('#tabs [data-tab="review"]').click();
  await page.getByText("Réussi sans aide.",{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>ST.production.skills.place.ok),1);
  await page.getByRole("button",{name:"Annuler la note",exact:true}).click();
  assert.equal(await page.evaluate(()=>ST.production.skills.place),undefined);
  await page.getByRole("button",{name:"Continuer",exact:true}).click();
  // Huit cartes ordinaires, puis retour automatique à la production.
  for(let i=0;i<8;i++){
    await page.locator(".opts button").first().waitFor();
    const correct=await page.evaluate(()=>SEED_BY_ID[Q[QPOS]].fr);
    await page.getByRole("button",{name:correct,exact:true}).click();
    await page.locator("#cont").click();
  }
  await page.locator(".production-input").waitFor();
  assert.equal(await page.evaluate(()=>ST.production.active.item),"recipient-friend");
  await page.locator(".production-input").fill("친구에서 책을 줘요");
  await page.getByRole("button",{name:"Vérifier",exact:true}).click();
  assert.equal(await page.locator(".production-input").inputValue(),"친구에서 책을 줘요");
  await page.reload();await page.locator('#tabs [data-tab="review"]').click();
  assert.equal(await page.evaluate(()=>ST.production.active.first),"incorrect");
  await page.locator(".production-input").fill("친구에게 책을 줘요");
  await page.getByRole("button",{name:"Vérifier",exact:true}).click();
  assert.equal(await page.evaluate(()=>ST.production.skills.recipient.ok),0);
  assert.equal(await page.evaluate(()=>ST.production.skills.recipient.ko),1);
  await page.screenshot({path:path.join(artifacts,"corrected-after-help.png")});
  await page.getByRole("button",{name:"Continuer",exact:true}).click();
  // Hors corpus : réponse et explication immédiates, aucun clic de révélation.
  await page.locator(".production-input").fill("집에서도 일을 하고 있어요");
  await page.getByRole("button",{name:"Vérifier",exact:true}).click();
  await page.locator(".production-answer").waitFor();
  assert.equal(await page.locator(".production-answer").textContent(),"집에서도 일해요");
  assert.ok((await page.locator(".production-card").textContent()).includes(D.items.find(x=>x.id==="addition-home").explanation));
  assert.equal(await page.locator(".production-input").count(),0);
  assert.equal(await page.getByRole("button",{name:"Voir un exemple",exact:true}).count(),0);
  assert.equal(await page.getByText(/Je ne sais pas évaluer cette formulation/).count(),0);
  assert.equal(await page.evaluate(()=>ST.production.skills.addition.ko),0);
  assert.equal(await page.evaluate(()=>ST.production.skills.addition.ok),0);
  await page.screenshot({path:path.join(artifacts,"unrecognized-answer.png")});
  await page.getByRole("button",{name:"Continuer",exact:true}).click();
  // Le service worker fournit le corpus et le correcteur sans aucun réseau.
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
  await context.setOffline(true);await page.reload();
  await page.locator('#tabs [data-tab="review"]').click();
  await page.locator(".production-input").fill("집에서밖에 일하지 않아요");
  await page.getByRole("button",{name:"Vérifier",exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>ST.production.skills.restriction.forms),["밖에 + négation"]);
  await page.screenshot({path:path.join(artifacts,"offline-success.png")});
  await page.getByRole("button",{name:"Continuer",exact:true}).click();
  await page.getByRole("heading",{name:"Tout est à jour",exact:true}).waitFor();
  assert.equal(await page.locator(".production-card").count(),0);
  assert.equal(await page.evaluate(()=>ST.production.day.n),4);
  await context.setOffline(false);
  await page.locator('#tabs [data-tab="progres"]').click();
  await page.locator(".production-progress summary").click();
  await page.screenshot({path:path.join(artifacts,"progress.png")});
  // Tous les thèmes, largeur étroite et clavier ouvert simulé : aucun débordement horizontal.
  await page.evaluate(()=>{ST.production=null;Q=[];QPOS=0;TAB="review";render();});
  for(const size of [{width:320,height:568},{width:412,height:480}]){
    await page.setViewportSize(size);
    for(const theme of ["encre","seoul","nuit","hanji","dansaekhwa","takbon"]){
      await page.evaluate(id=>SORI_THEMES.set(id),theme);
      const fits=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
      assert.ok(fits,`${theme} ${size.width}`);
    }
  }
  await page.screenshot({path:path.join(artifacts,"small-keyboard-viewport.png")});
  await page.setViewportSize({width:412,height:915});
  await page.evaluate(()=>SORI_THEMES.set("encre"));
  await page.locator("#settings").click();
  await page.locator("#productionchk").uncheck();await page.locator("#setclose").click();
  assert.equal(await page.locator(".production-card").count(),0);
  await page.locator("#settings").click();
  await page.locator("#productionchk").check();await page.locator("#setclose").click();
  await page.locator(".production-input").waitFor();
  const budget=await page.evaluate(()=>{
    ST.production=null;ST.set.sessionMax=20;
    const required=new Set(SORI_PRODUCTION_DATA.items.flatMap(x=>x.needs));
    const due=BASE_IDS.filter(id=>!required.has(SEED_BY_ID[id].kr)).slice(0,25);
    due.forEach(id=>{ST.items[id]={s:1,i:1,d:todayStr(),ok:0,ko:0};});
    Q=null;render();
    return {cards:Q.length,pending:PENDING,phrases:ST.production.day.n+productionRemaining()-1};
  });
  assert.equal(budget.cards,16,"quatre places de production réservées dans le plafond de 20");
  assert.ok(budget.pending>=9,"les cartes écartées restent en attente");
  const eligibility=await page.evaluate(()=>{
    const id=BASE_IDS.find(id=>SEED_BY_ID[id].kr==="집"), previous={...ST.items[id]};
    ST.items[id]={...previous,s:3};const weak=productionWords().has("집");
    ST.items[id]={...previous,sus:true};const suspended=productionWords().has("집");
    ST.items[id]=previous;return {weak,suspended};
  });
  assert.deepEqual(eligibility,{weak:false,suspended:false});
  // Une tentative v166 déjà sauvegardée passe elle aussi directement à la réponse.
  await page.evaluate(()=>{
    Object.assign(ST.production.active,{phase:"unverified",first:"unverified",tries:1});saveNow();
  });
  await page.reload();await page.locator('#tabs [data-tab="review"]').click();
  await page.locator(".production-answer").waitFor();
  assert.equal(await page.locator(".production-answer").textContent(),"집에서 공부해요");
  assert.equal(await page.evaluate(()=>ST.production.skills.place.ko),0);
  // Module absent : révision classique toujours disponible et état conservé.
  const saved=await page.evaluate(()=>JSON.stringify(ST.production));
  await page.evaluate(()=>{window.SORI_PRODUCTION=null;render();});
  assert.equal(await page.locator(".production-card").count(),0);
  assert.equal(await page.evaluate(()=>JSON.stringify(ST.production)),saved);
  assert.deepEqual(errors,[]);
  const summary={browser:await browser.version(),ime:true,ordinaryReviews:8,reload:true,undo:true,offline:true,themes:6,dailyLimit:4,pageErrors:errors};
  fs.writeFileSync(path.join(artifacts,"summary.json"),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
})().catch(async error=>{
  console.error(error);process.exitCode=1;
  fs.writeFileSync(path.join(artifacts,"failure.txt"),String(error.stack||error));
  if(page) await page.screenshot({path:path.join(artifacts,"failure.png")}).catch(()=>{});
}).finally(async()=>{if(browser) await browser.close();await new Promise(resolve=>server.close(resolve));});

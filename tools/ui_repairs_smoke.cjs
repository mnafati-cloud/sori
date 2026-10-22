/* Régressions UI : rapports, contexte des réponses, dictionnaire et tampon.
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
const mime={".html":"text/html",".js":"text/javascript",".css":"text/css",".woff2":"font/woff2",".json":"application/json",".png":"image/png",".webp":"image/webp",".mp3":"audio/mpeg"};
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
  // The finished travel campaign no longer affects either entry point for new
  // cards, even when an older backup still contains kitFirst:true.
  assert.equal(await page.locator('.event-card,.korea-line').count(),0);
  await page.locator('#settings').click();assert.equal(await page.locator('#kf').count(),0);
  assert.doesNotMatch(await page.locator('.settings').innerText(),/kit voyage/i);
  await page.screenshot({path:path.join(artifacts,'settings-without-trip.png')});
  await page.locator('#setclose').click();
  const retired=await browser.newContext();
  await retired.addInitScript(data=>localStorage.setItem('sori-state-v1',JSON.stringify(data)),initial);
  const retiredPage=await retired.newPage();
  await retiredPage.goto('http://127.0.0.1:'+server.address().port+'/');
  const queues=await retiredPage.evaluate(()=>{
    const all=BASE_IDS.map(eff);
    const kit=all.find(b=>b.kit && all.some(a=>!a.kit && a.id<b.id && newRank(a)===newRank(b)));
    const ordinary=all.find(a=>!a.kit && a.id<kit.id && newRank(a)===newRank(kit));
    function reset(){
      ST.items=Object.fromEntries(ALL_IDS.map(id=>[id,{s:0,sus:true}]));
      for(const id of [ordinary.id,kit.id])ST.items[id]={s:0,sus:false};
      ST.intro={};ST.set.kitFirst=true;ST.set.production=false;ST.set.newPerDay=1;
    }
    reset();const daily=buildQueue();reset();const more=learnMoreQueue(1);
    return {daily,more,expected:ordinary.id,legacySetting:ST.set.kitFirst};
  });
  assert.deepEqual(queues.daily,[queues.expected]);assert.deepEqual(queues.more,[queues.expected]);
  assert.equal(queues.legacySetting,true,'old settings are preserved without affecting priority');
  for(const demo of ['events','player','typing','search']){
    await retiredPage.goto('http://127.0.0.1:'+server.address().port+'/design/'+demo+'-test.html');
    assert.match(await retiredPage.title(),/^✔/,'existing '+demo+' contract checks: '+(await retiredPage.locator('#checks .fail').allTextContents()).join('; '));
  }
  await retired.close();
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
  // Dictionary audio stays next to each word on narrow phones, including
  // after expanding an illustrated entry. Exercise the real MP3, not a stub.
  const dictionaryState=await page.evaluate(()=>JSON.stringify({items:ST.items,rlog:ST.rlog}));
  const dictionaryTheme=await page.evaluate(()=>SORI_THEMES.get());
  const themes=await page.evaluate(()=>SORI_THEMES.list.map(t=>t.id));
  const fixtures=await page.evaluate(()=>['학교','종아리',
    SEED.items.filter(it=>AUDIO_IDS.has(String(it.id))).reduce((a,b)=>a.kr.length>b.kr.length?a:b).kr
  ].map(kr=>SEED.items.find(it=>it.kr===kr)).map(it=>({id:it.id,kr:it.kr})));
  await page.evaluate(()=>{ST.set.mute=false;});
  await page.locator('#dico').click();
  for(const width of [320,412]){
    await page.setViewportSize({width,height:740});
    for(const theme of themes){
      await page.evaluate(theme=>SORI_THEMES.set(theme),theme);
      for(const fixture of fixtures){
        await page.locator('.search-input').fill(fixture.kr);
        await page.locator('.search-input').press('Enter');
        const row=page.locator('.search-hit').first(),button=row.locator('.speak');
        assert.equal(await row.locator('.kr').innerText(),fixture.kr);
        assert.equal(await button.getAttribute('aria-label'),'Écouter '+fixture.kr);
        assert.equal(await button.innerText(),'Écouter');
        await button.tap();
        await page.waitForFunction(id=>CURAUDIO && CURAUDIO.src.endsWith('/audio/'+id+'.mp3') && CURAUDIO.currentTime>0 && !CURAUDIO.error,fixture.id);
        await page.evaluate(()=>CURAUDIO.pause());
        assert.equal(await row.locator('.trivia').count(),0,'listening does not expand the entry');
        await row.locator('.kr').tap();
        if(fixture.kr==='학교')await row.locator('.images-support').waitFor();
        await row.locator('.kr').scrollIntoViewIfNeeded();
        const layout=await row.evaluate(el=>{
          const b=el.querySelector('.speak').getBoundingClientRect(),k=el.querySelector('.kr').getBoundingClientRect();
          const modal=el.closest('.modal');
          return {near:b.top<=k.bottom && b.bottom>=k.top,touch:b.width>=44 && b.height>=44,
            inside:b.left>=0 && b.right<=innerWidth && modal.scrollWidth<=modal.clientWidth,
            visible:!!document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)?.closest('.speak')};
        });
        assert.deepEqual(layout,{near:true,touch:true,inside:true,visible:true},theme+' '+width+' '+fixture.kr);
        if(width===320 && fixture.kr==='학교')await page.screenshot({path:path.join(artifacts,'dictionary-audio-'+theme+'.png')});
        await button.tap();
        await page.waitForFunction(()=>CURAUDIO && CURAUDIO.currentTime>0 && !CURAUDIO.error);
        await page.evaluate(()=>CURAUDIO.pause());
        assert.equal(await row.locator('.trivia').count(),1,'listening leaves details open');
      }
    }
  }
  await page.locator('#dicoclose').click();
  await page.setViewportSize({width:412,height:915});
  await page.evaluate(theme=>{SORI_THEMES.set(theme);ST.set.mute=true;},dictionaryTheme);
  assert.equal(await page.evaluate(()=>JSON.stringify({items:ST.items,rlog:ST.rlog})),dictionaryState,'dictionary never grades a word');
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
  // Written recall must reveal the same real example, translation and lexical
  // notes as other reviews. IME composition and empty input reveal nothing.
  for(const outcome of ['exact','wrong','typo','no-keyboard']){
    const fixture=await page.evaluate(outcome=>{
      const seed=SEED.items.find(x=>x.kr==='조용하다');
      const id=outcome==='typo'?seed.id+REV:seed.id;
      ST.set.typing=true;ST.set.images=false;ST.set.production=false;
      ST.set.wordgloss=true;ST.set.exaudio=true;
      ST.items[id]={s:5,i:30,S:30,D:5,d:todayStr(),ok:4,ko:0};
      delete ST.imageReview;FAILPOS.clear();CONSOL.clear();REPRISE_IDS.clear();
      Q=[id];QPOS=0;TAB='review';BONUS=false;UNDO=null;STAMP_NEXT=null;
      const random=Math.random;Math.random=()=>0;
      try{render();}finally{Math.random=random;}
      return {id,kr:seed.kr,extra:EXTRA[seed.id],before:ST.rlog.length};
    },outcome);
    const card=page.locator('.typing-card');await card.waitFor();
    assert.equal(await card.locator('.trivia').count(),0,'no answer-bearing context in the question');
    await card.locator('.typing-verify').click();
    assert.equal(await card.locator('.trivia').count(),0,'empty input never reveals the answer');
    if(outcome==='no-keyboard')await card.locator('.typing-nokb').click();
    else{
      await card.locator('.typing-input').fill(outcome==='exact'?fixture.kr:'조용하');
      await card.locator('.typing-input').dispatchEvent('keydown',{key:'Enter',isComposing:true});
      assert.equal(await card.locator('.trivia').count(),0,'IME Enter only composes the answer');
      await card.locator('.typing-verify').click();
    }
    assert.equal(await card.locator('.trivia').count(),1,outcome+' has one context block');
    assert.equal((await card.locator('.tkr').innerText()).trim(),fixture.extra.ex);
    assert.equal(await card.locator('.tfr').innerText(),fixture.extra.exFr);
    assert.equal(await card.locator('.tnote').innerText(),fixture.extra.note);
    assert.ok((await card.locator('.tconj').innerText()).includes(fixture.extra.conj));
    assert.equal(await card.locator('.exspeak').count(),1,'example audio control remains available');
    await card.locator('.tkr .w').first().click();
    assert.ok((await card.locator('.glossbar').innerText()).includes(fixture.extra.gl[0]));
    assert.equal(await page.evaluate(()=>ST.rlog.length),fixture.before+(outcome==='exact'?1:0));
    await page.screenshot({path:path.join(artifacts,'typing-context-'+outcome+'.png')});
    if(outcome!=='exact'){
      const name=outcome==='wrong'?"J'avais faux":outcome==='typo'?"C'était juste":"Bien";
      await card.getByRole('button',{name,exact:outcome!=='typo'}).click();
    }
    await page.locator('#cont').waitFor();
    assert.equal(await card.locator('.trivia').count(),1,'grading does not append duplicate context');
    assert.equal(await page.evaluate(()=>ST.rlog.length),fixture.before+1,'one grade per written answer');
    assert.equal(await page.evaluate(()=>ST.rlog.at(-1)[4]),'type');
    assert.equal(await page.evaluate(()=>ST.rlog.at(-1)[2]),outcome==='wrong'?2:3,'typing grades retain their existing semantics');
  }
  // Les titres déjà publiés v172–v175 gardent leur badge, comme les préfixes historiques.
  const historyMessages=[
    "v176: rétablir les badges de version dans l’historique",
    "Add 410 reviewed vocabulary illustrations (v175)",
    "Add 200 reviewed vocabulary illustrations (v174)",
    "Add 200 reviewed A1/A2 illustrations (v173)",
    "Add 100 more A1/A2 brush illustrations (v172)",
    "v171: add 100 reviewed A1/A2 illustrations",
    "v169 — résoudre les trois points restants de l’audit",
    "Documenter v168 sans release\nDétail (v167)"
  ];
  await page.route("https://api.github.com/repos/mnafati-cloud/sori/commits?**",route=>route.fulfill({
    contentType:"application/json",body:JSON.stringify(historyMessages.map((message,i)=>({
      sha:String(i+1).padStart(40,"0"),commit:{message,author:{date:"2026-10-19T00:00:00Z"}}
    })))
  }));
  await page.locator("#setrev").click();await page.locator("#appver").click();
  await page.locator(".vh-item").last().waitFor();
  assert.deepEqual(await page.locator(".vh-tag").allTextContents(),["v176","v175","v174","v173","v172","v171","v169","·"]);
  assert.deepEqual(await page.locator(".vh-title").allTextContents(),[
    "rétablir les badges de version dans l’historique",
    "Add 410 reviewed vocabulary illustrations",
    "Add 200 reviewed vocabulary illustrations",
    "Add 200 reviewed A1/A2 illustrations",
    "Add 100 more A1/A2 brush illustrations",
    "add 100 reviewed A1/A2 illustrations",
    "résoudre les trois points restants de l’audit",
    "Documenter v168 sans release"
  ]);
  assert.equal(await page.locator(".vh-meta").count(),historyMessages.length);
  await page.screenshot({path:path.join(artifacts,"version-history.png")});
  await page.locator("#vhclose").click();await page.locator("#setclose").click();
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
  const summary={browser:await browser.version(),retiredTrip:true,newCardsIgnoreLegacyKitPriority:true,eventAndPlayerContracts:true,
    dictionaryAudio:true,dictionaryThemes:themes.length,dictionaryWidths:[320,412],dictionaryProgressUnchanged:true,
    productionReports:true,reportReload:true,lexicalNotes:3,typingContext:true,typingContextBeforeSelfGrade:true,typingIme:true,versionHistory:true,
    normalStamp:true,stuckStampRecovered:true,invisibleWordRecovered:true,pageErrors:errors};
  fs.writeFileSync(path.join(artifacts,"summary.json"),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
})().catch(async error=>{
  console.error(error);process.exitCode=1;fs.writeFileSync(path.join(artifacts,"failure.txt"),String(error.stack||error));
  if(page)await page.screenshot({path:path.join(artifacts,"failure.png")}).catch(()=>{});
}).finally(async()=>{if(browser)await browser.close();await new Promise(r=>server.close(r));});

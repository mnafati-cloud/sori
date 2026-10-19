/* Real PWA + synthetic state. No private backups or external generation calls. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),vm=require('node:vm');
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const E=require('../docs/engine.js'),D=require('../docs/images-data.js');
const imageCount=Object.keys(D.items).length;
const currentCache=fs.readFileSync(path.resolve(__dirname,'../docs/sw.js'),'utf8').match(/const CACHE = "([^"]+)"/)[1];
const root=path.resolve(__dirname,'../docs'),artifacts=path.resolve('browser-results/images');
fs.mkdirSync(artifacts,{recursive:true});
const ctx={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'data.js'),'utf8'),ctx);
const seed=ctx.window.SEED.items,id='pack-c3c6d557',next=seed.find(it=>it.kr==='안녕하세요').id;
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date());
const initial={v:1,freshOk:1,reverseMig:1,adapMig:1,audioCleanMig:1,items:{[id]:{s:4,i:7,S:7,D:5,d:day,ok:1,ko:0},[next]:{s:1,i:1,d:day,ok:0,ko:0}},
  set:{...E.DEF_SET,reverse:false,mute:true,autoplay:false,production:false,newPerDay:0,report:true},
  log:{},intro:{},rlog:[],sess:{d:day,q:[id,next],p:0,pen:0},rep:{d:day,m:{}}};
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.json':'application/json','.png':'image/png','.webp':'image/webp'};
let imageFailure=null,versionOverride=null;
const server=http.createServer((req,res)=>{
  let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(file===root)file=path.join(root,'index.html');
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  if(file.endsWith('.webp') && imageFailure){
    if(imageFailure==='404'){res.writeHead(404);res.end();return;}
    if(imageFailure==='corrupt'){res.writeHead(200,{'Content-Type':'image/webp'});res.end('not an image');return;}
    if(imageFailure==='slow'){setTimeout(()=>{res.writeHead(504);res.end();},2200);return;}
  }
  fs.readFile(file,(error,bytes)=>{
    if(error){res.writeHead(404);res.end();return;}
    if(file.endsWith('/sw.js') && versionOverride)bytes=Buffer.from(bytes.toString().replace(currentCache,versionOverride));
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);
  });
});
let browser,page;
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url='http://127.0.0.1:'+server.address().port+'/';
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'Asia/Seoul'});
  await context.addInitScript(data=>{if(!localStorage.getItem('sori-state-v1'))localStorage.setItem('sori-state-v1',JSON.stringify(data));},initial);
  page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.locator('#tabs [data-tab="review"]').click();await page.locator('.images-input').waitFor();
  assert.equal(await page.locator('.images-card').getByText('Parapluie',{exact:true}).count(),0);
  assert.equal(await page.locator('.images-card img').getAttribute('alt'),'Illustration à nommer en coréen');
  const snapshot=()=>page.evaluate(()=>({items:JSON.stringify(ST.items),rlog:JSON.stringify(ST.rlog),p:QPOS}));
  const before=await snapshot();
  await page.screenshot({path:path.join(artifacts,'question.png')});
  const input=page.locator('.images-input');await input.fill('우산'.normalize('NFD'));
  await input.evaluate(el=>{el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true}));});
  await page.getByRole('button',{name:'Vérifier',exact:true}).click();
  assert.equal(await page.evaluate(()=>ST.imageReview.phase),'input','IME composition does not submit');
  await input.evaluate(el=>el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})));
  await page.getByRole('button',{name:'Vérifier',exact:true}).click();
  await page.getByText('Retrouvé sans aide',{exact:true}).waitFor();
  assert.deepEqual(await snapshot(),before,'checking reveals, does not grade');
  await page.reload();await page.locator('#tabs [data-tab="review"]').click();
  await page.getByText('Retrouvé sans aide',{exact:true}).waitFor();
  assert.equal(await page.locator('.images-input').count(),0,'reload cannot replace the first attempt');
  assert.equal(await page.evaluate(()=>reportCtx().image.asset),D.items[id].src);
  await page.locator('.images-actions button').filter({hasText:'Bien'}).click();
  await page.locator('.opts button').first().waitFor();
  assert.equal(await page.evaluate(()=>ST.rlog.length),1);assert.equal(await page.evaluate(()=>ST.rlog[0][4]),'image');
  assert.equal(await page.evaluate(()=>ST.rlog[0][2]),3);assert.equal(await page.evaluate(id=>ST.items[id].ok,id),2);
  await page.locator('#undorev').click();await page.getByText('Retrouvé sans aide',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>ST.rlog.length),0,'undo removes exactly one note and restores result');
  await page.screenshot({path:path.join(artifacts,'answer.png')});
  async function reset(options={}){
    await page.evaluate(({initial,options})=>{
      ST.items=structuredClone(initial.items);ST.set={...initial.set,...options};ST.log={};ST.rlog=[];ST.rep={d:todayStr(),m:{}};
      delete ST.imageReview;Q=[initial.sess.q[0],initial.sess.q[1]];QPOS=0;UNDO=null;BONUS=false;STAMP_NEXT=null;FAILPOS.clear();CONSOL.clear();REPRISE_IDS.clear();
      TAB='review';saveSess();render();
    },{initial,options});
  }
  // Hold a cold image request: the question must start it, and every mutation
  // exposing a correction must already include the decoded image and controls.
  for(const mode of ['recall','recall-reverse','qcm-kr','qcm-fr','timeout','navigate','404','corrupt']){
    const atomic=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
    const state=structuredClone(initial);state.items[id].ok=mode==='recall-reverse'?0:3;
    state.items[id].s=mode==='qcm-kr'?1:4;
    if(mode==='qcm-fr'){
      state.items[id+'␞']={...state.items[id],s:1};state.set.reverse=true;state.sess.q[0]=id+'␞';
    }
    await atomic.addInitScript(state=>localStorage.setItem('sori-state-v1',JSON.stringify(state)),state);
    const ap=await atomic.newPage();ap.on('pageerror',e=>errors.push(e.message));
    let release,requested;const gate=new Promise(r=>release=r),started=new Promise(r=>requested=r);
    await ap.route('**/images/*.webp',async route=>{
      requested();await gate;
      if(mode==='404')await route.fulfill({status:404,body:''});
      else if(mode==='corrupt')await route.fulfill({contentType:'image/webp',body:'not an image'});
      else await route.continue();
    });
    try{
      await ap.goto(url);await ap.locator('#tabs [data-tab="review"]').click();
      let startTimer;
      try{
        await Promise.race([started,new Promise((_,reject)=>{startTimer=setTimeout(()=>reject(Error('question did not preload its image: '+mode)),5000);})]);
      }finally{clearTimeout(startTimer);}
      assert.equal(await ap.locator('#screen .images-art').count(),0,'preloading never exposes the solution');
      await ap.evaluate(({id,mode})=>{
        const card=document.querySelector('#screen .card.center');window.atomicCard=card;window.atomicStates=[];
        new MutationObserver(()=>atomicStates.push({answer:!!card.querySelector('.feedback .kr,.opts .good'),
          image:!!card.querySelector('img.images-support'),decoded:!!card.querySelector('img')?.naturalWidth,
          controls:!!card.querySelector('.row button,#continuerev')})).observe(card,{childList:true,subtree:true,attributes:true});
        window.atomicClickAt=Date.now();window.atomicT0=EXO_T0;
        if(mode.startsWith('qcm')){
          const expected=mode==='qcm-kr'?SEED_BY_ID[id].fr:SEED_BY_ID[id].kr;
          [...card.querySelectorAll('.opts button')].find(b=>b.textContent===expected).click();
        }else{card.click();card.click();}
      },{id,mode});
      assert.equal(await ap.locator('.feedback .kr,.opts .good').count(),0,'no partial correction while loading');
      if(mode==='navigate'){
        await ap.locator('#tabs [data-tab="progres"]').click();release();await ap.waitForTimeout(200);
        assert.equal(await ap.locator('.images-support,.feedback .kr').count(),0);
        assert.equal(await ap.evaluate(()=>ST.rlog.length),0,'navigation cancels the pending reveal');
      }else{
        if(mode==='timeout')await ap.locator('.feedback .kr').waitFor({timeout:3000});
        else await ap.waitForTimeout(300);
        release();await ap.locator('.feedback .kr,.opts .good').first().waitFor();
        const hasImage=!['timeout','404','corrupt'].includes(mode);
        assert.equal(await ap.locator('.images-support').count(),hasImage?1:0);
        const states=await ap.evaluate(()=>atomicStates);
        assert.ok(states.some(s=>s.answer));
        assert.ok(states.filter(s=>s.answer).every(s=>s.image===hasImage && (!hasImage || s.decoded)),JSON.stringify({mode,states}));
        if(!mode.startsWith('qcm'))assert.ok(states.filter(s=>s.answer).every(s=>s.controls),'grades appear with the correction');
        const height=await ap.evaluate(()=>atomicCard.offsetHeight);
        await ap.waitForTimeout(250);
        assert.equal(await ap.evaluate(()=>atomicCard.offsetHeight),height,'no late layout change');
        assert.equal(await ap.locator('.images-support').count(),hasImage?1:0,'no late image after fallback');
        if(mode.startsWith('qcm')){
          assert.equal(await ap.evaluate(()=>ST.rlog.length),1,'one click produces one grade');
          assert.ok(await ap.evaluate(()=>Math.abs(ST.rlog[0][5]-Math.min(600,Math.round((atomicClickAt-atomicT0)/100)))<=1),'image wait is excluded from response time');
        }else assert.equal(await ap.evaluate(()=>ST.rlog.length),0,'revealing does not grade');
        if(mode==='recall')await ap.screenshot({path:path.join(artifacts,'atomic-correction.png')});
      }
    }finally{release();await atomic.close();}
  }
  await reset({grade4:false});await page.locator('.images-input').waitFor();
  await page.getByRole('button',{name:'Je ne sais pas',exact:true}).click();
  await page.getByText('À revoir',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>ST.rlog.length),0);
  await page.reload();await page.locator('#tabs [data-tab="review"]').click();await page.getByText('À revoir',{exact:true}).waitFor();
  assert.equal(await page.locator('.images-actions button').count(),1,'forgotten word cannot be upgraded after solution');
  await page.getByRole('button',{name:'Encore',exact:true}).click();await page.locator('.opts button').first().waitFor();
  assert.equal(await page.evaluate(()=>ST.rlog[0][2]),1,'true forgetting is Encore, not typing Hard clamp');
  assert.equal(await page.evaluate(id=>ST.items[id].ko,id),1);
  await reset();await page.locator('.images-input').fill('우선');await page.getByRole('button',{name:'Vérifier',exact:true}).click();
  assert.equal(await page.evaluate(()=>ST.rlog.length),0);
  await page.getByRole('button',{name:'Faute de frappe',exact:true}).click();
  await page.locator('.images-actions button').filter({hasText:'Difficile'}).click();await page.locator('.opts button').first().waitFor();
  assert.equal(await page.evaluate(()=>ST.rlog[0][2]),2);assert.equal(await page.evaluate(id=>ST.items[id].ko,id),0);
  assert.equal(await page.evaluate(()=>ST.log[todayStr()].imageTypo),1);
  for(const answer of ['양산','<b>autre mot</b>']){
    await reset();await page.locator('.images-input').fill(answer);await page.getByRole('button',{name:'Vérifier',exact:true}).click();
    await page.getByText('La réponse attendue',{exact:true}).waitFor();
    assert.equal(await page.locator('.images-actions button').count(),2,'incorrect answers offer only forgetting or typing error');
    assert.equal(await page.getByRole('button',{name:/Image ambiguë|Continuer sans noter/}).count(),0);
    assert.equal(await page.locator('.images-yours').textContent(),'Ta réponse : '+answer);
    assert.equal(await page.locator('.images-yours b').count(),0,'typed markup remains literal text');
    assert.equal(await page.evaluate(()=>ST.rlog.length),0,'correction still requires an explicit assessment');
    if(answer==='양산')await page.screenshot({path:path.join(artifacts,'simple-correction.png')});
    await page.getByRole('button',{name:'J’avais oublié',exact:true}).click();await page.locator('.opts button').first().waitFor();
    assert.equal(await page.evaluate(()=>ST.rlog[0][2]),1);assert.equal(await page.evaluate(()=>ST.rlog.length),1);
  }
  // An existing neutral attempt from an older app remains ungraded on resume.
  await reset();await page.locator('.images-input').waitFor();
  await page.evaluate(()=>{ST.imageReview.phase='neutral';save();});
  await page.reload();await page.locator('#tabs [data-tab="review"]').click();
  const neutralBefore=await snapshot();await page.getByRole('button',{name:'Continuer sans noter',exact:true}).click();
  await page.locator('.opts button').first().waitFor();const neutralAfter=await snapshot();
  assert.equal(neutralAfter.items,neutralBefore.items);assert.equal(neutralAfter.rlog,neutralBefore.rlog);assert.equal(neutralAfter.p,1);
  await reset({grade4:false});await page.locator('.images-input').waitFor();
  await page.getByRole('button',{name:'J’ai répondu à voix haute',exact:true}).click();
  assert.equal(await page.locator('.images-actions button').count(),2,'binary grading preference is respected');
  await reset();await page.locator('.images-input').waitFor();await page.getByRole('button',{name:'Utiliser le texte',exact:true}).click();
  await page.locator('.big-fr').waitFor();assert.equal(await page.evaluate(()=>ST.rlog.length),0);
  await page.reload();await page.locator('#tabs [data-tab="review"]').click();await page.locator('.big-fr').waitFor();
  assert.equal(await page.locator('.images-card').count(),0,'text choice survives reload');
  // No asset / support-only / disabled / no module all keep the ordinary card.
  for(const mode of ['absent','support','disabled','module']){
    await page.evaluate(({id,mode})=>{
      window.savedImages=SORI_IMAGES;window.savedEntry=SORI_IMAGES_DATA.items[id];
      if(mode==='absent')delete SORI_IMAGES_DATA.items[id];if(mode==='support')SORI_IMAGES_DATA.items[id]={...savedEntry,usage:'support'};
      if(mode==='module')window.SORI_IMAGES=undefined;
    },{id,mode});
    await reset({images:mode!=='disabled'});await page.locator('.big-fr').waitFor();
    assert.equal(await page.locator('.images-loading,.images-card').count(),0);
    await page.evaluate(id=>{window.SORI_IMAGES=window.savedImages;SORI_IMAGES_DATA.items[id]=window.savedEntry;},id);
  }
  // Load failures on cold cache, including bounded wait, do not grade or leave blank cards.
  for(const failure of ['404','corrupt','slow']){
    imageFailure=failure;
    await page.evaluate(async()=>{await caches.delete('sori-image-store');});
    await page.reload(); // also release decoded preloads: these cases require a genuinely cold image
    await reset();await page.locator('.big-fr').waitFor({timeout:5000});
    assert.equal(await page.evaluate(()=>ST.rlog.length),0);
    assert.equal(await page.locator('.images-card,.images-loading').count(),0);
  }
  imageFailure=null;
  // Navigating away during image load must not append a late card to the other tab.
  imageFailure='slow';await reset();await page.locator('#tabs [data-tab="progres"]').click();
  await page.waitForTimeout(1800);assert.equal(await page.locator('.images-card,.big-fr').count(),0);imageFailure=null;
  await reset();await page.locator('.images-input').waitFor();
  await page.locator('#dicorev').click();await page.locator('.search-input').fill('우산');
  const hit=page.locator('.search-hit').filter({has:page.locator('.kr').getByText('우산',{exact:true})});
  await hit.click();await hit.locator('.images-support').waitFor();
  // Same Korean spelling, separate meanings and files in the real dictionary.
  await page.locator('.search-input').fill('배');
  for(const [cardId,sense] of [['1779706066098','Ventre'],['1780695436442','Poire (fruit)']]){
    const row=page.locator('.search-hit').filter({has:page.locator('.fr').getByText(sense,{exact:true})});
    await row.click();await row.locator('.images-support').waitFor();
    assert.equal(await row.locator('img').getAttribute('src'),D.items[cardId].src);
    assert.equal(await row.locator('img').getAttribute('alt'),sense);
  }
  await page.screenshot({path:path.join(artifacts,'homonyms-dictionary.png')});
  await page.locator('#dicoclose').click();
  // Belly remains a text question: its own image appears only with the answer.
  await page.evaluate(({belly,next})=>{
    ST.items[belly]={s:4,i:7,S:7,D:5,d:todayStr(),ok:1,ko:0};
    delete ST.imageReview;Q=[belly,next];QPOS=0;UNDO=null;saveSess();render();
  },{belly:'1779706066098',next});
  await page.locator('.big-fr').getByText('Ventre',{exact:true}).waitFor();
  assert.equal(await page.locator('.images-art,.images-input').count(),0,'support image never exposes the question answer');
  await page.locator('#screen .card.center').click();await page.locator('.feedback .kr').waitFor();
  assert.equal(await page.locator('.images-support').getAttribute('src'),D.items['1779706066098'].src);
  assert.equal(await page.locator('.images-support').getAttribute('alt'),'Ventre');
  assert.equal(await page.evaluate(()=>ST.rlog.length),0,'revealing the belly illustration does not grade');
  await page.screenshot({path:path.join(artifacts,'belly-support.png')});
  for(const sceneId of ['pack-b6372707','pack-1f0506be']){
    await page.evaluate(({sceneId,next})=>{
      ST.items[sceneId]={s:4,i:7,S:7,D:5,d:todayStr(),ok:1,ko:0};
      delete ST.imageReview;Q=[sceneId,next];QPOS=0;UNDO=null;saveSess();render();
    },{sceneId,next});
    await page.locator('.big-fr').waitFor();
    assert.equal(await page.locator('.images-art,.images-input').count(),0,'a scene is never shown as a question');
    await page.locator('#screen .card.center').click();await page.locator('.feedback .kr').waitFor();
    assert.equal(await page.locator('.images-support').getAttribute('src'),D.items[sceneId].src);
    assert.equal(await page.locator('.images-support').getAttribute('alt'),D.items[sceneId].alt);
    assert.equal(await page.evaluate(()=>ST.rlog.length),0,'scene reveal does not invent a grade');
    await page.screenshot({path:path.join(artifacts,'scene-'+sceneId+'.png')});
  }
  await reset();await page.locator('.images-input').waitFor();
  // Six actual themes, small phone and keyboard-height viewports, no horizontal overflow.
  for(const theme of ['encre','seoul','nuit','hanji','dansaekhwa','takbon'])for(const viewport of [{width:320,height:568},{width:412,height:400}]){
    await page.setViewportSize(viewport);await page.evaluate(theme=>SORI_THEMES.set(theme),theme);
    // Check the final layout after finite entrance animations; Takbon briefly
    // scales to 1.55. Keep infinite aura animations running normally.
    await page.evaluate(async()=>Promise.all(document.getAnimations()
      .filter(a=>Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a=>a.finished.catch(()=>{}))));
    await page.locator('.images-input').focus();
    const size=await page.evaluate(()=>({body:document.body.scrollWidth,screen:document.querySelector('#screen').scrollWidth,width:innerWidth}));
    assert.ok(size.body<=size.width && size.screen<=size.width,JSON.stringify({theme,viewport,size}));
    await page.screenshot({path:path.join(artifacts,`${theme}-${viewport.width}.png`)});
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('#setrev').click();await page.locator('#dlimages').click();
  await page.locator('#dlimgstatus').filter({hasText:`${imageCount} / ${imageCount}`}).waitFor();await page.locator('#setclose').click();
  const cached=await page.evaluate(async currentCache=>({keys:(await (await caches.open('sori-image-store')).keys()).map(x=>x.url),
    main:(await (await caches.open(currentCache)).keys()).filter(x=>x.url.includes('/images/')).length}),currentCache);
  assert.equal(cached.keys.length,imageCount);assert.equal(cached.main,0,'images are never duplicated in version cache');
  // Activate a new real worker, preserving dedicated image/audio caches.
  await page.evaluate(async()=>{const c=await caches.open('sori-audio-store');await c.put('./audio/test.mp3',new Response('test'));});
  versionOverride=currentCache+'-smoke';await page.evaluate(async()=>{await (await navigator.serviceWorker.getRegistration()).update();});
  await page.waitForFunction(async currentCache=> (await caches.keys()).includes(currentCache+'-smoke') && !(await caches.keys()).includes(currentCache),currentCache);
  assert.equal(await page.evaluate(async()=> (await (await caches.open('sori-image-store')).keys()).length),imageCount);
  assert.equal(await page.evaluate(async()=> (await (await caches.open('sori-audio-store')).keys()).length),1);
  await context.setOffline(true);await page.reload();await page.locator('#tabs [data-tab="review"]').click();await page.locator('.images-input').waitFor();
  await page.locator('.images-input').fill('우산');await page.getByRole('button',{name:'Vérifier',exact:true}).click();
  await page.getByText('Retrouvé sans aide',{exact:true}).waitFor();
  // Missing offline asset falls back, already-revealed result remains a result if image evicted.
  await page.evaluate(async()=>{await caches.delete('sori-image-store');});await page.reload();await page.locator('#tabs [data-tab="review"]').click();
  await page.getByText('Retrouvé sans aide',{exact:true}).waitFor();assert.equal(await page.locator('.images-input').count(),0);
  await reset();await page.locator('.big-fr').waitFor();assert.equal(await page.evaluate(()=>ST.rlog.length),0);
  assert.deepEqual(errors,[]);
  const summary={browser:await browser.version(),imageAssets:imageCount,ime:true,reload:true,undo:true,forgettingGrade:1,typoGrade:2,
    simpleCorrection:true,legacyNeutralResume:true,homonymImagesById:true,bellySupportOnly:true,scenesSupportOnly:true,
    atomicCorrections:true,preloadBeforeAnswer:true,responseTimeExcludesImageWait:true,
    fallbacks:['no manifest','support only','disabled','missing module','404','corrupt','timeout','offline'],themes:6,offline:true,cacheUpgrade:true,pageErrors:errors};
  fs.writeFileSync(path.join(artifacts,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
})().catch(async error=>{
  console.error(error);process.exitCode=1;fs.writeFileSync(path.join(artifacts,'failure.txt'),String(error.stack||error));
  if(process.env.GITHUB_ACTIONS)console.error('::error title=Images smoke::'+String(error.stack||error)
    .replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A'));
  if(page)await page.screenshot({path:path.join(artifacts,'failure.png')}).catch(()=>{});
}).finally(async()=>{if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));});

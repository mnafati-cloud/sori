/* Real app, synthetic state and simulated keyboard viewport geometries.
   Playwright does not open a real Android/iOS software keyboard. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),vm=require('node:vm');
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const E=require('../docs/engine.js'),D=require('../docs/production-data.js');
const root=path.resolve(__dirname,'../docs'),artifacts=path.resolve(process.env.SORI_BROWSER_ARTIFACTS||'browser-results','keyboard');
fs.mkdirSync(artifacts,{recursive:true});
const ctx={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'data.js'),'utf8'),ctx);
const seed=ctx.window.SEED.items,known=new Set(D.items.flatMap(x=>x.needs));
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date());
const initial={v:1,freshOk:1,reverseMig:1,adapMig:1,audioCleanMig:1,
  items:Object.fromEntries(seed.filter(x=>known.has(x.kr)).map(x=>[x.id,{s:5,i:30,d:E.addDays(day,30),ok:0,ko:0}])),
  set:{...E.DEF_SET,report:true,reverse:false,mute:true,autoplay:false,newPerDay:0},rlog:[]};
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.json':'application/json','.png':'image/png','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
  let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(file===root)file=path.join(root,'index.html');
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(file,(error,bytes)=>{res.writeHead(error?404:200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(error?'':bytes);});
});
let browser,page;
const errors=[],results=[];
async function frames(){await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
async function keyboard(height,top=0,scale=1){await page.evaluate(v=>{
  Object.assign(window.testViewport,v);testViewport.dispatchEvent(new Event('resize'));testViewport.dispatchEvent(new Event('scroll'));
},{height,offsetTop:top,scale});await frames();}
async function controls(inputSelector,buttonSelector){
  const bounds=await page.evaluate(({inputSelector,buttonSelector})=>{
    const rect=e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right};};
    const input=document.querySelector(inputSelector),button=document.querySelector(buttonSelector);
    const b=rect(button),hit=document.elementFromPoint((b.left+b.right)/2,(b.top+b.bottom)/2);
    return {input:rect(input),button:b,hit:button===hit||button.contains(hit),top:visualViewport?.offsetTop||0,
      bottom:(visualViewport?.offsetTop||0)+(visualViewport?.height||innerHeight),width:innerWidth,hitElement:hit?.outerHTML.slice(0,300),focused:document.activeElement===input};
  },{inputSelector,buttonSelector});
  for(const r of [bounds.input,bounds.button]){
    assert.ok(r.top>=bounds.top-1 && r.bottom<=bounds.bottom+1,JSON.stringify(bounds));
    assert.ok(r.left>=0 && r.right<=bounds.width+1,JSON.stringify(bounds));
  }
  assert.equal(bounds.hit,true,'button is actually reachable: '+JSON.stringify(bounds));
  assert.equal(bounds.focused,true,'the keyboard remains focused while the button is reachable');
}
async function fixture(kind){
  await page.evaluate(async kind=>{
    const box=document.querySelector('#screen');box.innerHTML='';window.testResults=[];
    if(kind==='typing')SORI_TYPING.render(box,{item:{kr:'안녕하세요',fr:'Une longue consigne de salutation pour vérifier la saisie sur un petit écran.'},onResult:ok=>testResults.push(ok)});
    if(kind==='image'){
      const id='pack-c3c6d557';await SORI_IMAGES.render(box,{item:SEED.items.find(x=>x.id===id),entry:SORI_IMAGES.asset(id),
        onPhase:p=>testResults.push(p),onReady(){},onText(){},onNeutral(){},onGrade(){},speak(){},trivia(){},grades(){}});
    }
    if(kind==='conversation')SORI_CONVERSATION.renderChat(box,{cfg:()=>({}),words:[],fragiles:[],store:{save:c=>testResults.push(c.h.length)}},{h:[{r:'a',c:'안녕하세요'}]});
  },kind);await page.waitForFunction(()=>!document.querySelector(".cooldown"));await frames();
}
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url='http://127.0.0.1:'+server.address().port+'/';
  browser=await chromium.launch({headless:true});
  for(const width of [320,390]){
    const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,timezoneId:'Asia/Seoul'});
    await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    await context.addInitScript(data=>{
      localStorage.setItem('sori-state-v1',JSON.stringify(data));
      const vv=new EventTarget();Object.assign(vv,{height:844,offsetTop:0,scale:1});
      window.testViewport=vv;Object.defineProperty(window,'visualViewport',{configurable:true,value:sessionStorage.getItem('keyboard-test-no-viewport')?null:vv});
    },initial);
    page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url);await page.locator('#tabs [data-tab="review"]').click();
    const input=page.locator('.production-input');await input.waitFor();await page.waitForFunction(()=>!document.querySelector('.cooldown'));await input.focus();
    // Overlay keyboard, then Safari-style viewport panning. Tap, not DOM click.
    await keyboard(360,40);
    await controls('.production-input','.production-form button[type="submit"]');
    await page.screenshot({path:path.join(artifacts,`production-${width}.png`)});
    await page.locator('.production-form button[type="submit"]').tap();
    assert.equal(await input.evaluate(el=>document.activeElement===el),true,'empty response keeps focus');
    await input.fill('집에 공부해요');
    await input.dispatchEvent('compositionstart');await input.dispatchEvent('keydown',{key:'Enter',isComposing:true});
    assert.equal(await page.evaluate(()=>ST.production.active.first),null,'IME Enter is not a submission');
    await input.dispatchEvent('compositionend');
    await page.locator('.production-form button[type="submit"]').tap();
    await page.locator('.production-feedback').waitFor();await frames();
    assert.equal(await input.inputValue(),'집에 공부해요','retry preserves the typed answer');
    assert.equal(await input.evaluate(el=>document.activeElement===el),false,'feedback does not reopen keyboard');
    await keyboard(844);
    await input.fill('집에서 공부해요');await keyboard(360);
    await input.press('Enter');await page.getByText('Corrigé après aide.',{exact:false}).waitFor();await frames();
    assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('keyboard-editing')),false);
    await keyboard(844);
    // Both other exercise renderers, including composing through a button tap.
    for(const kind of ['typing','image']){
      await fixture(kind);const selector=kind==='typing'?'.typing-input':'.images-input';
      const button=kind==='typing'?'.typing-verify':'.images-actions .btn';
      const field=page.locator(selector);await field.focus();await keyboard(330,20);
      await controls(selector,button);
      await field.fill(kind==='typing'?'안녕하세요':'우산');
      await field.dispatchEvent('compositionstart');await field.dispatchEvent('keydown',{key:'Enter',isComposing:true});
      assert.deepEqual(await page.evaluate(()=>testResults),[]);
      await field.evaluate(el=>el.addEventListener('blur',()=>el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})),{once:true}));
      await page.screenshot({path:path.join(artifacts,`${kind}-${width}.png`)});
      await page.locator(button).first().tap();await frames();
      assert.deepEqual(await page.evaluate(()=>testResults),kind==='typing'?[true]:['correct']);
      assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('keyboard-editing')),false);
      await keyboard(844);
    }
    await fixture('conversation');await page.locator('.conv-in').fill('안녕하세요');await keyboard(350,25);
    await controls('.conv-in','.conv-send');
    await page.locator('.conv-in').dispatchEvent('compositionstart');await page.locator('.conv-in').dispatchEvent('keydown',{key:'Enter',isComposing:true});
    assert.deepEqual(await page.evaluate(()=>testResults),[]);
    await page.locator('.conv-in').dispatchEvent('compositionend');
    await page.locator('.conv-in').press('Shift+Enter');
    assert.ok((await page.locator('.conv-in').inputValue()).includes('\n'),'Shift+Enter stays multiline');
    await keyboard(250,0,2);
    assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('keyboard-editing')),false,'pinch zoom stays native');
    await keyboard(844);
    await fixture('typing');await page.locator('.typing-input').focus();await keyboard(360);
    await page.locator('#screen').evaluate(el=>el.innerHTML='');await frames();
    assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('keyboard-editing')),false,'navigation removes layout hooks');
    await keyboard(844);await page.evaluate(()=>openReportModal());await keyboard(360,20);
    await page.locator('#rpttxt').fill('Rapport synthétique');await frames();
    await controls('#rpttxt','#rptsend');
    await page.locator('#rpttxt').press('Enter');
    assert.equal(await page.evaluate(()=>ST.reports?.length||0),0,'report keeps multiline entry');
    await page.locator('#rptsend').tap();await frames();
    assert.equal(await page.evaluate(()=>ST.reports.length),1);
    assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('keyboard-editing')),false);
    // Older browsers: no VisualViewport, layout viewport itself shrinks.
    await page.evaluate(()=>sessionStorage.setItem('keyboard-test-no-viewport','1'));
    await page.reload();await fixture('typing');await page.locator('.typing-input').focus();
    await page.setViewportSize({width,height:360});await frames();
    await controls('.typing-input','.typing-verify');
    await page.locator('.typing-input').fill('안녕하세요');await page.locator('.typing-input').press('Enter');await frames();
    assert.deepEqual(await page.evaluate(()=>testResults),[true]);
    results.push({width,overlay:true,viewportPan:true,layoutResize:true,ime:true,tap:true,enter:true});
    await context.close();
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(artifacts,'summary.json'),JSON.stringify({results,errors,realDeviceKeyboard:false},null,2));
  console.log(JSON.stringify({results,errors}));
})().catch(async error=>{console.error(error);if(page)await page.screenshot({path:path.join(artifacts,'failure.png')}).catch(()=>{});process.exitCode=1;})
  .finally(async()=>{await browser?.close();server.close();});

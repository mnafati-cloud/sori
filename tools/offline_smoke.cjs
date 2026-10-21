/* Real PWA, real media, real Cache Storage and worker under the Pages /sori/ path.
   Inject transport/cache failures, never private user data. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),vm=require('node:vm');
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const E=require('../docs/engine.js'),D=require('../docs/images-data.js');
const root=path.resolve(__dirname,'../docs'),artifacts=path.resolve('browser-results/offline');
fs.mkdirSync(artifacts,{recursive:true});
const audio={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'audio/index.js'),'utf8'),audio);
const imageUrls=Object.values(D.items).map(a=>a.src),audioUrls=[...audio.window.AUDIO.map(id=>'./audio/'+id+'.mp3'),...audio.window.AUDIO_EX.map(id=>'./audio/'+id+'-ex.mp3')];
// A complete catalogue pass can be enabled locally; CI exercises representative
// real word/phrase files and the whole image catalogue in images_smoke.cjs.
const full=process.env.SORI_FULL_MEDIA==='1';
const selected={images:full?imageUrls:imageUrls.slice(0,24),audio:full?audioUrls:[...audioUrls.slice(0,12),...audioUrls.slice(-12)]};
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.json':'application/json','.png':'image/png','.webp':'image/webp','.mp3':'audio/mpeg'};
let mode='normal';const requests=new Map();
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(!pathname.startsWith('/sori/')){res.writeHead(404);res.end();return;}
  let file=path.resolve(root,'.'+pathname.slice(5));if(file===root)file=path.join(root,'index.html');
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  const media=/\.(mp3|webp)$/.test(pathname);
  if(media && req.headers['x-sori-download']==='1'){
    const n=(requests.get(pathname)||0)+1;requests.set(pathname,n);
    if(mode==='mixed' && n===1 && requests.size<=24 && requests.size%2===0){res.writeHead(503);res.end('temporary');return;}
    if(mode==='missing' && pathname.endsWith('absent.mp3')){res.writeHead(404);res.end('missing');return;}
    if(mode==='slow'){setTimeout(()=>{res.writeHead(503);res.end('delayed');},1500);return;}
  }
  fs.readFile(file,(error,bytes)=>{
    if(error){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);
  });
});
let browser,page;
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port+'/sori/';
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'Asia/Seoul'});
  await context.addInitScript(set=>{
    if(!localStorage.getItem('sori-state-v1'))localStorage.setItem('sori-state-v1',JSON.stringify({v:1,freshOk:1,adapMig:1,reverseMig:1,audioCleanMig:1,items:{},log:{},intro:{},rlog:[],set}));
    // Exercise compatibility in a real browser rather than relying on stubs.
    AbortSignal.timeout=undefined;window.createImageBitmap=undefined;
  },{...E.DEF_SET,reverse:false,mute:true,autoplay:false,newPerDay:0,production:false});
  page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();
  const original=await page.evaluate(()=>JSON.stringify({items:ST.items,rlog:ST.rlog,set:ST.set}));
  const run=(kind,entries)=>page.evaluate(({kind,entries})=>SORI_OFFLINE.download({kind,entries}),{kind,entries});
  mode='mixed';
  for(const kind of ['images','audio']){
    requests.clear();
    // Half the first requests fail: the reported symptom. All should recover.
    const r=await run(kind,selected[kind]);
    assert.equal(r.ok,selected[kind].length,JSON.stringify(r));assert.equal(r.failed,0);assert.ok(r.retried>0);
    const before=[...requests.values()].reduce((a,b)=>a+b,0);
    assert.equal((await run(kind,selected[kind])).ok,r.total);
    assert.equal([...requests.values()].reduce((a,b)=>a+b,0),before,'resume fetches no already-verified media');
    console.log(kind+': '+r.ok+' real files saved, '+r.retried+' transient failures recovered');
  }
  mode='normal';requests.clear();
  // Corrupt responses from previous releases are repaired on the first retry,
  // including a WebP header with undecodable bytes and HTML posing as MP3.
  for(const kind of ['images','audio']){
    await page.evaluate(async({kind,url})=>{
      const c=await caches.open(kind==='images'?'sori-image-store':'sori-audio-store');
      await c.put(url,new Response('broken',{headers:{'Content-Type':kind==='images'?'image/webp':'audio/mpeg'}}));
    },{kind,url:selected[kind][0]});
    const r=await run(kind,selected[kind]);assert.equal(r.ok,r.total);assert.equal(r.failed,0);
  }
  assert.equal([...requests.values()].reduce((a,b)=>a+b,0),2,'only the two broken files need the network');
  // Reopen settings during a job: status stays attached, both buttons remain
  // disabled and Pause aborts requests without turning them into failures.
  await page.evaluate(()=>{AUDIO_IDS.clear();AUDIO_EX_IDS.clear();AUDIO_IDS.add('download-pause');openSettings();});
  mode='slow';await page.locator('#dlaudio').click();
  await page.waitForFunction(()=>SORI_OFFLINE.isRunning());
  await page.locator('#setclose').click();await page.evaluate(()=>openSettings());
  assert.equal(await page.locator('#dlaudio').isDisabled(),true);assert.equal(await page.locator('#dlimages').isDisabled(),true);
  await page.locator('#dlpause').click();await page.waitForFunction(()=>!SORI_OFFLINE.isRunning());
  await page.locator('#dlstatus').filter({hasText:'Téléchargement en pause'}).waitFor();
  await page.screenshot({path:path.join(artifacts,'paused.png')});
  await page.locator('#setclose').click();mode='normal';
  // A full disk is a storage problem, not thousands of unavailable files. Only
  // Cache.put is fault-injected, using the browser's actual DOMException type.
  await page.evaluate(()=>{window.originalPut=Cache.prototype.put;Cache.prototype.put=async function(){throw new DOMException('full','QuotaExceededError');};});
  const extra=audioUrls.find(u=>!selected.audio.includes(u))||audioUrls[0];
  await page.evaluate(async u=>(await caches.open('sori-audio-store')).delete(u),extra);
  const quota=await run('audio',[extra,...selected.audio]);assert.equal(quota.reason,'quota');assert.equal(quota.failed,0);assert.ok(quota.pending>0);
  await page.evaluate(()=>{Cache.prototype.put=originalPut;openSettings();});
  await page.locator('#dlstatus').filter({hasText:'Stockage plein'}).waitFor();
  await page.locator('#dlstatus').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(artifacts,'quota.png')});await page.locator('#setclose').click();
  assert.equal((await run('audio',[extra,...selected.audio])).failed,0);
  mode='missing';
  const missing=await run('audio',[selected.audio[0],'./audio/absent.mp3']);
  assert.equal(missing.ok,1);assert.equal(missing.errors['http-404'],1);
  assert.match(await page.evaluate(s=>SORI_OFFLINE.describe(s),missing),/absent.*serveur/);
  mode='normal';
  const counts=await page.evaluate(async()=>({
    image:(await (await caches.open('sori-image-store')).keys()).length,
    audio:(await (await caches.open('sori-audio-store')).keys()).length,
    duplicated:(await (await caches.open((await caches.keys()).find(k=>/^sori-v\d+$/.test(k)))).keys()).filter(x=>/\.(webp|mp3)$/.test(x.url)).length
  }));
  assert.equal(counts.duplicated,0);
  // Actual offline reload and actual <audio> playback, including browser Range
  // requests against the persisted complete MP3 response.
  await context.setOffline(true);await page.reload();
  for(const kind of ['images','audio'])assert.equal((await run(kind,selected[kind])).ok,selected[kind].length);
  const playback=await page.evaluate(async src=>{
    const a=new Audio(src);a.muted=true;
    await new Promise((resolve,reject)=>{a.oncanplay=resolve;a.onerror=()=>reject(Error('offline audio'));});
    await a.play();a.pause();return a.duration;
  },selected.audio[0]);assert.ok(playback>0);
  const decoded=await page.evaluate(async src=>{const i=new Image();i.src=src;await i.decode();return i.naturalWidth;},selected.images[0]);assert.ok(decoded>0);
  assert.equal(await page.evaluate(()=>JSON.stringify({items:ST.items,rlog:ST.rlog,set:ST.set})),original,'downloads never change progress/settings');
  assert.deepEqual(errors,[]);
  const summary={browser:await browser.version(),fullCatalogue:full,files:counts,compatibility:true,mixedFailuresRecovered:true,corruptCacheRepaired:true,pauseAndReopen:true,quota:true,offlineReload:true,audioPlayback:true,pageErrors:errors};
  fs.writeFileSync(path.join(artifacts,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
})().catch(async error=>{
  console.error(error);process.exitCode=1;fs.writeFileSync(path.join(artifacts,'failure.txt'),String(error.stack||error));
  if(page)await page.screenshot({path:path.join(artifacts,'failure.png')}).catch(()=>{});
}).finally(async()=>{if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));});

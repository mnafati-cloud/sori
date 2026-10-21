import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../docs/offline.js',import.meta.url),'utf8');
const base='https://sori.test/sori/';
const url=(kind,n)=>kind==='images'?`./images/test${n}-123456abcdef.webp`:`./audio/test${n}.mp3`;
const media=kind=>new Response(kind==='images'?'webp bytes':new Uint8Array([73,68,51,...Array(1100).fill(0)]),
  {headers:{'content-type':kind==='images'?'image/webp':'audio/mpeg'}});
function setup({kind='images',fetch,put,initial={},online=true,bitmap=true}={}){
  const data=new Map(Object.entries(initial).map(([key,value])=>[new URL(key,base).href,value]));
  const calls=[],writes=[],deletes=[],locks=[];
  const ctx={URL,Response,Blob,AbortController,AbortSignal:{},document:{baseURI:base},
    navigator:{onLine:online,wakeLock:{request:async()=>({release:async()=>locks.push('released')})}},
    setTimeout:(fn,ms)=>setTimeout(fn,ms===30000?40:1),clearTimeout,
    caches:{open:async()=>({match:async u=>data.get(u)?.clone(),keys:async()=>[...data.keys()].map(url=>({url})),
      put:async(u,r)=>{if(put)await put(u,r);writes.push(u);data.set(u,r);},delete:async u=>{deletes.push(u);return data.delete(u);}})},
    fetch:async(u,o)=>{calls.push({url:u,options:o});return fetch?fetch(u,o,calls.length):media(kind);},
    createImageBitmap:bitmap?async blob=>{if(await blob.text()==='broken')throw Error('decode');return {close(){}};}:undefined,
    Image:class{naturalWidth=512;removeAttribute(){}set src(v){queueMicrotask(()=>this.onload());}}
  };
  vm.runInNewContext(source,ctx);
  const api=ctx.SORI_OFFLINE;
  return {ctx,api,data,calls,writes,deletes,locks,run:options=>api.download({kind,entries:[0,1,2,3].map(i=>url(kind,i)),...options})};
}

for(const kind of ['images','audio'])test(`${kind}: mixed successes and transient failures recover before being marked failed`,async()=>{
  const attempts=new Map();
  const h=setup({kind,fetch:async u=>{
    const n=(attempts.get(u)||0)+1;attempts.set(u,n);
    if(u.includes('test1') && n<3)throw new TypeError('network');
    if(u.includes('test2') && n===1)return new Response('busy',{status:503});
    return media(kind);
  }});
  const r=await h.run();assert.equal(r.ok,4);assert.equal(r.failed,0);assert.equal(r.pending,0);assert.equal(r.retried,3);
  assert.equal(h.writes.length,4);assert.equal(r.running,false);assert.deepEqual(h.locks,['released']);
  assert.ok(h.calls.every(c=>c.options.headers['X-Sori-Download']==='1'));
  assert.match(h.api.describe(r),/Terminé/);
  const before=h.calls.length;assert.equal((await h.run()).ok,4);assert.equal(h.calls.length,before,'resume reuses verified media without fetching');
});

for(const kind of ['images','audio'])test(`${kind}: poisoned cached files are replaced in the same run`,async()=>{
  const initial={
    [url(kind,0)]:new Response('<html>offline</html>',{headers:{'content-type':'text/html'}}),
    [url(kind,1)]:new Response('broken',{headers:{'content-type':kind==='images'?'image/webp':'audio/mpeg'}}),
    [url(kind,2)]:media(kind)
  };
  const h=setup({kind,initial});const r=await h.run();
  assert.equal(r.ok,4);assert.equal(h.calls.length,3);assert.equal(h.deletes.length,2);assert.equal(r.failed,0);
});

test('older Android: neither AbortSignal.timeout nor createImageBitmap is required',async()=>{
  const h=setup({bitmap:false});assert.equal((await h.run()).ok,4);assert.equal(h.writes.length,4);
});

test('permanent 404 and invalid media are explicit, never stored or counted as saved',async()=>{
  const h=setup({kind:'audio',fetch:async u=>u.includes('test1')?new Response('missing',{status:404}):
    u.includes('test2')?new Response('<html>error</html>',{headers:{'content-type':'audio/mpeg'}}):media('audio')});
  const r=await h.run();assert.equal(r.ok,2);assert.equal(r.failed,2);assert.equal(r.errors['http-404'],1);assert.equal(r.errors.invalid,1);
  assert.equal(h.calls.filter(c=>c.url.includes('test1')).length,1);assert.equal(h.writes.length,2);
  assert.match(h.api.describe(r),/absent.*illisible/);
});

test('quota stops the queue and retains existing files, leaving the rest pending',async()=>{
  const h=setup({initial:{[url('images',0)]:media('images')},put:async()=>{throw new DOMException('full','QuotaExceededError');}});
  const r=await h.run({entries:Array.from({length:100},(_,i)=>url('images',i))});
  assert.equal(r.reason,'quota');assert.equal(r.ok,1);assert.equal(r.failed,0);assert.equal(r.pending,99);
  assert.ok(h.calls.length<=2);assert.equal(h.data.size,1);assert.match(h.api.describe(r),/Stockage plein/);
});

test('offline interruption keeps successes and resumes missing files after reconnecting',async()=>{
  const h=setup({initial:{[url('images',0)]:media('images')},online:false});
  const r=await h.run();assert.equal(r.reason,'offline');assert.equal(r.ok,1);assert.equal(r.failed,0);assert.equal(r.pending,3);assert.equal(h.calls.length,0);
  h.ctx.navigator.onLine=true;
  assert.equal((await h.run()).ok,4);assert.equal(h.calls.length,3);
});

test('a connection/server outage cannot mark the entire catalogue unavailable',async()=>{
  const h=setup({fetch:async()=>new Response('busy',{status:503})});
  const r=await h.run({entries:Array.from({length:100},(_,i)=>url('images',i))});
  assert.equal(r.reason,'connection');assert.ok(r.failed<=4);assert.ok(r.pending>=96);assert.ok(h.calls.length<=12);
  assert.ok(r.samples.length<=3);assert.match(h.api.describe(r),/HTTP 503/);
});

test('timeout covers a stalled response body and retries are bounded',async()=>{
  const h=setup({fetch:async(u,{signal})=>new Response(new ReadableStream({start(c){
    signal.addEventListener('abort',()=>c.error(new DOMException('timeout','AbortError')));
  }}),{headers:{'content-type':'image/webp'}})});
  const r=await h.run({entries:[url('images',0)]});
  assert.equal(r.errors.timeout,1);assert.equal(h.calls.length,3);assert.equal(h.writes.length,0);
});

test('saved count advances only after cache writes finish; pause and reopen keep the same job',async()=>{
  let allowWrite,started;
  const writing=new Promise(r=>started=r),gate=new Promise(r=>allowWrite=r);
  const h=setup({put:async()=>{started();await gate;}});
  const updates=[];const unsub=h.api.subscribe(s=>updates.push(s));const running=h.run();
  await writing;assert.equal(updates.at(-1).ok,0);
  await assert.rejects(()=>h.run(),/déjà en cours/);
  unsub();let reopened;h.api.subscribe(s=>reopened=s);assert.equal(reopened.running,true);
  h.api.pause();allowWrite();const r=await running;
  assert.equal(r.reason,'paused');assert.equal(r.ok,h.writes.length);assert.equal(r.failed,0);assert.equal(r.pending,4-r.ok);
  assert.equal(reopened.running,false);assert.equal(h.api.isRunning(),false);
});

test('pause aborts an in-flight request without declaring its file unavailable',async()=>{
  let started;const fetching=new Promise(r=>started=r);
  const h=setup({fetch:async(u,{signal})=>new Promise((resolve,reject)=>{
    signal.addEventListener('abort',()=>reject(new DOMException('stop','AbortError')));started();
  })});
  const running=h.run();await fetching;h.api.pause();const r=await running;
  assert.equal(r.reason,'paused');assert.equal(r.failed,0);assert.equal(r.pending,4);
});

test('missing cache permission is reported as storage rather than network',async()=>{
  const h=setup();h.ctx.caches.open=async()=>{throw new DOMException('denied','SecurityError');};
  const r=await h.run();assert.equal(r.reason,'storage');assert.equal(h.calls.length,0);assert.equal(r.failed,0);
});

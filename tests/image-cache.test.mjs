import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const worker=fs.readFileSync(new URL('../docs/sw.js',import.meta.url),'utf8');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};

for(const failure of [false,true])test(`image response does not wait for cache writes${failure?' (quota failure)':''}`,async()=>{
  const writeStarted=deferred(),allowWrite=deferred(),handlers={},deleted=[];
  let writes=0,fetches=0,hit;
  const cache={
    match:async()=>hit,
    put:async()=>{writes++;writeStarted.resolve();await allowWrite.promise;if(failure)throw Error('quota');},
    keys:async()=>Array.from({length:1026},(_,i)=>'image-'+i),
    delete:async key=>deleted.push(key)
  };
  vm.runInNewContext(worker,{
    self:{location:{origin:'https://sori.test'},addEventListener:(name,fn)=>handlers[name]=fn},
    caches:{open:async()=>cache},URL,Response,
    fetch:async()=>{fetches++;return new Response('webp bytes',{headers:{'content-type':'image/webp'}});}
  });
  function request(){
    let response,lifetime;
    handlers.fetch({request:{url:'https://sori.test/images/umbrella-012345abcdef.webp',method:'GET'},
      respondWith:p=>response=p,waitUntil:p=>lifetime=p});
    return {response,lifetime};
  }
  const first=request();let finished=false;first.lifetime.then(()=>finished=true);
  try{
    await writeStarted.promise;
    // A blocked disk must not hold the browser's response. A turn of the event
    // loop suffices; no performance threshold or real network is involved.
    const result=await Promise.race([first.response,new Promise(r=>setImmediate(()=>r(null)))]);
    assert.ok(result,'image response was held behind the cache write');
    assert.equal(await result.text(),'webp bytes');assert.equal(finished,false);
  }finally{allowWrite.resolve();await first.lifetime;}
  assert.deepEqual(deleted,failure?[]:['image-0','image-1']);
  hit=new Response('cached image');
  const second=request();assert.equal(await (await second.response).text(),'cached image');await second.lifetime;
  assert.equal(fetches,1);assert.equal(writes,1);
});

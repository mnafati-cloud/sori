/* Resumable media downloads. No user-state storage: only the two media caches.
   app.js owns controls and diagnostics; the worker bypasses these explicit fetches. */
(function(root){
  "use strict";
  const stores={images:"sori-image-store",audio:"sori-audio-store"};
  const listeners=new Set(),states={};
  let active=null;
  const failure=(code,detail="")=>Object.assign(new Error(detail||code),{code});
  const classify=e=>e?.code && typeof e.code==="string" ? e.code :
    e?.name==="QuotaExceededError" ? "quota" : e?.name==="AbortError" ? "timeout" : "network";
  const snapshot=s=>({...s,errors:{...s.errors},samples:s.samples.map(x=>({...x}))});
  function emit(s){states[s.kind]=snapshot(s);for(const fn of listeners){try{fn(snapshot(s));}catch(_){}}}
  function subscribe(fn){listeners.add(fn);Object.values(states).forEach(s=>fn(snapshot(s)));return ()=>listeners.delete(fn);}
  function pause(){if(active){active.stop="paused";for(const c of active.controllers)c.abort();}}
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

  async function decodeImage(blob){
    if(typeof root.createImageBitmap==="function"){
      const bitmap=await root.createImageBitmap(blob);bitmap.close();return;
    }
    // Older Android/WebViews can display WebP without createImageBitmap.
    const url=URL.createObjectURL(blob);
    try{
      await new Promise((resolve,reject)=>{
        const img=new root.Image();
        const finish=error=>{clearTimeout(timer);img.onload=img.onerror=null;img.removeAttribute("src");error?reject(error):resolve();};
        const timer=setTimeout(()=>finish(failure("invalid")),10000);
        img.onload=()=>finish(img.naturalWidth?null:failure("invalid"));
        img.onerror=()=>finish(failure("invalid"));img.src=url;
      });
    }finally{URL.revokeObjectURL(url);}
  }
  async function validate(response,kind){
    if(!response.ok)throw failure("http-"+response.status);
    const type=response.headers.get("content-type")||"";
    if(!(kind==="images" ? /^image\//i.test(type) : /^(audio\/|application\/octet-stream)/i.test(type)))throw failure("invalid");
    const bytes=await response.arrayBuffer();
    if(kind==="images"){
      if(!bytes.byteLength || bytes.byteLength>64*1024)throw failure("invalid");
      try{await decodeImage(new Blob([bytes],{type}));}catch(_){throw failure("invalid");}
    }else{
      const b=new Uint8Array(bytes);
      if(b.length<1024 || !((b[0]===73 && b[1]===68 && b[2]===51) || (b[0]===255 && (b[1]&224)===224)))throw failure("invalid");
    }
    return new Response(bytes,{status:200,headers:response.headers});
  }
  async function fetchMedia(url,kind){
    // AbortSignal.timeout is absent from some Android browsers. Keep the timer
    // through body consumption, so a stalled response cannot block the queue.
    const controller=new AbortController();
    const job=active;job.controllers.add(controller);
    const timer=setTimeout(()=>controller.abort(),30000);
    try{
      const response=await root.fetch(url,{signal:controller.signal,cache:"reload",headers:{"X-Sori-Download":"1"}});
      return await validate(response,kind);
    }finally{clearTimeout(timer);job.controllers.delete(controller);}
  }
  const retryable=code=>["network","timeout","invalid","http-408","http-429"].includes(code) || /^http-5\d\d$/.test(code);
  async function download({kind,entries,onProgress}){
    if(!stores[kind])throw Error("Bibliothèque inconnue.");
    if(active)throw Error("Un téléchargement est déjà en cours.");
    if(!root.caches)throw Error("Le stockage hors connexion n’est pas disponible dans ce navigateur.");
    const urls=[...new Set(entries.map(a=>new URL(typeof a==="string"?a:a.src,root.document.baseURI).href))];
    const job={stop:null,controllers:new Set()};active=job;
    const s={kind,ok:0,failed:0,total:urls.length,pending:urls.length,added:0,retried:0,errors:{},samples:[],running:true,reason:null};
    if(onProgress)listeners.add(onProgress);
    let wakeLock,cache,networkFailures=0;
    const offline=()=>root.navigator?.onLine===false;
    const remember=(url,code)=>{
      s.errors[code]=(s.errors[code]||0)+1;
      if(s.samples.length<3)s.samples.push({file:new URL(url).pathname.split("/").pop(),code});
    };
    async function one(url){
      let cached;
      try{cached=await cache.match(url);}catch(_){throw failure("storage");}
      if(cached){
        try{await validate(cached,kind);s.ok++;return;}
        catch(_){try{await cache.delete(url);}catch(_){throw failure("storage");}}
      }
      if(offline()){job.stop="offline";return;}
      for(let attempt=0;attempt<3 && !job.stop;attempt++){
        try{
          const response=await fetchMedia(url,kind);
          try{await cache.put(url,response);}catch(e){throw failure(e?.name==="QuotaExceededError"?"quota":"storage");}
          s.ok++;s.added++;networkFailures=0;return;
        }catch(e){
          const code=classify(e);
          if(job.stop)return;
          if(code==="quota" || code==="storage"){remember(url,code);job.stop=code;return;}
          if(offline()){job.stop="offline";return;}
          if(attempt<2 && retryable(code)){
            s.retried++;emit(s);await sleep(500*2**attempt);continue;
          }
          s.failed++;remember(url,code);
          // Do not turn a connection/server outage into thousands of failed files.
          if(retryable(code) && code!=="invalid"){
            if(++networkFailures>=3)job.stop="connection";
          }else networkFailures=0;
          return;
        }
      }
    }
    emit(s);
    try{
      try{cache=await root.caches.open(stores[kind]);}catch(e){throw failure(e?.name==="QuotaExceededError"?"quota":"storage");}
      // Best effort: denial must never prevent downloading. Release after the job.
      try{wakeLock=await root.navigator?.wakeLock?.request("screen");}catch(_){}
      let cursor=0;
      async function worker(){
        while(!job.stop && cursor<urls.length){
          const url=urls[cursor++];
          try{await one(url);}catch(e){const code=classify(e);remember(url,code);job.stop=code;}
          s.pending=s.total-s.ok-s.failed;emit(s);
        }
      }
      await Promise.all([worker(),worker()]);
      // Preserve existing media on interruption. Only obsolete image revisions
      // may be pruned after the entire current catalogue has been verified.
      if(kind==="images" && s.ok===s.total){
        const current=new Set(urls);
        try{for(const req of await cache.keys())if(!current.has(req.url))await cache.delete(req);}catch(_){}
      }
    }catch(e){job.stop=classify(e);remember(urls[0]||root.document.baseURI,job.stop);}
    finally{
      s.running=false;s.reason=job.stop;s.pending=s.total-s.ok-s.failed;
      active=null;emit(s);if(onProgress)listeners.delete(onProgress);
      try{await wakeLock?.release();}catch(_){}
    }
    return snapshot(s);
  }
  function describe(s){
    const noun=s.kind==="images"?"illustrations":"audios";
    const details=[];
    if(s.errors.quota)details.push("espace de stockage insuffisant");
    if(s.errors.storage)details.push("écriture dans le stockage impossible");
    const missing=(s.errors["http-404"]||0)+(s.errors["http-410"]||0);
    if(missing)details.push(missing+" fichier(s) absent(s) du serveur");
    const network=(s.errors.network||0)+(s.errors.timeout||0);
    if(network)details.push(network+" échec(s) réseau ou délai dépassé");
    if(s.errors.invalid)details.push(s.errors.invalid+" fichier(s) illisible(s)");
    for(const [code,n] of Object.entries(s.errors))if(code.startsWith("http-") && !["http-404","http-410"].includes(code))details.push(n+" erreur(s) serveur (HTTP "+code.slice(5)+")");
    const lead=`${s.ok} / ${s.total} ${noun} disponibles hors connexion`;
    if(s.running)return `${lead} · téléchargement en cours…${s.retried?` · ${s.retried} nouvelle(s) tentative(s)`:""}${details.length?" · "+details.join(" ; "):""}`;
    if(s.ok===s.total)return lead+". Terminé.";
    const reason={paused:"Téléchargement en pause",offline:"Connexion interrompue",connection:"Connexion ou serveur instable",quota:"Stockage plein",storage:"Stockage inaccessible"}[s.reason];
    return `${lead}. ${reason?reason+". ":""}${details.length?details.join(" ; ")+". ":""}Reprendre pour compléter les ${s.total-s.ok} restants ; les fichiers enregistrés sont conservés.`;
  }
  const api={download,pause,subscribe,describe,isRunning:()=>!!active,pure:{classify,retryable}};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  root.SORI_OFFLINE=api;
})(typeof window!=="undefined"?window:globalThis);

/* Sori — visual recall. No user-state storage: app.js owns attempts and grades.
   Assets are optional. A missing/slow/undecodable file always falls back to text. */
(function(root){
  "use strict";
  const normalize = s => String(s == null ? "" : s).normalize("NFC").trim().replace(/\s+/g," ").replace(/[.?!…]+$/,"").trim();
  function usable(a){
    return !!a && /^\.\/images\/[a-z0-9-]+-[a-f0-9]{12}\.webp$/.test(a.src) &&
      ["question","support"].includes(a.usage) && typeof a.alt === "string";
  }
  function eligible(it, reverse, a){
    if(!it || it.type!=="word" || it.stage<3 || !usable(a) || a.usage!=="question" || !Array.isArray(a.accepted) || !a.accepted.includes(it.kr)) return false;
    if(reverse && !it.rev) return false;
    const n=(it.ok||0)+(it.ko||0);
    // Single-card production is on odd occurrences; alternate *those* occurrences.
    return it.rev ? n%2===0 : n%4===1;
  }
  function judge(answer,a){
    const n=normalize(answer);
    if(!n) return "empty";
    if((a.accepted||[]).some(x=>normalize(x)===n)) return "correct";
    return "mismatch";
  }
  function resume(a,it,pos,day){
    return a && a.id===it.id && a.p===pos && a.d===day && a.n===(it.ok||0)+(it.ko||0) &&
      ["input","correct","mismatch","forgot","oral","typo","neutral","text"].includes(a.phase) ? a : null;
  }
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const el=html=>{const t=document.createElement("template");t.innerHTML=html;return t.content.firstChild;};
  function styles(){
    if(document.getElementById("images-styles"))return;
    const s=document.createElement("style");s.id="images-styles";
    s.textContent=`
      .images-art{display:block;object-fit:contain;aspect-ratio:1;width:220px;max-width:100%;height:auto;margin:8px auto;border-radius:var(--r);background:var(--panel)}
      .images-support{width:112px}.search-hit .images-support{width:180px}
      .images-card.images-typing .images-art{width:120px}
      .images-card.images-answered .images-art{width:110px}
      .images-input{width:100%;min-width:0;padding:12px;margin:8px 0;border:1px solid var(--line);border-radius:var(--r);background:var(--panel2);color:var(--txt);font-size:1.25rem}
      .images-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.images-actions .btn{flex:1;min-width:100px}
      .images-link{display:block;border:0;background:none;color:var(--dim);padding:12px;margin:0 auto;font:inherit;cursor:pointer}
      .images-result .kr{font-size:1.8rem}.images-yours{font-size:1rem;color:var(--dim);overflow-wrap:anywhere}
      .images-loading{padding:24px;text-align:center}
      @media(max-height:600px){.images-card .images-art{width:120px}.images-card.images-answered .images-art{width:96px}}
    `;document.head.appendChild(s);
  }
  function asset(id){const a=root.SORI_IMAGES_DATA?.items?.[id];return usable(a)?a:null;}
  function load(a,timeout=1600){
    if(!usable(a))return Promise.resolve(null);
    return new Promise(resolve=>{
      const img=new Image();let settled=false;
      const finish=value=>{
        if(settled)return;settled=true;clearTimeout(timer);img.onload=img.onerror=null;
        // A timed-out request must release the browser's page-load event too,
        // especially when a missing picture is requested while offline.
        if(!value)img.removeAttribute("src");
        resolve(value);
      };
      const timer=setTimeout(()=>finish(null),timeout);
      img.alt="Illustration à nommer en coréen";img.className="images-art";img.width=512;img.height=512;img.draggable=false;
      const bad=()=>{
        if(settled)return;
        if(root.caches)caches.open("sori-image-store").then(c=>c.delete(a.src)).catch(()=>{});
        finish(null);
      };
      img.onerror=bad;
      img.onload=()=>img.decode().then(()=>finish(img.naturalWidth?img:null)).catch(bad);
      img.src=a.src;
    });
  }
  // A few decoded pictures, prepared while reading the question. Never preload
  // the catalogue or attach an answer-bearing image to the question's DOM.
  const prepared=new Map();
  function prepare(id){
    const a=asset(id);if(!a)return Promise.resolve(null);
    let entry=prepared.get(a.src);
    if(!entry || entry.failed || entry.img?.isConnected){
      entry={img:null,failed:false};
      entry.promise=load(a).then(img=>{entry.img=img;entry.failed=!img;return img;});
      prepared.delete(a.src);prepared.set(a.src,entry);
      while(prepared.size>4)prepared.delete(prepared.keys().next().value);
    }
    return entry.promise;
  }
  async function reveal(container,id,paint){
    const a=asset(id);
    const img=a ? await (prepared.get(a.src)?.promise || prepare(id)) : null;
    if(!container.isConnected)return;
    // One DOM transaction: no correction, notes or buttons before the decoded
    // picture is ready. Failed/slow loads finish as text, with no late insertion.
    if(img && !container.querySelector(".images-art")){
      styles();img.alt=a.alt;img.classList.add("images-support");container.prepend(img);
    }
    paint();
  }
  async function support(container,id){
    const a=asset(id);if(!a || container.querySelector(".images-art"))return;
    styles();const img=await load(a);
    if(img && container.isConnected && !container.querySelector(".images-art")){
      img.alt=a.alt;img.classList.add("images-support");container.prepend(img);
    }
  }
  async function render(container,opts){
    styles();
    const {item:it,entry:a}=opts;
    let phase=opts.phase||"input",done=false,composing=false,raw="";
    const waiting=el('<div class="card images-loading"><span role="status">Préparation de l’image…</span><button class="images-link">Utiliser le texte</button></div>');
    container.append(waiting);
    const active=()=>!done && waiting.isConnected;
    function fallback(){if(!active())return;done=true;waiting.remove();opts.onText();}
    waiting.querySelector("button").onclick=fallback;
    const img=await load(a);
    if(!active())return;
    if(!img && phase==="input"){fallback();return;}
    const card=el('<div class="card center images-card"><div class="images-prompt"></div><div class="images-body"></div></div>');
    waiting.replaceWith(card);
    if(img)card.querySelector(".images-prompt").append(img);
    const body=card.querySelector(".images-body");
    function setPhase(next){phase=next;opts.onPhase(phase);paint();}
    function grade(g){if(done || !card.isConnected)return;done=true;card.querySelectorAll("button").forEach(b=>b.disabled=true);opts.onGrade(g);}
    function neutral(){if(done || !card.isConnected)return;done=true;opts.onNeutral();}
    function button(label,fn,cls="btn ghost"){
      const b=el('<button class="'+cls+'">'+esc(label)+'</button>');b.onclick=fn;return b;
    }
    function paint(){
      body.innerHTML="";
      if(phase==="input"){
        body.innerHTML='<input class="images-input" aria-label="Réponse en coréen" lang="ko" enterkeyhint="done" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="한국어로…"><div class="images-actions"></div>';
        const input=body.querySelector("input"),actions=body.querySelector(".images-actions");
        // Keep the compact layout after blur: resizing on a button's pointerdown
        // moves that button away from the finger and cancels its click.
        input.addEventListener("focus",()=>card.classList.add("images-typing"));
        const check=()=>{if(composing || phase!=="input")return;raw=input.value;const verdict=judge(raw,a);if(verdict!=="empty")setPhase(verdict);};
        actions.append(button("Vérifier",check,"btn"),button("Je ne sais pas",()=>setPhase("forgot")));
        body.append(button("J’ai répondu à voix haute",()=>setPhase("oral"),"images-link"),
          button("Utiliser le texte",()=>{if(done)return;done=true;card.remove();opts.onText();},"images-link"));
        input.addEventListener("compositionstart",()=>{composing=true;});
        input.addEventListener("compositionend",()=>{composing=false;});
        input.addEventListener("keydown",e=>{if(e.key==="Enter" && !e.isComposing && e.keyCode!==229 && !composing){e.preventDefault();check();}});
        return;
      }
      card.classList.add("images-answered");
      if(img)img.alt=a.alt;
      const labels={correct:"Retrouvé sans aide",mismatch:"La réponse attendue",forgot:"À revoir",oral:"Évalue ton rappel à voix haute",typo:"Mot connu, faute de frappe",neutral:"Cette image permet une autre réponse"};
      const result=el('<div class="images-result" aria-live="polite"><div class="dim">'+esc(labels[phase]||labels.mismatch)+'</div>'+
        (raw && phase!=="correct"?'<div class="images-yours">Ta réponse : '+esc(raw)+'</div>':"")+
        '<button class="images-link kr" aria-label="Écouter la réponse">'+esc(it.kr)+'</button><div>'+esc(it.fr)+'</div></div>');
      result.querySelector("button").onclick=()=>opts.speak();body.append(result);
      opts.trivia(result);
      const row=el('<div class="row images-actions"></div>');body.append(row);
      if(["correct","oral","typo"].includes(phase))opts.grades(row,grade);
      else if(phase==="forgot")row.append(button("Encore",()=>grade(1),"btn ko"));
      else if(phase==="neutral"){
        // Resume an ungraded attempt saved before v178; new answers never enter
        // this phase. Preserve its outcome rather than inventing a failed grade.
        row.append(button("Continuer sans noter",neutral));
      } else {
        row.append(button("J’avais oublié",()=>grade(1),"btn ko"),button("Faute de frappe",()=>setPhase("typo")));
      }
    }
    paint();opts.onReady();
  }
  async function download(onProgress){
    const entries=Object.values(root.SORI_IMAGES_DATA?.items||{}).filter(usable);
    if(!root.caches)throw Error("Le stockage hors connexion n’est pas disponible.");
    if(entries.length>1280 || entries.reduce((n,a)=>n+(a.bytes||64*1024),0)>80*1024*1024)throw Error("La bibliothèque dépasse la limite de stockage hors connexion (80 Mo).");
    const cache=await caches.open("sori-image-store"),urls=new Set(entries.map(a=>new URL(a.src,document.baseURI).href));
    let ok=0,failed=0;
    for(const a of entries){
      try{
        const url=new URL(a.src,document.baseURI).href;
        const cached=await cache.match(url);
        const response=cached || await fetch(url,{signal:AbortSignal.timeout(10000)});
        if(!response.ok || !response.headers.get("content-type")?.includes("image/"))throw Error("image");
        try{
          const blob=await response.clone().blob();
          if(blob.size>64*1024)throw Error("size");
          const bitmap=await createImageBitmap(blob);bitmap.close();
        }catch(error){await cache.delete(url);throw error;}
        if(!cached)await cache.put(url,response);
        ok++;
      }catch(_){failed++;}
      onProgress({ok,failed,total:entries.length});
    }
    // Only prune obsolete versions once this catalogue is fully available offline.
    if(!failed)for(const req of await cache.keys())if(!urls.has(req.url))await cache.delete(req);
    return {ok,failed,total:entries.length};
  }
  const api={asset,load,prepare,reveal,support,render,download,pure:{normalize,usable,eligible,judge,resume}};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  root.SORI_IMAGES=api;
})(typeof window!=="undefined"?window:globalThis);

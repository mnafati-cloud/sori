#!/usr/bin/env node
// Review an entire batch at phone display sizes, using candidates or published files.
// This renders HTML; it does not modify image pixels or approve anything.
import fs from 'node:fs/promises';
import path from 'node:path';
import {dir,loadInventory,promptFor} from './pipeline.mjs';
const batchName=process.argv[2];
if(!/^[a-z0-9-]+$/.test(batchName||''))throw Error('Usage: node tools/images/review.mjs <batch-id>');
const batch=JSON.parse(await fs.readFile(path.join(dir,'batches',batchName+'.json'),'utf8'));
const inventory=await loadInventory(), cards=[];
const outDir=path.join(dir,'candidates');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
for(const selected of batch.items){
  const it=inventory.items.find(x=>x.id===selected.id);let file,status=it.status;
  if(it.status==='approved')file=path.resolve(dir,'../../docs/images',it.asset);
  else try{
    const record=JSON.parse(await fs.readFile(path.join(outDir,'batch-'+batchName,it.id+'.json'),'utf8'));
    const candidate=path.resolve(dir,'../..',record.candidate);
    const meta=JSON.parse(await fs.readFile(path.join(candidate,'generation.json'),'utf8'));
    file=path.join(candidate,'image.webp');status=meta.prompt===await promptFor(it)?'à examiner':'recette modifiée : à reprendre';
  }catch(_){status='en attente de génération';}
  const src=file?path.relative(outDir,file).split(path.sep).join('/'):null;
  cards.push('<article><div class="art">'+(src?'<img src="'+esc(src)+'" alt="'+esc(it.sense)+'">':'<span>Pas encore d’image</span>')+'</div><b>'+esc(it.kr)+'</b> · '+esc(it.sense)+'<small>'+esc(selected.cefr)+' · '+esc(it.usage)+' · '+esc(status)+'</small><code>'+esc(it.id)+'</code></article>');
}
const html='<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Revue '+esc(batchName)+'</title><style>body{margin:24px;background:#10141b;color:#ede9e0;font:16px system-ui}header{position:sticky;top:0;background:#10141b;padding:12px;z-index:1}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px}article{background:#171c25;border-radius:12px;padding:12px;text-align:center;overflow-wrap:anywhere}.art{min-height:var(--size);display:flex;justify-content:center;align-items:center}img{width:var(--size);max-width:100%;height:auto}small,code{display:block;color:#b1ada4;margin-top:6px}button{padding:10px;margin:6px}</style><header><h1>'+esc(batchName)+' · '+batch.items.length+' sujets</h1><p>Revue visuelle et sémantique ; les légendes ne sont pas dans les images.</p><button data-size="96">96 px</button><button data-size="160">160 px</button><button data-size="512">512 px</button></header><main>'+cards.join('\n')+'</main><script>document.documentElement.style.setProperty("--size","160px");document.querySelectorAll("button").forEach(b=>b.onclick=()=>document.documentElement.style.setProperty("--size",b.dataset.size+"px"));</script>';
await fs.mkdir(outDir,{recursive:true});
const out=path.join(outDir,'review-'+batchName+'.html');await fs.writeFile(out,html);console.log(out);

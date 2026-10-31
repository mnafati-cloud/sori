import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const I=require('../docs/images.js').pure,D=require('../docs/images-data.js'),B=require('../docs/backup.js');
const a=D.items['pack-c3c6d557'];
test('a timed-out image releases its pending browser request',async()=>{
  let image;
  const context={window:{},setTimeout,clearTimeout,Image:class{
    constructor(){image=this;}
    removeAttribute(name){assert.equal(name,'src');this.src=null;}
  }};
  vm.runInNewContext(fs.readFileSync(new URL('../docs/images.js',import.meta.url),'utf8'),context);
  assert.equal(await context.window.SORI_IMAGES.load(a,10),null);
  assert.equal(image.src,null,'stop loading after the deadline, rather than leaving a pending image');
  assert.equal(image.onload,null);assert.equal(image.onerror,null);
});
test('offline images above the former file and byte limits reach the resumable downloader',async()=>{
  const items=Object.fromEntries(Array.from({length:1300},(_,i)=>[String(i),{
    src:'./images/scene-'+i+'-012345abcdef.webp',usage:'support',alt:'Scene',bytes:64*1024
  }]));
  let request;
  const result={saved:1300},onProgress=()=>{};
  const context={window:{SORI_IMAGES_DATA:{items},SORI_OFFLINE:{download:async options=>{request=options;return result;}}}};
  vm.runInNewContext(fs.readFileSync(new URL('../docs/images.js',import.meta.url),'utf8'),context);
  assert.equal(await context.window.SORI_IMAGES.download(onProgress),result);
  assert.equal(request.kind,'images');assert.equal(request.entries.length,1300);
  assert.equal(request.onProgress,onProgress);
  assert.ok(request.entries.reduce((sum,a)=>sum+a.bytes,0)>80*1024*1024);
});
const it={id:'pack-c3c6d557',kr:'우산',type:'word',stage:3,ok:1,ko:0};
for(const batchId of ['actions-2026-10-25','actions-2026-10-26','actions-2026-10-26-02','situations-2026-10-26','quotidien-2026-10-26','vie-active-2026-10-26','gestes-et-lieux-2026-10-27','vie-pratique-2026-10-31','gestes-et-activites-2026-10-31'])test(batchId+': scenes keep sense-specific reviewed assets out of graded image questions',()=>{
  const batch=JSON.parse(fs.readFileSync(new URL('../tools/images/batches/'+batchId+'.json',import.meta.url)));
  const inventory=JSON.parse(fs.readFileSync(new URL('../tools/images/inventory.json',import.meta.url)));
  const ctx={window:{}};
  for(const file of ['data','extra'])vm.runInNewContext(fs.readFileSync(new URL('../docs/'+file+'.js',import.meta.url),'utf8'),ctx);
  const count=['situations-2026-10-26','quotidien-2026-10-26','vie-active-2026-10-26','gestes-et-lieux-2026-10-27','vie-pratique-2026-10-31','gestes-et-activites-2026-10-31'].includes(batchId)?200:100;
  const levels=['vie-active-2026-10-26','gestes-et-lieux-2026-10-27','vie-pratique-2026-10-31','gestes-et-activites-2026-10-31'].includes(batchId)?['B1','B2']:['A1','A2'];
  assert.equal(batch.requested,count);assert.equal(batch.items.length,count);assert.equal(new Set(batch.items.map(x=>x.id)).size,count);
  const hashes=new Set();
  for(const item of batch.items){
    const seed=ctx.window.SEED.items.find(x=>x.id===item.id),entry=inventory.items.find(x=>x.id===item.id),asset=D.items[item.id];
    assert.equal(seed.kr,item.kr);assert.equal(seed.fr,item.sense);
    assert.equal(ctx.window.EXTRA[item.id].cefr,item.cefr);assert.ok(levels.includes(item.cefr));
    assert.equal(entry.batch,batch.id);assert.equal(entry.status,'approved');assert.equal(item.status,'approved');
    assert.equal(entry.styleProfile,'pinceau-scenes-v1');assert.equal(asset.usage,'support');
    assert.equal(asset.src,'./images/'+entry.asset);assert.equal(asset.alt,item.sense);assert.ok(asset.bytes<=64*1024);
    assert.deepEqual(asset.accepted,[]);
    for(const reverse of [false,true])assert.equal(I.eligible({...seed,stage:5,ok:1,ko:0,rev:reverse},reverse,asset),false);
    const review=batch.displaySizeReviews.find(x=>x.id===item.id);
    assert.deepEqual(review.sizes,[512,160,96]);assert.equal(review.sha256,entry.sha256);assert.ok(review.note);
    hashes.add(entry.sha256);
  }
  assert.equal(hashes.size,count,'each sense has its own generated picture');
  assert.ok(inventory.items.filter(x=>x.batch!==batch.id).every(x=>!hashes.has(x.sha256)),'existing pictures are not reused');
  if(batchId==='actions-2026-10-25'){
    const homonyms=batch.items.filter(x=>x.kr==='쓰다');
    assert.equal(homonyms.length,2,'writing and wearing a hat remain distinct cards');
    assert.notEqual(D.items[homonyms[0].id].src,D.items[homonyms[1].id].src);
  }
});
test('all 54 approved mini-scenes have distinct support assets and recorded reviews',()=>{
  const batch=JSON.parse(fs.readFileSync(new URL('../tools/images/batches/scenes-2026-10-19.json',import.meta.url)));
  const inventory=JSON.parse(fs.readFileSync(new URL('../tools/images/inventory.json',import.meta.url)));
  const plan=JSON.parse(fs.readFileSync(new URL('../tools/images/batches/full-concrete-plan-2026-10-18.json',import.meta.url)));
  assert.equal(batch.items.length,54);assert.equal(new Set(batch.items.map(x=>x.id)).size,54);
  assert.equal(new Set(batch.items.map(x=>D.items[x.id]?.src)).size,54,'no shared picture between words');
  const ctx={window:{}};vm.runInNewContext(fs.readFileSync(new URL('../docs/data.js',import.meta.url),'utf8'),ctx);
  for(const item of batch.items){
    const seed=ctx.window.SEED.items.find(x=>x.id===item.id),entry=inventory.items.find(x=>x.id===item.id),asset=D.items[item.id];
    assert.equal(seed.kr,item.kr);assert.equal(seed.fr,item.sense);assert.equal(entry.status,'approved');
    assert.equal(entry.styleProfile,'pinceau-scenes-v1');assert.equal(asset.usage,'support');
    assert.equal(asset.src,'./images/'+entry.asset);assert.equal(asset.alt,item.sense);assert.ok(asset.bytes<=64*1024);
    assert.deepEqual(asset.accepted,[]);assert.equal(I.eligible({...seed,stage:5,ok:1,ko:0},false,asset),false);
    const review=batch.displaySizeReviews.find(x=>x.id===item.id);
    assert.deepEqual(review.sizes,[512,160,96]);assert.equal(review.sha256,entry.sha256);assert.ok(review.note);
    assert.equal(plan.items.find(x=>x.id===item.id).status,'approved');
  }
  assert.equal(plan.counts['deferred-style-incompatible']||0,0,'every deferred scene is resolved');
});
const imageBatches=[['a-2026-10-17',100,['A1','A2']],['a-2026-10-17-02',100,['A1','A2']],['a-2026-10-18',200,['A1','A2']],['objects-2026-10-18',200,['A1','A2','B1']]];
for(const [name,count,levels] of imageBatches)test(name+' contains '+count+' distinct new '+levels.join('/')+' senses from the catalogue',()=>{
  const batch=JSON.parse(fs.readFileSync(new URL('../tools/images/batches/'+name+'.json',import.meta.url)));
  const inventory=JSON.parse(fs.readFileSync(new URL('../tools/images/inventory.json',import.meta.url)));
  const ctx={window:{}};
  for(const file of ['data','extra'])vm.runInNewContext(fs.readFileSync(new URL('../docs/'+file+'.js',import.meta.url),'utf8'),ctx);
  assert.equal(batch.items.length,count);assert.equal(new Set(batch.items.map(x=>x.id)).size,count);
  for(const b of batch.items){
    const seed=ctx.window.SEED.items.find(x=>x.id===b.id),entry=inventory.items.find(x=>x.id===b.id);
    assert.equal(seed.kr,b.kr);assert.equal(seed.fr,b.sense);assert.equal(ctx.window.EXTRA[b.id].cefr,b.cefr);
    assert.ok(levels.includes(b.cefr));assert.equal(entry.batch,batch.id);
    assert.equal(entry.status,'approved');assert.equal(entry.usage,b.usage);
    assert.equal(D.items[b.id]?.src,'./images/'+entry.asset,'each selected image is published');
  }
  if(name==='a-2026-10-17'){
    assert.equal(batch.items.find(x=>x.kr==='배').id,'1780695436442','pear, not belly');
    assert.equal(batch.items.find(x=>x.kr==='말').id,'1780695436429','horse, not speech');
    assert.equal(batch.items.find(x=>x.kr==='이').id,'1780695436493','tooth, not the number two');
  }else if(name==='a-2026-10-17-02'){
    assert.equal(batch.items.find(x=>x.kr==='팔').id,'1780695436486','arm, not the number eight');
  }
  for(const [other] of imageBatches.filter(([other])=>other!==name)){
    const previous=JSON.parse(fs.readFileSync(new URL('../tools/images/batches/'+other+'.json',import.meta.url)));
    const previousIds=new Set(previous.items.map(x=>x.id));
    assert.ok(batch.items.every(x=>!previousIds.has(x.id)),'each batch adds new cards');
  }
});
test('image questions: only reviewed assets, production slots, every other production',()=>{
  assert.deepEqual(Array.from({length:8},(_,ok)=>I.eligible({...it,ok},false,a)),[false,true,false,false,false,true,false,false]);
  assert.deepEqual(Array.from({length:4},(_,ok)=>I.eligible({...it,rev:true,ok},true,a)),[true,false,true,false]);
  for(const entry of [null,{}, {...a,usage:'support'},{...a,src:'https://example.com/a.webp'},{...a,accepted:['다른 단어']}])assert.equal(I.eligible(it,false,entry),false);
  assert.equal(I.eligible(it,true,a),false,'comprehension recto is never replaced');
  assert.equal(I.eligible({...it,stage:2},false,a),false);
  assert.equal(I.eligible({...it,type:'phrase'},false,a),false);
});
test('배 homonyms resolve by card id to separate reviewed support images',()=>{
  const images=require('../docs/images.js'),ctx={window:{}};
  vm.runInNewContext(fs.readFileSync(new URL('../docs/data.js',import.meta.url),'utf8'),ctx);
  const entries=[['1779706066098','Ventre'],['1780695436442','Poire (fruit)']];
  for(const [id,sense] of entries){
    const seed=ctx.window.SEED.items.find(x=>x.id===id),entry=D.items[id];
    assert.equal(seed.kr,'배');assert.equal(seed.fr,sense);
    assert.ok(entry,'a reviewed illustration exists for '+sense);
    assert.equal(images.asset(id),entry,'lookup uses the immutable card id');
    assert.equal(entry.alt,sense);assert.equal(entry.usage,'support');
    assert.match(entry.src,new RegExp('^\\./images/'+id+'-[a-f0-9]{12}\\.webp$'));
    assert.deepEqual(entry.accepted,[],'a support image never asks an ambiguous word');
    assert.equal(I.eligible({...seed,stage:5,ok:1,ko:0},false,entry),false);
  }
  assert.notEqual(D.items[entries[0][0]].src,D.items[entries[1][0]].src,'belly never reuses the pear asset');
  assert.equal(images.asset('배'),null,'Korean spelling alone cannot select an image');
});
test('image answers: exact/NFC accepted, every other answer gets the ordinary correction',()=>{
  assert.equal(I.judge('  우산.  ',a),'correct');
  assert.equal(I.judge('우산'.normalize('NFD'),a),'correct');
  assert.equal(I.judge('양산',a),'mismatch','review alternatives do not open a separate ambiguity flow');
  assert.equal(I.judge('우선',a),'mismatch');
  assert.equal(I.judge('<script>',a),'mismatch');
  assert.equal(I.judge(' ',a),'empty');
});
test('attempt belongs to one occurrence; first result survives reload, stale attempts do not',()=>{
  const attempt={id:it.id,n:1,p:3,d:'2026-10-17',phase:'forgot',asset:a.src};
  assert.deepEqual(I.resume(JSON.parse(JSON.stringify(attempt)),it,3,'2026-10-17'),attempt);
  for(const changed of [{id:'other'},{n:2},{p:4},{d:'2026-10-15'},{phase:'invalid'}])assert.equal(I.resume({...attempt,...changed},it,3,'2026-10-17'),null);
});
test('compact backups preserve image modality and bounded attempt without embedding catalogue',()=>{
  const e={app:'sori',v:1,state:{items:{[it.id]:{ok:2,ko:0}},imageReview:{id:it.id,p:1,n:1,d:'2026-10-17',phase:'correct',asset:a.src},
    rlog:[['2026-10-17',it.id,2,4,'image',15,800]],log:{'2026-10-17':{imageTypo:1,imageNeutral:2}}}};
  assert.deepEqual(B.unpack(B.pack(e)),e);
});
test('offline FSRS fit reconstructs all four image grades without treating Hard as Good',()=>{
  const result=spawnSync('python',['-c',"import sys;sys.path.insert(0,'tools');import fsrs_fit as f;assert [f.reconstruct_gradeD(g,'image') for g in [1,2,3,4]] == [1,2,3,4]"],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});

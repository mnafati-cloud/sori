import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
const require=createRequire(import.meta.url);
const I=require('../docs/images.js').pure,D=require('../docs/images-data.js'),B=require('../docs/backup.js');
const a=D.items['pack-c3c6d557'];
const it={id:'pack-c3c6d557',kr:'우산',type:'word',stage:3,ok:1,ko:0};
test('image questions: only reviewed assets, production slots, every other production',()=>{
  assert.deepEqual(Array.from({length:8},(_,ok)=>I.eligible({...it,ok},false,a)),[false,true,false,false,false,true,false,false]);
  assert.deepEqual(Array.from({length:4},(_,ok)=>I.eligible({...it,rev:true,ok},true,a)),[true,false,true,false]);
  for(const entry of [null,{}, {...a,usage:'support'},{...a,src:'https://example.com/a.webp'},{...a,accepted:['다른 단어']}])assert.equal(I.eligible(it,false,entry),false);
  assert.equal(I.eligible(it,true,a),false,'comprehension recto is never replaced');
  assert.equal(I.eligible({...it,stage:2},false,a),false);
  assert.equal(I.eligible({...it,type:'phrase'},false,a),false);
  assert.equal(D.items['1779706066098'],undefined,'배 belly is never matched to pear by Korean spelling');
});
test('image answers: exact/NFC accepted, plausible alternative neutral, no fuzzy semantic credit',()=>{
  assert.equal(I.judge('  우산.  ',a),'correct');
  assert.equal(I.judge('우산'.normalize('NFD'),a),'correct');
  assert.equal(I.judge('양산',a),'neutral');
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

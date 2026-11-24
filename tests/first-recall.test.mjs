import test from 'node:test';
import assert from 'node:assert/strict';
import trial from '../docs/first-recall.js';
import backup from '../docs/backup.js';
import report from '../tools/first_recall_report.cjs';

const day='2026-11-24';
const word={id:'mot',type:'word',stage:1};
const first={day,count:1,ok:false,result:{counted:false,elapsed:0},fsrs:true,bonus:false};

test('60 paires équilibrées, un groupe persistant par mot neuf éligible',()=>{
  const cards={};
  for(const patch of [{rev:true},{type:'phrase'},{stage:0},{stage:2},{ok:1},{itv:2},{S:0.5}]){
    trial.record(cards,{...word,...patch}, first);
  }
  for(const patch of [{bonus:true},{fsrs:false},{result:null},{result:{counted:true}}]){
    trial.record(cards,word,{...first,...patch});
  }
  assert.deepEqual(cards,{});
  for(let i=0;i<122;i++){
    trial.record(cards,{...word,id:String(i)},first,()=>i%4?0.9:0.1);
    if(i%2 && i<120) assert.equal(cards[i].group+cards[i-1].group,1);
  }
  assert.equal(Object.keys(cards).length,120);
  assert.equal(Object.values(cards).filter(c=>c.group).length,60);
});

test('retour le même jour, rappel différé, sauvegarde et charge à fenêtre égale',()=>{
  const cards={};
  trial.record(cards,word,first,()=>0);
  trial.record(cards,{...word,id:'témoin'},first);
  const next=(d,n,available=()=>true)=>trial.next(cards,d,n,available);
  assert.equal(next(day,24),undefined);
  trial.record(cards,word,{...first,count:20,result:null});
  assert.equal(next(day,25),undefined);
  assert.equal(next(day,32,()=>false),undefined);
  assert.equal(next('2026-11-25',32),undefined);
  assert.equal(next(day,32),'mot');
  cards.mot.extra='shown';
  assert.equal(next(day,40),undefined);
  const answer=(d,ok,e)=>trial.record(cards,word,{...first,day:d,ok,result:{counted:true,elapsed:e}});
  answer('2026-11-25',false,1);
  answer('2026-12-05',true,10);
  answer('2026-12-15',false,10);
  answer('2026-12-25',true,10);
  const state={log:{'2026-12-24':{}},items:{},rlog:[],firstRecall:cards};
  assert.equal(report.summarize(state)[1].mature,0);
  state.log['2026-12-25']={};
  const roundtrip=backup.unpack(backup.pack({app:'sori',v:1,state})).state;
  const [control,reinforced]=report.summarize(roundtrip);
  assert.equal(control.first.missing,1);
  assert.deepEqual(reinforced,{group:1,meanFirstDay:1,enrolled:1,shown:1,skipped:0,mature:1,
    first:{success:0,observed:1,missing:0},long:{success:1,observed:1,missing:0},ordinary:5,extra:1});
});

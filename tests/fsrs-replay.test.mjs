import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import E from '../docs/engine.js';

test('rejeu Python contre chaque état JS : première réponse tardive, faute de saisie, gel et rescousse',()=>{
  const weights=E.FSRS.W_PERSONAL, rows=[], expected=[];
  let it={stage:1,itv:0,ok:0,ko:0,due:'2026-11-01',sk:0};
  // Plusieurs rechutes puis plusieurs retours quotidiens dans la zone du plancher.
  let day='2026-11-04', jumps=0, observed=0, successes=0;
  for(const [gap,g,raw] of [[0,1,1],[0,3,3],[1,1,1],[0,2,3],[1,2,1],[1,2,3],
      [1,2,3],[1,2,3],[1,3,3],[1,3,3],[2,2,1],[1,1,1],[1,3,3]]){
    day=E.addDays(day,gap);
    const sk=it.itv<=1 ? it.sk : 0;
    const r=E.fsrsSchedule(it,g,day,{gradeD:raw,w:weights,streak:sk,fuzz:'mot|'+day});
    if(r.counted){
      observed++; successes+=Number(raw>=2);
      if(sk>=2 && r.S===E.rescueS(0,sk+1)) jumps++;
    }
    rows.push([day,'mot',g,r.elapsed,raw===1 && g===2?'type':'rec4',10,600,raw,r.counted?sk:-1]);
    expected.push([r.S,r.D]);
    it={stage:r.stage,S:r.S,D:r.D,itv:r.i,due:r.d,ok:it.ok+Number(raw>=2),ko:it.ko+Number(raw===1),
      sk:raw===1?0:r.counted?sk+1:it.sk};
  }
  assert.ok(jumps>0);
  const script=`
import sys,json,tempfile,os
sys.path.insert(0,'tools')
import fsrs_fit as f
p=json.load(sys.stdin)
rows=p['rows']
old=[['2026-08-01','old',2,1,'type'],['2026-08-03','old',2,1,'type'],['2026-11-04','old',2,1,'image']]
with tempfile.NamedTemporaryFile(mode='w',encoding='utf8') as h:
    json.dump({'app':'sori','v':1,'state':{'vlog':[['2026-07-30','v143'],['2026-08-03','v144']],
       'rlog':rows+old}},h); h.flush()
    seq,ease,_=f.extract_sequences(h.name)
assert [r[1] for r in seq.pop('old')] == [2,1,2]
assert f.reconstruct_gradeD(2,None,144) == 2
_,*arrays=f.build_padded(seq,ease)
trace=[]
_,n,_,actual=f.replay_loss(p['weights'],*arrays,want_calib=True,trace=trace)
print(json.dumps({'n':n,'actual':actual,'states':[[s[0],d[0]] for s,d in trace]}))
`;
  const run=spawnSync('python',['-c',script],{encoding:'utf8',input:JSON.stringify({rows,weights})});
  assert.equal(run.status,0,run.stderr);
  const result=JSON.parse(run.stdout);
  assert.equal(result.n,observed);
  assert.equal(result.actual,successes/observed);
  assert.equal(result.states.length,expected.length);
  result.states.forEach(([s,d],i)=>{
    assert.ok(Math.abs(s-expected[i][0])<.006,`S à la réponse ${i}: ${s} / ${expected[i][0]}`);
    assert.ok(Math.abs(d-expected[i][1])<.006,`D à la réponse ${i}: ${d} / ${expected[i][1]}`);
  });
});

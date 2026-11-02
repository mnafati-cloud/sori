import {test} from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const require=createRequire(import.meta.url);
const P=require("../docs/production.js").pure, D=require("../docs/production-data.js"), B=require("../docs/backup.js");
const day="2026-10-11", all=new Set(D.items.flatMap(x=>x.needs));
const roundtrip=x=>JSON.parse(JSON.stringify(x));
const active=id=>{const s=P.state(null,day);s.active={id:1,item:id,day,phase:"input",tries:0,first:null};s.seq=1;s.day={d:day,n:1,done:[D.items.find(x=>x.id===id).goal],since:0};return s;};

test("corpus complet : ids uniques, vocabulaire réel, exemples et variantes sans contradiction",()=>{
  const ctx={window:{}};vm.runInNewContext(readFileSync(new URL("../docs/data.js",import.meta.url),"utf8"),ctx);
  const words=new Set(ctx.window.SEED.items.filter(x=>x.type==="word").map(x=>x.kr));
  assert.equal(D.goals.length,10);assert.equal(D.items.length,50);
  assert.equal(new Set(D.items.map(x=>x.id)).size,50);
  for(const goal of D.goals) assert.equal(D.items.filter(x=>x.goal===goal.id).length,5);
  for(const item of D.items){
    for(const w of item.needs) assert.ok(words.has(w),`${item.id}: ${w}`);
    assert.equal(P.grade(item.id,item.answer).status,"correct",item.id+": exemple");
    for(const rule of item.accept) for(const phrase of P.expand(rule.parts))
      assert.equal(P.grade(item.id,phrase).status,"correct",phrase);
    for(const rule of item.wrong) for(const phrase of P.expand(rule.parts))
      assert.equal(P.grade(item.id,phrase).status,"incorrect",phrase);
  }
});
test("portée et sens : phrases indépendantes du générateur du corpus",()=>{
  const cases=[
    ["restriction-home","저는 집에서만 일합니다.","correct"],
    ["restriction-home","집에서밖에 일하지 않아요","correct"],
    ["restriction-home","집에서 일만 해요","incorrect"],
    ["restriction-home","집에서도 일해요","unverified"],
    ["addition-friend","책을 친구한테도 줘요","correct"],
    ["addition-friend","친구에게 책도 줘요","incorrect"],
    ["place-library","책을 도서관에서 읽어요","correct"],
    ["place-library","도서관에 책을 읽어요","incorrect"],
    ["contrast-bag","가방이 비싼데 가벼워요","correct"],
    ["contrast-bag","가방은 비싸서 가벼워요","incorrect"],
    ["contrast-bag","가방은 비싸요. 하지만 가벼워요.","correct"],
    ["condition-rain","비가 오면 집에 있어요","correct"],
    ["condition-rain","비가 와서 집에 있어요","incorrect"],
    ["purpose-bread","빵 사러 가게에 가요","correct"],
    ["simultaneous-study","음악을 듣고 나서 공부해요","incorrect"],
    ["simultaneous-sing","걸으면서 노래를 불러요","correct"],
    ["modifier-book","제가 읽는 책은 재미있어요","correct"],
    ["modifier-book","제가 읽어요 책은 재미있어요","incorrect"],
    ["modifier-book","내가 읽고 있는 책은 재미있어요","correct"],
    ["restriction-home","집에서만 놀아요","unverified"],
    ["restriction-home","집 에서만 일해요","unverified"],
    ["restriction-home","집에서만 일해요?","unverified"],
    ["restriction-home","","empty"],
    ["restriction-home"," \n\t ","empty"]
  ];
  for(const [id,text,status] of cases) assert.equal(P.grade(id,text).status,status,text);
  assert.equal(P.grade("restriction-home","  집에서만\n 일해요! ".normalize("NFD")).status,"correct");
  assert.equal(P.grade("missing","가요").status,"unverified");
});
test("variantes courantes : verbes décomposés, déplacement, ordre et simultanéité",()=>{
  const accepted=[
    ["range-week","월요일부터 금요일까지 일을 해요"],
    ["range-day","저는 아침부터 저녁까지 공부를 합니다"],
    ["range-school","집에서 학교까지 걸어가요"],
    ["range-station","학교부터 역까지 걸어갑니다"],
    ["range-week","월요일부터 금요일까지 저는 일해요"],
    ["range-school","학교까지 집에서 걸어가요"],
    ["place-home","집에서 공부를 해요"],
    ["addition-home","집에서도 일을 해요"],
    ["addition-home","집에서도 일을 하고 있어요"],
    ["place-home","집에서 공부를 하고 있어요"],
    ["restriction-school","학교에서만 공부를 해요"],
    ["condition-time","시간 있으면 책을 읽어요"],
    ["condition-hunger","배고프면 밥을 먹어요"],
    ["purpose-study","도서관에 공부를 하려고 가요"],
    ["purpose-bread","가게로 빵을 사러 가요"],
    ["simultaneous-study","공부하면서 음악을 들어요"],
    ["simultaneous-coffee","책을 읽으면서 커피를 마셔요"],
    ["simultaneous-sing","걸으면서 노래해요"],
    ["modifier-reader","책을 읽고 있는 사람은 제 친구예요"],
    ["modifier-book","읽는 책이 재미있어요"],
    ["modifier-friend","한국어를 배우는 친구가 여기에 있어요"]
  ];
  for(const [id,text] of accepted) assert.equal(P.grade(id,text).status,"correct",text);
  for(const [id,text] of [
    ["range-week","월요일까지 금요일부터 일을 해요"],
    ["range-school","집까지 학교에서 걸어가요"],
    ["simultaneous-study","공부하고 나서 음악을 들어요"],
    ["modifier-reader","책을 읽었어요 사람은 제 친구예요"],
    ["restriction-school","학교에서 공부만 해요"],
    ["range-week","월요일부터 금요일까지 일을 안 해요"]
  ]) assert.notEqual(P.grade(id,text).status,"correct",text);
});
test("journal : distinguer les actions sans garder les réponses ni reclasser le passé",()=>{
  const cases=[
    [s=>P.skip(s,day),"unverified","skipped"],
    [s=>P.submit(s,day,"une réponse personnelle"),"unverified","unrecognized"],
    [s=>P.reveal(s,day),"incorrect","revealed"],
    [s=>P.submit(s,day,"집에서 공부를 해요"),"correct","recognized"],
    [s=>P.submit(P.submit(s,day,"집에 공부해요"),day,"집에 공부해요"),"incorrect","attempts-exhausted"],
    [s=>P.submit(P.submit(s,day,"집에 공부해요"),day,"집에서 공부해요"),"incorrect","recognized"]
  ];
  const historical={id:0,d:"2026-10-10",item:"place-home",outcome:"unverified"};
  for(const [act,outcome,reason] of cases){
    const before=active("place-home");before.recent=[historical];
    const s=roundtrip(act(before));
    assert.equal(s.active.reason,reason);assert.equal(s.recent.at(-1).reason,reason);
    assert.equal(s.recent.at(-1).outcome,outcome);assert.deepEqual(s.recent[0],historical);
    assert.ok(!JSON.stringify(s).includes("personnelle"));
    assert.deepEqual(B.unpack(roundtrip(B.pack({app:"sori",v:1,state:{production:s,items:{},rlog:[]}}))).state.production,s);
  }
});
test("essai sans note : courte pause sans modifier la maîtrise ni bloquer les autres objectifs",()=>{
  for(const finish of [s=>P.skip(s,day),s=>P.submit(s,day,"autre formulation")]){
    const s=finish(active("place-home"));
    assert.equal(s.skills.place.offerAfter,"2026-10-13");
    assert.equal(s.skills.place.ok,0);assert.equal(s.skills.place.ko,0);assert.equal(s.skills.place.step,0);
    assert.equal(s.skills.place.due,undefined);
    assert.ok(!P.candidates(s,"2026-10-12",all).some(x=>x.goal==="place"));
    assert.ok(P.candidates(s,"2026-10-12",all).some(x=>x.goal==="recipient"));
    assert.ok(P.candidates(s,"2026-10-13",all).some(x=>x.goal==="place"));
    const resumed=P.begin(P.advance(s,day),"2026-10-13",new Set(["집","공부하다"]));
    const passed=P.submit(resumed,"2026-10-13","집에서 공부해요");
    assert.equal(passed.skills.place.offerAfter,undefined);assert.equal(passed.skills.place.ok,1);
  }
});
test("éligibilité : aucun vocabulaire inconnu et aucune carte fictive",()=>{
  assert.equal(P.remaining(null,day,new Set()),0);
  assert.equal(P.begin(null,day,new Set()).active,undefined);
  assert.deepEqual(P.eligible(new Set(["집","공부하다"])).map(x=>x.id),["place-home"]);
  assert.equal(P.remaining(null,day,all),4);
  assert.equal(P.state({v:2,keep:true},day),null);
  assert.equal(P.begin({v:1,skills:{place:7}},day,all),null,"état malformé désactivé sans être réécrit");
});
test("premier essai sauvegardé, correction puis recharge : un seul échec, aucun faux succès",()=>{
  let s=active("restriction-home");
  const original=roundtrip(s);
  s=P.submit(s,day,"집에서 일만 해요");assert.equal(s.active.phase,"retry");
  assert.deepEqual(original,active("restriction-home"),"transition sans mutation de l’entrée");
  s=roundtrip(s);s=P.submit(s,day,"집에서만 일해요");
  assert.equal(s.skills.restriction.ok,0);assert.equal(s.skills.restriction.ko,1);
  assert.equal(s.active.outcome,"incorrect");assert.equal(s.active.result,"correct");
  assert.deepEqual(P.submit(s,day,"집에서만 일해요"),s,"double validation ignorée");
  assert.deepEqual(P.reveal(s,day),s);
});
test("réponse inconnue : solution immédiate sans note, texte jamais persisté",()=>{
  const s=P.submit(active("restriction-home"),day,"Cette formulation doit rester privée");
  assert.equal(s.active.phase,"done");assert.equal(s.active.result,"unverified");
  assert.equal(s.active.first,"unverified");assert.ok(!JSON.stringify(s).includes("privée"));
  assert.deepEqual(P.submit(roundtrip(s),day,"집에서만 일해요"),s,"aucun succès après avoir vu la solution");
  assert.deepEqual(P.begin(roundtrip(s),day,all),s,"recharge sans double comptage");
  assert.equal(s.skills.restriction.ok,0);assert.equal(s.skills.restriction.ko,0);
  assert.equal(s.skills.restriction.due,undefined);
  assert.equal(P.reveal(P.submit(active("place-home"),day,"모르겠습니다"),day).active.outcome,"unverified");
  assert.equal(P.skip(active("place-home"),day).active.outcome,"unverified");
});
test("ancienne tentative non reconnue : solution à la reprise et premier verdict conservé",()=>{
  for(const first of ["unverified","incorrect"]){
    const old=active("restriction-home");
    Object.assign(old.active,{phase:"unverified",first,tries:1});
    const s=P.begin(roundtrip(old),day,all);
    assert.equal(s.active.phase,"done");assert.equal(s.active.result,"unverified");
    assert.equal(s.active.first,first);assert.equal(s.skills.restriction.ok,0);
    assert.equal(s.skills.restriction.ko,first==="incorrect"?1:0);
    assert.deepEqual(P.begin(roundtrip(s),day,all),s);
    assert.equal(old.active.phase,"unverified","entrée non mutée");
  }
});
test("formulation inconnue après erreur : solution immédiate sans changer le premier verdict",()=>{
  const retry=P.submit(active("restriction-home"),day,"집에서 일만 해요");
  const s=P.submit(retry,day,"저는 집에서만 프로젝트를 진행해요");
  assert.equal(s.active.phase,"done");assert.equal(s.active.result,"unverified");
  assert.equal(s.skills.restriction.ko,1);assert.equal(s.skills.restriction.ok,0);
});
test("abandon, révélation, annulation : pas de contournement du premier essai",()=>{
  let s=P.reveal(active("restriction-home"),day);
  assert.equal(s.skills.restriction.ko,1);
  s=P.undo(roundtrip(s),day);assert.equal(s.skills.restriction,undefined);
  assert.equal(s.active.cancelled,true);assert.equal(s.day.n,1);
  assert.deepEqual(P.undo(s,day),s);
  s=P.advance(s,day);assert.equal(s.active,null);
  assert.ok(!P.candidates(s,day,all).some(x=>x.goal==="restriction"));
  let failure=P.submit(active("place-home"),day,"집에 공부해요");
  failure=P.submit(roundtrip(failure),day,"집에 공부해요");
  assert.equal(failure.active.phase,"done");assert.equal(failure.skills.place.ko,1);
});
test("répétition espacée, contextes variés, limite journalière et entrelacement",()=>{
  let s=P.begin(null,day,all);
  assert.equal(s.active.item,"place-home");
  s=P.submit(s,day,"집에서 공부해요");assert.equal(s.skills.place.due,"2026-10-12");
  s=P.advance(s,day);assert.equal(P.begin(s,day,all).active,null);
  for(let i=0;i<8;i++) s=P.tick(s,day);
  s=P.begin(s,day,all);assert.equal(s.active.item,"recipient-friend");
  for(let i=0;i<3;i++){
    s=P.advance(P.reveal(s,day),day);s=P.begin(s,day,all,{end:true});
  }
  assert.equal(s.day.n,4);assert.equal(s.active,null);assert.equal(P.remaining(s,day,all),0);
  const tomorrow="2026-10-12", next=P.begin(roundtrip(s),tomorrow,all);
  assert.equal(next.active.item,"range-school","nouveaux objectifs avant les reprises");
  const placeOnly=new Set(["집","공부하다","학교","일하다"]);
  assert.equal(P.candidates(s,tomorrow,placeOnly)[0].id,"place-school","autre contexte à la reprise");
});
test("passage de minuit : tentative et premier verdict conservés",()=>{
  let s=P.submit(active("place-home"),day,"집에 공부해요");
  s=P.begin(roundtrip(s),"2026-10-12",all);
  assert.equal(s.active.first,"incorrect");
  s=P.submit(s,"2026-10-12","집에서 공부해요");
  assert.equal(s.skills.place.ko,1);assert.equal(s.day.n,1);assert.equal(s.day.done[0],"place");
});
test("équivalent accepté : crédit de la forme réellement produite seulement",()=>{
  const s=P.submit(active("restriction-home"),day,"집에서밖에 일하지 않아요");
  assert.deepEqual(s.skills.restriction.forms,["밖에 + négation"]);
  assert.equal(s.skills.restriction.ok,1);
  assert.deepEqual(P.submit(active("recipient-friend"),day,"친구한테 책을 줘요").skills.recipient.forms,["한테"]);
  assert.deepEqual(P.submit(active("range-school"),day,"집부터 학교까지 걸어요").skills.range.forms,["부터…까지"]);
});
test("sauvegardes v1/v2 exactes, état borné après une année d’usage",()=>{
  let s=null;
  for(let d=1;d<=365;d++){
    const today=new Date(Date.UTC(2026,0,d)).toISOString().slice(0,10);
    for(let n=0;n<4;n++){
      s=P.begin(s,today,all,{end:true});if(!s.active) break;
      s=P.submit(s,today,D.items.find(x=>x.id===s.active.item).answer);s=P.advance(s,today);
    }
  }
  assert.ok(s.recent.length<=32);
  assert.ok(Buffer.byteLength(JSON.stringify(s))<10000,JSON.stringify(s).length);
  const payload={app:"sori",v:1,state:{v:1,production:s,items:{},rlog:[]}};
  assert.deepEqual(B.unpack(roundtrip(B.pack(payload))),payload);
  assert.deepEqual(B.unpack(roundtrip(payload)),payload);
});

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
    ["modifier-book","내가 읽고 있는 책은 재미있어요","unverified"],
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
test("réponse inconnue : correction et exemple sans note, texte jamais persisté",()=>{
  let s=P.submit(active("restriction-home"),day,"Cette formulation doit rester privée");
  assert.equal(s.active.phase,"unverified");assert.ok(!JSON.stringify(s).includes("privée"));
  s=P.submit(roundtrip(s),day,"집에서만 일해요");
  assert.equal(s.skills.restriction.ok,0);assert.equal(s.skills.restriction.ko,0);
  assert.equal(s.skills.restriction.due,undefined);
  assert.equal(P.reveal(P.submit(active("place-home"),day,"모르겠습니다"),day).active.outcome,"unverified");
  assert.equal(P.skip(active("place-home"),day).active.outcome,"unverified");
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

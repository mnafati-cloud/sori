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
  const words=new Map(ctx.window.SEED.items.filter(x=>x.type==="word").map(x=>[x.id,x]));
  assert.equal(D.goals.length,10);assert.equal(D.items.length,200);
  assert.equal(new Set(D.items.map(x=>x.id)).size,200);
  assert.equal(new Set(D.items.map(x=>x.prompt)).size,200,"pas de doublon de consigne");
  for(const goal of D.goals) assert.equal(D.items.filter(x=>x.goal===goal.id).length,20);
  for(const item of D.items){
    assert.ok(item.id.startsWith(item.goal+"-"),"préfixe durable utilisé par l’historique compact");
    for(const w of item.needs){
      assert.ok(D.vocabulary[w]?.length,`${item.id}: ${w}`);
      for(const id of D.vocabulary[w]) assert.ok(words.has(id),`${w}: fiche ${id}`);
    }
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

test("prérequis par sens : homonymes exclus, formes acquises reconnues, suspensions respectées",()=>{
  const solid=id=>({id,type:"word",stage:5,sus:false});
  const wrong=["pack-238f350e","pack-05a40b3a","1780695436384","1779706065919","1763266903048"].map(solid);
  assert.equal(P.knownWords(wrong).size,0,"sourd, rôle, porter, un et yeux ne sont pas les sens demandés");
  for(const [word,ids] of Object.entries(D.vocabulary)){
    for(const id of ids){
      assert.ok(P.knownWords([solid(id)]).has(word),`${word}: ${id}`);
      assert.ok(!P.knownWords([{...solid(id),sus:true}]).has(word));
      assert.ok(!P.knownWords([{...solid(id),stage:3}]).has(word));
      assert.ok(!P.knownWords([{...solid(id),type:"phrase"}]).has(word));
    }
  }
  assert.ok(P.knownWords([solid("1779724539586")]).has("먹다"));
  assert.ok(P.knownWords([solid("1779724539593")]).has("먹다"));
  assert.ok(P.knownWords([solid("pack-093c375b")]).has("역"));
  assert.ok(!P.knownWords([solid("1763266887926")]).has("쓰다"),"amer n’est pas écrire");
  const known=P.knownWords(["1779706066013","pack-093c375b","1780695436521"].map(solid));
  assert.ok(P.eligible(known).some(i=>i.id==="range-station"));
  const eating=P.knownWords(["1779706066022","1779706066059","1779724539586"].map(solid));
  assert.ok(P.eligible(eating).some(i=>i.id==="place-restaurant"));
});

test("nouveaux contextes : formulations indépendantes, registres et ordre des compléments",()=>{
  const cases=[
    ["place-park-friend","친구를 공원에서 만나요"],
    ["place-kitchen-cook","부엌에서 요리를 하고 있습니다"],
    ["place-room-paper","신문을 방에서 제가 읽어요"],
    ["place-home-tv","저는 집에서 TV를 봅니다"],
    ["place-home-tv","집에서 TV를 보고 있어요"],
    ["place-home-exercise","집에서 운동을 해요"],
    ["place-school-lunch","점심을 학교에서 먹어요"],
    ["recipient-teacher-question","질문을 선생님께 물어봐요"],
    ["recipient-teacher-question","선생님께 질문합니다"],
    ["recipient-friend-name","친구한테 이름을 말해요"],
    ["recipient-friend-photo","사진을 친구한테 보내요"],
    ["recipient-sibling-book","동생에게 책을 빌려 줘요"],
    ["recipient-mother-water","엄마께 물을 드려요"],
    ["recipient-mother-water","엄마께 물을 드리고 있어요"],
    ["recipient-father-letter","편지를 아빠에게 보냅니다"],
    ["recipient-teacher-gift","선물을 선생님께 드립니다"],
    ["recipient-friend-call","친구한테 전화를 해요"],
    ["recipient-teacher-email","메일을 선생님께 보내요"],
    ["addition-friend-subject","친구도 공부를 하고 있어요"],
    ["addition-library","책을 도서관에서도 읽어요"],
    ["addition-today","오늘도 저는 일합니다"],
    ["addition-weekend","주말에도 공부를 해요"],
    ["addition-mother","편지를 엄마한테도 보내요"],
    ["addition-teacher","선생님께도 선물을 드려요"],
    ["restriction-fruit","과일밖에 안 먹어요"],
    ["restriction-sibling-subject","동생밖에 오지 않아요"],
    ["restriction-library","책을 도서관에서만 읽어요"],
    ["restriction-office","회사에서밖에 커피를 마시지 않아요"],
    ["restriction-mother","편지를 어머니께만 보내요"],
    ["restriction-teacher","선생님께만 선물을 드립니다"],
    ["restriction-teacher","선생님께밖에 선물을 드리지 않아요"],
    ["restriction-weekend","주말에만 공부를 해요"],
    ["range-station-market","시장까지 역에서 걸어가요"],
    ["range-stop-station","정류장부터 기차역까지 걸어갑니다"],
    ["range-noon-evening","점심부터 저녁까지 공부를 하고 있어요"],
    ["range-monday-thursday","목요일까지 월요일부터 일을 합니다"],
    ["contrast-cold-walk","추운데 걷고 있어요"],
    ["contrast-busy-read","저는 바쁘지만 책을 읽습니다"],
    ["contrast-small-room","방은 작은데 깨끗해요"],
    ["contrast-bitter-coffee","커피가 쓰지만 맛있어요"],
    ["contrast-rain-friend","비가 오지만 친구가 와요"],
    ["contrast-no-time","시간이 없는데 공부를 해요"],
    ["condition-bread","제가 배가 고프면 빵을 먹어요"],
    ["condition-thirst","목이 마르면 물을 마십니다"],
    ["condition-snow","눈이 오면 저는 집에 있어요"],
    ["condition-friend-cook","친구가 오면 제가 요리를 해요"],
    ["condition-cold-window","추우면 창문을 닫아요"],
    ["condition-arrival-call","도착하면 친구한테 전화를 해요"],
    ["purpose-park","공원으로 걸으러 가요"],
    ["purpose-letter","우체국에 편지를 보내려고 가요"],
    ["purpose-bank","은행에 환전을 하러 가요"],
    ["purpose-gym","체육관으로 운동을 하러 갑니다"],
    ["purpose-station-friend","역에 친구를 만나러 가요"],
    ["simultaneous-work-coffee","일을 하면서 커피를 마셔요"],
    ["simultaneous-clean-music","청소를 하면서 음악을 들어요"],
    ["simultaneous-tea-tv","TV를 보면서 차를 마셔요"],
    ["simultaneous-sport-music","음악을 들으면서 운동을 하고 있어요"],
    ["simultaneous-korean-notes","한국말을 배우면서 메모를 해요"],
    ["simultaneous-walk-call","전화를 하면서 걸어요"],
    ["modifier-coffee-person","커피를 마시고 있는 사람이 선생님이에요"],
    ["modifier-hospital-friend","병원에서 일하는 사람은 내 친구야"],
    ["modifier-mother-food","엄마가 만드는 음식은 맛있어요"],
    ["modifier-study-room","내가 공부하는 방은 작아요"],
    ["modifier-child-bag","아이가 들고 있는 가방은 무겁습니다"],
    ["modifier-teacher-book","선생님께서 읽으시는 책은 어려워요"],
    ["modifier-waiting-person","기다리는 사람은 제 친구예요"],
    ["modifier-write-letter","제가 쓰고 있는 편지는 길어요"],
    ["range-station","기차역까지 학교에서 걸어가요"],
    ["condition-rain","비가 오면 저는 집에 있어요"],
    ["restriction-friend","책을 친구한테만 줘요"]
  ];
  for(const [id,text] of cases) assert.equal(P.grade(id,text).status,"correct",id+": "+text);
});

test("variété sans faux succès : mêmes mots mais portée, polarité, bornes ou personne différentes",()=>{
  const cases=[
    ["addition-library","도서관에서 책도 읽어요"],
    ["addition-friend-subject","친구에게도 공부해요"],
    ["addition-mother","어머니에게 편지도 보내요"],
    ["restriction-library","도서관에서 책만 읽어요"],
    ["restriction-fruit","과일밖에 먹어요"],
    ["restriction-fruit","과일만 안 먹어요"],
    ["restriction-mother","어머니에게 편지만 보내요"],
    ["restriction-sibling-subject","동생에게만 와요"],
    ["range-station-market","시장에서 역까지 걸어요"],
    ["range-monday-thursday","목요일부터 월요일까지 일해요"],
    ["contrast-rain-friend","비가 와서 친구가 와요"],
    ["contrast-small-room","방은 작은데 더러워요"],
    ["condition-friend-cook","제가 오면 친구가 요리해요"],
    ["condition-cold-window","추워서 창문을 닫아요"],
    ["purpose-letter","편지를 보내고 나서 우체국에 가요"],
    ["purpose-gym","체육관에서 운동하러 가요"],
    ["simultaneous-tea-tv","차를 마시고 나서 TV를 봐요"],
    ["simultaneous-tea-tv","TV를 마시면서 차를 봐요"],
    ["modifier-mother-food","제가 만드는 음식은 맛있어요"],
    ["modifier-child-bag","아이가 들어요 가방은 무거워요"],
    ["modifier-child-bag","가방이 드는 아이는 무거워요"],
    ["modifier-write-letter","제가 쓰는 편지는 길지 않아요"],
    ["place-school-lunch","점심을 학교 에서 먹어요"],
    ["place-school-lunch","학교에서 저녁을 먹어요"]
  ];
  for(const [id,text] of cases) assert.notEqual(P.grade(id,text).status,"correct",id+": "+text);
});

test("rotation durable : nouveaux contextes, reprises anciennes, recharge et vocabulaire fluctuant",()=>{
  const onlyPlace=new Set(["집","공부하다","학교","일하다","식당","먹다","밥","도서관","읽다","책","카페","마시다","커피","공원","걷다"]);
  let s=P.state(null,day);const sequence=[];
  // Les autres objectifs sont hors échéance pour isoler la rotation d’un seul.
  D.goals.filter(g=>g.id!=="place").forEach(g=>s.skills[g.id]={n:1,due:"2099-01-01"});
  for(let n=0;n<60;n++){
    const today=new Date(Date.UTC(2026,9,11+n*2)).toISOString().slice(0,10);
    s=P.begin(roundtrip(s),today,onlyPlace,{end:true});
    assert.equal(D.items.find(i=>i.id===s.active.item).goal,"place");
    sequence.push(s.active.item);
    s=P.advance(P.skip(s,today),today);
  }
  const eligible=P.eligible(onlyPlace).filter(i=>i.goal==="place");
  assert.equal(new Set(sequence).size,eligible.length,"tous les contextes accessibles sont proposés");
  assert.ok(sequence.every((id,i)=>i===0||id!==sequence[i-1]),"pas de répétition immédiate");
  assert.equal(sequence[2],sequence[0],"une reprise après deux contextes nouveaux");
  assert.equal(new Set(sequence.slice(0,4)).size,3,"retour à un nouveau contexte après la reprise");
  assert.deepEqual(P.candidates(s,"2027-10-01",all),P.candidates(roundtrip(s),"2027-10-01",all));
  assert.ok(P.candidates(s,"2027-10-01",new Set(["집","공부하다"])).every(i=>i.id==="place-home"));
  assert.ok(s.skills.place.seen.length<=40);
});

test("ancien état : reprise sans réécrire les scores, annulation et nouveau corpus",()=>{
  const s=P.state({v:1,seq:10,skills:{place:{n:10,ok:3,ko:1,step:2,last:"place-school",contexts:["place-home"]}},
    recent:[{id:10,d:"2026-10-10",item:"place-school",outcome:"correct"}]},day);
  D.goals.filter(g=>g.id!=="place").forEach(g=>s.skills[g.id]={n:1,due:"2099-01-01"});
  const before=roundtrip(s),next=P.begin(s,day,all);
  assert.equal(next.active.item,"place-restaurant","les traces conservées évitent les anciens contextes connus");
  assert.deepEqual(s,before,"sélection pure");
  const done=P.reveal(next,day);
  assert.deepEqual(done.skills.place.seen,["home","school","restaurant"]);
  assert.deepEqual(P.undo(done,day).skills.place,s.skills.place,"annulation exacte des anciens champs");
  assert.equal(done.skills.place.ok,3);
  assert.equal(done.skills.place.ko,2);
  const legacyIds=["place-home","place-school","place-restaurant","place-library","place-cafe",
    "recipient-friend","recipient-child","recipient-mother","recipient-father","recipient-sibling",
    "addition-home","addition-school","addition-friend","addition-coffee","addition-bread",
    "restriction-home","restriction-school","restriction-water","restriction-books","restriction-friend",
    "range-school","range-week","range-day","range-station","range-rest",
    "contrast-bag","contrast-restaurant","contrast-tired","contrast-rain","contrast-book",
    "condition-rain","condition-time","condition-hunger","condition-price","condition-cold",
    "purpose-study","purpose-meal","purpose-friend","purpose-bread","purpose-korean",
    "simultaneous-study","simultaneous-walk","simultaneous-television","simultaneous-coffee","simultaneous-sing",
    "modifier-reader","modifier-cafe","modifier-child","modifier-friend","modifier-book"];
  assert.ok(legacyIds.every(id=>D.items.some(i=>i.id===id)),"50 identifiants historiques conservés");
});

test("rotation complète : un an de reprises conserve 200 contextes sous 10 Ko",()=>{
  let s=null,maximum=0;
  for(let d=0;d<365;d++){
    const today=new Date(Date.UTC(2026,0,d+1)).toISOString().slice(0,10);
    for(let n=0;n<4;n++){
      s=P.begin(s,today,all,{end:true});if(!s.active) break;
      s=P.reveal(s,today);
      maximum=Math.max(maximum,Buffer.byteLength(JSON.stringify(s)));
      s=P.advance(roundtrip(s),today);
    }
  }
  assert.equal(Object.values(s.skills).reduce((n,k)=>n+k.seen.length,0),200);
  assert.ok(maximum<10000,`état maximal : ${maximum} octets`);
  const payload={app:"sori",v:1,state:{v:1,production:s,items:{},rlog:[]}};
  assert.deepEqual(B.unpack(roundtrip(B.pack(payload))),payload);
});

/* Codec et véritables chemins cloud/import de app.js, API GitHub simulée sans écriture réseau. */
import {test} from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync, mkdtempSync, writeFileSync, rmSync} from "node:fs";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import vm from "node:vm";
const require = createRequire(import.meta.url);
const B = require("../docs/backup.js"), E = require("../docs/engine.js");
const source = readFileSync(new URL("../docs/app.js", import.meta.url), "utf8");
const clone = data => JSON.parse(JSON.stringify(data));
const wire = data => clone(B.pack(data));
const payload = state => ({app:"sori", v:1, exportedAt:"2026-10-05T05:14:49.806Z", seedVersion:"test", state});
const fixture = () => payload({v:1, items:{
  "mot␞":{s:5, i:12, d:"2026-10-10", e:2.31, ok:7, ko:0, S:4.567, D:6.891, sk:0, lp:null, sus:false,
    future:{nested:["한글", null, 0, false]}},
  "sparse":{s:0, d:null, sus:1}, "empty":{}, "unknown":{custom:"새 필드"}
}, rlog:[
  ["2026-07-01", "mot␞", 1, 0],
  ["2026-07-02", "mot␞", 2, 1, "qcm1"],
  ["2026-07-03", "mot␞", 3, 1, "rec5", 76, 811],
  ["2026-07-03", "mot␞", 3, 0, "", 0, 0, {future:true}],
  ["2026-07-03", "mot␞", 3, 0, "", 0, 0, {future:true}]
], set:{reverse:false, scheduler:"fsrs", newPerDay:10}, xp:50,
 errors:[{msg:"échec réseau"}], reports:[{txt:"retour utilisateur"}], sess:{queue:["mot␞"]},
 log:{"2026-10-05":{n:3}}, rep:{d:"2026-10-05", m:{}}, futureRoot:[1,2,3]});

test("round-trip JSON exact : champs présents/absents, zéro, null, verso et champs inconnus", () => {
  const data = fixture(), original = clone(data), encoded = wire(data);
  assert.equal(encoded.v, 2);
  assert.deepEqual(B.unpack(encoded), original);
  assert.deepEqual(data, original, "le transport ne modifie pas ST");
  assert.deepEqual(B.unpack(payload({v:1})), payload({v:1}), "vieil état sans conteneurs");
  assert.deepEqual(B.unpack(wire(B.unpack(encoded))), original, "réexport après restauration");
  assert.ok(!Object.hasOwn(B.unpack(encoded).state.items.sparse, "i"));
});

test("les 2048 masques de champs d'items conservent la présence exacte", () => {
  const fields = ["s","i","d","e","ok","ko","S","D","sk","lp","sus"], items = {};
  for(let mask=0; mask<2048; mask++){
    items[mask] = {};
    fields.forEach((k,i) => { if(mask & (1<<i)) items[mask][k] = [null,0,false,1.234,"2026-10-05"][i%5]; });
  }
  const data = payload({v:1, items, rlog:[]});
  assert.deepEqual(B.unpack(wire(data)), data);
});

test("la compaction respecte la sérialisation historique des valeurs JS non persistables", () => {
  const data=fixture();data.state.items.sparse.S=undefined;
  data.state.items.sparse.extraUndefined=undefined;
  data.state.futureDate=new Date("2026-10-05T00:00:00Z");
  const json=clone(data);
  assert.deepEqual(B.unpack(wire(data)),json);
  assert.ok(!Object.hasOwn(B.unpack(wire(data)).state.items.sparse,"S"));
});

test("clés JSON spéciales conservées sans modifier les prototypes", () => {
  const data = payload(JSON.parse('{"v":1,"items":{"__proto__":{"s":0,"__proto__":{"safe":true}},"constructor":{}},"rlog":[]}'));
  const result = B.unpack(wire(data));
  assert.deepEqual(result, data);
  assert.equal(Object.getPrototypeOf(result.state.items), Object.prototype);
  assert.equal(Object.getPrototypeOf(result.state.items.__proto__), Object.prototype);
});

test("format inconnu ou compact malformé refusé avant restauration", () => {
  const edits = [
    d => {d.v=3;}, d => {d.encoding.codec="futur";}, d => {d.encoding.strings[0]=null;},
    d => {d.state.rlog[0][0]=-1;}, d => {d.state.rlog[0][1]=99999;}, d => {d.state.rlog[0][1]=0.5;},
    d => {d.state.items.sparse=[2048];}, d => {d.state.items.sparse=[1];},
    d => {d.state.items.sparse=[0, {s:0}];}, d => {d.state.items.sparse=[0, {}, "extra"];},
    d => {d.state.items=[];}, d => {d.state.rlog[0]="bad";}
  ];
  for(const edit of edits){ const data = wire(fixture()); edit(data); assert.throws(() => B.unpack(data)); }
  assert.throws(() => B.unpack({app:"other",v:1,state:{}}));
});

function harness(state = fixture().state){
  const calls = [], errors = [], saved = [], files = [];
  const c = vm.createContext({ST:clone(state), DEF_SET:E.DEF_SET, REV_BOOT:false, Q:{old:true}, NAV:false,
    SEED:{meta:{version:"test"}}, GH_REPO:"mnafati-cloud/sori-data", SORI_BACKUP:B, TextEncoder,
    ghToken:()=>"test-token", todayStr:()=>"2026-10-05", btoa:s=>Buffer.from(s,"binary").toString("base64"),
    atob:s=>Buffer.from(s,"base64").toString("binary"), escape,unescape,encodeURIComponent,decodeURIComponent,
    logErr:(...args)=>errors.push(args), save:()=>saved.push(clone(c.ST)), render:()=>{},
    sanitizeSet:t=>t, location:{reload:()=>{c.reloaded=true;}}, confirm:()=>true, alert:()=>{c.alerted=true;},
    FileReader:class{readAsText(f){this.result=f.text;this.onload();}},
    File:class{constructor(parts,name){files.push({parts,name});}},
    navigator:{canShare:()=>true,share:async()=>{}},
    fetch:async(url, opts={})=>{calls.push({url,...opts});return c.respond(url,opts);}
  });
  vm.runInContext(source.slice(source.indexOf("function exportData()"),source.indexOf("/* ================= util")),c);
  vm.runInContext("confirmRestore = async () => true",c);
  return {c, calls, errors, saved, files};
}
function api(data, sha="previous-sha", space){
  const text = JSON.stringify(data,null,space);
  return {ok:true, status:200, json:async()=>({content:Buffer.from(text).toString("base64"), size:Buffer.byteLength(text), sha})};
}
const missing = {ok:false, status:404};
const ok = {ok:true, status:200};

test("migration import v1/v2 + reload : mêmes défauts, champs inconnus et journal", async () => {
  for(const input of [fixture(), wire(fixture()), payload({v:1, future:"préservé"})]){
    const {c, saved} = harness();
    c.importState({target:{files:[{text:JSON.stringify(input)}]}});
    assert.ok(!c.alerted);
    assert.ok(c.ST.items && c.ST.log && c.ST.intro);
    assert.ok(Array.isArray(c.ST.rlog) && Array.isArray(c.ST.errors) && Array.isArray(c.ST.vlog));
    assert.equal(c.ST.set.newPerDay, B.unpack(input).state.set?.newPerDay ?? E.DEF_SET.newPerDay);
    for(const [k,v] of Object.entries(B.unpack(input).state)){
      if(k==="set") for(const [key,value] of Object.entries(v)) assert.deepEqual(c.ST.set[key],value);
      else assert.deepEqual(clone(c.ST[k]),v);
    }
    assert.equal(saved.length,1);
    assert.equal(c.Q,null);
    // Le chargement local réel accepte l'état migré et conserve les champs/rlog.
    c.localStorage={getItem:()=>JSON.stringify(c.ST)}; c.LS_KEY="sori-state-v1";
    c.CORRUPT_BAK=false;
    vm.runInContext(source.slice(source.indexOf("function loadState()"),source.indexOf("/* niveaux façon")),c);
    const loaded=c.loadState();
    assert.deepEqual(clone(loaded.items),clone(c.ST.items));
    assert.deepEqual(clone(loaded.rlog),clone(c.ST.rlog));
    assert.equal(loaded.future,c.ST.future);
  }
});

test("restauration cloud v1/v2 identique, format invalide refusé sans écriture locale", async () => {
  for(const input of [fixture(), wire(fixture())]){
    const {c,saved}=harness(); c.levelName=()=>"9급"; c.respond=()=>api(input);
    assert.equal((await c.cloudRestore()).ok,true);
    assert.deepEqual(clone(c.ST.items),fixture().state.items);
    assert.deepEqual(clone(c.ST.rlog),fixture().state.rlog);
    assert.equal(saved.length,1);
  }
  const {c,saved}=harness();c.respond=()=>api({...fixture(),v:99});
  assert.equal((await c.cloudRestore()).ok,false);assert.equal(saved.length,0);
  c.importState({target:{files:[{text:JSON.stringify({...fixture(),v:99})}]}});
  assert.equal(c.alerted,true);assert.equal(saved.length,0);
});

test("v1→v2 et v2→v2 : les deux PUT gardent le snapshot quotidien et la SHA vérifiée", async () => {
  for(const previous of [fixture(),wire(fixture())]){
    const {c,calls,saved}=harness();
    c.respond=(url,o)=>o.method==="PUT"?ok:url.endsWith("latest.json")?api(previous):missing;
    const before=clone(c.ST);
    assert.equal((await c.cloudBackup()).ok,true);
    const puts=calls.filter(x=>x.method==="PUT");
    assert.equal(puts.length,2);
    assert.ok(puts[1].url.endsWith("exports/sori-export-2026-10-05.json"));
    assert.equal(JSON.parse(puts[0].body).sha,"previous-sha");
    assert.equal(JSON.parse(puts[0].body).content,JSON.parse(puts[1].body).content);
    const uploaded=JSON.parse(Buffer.from(JSON.parse(puts[0].body).content,"base64").toString());
    assert.equal(uploaded.v,2);assert.deepEqual(B.unpack(uploaded).state,before);
    assert.equal(c.ST.lastCloud,"2026-10-05");assert.equal(saved.length,1);
    assert.equal(calls.filter(x=>!x.method && x.url.endsWith("latest.json")).length,1);
  }
});

test("garde anti-écrasement même avec forte compression et ancien export indenté", async () => {
  const large=fixture(); large.state.rlog=Array.from({length:8000},()=>["2026-10-05","same-long-identifier",3,1,"rec5",50,811]);
  assert.ok(B.bytes(B.pack(large)) < B.bytes(large)/2);
  // La migration du MÊME état est admise bien que le transport soit deux fois plus petit.
  const h=harness(large.state); h.c.respond=(url,o)=>o.method==="PUT"?ok:url.endsWith("latest.json")?api(large):missing;
  assert.equal((await h.c.cloudBackup()).ok,true);
  for(const previous of [large,wire(large)]){
    const {c,calls,errors}=harness({v:1,items:{},rlog:[],set:{reverse:false}});
    c.respond=()=>api(previous,"previous-sha",1);
    const result=await c.cloudBackup();assert.equal(result.guard,true);
    assert.equal(calls.filter(x=>x.method==="PUT").length,0);assert.equal(errors.length,1);
  }
});

test("premier backup et forçage explicite autorisés ; erreurs, conflit et snapshot échoué non marqués réussis", async () => {
  for(const force of [false,true]){
    const {c,calls}=harness();c.respond=(url,o)=>o.method==="PUT"?ok:missing;
    assert.equal((await c.cloudBackup(force)).ok,true);
    assert.equal(calls.filter(x=>x.method==="PUT").length,2);
  }
  const {c,calls}=harness({v:1,items:{},rlog:[],set:{reverse:false}});
  c.respond=(url,o)=>o.method==="PUT"?ok:api(fixture());
  assert.equal((await c.cloudBackup(true)).ok,true);
  for(const failure of ["unreadable","offline","api","conflict","snapshot"]){
    const h=harness(); h.c.ST.lastCloud="2026-10-04";
    h.c.respond=(url,o)=>{
      if(failure==="offline") throw new Error("offline");
      if(failure==="unreadable") return api({...fixture(),v:99});
      if(failure==="api") return {ok:false,status:503};
      if(o.method==="PUT") return failure==="conflict" || url.includes("sori-export-")?{ok:false,status:409}:ok;
      return url.endsWith("latest.json")?api(fixture()):missing;
    };
    assert.equal((await h.c.cloudBackup()).ok,false,failure);
    assert.equal(h.c.ST.lastCloud,"2026-10-04",failure);assert.equal(h.saved.length,0,failure);
    if(["unreadable","offline","api"].includes(failure)) assert.equal(h.calls.filter(x=>x.method==="PUT").length,0);
    if(failure==="conflict") assert.equal(h.calls.filter(x=>x.method==="PUT").length,1);
  }
});

test("garde comparée au snapshot envoyé même si ST change pendant le GET", async () => {
  const large=fixture();large.state.futureText="x".repeat(200000);
  const {c,calls}=harness();
  c.respond=()=>{c.ST.futureText="x".repeat(200000);return api(large);};
  assert.equal((await c.cloudBackup()).guard,true);
  assert.equal(calls.filter(x=>x.method==="PUT").length,0);
});

test("codec local invalide renvoie un échec exploitable, sans PUT ni marqueur de réussite", async () => {
  const {c,calls,saved}=harness();c.ST.rlog=[["2026-10-05",null,3,1]];
  assert.equal((await c.cloudBackup()).ok,false);
  assert.equal(calls.length,0);assert.equal(saved.length,0);
});

test("export manuel v1 utilisable pour rollback, garde UTF-8, codec précaché", async () => {
  const {c,files}=harness();await c.exportState();
  const manual=JSON.parse(files[0].parts.join(""));assert.equal(manual.v,1);
  assert.ok(!manual.encoding);assert.deepEqual(manual.state.items,fixture().state.items);
  assert.deepEqual(manual.state.rlog,fixture().state.rlog);
  const h=harness();h.c.ST.futureText="한".repeat(250000);
  h.c.respond=(url,o)=>o.method==="PUT"?ok:missing;
  assert.equal((await h.c.cloudBackup()).ok,true);assert.equal(h.errors.length,1);
  assert.ok(readFileSync(new URL("../docs/sw.js",import.meta.url),"utf8").includes('"./backup.js"'));
  const html=readFileSync(new URL("../docs/index.html",import.meta.url),"utf8");
  assert.ok(html.indexOf('./backup.js') < html.indexOf('./app.js'));
});

test("décodeur Python et entrée du fit FSRS : mêmes séquences, ease et régimes v1/v2", () => {
  const dir=mkdtempSync(join(process.cwd(),".sori-backup-test-"));
  try{
    const old=join(dir,"v1.json"), compact=join(dir,"v2.json");
    writeFileSync(old,JSON.stringify(fixture()));writeFileSync(compact,JSON.stringify(wire(fixture())));
    const script="import json,sys; from backup_codec import unpack; from fsrs_fit import extract_sequences; a=json.load(open(sys.argv[1])); b=json.load(open(sys.argv[2])); assert unpack(b)==a; assert extract_sequences(sys.argv[1])==extract_sequences(sys.argv[2]); print('FSRS input identical')";
    const result=spawnSync("python",["-c",script,old,compact],{encoding:"utf8",env:{...process.env,PYTHONPATH:new URL("../tools",import.meta.url).pathname}});
    assert.equal(result.status,0,result.stderr || result.stdout);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

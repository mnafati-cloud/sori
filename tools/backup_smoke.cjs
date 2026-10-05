/* Test Chromium de la vraie PWA. Données synthétiques ; API cloud entièrement simulée.
   Usage : NODE_PATH=<installation-playwright>/node_modules node tools/backup_smoke.cjs
   Le serveur et le navigateur sont isolés et fermés après le test. */
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const {chromium} = require("playwright");
const B = require("../docs/backup.js"), E = require("../docs/engine.js");
const root = path.resolve(__dirname, "../docs");
const artifacts = path.resolve(process.env.SORI_BROWSER_ARTIFACTS || "browser-results");
fs.mkdirSync(artifacts, {recursive:true});
const seedContext = {window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,"data.js"),"utf8"),seedContext);
const cards = seedContext.window.SEED.items.filter(it=>it.type==="word").slice(0,3);
const today = new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul"}).format(new Date());
const yesterday = E.addDays(today,-1);
const state = {v:1, xp:50, freshOk:1, reverseMig:1, adapMig:1,
  items:Object.fromEntries(cards.map(it=>[it.id,{s:1,i:1,d:today,e:2.31,ok:7,ko:1,S:1.234,D:6.789,sk:0,future:{keep:true}}])),
  log:{}, intro:{}, rlog:Array.from({length:8000},(_,i)=>[yesterday,cards[i%3].id,3,1,"rec5",76,811]),
  set:{...E.DEF_SET,reverse:false,newPerDay:0,kitFirst:false,mute:true,autoplay:false},
  errors:[], reports:[{d:today+"T00:00:00Z",txt:"fixture synthétique"}], vlog:[],
  sess:{d:today,q:cards.map(it=>it.id),p:0,pen:0}, rep:{d:today,m:{}}, conv:[], story:{lus:[],ouverts:[]},
  audioCleanMig:1, futureRoot:["préservé",null,false]};
const original = {app:"sori",v:1,exportedAt:today+"T00:00:00Z",seedVersion:1,state};
const mime = {".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".woff2":"font/woff2",".png":"image/png",".mp3":"audio/mpeg"};
const server = http.createServer((req,res)=>{
  let file=path.resolve(root,"."+decodeURIComponent(new URL(req.url,"http://localhost").pathname));
  if(file===root) file=path.join(root,"index.html");
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(file,(error,bytes)=>{
    if(error){res.writeHead(404);res.end();return;}
    res.writeHead(200,{"Content-Type":mime[path.extname(file)] || "application/octet-stream"});res.end(bytes);
  });
});
let browser;
(async()=>{
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const url="http://127.0.0.1:"+server.address().port+"/";
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:412,height:915},timezoneId:"Asia/Seoul",acceptDownloads:true});
  await context.addInitScript(data=>{
    if(!localStorage.getItem("sori-state-v1")) localStorage.setItem("sori-state-v1",JSON.stringify(data.state));
  },original);
  let remote=original;
  const writes=[], errors=[];
  await context.route("https://api.github.com/**",async route=>{
    const req=route.request(), pathname=new URL(req.url()).pathname;
    if(req.method()==="PUT"){
      const body=req.postDataJSON();writes.push({pathname,body});
      if(pathname.endsWith("latest.json")) remote=JSON.parse(Buffer.from(body.content,"base64").toString("utf8"));
      return route.fulfill({status:200,contentType:"application/json",body:'{"content":{"sha":"updated-sha"}}'});
    }
    if(pathname.endsWith("latest.json")){
      const text=JSON.stringify(remote);
      return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({sha:"verified-sha",size:Buffer.byteLength(text),content:Buffer.from(text).toString("base64")})});
    }
    return route.fulfill({status:404,contentType:"application/json",body:"{}"});
  });
  const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));
  await page.goto(url);
  await page.locator("#settings").waitFor();
  await page.waitForFunction(()=>document.querySelector("#screen").textContent.length>0);
  // Révision réelle : une bonne réponse, une mauvaise, puis conservation après reload.
  await page.locator('#tabs [data-tab="review"]').click();
  const correct=await page.evaluate(()=>SEED_BY_ID[Q[QPOS]].fr);
  await page.locator(".opts button").filter({hasText:correct}).click();
  await page.locator("#cont").click();
  const second=await page.evaluate(()=>SEED_BY_ID[Q[QPOS]].fr);
  const wrong=page.locator(".opts button").filter({hasNotText:second}).first();
  await wrong.click();await page.locator("#cont").waitFor();
  const answered=await page.evaluate(()=>({n:ST.log[todayStr()].n,items:ST.items,rlog:ST.rlog}));
  assert.equal(answered.n,2);assert.equal(answered.rlog.length,8000);
  await page.reload();
  await page.locator("#settings").waitFor();
  const reloaded=await page.evaluate(()=>({items:ST.items,rlog:ST.rlog}));
  assert.deepEqual(reloaded.items,answered.items);assert.deepEqual(reloaded.rlog,answered.rlog);
  // Écrans actuellement exposés : Progrès, Exercices/nombres, dictionnaire, Réglages.
  await page.locator('#tabs [data-tab="progres"]').click();
  assert.ok(await page.locator(".statgrid").isVisible());
  await page.locator('#tabs [data-tab="exercices"]').click();
  const numbers=page.locator("#screen .card").filter({has:page.getByRole("heading",{name:"Les nombres à l'oreille",exact:true})});
  await numbers.getByRole("button",{name:"Ouvrir",exact:true}).click();
  await page.getByRole("button",{name:"← Exercices",exact:true}).waitFor();
  await page.getByRole("button",{name:"← Exercices",exact:true}).click();
  await page.locator('#tabs [data-tab="progres"]').click();
  await page.locator("#dico").click();await page.locator("#dicoclose").waitFor();await page.locator("#dicoclose").click();
  await page.locator("#settings").click();
  await page.locator("#ghtok").fill("synthetic-token");await page.locator("#ghtok").press("Tab");
  await page.locator("#cloud").waitFor();
  const beforeBackup=await page.evaluate(()=>JSON.parse(JSON.stringify(ST)));
  await page.locator("#cloud").click();
  await page.waitForFunction(()=>document.querySelector("#cloudstatus").textContent.startsWith("Sauvegardé"));
  assert.equal(writes.length,2);assert.equal(writes[0].body.sha,"verified-sha");
  assert.equal(writes[0].body.content,writes[1].body.content);
  assert.ok(writes[1].pathname.endsWith("sori-export-"+today+".json"));
  assert.equal(remote.v,2);assert.deepEqual(B.unpack(remote).state,beforeBackup);
  await page.screenshot({path:path.join(artifacts,"cloud-backup.png")});
  // Vrai bouton de restauration : minuteur conservé, aucun raccourci de confirmation.
  await page.locator("#cloudrestore").click();
  await page.locator("#rsok").waitFor();assert.equal(await page.locator("#rsok").isEnabled(),false);
  await page.waitForFunction(()=>!document.querySelector("#rsok").disabled);
  await page.locator("#rsok").click();
  await page.locator("#cloud").waitFor({state:"hidden"});
  assert.deepEqual(await page.evaluate(()=>JSON.parse(JSON.stringify(ST))),beforeBackup);
  // Secours v1 téléchargé puis importé par le véritable FileReader de l'app.
  await page.locator("#settings").click();
  await page.locator("summary").filter({hasText:"Sauvegarde fichier"}).click();
  const downloadEvent=page.waitForEvent("download");await page.locator("#exp").click();
  const download=await downloadEvent, file=await download.path();
  const manual=JSON.parse(fs.readFileSync(file,"utf8"));assert.equal(manual.v,1);assert.ok(!manual.encoding);
  assert.deepEqual(manual.state.items,beforeBackup.items);assert.deepEqual(manual.state.rlog,beforeBackup.rlog);
  page.once("dialog",dialog=>dialog.accept());
  await page.locator("#impfile").setInputFiles({name:"synthetic-v1.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(manual))});
  await page.waitForFunction(()=>document.querySelector("#cloud")===null);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(JSON.stringify(ST))),manual.state);
  // Un état remis à zéro ne peut pas écraser le cloud v2 plus riche (Annuler le forçage).
  await page.locator("#settings").click();await page.locator("summary").filter({hasText:"Sauvegarde fichier"}).click();
  const empty={app:"sori",v:1,state:{v:1,items:{},rlog:[],xp:0,set:{...E.DEF_SET,reverse:false}}};
  page.once("dialog",dialog=>dialog.accept());
  await page.locator("#impfile").setInputFiles({name:"synthetic-empty.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(empty))});
  await page.waitForFunction(()=>document.querySelector("#cloud")===null);
  await page.locator("#settings").click();page.once("dialog",dialog=>dialog.dismiss());
  await page.locator("#cloud").click();
  await page.waitForFunction(()=>document.querySelector("#cloudstatus").textContent.startsWith("Échec"));
  assert.equal(writes.length,2,"aucun PUT lors du refus anti-écrasement");
  await page.screenshot({path:path.join(artifacts,"overwrite-refused.png")});
  assert.deepEqual(errors,[]);
  const summary={browser:await browser.version(),viewport:"412×915",reviews:2,rlog:8000,
    roundTrip:true,cloudPuts:2,dailySnapshot:true,restoreCountdown:true,manualV1:true,overwriteGuard:true,pageErrors:errors};
  fs.writeFileSync(path.join(artifacts,"summary.json"),JSON.stringify(summary,null,2));
  console.log(JSON.stringify(summary));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(browser) await browser.close();await new Promise(resolve=>server.close(resolve));
});

/* Tests de gramex.js — le conjugueur est CONTRACTUEL : chaque forme ci-dessous a été
   vérifiée à la main (irréguliers ㄹ/ㅂ/ㄷ/ㅅ/르/으/하다 + contractions vocaliques).
   Garanties transverses : les pièges ne contiennent JAMAIS la forme correcte ni une
   variante orthographique valide ; toujours 4 options uniques dont exactement une bonne. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const G = require("../docs/gramex.js");
const P = G.pure;

/* rng déterministe (LCG) pour les générateurs */
function lcg(seed){ let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

/* ===== conjugueur : table vérifiée à la main ===== */
const TABLE = [
  /* base, cls, pres, past, seyo, fut, nikka, myeon (null = non testé/non applicable) */
  ["가다",     "r",  "가요",     "갔어요",     "가세요",    "갈 거예요",   "가니까",    "가면"],
  ["오다",     "r",  "와요",     "왔어요",     "오세요",    "올 거예요",   "오니까",    "오면"],
  ["먹다",     "r",  "먹어요",   "먹었어요",   "먹으세요",  "먹을 거예요", "먹으니까",  "먹으면"],
  ["마시다",   "r",  "마셔요",   "마셨어요",   "마시세요",  "마실 거예요", "마시니까",  "마시면"],
  ["보다",     "r",  "봐요",     "봤어요",     "보세요",    "볼 거예요",   "보니까",    "보면"],
  ["주다",     "r",  "줘요",     "줬어요",     "주세요",    "줄 거예요",   "주니까",    "주면"],
  ["받다",     "r",  "받아요",   "받았어요",   "받으세요",  "받을 거예요", "받으니까",  "받으면"],
  ["앉다",     "r",  "앉아요",   "앉았어요",   "앉으세요",  "앉을 거예요", "앉으니까",  "앉으면"],
  ["보내다",   "r",  "보내요",   "보냈어요",   "보내세요",  "보낼 거예요", "보내니까",  "보내면"],
  ["배우다",   "r",  "배워요",   "배웠어요",   "배우세요",  "배울 거예요", "배우니까",  "배우면"],
  ["기다리다", "r",  "기다려요", "기다렸어요", "기다리세요","기다릴 거예요","기다리니까","기다리면"],
  ["공부하다", "ha", "공부해요", "공부했어요", "공부하세요","공부할 거예요","공부하니까","공부하면"],
  ["쓰다",     "eu", "써요",     "썼어요",     "쓰세요",    "쓸 거예요",   "쓰니까",    "쓰면"],
  ["바쁘다",   "eu", "바빠요",   "바빴어요",   null,        null,          "바쁘니까",  "바쁘면"],
  ["예쁘다",   "eu", "예뻐요",   "예뻤어요",   null,        null,          "예쁘니까",  "예쁘면"],
  ["살다",     "l",  "살아요",   "살았어요",   "사세요",    "살 거예요",   "사니까",    "살면"],
  ["돌다",     "l",  "돌아요",   "돌았어요",   "도세요",    "돌 거예요",   "도니까",    "돌면"],
  ["만들다",   "l",  "만들어요", "만들었어요", "만드세요",  "만들 거예요", "만드니까",  "만들면"],
  ["알다",     "l",  "알아요",   "알았어요",   "아세요",    "알 거예요",   "아니까",    "알면"],
  ["멀다",     "l",  "멀어요",   "멀었어요",   null,        null,          "머니까",    "멀면"],
  ["듣다",     "d",  "들어요",   "들었어요",   "들으세요",  "들을 거예요", "들으니까",  "들으면"],
  ["걷다",     "d",  "걸어요",   "걸었어요",   "걸으세요",  "걸을 거예요", "걸으니까",  "걸으면"],
  ["돕다",     "b",  "도와요",   "도왔어요",   "도우세요",  "도울 거예요", "도우니까",  "도우면"],
  ["맵다",     "b",  "매워요",   "매웠어요",   null,        null,          "매우니까",  "매우면"],
  ["덥다",     "b",  "더워요",   "더웠어요",   null,        null,          "더우니까",  "더우면"],
  ["어렵다",   "b",  "어려워요", "어려웠어요", null,        null,          "어려우니까","어려우면"],
  ["모르다",   "reu","몰라요",   "몰랐어요",   "모르세요",  "모를 거예요", "모르니까",  "모르면"],
  ["부르다",   "reu","불러요",   "불렀어요",   "부르세요",  "부를 거예요", "부르니까",  "부르면"],
  ["다르다",   "reu","달라요",   "달랐어요",   null,        null,          "다르니까",  "다르면"],
  ["낫다",     "s",  "나아요",   "나았어요",   "나으세요",  "나을 거예요", "나으니까",  "나으면"],
  ["짓다",     "s",  "지어요",   "지었어요",   "지으세요",  "지을 거예요", "지으니까",  "지으면"]
];
const FORM_IDS = ["pres", "past", "seyo", "fut", "nikka", "myeon"];

test("conjugueur : table vérifiée (toutes classes, toutes formes)", () => {
  for(const row of TABLE){
    const [b, cls, ...forms] = row;
    forms.forEach((want, i) => {
      if(want === null) return;
      assert.equal(P.conj(b, cls, FORM_IDS[i]), want, `${b} + ${FORM_IDS[i]}`);
    });
  }
});

test("conjugueur : la réponse au rapport 27/07 (왼쪽으로 도세요)", () => {
  assert.equal(P.conj("돌다", "l", "seyo"), "도세요");   // PAS 돌으세요 ni 돌세요
});

test("pièges : jamais la forme correcte, jamais une variante valide, ≥3 par question", () => {
  for(const v of P.VERBS){
    for(const f of P.FORMS){
      if(f.verbsOnly && v.adj) continue;
      const correct = P.conj(v.b, v.cls, f.id);
      const wrongs = P.wrongForms(v.b, v.cls, f.id, correct);
      assert.ok(wrongs.length >= 3, `${v.b}+${f.id} : ${wrongs.length} pièges (${wrongs})`);
      assert.ok(!wrongs.includes(correct), `${v.b}+${f.id} : correct dans les pièges`);
      const uniq = new Set(wrongs);
      assert.equal(uniq.size, wrongs.length, `${v.b}+${f.id} : doublons`);
      for(const w of wrongs)
        assert.ok(!P.isValidAlt(v.b, v.cls, f.id, w), `${v.b}+${f.id} : piège valide ${w}`);
    }
  }
});

test("variantes valides reconnues (jamais proposées en piège)", () => {
  assert.ok(P.isValidAlt("주다", "r", "pres", "주어요"));
  assert.ok(P.isValidAlt("되다", "r", "pres", "되어요"));
  assert.ok(P.isValidAlt("보다", "r", "pres", "보아요"));
  assert.ok(P.isValidAlt("마시다", "r", "pres", "마시어요"));
  assert.ok(!P.isValidAlt("가다", "r", "pres", "가아요"));   // 가아요 n'est PAS valide
  assert.ok(!P.isValidAlt("먹다", "r", "pres", "먹어요"));   // (c'est la forme correcte, pas une variante)
});

test("makeConj : 4 options uniques, exactement une bonne, adjectifs exclus de 세요/futur", () => {
  const rng = lcg(42);
  for(let k = 0; k < 300; k++){
    const q = P.makeConj(rng);
    assert.equal(q.options.length, 4);
    assert.equal(q.options.filter(o => o.ok).length, 1);
    assert.equal(new Set(q.options.map(o => o.label)).size, 4);
    assert.equal(q.options.find(o => o.ok).label, q.answer);
    assert.equal(q.answer, P.conj(q.base, P.VERBS.find(v => v.b === q.base).cls, q.form));
    if(q.form === "seyo" || q.form === "fut")
      assert.ok(!P.VERBS.find(v => v.b === q.base).adj, `${q.base} est un adjectif en ${q.form}`);
  }
});

test("makeConj : le filtre de verbes connus s'applique, et se désarme s'il est trop dur (v151)", () => {
  /* verbes connus assez nombreux (>= 8) -> on ne doit tirer QUE ceux-là */
  const connus = P.VERBS.slice(0, 14).map(v => v.b);
  const set = new Set(connus);
  const rng = lcg(7);
  for(let k = 0; k < 200; k++){
    const q = P.makeConj(rng, null, set);
    assert.ok(set.has(q.base), `${q.base} n'est pas dans les verbes connus`);
  }
  /* filtre trop restrictif (< 8 rescapés) -> repli sur le répertoire complet, jamais d'échec */
  const maigre = new Set(P.VERBS.slice(0, 3).map(v => v.b));
  const rng2 = lcg(9);
  let horsFiltre = 0;
  for(let k = 0; k < 120; k++){
    const q = P.makeConj(rng2, null, maigre);
    assert.ok(q && q.options.length === 4);
    if(!maigre.has(q.base)) horsFiltre++;
  }
  assert.ok(horsFiltre > 0, "le repli doit rouvrir le répertoire complet");
  /* absence de filtre = comportement historique, à l'identique */
  assert.deepEqual(P.makeConj(lcg(5)), P.makeConj(lcg(5), null, null));
  assert.deepEqual(P.makeConj(lcg(5)), P.makeConj(lcg(5), null, undefined));
});

test("makeSpot : une structure PRÉSENTE dans la phrase n'est jamais un leurre (v152)", () => {
  const STRUCTS = [
    { id:"myeon",  fr:"(으)면 — si",            ex:"시간이 있으면 오세요" },
    { id:"ryeomyeon", fr:"(으)려면 — pour",      ex:"가려면 지금 나가세요" },
    { id:"jiman",  fr:"-지만 — mais",            ex:"비싸지만 좋아요" },
    { id:"go",     fr:"-고 — et/puis",           ex:"밥을 먹고 자요" },
    { id:"aseo",   fr:"아서/어서 — cause",       ex:"바빠서 못 갔어요" }
  ];
  /* la phrase CONTIENT 려면, mais ses tags figés l'ont oublié : sans détection, la structure
     « (으)려면 » pouvait être proposée comme leurre alors qu'elle est sous les yeux. */
  const SENTS = [{ id:"x1", kr:"한국에 가려면 비자가 필요하지만 어렵지 않아요.",
                   fr:"Pour aller en Corée il faut un visa, mais ce n'est pas difficile.",
                   tags:["jiman"] }];
  const detect = () => ["jiman", "ryeomyeon"];
  const rng = lcg(3);
  for(let k = 0; k < 60; k++){
    const q = P.makeSpot(SENTS, STRUCTS, rng, null, detect);
    assert.ok(q, "une question doit être produite");
    assert.ok(!q.options.some(o => !o.ok && o.label === "(으)려면 — pour"),
      "une structure présente dans la phrase ne peut pas être un leurre");
    assert.equal(q.options.filter(o => o.ok).length, 1);
  }
  /* sans détecteur : comportement historique inchangé (les tags seuls font foi) */
  const q0 = P.makeSpot(SENTS, STRUCTS, lcg(3), null);
  const q1 = P.makeSpot(SENTS, STRUCTS, lcg(3), null, undefined);
  assert.deepEqual(q0, q1);
  /* un détecteur qui explose ne casse pas l'exercice */
  const boom = () => { throw new Error("indisponible"); };
  assert.ok(P.makeSpot(SENTS, STRUCTS, lcg(3), null, boom));
});

/* ===== à trou ===== */
const LEX = new Set(["가다", "있다", "먹다", "자다", "살다", "바쁘다", "비싸다", "돌다"]);
const SENTS = [
  { id:"s1", kr:"비싸지만 좋아요.",        fr:"C'est cher mais c'est bien.",        tags:["jiman"] },
  { id:"s2", kr:"시간이 있으면 오세요.",   fr:"Si vous avez le temps, venez.",      tags:["myeon","seyo"] },
  { id:"s3", kr:"바빠서 못 갔어요.",       fr:"J'étais occupé donc je n'ai pas pu y aller.", tags:["aseo","past","mot"] },
  { id:"s4", kr:"한국에 가고 싶어요.",     fr:"Je veux aller en Corée.",            tags:["go-sipda"] },
  { id:"s5", kr:"자기 전에 책을 읽어요.",  fr:"Je lis avant de dormir.",            tags:["gi-jeone"] },
  { id:"s6", kr:"서울에 살면 좋아요.",     fr:"C'est bien si on habite à Séoul.",   tags:["myeon"] },
  { id:"s7", kr:"왼쪽으로 도세요.",        fr:"Tournez à gauche.",                  tags:["seyo"] },
  { id:"s8", kr:"먹어도 돼요.",            fr:"Tu peux manger.",                    tags:["ado-dweda"] }
];

test("prepCloze : familles sûres, radical vérifié au lexique", () => {
  const pool = P.prepCloze(SENTS, LEX);
  const byId = {};
  for(const p of pool) (byId[p.id] = byId[p.id] || []).push(p);

  /* 비싸지만 : famille BARE médiane, 4 options bien formées sur le même radical */
  const s1 = byId.s1[0];
  assert.equal(s1.answer, "비싸지만");
  assert.deepEqual(new Set(s1.options.map(o => o.label)),
    new Set(["비싸지만", "비싸고", "비싸기 때문에", "비싸기 전에"]));
  assert.equal(s1.options.find(o => o.ok).label, "비싸지만");

  /* 있으면 : swap après le 으 — pas besoin de lexique pour être sûr */
  const s2 = byId.s2[0];
  assert.deepEqual(new Set(s2.options.map(o => o.label)),
    new Set(["있으면", "있으니까", "있으면서", "있으러"]));

  /* 바빠서 : famille 아/어 (서/도/야), 3 options */
  const s3 = byId.s3[0];
  assert.equal(s3.structId, "aseo");
  assert.deepEqual(new Set(s3.options.map(o => o.label)), new Set(["바빠서", "바빠도", "바빠야"]));

  /* 가고 싶어요 : famille BARE finale */
  const s4 = byId.s4[0];
  assert.deepEqual(new Set(s4.options.map(o => o.label)),
    new Set(["가고 싶어요", "가고 있어요", "가지 않아요", "가지 마세요"]));

  /* 자기 전에 : marqueur en deux mots, radical 자 vérifié (자다 ∈ lex) */
  const s5 = byId.s5[0];
  assert.equal(s5.answer, "자기 전에");
  assert.ok(s5.masked.includes("＿"));

  /* 살면 : radical en ㄹ — les VRAIES règles (사니까, 살면서, 살러) */
  const s6 = byId.s6[0];
  assert.deepEqual(new Set(s6.options.map(o => o.label)),
    new Set(["살면", "사니까", "살면서", "살러"]));

  /* 도세요 : ㄹ déjà tombé, radical 도다 ∉ lex → AUCUN item (conservateur) */
  assert.ok(!byId.s7);

  /* 먹어도 돼요 : famille 아/어 finale */
  const s8 = byId.s8[0];
  assert.deepEqual(new Set(s8.options.map(o => o.label)),
    new Set(["먹어도 돼요", "먹어야 해요", "먹어 보세요", "먹어 주세요"]));
});

test("makeCloze : options mélangées, une seule bonne, masque présent", () => {
  const pool = P.prepCloze(SENTS, LEX);
  const rng = lcg(7);
  for(let k = 0; k < 50; k++){
    const q = P.makeCloze(pool, rng);
    assert.ok(q);
    assert.equal(q.options.filter(o => o.ok).length, 1);
    assert.equal(q.options.find(o => o.ok).label, q.answer);
    assert.ok(q.masked.includes("＿"));
    assert.ok(!q.masked.includes(q.answer));
  }
  assert.equal(P.makeCloze([], lcg(1)), null);
});

/* ===== repérage ===== */
const STRUCTS = [
  { id:"jiman", fr:"지만 — mais",            lvl:"A2", ex:"비싸지만 좋아요" },
  { id:"myeon", fr:"(으)면 — condition",     lvl:"A2", ex:"시간이 있으면 오세요" },
  { id:"aseo",  fr:"아서/어서 — cause",      lvl:"A2", ex:"바빠서 못 갔어요" },
  { id:"seyo",  fr:"(으)세요 — demande",     lvl:"A1", ex:"여기 앉으세요" },
  { id:"past",  fr:"passé 았/었/했",         lvl:"A1", ex:"어제 먹었어요" },
  { id:"mot",   fr:"impossibilité 못",       lvl:"A1", ex:"술을 못 마셔요" },
  { id:"go-sipda", fr:"고 싶다 — vouloir",   lvl:"A1", ex:"가고 싶어요" },
  { id:"gi-jeone", fr:"기 전에 — avant de",  lvl:"A2", ex:"자기 전에" },
  { id:"ado-dweda", fr:"아도/어도 되다 — permission", lvl:"A2", ex:"먹어도 돼요" }
];

test("makeSpot : la bonne réponse est une structure de la phrase, les pièges non", () => {
  const rng = lcg(99);
  for(let k = 0; k < 100; k++){
    const q = P.makeSpot(SENTS, STRUCTS, rng);
    assert.ok(q);
    assert.equal(q.options.filter(o => o.ok).length, 1);
    const s = SENTS.find(x => x.id === q.id);
    assert.ok(s.tags.includes(q.structId), `${q.structId} pas dans ${s.id}`);
    const inLabels = s.tags.map(t => (STRUCTS.find(st => st.id === t) || {}).fr).filter(Boolean);
    for(const o of q.options)
      if(!o.ok) assert.ok(!inLabels.includes(o.label), `piège ${o.label} est DANS la phrase ${s.id}`);
  }
  assert.equal(P.makeSpot([], STRUCTS, lcg(1)), null);
});

test("ciblage : le profil pousse vers les structures non acquises", () => {
  const profile = { jiman: { status:"acquise" }, myeon: { status:"en-cours" },
                    aseo: { status:"acquise" }, "go-sipda": { status:"acquise" },
                    "gi-jeone": { status:"acquise" }, "ado-dweda": { status:"acquise" } };
  const pool = P.prepCloze(SENTS, LEX);
  const rng = lcg(3);
  let hot = 0, n = 200;
  for(let k = 0; k < n; k++){
    const q = P.makeCloze(pool, rng, profile);
    if(q.structId === "myeon") hot++;
  }
  /* 2 items myeon / 7 au pool ; avec le biais 70 % ils doivent dominer nettement */
  assert.ok(hot > n * 0.5, `myeon ciblé ${hot}/${n}`);
});

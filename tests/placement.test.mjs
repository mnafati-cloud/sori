/* Tests du moteur pur du test de niveau adaptatif (docs/placement.js) — node --test tests/ */
import test from "node:test";
import assert from "node:assert/strict";
import PLC from "../docs/placement.js";

const { poolsByBand, makeQuestion, decide, estimate, LEVELS } = PLC.pure;

/* RNG déterministe (mulberry32) */
function rng(seed){
  let a = seed >>> 0;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ITEMS = [
  { id:"a1", kr:"물", fr:"eau", cefr:"A1", type:"word" },
  { id:"a2", kr:"가다", fr:"aller", cefr:"A1", type:"word" },
  { id:"a3", kr:"밥", fr:"riz", cefr:"A1", type:"word" },
  { id:"a4", kr:"사람", fr:"personne", cefr:"A1", type:"word" },
  { id:"a5", kr:"집", fr:"maison", cefr:"A1", type:"word" },
  { id:"b1", kr:"수준", fr:"niveau", cefr:"B1", type:"word" },
  { id:"b2", kr:"지역", fr:"région", cefr:"B1", type:"word" },
  { id:"x1", kr:"???", fr:"sans niveau", type:"word" },   // ignoré (pas de cefr)
];

test("poolsByBand : groupe par bande, ignore les items sans cefr/kr/fr", () => {
  const p = poolsByBand(ITEMS);
  assert.equal(p.A1.length, 5);
  assert.equal(p.B1.length, 2);
  assert.equal(p.A2.length, 0);
  // l'item sans cefr n'apparaît nulle part
  const all = LEVELS.reduce((n, lv) => n + p[lv].length, 0);
  assert.equal(all, 7);
});

test("makeQuestion : 4 options distinctes, la bonne réponse est le sens de la cible", () => {
  const p = poolsByBand(ITEMS);
  const target = p.A1[0];
  const q = makeQuestion(target, p.A1, p.A1.concat(p.B1), rng(1));
  assert.equal(q.options.length, 4);
  assert.equal(new Set(q.options).size, 4);                 // toutes distinctes
  assert.equal(q.options[q.answer], target.fr);             // la bonne réponse = le sens de la cible
  assert.ok(q.options.includes(target.fr));
});

test("decide : escalier (>=4 monte, <=2 descend, 3 = frontière)", () => {
  assert.equal(decide(6), "up");
  assert.equal(decide(4), "up");
  assert.equal(decide(3), "stop");
  assert.equal(decide(2), "down");
  assert.equal(decide(0), "down");
});

test("estimate : B1 réussi + B2 frontière (3/6) -> 'B1 solide, B2 en cours'", () => {
  const r = { A2:{c:6,n:6}, B1:{c:5,n:6}, B2:{c:3,n:6} };
  const e = estimate(r);
  assert.equal(e.band, "B1/B2");
  assert.match(e.label, /B1 solide, B2 en cours/);
  assert.equal(e.topik, "TOPIK 3");
});

test("estimate : A2 réussi, B1 raté -> 'A2 solide'", () => {
  const e = estimate({ A2:{c:5,n:6}, B1:{c:1,n:6} });
  assert.equal(e.band, "A2");
  assert.match(e.label, /A2 solide/);
  assert.equal(e.topik, "TOPIK 2");
});

test("estimate : rien de réussi -> grand débutant", () => {
  const e = estimate({ A2:{c:1,n:6}, A1:{c:2,n:6} });
  assert.equal(e.idx, -1);
  assert.match(e.label, /débutant/i);
});

test("estimate : C1 réussi -> excellent", () => {
  const e = estimate({ B2:{c:5,n:6}, C1:{c:4,n:6} });
  assert.match(e.label, /C1/);
  assert.equal(e.topik, "TOPIK 5-6");
});

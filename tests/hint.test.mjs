/* Tests de l'indice de rappel (docs/engine.js : hintPlan / leadJamo) — node --test tests/
   Verrouille la correction v76 : la partie révélée TOURNE, jamais de giveaway sur les mots
   courts (masque jamo), et le drapeau meaningful pilote le plafond (rec4 vs rec5). */
import test from "node:test";
import assert from "node:assert/strict";
import ENGINE from "../docs/engine.js";

const types = p => p.tiles.map(t => t.t);

test("leadJamo : attaque (초성) correcte", () => {
  assert.equal(ENGINE.leadJamo("물"), "ㅁ");
  assert.equal(ENGINE.leadJamo("가"), "ㄱ");
  assert.equal(ENGINE.leadJamo("족"), "ㅈ");
  assert.equal(ENGINE.leadJamo("먹"), "ㅁ");
  assert.equal(ENGINE.leadJamo("다"), "ㄷ");
});

test("1 syllabe : jamais le mot entier — seulement l'attaque (jamo), plafonné rec4", () => {
  for (const n of [0, 1, 2, 3, 7]) {
    const p = ENGINE.hintPlan("물", n);
    assert.equal(p.tiles.length, 1);
    assert.deepEqual(types(p), ["jamo"]);
    assert.equal(p.tiles[0].ch, "ㅁ");
    assert.equal(p.meaningful, true);
  }
});

test("verbe 2 syll en 다 : alterne radical-masqué (rec4) et 다-montré (rec5)", () => {
  const even = ENGINE.hintPlan("먹다", 0);          // revealSyl 0 = radical
  assert.deepEqual(types(even), ["jamo", "hide"]);
  assert.equal(even.tiles[0].ch, "ㅁ");             // radical réduit à son attaque
  assert.equal(even.meaningful, true);             // indice signifiant -> rec4 (plafonné)
  const odd = ENGINE.hintPlan("먹다", 1);           // revealSyl 1 = 다
  assert.deepEqual(types(odd), ["hide", "show"]);
  assert.equal(odd.tiles[1].ch, "다");
  assert.equal(odd.meaningful, false);             // 다 = rien -> rec5 (rappel quasi-libre)
});

test("nom 2 syll : montre un bloc ENTIER qui tourne, jamais de jamo", () => {
  const a = ENGINE.hintPlan("가족", 0);
  assert.deepEqual(types(a), ["show", "hide"]);
  assert.equal(a.tiles[0].ch, "가");
  assert.equal(a.meaningful, true);
  const b = ENGINE.hintPlan("가족", 1);
  assert.deepEqual(types(b), ["hide", "show"]);
  assert.equal(b.tiles[1].ch, "족");
});

test("nom 3 syll : la position révélée tourne 0,1,2 puis reboucle", () => {
  const w = "사무실";
  assert.equal(ENGINE.hintPlan(w, 0).revealSyl, 0);
  assert.equal(ENGINE.hintPlan(w, 1).revealSyl, 1);
  assert.equal(ENGINE.hintPlan(w, 2).revealSyl, 2);
  assert.equal(ENGINE.hintPlan(w, 3).revealSyl, 0);
  assert.equal(ENGINE.hintPlan(w, 0).tiles.filter(t => t.t === "show").length, 1); // un seul bloc entier, jamais giveaway
  assert.equal(ENGINE.hintPlan(w, 0).meaningful, true);
});

test("verbe 3 syll en 다 (아프다) : montrer le radical NE donne pas le mot -> bloc entier", () => {
  const p0 = ENGINE.hintPlan("아프다", 0);   // 아 : reste 프 caché (다 prévisible) -> pas giveaway
  assert.deepEqual(types(p0), ["show", "hide", "hide"]);
  assert.equal(p0.meaningful, true);
  const p2 = ENGINE.hintPlan("아프다", 2);   // 다
  assert.deepEqual(types(p2), ["hide", "hide", "show"]);
  assert.equal(p2.meaningful, false);
});

test("espaces -> gap ; les blocs sont comptés hors espaces", () => {
  const p = ENGINE.hintPlan("어서 오세요", 0);
  assert.ok(p.tiles.some(t => t.t === "gap"));
  assert.equal(p.S, 5);
});

test("rotation robuste pour n négatif ou non entier", () => {
  assert.equal(ENGINE.hintPlan("사무실", -1).revealSyl, 2);
  assert.doesNotThrow(() => ENGINE.hintPlan("사무실", 2.7));
});

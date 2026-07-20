/* Verrouille ENGINE.slotPlan (v103, thème « Takbon ») : le plan des creux à toucher pour révéler.
   Un creux par syllabe pour un MOT hangul court (le mot se presse dedans — maquette validée) ;
   UN creux large — qui ne révèle rien de la structure — dès qu'il y a un espace, un caractère
   non-hangul, ou plus de 4 syllabes (revue v103 : 5 creux de 62px + retraits = 350px,
   déborde les écrans Android ~332px de largeur utile ; 4 creux = 278px, ça passe partout).
   Lancer : node --test tests/slot.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import ENGINE from "../docs/engine.js";

test("mot simple : un creux par syllabe", () => {
  assert.deepEqual(ENGINE.slotPlan("찾다"),   { mode: "tiles", n: 2 });
  assert.deepEqual(ENGINE.slotPlan("약속"),   { mode: "tiles", n: 2 });
  assert.deepEqual(ENGINE.slotPlan("물"),     { mode: "tiles", n: 1 });
  assert.deepEqual(ENGINE.slotPlan("사무실"), { mode: "tiles", n: 3 });
});

test("phrase (espace interne) : creux large — le compte de blocs n'est pas exposé", () => {
  assert.deepEqual(ENGINE.slotPlan("어서 오세요"), { mode: "wide", n: 0 });
  assert.deepEqual(ENGINE.slotPlan("손을 씻다"),   { mode: "wide", n: 0 });
});

test("mot long : 4 syllabes = limite incluse, 5 = creux large (largeur d'écran)", () => {
  assert.deepEqual(ENGINE.slotPlan("가나다라"),     { mode: "tiles", n: 4 });
  assert.deepEqual(ENGINE.slotPlan("설거지하다"),   { mode: "wide",  n: 0 });   // 5 syllabes, mot réel du deck
  assert.deepEqual(ENGINE.slotPlan("가나다라마바"), { mode: "wide",  n: 0 });
});

test("caractère non-hangul mêlé : creux large (des tuiles seraient infidèles)", () => {
  assert.deepEqual(ENGINE.slotPlan("MT"),    { mode: "wide", n: 0 });
  assert.deepEqual(ENGINE.slotPlan("1시"),   { mode: "wide", n: 0 });
  assert.deepEqual(ENGINE.slotPlan("먹다!"), { mode: "wide", n: 0 });
});

test("robustesse : vide / null / espaces seuls → creux large, sans lever", () => {
  assert.doesNotThrow(() => ENGINE.slotPlan(null));
  assert.deepEqual(ENGINE.slotPlan(""),   { mode: "wide", n: 0 });
  assert.deepEqual(ENGINE.slotPlan("  "), { mode: "wide", n: 0 });
  assert.deepEqual(ENGINE.slotPlan(null), { mode: "wide", n: 0 });
});

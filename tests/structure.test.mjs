/* Tests de l'ordre à difficulté croissante de l'exercice « Structure de phrase » (docs/structure.js).
   rampOrder(n, rng, win) : permutation de [0..n-1] mélangée PAR FENÊTRES, pour parcourir un pool
   trié facile->dur en gardant les faciles d'abord tout en variant l'ordre d'une série à l'autre. */
import test from "node:test";
import assert from "node:assert/strict";
import SORI_STRUCTURE from "../docs/structure.js";

const { rampOrder } = SORI_STRUCTURE.pure;

// PRNG déterministe (mulberry32) pour des tests reproductibles sans dépendre de Math.random.
function mulberry32(seed){
  return function(){
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("rampOrder : permutation exacte de [0..n-1] (aucun index perdu ni dupliqué)", () => {
  for(const n of [0, 1, 5, 6, 7, 13, 100, 981]){
    const ord = rampOrder(n, mulberry32(1), 6);
    assert.equal(ord.length, n, `taille pour n=${n}`);
    const seen = new Array(n).fill(false);
    for(const v of ord){
      assert.ok(Number.isInteger(v) && v >= 0 && v < n, `index hors bornes: ${v} (n=${n})`);
      assert.ok(!seen[v], `doublon: ${v} (n=${n})`);
      seen[v] = true;
    }
  }
});

test("rampOrder : les faciles d'abord — chaque fenêtre de sortie ne contient que ses index d'entrée", () => {
  // Propriété clé : le pool est trié facile->dur ; on ne doit JAMAIS remonter une phrase difficile
  // dans une fenêtre antérieure. La fenêtre [s..end) de sortie = exactement les index {s..end-1}.
  for(const [n, win] of [[30, 6], [100, 6], [13, 5], [981, 6]]){
    const ord = rampOrder(n, mulberry32(42), win);
    for(let s = 0; s < n; s += win){
      const end = Math.min(s + win, n);
      const block = ord.slice(s, end).sort((a, b) => a - b);
      for(let i = 0; i < block.length; i++)
        assert.equal(block[i], s + i, `n=${n} win=${win} fenêtre@${s} : ${block}`);
    }
  }
});

test("rampOrder : déterministe pour une graine donnée", () => {
  const a = rampOrder(50, mulberry32(7), 6);
  const b = rampOrder(50, mulberry32(7), 6);
  assert.deepEqual(a, b, "même graine -> même ordre");
});

test("rampOrder : mélange bien à l'intérieur d'une fenêtre (pas l'identité)", () => {
  // Sur une fenêtre unique couvrant tout, l'ordre ne doit pas rester 0,1,2,...
  const ord = rampOrder(12, mulberry32(3), 12);
  assert.ok(!ord.every((v, i) => v === i), "devrait être mélangé, pas l'identité");
});

test("rampOrder : win par défaut (6) si absent ou invalide", () => {
  const def = rampOrder(20, mulberry32(5), 6);
  assert.deepEqual(rampOrder(20, mulberry32(5)),    def, "win absent -> 6");
  assert.deepEqual(rampOrder(20, mulberry32(5), 0), def, "win<=0 -> 6");
  assert.deepEqual(rampOrder(20, mulberry32(5), -3), def, "win négatif -> 6");
});

test("rampOrder : cas limites n=0 et n=1", () => {
  assert.deepEqual(rampOrder(0, mulberry32(1), 6), []);
  assert.deepEqual(rampOrder(1, mulberry32(1), 6), [0]);
});

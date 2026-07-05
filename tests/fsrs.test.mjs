/* Tests du planificateur FSRS (docs/engine.js) — node --test tests/
   Vérifie les formules FSRS-5 (valeurs connues) + les propriétés du modèle DSR
   + la fonction d'orchestration fsrsSchedule (carte neuve / migration / échec / re-vu). */
import test from "node:test";
import assert from "node:assert/strict";
import ENGINE from "../docs/engine.js";

const { fsrsR, fsrsIntervalDays, fsrsNextInterval, fsrsInitS, fsrsInitD, fsrsNextD,
        fsrsSuccS, fsrsFailS, easeToD, fsrsSchedule, FSRS, addDays } = ENGINE;
const W = FSRS.W;
const approx = (a, b, eps=1e-6) => Math.abs(a - b) <= eps;

test("FSRS courbe d'oubli : R = 0.9 quand t = S", () => {
  for(const S of [1, 3.173, 10, 50, 500]){
    assert.ok(approx(fsrsR(S, S), 0.9, 1e-6), `R(${S},${S})=${fsrsR(S,S)}`);
  }
  // R décroît strictement avec le temps
  assert.ok(fsrsR(1, 10) > fsrsR(5, 10));
  assert.ok(fsrsR(5, 10) > fsrsR(20, 10));
  // borne : R ∈ (0,1]. Traîne ÉPAISSE (loi de puissance FSRS, pas exponentielle) :
  // R(1000,10) ≈ 0.20 — la mémoire décroît lentement, propriété clé du modèle.
  assert.ok(fsrsR(0, 10) === 1);
  assert.ok(fsrsR(1000, 10) > 0.15 && fsrsR(1000, 10) < 0.25);
  assert.ok(fsrsR(10000, 10) < 0.1);   // très loin dans la traîne
});

test("FSRS intervalle : à rétention 0.9, intervalle = stabilité", () => {
  for(const S of [1, 3.173, 10, 42, 300]){
    assert.ok(approx(fsrsIntervalDays(S, 0.9), S, 1e-6), `I(${S})=${fsrsIntervalDays(S,0.9)}`);
  }
  assert.equal(fsrsNextInterval(10, 0.9, 120), 10);
  // rétention plus haute -> intervalle plus court
  assert.ok(fsrsIntervalDays(100, 0.95) < fsrsIntervalDays(100, 0.90));
  assert.ok(fsrsIntervalDays(100, 0.80) > fsrsIntervalDays(100, 0.90));
  // clamps : min 1, plafond respecté
  assert.equal(fsrsNextInterval(0.2, 0.9, 120), 1);
  assert.equal(fsrsNextInterval(100000, 0.9, 120), 120);
});

test("FSRS stabilité/difficulté initiales (valeurs des poids)", () => {
  assert.ok(approx(fsrsInitS(1, W), W[0]));
  assert.ok(approx(fsrsInitS(2, W), W[1]));
  assert.ok(approx(fsrsInitS(3, W), W[2]));
  assert.ok(approx(fsrsInitS(4, W), W[3]));
  // difficulté initiale : Again (dur) > Good > Easy (facile), bornée [1,10]
  const d1 = fsrsInitD(1, W), d3 = fsrsInitD(3, W), d4 = fsrsInitD(4, W);
  assert.ok(d1 > d3 && d3 > d4, `${d1},${d3},${d4}`);
  assert.ok(d1 >= 1 && d1 <= 10 && d4 >= 1 && d4 <= 10);
});

test("FSRS mise à jour de la stabilité : croît sur succès, ≤ S sur oubli", () => {
  const D = 5, S = 10;
  // succès -> S augmente
  assert.ok(fsrsSuccS(D, S, 0.9, 3, W) > S);
  // oubli -> S post-lapse ≤ S
  assert.ok(fsrsFailS(D, S, 0.9, W) <= S);
  // plus la récupérabilité était basse au rappel, plus le gain de stabilité est grand
  assert.ok(fsrsSuccS(D, S, 0.70, 3, W) > fsrsSuccS(D, S, 0.95, 3, W));
  // une carte plus difficile gagne moins de stabilité
  assert.ok(fsrsSuccS(9, S, 0.9, 3, W) < fsrsSuccS(2, S, 0.9, 3, W));
  // Easy > Good > Hard en gain de stabilité
  assert.ok(fsrsSuccS(D, S, 0.9, 4, W) > fsrsSuccS(D, S, 0.9, 3, W));
  assert.ok(fsrsSuccS(D, S, 0.9, 3, W) > fsrsSuccS(D, S, 0.9, 2, W));
});

test("FSRS difficulté : Again durcit, Easy assouplit, bornée", () => {
  const D = 5;
  assert.ok(fsrsNextD(D, 1, W) > D);   // Again -> plus dur
  assert.ok(fsrsNextD(D, 4, W) < D);   // Easy -> plus facile
  for(const g of [1,2,3,4]){
    const d = fsrsNextD(9.8, g, W);
    assert.ok(d >= 1 && d <= 10, `D hors bornes: ${d}`);
  }
});

test("easeToD : ease Sori -> difficulté FSRS (inversé, borné)", () => {
  assert.ok(easeToD(1.3) > 9.5);   // ease minimale = très difficile
  assert.ok(easeToD(3.0) < 1.5);   // ease maximale = très facile
  assert.ok(easeToD(2.2) > 4 && easeToD(2.2) < 7);
  assert.ok(easeToD(1.3) > easeToD(2.2) && easeToD(2.2) > easeToD(3.0));
});

test("fsrsSchedule : carte NEUVE (sans historique)", () => {
  const it = { stage:1, itv:0, due:null, ok:0, ko:0 };
  const r = fsrsSchedule(it, 3, "2026-07-06");   // succès
  assert.ok(approx(r.S, W[2], 1e-3));            // S0 = poids Good
  assert.ok(r.i >= 1);
  assert.equal(r.d, addDays("2026-07-06", r.i));
  assert.equal(r.stage, 2);                      // le stade monte
  // échec sur carte neuve -> re-vu en session
  const f = fsrsSchedule(it, 1, "2026-07-06");
  assert.equal(f.i, 0);
  assert.equal(f.d, "2026-07-06");
  assert.equal(f.stage, 1);                      // max(1, 1-2)
});

test("fsrsSchedule : MIGRATION d'une carte existante (S amorcée depuis l'intervalle)", () => {
  // carte revue il y a 4 j, intervalle prévu 4 j, jamais de S -> amorçage
  const it = { stage:3, itv:4, due:"2026-07-06", ok:6, ko:1, e:2.2 };
  const r = fsrsSchedule(it, 3, "2026-07-10");   // +4 j, à l'heure, succès compté
  assert.equal(r.counted, true);
  assert.ok(r.S > 4);                             // S amorcée ~4 puis augmentée par le succès
  assert.ok(r.i >= 1 && r.i <= 120);
  assert.equal(r.stage, 4);
  // échec compté -> S post-lapse plus petite, re-vu en session
  const f = fsrsSchedule(it, 1, "2026-07-10");
  assert.equal(f.i, 0); assert.equal(f.d, "2026-07-10");
  assert.ok(f.S <= 4.001);                        // post-lapse ≤ S amorcée
});

test("fsrsSchedule : re-vu de SESSION (elapsed 0) gèle S", () => {
  // itv:0 + due aujourd'hui = carte ré-échue en session le jour même (prevReviewDate = due)
  const it = { stage:4, itv:0, due:"2026-07-06", ok:10, ko:0, S:20, D:4 };
  const r = fsrsSchedule(it, 3, "2026-07-06");   // même jour que la révision notée
  assert.ok(approx(r.S, 20, 1e-6));               // S inchangée (gelée)
  assert.equal(r.counted, false);
  assert.ok(r.i >= 1);
});

test("fsrsSchedule : invariants (pas de mutation, pas de NaN, succès répétés font croître S)", () => {
  const it = { stage:2, itv:2, due:"2026-07-06", ok:3, ko:0, S:5, D:5 };
  const snap = JSON.stringify(it);
  const r = fsrsSchedule(it, 3, "2026-07-08");
  assert.equal(JSON.stringify(it), snap);         // entrée non mutée
  for(const k of ["S","D","i"]) assert.ok(Number.isFinite(r[k]), `${k} NaN`);
  // 5 succès comptés à l'heure -> S croît de façon monotone, intervalle croît
  let cur = { stage:1, itv:0, due:null, ok:0, ko:0 }, day = "2026-07-06", lastS = 0, lastI = 0;
  for(let n=0;n<5;n++){
    const res = fsrsSchedule(cur, 3, day, { retention: 0.9 });
    assert.ok(res.S >= lastS, `S non monotone: ${res.S} < ${lastS}`);
    assert.ok(res.i >= lastI - 0, `i régresse`);
    lastS = res.S; lastI = res.i;
    cur = { stage: res.stage, itv: res.i, due: res.d, ok: cur.ok+1, ko: 0, S: res.S, D: res.D };
    day = res.d;
  }
  assert.ok(lastS > 10, `S finale trop basse: ${lastS}`);
});

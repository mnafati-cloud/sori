/* Tests de l'algorithme adaptatif (ALGORITHM.md) — node --test tests/
   Couvre : équivalence phase 1, divergences assumées (figées), clamps,
   gel de session, boss fight, trou i=0, échec tardif atténué, seed dépollué,
   plancher stage 5 scalé, leech, dérive déterministe, retention7, charge 90 j. */
import test from "node:test";
import assert from "node:assert/strict";
import ENGINE from "../docs/engine.js";

const { addDays, computeAnswer, computeAnswerLegacy, easeOf, isLeech, prevReviewDate,
        retention7, EASE, STEP } = ENGINE;
const D0 = "2026-07-10";

/* item planifié : dernière revue à `reviewedOn`, intervalle itv -> due = reviewedOn+itv */
function mk(stage, itv, reviewedOn, extra){
  return Object.assign({ id:"x", stage, itv, due: itv>=1 ? addDays(reviewedOn, itv) : reviewedOn,
                         ok:0, ko:0 }, extra||{});
}
function sched(r){ return { s:r.s, i:r.i, d:r.d }; }

/* ---------- 1. équivalence à l'heure, stages 0-4 (e neutre) ---------- */
test("adaptive à l'heure ≡ legacy pour les stages 1-4 (e neutre, n<4)", () => {
  for (const [stage, itv] of [[1,0],[2,1],[3,2],[4,4]]){
    for (const ok of [true, false]){
      const reviewed = addDays(D0, -Math.max(itv,0));
      const it = mk(stage, itv, reviewed);            // due = D0 pour itv>=1
      const today = itv>=1 ? it.due : addDays(it.due, 1);   // à l'heure (échec: dès le lendemain)
      const r  = computeAnswer(it, ok, today, true);
      const lg = computeAnswerLegacy(it, ok, today);
      assert.deepEqual(sched(r), lg, `stage ${stage} ok=${ok}`);
    }
  }
});

/* ---------- 2. adaptive=false ≡ legacy sur TOUS les cas (garantie phase 1) ---------- */
test("phase 1 (adaptive=false) : planification bit-à-bit legacy, même en retard/anticipé", () => {
  const cases = [
    mk(2, 1, addDays(D0,-1)),                       // à l'heure
    mk(4, 4, addDays(D0,-1)),                       // anticipé (elapsed 1 < 3)
    mk(5, 22, addDays(D0,-26)),                     // en retard de 4 j
    mk(5, 120, addDays(D0,-200), {e:3.0}),          // extrême
    mk(1, 0, addDays(D0,-10)),                      // trou après échec
  ];
  for (const it of cases){
    for (const ok of [true, false]){
      const r = computeAnswer(it, ok, D0, false);
      assert.deepEqual(sched(r), computeAnswerLegacy(it, ok, D0));
    }
  }
});

/* ---------- 3. divergences ASSUMÉES en adaptatif — comportement figé ---------- */
test("divergence figée : stage 5 en retard (itv=22, +4 j, e stocké 2.2) -> i=54 (legacy 48)", () => {
  const it = mk(5, 22, addDays(D0,-26), {e:2.2});   // elapsed 26, late 4
  const r = computeAnswer(it, true, D0, true);
  // e: succès compté -> 2.25 ; base=min(44, 22+2)=24 ; i=round(24*2.25)=54
  assert.equal(r.e, 2.25);
  assert.equal(r.i, 54);
  assert.equal(computeAnswerLegacy(it, true, D0).i, 48);
});
test("divergence figée : stage 5 à l'heure (itv=14) -> i=32 (legacy 31, gain d'ease appliqué)", () => {
  const it = mk(5, 14, addDays(D0,-14));            // e absent, n<4 -> 2.2 ; compté -> 2.25
  const r = computeAnswer(it, true, D0, true);
  assert.equal(r.i, Math.round(14*2.25));           // 32
});

/* ---------- 4. clamps & invariants ---------- */
test("invariants : e ∈ [1.3,3.0] arrondi, i ∈ [1,120] sur succès, échec -> {i:0,d:today}, pas de NaN, entrée non mutée", () => {
  const grid = [];
  for (const stage of [0,1,2,3,4,5])
    for (const itv of [0,1,2,4,8,14,40,120])
      for (const e of [undefined, 1.3, 2.2, 3.0])
        for (const days of [0, 1, itv, itv+30])
          grid.push({ it: mk(stage, itv, addDays(D0,-days), e===undefined?{}:{e}), days });
  // + item jamais planifié (due absent)
  grid.push({ it: { id:"n", stage:0, itv:0, due:null, ok:0, ko:0 }, days:0 });

  for (const {it} of grid){
    const frozen = JSON.stringify(it);
    for (const ok of [true, false]){
      for (const adaptive of [true, false]){
        const r = computeAnswer(it, ok, D0, adaptive);
        assert.ok(r.e >= 1.3 && r.e <= 3.0, "e clampée");
        assert.equal(r.e, Math.round(r.e*100)/100, "e arrondie 2 déc.");
        assert.ok(!Number.isNaN(r.i) && !Number.isNaN(r.s), "pas de NaN");
        if (!ok){ assert.equal(r.i, 0); assert.equal(r.d, D0); assert.equal(r.iAdaptive, 0); }
        else if (adaptive && !r.early){ assert.ok(r.i >= 1 && r.i <= 120, "i borné"); }
      }
    }
    assert.equal(JSON.stringify(it), frozen, "entrée jamais mutée");
  }
});
test("monotonie du crédit de retard : plus l'écart survécu est long, plus i est grand (borné ×2)", () => {
  let prev = 0;
  for (const days of [2, 4, 6, 10, 30]){
    const it = mk(3, 2, addDays(D0,-days));         // stage 3->4, palier ~4
    const r = computeAnswer(it, true, D0, true);
    assert.ok(r.i >= prev, `i(${days}) >= i précédent`);
    const ladder = Math.max(1, Math.round((STEP[4]||1) * r.e / 2.2));
    assert.ok(r.i <= Math.max(ladder, EASE.LATE_CREDIT_CAP * ladder), "crédit borné ×2 palier");
    prev = r.i;
  }
});

/* ---------- 6. gel de session ---------- */
test("gel de session : le 2e échec du même jour ne rebaisse pas l'ease", () => {
  const it1 = mk(4, 4, addDays(D0,-4), {e:2.2, ko:1});
  const r1 = computeAnswer(it1, false, D0, true);   // échec espacé : pleine perte
  assert.equal(r1.e, Math.round((2.2 - EASE.EASE_LOSS)*100)/100);   // 1.96
  const it2 = mk(r1.s, r1.i, D0, {e:r1.e, ko:2});   // itv=0, due=D0 -> re-vu le même jour
  const r2 = computeAnswer(it2, false, D0, true);   // elapsed=0 -> ease gelée
  assert.equal(r2.e, r1.e);
  assert.equal(r2.counted, false);
});

/* ---------- 7. boss fight ---------- */
test("boss fight : 3 succès anticipés consécutifs -> s,i,d,e strictement inchangés", () => {
  const it0 = mk(4, 9, addDays(D0,-3), {e:2.2});    // due dans 6 j
  let it = it0;
  for (let day = 0; day < 3; day++){
    const today = addDays(D0, day);                 // elapsed 3,4,5 < 0.75*9=6.75
    const r = computeAnswer(it, true, today, true);
    assert.equal(r.early, true);
    assert.equal(r.counted, false);
    assert.deepEqual(sched(r), { s: it0.stage, i: it0.itv, d: it0.due });
    assert.equal(r.e, 2.2);
    it = Object.assign({}, it, { s:r.s, itv:r.i, due:r.d, e:r.e, stage:r.s });
  }
});
test("boss fight : échec l'après-midi d'un succès noté -> stage-2, due=today, ease gelée", () => {
  const it = mk(4, 4, D0, {e:2.3});                 // revu (succès) aujourd'hui -> prevReview=D0
  const r = computeAnswer(it, false, D0, true);     // elapsed=0
  assert.equal(r.s, 2); assert.equal(r.d, D0);
  assert.equal(r.e, 2.3);                           // gelée
});

/* ---------- 8. trou i=0 : plus de gel à vie ---------- */
test("item échoué sans re-vu, repris 10 j après : compté, crédit borné, ease +0.05", () => {
  const it = mk(1, 0, addDays(D0,-10), {e:2.2, ok:2, ko:1});   // due = jour de l'échec
  const r = computeAnswer(it, true, D0, true);
  assert.equal(r.counted, true);
  assert.equal(r.e, 2.25);
  const ladder = Math.max(1, Math.round((STEP[2]||1) * 2.25 / 2.2));   // 1
  assert.equal(r.i, Math.max(ladder, Math.min(Math.floor(10/2), 2*ladder)));  // max(1, min(5,2)) = 2
});

/* ---------- 9. échec tardif atténué ---------- */
test("échec : à l'heure = pleine perte ; très en retard = perte atténuée", () => {
  const onTime = computeAnswer(mk(3, 2, addDays(D0,-2), {e:2.2}), false, D0, true);
  assert.equal(onTime.e, 1.96);                                  // 2.2 - 0.244
  const late = computeAnswer(mk(3, 2, addDays(D0,-13), {e:2.2}), false, D0, true);
  assert.equal(late.e, Math.round((2.2 - EASE.EASE_LOSS*2/13)*100)/100);   // ≈ 2.16
  assert.ok(late.e > onTime.e);
});

/* ---------- 10. seed dépollué ---------- */
test("easeOf : seed dérivé de ok/ko, dépollué des re-vus", () => {
  assert.equal(easeOf({ok:8,  ko:8}),  1.6);    // acc 0.5 -> p 0
  assert.equal(easeOf({ok:8,  ko:4}),  1.6);    // acc 0.667 -> p 0.5 -> 1.408 clampé 1.6
  assert.equal(easeOf({ok:8,  ko:1}),  2.31);   // acc 0.889 -> p 0.875
  assert.equal(easeOf({ok:20, ko:0}),  2.61);   // acc 1 -> p 1
  assert.equal(easeOf({ok:2,  ko:1}),  2.2);    // n<4 -> neutre
  assert.equal(easeOf({ok:0,  ko:5}),  1.6);    // acc 0 : pas de NaN
  assert.equal(easeOf({ok:0,  ko:0}),  2.2);
  assert.equal(easeOf({ok:8,  ko:8, e:2.7}), 2.7);   // e stocké prime
});

/* ---------- 11. plancher stage 5 scalé ---------- */
test("ennemie (e=1.3) : graduation douce vers stage 5 puis plancher 8 j (plus de saut ×2.8)", () => {
  const grad = computeAnswer(mk(4, 4, addDays(D0,-4), {e:1.25}), true, D0, true);
  // e gelée au plancher 1.3 (clamp), compté -> 1.35 ; ladder=round(8*1.35/2.2)=5
  assert.equal(grad.s, 5);
  assert.equal(grad.i, 5);
  const s5 = computeAnswer(mk(5, 5, addDays(D0,-5), {e:1.25}), true, D0, true);
  const floor5 = Math.round(14 * s5.e / 2.2);       // 1.35 -> 9
  assert.equal(s5.i, Math.max(floor5, Math.round(5 * s5.e)));
  assert.ok(s5.i <= 14, "plus de saut au plancher legacy 14");
});

/* ---------- 12. leech ---------- */
test("isLeech : plancher + ko>=8 seulement", () => {
  assert.equal(isLeech({e:1.3, ko:8, ok:2}), true);
  assert.equal(isLeech({e:1.3, ko:3, ok:2}), false);
  assert.equal(isLeech({e:2.0, ko:12, ok:2}), false);
  assert.equal(isLeech({ok:8, ko:8}), false);       // seed 1.6 > plancher
});

/* ---------- 13. dérive déterministe ---------- */
function drift(pattern, n){
  // pattern: nombre de succès entre deux échecs ; révisions comptées à l'heure, stage 5
  let e = 2.2, itv = 14, reviewed = "2026-01-05", today, k = 0, ko = 0;
  for (let i = 0; i < n; i++){
    today = addDays(reviewed, itv);
    const ok = (k < pattern); k = (k + 1) % (pattern + 1);
    const it = { id:"d", stage:5, itv, due: today, ok:i, ko, e };
    const r = computeAnswer(it, ok, today, true);
    e = r.e; if (!ok){ ko++; itv = 1; reviewed = today; }        // échec: re-vu le lendemain (compté)
    else { itv = Math.min(30, r.i); reviewed = today; }          // borne la boucle
  }
  return { e, ko };
}
test("dérive : ~83% reste en bande saine, ~87% monte, ~75% coule au plancher (et leech)", () => {
  /* NB : l'arrondi 2 déc. des pertes (x - 0.244 se termine par ...6, arrondi vers le haut)
     crée un léger biais haussier (+0.002/rev mesuré à p=83%) — borné, dans la spec (±0.01/rev). */
  const p83 = drift(5, 200);                        // 5 succès / 1 échec ≈ 83.3%
  assert.ok(p83.e > 1.9 && p83.e < 2.9, `e83=${p83.e} : ni plancher ni plafond`);
  const p87 = drift(7, 200);                        // 87.5%
  assert.ok(p87.e >= 2.7, `e87=${p87.e} : dérive haute nette`);
  const p75 = drift(3, 200);                        // 75%
  assert.ok(p75.e <= 1.5, `e75=${p75.e} : mot dur -> intervalles courts`);
  assert.ok(p75.ko >= 8 && isLeech({e:p75.e, ko:p75.ko}), "mot dur -> leech");
  assert.ok(p87.e > p83.e && p83.e > p75.e, "ordre strict par difficulté");
});

/* ---------- 14 (allégé). charge : l'adaptatif n'explose pas la pile ---------- */
test("simulation 90 j : charge adaptative <= 1.25x legacy ; les mots durs vus plus souvent", () => {
  function sim(adaptive){
    const items = [];
    for (let i = 0; i < 60; i++)
      items.push({ id:"i"+i, stage:3, itv:2, due:"2026-01-02", ok:4, ko:0,
                   p: i%3===0 ? 0.6 : (i%3===1 ? 0.8 : 0.9), seen:0, e:undefined });
    let rng = 42;
    const rand = () => { rng = (rng*1103515245 + 12345) % 2147483648; return rng/2147483648; };
    let reviews = 0;
    for (let day = 0; day < 90; day++){
      const today = addDays("2026-01-02", day);
      if (day % 7 === 6) continue;                  // trous hebdomadaires
      for (const it of items){
        if (!it.due || it.due > today) continue;
        const ok = rand() < it.p;
        const r = computeAnswer(it, ok, today, adaptive);
        it.stage=r.s; it.itv=r.i; it.due = ok ? r.d : addDays(today,1);  // échec: repris demain
        it.e=r.e; it.seen++; if(ok) it.ok++; else it.ko++;
        reviews++;
      }
    }
    const hard = items.filter(x=>x.p===0.6).reduce((s,x)=>s+x.seen,0)/20;
    const easy = items.filter(x=>x.p===0.9).reduce((s,x)=>s+x.seen,0)/20;
    return { reviews, hard, easy };
  }
  const leg = sim(false), ada = sim(true);
  assert.ok(ada.reviews <= 1.25 * leg.reviews, `charge ${ada.reviews} vs legacy ${leg.reviews}`);
  assert.ok(ada.hard >= 1.3 * ada.easy, `durs ${ada.hard} vs faciles ${ada.easy}`);
});

/* ---------- 15. retention7 ---------- */
test("retention7 : fenêtre hier->J-7, fallback ok/ko, null si vide", () => {
  const log = {};
  log[addDays(D0,-1)] = { ok1:8, ko1:2, ok:20, ko:10, n:30 };    // compteurs propres prioritaires
  log[addDays(D0,-3)] = { ok:6, ko:4, n:10 };                    // fallback anciens jours
  log[D0]             = { ok1:0, ko1:100, ok:0, ko:100, n:100 }; // AUJOURD'HUI : exclu
  log[addDays(D0,-8)] = { ok1:0, ko1:50 };                       // hors fenêtre : exclu
  const { r, n } = retention7(log, D0);
  assert.equal(n, 20);
  assert.ok(Math.abs(r - 14/20) < 1e-9);
  assert.equal(retention7({}, D0).r, null);
});

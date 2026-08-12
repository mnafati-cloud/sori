/* Tests de la RESCOUSSE de rechute (v148, engine.rescueS + opts.streak de fsrsSchedule).
   Contrat : sans streak (ou streak<3), fsrsSchedule est STRICTEMENT identique à avant —
   la rescousse est un plancher opt-in, jamais un changement de comportement historique. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const E = require("../docs/engine.js");

test("rescueS : identité sous 3, plancher progressif ensuite, plafonné à 21", () => {
  assert.equal(E.rescueS(0.5, 0), 0.5);
  assert.equal(E.rescueS(0.5, 1), 0.5);
  assert.equal(E.rescueS(0.5, 2), 0.5);
  assert.equal(E.rescueS(0.5, undefined), 0.5);
  assert.equal(E.rescueS(0.5, 3), 1.5);      // 3 jours parfaits -> >= 1,5 j
  assert.equal(E.rescueS(0.5, 4), 3);        // 4 -> 3 j
  assert.equal(E.rescueS(0.5, 5), 6);
  assert.equal(E.rescueS(0.5, 6), 12);
  assert.equal(E.rescueS(0.5, 7), 21);       // plafonné
  assert.equal(E.rescueS(0.5, 12), 21);
  assert.equal(E.rescueS(30, 5), 30);        // un S déjà au-dessus du plancher ne bouge pas
});

/* carte piégée réaliste (내다 du 06/08) : S=0.6, D=9.3, revue à J+1 */
const TRAPPED = { stage:5, S:0.6, D:9.3, itv:1, due:"2026-08-06", ok:28, ko:11, d:"2026-08-06" };
const OPTS = { retention: 0.9 };

test("fsrsSchedule : sans streak (ou sous le seuil), comportement historique inchangé", () => {
  /* opts.streak = série des jours PRÉCÉDENTS ; l'engine ajoute la réussite du jour.
     streak 0 ou 1 -> 1re/2e réussite consécutive : sous le seuil, identité stricte. */
  const a = E.fsrsSchedule({ ...TRAPPED }, 3, "2026-08-06", { ...OPTS });
  const b = E.fsrsSchedule({ ...TRAPPED }, 3, "2026-08-06", { ...OPTS, streak: 0 });
  const c = E.fsrsSchedule({ ...TRAPPED }, 3, "2026-08-06", { ...OPTS, streak: 1 });
  assert.deepEqual(a, b);
  assert.deepEqual(a, c);
  assert.ok(a.S < 1.5, `croissance naturelle étranglée attendue (S=${a.S})`);
});

test("fsrsSchedule : le plancher s'applique à la 3e réussite consécutive et au-delà", () => {
  const r3 = E.fsrsSchedule({ ...TRAPPED }, 3, "2026-08-06", { ...OPTS, streak: 2 });
  assert.equal(r3.S, 1.5, "streak=2 précédents + réussite du jour = 3 -> S plancher 1,5");
  assert.ok(r3.i >= 1);
  const r4 = E.fsrsSchedule({ ...TRAPPED }, 3, "2026-08-06", { ...OPTS, streak: 3 });
  assert.equal(r4.S, 3, "4e réussite consécutive -> S plancher 3");
  assert.ok(r4.i >= 2, `i=${r4.i} attendu >= 2`);
  const r5 = E.fsrsSchedule({ ...TRAPPED }, 3, "2026-08-06", { ...OPTS, streak: 5 });
  assert.equal(r5.S, 12, "6e -> plancher 12 j");
});

test("fsrsSchedule : jamais de plancher sur un échec ni sur un re-vu non compté", () => {
  const fail = E.fsrsSchedule({ ...TRAPPED }, 1, "2026-08-06", { ...OPTS, streak: 9 });
  assert.ok(fail.S < 0.6, `échec : la stabilité chute, plancher ignoré (S=${fail.S})`);
  assert.equal(fail.i, 0);
  /* re-vu de session (elapsed<1) : S/D gelés, la rescousse n'intervient pas */
  const same = E.fsrsSchedule({ ...TRAPPED, due:"2026-08-07", d:"2026-08-06", itv:1 }, 3, "2026-08-06",
                              { ...OPTS, streak: 9 });
  assert.equal(same.counted, false);
  assert.equal(same.S, 0.6, "re-vu non compté : stabilité intacte, pas de plancher");
});

test("évasion : carte piégée + réponses justes quotidiennes -> < 10 révisions pour 7 j (contre 27 avant)", () => {
  let it = { ...TRAPPED }, day = "2026-08-06", sk = 0, n = 0;
  while(n < 40){
    n++;
    const r = E.fsrsSchedule(it, 3, day, { ...OPTS, streak: sk, fuzz: "x|" + day });
    sk = r.counted ? sk + 1 : sk;
    it = { ...it, S: r.S, D: r.D, itv: r.i, due: r.d, d: day };
    if(r.i >= 7) break;
    day = r.d;
    if(it.itv > 1) sk = 0;   // même règle qu'app.js : la série ne vit qu'à itv<=1
  }
  assert.ok(n <= 10, `évasion en ${n} révisions (attendu <= 10)`);
});

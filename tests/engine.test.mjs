/* Tests du moteur pur de Sori (docs/engine.js) — node --test tests/
   Ces tests verrouillent le comportement CONTRACTUEL de la planification :
   la progression localStorage de l'utilisateur en dépend. Toute rupture
   ici = risque de perte de progression -> le comportement prime. */
import test from "node:test";
import assert from "node:assert/strict";
import ENGINE from "../docs/engine.js";

const { addDays, selectDue, pickNew, computeStreak, pickDistractors, DEF_SET, STEP } = ENGINE;
/* contrat GELÉ : les tests historiques s'appliquent à la planification legacy,
   inchangée à jamais (cf. ALGORITHM.md §2.3). L'extension est testée dans adaptive.test.mjs. */
const computeAnswer = ENGINE.computeAnswerLegacy;

/* RNG déterministe (mulberry32) pour les chemins qui mélangent */
function rng(seed){
  let a = seed >>> 0;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TODAY = "2026-07-03";

/* ================= addDays ================= */

test("addDays : avance et recule, passages de mois et d'année", () => {
  assert.equal(addDays("2026-07-03", 1), "2026-07-04");
  assert.equal(addDays("2026-07-03", -1), "2026-07-02");
  assert.equal(addDays("2026-07-31", 1), "2026-08-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");   // pas bissextile
  assert.equal(addDays("2024-03-01", -1), "2024-02-29");   // bissextile
  assert.equal(addDays("2026-07-03", 0), "2026-07-03");
});

/* ================= computeAnswer ================= */

test("succès : promotion à chaque stage avec l'intervalle STEP du stage atteint", () => {
  // STEP = {2:1, 3:2, 4:4, 5:8}
  for (const [stage, expItv] of [[1, 1], [2, 2], [3, 4], [4, 8]]) {
    const r = computeAnswer({ stage, itv: 99 }, true, TODAY);
    assert.equal(r.s, stage + 1, `stage ${stage} -> ${stage + 1}`);
    assert.equal(r.i, STEP[stage + 1], `itv à l'arrivée au stage ${stage + 1}`);
    assert.equal(r.i, expItv);
    assert.equal(r.d, addDays(TODAY, expItv));
  }
});

test("succès depuis stage 0 : STEP[1] absent -> itv de repli 1", () => {
  const r = computeAnswer({ stage: 0, itv: 0 }, true, TODAY);
  assert.deepEqual(r, { s: 1, i: 1, d: addDays(TODAY, 1) });
});

test("stage 5 : croissance ×2.2 arrondie", () => {
  const r = computeAnswer({ stage: 5, itv: 20 }, true, TODAY);
  assert.deepEqual(r, { s: 5, i: 44, d: addDays(TODAY, 44) });   // round(20*2.2)=44
  const r2 = computeAnswer({ stage: 5, itv: 15 }, true, TODAY);
  assert.equal(r2.i, 33);                                        // round(15*2.2)=33
});

test("stage 5 : plancher 14 jours", () => {
  assert.equal(computeAnswer({ stage: 5, itv: 0 }, true, TODAY).i, 14);
  assert.equal(computeAnswer({ stage: 5, itv: 6 }, true, TODAY).i, 14);  // round(13.2)=13 -> 14
});

test("stage 5 : plafond d'intervalle à 120 jours", () => {
  assert.equal(computeAnswer({ stage: 5, itv: 60 }, true, TODAY).i, 120);   // round(132) -> 120
  assert.equal(computeAnswer({ stage: 5, itv: 120 }, true, TODAY).i, 120);  // reste au plafond
  assert.equal(computeAnswer({ stage: 5, itv: 54 }, true, TODAY).i, 119);   // juste sous le plafond
});

test("échec : rétrogradation de 2 stages, plancher stage 1, dû aujourd'hui", () => {
  for (const [stage, expS] of [[5, 3], [4, 2], [3, 1], [2, 1], [1, 1]]) {
    const r = computeAnswer({ stage, itv: 30 }, false, TODAY);
    assert.equal(r.s, expS, `échec au stage ${stage}`);
    assert.equal(r.i, 0);
    assert.equal(r.d, TODAY);
  }
});

/* ================= selectDue ================= */

function effIt(id, patch) {
  return Object.assign({ id, stage: 1, itv: 0, due: TODAY, kit: false, fr: "fr-" + id, kr: "kr-" + id,
    type: "word", theme: "t", conf: [] }, patch);
}

test("selectDue : bornes de date — échu si due <= today, strictement", () => {
  const items = [
    effIt("past",  { due: "2026-07-01" }),
    effIt("today", { due: TODAY }),
    effIt("tomorrow", { due: "2026-07-04" }),
  ];
  assert.deepEqual(selectDue(items, TODAY), ["past", "today"]);
});

test("selectDue : ignore stage 0 et due vide", () => {
  const items = [
    effIt("new",   { stage: 0, due: TODAY }),      // pas encore introduite
    effIt("nodue", { due: "" }),                   // due falsy -> jamais échue
    effIt("undef", { due: undefined }),
    effIt("ok",    {}),
  ];
  assert.deepEqual(selectDue(items, TODAY), ["ok"]);
});

/* ================= pickNew ================= */

test("pickNew : kit d'abord puis ordre d'id, seulement stage 0, limité aux slots", () => {
  const items = [
    effIt("c", { stage: 0 }),
    effIt("a", { stage: 0 }),
    effIt("b", { stage: 0, kit: true }),
    effIt("d", { stage: 0, kit: true }),
    effIt("z", { stage: 2 }),                      // déjà en cours -> exclue
  ];
  assert.deepEqual(pickNew(items, 10, true), ["b", "d", "a", "c"]);
  assert.deepEqual(pickNew(items, 3, true), ["b", "d", "a"]);   // limite respectée
  assert.deepEqual(pickNew(items, 2, false), ["a", "b"]);       // sans kitFirst : id pur
  assert.deepEqual(pickNew(items, 0, true), []);
  assert.deepEqual(pickNew(items, -3, true), []);
});

/* ================= computeStreak ================= */

test("streak : jours consécutifs en comptant aujourd'hui", () => {
  const log = { "2026-07-03": { n: 5 }, "2026-07-02": { n: 3 }, "2026-07-01": { n: 1 } };
  assert.equal(computeStreak(log, TODAY, addDays), 3);
});

test("streak : aujourd'hui vide -> compte depuis hier sans casser la série", () => {
  const log = { "2026-07-02": { n: 3 }, "2026-07-01": { n: 1 } };
  assert.equal(computeStreak(log, TODAY, addDays), 2);
  // idem si l'entrée du jour existe mais n=0
  assert.equal(computeStreak(Object.assign({ "2026-07-03": { n: 0 } }, log), TODAY, addDays), 2);
});

test("streak : un trou casse la série ; hier vide aussi -> 0", () => {
  const gap = { "2026-07-03": { n: 5 }, "2026-07-01": { n: 9 } };   // 07-02 manquant
  assert.equal(computeStreak(gap, TODAY, addDays), 1);
  assert.equal(computeStreak({ "2026-06-20": { n: 4 } }, TODAY, addDays), 0);
  assert.equal(computeStreak({}, TODAY, addDays), 0);
});

/* ================= pickDistractors ================= */

/* petit deck : thème "food" (4 mots), thème "num" (3 mots), 1 phrase */
const SEED_BY_ID = {};
const ALL_IDS = [];
[
  { id: "f1", fr: "riz",    kr: "밥",     type: "word",   theme: "food" },
  { id: "f2", fr: "eau",    kr: "물",     type: "word",   theme: "food" },
  { id: "f3", fr: "viande", kr: "고기",   type: "word",   theme: "food" },
  { id: "f4", fr: "riz",    kr: "쌀",     type: "word",   theme: "food" },  // même fr que f1
  { id: "n1", fr: "un",     kr: "하나",   type: "word",   theme: "num" },
  { id: "n2", fr: "deux",   kr: "둘",     type: "word",   theme: "num" },
  { id: "n3", fr: "trois",  kr: "셋",     type: "word",   theme: "num" },
  { id: "p1", fr: "Donnez-moi du riz.", kr: "밥 주세요.", type: "phrase", theme: "food" },
].forEach(o => { SEED_BY_ID[o.id] = o; ALL_IDS.push(o.id); });

function item(id, patch) {
  return Object.assign({}, SEED_BY_ID[id], { stage: 3, conf: [] }, patch);
}
const OPTS = () => ({ random: rng(42) });

test("distracteurs : jamais l'item lui-même, jamais deux fois le même id", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const out = pickDistractors(item("f1"), 3, "fr", SEED_BY_ID, ALL_IDS, { random: rng(seed) });
    assert.ok(!out.includes("f1"), "l'item ne se distrait pas lui-même");
    assert.equal(new Set(out).size, out.length, "ids uniques");
    assert.ok(out.length <= 3);
  }
});

test("distracteurs : jamais la même valeur de champ que l'item", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const out = pickDistractors(item("f1"), 6, "fr", SEED_BY_ID, ALL_IDS, { random: rng(seed) });
    assert.ok(!out.includes("f4"), "f4 a le même fr (« riz ») -> exclu");
    for (const id of out) assert.notEqual(SEED_BY_ID[id].fr, "riz");
  }
  // sur le champ kr, f4 redevient éligible (쌀 ≠ 밥)
  const outKr = pickDistractors(item("f1"), 6, "kr", SEED_BY_ID, ALL_IDS, OPTS());
  assert.ok(outKr.includes("f4"));
});

test("distracteurs : les confusions passent en premier dès le stage 2", () => {
  const it = item("f1", { stage: 2, conf: ["n1", "n2"] });
  const out = pickDistractors(it, 3, "fr", SEED_BY_ID, ALL_IDS, OPTS());
  assert.deepEqual(out.slice(0, 2), ["n1", "n2"], "conf en tête, dans l'ordre");
  assert.equal(out.length, 3);
});

test("distracteurs : conf ignorées au stage 1", () => {
  const it = item("f1", { stage: 1, conf: ["n1", "n2"] });
  for (let seed = 1; seed <= 20; seed++) {
    const out = pickDistractors(it, 2, "fr", SEED_BY_ID, ALL_IDS, { random: rng(seed) });
    // stage<2 : cascade thème d'abord -> uniquement des mots food (f2, f3 ; f4 exclu par fr)
    assert.deepEqual(new Set(out), new Set(["f2", "f3"]));
  }
});

test("distracteurs : fallback même thème/type avant le global", () => {
  // n=2 et le thème food offre exactement f2/f3 (f4 exclu par fr identique, p1 exclu par type)
  for (let seed = 1; seed <= 20; seed++) {
    const out = pickDistractors(item("f1"), 2, "fr", SEED_BY_ID, ALL_IDS, { random: rng(seed) });
    assert.equal(out.length, 2);
    for (const id of out) {
      assert.equal(SEED_BY_ID[id].theme, "food", "priorité au même thème");
      assert.equal(SEED_BY_ID[id].type, "word", "et au même type");
    }
  }
});

test("distracteurs : le global (même type) complète quand le thème ne suffit pas", () => {
  const out = pickDistractors(item("f1"), 3, "fr", SEED_BY_ID, ALL_IDS, OPTS());
  assert.equal(out.length, 3);
  const themes = out.map(id => SEED_BY_ID[id].theme);
  assert.ok(themes.includes("num"), "complété hors thème");
  for (const id of out) assert.equal(SEED_BY_ID[id].type, "word", "jamais un autre type");
});

/* ================= constantes exportées ================= */

test("DEF_SET et STEP : valeurs contractuelles", () => {
  assert.deepEqual(DEF_SET, { newPerDay: 12, kitFirst: true, rate: 0.9, listenN: 10,
    sessionMax: 120, mute: false, autoplay: true, adaptive: false, typing: false, report: false,
    exaudio: false, wordgloss: false, reverse: false, scheduler: "fsrs", fsrsRetention: 0.9, grade4: true,
    fsrsPersonal: true, aura: "auto" });   // FSRS + 4 boutons + poids perso + aura adaptée par défaut ; reverse OFF ; reste opt-in
  assert.deepEqual(STEP, { 2: 1, 3: 2, 4: 4, 5: 8 });
});

test("FSRS_W_PERSONAL : forme valide + planification cohérente (Phase B)", () => {
  const { FSRS, fsrsSchedule } = ENGINE;
  const WP = FSRS.W_PERSONAL;
  assert.equal(WP.length, 19, "19 poids (FSRS-5)");
  assert.ok(WP.every(x => typeof x === "number" && isFinite(x)), "tous finis");
  // les poids court-terme (17,18) ne sont pas ajustés → identiques aux génériques
  assert.equal(WP[17], FSRS.W[17]); assert.equal(WP[18], FSRS.W[18]);
  // au moins un poids diffère des génériques (sinon le fit n'a rien changé)
  assert.ok(WP.some((x, i) => x !== FSRS.W[i]), "distinct des génériques");
  // une planification réelle avec les poids perso produit un état sain
  const it = { S: 10, D: 5, stage: 3, itv: 10, ok: 3, ko: 1, due: "2026-07-01" };
  const r = fsrsSchedule(it, 3, "2026-07-10", { w: WP });
  assert.ok(r.S >= FSRS.S_MIN && r.S <= FSRS.S_MAX, "S borné");
  assert.ok(r.D >= 1 && r.D <= 10, "D borné");
  assert.ok(r.i >= 1, "intervalle >= 1");
});

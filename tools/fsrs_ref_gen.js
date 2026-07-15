/* fsrs_ref_gen.js — génère des valeurs de référence du modèle FSRS depuis docs/engine.js.
   Sert à VERROUILLER le portage Python (tools/fsrs_fit.py) : le fit doit reproduire au bit près
   les formules qui tournent réellement sur le téléphone. Sortie = JSON sur stdout.
   Usage : node tools/fsrs_ref_gen.js > tools/fsrs_ref.json  */
const E = require("../docs/engine.js");
const W = E.FSRS.W;

const cases = [];
// forgetting curve R(t,S)
for (const [t, S] of [[1,1],[1,3.173],[2,3.173],[3,10],[7,15.69],[14,30],[30,100],[0.5,5]])
  cases.push({ fn: "fsrsR", args: [t, S], out: E.fsrsR(t, S) });
// interval for retention 0.9 and 0.85
for (const S of [1,3.173,10,50,200])
  for (const Rd of [0.9, 0.85])
    cases.push({ fn: "fsrsIntervalDays", args: [S, Rd], out: E.fsrsIntervalDays(S, Rd) });
// init S / init D par note
for (const G of [1,2,3,4]) {
  cases.push({ fn: "fsrsInitS", args: [G], out: E.fsrsInitS(G) });
  cases.push({ fn: "fsrsInitD", args: [G], out: E.fsrsInitD(G) });
}
// next D
for (const D of [1,3,5,7,9.5])
  for (const G of [1,2,3,4])
    cases.push({ fn: "fsrsNextD", args: [D, G], out: E.fsrsNextD(D, G) });
// success stability
for (const D of [2,5,8])
  for (const S of [1,10,50])
    for (const R of [0.95,0.8,0.6])
      for (const G of [2,3,4])
        cases.push({ fn: "fsrsSuccS", args: [D, S, R, G], out: E.fsrsSuccS(D, S, R, G) });
// fail stability
for (const D of [2,5,8])
  for (const S of [1,10,50])
    for (const R of [0.95,0.6,0.3])
      cases.push({ fn: "fsrsFailS", args: [D, S, R], out: E.fsrsFailS(D, S, R) });
// ease -> D (seed des cartes migrées)
for (const e of [1.3, 1.8, 2.3, 2.5, 3.0, 1.0, 3.5])
  cases.push({ fn: "easeToD", args: [e], out: E.easeToD(e) });

process.stdout.write(JSON.stringify({
  W, DECAY: E.FSRS.DECAY, FACTOR: E.FSRS.FACTOR, S_MIN: E.FSRS.S_MIN, S_MAX: E.FSRS.S_MAX, DR: E.FSRS.DR,
  cases
}, null, 0));

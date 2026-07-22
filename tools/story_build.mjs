/* Sori — story_build.mjs : assemble les chapitres ÉCRITS À LA MAIN en docs/story-data.js.
   Refuse de produire quoi que ce soit si un chapitre ne passe pas les deux plafonds — le corpus
   livré est vérifié par construction, contrairement à une génération en direct.

   Usage : node tools/story_build.mjs <ch1.json> <ch2.json> … [--profil <profil.json>]
   Sortie : docs/story-data.js  (window.STORY_DATA = { saison, chapitres: [...] })

   Chaque chapitre d'entrée : { n, target, title_kr, title_fr, summary_fr, names, sentences, new_words }
   Ce qui est livré est allégé : on ne garde que ce que l'écran lit. */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const GRAMMAR = require(path.join(ROOT, "docs", "grammar.js"));
const STORY = require(path.join(ROOT, "docs", "story.js"));

const argv = process.argv.slice(2);
const pi = argv.indexOf("--profil");
const profPath = pi >= 0 ? argv[pi + 1] : null;
const files = argv.filter((a, i) => a !== "--profil" && i !== (pi >= 0 ? pi + 1 : -1));
if(!files.length){ console.error("usage: node tools/story_build.mjs <ch1.json> … [--profil profil.json]"); process.exit(2); }

function loadSeed(){
  const window = {};
  eval(fs.readFileSync(path.join(ROOT, "docs", "data.js"), "utf8"));
  return Array.isArray(window.SEED) ? window.SEED : window.SEED.items;
}
const seed = loadSeed();
const lexAll = new Set(seed.filter(i => i.type === "word").map(i => i.kr));
const prof = profPath ? JSON.parse(fs.readFileSync(profPath, "utf8")) : null;
/* normalisation COMMUNE avec les lemmes : sans elle, les 107 entrees multi-mots du deck
   (« 손을 씻다 ») ne seraient jamais reconnues */
const N = STORY.pure.normLemma;
const known = new Set((prof ? prof.known.map(w => w.kr)
  : seed.filter(i => i.type === "word" && (i.stage || 0) >= 4).map(i => i.kr)).map(N));
const acquired = prof ? prof.acquired : [];
const byId = Object.fromEntries(GRAMMAR.STRUCTS.map(s => [s.id, s]));
/* Forme attendue d'un chapitre : ni expedie, ni interminable. Le tout premier essai en
   comptait 43 alors que la consigne disait 10-14, et rien ne l'avait vu. */
const MIN_S = 10, MAX_S = 22;

const chapters = files.map(f => JSON.parse(fs.readFileSync(f, "utf8")))
  .sort((a, b) => (a.n || 0) - (b.n || 0));

let bad = 0;
for(const ch of chapters){
  const targets = ch.target ? [].concat(ch.target) : [];
  const problems = STORY.pure.lintChapter(ch, {
    known, allowed: new Set(acquired.concat(targets)), names: ch.names || [],
    tag: kr => GRAMMAR.tagStructures(kr, lexAll),
    labelOf: id => (byId[id] && byId[id].fr) || id,
    minSentences: MIN_S, maxSentences: MAX_S,
  });
  /* la structure cible doit VRAIMENT être exercée : un chapitre qui ne la contient pas
     n'ouvre aucune porte pour l'apprenant */
  const uses = targets.length
    ? (ch.sentences || []).filter(s => GRAMMAR.tagStructures(s.kr, lexAll).some(t => targets.includes(t))).length
    : 0;
  if(problems.length){
    console.error(`ch.${ch.n} : ${problems.length} violation(s)`);
    problems.slice(0, 5).forEach(p => console.error("   " + p));
    bad++;
  }else if(targets.length && uses < 2){
    console.error(`ch.${ch.n} : la structure cible « ${targets.join("+")} » n'apparaît que ${uses} fois (2 minimum)`);
    bad++;
  }else{
    console.log(`ch.${ch.n} : conforme — ${(ch.sentences || []).length} phrases, cible ${targets.join("+") || "aucune"}${targets.length ? ` (${uses} emplois)` : ""}`);
  }
}
if(bad){ console.error(`\n${bad} chapitre(s) non conforme(s) — RIEN n'a été écrit.`); process.exit(1); }

const out = chapters.map(ch => ({
  n: ch.n, target: ch.target || null,
  title_kr: ch.title_kr, title_fr: ch.title_fr, summary_fr: ch.summary_fr || "",
  /* la distribution : l'écran d'ouverture l'affiche, c'est de quoi savoir qui va parler */
  names: ch.names || [],
  sentences: (ch.sentences || []).map(s => ({
    kr: s.kr, fr: s.fr,
    words: (s.words || []).map(w => w.note ? [w.form, w.lemma, w.note] : [w.form, w.lemma]),
  })),
  new_words: (ch.new_words || []).map(w => [w.kr, w.fr]),
}));

const js = `/* Sori — story-data.js : le feuilleton « 이야기 », saison 1. ÉCRIT À LA MAIN puis vérifié
   par tools/story_build.mjs (chaque lemme dans le vocabulaire maîtrisé, chaque structure dans
   l'acquis + la cible du chapitre). Ne pas éditer ici : éditer les sources et relancer l'outil.
   ${out.length} chapitres. Les mots sont compactés en [forme, lemme, note?]. */
(function(root){
  "use strict";
  const STORY_DATA = ${JSON.stringify({ saison: 1, titre_kr: "미소 카페",
    titre_fr: "Le café Miso", chapitres: out })};
  if (typeof module !== "undefined" && module.exports) module.exports = STORY_DATA;
  else root.STORY_DATA = STORY_DATA;
})(typeof self !== "undefined" ? self : this);
`;
const dest = path.join(ROOT, "docs", "story-data.js");
fs.writeFileSync(dest, js, "utf8");
console.log(`\n${dest} écrit : ${out.length} chapitres, ${Math.round(js.length / 1024)} Ko`);

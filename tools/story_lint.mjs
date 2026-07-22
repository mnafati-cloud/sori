/* Sori — story_lint.mjs : vérifie un chapitre ÉCRIT À LA MAIN contre les deux plafonds.
   C'est l'outil de travail de l'auteur (humain ou IA) : on écrit, on lint, on réécrit soi-même
   ce qui déborde — au lieu de demander à un modèle de réparer à l'aveugle en runtime.

   Usage : node tools/story_lint.mjs <chapitre.json> [profil.json]
     chapitre.json = { target?: "id-structure", sentences: [{kr, fr, words:[{form,lemma,note}]}], new_words:[{kr,fr}] }
     profil.json   = { known:[{kr}], acquired:[ids], inProgress:[ids] }  (défaut : profil du deck)

   Sortie : les violations, une par ligne, et un code de retour non nul s'il y en a.
   Le plafond de grammaire = structures acquises + la cible déclarée du chapitre. */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const GRAMMAR = require(path.join(ROOT, "docs", "grammar.js"));
const STORY = require(path.join(ROOT, "docs", "story.js"));

const [, , chapPath, profPath] = process.argv;
if(!chapPath){ console.error("usage: node tools/story_lint.mjs <chapitre.json> [profil.json]"); process.exit(2); }

function loadSeed(){
  const window = {};
  eval(fs.readFileSync(path.join(ROOT, "docs", "data.js"), "utf8"));
  return Array.isArray(window.SEED) ? window.SEED : window.SEED.items;
}
const seed = loadSeed();
const lexAll = new Set(seed.filter(i => i.type === "word").map(i => i.kr));

const prof = profPath ? JSON.parse(fs.readFileSync(profPath, "utf8")) : null;
const known = new Set(prof ? prof.known.map(w => w.kr)
  : seed.filter(i => i.type === "word" && (i.stage || 0) >= 4).map(i => i.kr));
const acquired = prof ? prof.acquired : [];

const chap = JSON.parse(fs.readFileSync(chapPath, "utf8"));
const chapters = Array.isArray(chap) ? chap : [chap];
const byId = Object.fromEntries(GRAMMAR.STRUCTS.map(s => [s.id, s]));

let total = 0;
for(const ch of chapters){
  const targets = ch.target ? [].concat(ch.target) : [];
  const allowed = new Set(acquired.concat(targets));
  const problems = STORY.pure.lintChapter(ch, {
    known, allowed,
    names: ch.names || [],
    tag: kr => GRAMMAR.tagStructures(kr, lexAll),
    labelOf: id => (byId[id] && byId[id].fr) || id,
  });
  const label = ch.n ? `chapitre ${ch.n}` : path.basename(chapPath);
  if(problems.length){
    console.log(`\n=== ${label} : ${problems.length} violation(s) ===`);
    for(const p of problems) console.log("  " + p);
  }else{
    console.log(`${label} : conforme (${(ch.sentences || []).length} phrases, cible ${targets.join("+") || "aucune"})`);
  }
  total += problems.length;
}
process.exit(total ? 1 : 0);

/* Fabrique docs/story-sens.js : le sens français de chaque lemme employé par le feuilleton,
   pour le mot-à-mot de l'écran Histoire.

   Source = le deck lui-même (docs/data.js) + les discriminants de GLOSS_FIX (app.js) : le
   mot-à-mot dit donc exactement ce que disent les cartes, et un discriminant ajouté là-bas
   arrive ici sans rien recopier.

   CORRECTIONS : quelques lemmes sont des HOMOGRAPHES. La glose du deck est le sens appris,
   mais l'histoire en emploie un autre — 시 est l'heure et non la ville, 개 le compteur et non
   le chien, 씨 le titre et non la graine. Sans ces lignes le mot-à-mot enseignerait des
   contresens. Chacune a été vérifiée sur les emplois réels des dix chapitres.
   Relancer après toute vague de contenu :  node tools/story_sens.mjs */
import fs from "node:fs";
import path from "node:path";

const racine = path.resolve(path.dirname(new URL(import.meta.url).pathname
  .replace(/^\/([A-Za-z]:)/, "$1")), "..");
const CHAPITRES = 10;

const CORRECTIONS = {
  "시": "Heure (compteur)",                         /* deck : « Ville (unité administrative) » */
  "개": "Unité (compteur d'objets)",                /* deck : « Chien » */
  "명": "Personne (compteur)",                      /* deck : « Nom, appellation » */
  "말": "Parole, ce qu'on dit",                     /* deck : « Cheval » */
  "위": "Le dessus, sur",                           /* deck : l'organe, avec sa note de polysémie */
  "씨": "Monsieur / Madame (après le prénom)",      /* deck : « Graine, semence » */
  "한": "Un(e) (devant un compteur)",               /* deck : « le han » */
  "네": "Quatre (natif) · « oui »",                 /* deck : « ton, ta » — les deux sens servent */
  "쓰다": "Écrire",                                  /* deck : « Être amer (goût) » */
  "이": "Ce, cette",                                /* deck : « Deux (sino-coréen) » */
  "일": "Travail",                                  /* deck : « Un (sino-coréen) » */
  "수": "Possibilité (…ㄹ 수 있다 : pouvoir)",
  "미소": "Miso, le nom du café (« sourire »)",
  "먹었어요": "Manger", "몰라요": "Ne pas savoir", "알아요": "Savoir",
  /* absents du deck : les personnages, un chiffre, un mot-outil */
  "민수": "Minsu", "태호": "Taeho", "은지": "Eunji", "현우": "Hyunwoo",
  "2": "deux", "어떻게": "Comment",
};

const src = fs.readFileSync(path.join(racine, "docs/data.js"), "utf8");
const SEED = JSON.parse(src.slice(src.indexOf("{"), src.lastIndexOf(";")));
const gloss = {};
for(const it of SEED.items){
  if(it.type !== "word") continue;
  const k = String(it.kr).normalize("NFC");
  if(!gloss[k]) gloss[k] = it.fr;
}
const app = fs.readFileSync(path.join(racine, "docs/app.js"), "utf8");
const m = app.match(/const GLOSS_FIX = \{([\s\S]*?)\n\};/);
if(m) for(const mm of m[1].matchAll(/"([^"]+)":"([^"]*)"/g)) gloss[mm[1].normalize("NFC")] = mm[2];
Object.assign(gloss, CORRECTIONS);

const besoin = new Set();
for(let i = 1; i <= CHAPITRES; i++){
  const ch = JSON.parse(fs.readFileSync(path.join(racine, `story/ch${i}.json`), "utf8"));
  for(const s of ch.sentences) for(const w of s.words) besoin.add(String(w.lemma).normalize("NFC"));
}
const out = {}; const manque = [];
for(const l of [...besoin].sort()){ if(gloss[l]) out[l] = gloss[l]; else manque.push(l); }

fs.writeFileSync(path.join(racine, "docs/story-sens.js"),
  "/* Généré par tools/story_sens.mjs — ne pas éditer à la main */\n"
  + "window.STORY_SENS = " + JSON.stringify(out) + ";\n", "utf8");
console.log("story-sens.js :", Object.keys(out).length, "lemmes | corrigés :",
  Object.keys(CORRECTIONS).length, "| sans sens :", manque.length, manque.join(" "));
if(manque.length) process.exitCode = 1;   /* un mot sans sens = un trou visible dans le mot-à-mot */

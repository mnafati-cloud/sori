/* Sori — story_trial.mjs : chapitre d'ESSAI de l'histoire générée (proof of concept, hors app).
   Pipeline complet sur l'état RÉEL de l'apprenant :
   1. Charge sa sauvegarde (chemin en argument — téléchargée séparément, supprimée après usage).
   2. Extrait le plafond de vocabulaire (mots stage>=4) et le profil grammatical
      (GRAMMAR_TAGS × état FSRS des cartes-phrases → acquises / en-cours).
   3. Génère le chapitre (claude-opus-4-8, sortie structurée : phrases + traductions + ponts
      forme→lemme + mots i+1 déclarés).
   4. LINT côté client : chaque lemme ∈ vocabulaire ∪ i+1 ∪ noms propres ∪ mots-outils ;
      chaque structure détectée (taggeur jamo) ∈ acquises ∪ cibles. Violations → réparation
      (2 tours max), reliquat signalé honnêtement.
   Sortie : JSON du chapitre + rendu lisible sur stdout. Clé API lue au moment de l'usage.
   Lancer : node tools/story_trial.mjs <chemin-sauvegarde.json> */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const GRAMMAR = require(path.join(ROOT, "docs", "grammar.js"));
const TAGS = require(path.join(ROOT, "docs", "grammar-data.js"));

const MODEL = "claude-opus-4-8";
const savePath = process.argv[2];
if(!savePath){ console.error("usage: node tools/story_trial.mjs <sauvegarde.json>"); process.exit(1); }

/* ---------- données ---------- */
function loadSeed(){
  const window = {};
  eval(fs.readFileSync(path.join(ROOT, "docs", "data.js"), "utf8"));
  return Array.isArray(window.SEED) ? window.SEED : window.SEED.items;
}
const seed = loadSeed();
const save = JSON.parse(fs.readFileSync(savePath, "utf8"));
const st = save.state || save;                       /* l'export cloud enveloppe sous .state */
const stItems = st.items || {};
const seedById = new Map(seed.map(x => [x.id, x]));
const stageOf = id => {
  const it = stItems[id];
  const s = it && (it.s ?? it.stage);        /* ST.items compressé : s=stage, i=itv, d=due */
  if(typeof s === "number") return s;
  const sd = seedById.get(id);
  return (sd && sd.stage) || 0;
};

/* plafond de vocabulaire : mots maîtrisés (stage >= 4) */
const words = seed.filter(i => i.type === "word");
const known = words.filter(w => stageOf(w.id) >= 4);
const knownSet = new Set(known.map(w => w.kr));
const lexAll = new Set(words.map(w => w.kr));        /* lexique complet pour le taggeur */
console.log(`vocabulaire maîtrisé : ${known.length} mots / ${words.length}`);

/* profil grammatical : état FSRS des phrases taggées */
const phraseList = seed.filter(i => i.type === "phrase")
  .map(p => ({ tags: TAGS[p.id] || [], stage: stageOf(p.id) }))
  .filter(p => p.tags.length);
const profile = GRAMMAR.grammarProfile(phraseList);
const byId = Object.fromEntries(GRAMMAR.STRUCTS.map(s => [s.id, s]));
const acquired = Object.keys(profile).filter(id => profile[id].status === "acquise");
const inProgress = Object.keys(profile).filter(id => profile[id].status === "en-cours")
  .sort((a, b) => profile[b].seen - profile[a].seen);
const targets = inProgress.slice(0, 2);              /* 1-2 structures « en cours » dosées exprès */
console.log(`structures acquises : ${acquired.length} [${acquired.join(", ")}]`);
console.log(`en cours : ${inProgress.length}, cibles du chapitre : [${targets.join(", ")}]`);

/* ---------- prompt ---------- */
const NAMES = ["민지", "준호", "서연", "서울", "한강", "부산"];
const FUNC = new Set(["것", "거", "수", "때", "분", "명", "개", "살", "년", "월", "일", "시", "주",
  "저", "나", "제", "내", "너", "우리", "그", "이", "저", "이것", "그것", "저것", "이거", "그거",
  "누구", "뭐", "무엇", "어디", "언제", "왜", "어떻게", "네", "아니요", "씨", "좀", "한", "두", "세", "네",
  "하나", "둘", "셋", "그리고", "그런데", "하지만", "그래서", "안", "못", "다", "또"]);

function structLine(id){ const s = byId[id]; return `- ${s.fr} (ex: ${s.ex})`; }
const SYSTEM = `Tu écris le CHAPITRE 1 d'un feuilleton coréen pour UN apprenant précis (francophone, niveau A2).
C'est une histoire à suivre, générée chapitre par chapitre, calibrée sur ce qu'il sait EXACTEMENT.

RÈGLE ABSOLUE — le plafond de vocabulaire :
Chaque mot de contenu (nom, verbe, adjectif, adverbe) doit avoir son lemme dans la LISTE AUTORISÉE
fournie dans le message. Exceptions : les noms propres ${NAMES.join(", ")}, les mots-outils de base
(pronoms, nombres, compteurs, démonstratifs), et AU PLUS 3 mots nouveaux — que tu déclares dans
"new_words". Pas un de plus.

RÈGLE ABSOLUE — le plafond de grammaire :
Structures librement utilisables (acquises par l'apprenant) :
${acquired.map(structLine).join("\n")}
Structures CIBLES de ce chapitre (en cours d'acquisition — utilise chacune 2 à 3 fois, naturellement) :
${targets.map(structLine).join("\n")}
Tout le reste est INTERDIT : pas d'autres connecteurs, pas d'autres terminaisons. Registre 요 uniquement
(아요/어요, questions en 요?). Le présent simple, la copule 이에요/예요, les particules de base
(은/는, 이/가, 을/를, 에, 에서, 하고, 도) sont toujours permis.

HISTOIRE : ambiance k-drama réaliste et quotidienne (café, travail, famille, un petit mystère ou un
début de rencontre). Prose PLATE : phrases déclaratives courtes, faits concrets, zéro lyrisme.
L'intérêt vient de la situation et d'un accroche-fin de chapitre. 10 à 14 phrases coréennes.

SORTIE (JSON strict) :
- title_kr / title_fr : titre court.
- summary_fr : 2-3 phrases en français résumant la situation (servira de mémoire pour le chapitre 2).
- sentences : chaque phrase avec kr, fr (traduction naturelle), et words = le mot-à-mot DANS L'ORDRE :
  form (le mot tel qu'écrit, particules incluses), lemma (forme du dictionnaire : verbes/adjectifs en
  -다, noms nus), note (SEULEMENT si form ≠ lemma de façon non triviale : conjugaison ou contraction,
  en français très court, ex. "passé poli" ou "condition (으)면" — sinon chaîne vide).
- new_words : les mots hors liste que tu as choisis (max 3), avec leur sens français.`;

const SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["title_kr", "title_fr", "summary_fr", "sentences", "new_words"],
  properties: {
    title_kr: { type: "string" }, title_fr: { type: "string" }, summary_fr: { type: "string" },
    sentences: { type: "array", items: { type: "object", additionalProperties: false,
      required: ["kr", "fr", "words"],
      properties: { kr: { type: "string" }, fr: { type: "string" },
        words: { type: "array", items: { type: "object", additionalProperties: false,
          required: ["form", "lemma", "note"],
          properties: { form: { type: "string" }, lemma: { type: "string" }, note: { type: "string" } } } } } } },
    new_words: { type: "array", items: { type: "object", additionalProperties: false,
      required: ["kr", "fr"], properties: { kr: { type: "string" }, fr: { type: "string" } } } },
  },
};

function apiKey(){
  const raw = fs.readFileSync(path.join(os.homedir(), ".claude", "secrets", "anthropic.md"), "utf8");
  const m = raw.match(/sk-ant-[A-Za-z0-9_\-]+/);
  if(!m) throw new Error("clé introuvable dans le coffre");
  return m[0];
}

async function call(messages, attempt = 0){
  let res;
  try{
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey(), "anthropic-version": "2023-06-01", "content-type": "application/json" },
      signal: AbortSignal.timeout(300000),
      body: JSON.stringify({
        model: MODEL, max_tokens: 16000,
        thinking: { type: "adaptive" },
        system: SYSTEM,
        output_config: { format: { type: "json_schema", schema: SCHEMA } },
        messages,
      }),
    });
  }catch(e){
    if(attempt < 3){ await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt))); return call(messages, attempt + 1); }
    throw e;
  }
  if(!res.ok){
    const body = await res.text().catch(() => "");
    if((res.status === 429 || res.status >= 500) && attempt < 3){
      await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt)));
      return call(messages, attempt + 1);
    }
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  if(data.stop_reason === "refusal") throw new Error("refusal inattendu");
  if(data.stop_reason === "max_tokens") throw new Error("réponse tronquée (max_tokens) — chapitre trop long");
  return JSON.parse((data.content || []).filter(b => b.type === "text").map(b => b.text).join(""));
}

/* ---------- lint ---------- */
const strip = s => String(s || "").replace(/[?!.,…~"'«»()\s]+/g, "");
function lint(ch){
  const newWords = new Set((ch.new_words || []).map(w => w.kr));
  const allowedStructs = new Set([...acquired, ...targets]);
  const problems = [];
  ch.sentences.forEach((s, i) => {
    const words = s.words || [];
    /* Le lint ne voit que le mot-à-mot DÉCLARÉ par le modèle : un mot omis de `words`
       échapperait au plafond de vocabulaire. On vérifie donc que la concaténation des
       formes reconstitue bien la phrase. */
    if(strip(words.map(w => w.form).join("")) !== strip(s.kr))
      problems.push(`phrase ${i + 1} (${s.kr}) : le mot-à-mot ne couvre pas la phrase (mots omis ou altérés)`);
    for(const w of words){
      const lem = strip(w.lemma);
      if(!lem){ problems.push(`phrase ${i + 1} (${s.kr}) : lemme vide pour « ${w.form} »`); continue; }
      if(!/^[가-힣]+$/.test(lem)){
        /* ni hangul ni chiffre pur : c'est suspect, on le signale au lieu de l'exempter */
        if(!/^[0-9]+$/.test(lem)) problems.push(`phrase ${i + 1} (${s.kr}) : lemme non hangul « ${lem} »`);
        continue;
      }
      if(knownSet.has(lem) || newWords.has(lem) || NAMES.includes(lem) || FUNC.has(lem)) continue;
      problems.push(`phrase ${i + 1} (${s.kr}) : lemme « ${lem} » (forme ${w.form}) HORS vocabulaire autorisé`);
    }
    for(const t of GRAMMAR.tagStructures(s.kr, lexAll)){
      if(!allowedStructs.has(t))
        problems.push(`phrase ${i + 1} (${s.kr}) : structure « ${byId[t].fr} » NON autorisée`);
    }
  });
  if((ch.new_words || []).length > 3) problems.push(`${ch.new_words.length} mots nouveaux déclarés (max 3)`);
  return problems;
}

/* ---------- génération + réparation ---------- */
const vocabList = known.map(w => w.kr).join(" ");
const userMsg = `LISTE AUTORISÉE (${known.length} lemmes) :\n${vocabList}\n\nÉcris le chapitre 1.`;
let messages = [{ role: "user", content: userMsg }];
let chapter = await call(messages);
let problems = lint(chapter);
for(let round = 1; problems.length && round <= 2; round++){
  console.log(`lint : ${problems.length} violation(s), réparation ${round}…`);
  messages = [
    { role: "user", content: userMsg },
    { role: "assistant", content: JSON.stringify(chapter) },
    { role: "user", content: `Ton chapitre viole les plafonds :\n${problems.join("\n")}\n\nRéécris les phrases fautives (garde l'histoire et le reste identiques) et renvoie le chapitre COMPLET corrigé au même format.` },
  ];
  chapter = await call(messages);
  problems = lint(chapter);
}
console.log(problems.length ? `RELIQUAT non réparé :\n${problems.join("\n")}` : "lint : conforme");

/* ---------- sortie ---------- */
const outPath = path.join(process.env.SORI_REPORT_DIR || os.tmpdir(), "story_chapter1.json");
fs.writeFileSync(outPath, JSON.stringify({ profile: { acquired, targets }, chapter, problems }, null, 1), "utf8");
console.log(`chapitre : ${outPath}\n`);
console.log(`=== ${chapter.title_kr} — ${chapter.title_fr} ===`);
chapter.sentences.forEach((s, i) => {
  console.log(`${String(i + 1).padStart(2)}. ${s.kr}`);
  console.log(`    ${s.fr}`);
  const bridges = (s.words || []).filter(w => w.note).map(w => `${w.form} ← ${w.lemma} (${w.note})`);
  if(bridges.length) console.log(`    ${bridges.join(" · ")}`);
});
if(chapter.new_words.length) console.log(`\nMots nouveaux (i+1) : ${chapter.new_words.map(w => `${w.kr} = ${w.fr}`).join(", ")}`);
console.log(`\nRésumé (mémoire ch.2) : ${chapter.summary_fr}`);

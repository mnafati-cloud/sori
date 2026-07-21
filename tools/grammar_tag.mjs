/* Sori — grammar_tag.mjs : tagging de MASSE des 1050 phrases du deck (build-time, one-shot).
   Deux passes :
   1. Machine : SORI_GRAMMAR.tagStructures (niveau jamo) propose les tags — rapide, déterministe,
      mais faux positifs/négatifs connus (하고 ambigu, modifieurs irréguliers, homographes).
   2. LLM (claude-opus-4-8, sortie structurée) : vérifie chaque lot de phrases contre l'inventaire
      fermé et renvoie UNIQUEMENT des corrections {id, add, remove}. Compilation, pas runtime —
      le jeu livré reste déterministe.
   Sortie : docs/grammar-data.js (GRAMMAR_TAGS = { idCarte: [idsStructure] }) + rapport de
   corrections dans le scratchpad de session (pas committé).
   Clé API : lue dans le coffre au moment de l'usage, jamais affichée ni écrite.
   Lancer : node tools/grammar_tag.mjs [--dry] (--dry = passe machine seule, zéro appel API) */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const GRAMMAR = require(path.join(ROOT, "docs", "grammar.js"));

const DRY = process.argv.includes("--dry");
const MODEL = "claude-opus-4-8";
const BATCH = 25;
const CONCURRENCY = 4;

/* ---------- données ---------- */
function loadSeed(){
  const window = {};
  eval(fs.readFileSync(path.join(ROOT, "docs", "data.js"), "utf8"));
  return Array.isArray(window.SEED) ? window.SEED : window.SEED.items;
}
const seed = loadSeed();
const phrases = seed.filter(i => i.type === "phrase");
const lex = new Set(seed.filter(i => i.type === "word").map(i => i.kr));
console.log(`${phrases.length} phrases, lexique ${lex.size} mots`);

/* ---------- passe 1 : machine ---------- */
const machine = new Map();
for(const p of phrases) machine.set(p.id, GRAMMAR.tagStructures(p.kr, lex));
const dist = {};
for(const tags of machine.values()) for(const t of tags) dist[t] = (dist[t] || 0) + 1;
console.log("distribution machine :", Object.entries(dist).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n}`).join(" "));

/* ---------- passe 2 : vérification LLM ---------- */
function apiKey(){
  const raw = fs.readFileSync(path.join(os.homedir(), ".claude", "secrets", "anthropic.md"), "utf8");
  const m = raw.match(/sk-ant-[A-Za-z0-9_\-]+/);
  if(!m) throw new Error("clé introuvable dans le coffre");
  return m[0];
}

const INVENTORY = GRAMMAR.STRUCTS.map(s => `${s.id} — ${s.fr} (ex: ${s.ex})`).join("\n");
const VALID_IDS = new Set(GRAMMAR.STRUCTS.map(s => s.id));

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["corrections"],
  properties: {
    corrections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "add", "remove"],
        properties: {
          id: { type: "string" },
          add: { type: "array", items: { type: "string" } },
          remove: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

const SYSTEM = `Tu vérifies le tagging grammatical de phrases coréennes (niveau apprenant A1-B1).
Inventaire FERMÉ des structures (seuls ces ids existent) :
${INVENTORY}

Pour chaque phrase on te donne les tags proposés par un taggeur automatique. Corrige-les :
- "add" : structures de l'inventaire réellement présentes dans la phrase mais absentes des tags.
- "remove" : tags proposés à tort (faux positifs — ex. 하고 particule « avec » taggé comme connecteur -고, 어서 adverbe « vite » taggé 아서, nom en -면 taggé condition).
- Ne renvoie QUE les phrases qui ont besoin d'une correction. Une phrase correcte n'apparaît pas.
- N'invente jamais d'id hors inventaire. Ignore les structures hors inventaire (particules de base 은/는/이/가/을/를, copule 이다, présent poli simple) : elles ne sont PAS taggées, c'est voulu.
- En cas de doute sur une ambiguïté réelle, laisse le tag proposé.`;

async function callBatch(batch, attempt = 0){
  const lines = batch.map(p => `${p.id} | ${p.kr} | tags: [${machine.get(p.id).join(", ")}]`).join("\n");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey(),
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      system: SYSTEM,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: `Vérifie ces ${batch.length} phrases :\n${lines}` }],
    }),
  });
  if(!res.ok){
    const body = await res.text().catch(() => "");
    if((res.status === 429 || res.status >= 500) && attempt < 4){
      const wait = 2000 * Math.pow(2, attempt);
      console.log(`  HTTP ${res.status}, retry dans ${wait / 1000}s`);
      await new Promise(r => setTimeout(r, wait));
      return callBatch(batch, attempt + 1);
    }
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  if(data.stop_reason === "refusal") throw new Error("refusal inattendu");
  /* une réponse coupée à max_tokens produit du JSON tronqué : le signaler AVANT le parse,
     sinon on lit « SyntaxError » sans comprendre que le lot était simplement trop gros. */
  if(data.stop_reason === "max_tokens") throw new Error("réponse tronquée (max_tokens) — réduire BATCH");
  const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
  return JSON.parse(text).corrections;
}

async function verifyAll(){
  const batches = [];
  for(let i = 0; i < phrases.length; i += BATCH) batches.push(phrases.slice(i, i + BATCH));
  const all = [];
  const failed = [];
  let done = 0;
  const queue = [...batches.entries()];
  async function worker(){
    while(queue.length){
      const [idx, batch] = queue.shift();
      /* un lot qui échoue ne doit PAS détruire le run : 41 lots vérifiés valent mieux que zéro.
         Les lots perdus sont listés en fin de course — leurs tags restent ceux de la machine. */
      try{
        const corr = await callBatch(batch);
        all.push(...corr);
        done++;
        console.log(`  lot ${idx + 1}/${batches.length} ok (${corr.length} corrections) — ${done}/${batches.length}`);
      }catch(e){
        failed.push(idx + 1);
        console.log(`  lot ${idx + 1}/${batches.length} ÉCHOUÉ : ${e.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  if(failed.length) console.log(`⚠ ${failed.length} lot(s) non vérifiés par le LLM : ${failed.join(", ")} — tags machine conservés`);
  return { corrections: all, failed };
}

/* ---------- application + sortie ---------- */
const final = new Map(machine);
let corrections = [], failedBatches = [];
if(!DRY){
  ({ corrections, failed: failedBatches } = await verifyAll());
  let applied = 0, unknownCard = 0, unknownStruct = 0;
  for(const c of corrections){
    if(!final.has(c.id)){ unknownCard++; continue; }
    const cur = new Set(final.get(c.id));
    for(const t of c.remove || []) cur.delete(t);
    for(const t of c.add || []){ if(VALID_IDS.has(t)) cur.add(t); else unknownStruct++; }
    final.set(c.id, [...cur]);
    applied++;
  }
  console.log(`${corrections.length} corrections LLM, ${applied} appliquées, ${unknownCard} carte(s) inconnue(s), ${unknownStruct} structure(s) hors inventaire`);
}

const entries = [...final.entries()].filter(([, tags]) => tags.length > 0);
const body = entries.map(([id, tags]) => `  ${JSON.stringify(String(id))}: [${tags.map(t => JSON.stringify(t)).join(",")}]`).join(",\n");
const out = `/* Sori — grammar-data.js : tags de structures par carte-phrase. GÉNÉRÉ par tools/grammar_tag.mjs
   (taggeur jamo de docs/grammar.js + vérification LLM one-shot). Ne pas éditer à la main — relancer
   l'outil après une vague de contenu. ${entries.length} phrases taggées / ${phrases.length}. */
(function(root){
  "use strict";
  const GRAMMAR_TAGS = {
${body}
  };
  if (typeof module !== "undefined" && module.exports) module.exports = GRAMMAR_TAGS;
  else root.GRAMMAR_TAGS = GRAMMAR_TAGS;
})(typeof self !== "undefined" ? self : this);
`;
/* --dry n'écrase JAMAIS le fichier livré : la passe machine seule vaut moins que la version
   vérifiée par LLM déjà en place. Elle écrit à côté, pour comparaison. */
const outPath = DRY ? path.join(process.env.SORI_REPORT_DIR || os.tmpdir(), "grammar-data.machine.js")
                    : path.join(ROOT, "docs", "grammar-data.js");
fs.writeFileSync(outPath, out, "utf8");
console.log(`${DRY ? "(dry) " : ""}${outPath} écrit : ${entries.length} phrases taggées`);

/* rapport (scratchpad si dispo, sinon à côté — jamais committé) */
const reportDir = process.env.SORI_REPORT_DIR || os.tmpdir();
const reportPath = path.join(reportDir, "grammar_tag_report.json");
fs.writeFileSync(reportPath, JSON.stringify({ dry: DRY, dist, failedBatches, corrections }, null, 1), "utf8");
console.log(`rapport : ${reportPath}`);

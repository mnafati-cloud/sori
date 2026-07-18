/* Tests du module conversation (partie pure) — construction du prompt, des requêtes
   API (OpenAI / Anthropic) et lecture des réponses. Aucun réseau. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const CONV = require("../docs/conversation.js");
const { buildSystem, trimHistory, buildRequest, parseReply, MODELS, MAX_HISTORY } = CONV.pure;

test("buildSystem : vocabulaire, fragiles et règles présents", () => {
  const s = buildSystem(["학교", "친구"], ["오래"]);
  assert.ok(s.includes("VOCABULAIRE CONNU : 학교 친구"));
  assert.ok(s.includes("오래"));                      // mots fragiles à recycler
  assert.ok(s.includes("A2"));
  assert.ok(s.includes("coréen"));
  assert.ok(s.includes("synthétiseur"));              // sortie pensée pour le TTS
});

test("buildSystem : robuste aux listes vides", () => {
  const s = buildSystem([], []);
  assert.ok(s.includes("VOCABULAIRE CONNU"));
  assert.ok(!s.includes("en train de les oublier"));  // pas de ligne fragiles sans fragiles
});

test("trimHistory : borne l'historique et garde l'alternance depuis un user", () => {
  const h = [];
  for(let i = 0; i < 40; i++) h.push({ role: i % 2 ? "assistant" : "user", content: "m" + i });
  const t = trimHistory(h);
  assert.ok(t.length <= MAX_HISTORY);
  assert.equal(t[0].role, "user");                    // l'API exige de commencer par user
  assert.equal(t[t.length - 1].content, "m39");       // la fin est conservée
  assert.deepEqual(trimHistory([]), []);
  const short = [{ role: "user", content: "a" }];
  assert.deepEqual(trimHistory(short), short);        // en-dessous du cap : identité
});

test("buildRequest anthropic : endpoint, en-têtes navigateur, cache, modèle", () => {
  const h = [{ role: "user", content: "안녕하세요" }];
  const r = buildRequest("anthropic", "KEY", "SYS", h);
  assert.equal(r.url, "https://api.anthropic.com/v1/messages");
  assert.equal(r.headers["x-api-key"], "KEY");
  assert.equal(r.headers["anthropic-version"], "2023-06-01");
  assert.equal(r.headers["anthropic-dangerous-direct-browser-access"], "true");  // appel direct navigateur
  assert.ok(!r.headers.Authorization);
  assert.equal(r.body.model, MODELS.anthropic);
  assert.deepEqual(r.body.system[0].cache_control, { type: "ephemeral" });       // cache de prompt
  assert.equal(r.body.system[0].text, "SYS");
  assert.deepEqual(r.body.messages, h);               // le système ne va PAS dans messages
  assert.ok(r.body.max_tokens >= 200);
});

test("buildRequest openai : endpoint, Bearer, gpt-5 (max_completion_tokens + effort minimal)", () => {
  const h = [{ role: "user", content: "안녕하세요" }];
  const r = buildRequest("openai", "KEY", "SYS", h);
  assert.equal(r.url, "https://api.openai.com/v1/chat/completions");
  assert.equal(r.headers.Authorization, "Bearer KEY");
  assert.ok(!r.headers["x-api-key"]);
  assert.equal(r.body.model, MODELS.openai);
  assert.equal(r.body.messages[0].role, "system");    // le système passe par messages
  assert.equal(r.body.messages[0].content, "SYS");
  assert.deepEqual(r.body.messages.slice(1), h);
  assert.ok(r.body.max_completion_tokens >= 200);     // gpt-5 : max_tokens est REFUSÉ
  assert.equal(r.body.max_tokens, undefined);
  assert.equal(r.body.reasoning_effort, "minimal");   // latence de conversation
});

test("parseReply anthropic : texte, erreur API, réponse vide", () => {
  assert.deepEqual(parseReply("anthropic", { content: [{ type: "text", text: " 네! " }] }), { text: "네!" });
  const e = parseReply("anthropic", { type: "error", error: { message: "invalid x-api-key" } }, 401);
  assert.equal(e.err, "invalid x-api-key");
  assert.ok(parseReply("anthropic", { content: [], stop_reason: "refusal" }).err.includes("refusal"));
  assert.ok(parseReply("anthropic", null, 529).err.includes("529"));
});

test("SCENARIOS : ids uniques, rôle défini, libellés KR+FR", () => {
  const { SCENARIOS, scenarioById } = CONV.pure;
  assert.ok(SCENARIOS.length >= 6);
  const ids = SCENARIOS.map(s => s.id);
  assert.equal(new Set(ids).size, ids.length);          // pas de doublon
  for(const s of SCENARIOS){
    assert.ok(s.sys && s.sys.length > 20, s.id);        // vraie instruction de rôle
    assert.ok(s.kr && s.fr, s.id);
  }
  assert.equal(scenarioById("resto").kr, "식당");
  assert.equal(scenarioById("inconnu"), null);
});

test("buildSystem : le scénario s'insère, absent sinon", () => {
  const avec = buildSystem(["학교"], [], "Tu joues le SERVEUR.");
  assert.ok(avec.includes("SCÉNARIO : Tu joues le SERVEUR."));
  assert.ok(avec.indexOf("SCÉNARIO") < avec.indexOf("VOCABULAIRE CONNU : "));   // avant la ligne du lexique
  assert.ok(!buildSystem(["학교"], []).includes("SCÉNARIO"));
});

test("toApi : mapping des rôles ; hid n'affecte que l'affichage, pas l'API", () => {
  const { toApi } = CONV.pure;
  const h = [{ r: "u", c: "(amorce)", hid: 1 }, { r: "a", c: "어서 오세요!" }, { r: "u", c: "안녕하세요" }];
  const api = toApi(h);
  assert.deepEqual(api, [
    { role: "user", content: "(amorce)" },              // l'amorce cachée PART bien à l'API
    { role: "assistant", content: "어서 오세요!" },
    { role: "user", content: "안녕하세요" }
  ]);
  assert.deepEqual(toApi([]), []);
});

/* mock d'un SpeechRecognitionResult : liste [{transcript}] + drapeau isFinal */
const srr = (t, fin) => Object.assign([{ transcript: t }], { isFinal: !!fin });

test("sttFold : reconstruction depuis la liste COMPLÈTE — les finals re-livrés ne se dupliquent pas (bug Android v88)", () => {
  const { sttFold } = CONV.pure;
  // événement 1 : un final
  assert.equal(sttFold("", [srr("안녕하세요", true)]), "안녕하세요");
  // événement 2 : Android RE-LIVRE le final déjà vu (resultIndex bugué à 0) + le nouvel interim —
  // l'accumulation incrémentale v88 doublait « 안녕하세요 » ; la reconstruction, non
  assert.equal(sttFold("", [srr("안녕하세요 ", true), srr("오늘 날씨가", false)]), "안녕하세요 오늘 날씨가");
  // événement 3 : le 2e segment devient final à son tour, toujours dans la même liste
  assert.equal(sttFold("", [srr("안녕하세요 ", true), srr("오늘 날씨가 좋아요", true)]), "안녕하세요 오늘 날씨가 좋아요");
});

test("sttFold : la base (sessions précédentes / texte déjà tapé) est préservée ; espaces normalisés", () => {
  const { sttFold } = CONV.pure;
  // Android a coupé à une pause → relance auto : la nouvelle session repart avec une liste VIDE,
  // le texte d'avant vit dans base
  assert.equal(sttFold("첫 문장", [srr("둘째 문장", false)]), "첫 문장 둘째 문장");
  assert.equal(sttFold("", []), "");
  assert.equal(sttFold("a  ", [srr("  b ", false)]), "a b");
});

test("parseReply openai : texte, erreur API, contenu nul", () => {
  assert.deepEqual(parseReply("openai", { choices: [{ message: { content: " 좋아요. " } }] }), { text: "좋아요." });
  const e = parseReply("openai", { error: { message: "Incorrect API key provided" } }, 401);
  assert.equal(e.err, "Incorrect API key provided");
  assert.ok(parseReply("openai", { choices: [{ message: { content: null } }] }).err);
});

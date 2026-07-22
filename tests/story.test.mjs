/* Verrouille la partie PURE de SORI_STORY — le LECTEUR du feuilleton et son lint de build.
   - availability   : quel chapitre est ouvert aujourd'hui (contenu figé, sélection vivante)
   - lintChapter    : les deux plafonds (vocabulaire, grammaire) + la forme du chapitre.
                      C'est l'outil de l'auteur : il tourne au BUILD, jamais sur l'appareil.
   - formMatchesLemma / normLemma : le lemme déclaré doit correspondre à la forme écrite,
                      sinon le plafond de vocabulaire n'est qu'une déclaration.
   Lancer : node --test tests/story.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import STORY from "../docs/story.js";
import GRAMMAR from "../docs/grammar.js";

const P = STORY.pure;

/* ---------- sélection : quel chapitre est lisible ---------- */
const CORPUS = [
  { n: 1, target: null,       title_fr: "La rencontre" },
  { n: 2, target: "mot",      title_fr: "L'empêchement" },
  { n: 3, target: "go",       title_fr: "Et puis" },
  { n: 4, target: "mod-neun", title_fr: "Celui qui vient" },
];
const label = id => ({ "mod-neun": "modifieur 는 + nom", mot: "impossibilité 못" }[id] || id);

test("availability : un chapitre s'ouvre quand sa structure cible est au moins EN COURS", () => {
  const profile = { mot: { status: "acquise" }, go: { status: "en-cours" }, "mod-neun": { status: "inconnue" } };
  const a = P.availability(CORPUS, profile, label);
  assert.equal(a[0].status, "ok");        /* pas de cible : toujours lisible */
  assert.equal(a[1].status, "ok");        /* acquise */
  assert.equal(a[2].status, "ok");        /* en cours : c'est justement le moment de la voir */
  assert.equal(a[3].status, "locked");    /* jamais croisée : le chapitre attend */
  assert.ok(/modifieur/.test(a[3].reason), a[3].reason);
});

test("availability : la lecture reste séquentielle — un chapitre ne saute pas son prédécesseur", () => {
  const profile = { mot: { status: "inconnue" }, go: { status: "acquise" } };
  const a = P.availability(CORPUS, profile, label);
  assert.equal(a[1].status, "locked");
  assert.equal(a[2].status, "locked");    /* même si 고 est acquise : le 2 bloque le 3 */
  assert.ok(/chapitre 2/.test(a[2].reason));
});

test("availability : profil vide ou corpus vide — pas d'exception", () => {
  assert.deepEqual(P.availability([], {}), []);
  assert.equal(P.availability(CORPUS, null)[0].status, "ok");
  assert.equal(P.availability(CORPUS, null)[1].status, "locked");
});

/* ---------- le lint : les deux plafonds ---------- */
const ctx = extra => Object.assign({
  known: new Set(["카페", "일하다", "커피", "마시다", "사람", "손을씻다"]),
  names: ["민지", "준호"],
  allowed: new Set(["past", "seyo"]),
  tag: kr => (kr.includes("니까") ? ["nikka"] : ["past"]),
  labelOf: x => x,
}, extra || {});
const chap = sentences => ({ sentences, new_words: [] });
const w = (form, lemma, note = "") => ({ form, lemma, note });

test("lintChapter : un chapitre conforme ne produit aucune violation", () => {
  const ch = chap([{ kr: "민지는 커피를 마셨어요", fr: "Minji a bu un café",
    words: [w("민지는", "민지"), w("커피를", "커피"), w("마셨어요", "마시다", "passé poli")] }]);
  assert.deepEqual(P.lintChapter(ch, ctx()), []);
});

test("lintChapter : un lemme hors vocabulaire est signalé", () => {
  const ch = chap([{ kr: "민지는 신문을 읽었어요", fr: "…",
    words: [w("민지는", "민지"), w("신문을", "신문"), w("읽었어요", "읽다")] }]);
  const v = P.lintChapter(ch, ctx());
  assert.equal(v.length, 2);
  assert.ok(v[0].includes("신문"));
});

test("lintChapter : les mots nouveaux DÉCLARÉS (i+1) sont tolérés, au-delà de 3 non", () => {
  const ch = { new_words: [{ kr: "신문", fr: "journal" }],
    sentences: [{ kr: "민지는 신문을 마셔요", fr: "…",
      words: [w("민지는", "민지"), w("신문을", "신문"), w("마셔요", "마시다")] }] };
  assert.deepEqual(P.lintChapter(ch, ctx()), []);
  const trop = { ...ch, new_words: [1, 2, 3, 4].map(n => ({ kr: "가" + n, fr: "x" })) };
  assert.ok(P.lintChapter(trop, ctx()).some(x => x.includes("mots nouveaux")));
});

test("lintChapter : une structure non autorisée est signalée", () => {
  const ch = chap([{ kr: "비싸니까 안 사요", fr: "…",
    words: [w("비싸니까", "비싸다"), w("안", "안"), w("사요", "사다")] }]);
  assert.ok(P.lintChapter(ch, ctx()).some(x => x.includes("nikka")));
});

test("lintChapter : un mot-à-mot qui ne couvre pas la phrase est signalé", () => {
  const ch = chap([{ kr: "민지는 커피를 마셨어요", fr: "…",
    words: [w("민지는", "민지"), w("마셨어요", "마시다")] }]);
  assert.ok(P.lintChapter(ch, ctx()).some(x => x.includes("couvre")));
});

test("lintChapter : traduction française manquante signalée", () => {
  const ch = chap([{ kr: "민지는 커피를 마셨어요", fr: "",
    words: [w("민지는", "민지"), w("커피를", "커피"), w("마셨어요", "마시다")] }]);
  assert.ok(P.lintChapter(ch, ctx()).some(x => /traduction/.test(x)));
});

test("lintChapter : chapitre vide ou malformé — aucune exception, une violation", () => {
  assert.ok(P.lintChapter({}, ctx()).length >= 1);
  assert.ok(P.lintChapter({ sentences: [] }, ctx()).length >= 1);
  assert.ok(P.lintChapter(null, ctx()).length >= 1);
});

test("lintChapter : la FORME du chapitre est contrôlée (43 phrases au lieu de 14 doit se voir)", () => {
  const une = { kr: "민지는 커피를 마셨어요", fr: "x",
    words: [w("민지는", "민지"), w("커피를", "커피"), w("마셨어요", "마시다")] };
  const court = chap([une, une]);
  const long = chap(Array.from({ length: 30 }, () => une));
  const bornes = { minSentences: 10, maxSentences: 20 };
  assert.ok(P.lintChapter(court, ctx(bornes)).some(x => /trop court/.test(x)));
  assert.ok(P.lintChapter(long, ctx(bornes)).some(x => /trop long/.test(x)));
  assert.deepEqual(P.lintChapter(chap(Array.from({ length: 12 }, () => une)), ctx(bornes)), []);
});

/* ---------- lemme déclaré vs forme écrite ---------- */
test("lintChapter : un lemme qui ne correspond pas à la forme est rejeté", () => {
  const ch = chap([{ kr: "신문을 읽었어요", fr: "…",
    words: [w("신문을", "커피"), w("읽었어요", "마시다")] }]);
  const v = P.lintChapter(ch, ctx());
  assert.equal(v.length, 2);
  assert.ok(v.every(x => /ne correspond pas/.test(x)));
});

test("formMatchesLemma : les irréguliers coréens et les entrées multi-mots passent", () => {
  const ok = (form, lemma) => assert.ok(P.formMatchesLemma(form, lemma), `${form} ← ${lemma}`);
  ok("매워요", "맵다");        /* ㅂ-irrégulier */
  ok("들어요", "듣다");        /* ㄷ-irrégulier */
  ok("불러요", "부르다");      /* 르-irrégulier */
  ok("해요", "하다");          /* contraction */
  ok("왔어요", "오다");
  ok("예요", "이다");
  ok("씻었어요", "손을 씻다"); /* entrée multi-mots du deck (107 cas) */
  assert.ok(!P.formMatchesLemma("신문을", "커피"));
});

test("normLemma : une entrée multi-mots du deck est reconnue malgré l'espace", () => {
  /* le deck contient « 손을 씻다 » ; sans normalisation commune, ce lemme serait toujours rejeté */
  const ch = chap([{ kr: "손을 씻었어요", fr: "…",
    words: [w("손을", "손을 씻다"), w("씻었어요", "손을 씻다", "passé")] }]);
  assert.deepEqual(P.lintChapter(ch, ctx()), []);
});

/* ---------- intégration : le lint et le VRAI taggeur ---------- */
test("lint + grammar.js réels : une structure hors plafond est bien attrapée", () => {
  /* la revue avait signalé que les tests injectaient un faux taggeur — ici c'est le vrai */
  const lex = new Set(["듣다", "공부하다", "마시다", "커피"]);
  const tag = kr => GRAMMAR.tagStructures(kr, lex);
  const byId = Object.fromEntries(GRAMMAR.STRUCTS.map(s => [s.id, s]));
  const c = ctx({ known: new Set(["커피", "마시다", "공부하다", "듣다"]), tag,
    allowed: new Set(["past"]), labelOf: id => (byId[id] && byId[id].fr) || id });
  const ch = chap([{ kr: "음악을 들으면서 공부했어요", fr: "…",
    words: [w("음악을", "음악"), w("들으면서", "듣다", "en même temps"), w("공부했어요", "공부하다", "passé")] }]);
  const v = P.lintChapter(ch, c);
  assert.ok(v.some(x => /면서/.test(x)), v.join(" | "));
  /* et une phrase conforme au plafond ne déclenche rien côté grammaire */
  const ok = chap([{ kr: "커피를 마셨어요", fr: "…", words: [w("커피를", "커피"), w("마셨어요", "마시다", "passé")] }]);
  assert.deepEqual(P.lintChapter(ok, c), []);
});

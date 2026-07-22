/* Verrouille la partie PURE de SORI_STORY (l'histoire générée chapitre par chapitre).
   Trois fonctions décident de tout, et aucune ne touche au DOM ni au réseau :
   - pickTargets  : quelles structures « en cours » le chapitre doit exercer
   - lintChapter  : les deux plafonds (vocabulaire, grammaire) contrôlés CHEZ NOUS — un LLM
                    à qui on donne 1144 mots autorisés déborde toujours, le prompt ne suffit pas
   - trimStore    : le cap de stockage (les chapitres vivent hors sauvegarde cloud)
   Lancer : node --test tests/story.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import STORY from "../docs/story.js";

const P = STORY.pure;

/* ---------- choix des structures cibles ---------- */
test("pickTargets : les « en cours » les plus vues, jamais une acquise ni une inconnue", () => {
  const profile = {
    past:   { status: "acquise",  seen: 40, mastered: 30 },
    nikka:  { status: "en-cours", seen: 9,  mastered: 1 },
    ryeogo: { status: "en-cours", seen: 3,  mastered: 0 },
    janha:  { status: "inconnue", seen: 0,  mastered: 0 },
  };
  assert.deepEqual(P.pickTargets(profile, 2), ["nikka", "ryeogo"]);
  assert.deepEqual(P.pickTargets(profile, 1), ["nikka"]);
});

test("pickTargets : aucune structure en cours → tableau vide (le chapitre reste sur l'acquis)", () => {
  assert.deepEqual(P.pickTargets({ past: { status: "acquise", seen: 5, mastered: 5 } }, 2), []);
  assert.deepEqual(P.pickTargets(null, 2), []);
});

test("pickTargets : évite de répéter les cibles du chapitre précédent", () => {
  const profile = {
    a: { status: "en-cours", seen: 9, mastered: 1 },
    b: { status: "en-cours", seen: 8, mastered: 1 },
    c: { status: "en-cours", seen: 7, mastered: 0 },
  };
  assert.deepEqual(P.pickTargets(profile, 2, ["a"]), ["b", "c"]);
  /* si tout a déjà servi, on recycle plutôt que de ne rien exercer */
  assert.deepEqual(P.pickTargets(profile, 2, ["a", "b", "c"]), ["a", "b"]);
});

/* ---------- le lint : la vraie garantie des plafonds ---------- */
const ctx = () => ({
  known: new Set(["카페", "일하다", "커피", "마시다", "사람"]),
  names: ["민지", "준호"],
  allowed: new Set(["past", "seyo"]),
  tag: kr => (kr.includes("니까") ? ["nikka"] : ["past"]),   /* taggeur injecté */
  labelOf: id => id,
});
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
  assert.equal(v.length, 2);                       /* 신문 ET 읽다 sont hors liste */
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
  /* sans ce contrôle, il suffirait d'omettre un mot du mot-à-mot pour échapper au plafond */
  const ch = chap([{ kr: "민지는 커피를 마셨어요", fr: "…",
    words: [w("민지는", "민지"), w("마셨어요", "마시다")] }]);
  assert.ok(P.lintChapter(ch, ctx()).some(x => x.includes("couvre")));
});

test("lintChapter : chapitre vide ou malformé — aucune exception, une violation", () => {
  assert.ok(P.lintChapter({}, ctx()).length >= 1);
  assert.ok(P.lintChapter({ sentences: [] }, ctx()).length >= 1);
  assert.ok(P.lintChapter(null, ctx()).length >= 1);
});

/* ---------- le lint doit vérifier que le lemme correspond VRAIMENT à la forme ---------- */
test("lintChapter : un lemme qui ne correspond pas à la forme est rejeté", () => {
  /* sans ce contrôle le plafond est purement déclaratif : le modèle écrit ce qu'il veut
     et déclare à côté un lemme autorisé (revue v120). */
  const ch = chap([{ kr: "신문을 읽었어요", fr: "…",
    words: [w("신문을", "커피"), w("읽었어요", "마시다")] }]);
  const v = P.lintChapter(ch, ctx());
  assert.equal(v.length, 2);
  assert.ok(v.every(x => /ne correspond pas/.test(x)));
});

test("lintChapter : les irréguliers coréens restent acceptés (ㅂ, ㄷ, 르, contractions)", () => {
  const c = ctx();
  ["맵다", "듣다", "부르다", "하다", "오다", "이다"].forEach(l => c.known.add(l));
  const ok = (form, lemma) => {
    const ch = chap([{ kr: form, fr: "…", words: [w(form, lemma)] }]);
    assert.deepEqual(P.lintChapter(ch, c), [], `${form} ← ${lemma} devrait passer`);
  };
  ok("매워요", "맵다");      /* ㅂ-irrégulier */
  ok("들어요", "듣다");      /* ㄷ-irrégulier */
  ok("불러요", "부르다");    /* 르-irrégulier */
  ok("해요", "하다");        /* contraction */
  ok("왔어요", "오다");
  ok("예요", "이다");
});

/* ---------- le fil : la LISTE fait foi ---------- */
test("thread : la liste est la source de vérité ; le fil mémorisé n'est qu'un filet", () => {
  /* cas normal : le résumé vient du DERNIER chapitre réellement présent, pas d'un cache */
  assert.deepEqual(
    P.thread([{ n: 1, summary_fr: "A" }, { n: 2, summary_fr: "B" }], { summary: "périmé", lastN: 2 }),
    { no: 3, summary: "B" });
  /* tout supprimé ET fil rembobiné (ce que fait l'app) : on repart vraiment du début */
  assert.deepEqual(P.thread([], { summary: "", lastN: 0 }), { no: 1, summary: "" });
  /* restauration cloud : chapitres absents mais fil présent → on continue l'histoire */
  assert.deepEqual(P.thread([], { summary: "A", lastN: 12 }), { no: 13, summary: "A" });
  assert.deepEqual(P.thread(null, null), { no: 1, summary: "" });
});

test("rewind : supprimer un chapitre recale le fil sur ce qui reste", () => {
  /* l'apprenant supprime son unique chapitre : il doit pouvoir réécrire LE chapitre 1 */
  assert.deepEqual(P.rewind([], { summary: "A", lastTargets: ["go"], lastN: 1 }),
    { summary: "", lastTargets: ["go"], lastN: 0 });
  /* il supprime le dernier de trois : le fil revient au chapitre 2 */
  assert.deepEqual(P.rewind([{ n: 1, summary_fr: "A" }, { n: 2, summary_fr: "B" }], { summary: "C", lastTargets: [], lastN: 3 }),
    { summary: "B", lastTargets: [], lastN: 2 });
  /* il supprime un chapitre du milieu : le fil ne bouge pas */
  assert.deepEqual(P.rewind([{ n: 1, summary_fr: "A" }, { n: 3, summary_fr: "C" }], { summary: "C", lastTargets: [], lastN: 3 }),
    { summary: "C", lastTargets: [], lastN: 3 });
});

/* ---------- numérotation ---------- */
test("nextNo : continue après le cap de stockage et après une restauration cloud", () => {
  assert.equal(P.nextNo([], {}), 1);
  assert.equal(P.nextNo([{ n: 1 }, { n: 2 }], {}), 3);
  /* le cap a supprimé les premiers : on repart du dernier connu, pas de list.length */
  assert.equal(P.nextNo([{ n: 19 }, { n: 20 }], {}), 21);
  /* liste locale vide mais fil restauré depuis le cloud : on ne recommence PAS à 1 */
  assert.equal(P.nextNo([], { lastN: 12 }), 13);
  assert.equal(P.nextNo([{ n: 3 }], { lastN: 12 }), 13);
});

/* ---------- cap de stockage ---------- */
test("trimStore : garde les N derniers chapitres, dans l'ordre", () => {
  const list = [1, 2, 3, 4, 5].map(n => ({ n, sentences: [] }));
  assert.deepEqual(P.trimStore(list, 3).map(c => c.n), [3, 4, 5]);
  assert.deepEqual(P.trimStore(list, 9).map(c => c.n), [1, 2, 3, 4, 5]);
  assert.deepEqual(P.trimStore(null, 3), []);
});

/* ---------- le prompt ---------- */
test("buildSystem : énonce les structures autorisées et les cibles, et le plafond de mots", () => {
  const sys = P.buildSystem({
    acquired: [{ id: "past", fr: "passé 았/었/했", ex: "어제 밥을 먹었어요" }],
    targets:  [{ id: "nikka", fr: "(으)니까 — cause", ex: "위험하니까 조심하세요" }],
    names: ["민지"],
    chapterNo: 2,
    summary: "Minji a trouvé une lettre.",
  });
  assert.ok(sys.includes("passé 았/었/했"));
  assert.ok(sys.includes("위험하니까 조심하세요"));
  assert.ok(sys.includes("Minji a trouvé une lettre."));
  assert.ok(/chapitre\s*2/i.test(sys));
  /* la contrainte de prose plate est explicite : c'est une exigence du lecteur */
  assert.ok(/plate/i.test(sys));
});

/* Verrouille SORI_GRAMMAR (profil grammatical dérivé — fondation de l'histoire générée).
   tagStructures(kr, lex?) détecte les structures d'une phrase au NIVEAU JAMO (le passé
   contracté 했/왔/갔 est invisible en surface : batchim ㅆ). lex = Set des lemmes du deck,
   il active les règles de modifieurs (좋아하는/좋은/귀여운) qui exigent une vérification lexicale.
   grammarProfile(list) agrège l'état FSRS des cartes taggées en statuts par structure.
   Lancer : node --test tests/grammar.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import GRAMMAR from "../docs/grammar.js";

const tags = (kr, lex) => GRAMMAR.tagStructures(kr, lex);
const has  = (kr, id, lex) => assert.ok(tags(kr, lex).includes(id), `${kr} devrait porter ${id} (a: ${tags(kr, lex)})`);
const not  = (kr, id, lex) => assert.ok(!tags(kr, lex).includes(id), `${kr} ne devrait PAS porter ${id}`);

/* Lexique de test : les lemmes verbaux dont les règles ont besoin, ET les noms qui
   collisionnent avec des formes verbales (산 = montagne vs 사다 + ㄴ, 시간 후에 vs 끝난 후에).
   Le vrai deck contient tous ces mots — c'est ce qui rend la distinction possible. */
const LEX = new Set(["가다", "오다", "먹다", "자다", "하다", "공부하다", "수영하다", "좋다", "크다",
  "사다", "끝나다", "발표하다", "놀다", "쉬다", "맵다", "비싸다", "좋아하다", "도와주다", "만나다",
  "귀엽다", "조용하다",
  "산", "일", "생일", "시간", "바지", "감기", "친구", "이야기", "주말", "오늘", "내일", "서울", "라면"]);

/* ---------- passé : niveau jamo, pas la surface ---------- */
test("passé contracté (했/왔/갔) et plein (었/았) détectés ; 있다/겠 exclus", () => {
  has("어제 한국어 수업을 신청했어요", "past");
  has("친구가 왔어요", "past");
  has("밥을 먹었어요", "past");
  not("요즘 일이 재미있어요", "past");        /* 있 = existence, batchim ㅆ mais PAS un passé */
  not("시간이 있어요", "past");
  not("제가 하겠습니다", "past");             /* 겠 = volition, batchim ㅆ mais PAS un passé */
  has("제가 하겠습니다", "get");
});

/* ---------- connecteurs ---------- */
test("아서/어서 : connecteur en fin de mot ; 어서 adverbe, 에서 particule et 면서 exclus", () => {
  has("일이 많아서 너무 피곤해요", "aseo");
  has("피곤해서 집에 있어요", "aseo");
  not("어서 오세요", "aseo");                 /* 어서 seul = « vite », pas le connecteur */
  not("학교에서 공부해요", "aseo");           /* 에서 = particule de lieu */
  not("음악을 들으면서 공부해요", "aseo");
  has("음악을 들으면서 공부해요", "myeonseo");
});

test("니까 / 지만 / 는데-은데-ㄴ데", () => {
  has("위험하니까 조심하세요", "nikka");
  has("미안하지만 그 제안을 거절했어요", "jiman");
  has("날씨가 좋은데 산책할까요?", "nunde");
  has("미안한데 다시 말해 주세요", "nunde");  /* ㄴ데 contracté : 한 porte le batchim ㄴ */
});

test("(으)면 condition ; les nouilles ne conditionnent rien", () => {
  has("시간이 있으면 오세요", "myeon");
  has("바쁘면 내일 해요", "myeon");
  not("라면 주세요", "myeon");                /* 라면 = nom (nouilles), pas une condition */
});

test("-고 connecteur ; 하고 particule et 고 있다 progressif exclus", () => {
  has("밥을 먹고 자요", "go");
  not("친구하고 놀아요", "go");               /* N+하고 = « avec », ambigu mécaniquement → non taggé */
  not("지금 공부하고 있어요", "go");          /* c'est le progressif qui prime */
  has("지금 공부하고 있어요", "prog");
});

/* n-hue, l-ttae et les modifieurs ont besoin du LEXIQUE pour distinguer un nom d'une forme
   verbale (시간 후에 vs 끝난 후에). Les appelants réels le fournissent toujours. */
test("(으)려고 / (으)러 / 기 전에 / -(으)ㄴ 후에 / 기 때문에", () => {
  has("공부하려고 도서관에 가요", "ryeogo");
  has("밥을 먹으러 가요", "reo");
  has("자기 전에 책을 읽어요", "gi-jeone");
  has("수업이 끝난 후에 만나요", "n-hue", LEX);
  has("비가 오기 때문에 집에 있어요", "gi-ttaemune");
});

/* ---------- périphrases modales ---------- */
test("고 싶다 / ㄹ 수 있다 / 아야 하다 / 아도 되다", () => {
  has("한국에 가고 싶어요", "go-sipda");
  has("수영할 수 있어요", "l-su");
  has("숙제를 해야 해요", "aya-hada");
  has("먹어도 돼요", "ado-dweda");
});

test("아/어 주다 (faveur) et 아/어 보다 (essai) ; 보다 « regarder » exclu", () => {
  has("문을 열어 주세요", "a-juda");
  has("라면 주세요", "a-juda");
  has("한번 먹어 보세요", "a-boda");
  not("영화를 봐요", "a-boda");               /* regarder un film ≠ essayer */
});

test("것 같다 conjecture", () => {
  has("비가 올 것 같아요", "got-gatda");
  has("맞는 거 같아요", "got-gatda");
});

/* ---------- terminaisons ---------- */
test("futur ㄹ 거예요 : exige le batchim ㄹ du mot précédent", () => {
  has("내일 갈 거예요", "fut-geo");
  has("주말에 뭐 할 거예요?", "fut-geo");
  not("이건 제 거예요", "fut-geo");           /* 거 possessif, pas de ㄹ devant */
});

test("(으)세요 / ㄹ게요 / ㄹ까요 / 네요 / 지요-죠 / 습니다", () => {
  has("불을 켜세요", "seyo");
  has("제가 할게요", "lkeyo");
  has("같이 갈까요?", "lkkayo");
  has("날씨가 좋네요", "neyo");
  has("맛있죠?", "jiyo");
  has("감사합니다", "formal");                /* 합 : batchim ㅂ + 니다 */
  has("어디에 갑니까?", "formal");
});

/* ---------- négations ---------- */
test("안 / 못 / 지 않다 / 지 마세요", () => {
  has("오늘은 안 바빠요", "an");
  has("술을 못 마셔요", "mot");
  has("맵지 않아요", "ji-anta");
  has("걱정하지 마세요", "ji-maseyo");
});

/* ---------- ㄹ 때 ---------- */
test("(으)ㄹ 때 : quand", () => {
  has("발표할 때 자신감이 필요해요", "l-ttae", LEX);
  not("그 때 만나요", "l-ttae", LEX);         /* 그 때 = démonstratif, pas de ㄹ */
});

/* ---------- modifieurs : exigent le lexique ---------- */
test("modifieur présent 는 : vérifié contre le lexique, la particule de thème exclue", () => {
  const lex = new Set(["좋아하다", "하다", "좋다", "귀엽다", "크다"]);
  has("좋아하는 사람이 있어요", "mod-neun", lex);
  not("저는 학생이에요", "mod-neun", lex);    /* 저는 = thème : 저다 ∉ lexique */
  not("좋아하는 사람이 있어요", "mod-neun");  /* sans lexique : règle inactive (conservateur) */
});

test("modifieur ㄴ/은 : reconstruction du lemme, y compris ㅂ-irrégulier", () => {
  const lex = new Set(["좋다", "귀엽다", "크다", "맵다"]);
  has("좋은 방법을 찾았어요", "mod-n", lex);
  has("귀여운 강아지가 놀아요", "mod-n", lex);  /* 귀여운 → 귀엽다 (ㅂ-irrégulier) */
  has("매운 음식을 좋아해요", "mod-n", lex);    /* 매운 → 맵다 */
  not("한 시간 걸려요", "mod-n", lex);          /* 한 = « un » (compteur), pas 하다 */
});

/* ---------- métadonnées ---------- */
test("l'inventaire est cohérent : ids uniques, libellés et niveaux présents", () => {
  const ids = new Set();
  for(const s of GRAMMAR.STRUCTS){
    assert.ok(s.id && !ids.has(s.id), `id dupliqué ou vide : ${s.id}`);
    ids.add(s.id);
    assert.ok(s.fr && s.lvl && s.ex, `métadonnées incomplètes pour ${s.id}`);
  }
  /* toute structure retournée par le taggeur existe dans l'inventaire */
  for(const t of tags("어제 갔지만 좋았어요")) assert.ok(ids.has(t), `tag inconnu : ${t}`);
});

/* ================================================================
   Régression — revue adversariale (4 lentilles, 52 défauts confirmés).
   Chaque cas ci-dessous a été REPRODUIT sur le module avant correction.
   Le taggeur sert de LINT RUNTIME sur les phrases générées : un faux positif
   y devient un rejet injuste, un faux négatif y laisse passer une structure
   que l'apprenant ne connaît pas. Aucun LLM ne corrige derrière, d'où ces tests.
   ================================================================ */
test("go : 고 싶다, 지 말고 et l'adverbe 그리고 ne sont pas le connecteur -고", () => {
  not("한국에 가고 싶어요", "go", LEX);          /* l'auxiliaire de désir, pas « et puis » */
  has("한국에 가고 싶어요", "go-sipda", LEX);
  not("걱정하지 말고 쉬세요", "go", LEX);
  /* 그리고 est absent du deck : c'est le lint d'un chapitre GÉNÉRÉ qui a révélé ce faux positif */
  not("커피를 마셨어요. 그리고 책을 읽었어요.", "go", LEX);
});

test("go : les verbes en 하다 portent bien le connecteur (하고 comitatif exclu par le lexique)", () => {
  has("공부하고 자요", "go", LEX);               /* 공부하다 ∈ lexique → connecteur */
  not("친구하고 놀아요", "go", LEX);             /* 친구하다 ∉ lexique → particule « avec » */
});

test("reo : (으)러 가다·오다 au passé et au futur", () => {
  has("주말에 놀러 갔어요", "reo", LEX);
  has("한국에 공부하러 왔어요", "reo", LEX);
  has("친구를 만나러 갈 거예요", "reo", LEX);
  has("밥을 먹으러 갑니다", "reo", LEX);
});

test("lkkayo : 까 doit être une finale — N+까지 n'est pas une proposition", () => {
  not("오늘까지 해야 해요", "lkkayo", LEX);
  not("서울까지 가요", "lkkayo", LEX);
  has("같이 갈까요?", "lkkayo", LEX);
  has("뭐 먹을까?", "lkkayo", LEX);
});

test("l-ttae : le ㄹ doit être un modifieur verbal, pas la finale d'un nom", () => {
  not("일 때문에 못 가요", "l-ttae", LEX);       /* 일 = nom */
  not("생일 때 뭐 했어요?", "l-ttae", LEX);
  has("발표할 때 떨려요", "l-ttae", LEX);
});

test("n-hue : 다음에 seul et N 후에 ne sont pas la structure verbale", () => {
  not("다음에 또 만나요", "n-hue", LEX);         /* « à la prochaine » */
  not("한 시간 후에 만나요", "n-hue", LEX);      /* 시간 = nom */
  has("수업이 끝난 후에 만나요", "n-hue", LEX);
  has("밥을 먹고 나서 자요", "n-hue", LEX);
});

test("nikka : les questions formelles ㅂ니까/습니까 ne sont pas la cause (으)니까", () => {
  not("어디에 갑니까?", "nikka", LEX);
  has("어디에 갑니까?", "formal", LEX);
  not("밥을 먹었습니까?", "nikka", LEX);
  has("위험하니까 조심하세요", "nikka", LEX);
});

test("jiman / gunyo / gi-ttaemune : les noms homographes ne déclenchent rien", () => {
  not("바지만 샀어요", "jiman", LEX);            /* 바지 + 만 */
  has("비싸지만 좋아요", "jiman", LEX);
  not("친구나 만나요", "gunyo", LEX);            /* 친구 + 나 */
  has("한국 사람이군요", "gunyo", LEX);
  not("감기 때문에 못 갔어요", "gi-ttaemune", LEX);
  has("비가 오기 때문에 집에 있어요", "gi-ttaemune", LEX);
});

test("famille ㅙ : les contractions de 되다 (돼서, 돼야, 돼도) sont vues", () => {
  has("일이 잘 돼서 좋아요", "aseo", LEX);
  has("빨리 돼야 해요", "aya-hada", LEX);
});

test("auxiliaires au passé et au futur : 됐어요 / 했어요 / 될 거예요", () => {
  has("먹어도 됐어요", "ado-dweda", LEX);
  has("숙제를 해야 했어요", "aya-hada", LEX);
});

test("l-su : la particule insérée (수도/수가/수는) ne casse pas la capacité", () => {
  has("갈 수도 있어요", "l-su", LEX);
  has("먹을 수가 없어요", "l-su", LEX);
});

test("négations avec particule ou soudées : 지는 않다, 지 말고, 못하다", () => {
  has("맵지는 않아요", "ji-anta", LEX);
  has("가지 말고 여기 있어요", "ji-maseyo", LEX);
  has("수영을 못해요", "mot", LEX);              /* orthographe standard soudée */
  /* RÉGRESSION (revue v120) : comparer 마 « sans son batchim » attrapait aussi 만 —
     tout 지만 (« mais ») devenait une interdiction. Seuls 마 et 말 sont recevables. */
  not("비싸지만 좋아요", "ji-maseyo", LEX);
  not("미안하지만 못 가요", "ji-maseyo", LEX);
});

test("modifieurs : la particule de thème 은/는 sur un NOM du deck n'est pas un modifieur", () => {
  /* RÉGRESSION (revue v120) : 말은 (« la parole », thème) devenait un modifieur de 말다. */
  const lex = new Set(["말다", "말", "친구", "좋다", "크다"]);
  not("말은 좋아요", "mod-n", lex);
  not("친구는 커요", "mod-neun", lex);
  has("좋은 사람이에요", "mod-n", lex);          /* le vrai modifieur reste détecté */
});

test("a-juda / a-boda : graphies soudées et formes moins courantes", () => {
  has("좀 도와주세요", "a-juda", LEX);           /* 도와주세요 en un mot */
  has("문을 열어 주었어요", "a-juda", LEX);
  has("한번 가봤어요", "a-boda", LEX);           /* 가봤어요 en un mot */
  not("가서 봤어요", "a-boda", LEX);             /* 아서 + 보다 « regarder », pas « essayer » */
});

test("mod-n : un nom monosyllabique à batchim ㄴ n'est pas un modifieur", () => {
  not("산 위에 있어요", "mod-n", LEX);           /* 산 = montagne, pas 사다 */
  has("큰 집이에요", "mod-n", LEX);              /* 큰 ← 크다, vrai modifieur monosyllabique */
});

test("entrée décomposée (NFD) : mêmes tags qu'en NFC", () => {
  const nfc = "어제 밥을 먹었어요";
  assert.deepEqual(tags(nfc.normalize("NFD"), LEX), tags(nfc, LEX));
});

/* ---------- agrégation en profil ---------- */
test("grammarProfile : une structure rare mais TOUJOURS maîtrisée est acquise", () => {
  /* seuil de 3 inatteignable pour une structure que seules 2 cartes portent :
     sans cette règle, elle resterait « en cours » à vie et le narrateur ne l'emploierait jamais. */
  const p = GRAMMAR.grammarProfile([
    { tags: ["ryeogo"], stage: 5 },
    { tags: ["ryeogo"], stage: 4 },
    { tags: ["janha"],  stage: 5 },   /* une seule preuve : pas assez */
  ]);
  assert.equal(p["ryeogo"].status, "acquise");
  assert.equal(p["janha"].status,  "en-cours");
});

test("grammarProfile : acquise (≥3 maîtrisées), en-cours (exposée), inconnue", () => {
  const list = [
    { tags: ["past", "aseo"],  stage: 5 },
    { tags: ["past"],          stage: 4 },
    { tags: ["past", "seyo"],  stage: 6 },
    { tags: ["aseo"],          stage: 2 },
    { tags: ["nikka"],         stage: 4 },
    { tags: ["ryeogo"],        stage: 0 },
  ];
  const p = GRAMMAR.grammarProfile(list);
  assert.equal(p["past"].status,  "acquise");    /* 3 cartes maîtrisées */
  assert.equal(p["past"].mastered, 3);
  assert.equal(p["aseo"].status,  "en-cours");   /* 1 maîtrisée + 1 vue */
  assert.equal(p["nikka"].status, "en-cours");   /* 1 seule maîtrisée : pas assez pour acquise */
  assert.equal(p["ryeogo"].status, "inconnue");  /* jamais montée au-dessus de stage 0 */
  assert.equal(p["fut-geo"], undefined);         /* jamais rencontrée : absente du profil */
});

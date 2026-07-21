/* Sori — grammar.js : profil grammatical DÉRIVÉ (fondation de l'histoire générée).
   Rien de nouveau à réviser : on lit autrement ce qui existe. Les 1050 cartes-phrases passent
   par FSRS comme les mots ; maîtriser une phrase est une preuve datée de compréhension des
   structures qu'elle contient. Ce module :
   - STRUCTS               : inventaire fermé (~34 structures A1-B1), id + libellé FR + exemple
   - tagStructures(kr,lex) : détecte les structures d'une phrase. NIVEAU JAMO obligatoire :
                             le passé contracté (했/왔/갔) est invisible en surface (batchim ㅆ),
                             le futur 갈 거예요 exige le batchim ㄹ, etc. `lex` (Set des lemmes
                             du deck, optionnel) active les règles de modifieurs (좋아하는/좋은/
                             귀여운) qui exigent une vérification lexicale — sans lexique elles
                             se taisent (conservateur, zéro faux positif).
   - grammarProfile(list)  : agrège l'état FSRS des cartes taggées → statut par structure
                             (acquise ≥3 cartes maîtrisées / en-cours / inconnue).
   Le tagging de MASSE (les 1050 phrases du deck) se fait au build avec une passe de
   vérification LLM (tools/grammar_tag.mjs) → docs/grammar-data.js. Le runtime reste
   déterministe : il ne fait qu'agréger.
   C# pur… pardon, JS pur : zéro DOM, zéro localStorage. Tests : node --test tests/grammar.test.mjs */
(function(root){
  "use strict";

  /* ================= jamo ================= */
  const SYL0 = 0xAC00, SYLN = 11172;
  function isSyl(c){ if(!c) return false; const x = c.codePointAt(0) - SYL0; return x >= 0 && x < SYLN; }
  /* index de batchim 0-27 (0 = aucun, 4 = ㄴ, 8 = ㄹ, 17 = ㅂ, 20 = ㅆ) */
  function tail(c){ return isSyl(c) ? (c.codePointAt(0) - SYL0) % 28 : -1; }
  /* index de voyelle 0-20 (0 ㅏ, 1 ㅐ, 4 ㅓ, 6 ㅕ, 9 ㅘ, 14 ㅝ) */
  function vowel(c){ return isSyl(c) ? Math.floor(((c.codePointAt(0) - SYL0) % 588) / 28) : -1; }
  function withTail(c, t){
    if(!isSyl(c)) return c;
    const cp = c.codePointAt(0) - SYL0;
    return String.fromCharCode(SYL0 + cp - (cp % 28) + t);
  }
  /* la syllabe se termine par une voyelle de la famille 아/어 (아,애,어,여,와,왜,워) sans batchim —
     la forme que prennent les radicaux verbaux devant 서/야/도/보다/주다.
     ㅙ (index 10) est indispensable : 되어 se contracte en 돼 (돼서, 돼야, 돼도). */
  const AEO = new Set([0, 1, 4, 6, 9, 10, 14]);
  function endsAeo(c){ return tail(c) === 0 && AEO.has(vowel(c)); }
  const lastOf = w => w[w.length - 1];

  /* ================= inventaire ================= */
  /* lvl = ordre d'acquisition usuel (TOPIK I ≈ A1/A2, début TOPIK II ≈ B1). `ex` sert au
     prompt du narrateur (montrer, pas décrire). */
  const STRUCTS = [
    { id:"past",        fr:"passé 았/었/했",                lvl:"A1", ex:"어제 밥을 먹었어요" },
    { id:"seyo",        fr:"(으)세요 — demande polie",      lvl:"A1", ex:"여기 앉으세요" },
    { id:"an",          fr:"négation 안",                   lvl:"A1", ex:"오늘은 안 바빠요" },
    { id:"mot",         fr:"impossibilité 못",              lvl:"A1", ex:"술을 못 마셔요" },
    { id:"go",          fr:"-고 — et/puis",                 lvl:"A1", ex:"밥을 먹고 자요" },
    { id:"go-sipda",    fr:"고 싶다 — vouloir",             lvl:"A1", ex:"한국에 가고 싶어요" },
    { id:"formal",      fr:"습니다 — registre formel",      lvl:"A1", ex:"감사합니다" },
    { id:"a-juda",      fr:"아/어 주다 — faveur",           lvl:"A1", ex:"문을 열어 주세요" },
    { id:"fut-geo",     fr:"(으)ㄹ 거예요 — futur",         lvl:"A2", ex:"내일 갈 거예요" },
    { id:"prog",        fr:"고 있다 — progressif",          lvl:"A2", ex:"지금 공부하고 있어요" },
    { id:"aseo",        fr:"아서/어서 — cause·séquence",    lvl:"A2", ex:"바빠서 못 갔어요" },
    { id:"nikka",       fr:"(으)니까 — cause",              lvl:"A2", ex:"위험하니까 조심하세요" },
    { id:"jiman",       fr:"지만 — mais",                   lvl:"A2", ex:"비싸지만 좋아요" },
    { id:"nunde",       fr:"는데/은데 — contexte",          lvl:"A2", ex:"좋은데 좀 비싸요" },
    { id:"myeon",       fr:"(으)면 — condition",            lvl:"A2", ex:"시간이 있으면 오세요" },
    { id:"l-su",        fr:"(으)ㄹ 수 있다/없다 — capacité", lvl:"A2", ex:"수영할 수 있어요" },
    { id:"aya-hada",    fr:"아야/어야 하다 — obligation",   lvl:"A2", ex:"숙제를 해야 해요" },
    { id:"ado-dweda",   fr:"아도/어도 되다 — permission",   lvl:"A2", ex:"먹어도 돼요" },
    { id:"a-boda",      fr:"아/어 보다 — essayer",          lvl:"A2", ex:"한번 먹어 보세요" },
    { id:"ji-anta",     fr:"지 않다 — négation longue",     lvl:"A2", ex:"맵지 않아요" },
    { id:"ji-maseyo",   fr:"지 마세요 — interdiction",      lvl:"A2", ex:"걱정하지 마세요" },
    { id:"lkeyo",       fr:"(으)ㄹ게요 — engagement",       lvl:"A2", ex:"제가 할게요" },
    { id:"lkkayo",      fr:"(으)ㄹ까요 — proposition",      lvl:"A2", ex:"같이 갈까요?" },
    { id:"neyo",        fr:"네요 — constat",                lvl:"A2", ex:"날씨가 좋네요" },
    { id:"jiyo",        fr:"지요/죠 — confirmation",        lvl:"A2", ex:"맛있죠?" },
    { id:"reo",         fr:"(으)러 가다 — but du déplacement", lvl:"A2", ex:"밥을 먹으러 가요" },
    { id:"l-ttae",      fr:"(으)ㄹ 때 — quand",             lvl:"A2", ex:"발표할 때 떨려요" },
    { id:"gi-jeone",    fr:"기 전에 — avant de",            lvl:"A2", ex:"자기 전에 책을 읽어요" },
    { id:"n-hue",       fr:"(으)ㄴ 후에 — après",           lvl:"A2", ex:"수업이 끝난 후에 만나요" },
    { id:"got-gatda",   fr:"것 같다 — conjecture",          lvl:"A2", ex:"비가 올 것 같아요" },
    { id:"mod-neun",    fr:"modifieur 는 + nom",            lvl:"A2", ex:"좋아하는 사람" },
    { id:"mod-n",       fr:"modifieur ㄴ/은 + nom",         lvl:"A2", ex:"좋은 방법" },
    { id:"ryeogo",      fr:"(으)려고 — intention",          lvl:"B1", ex:"공부하려고 도서관에 가요" },
    { id:"gi-ttaemune", fr:"기 때문에 — parce que",         lvl:"B1", ex:"비가 오기 때문에 집에 있어요" },
    { id:"myeonseo",    fr:"(으)면서 — en même temps",      lvl:"B1", ex:"음악을 들으면서 공부해요" },
    { id:"get",         fr:"겠 — volition·conjecture",      lvl:"B1", ex:"제가 하겠습니다" },
    { id:"janha",       fr:"잖아요 — tu sais bien",         lvl:"B1", ex:"어제 말했잖아요" },
    { id:"gunyo",       fr:"군요/구나 — découverte",        lvl:"B1", ex:"한국 사람이군요" },
  ];

  /* noms en -면 qui ne conditionnent rien (nouilles, surtout) */
  const NOODLES = new Set(["라면", "냉면", "비빔면", "짜장면", "쫄면", "당면"]);
  /* -ㄴ lexicalisés qui ne sont pas des modifieurs verbaux (한 시간 = « une » heure) */
  const NOT_MOD_N = new Set(["한", "두", "세", "네"]);
  /* mots en -고 qui ne sont PAS le connecteur : adverbes de coordination et l'auxiliaire 말다.
     그리고 est absent du deck mais omniprésent dans un texte généré — c'est le lint runtime
     (story_trial) qui l'a fait apparaître, pas le build. */
  const ADV_GO = new Set(["그리고", "그러고", "말고"]);

  /* Le mot est-il un MODIFIEUR verbal en ㄴ/은 (좋은, 귀여운, 끝난) plutôt qu'un nom ?
     Réutilisé par mod-n, n-hue et l-ttae — c'est la même question posée trois fois.
     Deux garde-fous : le mot nu présent au lexique est un NOM (산, 시간, 생일), et sans
     lexique on ne tranche pas (conservateur : zéro faux positif). */
  function isModN(w, lex){
    if(!lex || !w || NOT_MOD_N.has(w) || lex.has(w)) return false;
    /* 말은, 일은, 친구는… : le mot SANS sa dernière syllabe est un nom du deck → c'est la
       particule de thème, pas un modifieur verbal (revue v120). */
    if(lex.has(w.slice(0, -1))) return false;
    const last = lastOf(w);
    if(last === "은" && w.length >= 2) return lex.has(w.slice(0, -1) + "다");
    if(last === "운" && w.length >= 2){
      /* ㅂ-irrégulier : 귀여운 -> 귀엽다, 매운 -> 맵다 */
      const base = w.slice(0, -1);
      return lex.has(base.slice(0, -1) + withTail(lastOf(base), 17) + "다");
    }
    if(tail(last) === 4) return lex.has(w.slice(0, -1) + withTail(last, 0) + "다");
    return false;
  }
  /* Même question pour un modifieur en (으)ㄹ (발표할 때, 갈 거예요) : batchim ㄹ + lemme au lexique. */
  function isModL(w, lex){
    if(!lex || !w || lex.has(w)) return false;
    const last = lastOf(w);
    if(tail(last) !== 8) return false;
    return lex.has(w.slice(0, -1) + withTail(last, 0) + "다") || lex.has(w.slice(0, -1) + "다");
  }

  /* ================= règles ================= */
  /* chaque règle : (s = phrase, W = mots sans ponctuation, lex = Set lemmes | undefined) -> bool */
  const RULES = {
    "past": s => [...s].some(c => tail(c) === 20 && c !== "있" && c !== "겠"),
    "get":  s => s.includes("겠"),
    "aseo": (s, W) => W.some(w => w.length >= 2 && w.endsWith("서") && w !== "어서" && endsAeo(w[w.length - 2])),
    "myeonseo": (s, W) => W.some(w => w.endsWith("면서")),
    /* 니까 est aussi la fin de TOUTE question formelle (갑니까, 먹었습니까) : exiger que la
       syllabe précédente ne soit ni 습 ni un batchim ㅂ. */
    "nikka":  s => {
      const a = [...s];
      return a.some((c, i) => c === "니" && a[i + 1] === "까"
        && i > 0 && a[i - 1] !== "습" && tail(a[i - 1]) !== 17);
    },
    /* 지만 est aussi N+만 « seulement » (바지만, 아버지만) : le nom nu est au lexique. */
    "jiman": (s, W, lex) => W.some(w => {
      const k = w.indexOf("지만");
      if(k < 0) return false;
      return !(lex && lex.has(w.slice(0, k + 1)));
    }),
    "nunde":  s => {
      if(s.includes("는데") || s.includes("은데")) return true;
      const a = [...s];
      return a.some((c, i) => tail(c) === 4 && a[i + 1] === "데");
    },
    "myeon": (s, W) => W.some(w => w.endsWith("면") && !NOODLES.has(w)),
    /* -고 connecteur. Trois pièges : la particule comitative N하고 (친구하고 = « avec »),
       les auxiliaires qui l'absorbent (고 있다, 고 싶다), et 지 말고. Pour 하고, le lexique
       tranche : 공부하다 existe → connecteur ; 친구하다 n'existe pas → particule. */
    "go": (s, W, lex) => W.some((w, i) => {
      if(w.length < 2 || !w.endsWith("고")) return false;
      if(w.endsWith("라고") || w.endsWith("다고") || ADV_GO.has(w)) return false;
      if(w.endsWith("하고") && !(lex && lex.has(w.slice(0, -1) + "다"))) return false;
      const next = W[i + 1];
      if(next && (next.startsWith("있") || next.startsWith("계") || next.startsWith("싶"))) return false;
      return true;
    }),
    "prog": s => s.includes("고 있") || s.includes("고 계"),
    "ryeogo": s => s.includes("려고"),
    /* (으)러 + verbe de déplacement, à TOUS les temps : 가/갔/갈/갑, 오/왔/올/옵/와, 다녀. */
    "reo": (s, W) => W.some((w, i) => w.endsWith("러") && W[i + 1]
      && ["가", "갔", "갈", "갑", "오", "왔", "올", "옵", "와", "다녀"].some(p => W[i + 1].startsWith(p))),
    /* 기 전에 / 기 때문에 : 기 doit être la nominalisation d'un verbe, pas la fin d'un nom
       (감기 때문에 = « à cause du rhume », 이야기 전에). Le lexique tranche à nouveau. */
    "gi-jeone":    (s, W, lex) => W.some((w, i) => w.endsWith("기") && !(lex && lex.has(w))
      && W[i + 1] && W[i + 1].startsWith("전")),
    "gi-ttaemune": (s, W, lex) => W.some((w, i) => w.endsWith("기") && !(lex && lex.has(w))
      && W[i + 1] && W[i + 1].startsWith("때문")),
    /* 고 나서 est sans ambiguïté ; 후에/다음에 exigent un vrai modifieur ㄴ devant
       (끝난 후에 ✓, 시간 후에 ✗ nom, 다음에 seul ✗ = « à la prochaine »). */
    "n-hue": (s, W, lex) => s.includes("고 나서")
      || W.some((w, i) => i > 0 && (w.startsWith("후에") || w.startsWith("다음에")) && isModN(W[i - 1], lex)),
    "go-sipda":    s => s.includes("고 싶"),
    /* 수 peut porter une particule : 수도/수가/수는/수밖에. */
    "l-su": (s, W, lex) => W.some((w, i) => w.startsWith("수") && w.length <= 3
      && W[i + 1] && (W[i + 1].startsWith("있") || W[i + 1].startsWith("없"))
      && i > 0 && tail(lastOf(W[i - 1])) === 8),
    "aya-hada": (s, W) => W.some((w, i) => w.length >= 2 && w.endsWith("야") && endsAeo(w[w.length - 2])
      && W[i + 1] && ["하", "해", "했", "할", "합", "되", "돼", "됐", "될", "됩"].some(p => W[i + 1].startsWith(p))),
    "ado-dweda": (s, W) => W.some((w, i) => w.length >= 2 && w.endsWith("도") && endsAeo(w[w.length - 2])
      && W[i + 1] && ["되", "돼", "됐", "될", "됩"].some(p => W[i + 1].startsWith(p))),
    /* 주다 de faveur, y compris soudé au verbe porteur (도와주세요) et aux formes moins
       courantes (주었어요, 줍니다, 주시겠어요). */
    "a-juda": s => /주세요|주시|줬|줘|주었|줍니다|주다/.test(s),
    /* 보다 « essayer » : le verbe porteur est en 아/어 juste avant — soit séparé (먹어 보세요),
       soit soudé (가봤어요). Un 아서 devant, en revanche, c'est « regarder » (가서 봤어요). */
    "a-boda": (s, W) => W.some((w, i) => {
      const forms = ["보세요", "봐요", "봤", "볼까", "볼게", "봐"];
      if(forms.some(p => w.startsWith(p)))
        return i > 0 && !W[i - 1].endsWith("서") && endsAeo(lastOf(W[i - 1]));
      /* graphie soudée : le verbe et 보다 dans le même mot */
      const k = w.search(/[보봐봤볼]/);
      return k > 0 && forms.some(p => w.slice(k).startsWith(p)) && endsAeo(w[k - 1]);
    }),
    "got-gatda": s => s.includes("것 같") || s.includes("거 같"),
    "fut-geo": (s, W) => W.some((w, i) => tail(w[w.length - 1]) === 8 && W[i + 1]
      && ["거예", "거야", "거였", "겁니"].some(p => W[i + 1].startsWith(p))),
    "seyo": s => s.includes("세요"),
    "lkeyo":  (s, W) => W.some(w => w.endsWith("게요") && w.length >= 3 && tail(w[w.length - 3]) === 8),
    /* 까 doit être une FINALE (갈까요, 갈까) — sinon N+까지 (오늘까지, 서울까지) matcherait,
       ces noms portant un batchim ㄹ. */
    "lkkayo": (s, W) => W.some(w => {
      const k = w.indexOf("까");
      if(k <= 0 || tail(w[k - 1]) !== 8) return false;
      const rest = w.slice(k + 1);
      return rest === "" || rest === "요";
    }),
    "neyo": s => s.includes("네요"),
    "jiyo": s => s.includes("지요") || s.includes("죠"),
    "janha": s => s.includes("잖아"),
    /* 구나 est aussi la particule de coordination N(이)나 (친구나 = « ou un ami »). */
    "gunyo": (s, W, lex) => s.includes("군요")
      || W.some(w => w.includes("구나") && !(lex && lex.has(w.slice(0, w.indexOf("구나") + 1)))),
    "formal": s => {
      if(s.includes("습니다") || s.includes("습니까")) return true;
      const a = [...s];
      return a.some((c, i) => tail(c) === 17 && a[i + 1] === "니");
    },
    "an":  (s, W) => W.includes("안"),
    /* 못 est aussi soudé au verbe dans l'orthographe standard : 못해요, 못했어요. */
    "mot": (s, W) => W.includes("못") || s.includes("지 못") || /못[하해했할합]/.test(s),
    /* la négation longue admet une particule entre 지 et 않다 : 맵지는 않아요, 크지도 않아요. */
    "ji-anta":   s => /지(는|도|가|를)?\s*않/.test(s),
    /* 마 porte souvent un batchim (지 말고, 지 말자) : accepter 마 nu et 말 (ㄹ), mais SURTOUT
       PAS 만 (ㄴ) — sinon tout 지만 « mais » deviendrait une interdiction (revue v120). */
    "ji-maseyo": s => {
      const a = [...s.replace(/\s+/g, "")];
      return a.some((c, i) => {
        if(c !== "지" || !a[i + 1]) return false;
        const t = tail(a[i + 1]);
        return (t === 0 || t === 8) && withTail(a[i + 1], 0) === "마";
      });
    },
    /* (으)ㄹ 때 : le ㄹ doit venir d'un verbe (발표할), pas de la finale d'un nom (일, 생일).
       때문 est une autre structure — ne pas la capturer ici. */
    "l-ttae": (s, W, lex) => W.some((w, i) => W[i + 1] && W[i + 1].startsWith("때")
      && !W[i + 1].startsWith("때문") && isModL(w, lex)),
    "mod-neun": (s, W, lex) => !!lex && W.some((w, i) => w.length >= 2 && w.endsWith("는")
      && W[i + 1] && !lex.has(w.slice(0, -1))       /* 친구는 = thème, pas un modifieur */
      && lex.has(w.slice(0, -1) + "다")),
    "mod-n": (s, W, lex) => W.some((w, i) => W[i + 1] && isModN(w, lex)),
  };

  /* ================= API ================= */
  function tagStructures(kr, lex){
    /* NFC obligatoire : une entrée décomposée (NFD, fréquente sur du texte venu de macOS ou
       d'une API) n'a AUCUNE syllabe précomposée — toutes les règles jamo échoueraient en silence. */
    const s = String(kr == null ? "" : kr).normalize("NFC").trim();
    if(!s) return [];
    const W = s.split(/\s+/)
      .map(w => w.replace(/[?!.,…~"'«»()]+$/g, "").replace(/^[?!.,…~"'«»()]+/g, ""))
      .filter(Boolean);
    const out = [];
    for(const st of STRUCTS){
      const rule = RULES[st.id];
      if(rule && rule(s, W, lex)) out.push(st.id);
    }
    return out;
  }

  /* list = [{tags:[ids], stage}] (l'appelant mappe ST.items + GRAMMAR_TAGS) ->
     { id: {total, seen, mastered, status} }. Seuils : maîtrisée = stage>=4 (même définition
     que les stats de niveau), acquise = >=3 cartes maîtrisées qui la portent. */
  const PROFILE = { MASTERED_STAGE: 4, SEEN_STAGE: 1, ACQ_MIN: 3, ACQ_ALL_MIN: 2, CUR_SEEN: 2 };
  function grammarProfile(list){
    const P = {};
    for(const it of (list || [])){
      const stage = it.stage || 0;
      for(const t of (it.tags || [])){
        const e = P[t] || (P[t] = { total: 0, seen: 0, mastered: 0, status: "inconnue" });
        e.total++;
        if(stage >= PROFILE.SEEN_STAGE) e.seen++;
        if(stage >= PROFILE.MASTERED_STAGE) e.mastered++;
      }
    }
    for(const id in P){
      const e = P[id];
      /* Le seuil de 3 est inatteignable pour une structure que le deck ne porte que 2 fois :
         elle resterait « en cours » à vie. Toutes les cartes maîtrisées (≥2) valent acquisition. */
      const acquise = e.mastered >= PROFILE.ACQ_MIN
        || (e.mastered === e.total && e.total >= PROFILE.ACQ_ALL_MIN);
      e.status = acquise ? "acquise"
        : (e.mastered >= 1 || e.seen >= PROFILE.CUR_SEEN) ? "en-cours" : "inconnue";
    }
    return P;
  }

  /* ================= export double environnement ================= */
  const GRAMMAR = { STRUCTS, tagStructures, grammarProfile, PROFILE };
  if (typeof module !== "undefined" && module.exports) module.exports = GRAMMAR;
  else root.SORI_GRAMMAR = GRAMMAR;
})(typeof self !== "undefined" ? self : this);

/* Sori — gramex.js : exercice de GRAMMAIRE (onglet Exercices, carte « série de 10 »).
   Trois formes, choisies par l'user (v146) :
   - CONJUGAISON : un verbe du deck + une forme cible ((으)세요, passé, futur, 아/어요,
     (으)니까, (으)면) → choisir la forme correcte parmi 4. Les pièges sont générés par les
     VRAIES règles jamo mal appliquées (돌으세요, 맵어요, 몰르아요…) — c'est la réponse
     durable au doute « 왼쪽으로 도세요 ??? » (rapport 27/07).
   - À TROU : une phrase du deck (taguée par grammar-data.js) dont le connecteur est masqué
     → choisir la bonne terminaison parmi des alternatives de la MÊME famille morphologique
     (même radical, même attache : jamais de forme mal construite dans les options).
     Le sens est guidé par la traduction française affichée.
   - REPÉRAGE : une phrase du deck → identifier la structure grammaticale qu'elle contient
     (libellés français de l'inventaire SORI_GRAMMAR.STRUCTS).
   Partie PURE (SORI_GRAMEX.pure) : conjugueur + générateurs, zéro DOM, zéro localStorage,
   RNG injectable — testée sous Node (tests/gramex.test.mjs). Ce module n'écrit AUCUN état ;
   la journalisation passe par opts.onAnswer (app.js → logAnswer "grammaire", hors planning).
   opts = { structs, profile, sentences:[{id,kr,fr,tags}], lex:Set(lemmes du deck),
            speak(txt), onAnswer(ok), random() } */
(function(root){
  "use strict";

  /* ================= jamo ================= */
  var SYL0 = 0xAC00, SYLN = 11172;
  function isSyl(c){ if(!c) return false; var x = c.codePointAt(0) - SYL0; return x >= 0 && x < SYLN; }
  function lead(c){  return isSyl(c) ? Math.floor((c.codePointAt(0) - SYL0) / 588) : -1; }
  function vowel(c){ return isSyl(c) ? Math.floor(((c.codePointAt(0) - SYL0) % 588) / 28) : -1; }
  function tail(c){  return isSyl(c) ? (c.codePointAt(0) - SYL0) % 28 : -1; }
  function com(l, v, t){ return String.fromCharCode(SYL0 + l * 588 + v * 28 + (t || 0)); }
  function withTail(c, t){ return isSyl(c) ? com(lead(c), vowel(c), t) : c; }
  function withVowel(c, v){ return isSyl(c) ? com(lead(c), v, tail(c)) : c; }
  var lastOf = function(w){ return w[w.length - 1]; };
  /* voyelles claires (ㅏ, ㅗ) → harmonie en 아 ; le reste → 어 */
  var BRIGHT = { 0: 1, 8: 1 };                       /* index ㅏ=0, ㅗ=8 */
  /* la syllabe se termine en famille 아/어 sans batchim (forme 아/어 déjà jointe) —
     même ensemble que grammar.js (ㅙ inclus : 돼서, 돼도) */
  var AEO = { 0: 1, 1: 1, 4: 1, 6: 1, 9: 1, 10: 1, 14: 1 };
  function endsAeo(c){ return tail(c) === 0 && AEO[vowel(c)] === 1; }
  /* index de tail : ㄴ=4, ㄷ=7, ㄹ=8, ㅂ=17, ㅅ=19, ㅆ=20 */
  var T_NONE = 0, T_D = 7, T_L = 8, T_B = 17, T_S = 19, T_SS = 20;

  /* ================= conjugueur ================= */
  /* Verbes/adjectifs CURATÉS du deck, classe vérifiée à la main (tests exhaustifs) :
     r  = régulier (contractions vocaliques gérées par attachAe)
     ha = en 하다            eu = ㅡ qui tombe (바쁘다→바빠)   l  = radical en ㄹ
     b  = irrégulier ㅂ      d  = irrégulier ㄷ                s  = irrégulier ㅅ
     reu= irrégulier 르      adj:1 = adjectif (pas de (으)세요 ni de futur en exercice) */
  var VERBS = [
    { b:"가다",     cls:"r",  fr:"aller" },          { b:"오다",     cls:"r",  fr:"venir" },
    { b:"먹다",     cls:"r",  fr:"manger" },         { b:"마시다",   cls:"r",  fr:"boire" },
    { b:"보다",     cls:"r",  fr:"voir, regarder" }, { b:"주다",     cls:"r",  fr:"donner" },
    { b:"받다",     cls:"r",  fr:"recevoir" },       { b:"읽다",     cls:"r",  fr:"lire" },
    { b:"앉다",     cls:"r",  fr:"s'asseoir" },      { b:"입다",     cls:"r",  fr:"porter (vêtement)" },
    { b:"웃다",     cls:"r",  fr:"rire" },           { b:"씻다",     cls:"r",  fr:"se laver" },
    { b:"배우다",   cls:"r",  fr:"apprendre" },      { b:"기다리다", cls:"r",  fr:"attendre" },
    { b:"만나다",   cls:"r",  fr:"rencontrer" },     { b:"자다",     cls:"r",  fr:"dormir" },
    { b:"사다",     cls:"r",  fr:"acheter" },        { b:"보내다",   cls:"r",  fr:"envoyer" },
    { b:"공부하다", cls:"ha", fr:"étudier" },        { b:"일하다",   cls:"ha", fr:"travailler" },
    { b:"전화하다", cls:"ha", fr:"téléphoner" },     { b:"운동하다", cls:"ha", fr:"faire du sport" },
    { b:"쓰다",     cls:"eu", fr:"écrire, utiliser" },
    { b:"살다",     cls:"l",  fr:"vivre, habiter" }, { b:"알다",     cls:"l",  fr:"savoir" },
    { b:"놀다",     cls:"l",  fr:"jouer, s'amuser" },{ b:"돌다",     cls:"l",  fr:"tourner" },
    { b:"팔다",     cls:"l",  fr:"vendre" },         { b:"만들다",   cls:"l",  fr:"fabriquer" },
    { b:"열다",     cls:"l",  fr:"ouvrir" },         { b:"울다",     cls:"l",  fr:"pleurer" },
    { b:"듣다",     cls:"d",  fr:"écouter" },        { b:"걷다",     cls:"d",  fr:"marcher" },
    { b:"묻다",     cls:"d",  fr:"demander" },
    { b:"돕다",     cls:"b",  fr:"aider" },
    { b:"부르다",   cls:"reu",fr:"appeler, chanter" },
    { b:"모르다",   cls:"reu",fr:"ne pas savoir" },  { b:"고르다",   cls:"reu",fr:"choisir" },
    { b:"짓다",     cls:"s",  fr:"construire" },     { b:"낫다",     cls:"s",  fr:"guérir" },
    { b:"바쁘다",   cls:"eu", fr:"être occupé",  adj:1 }, { b:"예쁘다", cls:"eu", fr:"être joli",    adj:1 },
    { b:"아프다",   cls:"eu", fr:"avoir mal",    adj:1 }, { b:"크다",   cls:"eu", fr:"être grand",   adj:1 },
    { b:"슬프다",   cls:"eu", fr:"être triste",  adj:1 },
    { b:"맵다",     cls:"b",  fr:"être épicé",   adj:1 }, { b:"덥다",   cls:"b",  fr:"faire chaud",  adj:1 },
    { b:"춥다",     cls:"b",  fr:"faire froid",  adj:1 }, { b:"어렵다", cls:"b",  fr:"être difficile", adj:1 },
    { b:"쉽다",     cls:"b",  fr:"être facile",  adj:1 }, { b:"무겁다", cls:"b",  fr:"être lourd",   adj:1 },
    { b:"귀엽다",   cls:"b",  fr:"être mignon",  adj:1 },
    { b:"다르다",   cls:"reu",fr:"être différent", adj:1 }, { b:"빠르다", cls:"reu",fr:"être rapide", adj:1 },
    { b:"길다",     cls:"l",  fr:"être long",    adj:1 }, { b:"멀다",   cls:"l",  fr:"être loin",    adj:1 }
  ];

  /* forme 아/어 jointe (base de 아/어요, 았/었어요, et famille 서/도/야) */
  function aeForm(stem, cls){
    var last = lastOf(stem), pre = stem.slice(0, -1);
    if(cls === "ha")  return pre + "해";                /* 공부하 → 공부해 */
    if(cls === "eu"){                                   /* ㅡ tombe, harmonie sur la syllabe d'avant */
      var prev = stem.length >= 2 ? stem[stem.length - 2] : null;
      var v = prev && BRIGHT[vowel(prev)] ? 0 : 4;      /* 바쁘→바빠, 예쁘→예뻐, 쓰→써 */
      return pre + com(lead(last), v, 0);
    }
    if(cls === "b"){                                    /* ㅂ → 워 (돕다/곱다 → 와) */
      return pre + withTail(last, 0) + (stem === "돕" || stem === "곱" ? "와" : "워");
    }
    if(cls === "d") return pre + withTail(last, T_L) + (BRIGHT[vowel(last)] ? "아" : "어");
    if(cls === "s") return pre + withTail(last, 0) + (BRIGHT[vowel(last)] ? "아" : "어");  /* 나아 : PAS de contraction */
    if(cls === "reu"){                                  /* 르 → ㄹ라/ㄹ러 sur la syllabe d'avant */
      var p2 = stem[stem.length - 2];
      return stem.slice(0, -2) + withTail(p2, T_L) + (BRIGHT[vowel(p2)] ? "라" : "러");
    }
    /* réguliers (l inclus : le ㄹ ne bouge pas devant 아/어) */
    if(tail(last) > 0) return stem + (BRIGHT[vowel(last)] ? "아" : "어");
    var v0 = vowel(last);
    if(v0 === 0 || v0 === 1 || v0 === 4 || v0 === 6) return stem;            /* 가, 보내, 서, 켜 */
    if(v0 === 8)  return pre + withVowel(last, 9);                            /* 오 → 와 */
    if(v0 === 13) return pre + withVowel(last, 14);                           /* 주 → 줘 */
    if(v0 === 11) return pre + withVowel(last, 10);                           /* 되 → 돼 */
    if(v0 === 20) return pre + withVowel(last, 6);                            /* 마시 → 마셔 */
    return stem + "어";                                                       /* 쉬어… */
  }

  /* conj(base, cls, form) → forme correcte. Formes : pres, past, seyo, fut, nikka, myeon. */
  function conj(base, cls, form){
    var stem = base.slice(0, -1), last = lastOf(stem), pre = stem.slice(0, -1);
    var ae, soft;
    if(form === "pres"){ ae = aeForm(stem, cls); return ae + "요"; }
    if(form === "past"){ ae = aeForm(stem, cls); return ae.slice(0, -1) + withTail(lastOf(ae), T_SS) + "어요"; }
    if(form === "seyo"){
      if(cls === "l") return pre + withTail(last, 0) + "세요";                /* 돌 → 도세요 */
      if(cls === "d") return pre + withTail(last, T_L) + "으세요";            /* 듣 → 들으세요 */
      if(cls === "b") return pre + withTail(last, 0) + "우세요";              /* 돕 → 도우세요 */
      if(cls === "s") return pre + withTail(last, 0) + "으세요";              /* 낫 → 나으세요 */
      return stem + (tail(last) > 0 ? "으세요" : "세요");
    }
    if(form === "fut"){
      if(cls === "l") return stem + " 거예요";                                /* 살 거예요 */
      if(cls === "d") return pre + withTail(last, T_L) + "을 거예요";         /* 들을 거예요 */
      if(cls === "b") return pre + withTail(last, 0) + "울 거예요";           /* 도울 거예요 */
      if(cls === "s") return pre + withTail(last, 0) + "을 거예요";           /* 나을 거예요 */
      if(tail(last) > 0) return stem + "을 거예요";
      return pre + withTail(last, T_L) + " 거예요";                           /* 갈 거예요 */
    }
    if(form === "nikka"){
      if(cls === "l") return pre + withTail(last, 0) + "니까";                /* 도니까, 사니까 */
      if(cls === "d") return pre + withTail(last, T_L) + "으니까";
      if(cls === "b") return pre + withTail(last, 0) + "우니까";              /* 더우니까 */
      if(cls === "s") return pre + withTail(last, 0) + "으니까";
      return stem + (tail(last) > 0 ? "으니까" : "니까");
    }
    if(form === "myeon"){
      if(cls === "l") return stem + "면";                                     /* le ㄹ RESTE : 살면 */
      if(cls === "d") return pre + withTail(last, T_L) + "으면";
      if(cls === "b") return pre + withTail(last, 0) + "우면";                /* 더우면 */
      if(cls === "s") return pre + withTail(last, 0) + "으면";
      return stem + (tail(last) > 0 ? "으면" : "면");
    }
    return "";
  }

  var FORMS = [
    { id:"pres",  label:"au présent poli",        mark:"아/어요",       struct:null },
    { id:"past",  label:"au passé",               mark:"았/었어요",     struct:"past" },
    { id:"seyo",  label:"en demande polie",       mark:"(으)세요",      struct:"seyo",  verbsOnly:1 },
    { id:"fut",   label:"au futur",               mark:"(으)ㄹ 거예요", struct:"fut-geo", verbsOnly:1 },
    { id:"nikka", label:"avec « parce que »",     mark:"(으)니까",      struct:"nikka" },
    { id:"myeon", label:"avec « si »",            mark:"(으)면",        struct:"myeon" }
  ];

  /* formes ALTERNATIVES VALIDES à ne JAMAIS proposer comme piège (l'orthographe non
     contractée est correcte pour ㅗ/ㅜ/ㅚ/ㅣ : 보아요, 주어요, 되어요, 마시어요) */
  function isValidAlt(base, cls, form, cand){
    if(form !== "pres" && form !== "past") return false;
    var stem = base.slice(0, -1), last = lastOf(stem);
    if(cls !== "r" || tail(last) > 0) return false;
    var v = vowel(last);
    if(!(v === 8 || v === 13 || v === 11 || v === 20 || v === 1)) return false;
    var unc = stem + (BRIGHT[v] ? "아" : "어");        /* forme non contractée */
    if(form === "pres") return cand === unc + "요";
    return cand === unc.slice(0, -1) + withTail(lastOf(unc), T_SS) + "어요";
  }

  /* pièges : les règles VRAIES mal appliquées. Toujours ≠ correct, jamais une variante valide. */
  function wrongForms(base, cls, form, correct){
    var stem = base.slice(0, -1), last = lastOf(stem), pre = stem.slice(0, -1);
    var out = [];
    function push(c){
      if(c && c !== correct && out.indexOf(c) < 0 && !isValidAlt(base, cls, form, c)) out.push(c);
    }
    var naive = conj(stem + "다", "r", form);           /* irrégularité IGNORÉE (돌으세요, 맵어요…) */
    push(naive);
    if(form === "pres" || form === "past"){
      /* harmonie inversée sur la forme jointe (바빠요 → 바뻐요) */
      var ae = aeForm(stem, cls), aL = lastOf(ae), aV = vowel(aL);
      if(aV === 0 || aV === 4){
        var flip = ae.slice(0, -1) + withVowel(aL, aV === 0 ? 4 : 0);
        push(form === "pres" ? flip + "요" : flip.slice(0, -1) + withTail(lastOf(flip), T_SS) + "어요");
      }
      /* jonction plate sans contraction ni irrégularité : 가아요, 맵어요, 모르아요 */
      var flat = stem + (BRIGHT[vowel(last)] ? "아" : "어");
      push(form === "pres" ? flat + "요" : flat.slice(0, -1) + withTail(lastOf(flat), T_SS) + "어요");
      if(form === "pres") push(stem + "요");            /* jonction oubliée : 마시요, 먹요 */
      if(form === "past") push(stem + "았어요");
      if(form === "past") push(stem + "었어요");
      if(cls === "reu"){                                /* ㄹ doublé mais 르 gardé : 몰르아요 */
        var dbl = stem.slice(0, -2) + withTail(stem[stem.length - 2], T_L) + "르";
        push(form === "pres" ? dbl + "아요" : dbl + "았어요");
      }
      if(cls === "ha") push(stem + (form === "pres" ? "아요" : "았어요"));   /* 공부하아요 */
    }
    if(form === "seyo"){
      push(stem + "으세요");                            /* 으 en trop : 돌으세요, 가으세요 */
      push(stem + "세요");                              /* jonction nue : 듣세요, 앉세요 */
      if(cls === "l") push(pre + withTail(last, 0) + "으세요");   /* 도으세요 */
      if(cls === "b") push(pre + withTail(last, 0) + "워세요");   /* 도워세요-type */
      push(correct.replace("세요", "새요"));            /* faute d'orthographe 세/새 */
      push(aeForm(stem, cls) + "요");                   /* registre plat : 앉아요 (pas une demande) */
    }
    if(form === "fut"){
      push(stem + "을 거예요");                         /* 을 partout : 갈→가을, 살→살을 */
      push(stem + " 거예요");                           /* jonction nue : 먹 거예요 */
      if(tail(last) === 0) push(stem + "ㄹ 거예요");    /* jamo détaché : 가ㄹ 거예요 */
      push(correct.replace(" 거예요", " 거에요"));      /* faute 예/에 */
    }
    if(form === "nikka" || form === "myeon"){
      var m = form === "nikka" ? "니까" : "면";
      push(stem + "으" + m);
      push(stem + m);
      if(cls === "l" && form === "nikka") push(stem + "니까");    /* ㄹ gardé : 돌니까 */
      if(cls === "l" && form === "myeon") push(pre + withTail(last, 0) + "면");  /* ㄹ perdu à tort : 도면 */
      push(aeForm(stem, cls) + m);                      /* jointure en 아/어 à tort : 먹어니까 */
    }
    /* repli TOUJOURS bien formé : la même conjugaison sous une AUTRE forme cible
       (une option correcte en soi, mais pas la forme demandée — la consigne l'affiche).
       On épuise les formes jusqu'à avoir 3 pièges (보내다 filtre presque tout le reste). */
    ["past", "pres", "nikka", "myeon", "seyo", "fut"].forEach(function(f2){
      if(f2 !== form && out.length < 3) push(conj(base, cls, f2));
    });
    return out;
  }

  /* notes pédagogiques (affichées au retour, avec la bonne réponse) */
  var CLS_NOTE = {
    l:   "Verbe en ㄹ : le ㄹ tombe devant ㅅ et ㄴ (도세요, 사니까) mais reste devant ㅁ et 아/어 (살면, 살아요).",
    b:   "Irrégulier en ㅂ : le ㅂ devient 우 devant une voyelle (매워요, 더우면) — 돕다 fait 도와.",
    d:   "Irrégulier en ㄷ : le ㄷ devient ㄹ devant une voyelle (들어요, 들으세요).",
    s:   "Irrégulier en ㅅ : le ㅅ tombe devant une voyelle, SANS contraction (나아요).",
    eu:  "Le ㅡ tombe devant 아/어 ; l'harmonie suit la syllabe d'avant (바빠요, 예뻐요).",
    reu: "Irrégulier en 르 : 르 devient ㄹ라/ㄹ러 (몰라요, 불러요).",
    ha:  "하다 → 해 devant 아/어 (공부해요, 공부했어요).",
    r:   "Harmonie vocalique : ㅏ/ㅗ → 아, le reste → 어 ; contraction avec les radicaux en voyelle (와요, 줘요, 마셔요)."
  };

  /* makeConj(rng[, profile]) → question de conjugaison. Cible en priorité les formes dont la
     structure liée n'est pas « acquise » dans le profil (poids ×3). */
  function makeConj(rng, profile, knownVerbs){
    rng = rng || Math.random;
    var pool = [];
    FORMS.forEach(function(f){
      var w = 1;
      if(f.struct && profile && profile[f.struct] && profile[f.struct].status !== "acquise") w = 3;
      for(var k = 0; k < w; k++) pool.push(f);
    });
    var form = pool[Math.floor(rng() * pool.length)];
    var verbs = form.verbsOnly ? VERBS.filter(function(v){ return !v.adj; }) : VERBS;
    /* v151 : ne conjuguer que des verbes DÉJÀ ÉTUDIÉS quand l'appelant sait lesquels
       (rapport 18/08 : « je ne comprends souvent même pas les mots »). Repli sur la liste
       complète si le filtre laisse trop peu de matière : un exercice pauvre serait pire. */
    if(knownVerbs && typeof knownVerbs.has === "function"){
      var kept = verbs.filter(function(v){ return knownVerbs.has(v.b); });
      if(kept.length >= 8) verbs = kept;
    }
    var v = verbs[Math.floor(rng() * verbs.length)];
    var correct = conj(v.b, v.cls, form.id);
    var wrongs = wrongForms(v.b, v.cls, form.id, correct);   /* ≥3 garanti (repli cross-forme, testé) */
    var options = [{ label: correct, ok: true }];
    for(var i = 0; i < wrongs.length && options.length < 4; i++)
      options.push({ label: wrongs[i], ok: false });
    shuffle(options, rng);
    return { type: "conj", base: v.b, fr: v.fr, form: form.id,
             formLabel: form.label, mark: form.mark,
             options: options, answer: correct, note: CLS_NOTE[v.cls] || "" };
  }

  /* ================= à trou (familles morphologiques sûres) ================= */
  /* Une alternative n'est proposée QUE si elle s'attache au même radical sous la même forme :
     - BARE (radical nu)     : 지만 · 고 · 기 때문에 · 기 전에  (médian)
                               고 싶어요 · 고 있어요 · 지 않아요 · 지 마세요  (final)
     - EU (forme en 으/voyelle) : (으)면 · (으)니까 · (으)면서 · (으)러  (médian)
     - AE (forme en 아/어)   : 서 · 도 · 야  (médian) ; 도 돼요 · 야 해요 · 보세요 · 주세요 (final)
     Vérification lexicale (radical + 다 ∈ lex) quand le radical est exposé — conservateur,
     zéro forme mal construite (les radicaux en ㄹ utilisent les vraies règles ; sinon on passe). */
  var FAM = {
    bareMed: [ { m:"지만", st:"jiman" }, { m:"고", st:"go" },
               { m:"기 때문에", st:"gi-ttaemune" }, { m:"기 전에", st:"gi-jeone" } ],
    bareFin: [ { m:"고 싶어요", st:"go-sipda" }, { m:"고 있어요", st:"prog" },
               { m:"지 않아요", st:"ji-anta" }, { m:"지 마세요", st:"ji-maseyo" } ],
    aeFin:   [ { m:"도 돼요", st:"ado-dweda" }, { m:"야 해요", st:"aya-hada" },
               { m:" 보세요", st:"a-boda" }, { m:" 주세요", st:"a-juda" } ],
    euMed:   [ { m:"면", st:"myeon" }, { m:"니까", st:"nikka" },
               { m:"면서", st:"myeonseo" }, { m:"러", st:"reo" } ]
  };
  function stripPunct(w){ return w.replace(/[?!.,…~"'«»()]+$/g, ""); }

  /* prepCloze(sentences, lex) → pool d'items prêts. sentences = [{id,kr,fr,tags}]. */
  function prepCloze(sentences, lex){
    var pool = [];
    (sentences || []).forEach(function(s){
      if(!s || !s.kr || !s.fr || !s.tags || !s.tags.length) return;
      var kr = String(s.kr).normalize("NFC");
      var words = kr.split(/\s+/);
      /* — famille BARE finale (fin de phrase, 2 derniers mots) — */
      var tail2 = stripPunct(words.slice(-2).join(" "));
      FAM.bareFin.forEach(function(f){
        if(s.tags.indexOf(f.st) < 0) return;
        if(tail2.length <= f.m.length || tail2.slice(-f.m.length) !== f.m) return;
        var stem = tail2.slice(0, -f.m.length);
        if(!lex || !lex.has(stem + "다")) return;
        var opts = FAM.bareFin.map(function(g){ return { label: stem + g.m, ok: g.m === f.m }; });
        pool.push(clozeItem(s, kr, stem + f.m, stem, opts, f.st));
      });
      /* — famille AE finale — */
      var tail3 = stripPunct(words.slice(-2).join(" "));
      FAM.aeFin.forEach(function(f){
        var m = f.m.replace(/^ /, " ");
        if(s.tags.indexOf(f.st) < 0) return;
        if(tail3.length <= m.length || tail3.slice(-m.length) !== m) return;
        var head = tail3.slice(0, -m.length).replace(/ $/, "");
        if(!head || !endsAeo(lastOf(head))) return;
        var opts = FAM.aeFin.map(function(g){
          var lbl = head + (g.m[0] === " " ? "" : "") + g.m;
          return { label: lbl.replace(/  /, " "), ok: g.m === f.m };
        });
        pool.push(clozeItem(s, kr, tail3, head, opts, f.st));
      });
      /* — familles médianes, mot par mot (jamais le dernier) — */
      for(var wi = 0; wi < words.length - 1; wi++){
        var w = stripPunct(words[wi]);
        if(!w || !isSyl(lastOf(w))) continue;
        /* BARE médian : radical nu + marqueur (기 때문에/기 전에 = 2 mots) */
        FAM.bareMed.forEach(function(f){
          if(s.tags.indexOf(f.st) < 0) return;
          var span = f.m.indexOf(" ") >= 0 ? 2 : 1;
          if(wi + span - 1 >= words.length - 1) return;               /* jamais en fin de phrase */
          var seg = words.slice(wi, wi + span).join(" ");
          seg = stripPunct(seg);
          if(seg.length <= f.m.length || seg.slice(-f.m.length) !== f.m) return;
          var stem = seg.slice(0, -f.m.length);
          if(!lex || !lex.has(stem + "다")) return;
          var opts = FAM.bareMed.map(function(g){ return { label: stem + g.m, ok: g.m === f.m }; });
          pool.push(clozeItem(s, kr, seg, stem, opts, f.st));
        });
        /* EU médian : 있으면 (sûr sans lexique) · 가면 (voyelle, lex) · 살면 (ㄹ, lex + vraies règles) */
        FAM.euMed.forEach(function(f){
          if(s.tags.indexOf(f.st) < 0) return;
          if(w.length <= f.m.length || w.slice(-f.m.length) !== f.m) return;
          var stem = w.slice(0, -f.m.length), opts = null;
          if(stem.slice(-1) === "으"){                                 /* 있으면 → swap après le 으 */
            opts = FAM.euMed.map(function(g){ return { label: stem + g.m, ok: g.m === f.m }; });
          } else if(isSyl(lastOf(stem)) && tail(lastOf(stem)) === 0 && lex && lex.has(stem + "다")){
            opts = FAM.euMed.map(function(g){ return { label: stem + g.m, ok: g.m === f.m }; });
          } else if(isSyl(lastOf(stem)) && tail(lastOf(stem)) === T_L && lex && lex.has(stem + "다")){
            opts = FAM.euMed.map(function(g){                          /* ㄹ : 살면/사니까/살면서/살러 */
              var lbl = g.m === "니까"
                ? stem.slice(0, -1) + withTail(lastOf(stem), 0) + g.m
                : stem + g.m;
              return { label: lbl, ok: g.m === f.m };
            });
          }
          if(opts) pool.push(clozeItem(s, kr, w, stem, opts, f.st));
        });
        /* AE médian : forme 아/어 + 서/도/야 (3 options) */
        if(s.tags.indexOf("aseo") >= 0 && w.length >= 2 && w.slice(-1) === "서"){
          var st2 = w.slice(0, -1);
          if(endsAeo(lastOf(st2))){
            var opts2 = [ { label: st2 + "서", ok: true },
                          { label: st2 + "도", ok: false },
                          { label: st2 + "야", ok: false } ];
            pool.push(clozeItem(s, kr, w, st2, opts2, "aseo"));
          }
        }
      }
    });
    return pool;
  }
  function clozeItem(s, kr, segment, stemShown, options, structId){
    /* le segment masqué garde son radical visible : 바빠서 → 바빠＿ */
    var blank = stemShown + "＿".repeat(Math.max(2, segment.length - stemShown.length));
    return { id: s.id, kr: kr, fr: s.fr, masked: kr.replace(segment, blank),
             options: options, answer: segment, structId: structId };
  }
  function makeCloze(pool, rng, profile){
    rng = rng || Math.random;
    if(!pool || !pool.length) return null;
    var hot = profile ? pool.filter(function(p){
      var e = profile[p.structId]; return e && e.status !== "acquise";
    }) : [];
    var src = (hot.length && rng() < 0.7) ? hot : pool;
    var it = src[Math.floor(rng() * src.length)];
    var options = it.options.map(function(o){ return { label: o.label, ok: o.ok }; });
    shuffle(options, rng);
    return { type: "cloze", id: it.id, kr: it.kr, fr: it.fr, masked: it.masked,
             options: options, answer: it.answer, structId: it.structId };
  }

  /* ================= repérage ================= */
  function makeSpot(sentences, structs, rng, profile){
    rng = rng || Math.random;
    var tagged = (sentences || []).filter(function(s){ return s && s.tags && s.tags.length && s.kr && s.fr; });
    if(!tagged.length || !structs || !structs.length) return null;
    var s = tagged[Math.floor(rng() * tagged.length)];
    /* structure à trouver : de préférence une non-acquise portée par la phrase */
    var inS = s.tags.slice();
    var hot = profile ? inS.filter(function(t){ var e = profile[t]; return e && e.status !== "acquise"; }) : [];
    var target = (hot.length ? hot : inS)[Math.floor(rng() * (hot.length ? hot.length : inS.length))];
    var byId = {}; structs.forEach(function(st){ byId[st.id] = st; });
    if(!byId[target]) return null;
    var others = structs.filter(function(st){ return inS.indexOf(st.id) < 0; });
    shuffle(others, rng);
    var options = [{ label: byId[target].fr, ok: true }];
    for(var i = 0; i < others.length && options.length < 4; i++)
      options.push({ label: others[i].fr, ok: false });
    shuffle(options, rng);
    return { type: "spot", id: s.id, kr: s.kr, fr: s.fr, options: options,
             answer: byId[target].fr, structId: target, ex: byId[target].ex || "" };
  }

  function shuffle(arr, rng){
    for(var i = arr.length - 1; i > 0; i--){
      var j = Math.floor(rng() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /* ================= RENDU ================= */
  function esc(s){ return String(s).replace(/[&<>"']/g, function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function el(html){ var t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }

  var MODES = [
    { id:"conj",  label:"Conjugaison", kr:"돌다 → 도세요" },
    { id:"cloze", label:"À trou",      kr:"바빠＿ 못 갔어요" },
    { id:"spot",  label:"Repérage",    kr:"어느 구조?" }
  ];
  var MODE_LABEL = {};
  MODES.forEach(function(mo){ MODE_LABEL[mo.id] = mo.label; });

  /* mêmes conventions que numbers.js : texte nu terne/plein, variables :root uniquement */
  var CSS = [
    ".gramex-modes{display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px 10px; margin-top:10px}",
    ".gramex-mode{background:none; border:none; font:inherit; padding:7px 2px;",
    "  color:var(--dim); opacity:.5; cursor:pointer; text-align:center;",
    "  transition:color .12s, opacity .12s}",
    ".gramex-mode b{display:block; font-size:.9rem; font-weight:600}",
    ".gramex-mode .mkr{display:block; font-family:var(--kr-display); font-size:.9rem;",
    "  margin-top:1px; opacity:.62; word-break:keep-all}",
    ".gramex-mode.on{color:var(--txt); opacity:1}",
    ".gramex-mode.on .mkr{opacity:.85}",
    ".gramex-mode:focus-visible{outline:2px solid var(--seal); outline-offset:2px}",
    ".gramex-q{font-family:var(--kr-display); font-size:1.45rem; font-weight:700; color:var(--txt);",
    "  margin:12px 0 2px; word-break:keep-all; line-height:1.5}",
    ".gramex-fr{color:var(--dim); font-size:.95rem; margin:6px 0 0}",
    ".gramex-ask{color:var(--txt); font-size:.98rem; margin:10px 0 0}",
    ".gramex-ask b{font-family:var(--kr-display)}",
    ".gramex-note{color:var(--dim); font-size:.9rem; margin:10px 0 0; line-height:1.45}",
    ".gramex-note b{font-family:var(--kr-display); color:var(--txt)}",
    /* v151 : bloc de correction — reste affiché jusqu'au clic sur « Continuer » */
    ".gramex-fb{margin-top:14px; padding-top:12px; border-top:1px solid var(--line); text-align:left}",
    ".gramex-verdict{color:var(--dim); font-size:.95rem; margin:0}",
    ".gramex-verdict b{font-family:var(--kr-display); font-size:1.12rem}",
    ".gramex-verdict.vok b{color:var(--ok)}",
    ".gramex-verdict.vko b{color:var(--ko)}",
    ".gramex-sent{font-family:var(--kr-display); font-size:1.1rem; color:var(--txt);",
    "  margin:10px 0 0; word-break:keep-all; line-height:1.5}",
    ".gramex-next{margin-top:16px; width:100%}",
    ".gramex-warn{color:var(--warn); font-size:.85rem; margin-top:8px}",
    ".gramex-last{color:var(--dim); font-size:.9rem; margin:12px 0 0}"
  ].join("\n");
  function injectStyles(){
    if(document.getElementById("gramex-styles")) return;
    var s = document.createElement("style");
    s.id = "gramex-styles"; s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* renderCard(container, opts) — état de la série dans la fermeture, rien de persisté */
  function renderCard(container, opts){
    opts = opts || {};
    var rng      = typeof opts.random   === "function" ? opts.random   : Math.random;
    var speak    = typeof opts.speak    === "function" ? opts.speak    : function(){};
    var onAnswer = typeof opts.onAnswer === "function" ? opts.onAnswer : function(){};
    var profile  = opts.profile || null;
    var structs  = opts.structs || [];
    var clozePool = prepCloze(opts.sentences || [], opts.lex || null);
    /* v151 : mots que l'utilisateur a déjà étudiés (fourni par app.js) — sert à ne tirer que
       des verbes connus. Absent → comportement d'avant, tout le répertoire. */
    var known = (opts.knownWords && typeof opts.knownWords.has === "function") ? opts.knownWords : null;
    var STRUCT_BY = {};
    structs.forEach(function(st){ STRUCT_BY[st.id] = st; });
    injectStyles();
    var card = el('<div class="card center gramex-card"></div>');
    var N = 10;
    var enabled = { conj: true, cloze: clozePool.length > 0, spot: true };

    function make(type){
      if(type === "conj")  return makeConj(rng, profile, known);
      if(type === "cloze") return makeCloze(clozePool, rng, profile);
      return makeSpot(opts.sentences || [], structs, rng, profile);
    }

    function paintConfig(lastScore){
      card.innerHTML = "";
      card.appendChild(el("<h2>Grammaire</h2>"));
      var box = el('<div class="gramex-modes"></div>');
      MODES.forEach(function(mo){
        var off = mo.id === "cloze" && !clozePool.length;
        var lab = el('<button type="button" class="gramex-mode' + (enabled[mo.id] && !off ? " on" : "") +
          '" aria-pressed="' + (enabled[mo.id] && !off ? "true" : "false") + '"' + (off ? " disabled" : "") +
          "><b>" + esc(mo.label) + '</b><span class="mkr">' + esc(mo.kr) + "</span></button>");
        lab.onclick = function(){
          if(off) return;
          enabled[mo.id] = !enabled[mo.id];
          lab.classList.toggle("on", enabled[mo.id]);
          lab.setAttribute("aria-pressed", enabled[mo.id] ? "true" : "false");
          warn.hidden = MODES.some(function(x){ return enabled[x.id]; });
        };
        box.appendChild(lab);
      });
      card.appendChild(box);
      var warn = el('<p class="gramex-warn" hidden>Choisis au moins un mode.</p>');
      card.appendChild(warn);
      if(lastScore != null)
        card.appendChild(el('<p class="gramex-last">Dernière série : <b>' + lastScore + " / " + N + "</b></p>"));
      var go = el('<button class="btn" style="margin-top:12px">Commencer</button>');
      go.onclick = function(){
        var ids = MODES.filter(function(mo){ return enabled[mo.id]; }).map(function(mo){ return mo.id; });
        if(!ids.length){ warn.hidden = false; return; }
        startSeries(ids);
      };
      card.appendChild(go);
    }

    function startSeries(modeIds){
      var pos = 0, score = 0;
      next();

      function next(){
        if(pos >= N){ paintEnd(); return; }
        var q = null, guard = 0;
        while(!q && guard < 8){ q = make(modeIds[Math.floor(rng() * modeIds.length)]); guard++; }
        if(!q){ paintEnd(); return; }
        paintQuestion(q);
      }

      function paintQuestion(q){
        card.innerHTML = "";
        card.appendChild(el('<div class="dim">Question ' + (pos + 1) + " / " + N +
          " — " + esc(MODE_LABEL[q.type]) + "</div>"));
        if(q.type === "conj"){
          card.appendChild(el('<div class="gramex-q">' + esc(q.base) + "</div>"));
          card.appendChild(el('<p class="gramex-fr">' + esc(q.fr) + "</p>"));
          card.appendChild(el('<p class="gramex-ask">' + esc(q.formLabel) + " — <b>" + esc(q.mark) + "</b></p>"));
        } else if(q.type === "cloze"){
          card.appendChild(el('<div class="gramex-q">' + esc(q.masked) + "</div>"));
          card.appendChild(el('<p class="gramex-fr">' + esc(q.fr) + "</p>"));
        } else {
          card.appendChild(el('<div class="gramex-q">' + esc(q.kr) + "</div>"));
          card.appendChild(el('<p class="gramex-fr">' + esc(q.fr) + "</p>"));
          card.appendChild(el('<p class="gramex-ask">Quelle structure contient cette phrase ?</p>'));
        }
        var box = el('<div class="opts"></div>');
        var goodBtn = null;
        q.options.forEach(function(o){
          var b = el("<button>" + esc(o.label) + "</button>");
          if(o.ok) goodBtn = b;
          b.onclick = function(){
            box.querySelectorAll("button").forEach(function(x){ x.disabled = true; });
            b.classList.add(o.ok ? "good" : "bad");
            if(!o.ok && goodBtn) goodBtn.classList.add("good");
            /* entendre la bonne réponse (mot conjugué ou phrase complète) */
            speak(q.type === "conj" ? q.answer : q.kr);
            if(o.ok) score++;
            onAnswer(!!o.ok);
            pos++;
            paintFeedback(q, !!o.ok);
          };
          box.appendChild(b);
        });
        card.appendChild(box);
      }

      /* v151 : la correction RESTE à l'écran jusqu'au clic sur « Continuer ». L'avance
         automatique (1,3 s si juste, 2,6 s si faux) ne laissait le temps ni de lire la bonne
         réponse ni de comprendre pourquoi — rapport in-app du 18/08. Les trois modes
         expliquent désormais : règle de conjugaison, phrase complète reconstituée, sens de
         la structure. Le mode « à trou » n'affichait AUCUNE explication auparavant. */
      function paintFeedback(q, ok){
        var fb = el('<div class="gramex-fb"></div>');
        fb.appendChild(el('<p class="gramex-verdict ' + (ok ? "vok" : "vko") + '">' +
          (ok ? "Juste" : "Faux") + ' — <b>' + esc(q.answer) + "</b></p>"));
        if(q.type === "conj"){
          fb.appendChild(el('<p class="gramex-note">' + esc(q.formLabel) + " de « " +
            esc(q.base) + " » — " + esc(q.fr) + "</p>"));
          if(q.note) fb.appendChild(el('<p class="gramex-note">' + esc(q.note) + "</p>"));
        } else if(q.type === "cloze"){
          fb.appendChild(el('<p class="gramex-sent">' + esc(q.kr) + "</p>"));
          fb.appendChild(el('<p class="gramex-note">' + esc(q.fr) + "</p>"));
          var sc = STRUCT_BY[q.structId];
          if(sc) fb.appendChild(el('<p class="gramex-note">Structure : <b>' + esc(sc.fr) + "</b>" +
            (sc.ex ? " — exemple : <b>" + esc(sc.ex) + "</b>" : "") + "</p>"));
        } else {
          var ss = STRUCT_BY[q.structId];
          var ex = (ss && ss.ex) || q.ex || "";
          if(ex) fb.appendChild(el('<p class="gramex-note">Exemple : <b>' + esc(ex) + "</b></p>"));
        }
        var go = el('<button class="btn gramex-next">' +
          (pos >= N ? "Voir le score" : "Continuer") + "</button>");
        go.onclick = next;
        fb.appendChild(go);
        card.appendChild(fb);
      }

      function paintEnd(){
        card.innerHTML = "";
        card.appendChild(el('<div class="done-kr">끝</div>'));
        card.appendChild(el("<h2>" + score + " / " + N + "</h2>"));
        card.appendChild(el('<p class="dim">grammaire</p>'));
        var row = el('<div class="row" style="margin-top:12px">' +
          '<button class="btn gramex-again">Rejouer</button>' +
          '<button class="btn ghost gramex-config">Modes</button></div>');
        row.querySelector(".gramex-again").onclick  = function(){ startSeries(modeIds); };
        row.querySelector(".gramex-config").onclick = function(){ paintConfig(score); };
        card.appendChild(row);
      }
    }

    paintConfig(null);
    container.appendChild(card);
    return card;
  }

  /* ================= export double environnement ================= */
  var SORI_GRAMEX = {
    renderCard: renderCard,
    pure: {
      conj: conj, aeForm: aeForm, wrongForms: wrongForms, isValidAlt: isValidAlt,
      makeConj: makeConj, prepCloze: prepCloze, makeCloze: makeCloze, makeSpot: makeSpot,
      VERBS: VERBS, FORMS: FORMS, FAM: FAM
    }
  };
  if (typeof module !== "undefined" && module.exports) module.exports = SORI_GRAMEX;
  else root.SORI_GRAMEX = SORI_GRAMEX;
})(typeof self !== "undefined" ? self : this);

/* Sori — exam.js : bilan de niveau périodique (TOPIK-lite), autonome.
   - Mesure le niveau RÉEL sans AUCUN effet sur la planification des
     révisions : rien n'est envoyé au moteur (engine.js), aucun stage,
     intervalle ou due ne bouge. C'est un thermomètre, pas un exercice.
   - Partie PURE : buildExam / summarize / gradeOf — zéro DOM, zéro
     localStorage, RNG injecté => examen reproductible et testable sous
     Node (module.exports). Même pattern double environnement
     qu'engine.js / events.js / search.js.
   - Partie RENDU : SORI_EXAM.renderCard(container, opts) — une .card
     « Bilan de niveau » (derniers résultats PAR profil + profil à choisir
     + chrono optionnel + bouton). Pendant l'examen, le module prend tout
     le container (examen plein écran).
   - opts = {
       items:    [{id, fr, kr, type, theme, stage, conf}]   (eff() d'app.js)
       extra:    window.EXTRA                    (réservé — non utilisé ici)
       speak:    function(kr, id)                (audio délégué à app.js)
       history:  [{date, score, total, grade, weak, profile?, timeSec?}]
                 (ST.exams — lecture seule ; les anciens enregistrements
                  sans champ profile comptent comme "standard")
       onFinish: function(result)   (app.js pose la date et fait save())
       onExit:   function()         (optionnel : re-rendre l'écran hôte)
       random:   function()         (optionnel : défaut Math.random —
                                     injectable pour tests reproductibles)
     }
   - PROFILS D'EXAMEN (choisis sur la carte, l'API renderCard ne change pas) :
       🌱 beginner  (A1-A2) : items de thèmes a2:: uniquement,
                    stratification 5/5/2, bandes A1/A2.
       🎯 standard  (A2-B1) : le bilan historique, inchangé — défaut.
                    buildExam(items, rnd) === buildExam(items, rnd, "standard").
       🔥 advanced  (B1+)   : items stage >= 3 uniquement, thèmes b1::/b2::
                    pondérés 2× à l'échantillonnage, distracteurs UNIQUEMENT
                    via conf ou même thème, bandes B1/B2. Fonctionne que des
                    thèmes b2:: existent ou non dans le deck.
     Un profil avec moins de MIN_TOTAL questions possibles est proposé
     désactivé (avec explication) — jamais de crash.
   - CHRONO optionnel (défaut OFF) : compte à rebours 10 min affiché pendant
     l'examen ; à 0 rien ne s'arrête (jamais bloquant), on passe en
     dépassement. Le résultat porte timeSec et overtime (champs ADDITIFS).
   - Examen : 40 questions en 4 sections —
       A Compréhension (12, KR->FR, stratifié sur stage 1-2 / 3-4 / 5)
       B Production    (12, FR->KR, même stratification)
       C Oreille       (8, audio seul -> sens français, AUCUN texte coréen affiché)
       D Phrases       (8, phrase coréenne -> traduction française)
     Pas de feedback pendant l'examen ; jamais 2× le même item testé ;
     deck trop petit => sections réduites proportionnellement, jamais de crash
     (en dessous de MIN_TOTAL questions possibles, le bouton est remplacé
     par un message).
   - Ce fichier n'écrit AUCUN état (ni localStorage, ni ST). */
(function(root){
  "use strict";

  /* ================= PUR : constantes ================= */
  var TARGETS = { A:12, B:12, C:8, D:8 };   // 40 questions, ratio 3:3:2:2
  var MIN_TOTAL = 20;                       // en dessous : bilan non proposé
  var TIMER_SEC = 600;                      // chrono optionnel : 10 minutes
  var SECTIONS = {
    A: { name:"Compréhension", ask:"Que veut dire…" },
    B: { name:"Production",    ask:"Comment dit-on…" },
    C: { name:"Oreille",       ask:"Écoute — qu'est-ce que ça veut dire ?" },
    D: { name:"Phrases",       ask:"Choisis la traduction de…" }
  };

  /* Profils d'examen. accepts = filtre des items TESTABLES (en plus de
     stage >= 1) ; strata = quotas 1-2 / 3-4 / 5 ; weightOf = poids
     d'échantillonnage (null => uniforme) ; confOnly = distracteurs
     limités à conf/même thème ; grades = bandes <45 / 45-64 / 65-79 / >=80.
     "standard" reproduit EXACTEMENT le comportement historique. */
  var PROFILE_ORDER = ["beginner", "standard", "advanced"];
  var PROFILES = {
    beginner: {
      icon:"🌱", name:"Débutant", range:"A1-A2",
      desc:"Vocabulaire de base — thèmes A2 uniquement",
      strata:[5,5,2], confOnly:false, weightOf:null,
      accepts:function(it){ return String(it.theme || "").indexOf("a2::") === 0; },
      grades:["A1 en construction","A1 solide","A2 en approche","A2 acquis"]
    },
    standard: {
      icon:"🎯", name:"Standard", range:"A2-B1",
      desc:"Tout le deck étudié — le bilan classique",
      strata:[3,5,4], confOnly:false, weightOf:null,
      accepts:function(){ return true; },
      grades:["A1-A2 en construction","A2 solide","A2+ / B1 en approche","B1 en bonne voie"]
    },
    advanced: {
      icon:"🔥", name:"Avancé", range:"B1+",
      desc:"Items bien connus (stage ≥ 3), thèmes B1/B2 favorisés, pièges plus proches",
      strata:[3,5,4], confOnly:true,
      weightOf:function(it){ return /^b[12]::/.test(String(it.theme || "")) ? 2 : 1; },
      accepts:function(it){ return (it.stage|0) >= 3; },
      grades:["A2+ à consolider","B1 en approche","B1 solide","B2 en approche"]
    }
  };

  /* Fisher-Yates avec RNG injecté (déterministe pour un même rnd). */
  function shuffleWith(a, rnd){
    for(var i = a.length - 1; i > 0; i--){
      var j = Math.floor(rnd() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ================= PUR : construction de l'examen =================
     buildExam(items, rnd, profile) -> { questions:[...], total, sizes, profile }
     profile : "beginner" | "standard" | "advanced" — optionnel, inconnu ou
     absent => "standard" (rétrocompatible : buildExam(items, rnd) est
     identique à buildExam(items, rnd, "standard"), même flux RNG).
     Question : { section, id, kr, fr, theme, stage,
                  options:[{id,label}], correctId }.
     Seuls les items ÉTUDIÉS (stage >= 1) ET acceptés par le profil sont
     testés ; les distracteurs peuvent venir de tout le deck (un mauvais
     choix n'a pas besoin d'avoir été appris) — sauf profil avancé :
     conf ou même thème uniquement. */
  function buildExam(items, rnd, profile){
    rnd = rnd || Math.random;
    var profileId = PROFILES[profile] ? profile : "standard";
    var prof = PROFILES[profileId];
    var words = [], phrases = [], wordsAll = [], phrasesAll = [], byId = {};
    (items || []).forEach(function(it){
      if(!it || it.id == null) return;
      byId[it.id] = it;
      var isPhrase = it.type === "phrase";
      (isPhrase ? phrasesAll : wordsAll).push(it);
      if((it.stage|0) >= 1 && prof.accepts(it)) (isPhrase ? phrases : words).push(it);
    });

    /* ordre d'échantillonnage : uniforme (Fisher-Yates), ou pondéré par
       prof.weightOf (Efraimidis-Spirakis : clé rnd()^(1/poids), tri
       décroissant — un poids 2 double la chance d'être pris en tête).
       Pour un profil sans poids, flux RNG STRICTEMENT identique à
       l'historique. */
    function orderPool(p){
      if(!prof.weightOf) return shuffleWith(p, rnd);
      return p.map(function(it){ return { it:it, k:Math.pow(rnd(), 1 / prof.weightOf(it)) }; })
              .sort(function(x, y){ return y.k - x.k; })
              .map(function(x){ return x.it; });
    }

    /* tailles de sections : cibles 12/12/8/8, réduites proportionnellement
       (12:12:8) si le stock de mots étudiés est trop petit. */
    var W = words.length, P = phrases.length;
    var needW = TARGETS.A + TARGETS.B + TARGETS.C;   // 32 mots distincts
    var sizes = { A:TARGETS.A, B:TARGETS.B, C:TARGETS.C, D:Math.min(TARGETS.D, P) };
    if(W < needW){
      var keys = ["A","B","C"], base = [TARGETS.A, TARGETS.B, TARGETS.C], acc = 0;
      keys.forEach(function(k, i){ sizes[k] = Math.floor(W * base[i] / needW); acc += sizes[k]; });
      for(var r = 0; acc < W; r++){ sizes[keys[r % 3]]++; acc++; }
    }

    var used = {};   // ids déjà testés — jamais 2× le même item dans un examen

    /* échantillonnage stratifié d'une section de n mots :
       quotas au prorata de prof.strata (3/5/4 standard, 5/5/2 débutant)
       sur les strates stage 1-2 / 3-4 / 5, déficit d'une strate comblé
       par les autres (deck déséquilibré). */
    function takeStratified(n){
      var pools = [
        words.filter(function(it){ return !used[it.id] && it.stage <= 2; }),
        words.filter(function(it){ return !used[it.id] && it.stage >= 3 && it.stage <= 4; }),
        words.filter(function(it){ return !used[it.id] && it.stage >= 5; })
      ].map(orderPool);
      var sw = prof.strata, den = sw[0] + sw[1] + sw[2];
      var q0 = Math.round(n * sw[0] / den), q1 = Math.round(n * sw[1] / den);
      var quota = [q0, q1, Math.max(0, n - q0 - q1)];
      var out = [], rest = [];
      pools.forEach(function(p, i){
        var take = Math.min(quota[i], p.length);
        out = out.concat(p.slice(0, take));
        rest = rest.concat(p.slice(take));
      });
      rest = orderPool(rest);
      while(out.length < n && rest.length) out.push(rest.shift());
      out.forEach(function(it){ used[it.id] = 1; });
      return shuffleWith(out, rnd);
    }

    /* prélèvement simple (sections C et D) parmi les non encore testés */
    function takeFrom(pool, n){
      var av = pool.filter(function(it){ return !used[it.id]; });
      av = orderPool(av);
      var out = av.slice(0, n);
      out.forEach(function(it){ used[it.id] = 1; });
      return out;
    }

    /* 3 distracteurs : conf (sosies connus) > même thème > n'importe —
       même famille (mot/phrase) que l'item, libellés uniques, jamais le
       libellé de la bonne réponse. Profil avancé : PAS de repli
       « n'importe » (conf ou même thème uniquement — pièges plus proches).
       Peut en rendre moins sur un deck minuscule (jamais de crash). */
    function distractors(it, field, pool){
      var out = [], seenV = {}, seenId = {};
      seenV[String(it[field])] = 1; seenId[it.id] = 1;
      var kind = it.type === "phrase";
      function grab(list){
        list = shuffleWith(list.slice(), rnd);
        for(var i = 0; i < list.length && out.length < 3; i++){
          var c = list[i];
          if(!c || seenId[c.id] || (c.type === "phrase") !== kind) continue;
          var v = String(c[field] == null ? "" : c[field]);
          if(!v || seenV[v]) continue;
          seenV[v] = 1; seenId[c.id] = 1; out.push(c);
        }
      }
      grab((it.conf || []).map(function(id){ return byId[id]; }).filter(Boolean));
      grab(pool.filter(function(c){ return c.theme === it.theme; }));
      if(!prof.confOnly) grab(pool);
      return out;
    }

    function question(section, it, field){
      var ds = distractors(it, field, it.type === "phrase" ? phrasesAll : wordsAll);
      var options = shuffleWith([it].concat(ds), rnd).map(function(o){
        return { id:o.id, label:String(o[field]) };
      });
      return { section:section, id:it.id, kr:String(it.kr), fr:String(it.fr),
               theme:String(it.theme || ""), stage:it.stage,
               options:options, correctId:it.id };
    }

    var questions = [];
    takeStratified(sizes.A).forEach(function(it){ questions.push(question("A", it, "fr")); });
    takeStratified(sizes.B).forEach(function(it){ questions.push(question("B", it, "kr")); });
    takeFrom(words,   sizes.C).forEach(function(it){ questions.push(question("C", it, "fr")); });
    takeFrom(phrases, sizes.D).forEach(function(it){ questions.push(question("D", it, "fr")); });

    return { questions:questions, total:questions.length, sizes:sizes, profile:profileId };
  }

  /* ================= PUR : notation ================= */
  /* pct : 0-100 (entier ou non). Bandes par profil (<45 / 45-64 / 65-79 /
     >=80) — gradeOf(pct) sans profil = bandes "standard" historiques. */
  function gradeOf(pct, profile){
    var g = (PROFILES[profile] || PROFILES.standard).grades;
    if(pct < 45) return g[0];
    if(pct < 65) return g[1];
    if(pct < 80) return g[2];
    return g[3];
  }

  /* summarize(exam, picks) -> résultat complet.
     picks[i] = id choisi pour questions[i] (absent => compté faux).
     weak : les 3 thèmes au pire taux d'échec, parmi ceux vus au moins
     2 fois dans l'examen et ayant au moins un échec.
     profile (ADDITIF) : repris de l'examen — absent => "standard"
     (anciens enregistrements et anciens appels inchangés). */
  function summarize(exam, picks){
    picks = picks || [];
    var profileId = (exam && PROFILES[exam.profile]) ? exam.profile : "standard";
    var score = 0, sections = {}, themes = {};
    (exam && exam.questions || []).forEach(function(q, i){
      var ok = picks[i] === q.correctId;
      if(ok) score++;
      var s = sections[q.section] || (sections[q.section] = { ok:0, n:0, pct:0 });
      s.n++; if(ok) s.ok++;
      var t = themes[q.theme] || (themes[q.theme] = { ok:0, n:0 });
      t.n++; if(ok) t.ok++;
    });
    Object.keys(sections).forEach(function(k){
      var s = sections[k]; s.pct = Math.round(100 * s.ok / s.n);
    });
    var total = (exam && exam.questions || []).length;
    var pct = total ? Math.round(100 * score / total) : 0;
    var weak = Object.keys(themes).map(function(th){
        var t = themes[th];
        return { theme:th, n:t.n, fail:(t.n - t.ok) / t.n };
      })
      .filter(function(x){ return x.n >= 2 && x.fail > 0; })
      .sort(function(a, b){
        return (b.fail - a.fail) || (b.n - a.n) || (a.theme < b.theme ? -1 : 1);
      })
      .slice(0, 3)
      .map(function(x){ return x.theme; });
    return { date:"", profile:profileId, score:score, total:total, pct:pct,
             grade:gradeOf(pct, profileId), sections:sections, weak:weak };
  }

  /* pose timeSec / overtime (champs ADDITIFS) sur un résultat.
     overtime n'est vrai QUE si le chrono était activé ET dépassé —
     le chrono n'arrête jamais l'examen, il constate. */
  function withTiming(res, timeSec, chronoOn){
    res.timeSec = Math.max(0, Math.round(timeSec || 0));
    res.overtime = !!(chronoOn && res.timeSec > TIMER_SEC);
    return res;
  }

  /* stock de questions possibles pour un profil (proposer ou non le bilan).
     availability(items) sans profil = "standard" (rétrocompatible). */
  function availability(items, profile){
    var prof = PROFILES[profile] || PROFILES.standard;
    var W = 0, P = 0;
    (items || []).forEach(function(it){
      if(!it || (it.stage|0) < 1 || !prof.accepts(it)) return;
      if(it.type === "phrase") P++; else W++;
    });
    return { words:W, phrases:P,
             total: Math.min(TARGETS.A + TARGETS.B + TARGETS.C, W) + Math.min(TARGETS.D, P) };
  }

  /* ================= RENDU ================= */
  /* Helpers locaux (mêmes conventions qu'app.js — non exposés par lui). */
  function esc(s){ return String(s).replace(/[&<>"']/g, function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function el(html){ var t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }

  function themeShort(theme){
    var p = String(theme || "").split("::");
    return p[p.length - 1] || theme;
  }
  function frDate(iso){          // "2026-07-03" -> "3 juillet 2026" (repli : brut)
    try{
      if(!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
      return new Date(iso + "T12:00:00").toLocaleDateString("fr-FR",
        { day:"numeric", month:"long", year:"numeric" });
    }catch(e){ return iso; }
  }
  function fmtClock(sec){        // 754 -> "12:34" (valeur absolue)
    sec = Math.abs(sec|0);
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }
  function fmtDur(sec){          // 492 -> "8 min 12 s" ; 45 -> "45 s"
    sec = Math.max(0, sec|0);
    if(sec < 60) return sec + " s";
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + " min" + (s ? " " + s + " s" : "");
  }
  /* tendance du dernier bilan vs le précédent (même liste — donc même
     profil si on lui passe l'historique filtré), en points de pourcentage */
  function trendOf(hist){
    if(!hist || hist.length < 2) return "";
    var a = hist[hist.length - 2], b = hist[hist.length - 1];
    if(!a || !b || !a.total || !b.total) return "";
    var d = Math.round(100 * b.score / b.total) - Math.round(100 * a.score / a.total);
    if(d >= 3)  return "↗ +" + d + " pts";
    if(d <= -3) return "↘ " + d + " pts";
    return "→ stable";
  }
  /* profil d'un enregistrement d'historique — absent = "standard"
     (anciens bilans d'avant les profils) */
  function profileOfRec(r){
    return (r && PROFILES[r.profile]) ? r.profile : "standard";
  }

  /* Styles .exam-* injectés une seule fois — style.css n'est pas modifié,
     tout passe par les variables :root existantes. */
  var CSS = [
    ".exam-last{margin:10px 0 2px; padding:10px 12px; background:var(--panel2); border-radius:10px; display:flex; flex-direction:column; gap:6px}",
    ".exam-lastrow{font-size:.88rem; line-height:1.4}",
    ".exam-lastrow b{color:var(--acc); font-variant-numeric:tabular-nums}",
    ".exam-warn{margin-top:10px; color:var(--warn)}",
    ".exam-sec{color:var(--acc)}",
    ".exam-profs{display:flex; flex-direction:column; gap:6px; margin-top:12px}",
    ".exam-prof{display:flex; flex-direction:column; align-items:flex-start; gap:2px; text-align:left; padding:8px 12px; background:var(--panel2); border:1px solid var(--line); border-radius:10px; color:var(--txt); cursor:pointer; font:inherit; font-size:.92rem}",
    ".exam-prof.sel{border-color:var(--acc); box-shadow:0 0 0 1px var(--acc) inset}",
    ".exam-prof:disabled{opacity:.55; cursor:default}",
    ".exam-profdesc{font-size:.76rem}",
    ".exam-chrono{display:flex; align-items:center; gap:8px; margin-top:12px; font-size:.9rem; cursor:pointer; -webkit-user-select:none; user-select:none}",
    ".exam-timer{float:right; margin-right:10px; font-variant-numeric:tabular-nums}",
    ".exam-timer.exam-over{color:var(--warn); font-weight:700}",
    ".exam-bigspeak{font-size:3rem; margin:14px 0}",
    ".exam-grade{font-size:2.4rem; font-weight:700; color:var(--acc); font-variant-numeric:tabular-nums}",
    ".exam-gradename{font-size:1.05rem; font-weight:600; margin:2px 0 4px}",
    ".exam-meta{font-size:.85rem; margin-bottom:10px}",
    ".exam-secs{display:flex; flex-direction:column; gap:8px; margin-top:8px; text-align:left}",
    ".exam-secrow{display:flex; align-items:center; gap:10px}",
    ".exam-seclab{width:132px; flex:none; font-size:.78rem; color:var(--dim)}",
    ".exam-secbar{flex:1}",
    ".exam-secn{width:40px; flex:none; text-align:right; font-size:.8rem; font-variant-numeric:tabular-nums}"
  ].join("\n");
  function injectStyles(){
    if(document.getElementById("exam-styles")) return;
    var s = document.createElement("style");
    s.id = "exam-styles"; s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* sortie de l'examen : l'hôte re-rend son écran s'il sait le faire,
     sinon on re-rend au moins la carte bilan. */
  function exit(container, opts){
    container.innerHTML = "";
    if(typeof opts.onExit === "function") opts.onExit();
    else renderCard(container, opts);
  }

  /* chrono : une seule setInterval par examen ; si l'élément #extimer a
     disparu (examen quitté par un chemin quelconque), l'interval se
     nettoie tout seul. À 0 on ne bloque RIEN — affichage +dépassement. */
  function stopTimer(st){
    if(st.timerId){ clearInterval(st.timerId); st.timerId = 0; }
  }
  function tickTimer(st){
    var elt = document.getElementById("extimer");
    if(!elt){ stopTimer(st); return; }
    var left = TIMER_SEC - Math.floor((Date.now() - st.t0) / 1000);
    elt.textContent = "⏱ " + (left >= 0 ? fmtClock(left) : "+" + fmtClock(left));
    elt.classList.toggle("exam-over", left < 0);
  }

  function renderQuestion(container, opts, st){
    container.innerHTML = "";
    var q = st.exam.questions[st.pos], total = st.exam.total;
    var meta = SECTIONS[q.section];

    var head = el('<div><div class="progressbar"><div style="width:' +
      Math.round(100 * st.pos / total) + '%"></div></div>' +
      '<div class="dim" style="margin-top:6px">🎓 ' + (st.pos + 1) + ' / ' + total +
      ' · <span class="exam-sec">' + q.section + ' — ' + esc(meta.name) + '</span>' +
      '<button class="btn small ghost" id="exquit" style="float:right">abandonner</button>' +
      (st.chrono ? '<span class="exam-timer" id="extimer"></span>' : '') +
      '</div></div>');
    head.querySelector("#exquit").onclick = function(){
      if(confirm("Abandonner le bilan ? Rien ne sera enregistré.")){
        stopTimer(st);
        exit(container, opts);
      }
    };
    container.appendChild(head);
    if(st.chrono) tickTimer(st);

    var body;
    if(q.section === "C"){
      /* oreille : AUCUN texte coréen affiché — audio seul */
      body = el('<div class="card center"><div class="dim">' + esc(meta.ask) + '</div>' +
        '<button class="speak exam-bigspeak" title="écouter">🔊</button>' +
        '<div class="opts"></div></div>');
    } else if(q.section === "B"){
      /* production : pas d'audio (il révélerait la réponse) */
      body = el('<div class="card center"><div class="dim">' + esc(meta.ask) + '</div>' +
        '<div class="big-fr">' + esc(q.fr) + '</div><div class="opts"></div></div>');
    } else {   /* A et D : le coréen est affiché, réécoute autorisée */
      body = el('<div class="card center"><div class="dim">' + esc(meta.ask) + '</div>' +
        '<div class="big-kr' + (q.section === "D" ? " phrase" : "") + '">' + esc(q.kr) + '</div>' +
        '<button class="speak" title="écouter">🔊</button>' +
        '<div class="opts"></div></div>');
    }
    var sp = body.querySelector(".speak");
    if(sp) sp.onclick = function(){ if(opts.speak) opts.speak(q.kr, q.id); };

    var box = body.querySelector(".opts");
    q.options.forEach(function(o){
      var b = el('<button' + (q.section === "B" ? ' class="kr"' : '') + '>' + esc(o.label) + '</button>');
      b.onclick = function(){
        /* EXAMEN : pas de feedback bonne/mauvaise — on enregistre, on avance */
        box.querySelectorAll("button").forEach(function(x){ x.disabled = true; });
        st.picks[st.pos] = o.id;
        st.pos++;
        if(st.pos >= total) finish(container, opts, st);
        else renderQuestion(container, opts, st);
      };
      box.appendChild(b);
    });
    container.appendChild(body);
    if(q.section === "C" && opts.speak) opts.speak(q.kr, q.id);   // lecture au montage
  }

  function finish(container, opts, st){
    stopTimer(st);
    var res = withTiming(summarize(st.exam, st.picks),
                         (Date.now() - st.t0) / 1000, st.chrono);
    if(typeof opts.onFinish === "function") opts.onFinish(res);   // la date est posée par l'hôte
    renderResult(container, opts, res);
  }

  function renderResult(container, opts, res){
    container.innerHTML = "";
    var prof = PROFILES[profileOfRec(res)];
    var secHtml = ["A","B","C","D"].filter(function(k){ return res.sections[k]; })
      .map(function(k){
        var s = res.sections[k];
        return '<div class="exam-secrow"><span class="exam-seclab">' + k + ' · ' +
          esc(SECTIONS[k].name) + '</span>' +
          '<div class="progressbar exam-secbar"><div style="width:' + s.pct + '%"></div></div>' +
          '<span class="exam-secn">' + s.ok + '/' + s.n + '</span></div>';
      }).join("");
    var weak = (res.weak || []).map(function(t){
      return '<span class="pill">' + esc(themeShort(t)) + '</span>';
    }).join("");
    var metaHtml = '<div class="dim exam-meta">' + prof.icon + ' ' + esc(prof.name) +
      ' (' + esc(prof.range) + ')' +
      (res.timeSec != null ? ' · ⏱ ' + esc(fmtDur(res.timeSec)) : '') +
      (res.overtime ? ' · <span style="color:var(--warn)">10 min dépassées</span>' : '') +
      '</div>';
    container.appendChild(el('<div class="card center">' +
      '<div class="done-banner">🎓</div>' +
      '<div class="exam-grade">' + res.score + ' / ' + res.total + '</div>' +
      '<div class="exam-gradename">' + esc(res.grade) +
        ' <span class="dim">(' + res.pct + ' %)</span></div>' +
      metaHtml +
      '<div class="exam-secs">' + secHtml + '</div>' +
      (weak ? '<div class="dim" style="margin-top:14px">Thèmes à retravailler</div><div>' + weak + '</div>' : '') +
      '<p class="dim" style="margin-top:12px">Ce bilan ne change rien à tes révisions — c\'est une photo de ton niveau.</p>' +
      '<div class="row" style="margin-top:10px"><button class="btn" id="exback">Retour</button></div></div>'));
    container.querySelector("#exback").onclick = function(){ exit(container, opts); };
  }

  function startExam(container, opts, profile, chrono){
    var rnd = typeof opts.random === "function" ? opts.random : Math.random;
    var exam = buildExam(opts.items, rnd, profile);
    if(!exam.total){ exit(container, opts); return; }
    var st = { exam:exam, pos:0, picks:[], chrono:!!chrono, t0:Date.now(), timerId:0 };
    if(st.chrono) st.timerId = setInterval(function(){ tickTimer(st); }, 1000);
    renderQuestion(container, opts, st);
  }

  /* renderCard(container, opts) -> la carte ajoutée au container.
     Dernier résultat PAR PROFIL (compact : note + bande + date + tendance),
     choix du profil (un profil à moins de MIN_TOTAL questions possibles est
     désactivé avec explication), chrono 10 min optionnel (défaut OFF),
     bouton « Passer un bilan » (ou message si même le profil standard n'a
     pas assez d'items — les autres profils testent des sous-ensembles). */
  function renderCard(container, opts){
    opts = opts || {};
    injectStyles();
    var hist = Array.isArray(opts.history) ? opts.history : [];
    var sel = "standard", chrono = false;

    var avail = {};
    PROFILE_ORDER.forEach(function(pid){ avail[pid] = availability(opts.items, pid); });

    /* derniers résultats par profil — compact, dans l'ordre des profils */
    var rows = PROFILE_ORDER.map(function(pid){
      var mine = hist.filter(function(r){ return r && profileOfRec(r) === pid; });
      if(!mine.length) return "";
      var last = mine[mine.length - 1];
      var pct = last.total ? Math.round(100 * last.score / last.total) : 0;
      var trend = trendOf(mine);
      return '<div class="exam-lastrow">' + PROFILES[pid].icon + ' <b>' +
        (last.score|0) + '/' + (last.total|0) + '</b>' +
        ' <span class="dim">(' + pct + ' %)</span> · ' + esc(last.grade || "") +
        '<br><span class="dim">le ' + esc(frDate(last.date || "")) +
        (trend ? ' · ' + trend : '') + '</span></div>';
    }).join("");
    var lastHtml = rows ? '<div class="exam-last">' + rows + '</div>' : "";

    var profHtml = '<div class="exam-profs">' + PROFILE_ORDER.map(function(pid){
      var p = PROFILES[pid], av = avail[pid], ok = av.total >= MIN_TOTAL;
      return '<button class="exam-prof' + (pid === sel && ok ? ' sel' : '') +
        '" data-p="' + pid + '"' + (ok ? '' : ' disabled') + '>' +
        '<span>' + p.icon + ' ' + esc(p.name) + ' <span class="dim">(' + esc(p.range) + ')</span></span>' +
        '<span class="exam-profdesc dim">' + (ok ? esc(p.desc)
          : "Pas encore assez d'items étudiés pour ce profil (" + av.total +
            " questions possibles, minimum " + MIN_TOTAL + ")") + '</span></button>';
    }).join("") + '</div>';

    var card = el('<div class="card exam-card"><h2>🎓 Bilan de niveau</h2>' +
      '<p class="dim">Examen blanc type TOPIK — mesure ton niveau réel. Sans aucun effet sur tes révisions.</p>' +
      (lastHtml || '<p class="dim">Aucun bilan passé pour l\'instant.</p>') +
      (avail.standard.total >= MIN_TOTAL
        ? profHtml +
          '<label class="exam-chrono"><input type="checkbox" id="exchrono">' +
          ' ⏱ Chrono 10 min <span class="dim">(indicatif — ne bloque jamais)</span></label>' +
          '<div class="row" style="margin-top:12px"><button class="btn" id="exstart">Passer un bilan (~10 min)</button></div>'
        : '<p class="dim exam-warn">Pas encore assez de vocabulaire étudié (' + avail.standard.total +
          ' questions possibles, minimum ' + MIN_TOTAL + ') — continue à réviser !</p>') +
      '</div>');
    card.querySelectorAll(".exam-prof").forEach(function(b){
      b.onclick = function(){
        sel = b.getAttribute("data-p");
        card.querySelectorAll(".exam-prof").forEach(function(x){
          x.classList.toggle("sel", x === b);
        });
      };
    });
    var cb = card.querySelector("#exchrono");
    if(cb) cb.onchange = function(){ chrono = cb.checked; };
    var start = card.querySelector("#exstart");
    if(start) start.onclick = function(){ startExam(container, opts, sel, chrono); };
    container.appendChild(card);
    return card;
  }

  /* ================= export double environnement ================= */
  var SORI_EXAM = {
    renderCard: renderCard,
    pure: { buildExam: buildExam, summarize: summarize, gradeOf: gradeOf,
            availability: availability, withTiming: withTiming,
            shuffleWith: shuffleWith,
            TARGETS: TARGETS, MIN_TOTAL: MIN_TOTAL, TIMER_SEC: TIMER_SEC,
            PROFILES: PROFILES, PROFILE_ORDER: PROFILE_ORDER }
  };
  if (typeof module !== "undefined" && module.exports) module.exports = SORI_EXAM;
  else root.SORI_EXAM = SORI_EXAM;
})(typeof self !== "undefined" ? self : this);

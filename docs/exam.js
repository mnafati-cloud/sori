/* Sori — exam.js : bilan de niveau périodique (TOPIK-lite), autonome.
   - Mesure le niveau RÉEL sans AUCUN effet sur la planification des
     révisions : rien n'est envoyé au moteur (engine.js), aucun stage,
     intervalle ou due ne bouge. C'est un thermomètre, pas un exercice.
   - Partie PURE : buildExam / summarize / gradeOf — zéro DOM, zéro
     localStorage, RNG injecté => examen reproductible et testable sous
     Node (module.exports). Même pattern double environnement
     qu'engine.js / events.js / search.js.
   - Partie RENDU : SORI_EXAM.renderCard(container, opts) — une .card
     « Bilan de niveau » (dernier résultat + tendance + bouton). Pendant
     l'examen, le module prend tout le container (examen plein écran).
   - opts = {
       items:    [{id, fr, kr, type, theme, stage, conf}]   (eff() d'app.js)
       extra:    window.EXTRA                    (réservé — non utilisé ici)
       speak:    function(kr, id)                (audio délégué à app.js)
       history:  [{date, score, total, grade, weak}]  (ST.exams — lecture seule)
       onFinish: function(result)   (app.js pose la date et fait save())
       onExit:   function()         (optionnel : re-rendre l'écran hôte)
       random:   function()         (optionnel : défaut Math.random —
                                     injectable pour tests reproductibles)
     }
   - Examen : 40 questions en 4 sections —
       A Compréhension (12, KR->FR, stratifié 3× stage 1-2 / 5× stage 3-4 / 4× stage 5)
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
  var SECTIONS = {
    A: { name:"Compréhension", ask:"Que veut dire…" },
    B: { name:"Production",    ask:"Comment dit-on…" },
    C: { name:"Oreille",       ask:"Écoute — qu'est-ce que ça veut dire ?" },
    D: { name:"Phrases",       ask:"Choisis la traduction de…" }
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
     buildExam(items, rnd) -> { questions:[...], total, sizes }
     Question : { section, id, kr, fr, theme, stage,
                  options:[{id,label}], correctId }.
     Seuls les items ÉTUDIÉS (stage >= 1) sont testés ; les distracteurs
     peuvent venir de tout le deck (un mauvais choix n'a pas besoin
     d'avoir été appris). */
  function buildExam(items, rnd){
    rnd = rnd || Math.random;
    var words = [], phrases = [], wordsAll = [], phrasesAll = [], byId = {};
    (items || []).forEach(function(it){
      if(!it || it.id == null) return;
      byId[it.id] = it;
      var isPhrase = it.type === "phrase";
      (isPhrase ? phrasesAll : wordsAll).push(it);
      if((it.stage|0) >= 1) (isPhrase ? phrases : words).push(it);
    });

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
       quotas au prorata de 3/5/4 sur les strates stage 1-2 / 3-4 / 5,
       déficit d'une strate comblé par les autres (deck déséquilibré). */
    function takeStratified(n){
      var pools = [
        words.filter(function(it){ return !used[it.id] && it.stage <= 2; }),
        words.filter(function(it){ return !used[it.id] && it.stage >= 3 && it.stage <= 4; }),
        words.filter(function(it){ return !used[it.id] && it.stage >= 5; })
      ].map(function(p){ return shuffleWith(p, rnd); });
      var q0 = Math.round(n * 3 / 12), q1 = Math.round(n * 5 / 12);
      var quota = [q0, q1, Math.max(0, n - q0 - q1)];
      var out = [], rest = [];
      pools.forEach(function(p, i){
        var take = Math.min(quota[i], p.length);
        out = out.concat(p.slice(0, take));
        rest = rest.concat(p.slice(take));
      });
      shuffleWith(rest, rnd);
      while(out.length < n && rest.length) out.push(rest.shift());
      out.forEach(function(it){ used[it.id] = 1; });
      return shuffleWith(out, rnd);
    }

    /* prélèvement simple (sections C et D) parmi les non encore testés */
    function takeFrom(pool, n){
      var av = pool.filter(function(it){ return !used[it.id]; });
      shuffleWith(av, rnd);
      var out = av.slice(0, n);
      out.forEach(function(it){ used[it.id] = 1; });
      return out;
    }

    /* 3 distracteurs : conf (sosies connus) > même thème > n'importe —
       même famille (mot/phrase) que l'item, libellés uniques, jamais le
       libellé de la bonne réponse. Peut en rendre moins sur un deck
       minuscule (jamais de crash). */
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
      grab(pool);
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

    return { questions:questions, total:questions.length, sizes:sizes };
  }

  /* ================= PUR : notation ================= */
  /* pct : 0-100 (entier ou non). Paliers du cahier des charges. */
  function gradeOf(pct){
    if(pct < 45) return "A1-A2 en construction";
    if(pct < 65) return "A2 solide";
    if(pct < 80) return "A2+ / B1 en approche";
    return "B1 en bonne voie";
  }

  /* summarize(exam, picks) -> résultat complet.
     picks[i] = id choisi pour questions[i] (absent => compté faux).
     weak : les 3 thèmes au pire taux d'échec, parmi ceux vus au moins
     2 fois dans l'examen et ayant au moins un échec. */
  function summarize(exam, picks){
    picks = picks || [];
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
    return { date:"", score:score, total:total, pct:pct,
             grade:gradeOf(pct), sections:sections, weak:weak };
  }

  /* stock de questions possibles (pour proposer ou non le bilan) */
  function availability(items){
    var W = 0, P = 0;
    (items || []).forEach(function(it){
      if(!it || (it.stage|0) < 1) return;
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
  /* tendance du dernier bilan vs le précédent, en points de pourcentage */
  function trendOf(hist){
    if(!hist || hist.length < 2) return "";
    var a = hist[hist.length - 2], b = hist[hist.length - 1];
    if(!a || !b || !a.total || !b.total) return "";
    var d = Math.round(100 * b.score / b.total) - Math.round(100 * a.score / a.total);
    if(d >= 3)  return "↗ +" + d + " pts";
    if(d <= -3) return "↘ " + d + " pts";
    return "→ stable";
  }

  /* Styles .exam-* injectés une seule fois — style.css n'est pas modifié,
     tout passe par les variables :root existantes. */
  var CSS = [
    ".exam-last{margin:10px 0 2px; padding:10px 12px; background:var(--panel2); border-radius:10px}",
    ".exam-lastscore{font-size:1.5rem; font-weight:700; color:var(--acc); font-variant-numeric:tabular-nums}",
    ".exam-lastgrade{font-size:.92rem; margin:2px 0 4px}",
    ".exam-warn{margin-top:10px; color:var(--warn)}",
    ".exam-sec{color:var(--acc)}",
    ".exam-bigspeak{font-size:3rem; margin:14px 0}",
    ".exam-grade{font-size:2.4rem; font-weight:700; color:var(--acc); font-variant-numeric:tabular-nums}",
    ".exam-gradename{font-size:1.05rem; font-weight:600; margin:2px 0 12px}",
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

  function renderQuestion(container, opts, st){
    container.innerHTML = "";
    var q = st.exam.questions[st.pos], total = st.exam.total;
    var meta = SECTIONS[q.section];

    var head = el('<div><div class="progressbar"><div style="width:' +
      Math.round(100 * st.pos / total) + '%"></div></div>' +
      '<div class="dim" style="margin-top:6px">🎓 ' + (st.pos + 1) + ' / ' + total +
      ' · <span class="exam-sec">' + q.section + ' — ' + esc(meta.name) + '</span>' +
      '<button class="btn small ghost" id="exquit" style="float:right">abandonner</button></div></div>');
    head.querySelector("#exquit").onclick = function(){
      if(confirm("Abandonner le bilan ? Rien ne sera enregistré.")) exit(container, opts);
    };
    container.appendChild(head);

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
    var res = summarize(st.exam, st.picks);
    if(typeof opts.onFinish === "function") opts.onFinish(res);   // la date est posée par l'hôte
    renderResult(container, opts, res);
  }

  function renderResult(container, opts, res){
    container.innerHTML = "";
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
    container.appendChild(el('<div class="card center">' +
      '<div class="done-banner">🎓</div>' +
      '<div class="exam-grade">' + res.score + ' / ' + res.total + '</div>' +
      '<div class="exam-gradename">' + esc(res.grade) +
        ' <span class="dim">(' + res.pct + ' %)</span></div>' +
      '<div class="exam-secs">' + secHtml + '</div>' +
      (weak ? '<div class="dim" style="margin-top:14px">Thèmes à retravailler</div><div>' + weak + '</div>' : '') +
      '<p class="dim" style="margin-top:12px">Ce bilan ne change rien à tes révisions — c\'est une photo de ton niveau.</p>' +
      '<div class="row" style="margin-top:10px"><button class="btn" id="exback">Retour</button></div></div>'));
    container.querySelector("#exback").onclick = function(){ exit(container, opts); };
  }

  function startExam(container, opts){
    var rnd = typeof opts.random === "function" ? opts.random : Math.random;
    var exam = buildExam(opts.items, rnd);
    if(!exam.total){ exit(container, opts); return; }
    renderQuestion(container, opts, { exam:exam, pos:0, picks:[] });
  }

  /* renderCard(container, opts) -> la carte ajoutée au container.
     Dernier résultat (note + date + tendance) si l'historique existe,
     bouton « Passer un bilan » (ou message si le deck étudié est trop
     petit pour un bilan fiable — moins de MIN_TOTAL questions possibles). */
  function renderCard(container, opts){
    opts = opts || {};
    injectStyles();
    var hist = Array.isArray(opts.history) ? opts.history : [];
    var last = hist.length ? hist[hist.length - 1] : null;
    var avail = availability(opts.items);

    var lastHtml = "";
    if(last){
      var pct = last.total ? Math.round(100 * last.score / last.total) : 0;
      var trend = trendOf(hist);
      lastHtml = '<div class="exam-last">' +
        '<div class="exam-lastscore">' + (last.score|0) + ' / ' + (last.total|0) +
          ' <span class="dim" style="font-size:.85rem">(' + pct + ' %)</span></div>' +
        '<div class="exam-lastgrade">' + esc(last.grade || "") + '</div>' +
        '<div class="dim">le ' + esc(frDate(last.date || "")) + (trend ? ' · ' + trend : '') + '</div></div>';
    }

    var card = el('<div class="card exam-card"><h2>🎓 Bilan de niveau</h2>' +
      '<p class="dim">Examen blanc type TOPIK — mesure ton niveau réel. Sans aucun effet sur tes révisions.</p>' +
      (lastHtml || '<p class="dim">Aucun bilan passé pour l\'instant.</p>') +
      (avail.total >= MIN_TOTAL
        ? '<div class="row" style="margin-top:12px"><button class="btn" id="exstart">Passer un bilan (~10 min)</button></div>'
        : '<p class="dim exam-warn">Pas encore assez de vocabulaire étudié (' + avail.total +
          ' questions possibles, minimum ' + MIN_TOTAL + ') — continue à réviser !</p>') +
      '</div>');
    var start = card.querySelector("#exstart");
    if(start) start.onclick = function(){ startExam(container, opts); };
    container.appendChild(card);
    return card;
  }

  /* ================= export double environnement ================= */
  var SORI_EXAM = {
    renderCard: renderCard,
    pure: { buildExam: buildExam, summarize: summarize, gradeOf: gradeOf,
            availability: availability, shuffleWith: shuffleWith,
            TARGETS: TARGETS, MIN_TOTAL: MIN_TOTAL }
  };
  if (typeof module !== "undefined" && module.exports) module.exports = SORI_EXAM;
  else root.SORI_EXAM = SORI_EXAM;
})(typeof self !== "undefined" ? self : this);

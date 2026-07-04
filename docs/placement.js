/* Sori — placement.js : TEST DE NIVEAU ADAPTATIF (« en escalier »).
   - Pioche des QCM coréen->français par bande CEFR (EXTRA[id].cefr).
   - Monte d'une bande quand tu réussis, descend quand tu cales, s'arrête
     quand ton niveau est encadré -> estimation honnête (bande + TOPIK approx).
   - Module CONTRACTUEL (comme numbers.js/search.js) : partie PURE testable
     sous Node (module.exports), rendu SORI_PLACEMENT.renderTest(container, opts)
     dans le navigateur. ZÉRO localStorage : l'état sort par opts.onFinish(result).
   - opts = {
       items:   [{id, kr, fr, cefr, type}]   (fournis par app.js, cefr = niveau)
       speak:   function(kr, id)              (optionnel, écouter le mot)
       onFinish:function(result)             (app.js persiste dans ST.placement)
       onExit:  function()                    (fermer)
       random:  function()                    (RNG injectable pour les tests)
     }
   - IMPORTANT : c'est une ESTIMATION de vocabulaire, PAS un score TOPIK officiel. */
(function(root){
  "use strict";

  var LEVELS = ["A1", "A2", "B1", "B2", "C1"];
  var TOPIK  = { A1:"TOPIK 1", A2:"TOPIK 2", B1:"TOPIK 3", B2:"TOPIK 4", C1:"TOPIK 5-6" };
  var BLOCK  = 6;     // questions par bande
  var START  = 1;     // bande de départ = A2
  var PASS   = 4;     // >= 4/6 -> on monte
  var FAILC  = 2;     // <= 2/6 -> on descend ; 3/6 = frontière -> stop

  /* ================= PUR ================= */

  /* regroupe les items par bande (seuls ceux avec cefr + kr + fr exploitables) */
  function poolsByBand(items){
    var p = { A1:[], A2:[], B1:[], B2:[], C1:[] };
    (items || []).forEach(function(it){
      if(it && it.cefr && p[it.cefr] && it.kr && it.fr) p[it.cefr].push(it);
    });
    return p;
  }

  function shuffle(a, rnd){
    for(var i = a.length - 1; i > 0; i--){
      var j = Math.floor(rnd() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* fabrique UNE question KR->FR : mot cible + 3 distracteurs de sens différent.
     targets/distracteurs tirés du pool de la bande ; à défaut, complète avec le
     pool "secours" (bandes voisines) pour toujours avoir 4 options distinctes. */
  function makeQuestion(target, pool, backup, rnd){
    var seenFr = {}; seenFr[target.fr] = true;
    var options = [target.fr];
    var src = shuffle((pool || []).slice(), rnd).concat(shuffle((backup || []).slice(), rnd));
    for(var i = 0; i < src.length && options.length < 4; i++){
      var o = src[i];
      if(o.id === target.id || seenFr[o.fr]) continue;
      seenFr[o.fr] = true; options.push(o.fr);
    }
    options = shuffle(options, rnd);
    return { id: target.id, kr: target.kr, fr: target.fr,
             options: options, answer: options.indexOf(target.fr) };
  }

  /* décision d'escalier après un bloc : nombre de bonnes réponses c sur BLOCK.
     -> "up" | "down" | "stop" (frontière). */
  function decide(c){
    if(c >= PASS) return "up";
    if(c <= FAILC) return "down";
    return "stop";
  }

  /* estimation finale à partir des résultats par bande {band:{c,n}} et de l'ordre testé.
     Renvoie { idx, band, label, topik }. */
  function estimate(results){
    var passedIdx = -1, i, lv;
    for(i = 0; i < LEVELS.length; i++){
      lv = LEVELS[i];
      if(results[lv] && results[lv].c >= PASS) passedIdx = i;
    }
    if(passedIdx < 0){
      // même la bande de départ ratée : grand débutant
      return { idx: -1, band: "A1-", label: "Grand débutant (A1 en cours)", topik: "avant TOPIK 1" };
    }
    var base = LEVELS[passedIdx];
    var nextIdx = passedIdx + 1;
    var label, band = base;
    if(passedIdx === LEVELS.length - 1){
      label = "C1 — excellent";
    } else if(results[LEVELS[nextIdx]] && results[LEVELS[nextIdx]].c === 3){
      label = base + " solide, " + LEVELS[nextIdx] + " en cours";
      band = base + "/" + LEVELS[nextIdx];
    } else {
      label = base + " solide";
    }
    return { idx: passedIdx, band: band, label: label, topik: TOPIK[base] };
  }

  var PURE = { LEVELS: LEVELS, TOPIK: TOPIK, poolsByBand: poolsByBand,
               makeQuestion: makeQuestion, decide: decide, estimate: estimate,
               BLOCK: BLOCK, START: START, PASS: PASS, FAILC: FAILC };

  /* ================= RENDU (navigateur) ================= */
  var CSS = [
    ".plc{max-width:520px; margin:0 auto; text-align:center}",
    ".plc h2{margin-bottom:6px}",
    ".plc .plc-band{font-size:.8rem; color:var(--dim); margin:8px 0}",
    ".plc .plc-kr{font-size:2.2rem; font-weight:700; margin:18px 0}",
    ".plc .plc-opts{display:flex; flex-direction:column; gap:10px}",
    ".plc .plc-opts button{background:var(--panel2); border:1px solid var(--line); color:var(--txt);",
    "  border-radius:var(--r); padding:14px; font-size:1.05rem; cursor:pointer; text-align:left}",
    ".plc .plc-opts button:hover{border-color:var(--acc)}",
    ".plc .plc-opts button.good{background:#166534; border-color:#166534; color:#fff}",
    ".plc .plc-opts button.bad{background:#7f1d1d; border-color:#7f1d1d; color:#fff}",
    ".plc .plc-prog{height:6px; background:var(--panel2); border-radius:99px; overflow:hidden; margin:4px 0 2px}",
    ".plc .plc-prog>div{height:100%; background:var(--acc); transition:width .2s}",
    ".plc .plc-res{font-size:2rem; font-weight:800; color:var(--acc); margin:8px 0}",
    ".plc .plc-topik{color:var(--dim); margin-bottom:14px}",
    ".plc .plc-bars{display:flex; flex-direction:column; gap:6px; text-align:left; margin:14px 0}",
    ".plc .plc-bar{display:flex; align-items:center; gap:8px; font-size:.85rem}",
    ".plc .plc-bar .lab{width:28px; color:var(--dim)}",
    ".plc .plc-bar .tr{flex:1; height:14px; background:var(--panel2); border-radius:99px; overflow:hidden}",
    ".plc .plc-bar .fill{height:100%; background:var(--acc2)}",
    ".plc .plc-disclaimer{font-size:.78rem; color:var(--dim); margin-top:10px; line-height:1.5}",
    ".plc .plc-speak{background:none; border:none; cursor:pointer; font-size:1.3rem; color:var(--dim)}"
  ].join("\n");
  function injectStyles(){
    if(typeof document === "undefined" || document.getElementById("plc-styles")) return;
    var s = document.createElement("style");
    s.id = "plc-styles"; s.textContent = CSS; document.head.appendChild(s);
  }
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function el(html){ var t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }

  function renderTest(container, opts){
    opts = opts || {};
    injectStyles();
    var rnd = typeof opts.random === "function" ? opts.random : Math.random;
    var speak = typeof opts.speak === "function" ? opts.speak : null;
    var pools = poolsByBand(opts.items);
    var card = el('<div class="card plc"></div>');
    container.appendChild(card);

    // pool de secours (toutes bandes) pour garantir 4 options
    var backupAll = []; LEVELS.forEach(function(lv){ backupAll = backupAll.concat(pools[lv]); });

    function intro(){
      card.innerHTML = "";
      card.appendChild(el('<h2>🎯 Évaluer mon niveau</h2>'));
      card.appendChild(el('<p class="dim">Un test adaptatif : il monte en difficulté tant que tu réussis, '
        + 'et s\'arrête quand il a cerné ton niveau. ~15 à 30 questions (choisir le bon sens du mot).</p>'));
      var go = el('<button class="btn" style="width:100%; margin-top:14px">▶ Commencer</button>');
      go.onclick = function(){ start(); };
      card.appendChild(go);
      card.appendChild(el('<p class="plc-disclaimer">C\'est une <b>estimation de vocabulaire</b>, '
        + 'pas un score TOPIK officiel (qui teste aussi écoute, lecture, écriture, grammaire).</p>'));
    }

    var idx, prevDir, results, used, block, blockCorrect, targets;

    function start(){
      idx = START; prevDir = null; results = {}; used = {};
      // si la bande de depart est vide (deck sans cefr), on abandonne proprement
      if(!pools[LEVELS[idx]].length){ card.innerHTML = '<p class="dim">Niveaux indisponibles.</p>'; return; }
      runBlock();
    }

    function pickTargets(band, n){
      var pool = pools[band] || [];
      var fresh = shuffle(pool.slice(), rnd).filter(function(it){ return !used[it.id]; });
      var chosen = fresh.slice(0, n);
      chosen.forEach(function(it){ used[it.id] = true; });
      return chosen;
    }

    function runBlock(){
      var band = LEVELS[idx];
      targets = pickTargets(band, BLOCK);
      block = 0; blockCorrect = 0;
      if(!targets.length){ finish(); return; }   // plus de mots frais dans cette bande
      question();
    }

    function question(){
      var band = LEVELS[idx];
      var target = targets[block];
      var backup = backupAll;
      var q = makeQuestion(target, pools[band], backup, rnd);
      card.innerHTML = "";
      card.appendChild(el('<div class="plc-band">Niveau testé : <b>' + esc(band) + '</b> — question '
        + (block + 1) + '/' + targets.length + '</div>'));
      card.appendChild(el('<div class="plc-prog"><div style="width:'
        + Math.round(100 * block / targets.length) + '%"></div></div>'));
      var kr = el('<div class="plc-kr">' + esc(q.kr)
        + (speak ? ' <button class="plc-speak" title="écouter">🔊</button>' : '') + '</div>');
      card.appendChild(kr);
      if(speak){ var sp = kr.querySelector(".plc-speak"); if(sp) sp.onclick = function(){ speak(q.kr, q.id); }; }
      var box = el('<div class="plc-opts"></div>');
      q.options.forEach(function(opt, i){
        var b = el('<button>' + esc(opt) + '</button>');
        b.onclick = function(){
          [].forEach.call(box.querySelectorAll("button"), function(x){ x.disabled = true; });
          var ok = i === q.answer;
          b.classList.add(ok ? "good" : "bad");
          if(!ok) box.querySelectorAll("button")[q.answer].classList.add("good");
          if(ok) blockCorrect++;
          setTimeout(afterQ, ok ? 450 : 950);
        };
        box.appendChild(b);
      });
      card.appendChild(box);
    }

    function afterQ(){
      block++;
      if(block < targets.length){ question(); return; }
      // bloc terminé : enregistre + décide
      results[LEVELS[idx]] = { c: blockCorrect, n: targets.length };
      var dir = decide(blockCorrect);
      if(dir === "stop"){ finish(); return; }
      if(dir === "up" && idx === LEVELS.length - 1){ finish(); return; }   // plafond C1
      if(dir === "down" && idx === 0){ finish(); return; }                 // plancher A1
      if(prevDir && dir !== prevDir){ finish(); return; }                  // niveau encadré (demi-tour)
      idx += (dir === "up" ? 1 : -1);
      prevDir = dir;
      runBlock();
    }

    function finish(){
      var est = estimate(results);
      card.innerHTML = "";
      card.appendChild(el('<div class="done-banner">🎯</div>'));
      card.appendChild(el('<h2>Niveau estimé</h2>'));
      card.appendChild(el('<div class="plc-res">≈ ' + esc(est.label) + '</div>'));
      card.appendChild(el('<div class="plc-topik">équivalent approximatif : <b>' + esc(est.topik) + '</b></div>'));
      // barres par bande testée
      var bars = el('<div class="plc-bars"></div>');
      LEVELS.forEach(function(lv){
        var r = results[lv]; if(!r) return;
        var pct = Math.round(100 * r.c / r.n);
        bars.appendChild(el('<div class="plc-bar"><span class="lab">' + lv + '</span>'
          + '<span class="tr"><span class="fill" style="width:' + pct + '%"></span></span>'
          + '<span class="dim">' + r.c + '/' + r.n + '</span></div>'));
      });
      card.appendChild(bars);
      card.appendChild(el('<p class="plc-disclaimer">Estimation basée sur ta reconnaissance du '
        + 'vocabulaire, pas un score TOPIK officiel. Élargis les bandes supérieures pour la faire monter.</p>'));
      var row = el('<div class="row" style="margin-top:14px"></div>');
      var again = el('<button class="btn ghost">Refaire</button>');
      again.onclick = function(){ start(); };
      var close = el('<button class="btn">Fermer</button>');
      close.onclick = function(){ if(typeof opts.onExit === "function") opts.onExit(); };
      row.appendChild(again); row.appendChild(close);
      card.appendChild(row);
      if(typeof opts.onFinish === "function"){
        opts.onFinish({ band: est.band, label: est.label, topik: est.topik,
                        idx: est.idx, results: results });
      }
    }

    intro();
    return card;
  }

  /* ================= export double environnement ================= */
  var SORI_PLACEMENT = { renderTest: renderTest, pure: PURE };
  if (typeof module !== "undefined" && module.exports) module.exports = SORI_PLACEMENT;
  else root.SORI_PLACEMENT = SORI_PLACEMENT;
})(typeof self !== "undefined" ? self : this);

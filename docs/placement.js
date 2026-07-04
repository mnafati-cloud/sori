/* Sori — placement.js : TEST DE NIVEAU ADAPTATIF (« en escalier »), par RAPPEL.
   - Montre un mot coréen par bande CEFR (EXTRA[id].cefr) ; tu cherches le sens,
     tu révèles, puis tu déclares « je savais » / « je ne savais pas ».
     -> ZÉRO hasard (pas de QCM devinable) : mesure la vraie connaissance.
   - Monte d'une bande si tu réussis, descend si tu cales, s'arrête quand ton
     niveau est encadré -> estimation honnête (bande + TOPIK approx.).
   - Module CONTRACTUEL : partie PURE testable sous Node (module.exports),
     rendu SORI_PLACEMENT.renderTest(container, opts) dans le navigateur.
     ZÉRO localStorage : l'état sort par opts.onFinish(result).
   - opts = { items:[{id,kr,fr,cefr,type}], speak(kr,id)?, onFinish(result)?,
              onExit()?, random()? }
   - IMPORTANT : ESTIMATION de vocabulaire (auto-déclarée), PAS un score TOPIK officiel. */
(function(root){
  "use strict";

  var LEVELS = ["A1", "A2", "B1", "B2", "C1"];
  var TOPIK  = { A1:"TOPIK 1", A2:"TOPIK 2", B1:"TOPIK 3", B2:"TOPIK 4", C1:"TOPIK 5-6" };
  var BLOCK  = 6;     // mots par bande
  var START  = 1;     // bande de départ = A2
  var PASS   = 4;     // >= 4/6 connus -> on monte
  var FAILC  = 2;     // <= 2/6 -> on descend ; 3/6 = frontière -> stop

  /* ================= PUR ================= */

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

  /* décision d'escalier après un bloc : nombre de mots connus c sur BLOCK.
     -> "up" | "down" | "stop" (frontière). */
  function decide(c){
    if(c >= PASS) return "up";
    if(c <= FAILC) return "down";
    return "stop";
  }

  /* estimation finale à partir des résultats par bande {band:{c,n}}.
     Renvoie { idx, band, label, topik }. */
  function estimate(results){
    var passedIdx = -1, i, lv;
    for(i = 0; i < LEVELS.length; i++){
      lv = LEVELS[i];
      if(results[lv] && results[lv].c >= PASS) passedIdx = i;
    }
    if(passedIdx < 0){
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
               decide: decide, estimate: estimate,
               BLOCK: BLOCK, START: START, PASS: PASS, FAILC: FAILC };

  /* ================= RENDU (navigateur) ================= */
  var CSS = [
    ".plc{max-width:520px; margin:0 auto; text-align:center}",
    ".plc h2{margin-bottom:6px}",
    ".plc .plc-band{font-size:.8rem; color:var(--dim); margin:8px 0}",
    ".plc .plc-prog{height:6px; background:var(--panel2); border-radius:99px; overflow:hidden; margin:4px 0 2px}",
    ".plc .plc-prog>div{height:100%; background:var(--acc); transition:width .2s}",
    ".plc .plc-kr{font-size:2.4rem; font-weight:700; margin:18px 0 6px}",
    ".plc .plc-speak{background:none; border:none; cursor:pointer; font-size:1.3rem; color:var(--dim); vertical-align:middle}",
    ".plc .plc-hint{color:var(--dim); font-size:.9rem; font-style:italic}",
    ".plc .plc-ans{min-height:2.2em; margin-top:6px}",
    ".plc .plc-fr{font-size:1.5rem; font-weight:600; color:var(--acc)}",
    ".plc .plc-res{font-size:2rem; font-weight:800; color:var(--acc); margin:8px 0}",
    ".plc .plc-topik{color:var(--dim); margin-bottom:14px}",
    ".plc .plc-bars{display:flex; flex-direction:column; gap:6px; text-align:left; margin:14px 0}",
    ".plc .plc-bar{display:flex; align-items:center; gap:8px; font-size:.85rem}",
    ".plc .plc-bar .lab{width:28px; color:var(--dim)}",
    ".plc .plc-bar .tr{flex:1; height:14px; background:var(--panel2); border-radius:99px; overflow:hidden}",
    ".plc .plc-bar .fill{height:100%; background:var(--acc2)}",
    ".plc .plc-disclaimer{font-size:.78rem; color:var(--dim); margin-top:10px; line-height:1.5}"
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

    function intro(){
      card.innerHTML = "";
      card.appendChild(el('<h2>🎯 Évaluer mon niveau</h2>'));
      card.appendChild(el('<p class="dim">Test adaptatif par RAPPEL : on te montre un mot coréen, '
        + 'tu cherches le sens dans ta tête, tu révèles, puis tu déclares honnêtement si tu le savais. '
        + 'Le test monte tant que tu réussis. ~15 à 30 mots.</p>'));
      var go = el('<button class="btn" style="width:100%; margin-top:14px">▶ Commencer</button>');
      go.onclick = function(){ start(); };
      card.appendChild(go);
      card.appendChild(el('<p class="plc-disclaimer">Repose sur ton auto-évaluation honnête — '
        + 'c\'est une <b>estimation de vocabulaire</b>, pas un score TOPIK officiel.</p>'));
    }

    var idx, prevDir, results, used, block, blockCorrect, targets;

    function start(){
      idx = START; prevDir = null; results = {}; used = {};
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
      targets = pickTargets(LEVELS[idx], BLOCK);
      block = 0; blockCorrect = 0;
      if(!targets.length){ finish(); return; }
      question();
    }

    function question(){
      var band = LEVELS[idx];
      var target = targets[block];
      card.innerHTML = "";
      card.appendChild(el('<div class="plc-band">Niveau testé : <b>' + esc(band) + '</b> — mot '
        + (block + 1) + '/' + targets.length + '</div>'));
      card.appendChild(el('<div class="plc-prog"><div style="width:'
        + Math.round(100 * block / targets.length) + '%"></div></div>'));
      var kr = el('<div class="plc-kr">' + esc(target.kr)
        + (speak ? ' <button class="plc-speak" title="écouter">🔊</button>' : '') + '</div>');
      card.appendChild(kr);
      if(speak){ var sp = kr.querySelector(".plc-speak"); if(sp) sp.onclick = function(){ speak(target.kr, target.id); }; }
      var hint = el('<div class="plc-hint">cherche le sens…</div>');
      card.appendChild(hint);
      var ans = el('<div class="plc-ans"></div>');
      card.appendChild(ans);
      var reveal = el('<button class="btn" style="width:100%; margin-top:12px">Révéler</button>');
      card.appendChild(reveal);
      reveal.onclick = function(){
        reveal.remove(); hint.remove();
        ans.innerHTML = '<div class="plc-fr">' + esc(target.fr) + '</div>';
        var row = el('<div class="row" style="margin-top:14px"></div>');
        var no = el('<button class="btn ghost">Je ne savais pas</button>');
        var yes = el('<button class="btn ok">Je savais</button>');
        no.onclick = function(){ afterQ(false); };
        yes.onclick = function(){ afterQ(true); };
        row.appendChild(no); row.appendChild(yes);
        card.appendChild(row);
      };
    }

    function afterQ(knew){
      if(knew) blockCorrect++;
      block++;
      if(block < targets.length){ question(); return; }
      results[LEVELS[idx]] = { c: blockCorrect, n: targets.length };
      var dir = decide(blockCorrect);
      if(dir === "stop"){ finish(); return; }
      if(dir === "up" && idx === LEVELS.length - 1){ finish(); return; }
      if(dir === "down" && idx === 0){ finish(); return; }
      if(prevDir && dir !== prevDir){ finish(); return; }
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
      var bars = el('<div class="plc-bars"></div>');
      LEVELS.forEach(function(lv){
        var r = results[lv]; if(!r) return;
        var pct = Math.round(100 * r.c / r.n);
        bars.appendChild(el('<div class="plc-bar"><span class="lab">' + lv + '</span>'
          + '<span class="tr"><span class="fill" style="width:' + pct + '%"></span></span>'
          + '<span class="dim">' + r.c + '/' + r.n + ' connus</span></div>'));
      });
      card.appendChild(bars);
      card.appendChild(el('<p class="plc-disclaimer">Estimation basée sur ton rappel auto-déclaré, '
        + 'pas un score TOPIK officiel. Élargis les bandes supérieures pour la faire monter.</p>'));
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

  var SORI_PLACEMENT = { renderTest: renderTest, pure: PURE };
  if (typeof module !== "undefined" && module.exports) module.exports = SORI_PLACEMENT;
  else root.SORI_PLACEMENT = SORI_PLACEMENT;
})(typeof self !== "undefined" ? self : this);

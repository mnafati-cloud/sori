/* Sori — structure.js : entraîneur de STRUCTURE de phrase (particules + conjugaison).
   Exercice AUTONOME (comme numbers.js) : on donne une phrase en français + le vocabulaire
   de BASE (lemmes sans grammaire) ; l'apprenant devine la phrase coréenne complète DANS SA TÊTE
   (aucune construction dans l'app), révèle, puis s'auto-évalue (bon/faux). Le trivia (déjà écrit :
   décomposition mot-à-mot + construction, v56) explique tout.
   - SORI_STRUCTURE.renderCard(container, opts)
   - opts = {
       pool:     [ { id, kr, fr, base:[[lemme,fr]], words:[[bout,gloss]], build } ]  (fourni par app.js)
       speak:    function(kr, id)   TTS/audio natif délégué à app.js
       onAnswer: function(ok)       journalisation déléguée (télémétrie, PAS de planification)
       random:   function()->[0,1)  optionnel (tests)
     }
   - N'écrit AUCUN état (ni localStorage, ni ST). État de session dans la fermeture. */
(function(root){
  "use strict";
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function el(html){ var t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }
  function shuffle(a, rng){ for(var i = a.length - 1; i > 0; i--){ var j = Math.floor(rng() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  var CSS = [
    ".str-fr{font-size:1.3rem; font-weight:600; margin:10px 0 4px; line-height:1.35}",
    ".str-base{display:flex; flex-wrap:wrap; gap:6px; justify-content:center; margin:8px 0}",
    ".str-chip{background:var(--panel2); border:1px solid var(--line); border-radius:8px;",
    "  padding:5px 10px; font-size:.92rem}",
    ".str-chip b{color:var(--acc); font-size:1.05rem; margin-right:4px}",
    ".str-kr{font-size:1.5rem; font-weight:700; color:var(--acc); margin:6px 0 10px; word-break:keep-all}",
    ".str-spk{background:none; border:none; font-size:1.1rem; cursor:pointer; vertical-align:middle}",
    ".str-warn{color:var(--warn); font-size:.85rem; margin-top:8px}",
    ".str-last{color:var(--dim); font-size:.9rem; margin:6px 0 0}"
  ].join("\n");
  function injectStyles(){
    if(document.getElementById("structure-styles")) return;
    var s = document.createElement("style");
    s.id = "structure-styles"; s.textContent = CSS;
    document.head.appendChild(s);
  }

  function renderCard(container, opts){
    opts = opts || {};
    var pool     = Array.isArray(opts.pool) ? opts.pool : [];
    var speak    = typeof opts.speak    === "function" ? opts.speak    : function(){};
    var onAnswer = typeof opts.onAnswer === "function" ? opts.onAnswer : function(){};
    var rng      = typeof opts.random   === "function" ? opts.random   : Math.random;
    injectStyles();
    var card = el('<div class="card center str-card"></div>');
    var order = [], done = 0, hit = 0;

    function pick(){
      if(!pool.length) return null;
      if(!order.length){ order = pool.map(function(_, i){ return i; }); shuffle(order, rng); }
      return pool[order.pop()];
    }

    function paintStart(last){
      card.innerHTML = "";
      card.appendChild(el("<h2>🧩 Structure des phrases</h2>"));
      card.appendChild(el('<p class="dim">On te donne une phrase en français et le vocabulaire de base. ' +
        'À toi de reconstituer la phrase coréenne complète (particules, conjugaison, ordre) — dans ta tête. ' +
        'Tu révèles, tu dis si tu avais bon, et le détail t\'explique la construction.</p>'));
      if(last != null)
        card.appendChild(el('<p class="str-last">Dernière série : <b>' + last.hit + " / " + last.done + '</b> réussies.</p>'));
      if(!pool.length){ card.appendChild(el('<p class="str-warn">Contenu indisponible pour l\'instant.</p>')); return; }
      var go = el('<button class="btn" style="width:100%; margin-top:12px">▶ Commencer</button>');
      go.onclick = function(){ done = 0; hit = 0; nextCard(); };
      card.appendChild(go);
    }

    function nextCard(){
      var it = pick();
      if(!it){ paintStart(null); return; }
      card.innerHTML = "";
      card.appendChild(el('<div class="dim">🧩 Structure — ' + (done + 1) + '</div>'));
      card.appendChild(el('<div class="str-fr">' + esc(it.fr) + '</div>'));
      var chips = el('<div class="str-base"></div>');
      (it.base || []).forEach(function(p){
        chips.appendChild(el('<span class="str-chip"><b>' + esc(p[0]) + '</b>' + esc(p[1] || "") + '</span>'));
      });
      card.appendChild(chips);
      card.appendChild(el('<p class="dim" style="font-size:.82rem">Devine la phrase coréenne (à voix haute), puis révèle.</p>'));
      var reveal = el('<button class="btn" style="width:100%; margin-top:8px">👁 Montrer la réponse</button>');
      reveal.onclick = function(){ showAnswer(it); };
      card.appendChild(reveal);
    }

    function showAnswer(it){
      card.innerHTML = "";
      card.appendChild(el('<div class="dim">🧩 Structure — ' + (done + 1) + '</div>'));
      card.appendChild(el('<div class="str-fr">' + esc(it.fr) + '</div>'));
      var krLine = el('<div class="str-kr">' + esc(it.kr) + ' <button class="str-spk" title="écouter">🔊</button></div>');
      card.appendChild(krLine);
      krLine.querySelector(".str-spk").onclick = function(){ speak(it.kr, it.id); };
      speak(it.kr, it.id);
      /* décomposition mot-à-mot + construction (données v56) */
      if(Array.isArray(it.words) && it.words.length){
        var wb = el('<div class="wbreak"><div class="wbt">📝 Mot à mot</div></div>');
        it.words.forEach(function(p){
          wb.appendChild(el('<div class="wbrow"><span class="wbk">' + esc(p[0]) + '</span><span class="wbg">' + esc(p[1] || "") + '</span></div>'));
        });
        card.appendChild(wb);
      }
      if(it.build) card.appendChild(el('<div class="tnote">🔧 <b>Construction :</b> ' + esc(it.build) + '</div>'));
      var row = el('<div class="row" style="margin-top:12px"></div>');
      var bad  = el('<button class="btn ko">✗ J\'avais faux</button>');
      var good = el('<button class="btn ok">✓ J\'avais bon</button>');
      bad.onclick  = function(){ bad.disabled = good.disabled = true; finish(false); };
      good.onclick = function(){ bad.disabled = good.disabled = true; finish(true); };
      row.append(bad, good);
      card.appendChild(row);
    }

    function finish(ok){
      done++; if(ok) hit++;
      onAnswer(!!ok);
      if(done >= 10) paintStart({ done: done, hit: hit });   // série de 10 puis récap
      else nextCard();
    }

    paintStart(null);
    container.appendChild(card);
    return card;
  }

  var SORI_STRUCTURE = { renderCard: renderCard };
  if (typeof module !== "undefined" && module.exports) module.exports = SORI_STRUCTURE;
  else root.SORI_STRUCTURE = SORI_STRUCTURE;
})(typeof self !== "undefined" ? self : this);

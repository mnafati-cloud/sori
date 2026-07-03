/* Sori — typing.js : saisie hangul (production ultime), autonome.
   Le joueur tape la réponse en coréen avec l'IME de son téléphone (stage 5, mots).
   - Partie PURE : normalize / judge — zéro DOM, zéro localStorage. Même pattern
     double environnement que search.js / engine.js : testable sous Node
     (module.exports).
   - Partie RENDU : SORI_TYPING.render(container, opts) — une .card cohérente
     avec style.css (+ préfixe .typing-* injecté une seule fois, via les
     variables :root existantes).
   - opts = {
       item:     {id, kr, fr, type}           (l'item à produire)
       speak:    function(kr, id)             (audio délégué à app.js)
       onResult: function(ok)                 (verdict — branché sur afterAnswer)
     }
   - Contrat pure :
       normalize(s) : NFC, trim, espaces multiples -> un, espaces avant
         ponctuation retirés, ponctuation finale (.?!…) retirée.
       judge(answer, expected) -> { exact, close, spacing, diffHtml }
         exact   : égalité stricte après normalize.
         close   : Levenshtein <= 1 sur les syllabes composées (espaces ignorés)
                   OU seule différence = espacement.
         spacing : la SEULE différence est l'espacement (sous-cas de close).
         diffHtml: la bonne réponse, syllabes divergentes en <b>, échappée HTML.
   - Verdict : exact -> onResult(true) direct. Différent -> comparatif
     (ta réponse / la bonne réponse, divergences marquées) + 2 boutons :
     « J'avais faux » (false) / « C'était juste (faute de frappe IME) » (true) —
     les IME mobiles produisent parfois des variantes, l'utilisateur reste juge.
   - Pas d'IME coréen ? lien discret « je ne peux pas taper » -> révélation
     simple + auto-évaluation Encore/Bien. Jamais bloquant.
   - Ce fichier n'écrit AUCUN état (ni localStorage, ni ST). Zéro dépendance. */
(function(root){
  "use strict";

  /* ================= PUR : normalisation ================= */
  /* NFC compose les jamo décomposés (U+1100 U+1161 -> 가) : indispensable,
     certains IME/claviers émettent du décomposé. Puis on neutralise ce qui
     ne teste pas le coréen : espaces surnuméraires et ponctuation finale. */
  function normalize(s){
    return String(s == null ? "" : s)
      .normalize("NFC")
      .replace(/\s+/g, " ")            /* espaces multiples (et \n, nbsp) -> un */
      .replace(/\s+([.?!,…])/g, "$1")  /* espace AVANT la ponctuation retiré */
      .replace(/[.?!…]+$/, "")         /* ponctuation finale retirée */
      .trim();
  }

  /* ================= PUR : alignement (édition minimale) =================
     Levenshtein classique + backtrace. a et b = tableaux de caractères
     (une syllabe hangul composée = un caractère après NFC).
     keepA/keepB : positions alignées ET égales — le reste est divergent. */
  function editOps(a, b){
    var m = a.length, n = b.length, i, j;
    var d = [];
    for(i = 0; i <= m; i++){ d[i] = [i]; }
    for(j = 0; j <= n; j++){ d[0][j] = j; }
    for(i = 1; i <= m; i++){
      for(j = 1; j <= n; j++){
        var c = a[i-1] === b[j-1] ? 0 : 1;
        d[i][j] = Math.min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + c);
      }
    }
    var keepA = [], keepB = [];
    for(i = 0; i < m; i++) keepA[i] = false;
    for(j = 0; j < n; j++) keepB[j] = false;
    i = m; j = n;
    while(i > 0 && j > 0){
      if(a[i-1] === b[j-1] && d[i][j] === d[i-1][j-1]){
        keepA[i-1] = true; keepB[j-1] = true; i--; j--;
      }
      else if(d[i][j] === d[i-1][j-1] + 1){ i--; j--; }   /* substitution */
      else if(d[i][j] === d[i-1][j] + 1){ i--; }          /* suppression */
      else { j--; }                                        /* insertion */
    }
    return { dist: d[m][n], keepA: keepA, keepB: keepB };
  }

  function esc(s){ return String(s).replace(/[&<>"']/g, function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }

  /* chars + masque "gardé" -> HTML échappé, runs divergents en <b> */
  function markHtml(chars, keep){
    var out = "", inB = false;
    for(var k = 0; k < chars.length; k++){
      if(!keep[k] && !inB){ out += "<b>"; inB = true; }
      if(keep[k] && inB){ out += "</b>"; inB = false; }
      out += esc(chars[k]);
    }
    if(inB) out += "</b>";
    return out;
  }

  /* ================= PUR : verdict ================= */
  function judge(answer, expected){
    var a = normalize(answer), e = normalize(expected);
    var exact = a === e;
    var eChars = Array.from(e);
    if(exact){
      return { exact: true, close: false, spacing: false, diffHtml: esc(e) };
    }
    var aChars = Array.from(a);
    var aS = Array.from(a.replace(/ /g, ""));   /* syllabes seules (normalize a déjà unifié \s) */
    var eS = Array.from(e.replace(/ /g, ""));
    var spacing = aS.length > 0 && aS.join("") === eS.join("");
    var close = spacing || (aS.length > 0 && editOps(aS, eS).dist <= 1);
    return {
      exact: false, close: close, spacing: spacing,
      diffHtml: markHtml(eChars, editOps(aChars, eChars).keepB)
    };
  }

  /* ================= RENDU ================= */
  function el(html){ var t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }

  /* Styles .typing-* injectés une seule fois — style.css n'est pas modifié,
     tout passe par les variables :root existantes. */
  var CSS = [
    ".typing-input{width:100%; background:var(--panel2); border:1px solid var(--line);",
    "  color:var(--txt); border-radius:var(--r); padding:13px 14px; margin-top:6px;",
    "  font-size:1.35rem; text-align:center; outline:none; font-family:inherit;",
    "  -webkit-appearance:none; appearance:none; word-break:keep-all}",
    ".typing-input:focus{border-color:var(--acc)}",
    ".typing-input::placeholder{color:var(--dim); opacity:.7; font-size:1rem}",
    ".typing-input:disabled{opacity:.6}",
    ".typing-fb{margin-top:10px}",
    ".typing-fb .kr{font-size:1.4rem; font-weight:600; word-break:keep-all}",
    ".typing-okmark{color:var(--ok); font-size:1.7rem; margin-bottom:2px}",
    ".typing-msg{display:block; color:var(--warn); font-size:.88rem; margin-bottom:8px}",
    ".typing-cmp{background:var(--panel2); border-radius:var(--r); padding:10px 12px 12px;",
    "  display:flex; flex-direction:column; gap:2px}",
    ".typing-lbl{font-size:.7rem; text-transform:uppercase; letter-spacing:1px;",
    "  color:var(--dim); margin-top:8px}",
    ".typing-cmp .kr{font-size:1.35rem}",
    ".typing-yours b{color:var(--ko); font-weight:700}",
    ".typing-goal b{color:var(--ok); font-weight:700}",
    ".typing-actions{margin-top:12px}",
    ".typing-actions .btn small{display:block; font-size:.72rem; font-weight:400; opacity:.8}",
    ".typing-nokb{background:none; border:none; color:var(--dim); font-size:.78rem;",
    "  text-decoration:underline dotted; cursor:pointer; margin-top:10px; padding:6px}"
  ].join("\n");
  function injectStyles(){
    if(document.getElementById("typing-styles")) return;
    var s = document.createElement("style");
    s.id = "typing-styles"; s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* render(container, opts) -> l'élément carte ajouté au container.
     Pas d'autofocus (clavier mobile intrusif) : focus au tap seulement.
     onResult est appelé UNE seule fois, quel que soit le chemin. */
  function render(container, opts){
    opts = opts || {};
    var it = opts.item || {};
    var speak    = typeof opts.speak    === "function" ? opts.speak    : function(){};
    var onResult = typeof opts.onResult === "function" ? opts.onResult : function(){};
    injectStyles();

    var card = el('<div class="card center typing-card">' +
      '<div class="dim">✍️ Écris-le en coréen</div>' +
      '<div class="big-fr">' + esc(it.fr == null ? "" : it.fr) + '</div>' +
      '<input class="typing-input" type="text" lang="ko" enterkeyhint="done"' +
      ' autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"' +
      ' placeholder="한국어로…">' +
      '<div class="typing-fb"></div>' +
      '<div class="row typing-actions"><button class="btn typing-verify">Vérifier</button></div>' +
      '<button class="typing-nokb">je ne peux pas taper</button>' +
      '</div>');
    var $input = card.querySelector(".typing-input");
    var $fb    = card.querySelector(".typing-fb");
    var $act   = card.querySelector(".typing-actions");
    var $nokb  = card.querySelector(".typing-nokb");

    var checked = false;   /* une seule vérification */
    var done = false;      /* un seul onResult */
    function finish(ok){
      if(done) return;
      done = true;
      $act.querySelectorAll("button").forEach(function(b){ b.disabled = true; });
      onResult(ok);
    }

    function check(){
      if(checked) return;
      var raw = $input.value;
      if(!normalize(raw)){
        $fb.innerHTML = '<span class="typing-msg">Tape ta réponse — ou « je ne peux pas taper » ci-dessous.</span>';
        return;
      }
      checked = true;
      $input.disabled = true;
      $nokb.remove();
      var j = judge(raw, it.kr);
      speak(it.kr, it.id);
      if(j.exact){
        $fb.innerHTML = '<div class="typing-okmark">✔</div>' +
          '<div class="kr">' + esc(normalize(it.kr)) + '</div>';
        $act.innerHTML = "";
        finish(true);
        return;
      }
      /* comparatif : ta réponse / la bonne réponse, divergences marquées.
         La bonne réponse vient de judge (diffHtml) ; la tienne est marquée
         avec le même alignement. */
      var aChars = Array.from(normalize(raw));
      var yoursHtml = markHtml(aChars, editOps(aChars, Array.from(normalize(it.kr))).keepA);
      $fb.innerHTML =
        (j.close ? '<span class="typing-msg">' +
          (j.spacing ? "Presque ! Vérifie l'espacement." : "Presque ! Une syllabe diffère.") +
          '</span>' : "") +
        '<div class="typing-cmp">' +
          '<div class="typing-lbl">ta réponse</div>' +
          '<div class="kr typing-yours">' + yoursHtml + '</div>' +
          '<div class="typing-lbl">la bonne réponse</div>' +
          '<div class="kr typing-goal">' + j.diffHtml + '</div>' +
        '</div>';
      $act.innerHTML = "";
      var bad  = el('<button class="btn ko">J\'avais faux</button>');
      var good = el('<button class="btn ghost">C\'était juste<small>faute de frappe IME</small></button>');
      bad.onclick  = function(){ finish(false); };
      good.onclick = function(){ finish(true); };
      $act.appendChild(bad); $act.appendChild(good);
    }

    /* Pas d'IME coréen sur l'appareil -> révélation simple + auto-évaluation.
       Même contrat que le rappel classique : jamais bloquant. */
    function reveal(){
      if(checked) return;
      checked = true;
      $input.remove();
      $nokb.remove();
      speak(it.kr, it.id);
      $fb.innerHTML = '<div class="kr">' + esc(it.kr == null ? "" : it.kr) + '</div>' +
        '<div class="dim" style="margin-top:6px">Dis-le à voix haute, puis évalue-toi.</div>';
      $act.innerHTML = "";
      var again = el('<button class="btn ko">Encore</button>');
      var good  = el('<button class="btn ok">Bien</button>');
      again.onclick = function(){ finish(false); };
      good.onclick  = function(){ finish(true); };
      $act.appendChild(again); $act.appendChild(good);
    }

    card.querySelector(".typing-verify").onclick = check;
    $nokb.onclick = reveal;
    $input.addEventListener("keydown", function(ev){
      if(ev.key !== "Enter") return;
      /* Entrée pendant la composition IME = valider la syllabe, PAS la réponse */
      if(ev.isComposing || ev.keyCode === 229) return;
      ev.preventDefault();
      check();
    });

    container.appendChild(card);
    return card;
  }

  /* ================= export double environnement ================= */
  var SORI_TYPING = {
    render: render,
    pure: { normalize: normalize, judge: judge }
  };
  if (typeof module !== "undefined" && module.exports) module.exports = SORI_TYPING;
  else root.SORI_TYPING = SORI_TYPING;
})(typeof self !== "undefined" ? self : this);

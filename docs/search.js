/* Sori — search.js : dictionnaire personnel FR⇄KR (« comment on dit déjà… ? »), autonome.
   - Partie PURE : normFr / choseong / isChoseongQuery / buildIndex / search —
     zéro DOM, zéro localStorage. Même pattern double environnement
     qu'engine.js / events.js : testable sous Node (module.exports).
   - Partie RENDU : SORI_SEARCH.renderPanel(container, opts) — champ de
     recherche + résultats en .list/.item cohérents avec style.css
     (+ préfixe .search-* injecté une seule fois).
   - opts = {
       items:   [{id, fr, kr, theme, stage[, type]}]   (fournis par app.js)
       extra:   window.EXTRA  ({id:{ex, exFr, note, conj}})
       onSpeak: function(kr, id)                       (audio délégué à app.js)
     }
   - Matching : FR insensible casse/accents (NFD) sur fr/exFr/note ;
     KR sous-chaîne sur kr/ex/conj + recherche par consonnes initiales
     (초성 : « ㅅㅈ » trouve 성적) si la requête n'est QUE des jamo ㄱ-ㅎ.
     Tri : mot entier exact > commence par > contient ; mots avant phrases.
   - Perf : index (formes normalisées + choseong) construit UNE fois au
     premier renderPanel ; recherches suivantes < 5 ms ; debounce 120 ms.
   - Ce fichier n'écrit AUCUN état (ni localStorage, ni ST). */
(function(root){
  "use strict";

  /* ================= PUR : normalisation ================= */
  /* FR : minuscules, accents retirés (NFD + strip des diacritiques),
     ligatures œ/æ dépliées, apostrophe typographique unifiée. */
  function normFr(s){
    return String(s == null ? "" : s).toLowerCase()
      .replace(/œ/g, "oe").replace(/æ/g, "ae").replace(/[’ʼ]/g, "'")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  /* KR : suite des consonnes initiales (choseong) d'un texte hangul.
     Syllabe précomposée : code = 0xAC00 + (cho*21 + jung)*28 + jong
     -> cho = (code - 0xAC00) / 588. Les jamo consonnes déjà isolés
     (ㄱ-ㅎ) sont gardés tels quels, tout le reste est ignoré. */
  var CHO = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ",
             "ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
  function choseong(s){
    s = String(s == null ? "" : s);
    var out = "";
    for(var i = 0; i < s.length; i++){
      var c = s.charCodeAt(i);
      if(c >= 0xAC00 && c <= 0xD7A3) out += CHO[Math.floor((c - 0xAC00) / 588)];
      else if(c >= 0x3131 && c <= 0x314E) out += s[i];
    }
    return out;
  }

  /* Requête « à la coréenne » : uniquement des jamo consonnes ㄱ-ㅎ
     (espaces tolérés). ㅅㅈ -> oui ; 성 -> non ; ㅅa -> non. */
  function isChoseongQuery(q){
    q = String(q == null ? "" : q).replace(/\s+/g, "");
    if(!q) return false;
    for(var i = 0; i < q.length; i++){
      var c = q.charCodeAt(i);
      if(c < 0x3131 || c > 0x314E) return false;
    }
    return true;
  }

  var HANGUL_RE = /[\u3131-\u318E\uAC00-\uD7A3]/;

  /* mots d'un champ FR normalisé ("je vais a l'ecole." -> je,vais,a,l,ecole) */
  function frWords(frN){
    return frN.split(/[^a-z0-9]+/).filter(function(w){ return w; });
  }
  /* mots d'un champ KR (ponctuation retirée aux bords) */
  function krWords(kr){
    return kr.split(/\s+/).map(function(w){
      return w.replace(/[^\u3131-\u318E\uAC00-\uD7A30-9A-Za-z]/g, "");
    }).filter(function(w){ return w; });
  }

  /* ================= PUR : index =================
     Construit UNE fois : toutes les formes dérivées (normalisées, choseong,
     mots) sont précalculées pour que search() ne fasse que des indexOf. */
  function buildIndex(items, extra){
    extra = extra || {};
    return (items || []).map(function(it, i){
      var fr = String(it.fr == null ? "" : it.fr);
      var kr = String(it.kr == null ? "" : it.kr);
      var x  = extra[it.id] || {};
      var frN = normFr(fr);
      return {
        id: it.id, fr: fr, kr: kr,
        theme: String(it.theme || ""), stage: it.stage,
        /* phrase ? via type si fourni, sinon inféré (kr multi-mots) */
        phrase: it.type != null ? (it.type === "phrase" ? 1 : 0)
                                : (/\s/.test(kr.trim()) ? 1 : 0),
        frN: frN, frWords: frWords(frN),
        krWords: krWords(kr),
        cho: choseong(kr),
        choWords: krWords(kr).map(choseong),
        ex: String(x.ex || ""), exFr: String(x.exFr || ""),
        note: String(x.note || ""), conj: String(x.conj || ""),
        exFrN: normFr(x.exFr || ""), noteN: normFr(x.note || ""),
        i: i
      };
    });
  }

  /* ================= PUR : scoring =================
     0 = mot entier exact · 1 = commence par · 2 = contient (champ principal)
     3 = contient (champs secondaires : exemple, conjugaison, note)
     9 = pas de match. */
  function frScore(e, qn){
    if(e.frN === qn || e.frWords.indexOf(qn) >= 0) return 0;
    if(e.frN.lastIndexOf(qn, 0) === 0) return 1;
    if(e.frN.indexOf(qn) >= 0) return 2;
    if((e.exFrN && e.exFrN.indexOf(qn) >= 0) ||
       (e.noteN && e.noteN.indexOf(qn) >= 0)) return 3;
    return 9;
  }
  function krScore(e, q, cho){
    if(cho){  /* recherche par consonnes initiales */
      if(e.cho === cho || e.choWords.indexOf(cho) >= 0) return 0;
      if(e.cho.lastIndexOf(cho, 0) === 0) return 1;
      if(e.cho.indexOf(cho) >= 0) return 2;
      if(e.kr.indexOf(q) >= 0) return 2;   /* jamo littéral dans le texte */
      return 9;
    }
    if(e.kr === q || e.krWords.indexOf(q) >= 0) return 0;
    if(e.kr.lastIndexOf(q, 0) === 0) return 1;
    if(e.kr.indexOf(q) >= 0) return 2;
    if((e.ex && e.ex.indexOf(q) >= 0) ||
       (e.conj && e.conj.indexOf(q) >= 0)) return 3;
    return 9;
  }

  /* search(index, rawQ) ->
       null  : requête trop courte (< 2 car. latins, ou vide) — rien à afficher
       []    : requête valide, aucun résultat
       [{e, score}] : résultats triés (meilleur d'abord). */
  function search(index, rawQ){
    var q = String(rawQ == null ? "" : rawQ).trim();
    var hangul = HANGUL_RE.test(q);
    if(!q || (!hangul && q.length < 2)) return null;
    var qn  = normFr(q);
    var cho = hangul && isChoseongQuery(q) ? q.replace(/\s+/g, "") : null;
    var out = [];
    for(var i = 0; i < index.length; i++){
      var e = index[i];
      var s = frScore(e, qn);            /* toujours tenté : les notes citent du hangul */
      if(hangul){
        var sk = krScore(e, q, cho);
        if(sk < s) s = sk;
      }
      if(s < 9) out.push({ e: e, score: s,
        len: hangul ? e.kr.length : e.fr.length });
    }
    out.sort(function(a, b){
      return (a.score - b.score)             /* exact > commence par > contient */
          || (a.e.phrase - b.e.phrase)       /* mots avant phrases */
          || (a.len - b.len)                 /* champs courts d'abord */
          || (a.e.i - b.e.i);                /* stable */
    });
    return out;
  }

  /* ================= RENDU ================= */
  function esc(s){ return String(s).replace(/[&<>"']/g, function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function el(html){ var t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }

  /* Styles .search-* injectés une seule fois — style.css n'est pas modifié,
     tout passe par les variables :root existantes. */
  var CSS = [
    ".search-panel{display:flex; flex-direction:column; gap:10px}",
    ".search-box{position:relative}",
    ".search-input{width:100%; background:var(--panel2); border:1px solid var(--line);",
    "  color:var(--txt); border-radius:var(--r); padding:13px 44px 13px 14px;",
    "  font-size:1.05rem; outline:none; -webkit-appearance:none; appearance:none}",
    ".search-input:focus{border-color:var(--acc)}",
    ".search-input::placeholder{color:var(--dim); opacity:.8}",
    ".search-input::-webkit-search-cancel-button{display:none}",
    ".search-clear{position:absolute; right:4px; top:50%; transform:translateY(-50%);",
    "  background:none; border:none; color:var(--dim); font-size:1.05rem;",
    "  padding:10px 12px; cursor:pointer; line-height:1}",
    ".search-count{font-size:.78rem; color:var(--dim); padding:0 2px}",
    ".search-hit .search-pills{margin-top:2px; margin-left:-2px}",
    ".search-hit .trivia{margin-top:8px}",
    ".search-more{text-align:center; font-size:.82rem; color:var(--warn); padding:6px 0}"
  ].join("\n");
  function injectStyles(){
    if(document.getElementById("search-styles")) return;
    var s = document.createElement("style");
    s.id = "search-styles"; s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* Index module : construit au premier renderPanel. Aux rendus suivants,
     seuls les champs vivants (stage, theme) sont rafraîchis — les formes
     normalisées / choseong ne changent jamais (contenu statique). */
  var INDEX = null, BYID = null, LASTQ = "";
  function ensureIndex(items, extra){
    if(!INDEX){
      INDEX = buildIndex(items, extra);
      BYID = {};
      INDEX.forEach(function(e){ BYID[e.id] = e; });
      return;
    }
    (items || []).forEach(function(it){
      var e = BYID[it.id];
      if(e){ e.stage = it.stage; e.theme = String(it.theme || e.theme); }
    });
  }

  function themeShort(theme){
    var p = theme.split("::");
    return p[p.length - 1] || theme;
  }

  function hitRow(e, onSpeak){
    var pills = '<span class="pill">' + esc(themeShort(e.theme)) + '</span>' +
      (e.stage != null ? '<span class="pill stage">niv ' + esc(e.stage) + '</span>' : "");
    var row = el('<div class="item search-hit"><div class="txt">' +
      '<div class="kr">' + esc(e.kr) + '</div>' +
      '<div class="fr">' + esc(e.fr) + '</div>' +
      '<div class="search-pills">' + pills + '</div></div>' +
      (typeof onSpeak === "function" ? '<button class="speak" title="écouter"><svg viewBox="0 0 24 24" style="width:22px;height:22px;stroke:currentColor;stroke-width:1.6;fill:none;stroke-linecap:round;stroke-linejoin:round;vertical-align:middle"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 010 7"/></svg></button>' : "") +
      '</div>');
    var sp = row.querySelector(".speak");
    if(sp) sp.onclick = function(ev){ ev.stopPropagation(); onSpeak(e.kr, e.id); };
    /* tap = dépliage inline du contenu d'aide (extra.js), tap again = repli */
    row.onclick = function(){
      var open = row.querySelector(".trivia");
      if(open){ open.remove(); return; }
      var bits = [];
      if(e.ex) bits.push('<div class="tkr">' + esc(e.ex) + '</div>' +
        (e.exFr ? '<div class="tfr">' + esc(e.exFr) + '</div>' : ""));
      if(e.conj) bits.push('<div class="tconj">활용 ' + esc(e.conj) + '</div>');
      if(e.note) bits.push('<div class="tnote">' + esc(e.note) + '</div>');
      if(!bits.length) return;
      row.querySelector(".txt").appendChild(el('<div class="trivia">' + bits.join("") + '</div>'));
    };
    return row;
  }

  var MAX_SHOWN = 30;
  function paintResults($count, $list, res, q, onSpeak){
    $list.innerHTML = ""; $count.textContent = "";
    if(res === null){   /* requête vide / trop courte : invite discrète */
      $count.textContent = q.trim()
        ? "Encore un caractère…"
        : "Français ou coréen — 초성 ok : « ㅅㅈ » trouve 성적.";
      return;
    }
    if(!res.length){
      $count.textContent = "Aucun résultat pour « " + q.trim() + " ».";
      return;
    }
    $count.textContent = res.length + (res.length > 1 ? " résultats" : " résultat");
    res.slice(0, MAX_SHOWN).forEach(function(r){ $list.appendChild(hitRow(r.e, onSpeak)); });
    if(res.length > MAX_SHOWN){
      $list.appendChild(el('<div class="search-more">… ' + (res.length - MAX_SHOWN) +
        ' de plus — affine ta recherche</div>'));
    }
  }

  /* renderPanel(container, opts) -> l'élément panneau ajouté au container.
     Pas d'autofocus (clavier mobile intrusif) : focus au tap seulement.
     La dernière requête (mémoire de session, PAS localStorage) est restaurée
     pour survivre aux allers-retours d'onglets. */
  function renderPanel(container, opts){
    opts = opts || {};
    ensureIndex(opts.items, opts.extra);
    injectStyles();
    var panel = el('<div class="search-panel">' +
      '<div class="search-box">' +
      '<input type="search" class="search-input" placeholder="Chercher un mot du deck…"' +
      ' enterkeyhint="search" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">' +
      '<button class="search-clear" title="Effacer" hidden>×</button></div>' +
      '<div class="search-count"></div>' +
      '<div class="list search-results"></div></div>');
    var $input = panel.querySelector(".search-input");
    var $clear = panel.querySelector(".search-clear");
    var $count = panel.querySelector(".search-count");
    var $list  = panel.querySelector(".search-results");

    var timer = null;
    function run(){
      timer = null;
      var q = $input.value;
      LASTQ = q;
      $clear.hidden = !q;
      paintResults($count, $list, search(INDEX, q), q, opts.onSpeak);
    }
    $input.addEventListener("input", function(){
      if(timer) clearTimeout(timer);
      timer = setTimeout(run, 120);                 /* debounce 120 ms */
    });
    $input.addEventListener("keydown", function(ev){
      if(ev.key === "Enter"){                       /* recherche immédiate + repli clavier */
        if(timer) clearTimeout(timer);
        run(); $input.blur();
      }
    });
    $clear.onclick = function(){ $input.value = ""; run(); $input.focus(); };

    if(LASTQ) $input.value = LASTQ;                 /* reprise après changement d'onglet */
    run();
    container.appendChild(panel);
    return panel;
  }

  /* ================= export double environnement ================= */
  var SORI_SEARCH = {
    renderPanel: renderPanel,
    pure: { normFr: normFr, choseong: choseong, isChoseongQuery: isChoseongQuery,
            buildIndex: buildIndex, search: search }
  };
  if (typeof module !== "undefined" && module.exports) module.exports = SORI_SEARCH;
  else root.SORI_SEARCH = SORI_SEARCH;
})(typeof self !== "undefined" ? self : this);

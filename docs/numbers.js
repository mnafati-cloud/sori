/* Sori — numbers.js : entraîneur de nombres à l'oreille (prix, heures, dates, quantités).
   - Partie PURE : les convertisseurs nombre→hangul (sino, native, nativeCounter,
     price, time, date, quantity) + makeExercise (génération d'exercice avec
     distracteurs) — zéro DOM, zéro localStorage, RNG injectable. Même pattern
     double environnement que search.js / engine.js : testable sous Node.
   - Partie RENDU : SORI_NUMBERS.renderCard(container, opts) — carte « série de 10 ».
   - opts = {
       speak:    function(texteCoreen)   TTS en TEXTE BRUT, délégué à app.js
                                         (les nombres aléatoires n'ont pas de MP3
                                          → brancher sur ttsSpeak, pas speak(kr,id))
       onAnswer: function(ok)            journalisation déléguée à app.js
       random:   function() -> [0,1)     optionnel (tests reproductibles)
     }
   - Conventions hangul appliquées : SANS 일 initial devant 천/백/십 (21500 →
     이만 천오백 ; 10000 → 만 ; 110 → 백십), 0 → 영 ; heures en NATIF déterminant
     (한 시…열두 시) + minutes en SINO (삼십 분, variante 반 pour :30) ; mois
     avec 유월 (6) / 시월 (10) ; quantités en natif déterminant (한/두/세/네/
     스무/스물한…) + compteur (개/명/병/잔/장/마리).
   - Distracteurs (jamais de doublons, la bonne toujours présente) : ordre de
     grandeur ×10/÷10 et ±paliers, proches sonores 일/이 (1↔2) et 삼/사 (3↔4)
     (et 세/네 côté natif), inversion heure↔minute et jour↔mois, confusion de
     compteur.
   - Ce module n'écrit AUCUN état (ni localStorage, ni ST). */
(function(root){
  "use strict";

  /* ================= PUR : convertisseurs nombre → hangul ================= */
  var SINO_D = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];

  /* 1..9999 — jamais de 일 initial devant 천/백/십 (1100 → 천백, 110 → 백십) */
  function sino4(n){
    var out = "";
    var th = Math.floor(n / 1000), h = Math.floor(n / 100) % 10,
        t  = Math.floor(n / 10) % 10, u = n % 10;
    if(th) out += (th > 1 ? SINO_D[th] : "") + "천";
    if(h)  out += (h  > 1 ? SINO_D[h]  : "") + "백";
    if(t)  out += (t  > 1 ? SINO_D[t]  : "") + "십";
    if(u)  out += SINO_D[u];
    return out;
  }

  /* sino(n) : 0..99 999 999. Hors bornes → "" (comportement neutre). */
  function sino(n){
    if(typeof n !== "number" || !isFinite(n)) return "";
    n = Math.floor(n);
    if(n < 0 || n > 99999999) return "";
    if(n === 0) return "영";
    var man = Math.floor(n / 10000), rest = n % 10000;
    if(!man) return sino4(rest);
    var head = (man === 1 ? "" : sino4(man)) + "만";   /* 10000 → 만 (pas 일만) */
    return rest ? head + " " + sino4(rest) : head;
  }

  var NAT_U  = ["", "하나", "둘", "셋", "넷", "다섯", "여섯", "일곱", "여덟", "아홉"];
  var NAT_UC = ["", "한",   "두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉"];
  var NAT_T  = ["", "열", "스물", "서른", "마흔", "쉰", "예순", "일흔", "여든", "아흔"];

  /* native(n) : 1..99, forme pleine (하나…아흔아홉). Hors bornes → "". */
  function native(n){
    if(typeof n !== "number" || !isFinite(n)) return "";
    n = Math.floor(n);
    if(n < 1 || n > 99) return "";
    return NAT_T[Math.floor(n / 10)] + NAT_U[n % 10];
  }

  /* nativeCounter(n) : 1..99, forme déterminante (한/두/세/네/스무/스물한…). */
  function nativeCounter(n){
    if(typeof n !== "number" || !isFinite(n)) return "";
    n = Math.floor(n);
    if(n < 1 || n > 99) return "";
    var t = Math.floor(n / 10), u = n % 10;
    if(u === 0) return t === 2 ? "스무" : NAT_T[t];    /* 20 seul → 스무 */
    return NAT_T[t] + NAT_UC[u];
  }

  /* price(n) → sino + " 원" */
  function price(n){
    var s = sino(n);
    return s ? s + " 원" : "";
  }

  /* time(h, m[, half]) → heure NATIVE déterminante + minutes SINO.
     h 1..12, m 0..59. half=true et m=30 → "… 시 반". m=0 → heure seule. */
  function time(h, m, half){
    var hs = nativeCounter(h);
    if(!hs || h > 12 || typeof m !== "number" || !isFinite(m)) return "";
    m = Math.floor(m);
    if(m < 0 || m > 59) return "";
    if(m === 30 && half) return hs + " 시 반";
    if(m === 0) return hs + " 시";
    return hs + " 시 " + sino(m) + " 분";
  }

  /* date(mois, jour) → sino, avec 유월 (6) et 시월 (10). */
  function date(mo, d){
    if(typeof mo !== "number" || typeof d !== "number" ||
       !isFinite(mo) || !isFinite(d)) return "";
    mo = Math.floor(mo); d = Math.floor(d);
    if(mo < 1 || mo > 12 || d < 1 || d > 31) return "";
    var ms = mo === 6 ? "유월" : mo === 10 ? "시월" : sino(mo) + "월";
    return ms + " " + sino(d) + " 일";
  }

  /* quantity(n, compteur) → natif déterminant + compteur. */
  function quantity(n, counter){
    var ns = nativeCounter(n);
    return ns && counter ? ns + " " + String(counter) : "";
  }

  /* ================= PUR : génération d'exercices ================= */
  var COUNTERS = ["개", "명", "병", "잔", "장", "마리"];
  var MODE_IDS = ["prix", "heures", "dates", "quantites"];
  var SWAP_DIGIT = { "1": "2", "2": "1", "3": "4", "4": "3" };

  function ri(rng, a, b){ return a + Math.floor(rng() * (b - a + 1)); }
  function pickOne(rng, arr){ return arr[Math.floor(rng() * arr.length)]; }
  function shuffle(arr, rng){
    for(var i = arr.length - 1; i > 0; i--){
      var j = Math.floor(rng() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /* proches sonores 일/이 et 삼/사 : un chiffre échangé à la fois (21500 →
     11500, 22500). Jamais de zéro de tête (0 n'est pas dans la table). */
  function soundSwaps(n){
    var s = String(n), out = [];
    for(var i = 0; i < s.length; i++){
      var d = SWAP_DIGIT[s[i]];
      if(d) out.push(+(s.slice(0, i) + d + s.slice(i + 1)));
    }
    return out;
  }

  /* étiquettes EN CHIFFRES (ce que voit le joueur) */
  function fmtWon(n){ return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " ₩"; }
  function pad2(n){ return (n < 10 ? "0" : "") + n; }
  function fmtHour(h, m){ return h + " h " + pad2(m); }
  function fmtDate(d, mo){ return pad2(d) + "/" + pad2(mo); }
  function fmtQuant(n, c){ return n + " " + c; }

  function genPrix(rng){
    var r = rng(), n;
    if(r < 0.25)      n = ri(rng, 5, 99) * 100;                            /* 500..9 900 */
    else if(r < 0.60) n = ri(rng, 1, 9) * 10000 + ri(rng, 0, 19) * 500;    /* 10 000..99 500 */
    else if(r < 0.85) n = ri(rng, 10, 99) * 10000 + ri(rng, 0, 9) * 1000;  /* 100 000..999 000 */
    else              n = ri(rng, 1, 9) * 1000;                            /* milliers ronds */
    var mag = n >= 100000 ? 10000 : n >= 10000 ? 1000 : 100;
    var vals = soundSwaps(n).concat([n * 10, n / 10, n + mag, n - mag, n + 2 * mag, n * 2]);
    var labels = [];
    shuffle(vals, rng).forEach(function(v){
      if(v !== n && v >= 100 && v <= 99999999 && v % 100 === 0) labels.push(fmtWon(v));
    });
    for(var k = 3; labels.length < 12; k++) labels.push(fmtWon(n + k * mag));
    return { hangul: price(n), label: fmtWon(n), cands: labels };
  }

  function genHeures(rng){
    var h = ri(rng, 1, 12);
    var m = pickOne(rng, [0, 5, 10, 15, 20, 30, 30, 40, 45, 50]);
    var hangul = (m === 30 && rng() < 0.5) ? time(h, 30, true) : time(h, m);
    var pairs = [];
    if(h === 3) pairs.push([4, m]);                       /* 세 시 / 네 시 */
    if(h === 4) pairs.push([3, m]);
    pairs.push([h % 12 + 1, m], [(h + 10) % 12 + 1, m]);  /* h±1 (1..12) */
    soundSwaps(m).forEach(function(v){ if(v < 60) pairs.push([h, v]); });
    if(m + 10 < 60) pairs.push([h, m + 10]);
    if(m - 10 >= 0) pairs.push([h, m - 10]);
    pairs.push([h, m === 30 ? 0 : 30]);
    if(m >= 1 && m <= 12 && m !== h) pairs.push([m, h]);  /* inversion heure/minute */
    var labels = shuffle(pairs, rng).map(function(p){ return fmtHour(p[0], p[1]); });
    for(var k = 1; labels.length < 12; k++) labels.push(fmtHour((h + k - 1) % 12 + 1, m));
    return { hangul: hangul, label: fmtHour(h, m), cands: labels };
  }

  function genDates(rng){
    var mo = ri(rng, 1, 12), d = ri(rng, 1, 28);
    var pairs = [];                                       /* [jour, mois] */
    soundSwaps(d).forEach(function(v){ if(v >= 1 && v <= 31) pairs.push([v, mo]); });
    soundSwaps(mo).forEach(function(v){ if(v >= 1 && v <= 12) pairs.push([d, v]); });
    if(d + 10 <= 31) pairs.push([d + 10, mo]);            /* 십오 일 / 이십오 일 */
    if(d - 10 >= 1)  pairs.push([d - 10, mo]);
    pairs.push([d, mo % 12 + 1], [d, (mo + 10) % 12 + 1]);
    if(d <= 12 && d !== mo) pairs.push([mo, d]);          /* inversion jour/mois */
    var labels = shuffle(pairs, rng).map(function(p){ return fmtDate(p[0], p[1]); });
    for(var k = 1; labels.length < 12; k++) labels.push(fmtDate(d, (mo + k - 1) % 12 + 1));
    return { hangul: date(mo, d), label: fmtDate(d, mo), cands: labels };
  }

  function genQuant(rng){
    var counter = pickOne(rng, COUNTERS);
    var r = rng(), n;
    if(r < 0.55)      n = ri(rng, 1, 10);
    else if(r < 0.85) n = ri(rng, 11, 20);
    else              n = ri(rng, 21, 60);
    var cands = [];
    var others = shuffle(COUNTERS.filter(function(c){ return c !== counter; }), rng);
    cands.push(fmtQuant(n, others[0]), fmtQuant(n, others[1]));  /* confusion de compteur */
    var vals = [];
    if(n % 10 === 3) vals.push(n + 1);                    /* 세 / 네 */
    if(n % 10 === 4) vals.push(n - 1);
    vals.push(n + 1, n - 1, n + 10, n - 10, n * 2);
    vals.forEach(function(v){ if(v >= 1 && v <= 99 && v !== n) cands.push(fmtQuant(v, counter)); });
    shuffle(cands, rng);
    for(var k = 1; cands.length < 12; k++) cands.push(fmtQuant((n + k - 1) % 99 + 1, counter));
    return { hangul: quantity(n, counter), label: fmtQuant(n, counter), cands: cands };
  }

  var GEN = { prix: genPrix, heures: genHeures, dates: genDates, quantites: genQuant };

  /* makeExercise(mode, rng) →
       { mode, hangul, answer, options: [{label, ok}] × 4 }
     4 étiquettes uniques, exactement une ok. Déterministe à rng donné. */
  function makeExercise(mode, rng){
    rng = rng || Math.random;
    var g = GEN[mode](rng);
    var options = [{ label: g.label, ok: true }];
    var seen = {}; seen[g.label] = 1;
    for(var i = 0; i < g.cands.length && options.length < 4; i++){
      var L = g.cands[i];
      if(!seen[L]){ seen[L] = 1; options.push({ label: L, ok: false }); }
    }
    shuffle(options, rng);
    return { mode: mode, hangul: g.hangul, answer: g.label, options: options };
  }

  /* ================= RENDU ================= */
  function esc(s){ return String(s).replace(/[&<>"']/g, function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function el(html){ var t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }

  var MODES = [
    { id: "prix",      label: "💰 Prix" },
    { id: "heures",    label: "🕐 Heures" },
    { id: "dates",     label: "📅 Dates" },
    { id: "quantites", label: "📦 Quantités" }
  ];
  var MODE_LABEL = {};
  MODES.forEach(function(mo){ MODE_LABEL[mo.id] = mo.label; });

  /* Styles .num-* injectés une seule fois — uniquement les variables :root
     de style.css (compatibles avec les 4 thèmes sans rien faire). */
  var CSS = [
    ".num-modes{display:flex; flex-wrap:wrap; gap:8px; margin-top:10px}",
    ".num-mode{flex:1 1 45%; display:flex; align-items:center; gap:10px;",
    "  background:var(--panel2); border:1px solid var(--line); border-radius:var(--r);",
    "  padding:10px 12px; font-size:.95rem; cursor:pointer; text-align:left}",
    ".num-mode input{transform:scale(1.25); margin:0}",
    ".num-speak{background:none; border:none; font-size:3rem; cursor:pointer;",
    "  padding:6px; margin:8px auto 0; display:block}",
    ".num-toggle{background:none; border:none; color:var(--dim); font-size:.82rem;",
    "  cursor:pointer; padding:4px 8px; text-decoration:underline dotted}",
    ".num-hangul{font-size:1.35rem; font-weight:600; color:var(--acc);",
    "  margin:8px 0 2px; word-break:keep-all; min-height:1.4em}",
    ".num-warn{color:var(--warn); font-size:.85rem; margin-top:8px}",
    ".num-last{color:var(--dim); font-size:.9rem; margin:6px 0 0}"
  ].join("\n");
  function injectStyles(){
    if(document.getElementById("numbers-styles")) return;
    var s = document.createElement("style");
    s.id = "numbers-styles"; s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* renderCard(container, opts) → l'élément carte ajouté au container.
     Tout l'état vit dans la fermeture (série en cours, score) — rien n'est
     persisté : quitter l'onglet remet la carte à l'écran de départ. */
  function renderCard(container, opts){
    opts = opts || {};
    var rng      = typeof opts.random   === "function" ? opts.random   : Math.random;
    var speak    = typeof opts.speak    === "function" ? opts.speak    : function(){};
    var onAnswer = typeof opts.onAnswer === "function" ? opts.onAnswer : function(){};
    injectStyles();
    var card = el('<div class="card center num-card"></div>');
    var N = 10;
    var enabled = { prix: true, heures: true, dates: true, quantites: true };

    function paintConfig(lastScore){
      card.innerHTML = "";
      card.appendChild(el("<h2>🔢 Les nombres à l'oreille</h2>"));
      card.appendChild(el('<p class="dim">Écoute un prix, une heure, une date ou une ' +
        'quantité en coréen, puis choisis le bon nombre. Série de ' + N + '.</p>'));
      if(lastScore != null)
        card.appendChild(el('<p class="num-last">Dernière série : <b>' + lastScore + " / " + N + "</b></p>"));
      var box = el('<div class="num-modes"></div>');
      MODES.forEach(function(mo){
        var lab = el('<label class="num-mode"><input type="checkbox"' +
          (enabled[mo.id] ? " checked" : "") + "><span>" + esc(mo.label) + "</span></label>");
        lab.querySelector("input").onchange = function(e){
          enabled[mo.id] = e.target.checked;
          warn.hidden = MODES.some(function(x){ return enabled[x.id]; });
        };
        box.appendChild(lab);
      });
      card.appendChild(box);
      var warn = el('<p class="num-warn" hidden>Coche au moins un mode.</p>');
      card.appendChild(warn);
      var go = el('<button class="btn" style="width:100%; margin-top:12px">▶ Commencer</button>');
      go.onclick = function(){
        var ids = MODES.filter(function(mo){ return enabled[mo.id]; })
                       .map(function(mo){ return mo.id; });
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
        paintExercise(makeExercise(modeIds[Math.floor(rng() * modeIds.length)], rng));
      }

      function paintExercise(ex){
        card.innerHTML = "";
        card.appendChild(el('<div class="dim">Nombre ' + (pos + 1) + " / " + N +
          " — " + esc(MODE_LABEL[ex.mode]) + "</div>"));
        var hear = el('<button class="num-speak" title="réécouter">🔊</button>');
        hear.onclick = function(){ speak(ex.hangul); };
        card.appendChild(hear);
        var tog = el('<button class="num-toggle">👁 voir le hangul</button>');
        var kr  = el('<div class="num-hangul" hidden></div>');
        kr.textContent = ex.hangul;
        tog.onclick = function(){ kr.hidden = !kr.hidden; };
        card.appendChild(tog); card.appendChild(kr);
        var box = el('<div class="opts"></div>');
        var goodBtn = null;
        ex.options.forEach(function(o){
          var b = el("<button>" + esc(o.label) + "</button>");
          if(o.ok) goodBtn = b;
          b.onclick = function(){
            box.querySelectorAll("button").forEach(function(x){ x.disabled = true; });
            b.classList.add(o.ok ? "good" : "bad");
            if(!o.ok && goodBtn) goodBtn.classList.add("good");
            kr.hidden = false; tog.hidden = true;
            if(o.ok) score++;
            onAnswer(!!o.ok);
            pos++;
            setTimeout(next, o.ok ? 900 : 1800);
          };
          box.appendChild(b);
        });
        card.appendChild(box);
        speak(ex.hangul);
      }

      function paintEnd(){
        card.innerHTML = "";
        card.appendChild(el('<div class="done-banner">🔢</div>'));
        card.appendChild(el("<h2>" + score + " / " + N + "</h2>"));
        card.appendChild(el('<p class="dim">compréhension des nombres</p>'));
        var row = el('<div class="row" style="margin-top:12px">' +
          '<button class="btn num-again">Rejouer</button>' +
          '<button class="btn ghost num-config">Modes</button></div>');
        row.querySelector(".num-again").onclick  = function(){ startSeries(modeIds); };
        row.querySelector(".num-config").onclick = function(){ paintConfig(score); };
        card.appendChild(row);
      }
    }

    paintConfig(null);
    container.appendChild(card);
    return card;
  }

  /* ================= export double environnement ================= */
  var SORI_NUMBERS = {
    renderCard: renderCard,
    pure: {
      sino: sino, native: native, nativeCounter: nativeCounter,
      price: price, time: time, date: date, quantity: quantity,
      makeExercise: makeExercise, modes: MODE_IDS, counters: COUNTERS
    }
  };
  if (typeof module !== "undefined" && module.exports) module.exports = SORI_NUMBERS;
  else root.SORI_NUMBERS = SORI_NUMBERS;
})(typeof self !== "undefined" ? self : this);

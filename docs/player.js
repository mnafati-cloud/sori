/* Sori — player.js : ÉCOUTE PASSIVE (playlist audio mains-libres), autonome.
   Objectif : lancer une playlist de son vocabulaire et laisser tourner ÉCRAN
   ÉTEINT (transports, marche) — lecture continue + contrôles sur l'écran de
   verrouillage Android via l'API MediaSession.
   - API : window.SORI_PLAYER.renderCard(container, opts) + .stop()
     opts = { tracks, rate, audioBase? }
       tracks    : [{id, kr, fr, stage, enemy, kit, hasAudio}] — fournis par
                   l'appelant (app.js). Si hasAudio manque, repli window.AUDIO.
       rate      : vitesse de lecture (ex. ST.set.rate), défaut 0.9.
       audioBase : préfixe des mp3, défaut "./audio/" (la page de test
                   docs/design/player-test.html passe "../audio/").
   - UN SEUL élément Audio réutilisé pour toute la playlist (indispensable :
     Android ne maintient la session média en arrière-plan que sur un élément
     déjà « activé » par un geste utilisateur).
   - Partie PURE exposée dans SORI_PLAYER.pure (filtre des modes) — testable
     sans audio, même pattern qu'events.js.
   - ZÉRO accès localStorage. ZÉRO dépendance à app.js (utilitaires recopiés
     volontairement). try/catch sur toute l'API MediaSession (absente ou
     partielle sur desktop). */
(function(){
  "use strict";

  /* ================= utilitaires locaux (copies : zéro couplage) ========= */
  function el(html){
    var t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }
  function shuffle(a){
    for(var i=a.length-1; i>0; i--){
      var j = Math.floor(Math.random()*(i+1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  /* ================= PUR : modes & filtres ================= */
  var MODES = [
    { id:"kit",   label:"🧳 Kit voyage",    f:function(t){ return !!t.kit; } },
    { id:"enemy", label:"⚔️ Ennemies",      f:function(t){ return !!t.enemy; } },
    { id:"cours", label:"📚 En cours",      f:function(t){ return t.stage===3 || t.stage===4; } },
    { id:"connu", label:"🎓 Tout le connu", f:function(t){ return t.stage>=3; } }
  ];
  /* repli si l'appelant n'a pas fourni hasAudio : window.AUDIO (audio/index.js) */
  var AUD = null;
  function hasAudio(t){
    if(typeof t.hasAudio === "boolean") return t.hasAudio;
    if(AUD === null){
      AUD = {};
      try{
        var a = (typeof window!=="undefined" && window.AUDIO) || [];
        for(var i=0; i<a.length; i++) AUD[String(a[i])] = 1;
      }catch(e){}
    }
    return !!AUD[String(t.id)];
  }
  /* pistes jouables d'un mode : filtre du mode ET mp3 disponible */
  function filterTracks(tracks, modeId){
    var m = null;
    for(var i=0; i<MODES.length; i++) if(MODES[i].id===modeId) m = MODES[i];
    if(!m) return [];
    var out = [];
    for(var k=0; k<(tracks||[]).length; k++){
      var t = tracks[k];
      if(t && m.f(t) && hasAudio(t)) out.push(t);
    }
    return out;
  }

  /* ================= état du lecteur (un seul lecteur à la fois) ========= */
  var GAP_MS  = 1200;   // silence entre deux pistes
  var ECHO_MS = 400;    // silence avant la répétition ×2 du même mot
  var P = {
    tracks: [],         // toutes les pistes reçues
    queue: [],          // pistes du mode courant, éventuellement mélangées
    pos: 0,
    mode: "cours",
    shuf: false,
    twice: false,       // « répéter chaque mot ×2 » (écho mémoire, jamais de TTS FR)
    rate: 0.9,
    base: "./audio/",
    audio: null,        // l'UNIQUE élément Audio réutilisé
    playing: false,
    echoDone: false,    // la 2e lecture de la piste courante a-t-elle eu lieu ?
    timer: null,        // minuterie de l'écart entre pistes
    pending: null,      // action différée (survit à une pause pendant l'écart)
    errStreak: 0,       // mp3 illisibles d'affilée (garde-fou boucle infinie)
    ui: null            // refs DOM de la carte courante
  };

  function clearTimer(){ if(P.timer){ clearTimeout(P.timer); P.timer = null; } }
  /* écart programmé : pause() ne garde que P.pending, resume() le rejoue */
  function schedule(fn, ms){
    clearTimer();
    P.pending = fn;
    P.timer = setTimeout(function(){ P.timer = null; P.pending = null; fn(); }, ms);
  }

  function ensureAudio(){
    if(P.audio) return P.audio;
    var a = new Audio();
    a.preload = "auto";
    a.addEventListener("ended", onEnded);
    a.addEventListener("error", function(){ onError(); });
    a.addEventListener("playing", function(){ P.errStreak = 0; });
    P.audio = a;
    return a;
  }

  /* ================= MediaSession (écran de verrouillage) ================ */
  function msSet(action, fn){
    /* chaque handler dans son propre try : certains actions ne sont pas
       supportées selon le navigateur et setActionHandler jette */
    try{ navigator.mediaSession.setActionHandler(action, fn); }catch(e){}
  }
  function wireMediaSession(){
    try{
      if(!(typeof navigator!=="undefined" && "mediaSession" in navigator)) return;
    }catch(e){ return; }
    msSet("play",  function(){ resume(); });
    msSet("pause", function(){ pause(); });
    msSet("previoustrack", function(){ prev(); });
    msSet("nexttrack",     function(){ skip(); });
    msSet("stop",          function(){ stop(); });
  }
  function msMeta(track){
    try{
      if(!("mediaSession" in navigator)) return;
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.kr,
        artist: track.fr,
        album: "Sori — écoute passive"
      });
    }catch(e){}
  }
  function msState(s){
    try{ if("mediaSession" in navigator) navigator.mediaSession.playbackState = s; }catch(e){}
  }

  /* ================= file ================= */
  function rebuildQueue(keepCurrent){
    var curId = P.queue[P.pos] ? P.queue[P.pos].id : null;
    P.queue = filterTracks(P.tracks, P.mode);
    if(P.shuf) shuffle(P.queue);
    P.pos = 0;
    if(keepCurrent && curId){
      for(var i=0; i<P.queue.length; i++){
        if(P.queue[i].id===curId){ P.pos = i; break; }
      }
    }
    paintNow(); paintBtn();
  }

  /* ================= lecture ================= */
  function playAt(pos){
    if(!P.queue.length){ stop(); return; }
    P.pos = ((pos % P.queue.length) + P.queue.length) % P.queue.length;  // boucle en fin de liste
    P.echoDone = false;
    clearTimer(); P.pending = null;
    var t = P.queue[P.pos];
    var a = ensureAudio();
    a.src = P.base + t.id + ".mp3";
    /* le chargement d'une nouvelle source remet playbackRate à
       defaultPlaybackRate : on fixe les deux, à chaque piste */
    a.defaultPlaybackRate = P.rate;
    a.playbackRate = P.rate;
    msMeta(t);
    P.playing = true;
    msState("playing");
    setStatus("");
    paintNow(); paintBtn();
    var pr = a.play();
    if(pr && pr.catch) pr.catch(function(){ onError(); });
  }
  function onEnded(){
    if(!P.playing) return;
    if(P.twice && !P.echoDone){
      /* écho mémoire : le MÊME mp3 une 2e fois (jamais de TTS français
         par-dessus le coréen — l'écran affiche le sens) */
      P.echoDone = true;
      schedule(function(){
        var a = ensureAudio();
        try{ a.currentTime = 0; }catch(e){}
        a.playbackRate = P.rate;      // pas de rechargement ici, mais sûr
        var pr = a.play();
        if(pr && pr.catch) pr.catch(function(){ onError(); });
      }, ECHO_MS);
    } else {
      schedule(function(){ playAt(P.pos+1); }, GAP_MS);
    }
  }
  function onError(){
    if(!P.playing) return;
    P.errStreak++;
    if(P.errStreak >= Math.max(P.queue.length, 1)){
      /* toute la file est illisible : on s'arrête proprement */
      stop();
      setStatus("Aucun mp3 lisible dans cette sélection.");
      return;
    }
    schedule(function(){ playAt(P.pos+1); }, 250);   // skip de la piste cassée
  }

  function pause(){
    P.playing = false;
    clearTimer();                       // P.pending conservé : reprise exacte
    try{ if(P.audio) P.audio.pause(); }catch(e){}
    msState("paused");
    paintBtn();
  }
  function resume(){
    if(P.playing || !P.queue.length) return;
    wireMediaSession();
    P.playing = true;
    msState("playing");
    paintBtn();
    if(P.pending){                      // on était dans un écart entre pistes
      var fn = P.pending; P.pending = null;
      fn();
      return;
    }
    var a = ensureAudio();
    if(a.src){                          // pause au milieu d'une piste
      var pr = a.play();
      if(pr && pr.catch) pr.catch(function(){ onError(); });
    } else {                            // jamais démarré
      playAt(P.pos);
    }
  }
  function toggle(){ if(P.playing) pause(); else resume(); }
  function skip(){
    if(!P.queue.length) return;
    P.playing = true;
    playAt(P.pos+1);
  }
  function prev(){
    if(!P.queue.length) return;
    P.playing = true;
    var backToStart = false;
    try{ backToStart = P.audio && P.audio.currentTime > 3; }catch(e){}
    playAt(backToStart ? P.pos : P.pos-1);
  }
  function stop(){
    P.playing = false;
    clearTimer(); P.pending = null;
    P.echoDone = false;
    try{ if(P.audio) P.audio.pause(); }catch(e){}
    msState("none");
    try{ if("mediaSession" in navigator) navigator.mediaSession.metadata = null; }catch(e){}
    paintBtn();
  }

  /* ================= rendu ================= */
  function setStatus(msg){ if(P.ui) P.ui.status.textContent = msg || ""; }
  function paintNow(){
    if(!P.ui) return;
    var t = P.queue[P.pos];
    if(t){
      P.ui.kr.textContent  = t.kr;
      P.ui.fr.textContent  = t.fr;
      P.ui.pos.textContent = (P.pos+1) + " / " + P.queue.length;
    } else {
      P.ui.kr.textContent  = "—";
      P.ui.fr.textContent  = "";
      P.ui.pos.textContent = "aucun audio dans cette sélection";
    }
  }
  function paintBtn(){
    if(!P.ui) return;
    P.ui.play.textContent = P.playing ? "⏸ Pause" : "▶ Lancer";
    P.ui.play.disabled = !P.queue.length;
    P.ui.prev.disabled = !P.queue.length;
    P.ui.next.disabled = !P.queue.length;
  }
  function paintModes(){
    if(!P.ui) return;
    var btns = P.ui.modes.children;
    for(var i=0; i<btns.length; i++){
      var b = btns[i];
      b.className = (b.getAttribute("data-mode")===P.mode) ? "chip" : "chip src";
    }
  }

  function renderCard(container, opts){
    stop();                               // un seul lecteur : coupe l'ancien
    opts = opts || {};
    P.tracks = opts.tracks || [];
    P.rate = (typeof opts.rate==="number" && opts.rate>0) ? opts.rate : 0.9;
    P.base = opts.audioBase || "./audio/";

    var card = el('<div class="card">'
      + '<h2>🎧 Écoute passive</h2>'
      + '<p class="dim">Lance la playlist puis verrouille l\'écran : la lecture continue, '
      + 'contrôles sur l\'écran de verrouillage.</p>'
      + '<div class="pool" data-role="modes" style="margin:10px 0"></div>'
      + '<div class="settings">'
      +   '<label>Aléatoire <input type="checkbox" data-role="shuf"></label>'
      +   '<label>Répéter chaque mot ×2 <input type="checkbox" data-role="twice"></label>'
      + '</div>'
      + '<div class="center" style="margin-top:12px">'
      +   '<div class="big-kr" data-role="kr" style="min-height:1.3em">—</div>'
      +   '<div class="dim" data-role="fr" style="font-size:1.05rem; min-height:1.3em"></div>'
      +   '<div class="dim" data-role="pos" style="margin-top:6px"></div>'
      +   '<div class="dim" data-role="status"></div>'
      + '</div>'
      + '<div class="row" style="margin-top:14px">'
      +   '<button class="btn ghost" data-role="prev" title="précédent">⏮</button>'
      +   '<button class="btn" data-role="play" style="flex:2">▶ Lancer</button>'
      +   '<button class="btn ghost" data-role="next" title="suivant">⏭</button>'
      + '</div>'
      + '</div>');

    P.ui = {
      card:   card,
      modes:  card.querySelector('[data-role="modes"]'),
      kr:     card.querySelector('[data-role="kr"]'),
      fr:     card.querySelector('[data-role="fr"]'),
      pos:    card.querySelector('[data-role="pos"]'),
      status: card.querySelector('[data-role="status"]'),
      play:   card.querySelector('[data-role="play"]'),
      prev:   card.querySelector('[data-role="prev"]'),
      next:   card.querySelector('[data-role="next"]'),
      shuf:   card.querySelector('[data-role="shuf"]'),
      twice:  card.querySelector('[data-role="twice"]')
    };

    /* mode initial : « En cours » si non vide, sinon le premier mode non vide */
    P.mode = "cours"; P.shuf = false; P.twice = false;
    if(!filterTracks(P.tracks, P.mode).length){
      for(var j=0; j<MODES.length; j++){
        if(filterTracks(P.tracks, MODES[j].id).length){ P.mode = MODES[j].id; break; }
      }
    }

    /* chips de mode avec compteur de pistes jouables */
    for(var i=0; i<MODES.length; i++){
      (function(m){
        var n = filterTracks(P.tracks, m.id).length;
        var b = el('<button class="chip src" data-mode="'+m.id+'">'+m.label+' ('+n+')</button>');
        b.onclick = function(){
          if(P.mode===m.id) return;
          P.mode = m.id;
          paintModes();
          rebuildQueue(false);
          if(P.playing){ if(P.queue.length) playAt(0); else stop(); }
        };
        P.ui.modes.appendChild(b);
      })(MODES[i]);
    }

    P.ui.shuf.onchange  = function(){ P.shuf = P.ui.shuf.checked; rebuildQueue(true); };
    P.ui.twice.onchange = function(){ P.twice = P.ui.twice.checked; };
    P.ui.play.onclick   = toggle;
    P.ui.prev.onclick   = prev;
    P.ui.next.onclick   = skip;

    paintModes();
    rebuildQueue(false);
    container.appendChild(card);
    return card;
  }

  /* ================= export ================= */
  window.SORI_PLAYER = {
    renderCard: renderCard,
    stop: stop,
    /* pur, testable sans audio (page docs/design/player-test.html) */
    pure: { MODES: MODES, filterTracks: filterTracks },
    /* introspection pour la page de test uniquement */
    _state: P
  };
})();

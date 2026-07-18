/* conversation.js — pratique de CONVERSATION en coréen : micro (STT navigateur) → LLM → voix (TTS).
   Pattern module contractuel : IIFE double environnement, partie pure testable sous Node
   (SORI_CONVERSATION.pure), ZÉRO accès localStorage — la config (fournisseur + clés API)
   entre par opts.cfg, gérée par app.js (clé séparée hors ST : les clés API ne doivent JAMAIS
   partir dans la sauvegarde cloud, même modèle que sori-gh-token).
   Réseau : appels DIRECTS navigateur→API (OpenAI ou Anthropic au choix), aucun serveur.
   Le prompt système (niveau + vocabulaire connu + mots fragiles à recycler) est STABLE sur
   toute la conversation → cache de prompt côté API (Anthropic : cache_control explicite ;
   OpenAI : cache automatique >1024 tokens) → coût ~centimes par conversation. */
(function(root){
  "use strict";

  /* ================= partie pure (testable sous Node) ================= */

  const MODELS = { openai: "gpt-5-mini", anthropic: "claude-haiku-4-5" };
  const MAX_HISTORY = 24;          // messages envoyés au modèle (12 échanges) — borne le coût
  const MAX_REPLY_TOKENS = 1000;   // réponses courtes (1-2 phrases) ; marge pour le raisonnement OpenAI

  /* v89 : scénarios de jeu de rôle — le modèle tient un rôle et OUVRE la conversation.
     Situations utiles pour son voyage (2026-10-01), vocabulaire A2. */
  const SCENARIOS = [
    { id: "resto",  kr: "식당", fr: "Au restaurant",        sys: "Tu joues le SERVEUR d'un restaurant coréen ; l'apprenant est le client. Accueille-le, prends sa commande, propose une boisson. Reste dans ce rôle." },
    { id: "cafe",   kr: "카페", fr: "Au café",              sys: "Tu joues le BARISTA d'un café coréen ; l'apprenant est le client. Prends sa commande : boisson, taille, sur place ou à emporter." },
    { id: "taxi",   kr: "택시", fr: "En taxi",              sys: "Tu joues un CHAUFFEUR DE TAXI coréen ; l'apprenant est le passager. Demande la destination, parle du trajet et du temps, annonce un prix." },
    { id: "hotel",  kr: "호텔", fr: "À l'hôtel",            sys: "Tu joues le RÉCEPTIONNISTE d'un hôtel coréen ; l'apprenant est un voyageur. Enregistrement, questions sur la chambre, le petit-déjeuner, les horaires." },
    { id: "marche", kr: "시장", fr: "Au marché",            sys: "Tu joues un VENDEUR de marché coréen ; l'apprenant est un client. Propose tes produits, donne les prix, négocie gentiment." },
    { id: "ami",    kr: "친구", fr: "Faire connaissance",   sys: "Tu joues un Coréen sympathique que l'apprenant rencontre pour la première fois. Faites connaissance : prénom, ville, travail, loisirs, week-end." },
    { id: "pharma", kr: "약국", fr: "À la pharmacie",       sys: "Tu joues le PHARMACIEN ; l'apprenant est un peu malade (rhume, mal de tête). Demande les symptômes, conseille simplement." },
    { id: "rue",    kr: "길",   fr: "Demander son chemin",  sys: "Tu joues un PASSANT coréen ; l'apprenant cherche son chemin (métro, banque, toilettes…). Donne des directions simples." }
  ];
  function scenarioById(id){ for(const s of SCENARIOS) if(s.id === id) return s; return null; }
  /* 1er message CACHÉ d'une conversation à scénario : l'API exige que ça commence par un tour
     user — celui-ci n'est pas affiché, il fait parler le modèle en premier (le serveur accueille). */
  const BOOTSTRAP = "(Commence la conversation dans ton rôle, en coréen.)";

  /* historique stocké [{r:"u"|"a", c:texte, hid?:1}] → messages API (hid = caché à l'AFFICHAGE seulement) */
  function toApi(h){ return (h || []).map(m => ({ role: m.r === "a" ? "assistant" : "user", content: m.c })); }

  function buildSystem(words, fragiles, scenarioSys){
    words = words || []; fragiles = fragiles || [];
    return [
      "Tu es un partenaire de conversation en coréen pour un apprenant français de niveau A2.",
      "",
      "RÈGLES STRICTES :",
      "- Réponds UNIQUEMENT en coréen (hangul). Jamais de romanisation, de traduction, d'émoji ni de markdown : ta réponse est lue à voix haute par un synthétiseur vocal.",
      "- 1 à 2 phrases COURTES maximum. Grammaire simple de niveau A2 (présent, passé, -(으)ㄹ 거예요, connecteurs de base). Registre poli en -요.",
      "- Utilise en priorité les mots de la liste VOCABULAIRE CONNU ci-dessous (ce sont les mots qu'il connaît). Tu peux les conjuguer et leur ajouter des particules. Évite les mots hors liste, sauf mots très courants indispensables.",
      "- Termine chaque réponse par une question simple pour relancer la conversation.",
      "- S'il fait une erreur de coréen, commence ta réponse en reformulant sa phrase correctement (naturellement, sans commentaire), puis enchaîne.",
      "- S'il écrit en français ou demande de l'aide, explique BRIÈVEMENT en français, puis reviens au coréen.",
      fragiles.length ? "- Quand c'est pertinent, glisse naturellement ces mots dans la conversation (il est en train de les oublier) : " + fragiles.join(", ") : "",
      scenarioSys ? "\nSCÉNARIO : " + scenarioSys : "",
      "",
      "VOCABULAIRE CONNU : " + words.join(" ")
    ].filter(Boolean).join("\n");
  }

  /* v92 (lu dans SES transcriptions réelles : « 기분기분 좋아요 », « 한국어를 ×5 ») : sur Android,
     les segments de reconnaissance se CHEVAUCHENT — l'interim suivant re-contient le final déjà vu,
     et des finals identiques sont re-livrés. Ni l'accumulation (v88) ni la concaténation (v90) ne
     suffisent : il faut FUSIONNER PAR CHEVAUCHEMENT. parts = [base, ...transcripts] dans l'ordre :
     - un segment qui CONTIENT déjà l'accumulé le REMPLACE (interim global) ;
     - un segment déjà entièrement dans l'accumulé est JETÉ (re-livraison) ;
     - sinon on ne colle que la partie NOUVELLE (plus long suffixe de l'accumulé = préfixe du segment).
     Effet assumé : une vraie répétition volontaire (« 네 네 ») est repliée — corrigeable au champ. */
  function sttMerge(parts){
    let acc = "";
    for(let raw of parts || []){
      const t = String(raw || "").replace(/\s+/g, " ").trim();
      if(!t) continue;
      if(!acc){ acc = t; continue; }
      if(t.indexOf(acc) === 0){ acc = t; continue; }          // t re-contient tout l'accumulé
      let ov = Math.min(acc.length, t.length);
      while(ov > 0 && acc.slice(acc.length - ov) !== t.slice(0, ov)) ov--;
      if(ov === t.length) continue;                            // t déjà entièrement dans acc
      acc = ov ? acc + t.slice(ov) : acc + " " + t;
    }
    return acc;
  }

  function trimHistory(h, max){
    max = max || MAX_HISTORY;
    if(!Array.isArray(h) || h.length <= max) return h || [];
    let cut = h.slice(h.length - max);
    while(cut.length && cut[0].role !== "user") cut = cut.slice(1);   // l'API exige de commencer par user
    return cut;
  }

  /* construit la requête HTTP (pur : aucun réseau) — la clé n'apparaît QUE dans les en-têtes */
  function buildRequest(provider, key, system, history){
    if(provider === "anthropic"){
      return {
        url: "https://api.anthropic.com/v1/messages",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          /* opt-in officiel Anthropic pour les appels directs depuis un navigateur —
             la clé vit dans le localStorage du SEUL utilisateur, sur SON appareil */
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: {
          model: MODELS.anthropic,
          max_tokens: MAX_REPLY_TOKENS,
          system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
          messages: history
        }
      };
    }
    return {
      url: "https://api.openai.com/v1/chat/completions",
      headers: {
        "content-type": "application/json",
        "Authorization": "Bearer " + key
      },
      body: {
        model: MODELS.openai,
        /* gpt-5-* : max_tokens est refusé (max_completion_tokens), le raisonnement se règle
           par reasoning_effort — minimal = latence de conversation, pas de réflexion longue */
        max_completion_tokens: MAX_REPLY_TOKENS,
        reasoning_effort: "minimal",
        messages: [{ role: "system", content: system }].concat(history)
      }
    };
  }

  function parseReply(provider, data, status){
    if(!data) return { err: "réponse illisible (HTTP " + (status || "?") + ")" };
    if(provider === "anthropic"){
      if(data.type === "error") return { err: (data.error && data.error.message) || ("erreur API (HTTP " + status + ")") };
      const t = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("").trim();
      return t ? { text: t } : { err: "réponse vide" + (data.stop_reason ? " (" + data.stop_reason + ")" : "") };
    }
    if(data.error) return { err: data.error.message || ("erreur API (HTTP " + status + ")") };
    const m = data.choices && data.choices[0] && data.choices[0].message;
    const t = m && typeof m.content === "string" ? m.content.trim() : "";
    return t ? { text: t } : { err: "réponse vide" };
  }

  /* ================= appel réseau (navigateur ou Node 18+) ================= */
  async function callLLM(provider, key, system, history){
    const r = buildRequest(provider, key, system, trimHistory(history));
    let res;
    try{
      res = await fetch(r.url, { method: "POST", headers: r.headers, body: JSON.stringify(r.body) });
    }catch(e){
      return { err: "réseau indisponible (" + (e && e.message || e) + ")" };
    }
    const data = await res.json().catch(() => null);
    return parseReply(provider, data, res.status);
  }

  /* ================= rendu (navigateur seulement) ================= */

  const SVG_MIC = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/></svg>';
  const SVG_STOP = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
  const SVG_SEND = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h14"/><path d="M13 6l6 6-6 6"/></svg>';

  let cssDone = false;
  function injectCSS(){
    if(cssDone || typeof document === "undefined") return;
    cssDone = true;
    const s = document.createElement("style");
    s.textContent = [
      ".conv-log{display:flex;flex-direction:column;gap:8px;margin:10px 0;max-height:46vh;overflow-y:auto}",
      ".conv-b{max-width:85%;padding:8px 12px;border-radius:10px;line-height:1.45;white-space:pre-wrap;word-break:break-word}",
      ".conv-b.u{align-self:flex-end;background:color-mix(in srgb, var(--acc2) 12%, transparent);border:1px solid color-mix(in srgb, var(--acc2) 30%, transparent)}",
      ".conv-b.a{align-self:flex-start;border:1px solid var(--line);font-family:var(--kr-display, inherit);font-size:1.05rem;cursor:pointer}",
      ".conv-row{display:flex;gap:6px;align-items:center;margin-top:8px}",
      ".conv-row input{flex:1;min-width:0}",
      ".conv-mic{display:inline-flex;align-items:center;justify-content:center;width:40px;height:38px;flex:none}",
      /* v91 : état d'écoute IMPOSSIBLE à rater — bouton plein vermillon qui pulse, icône carré STOP */
      ".conv-mic.rec{background:var(--acc2);color:#fff;border-color:var(--acc2);animation:conv-pulse 1.2s ease-in-out infinite}",
      "@keyframes conv-pulse{50%{box-shadow:0 0 0 6px color-mix(in srgb, var(--acc2) 30%, transparent)}}",
      "@media (prefers-reduced-motion: reduce){.conv-mic.rec{animation:none}}",
      ".conv-status{min-height:1.2em;font-size:.85rem;margin-top:6px}",
      ".conv-head{display:flex;align-items:center;justify-content:space-between;gap:8px}",
      ".conv-head h2{margin:0}",
      ".conv-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}",
      ".conv-item{display:flex;align-items:center;gap:8px;cursor:pointer}",
      ".conv-item .conv-meta{flex:1;min-width:0}",
      ".conv-item .conv-t{font-family:var(--kr-display, inherit)}",
      ".conv-item .conv-del{flex:none}"
    ].join("\n");
    document.head.appendChild(s);
  }
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  /* ===== v89 : écran d'ACCUEIL — conversations enregistrées + nouvelle (scénario ou libre) =====
     opts = { cfg: () => {prov, ok, ak},          // fournisseur + clés, relus à CHAQUE envoi
              words: [kr...], fragiles: [kr...],
              speak: (texte) => void,
              store: { list(), create(scId|null), save(conv), remove(id) },   // app.js ↔ ST.conv
              onExit: () => void }                 // retour à l'onglet Exercices
     conv = { id, t (titre), d/u (dates), sc (id scénario|null), h: [{r:"u"|"a", c, hid?}] } */
  function renderHome(container, opts){
    injectCSS();
    opts = opts || {};
    container.innerHTML = "";
    const box = document.createElement("div");
    box.className = "card";
    box.innerHTML =
      '<div class="conv-head"><h2>Conversations</h2><button class="btn ghost conv-exit">Fermer</button></div>' +
      '<p class="dim">Parle coréen avec un partenaire IA — à ton niveau, avec tes mots. Reprends une conversation ou lances-en une nouvelle.</p>' +
      '<div class="row" style="margin-top:10px"><button class="btn conv-new">Nouvelle conversation</button></div>' +
      '<div class="conv-sc" style="display:none"></div>' +
      '<div class="list conv-list" style="margin-top:12px"></div>' +
      '<p class="dim conv-empty" style="display:none;margin-top:10px">Aucune conversation enregistrée.</p>';
    container.appendChild(box);
    box.querySelector(".conv-exit").onclick = () => { if(opts.onExit) opts.onExit(); };

    /* nouvelle conversation → choix : libre, ou un scénario de jeu de rôle */
    const scBox = box.querySelector(".conv-sc");
    box.querySelector(".conv-new").onclick = () => {
      if(scBox.style.display !== "none"){ scBox.style.display = "none"; return; }
      scBox.style.display = "";
      scBox.innerHTML = '<p class="dim" style="margin-top:10px">Un scénario ? (ou discussion libre)</p><div class="conv-chips"></div>';
      const chips = scBox.querySelector(".conv-chips");
      const mk = (label, sc) => {
        const b = document.createElement("button");
        b.className = "btn ghost"; b.textContent = label;
        b.onclick = () => {
          const conv = opts.store.create(sc ? sc.id : null);
          if(!conv) return;                                  // cap atteint — app.js a affiché pourquoi
          if(sc){ conv.t = sc.kr + " · " + sc.fr; opts.store.save(conv); }
          renderChat(container, opts, conv);
        };
        chips.appendChild(b);
      };
      mk("Libre", null);
      SCENARIOS.forEach(s => mk(s.kr + " · " + s.fr, s));
    };

    /* liste des conversations enregistrées (plus récente d'abord) — reprendre au tap, supprimer au ✕ */
    const lst = box.querySelector(".conv-list");
    const convs = (opts.store.list() || []).slice().sort((a, b) => String(b.u || b.d || "").localeCompare(String(a.u || a.d || "")));
    box.querySelector(".conv-empty").style.display = convs.length ? "none" : "";
    convs.forEach(cv => {
      const row = document.createElement("div");
      row.className = "item conv-item";
      const visible = (cv.h || []).filter(m => !m.hid).length;
      row.innerHTML = '<div class="conv-meta"><div class="conv-t"></div><div class="dim conv-s"></div></div>' +
                      '<button class="btn ghost conv-del" title="Supprimer">✕</button>';
      row.querySelector(".conv-t").textContent = cv.t || "Conversation libre";
      row.querySelector(".conv-s").textContent = (cv.u || cv.d || "") + " · " + visible + " message" + (visible > 1 ? "s" : "");
      row.querySelector(".conv-del").onclick = e => {
        e.stopPropagation();
        if(!root.confirm || confirm("Supprimer « " + (cv.t || "Conversation libre") + " » ?")){
          opts.store.remove(cv.id);
          renderHome(container, opts);
        }
      };
      row.onclick = () => renderChat(container, opts, cv);
      lst.appendChild(row);
    });
  }

  /* ===== écran de DISCUSSION — une conversation persistée (conv.h), reprise comprise ===== */
  function renderChat(container, opts, conv){
    injectCSS();
    opts = opts || {};
    const cfg = typeof opts.cfg === "function" ? opts.cfg : () => ({});
    const sc = conv.sc ? scenarioById(conv.sc) : null;
    const system = buildSystem(opts.words, opts.fragiles, sc ? sc.sys : null);
    conv.h = conv.h || [];

    container.innerHTML = "";
    const box = document.createElement("div");
    box.className = "card";
    box.innerHTML =
      '<div class="conv-head"><h2></h2><button class="btn ghost conv-back">‹ Liste</button></div>' +
      '<div class="conv-log"></div>' +
      '<div class="conv-status dim"></div>' +
      '<div class="conv-row">' +
        '<button class="btn ghost conv-mic" title="Parler (coréen)">' + SVG_MIC + '</button>' +
        '<input type="text" class="conv-in" placeholder="한국어로 말해 보세요…" autocomplete="off">' +
        '<button class="btn conv-send" title="Envoyer">' + SVG_SEND + '</button>' +
      '</div>';
    box.querySelector("h2").textContent = conv.t || "Conversation libre";
    container.appendChild(box);
    box.querySelector(".conv-back").onclick = () => { stopMic(); renderHome(container, opts); };

    const log = box.querySelector(".conv-log");
    const status = box.querySelector(".conv-status");
    const input = box.querySelector(".conv-in");
    const micBtn = box.querySelector(".conv-mic");
    const sendBtn = box.querySelector(".conv-send");

    /* v91 : TOUTE sortie vocale coupe d'abord le micro — sinon la voix de synthèse est
       transcrite dans le champ (l'user a vu l'app « écouter la réponse faite »). */
    function say(t){ stopMic(); if(opts.speak) opts.speak(t); }
    function bubble(role, text){
      const b = document.createElement("div");
      b.className = "conv-b " + (role === "user" ? "u" : "a");
      b.textContent = text;
      if(role === "assistant") b.onclick = () => say(text);   // re-écouter au tap
      log.appendChild(b);
      log.scrollTop = log.scrollHeight;
    }
    /* reprise : rejouer les bulles depuis l'historique persistant (les amorces hid restent cachées) */
    conv.h.forEach(m => { if(!m.hid) bubble(m.r === "a" ? "assistant" : "user", m.c); });

    /* v87 : UNE seule résolution fournisseur→clé, avec LE MÊME défaut (anthropic) partout —
       le bug réel : send() prenait anthropic par défaut mais keyFor prenait la clé OpenAI
       quand prov n'était pas défini (sélecteur jamais touché) → « ajoute ta clé » à tort
       alors que la clé Anthropic était bien là. */
    function provOf(c){ return c.prov === "openai" ? "openai" : "anthropic"; }
    function keyFor(c){ return provOf(c) === "openai" ? c.ok : c.ak; }

    let busy = false;
    /* un ÉCHANGE : appelle le LLM sur conv.h (persistant), affiche + prononce la réponse, sauvegarde.
       Utilisé par send() ET par l'amorce de scénario (le modèle parle en premier). */
    async function exchange(){
      /* défaut = anthropic : SEUL fournisseur qui autorise les appels directs depuis un navigateur
         (vérifié : api.openai.com n'envoie pas les en-têtes CORS — le chemin OpenAI reste dans le
         code pour un éventuel proxy futur, mais ne peut pas marcher depuis la PWA). */
      const c = cfg();
      const prov = provOf(c);
      const key = keyFor(c);
      if(!key){ status.textContent = "Ajoute ta clé API (" + prov + ") dans Réglages → Conversation."; return false; }
      busy = true; sendBtn.disabled = true;
      status.textContent = "…";
      const r = await callLLM(prov, key, system, toApi(conv.h));
      busy = false; sendBtn.disabled = false;
      if(r.err){
        status.textContent = "Erreur : " + r.err +
          (prov === "openai" && r.err.indexOf("réseau") === 0
            ? " — OpenAI bloque les appels depuis un navigateur ; choisis Anthropic dans Réglages."
            : "");
        return false;
      }
      status.textContent = "";
      conv.h.push({ r: "a", c: r.text });
      opts.store.save(conv);
      bubble("assistant", r.text);
      say(r.text);
      return true;
    }
    async function send(){
      const txt = input.value.trim();
      if(!txt || busy) return;
      stopMic();          // v91 : l'ENVOI arrête TOUJOURS le micro (demande user) — et stopMic
                          // débranche onresult : aucun résultat tardif ne re-remplira le champ
      input.value = "";
      bubble("user", txt);
      conv.h.push({ r: "u", c: txt });
      if(!conv.t) conv.t = txt.length > 24 ? txt.slice(0, 24) + "…" : txt;   // titre = 1re phrase (libre)
      opts.store.save(conv);
      const ok = await exchange();
      if(!ok){
        conv.h.pop();                                    // l'échange n'a pas eu lieu — historique cohérent
        opts.store.save(conv);
        log.removeChild(log.lastChild);                  // retire la bulle user orpheline
        input.value = txt;                               // la phrase n'est pas perdue
      }
    }
    sendBtn.onclick = send;
    input.onkeydown = e => { if(e.key === "Enter") send(); };
    /* scénario tout neuf : amorce CACHÉE (l'API veut un tour user en premier) → le modèle ouvre
       la conversation dans son rôle (le serveur accueille, le chauffeur demande la destination…) */
    if(sc && conv.h.length === 0){
      conv.h.push({ r: "u", c: BOOTSTRAP, hid: 1 });
      exchange().then(ok => { if(!ok){ conv.h.pop(); opts.store.save(conv); } });
    }

    /* ===== STT — Web Speech API (ko-KR), gratuite, intégrée au navigateur =====
       Le texte reconnu va dans le champ : l'utilisateur VALIDE avant l'envoi
       (voir ce que le micro a compris = retour sur la prononciation). */
    const SR = root.SpeechRecognition || root.webkitSpeechRecognition;
    let rec = null, listening = false;
    /* v91 : arrêt NET — débranche les handlers (un résultat tardif ne réécrira pas le champ),
       stoppe la reco, restaure l'icône micro. Appelé par : 2e tap, ENVOI, toute voix (say), retour liste. */
    function stopMic(){
      listening = false;
      micBtn.classList.remove("rec");
      micBtn.innerHTML = SVG_MIC;
      if(rec){ try{ rec.onresult = null; rec.onend = null; rec.onerror = null; rec.stop(); }catch(e){} rec = null; }
    }
    /* v84 : « not-allowed » sans explication = impasse. Invite de permission forcée via getUserMedia —
       sur une PWA installée (WebAPK Android), SpeechRecognition ne déclenche pas toujours l'invite lui-même.
       v85 (retour user réel) : dans l'app installée il n'y a NI cadenas NI barre d'adresse, et « Infos de
       l'appli » ne liste souvent PAS le micro pour une WebAPK — la permission du SITE se gère dans CHROME
       et l'app installée en hérite. Le message donne CE chemin-là. */
    const MSG_DENIED = "Micro bloqué. Dans CHROME : menu ⋮ → Paramètres → Paramètres des sites → Micro → touche mnafati-cloud.github.io dans « Bloqués » → Autoriser, puis relance Sori. (S'il n'y est pas : ouvre le site dans un onglet Chrome et autorise le micro là-bas — l'appli installée hérite du choix.) En attendant, écris ta phrase au clavier.";
    const SR_ERRS = {
      "no-speech": "Je n'ai rien entendu — réessaie.",
      "not-allowed": MSG_DENIED,
      "service-not-allowed": MSG_DENIED,
      "audio-capture": "Aucun micro détecté sur cet appareil.",
      "network": "Réseau indisponible pour la reconnaissance vocale — réessaie connecté."
    };
    if(!SR){
      micBtn.disabled = true;
      micBtn.title = "Reconnaissance vocale indisponible dans ce navigateur — écris ta phrase.";
    } else {
      micBtn.onclick = async () => {
        if(listening){
          stopMic();
          if(input.value) status.textContent = "Vérifie la phrase, corrige si besoin, puis envoie.";
          input.focus();
          return;
        }
        /* 1. refus déjà mémorisé ? → inutile de réessayer, guider vers les réglages */
        try{
          if(navigator.permissions && navigator.permissions.query){
            const p = await navigator.permissions.query({ name: "microphone" }).catch(() => null);
            if(p && p.state === "denied"){ status.textContent = MSG_DENIED; return; }
          }
        }catch(e){}
        /* 2. forcer l'INVITE de permission (fiable même en WebAPK), puis relâcher le flux */
        try{
          if(navigator.mediaDevices && navigator.mediaDevices.getUserMedia){
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(t => t.stop());   // on ne voulait que la permission
          }
        }catch(e){ status.textContent = MSG_DENIED; return; }
        /* v88/v90 : continuous = true + relance auto (Android coupe à la moindre pause — fatal pour
           un apprenant qui parle lentement) : c'est l'USER qui arrête (2e tap sur le micro).
           sttFold RECONSTRUIT le texte de la session depuis la liste complète (cf. commentaire de la
           fonction — les finals re-livrés par Android ne se dupliquent plus) ; sessionBase = le texte
           d'avant la session en cours (déjà tapé/corrigé, ou sessions d'avant la relance auto). */
        let sessionBase = input.value.trim();
        rec = new SR();
        rec.lang = "ko-KR";
        rec.interimResults = true;
        rec.continuous = true;
        rec.onresult = ev => {
          const parts = [sessionBase];
          for(let i = 0; i < ev.results.length; i++) parts.push(ev.results[i][0].transcript);
          input.value = sttMerge(parts);
        };
        rec.onerror = ev => {
          if(ev.error === "no-speech" && listening) return;           // silence → la relance auto s'en charge
          if(ev.error === "not-allowed" || ev.error === "service-not-allowed" || ev.error === "audio-capture") listening = false;
          status.textContent = SR_ERRS[ev.error] || ("Micro : " + ev.error);
        };
        rec.onend = () => {
          if(listening){
            sessionBase = input.value.trim();                          // fige la session écoulée
            try{ rec.start(); return; }catch(e){ listening = false; }  // relance tant que l'user n'a pas retapé
          }
          micBtn.classList.remove("rec");
          micBtn.innerHTML = SVG_MIC;
          if(input.value) status.textContent = "Vérifie la phrase, corrige si besoin, puis envoie.";
          input.focus();
        };
        try{
          rec.start(); listening = true;
          micBtn.classList.add("rec");
          micBtn.innerHTML = SVG_STOP;    // v91 : l'état d'écoute se voit — carré STOP sur fond vermillon
          status.textContent = "J'écoute… parle, prends ton temps. Touche le carré (ou envoie) pour arrêter.";
        }catch(e){ status.textContent = "Micro indisponible."; }
      };
    }
  }

  const API = {
    renderHome, renderChat,
    callLLM,
    pure: { buildSystem, trimHistory, buildRequest, parseReply, sttMerge, toApi, scenarioById,
            SCENARIOS, BOOTSTRAP, MODELS, MAX_HISTORY }
  };
  if(typeof module !== "undefined" && module.exports) module.exports = API;
  else root.SORI_CONVERSATION = API;
})(typeof self !== "undefined" ? self : this);

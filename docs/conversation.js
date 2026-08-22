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

  /* gemini : ALIAS volontaire — les modèles datés se ferment aux nouveaux comptes
     (2.5-flash → 404, 2.0-flash → quota gratuit 0, constatés le 2026-07-18) ; l'alias suit la gamme. */
  const MODELS = { openai: "gpt-5-mini", anthropic: "claude-haiku-4-5", gemini: "gemini-flash-latest" };
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

  /* v96 : date courte à la française pour la liste (« 18 juil. ») */
  const FR_MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  function frDate(iso){
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
    return m ? (+m[3]) + " " + FR_MONTHS[(+m[2]) - 1] : String(iso || "");
  }

  /* v100 : prompt en DEUX blocs — { base, extra }.
     base  = règles + VOCABULAIRE : STABLE, identique pour TOUTES les conversations du moment
             (quel que soit le scénario) → UNE entrée de cache partagée, TTL réglable jusqu'à 1 h.
     extra = fragiles du jour + scénario : VARIABLE, placé APRÈS le point de cache → le faire
             bouger (révision, changement de scénario) n'invalide plus le gros préfixe. */
  function buildSystem(words, fragiles, scenarioSys){
    words = words || []; fragiles = fragiles || [];
    const base = [
      "Tu es un partenaire de conversation en coréen pour un apprenant français de niveau A2.",
      "",
      "RÈGLES STRICTES :",
      "- Réponds UNIQUEMENT en coréen (hangul). Jamais de romanisation, de traduction, d'émoji ni de markdown : ta réponse est lue à voix haute par un synthétiseur vocal.",
      "- 1 à 2 phrases COURTES maximum. Grammaire simple de niveau A2 (présent, passé, -(으)ㄹ 거예요, connecteurs de base). Registre poli en -요.",
      "- Utilise en priorité les mots de la liste VOCABULAIRE CONNU ci-dessous (ce sont les mots qu'il connaît). Tu peux les conjuguer et leur ajouter des particules. Évite les mots hors liste, sauf mots très courants indispensables.",
      "- Termine chaque réponse par une question simple pour relancer la conversation.",
      "- S'il fait une erreur de coréen, commence ta réponse en reformulant sa phrase correctement (naturellement, sans commentaire), puis enchaîne.",
      "- S'il écrit en français ou demande de l'aide, explique BRIÈVEMENT en français, puis reviens au coréen.",
      "",
      "VOCABULAIRE CONNU : " + words.join(" ")
    ].join("\n");
    const extra = [
      fragiles.length ? "Quand c'est pertinent, glisse naturellement ces mots dans la conversation (il est en train de les oublier) : " + fragiles.join(", ") : "",
      scenarioSys ? "SCÉNARIO : " + scenarioSys : ""
    ].filter(Boolean).join("\n\n");
    return { base, extra };
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

  /* ===== v93 : STT par Gemini — transcription PROMPTÉE (le levier que la Web Speech API n'a pas) =====
     On envoie l'audio AVEC le contexte : niveau, vocabulaire connu, derniers échanges → le modèle
     sait que « 배워요 » est probable et « 미워요 » non. La clé passe en EN-TÊTE, jamais dans l'URL. */
  function buildSttRequest(key, mime, b64, ctx){
    ctx = ctx || {};
    const lines = [
      "Transcris fidèlement en hangul ce que dit ce locuteur : un Français de niveau A2 qui parle CORÉEN avec un accent français, lentement, avec des hésitations.",
      "Réponds UNIQUEMENT avec la transcription en hangul (pas de romanisation, pas de commentaire, pas de ponctuation finale superflue).",
      "S'il ne parle pas coréen ou si l'audio est vide, réponds une chaîne vide.",
      (ctx.recent && ctx.recent.length) ? "Contexte — derniers échanges de la conversation :\n" + ctx.recent.map(m => (m.r === "a" ? "Partenaire : " : "Apprenant : ") + m.c).join("\n") : "",
      (ctx.words && ctx.words.length) ? "Mots que l'apprenant connaît (il utilise très probablement ceux-là) : " + ctx.words.join(" ") : ""
    ].filter(Boolean).join("\n\n");
    return {
      url: "https://generativelanguage.googleapis.com/v1beta/models/" + MODELS.gemini + ":generateContent",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: { contents: [{ parts: [{ text: lines }, { inline_data: { mime_type: mime, data: b64 } }] }] }
    };
  }
  function parseSttReply(data, status){
    if(!data) return { err: "réponse illisible (HTTP " + (status || "?") + ")" };
    if(data.error) return { err: (data.error.status === "RESOURCE_EXHAUSTED" ? "quota Gemini atteint — réessaie dans une minute" : (data.error.message || "erreur Gemini").slice(0, 120)) };
    const c = data.candidates && data.candidates[0];
    const t = c && c.content && c.content.parts ? c.content.parts.map(p => p.text || "").join("").trim() : "";
    return { text: t };   // vide = rien reconnu (pas une erreur)
  }

  /* ===== v93 : mot-à-mot ASYNCHRONE (demande user) — un petit appel séparé par réponse ===== */
  const GLOSS_SYSTEM = "Tu es un glossateur coréen→français pour un apprenant A2. Réponds UNIQUEMENT en JSON strict, sans texte autour.";
  function glossPrompt(sentence){
    return "Traduis MOT À MOT cette phrase coréenne (chaque mot/bloc avec sa glose française courte, particules et conjugaison comprises dans la glose). " +
           'Format STRICT : [["mot","glose"],["mot","glose"]]\n\nPhrase : ' + sentence;
  }
  function parseGloss(text){
    if(!text) return null;
    const m = String(text).replace(/```json|```/g, "").trim();
    try{
      const a = JSON.parse(m);
      if(!Array.isArray(a) || !a.length) return null;
      const out = [];
      for(const p of a){
        if(!Array.isArray(p) || p.length < 2 || typeof p[0] !== "string" || typeof p[1] !== "string") return null;
        out.push([p[0], p[1]]);
      }
      return out;
    }catch(e){ return null; }
  }

  function trimHistory(h, max){
    max = max || MAX_HISTORY;
    if(!Array.isArray(h) || h.length <= max) return h || [];
    let cut = h.slice(h.length - max);
    while(cut.length && cut[0].role !== "user") cut = cut.slice(1);   // l'API exige de commencer par user
    return cut;
  }

  /* construit la requête HTTP (pur : aucun réseau) — la clé n'apparaît QUE dans les en-têtes.
     system = chaîne (petits appels : glose) OU { base, extra } (conversation).
     o.ttl1h : cache Anthropic d'UNE HEURE (écriture ×2, lectures ×0,1) au lieu de 5 min (×1,25) —
     rentable dès qu'une 2e conversation/reprise/pause tombe dans l'heure (la base est partagée). */
  function buildRequest(provider, key, system, history, o){
    o = o || {};
    const sys = (typeof system === "string") ? { base: system, extra: "" } : system;
    if(provider === "anthropic"){
      const cc = { type: "ephemeral" };
      if(o.ttl1h) cc.ttl = "1h";
      const blocks = [{ type: "text", text: sys.base, cache_control: cc }];
      if(sys.extra) blocks.push({ type: "text", text: sys.extra });   // APRÈS le point de cache
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
          system: blocks,
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
        messages: [{ role: "system", content: sys.extra ? sys.base + "\n\n" + sys.extra : sys.base }].concat(history)
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

  /* ================= appel réseau (navigateur ou Node 18+) =================
     v94 : DÉLAI MAXIMAL 25 s sur tout appel — un réseau qui rame devient une erreur affichée,
     jamais un silence ambigu (retour user : impossible de distinguer attente et panne). */
  const CALL_TIMEOUT_MS = 25000;
  async function timedFetch(url, init){
    const ctl = (typeof AbortController !== "undefined") ? new AbortController() : null;
    const tm = ctl ? setTimeout(() => ctl.abort(), CALL_TIMEOUT_MS) : null;
    if(ctl) init.signal = ctl.signal;
    try{ return await fetch(url, init); }
    finally{ if(tm) clearTimeout(tm); }
  }
  function fetchErr(e){
    return (e && e.name === "AbortError") ? "délai dépassé (25 s) — réseau lent ? réessaie"
                                          : "réseau indisponible (" + (e && e.message || e) + ")";
  }
  async function callLLM(provider, key, system, history, o){
    const r = buildRequest(provider, key, system, trimHistory(history), o);
    let res;
    try{
      res = await timedFetch(r.url, { method: "POST", headers: r.headers, body: JSON.stringify(r.body) });
    }catch(e){
      return { err: fetchErr(e) };
    }
    const data = await res.json().catch(() => null);
    return parseReply(provider, data, res.status);
  }
  async function callStt(key, mime, b64, ctx){
    const r = buildSttRequest(key, mime, b64, ctx);
    let res;
    try{ res = await timedFetch(r.url, { method: "POST", headers: r.headers, body: JSON.stringify(r.body) }); }
    catch(e){ return { err: fetchErr(e) }; }
    const data = await res.json().catch(() => null);
    return parseSttReply(data, res.status);
  }
  async function callGloss(provider, key, sentence){
    const r = await callLLM(provider, key, GLOSS_SYSTEM, [{ role: "user", content: glossPrompt(sentence) }]);
    return r.err ? null : parseGloss(r.text);
  }

  /* ================= rendu (navigateur seulement) ================= */

  const SVG_MIC = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/></svg>';
  const SVG_STOP = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
  const SVG_SEND = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h14"/><path d="M13 6l6 6-6 6"/></svg>';
  const SVG_SPK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>';

  /* v101 : dimensionnement de l'écran de discussion — la carte occupe tout l'espace entre sa
     position et la barre d'onglets, recalculé au resize (clavier Android compris). */
  let chatSizer = null;
  function unbindChatSizer(){ if(chatSizer){ try{ root.removeEventListener("resize", chatSizer); }catch(e){} chatSizer = null; } }

  let cssDone = false;
  function injectCSS(){
    if(cssDone || typeof document === "undefined") return;
    cssDone = true;
    const s = document.createElement("style");
    s.textContent = [
      /* ===== v96 : passe de design — maquette « Encre & sceau » validée (artifact 0d9f77c0) ===== */
      /* en-têtes d'écran : hangul d'affiche + libellé discret */
      ".conv-head{display:flex;align-items:center;gap:10px;margin-bottom:2px}",
      ".conv-head .kr-big{font-family:var(--kr-display, inherit);font-size:1.5rem;line-height:1.1}",
      ".conv-head .lbl{font-size:.8rem;color:var(--dim)}",
      ".conv-x{margin-left:auto;flex:none}",
      ".conv-back{flex:none;padding:4px 12px}",
      ".conv-sect{font-size:.72rem;text-transform:uppercase;letter-spacing:.1em;color:var(--dim);padding:14px 2px 8px;border-top:1px solid var(--line);margin-top:12px}",
      ".conv-sect.first{border-top:none;margin-top:6px}",
      /* tuiles scénarios, visibles d'entrée (langage des modes de Nombres) */
      ".conv-tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}",
      ".conv-tile{border:1px solid var(--line);border-radius:10px;padding:10px 6px 8px;text-align:center;cursor:pointer;background:none;color:inherit;font:inherit}",
      ".conv-tile .h{font-family:var(--kr-display, inherit);font-size:1.25rem;line-height:1.3}",
      ".conv-tile .f{font-size:.66rem;color:var(--dim);margin-top:2px}",
      ".conv-tile.libre{border-style:dashed}",
      ".conv-tile.libre .h{color:var(--acc)}",
      /* liste « Reprendre » en registre : ancre hangul du scénario */
      ".conv-item{display:flex;align-items:center;gap:12px;cursor:pointer}",
      ".conv-item .anchor{font-family:var(--kr-display, inherit);font-size:1.3rem;width:44px;text-align:center;flex:none}",
      ".conv-item .conv-meta{flex:1;min-width:0}",
      ".conv-item .conv-t{font-size:.95rem}",
      ".conv-item .conv-s{font-size:.76rem}",
      ".conv-item .conv-del{flex:none}",
      /* fil de discussion — v101 : l'écran de discussion est une COLONNE PLEINE HAUTEUR (maquette) :
         le fil grandit, la barre de saisie est ANCRÉE EN BAS de l'écran, au-dessus des onglets */
      ".conv-chat{display:flex;flex-direction:column}",
      ".conv-chat .conv-head{flex:none}",
      ".conv-chat .conv-status,.conv-chat .conv-row{flex:none}",
      ".conv-log{display:flex;flex-direction:column;gap:10px;margin:10px 0;flex:1;min-height:0;overflow-y:auto}",
      ".conv-b{max-width:85%;padding:10px 13px;border-radius:12px;line-height:1.5;white-space:pre-wrap;word-break:break-word}",
      ".conv-b.u{align-self:flex-end;background:color-mix(in srgb, var(--acc2) 10%, transparent);border:1px solid color-mix(in srgb, var(--acc2) 35%, transparent)}",
      ".conv-b.a{align-self:flex-start;border:1px solid var(--line);background:color-mix(in srgb, var(--line) 22%, transparent);font-family:var(--kr-display, inherit);font-size:1.08rem;cursor:pointer}",
      ".conv-spk{display:inline-block;margin-left:8px;opacity:.5;vertical-align:-2px}",
      /* barre de saisie : zone qui grandit (v95), gros boutons RONDS, micro = bouton principal à droite */
      ".conv-row{display:flex;gap:8px;align-items:flex-end;margin-top:8px}",
      ".conv-row .conv-in{flex:1;min-width:0;font:inherit;line-height:1.45;color:inherit;background:none;",
      "  border:1px solid var(--line);border-radius:22px;padding:11px 14px;resize:none;overflow-y:auto;max-height:7.6em}",
      ".conv-send{width:44px;height:44px;border-radius:50%;padding:0;display:inline-flex;align-items:center;justify-content:center;flex:none}",
      ".conv-mic{width:52px;height:52px;border-radius:50%;padding:0;display:inline-flex;align-items:center;justify-content:center;flex:none;border-color:var(--acc2);color:var(--acc2)}",
      /* v91 : état d'écoute impossible à rater — plein vermillon pulsant, carré STOP */
      ".conv-mic.rec{background:var(--acc2);color:#fff;animation:conv-pulse 1.2s ease-in-out infinite}",
      "@keyframes conv-pulse{50%{box-shadow:0 0 0 8px color-mix(in srgb, var(--acc2) 25%, transparent)}}",
      "@media (prefers-reduced-motion: reduce){.conv-mic.rec{animation:none}}",
      ".conv-status{min-height:1.2em;font-size:.82rem;margin-top:6px}",
      ".conv-state{color:var(--acc2)}",
      ".conv-state::before{content:\"\";display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--acc2);margin-right:6px;vertical-align:1px}",
      /* v93 : mot-à-mot sous la bulle (registre des révisions) */
      ".conv-gl-t{font-size:.72rem;color:var(--dim);margin-top:7px;letter-spacing:.04em;cursor:pointer}",
      ".conv-gl{margin-top:5px;border-top:1px solid var(--line);padding-top:5px}",
      ".conv-gl-r{display:flex;gap:10px;padding:2px 0;font-size:.85rem}",
      ".conv-gl-r .gk{font-family:var(--kr-display, inherit);min-width:5.5em}",
      ".conv-gl-r .gf{color:var(--dim)}",
      /* v94 : l'ATTENTE se voit — points animés sur tout appel en cours */
      ".conv-wait::after{content:\"…\";display:inline-block;width:1.2em;text-align:left;animation:convdots 1.2s steps(4,end) infinite}",
      "@keyframes convdots{0%{content:\"\"}25%{content:\".\"}50%{content:\"..\"}75%{content:\"...\"}}",
      "@media (prefers-reduced-motion: reduce){.conv-wait::after{animation:none;content:\"…\"}}",
      ".conv-gl-p{cursor:default;opacity:.7}"
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
    unbindChatSizer();
    opts = opts || {};
    container.innerHTML = "";
    const box = document.createElement("div");
    box.className = "card";
    box.innerHTML =
      '<div class="conv-head"><span class="kr-big">대화</span><span class="lbl">Conversations</span><button class="btn ghost conv-x">✕</button></div>' +
      '<div class="conv-sect first">Nouvelle</div>' +
      '<div class="conv-tiles"></div>' +
      '<div class="conv-sect conv-rep" style="display:none">Reprendre</div>' +
      '<div class="list conv-list"></div>';
    container.appendChild(box);
    box.querySelector(".conv-x").onclick = () => { if(opts.onExit) opts.onExit(); };

    /* tuiles VISIBLES D'ENTRÉE (maquette) : Libre en pointillés céladon + 8 scénarios hangul */
    const tiles = box.querySelector(".conv-tiles");
    const mkTile = (h, f, sc, cls) => {
      const b = document.createElement("button");
      b.className = "conv-tile" + (cls ? " " + cls : "");
      const eh = document.createElement("div"); eh.className = "h"; eh.textContent = h;
      const ef = document.createElement("div"); ef.className = "f"; ef.textContent = f;
      b.appendChild(eh); b.appendChild(ef);
      b.onclick = () => {
        const conv = opts.store.create(sc ? sc.id : null);
        if(!conv) return;                                  // cap atteint — app.js a affiché pourquoi
        if(sc){ conv.t = sc.kr + " · " + sc.fr; opts.store.save(conv); }
        renderChat(container, opts, conv);
      };
      tiles.appendChild(b);
    };
    mkTile("자유", "Libre", null, "libre");
    SCENARIOS.forEach(s => mkTile(s.kr, s.fr, s));

    /* « Reprendre » : registre avec ancre hangul, plus récente d'abord — tap = reprendre, ✕ = supprimer */
    const lst = box.querySelector(".conv-list");
    const convs = (opts.store.list() || []).slice().sort((a, b) => String(b.u || b.d || "").localeCompare(String(a.u || a.d || "")));
    if(convs.length) box.querySelector(".conv-rep").style.display = "";
    convs.forEach(cv => {
      const row = document.createElement("div");
      row.className = "item conv-item";
      const s = cv.sc ? scenarioById(cv.sc) : null;
      const visible = (cv.h || []).filter(m => !m.hid).length;
      row.innerHTML = '<span class="anchor"></span>' +
                      '<div class="conv-meta"><div class="conv-t"></div><div class="dim conv-s"></div></div>' +
                      '<button class="btn ghost conv-del" title="Supprimer">✕</button>';
      row.querySelector(".anchor").textContent = s ? s.kr : "—";
      row.querySelector(".conv-t").textContent = s ? s.fr : (cv.t || "Conversation libre");
      row.querySelector(".conv-s").textContent = frDate(cv.u || cv.d) + " · " + visible + " message" + (visible > 1 ? "s" : "");
      row.querySelector(".conv-del").onclick = e => {
        e.stopPropagation();
        if(!root.confirm || confirm("Supprimer « " + (s ? s.fr : (cv.t || "Conversation libre")) + " » ?")){
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
    box.className = "card conv-chat";
    box.innerHTML =
      '<div class="conv-head"><button class="btn ghost conv-back">‹</button>' +
        '<span class="kr-big conv-anchor"></span><span class="lbl conv-sub"></span></div>' +
      '<div class="conv-log"></div>' +
      '<div class="conv-status dim"></div>' +
      '<div class="conv-row">' +
        '<textarea class="conv-in" rows="1" placeholder="한국어로…" autocomplete="off"></textarea>' +
        '<button class="btn ghost conv-send" title="Envoyer">' + SVG_SEND + '</button>' +
        '<button class="btn ghost conv-mic" title="Parler (coréen)">' + SVG_MIC + '</button>' +
      '</div>';
    /* en-tête maquette : ancre hangul du scénario + libellé FR ; libre = titre seul */
    box.querySelector(".conv-anchor").textContent = sc ? sc.kr : "";
    box.querySelector(".conv-sub").textContent = sc ? sc.fr : (conv.t || "Conversation libre");
    container.appendChild(box);
    box.querySelector(".conv-back").onclick = () => { stopMic(); renderHome(container, opts); };
    /* v101 : la carte remplit l'écran jusqu'aux onglets → la barre de saisie est EN BAS (maquette) ;
       recalcul au resize (clavier Android) avec re-collage du fil en bas */
    unbindChatSizer();
    const sizeChat = () => {
      if(!box.isConnected){ unbindChatSizer(); return; }
      const top = box.getBoundingClientRect().top;
      const tabs = document.getElementById("tabs");
      const limit = tabs ? tabs.getBoundingClientRect().top : (root.innerHeight || 600);
      box.style.height = Math.max(320, limit - top - 12) + "px";
      const lg = box.querySelector(".conv-log");
      if(lg) lg.scrollTop = lg.scrollHeight;
    };
    chatSizer = sizeChat;
    root.addEventListener("resize", sizeChat);
    sizeChat();

    const log = box.querySelector(".conv-log");
    const status = box.querySelector(".conv-status");
    const input = box.querySelector(".conv-in");
    const micBtn = box.querySelector(".conv-mic");
    const sendBtn = box.querySelector(".conv-send");
    /* v95 : la zone grandit avec son contenu (à appeler aussi après tout remplissage par code) */
    const autosize = () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 160) + "px"; };
    input.addEventListener("input", autosize);

    /* v91 : TOUTE sortie vocale coupe d'abord le micro — sinon la voix de synthèse est
       transcrite dans le champ (l'user a vu l'app « écouter la réponse faite »). */
    function say(t){ stopMic(); if(opts.speak) opts.speak(t); }
    /* v93 : mot-à-mot dépliable sous la bulle (même registre que le « Mot à mot » des révisions) */
    function attachGloss(b, pairs){
      if(!pairs || !pairs.length || b.querySelector(".conv-gl-t")) return;
      const t = document.createElement("div");
      t.className = "conv-gl-t";
      t.textContent = "mot à mot";
      const gl = document.createElement("div");
      gl.className = "conv-gl";
      gl.style.display = "none";
      pairs.forEach(p => {
        const row = document.createElement("div");
        row.className = "conv-gl-r";
        const k = document.createElement("span"); k.className = "gk"; k.textContent = p[0];
        const f = document.createElement("span"); f.className = "gf"; f.textContent = p[1];
        row.appendChild(k); row.appendChild(f); gl.appendChild(row);
      });
      t.onclick = e => {
        e.stopPropagation();
        gl.style.display = gl.style.display === "none" ? "" : "none";
        /* v101 : le dépliage amène le contenu EN VUE (avant : ouvert hors-champ en bas du fil) */
        if(gl.style.display !== "none") gl.scrollIntoView({ block: "nearest", behavior: "smooth" });
      };
      b.appendChild(t); b.appendChild(gl);
    }
    function bubble(role, text, pairs){
      const b = document.createElement("div");
      b.className = "conv-b " + (role === "user" ? "u" : "a");
      b.textContent = text;
      if(role === "assistant"){
        /* v96 : la ré-écoute se VOIT — petit haut-parleur accroché à la bulle (toute la bulle reste tapable) */
        const sp = document.createElement("span");
        sp.className = "conv-spk";
        sp.innerHTML = SVG_SPK;
        b.appendChild(sp);
        b.onclick = () => say(text);
        attachGloss(b, pairs);
      }
      log.appendChild(b);
      log.scrollTop = log.scrollHeight;
      return b;
    }
    /* v94 : indicateur d'attente animé — l'user DOIT pouvoir distinguer « en cours » et « rien » */
    function showWait(label){
      status.textContent = "";
      const s = document.createElement("span");
      s.className = "conv-wait";
      s.textContent = label;
      status.appendChild(s);
    }
    /* v96 : état d'écoute maquette — pastille vermillon + « En écoute » */
    function showListen(){
      status.textContent = "";
      const s = document.createElement("span");
      s.className = "conv-state";
      s.textContent = "En écoute";
      status.appendChild(s);
    }
    /* mot-à-mot asynchrone : appel SÉPARÉ après la réponse — la conversation n'attend jamais dessus,
       le résultat est stocké avec le message (la reprise n'a rien à re-demander).
       v94 : un « mot à mot… » en pointillés s'affiche PENDANT le chargement ; il devient dépliable
       au succès, disparaît à l'échec — l'attente et la panne ne se ressemblent plus. */
    function glossify(msg, b){
      const c = cfg();
      if(c.gl === false || msg.gl) return;      // toggle OFF = AUCUN appel
      const key = keyFor(c);
      if(!key) return;
      const p = document.createElement("div");
      p.className = "conv-gl-t conv-gl-p conv-wait";
      p.textContent = "mot à mot";
      b.appendChild(p);
      callGloss(provOf(c), key, msg.c).then(pairs => {
        p.remove();
        if(!pairs) return;
        msg.gl = pairs;
        opts.store.save(conv);
        attachGloss(b, pairs);
      }).catch(() => { p.remove(); });
    }
    /* reprise : rejouer les bulles depuis l'historique persistant (amorces hid cachées, gloses stockées) */
    conv.h.forEach(m => { if(!m.hid) bubble(m.r === "a" ? "assistant" : "user", m.c, m.gl); });

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
      showWait("Réponse");
      const r = await callLLM(prov, key, system, toApi(conv.h), { ttl1h: c.ttl5 !== true });   // v100 : 1 h par défaut
      busy = false; sendBtn.disabled = false;
      if(r.err){
        status.textContent = "Erreur : " + r.err +
          (prov === "openai" && r.err.indexOf("réseau") === 0
            ? " — OpenAI bloque les appels depuis un navigateur ; choisis Anthropic dans Réglages."
            : "");
        return false;
      }
      status.textContent = "";
      const msg = { r: "a", c: r.text };
      conv.h.push(msg);
      opts.store.save(conv);
      const b = bubble("assistant", r.text);
      say(r.text);
      glossify(msg, b);   // v93 : mot-à-mot en arrière-plan, jamais bloquant
      return true;
    }
    async function send(){
      const txt = input.value.trim();
      if(!txt || busy) return;
      stopMic();          // v91 : l'ENVOI arrête TOUJOURS le micro (demande user) — et stopMic
                          // débranche onresult : aucun résultat tardif ne re-remplira le champ
      input.value = ""; autosize();
      bubble("user", txt);
      conv.h.push({ r: "u", c: txt });
      if(!conv.t) conv.t = txt.length > 24 ? txt.slice(0, 24) + "…" : txt;   // titre = 1re phrase (libre)
      opts.store.save(conv);
      const ok = await exchange();
      if(!ok){
        conv.h.pop();                                    // l'échange n'a pas eu lieu — historique cohérent
        opts.store.save(conv);
        log.removeChild(log.lastChild);                  // retire la bulle user orpheline
        input.value = txt; autosize();                   // la phrase n'est pas perdue
      }
    }
    sendBtn.onclick = send;
    input.onkeydown = e => { if(e.key === "Enter" && !e.shiftKey){ e.preventDefault(); send(); } };   // Maj+Entrée = retour à la ligne
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
    let mrec = null, mstream = null;   // v93 : enregistreur du chemin Gemini
    /* v91 : arrêt NET — débranche les handlers (un résultat tardif ne réécrira pas le champ),
       stoppe la reco, restaure l'icône micro. Appelé par : 2e tap, ENVOI, toute voix (say), retour liste.
       v93 : coupe AUSSI l'enregistreur Gemini (audio jeté — l'arrêt « utile » passe par stopRecord). */
    function stopMic(){
      listening = false;
      micBtn.classList.remove("rec");
      micBtn.innerHTML = SVG_MIC;
      if(rec){ try{ rec.onresult = null; rec.onend = null; rec.onerror = null; rec.stop(); }catch(e){} rec = null; }
      if(mrec){ try{ mrec.ondataavailable = null; mrec.onstop = null; mrec.stop(); }catch(e){} mrec = null; }
      if(mstream){ try{ mstream.getTracks().forEach(t => t.stop()); }catch(e){} mstream = null; }
    }
    ACTIVE_STOP = stopMic;   /* v157 : exposé via API.stop() — le routeur d'onglets d'app.js
      coupe le micro quand on sort du chat par la barre d'onglets (avant : la reco continuous
      survivait dans sa fermeture et se relançait en boucle, voyant micro allumé). */
    /* v84 : « not-allowed » sans explication = impasse. Invite de permission forcée via getUserMedia —
       sur une PWA installée (WebAPK Android), SpeechRecognition ne déclenche pas toujours l'invite lui-même.
       v85 (retour user réel) : dans l'app installée il n'y a NI cadenas NI barre d'adresse, et « Infos de
       l'appli » ne liste souvent PAS le micro pour une WebAPK — la permission du SITE se gère dans CHROME
       et l'app installée en hérite. Le message donne CE chemin-là. */
    const MSG_DENIED = "Micro bloqué. Chrome → ⋮ → Paramètres → Paramètres des sites → Micro → autorise mnafati-cloud.github.io (l'appli installée hérite du choix).";
    const SR_ERRS = {
      "no-speech": "Je n'ai rien entendu — réessaie.",
      "not-allowed": MSG_DENIED,
      "service-not-allowed": MSG_DENIED,
      "audio-capture": "Aucun micro détecté sur cet appareil.",
      "network": "Réseau indisponible pour la reconnaissance vocale — réessaie connecté."
    };
    /* ===== v93 : chemin Gemini (si clé) — on ENREGISTRE l'audio nous-mêmes puis transcription
       PROMPTÉE avec le contexte. Plus de Web Speech du tout sur ce chemin : les coupures aux pauses,
       les chevauchements et l'accent mal toléré disparaissent avec lui. Repli Web Speech sans clé. */
    async function startRecord(){
      try{ mstream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
      catch(e){ status.textContent = MSG_DENIED; return; }
      const mime = (root.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) ? "audio/webm;codecs=opus" : "";
      const chunks = [];
      try{ mrec = mime ? new MediaRecorder(mstream, { mimeType: mime }) : new MediaRecorder(mstream); }
      catch(e){ status.textContent = "Enregistreur indisponible."; try{ mstream.getTracks().forEach(t=>t.stop()); }catch(_){} mstream = null; return; }
      mrec.ondataavailable = ev => { if(ev.data && ev.data.size) chunks.push(ev.data); };
      mrec.onstop = async () => {
        const stream = mstream; mstream = null; mrec = null;
        try{ if(stream) stream.getTracks().forEach(t => t.stop()); }catch(e){}
        listening = false;
        micBtn.classList.remove("rec"); micBtn.innerHTML = SVG_MIC;
        const blob = new Blob(chunks, { type: mime || "audio/webm" });
        if(blob.size < 1200){ status.textContent = "Je n'ai rien entendu — réessaie."; return; }
        showWait("Transcription");
        const b64 = await new Promise(done => { const fr = new FileReader(); fr.onloadend = () => done(String(fr.result).split(",")[1] || ""); fr.readAsDataURL(blob); });
        const recent = conv.h.filter(m => !m.hid).slice(-4);
        const r = await callStt(cfg().gk, blob.type || "audio/webm", b64, { words: opts.words, recent });
        if(r.err){ status.textContent = "Voix : " + r.err; return; }
        if(!r.text){ status.textContent = "Je n'ai rien reconnu — réessaie."; return; }
        status.textContent = "";
        input.value = (input.value.trim() + " " + r.text).trim();
        autosize();
        input.focus();
      };
      mrec.start();
      listening = true;
      micBtn.classList.add("rec"); micBtn.innerHTML = SVG_STOP;
      showListen();
    }
    /* arrêt UTILE (2e tap) : déclenche la transcription — stopMic() reste l'arrêt-poubelle (envoi/voix/retour) */
    function finishRecord(){
      listening = false;
      try{ if(mrec) mrec.stop(); else stopMic(); }catch(e){ stopMic(); }
    }

    if(!SR && !(root.MediaRecorder && navigator.mediaDevices)){
      micBtn.disabled = true;
      micBtn.title = "Reconnaissance vocale indisponible dans ce navigateur — écris ta phrase.";
    } else {
      micBtn.onclick = async () => {
        /* v94 : interrupteur « Voix par Gemini » (cfg.stt) — OFF = micro navigateur même avec une clé */
        const useGemini = !!cfg().gk && cfg().stt !== false && !!(root.MediaRecorder && navigator.mediaDevices);
        if(listening){
          if(useGemini && mrec){ finishRecord(); return; }
          stopMic();
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
        if(useGemini){ await startRecord(); return; }
        if(!SR){ status.textContent = "Reconnaissance vocale indisponible ici — ajoute une clé Gemini (Réglages) ou écris ta phrase."; return; }
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
          autosize();
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
          input.focus();
        };
        try{
          rec.start(); listening = true;
          micBtn.classList.add("rec");
          micBtn.innerHTML = SVG_STOP;    // v91 : l'état d'écoute se voit — carré STOP sur fond vermillon
          showListen();
        }catch(e){ status.textContent = "Micro indisponible."; }
      };
    }
  }

  /* v157 : teardown appelable de l'extérieur — pointeur vers le stopMic du chat actif */
  let ACTIVE_STOP = null;
  function stop(){ try{ if(ACTIVE_STOP) ACTIVE_STOP(); }catch(e){} ACTIVE_STOP = null; }

  const API = {
    renderHome, renderChat, stop,
    callLLM, callStt, callGloss,
    pure: { buildSystem, trimHistory, buildRequest, parseReply, sttMerge, toApi, scenarioById, frDate,
            buildSttRequest, parseSttReply, glossPrompt, parseGloss,
            SCENARIOS, BOOTSTRAP, MODELS, MAX_HISTORY }
  };
  if(typeof module !== "undefined" && module.exports) module.exports = API;
  else root.SORI_CONVERSATION = API;
})(typeof self !== "undefined" ? self : this);

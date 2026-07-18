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

  function buildSystem(words, fragiles){
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
      "",
      "VOCABULAIRE CONNU : " + words.join(" ")
    ].filter(Boolean).join("\n");
  }

  /* v88 : accumulation STT robuste au bug Android — la liste ev.results est parfois RÉINITIALISÉE
     entre les événements (il ne reste que le dernier segment) → les segments FINAUX vivent dans
     finalTxt, HORS de la liste. startIdx = ev.resultIndex (ne retraite pas l'déjà-accumulé). */
  function sttFold(finalTxt, results, startIdx){
    let interim = "";
    for(let i = startIdx || 0; i < results.length; i++){
      const t = results[i][0].transcript;
      if(results[i].isFinal) finalTxt += t;
      else interim += t;
    }
    return { finalTxt, display: (finalTxt + interim).replace(/\s+/g, " ").trim() };
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
      ".conv-mic.rec{color:var(--acc2);border-color:var(--acc2)}",
      ".conv-status{min-height:1.2em;font-size:.85rem;margin-top:6px}"
    ].join("\n");
    document.head.appendChild(s);
  }
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  /* opts = { cfg: () => {prov, ok, ak},   // fournisseur + clés, relus à CHAQUE envoi (Réglages à chaud)
              words: [kr...], fragiles: [kr...],
              speak: (texte) => void }                                                      */
  function renderCard(container, opts){
    injectCSS();
    opts = opts || {};
    const cfg = typeof opts.cfg === "function" ? opts.cfg : () => ({});
    const system = buildSystem(opts.words, opts.fragiles);
    const history = [];   // [{role, content}] — état de la conversation, vit dans cette vue

    const box = document.createElement("div");
    box.className = "card";
    box.innerHTML =
      '<h2>Conversation</h2>' +
      '<p class="dim">Parle (ou écris) en coréen — ton partenaire répond à ton niveau, avec tes mots.</p>' +
      '<div class="conv-log"></div>' +
      '<div class="conv-status dim"></div>' +
      '<div class="conv-row">' +
        '<button class="btn ghost conv-mic" title="Parler (coréen)">' + SVG_MIC + '</button>' +
        '<input type="text" class="conv-in" placeholder="한국어로 말해 보세요…" autocomplete="off">' +
        '<button class="btn conv-send" title="Envoyer">' + SVG_SEND + '</button>' +
      '</div>';
    container.appendChild(box);

    const log = box.querySelector(".conv-log");
    const status = box.querySelector(".conv-status");
    const input = box.querySelector(".conv-in");
    const micBtn = box.querySelector(".conv-mic");
    const sendBtn = box.querySelector(".conv-send");

    function bubble(role, text){
      const b = document.createElement("div");
      b.className = "conv-b " + (role === "user" ? "u" : "a");
      b.textContent = text;
      if(role === "assistant" && opts.speak) b.onclick = () => opts.speak(text);   // re-écouter au tap
      log.appendChild(b);
      log.scrollTop = log.scrollHeight;
    }

    /* v87 : UNE seule résolution fournisseur→clé, avec LE MÊME défaut (anthropic) partout —
       le bug réel : send() prenait anthropic par défaut mais keyFor prenait la clé OpenAI
       quand prov n'était pas défini (sélecteur jamais touché) → « ajoute ta clé » à tort
       alors que la clé Anthropic était bien là. */
    function provOf(c){ return c.prov === "openai" ? "openai" : "anthropic"; }
    function keyFor(c){ return provOf(c) === "openai" ? c.ok : c.ak; }

    let busy = false;
    async function send(){
      const txt = input.value.trim();
      if(!txt || busy) return;
      /* défaut = anthropic : SEUL fournisseur qui autorise les appels directs depuis un navigateur
         (vérifié : api.openai.com n'envoie pas les en-têtes CORS — le chemin OpenAI reste dans le
         code pour un éventuel proxy futur, mais ne peut pas marcher depuis la PWA). */
      const c = cfg();
      const prov = provOf(c);
      const key = keyFor(c);
      if(!key){ status.textContent = "Ajoute ta clé API (" + prov + ") dans Réglages → Conversation."; return; }
      busy = true; sendBtn.disabled = true;
      input.value = "";
      bubble("user", txt);
      history.push({ role: "user", content: txt });
      status.textContent = "…";
      const r = await callLLM(prov, key, system, history);
      busy = false; sendBtn.disabled = false;
      if(r.err){
        history.pop();                                   // l'échange n'a pas eu lieu — historique cohérent
        status.textContent = "Erreur : " + r.err +
          (prov === "openai" && r.err.indexOf("réseau") === 0
            ? " — OpenAI bloque les appels depuis un navigateur ; choisis Anthropic dans Réglages."
            : "");
        return;
      }
      status.textContent = "";
      history.push({ role: "assistant", content: r.text });
      bubble("assistant", r.text);
      if(opts.speak) opts.speak(r.text);
    }
    sendBtn.onclick = send;
    input.onkeydown = e => { if(e.key === "Enter") send(); };

    /* ===== STT — Web Speech API (ko-KR), gratuite, intégrée au navigateur =====
       Le texte reconnu va dans le champ : l'utilisateur VALIDE avant l'envoi
       (voir ce que le micro a compris = retour sur la prononciation). */
    const SR = root.SpeechRecognition || root.webkitSpeechRecognition;
    let rec = null, listening = false;
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
        if(listening){ try{ rec.stop(); }catch(e){} return; }
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
        /* v88 (retour user : « ça coupe, ça ne garde que le dernier mot ») :
           - continuous = true + relance auto : Android coupe à la moindre pause — fatal pour un
             apprenant qui parle lentement. C'est l'USER qui arrête (2e tap sur le micro) ;
           - sttFold : les segments finaux s'accumulent HORS de ev.results (qu'Android réinitialise). */
        let finalTxt = "";
        rec = new SR();
        rec.lang = "ko-KR";
        rec.interimResults = true;
        rec.continuous = true;
        rec.onresult = ev => {
          const s = sttFold(finalTxt, ev.results, ev.resultIndex);
          finalTxt = s.finalTxt;
          input.value = s.display;
        };
        rec.onerror = ev => {
          if(ev.error === "no-speech" && listening) return;           // silence → la relance auto s'en charge
          if(ev.error === "not-allowed" || ev.error === "service-not-allowed" || ev.error === "audio-capture") listening = false;
          status.textContent = SR_ERRS[ev.error] || ("Micro : " + ev.error);
        };
        rec.onend = () => {
          if(listening){ try{ rec.start(); return; }catch(e){ listening = false; } }   // relance tant que l'user n'a pas retapé
          micBtn.classList.remove("rec");
          if(input.value) status.textContent = "Vérifie la phrase, corrige si besoin, puis envoie.";
          input.focus();
        };
        try{
          rec.start(); listening = true; micBtn.classList.add("rec");
          status.textContent = "J'écoute… parle, prends ton temps — retouche le micro quand tu as fini.";
        }catch(e){ status.textContent = "Micro indisponible."; }
      };
    }
  }

  const API = {
    renderCard,
    callLLM,
    pure: { buildSystem, trimHistory, buildRequest, parseReply, sttFold, MODELS, MAX_HISTORY }
  };
  if(typeof module !== "undefined" && module.exports) module.exports = API;
  else root.SORI_CONVERSATION = API;
})(typeof self !== "undefined" ? self : this);

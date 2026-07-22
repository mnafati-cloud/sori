/* Sori — story.js : « 이야기 », le feuilleton coréen. LECTEUR d'un corpus ÉCRIT À L'AVANCE.

   Les chapitres sont écrits à la main, vérifiés au build (tools/story_lint.mjs, story_build.mjs)
   et livrés figés dans docs/story-data.js. Rien n'est généré sur l'appareil : pas d'attente de
   plusieurs minutes, pas de réseau, pas de contenu non vérifié affiché à l'apprenant.
   Ce qui reste vivant, c'est la SÉLECTION : chaque chapitre cible une structure grammaticale,
   et il s'ouvre quand le profil (dérivé de FSRS, cf. grammar.js) montre que l'apprenant l'a
   au moins croisée. Contenu figé, calibrage vivant — le fonctionnement du deck lui-même.

   - SORI_STORY.renderHome(container, opts)              la liste, avec ce qui est ouvert ou non
   - SORI_STORY.renderChapter(container, opts, chapter)  la lecture (traduction/pont/audio au toucher)
   - SORI_STORY.pure = { availability, lintChapter, formMatchesLemma, normLemma }

   `lintChapter` vit ici et non dans les outils : c'est LA définition des deux plafonds, et les
   outils de build l'importent pour vérifier le corpus avant livraison. Le module n'accède NI à
   localStorage NI à ST : tout entre par opts (même contrat que conversation.js).
   Tests : node --test tests/story.test.mjs */
(function(root){
  "use strict";

  const MAX_NEW_WORDS = 3;
  /* mots-outils toujours permis : ils ne sont pas des cartes du deck mais la langue s'écroule sans eux */
  const FUNC = new Set(["것", "거", "수", "때", "분", "명", "개", "살", "년", "월", "일", "시", "주",
    "저", "나", "제", "내", "너", "우리", "그", "이", "이것", "그것", "저것", "이거", "그거",
    "누구", "뭐", "무엇", "어디", "언제", "왜", "어떻게", "네", "아니요", "씨", "좀",
    "한", "두", "세", "하나", "둘", "셋", "그리고", "그런데", "하지만", "그래서", "안", "못", "다", "또"]);

  /* ================= partie PURE (testée) ================= */

  /* Quel chapitre est lisible aujourd'hui. Un chapitre s'ouvre quand sa structure cible est au
     moins « en cours » — c'est justement le moment où la revoir en contexte sert. La lecture
     reste séquentielle : une histoire ne se lit pas dans le désordre. */
  function availability(corpus, profile, labelOf){
    const out = [];
    let blocked = 0;
    for(const ch of (corpus || [])){
      const t = ch.target;
      const st = t && profile && profile[t] ? profile[t].status : (t ? "inconnue" : "acquise");
      let status = "ok", reason = "";
      if(blocked){
        status = "locked";
        reason = `à lire après le chapitre ${blocked}`;
      }else if(t && st === "inconnue"){
        const nom = labelOf ? labelOf(t) : t;
        status = "locked";
        reason = `s'ouvrira quand vous aurez croisé « ${nom} » dans vos révisions`;
      }
      if(status === "locked" && !blocked) blocked = ch.n;
      out.push({ n: ch.n, status, reason });
    }
    return out;
  }

  /* Normalisation COMMUNE à tout ce que le lint compare (lemmes, vocabulaire connu, noms propres,
     mots nouveaux). Sans elle, une entrée multi-mots du deck (« 손을 씻다 », 107 cas) ne pourrait
     jamais être reconnue, et un lemme composé serait rejeté à tort. */
  function normLemma(s){
    return String(s == null ? "" : s).normalize("NFC").replace(/[?!.,…~"'«»()\[\]\s]+/g, "");
  }
  const stripAll = normLemma;

  /* La consonne initiale d'une syllabe hangul (0-18). Sert à vérifier qu'un lemme DÉCLARÉ
     correspond vraiment à la forme écrite : sans ça le plafond de vocabulaire est déclaratif —
     on écrit ce qu'on veut et on annonce à côté un lemme autorisé.
     On compare la consonne initiale seulement, pour rester juste avec les irréguliers
     (맵다→매워요, 듣다→들어요, 부르다→불러요, 하다→해요). */
  function lead(c){
    const x = (c || "").codePointAt(0) - 0xAC00;
    return (x >= 0 && x < 11172) ? Math.floor(x / 588) : -1;
  }
  function formMatchesLemma(form, lemma){
    const f = normLemma(form);
    const raw = String(lemma == null ? "" : lemma).normalize("NFC").trim();
    if(!f || !raw) return true;                     /* déjà signalé ailleurs */
    /* Le deck contient 107 entrées MULTI-MOTS (« 손을 씻다 ») : la forme écrite ne porte alors
       qu'un seul élément (손을, puis 씻었어요). On accepte le lemme entier ou l'un de ses mots. */
    const candidats = [normLemma(raw)].concat(raw.split(/\s+/).map(normLemma)).filter(Boolean);
    for(const l of candidats){
      if(f.startsWith(l)) return true;              /* noms et formes régulières */
      const stem = (l.length >= 2 && l.endsWith("다")) ? l.slice(0, -1) : l;
      if(f.startsWith(stem)) return true;
      /* irréguliers (맵다→매워요, 듣다→들어요, 부르다→불러요) : la consonne initiale tient */
      const a = lead(f[0]), b = lead(stem[0]);
      if(a >= 0 && b >= 0 && a === b) return true;
    }
    return false;
  }

  /* LE CONTRÔLE DES DEUX PLAFONDS — vocabulaire et grammaire.
     ctx = { known:Set (lemmes normalisés), names:[], allowed:Set, tag:fn, labelOf:fn,
             minSentences?, maxSentences? }
     Utilisé au BUILD (tools/story_lint.mjs, tools/story_build.mjs) : rien de non vérifié
     n'atteint l'apprenant. */
  function lintChapter(ch, ctx){
    const out = [];
    const sentences = ch && Array.isArray(ch.sentences) ? ch.sentences : null;
    if(!sentences || !sentences.length) return ["chapitre vide ou illisible"];
    /* la forme du chapitre se contrôle aussi : un chapitre de 43 phrases n'est pas le format
       demandé, et personne ne s'en apercevait (défaut vécu) */
    const lo = ctx.minSentences || 0, hi = ctx.maxSentences || 0;
    if(lo && sentences.length < lo) out.push(`${sentences.length} phrases : trop court (${lo} minimum)`);
    if(hi && sentences.length > hi) out.push(`${sentences.length} phrases : trop long (${hi} maximum)`);
    const newWords = new Set((ch.new_words || []).map(w => normLemma(w && w.kr)).filter(Boolean));
    const names = (ctx.names || []).map(normLemma);
    sentences.forEach((s, i) => {
      const kr = (s && s.kr) || "";
      const words = (s && Array.isArray(s.words)) ? s.words : [];
      const at = `phrase ${i + 1} (${kr})`;
      if(!kr){ out.push(`phrase ${i + 1} : coréen manquant`); return; }
      if(!s.fr) out.push(`${at} : traduction française manquante`);
      /* Sans ce contrôle, omettre un mot du mot-à-mot suffirait à échapper au plafond. */
      if(stripAll(words.map(w => w && w.form).join("")) !== stripAll(kr))
        out.push(`${at} : le mot-à-mot ne couvre pas la phrase (mots omis ou altérés)`);
      for(const w of words){
        const lem = normLemma(w && w.lemma);
        if(!lem){ out.push(`${at} : lemme manquant pour « ${(w && w.form) || "?"} »`); continue; }
        if(!/^[가-힣]+$/.test(lem)){
          if(!/^[0-9]+$/.test(lem)) out.push(`${at} : lemme non hangul « ${lem} »`);
          continue;
        }
        /* on passe le lemme BRUT : formMatchesLemma a besoin des espaces pour reconnaître
           une entrée multi-mots (« 손을 씻다 ») */
        if(!formMatchesLemma(w.form, w.lemma)){
          out.push(`${at} : le lemme « ${lem} » ne correspond pas à la forme « ${w.form} »`);
          continue;
        }
        if(ctx.known.has(lem) || newWords.has(lem) || names.indexOf(lem) >= 0 || FUNC.has(lem)) continue;
        out.push(`${at} : le mot « ${lem} » (forme ${w.form}) n'est pas dans le vocabulaire autorisé`);
      }
      for(const t of (ctx.tag ? ctx.tag(kr) : [])){
        if(!ctx.allowed.has(t))
          out.push(`${at} : la structure « ${ctx.labelOf ? ctx.labelOf(t) : t} » n'est pas autorisée`);
      }
    });
    if((ch.new_words || []).length > MAX_NEW_WORDS)
      out.push(`${ch.new_words.length} mots nouveaux déclarés (maximum ${MAX_NEW_WORDS})`);
    return out;
  }

  /* ================= interface ================= */

  let cssDone = false;
  function injectCSS(){
    if(cssDone || typeof document === "undefined") return;
    cssDone = true;
    const s = document.createElement("style");
    s.textContent = [
      ".st-head{display:flex;align-items:center;gap:10px;margin-bottom:2px}",
      ".st-head .kr-big{font-family:var(--kr-display, inherit);font-size:1.5rem;line-height:1.1}",
      ".st-head .lbl{font-size:.8rem;color:var(--dim)}",
      ".st-x{margin-left:auto;flex:none}",
      ".st-back{flex:none;padding:4px 12px}",
      ".st-intro{line-height:1.6;margin:10px 0 14px}",
      /* liste des chapitres : registre, ancre = numéro manuscrit */
      ".st-item{display:flex;align-items:center;gap:12px;cursor:pointer}",
      ".st-item.locked{cursor:default;opacity:.55}",
      ".st-item .st-n{font-family:var(--num-display, inherit);font-size:1.5rem;width:38px;text-align:center;flex:none;color:var(--acc)}",
      ".st-item .st-meta{flex:1;min-width:0}",
      ".st-item .st-tk{font-family:var(--kr-display, inherit);font-size:1.1rem}",
      ".st-item .st-tf{font-size:.8rem;color:var(--dim)}",
      ".st-item .st-why{font-size:.76rem;color:var(--dim);margin-top:2px;line-height:1.4}",
      /* lecture : une phrase = un bloc, mots tapables */
      ".st-p{margin:0 0 16px;padding:0 0 12px;border-bottom:1px solid var(--line)}",
      ".st-p:last-child{border-bottom:none}",
      ".st-kr{font-family:var(--kr-display, inherit);font-size:1.35rem;line-height:1.85;word-break:keep-all}",
      ".st-w{font:inherit;color:inherit;background:none;border:none;padding:0 1px;cursor:pointer;border-radius:3px}",
      ".st-w.on{background:color-mix(in srgb, var(--acc) 22%, transparent)}",
      ".st-w.new{border-bottom:2px dotted var(--acc2)}",
      ".st-tools{display:flex;align-items:center;gap:14px;margin-top:8px}",
      ".st-tool{background:none;border:none;color:var(--dim);font:inherit;font-size:.8rem;cursor:pointer;padding:2px 0}",
      ".st-fr{margin-top:8px;line-height:1.5}",
      ".st-bridge{margin-top:8px;border-top:1px solid var(--line);padding-top:6px;font-size:.9rem}",
      ".st-bridge .bk{font-family:var(--kr-display, inherit);margin-right:6px}",
      ".st-bridge .bn{color:var(--dim)}",
      ".st-newl{margin-top:14px;font-size:.9rem;color:var(--dim);line-height:1.6}",
      ".st-newl b{font-family:var(--kr-display, inherit);color:var(--acc2);font-weight:400}",
      ".st-nav{display:flex;gap:10px;margin-top:18px}",
    ].join("\n");
    document.head.appendChild(s);
  }

  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function el(html){ const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }

  /* opts = { corpus:[chapitres], profile, labelOf:fn, speak:fn, onExit:fn } */
  function renderHome(container, opts){
    injectCSS();
    container.innerHTML = "";
    const corpus = (opts.corpus || []).slice().sort((a, b) => (a.n || 0) - (b.n || 0));
    const box = el(`<div class="card">
      <div class="st-head"><span class="kr-big">이야기</span><span class="lbl">Histoire</span>
        <button class="btn ghost small st-x">✕</button></div>
      <p class="st-intro dim"></p>
      <div class="st-list list"></div>
    </div>`);
    container.appendChild(box);
    box.querySelector(".st-x").onclick = () => { if(opts.onExit) opts.onExit(); };

    const intro = box.querySelector(".st-intro");
    if(!corpus.length){
      intro.textContent = "La saison 1 est en cours d'écriture. Elle arrivera avec une mise à jour : "
        + "des chapitres écrits d'avance, qui n'emploient que les mots et les tournures que vous connaissez.";
      return;
    }
    const dispo = availability(corpus, opts.profile, opts.labelOf);
    const ouverts = dispo.filter(d => d.status === "ok").length;
    intro.textContent = `Un feuilleton écrit avec votre vocabulaire. ${ouverts} chapitre${ouverts > 1 ? "s" : ""} `
      + `sur ${corpus.length} ${ouverts > 1 ? "sont ouverts" : "est ouvert"} — les suivants s'ouvriront à mesure que vous avancerez.`;

    const list = box.querySelector(".st-list");
    corpus.forEach((ch, i) => {
      const d = dispo[i];
      const ouvert = d.status === "ok";
      const it = el(`<div class="item st-item${ouvert ? "" : " locked"}"><div class="st-n">${esc(ch.n)}</div>
        <div class="st-meta"><div class="st-tk">${esc(ouvert ? (ch.title_kr || "") : "· · ·")}</div>
        <div class="st-tf">${esc(ouvert ? (ch.title_fr || "") : "")}</div>
        ${ouvert ? "" : `<div class="st-why">${esc(d.reason)}</div>`}</div></div>`);
      if(ouvert) it.onclick = () => renderChapter(container, opts, ch);
      list.appendChild(it);
    });
  }

  function renderChapter(container, opts, ch){
    injectCSS();
    container.innerHTML = "";
    const box = el(`<div class="card">
      <div class="st-head"><button class="btn ghost small st-back">‹</button>
        <span class="kr-big">${esc(ch.title_kr || "")}</span></div>
      <p class="dim st-tf">${esc(ch.title_fr || "")}</p>
      <div class="st-body"></div>
      <div class="st-newl"></div>
      <div class="st-nav"></div>
    </div>`);
    container.appendChild(box);
    box.querySelector(".st-back").onclick = () => renderHome(container, opts);

    /* le corpus livré compacte les mots en [forme, lemme, note?] */
    const wordsOf = s => (s.words || []).map(w => Array.isArray(w)
      ? { form: w[0], lemma: w[1], note: w[2] || "" } : w);
    const newSet = new Set((ch.new_words || []).map(w => normLemma(Array.isArray(w) ? w[0] : w.kr)));
    const body = box.querySelector(".st-body");
    (ch.sentences || []).forEach(s => {
      const p = el(`<div class="st-p"><div class="st-kr"></div>
        <div class="st-tools"><button class="st-tool st-tr">traduction</button>
          <button class="st-tool st-sp">écouter</button></div>
        <div class="st-fr" hidden></div><div class="st-bridge" hidden></div></div>`);
      const kr = p.querySelector(".st-kr");
      const bridge = p.querySelector(".st-bridge");
      const mots = wordsOf(s);
      mots.forEach((w, i) => {
        const b = el(`<button class="st-w${newSet.has(normLemma(w.lemma)) ? " new" : ""}">${esc(w.form)}</button>`);
        b.onclick = () => {
          const on = b.classList.contains("on");
          p.querySelectorAll(".st-w.on").forEach(x => x.classList.remove("on"));
          if(on){ bridge.hidden = true; return; }
          b.classList.add("on");
          bridge.innerHTML = w.note
            ? `<span class="bk">${esc(w.form)}</span> ← <span class="bk">${esc(w.lemma)}</span> <span class="bn">${esc(w.note)}</span>`
            : `<span class="bk">${esc(w.form)}</span> <span class="bn">${esc(w.lemma === w.form ? "" : "← " + w.lemma)}</span>`;
          bridge.hidden = false;
        };
        kr.appendChild(b);
        if(i < mots.length - 1) kr.appendChild(document.createTextNode(" "));
      });
      const fr = p.querySelector(".st-fr");
      fr.textContent = s.fr || "";
      p.querySelector(".st-tr").onclick = () => { fr.hidden = !fr.hidden; };
      /* on prononce la phrase telle qu'elle est écrite dans le corpus, pas une reconstruction */
      p.querySelector(".st-sp").onclick = () => { if(opts.speak) opts.speak(s.kr); };
      body.appendChild(p);
    });

    const nl = box.querySelector(".st-newl");
    const nw = (ch.new_words || []).map(w => Array.isArray(w) ? { kr: w[0], fr: w[1] } : w);
    if(nw.length) nl.innerHTML = "Mots nouveaux : " + nw.map(w => `<b>${esc(w.kr)}</b> ${esc(w.fr)}`).join(" · ");
    else nl.remove();

    /* aller au chapitre suivant sans repasser par la liste, s'il est ouvert */
    const corpus = (opts.corpus || []).slice().sort((a, b) => (a.n || 0) - (b.n || 0));
    const dispo = availability(corpus, opts.profile, opts.labelOf);
    const idx = corpus.findIndex(c => c.n === ch.n);
    const suivant = idx >= 0 && idx + 1 < corpus.length && dispo[idx + 1].status === "ok" ? corpus[idx + 1] : null;
    const nav = box.querySelector(".st-nav");
    if(suivant){
      const b = el(`<button class="btn">Chapitre ${esc(suivant.n)} ›</button>`);
      b.onclick = () => renderChapter(container, opts, suivant);
      nav.appendChild(b);
    }else nav.remove();
  }

  const API = { renderHome, renderChapter,
                pure: { availability, lintChapter, formMatchesLemma, normLemma } };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.SORI_STORY = API;
})(typeof self !== "undefined" ? self : this);

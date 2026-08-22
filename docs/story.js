/* Sori — story.js : « 이야기 », le feuilleton coréen. LECTEUR d'un corpus ÉCRIT À L'AVANCE.

   Les chapitres sont écrits à la main, vérifiés au build (tools/story_lint.mjs, story_build.mjs)
   et livrés figés dans docs/story-data.js. Rien n'est généré sur l'appareil : pas d'attente de
   plusieurs minutes, pas de réseau, pas de contenu non vérifié affiché à l'apprenant.
   Ce qui reste vivant, c'est la SÉLECTION : chaque chapitre cible une structure grammaticale,
   et il s'ouvre quand le profil (dérivé de FSRS, cf. grammar.js) montre que l'apprenant l'a
   au moins croisée. Contenu figé, calibrage vivant — le fonctionnement du deck lui-même.

   - SORI_STORY.renderHome(container, opts)              le sommaire, avec ce qui est ouvert ou non
   - SORI_STORY.renderChapter(container, opts, chapter)  la lecture, une unité par écran
   - SORI_STORY.pure = { availability, lintChapter, formMatchesLemma, normLemma, decouper }

   La lecture (v125, maquette validée) : le texte occupe la moitié haute, l'écoute est posée
   au milieu de la moitié basse et n'en bouge jamais, les flèches sont tout en bas. Avancer
   déclenche la lecture à voix haute ; le bouton sert à réentendre. Toucher le texte donne la
   traduction et le mot-à-mot, toucher un mot donne sa forme de dictionnaire et son sens.

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
  function availability(corpus, profile, labelOf, dejaOuverts){
    const out = [];
    const deja = {};
    for(const n of (dejaOuverts || [])) deja[n] = 1;
    let blocked = 0;
    for(const ch of (corpus || [])){
      /* Un chapitre OUVERT le reste. Le profil bouge tous les jours — une carte ratée peut
         faire retomber une structure sous le seuil, et sans cette ligne l'app reprendrait un
         chapitre déjà lisible, voire déjà lu. Le calibrage sert à ouvrir, jamais à refermer. */
      if(deja[ch.n]){ out.push({ n: ch.n, status: "ok", reason: "" }); continue; }
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

  /* Recompose une unité AVEC sa ponctuation, chaque morceau relié à son mot.
     Le rendu ne peut pas se contenter de recoller les formes avec des espaces : les points
     et les guillemets disparaîtraient (défaut vécu — deux phrases se lisaient d'affilée).
     On avance donc dans `kr` en y retrouvant chaque forme ; ce qui sépare deux formes est
     rendu tel quel. La ponctuation collée à un mot reste DANS le mot, sinon la ligne peut
     se couper juste avant et le point se retrouve seul en tête de la ligne suivante.
     Vérifié sur les 181 unités de la saison 1 : reconstruction exacte, aucun mot perdu. */
  function decouper(unite){
    const mots = (unite.words || []).map(w => Array.isArray(w)
      ? { form: w[0], lemma: w[1], note: w[2] || "" } : w);
    const kr = String((unite && unite.kr) || "");
    const out = []; let cur = 0;
    for(const m of mots){
      const i = kr.indexOf(m.form, cur);
      if(i < 0) return [{ t: kr }];                 /* données inattendues : la phrase brute */
      let avant = "";
      if(i > cur){
        const g = kr.slice(cur, i);
        /* le guillemet ouvrant part AVEC le mot qu'il ouvre, sinon il peut rester seul
           en fin de ligne — même raison que le point qui reste avec le mot qu'il ferme */
        avant = (g.match(/[^\s]*$/) || [""])[0];
        if(g.length > avant.length) out.push({ t: g.slice(0, g.length - avant.length) });
      }
      cur = i + m.form.length;
      /* strictement la ponctuation : deux mots peuvent se toucher sans espace (« 2년 »,
         « 백세 개 ») et le suivant ne doit surtout pas être avalé */
      const colle = (kr.slice(cur).match(/^[^\s가-힣0-9A-Za-z]+/) || [""])[0];
      cur += colle.length;
      out.push({ t: avant + m.form + colle, m });
    }
    if(cur < kr.length) out.push({ t: kr.slice(cur) });
    return out;
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

  /* Le hangul est l'affiche, le français est sa marge, l'espace sépare — aucun filet.
     Les variables employées appartiennent au thème actif ; celles qui n'existent que dans
     « Takbon » (--hand, --tk-glow) sont simplement ignorées ailleurs, sans rien casser. */
  let cssDone = false;
  function injectCSS(){
    if(cssDone || typeof document === "undefined") return;
    cssDone = true;
    const s = document.createElement("style");
    s.textContent = [
      /* l'écran occupe toute la hauteur : #screen perd ses marges le temps de la lecture */
      "#screen.st-on{padding:0;gap:0}",
      ".st-c{height:100%;display:flex;flex-direction:column;min-height:0}",
      /* la sortie : un mot, jamais un pavé */
      /* « .st-c » en tête : le thème Takbon impose font-family:inherit à TOUT bouton
         (.theme-takbon button), ce qui ferait sortir ces mots en myeongjo — la police du
         texte coréen qui les entoure. Deux classes passent devant. */
      ".st-c .st-sortie{align-self:flex-start;background:none;border:none;color:var(--dim);"
        + "cursor:pointer;font-family:var(--hand,inherit);font-size:1.05rem;padding:10px 0}",
      ".st-c .st-sortie::before{content:'\\2039';margin-right:8px}",

      /* ---------- sommaire ---------- */
      ".st-som{overflow-y:auto;padding:0 20px 30px}",
      ".st-tete{min-height:30vh;display:flex;flex-direction:column;justify-content:center;gap:8px}",
      ".st-saison{font-family:var(--kr-display,inherit);font-size:2.6rem;line-height:1.1;"
        + "font-weight:700;word-break:keep-all;text-shadow:var(--tk-glow,none)}",
      ".st-saison-fr{font-family:var(--hand,inherit);font-size:1.15rem;color:var(--dim)}",
      ".st-liste{display:flex;flex-direction:column;gap:26px;margin-top:14px}",
      ".st-ch{display:flex;align-items:baseline;gap:15px;width:100%;background:none;border:none;"
        + "padding:0;text-align:left;cursor:pointer;color:inherit}",
      ".st-ch[disabled]{cursor:default;opacity:.75}",
      ".st-n{font-family:var(--num-display,var(--hand,inherit));font-size:1.85rem;color:var(--dim);"
        + "flex:none;width:32px;text-align:right;line-height:1}",
      ".st-ch.lu .st-n{color:var(--seal)}",              /* le vermillon ne dit qu'un fait : c'est lu */
      ".st-t{flex:1;min-width:0}",
      ".st-tk{display:block;font-family:var(--kr-display,inherit);font-size:1.3rem;font-weight:700;"
        + "line-height:1.35;word-break:keep-all;text-shadow:0 0 10px rgba(255,255,255,.16)}",
      ".st-tf{display:block;font-family:var(--hand,inherit);font-size:1.05rem;color:var(--dim);margin-top:3px}",
      ".st-why{display:block;font-family:var(--hand,inherit);font-size:1rem;color:var(--dim);"
        + "margin-top:3px;line-height:1.4}",

      /* ---------- lecture ---------- */
      ".st-haut{flex:0 0 52%;display:flex;flex-direction:column;justify-content:center;"
        + "padding:6px 20px;cursor:pointer;overflow:hidden;text-align:center}",
      ".st-kr{flex:0 0 auto;margin:0;font-family:var(--kr-display,inherit);font-size:2.05rem;"
        + "font-weight:700;line-height:1.6;word-break:keep-all;text-shadow:var(--tk-glow,none)}",
      /* les mots : du texte, pas des boutons — celui qu'on touche s'ALLUME */
      ".st-w{font:inherit;color:inherit;background:none;border:none;padding:0;margin:0;cursor:pointer;"
        + "text-shadow:inherit}",
      ".st-w.on{color:var(--txt);text-shadow:var(--tk-glow2,none);text-decoration:underline;"   /* v157 : #fff illisible sur thème clair */
        + "text-decoration-color:var(--seal);text-underline-offset:6px}",

      /* le bas : la révélation posée dans le vide, puis les deux gestes.
         Un mot OU toute la phrase — jamais les deux : une seule boîte, un seul contenu à la fois,
         donc rien à faire défiler et rien qui se superpose (v128, sur retour user). */
      ".st-bas{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;"
        + "gap:18px;min-height:0}",
      ".st-reveal{width:100%;padding:0 20px;text-align:center;line-height:1.35;overflow-y:auto}",
      ".st-tr{margin:0;font-family:var(--hand,inherit);font-size:1.2rem;line-height:1.45;color:var(--txt)}",
      ".st-nl{margin:12px 0 0;font-family:var(--hand,inherit);font-size:1.02rem;color:var(--dim);line-height:1.5}",
      ".st-nl b{font-family:var(--kr-display,inherit);color:var(--txt);font-weight:700}",
      /* la fiche d'un mot : forme → lemme, sens, nuance */
      ".st-ph{display:flex;align-items:center;justify-content:center}",
      ".st-pf{font-family:var(--kr-display,inherit);font-weight:700;font-size:1.45rem;"
        + "text-shadow:var(--tk-glow,none)}",
      ".st-pl{font-family:var(--kr-display,inherit);font-weight:700;font-size:1.45rem;color:var(--dim)}",
      ".st-ps{display:block;font-family:var(--hand,inherit);font-size:1.15rem;color:var(--txt);margin-top:4px}",
      ".st-pn{display:block;font-family:var(--hand,inherit);font-size:1.05rem;color:var(--dim)}",
      ".st-fl{flex:none;width:26px;height:12px;stroke:var(--dim);stroke-width:1.4;fill:none;"
        + "stroke-linecap:round;stroke-linejoin:round;margin:0 9px}",
      /* les deux gestes, côte à côte : l'œil MONTRE la phrase (discret), l'écoute la DIT (grande) */
      ".st-gestes{flex:none;display:flex;align-items:center;justify-content:center;gap:30px}",
      ".st-oeil{background:none;border:none;padding:0;width:56px;height:56px;display:flex;"
        + "align-items:center;justify-content:center;cursor:pointer;color:var(--dim)}",
      ".st-oeil svg{width:34px;height:34px;stroke:currentColor;stroke-width:1.5;fill:none;"
        + "stroke-linecap:round;stroke-linejoin:round;display:block}",
      ".st-oeil.on{color:var(--txt)}",
      ".st-oeil.on svg{filter:drop-shadow(0 0 8px rgba(255,255,255,.42))}",
      /* l'écoute : le geste qu'on répète, donc grande et lumineuse. Pas de cercle (violent). */
      ".st-son{background:none;border:none;padding:0;width:88px;height:88px;display:flex;"
        + "align-items:center;justify-content:center;cursor:pointer;color:var(--txt)}",
      ".st-son svg{width:46px;height:46px;stroke:currentColor;stroke-width:1.4;fill:none;"
        + "stroke-linecap:round;stroke-linejoin:round;display:block;"
        + "filter:drop-shadow(0 0 11px rgba(255,255,255,.38))}",
      ".st-son:active svg{filter:drop-shadow(0 0 18px rgba(255,255,255,.72))}",
      ".st-c.affiche .st-cpt,.st-c.finie .st-cpt{visibility:hidden}",
      ".st-c.affiche .st-haut,.st-c.finie .st-haut{flex:1 1 auto}",
      ".st-c.affiche .st-bas,.st-c.finie .st-bas{display:none}",
      /* le pied : avancer, reculer, savoir où l'on est */
      ".st-pied{flex:none;display:flex;align-items:center;justify-content:space-between;padding:0 12px 6px}",
      ".st-nav{background:none;border:none;padding:14px 20px;cursor:pointer;color:var(--dim)}",
      ".st-nav svg{width:30px;height:30px;stroke:currentColor;stroke-width:1.5;fill:none;"
        + "stroke-linecap:round;stroke-linejoin:round;display:block}",
      ".st-nav:active{color:var(--txt)}",
      ".st-cpt{font-family:var(--num-display,var(--hand,inherit));color:var(--dim);font-size:1.15rem}",
      ".st-cpt b{color:var(--txt);font-weight:700;font-size:1.3rem}",
      ".st-cpt em{font-style:normal}",
      /* l'affiche d'ouverture et le tampon de fin, dans la même moitié haute */
      ".st-ouv,.st-fin{display:flex;flex-direction:column;align-items:center;gap:10px}",
      ".st-ouv .n{font-family:var(--num-display,var(--hand,inherit));font-size:5rem;line-height:.85;"
        + "color:var(--txt);text-shadow:var(--tk-glow,none)}",
      ".st-ouv .tk{font-family:var(--kr-display,inherit);font-size:2.2rem;font-weight:700;line-height:1.2;"
        + "word-break:keep-all;text-shadow:var(--tk-glow,none)}",
      ".st-ouv .tf{font-family:var(--hand,inherit);font-size:1.2rem;color:var(--dim)}",
      ".st-ouv .cast{font-family:var(--kr-display,inherit);font-size:1.05rem;color:var(--dim);"
        + "opacity:.7;letter-spacing:.1em;margin-top:20px;word-break:keep-all}",
      ".st-fin{gap:26px}",
      ".st-dojang{width:78px;height:78px;border-radius:16px;background:var(--seal);color:var(--seal-ink);"
        + "display:flex;align-items:center;justify-content:center;transform:rotate(-5deg)}",
      ".st-dojang span{font-family:var(--kr-display,inherit);font-size:1.9rem;font-weight:700;line-height:1}",
      ".st-c .st-suite{background:none;border:none;color:var(--txt);padding:14px 18px;"
        + "cursor:pointer;font-family:var(--hand,inherit);font-size:1.3rem}",
    ].join("\n");
    document.head.appendChild(s);
  }

  const HP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/>'
    + '<path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
  /* l'œil : montrer la traduction de toute la phrase */
  const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true">'
    + '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/>'
    + '<circle cx="12" cy="12" r="3"/></svg>';
  /* les flèches du pied et celle du pont sont DESSINÉES : « ← » n'existe ni dans la police
     hangul (bornée au hangul) ni dans la main du thème, il retomberait sur une police
     système — une troisième écriture dans la page (défaut vécu sur les accents, v102/v117) */
  const FLECHE = '<svg class="st-fl" viewBox="0 0 26 12" aria-hidden="true"><path d="M24 6H3M9 1.5 3 6l6 4.5"/></svg>';
  const CHEV = d => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
  /* paliers : le hangul tient dans sa moitié haute sans jamais se couper */
  const TAILLES = [2.05, 1.85, 1.65, 1.45, 1.3];

  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function el(html){ const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }

  /* opts = { corpus:[chapitres], profile, labelOf:fn, speak:fn, onExit:fn,
              sens:{lemme:sens}, lus:[n], onLu:fn(n), saison:{kr,fr} } */
  function renderHome(container, opts){
    injectCSS();
    container.innerHTML = "";
    container.classList.add("st-on");
    const corpus = (opts.corpus || []).slice().sort((a, b) => (a.n || 0) - (b.n || 0));
    const lus = opts.lus || [];
    const sais = opts.saison || {};
    const box = el(`<div class="st-c st-som">
      <div class="st-tete">
        <div class="st-saison">${esc(sais.kr || "이야기")}</div>
        <div class="st-saison-fr"></div>
      </div>
      <div class="st-liste"></div>
    </div>`);
    container.appendChild(box);

    const sous = box.querySelector(".st-saison-fr");
    if(!corpus.length){
      sous.textContent = "La saison 1 arrivera avec une mise à jour.";
      return;
    }
    const dispo = availability(corpus, opts.profile, opts.labelOf, opts.ouverts);
    const ouverts = dispo.filter(d => d.status === "ok").length;
    sous.textContent = (sais.fr ? sais.fr + " · " : "")
      + `saison 1 · ${ouverts}/${corpus.length} ouverts`;

    const liste = box.querySelector(".st-liste");
    corpus.forEach((ch, i) => {
      const d = dispo[i], ouvert = d.status === "ok", lu = lus.indexOf(ch.n) >= 0;
      const it = el(`<button class="st-ch${lu ? " lu" : ""}"${ouvert ? "" : " disabled"}>
        <span class="st-n">${esc(ch.n)}</span>
        <span class="st-t"><span class="st-tk">${esc(ouvert ? (ch.title_kr || "") : "· · ·")}</span>
          ${ouvert ? `<span class="st-tf">${esc(ch.title_fr || "")}</span>`
                   : `<span class="st-why">${esc(d.reason)}</span>`}</span>
      </button>`);
      if(ouvert) it.onclick = () => renderChapter(container, opts, ch);
      liste.appendChild(it);
    });

    const sortie = el(`<button class="st-sortie">exercices</button>`);
    sortie.onclick = () => {
      container.classList.remove("st-on");
      if(opts.onExit) opts.onExit();
    };
    box.appendChild(sortie);
  }

  /* La lecture : une unité par écran. Le texte occupe la moitié haute ; en bas, l'œil MONTRE la
     traduction de TOUTE la phrase et l'écoute la DIT — le geste qu'on répète. Toucher un MOT
     donne sa forme de dictionnaire, son sens et sa nuance. Œil et mot partagent la même boîte de
     révélation : un seul contenu à la fois, donc rien à faire défiler ni à empiler (v128). */
  function renderChapter(container, opts, ch){
    injectCSS();
    container.innerHTML = "";
    container.classList.add("st-on");
    const SENS = opts.sens || {};
    const N = (ch.sentences || []).length;

    const vue = el(`<div class="st-c">
      <div class="st-haut"><p class="st-kr"></p></div>
      <div class="st-bas">
        <div class="st-reveal" hidden></div>
        <div class="st-gestes">
          <button class="st-oeil" aria-label="voir la traduction">${EYE}</button>
          <button class="st-son" aria-label="écouter">${HP}</button>
        </div>
      </div>
      <div class="st-pied">
        <button class="st-nav prec" aria-label="précédent">${CHEV("M15 5 8 12l7 7")}</button>
        <span class="st-cpt"><b>1</b><em>/${esc(N)}</em></span>
        <button class="st-nav suiv" aria-label="suivant">${CHEV("M9 5l7 7-7 7")}</button>
      </div>
    </div>`);
    container.appendChild(vue);

    const haut = vue.querySelector(".st-haut");
    const kr = vue.querySelector(".st-kr");
    const bas = vue.querySelector(".st-bas");
    const reveal = vue.querySelector(".st-reveal");
    const oeil = vue.querySelector(".st-oeil");
    const cpt = vue.querySelector(".st-cpt b");
    let n = -1;                                   /* -1 = l'affiche, N = le tampon de fin */
    let cur = null;                               /* la phrase courante */
    let vu = null;                                /* la révélation : null | "fr" | bouton-mot */

    const nw = (ch.new_words || []).map(w => Array.isArray(w) ? { kr: w[0], fr: w[1] } : w);

    /* la révélation vit dans une SEULE boîte : un mot OU toute la phrase, jamais les deux.
       On efface avant de montrer autre chose — rien ne s'empile, rien ne persiste d'une page
       à l'autre (montre() appelle fermer()). */
    function fermer(){
      vu = null;
      reveal.hidden = true; reveal.innerHTML = "";
      oeil.classList.remove("on");
      const on = vue.querySelector(".st-w.on"); if(on) on.classList.remove("on");
    }
    function poser(html){ reveal.innerHTML = html; reveal.hidden = false; ajusteReveal(); }
    function montrerPhrase(){
      const on = vue.querySelector(".st-w.on"); if(on) on.classList.remove("on");
      vu = "fr"; oeil.classList.add("on");
      poser(`<p class="st-tr">${esc((cur && cur.fr) || "")}</p>`
        + (nw.length ? `<p class="st-nl">Mots nouveaux : `
            + nw.map(w => `<b>${esc(w.kr)}</b> ${esc(w.fr)}`).join(" · ") + `</p>` : ""));
    }
    function montrerMot(b, m){
      oeil.classList.remove("on");
      const on = vue.querySelector(".st-w.on"); if(on && on !== b) on.classList.remove("on");
      vu = b; b.classList.add("on");
      const sens = SENS[m.lemma] || "";
      poser(`<span class="st-ph"><span class="st-pf">${esc(m.form)}</span>`
        + (m.lemma && m.lemma !== m.form ? `${FLECHE}<span class="st-pl">${esc(m.lemma)}</span>` : "")
        + `</span>`
        + (sens ? `<span class="st-ps">${esc(sens)}</span>` : "")
        + (m.note ? `<span class="st-pn">${esc(m.note)}</span>` : ""));
    }
    function ajuste(){
      const dispo = haut.clientHeight - 16;
      for(const t of TAILLES){ kr.style.fontSize = t + "rem"; if(kr.scrollHeight <= dispo) break; }
    }
    /* la révélation ne déborde jamais du bas : on borne sa hauteur à la place libre au-dessus des
       gestes, et la traduction rétrécit d'un cran plutôt que d'imposer un défilement */
    function ajusteReveal(){
      reveal.style.maxHeight = "";
      const g = vue.querySelector(".st-gestes");
      reveal.style.maxHeight = Math.max(64, bas.clientHeight - (g ? g.offsetHeight : 0) - 18) + "px";
      const tr = reveal.querySelector(".st-tr");
      if(tr) for(const t of [1.2, 1.1, 1.0, 0.92, 0.85, 0.78, 0.72]){
        tr.style.fontSize = t + "rem";
        if(reveal.scrollHeight <= reveal.clientHeight + 2) break;
      }
    }

    function montre(k, parle){
      n = Math.max(-1, Math.min(N, k));
      fermer();
      vue.classList.toggle("affiche", n < 0);
      vue.classList.toggle("finie", n >= N);
      kr.style.fontSize = "";
      kr.innerHTML = "";
      cur = null;

      if(n < 0){
        const aff = el(`<span class="st-ouv"><span class="n">${esc(ch.n)}</span>
          <span class="tk">${esc(ch.title_kr || "")}</span>
          <span class="tf">${esc(ch.title_fr || "")}</span>
          <span class="cast">${esc((ch.names || []).join("  ·  "))}</span></span>`);
        kr.appendChild(aff);
        const sortie = el(`<button class="st-sortie">sommaire</button>`);
        sortie.onclick = (ev) => { ev.stopPropagation(); renderHome(container, opts); };
        aff.appendChild(sortie);
        return;
      }
      if(n >= N){
        const fin = el(`<span class="st-fin"><span class="st-dojang"><span>끝</span></span></span>`);
        const suivant = chapitreSuivant(opts, ch);
        if(suivant){
          const b = el(`<button class="st-suite">Chapitre ${esc(suivant.n)} ›</button>`);
          b.onclick = (ev) => { ev.stopPropagation(); renderChapter(container, opts, suivant); };
          fin.appendChild(b);
        }else{
          const b = el(`<button class="st-suite">sommaire</button>`);
          b.onclick = (ev) => { ev.stopPropagation(); renderHome(container, opts); };
          fin.appendChild(b);
        }
        kr.appendChild(fin);
        if(opts.onLu) opts.onLu(ch.n);
        return;
      }

      const s = ch.sentences[n];
      cur = s;
      for(const bout of decouper(s)){
        if(!bout.m){ kr.appendChild(document.createTextNode(bout.t)); continue; }
        const b = el(`<button class="st-w">${esc(bout.t)}</button>`);
        b.onclick = (ev) => {
          ev.stopPropagation();
          if(vu === b) fermer();            /* re-toucher le même mot le referme */
          else montrerMot(b, bout.m);
        };
        kr.appendChild(b);
      }
      cpt.textContent = String(n + 1);
      ajuste();
      /* on avance, ça se dit : la lecture à voix haute suit le fil sans qu'on la redemande */
      if(parle && opts.speak) opts.speak(s.kr);
    }

    /* toucher le fond du texte referme la révélation ; les mots, eux, arrêtent la propagation */
    haut.onclick = () => {
      if(n < 0){ montre(0, true); return; }
      if(vu) fermer();
    };
    /* l'œil montre — ou cache — la traduction de toute la phrase */
    oeil.onclick = () => {
      if(n < 0 || n >= N) return;
      if(vu === "fr") fermer(); else montrerPhrase();
    };
    vue.querySelector(".st-son").onclick = () => {
      if(n >= 0 && n < N && opts.speak) opts.speak(ch.sentences[n].kr);
    };
    /* reculer avant le début, c'est ressortir : on retourne au sommaire */
    vue.querySelector(".prec").onclick = () => {
      if(n <= -1) renderHome(container, opts); else montre(n - 1, false);
    };
    vue.querySelector(".suiv").onclick = () => montre(n + 1, true);

    montre(-1, false);
  }

  function chapitreSuivant(opts, ch){
    const corpus = (opts.corpus || []).slice().sort((a, b) => (a.n || 0) - (b.n || 0));
    const dispo = availability(corpus, opts.profile, opts.labelOf, opts.ouverts);
    const i = corpus.findIndex(c => c.n === ch.n);
    return (i >= 0 && i + 1 < corpus.length && dispo[i + 1].status === "ok") ? corpus[i + 1] : null;
  }

  const API = { renderHome, renderChapter,
                pure: { availability, lintChapter, formMatchesLemma, normLemma, decouper } };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.SORI_STORY = API;
})(typeof self !== "undefined" ? self : this);

/* Sori — quests.js : quêtes du jour + badges (logique pure + rendu), autonome.
   - PRINCIPE NON NÉGOCIABLE : des PLANCHERS, jamais des plafonds. Une quête
     « finie » n'arrête rien : la progression continue de s'afficher au-delà
     de 100 % (« 37/20 ✨ ») et aucun contenu n'est jamais bloqué.
   - Partie PURE : dailyQuests / questProgress / badges / claimable — zéro DOM,
     zéro localStorage (journal + état passés en argument). Même pattern
     double environnement qu'events.js : testable sous Node (module.exports).
   - Partie RENDU : SORI_QUESTS.renderCard(container, opts) — fabrique des
     .card cohérentes avec style.css (.card/.dim/.progressbar/.pill + préfixe
     .quest-* et .badge-*). compact:true => seulement les 3 quêtes du jour
     (écran de fin de session) ; compact:false => quêtes + grille de badges.
   - La persistance (« réclamée aujourd'hui ») reste côté app : renderCard
     reçoit state.qdone et rappelle onClaim(questId, bonusXp) ; il ne touche
     JAMAIS le localStorage.

   opts = {
     today:  "AAAA-MM-JJ"          (défaut : date locale du jour)
     log:    ST.log                (défaut : {} — tout affiche 0)
     state:  {
       xp, streak,
       itemsSummary: { matures, beatenEnemies, totalEnemies,
                       stage3plus, totalItems },     // pour les badges
       scen:       ST.scen,                          // meilleurs scores scénarios
       scenTotals: {id: nbRépliques}  (défaut : dérivé de window.SCENARIOS),
       examCount,                     (optionnel — badge « premier bilan »)
       qdone: {questId:true}          // quêtes déjà réclamées AUJOURD'HUI
     }
     onClaim: function(questId, bonusXp)  (optionnel — sans lui, pas de bouton)
     compact: bool
   } */
(function(root){
  "use strict";

  /* ================= PUR : mesures depuis le journal du jour =================
     Chaque mesure lit le format ST.log[date] = {ok,ko,n,listen,xp,
     k:{qcm1,qcm2,qcm3,build,rec4,rec5,recrev,listen,dictee,scenario:{o,x,t,c}}}.
     Tout champ absent => 0 (jour vide, vieux journal : jamais d'erreur). */
  function kOk(kind){
    return function(l){ var k = (l.k||{})[kind]; return k ? (k.o||0) : 0; };
  }
  var MEASURES = {
    n:         function(l){ return l.n||0; },
    listen:    function(l){ return l.listen||0; },
    xp:        function(l){ return l.xp||0; },
    build_ok:  kOk("build"),
    qcm2_ok:   kOk("qcm2"),
    rec5_ok:   kOk("rec5"),
    dictee_ok: kOk("dictee"),
    scenario:  function(l){ var k=(l.k||{}).scenario; return k ? (k.o||0)+(k.x||0) : 0; }
  };

  /* ================= PUR : pool de quêtes =================
     4 modèles par palier — le hash du jour en choisit 1 de chaque.
     Les ids sont ÉTERNELS (clés de state.qdone) : ne jamais les renommer. */
  var TIER_BONUS = { facile:30, moyen:50, ambitieux:80 };
  var POOL = {
    facile: [
      { id:"reponses30",    emoji:"🎯", label:"Réponds à 30 questions",             measure:"n",         target:30 },
      { id:"ecoute10",      emoji:"👂", label:"Fais 10 exercices d'écoute",         measure:"listen",    target:10 },
      { id:"session20",     emoji:"📚", label:"Termine une session (20 réponses)",  measure:"n",         target:20 },
      { id:"scenario1",     emoji:"🎭", label:"Joue 1 scénario",                    measure:"scenario",  target:1  }
    ],
    moyen: [
      { id:"reponses50",    emoji:"🎯", label:"Réponds à 50 questions",             measure:"n",         target:50 },
      { id:"construction3", emoji:"🧩", label:"Réussis 3 constructions de phrases", measure:"build_ok",  target:3  },
      { id:"xp150",         emoji:"✨", label:"Gagne 150 XP",                       measure:"xp",        target:150 },
      { id:"dictee4",       emoji:"✍️", label:"Dictée : 4 bonnes réponses",         measure:"dictee_ok", target:4  }
    ],
    ambitieux: [
      { id:"reponses80",    emoji:"🎯", label:"Réponds à 80 questions",             measure:"n",         target:80 },
      { id:"qcm10",         emoji:"⚔️", label:"Réussis 10 QCM coréen → français",   measure:"qcm2_ok",   target:10 },
      { id:"rappel5",       emoji:"🧠", label:"Réussis 5 rappels purs",             measure:"rec5_ok",   target:5  },
      { id:"xp300",         emoji:"💥", label:"Gagne 300 XP",                       measure:"xp",        target:300 }
    ]
  };

  /* hash déterministe (djb2-xor) : même date => mêmes 3 quêtes, sur tout
     appareil, sans rien stocker. */
  function hashStr(s){
    var h = 5381;
    for(var i=0;i<s.length;i++) h = (((h<<5)+h) ^ s.charCodeAt(i)) >>> 0;
    return h;
  }

  /* Les 3 quêtes du jour : 1 facile + 1 moyenne + 1 ambitieuse (ids toujours
     distincts puisque paliers distincts). Décalages de bits différents pour
     que les paliers varient indépendamment d'un jour à l'autre. */
  function dailyQuests(todayStr){
    var h = hashStr(String(todayStr||""));
    function pick(tier, shift){
      var arr = POOL[tier];
      var q = arr[(h >>> shift) % arr.length];
      return { id:q.id, emoji:q.emoji, label:q.label, measure:q.measure,
               target:q.target, tier:tier, bonus:TIER_BONUS[tier] };
    }
    return [ pick("facile",0), pick("moyen",5), pick("ambitieux",10) ];
  }

  /* ================= PUR : progression d'une quête =================
     -> { value, target, done, ratio } — ratio plafonné à 1 (pour la barre),
     mais `value` continue de monter au-delà de target : PLANCHER, pas plafond. */
  function questProgress(quest, log, todayStr){
    var l = (log||{})[todayStr] || {};
    var fn = (quest && MEASURES[quest.measure]) || function(){ return 0; };
    var value = fn(l), target = (quest && quest.target) || 1;
    return { value:value, target:target, done:value>=target,
             ratio:Math.min(1, value/target) };
  }

  /* Réclamable = finie ET pas encore réclamée aujourd'hui. Réclamer est
     idempotent : une fois qdone[id] posé par l'app, plus jamais de bouton. */
  function claimable(quest, prog, qdone){
    return !!(prog && prog.done && quest && !((qdone||{})[quest.id]));
  }

  /* ================= PUR : badges (calculés, jamais stockés) =================
     state = { log, xp, streak, itemsSummary:{matures, beatenEnemies,
               totalEnemies, stage3plus, totalItems}, scen, scenTotals,
               examCount } — tout champ absent => badge simplement non acquis.
     -> [{id, emoji, label, cond, got, detail}] */
  function scenTotalsFromData(data){
    var t = {};
    (Array.isArray(data) ? data : []).forEach(function(sc){
      if(sc && sc.id && Array.isArray(sc.steps)) t[sc.id] = sc.steps.length;
    });
    return t;
  }
  function badges(state){
    state = state || {};
    var log    = state.log || {};
    var xp     = state.xp || 0;
    var streak = state.streak || 0;
    var its    = state.itemsSummary || {};
    var scen   = state.scen || {};
    var totals = state.scenTotals || scenTotalsFromData(root.SCENARIOS);

    var listenDays = 0;
    Object.keys(log).forEach(function(d){ if((log[d]||{}).listen > 0) listenDays++; });
    var scenIds = Object.keys(totals);
    var scenPerfect = scenIds.filter(function(id){ return (scen[id]||0) >= totals[id]; }).length;
    var matures = its.matures || 0;
    var beaten  = its.beatenEnemies || 0, totEn = its.totalEnemies || 0;
    var s3 = its.stage3plus || 0, tot = its.totalItems || 0;
    var collPct = tot > 0 ? Math.round(100*s3/tot) : 0;

    function B(id, emoji, label, cond, got, detail){
      return { id:id, emoji:emoji, label:label, cond:cond, got:!!got, detail:detail||"" };
    }
    return [
      B("streak3",    "🔥", "3 jours de suite",   "Étudie 3 jours d'affilée",                    streak>=3,   streak+"/3 j"),
      B("streak7",    "⚡", "1 semaine de suite",  "Étudie 7 jours d'affilée",                    streak>=7,   streak+"/7 j"),
      B("streak30",   "🌙", "1 mois de suite",     "Étudie 30 jours d'affilée",                   streak>=30,  streak+"/30 j"),
      B("matures100", "🌱", "100 mots mûrs",       "100 mots au niveau rappel (niv ≥ 4)",         matures>=100, matures+"/100"),
      B("matures300", "🌳", "300 mots mûrs",       "300 mots au niveau rappel (niv ≥ 4)",         matures>=300, matures+"/300"),
      B("matures600", "🌲", "600 mots mûrs",       "600 mots au niveau rappel (niv ≥ 4)",         matures>=600, matures+"/600"),
      B("enemies",    "⚔️", "Ennemies vaincues",   "Toutes les ennemies au niv ≥ 4",              totEn>0 && beaten>=totEn, beaten+"/"+totEn),
      B("scenarios",  "🎭", "Scénarios parfaits",  "Tous les scénarios sans faute du premier coup",
                            scenIds.length>0 && scenPerfect>=scenIds.length,  scenPerfect+"/"+(scenIds.length||"?")),
      B("bilan1",     "🎓", "Premier bilan",       "Passe ton premier bilan",                     (state.examCount||0)>0, ""),
      B("xp10000",    "💎", "10 000 XP",           "Cumule 10 000 XP",                            xp>=10000,   xp+"/10000"),
      B("ecoute7",    "👂", "Oreille affûtée",     "De l'écoute sur 7 jours (en tout)",           listenDays>=7, listenDays+"/7 j"),
      B("coll50",     "📖", "Collection 50 %",     "La moitié du deck au niv ≥ 3",                tot>0 && s3/tot>=0.5, collPct+" %"),
      B("coll80",     "📚", "Collection 80 %",     "80 % du deck au niv ≥ 3",                     tot>0 && s3/tot>=0.8, collPct+" %")
    ];
  }

  /* ================= RENDU ================= */
  /* Helpers locaux (mêmes conventions qu'app.js — non exposés par lui). */
  function esc(s){ return String(s).replace(/[&<>"']/g, function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function el(html){ var t=document.createElement("template"); t.innerHTML=html.trim(); return t.content.firstChild; }

  /* Styles .quest-* et .badge-* injectés une seule fois — style.css n'est pas
     modifié, tout passe par les variables :root existantes (thèmes inclus). */
  var CSS = [
    ".quest-list{display:flex; flex-direction:column; gap:12px; margin-top:10px}",
    ".quest-head{display:flex; align-items:center; gap:8px; margin-bottom:6px}",
    ".quest-emoji{font-size:1.15rem; line-height:1}",
    ".quest-label{flex:1; font-size:.92rem; line-height:1.3}",
    ".quest-bonus{color:var(--acc); white-space:nowrap; margin:0}",
    ".quest-val{font-size:.85rem; color:var(--dim); font-variant-numeric:tabular-nums; white-space:nowrap}",
    ".quest-val.done{color:var(--ok); font-weight:600}",
    ".quest-bar.done>div{background:var(--ok)}",
    ".quest-claim{margin-top:8px; width:100%}",
    ".quest-compact .quest-list{gap:10px}",
    ".quest-compact .quest-label{font-size:.88rem}",
    ".quest-badges{display:grid; grid-template-columns:repeat(auto-fill,minmax(100px,1fr)); gap:8px; margin-top:10px}",
    ".badge-tile{background:var(--panel2); border:1px solid var(--line); border-radius:10px; padding:10px 6px; text-align:center}",
    ".badge-tile.on{border-color:var(--acc)}",
    ".badge-tile.off{opacity:.45}",
    ".badge-tile.off .badge-emoji{filter:grayscale(1)}",
    ".badge-emoji{font-size:1.6rem; line-height:1.2}",
    ".badge-label{font-size:.72rem; font-weight:600; margin-top:4px}",
    ".badge-cond{font-size:.62rem; color:var(--dim); margin-top:2px; line-height:1.35}"
  ].join("\n");
  function injectStyles(){
    if(document.getElementById("quest-styles")) return;
    var s = document.createElement("style");
    s.id = "quest-styles"; s.textContent = CSS;
    document.head.appendChild(s);
  }

  function questRow(q, p, claimed, canClaim, onClaim){
    var over   = p.value > p.target;
    var valTxt = p.value + "/" + p.target + (over ? " ✨" : "");
    var row = el('<div class="quest-row">'+
      '<div class="quest-head">'+
        '<span class="quest-emoji">'+esc(q.emoji)+'</span>'+
        '<span class="quest-label">'+esc(q.label)+'</span>'+
        (claimed ? "" : '<span class="pill quest-bonus">+'+q.bonus+' XP</span>')+
        '<span class="quest-val'+((p.done||claimed)?" done":"")+'">'+esc(valTxt)+(claimed?" ✅":"")+'</span>'+
      '</div>'+
      '<div class="progressbar quest-bar'+(p.done?" done":"")+'"><div style="width:'+Math.round(100*p.ratio)+'%"></div></div>'+
      '</div>');
    if(canClaim && typeof onClaim==="function"){
      var b = el('<button class="btn small quest-claim">Réclamer +'+q.bonus+' XP ✨</button>');
      b.onclick = function(){
        if(b.disabled) return;               // anti double-tap : un seul claim
        b.disabled = true;
        var v = row.querySelector(".quest-val");
        if(v){ v.classList.add("done"); v.textContent = valTxt + " ✅"; }
        var pill = row.querySelector(".quest-bonus");
        if(pill) pill.remove();
        b.remove();
        onClaim(q.id, q.bonus);
      };
      row.appendChild(b);
    }
    return row;
  }

  /* renderCard(container, opts) -> nombre de quêtes rendues (toujours 3). */
  function renderCard(container, opts){
    if(!container) return 0;
    opts = opts || {};
    var today = opts.today;
    if(!today){ var d=new Date(); today = d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
    var log   = opts.log || {};
    var state = opts.state || {};
    var qdone = state.qdone || {};
    injectStyles();

    var quests = dailyQuests(today);
    var card = el('<div class="card quest-card'+(opts.compact?" quest-compact":"")+'">'+
      '<h2>🎯 Quêtes du jour</h2>'+
      (opts.compact ? "" :
        '<p class="dim">Des planchers, jamais des plafonds — tout continue au-delà de 100 %.</p>')+
      '<div class="quest-list"></div></div>');
    var list = card.querySelector(".quest-list");
    quests.forEach(function(q){
      var p = questProgress(q, log, today);
      var claimed = !!qdone[q.id];
      list.appendChild(questRow(q, p, claimed, claimable(q, p, qdone), opts.onClaim));
    });
    container.appendChild(card);

    if(!opts.compact){
      var bs = badges(Object.assign({}, state, { log: log }));
      var got = bs.filter(function(b){ return b.got; }).length;
      var bcard = el('<div class="card quest-card">'+
        '<h2>🏅 Badges <span class="dim" style="font-weight:500">'+got+'/'+bs.length+'</span></h2>'+
        '<div class="quest-badges"></div></div>');
      var grid = bcard.querySelector(".quest-badges");
      bs.forEach(function(b){
        grid.appendChild(el('<div class="badge-tile '+(b.got?"on":"off")+'" title="'+esc(b.cond)+'">'+
          '<div class="badge-emoji">'+esc(b.emoji)+'</div>'+
          '<div class="badge-label">'+esc(b.label)+'</div>'+
          '<div class="badge-cond">'+esc(b.got ? (b.detail||"débloqué ✓") : b.cond+(b.detail?" · "+b.detail:""))+'</div>'+
          '</div>'));
      });
      container.appendChild(bcard);
    }
    return quests.length;
  }

  /* ================= export double environnement ================= */
  var SORI_QUESTS = { renderCard: renderCard,
    pure: { dailyQuests: dailyQuests, badges: badges,
            questProgress: questProgress, claimable: claimable } };
  if (typeof module !== "undefined" && module.exports) module.exports = SORI_QUESTS;
  else root.SORI_QUESTS = SORI_QUESTS;
})(typeof self !== "undefined" ? self : this);

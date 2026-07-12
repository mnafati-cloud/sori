/* Sori — events.js : moteur d'événements (logique pure + rendu), autonome.
   - Les DONNÉES vivent dans docs/events-data.js (window.EVENTS_DATA) —
     c'est le seul fichier qu'un mainteneur édite (voir MAINTENANCE-EVENTS.md).
   - Partie PURE : activeEvents / eventProgress — zéro DOM, zéro
     localStorage (le journal est passé en argument). Même pattern double
     environnement qu'engine.js : testable sous Node (module.exports).
   - Partie RENDU : SORI_EVENTS.renderCards(container, opts) — fabrique
     des .card cohérentes avec style.css (classes .card/.dim/.progressbar
     + préfixe .event-*). ZÉRO événement actif => ne rend RIEN.
   - La persistance du « masquer » reste côté app : renderCards reçoit
     `dismissed` et rappelle `onDismiss(id)` ; il ne touche JAMAIS le
     localStorage. */
(function(root){
  "use strict";

  /* ================= dates ================= */
  var ISO = /^\d{4}-\d{2}-\d{2}$/;
  function daysBetween(a, b){   // b - a, en jours entiers (dates ISO)
    return Math.round((new Date(b+"T12:00:00") - new Date(a+"T12:00:00")) / 86400000);
  }
  function frDate(iso){         // "2026-10-01" -> "1 octobre 2026" (repli : l'ISO brut)
    try{
      return new Date(iso+"T12:00:00").toLocaleDateString("fr-FR",
        { day:"numeric", month:"long", year:"numeric" });
    }catch(e){ return iso; }
  }

  /* ================= PUR : sélection ================= */
  /* Événements actifs à la date donnée : entrées valides (id, type, dates
     ISO) avec from <= today < to, triées par fin la plus proche d'abord. */
  function activeEvents(data, todayStr){
    return (Array.isArray(data) ? data : []).filter(function(ev){
      return ev && typeof ev.id==="string" && ev.id
        && typeof ev.type==="string"
        && ISO.test(ev.from||"") && ISO.test(ev.to||"")
        && ev.from <= todayStr && todayStr < ev.to;
    }).sort(function(a,b){
      return (a.to<b.to?-1:a.to>b.to?1:0)
          || (a.from<b.from?-1:a.from>b.from?1:0)
          || (a.id<b.id?-1:1);
    });
  }

  /* ================= PUR : progression ================= */
  /* - countdown  -> { daysLeft, totalDays, ratio, milestone|null }
       daysLeft >= 1 tant que l'événement est actif (today < to).
       milestone = le jalon atteint le plus récent (plus petit `at` tel
       que daysLeft <= at), ou null.
     - challenge  -> { metric, target, count, ratio, done } — somme du
       journal `log` (format ST.log : {date:{ok,ko,n,listen}}) sur
       [from, to). metric : reviews|ok|listen|days.
     - message / type inconnu / challenge sans goal valide -> null. */
  function eventProgress(ev, todayStr, log){
    if(!ev) return null;
    if(ev.type==="countdown"){
      var total    = Math.max(1, daysBetween(ev.from, ev.to));
      var daysLeft = Math.max(0, daysBetween(todayStr, ev.to));
      var ratio    = Math.min(1, Math.max(0, daysBetween(ev.from, todayStr) / total));
      var milestone = null;
      (ev.milestones||[]).forEach(function(m){
        if(m && typeof m.at==="number" && daysLeft<=m.at
           && (!milestone || m.at<milestone.at)) milestone = m;
      });
      return { daysLeft:daysLeft, totalDays:total, ratio:ratio, milestone:milestone };
    }
    if(ev.type==="challenge"){
      var goal = ev.goal || {}, metric = null;
      ["reviews","ok","listen","days"].some(function(k){
        if(typeof goal[k]==="number" && goal[k]>0){ metric=k; return true; } return false;
      });
      if(!metric) return null;                 // challenge sans objectif valide -> ignoré
      var target = goal[metric], count = 0, L = log||{};
      Object.keys(L).forEach(function(d){
        if(!(ev.from<=d && d<ev.to)) return;
        var l = L[d]||{};
        if(metric==="reviews")     count += l.n||0;
        else if(metric==="ok")     count += l.ok||0;
        else if(metric==="listen") count += l.listen||0;
        else if(metric==="days")   count += (l.n>0 ? 1 : 0);
      });
      return { metric:metric, target:target, count:count,
               ratio:Math.min(1, count/target), done:count>=target };
    }
    return null;   // message : rien à calculer ; type inconnu : idem
  }

  /* ================= RENDU ================= */
  /* Helpers locaux (mêmes conventions qu'app.js — non exposés par lui). */
  function esc(s){ return String(s).replace(/[&<>"']/g, function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function el(html){ var t=document.createElement("template"); t.innerHTML=html.trim(); return t.content.firstChild; }

  /* Styles .event-* injectés une seule fois, seulement si au moins une
     carte est rendue — style.css n'est pas modifié, tout passe par les
     variables :root existantes. */
  var CSS = [
    ".event-card{position:relative}",
    ".event-dismiss{position:absolute; top:4px; right:6px; background:none; border:none;",
    "  color:var(--dim); font-size:.95rem; padding:8px; cursor:pointer; opacity:.55; line-height:1}",
    ".event-head{display:flex; align-items:center; gap:10px; padding-right:26px}",
    ".event-emoji{font-size:1.55rem; line-height:1}",
    ".event-title{margin:0; font-size:1.05rem}",
    ".event-days{font-size:2rem; font-weight:700; color:var(--acc); text-align:center;",
    "  margin:10px 0 8px; font-variant-numeric:tabular-nums}",
    ".event-days small{display:block; font-size:.78rem; font-weight:500; color:var(--dim); margin-top:2px}",
    ".event-count{font-size:1.5rem; font-weight:700; color:var(--acc); text-align:center;",
    "  margin:10px 0 8px; font-variant-numeric:tabular-nums}",
    ".event-count.done{color:var(--ok)}",
    ".event-milestone{margin-top:8px}",
    ".event-text{margin:6px 0 0}"
  ].join("\n");
  function injectStyles(){
    if(document.getElementById("event-styles")) return;
    var s = document.createElement("style");
    s.id = "event-styles"; s.textContent = CSS;
    document.head.appendChild(s);
  }

  function headHtml(ev){
    return '<div class="event-head"><span class="event-emoji" hidden>'+esc(ev.emoji||"")+
           '</span><h2 class="event-title">'+esc(ev.title||"")+'</h2></div>';
  }
  function cardCountdown(ev, p){
    return el('<div class="card event-card event-countdown">'+headHtml(ev)+
      '<div class="event-days">J-'+p.daysLeft+
        '<small>'+(p.daysLeft>1 ? p.daysLeft+" jours" : "dernier jour")+" — le "+esc(frDate(ev.to))+'</small></div>'+
      '<div class="progressbar"><div style="width:'+Math.round(100*p.ratio)+'%"></div></div>'+
      (p.milestone ? '<div class="dim event-milestone">'+esc(p.milestone.label||"")+'</div>' : "")+
      '</div>');
  }
  function cardMessage(ev){
    return el('<div class="card event-card event-message">'+headHtml(ev)+
      (ev.text ? '<p class="dim event-text">'+esc(ev.text)+'</p>' : "")+
      '</div>');
  }
  var METRIC_LABEL = { reviews:"réponses", ok:"bonnes réponses", listen:"réponses en écoute", days:"jours actifs" };
  function cardChallenge(ev, p){
    return el('<div class="card event-card event-challenge">'+headHtml(ev)+
      '<div class="event-count'+(p.done?" done":"")+'">'+(p.done?"✓ ":"")+p.count+" / "+p.target+
        ' <span class="dim" style="font-size:.8rem; font-weight:500">'+(METRIC_LABEL[p.metric]||p.metric)+'</span></div>'+
      '<div class="progressbar"><div style="width:'+Math.round(100*p.ratio)+'%"></div></div>'+
      (ev.text ? '<p class="dim event-text">'+esc(ev.text)+'</p>' : "")+
      '</div>');
  }

  /* renderCards(container, opts) -> nombre de cartes rendues.
     opts = {
       today:     "AAAA-MM-JJ"  (défaut : date locale du jour)
       log:       ST.log        (défaut : {} — les challenges affichent 0)
       dismissed: {id:true}     (défaut : {} — rien de masqué)
       onDismiss: function(id)  (optionnel — sans lui, pas de bouton masquer)
       data:      tableau       (défaut : window.EVENTS_DATA — override pour tests)
     }
     0 événement actif (ou tous masqués) => AUCUN nœud ajouté, retourne 0. */
  function renderCards(container, opts){
    opts = opts || {};
    var data      = opts.data || root.EVENTS_DATA || [];
    var dismissed = opts.dismissed || {};
    var log       = opts.log || {};
    var today     = opts.today;
    if(!today){ var d=new Date(); today = d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
    var n = 0;
    activeEvents(data, today).forEach(function(ev){
      if(dismissed[ev.id]) return;
      var p = eventProgress(ev, today, log), card = null;
      if(ev.type==="countdown")           card = cardCountdown(ev, p);
      else if(ev.type==="message")        card = cardMessage(ev);
      else if(ev.type==="challenge" && p) card = cardChallenge(ev, p);
      if(!card) return;                   // type inconnu / invalide -> ignoré sans bruit
      if(n===0) injectStyles();
      if(typeof opts.onDismiss==="function"){
        var b = el('<button class="event-dismiss" title="Masquer cet événement">×</button>');
        b.onclick = function(){ card.remove(); opts.onDismiss(ev.id); };
        card.appendChild(b);
      }
      container.appendChild(card);
      n++;
    });
    return n;
  }

  /* ================= export double environnement ================= */
  var SORI_EVENTS = { renderCards: renderCards,
                      pure: { activeEvents: activeEvents, eventProgress: eventProgress } };
  if (typeof module !== "undefined" && module.exports) module.exports = SORI_EVENTS;
  else root.SORI_EVENTS = SORI_EVENTS;
})(typeof self !== "undefined" ? self : this);

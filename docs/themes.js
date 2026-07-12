/* ============================================================
   Sori — themes.js · applicateur de thèmes, autonome
   ============================================================
   À charger dans <head>, APRÈS <meta name="theme-color"> et les
   <link> CSS : la classe est posée sur <html> avant le premier
   rendu — pas de flash de thème.

   - Stockage : localStorage "sori-theme" (clé séparée, ne touche
     JAMAIS "sori-state-v1"). Valeur inconnue ou absente → "seoul".
   - API : window.SORI_THEMES = { list, get(), set(id) }
     set(id) applique la classe, persiste, et met à jour
     <meta name="theme-color">.
   ============================================================ */
(function(){
  "use strict";
  var KEY = "sori-theme";
  var DEFAULT_ID = "encre";
  var THEMES = [
    {id:"encre",      label:"Encre & sceau",  cls:"theme-encre",      color:"#10141B"},
    {id:"seoul",      label:"Séoul nuit",     cls:"theme-seoul",      color:"#0a0a12"},
    {id:"nuit",       label:"Bleu nuit",      cls:"theme-nuit",       color:"#0f172a"},
    {id:"hanji",      label:"Hanji (clair)",  cls:"theme-hanji",      color:"#FFFDF6"},
    {id:"dansaekhwa", label:"Dansaekhwa",     cls:"theme-dansaekhwa", color:"#0f0d0a"}
  ];
  /* v69 : migration UNE FOIS vers le nouveau défaut « Encre & sceau » (refonte validée user).
     Un thème choisi APRÈS la migration reste respecté (la clé -mig l'atteste). */
  try{
    if(localStorage.getItem(KEY + "-mig") !== "1"){
      localStorage.setItem(KEY + "-mig", "1");
      if(localStorage.getItem(KEY) === "seoul") localStorage.setItem(KEY, "encre");
    }
  }catch(e){}

  function find(id){
    for(var i=0;i<THEMES.length;i++) if(THEMES[i].id===id) return THEMES[i];
    return null;
  }
  function stored(){
    var v = null;
    try{ v = localStorage.getItem(KEY); }catch(e){ /* stockage bloqué → défaut */ }
    return find(v) || find(DEFAULT_ID);
  }
  function apply(t){
    var root = document.documentElement;
    for(var i=0;i<THEMES.length;i++) root.classList.remove(THEMES[i].cls);
    root.classList.add(t.cls);
    var m = document.querySelector('meta[name="theme-color"]');
    if(!m){
      m = document.createElement("meta");
      m.setAttribute("name","theme-color");
      (document.head || root).appendChild(m);
    }
    m.setAttribute("content", t.color);
  }

  /* application immédiate au chargement (script dans <head> → zéro flash) */
  apply(stored());

  window.SORI_THEMES = {
    list: THEMES.map(function(t){ return {id:t.id, label:t.label}; }),
    get: function(){ return stored().id; },
    set: function(id){
      var t = find(id);
      if(!t) return false;
      try{ localStorage.setItem(KEY, t.id); }catch(e){ /* on applique quand même */ }
      apply(t);
      return true;
    }
  };
})();

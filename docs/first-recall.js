/* Essai borné à 60 paires de nouveaux mots. Chaque paire a un témoin et un renfort,
   attribués à la première réponse, indépendamment de son verdict. */
(function(root){
  "use strict";
  const limit = 120;
  function record(cards, it, {day, count, ok, result, fsrs, bonus}, random=Math.random){
    let card = cards[it.id];
    if(!card){
      if(!fsrs || bonus || !result || result.counted || it.rev || it.type !== "word" ||
         it.stage !== 1 || it.itv || it.ok || it.ko || it.S != null || it.D != null) return;
      const enrolled = Object.values(cards);
      if(enrolled.length >= limit) return;
      const reinforced = enrolled.filter(c => c.group === 1).length;
      const controls = enrolled.length - reinforced;
      const group = reinforced === controls ? Number(random() < 0.5) : Number(reinforced < controls);
      card = cards[it.id] = {group, day, trigger:count+24, responses:0};
    }
    // 31 jours calendaires, jour d'introduction inclus. Une observation par carte et par critère.
    const age = (Date.parse(day) - Date.parse(card.day)) / 86400000;
    if(age < 0 || age > 30) return;
    card.responses++;
    if(age === 0){
      card.trigger = Math.max(card.trigger, count+12);
    } else if(fsrs && !bonus && result?.counted){
      if(card.first === undefined){ card.first = Number(ok); card.firstDay = age; }
      if(card.long === undefined && result.elapsed >= 8 && result.elapsed <= 30) card.long = Number(ok);
    }
  }
  function next(cards, day, count, available){
    return Object.keys(cards).find(id => {
      const c = cards[id];
      return c.group === 1 && c.day === day && !c.extra && count >= c.trigger && available(id);
    });
  }
  const api = {record, next};
  if(typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SORI_FIRST_RECALL = api;
})(typeof window !== "undefined" ? window : globalThis);

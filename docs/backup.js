/* Sauvegarde cloud v2 : codec sans perte, état local et secours fichier toujours en v1.
   Ne change ni les valeurs, ni les ids, ni l'ordre/longueur des lignes du journal.
   Le masque distingue un champ absent d'un champ présent à null/0/false.
   Les champs inconnus sont conservés dans l'objet final de chaque tuple. */
(function(root){
  "use strict";
  const CODEC = "sori-compact-v1";
  const FIELDS = ["s", "i", "d", "e", "ok", "ko", "S", "D", "sk", "lp", "sus"];
  const RLOG_FIELDS = [0, 1, 4]; // date, id, kind : chaînes exclusivement
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const object = o => o !== null && typeof o === "object" && !Array.isArray(o);
  function invalid(){ throw new Error("Sauvegarde Sori invalide ou format non pris en charge"); }
  function validate(data){
    if(!object(data) || data.app !== "sori" || !object(data.state)) invalid();
  }
  function pack(data){
    validate(data);
    // Même sémantique JSON que l'ancien export : undefined omis, objets toJSON normalisés.
    // On fige aussi les sections partagées avant toute opération asynchrone.
    data = JSON.parse(JSON.stringify(data));
    validate(data);
    if(data.v !== 1 || own(data, "encoding")) invalid();
    const items = {}, strings = [], indexes = new Map();
    for(const [id, it] of Object.entries(data.state.items || {})){
      if(!object(it)) invalid();
      let mask = 0;
      const values = [], extra = {};
      FIELDS.forEach((k, i) => { if(own(it, k)){ mask |= 1 << i; values.push(it[k]); } });
      for(const [k, v] of Object.entries(it)) if(!FIELDS.includes(k)) Object.defineProperty(extra, k, {value:v, enumerable:true});
      if(Object.keys(extra).length) values.push(extra);
      Object.defineProperty(items, id, {value:[mask, ...values], enumerable:true});
    }
    const rlog = (data.state.rlog || []).map(row => {
      if(!Array.isArray(row)) invalid();
      const out = row.slice();
      for(const i of RLOG_FIELDS){
        if(i >= row.length) continue;
        if(typeof row[i] !== "string") invalid();
        if(!indexes.has(row[i])){ indexes.set(row[i], strings.length); strings.push(row[i]); }
        out[i] = indexes.get(row[i]);
      }
      return out;
    });
    return {...data, v:2, encoding:{codec:CODEC, strings}, state:{...data.state, items, rlog}};
  }
  function unpack(data){
    validate(data);
    if(data.v === 1 && !own(data, "encoding")) return data;
    const enc = data.encoding;
    if(data.v !== 2 || !object(enc) || enc.codec !== CODEC || !Array.isArray(enc.strings)
       || !enc.strings.every(s => typeof s === "string") || !object(data.state.items)
       || !Array.isArray(data.state.rlog)) invalid();
    const items = {};
    for(const [id, tuple] of Object.entries(data.state.items)){
      if(!Array.isArray(tuple) || !Number.isInteger(tuple[0]) || tuple[0] < 0 || tuple[0] >= (1 << FIELDS.length)) invalid();
      const it = {}; let pos = 1;
      FIELDS.forEach((k, i) => { if(tuple[0] & (1 << i)){ if(pos >= tuple.length) invalid(); it[k] = tuple[pos++]; } });
      if(pos < tuple.length){
        const extra = tuple[pos++];
        if(!object(extra) || Object.keys(extra).some(k => FIELDS.includes(k))) invalid();
        for(const [k, v] of Object.entries(extra)) Object.defineProperty(it, k, {value:v, enumerable:true, writable:true, configurable:true});
      }
      if(pos !== tuple.length) invalid();
      Object.defineProperty(items, id, {value:it, enumerable:true, writable:true, configurable:true});
    }
    const rlog = data.state.rlog.map(row => {
      if(!Array.isArray(row)) invalid();
      const out = row.slice();
      for(const i of RLOG_FIELDS){
        if(i >= row.length) continue;
        const n = row[i];
        if(!Number.isInteger(n) || n < 0 || n >= enc.strings.length) invalid();
        out[i] = enc.strings[n];
      }
      return out;
    });
    const out = {...data, v:1, state:{...data.state, items, rlog}};
    delete out.encoding;
    return out;
  }
  function bytes(data){ return new TextEncoder().encode(JSON.stringify(data)).length; }
  const api = {pack, unpack, bytes};
  if(typeof module !== "undefined" && module.exports) module.exports = api;
  root.SORI_BACKUP = api;
})(typeof window !== "undefined" ? window : globalThis);

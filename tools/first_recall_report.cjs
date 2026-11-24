/* Rapport agrégé à partir d'un export Sori local (fichier ou sauvegarde compacte). */
const fs = require('node:fs');
const {unpack} = require('../docs/backup.js');
const {daysBetween} = require('../docs/engine.js');

function summarize(state){
  // Un jour actif ultérieur garantit que J+30 est entièrement passé dans le fuseau du téléphone.
  const lastDay = Object.keys(state.log || {}).sort().at(-1);
  const cards = Object.values(state.firstRecall || {});
  return [0, 1].map(group => {
    const all = cards.filter(c => c.group === group);
    const mature = all.filter(c => lastDay && daysBetween(c.day, lastDay) > 30);
    const sum = (rows, value) => rows.reduce((n, c) => n + value(c), 0);
    const outcome = key => {
      const seen = mature.filter(c => c[key] !== undefined);
      return {success:sum(seen, c => c[key]), observed:seen.length, missing:mature.length-seen.length};
    };
    const firstDays = mature.filter(c => Number.isFinite(c.firstDay));
    const meanFirstDay = firstDays.length ? sum(firstDays, c => c.firstDay) / firstDays.length : null;
    return {group, meanFirstDay, enrolled:all.length, shown:all.filter(c => c.extra === 'shown').length,
      skipped:all.filter(c => c.extra === 'skipped').length, mature:mature.length,
      first:outcome('first'), long:outcome('long'),
      ordinary:sum(mature, c => c.responses), extra:sum(mature, c => Number(c.extra === 'shown'))};
  });
}
if(require.main === module){
  if(!process.argv[2]){ console.error('Usage : node tools/first_recall_report.cjs <export.json>'); process.exit(2); }
  const {state} = unpack(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')));
  const fraction = r => r.observed ? `${r.success}/${r.observed} (${(100*r.success/r.observed).toFixed(1)} %), ${r.missing} sans mesure` : `aucune mesure (${r.missing} sans mesure)`;
  for(const r of summarize(state)){
    console.log(r.group ? 'Renfort' : 'Témoin', '—', r.enrolled, 'mots attribués');
    if(r.group) console.log('Rappels supplémentaires révélés / passés :', r.shown, '/', r.skipped);
    console.log('Suivi complet de J0 à J+30 :', r.mature, 'mots');
    console.log('Premier retour espacé :', fraction(r.first));
    if(r.meanFirstDay !== null) console.log('Délai moyen au premier retour :', r.meanFirstDay.toFixed(1), 'jours');
    console.log('Premier intervalle de 8 à 30 jours :', fraction(r.long));
    console.log('Réponses ordinaires + rappels supplémentaires par mot suivi :',
      r.mature ? `(${r.ordinary} + ${r.extra}) / ${r.mature} = ${((r.ordinary+r.extra)/r.mature).toFixed(2)}` : 'en attente');
  }
}
module.exports = {summarize};

import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const dir=path.dirname(fileURLToPath(import.meta.url));
const profiles={
  'pinceau-blanc-v1':{style:'style.md',reference:'style-reference.png'},
  'pinceau-scenes-v1':{style:'style-scenes.md',reference:'style-scenes-reference.png'}
};
export function profileFor(item){
  const name=item.styleProfile||'pinceau-blanc-v1';
  const profile=Object.hasOwn(profiles,name)?profiles[name]:null;
  if(!profile)throw Error('Unknown style profile: '+item.styleProfile);
  if(item.styleProfile==='pinceau-scenes-v1' && item.usage!=='support')throw Error('Scenes are support only: '+item.id);
  return profile;
}
export async function referenceFor(item){return fs.readFile(path.join(dir,profileFor(item).reference));}
export async function promptFor(item){
  return await fs.readFile(path.join(dir,profileFor(item).style),'utf8')+'\n\nSubject:\n'+item.subject;
}

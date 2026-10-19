import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {profileFor,promptFor,referenceFor} from '../tools/images/profiles.mjs';

test('legacy image recipes keep their exact prompt and reference',async()=>{
  const inventory=JSON.parse(await fs.readFile(new URL('../tools/images/inventory.json',import.meta.url),'utf8'));
  const item=inventory.items.find(x=>x.status==='approved' && !x.styleProfile);
  const review=JSON.parse(await fs.readFile(new URL('../tools/images/reviews/'+item.asset.replace('.webp','.json'),import.meta.url),'utf8'));
  assert.equal(await promptFor(item),review.prompt);
  assert.deepEqual(await referenceFor(item),await fs.readFile(new URL('../tools/images/style-reference.png',import.meta.url)));
});
test('scene recipes use their own style and reference, only after the answer',async()=>{
  const item={id:'scene',usage:'support',styleProfile:'pinceau-scenes-v1',subject:'A rice paddy with visible water'};
  const style=await fs.readFile(new URL('../tools/images/style-scenes.md',import.meta.url),'utf8');
  assert.equal(await promptFor(item),style+'\n\nSubject:\n'+item.subject);
  assert.deepEqual(await referenceFor(item),await fs.readFile(new URL('../tools/images/style-scenes-reference.png',import.meta.url)));
  assert.throws(()=>profileFor({...item,usage:'question'}),/support only/);
});
test('unknown profiles cannot select arbitrary files',()=>{
  for(const styleProfile of ['unknown','../../style','constructor','toString'])
    assert.throws(()=>profileFor({styleProfile,usage:'support'}),/Unknown style profile/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {botanicalLeaf,botanicalPose} from '../../packages/garden-engine/botanical-mesh';
import {generatePlant,leafGrowth} from '../../packages/garden-engine';
import {leafRaster} from '../../packages/garden-engine/leaf-raster';
const sha=(a:Uint8Array)=>createHash('sha256').update(a).digest('hex');
test('botanical blades have finite normals-compatible indexed geometry at each growth stage',()=>{
  for(const seed of [0,1852006,0xffffffff])for(const week of [0,1,18,38,52]){
    const descriptor=generatePlant(seed);
    for(const d of descriptor.leaves){
      const a=botanicalLeaf(d,week),b=botanicalLeaf(d,week);assert.deepEqual(a,b);
      assert.equal(a.growth,leafGrowth(d,week));
      assert.equal(a.positions.length,25*11*3);assert.equal(a.uv.length,25*11*2);
      assert.equal(a.indices.length,24*10*6);
      assert.ok(a.positions.every(Number.isFinite));assert.ok(a.uv.every(v=>v>=0&&v<=1));
      assert.ok(a.indices.every(v=>v<a.positions.length/3));
      if(week<d.birthWeek)assert.ok(a.positions.every(v=>v===0));
      assert.ok(botanicalPose(d,week).position.every(Number.isFinite));
    }
  }
});
test('birth schedules, final identities and credits are not advanced by visual rendering',()=>{
  const descriptor=generatePlant(1852006),before=JSON.stringify(descriptor);
  for(const w of [18,38,52])for(const d of descriptor.leaves)botanicalLeaf(d,w);
  assert.equal(JSON.stringify(descriptor),before);
  assert.equal(descriptor.leaves.at(-1)!.birthWeek,52);
  const d=descriptor.leaves[4],young=botanicalLeaf(d,d.birthWeek),mature=botanicalLeaf(d,52);
  const width=(a:Float32Array)=>Math.max(...a.filter((_,i)=>i%3===0));
  const length=(a:Float32Array)=>Math.max(...a.filter((_,i)=>i%3===1));
  assert.ok(width(young.positions)/length(young.positions)<width(mature.positions)/length(mature.positions));
});
test('procedural allocations are bounded and malformed geometry is rejected',()=>{
 const d=generatePlant(3).leaves[0];
 for(const w of [-1,53,NaN,Infinity])assert.throws(()=>botanicalLeaf(d,w));
 for(const n of [0,65,NaN,4.2])assert.throws(()=>botanicalLeaf(d,18,n));
 assert.throws(()=>botanicalLeaf({...d,width:-1},18));
});

test('renderer 1.1.0 remains byte-identical rather than silently adopting the new albedo',()=>{
 const expected=new Map([[0,'0e35427114bb5fcd97a2a7a98701a19fd1f1f7b144868e6d4b56949329c11495'],[1852006,'c75cfcc929731b0d888f9ce7ced7397be7a9bd618c8ab3d5d27869fc6557469f'],[0xffffffff,'cb576d748929049040c695db26c9072f127e56cf23829ac07deba4ac25db7ead']]);
 for(const [seed,hash] of expected){assert.equal(sha(leafRaster(seed,128,256,'1.1.0')),hash);assert.notEqual(sha(leafRaster(seed,128,256,'1.2.0')),hash)}
});

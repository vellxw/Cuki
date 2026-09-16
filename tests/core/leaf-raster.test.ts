import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {CURRENT_RENDERER,leafRaster} from '../../packages/garden-engine/leaf-raster';
const digest=(a:Uint8Array)=>createHash('sha256').update(a).digest('hex');
test('leaf material is deterministic, seed-specific and separately versioned from geometry',()=>{
 assert.equal(CURRENT_RENDERER,'1.1.0');
 const a=leafRaster(1852006),b=leafRaster(1852006),c=leafRaster(1852007);
 assert.equal(a.byteLength,128*256*4);assert.deepEqual(a,b);assert.notEqual(digest(a),digest(c));
 for(let i=3;i<a.length;i+=4)assert.equal(a[i],255);
});
test('the original leaf renderer remains byte-for-byte reproducible for existing plants',()=>{
 const original=new Uint8Array(128*256*4),seed=1852006;
 for(let y=0;y<256;y++)for(let x=0;x<128;x++){
  const u=x/127,v=y/255,center=Math.abs(u-.5),i=(y*128+x)*4;
  const rib=Math.abs(Math.sin(v*48+center*26));
  const mottled=Math.sin(u*38+seed%37)*Math.sin(v*55+Math.sin(u*23))*Math.sin((u+v)*31);
  const n=center<.012||rib<.055?1:mottled>.15&&center<.4?.64:.17;
  original[i]=28+120*n;original[i+1]=55+104*n;original[i+2]=13+47*n;original[i+3]=255;
 }
 assert.deepEqual(leafRaster(seed,128,256,'1.0.0'),original);
 assert.notEqual(digest(leafRaster(seed)),digest(original));
});
test('a caller cannot request an unbounded allocation or an unstable seed',()=>{
 for(const args of [[-1,128,256],[2**32,128,256],[1.5,128,256],[1,0,256],[1,128,1],[1,1025,256],[1,128,NaN]])
  assert.throws(()=>leafRaster(args[0],args[1],args[2]),/Invalid procedural/);
 assert.equal(leafRaster(0,2,2).byteLength,16);assert.equal(leafRaster(0xffffffff,32,32).byteLength,4096);
});

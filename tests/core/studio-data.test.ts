import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {decodeStudio} from '../../packages/garden-engine/studio-data';
const metadata=JSON.parse(readFileSync(new URL('../../apps/mobile/assets/studio-room-1.2.json',import.meta.url),'utf8'));
const raw=readFileSync(new URL('../../apps/mobile/assets/studio-room-1.2.bin',import.meta.url));
test('the prefiltered native lighting is bundled, finite, bounded and hash-verified',()=>{
 assert.equal(createHash('sha256').update(raw).digest('hex'),metadata.sha256);
 const data=decodeStudio(raw,metadata);assert.equal(data.byteLength,metadata.byteLength);
 assert.ok(data.some(v=>v!==0));assert.equal(metadata.mapping,306);assert.equal(metadata.type,1016);
 assert.equal(metadata.colorSpace,'srgb-linear');assert.equal(metadata.flipY,false);
});
test('studio decoding respects an unaligned byte offset, without rewriting shared input',()=>{
 const buffer=new Uint8Array(raw.length+3);buffer.set(raw,3);const before=buffer.slice();
 assert.deepEqual(decodeStudio(buffer.subarray(3),metadata),decodeStudio(raw,metadata));
 assert.deepEqual(buffer,before);
});
test('malformed lighting cannot request huge allocations or silently upload NaN/Infinity',()=>{
 for(const changes of [{width:0},{height:NaN},{width:100000},{encoding:'png'},{byteLength:1}])
  assert.throws(()=>decodeStudio(raw,{...metadata,...changes}),/Invalid studio/);
 assert.throws(()=>decodeStudio(raw.subarray(1),metadata),/length/);
 const corrupt=new Uint8Array(raw);corrupt[0]=0;corrupt[1]=0x7c;
 assert.throws(()=>decodeStudio(corrupt,metadata),/Non-finite/);
});

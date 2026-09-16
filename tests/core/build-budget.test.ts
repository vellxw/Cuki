import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {budgetProperties}=require('../../apps/mobile/plugins/withCukiBuild.cjs');
test('prebuild JVM configuration replaces only the heap property without duplicate keys',()=>{
 const original=[{type:'comment',value:'retained'}, {type:'property',key:'org.gradle.jvmargs',value:'-Xmx2048m'}, {type:'property',key:'android.useAndroidX',value:'true'}];
 const next=budgetProperties(original);assert.equal(next.length,3);assert.deepEqual(next.slice(0,2),[original[0],original[2]]);
 assert.equal(original[1].value,'-Xmx2048m');assert.match(next[2].value,/-Xmx4096m/);
 assert.deepEqual(budgetProperties(next),next);
 for(const n of [-1,1024,NaN,4096.5,16384])assert.throws(()=>budgetProperties([],n),/heap/);
});

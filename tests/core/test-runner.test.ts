import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error The runner is deliberately plain Node ESM, with no compilation step.
import { discover, parseSummary } from '../../scripts/test-runner.mjs';
test('verification fails before spawning when a mandatory suite is absent or empty',()=>{
 const dir=mkdtempSync(join(tmpdir(),'cuki-empty-suite-'));try{
  assert.throws(()=>discover(join(dir,'absent')),/Falta la suite/);assert.throws(()=>discover(dir),/vacía/);
  writeFileSync(join(dir,'readme.md'),'Not a test');assert.throws(()=>discover(dir),/vacía/);
  writeFileSync(join(dir,'real.test.ts'),'');assert.equal(discover(dir).length,1);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('a successful process with zero, skipped, cancelled or missing TAP tests is not a pass',()=>{
 const summary=(tests:number,pass:number,skipped=0)=>`# tests ${tests}\n# pass ${pass}\n# fail 0\n# cancelled 0\n# skipped ${skipped}\n# todo 0\n`;
 assert.throws(()=>parseSummary(summary(0,0)),/cero/);
 assert.throws(()=>parseSummary(summary(2,0,2)),/cero/);
 assert.throws(()=>parseSummary(summary(2,1,1)),/omitidas/);
 assert.throws(()=>parseSummary('Node exited with code 0'),/no informó/);
 assert.equal(parseSummary(summary(2,2)).pass,2);
});

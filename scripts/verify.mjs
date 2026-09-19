import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
const root=resolve(import.meta.dirname,'..');
const required=['package-lock.json','apps/mobile/app.config.ts','apps/mobile/app/_layout.tsx','apps/mobile/app/(tabs)/_layout.tsx','apps/mobile/src/data/storage.ts','apps/mobile/src/data/AppProvider.tsx','apps/api/src/app.ts','apps/api/src/index.ts','apps/worker/src/index.ts','apps/admin/index.html','apps/admin/app.js','apps/admin/style.css','tests/core/domain.test.ts','tests/integration/server.test.ts','tests/support/sqlite.ts'];
const report={sourceCommit:process.env.GITHUB_SHA??null,startedAt:new Date().toISOString(),checks:[],assets:[],passed:false};
const output=resolve(root,'artifacts/verification');mkdirSync(output,{recursive:true});
function check(name,condition){report.checks.push({name,passed:!!condition});if(!condition)throw new Error(name);}
function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(resolve(dir,e.name)):[resolve(dir,e.name)]);}
try{
 for(const path of required)check('Existe '+path,existsSync(resolve(root,path)));
 const pkg=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8'));
 for(const [name,command]of Object.entries(pkg.scripts)){
  for(const match of command.matchAll(/(?:scripts\/[^\s]+\.(?:mjs|cjs|ts)|jest\.config\.cjs)/g))check('Script '+name+' → '+match[0],existsSync(resolve(root,match[0])));
 }
 const imported=new Set();
 for(const file of files(resolve(root,'apps/mobile/src')).filter(p=>/\.(?:ts|tsx)$/.test(p))){
  const source=readFileSync(file,'utf8');
  for(const m of source.matchAll(/require\(['"]([^'"]+\.(?:webp|png|jpe?g))['"]\)/g))imported.add(resolve(dirname(file),m[1]));
 }
 for(const path of imported){
  check('Asset importado '+relative(root,path),existsSync(path));const raw=readFileSync(path);const {width,height}=await sharp(raw).metadata();await sharp(raw).raw().toBuffer();
  check('Imagen decodificable '+relative(root,path),width>0&&height>0);report.assets.push({path:relative(root,path),width,height,sha256:createHash('sha256').update(raw).digest('hex')});
 }
 const studioMetadata=JSON.parse(readFileSync(resolve(root,'apps/mobile/assets/studio-room-1.2.json'),'utf8'));
 const studioBytes=readFileSync(resolve(root,'apps/mobile/assets/studio-room-1.2.bin'));
 check('Prefiltered studio lighting bytes match the versioned asset',studioBytes.length===studioMetadata.byteLength&&createHash('sha256').update(studioBytes).digest('hex')===studioMetadata.sha256);
 report.assets.push({path:'apps/mobile/assets/studio-room-1.2.bin',width:studioMetadata.width,height:studioMetadata.height,sha256:studioMetadata.sha256});
 if(!process.argv.includes('--static')){
  const commands=[['npm',['run','typecheck']],['npm',['test']]];
  if(process.argv.includes('--bundles'))commands.push(['npm',['run','export:android']],['npm',['run','export:ios']]);
  for(const [command,args]of commands){const result=spawnSync(command,args,{cwd:root,env:{...process.env,CI:'1',EXPO_NO_TELEMETRY:'1'},encoding:'utf8',timeout:240000,maxBuffer:32*1024*1024});
   const log=[command,...args].join('-').replace(/[^a-zA-Z0-9-]/g,'_')+'.log';writeFileSync(resolve(output,log),(result.stdout??'')+(result.stderr??''));
   check([command,...args].join(' '),result.status===0&&!result.error);}
 }
 report.passed=true;
}catch(error){report.error=error.message;console.error(error.message);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();writeFileSync(resolve(output,'verify.json'),JSON.stringify(report,null,2)+'\n');}

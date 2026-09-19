/** Static traceability only. Registration and test references never imply a passing route. */
import ts from 'typescript';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve,relative} from 'node:path';
const root=resolve(import.meta.dirname,'../..');
const blueprint=process.argv[2];
if(!blueprint)throw Error('Usage: node scripts/quality/inventory.mjs <private blueprint>/03_DISENO/pantallas.json');
const specs=JSON.parse(readFileSync(blueprint,'utf8'));
const registered=new Map(),api=[];
for(const file of readdirSync(resolve(root,'apps/mobile/src/screens')).filter(f=>f.endsWith('.tsx'))){
 const name='apps/mobile/src/screens/'+file,text=readFileSync(resolve(root,name),'utf8');
 const source=ts.createSourceFile(name,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 function walk(node){
  if(ts.isVariableDeclaration(node)&&/Screens$/.test(node.name.getText(source))&&node.initializer&&ts.isObjectLiteralExpression(node.initializer)){
   for(const property of node.initializer.properties){
    if(!ts.isPropertyAssignment(property)||!ts.isStringLiteral(property.name))continue;
    const id=property.name.text;if(!/^SC-[0-9]+$/.test(id))continue;
    if(registered.has(id))throw Error('Duplicate screen registration: '+id);
    registered.set(id,{file:name,component:property.initializer.getText(source),line:source.getLineAndCharacterOfPosition(property.getStart()).line+1});
   }
  }
  ts.forEachChild(node,walk);
 }
 walk(source);
}
const apiPath='apps/api/src/app.ts',text=readFileSync(resolve(root,apiPath),'utf8');
const ast=ts.createSourceFile(apiPath,text,ts.ScriptTarget.Latest,true);
function endpoints(node){
 if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&['get','post','put','delete','patch'].includes(node.expression.name.text)&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0]))
  api.push({method:node.expression.name.text.toUpperCase(),path:node.arguments[0].text,file:apiPath,line:ast.getLineAndCharacterOfPosition(node.getStart()).line+1,verification:'source_route_present_not_end_to_end_proof'});
 ts.forEachChild(node,endpoints);
}endpoints(ast);
function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(d=>d.isDirectory()?files(resolve(dir,d.name)):[resolve(dir,d.name)])}
const tests=files(resolve(root,'tests')).filter(f=>/\.(?:ts|tsx|py)$/.test(f)).map(f=>({file:relative(root,f),text:readFileSync(f,'utf8')}));
const seen=new Set(specs.map(s=>s.id));
for(const id of registered.keys())if(!seen.has(id))throw Error('Unmapped screen '+id);
const result={schemaVersion:1,scope:'Static traceability. Runtime, native, visual and provider verification are separate; nothing auto-approves by counting files.',
 sourceCommit:null,screenCount:specs.length,registeredMobileCount:registered.size,declaredHttpRouteCount:api.length,
 areasNeedingExternalValidation:['real store purchases and reward fulfillment','configured live AI accuracy','physical-device performance','HealthKit/Health Connect permissions and roundtrips'],
 outstandingImplementations:['native widgets and Live Activities need completion; current health modules are not equivalent','complete visual matching and accessibility review of all secondary states','admin browser end-to-end flow verification'],
 screens:specs.map(s=>({id:s.id,area:s.area,title:s.title,requiredStates:s.states,
   source:registered.get(s.id)??(['Admin','Operación'].includes(s.area)?{files:['apps/admin/index.html','apps/admin/app.js','apps/admin/style.css'],kind:'shared_admin_console_not_separate_screen_proof'}:null),
   implementation:registered.has(s.id)?'registered_source_present':'requires_feature_review',
   testSourceReferences:tests.filter(t=>t.text.includes(s.id)).map(t=>t.file),
   nativeFlowVerification:'see commit-specific evidence; not inferred from registration',visualAcceptance:'not_approved'})),api};
writeFileSync(resolve(root,'scope-matrix.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({screenCount:result.screenCount,registeredMobileCount:result.registeredMobileCount,declaredHttpRouteCount:api.length}));

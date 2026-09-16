/** An isolated listening HTTP API + SQL database per suite. Production rate limits
 * remain enabled; suites do not exhaust a shared loopback IP bucket incidentally. */
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { createApp } from '../../apps/api/src/app';
import { configuration } from '../../packages/server/config';
import { embedded, migrate } from '../../packages/server/db';
import { ClientRepo } from '../../packages/core/repository';
import { ApiClient } from '../../packages/core/api';
import { SessionManager } from '../../packages/core/session-manager';
import { uid } from '../../packages/core/utils';
import { sqlite } from './sqlite';

export async function httpFixture() {
 const folder=await mkdtemp(join(tmpdir(),'cuki-http-isolated-'));
 const clients:ReturnType<typeof sqlite>[]=[], emails=new Set<string>();
 const db=await embedded();await migrate(db);
 const config=configuration({APP_ENV:'test',PUBLIC_ORIGIN:'http://127.0.0.1:0',
  LOCAL_AUTH_SECRET:randomBytes(48).toString('hex'),MEDIA_SIGNING_SECRET:randomBytes(48).toString('hex'),MEDIA_DIR:folder});
 const service=await createApp({db,config});
 const origin=await service.app.listen({host:'127.0.0.1',port:0});
 config.origin=origin;config.authIssuer=origin+'/auth/v1';
 async function account() {
  let stored:string|null=null;
  const session=new SessionManager({read:async()=>stored,write:async v=>{stored=v},remove:async()=>{stored=null}},
   {endpoint:origin,publicKey:'local-development-not-a-secret'});
  const email=uid()+'@isolated-http.invalid';emails.add(email);
  assert.equal(await session.signUp(email,'Test-only-password-219384'),null);
  let code='';
  for(const filename of await readdir('.local/mail')) {
   const value=JSON.parse(await readFile(join('.local/mail',filename),'utf8'));
   if(value.to===email)code=value.token;
  }
  assert.match(code,/^\d{6}$/);
  const identity=await session.verifyOtp(email,code);assert.equal(identity.verified,true);
  return {session,identity,api:new ApiClient(origin,session.accessToken,session.epoch)};
 }
 async function device(actor:string) {
  const disk=sqlite(join(folder,uid()+'.sqlite'));clients.push(disk);
  const repo=await new ClientRepo(disk.driver,actor,'UTC').init();return {disk,repo};
 }
 async function close() {
  for(const disk of clients)disk.close();
  await service.app.close();await db.close();await rm(folder,{recursive:true,force:true});
  for(const filename of await readdir('.local/mail').catch(()=>[])) {
   const path=join('.local/mail',filename);
   try {if(emails.has(JSON.parse(await readFile(path,'utf8')).to))await rm(path)}catch{}
  }
 }
 return {origin,service,db,account,device,close};
}

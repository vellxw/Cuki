import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../../apps/api/src/app';
import { configuration } from '../../packages/server/config';
import { embedded, migrate, type Database } from '../../packages/server/db';
import { ClientRepo } from '../../packages/core/repository';
import { ApiClient, CloudService, SyncService } from '../../packages/core/api';
import { SessionManager } from '../../packages/core/session-manager';
import { createSession } from '../../packages/core/state';
import { entryFromFood, entryFromRecipe, scaleNutrients, uid } from '../../packages/core/utils';
import { sqlite } from '../support/sqlite';

// These exercise the real client repository through a listening HTTP server and SQL,
// not Fastify.inject or a mocked fetch. Secure storage remains a test port, not Keychain.
let service: Awaited<ReturnType<typeof createApp>>;
let db: Database, folder: string, origin: string;
const emails = new Set<string>();
const clients: ReturnType<typeof sqlite>[] = [];
before(async () => {
  folder = await mkdtemp(join(tmpdir(), 'cuki-client-http-'));
  db = await embedded();
  await migrate(db);
  const config = configuration({ APP_ENV: 'test', PUBLIC_ORIGIN: 'http://127.0.0.1:0',
    LOCAL_AUTH_SECRET: randomBytes(48).toString('hex'), MEDIA_SIGNING_SECRET: randomBytes(48).toString('hex'), MEDIA_DIR: folder });
  service = await createApp({ db, config });
  origin = await service.app.listen({ host: '127.0.0.1', port: 0 });
  config.origin = origin; config.authIssuer = origin + '/auth/v1';
});
after(async () => {
  for (const client of clients) client.close();
  await service?.app.close(); await db?.close();
  await rm(folder, { recursive: true, force: true });
  for (const filename of await readdir('.local/mail').catch(() => [])) {
    const path = join('.local/mail', filename);
    try { if (emails.has(JSON.parse(await readFile(path, 'utf8')).to)) await rm(path); } catch {}
  }
});
async function account() {
  let stored: string | null = null;
  const session = new SessionManager({ read: async () => stored, write: async value => { stored = value; }, remove: async () => { stored = null; } },
    { endpoint: origin, publicKey: 'local-development-not-a-secret' });
  const email = uid() + '@client-tests.invalid'; emails.add(email);
  assert.equal(await session.signUp(email, 'Test-only-password-219384'), null);
  let code = '';
  for (const filename of await readdir('.local/mail')) {
    const value = JSON.parse(await readFile(join('.local/mail', filename), 'utf8'));
    if (value.to === email) code = value.token;
  }
  assert.match(code, /^\d{6}$/);
  const identity = await session.verifyOtp(email, code);
  assert.equal(identity.verified, true);
  const api = new ApiClient(origin, session.accessToken, session.epoch);
  return { session, identity, api };
}
test('actual photo and label capture upload contract accepts normalized JPEG and confirms private storage',async()=>{
  const {uploadOwnedMedia,capturePurpose}=await import('../../packages/core/media-client');
  const sharp=(await import('sharp')).default;
  const bytes=await sharp({create:{width:64,height:64,channels:3,background:{r:80,g:110,b:60}}}).jpeg().toBuffer();
  const source={exists:true,size:bytes.length,arrayBuffer:async()=>Uint8Array.from(bytes).buffer};
  const {api,identity}=await account();
  for(const route of ['photo','label'] as const){
    const mid=await uploadOwnedMedia(api,source,capturePurpose(route));
    const saved=await service.media.readForActor(identity.userId,mid);
    assert.equal(saved.mime,'image/jpeg');assert.ok(saved.data.length>0);
    const stranger=await account();await assert.rejects(service.media.readForActor(stranger.identity.userId,mid));
  }
});
test('voice upload is declared audio/mp4 rather than JPEG and a failed PUT never reports completion',async()=>{
  const {uploadOwnedMedia}=await import('../../packages/core/media-client');
  const {api,identity}=await account();
  // This is only a container-header fixture for the transport contract, NOT valid
  // speech or an evaluation of a transcription provider.
  const bytes=Buffer.from('00000018667479704d344120000000004d34412069736f6d','hex');
  const source={exists:true,size:bytes.length,arrayBuffer:async()=>Uint8Array.from(bytes).buffer};
  const mid=await uploadOwnedMedia(api,source,'voice');
  const saved=await service.media.readForActor(identity.userId,mid);assert.equal(saved.mime,'audio/mp4');
  let puts=0;await assert.rejects(uploadOwnedMedia(api,source,'voice',async()=>{puts++;return new Response('offline',{status:503})}),/subir/);
  assert.equal(puts,1);
  const incomplete=await db.query("SELECT state FROM media WHERE actor_id=$1 AND id<>$2",[identity.userId,mid]);
  assert.equal(incomplete.rows.length,1);assert.equal(incomplete.rows[0].state,'created');
});

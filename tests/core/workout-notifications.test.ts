import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ClientRepo} from '../../packages/core/repository';
import {createSession} from '../../packages/core/state';
import {clearRestNotification} from '../../packages/core/workout-notifications';
import {sqlite} from '../support/sqlite';

async function setup() {
  const disk=sqlite();
  const repo=await new ClientRepo(disk.driver,'guest','UTC').init();
  const session=createSession(repo.getSnapshot(),undefined,0,[repo.getSnapshot().exercises[0].id]);
  await repo.dispatch({type:'startSession',session});
  await repo.dispatch({type:'notification',sessionId:session.id,notificationId:'old-notification'});
  return {disk,repo,id:session.id};
}
test('failed native cancellation keeps the unconfirmed ID without damaging workout data',async()=>{
  const {disk,repo,id}=await setup();
  try {
    const before=repo.getSnapshot().sessions[0];
    assert.equal(await clearRestNotification(repo,id,async()=>{throw Error('system offline')}),false);
    assert.deepEqual(repo.getSnapshot().sessions[0],before);
  } finally {disk.close();}
});
test('clearing an old native notification never deletes a newer queued notification',async()=>{
  const {disk,repo,id}=await setup();
  try {
    let newer:Promise<void>|undefined;
    const success=await clearRestNotification(repo,id,async cancelled=>{
      assert.equal(cancelled,'old-notification');
      // Intentionally queue, do not await: exercise the read-before-commit race.
      newer=repo.dispatch({type:'notification',sessionId:id,notificationId:'new-notification'});
    });
    await newer;assert.equal(success,true);
    const reopened=await new ClientRepo(disk.driver,'guest','UTC').init();
    assert.equal(reopened.getSnapshot().sessions[0].restNotificationId,'new-notification');
  } finally {disk.close();}
});
test('success persists cancellation and repeated cancellation does not call the OS again',async()=>{
  const {disk,repo,id}=await setup();let calls=0;
  try {
    const cancel=async()=>{calls++;};
    assert.equal(await clearRestNotification(repo,id,cancel),true);
    assert.equal(await clearRestNotification(repo,id,cancel),true);
    assert.equal(calls,1);
    const reopened=await new ClientRepo(disk.driver,'guest','UTC').init();
    assert.equal(reopened.getSnapshot().sessions[0].restNotificationId,null);
  } finally {disk.close();}
});

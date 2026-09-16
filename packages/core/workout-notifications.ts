import type {ClientRepo} from './repository';

/** A failed OS side effect must never invalidate a durably saved workout.
 * Keep an unconfirmed notification ID for a later retry instead of pretending it was cancelled.
 */
export async function clearRestNotification(repo: ClientRepo, sessionId: string,
  cancel: (id: string) => Promise<unknown>): Promise<boolean> {
  const id = repo.getSnapshot().sessions.find(s => s.id === sessionId)?.restNotificationId;
  if (!id) return true;
  try {
    await cancel(id);
    // Do not clear a newer notification created while the native call was in flight.
    await repo.mutate(state => {
      const session = state.sessions.find(s => s.id === sessionId);
      if (session?.restNotificationId === id) session.restNotificationId = null;
    });
    return true;
  } catch { return false; }
}

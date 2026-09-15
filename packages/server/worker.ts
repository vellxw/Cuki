import type { Database, Actor } from './db';
import { createJob, processOneAI, type AIProvider } from './ai';
import { reconcileBilling, type BillingProvider } from './billing';
import { processRedemption, reconcileRedemption } from './rewards';
import type { MediaService } from './media';
import type { PrivacyService } from './privacy';

interface Services { db: Database; ai: AIProvider; billing: BillingProvider; media: MediaService; privacy: PrivacyService }
/** Same worker paths for the single-process local DB and independent PostgreSQL workers. */
export class WorkerLoop {
  private running: Promise<boolean> | null = null;
  private maintenanceAt = 0;
  private reviewsAt = 0;
  constructor(private services: Services, private clock: () => Date = () => new Date()) {}
  tick(): Promise<boolean> {
    if (this.running) return this.running;
    this.running = this.run().finally(() => { this.running = null; });
    return this.running;
  }
  private async run(): Promise<boolean> {
    const { db, ai, billing, media, privacy } = this.services;
    const now = this.clock();
    let worked = await privacy.processOne(now);
    worked = await processOneAI(db, ai, media, now) || worked;
    if (billing.configured) {
      const pending = (await db.query<{ id: string; actor_id: string; state: string }>(`
        SELECT r.id,r.actor_id,r.state FROM redemptions r
        WHERE NOT EXISTS(SELECT 1 FROM deleted_accounts d WHERE d.actor_id=r.actor_id)
        AND (r.state='reserved' OR (r.state IN ('unknown_reconciling','awaiting_provider') AND r.updated_at<$1))
        ORDER BY r.updated_at,r.id LIMIT 5`, [new Date(+now - 5 * 60000).toISOString()])).rows;
      for (const row of pending) {
        const actor: Actor = { id: row.actor_id, verified: true, role: 'user' };
        try {
          if (row.state === 'reserved') await processRedemption(db, actor, row.id, billing, now);
          else await reconcileRedemption(db, actor, row.id, billing, now);
          worked = true;
        } catch {
          // Back off durably; never grant again merely because a provider response is uncertain.
          await db.query(`UPDATE redemptions SET updated_at=$1 WHERE id=$2 AND state IN ('reserved','awaiting_provider','unknown_reconciling')`, [now.toISOString(), row.id]);
        }
      }
    }
    if (+now >= this.maintenanceAt) {
      this.maintenanceAt = +now + 30000;
      if (billing.configured) await reconcileBilling(db, billing, now);
      await media.prune(now);
    }
    if (ai.configured && +now >= this.reviewsAt) {
      this.reviewsAt = +now + 3600000;
      // A paid plan is not permission to process health information without the explicit preference.
      const accounts = (await db.query<{ actor_id: string }>(`
        SELECT b.actor_id FROM billing b JOIN entities p ON p.actor_id=b.actor_id
        AND p.entity_type='profile' AND NOT p.deleted
        WHERE b.plan IN ('plus','reward_plus','trial') AND b.state IN ('active','grace')
        AND (b.expires_at IS NULL OR b.expires_at>$1)
        AND p.payload->>'weeklyReviewEnabled'='true'
        AND NOT EXISTS(SELECT 1 FROM deleted_accounts d WHERE d.actor_id=b.actor_id)
        ORDER BY b.actor_id LIMIT 100`, [now.toISOString()])).rows;
      const week = Math.floor(+now / (7 * 86400000));
      for (const row of accounts) {
        try {
          await createJob(db, { id: row.actor_id, verified: true, role: 'user' }, {
            route: 'weekly_review', input: 'Revisá la última semana de alimentación y entrenamiento. Explicá límites y sugerencias; no apliques cambios.', mediaId: null,
          }, 'scheduled-review:' + week, ai, now);
        } catch { /* A consumed quota, cancelled account or unavailable provider must not stop other accounts. */ }
      }
    }
    return worked;
  }
}

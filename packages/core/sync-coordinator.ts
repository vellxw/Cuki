/** Foreground sync lifecycle, independent of React Native so its timers are testable.
 * No entry is discarded on network failure; authorization errors require an explicit retry.
 */
export interface SyncSource {
  getSnapshot(): { outbox: { id: string; state: string }[] };
  subscribe(listener: () => void): () => void;
}
export interface SyncStatus {
  phase: 'idle' | 'queued' | 'syncing' | 'offline' | 'retrying' | 'blocked';
  pending: number;
  conflicts: number;
  error: string | null;
  nextRetryAt: number | null;
  lastSuccessAt: number | null;
}
export interface SyncClock {
  now(): number;
  setTimeout(fn: () => void, milliseconds: number): unknown;
  clearTimeout(timer: unknown): void;
}
const clock: SyncClock = {
  now: Date.now,
  setTimeout: (fn, milliseconds) => setTimeout(fn, milliseconds),
  clearTimeout: timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
};
export class SyncCoordinator {
  private active = false;
  private online = true;
  private foreground = true;
  private timer: unknown = null;
  private unsubscribe: (() => void) | null = null;
  private running: AbortController | null = null;
  private rerun = false;
  private attempt = 0;
  private signature = '';
  private listeners = new Set<() => void>();
  private status: SyncStatus = { phase: 'idle', pending: 0, conflicts: 0, error: null, nextRetryAt: null, lastSuccessAt: null };
  constructor(private source: SyncSource, private sync: (signal: AbortSignal) => Promise<void>, private options: { clock?: SyncClock; debounceMs?: number; retries?: number[] } = {}) {}
  getSnapshot = () => this.status;
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  private get time() { return this.options.clock ?? clock; }
  private publish(patch: Partial<SyncStatus>) {
    const outbox = this.source.getSnapshot().outbox;
    const next = { ...this.status, ...patch, pending: outbox.filter(x => x.state === 'pending').length, conflicts: outbox.filter(x => x.state === 'conflict').length };
    if (JSON.stringify(next) === JSON.stringify(this.status)) return;
    this.status = next; this.listeners.forEach(fn => fn());
  }
  private clearTimer() { if (this.timer !== null) this.time.clearTimeout(this.timer); this.timer = null; }
  private canRun() { return this.active && this.online && this.foreground; }
  start() {
    if (this.active) return;
    this.active = true;
    this.signature = this.source.getSnapshot().outbox.filter(x => x.state === 'pending').map(x => x.id).join('|');
    this.unsubscribe = this.source.subscribe(() => {
      const signature = this.source.getSnapshot().outbox.filter(x => x.state === 'pending').map(x => x.id).join('|');
      const changed = signature !== this.signature; this.signature = signature;
      this.publish({});
      if (changed && signature && !this.running && this.status.phase !== 'blocked' && this.status.phase !== 'retrying') this.schedule(this.options.debounceMs ?? 500);
    });
    this.publish({}); this.requestNow();
  }
  stop() {
    this.active = false; this.clearTimer(); this.unsubscribe?.(); this.unsubscribe = null;
    this.running?.abort(); this.rerun = false;
    this.publish({ phase: 'idle', nextRetryAt: null });
  }
  setOnline(online: boolean) {
    const changed = this.online !== online; this.online = online;
    if (!online) { this.clearTimer(); this.running?.abort(); this.publish({ phase: 'offline', nextRetryAt: null }); }
    else if (changed) this.requestNow();
  }
  setForeground(foreground: boolean) {
    const changed = this.foreground !== foreground; this.foreground = foreground;
    if (!foreground) { this.clearTimer(); this.running?.abort(); this.publish({ phase: this.online ? 'idle' : 'offline', nextRetryAt: null }); }
    else if (changed) this.requestNow();
  }
  requestNow() {
    this.attempt = 0;
    if (!this.canRun()) { this.publish({ phase: this.online ? 'idle' : 'offline', nextRetryAt: null }); return; }
    if (this.running) { this.rerun = true; return; }
    this.schedule(0);
  }
  private schedule(delay: number, retry = false) {
    if (!this.canRun()) return;
    this.clearTimer();
    this.publish({ phase: retry ? 'retrying' : 'queued', nextRetryAt: retry ? this.time.now() + delay : null });
    this.timer = this.time.setTimeout(() => { this.timer = null; void this.run(); }, delay);
  }
  private async run() {
    if (!this.canRun() || this.running) return;
    const controller = new AbortController(); this.running = controller;
    this.publish({ phase: 'syncing', nextRetryAt: null });
    let retryDelay: number | null = null;
    let blocked = false;
    try {
      await this.sync(controller.signal);
      if (!controller.signal.aborted && this.canRun()) {
        this.attempt = 0;
        this.publish({ phase: 'idle', error: null, lastSuccessAt: this.time.now() });
      }
    } catch (error) {
      if (!controller.signal.aborted && this.canRun()) {
        const status = (error as { status?: number })?.status;
        blocked = status === 401 || status === 403;
        const retries = this.options.retries?.length ? this.options.retries : [1000, 3000, 10000, 30000, 60000];
        retryDelay = blocked ? null : retries[Math.min(this.attempt++, retries.length - 1)];
        this.publish({ phase: blocked ? 'blocked' : 'retrying', error: error instanceof Error ? error.message : 'No se pudo sincronizar.' });
      }
    } finally {
      if (this.running === controller) this.running = null;
      const rerun = this.rerun; this.rerun = false;
      if (this.canRun()) {
        if (retryDelay !== null) this.schedule(retryDelay, true);
        else if (!blocked && (rerun || (!controller.signal.aborted && this.status.pending > 0))) this.schedule(this.options.debounceMs ?? 500);
      }
    }
  }
}

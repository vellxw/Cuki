import type { ClientRepo } from './repository';
import { stableJSON } from './utils';
/** A draft belongs to exactly one account/key. Writes survive screen unmounts. */
export class PersistentDraft<T extends object> {
 private snapshot: { value: T; error: string | null };
 private pending: Promise<unknown> = Promise.resolve();
 private revision = 0;
 private dirty = false;
 private listeners = new Set<() => void>();
 private disconnect: (() => void) | null = null;
 constructor(private repo: ClientRepo, readonly key: string, initial: () => T) {
  this.snapshot = { value: (repo.getSnapshot().drafts[key] as T | undefined) ?? initial(), error: null };
 }
 getSnapshot = () => this.snapshot;
 private emit(value: T, error: string | null = null) { this.snapshot = { value, error }; this.listeners.forEach(fn => fn()); }
 private refresh = () => {
  const value = this.repo.getSnapshot().drafts[this.key] as T | undefined;
  if (value && !this.dirty && stableJSON(value) !== stableJSON(this.snapshot.value)) this.emit(value);
 };
 subscribe = (fn: () => void) => {
  this.listeners.add(fn);
  if (!this.disconnect) { this.disconnect = this.repo.subscribe(this.refresh); this.refresh(); }
  return () => { this.listeners.delete(fn); if (!this.listeners.size) { this.disconnect?.(); this.disconnect = null; } };
 };
 set = (patch: Partial<T>) => {
  const value = { ...this.snapshot.value, ...patch };
  const revision = ++this.revision; this.dirty = true; this.emit(value);
  const write = this.repo.dispatch({ type: 'draft', key: this.key, value });
  this.pending = write;
  void write.then(() => {
   if (revision === this.revision) { this.dirty = false; this.emit(this.snapshot.value); }
  }).catch(error => {
   if (revision === this.revision) this.emit(this.snapshot.value, error instanceof Error ? error.message : 'No se pudo guardar el borrador.');
  });
 };
 flush = async () => {
  await this.pending;
  if (!this.repo.getSnapshot().drafts[this.key]) await this.repo.dispatch({ type: 'draft', key: this.key, value: this.snapshot.value });
 };
}

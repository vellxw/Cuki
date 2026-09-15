/** Authentication state machine. Storage and HTTP are ports; no operating-system mocks here.
 * A login becomes visible only after secure persistence. Logout invalidates pending writes.
 */
export interface Identity { userId: string; email: string; verified: boolean }
export interface AuthSession {
  access_token: string; refresh_token: string; expires_at: number;
  user: { id: string; email?: string; email_confirmed_at?: string };
}
export interface SessionStorage { read(): Promise<string | null>; write(value: string): Promise<void>; remove(): Promise<void> }
export interface SessionConfiguration { endpoint: string; publicKey: string }
const changed = () => new Error('La cuenta cambió durante la solicitud.');
function parseSession(value: unknown, now: number, allowExpiryFallback: boolean): AuthSession {
  if (!value || typeof value !== 'object') throw new Error('El servicio no devolvió una sesión válida.');
  const source = value as Partial<AuthSession> & { expires_in?: number };
  if (typeof source.access_token !== 'string' || !source.access_token ||
      typeof source.refresh_token !== 'string' || !source.refresh_token ||
      typeof source.user?.id !== 'string' || !source.user.id) throw new Error('La cuenta requiere confirmación por correo.');
  const lifetime = typeof source.expires_in === 'number' && source.expires_in > 0 ? source.expires_in : 3600;
  const expiry = source.expires_at ?? (allowExpiryFallback ? Math.floor(now / 1000) + lifetime : NaN);
  if (typeof expiry !== 'number' || !Number.isFinite(expiry) || expiry <= 0) throw new Error('La sesión guardada no tiene una caducidad válida.');
  return {
    access_token: source.access_token, refresh_token: source.refresh_token, expires_at: expiry,
    user: { id: source.user.id, email: typeof source.user.email === 'string' ? source.user.email : undefined,
      email_confirmed_at: typeof source.user.email_confirmed_at === 'string' ? source.user.email_confirmed_at : undefined },
  };
}
export class SessionManager {
  private session: AuthSession | null = null;
  private generation = 0;
  private storageTail: Promise<void> = Promise.resolve();
  private restoring: Promise<Identity | null> | null = null;
  private refreshing: { generation: number; promise: Promise<string | null> } | null = null;
  constructor(private storage: SessionStorage, private config: SessionConfiguration,
    private http: typeof fetch = (...args) => fetch(...args), private clock: () => number = Date.now) {}
  get configured() { return Boolean(this.config.endpoint && this.config.publicKey); }
  epoch = () => this.generation;
  identity = (): Identity | null => this.session ? {
    userId: this.session.user.id, email: this.session.user.email ?? '', verified: Boolean(this.session.user.email_confirmed_at),
  } : null;
  private serialized<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.storageTail.then(operation);
    this.storageTail = next.then(() => {}, () => {});
    return next;
  }
  restore = (): Promise<Identity | null> => {
    if (this.restoring) return this.restoring;
    const epoch = this.generation;
    const operation = this.serialized(async () => {
      const raw = await this.storage.read();
      if (epoch !== this.generation) return this.identity();
      if (!raw) return this.identity();
      let restored: AuthSession;
      try { restored = parseSession(JSON.parse(raw), this.clock(), false); }
      catch { await this.storage.remove(); if (epoch === this.generation) this.session = null; return this.identity(); }
      if (epoch !== this.generation) return this.identity();
      this.session = restored;
      return this.identity();
    });
    this.restoring = operation;
    void operation.finally(() => { if (this.restoring === operation) this.restoring = null; }).catch(() => {});
    return operation;
  };
  private async request(path: string, body: unknown, bearer?: string): Promise<Record<string, unknown>> {
    if (!this.configured) throw new Error('Falta configurar el servicio de cuenta. Podés seguir como invitado.');
    const response = await this.http(this.config.endpoint.replace(/\/$/, '') + '/auth/v1' + path, {
      method: 'POST', headers: { apikey: this.config.publicKey, 'Content-Type': 'application/json',
        ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}) },
      body: JSON.stringify(body), signal: AbortSignal.timeout(25000),
    });
    let value: Record<string, unknown>;
    try { const text = await response.text(); value = text ? JSON.parse(text) : {}; }
    catch { throw new Error('El servicio de cuenta devolvió una respuesta no válida.'); }
    if (!response.ok) {
      const message = value.msg ?? value.error_description ?? value.message;
      throw new Error(typeof message === 'string' ? message : 'No se pudo autenticar.');
    }
    return value;
  }
  private async commit(value: unknown, expected: number, refreshing = false): Promise<Identity> {
    const next = parseSession(value, this.clock(), true);
    return this.serialized(async () => {
      if (this.generation !== expected) throw changed();
      if (refreshing && this.session?.user.id !== next.user.id) throw changed();
      await this.storage.write(JSON.stringify(next));
      // Logout or a newer login may happen while the native write is pending. Its queued
      // write/delete will run next; remove this stale value before releasing the queue.
      if (this.generation !== expected) { await this.storage.remove(); throw changed(); }
      const previousId = this.session?.user.id;
      this.session = next;
      if (!refreshing && previousId !== next.user.id) this.generation++;
      return this.identity()!;
    });
  }
  signIn = async (email: string, password: string) => {
    const epoch = ++this.generation;
    return this.commit(await this.request('/token?grant_type=password', { email, password }), epoch);
  };
  signUp = async (email: string, password: string): Promise<Identity | null> => {
    const epoch = ++this.generation;
    const value = await this.request('/signup', { email, password });
    if (this.generation !== epoch) throw changed();
    return value.access_token ? this.commit(value, epoch) : null;
  };
  sendOtp = (email: string) => this.request('/otp', { email, create_user: true });
  verifyOtp = async (email: string, token: string) => {
    const epoch = ++this.generation;
    return this.commit(await this.request('/verify', { email, token, type: 'email' }), epoch);
  };
  resetPassword = (email: string) => this.request('/recover', { email });
  accessToken = async (): Promise<string | null> => {
    const current = this.session;
    if (!current) return null;
    if (current.expires_at * 1000 > this.clock() + 60000) return current.access_token;
    if (!this.configured) throw new Error('La sesión necesita renovarse cuando esté disponible el servicio de cuenta.');
    const epoch = this.generation;
    if (this.refreshing?.generation === epoch) return this.refreshing.promise;
    const promise = (async () => {
      const next = await this.request('/token?grant_type=refresh_token', { refresh_token: current.refresh_token });
      await this.commit(next, epoch, true);
      if (this.generation !== epoch) throw changed();
      return this.session!.access_token;
    })();
    this.refreshing = { generation: epoch, promise };
    void promise.finally(() => { if (this.refreshing?.promise === promise) this.refreshing = null; }).catch(() => {});
    return promise;
  };
  logout = async () => {
    this.generation++;
    const token = this.session?.access_token;
    this.session = null;
    await this.serialized(() => this.storage.remove());
    if (token && this.configured) void this.request('/logout', {}, token).catch(() => {});
  };
}

import { Pool } from 'pg';
import { readFile } from 'node:fs/promises';

export interface SQL { query<T extends Record<string, any> = Record<string, any>>(text: string, values?: unknown[]): Promise<{ rows: T[] }> }
export interface Database extends SQL { transaction<T>(run: (db: SQL) => Promise<T>): Promise<T>; close(): Promise<void> }
export function postgres(url: string): Database {
  const pool = new Pool({ connectionString: url, max: 12, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000 });
  return { query: (s, v) => pool.query(s, v), async transaction<T>(run: (db: SQL) => Promise<T>) {
    const conn = await pool.connect(); try { await conn.query('BEGIN'); const result = await run(conn); await conn.query('COMMIT'); return result; }
    catch (error) { await conn.query('ROLLBACK'); throw error; } finally { conn.release(); }
  }, close: () => pool.end() };
}
export async function embedded(path?: string): Promise<Database> {
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite(path); await pg.waitReady;
  // PGlite serializes transactions; the same SQL/migrations run in PostgreSQL CI.
  const query = (connection: { query: any; exec: any }): SQL['query'] => async (s, v) => v ? connection.query(s, v) : ((await connection.exec(s)).at(-1) ?? { rows: [] });
  return { query: query(pg), transaction: run => pg.transaction(tx => run({ query: query(tx) })), close: () => pg.close() };
}
export interface Actor { id: string; verified: boolean; role: 'user' | 'moderator' | 'admin'; email?: string }
export async function asActor<T>(db: Database, actor: Actor, run: (tx: SQL) => Promise<T>): Promise<T> {
  return db.transaction(async tx => {
    await tx.query('SET LOCAL ROLE cuki_runtime');
    await tx.query("SELECT set_config('app.actor', $1, true), set_config('app.role', $2, true)", [actor.id, actor.role]);
    return run(tx);
  });
}
export async function migrate(db: Database, base = new URL('../../migrations/', import.meta.url)) {
  await db.query('CREATE TABLE IF NOT EXISTS cuki_migrations (version int PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  for (const name of ['001_core.sql','002_jobs.sql','003_plant_renderer.sql']) {
    const version = Number(name.slice(0,3));
    const sql = await readFile(new URL(name, base), 'utf8');
    await db.transaction(async tx => {
      await tx.query('SELECT pg_advisory_xact_lock(10983742)');
      if ((await tx.query('SELECT version FROM cuki_migrations WHERE version=$1', [version])).rows.length) return;
      // Simple query accepts a SQL script; no parameters or user input are interpolated here.
      await tx.query(sql);
      await tx.query('INSERT INTO cuki_migrations(version) VALUES($1)', [version]);
    });
  }
}
export async function lockActor(tx: SQL, actor: string) { await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['cuki:' + actor]); }

import { createHash, timingSafeEqual, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { stableJSON } from '../core/utils';
import type { SQL, Actor } from './db';
export class HttpError extends Error { constructor(readonly statusCode: number, message: string, readonly details?: unknown) { super(message); } }
export function need(value: unknown, message: string, code = 400): asserts value { if (!value) throw new HttpError(code, message); }
export const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
export const id = () => randomUUID();
export const idSchema = z.string().min(1).max(200).regex(/^[A-Za-z0-9_.:\-]+$/);
export const instant = z.string().datetime({ offset: true });
export const parseBody = <T>(schema: z.ZodType<T>, body: unknown): T => { const r = schema.safeParse(body); if (!r.success) throw new HttpError(400,'Revisá los datos enviados.',r.error.flatten()); return r.data; };
export const secureEqual = (a: string, b: string) => { const x=Buffer.from(a),y=Buffer.from(b); return x.length===y.length && timingSafeEqual(x,y); };
export async function idempotent<T>(tx: SQL, actor: Actor, key: string, body: unknown, execute: () => Promise<T>): Promise<T> {
  need(key && key.length<=240,'Falta una clave de operación válida.');
  const digest=sha256(stableJSON(body));
  const old=(await tx.query<{digest:string;response:T}>('SELECT digest,response FROM op_receipts WHERE actor_id=$1 AND id=$2',[actor.id,key])).rows[0];
  if(old){need(old.digest===digest,'Esta clave ya fue utilizada con otros datos.',409);return old.response;}
  const response=await execute();
  await tx.query('INSERT INTO op_receipts(actor_id,id,digest,response) VALUES($1,$2,$3,$4::jsonb)',[actor.id,key,digest,JSON.stringify(response)]);
  return response;
}
export async function writeAudit(tx:SQL,actor:string,action:string,target:string,now:string,detail:unknown={},staffId:string|null=null){await tx.query('INSERT INTO audit(actor_id,staff_id,action,target_id,detail,created_at) VALUES($1,$2,$3,$4,$5::jsonb,$6)',[actor,staffId,action,target,JSON.stringify(detail),now]);}

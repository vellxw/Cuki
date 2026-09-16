import {reconcileJob} from './media-client';
import type {AppState,AIJob,AIRoute,GardenChallenge,PlantInstance,Coin,RewardQuote,Redemption,Entitlement,Proposal} from './types';import type {ClientRepo,SyncChange} from './repository';import {invariant} from './utils';
export class ApiError extends Error {constructor(message:string,readonly status:number,readonly details?:unknown){super(message)}}
export class ApiClient {
 readonly configured:boolean;
 constructor(readonly baseUrl:string,private token:()=>Promise<string|null>,private epoch:()=>number=()=>0){this.configured=!!baseUrl;invariant(!baseUrl||/^https?:\/\//.test(baseUrl),'La URL de API no es válida.')}
 async request<T>(path:string,method='GET',body?:unknown,key?:string,signal?:AbortSignal):Promise<T>{invariant(this.configured,'El servidor no está configurado. Las funciones manuales siguen disponibles.');invariant(path.startsWith('/')&&!path.startsWith('//'),'Ruta inválida.');const epoch=this.epoch();const token=await this.token();invariant(epoch===this.epoch(),'La cuenta cambió; no se envió la solicitud anterior.');const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),25000);const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)controller.abort();try{const res=await fetch(this.baseUrl.replace(/\/$/,'')+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(key?{'Idempotency-Key':key}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:controller.signal});let value:unknown;try{value=await res.json()}catch{throw new ApiError('Respuesta del servidor no válida.',res.status)}invariant(epoch===this.epoch(),'La cuenta cambió; se descartó la respuesta anterior.');if(!res.ok){const error=value as {message?:string;error?:string};throw new ApiError(error.message??error.error??'No se pudo completar la operación.',res.status,value)}return value as T}finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel)}}
}
type PushAck = { id: string; state: 'accepted' | 'conflict' | 'failed'; message?: string; remote?: unknown };
function protocol(condition: unknown, message: string): asserts condition {
 if (!condition) throw new ApiError(message, 502);
}
export class SyncService {
 private running: Promise<void> | null = null;
 constructor(readonly api: ApiClient, readonly repo: ClientRepo) {}
 sync(signal?: AbortSignal): Promise<void> {
  if (this.running) return this.running;
  this.running = this.perform(signal).finally(() => { this.running = null; });
  return this.running;
 }
 private async perform(signal?: AbortSignal) {
  invariant(this.repo.accountId !== 'guest', 'Iniciá sesión para sincronizar.');
  const check = () => { if (signal?.aborted) throw new ApiError('Sincronización suspendida; tus registros siguen guardados.', 499); };
  for (let page = 0; page < 200; page++) {
   check();
   const batch = this.repo.getSnapshot().outbox.filter(o => o.state === 'pending').slice(0, 50);
   if (!batch.length) break;
   const result = await this.api.request<{ results: PushAck[] }>('/v1/sync/push', 'POST', { operations: batch }, undefined, signal);
   check();
   const ids = new Set(batch.map(o => o.id));
   protocol(Array.isArray(result?.results) && result.results.length === batch.length, 'El servidor no confirmó todas las operaciones. Se reintentará sin duplicarlas.');
   const seen = new Set<string>();
   for (const item of result.results) {
    protocol(item && ids.has(item.id) && !seen.has(item.id) && ['accepted', 'conflict', 'failed'].includes(item.state), 'Respuesta de sincronización inconsistente.');
    seen.add(item.id);
   }
   await this.repo.acceptSync(result.results, [], this.repo.getSnapshot().cursor ?? '0');
   if (page === 199 && this.repo.getSnapshot().outbox.some(o => o.state === 'pending')) throw new ApiError('Hay más registros pendientes. Se continuará en el próximo ciclo.', 503);
  }
  for (let page = 0; page < 100; page++) {
   check();
   const cursor = this.repo.getSnapshot().cursor ?? '0';
   const result = await this.api.request<{ changes: SyncChange[]; cursor: string; more: boolean }>('/v1/sync/pull?cursor=' + encodeURIComponent(cursor), 'GET', undefined, undefined, signal);
   check();
   protocol(result && Array.isArray(result.changes) && typeof result.cursor === 'string' && /^\d{1,18}$/.test(result.cursor) && typeof result.more === 'boolean', 'Página de sincronización no válida.');
   protocol(BigInt(result.cursor) >= BigInt(cursor) && (!result.more || BigInt(result.cursor) > BigInt(cursor)), 'El cursor del servidor no avanzó. No se perderán los registros pendientes.');
   for (const change of result.changes) {
    protocol(change && typeof change.entityType === 'string' && typeof change.entityId === 'string' && Number.isSafeInteger(change.version) && change.version > 0 && typeof change.deleted === 'boolean' && change.payload !== null && typeof change.payload === 'object', 'Cambio remoto no válido.');
   }
   await this.repo.acceptSync([], result.changes, result.cursor);
   if (!result.more) return;
  }
  throw new ApiError('La descarga continuará desde el último cursor guardado.', 503);
 }
}
export function quoteCanConfirm(q:RewardQuote,now=Date.now()){return q.eligible&&q.route!==null&&q.benefit_start_at!==null&&q.benefit_end_at!==null&&Date.parse(q.expires_at)>now&&Date.parse(q.benefit_end_at)>Date.parse(q.benefit_start_at)&&!!q.terms_hash}
export class CloudService {
 constructor(readonly api:ApiClient,readonly repo:ClientRepo,readonly upload:(uri:string,purpose:string)=>Promise<string>){ }
 async refreshGarden(signal?:AbortSignal){const g=await this.api.request<GardenChallenge|null>('/v1/garden','GET',undefined,undefined,signal);if(signal?.aborted)throw new ApiError('Actualización suspendida.',499);await this.repo.applyCloud({garden:g});return g}
 async enroll(key:string){const g=await this.api.request<GardenChallenge>('/v1/garden/enroll','POST',{timezone:this.repo.getSnapshot().profile.timezone,policyVersion:'garden-policy-2.0.0'},key);await this.repo.applyCloud({garden:g});return g}
 async archiveGarden(key:string){await this.api.request('/v1/garden/archive','POST',{},key);await this.refreshGarden();return this.collection()}
 async harvest(key:string){const result=await this.api.request<{plant:PlantInstance;coin:Coin}>('/v1/garden/harvest','POST',{},key);await this.collection();await this.wallet();await this.refreshGarden();return result}
 async collection(){const plants=await this.api.request<PlantInstance[]>('/v1/garden/collection');await this.repo.applyCloud({plants});return plants}
 async wallet(){const coins=await this.api.request<Coin[]>('/v1/rewards/wallet');await this.repo.applyCloud({coins});return coins}
 async quote(coinId:string,key:string){const q=await this.api.request<RewardQuote>('/v1/rewards/quote','POST',{coinId},key);await this.repo.applyCloud({quotes:[...this.repo.getSnapshot().quotes.filter(x=>x.id!==q.id),q]});return q}
 async redeem(quote:RewardQuote,key:string){invariant(quoteCanConfirm(quote),'Revisá la cotización vigente.');const r=await this.api.request<Redemption>('/v1/rewards/redeem','POST',{quoteId:quote.id,termsHash:quote.terms_hash},key);await this.repo.applyCloud({redemptions:[...this.repo.getSnapshot().redemptions.filter(x=>x.id!==r.id),r]});await this.wallet();return r}
 async refreshRedemption(id:string){const r=await this.api.request<Redemption>('/v1/rewards/redemptions/'+encodeURIComponent(id));await this.repo.applyCloud({redemptions:[...this.repo.getSnapshot().redemptions.filter(x=>x.id!==id),r]});return r}
 async refreshEntitlement(signal?:AbortSignal){const entitlement=await this.api.request<Entitlement>('/v1/billing/entitlement','GET',undefined,undefined,signal);if(signal?.aborted)throw new ApiError('Actualización suspendida.',499);await this.repo.applyCloud({entitlement});return entitlement}
 uploadPhoto(uri:string,purpose:string){return this.upload(uri,purpose)}
 async createJob(route:AIRoute,input:string,mediaId:string|null,key:string,mediaUri:string|null=null){const job=await this.api.request<AIJob>('/v1/ai/jobs','POST',{route,input,mediaId},key);const value={...job,mediaUri};await this.repo.dispatch({type:'job',job:value});return value}
 async refreshJob(id:string){const j=await this.api.request<AIJob>('/v1/ai/jobs/'+encodeURIComponent(id));const old=this.repo.getSnapshot().jobs.find(x=>x.id===id);const value=reconcileJob(j,old);await this.repo.dispatch({type:'job',job:value});return value}
 async cancelJob(id:string){const j=await this.api.request<AIJob>('/v1/ai/jobs/'+encodeURIComponent(id)+'/cancel','POST',{});await this.repo.dispatch({type:'job',job:j});return j}
 async proposals(){const p=await this.api.request<Proposal[]>('/v1/proposals');await this.repo.applyCloud({proposals:p});return p}
 async proposalAction(id:string,action:'accept'|'reject'|'revert',version:number,key:string){const p=await this.api.request<Proposal>('/v1/proposals/'+encodeURIComponent(id)+'/'+action,'POST',{version},key);await this.repo.dispatch({type:'proposal',proposal:p});return p}
}

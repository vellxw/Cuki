import type {AppState,AIJob,AIRoute,GardenChallenge,PlantInstance,Coin,RewardQuote,Redemption,Entitlement,Proposal} from './types';import type {ClientRepo,SyncChange} from './repository';import {invariant} from './utils';
export class ApiError extends Error {constructor(message:string,readonly status:number,readonly details?:unknown){super(message)}}
export class ApiClient {
 readonly configured:boolean;
 constructor(readonly baseUrl:string,private token:()=>Promise<string|null>,private epoch:()=>number=()=>0){this.configured=!!baseUrl;invariant(!baseUrl||/^https?:\/\//.test(baseUrl),'La URL de API no es válida.')}
 async request<T>(path:string,method='GET',body?:unknown,key?:string,signal?:AbortSignal):Promise<T>{invariant(this.configured,'El servidor no está configurado. Las funciones manuales siguen disponibles.');invariant(path.startsWith('/')&&!path.startsWith('//'),'Ruta inválida.');const epoch=this.epoch();const token=await this.token();const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),25000);const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)controller.abort();try{const res=await fetch(this.baseUrl.replace(/\/$/,'')+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(key?{'Idempotency-Key':key}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:controller.signal});let value:unknown;try{value=await res.json()}catch{throw new ApiError('Respuesta del servidor no válida.',res.status)}invariant(epoch===this.epoch(),'La cuenta cambió; se descartó la respuesta anterior.');if(!res.ok){const error=value as {message?:string;error?:string};throw new ApiError(error.message??error.error??'No se pudo completar la operación.',res.status,value)}return value as T}finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel)}}
}
export class SyncService {
 private running:Promise<void>|null=null;
 constructor(readonly api:ApiClient,readonly repo:ClientRepo){}
 sync():Promise<void>{if(this.running)return this.running;this.running=this.perform().finally(()=>this.running=null);return this.running}
 private async perform(){
  invariant(this.repo.accountId!=='guest','Iniciá sesión para sincronizar.');
  while(true){
   const batch=this.repo.getSnapshot().outbox.filter(o=>o.state==='pending').slice(0,50);
   if(!batch.length)break;
   const result=await this.api.request<{results:{id:string;state:'accepted'|'conflict'|'failed';message?:string;remote?:unknown}[]}>('/v1/sync/push','POST',{operations:batch});
   invariant(Array.isArray(result.results),'El servidor no confirmó el lote. Se conserva para reintentar.');
   const sent=new Set(batch.map(o=>o.id));const received=new Set<string>();
   for(const r of result.results){invariant(sent.has(r.id)&&!received.has(r.id)&&['accepted','conflict','failed'].includes(r.state),'Respuesta de sincronización inconsistente.');received.add(r.id);}
   invariant(received.size===sent.size,'El servidor no confirmó todos los registros. Se conserva el lote para reintentar.');
   await this.repo.acceptSync(result.results,[],this.repo.getSnapshot().cursor??'0');
  }
  for(let i=0;i<100;i++){
   const cursor=this.repo.getSnapshot().cursor??'0';
   const result=await this.api.request<{changes:SyncChange[];cursor:string;more:boolean}>('/v1/sync/pull?cursor='+encodeURIComponent(cursor));
   invariant(Array.isArray(result.changes)&&/^\d+$/.test(result.cursor)&&typeof result.more==='boolean','Respuesta de sincronización inválida.');
   invariant(BigInt(result.cursor)>=BigInt(cursor)&&(!result.more||BigInt(result.cursor)>BigInt(cursor)),'El servidor no avanzó el cursor.');
   await this.repo.acceptSync([],result.changes,result.cursor);
   if(!result.more)return;
  }
  throw new Error('Se guardó el avance de sincronización. Volvé a sincronizar para continuar el historial.');
 }
}
export function quoteCanConfirm(q:RewardQuote,now=Date.now()){return q.eligible&&q.route!==null&&q.benefit_start_at!==null&&q.benefit_end_at!==null&&Date.parse(q.expires_at)>now&&Date.parse(q.benefit_end_at)>Date.parse(q.benefit_start_at)&&!!q.terms_hash}
export class CloudService {
 constructor(readonly api:ApiClient,readonly repo:ClientRepo,readonly upload:(uri:string,purpose:string)=>Promise<string>){ }
 async refreshGarden(){const g=await this.api.request<GardenChallenge|null>('/v1/garden');await this.repo.applyCloud({garden:g});return g}
 async enroll(key:string){const g=await this.api.request<GardenChallenge>('/v1/garden/enroll','POST',{timezone:this.repo.getSnapshot().profile.timezone,policyVersion:'garden-policy-2.0.0'},key);await this.repo.applyCloud({garden:g});return g}
 async archiveGarden(key:string){await this.api.request('/v1/garden/archive','POST',{},key);await this.refreshGarden();return this.collection()}
 async harvest(key:string){const result=await this.api.request<{plant:PlantInstance;coin:Coin}>('/v1/garden/harvest','POST',{},key);await this.collection();await this.wallet();await this.refreshGarden();return result}
 async collection(){const plants=await this.api.request<PlantInstance[]>('/v1/garden/collection');await this.repo.applyCloud({plants});return plants}
 async wallet(){const coins=await this.api.request<Coin[]>('/v1/rewards/wallet');await this.repo.applyCloud({coins});return coins}
 async quote(coinId:string,key:string){const q=await this.api.request<RewardQuote>('/v1/rewards/quote','POST',{coinId},key);await this.repo.applyCloud({quotes:[...this.repo.getSnapshot().quotes.filter(x=>x.id!==q.id),q]});return q}
 async redeem(quote:RewardQuote,key:string){invariant(quoteCanConfirm(quote),'Revisá la cotización vigente.');const r=await this.api.request<Redemption>('/v1/rewards/redeem','POST',{quoteId:quote.id,termsHash:quote.terms_hash},key);await this.repo.applyCloud({redemptions:[...this.repo.getSnapshot().redemptions.filter(x=>x.id!==r.id),r]});await this.wallet();return r}
 async refreshRedemption(id:string){const r=await this.api.request<Redemption>('/v1/rewards/redemptions/'+encodeURIComponent(id));await this.repo.applyCloud({redemptions:[...this.repo.getSnapshot().redemptions.filter(x=>x.id!==id),r]});return r}
 async refreshEntitlement(){const entitlement=await this.api.request<Entitlement>('/v1/billing/entitlement');await this.repo.applyCloud({entitlement});return entitlement}
 uploadPhoto(uri:string,purpose:string){return this.upload(uri,purpose)}
 async createJob(route:AIRoute,input:string,mediaId:string|null,key:string,mediaUri:string|null=null){const job=await this.api.request<AIJob>('/v1/ai/jobs','POST',{route,input,mediaId},key);const value={...job,mediaUri};await this.repo.dispatch({type:'job',job:value});return value}
 async refreshJob(id:string){const j=await this.api.request<AIJob>('/v1/ai/jobs/'+encodeURIComponent(id));const old=this.repo.getSnapshot().jobs.find(x=>x.id===id);const value={...j,mediaUri:old?.mediaUri??null};await this.repo.dispatch({type:'job',job:value});return value}
 async cancelJob(id:string){const j=await this.api.request<AIJob>('/v1/ai/jobs/'+encodeURIComponent(id)+'/cancel','POST',{});await this.repo.dispatch({type:'job',job:j});return j}
 async proposals(){const p=await this.api.request<Proposal[]>('/v1/proposals');await this.repo.applyCloud({proposals:p});return p}
 async proposalAction(id:string,action:'accept'|'reject'|'revert',version:number,key:string){const p=await this.api.request<Proposal>('/v1/proposals/'+encodeURIComponent(id)+'/'+action,'POST',{version},key);await this.repo.dispatch({type:'proposal',proposal:p});return p}
}

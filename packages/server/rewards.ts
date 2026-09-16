import { addCalendarMonth } from '../garden-engine';
import type { RewardQuote, Redemption } from '../core/types';
import { asActor, lockActor, type Actor, type Database, type SQL } from './db';
import { need, id, idempotent, sha256, writeAudit } from './common';
import { cacheSubscription, type BillingProvider, type Subscription } from './billing';
interface QuoteInternal {public:RewardQuote;baseline:Subscription}
interface RedemptionRow {id:string;actor_id:string;coin_id:string;quote_id:string;state:Redemption['state'];provider_reference:string|null;payload:{quote:QuoteInternal;startsAt:string|null;endsAt:string|null;message:string};updated_at:Date|string}
export const redemptionOf=(r:RedemptionRow):Redemption=>({id:r.id,coinId:r.coin_id,state:r.state,message:r.payload.message,startsAt:r.payload.startsAt,endsAt:r.payload.endsAt,providerReference:r.provider_reference??undefined});
/** Provider state must show that no paid access remains before applying a promotion. */
function hasNoActivePlus(subscription:Subscription,now:Date){
 const end=Date.parse(subscription.endAt??'');
 return subscription.plan==='free'||subscription.state==='expired'&&Number.isFinite(end)&&end<=+now;
}
export async function quoteReward(db:Database,actor:Actor,coinId:string,key:string,provider:BillingProvider,now=new Date()):Promise<RewardQuote>{
 need(actor.verified,'Verificá tu cuenta para canjear.',403);
 const baseline:Subscription=provider.configured?await provider.read(actor.id,now):{plan:'free',state:'active',store:null,startAt:null,endAt:null,verifiedAt:now.toISOString()};
 return asActor(db,actor,async tx=>{await lockActor(tx,actor.id);return idempotent(tx,actor,'reward:quote:'+key,{coinId},async()=>{const coin=(await tx.query("SELECT * FROM coins WHERE id=$1 AND actor_id=$2 AND state='available'",[coinId,actor.id])).rows[0];need(coin,'La moneda no está disponible.',409);
 const free=hasNoActivePlus(baseline,now);const google=baseline.store==='play_store'&&baseline.plan==='plus'&&baseline.state==='active'&&Number.isFinite(Date.parse(baseline.endAt??''))&&Date.parse(baseline.endAt!)>+now&&baseline.productId&&typeof baseline.autoRenew==='boolean'&&provider.defer;const eligible=provider.configured&&!!(free||google);const start=free?now.toISOString():google?baseline.endAt!:null;const end=start?addCalendarMonth(start):null;const route=eligible?(free?'rc_promotional_free':'google_play_defer'):null;
 const publicQuote:RewardQuote={id:id(),coin_id:coinId,eligible,reason:!provider.configured?'El proveedor de promociones no está configurado. Tu moneda se conserva.':eligible?'Un mes completo de Plus, con 150 capturas y 300 acciones.':'No hay una promoción compatible confirmada para este plan. Tu moneda se conserva; no se superpone un acceso mientras seguís pagando.',billing_effect:route==='google_play_defer'?(baseline.autoRenew?'Se posterga la siguiente renovación de Google Play un mes calendario, sin cambiar de plan.':'Se extiende el acceso de Google Play un mes calendario, sin reactivar la renovación cancelada.'):route?'Acceso promocional sin suscripción automática ni cobro.':'Sin cambios de cobro ni consumo de moneda.',benefit_start_at:eligible?start:null,benefit_end_at:eligible?end:null,auto_renew_after:eligible?(google?baseline.autoRenew??null:false):null,expires_at:new Date(+now+120000).toISOString(),terms_hash:'',route};publicQuote.terms_hash=sha256(JSON.stringify({...publicQuote,terms_hash:undefined}));
 await tx.query('INSERT INTO reward_quotes(id,actor_id,coin_id,payload,expires_at) VALUES($1,$2,$3,$4::jsonb,$5)',[publicQuote.id,actor.id,coinId,JSON.stringify({public:publicQuote,baseline}),publicQuote.expires_at]);return publicQuote;});});
}
export async function reserveRedemption(db:Database,actor:Actor,quoteId:string,termsHash:string,key:string,now=new Date()){
 return asActor(db,actor,async tx=>{await lockActor(tx,actor.id);return idempotent(tx,actor,'reward:redeem:'+key,{quoteId,termsHash},async()=>{const qr=(await tx.query<{payload:QuoteInternal}>('SELECT payload FROM reward_quotes WHERE id=$1 AND actor_id=$2',[quoteId,actor.id])).rows[0];need(qr,'Cotización inexistente.',404);const q=qr.payload.public;need(q.eligible&&q.route&&q.terms_hash===termsHash&&Date.parse(q.expires_at)>+now,'Revisá una cotización vigente.',409);const coin=(await tx.query('SELECT * FROM coins WHERE id=$1 AND actor_id=$2 FOR UPDATE',[q.coin_id,actor.id])).rows[0];need(coin,'Moneda inexistente.',404);const existing=(await tx.query<RedemptionRow>("SELECT * FROM redemptions WHERE coin_id=$1 AND actor_id=$2 AND state<>'failed_released'",[coin.id,actor.id])).rows[0];if(existing)return redemptionOf(existing);need(coin.state==='available','Moneda no disponible.',409);
 const rid=id(),payload={quote:qr.payload,startsAt:q.benefit_start_at,endsAt:q.benefit_end_at,message:'Moneda reservada. Esperando confirmación del beneficio.'};await tx.query("UPDATE coins SET state='reserved' WHERE id=$1",[coin.id]);await tx.query("INSERT INTO redemptions(id,actor_id,coin_id,quote_id,state,payload,created_at,updated_at) VALUES($1,$2,$3,$4,'reserved',$5::jsonb,$6,$6)",[rid,actor.id,coin.id,quoteId,JSON.stringify(payload),now.toISOString()]);return redemptionOf({id:rid,actor_id:actor.id,coin_id:coin.id,quote_id:quoteId,state:'reserved',provider_reference:null,payload,updated_at:now.toISOString()});});});
}
async function finish(db:Database,actor:Actor,rid:string,state:Redemption['state'],message:string,now:Date,reference?:string){return asActor(db,actor,async tx=>{await lockActor(tx,actor.id);const row=(await tx.query<RedemptionRow>('SELECT * FROM redemptions WHERE id=$1 AND actor_id=$2 FOR UPDATE',[rid,actor.id])).rows[0];need(row,'Canje inexistente.',404);if(['confirmed','failed_released'].includes(row.state))return redemptionOf(row);await tx.query('UPDATE redemptions SET state=$1,payload=$2::jsonb,provider_reference=coalesce($3,provider_reference),updated_at=$4 WHERE id=$5',[state,JSON.stringify({...row.payload,message}),reference??null,now.toISOString(),rid]);if(state==='confirmed'||state==='failed_released')await tx.query('UPDATE coins SET state=$1 WHERE id=$2',[state==='confirmed'?'redeemed':'available',row.coin_id]);await writeAudit(tx,actor.id,'reward.'+state,rid,now.toISOString(),{providerReference:reference??null});return redemptionOf({...row,state,payload:{...row.payload,message},provider_reference:reference??row.provider_reference});});}
function confirmedBenefit(q:QuoteInternal,after:Subscription,now:Date){
 const promisedEnd=Date.parse(q.public.benefit_end_at??'');
 const actualEnd=Date.parse(after.endAt??'');
 const actualStart=Date.parse(after.startAt??'');
 const verified=Date.parse(after.verifiedAt);
 const quoteCreated=Date.parse(q.public.expires_at)-120000;
 // NaN comparisons and an "expired" response must never consume a user's coin.
 if(after.state!=='active'||!Number.isFinite(promisedEnd)||!Number.isFinite(actualEnd)
    ||!Number.isFinite(actualStart)||!Number.isFinite(verified)||verified<quoteCreated
    ||verified>+now+1000||actualStart>+now+1000||actualStart>=actualEnd
    ||actualEnd<=+now||actualEnd<promisedEnd-1000)return false;
 if(q.public.route==='rc_promotional_free')
   return after.plan==='reward_plus'&&after.store==='promotional'&&after.autoRenew!==true;
 return q.public.route==='google_play_defer'&&after.plan==='plus'&&after.store==='play_store'
   &&after.productId===q.baseline.productId&&after.autoRenew===q.baseline.autoRenew
   &&actualEnd>Date.parse(q.baseline.endAt??'');
}
export async function processRedemption(db:Database,actor:Actor,rid:string,provider:BillingProvider,now=new Date()){
 need(provider.configured,'Promociones no configuradas.',503);const row=await asActor(db,actor,async tx=>{await lockActor(tx,actor.id);const r=(await tx.query<RedemptionRow>('SELECT * FROM redemptions WHERE id=$1 AND actor_id=$2 FOR UPDATE',[rid,actor.id])).rows[0];need(r,'Canje inexistente.',404);if(r.state!=='reserved')return null;await tx.query("UPDATE redemptions SET state='awaiting_provider',updated_at=$1 WHERE id=$2",[now.toISOString(),rid]);return r;});if(!row)return;
 const q=row.payload.quote;
 try{
  const current=await provider.read(actor.id,now);const free=q.public.route==='rc_promotional_free';if(free&&!hasNoActivePlus(current,now)||!free&&(current.state!=='active'||current.plan!=='plus'||current.endAt!==q.baseline.endAt||current.productId!==q.baseline.productId||current.store!=='play_store'||current.autoRenew!==q.baseline.autoRenew))return finish(db,actor,rid,'failed_released','Cambió la suscripción. Tu moneda se liberó; solicitá nuevas condiciones.',now);
  // The absolute end is reused after a timeout, never recalculated on every retry.
  const result=free?await provider.grant(actor.id,q.public.benefit_end_at!):await provider.defer!(actor.id,q.baseline.productId!,q.public.benefit_end_at!);
  if(!confirmedBenefit(q,result,now))return finish(db,actor,rid,'unknown_reconciling','El proveedor respondió, pero falta confirmar el mes adicional. La moneda permanece reservada.',now);
  await cacheSubscription(db,actor,result,now);return finish(db,actor,rid,'confirmed','Mes de Plus confirmado por el proveedor.',now,(q.public.route??'promotion')+':'+rid);
 }catch{return finish(db,actor,rid,'unknown_reconciling','No se conoce el resultado del proveedor. Se verificará sin emitir otro beneficio ni consumir dos monedas.',now);}
}
export async function reconcileRedemption(db:Database,actor:Actor,rid:string,provider:BillingProvider,now=new Date()){
 const row=await asActor(db,actor,async tx=>(await tx.query<RedemptionRow>('SELECT * FROM redemptions WHERE id=$1 AND actor_id=$2',[rid,actor.id])).rows[0]);need(row,'Canje inexistente.',404);if(['confirmed','failed_released'].includes(row.state))return redemptionOf(row);if(row.state==='reserved')return processRedemption(db,actor,rid,provider,now);
 const current=await provider.read(actor.id,now);if(confirmedBenefit(row.payload.quote,current,now)){await cacheSubscription(db,actor,current,now);return finish(db,actor,rid,'confirmed','Beneficio confirmado tras reconciliación.',now,row.payload.quote.public.route+':'+rid);}
 // Absence is not proof that a previously timed-out external request failed. Operator review retains reservation.
 return finish(db,actor,rid,'unknown_reconciling','Confirmación pendiente. Tu caso permanece en la cola de revisión; no se volverá a emitir a ciegas.',now);
}
export async function getRedemption(db:Database,actor:Actor,rid:string){return asActor(db,actor,async tx=>{const r=(await tx.query<RedemptionRow>('SELECT * FROM redemptions WHERE id=$1 AND actor_id=$2',[rid,actor.id])).rows[0];need(r,'Canje inexistente.',404);return redemptionOf(r);});}

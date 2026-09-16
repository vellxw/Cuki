import {GrowthTimeline} from '../ui/GrowthTimeline';
import {gardenSummary} from '../../../../packages/core/garden-summary';
import React, { useState } from 'react';
import { View, Pressable, useWindowDimensions } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useApp, useTask } from '../data/AppProvider';
import { Screen, Txt, Title, Button, Card, Glass, Row, Message, Empty, Section, Chips, Toggle, Field, useNav, CloudNotice, confirm, useClock, type ScreenProps } from '../ui/components';
import { Plant, PlantLite } from '../ui/Plant';
import { Icon } from '../ui/Icon';
import { layout, useTheme } from '../ui/theme';
import { fmt, instantLabel, sessionQualifies, invariant, uid } from '../../../../packages/core/utils';
import { quoteCanConfirm } from '../../../../packages/core/api';
import type { GardenWeek, Redemption } from '../../../../packages/core/types';
const weekLabel: Record<string, string> = {
  future: 'Próxima',
  open: 'En curso',
  credited: 'Acreditada',
  awaiting_sync: 'Esperando sincronización',
  missed: 'Sin crédito al cierre'
};
function useGardenQuery() {
  const {
    state,
    api,
    cloud
  } = useApp();
  return useQuery({
    queryKey: ['garden', state.accountId],
    queryFn: () => cloud.refreshGarden(),
    enabled: state.accountId !== 'guest' && api.configured,
    retry: false,
    staleTime: 30000
  });
}
export function Garden() {
  const {state,cloud}=useApp(),nav=useNav(),task=useTask(),q=useGardenQuery();
  const {c}=useTheme(),{width,fontScale}=useWindowDimensions();
  const g=state.garden,active=g&&['active','interrupted','ready_to_harvest'].includes(g.state);
  const weeks=active?g.creditedWeeks:0,summary=gardenSummary(state),compact=width<370||fontScale>1.3;
  const counted=state.plants.filter(p=>p.archivedAt||p.grownWeeks===52);
  const currentWeek=g?.weeks.find(w=>Date.parse(g.serverNow)>=Date.parse(w.startAt)&&Date.parse(g.serverNow)<Date.parse(w.endAt))?.index??Math.min(52,weeks+1);
  return <Screen back={false} title="Tu jardín" subtitle="Disciplina hoy, una mejor versión mañana." tab="progress" background testID="SC-79" headerRight={<Button title="Perfil" icon="user" variant="quiet" onPress={()=>nav.go('SC-68')}/>}>
    <View style={{minHeight:compact?420:330,overflow:'visible',justifyContent:'flex-end',gap:9,paddingBottom:4}}>
      <View pointerEvents="none" style={compact?{position:'absolute',top:-30,right:-15,width:'82%',height:350}:{position:'absolute',top:-86,left:'34%',right:-25,height:425}}><Plant seed={active?g.plant.seed:state.localPlantSeed} weeks={weeks} height={compact?350:425}/></View>
      <View style={[layout.row,{gap:7}]}><Icon name="leaf" size={18} color={c.protein}/><Txt size={12} tone="secondary">{active?`${weeks} de 52 semanas`:'Tu próxima historia'}</Txt></View>
      <Txt size={35} weight="600" style={{maxWidth:compact?'90%':'65%'}}>{active?`Semana ${weeks}`:'Una semilla, un comienzo'}</Txt>
      {active&&<Txt size={23} tone="secondary">{weeks} / 52</Txt>}
      {active&&<GrowthTimeline weeks={g.weeks} onPress={()=>nav.go('SC-81',{week:String(currentWeek)})}/>}
      <Txt size={14} tone="secondary" style={{maxWidth:compact?'90%':'64%'}}>{g?.state==='interrupted'?'Tu planta se conserva. Podés elegir cómo seguir.':g?.state==='ready_to_harvest'?'Completaste el ciclo. Tu planta está lista para guardar.':active?'Una sesión esta semana mantiene tu crecimiento.':'Plantá tu ciclo cuando estés listo.'}</Txt>
    </View>
    {active?<>
      <View style={{flexDirection:compact?'column':'row',gap:8}}>
        <GardenMetric icon="leaf" value={String(weeks)} label="semanas" bars={g.weeks.slice(Math.max(0,weeks-7),weeks).map(w=>w.state==='credited'?1:0)}/>
        <GardenMetric icon="train" value={fmt(summary.sessionsPerWeek,1)} label="sesiones / semana registradas" bars={summary.weeklySessions}/>
        <GardenMetric icon="progress" value={summary.comparableLoadChange===null?'—':`${summary.comparableLoadChange>0?'+':''}${fmt(summary.comparableLoadChange)}%`} label="carga en press · 8 rep." bars={summary.comparableLoads.slice(-7)}/>
      </View>
      {g.state==='ready_to_harvest'?<Button title="Tu planta está lista" icon="leaf" onPress={()=>nav.go('SC-84')}/>:g.state==='interrupted'?<Button title="Conservar y elegir cómo seguir" onPress={()=>nav.go('SC-83')}/>:<Button title="Registrar un entrenamiento" icon="train" variant="quiet" onPress={()=>nav.tab('train')}/>}
    </>:<><Message>Un entrenamiento por semana durante 52 semanas consecutivas. Al cerrar el ciclo, guardás tu planta y ganás una moneda por un mes de Plus. También en Gratis.</Message><Button title="Plantar mi primer ciclo" icon="leaf" onPress={()=>nav.go('SC-80')}/></>}
    <Section title="Mi jardín" action={`${counted.length} plantas`} onAction={()=>nav.go('SC-86')}>
      <View style={{flexDirection:'row',gap:10,flexWrap:'wrap'}}>{counted.slice(0,3).map(p=><Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`Ver planta ${p.species}, ${p.grownWeeks} semanas`} onPress={()=>nav.go('SC-86',{plantId:p.id})} style={{flex:1,minWidth:88,gap:6}}><Glass style={{padding:4,borderRadius:20}}><PlantLite seed={p.seed} weeks={p.grownWeeks} height={108}/></Glass><Txt size={12} style={{textAlign:'center'}}>{p.grownWeeks===52?'Completada':'Conservada'}</Txt><Txt size={11} tone="secondary" style={{textAlign:'center'}}>{p.grownWeeks} semanas</Txt></Pressable>)}</View>
      {!counted.length&&<Txt tone="secondary" size={13}>Las plantas que completes o conserves van a vivir acá.</Txt>}
    </Section>
    <View style={layout.wrap}><Button title="Mis monedas" icon="coin" variant="quiet" onPress={()=>nav.go('SC-88')}/><Button title="Actualizar jardín" icon="refresh" variant="quiet" onPress={()=>task.run(async()=>{await q.refetch();await cloud.collection();})}/></View>
    {active&&<Txt size={11} tone="secondary">Las estadísticas usan tus registros disponibles. La carga compara series de 8 repeticiones en el mismo press inclinado; no es una medición de fuerza fisiológica.</Txt>}
    <CloudNotice/><Message type="error">{task.error??q.error?.message}</Message>
  </Screen>;
}
function GardenMetric({icon,value,label,bars}:{icon:string;value:string;label:string;bars:number[]}){
 const {c}=useTheme(),max=Math.max(1,...bars);
 return <Glass style={{flex:1,padding:13,minHeight:126,gap:5,borderRadius:23}}><Icon name={icon} size={19} color={icon==='leaf'?c.protein:c.text}/><Txt size={29} weight="600">{value}</Txt><Txt size={11} tone="secondary">{label}</Txt><View style={{flexDirection:'row',gap:5,alignItems:'flex-end',height:26,marginTop:4}}>{bars.slice(-7).map((n,i)=><View key={i} style={{flex:1,maxWidth:6,height:Math.max(2,24*n/max),borderRadius:4,backgroundColor:icon==='train'?c.carbs:c.protein,opacity:n>0?.85:.25}}/>)}</View></Glass>;
}
export function EnrollGarden() {
  const {
    state,
    cloud,
    requestKey,
    identity
  } = useApp();
  const nav = useNav();
  const task = useTask();
  const [accept, setAccept] = useState(false);
  return <Screen title="Plantar tu ciclo" tab="progress" background testID="SC-80"><Plant seed={state.localPlantSeed} weeks={0} height={240} /><Txt size={26} weight="600">Pequeñas acciones. Una historia larga.</Txt><Card><Txt>• 52 ventanas consecutivas de siete días civiles, ancladas al momento de inscribirte.</Txt><Txt>• Al menos una sesión propia finalizada y no vacía por ventana.</Txt><Txt>• Entrenar más no acelera la recompensa.</Txt><Txt>• La última ventana debe cerrar antes de cosechar.</Txt><Txt>• Si se interrumpe el ciclo, tu planta se conserva y el reinicio es voluntario.</Txt></Card><Message>52 semanas son 364 días civiles, no un año calendario exacto. La zona {state.profile.timezone} queda fijada para este ciclo, incluso si viajás. Se admiten hasta 7 días UTC de llegada tardía para registros realmente realizados dentro de su ventana.</Message><Toggle label="Entendí y acepto la regla del ciclo" value={accept} onChange={setAccept} /><Button title="Confirmar y plantar" disabled={!accept || !identity} busy={task.busy} onPress={() => task.run(async () => {
      invariant(!state.garden || !['active', 'ready_to_harvest'].includes(state.garden.state), 'Ya hay un ciclo activo.');
      const key = await requestKey('enroll', state.plants.map(p => p.id).sort().join(',') + ':' + (state.garden?.id ?? 'first'));
      await cloud.enroll(key);
      nav.replace('SC-79');
    })} />{!identity && <Button title="Iniciar sesión para preservar mi planta" variant="secondary" onPress={() => nav.go('SC-03')} />}<Message>Tu cuenta conserva la semilla, el calendario y los créditos. No se inventa un premio local sin verificación del servidor. Gratis también participa.</Message><Message type="error">{task.error}</Message></Screen>;
}
export function GardenWeekScreen({
  params
}: ScreenProps) {
  const {
    state
  } = useApp();
  const nav = useNav();
  const week = state.garden?.weeks.find(w => w.index === Number(params.week));
  const sessions = week ? state.sessions.filter(s => sessionQualifies(s) && s.endedAt && Date.parse(s.endedAt) >= Date.parse(week.startAt) && Date.parse(s.endedAt) < Date.parse(week.endAt)) : [];
  return <Screen title={`Semana ${week?.index ?? params.week ?? ''}`} tab="progress" testID="SC-81">{state.garden&&<Chips options={state.garden.weeks.map(w=>({value:String(w.index),label:`Semana ${w.index}`}))} value={params.week??""} onChange={value=>nav.replace("SC-81",{week:value})}/>} {week ? <><Title>{weekLabel[week.state]}</Title><Txt>Inicio: {instantLabel(week.startAt)}</Txt><Txt>Cierre: {instantLabel(week.endAt)}</Txt><Txt tone="secondary">Zona del ciclo: {state.garden?.timezone}</Txt><Message>Una sesión se asigna por su hora de finalización a una sola ventana. Las sesiones anteriores al alta del ciclo no generan recompensa.</Message>{sessions.map(s => <Row key={s.id} title={s.name} subtitle={s.id === week.credit?.sessionId ? 'Crédito confirmado por el servidor' : 'Registro local; pendiente de validación o sin crédito adicional'} onPress={() => nav.go('SC-52', {
        id: s.id
      })} />)}{!sessions.length && <Empty title="Sin sesiones locales en esta ventana" detail="Una sesión de otro dispositivo puede aparecer al sincronizar. No se descarta el crédito del servidor por falta de datos locales." />}<Button title="Revisar sincronización" onPress={() => nav.go('SC-82')} /></> : <Empty title="No hay una ventana seleccionada" detail="Abrí tu ciclo desde el jardín." />}<Button title="Volver al jardín" variant="quiet" onPress={() => nav.finish('SC-79')} /></Screen>;
}
export function PendingCredit({
  params
}: ScreenProps) {
  const {
    state,
    sync,
    cloud
  } = useApp();
  const nav = useNav();
  const task = useTask();
  const [message, setMessage] = useState('');
  const session = state.sessions.find(s => s.id === params.sessionId);
  const credited = state.garden?.weeks.some(w => w.credit?.sessionId === session?.id);
  return <Screen title="Tu entrenamiento y la planta" tab="progress" testID="SC-82"><Title>{credited ? 'Semana acreditada' : 'Primero se confirma el registro'}</Title>{session && <Txt>{session.name} · {sessionQualifies(session) ? 'Sesión local válida' : 'No reúne condiciones de sesión finalizada válida'}</Txt>}<Message>{!state.garden ? 'Todavía no hay un ciclo inscripto. El entrenamiento queda en tu historial, pero no puede acreditar retroactivamente una planta nueva.' : credited ? 'El servidor confirmó una sesión para esta ventana. Las sesiones extra no aceleran las 52 semanas.' : 'La serie y la sesión están guardadas localmente. Sincronizar no garantiza un crédito hasta que el servidor valide las reglas.'}</Message><Button title="Sincronizar y consultar crédito" busy={task.busy} onPress={() => task.run(async () => {
      await sync.sync();
      await cloud.refreshGarden();
      setMessage('Sincronización finalizada. Jardín actualizado con la respuesta del servidor.');
    })} /><Button title="Ver operaciones pendientes" variant="secondary" onPress={() => nav.go('SC-73')} /><Button title={state.garden ? 'Volver al jardín' : 'Inscribir mi primera planta'} variant="quiet" onPress={() => nav.go(state.garden ? 'SC-79' : 'SC-80')} /><Message>{message}</Message><Message type="error">{task.error}</Message></Screen>;
}
export function InterruptedGarden() {
  const {
    state,
    cloud,
    requestKey
  } = useApp();
  const nav = useNav();
  const task = useTask();
  const g = state.garden;
  return <Screen title="Tu planta se conserva" tab="progress" background testID="SC-83"><Plant seed={g?.plant.seed ?? state.localPlantSeed} weeks={g?.creditedWeeks ?? 0} height={330} /><Title>La pausa también es parte de tu historia.</Title><Message>El ciclo interrumpido no obtiene la moneda anual. Tus entrenamientos y la planta alcanzada siguen siendo tuyos. No la marchitamos ni la borramos.</Message><Button title="Conservar planta e iniciar otro ciclo" disabled={g?.state !== 'interrupted'} busy={task.busy} onPress={() => confirm('Guardar esta etapa', 'El nuevo ciclo tendrá otro calendario y no heredará créditos. No se emitirá una moneda por este ciclo interrumpido.', () => task.run(async () => {
      const key = await requestKey('archive', g!.id);
      await cloud.archiveGarden(key);
      nav.replace('SC-87');
    }))} /><Button title="Seguir usando CUKI sin reiniciar" variant="secondary" onPress={() => nav.tab('home')} /><Message type="error">{task.error}</Message></Screen>;
}
export function ReadyToHarvest() {
  const {
    state,
    cloud,
    requestKey
  } = useApp();
  const nav = useNav();
  const task = useTask();
  const g = state.garden;
  const ready = g?.state === 'ready_to_harvest' && g.creditedWeeks === 52 && Date.parse(g.serverNow) >= Date.parse(g.boundaries[52]);
  return <Screen title="Tu planta anual" tab="progress" background testID="SC-84"><Plant seed={g?.plant.seed ?? state.localPlantSeed} weeks={g?.creditedWeeks ?? 0} height={340} /><Title>{ready ? '52 semanas. La cultivaste.' : 'El ciclo todavía no cerró'}</Title><Message>{ready ? 'Guardá la planta en tu colección y recibí una moneda. Tocar dos veces o volver tras una desconexión no debe duplicar el premio.' : 'Se requiere crédito en las 52 ventanas y el cierre de la última, confirmado por el servidor. El reloj del teléfono no concede premios.'}</Message><Button title="Guardar planta y obtener moneda" disabled={!ready} busy={task.busy} onPress={() => task.run(async () => {
      const key = await requestKey('harvest', g!.id);
      const result = await cloud.harvest(key);
      nav.replace('SC-85', {
        plantId: result.plant.id,
        coinId: result.coin.id
      });
    })} /><Button title="Actualizar elegibilidad" variant="secondary" onPress={() => task.run(() => cloud.refreshGarden())} /><Message type="error">{task.error}</Message></Screen>;
}
export function HarvestCelebration({
  params
}: ScreenProps) {
  const {
    state
  } = useApp();
  const nav = useNav();
  const plant = state.plants.find(p => p.id === params.plantId);
  const coin = state.coins.find(c => c.id === params.coinId);
  return <Screen back={false} dock={false} background testID="SC-85">{plant && coin ? <><Txt size={15} tone="protein" weight="700" style={{
        textAlign: 'center',
        marginTop: 30
      }}>52 SEMANAS</Txt><Plant seed={plant.seed} weeks={plant.grownWeeks} height={380} /><Txt size={38} weight="600" style={{
        textAlign: 'center'
      }}>La cultivaste.</Txt><View style={{
        alignItems: 'center',
        gap: 18
      }}><Icon name="coin" color="#D2B77B" size={54} /><Txt size={25} weight="600">1 moneda en tu cuenta</Txt><Txt tone="secondary" style={{
          textAlign: 'center'
        }}>Tu planta ya está guardada. Podés canjear la moneda por un mes completo de Plus.</Txt></View><Button title="Ver mi jardín" onPress={() => nav.replace('SC-86')} /><Button title="Canjear mi moneda" variant="secondary" onPress={() => nav.go('SC-88')} /><Button title="Plantar otra historia" variant="quiet" onPress={() => nav.go('SC-87')} /></> : <><Empty title="Consultá el estado del premio" detail="No se celebra una cosecha sin la planta y la moneda confirmadas por el servidor." /><Button title="Volver al jardín" onPress={() => nav.replace('SC-79')} /></>}</Screen>;
}
export function GardenCollection({
  params
}: ScreenProps) {
  const {
    state,
    cloud
  } = useApp();
  const nav = useNav();
  const task = useTask();
  const [selected, setSelected] = useState(params.plantId ?? state.plants[0]?.id ?? '');
  const plant = state.plants.find(p => p.id === selected);
  return <Screen title="Mi colección" subtitle={`${state.plants.length} plantas guardadas. El botón de nueva planta no suma al total.`} tab="progress" background testID="SC-86">{plant && <><Plant seed={plant.seed} weeks={plant.grownWeeks} height={350} /><Txt size={25} weight="600">{plant.grownWeeks === 52 ? 'Ciclo completado' : 'Etapa conservada'}</Txt><Txt tone="secondary">{plant.grownWeeks} semanas · {plant.species}</Txt><Txt size={12} tone="muted" selectable>Semilla {plant.seed} · generador {plant.generatorVersion} · render {plant.rendererVersion}</Txt></>}{state.plants.map(p => <Row key={p.id} title={p.grownWeeks === 52 ? 'Planta completada' : 'Planta conservada'} subtitle={`${p.grownWeeks} semanas · ${p.archivedAt ? instantLabel(p.archivedAt) : 'Guardada'}`} leading={<View style={{
      width: 65
    }}><PlantLite seed={p.seed} weeks={p.grownWeeks} height={85} /></View>} onPress={() => setSelected(p.id)} />)}{!state.plants.length && <Empty title="Un jardín con espacio para tus historias" detail="Las plantas completadas o conservadas aparecerán aquí. Tu ciclo en curso vive en la pantalla de jardín." />}<Button title="Plantar un nuevo ciclo" onPress={() => nav.go('SC-87')} /><Button title="Actualizar colección" variant="quiet" onPress={() => task.run(() => cloud.collection())} /><Button title="Exportar mis plantas" variant="quiet" onPress={() => nav.go('SC-70')} /><Message type="error">{task.error}</Message></Screen>;
}
export function NewSeed() {
  const {
    state
  } = useApp();
  const nav = useNav();
  const active = state.garden && ['active', 'ready_to_harvest'].includes(state.garden.state);
  return <Screen title="Otra semilla, otra historia" tab="progress" background testID="SC-87"><Plant seed={state.localPlantSeed ^ 0x32a7} weeks={0} height={300} /><Message>{active ? 'Ya hay un ciclo elegible en curso. Podés verlo o cosecharlo cuando cierre; no se mantienen dos ciclos elegibles a la vez.' : 'Tu colección permanece intacta. El servidor asignará una nueva semilla y un nuevo calendario al confirmar el alta. No se arrastran sesiones del ciclo anterior.'}</Message><Button title={active ? 'Ver mi ciclo actual' : 'Continuar a la inscripción'} onPress={() => nav.go(active ? 'SC-79' : 'SC-80')} /><Button title="Volver a mi colección" variant="secondary" onPress={() => nav.finish('SC-86')} /></Screen>;
}
export function Wallet() {
  const {
    state,
    api,
    cloud,
    requestKey
  } = useApp();
  const nav = useNav();
  const task = useTask();
  const q = useQuery({
    queryKey: ['wallet', state.accountId],
    queryFn: () => cloud.wallet(),
    enabled: state.accountId !== 'guest' && api.configured,
    retry: false
  });
  const available = state.coins.filter(c => c.state === 'available').length;
  return <Screen title="Mis monedas" subtitle="Gratis también gana y canjea. No se compran ni se transfieren." tab="progress" testID="SC-88"><View style={{
      alignItems: 'center',
      gap: 16,
      padding: 20
    }}><Icon name="coin" color="#D2B77B" size={60} /><Txt size={46} weight="600">{available}</Txt><Txt tone="secondary">monedas disponibles</Txt></View>{state.coins.map(coin => <Card key={coin.id}><Txt weight="600">{coin.state === 'available' ? 'Disponible' : coin.state === 'reserved' ? 'Canje en proceso' : 'Canjeada'}</Txt><Txt tone="secondary">Ganada: {instantLabel(coin.earnedAt)}</Txt>{coin.state === 'available' ? <Button title="Consultar mi mes de Plus" busy={task.busy} onPress={() => task.run(async () => {
        const key = await requestKey('quote:' + coin.id, new Date().toISOString().slice(0, 16));
        const quote = await cloud.quote(coin.id, key);
        nav.go('SC-89', {
          id: quote.id
        });
      })} /> : state.redemptions.some(r => r.coinId === coin.id) && <Button title="Ver estado del canje" variant="secondary" onPress={() => nav.go('SC-90', {
        id: state.redemptions.find(r => r.coinId === coin.id)!.id
      })} />}</Card>)}{!state.coins.length && <Empty title="Tu constancia tiene recompensa" detail="Completá y cerrá las 52 ventanas semanales de un ciclo para cosechar una moneda." action="Ir al jardín" onPress={() => nav.go('SC-79')} />}<Message>Antes de canjear verás las fechas, las cuotas y el efecto sobre tu próxima renovación. Si no podemos confirmar un beneficio adicional compatible, conservás la moneda.</Message><Button title="Actualizar monedas" variant="quiet" onPress={() => task.run(() => q.refetch())} /><Message type="error">{task.error ?? q.error?.message}</Message></Screen>;
}
export function RewardQuoteScreen({
  params
}: ScreenProps) {
  const {
    state,
    cloud,
    requestKey
  } = useApp();
  const nav = useNav();
  const task = useTask();
  const now = useClock();
  const [accept, setAccept] = useState(false);
  const quote = state.quotes.find(q => q.id === params.id);
  const coin = state.coins.find(c => c.id === quote?.coin_id);
  const eligible = quote && coin?.state === 'available' && quoteCanConfirm(quote, now);
  return <Screen title="Tu mes de Plus" tab="progress" testID="SC-89">{quote ? <><Title>{eligible ? 'Un beneficio real, antes de confirmar' : 'Tu moneda se conserva'}</Title><Txt>{quote.reason}</Txt><Card><Txt weight="600">Efecto sobre tus cobros</Txt><Txt>{quote.billing_effect}</Txt><Txt>Inicio: {quote.benefit_start_at ? instantLabel(quote.benefit_start_at) : 'Por confirmar'}</Txt><Txt>Fin: {quote.benefit_end_at ? instantLabel(quote.benefit_end_at) : 'Por confirmar'}</Txt><Txt>Renovación posterior: {quote.auto_renew_after === null ? 'Por confirmar' : quote.auto_renew_after ? 'Sí, según condiciones indicadas' : 'No automática'}</Txt><Txt>150 capturas y 300 acciones durante el mes de servicio; revisión semanal. No son cuotas reducidas de prueba.</Txt></Card><Txt size={13} tone="secondary">Cotización válida hasta {instantLabel(quote.expires_at)}.</Txt><Toggle label="Revisé fechas y efecto sobre los cobros" value={accept} onChange={setAccept} /><Button title="Confirmar canje de una moneda" disabled={!eligible || !accept} busy={task.busy} onPress={() => task.run(async () => {
        invariant(quoteCanConfirm(quote), 'Cotización vencida o no compatible.');
        const key = await requestKey('redeem', quote.id);
        const result = await cloud.redeem(quote, key);
        nav.replace('SC-90', {
          id: result.id
        });
      })} />{!eligible && <Message>No se consume una moneda por activar un indicador local mientras la tienda continúa cobrando exactamente igual.</Message>}</> : <Empty title="Cotización no disponible" detail="Volvé a consultar desde tu billetera. Ninguna moneda fue consumida aquí." />}<Button title="Volver sin canjear" variant="secondary" onPress={() => nav.finish('SC-88')} /><Message type="error">{task.error}</Message></Screen>;
}
const redemptionLabels: Record<Redemption['state'], string> = {
  reserved: 'Moneda reservada',
  awaiting_provider: 'Esperando a la tienda',
  confirmed: 'Beneficio confirmado',
  unknown_reconciling: 'Reconciliando el resultado',
  failed_released: 'No aplicado; moneda liberada'
};
export function RedemptionStatus({
  params
}: ScreenProps) {
  const {
    state,
    cloud,
    api
  } = useApp();
  const nav = useNav();
  const task = useTask();
  const current = state.redemptions.find(r => r.id === params.id);
  const q = useQuery({
    queryKey: ['redemption', state.accountId, params.id],
    queryFn: () => cloud.refreshRedemption(params.id!),
    enabled: !!params.id && api.configured && state.accountId !== 'guest',
    retry: false,
    refetchInterval: q => ['reserved', 'awaiting_provider', 'unknown_reconciling'].includes(q.state.data?.state ?? current?.state ?? '') ? 5000 : false
  });
  const r = q.data ?? current;
  return <Screen title="Estado del canje" tab="progress" testID="SC-90"><Title>{r ? redemptionLabels[r.state] : 'Consultando resultado'}</Title>{r && <><Message>{r.message || (r.state === 'unknown_reconciling' ? 'No se conoce aún el resultado del proveedor. No repetimos el premio ni liberamos la moneda sin reconciliar.' : 'El servidor informa el estado del canje.')}</Message>{r.startsAt && <Txt>Inicio: {instantLabel(r.startsAt)}</Txt>}{r.endsAt && <Txt>Fin: {instantLabel(r.endsAt)}</Txt>}{r.state === 'confirmed' && <Button title="Ver mi acceso Plus" onPress={() => task.run(async () => {
        await cloud.refreshEntitlement();
        nav.go('SC-91', {
          id: r.id
        });
      })} />}</>}<Button title="Actualizar estado" variant="secondary" busy={task.busy} onPress={() => task.run(() => q.refetch())} /><Button title="Volver a mis monedas" variant="quiet" onPress={() => nav.finish('SC-88')} /><Message type="error">{task.error ?? q.error?.message}</Message></Screen>;
}
export function RewardMonth() {
  const {
    state,
    cloud
  } = useApp();
  const nav = useNav();
  const task = useTask();
  const e = state.entitlement;
  const active = e.plan === 'reward_plus' && !!e.verifiedAt && e.state === 'active';
  return <Screen title="Plus cultivado por vos" tab="progress" background testID="SC-91"><View style={{
      alignItems: 'center',
      padding: 24
    }}><Icon name="coin" color="#D2B77B" size={65} /></View><Title>{active ? 'Disfrutá tu mes de Plus' : 'Verificá el beneficio con el servidor'}</Title><Message>{active ? 'Tu recompensa incluye las funciones y cuotas completas del mes de servicio.' : 'No se afirma acceso activo solo porque una animación mostró una moneda. También puede existir una extensión verificada de tu plan pagado; revisá el efecto confirmado en el canje.'}</Message><Row title="Capturas asistidas" trailing={<Txt>{e.captures.used} / {e.captures.limit}</Txt>} /><Row title="Acciones asistidas" trailing={<Txt>{e.actions.used} / {e.actions.limit}</Txt>} />{e.expiresAt && <Txt>Vigencia informada: {instantLabel(e.expiresAt)}</Txt>}<Button title="Planificar mis próximas comidas" onPress={() => nav.go('SC-37')} /><Button title="Actualizar acceso" variant="secondary" onPress={() => task.run(() => cloud.refreshEntitlement())} /><Button title="Administrar mi plan" variant="quiet" onPress={() => nav.go('SC-67')} /><Button title="Plantar otra historia" variant="quiet" onPress={() => nav.go('SC-87')} /><Message type="error">{task.error}</Message></Screen>;
}
export const gardenScreens = {
  'SC-79': Garden,
  'SC-80': EnrollGarden,
  'SC-81': GardenWeekScreen,
  'SC-82': PendingCredit,
  'SC-83': InterruptedGarden,
  'SC-84': ReadyToHarvest,
  'SC-85': HarvestCelebration,
  'SC-86': GardenCollection,
  'SC-87': NewSeed,
  'SC-88': Wallet,
  'SC-89': RewardQuoteScreen,
  'SC-90': RedemptionStatus,
  'SC-91': RewardMonth
};
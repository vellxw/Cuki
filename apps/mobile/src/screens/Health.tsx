import React,{useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useApp,useTask} from '../data/AppProvider';
import {Screen,Title,Button,Toggle,Section,Message,Txt,Row} from '../ui/components';
import {healthAvailable,requestHealth,readHealth,healthSettings,healthName,healthDigest,healthAccountGuard,type HealthReadResult} from '../native/health';
import {importHealthWeights} from '../../../../packages/core/health-client';
import {invariant,prettyDate} from '../../../../packages/core/utils';
import {requestNotifications} from '../native/notifications';
export function HealthDevices(){
 const {state,repo}=useApp(),task=useTask();
 const [readWeight,setReadWeight]=useState(true),[readWorkout,setReadWorkout]=useState(false);
 const [consent,setConsent]=useState(false),[message,setMessage]=useState('');
 const [preview,setPreview]=useState<HealthReadResult|null>(null);
 const q=useQuery({queryKey:['health-availability'],queryFn:healthAvailable,retry:false});
 const options={readWeight,readWorkout,writeWorkout:false};
 const isCurrent=healthAccountGuard(repo.accountId);
 const weights=preview?.records.filter(r=>r.kind==='weight')??[];
 const read=()=>task.run(async()=>{
  invariant(consent,'Revisá y confirmá los datos que vas a consultar.');
  invariant(isCurrent(),'La cuenta cambió. Volvé a abrir esta pantalla.');
  const permission=await requestHealth(options);
  invariant(permission.requestCompleted,'La solicitud de permisos no se completó.');
  invariant(isCurrent(),'La cuenta cambió. Volvé a abrir esta pantalla.');
  const result=await readHealth(new Date(Date.now()-30*86400000).toISOString(),new Date().toISOString(),options);
  invariant(isCurrent(),'La cuenta cambió. No se importó nada.');
  setPreview(result);
  setMessage(result.readAccess==='not_disclosed'?'Apple no informa si autorizaste cada lectura. Solo mostramos los datos que devuelve el sistema.':'Solo se consultaron los tipos autorizados. Podés revocar el permiso en cualquier momento.');
 });
 return <Screen title="Salud y dispositivos" testID="SC-69">
  <Title>{healthName}</Title>
  <Message>{q.isPending?'Comprobando disponibilidad nativa…':q.data?'La integración nativa está disponible. Consultar datos no los guarda automáticamente en tu cuenta.':'La integración no está disponible en este dispositivo o binario. Los registros manuales funcionan igual.'}</Message>
  <Toggle label="Consultar peso" value={readWeight} onChange={v=>{setReadWeight(v);setPreview(null)}}/>
  <Toggle label="Consultar actividades" detail="Se muestran como referencia, sin duplicar entrenamientos ni acreditar el jardín." value={readWorkout} onChange={v=>{setReadWorkout(v);setPreview(null)}}/>
  <Toggle label="Autorizo consultar los últimos 30 días" detail="Si luego importás medidas, se guardan en CUKI y se sincronizan cuando conectás tu cuenta. No se usan para publicidad." value={consent} onChange={v=>{setConsent(v);if(!v)setPreview(null)}}/>
  <Button title="Elegir permisos y consultar" disabled={!q.data||!consent||!readWeight&&!readWorkout} busy={task.busy} onPress={read}/>
  {preview&&<Section title="Datos disponibles para revisar">
   <Txt>{preview.records.filter(r=>r.kind==='weight').length} medidas de peso · {preview.records.filter(r=>r.kind==='workout').length} actividades.</Txt>
   {!preview.records.length&&<Message>No se recibieron registros. Puede no haber datos, o puede que la lectura no esté autorizada. No se borró nada.</Message>}
   {preview.truncated&&<Message type="warning">Hay más registros que el límite de esta consulta. No es un historial completo.</Message>}
   {preview.records.length>12&&<Txt tone="secondary">Vista previa de 12 de {preview.records.length} registros. El botón importa las {weights.length} medidas de peso disponibles en esta consulta.</Txt>}
   {preview.records.slice(0,12).map(r=><Row key={r.provider+':'+r.externalId} title={r.kind==='weight'?`${r.value} kg`:r.title??'Actividad'} subtitle={`${prettyDate(r.date.slice(0,10))} · ${r.source}`}/>)}
   <Button title={`Importar ${weights.length} medidas de peso`} busy={task.busy} variant="secondary" disabled={!consent||!preview.records.some(r=>r.kind==='weight')} onPress={()=>task.run(async()=>{
    const result=await importHealthWeights(repo,preview.records,healthDigest,isCurrent);
    setMessage(`${result.inserted} medidas nuevas, ${result.updated} actualizadas, ${result.unchanged} sin cambios. ${result.conflicts} cambios o eliminaciones manuales conservados. Las actividades no se convierten en sesiones.`);
   })}/>
  </Section>}
  <Button title="Abrir permisos del sistema" disabled={!q.data} variant="quiet" onPress={()=>task.run(healthSettings)}/>
  <Message>Para guardar un entrenamiento en {healthName}, abrí su resumen y elegí Exportar a salud. Se pedirá permiso de escritura por separado. El intervalo exportado incluye las pausas; no agregamos calorías calculadas.</Message>
  <Section title="Descansos y avisos"><Toggle label="Notificar al terminar un descanso" value={state.profile.reminders} onChange={v=>task.run(async()=>{
   const granted=v?await requestNotifications():false;await repo.dispatch({type:'profile',profile:{reminders:granted}});
   if(v&&!granted)setMessage('El permiso no fue autorizado. El temporizador funciona dentro de CUKI.');
  })}/></Section><Message>{message}</Message><Message type="error">{task.error??q.error?.message}</Message>
 </Screen>;
}

import React,{useState} from 'react';
import {View,Pressable,TextInput,StyleSheet,useWindowDimensions} from 'react-native';
import {useApp,useTask,useDraft} from '../data/AppProvider';
import {Screen,Txt,Title,Button,Field,Row,Message,Empty,Section,Glass,useNav,useClock,type ScreenProps} from '../ui/components';
import {layout,useTheme} from '../ui/theme';
import {scheduleRest} from '../native/notifications';
import {blankSet} from '../../../../packages/core/state';
import {duration,fmt,numberInput,sessionSeconds,setValid} from '../../../../packages/core/utils';
import {loadToDisplay,loadToKg,nextExerciseIndex} from '../../../../packages/core/training';
import type {WorkoutSession,SetEntry,LoadMode} from '../../../../packages/core/types';
const modeLabel:Record<LoadMode,string>={external_total:'Carga total',external_per_side:'Carga por lado',bodyweight:'Peso corporal',assisted:'Asistencia',time:'Duración',distance:'Distancia'};
function SessionAbsent(){const nav=useNav();return <Empty title="No hay sesión activa" detail="Tus sesiones finalizadas están en el historial." action="Ir a entrenar" onPress={()=>nav.tab('train')}/>}
export function ActiveWorkout({
  params
}: ScreenProps) {
  const {
    state
  } = useApp();
  const session = state.sessions.find(s => s.id === params.id) ?? state.sessions.find(s => s.status === 'active' || s.status === 'paused');
  return <Screen title={session?.name ?? 'Entrenamiento'} subtitle={session ? `Ejercicio ${session.currentExercise + 1} de ${session.exercises.length}` : undefined} tab="train" background testID="SC-47" contentStyle={{gap:13}}>{params.notificationWarning === '1' && <Message type="warning">El descanso terminó en CUKI, pero el sistema no confirmó cancelar su aviso. Tus series están guardadas.</Message>}{session && ['active', 'paused'].includes(session.status) ? <WorkoutBody key={session.id + ':' + session.currentExercise} session={session} /> : <SessionAbsent />}</Screen>;
}
function WorkoutBody({
  session
}: {
  session: WorkoutSession;
}) {
  const {
    state,
    repo
  } = useApp();
  const nav = useNav();
  const task = useTask();
  const now = useClock();
  const current = session.exercises[session.currentExercise];
  const exercise = state.exercises.find(e => e.id === current?.exerciseId);
  const set = current?.sets.find(s => !s.completedAt);
  const previous = state.sessions.filter(s => s.status === 'completed').sort((a, b) => (b.endedAt ?? '').localeCompare(a.endedAt ?? '')).flatMap(s => s.exercises).find(e => e.exerciseId === exercise?.id);
  const [note, setNote] = useState(session.note);
  const [notesOpen, setNotesOpen] = useState(false);
  if (!exercise || !current) return <SessionAbsent />;
  return <><View style={{gap:7,paddingBottom:6}}><Title>{exercise.name}</Title><Txt size={13} tone="secondary">{exercise.muscle} · {exercise.equipment} · {modeLabel[exercise.loadMode]}</Txt><Txt size={12} tone="secondary">Tiempo activo: {duration(sessionSeconds(session, now))}</Txt></View>{session.status === 'paused' && <Message>Sesión pausada. Podés reanudarla sin perder datos.</Message>}{set ? <CurrentSet key={set.id} session={session} exerciseId={current.id} set={set} /> : <><SessionSetTable session={session} exerciseId={current.id}/><Message type="success">Terminaste las series previstas de este ejercicio.</Message></>}{previous && <Txt size={12} tone="secondary">Anterior comparable: {previous.sets.filter(setValid).map(t => `${fmt(loadToDisplay(t.load??0,state.profile.units), 1)} ${state.profile.units==='imperial'?'lb':'kg'} × ${t.reps ?? '—'}`).join(' · ')}</Txt>}<View style={layout.wrap}><Button title="Añadir serie" icon="plus" variant="secondary" onPress={() => task.run(() => repo.dispatch({
        type: 'set',
        sessionId: session.id,
        exerciseId: current.id,
        set: blankSet(exercise, current.sets.at(-1)?.load ?? null)
      }))} /><Button title={session.status === 'paused' ? 'Reanudar' : 'Pausar'} icon={session.status === 'paused' ? 'play' : 'pause'} variant="quiet" onPress={() => task.run(() => repo.dispatch({
        type: session.status === 'paused' ? 'resumeSession' : 'pauseSession',
        id: session.id
      }))} /></View><Row title="Cambiar ejercicio" onPress={() => nav.go('SC-50', {
      id: session.id,
      exerciseId: current.id
    })} /><Button title={notesOpen ? 'Cerrar notas' : 'Notas de sesión'} variant="quiet" onPress={() => setNotesOpen(!notesOpen)} />{notesOpen && <><Field label="Nota de sesión" value={note} onChangeText={setNote} multiline /><Button title="Guardar nota" variant="secondary" onPress={() => task.run(() => repo.dispatch({
        type: 'sessionNote',
        id: session.id,
        note
      }))} /></>}<Section title="Ejercicios de la sesión">{session.exercises.map((e, i) => <Row key={e.id} title={`${i + 1}. ${state.exercises.find(x => x.id === e.exerciseId)?.name ?? 'Ejercicio'}`} subtitle={`${e.sets.filter(t => t.completedAt).length}/${e.sets.length} series${e.superset ? ' · Grupo ' + e.superset : ''}`} onPress={() => task.run(() => repo.dispatch({
        type: 'sessionIndex',
        sessionId: session.id,
        index: i
      }))} />)}</Section><Button title="Añadir ejercicio" variant="secondary" onPress={() => nav.go('SC-45', {
      mode: 'session',
      sessionId: session.id
    })} /><Button title="Finalizar entrenamiento" onPress={() => nav.go('SC-51', {
      id: session.id
    })} /><Message type="error">{task.error}</Message></>;
}
/** A single compact table carries both history and the editable current set.
 * Long sessions keep all sets; disclosure, not omission, protects the initial viewport.
 */
function SessionSetTable({session,exerciseId,currentId,renderActive}:{session:WorkoutSession;exerciseId:string;currentId?:string;renderActive?:(index:number)=>React.ReactNode}) {
  const {state}=useApp(),{c}=useTheme(),nav=useNav();
  const {fontScale}=useWindowDimensions();
  const [expanded,setExpanded]=useState(false);
  const rows=session.exercises.find(e=>e.id===exerciseId)?.sets??[];
  const index=Math.max(0,rows.findIndex(s=>s.id===currentId));
  const start=expanded?0:Math.max(0,Math.min(index-2,rows.length-4));
  const shown=expanded?rows:rows.slice(start,start+4);
  const activity=rows[index]?.kind;
  return <View testID="workout-set-table" style={{gap:3}}>
    <View style={{flexDirection:'row',paddingHorizontal:12,paddingBottom:5,gap:10}}>
      <Txt size={11} tone="secondary" style={{width:42}}>Serie</Txt>
      <Txt size={11} tone="secondary" style={{flex:1,textAlign:'center'}}>{state.profile.units==='imperial'?'lb':'kg'}</Txt>
      <Txt size={11} tone="secondary" style={{flex:1,textAlign:'center'}}>{activity==='timed'?'segundos':activity==='distance'?'metros':'reps'}</Txt>
      <View style={{width:16}}/>
    </View>
    {shown.map((row,offset)=>{
      const ordinal=(expanded?0:start)+offset+1;
      if(row.id===currentId&&renderActive)return <View key={row.id}>{renderActive(ordinal)}</View>;
      const kind=row.kind==='warmup'?'calentamiento':row.kind==='drop'?'descendente':row.kind==='working'?'trabajo':'actividad';
      const amount=row.load===null?'—':fmt(loadToDisplay(row.load,state.profile.units),1);
      const reps=row.reps??(row.seconds!==null?row.seconds:row.meters!==null?fmt(row.meters):'—');
      return <Pressable key={row.id} accessibilityRole="button" accessibilityLabel={`Editar serie ${ordinal}, ${kind}, ${amount} ${state.profile.units==='imperial'?'lb':'kg'}, ${reps}${row.completedAt?', completada':''}`} onPress={()=>nav.go('SC-49',{id:session.id,exerciseId,setId:row.id})}
        style={{flexDirection:'row',gap:10,alignItems:'center',minHeight:44*fontScale,paddingHorizontal:12,borderBottomWidth:StyleSheet.hairlineWidth,borderColor:c.line}}>
        <Txt size={14} tone={row.completedAt?'protein':'secondary'} style={{width:42}}>{row.completedAt?'✓':ordinal}{row.kind==='warmup'?' c':row.kind==='drop'?' d':''}</Txt>
        <Txt size={15} style={{flex:1,textAlign:'center'}}>{amount}</Txt>
        <Txt size={15} style={{flex:1,textAlign:'center'}}>{reps}</Txt>
        <Txt size={17} tone="muted" style={{width:16}}>›</Txt>
      </Pressable>;
    })}
    {rows.length>4&&<Button title={expanded?'Ver la serie actual':`Ver las ${rows.length} series`} variant="quiet" onPress={()=>setExpanded(!expanded)}/>}
  </View>;
}
function CurrentSet({
  session,
  exerciseId,
  set
}: {
  session: WorkoutSession;
  exerciseId: string;
  set: SetEntry;
}) {
  const {
    state,
    repo
  } = useApp();
  const nav = useNav();
  const task = useTask();
  const d = useDraft('active-set:' + set.id, () => ({
    version: set.version,
    baseline: set,
    load: set.load === null ? '' : String(Number(loadToDisplay(set.load, state.profile.units).toFixed(3))),
    reps: set.reps === null ? '' : String(set.reps),
    seconds: set.seconds === null ? '' : String(set.seconds),
    meters: set.meters === null ? '' : String(set.meters)
  }));
  const weightRequired = ['external_total', 'external_per_side', 'assisted'].includes(set.loadMode);
  const {c}=useTheme();
  const inputStyle={flex:1,minHeight:48,paddingVertical:8,paddingHorizontal:8,color:c.text,fontSize:18,textAlign:'center' as const,borderRadius:12,backgroundColor:'rgba(10,20,14,.22)'};
  return <View style={{gap:14}}><SessionSetTable session={session} exerciseId={exerciseId} currentId={set.id} renderActive={index=><Glass strong style={{borderRadius:24,paddingHorizontal:12,paddingVertical:5}}>
    <View style={{flexDirection:'row',alignItems:'center',gap:10}}>
      <Txt size={16} weight="600" style={{width:42}}>{index}</Txt>
      {weightRequired?<TextInput accessibilityLabel={`Carga ${state.profile.units==='imperial'?'lb':'kg'}`} value={d.value.load} onChangeText={load=>d.set({load})} keyboardType="decimal-pad" selectionColor={c.protein} style={inputStyle}/>:<Txt style={{flex:1,textAlign:'center'}}>{modeLabel[set.loadMode]}</Txt>}
      <TextInput accessibilityLabel={set.kind==='timed'?'Duración de la serie, segundos':set.kind==='distance'?'Distancia de la serie, metros':'Repeticiones'} keyboardType="decimal-pad" selectionColor={c.protein} style={inputStyle} value={set.kind==='timed'?d.value.seconds:set.kind==='distance'?d.value.meters:d.value.reps} onChangeText={v=>d.set(set.kind==='timed'?{seconds:v}:set.kind==='distance'?{meters:v}:{reps:v})}/>
      <Pressable accessibilityRole="button" accessibilityLabel="Editar opciones de la serie actual" onPress={()=>nav.go('SC-49',{id:session.id,exerciseId,setId:set.id})} hitSlop={12} style={{minHeight:44,width:16,justifyContent:'center'}}><Txt tone="secondary">⋮</Txt></Pressable>
    </View>
  </Glass>}/><Button title="Completar serie" icon="check" busy={task.busy} disabled={session.status === 'paused'} onPress={() => task.run(async () => {
      await d.flush();
      const updated: SetEntry = {
        ...set,
        version: d.value.version,
        load: weightRequired ? loadToKg(numberInput(d.value.load, {
          min: 0
        })!, state.profile.units) : set.load,
        reps: set.kind === 'timed' || set.kind === 'distance' ? null : numberInput(d.value.reps, {
          min: 1,
          max: 10000,
          integer: true
        }),
        seconds: set.kind === 'timed' ? numberInput(d.value.seconds, {
          min: 1,
          max: 86400
        }) : set.seconds,
        meters: set.kind === 'distance' ? numberInput(d.value.meters, {
          min: .1,
          max: 1e6
        }) : set.meters
      };
      await repo.dispatch({
        type: 'set',
        sessionId: session.id,
        exerciseId,
        set: updated,
        baseSet: d.value.baseline,
        complete: true
      });
      await repo.dispatch({
        type: 'dropDraft',
        key: d.key
      });
      const current = repo.getSnapshot().sessions.find(s => s.id === session.id)!;
      const next = nextExerciseIndex(current);
      if (next !== current.currentExercise) await repo.dispatch({
        type: 'sessionIndex',
        sessionId: current.id,
        index: next
      });
      try {
        const id = repo.getSnapshot().profile.reminders ? await scheduleRest(current.restDeadline ?? Date.now(), current.restNotificationId) : null;
        await repo.dispatch({
          type: 'notification',
          sessionId: current.id,
          notificationId: id
        });
      } catch {/* El fallo de notificación no revierte una serie confirmada. */}
      nav.go('SC-48', {
        id: session.id,
        lastExerciseId: exerciseId,
        lastSetId: set.id
      });
    })} />{task.error&&set.version!==d.value.version&&<Button title="Descartar borrador y recargar serie actual" variant="quiet" onPress={()=>{d.set({version:set.version,baseline:set,load:set.load==null?'':String(Number(loadToDisplay(set.load,state.profile.units).toFixed(3))),reps:set.reps==null?'':String(set.reps),seconds:set.seconds==null?'':String(set.seconds),meters:set.meters==null?'':String(set.meters)});}}/>}<Message type="error">{task.error ?? d.error}</Message></View>;
}

import {healthWriter,healthName,healthAccountGuard} from '../native/health';
import {exportWorkoutToHealth} from '../../../../packages/core/health-client';
import React, { useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { useApp, useDraft, useTask } from '../data/AppProvider';
import { Screen, Txt, Title, Button, IconButton, Field, NumberField, Chips, Segments, Toggle, Row, Message, Empty, Section, Card, Glass, Timer, useClock, useNav, confirm, art, type ScreenProps } from '../ui/components';
import { layout, useTheme } from '../ui/theme';
import { scheduleRest, cancelRest } from '../native/notifications';
import { exportText } from '../native/io';
import { uid, fmt, normalize, numberInput, invariant, sessionSeconds, duration, setValid, sessionQualifies, prettyDate } from '../../../../packages/core/utils';
import { blankSet, createSession } from '../../../../packages/core/state';
import { nextExerciseIndex, loadToDisplay, loadToKg, progressionCandidate } from '../../../../packages/core/training';
import type { Exercise, PlanDay, PlanExercise, SetEntry, WorkoutSession, WorkoutPlan, LoadMode, SetKind } from '../../../../packages/core/types';
import { newPlanDraft, planFromDraft, type PlanDraft, type PlanNumberKey } from './drafts';
import { clearRestNotification } from '../../../../packages/core/workout-notifications';
const modeLabel: Record<LoadMode, string> = {
  external_total: 'Carga total',
  external_per_side: 'Carga por lado',
  bodyweight: 'Peso corporal',
  assisted: 'Asistencia',
  time: 'Duración',
  distance: 'Distancia'
};
const statusLabel = {
  active: 'En curso',
  paused: 'En pausa',
  completed: 'Finalizada',
  discarded: 'Descartada'
};
const kinds: {
  value: SetKind;
  label: string;
}[] = [{
  value: 'working',
  label: 'Trabajo'
}, {
  value: 'warmup',
  label: 'Calentamiento'
}, {
  value: 'drop',
  label: 'Descendente'
}, {
  value: 'timed',
  label: 'Duración'
}, {
  value: 'distance',
  label: 'Distancia'
}];
export function TrainingHome({
  params = {}
}: Partial<ScreenProps>) {
  const {
    state,
    repo
  } = useApp();
  const nav = useNav();
  const task = useTask();
  const active = state.sessions.find(s => s.status === 'active' || s.status === 'paused');
  const chosen = state.plans.find(p => p.id === params.planId) ?? state.plans[0];
  const start = (p: WorkoutPlan, index: number) => task.run(async () => {
    const session = createSession(repo.getSnapshot(), p, index);
    await repo.dispatch({
      type: 'startSession',
      session
    });
    nav.go('SC-47', {
      id: session.id
    });
  });
  return <Screen back={false} dock={false} tab="train" title="Entrenar" subtitle="Un registro a la vez. Tus series quedan guardadas antes de avanzar." background testID="SC-42">{active && <Card><Txt size={23} weight="600">{active.name}</Txt><Txt tone="secondary">{statusLabel[active.status]}</Txt><Button title="Reanudar sesión" icon="play" onPress={() => nav.go(active.restDeadline ? 'SC-48' : 'SC-47', {
        id: active.id
      })} /></Card>}{chosen ? <Section title={chosen.name} action="Editar" onAction={() => nav.go('SC-44', {
      id: chosen.id
    })}>{chosen.days.map((day, i) => <Card key={day.id}><Txt size={22} weight="600">{day.name}</Txt><Txt tone="secondary">{day.exercises.length} ejercicios · {day.exercises.reduce((s, e) => s + e.sets, 0)} series planificadas</Txt><Button title={`Iniciar ${day.name}`} busy={task.busy} disabled={!!active} onPress={() => start(chosen, i)} /></Card>)}</Section> : <Empty title="Tu primera rutina" detail="Creá un plan manual con los ejercicios, tiempos y equipamiento que usás." action="Crear rutina" onPress={() => nav.go('SC-44')} />}<Button title="Mis planes" variant="secondary" onPress={() => nav.go('SC-43')} /><Button title="Sesión libre" icon="plus" variant="secondary" disabled={!!active} onPress={() => nav.go('SC-45', {
      mode: 'start'
    })} /><View style={layout.wrap}><Button title="Ejercicios" variant="quiet" onPress={() => nav.go('SC-45')} /><Button title="Actividad y cardio" variant="quiet" onPress={() => nav.go('SC-56')} /><Button title="Historial" variant="quiet" onPress={() => nav.go('SC-55')} /></View><Button title="Bloque y descarga" variant="quiet" onPress={() => nav.go('SC-54', {
      planId: chosen?.id
    })} /><Button title="Progresión del plan" variant="quiet" onPress={() => nav.go('SC-53', {
      planId: chosen?.id
    })} /><Message type="error">{task.error}</Message><View style={{
      height: 100
    }} /></Screen>;
}
export function Plans() {
  const {
    state,
    repo
  } = useApp();
  const nav = useNav();
  const task = useTask();
  return <Screen title="Mis planes" tab="train" testID="SC-43">{state.plans.map(p => <Card key={p.id}><Row title={p.name} subtitle={`${p.days.length} días · ${p.weeks} semanas · v${p.version}`} onPress={() => nav.go('SC-42', {
        planId: p.id
      })} /><View style={layout.wrap}><Button title="Editar" variant="secondary" onPress={() => nav.go('SC-44', {
          id: p.id
        })} /><Button title="Duplicar" variant="quiet" onPress={() => task.run(() => repo.dispatch({
          type: 'plan',
          plan: {
            ...p,
            id: uid(),
            name: p.name + ' · copia',
            version: 1,
            createdAt: new Date().toISOString(),
            days: p.days.map(d => ({
              ...d,
              id: uid(),
              exercises: d.exercises.map(e => ({
                ...e,
                id: uid()
              }))
            }))
          }
        }))} /><Button title="Eliminar plan" variant="quiet" onPress={() => confirm('Eliminar plan', 'Las sesiones ya registradas se conservan.', () => task.run(() => repo.dispatch({
          type: 'deletePlan',
          id: p.id
        })), true)} /></View></Card>)}{!state.plans.length && <Empty title="Sin planes todavía" detail="Los planes manuales y el historial no necesitan Plus." />}<Button title="Crear plan" icon="plus" onPress={() => nav.go('SC-44')} /><Message type="error">{task.error}</Message></Screen>;
}
function usePlanDraft(params: ScreenProps['params']) {
  const {
    state
  } = useApp();
  const old = state.plans.find(p => p.id === params.id);
  return useDraft<PlanDraft>(params.draftKey ?? 'plan-editor:' + (old?.id ?? 'new'), () => old ? {
    ...old,
    weeks: String(old.weeks)
  } : newPlanDraft());
}
export function PlanEditor({
  params
}: ScreenProps) {
  const {
    state,
    repo
  } = useApp();
  const nav = useNav();
  const task = useTask();
  const d = usePlanDraft(params);
  const [index, setIndex] = useState(0);
  const day = d.value.days[index] ?? d.value.days[0];
  const updateDay = (patch: Partial<PlanDay>) => d.set({
    days: d.value.days.map(x => x.id === day.id ? {
      ...x,
      ...patch
    } : x)
  });
  const edit = (id: string, patch: Partial<PlanExercise>) => updateDay({
    exercises: day.exercises.map(e => e.id === id ? {
      ...e,
      ...patch
    } : e)
  });
  const editNumber = (id: string, key: PlanNumberKey, text: string) => d.set({
    numericInputs: {...d.value.numericInputs, [id]: {...d.value.numericInputs?.[id], [key]: text}}
  });
  const numberText = (e: PlanExercise, key: PlanNumberKey) =>
    d.value.numericInputs?.[e.id]?.[key] ?? (e[key] === null ? '' : String(e[key]));
  const move = (i: number, delta: number) => {
    const es = [...day.exercises];
    if (i + delta < 0 || i + delta >= es.length) return;
    [es[i], es[i + delta]] = [es[i + delta], es[i]];
    updateDay({
      exercises: es
    });
  };
  return <Screen title="Editar rutina" tab="train" testID="SC-44"><Field label="Nombre del plan" value={d.value.name} onChangeText={name => d.set({
      name
    })} /><Chips options={d.value.days.map((day, i) => ({
      value: String(i),
      label: day.name
    }))} value={String(index)} onChange={i => setIndex(Number(i))} /><Field label="Nombre del día" value={day?.name ?? ''} onChangeText={name => updateDay({
      name
    })} />{day?.exercises.map((e, i) => {
      const exercise = state.exercises.find(x => x.id === e.exerciseId);
      return <Card key={e.id}><Txt size={21} weight="600">{exercise?.name ?? 'Ejercicio no encontrado'}</Txt><Txt size={12} tone="secondary">{exercise ? modeLabel[exercise.loadMode] : ''}. Cargas guardadas en kg.</Txt><View style={layout.wrap}>{([['sets', 'Series'], ['repsMin', 'Reps mínimas'], ['repsMax', 'Reps máximas'], ['restSeconds', 'Descanso (s)']] as const).map(([key, label]) => <View key={key} style={{
            width: '46%',
            minWidth: 125
          }}><NumberField label={`${label}, ejercicio ${i + 1}`} value={numberText(e,key)} onChangeText={v => editNumber(e.id,key,v)} /></View>)}</View><NumberField label={`Carga inicial kg, ejercicio ${i + 1}`} value={numberText(e,'load')} onChangeText={v => editNumber(e.id,'load',v)} /><Field label={`Grupo de superserie o circuito, ejercicio ${i + 1}`} hint="Misma letra agrupa ejercicios. Vacío: series normales." value={e.superset ?? ''} onChangeText={v => edit(e.id, {
          superset: v.trim() || null
        })} /><View style={layout.wrap}><Button title="Subir" variant="quiet" disabled={i === 0} onPress={() => move(i, -1)} /><Button title="Bajar" variant="quiet" disabled={i === day.exercises.length - 1} onPress={() => move(i, 1)} /><IconButton name="trash" label={`Quitar ${exercise?.name}`} onPress={() => updateDay({
            exercises: day.exercises.filter(x => x.id !== e.id)
          })} /></View></Card>;
    })}<Button title="Añadir ejercicio al día" icon="plus" onPress={() => task.run(async () => {
      await d.flush();
      nav.go('SC-45', {
        mode: 'plan',
        draftKey: d.key,
        dayId: day.id
      });
    })} /><Button title="Añadir otro día" variant="secondary" onPress={() => {
      d.set({
        days: [...d.value.days, {
          id: uid(),
          name: 'Día ' + (d.value.days.length + 1),
          exercises: []
        }]
      });
      setIndex(d.value.days.length);
    }} />{d.value.days.length > 1 && <Button title="Eliminar este día del borrador" variant="quiet" onPress={() => {
      d.set({
        days: d.value.days.filter(x => x.id !== day.id)
      });
      setIndex(0);
    }} />}<NumberField label="Duración del bloque, semanas" value={d.value.weeks} onChangeText={weeks => d.set({
      weeks
    })} /><Toggle label="Marcar última semana como descarga" detail="Es una etiqueta del plan; no reduce cargas automáticamente." value={d.value.deload} onChange={deload => d.set({
      deload
    })} /><Button title="Guardar plan" busy={task.busy} onPress={() => task.run(async () => {
      await d.flush();
      const old = state.plans.find(p => p.id === d.value.id);
      invariant(!old || old.version === d.value.version, 'El plan cambió mientras lo editabas. Conservamos el borrador; revisá la versión.');
      const plan = planFromDraft(d.value);
      await repo.dispatch({
        type: 'plan',
        plan
      });
      await repo.dispatch({
        type: 'dropDraft',
        key: d.key
      });
      nav.replace('SC-42', {
        planId: plan.id
      });
    })} /><Message type="error">{task.error ?? d.error}</Message></Screen>;
}
export function ExerciseLibrary({
  params
}: ScreenProps) {
  const {
    state,
    repo
  } = useApp();
  const nav = useNav();
  const task = useTask();
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState('all');
  const [custom, setCustom] = useState(false);
  const d = useDraft('exercise-editor', () => ({
    id: uid(),
    name: '',
    muscle: '',
    equipment: '',
    instructions: '',
    modality: 'strength' as Exercise['modality'],
    loadMode: 'external_total' as LoadMode
  }));
  const matches = state.exercises.filter(e => normalize(e.name + ' ' + e.equipment).includes(normalize(q)) && (muscle === 'all' || e.muscle === muscle));
  const pick = (exercise: Exercise) => task.run(async () => {
    if (params.mode === 'plan') {
      const plan = repo.getSnapshot().drafts[params.draftKey ?? ''] as PlanDraft | undefined;
      invariant(plan && params.draftKey, 'No se encontró el borrador del plan.');
      const entry: PlanExercise = {
        id: uid(),
        exerciseId: exercise.id,
        sets: 3,
        repsMin: 8,
        repsMax: 12,
        load: null,
        restSeconds: 90,
        superset: null
      };
      await repo.dispatch({
        type: 'draft',
        key: params.draftKey,
        value: {
          ...plan,
          days: plan.days.map(d => d.id === params.dayId ? {
            ...d,
            exercises: [...d.exercises, entry]
          } : d)
        }
      });
      nav.finish('SC-44', {
        draftKey: params.draftKey
      });
    } else if (params.mode === 'start') {
      const session = createSession(repo.getSnapshot(), undefined, 0, [exercise.id]);
      await repo.dispatch({
        type: 'startSession',
        session
      });
      nav.replace('SC-47', {
        id: session.id
      });
    } else if (params.mode === 'session' || params.mode === 'replace') {
      invariant(params.sessionId, 'No hay sesión en curso.');
      await repo.dispatch({
        type: 'sessionExercise',
        sessionId: params.sessionId,
        replaceId: params.mode === 'replace' ? params.sessionExerciseId : undefined,
        exercise: {
          id: uid(),
          exerciseId: exercise.id,
          sets: [blankSet(exercise)],
          restSeconds: 90,
          superset: null
        }
      });
      nav.finish('SC-47', {
        id: params.sessionId
      });
    } else nav.go('SC-46', {
      id: exercise.id
    });
  });
  return <Screen title={params.mode ? 'Elegir ejercicio' : 'Biblioteca de ejercicios'} tab="train" testID="SC-45"><Field label="Buscar ejercicio o equipo" value={q} onChangeText={setQ} /><Chips options={[{
      value: 'all',
      label: 'Todos'
    }, ...Array.from(new Set(state.exercises.map(e => e.muscle))).map(m => ({
      value: m,
      label: m
    }))]} value={muscle} onChange={setMuscle} />{matches.map(e => <Row key={e.id} title={e.name} subtitle={`${e.muscle} · ${e.equipment} · ${e.custom ? 'personalizado' : modeLabel[e.loadMode]}`} onPress={() => pick(e)} />)}{!matches.length && <Empty title="Sin coincidencias" detail="Podés registrar un ejercicio personalizado." />}<Button title={custom ? 'Cerrar editor' : 'Crear ejercicio personalizado'} variant="secondary" onPress={() => setCustom(!custom)} />{custom && <Card><Field label="Nombre del ejercicio" value={d.value.name} onChangeText={name => d.set({
        name
      })} /><Field label="Grupo muscular o actividad" value={d.value.muscle} onChangeText={muscle => d.set({
        muscle
      })} /><Field label="Equipamiento" value={d.value.equipment} onChangeText={equipment => d.set({
        equipment
      })} /><Chips options={[{
        value: 'strength',
        label: 'Repeticiones'
      }, {
        value: 'timed',
        label: 'Duración'
      }, {
        value: 'distance',
        label: 'Distancia'
      }]} value={d.value.modality} onChange={modality => d.set({
        modality,
        loadMode: modality === 'timed' ? 'time' : modality === 'distance' ? 'distance' : 'external_total'
      })} />{d.value.modality === 'strength' && <Chips options={(['external_total', 'external_per_side', 'bodyweight', 'assisted'] as LoadMode[]).map(value => ({
        value,
        label: modeLabel[value]
      }))} value={d.value.loadMode} onChange={loadMode => d.set({
        loadMode
      })} />}<Field label="Notas de técnica personales" value={d.value.instructions} onChangeText={instructions => d.set({
        instructions
      })} multiline /><Button title="Guardar ejercicio" busy={task.busy} onPress={() => task.run(async () => {
        invariant(d.value.name.trim(), 'Falta el nombre.');
        await repo.dispatch({
          type: 'exercise',
          exercise: {
            id: d.value.id,
            name: d.value.name.trim(),
            muscle: d.value.muscle || 'General',
            pattern: 'personalizado',
            equipment: d.value.equipment || 'Sin equipo',
            instructions: d.value.instructions ? [d.value.instructions] : [],
            modality: d.value.modality,
            loadMode: d.value.loadMode,
            custom: true,
            mediaUri: null
          }
        });
        const savedName = d.value.name;
        await repo.dispatch({type: 'dropDraft', key: d.key});
        d.set({id: uid(), name: '', muscle: '', equipment: '', instructions: '', modality: 'strength', loadMode: 'external_total'});
        await d.flush();
        setQ(savedName);
        setCustom(false);
      })} /></Card>}<Message type="error">{task.error ?? d.error}</Message></Screen>;
}
export function ExerciseDetail({
  params
}: ScreenProps) {
  const {
    state, repo
  } = useApp();
  const nav = useNav();
  const task = useTask();
  const active = state.sessions.some(s => s.status === 'active' || s.status === 'paused');
  const e = state.exercises.find(e => e.id === params.id);
  if (!e) return <Screen title="Ejercicio" tab="train"><Empty title="No disponible" detail="Buscá o creá un ejercicio." /></Screen>;
  const history = state.sessions.filter(s => s.status === 'completed' && s.exercises.some(x => x.exerciseId === e.id));
  return <Screen title={e.name} subtitle={`${e.muscle} · ${e.equipment}`} tab="train" testID="SC-46"><Txt weight="600">{modeLabel[e.loadMode]}</Txt><Message>{e.loadMode === 'assisted' ? 'Más asistencia no equivale a más fuerza.' : e.loadMode === 'external_per_side' ? 'Ingresá la carga de un lado; no la multipliques sin cambiar de convención.' : 'Compará solo el mismo ejercicio, equipo y convención.'}</Message><Section title="Antes de empezar">{e.instructions.map((t, i) => <Txt key={i}>{i + 1}. {t}</Txt>)}<Message>Orientación general, no técnica validada para tu cuerpo ni consejo médico. Detené una actividad que provoque dolor y consultá a un profesional.</Message></Section><Button title="Iniciar sesión libre con este ejercicio" disabled={active} busy={task.busy} onPress={() => task.run(async () => {
      const session = createSession(repo.getSnapshot(), undefined, 0, [e.id]);
      await repo.dispatch({type: 'startSession', session});
      nav.replace('SC-47', {id: session.id});
    })} /><Message type="error">{task.error}</Message>{active && <Message>Ya hay una sesión en curso. Reanudala desde Entrenar antes de iniciar otra.</Message>}<Section title="Tu historial">{history.slice(-8).reverse().map(s => <Row key={s.id} title={prettyDate(s.date)} subtitle={s.exercises.filter(x => x.exerciseId === e.id).flatMap(x => x.sets.filter(setValid).map(t => `${t.load === null ? 'Sin carga externa' : fmt(t.load, 1) + ' kg'} × ${t.reps ?? '—'}`)).join(' · ')} onPress={() => nav.go('SC-52', {
        id: s.id
      })} />)}{!history.length && <Txt tone="muted">Aún no registraste este ejercicio.</Txt>}</Section></Screen>;
}
function SessionAbsent() {
  const nav = useNav();
  return <Empty title="No hay sesión activa" detail="Tus sesiones finalizadas están en el historial." action="Ir a entrenar" onPress={() => nav.tab('train')} />;
}
export function ActiveWorkout({
  params
}: ScreenProps) {
  const {
    state
  } = useApp();
  const session = state.sessions.find(s => s.id === params.id) ?? state.sessions.find(s => s.status === 'active' || s.status === 'paused');
  return <Screen title={session?.name ?? 'Entrenamiento'} subtitle={session ? `Ejercicio ${session.currentExercise + 1} de ${session.exercises.length}` : undefined} tab="train" background testID="SC-47">{params.notificationWarning === '1' && <Message type="warning">El descanso terminó en CUKI, pero el sistema no confirmó cancelar su aviso. Tus series están guardadas.</Message>}{session && ['active', 'paused'].includes(session.status) ? <WorkoutBody key={session.id + ':' + session.currentExercise} session={session} /> : <SessionAbsent />}</Screen>;
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
  return <><Title>{exercise.name}</Title><Txt tone="secondary">{exercise.muscle} · {exercise.equipment} · {modeLabel[exercise.loadMode]}</Txt><Txt size={13} tone="secondary">Tiempo activo: {duration(sessionSeconds(session, now))}</Txt>{session.status === 'paused' && <Message>Sesión pausada. Podés reanudarla sin perder datos.</Message>}<View style={layout.between}><Txt>Serie</Txt><Txt>{state.profile.units === 'imperial' ? 'lb' : 'kg'}</Txt><Txt>reps / actividad</Txt></View>{current.sets.map((t, i) => <Row key={t.id} title={`${t.completedAt ? '✓ ' : ''}${i + 1} · ${t.kind === 'warmup' ? 'Calentamiento' : t.kind === 'drop' ? 'Descendente' : t.kind === 'working' ? 'Trabajo' : 'Actividad'}`} subtitle={`${t.load !== null ? fmt(loadToDisplay(t.load, state.profile.units), 1) + ' ' + (state.profile.units === 'imperial' ? 'lb' : 'kg') : modeLabel[t.loadMode]} · ${t.reps ?? (t.seconds ? duration(t.seconds) : t.meters ? fmt(t.meters) + ' m' : '—')}${t.rir === null ? '' : ' · RIR ' + t.rir}`} onPress={() => nav.go('SC-49', {
      id: session.id,
      exerciseId: current.id,
      setId: t.id
    })} />)}{previous && <Txt size={13} tone="secondary">Anterior comparable: {previous.sets.filter(setValid).map(t => `${fmt(t.load, 1)} kg × ${t.reps ?? '—'}`).join(' · ')}</Txt>}{set ? <CurrentSet key={set.id} session={session} exerciseId={current.id} set={set} /> : <Message type="success">Terminaste las series previstas de este ejercicio.</Message>}<View style={layout.wrap}><Button title="Añadir serie" icon="plus" variant="secondary" onPress={() => task.run(() => repo.dispatch({
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
    load: set.load === null ? '' : String(Number(loadToDisplay(set.load, state.profile.units).toFixed(3))),
    reps: set.reps === null ? '' : String(set.reps),
    seconds: set.seconds === null ? '' : String(set.seconds),
    meters: set.meters === null ? '' : String(set.meters)
  }));
  const weightRequired = ['external_total', 'external_per_side', 'assisted'].includes(set.loadMode);
  return <Glass strong style={{
    borderRadius: 26,
    padding: 18,
    gap: 16
  }}><Txt weight="600">Serie actual</Txt>{weightRequired && <NumberField label={`Carga ${state.profile.units === 'imperial' ? 'lb' : 'kg'}`} value={d.value.load} onChangeText={load => d.set({
      load
    })} />}<NumberField label={set.kind === 'timed' ? 'Duración de la serie, segundos' : set.kind === 'distance' ? 'Distancia de la serie, metros' : 'Repeticiones'} value={set.kind === 'timed' ? d.value.seconds : set.kind === 'distance' ? d.value.meters : d.value.reps} onChangeText={v => d.set(set.kind === 'timed' ? {
      seconds: v
    } : set.kind === 'distance' ? {
      meters: v
    } : {
      reps: v
    })} /><Button title="Completar serie" icon="check" busy={task.busy} disabled={session.status === 'paused'} onPress={() => task.run(async () => {
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
    })} /><Message type="error">{task.error ?? d.error}</Message></Glass>;
}
export function Rest({
  params
}: ScreenProps) {
  const {
    state,
    repo
  } = useApp();
  const nav = useNav();
  const task = useTask();
  const session = state.sessions.find(s => s.id === params.id);
  const [effortOpen, setEffortOpen] = useState(false);
  if (!session || !['active', 'paused'].includes(session.status)) return <Screen title="Descanso" tab="train" testID="SC-48"><SessionAbsent /></Screen>;
  const adjust = (delta: number) => task.run(async () => {
    const deadline = Math.max(Date.now(), (session.restDeadline ?? Date.now()) + delta * 1000);
    await repo.dispatch({
      type: 'rest',
      sessionId: session.id,
      deadline
    });
    try {
      const notificationId = repo.getSnapshot().profile.reminders ? await scheduleRest(deadline, session.restNotificationId) : null;
      await repo.dispatch({
        type: 'notification',
        sessionId: session.id,
        notificationId
      });
    } catch {}
  });
  const finish = () => task.run(async () => {
    await repo.dispatch({
      type: 'rest',
      sessionId: session.id,
      deadline: null
    });
    const cancelled = await clearRestNotification(repo, session.id, cancelRest);
    nav.finish('SC-47', {id: session.id, notificationWarning: cancelled ? undefined : '1'});
  });
  return <Screen title="Descanso" subtitle="Respirá. Continuá cuando estés preparado." tab="train" background testID="SC-48"><Timer deadline={session.restDeadline} /><View style={[layout.row, {
      justifyContent: 'center'
    }]}><Button title="−15 segundos" variant="secondary" onPress={() => adjust(-15)} /><Button title="+15 segundos" variant="secondary" onPress={() => adjust(15)} /></View><Button title="Continuar entrenamiento" icon="play" busy={task.busy} onPress={finish} /><Txt tone="secondary">Siguiente: {state.exercises.find(e => e.id === session.exercises[session.currentExercise]?.exerciseId)?.name}</Txt>{params.lastSetId && <><Toggle label="Anotar esfuerzo, opcional" detail="RIR: repeticiones que creés que todavía podrías haber hecho." value={effortOpen} onChange={setEffortOpen} />{effortOpen && <Button title="Editar esfuerzo de la última serie" variant="secondary" onPress={() => nav.go('SC-49', {
        id: session.id,
        exerciseId: params.lastExerciseId,
        setId: params.lastSetId
      })} />}</>}<Button title="Finalizar sesión" variant="quiet" onPress={() => nav.go('SC-51', {
      id: session.id
    })} /><Message type="error">{task.error}</Message></Screen>;
}
export function SetEditor({
  params
}: ScreenProps) {
  const {
    state,
    repo
  } = useApp();
  const nav = useNav();
  const task = useTask();
  const session = state.sessions.find(s => s.id === params.id);
  const current = session?.exercises.find(e => e.id === params.exerciseId);
  const set = current?.sets.find(s => s.id === params.setId);
  const d = useDraft('set-editor:' + params.setId, () => ({
    baseVersion: set?.version ?? 0,
    kind: set?.kind ?? 'working' as SetKind,
    load: set?.load === null || set?.load === undefined ? '' : String(Number(loadToDisplay(set.load, state.profile.units).toFixed(3))),
    reps: set?.reps === null || set?.reps === undefined ? '' : String(set.reps),
    seconds: set?.seconds == null ? '' : String(set.seconds),
    meters: set?.meters == null ? '' : String(set.meters),
    rir: set?.rir == null ? '' : String(set.rir),
    note: set?.note ?? ''
  }));
  return <Screen title="Editar serie" tab="train" testID="SC-49">{set && session && current ? <><Chips options={kinds} value={d.value.kind} onChange={kind => d.set({
        kind
      })} /><NumberField label={`Carga en ${state.profile.units === 'imperial' ? 'lb' : 'kg'}, opcional si es peso corporal`} value={d.value.load} onChangeText={load => d.set({
        load
      })} /><NumberField label="Repeticiones" value={d.value.reps} onChangeText={reps => d.set({
        reps
      })} /><NumberField label="Duración, segundos" value={d.value.seconds} onChangeText={seconds => d.set({
        seconds
      })} /><NumberField label="Distancia, metros" value={d.value.meters} onChangeText={meters => d.set({
        meters
      })} /><NumberField label="RIR opcional, 0 a 10" value={d.value.rir} onChangeText={rir => d.set({
        rir
      })} /><Field label="Nota de la serie" value={d.value.note} onChangeText={note => d.set({
        note
      })} multiline /><Message>{modeLabel[set.loadMode]}. RIR no es obligatorio. Editar no reinicia el descanso ni marca una serie pendiente como completada.</Message><Button title="Guardar serie" busy={task.busy} onPress={() => task.run(async () => {
        const load = numberInput(d.value.load, {
          min: 0,
          nullable: true
        });
        const updated: SetEntry = {
          ...set,
          version: d.value.baseVersion,
          kind: d.value.kind,
          load: load === null ? null : loadToKg(load, state.profile.units),
          reps: numberInput(d.value.reps, {
            min: 0,
            integer: true,
            nullable: true
          }),
          seconds: numberInput(d.value.seconds, {
            min: 0,
            nullable: true
          }),
          meters: numberInput(d.value.meters, {
            min: 0,
            nullable: true
          }),
          rir: numberInput(d.value.rir, {
            min: 0,
            max: 10,
            nullable: true
          }),
          note: d.value.note
        };
        await repo.dispatch({
          type: 'set',
          sessionId: session.id,
          exerciseId: current.id,
          set: updated
        });
        await repo.dispatch({
          type: 'dropDraft',
          key: d.key
        });
        await repo.dispatch({
          type: 'dropDraft',
          key: 'active-set:' + set.id
        });
        nav.back();
      })} /><Button title="Eliminar serie" variant="danger" onPress={() => confirm('Eliminar serie', 'Se eliminará este registro de la sesión en curso.', () => task.run(async () => {
        await repo.dispatch({
          type: 'deleteSet',
          sessionId: session.id,
          exerciseId: current.id,
          setId: set.id
        });
        nav.back();
      }), true)} /></> : <SessionAbsent />}<Message type="error">{task.error ?? d.error}</Message></Screen>;
}
export function Substitute({
  params
}: ScreenProps) {
  const {
    state
  } = useApp();
  const nav = useNav();
  const session = state.sessions.find(s => s.id === params.id);
  const current = session?.exercises.find(e => e.id === params.exerciseId);
  const exercise = state.exercises.find(e => e.id === current?.exerciseId);
  const completed = current?.sets.some(s => s.completedAt);
  const alternatives = state.exercises.filter(e => e.id !== exercise?.id && e.pattern === exercise?.pattern);
  return <Screen title="Sustituir ejercicio" tab="train" testID="SC-50"><Txt>{exercise?.name}</Txt><Message>{completed ? 'Este ejercicio ya tiene series realizadas. Se conservará y podés añadir otro.' : 'Al cambiar no se considera equivalente la carga de una máquina diferente. Se inicia sin carga.'}</Message><Section title="Alternativas del mismo patrón">{alternatives.map(e => <Row key={e.id} title={e.name} subtitle={e.equipment} onPress={() => nav.go('SC-46', {
        id: e.id
      })} />)}</Section><Button title={completed ? 'Añadir otro ejercicio' : 'Elegir reemplazo'} onPress={() => nav.go('SC-45', {
      mode: completed ? 'session' : 'replace',
      sessionId: params.id,
      sessionExerciseId: params.exerciseId
    })} /></Screen>;
}
export function FinishWorkout({
  params
}: ScreenProps) {
  const {
    state,
    repo,
    sync,
    api
  } = useApp();
  const nav = useNav();
  const task = useTask();
  const session = state.sessions.find(s => s.id === params.id);
  const [note, setNote] = useState(session?.note ?? '');
  const [confirmed, setConfirmed] = useState(false);
  const completed = session?.exercises.flatMap(e => e.sets).filter(t => t.completedAt).length ?? 0;
  const pending = session?.exercises.flatMap(e => e.sets).filter(t => !t.completedAt).length ?? 0;
  return <Screen title="Finalizar entrenamiento" tab="train" testID="SC-51">{session ? <><Txt size={26} weight="600">{session.name}</Txt><Txt>{completed} series registradas · {pending} sin realizar</Txt><Field label="Cómo fue la sesión, opcional" value={note} onChangeText={setNote} multiline />{pending > 0 && <Toggle label="Terminar conservando solo las series realizadas" detail="Las series pendientes se conservan como plan, sin contarse como realizadas." value={confirmed} onChange={setConfirmed} />}<Button title="Guardar y finalizar sesión" disabled={!completed || pending > 0 && !confirmed || session.status === 'completed'} busy={task.busy} onPress={() => task.run(async () => {
        await repo.dispatch({
          type: 'finishSession',
          id: session.id,
          note
        });
        const cancelled = await clearRestNotification(repo, session.id, cancelRest);
        nav.replace('SC-52', {id: session.id, notificationWarning: cancelled ? undefined : '1'});
        if (api.configured) void sync.sync().catch(() => {});
      })} /><Button title="Volver a entrenar" variant="secondary" onPress={() => nav.finish('SC-47', {
        id: session.id
      })} /><Button title="Descartar sesión" variant="danger" onPress={() => confirm('Descartar sesión', 'No contará para estadísticas ni jardín. Esta acción no borra otras sesiones.', () => task.run(async () => {
        await repo.dispatch({
          type: 'discardSession',
          id: session.id
        });
        await clearRestNotification(repo, session.id, cancelRest);
        nav.tab('train');
      }), true)} /></> : <SessionAbsent />}<Message type="error">{task.error}</Message></Screen>;
}
export function WorkoutSummary({
  params
}: ScreenProps) {
  const {
    state,repo
  } = useApp();
  const nav = useNav();
  const task = useTask();
  const [healthMessage,setHealthMessage]=useState('');
  const session = state.sessions.find(s => s.id === params.id);
  return <Screen title="Resumen de sesión" tab="train" testID="SC-52">{params.notificationWarning === '1' && <Message type="warning">La sesión quedó guardada. El sistema no confirmó cancelar el aviso de descanso; todavía podría sonar.</Message>}{session ? <><Title>{session.name}</Title><Txt tone="secondary">{prettyDate(session.date)} · {statusLabel[session.status]}</Txt><Txt size={28} weight="600">{duration(sessionSeconds(session))}</Txt><Txt>{session.exercises.flatMap(e => e.sets).filter(setValid).length} series de trabajo / actividades válidas</Txt>{session.exercises.map(e => <Section key={e.id} title={state.exercises.find(x => x.id === e.exerciseId)?.name ?? 'Ejercicio'}>{e.sets.filter(s => s.completedAt).map((s, i) => <Row key={s.id} title={`Serie ${i + 1} · ${modeLabel[s.loadMode]}`} subtitle={`${s.load === null ? 'Sin carga externa' : fmt(s.load, 2) + ' kg'} · ${s.reps ?? '—'} reps${s.seconds ? ' · ' + duration(s.seconds) : ''}${s.meters ? ' · ' + fmt(s.meters) + ' m' : ''}${s.rir === null ? '' : ' · RIR ' + s.rir}`} />)}</Section>)}{session.note && <Txt>{session.note}</Txt>}<Message>{sessionQualifies(session) ? 'Esta sesión puede acreditar su semana si cumple las reglas del ciclo. El crédito se confirma en el servidor, no en esta pantalla.' : 'La sesión se conserva. Las series de calentamiento solas no acreditan una semana de jardín.'}</Message><Button title="Ver mi jardín" icon="leaf" onPress={() => nav.go('SC-82', {
        sessionId: session.id
      })} /><Button title="Exportar sesión" icon="export" variant="secondary" onPress={() => task.run(() => exportText(`cuki-session-${session.id}.json`, JSON.stringify(session, null, 2)))} /><Button title={`Exportar a ${healthName}`} variant="secondary" disabled={!sessionQualifies(session)} onPress={()=>task.run(async()=>{const result=await exportWorkoutToHealth(repo,session.id,healthWriter,healthAccountGuard(repo.accountId));setHealthMessage(result.alreadyExported?'Esta versión ya fue exportada.':'El sistema confirmó el entrenamiento. Se exportó el intervalo completo, sin inventar calorías.');})}/><Message>{healthMessage}</Message><Button title="Volver a Hoy" variant="quiet" onPress={() => nav.tab('home')} /></> : <Empty title="Sesión no disponible" detail="Consultá el historial de la cuenta actual." />}<Message type="error">{task.error}</Message></Screen>;
}
export function Progression({
  params
}: ScreenProps) {
  const {
    state,
    repo
  } = useApp();
  const nav = useNav();
  const task = useTask();
  const [planId, setPlanId] = useState(params.planId ?? state.plans[0]?.id ?? '');
  const [increment, setIncrement] = useState('2.5');
  const [acceptRisk, setAcceptRisk] = useState(false);
  const plan = state.plans.find(p => p.id === planId);
  let changes: {
    exerciseId: string;
    before: number | null;
    after: number | null;
    eligible: boolean;
    reason: string;
  }[] = [];
  try {
    if (plan) changes = plan.days.flatMap(d => d.exercises).map(e => ({
      exerciseId: e.id,
      ...progressionCandidate(state, plan, e, numberInput(increment, {
        min: .01,
        max: 25
      })!)
    }));
  } catch {}
  return <Screen title="Progresión de cargas" tab="train" testID="SC-53"><Chips options={state.plans.map(p => ({
      value: p.id,
      label: p.name
    }))} value={planId} onChange={setPlanId} /><NumberField label="Incremento disponible en el equipo, kg" value={increment} onChangeText={setIncrement} /><Message>Regla de doble progresión: se considera subir carga solo después de alcanzar el máximo del rango en todas las series de trabajo comparables. No estima recuperación ni tolerancia al esfuerzo.</Message>{changes.map(c => <Card key={c.exerciseId}><Txt weight="600">{state.exercises.find(x => x.id === plan?.days.flatMap(d => d.exercises).find(e => e.id === c.exerciseId)?.exerciseId)?.name}</Txt><Txt>{fmt(c.before, 2)} kg → {fmt(c.after, 2)} kg</Txt><Txt tone="secondary" size={14}>{c.reason}</Txt></Card>)}{!plan && <Empty title="Elegí o creá un plan" detail="Se necesitan cargas y sesiones comparables para sugerir progresión." action="Crear plan" onPress={() => nav.go('SC-44')} />}<Toggle label="Revisé el equipo, las cargas y cómo me siento" detail="No aceptes incrementos si hay dolor o la técnica no se mantiene." value={acceptRisk} onChange={setAcceptRisk} /><Button title="Aplicar incrementos elegibles al plan" disabled={!acceptRisk || !changes.some(c => c.eligible)} busy={task.busy} onPress={() => task.run(async () => {
      invariant(plan, 'Falta el plan.');
      const current = repo.getSnapshot().plans.find(p => p.id === plan.id);
      invariant(current?.version === plan.version, 'El plan cambió; revisalo nuevamente.');
      await repo.dispatch({
        type: 'draft',
        key: 'plan-before-progression:' + plan.id,
        value: plan
      });
      await repo.dispatch({
        type: 'plan',
        plan: {
          ...plan,
          version: plan.version + 1,
          days: plan.days.map(d => ({
            ...d,
            exercises: d.exercises.map(e => {
              const c = changes.find(c => c.exerciseId === e.id && c.eligible);
              return c ? {
                ...e,
                load: c.after
              } : e;
            })
          }))
        }
      });
      setAcceptRisk(false);
    })} /><Button title="Revertir última progresión" variant="quiet" onPress={() => task.run(async () => {
      invariant(plan, 'Elegí un plan.');
      const before = state.drafts['plan-before-progression:' + plan.id] as WorkoutPlan | undefined;
      invariant(before && plan.version === before.version + 1, 'No se puede revertir: hubo otros cambios o no hay progresión guardada.');
      await repo.dispatch({
        type: 'plan',
        plan: {
          ...before,
          version: plan.version + 1
        }
      });
      await repo.dispatch({
        type: 'dropDraft',
        key: 'plan-before-progression:' + plan.id
      });
    })} /><Button title="Asistencia de entrenamiento" variant="quiet" onPress={() => nav.go('SC-62', {
      route: 'training_plan'
    })} /><Message type="error">{task.error}</Message></Screen>;
}
export function TrainingBlocks({
  params
}: ScreenProps) {
  const {
    state,
    repo
  } = useApp();
  const nav = useNav();
  const task = useTask();
  const plan = state.plans.find(p => p.id === params.planId) ?? state.plans[0];
  const [weeks, setWeeks] = useState(String(plan?.weeks ?? 6));
  const [deload, setDeload] = useState(plan?.deload ?? false);
  return <Screen title="Bloque y descarga" tab="train" testID="SC-54">{plan ? <><Txt size={24} weight="600">{plan.name}</Txt><NumberField label="Semanas del bloque" value={weeks} onChangeText={setWeeks} /><Toggle label="Marcar última semana como descarga" value={deload} onChange={setDeload} /><Message>Esta etiqueta ayuda a organizar el bloque. No supone que debas descargar ni modifica cargas o series por sí sola. Ajustá el plan según tu situación.</Message><Button title="Guardar bloque" onPress={() => task.run(async () => {
        await repo.dispatch({
          type: 'plan',
          plan: {
            ...plan,
            weeks: numberInput(weeks, {
              min: 1,
              max: 104,
              integer: true
            })!,
            deload,
            version: plan.version + 1
          }
        });
        nav.back();
      })} /><Button title="Editar series y cargas" variant="secondary" onPress={() => nav.go('SC-44', {
        id: plan.id
      })} /></> : <Empty title="Todavía no hay un plan" detail="Creá uno para organizar sus bloques." action="Crear plan" onPress={() => nav.go('SC-44')} />}<Message type="error">{task.error}</Message></Screen>;
}
export function WorkoutHistory() {
  const {
    state
  } = useApp();
  const nav = useNav();
  const [q, setQ] = useState('');
  const sessions = state.sessions.filter(s => s.status !== 'discarded' && normalize(s.name + ' ' + s.date + ' ' + s.exercises.map(e => state.exercises.find(x => x.id === e.exerciseId)?.name).join(' ')).includes(normalize(q))).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return <Screen title="Historial de entrenamiento" tab="train" testID="SC-55"><Field label="Buscar por ejercicio, sesión o fecha" value={q} onChangeText={setQ} />{sessions.map(s => <Row key={s.id} title={s.name} subtitle={`${prettyDate(s.date)} · ${statusLabel[s.status]} · ${s.exercises.flatMap(e => e.sets).filter(setValid).length} series`} onPress={() => nav.go(s.status === 'completed' ? 'SC-52' : 'SC-47', {
      id: s.id
    })} />)}{!sessions.length && <Empty title="Tu historial empieza acá" detail="Cada sesión finalizada aparecerá con sus series reales." action="Entrenar" onPress={() => nav.tab('train')} />}</Screen>;
}
export function Cardio() {
  const {
    state,
    repo
  } = useApp();
  const nav = useNav();
  const task = useTask();
  const d = useDraft('cardio-editor', () => ({
    id: uid(),
    name: 'Caminata',
    minutes: '',
    meters: '',
    note: '',
    done: false
  }));
  return <Screen title="Registrar actividad" tab="train" testID="SC-56"><Field label="Actividad" value={d.value.name} onChangeText={name => d.set({
      name
    })} /><NumberField label="Duración en minutos" value={d.value.minutes} onChangeText={minutes => d.set({
      minutes
    })} /><NumberField label="Distancia en metros, opcional" value={d.value.meters} onChangeText={meters => d.set({
      meters
    })} /><Field label="Notas, opcionales" value={d.value.note} onChangeText={note => d.set({
      note
    })} multiline /><Message>No se estiman calorías quemadas ni se agregan a tus metas de comida. Registrá una actividad que realmente hiciste.</Message><Button title="Guardar actividad realizada" busy={task.busy} disabled={d.value.done} onPress={() => task.run(async () => {
      await d.flush();
      invariant(d.value.name.trim(), 'Dale un nombre a la actividad.');
      const seconds = numberInput(d.value.minutes, {
        min: 1,
        max: 1440
      })! * 60;
      const meters = numberInput(d.value.meters, {
        min: 0,
        nullable: true
      });
      const ended = new Date().toISOString();
      const started = new Date(Date.parse(ended) - seconds * 1000).toISOString();
      let exercise = state.exercises.find(e => normalize(e.name) === normalize(d.value.name) && e.modality === 'timed');
      const isNew = !exercise;
      exercise = exercise ?? {
        id: uid(),
        name: d.value.name.trim(),
        muscle: 'Actividad',
        equipment: 'Sin equipo',
        pattern: 'cardio',
        instructions: [],
        modality: 'timed',
        loadMode: 'time',
        custom: true,
        mediaUri: null
      };
      const context = {
        ...repo.getSnapshot(),
        exercises: isNew ? [...repo.getSnapshot().exercises, exercise] : repo.getSnapshot().exercises
      };
      const session = createSession(context, undefined, 0, [exercise.id], started);
      session.id = d.value.id;
      session.name = d.value.name;
      session.exercises[0].sets = [{
        ...blankSet(exercise),
        kind: 'timed',
        seconds,
        meters,
        note: d.value.note,
        completedAt: ended
      }];
      await repo.dispatchMany([...(isNew ? [{
        type: 'exercise' as const,
        exercise
      }] : []), {
        type: 'startSession',
        session
      }, {
        type: 'finishSession',
        id: session.id,
        note: d.value.note
      }, {
        type: 'dropDraft',
        key: d.key
      }], d.value.id, ended);
      nav.replace('SC-52', {
        id: session.id
      });
    })} /><Message type="error">{task.error ?? d.error}</Message></Screen>;
}
export const trainingScreens = {
  'SC-42': TrainingHome,
  'SC-43': Plans,
  'SC-44': PlanEditor,
  'SC-45': ExerciseLibrary,
  'SC-46': ExerciseDetail,
  'SC-47': ActiveWorkout,
  'SC-48': Rest,
  'SC-49': SetEditor,
  'SC-50': Substitute,
  'SC-51': FinishWorkout,
  'SC-52': WorkoutSummary,
  'SC-53': Progression,
  'SC-54': TrainingBlocks,
  'SC-55': WorkoutHistory,
  'SC-56': Cardio
};
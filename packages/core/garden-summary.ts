import type {AppState} from './types';
import {sessionQualifies} from './utils';
/** Descriptive statistics from available records, not a physiological recovery or
 * strength score. Unknown/noncomparable training history stays unknown. */
export function gardenSummary(state:AppState){
 const garden=state.garden;
 const now=garden?Date.parse(garden.serverNow):Date.now();
 const start=garden?Date.parse(garden.startAt):Infinity;
 const sessions=state.sessions.filter(s=>sessionQualifies(s)&&s.endedAt&&Date.parse(s.endedAt)>=start&&Date.parse(s.endedAt)<=now);
 const elapsed=garden?Math.max(1,garden.weeks.filter(w=>Date.parse(w.startAt)<=now).length):0;
 const points=state.sessions.filter(s=>s.status==='completed'&&s.endedAt&&Date.parse(s.endedAt)<=now).sort((a,b)=>a.endedAt!.localeCompare(b.endedAt!)).flatMap(s=>{
  const comparable=s.exercises.filter(e=>e.exerciseId==='incline-machine').flatMap(e=>e.sets).filter(t=>t.completedAt&&t.kind==='working'&&t.loadMode==='external_total'&&t.reps===8&&t.load!==null&&t.load>0);
  return comparable.length?[{date:s.date,load:Math.max(...comparable.map(t=>t.load!))}]:[];
 });
 const change=points.length>=2?(points[points.length-1].load/points[0].load-1)*100:null;
 const weekly=garden?.weeks.slice(Math.max(0,elapsed-7),elapsed).map(w=>sessions.filter(s=>Date.parse(s.endedAt!)>=Date.parse(w.startAt)&&Date.parse(s.endedAt!)<Date.parse(w.endAt)).length)??[];
 return{creditedWeeks:garden?.creditedWeeks??0,recordedSessions:sessions.length,sessionsPerWeek:elapsed?sessions.length/elapsed:null,weeklySessions:weekly,comparableLoadChange:change,comparableLoads:points.map(p=>p.load)};
}

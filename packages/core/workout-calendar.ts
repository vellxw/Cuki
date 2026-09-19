import type {PlanDay, WeeklyWorkoutSchedule, WorkoutPlan, WorkoutSession} from './types';
import {invariant, validDate} from './utils';

export const WEEKDAYS = [
  {value:1,label:'Lun',name:'lunes'}, {value:2,label:'Mar',name:'martes'},
  {value:3,label:'Mié',name:'miércoles'}, {value:4,label:'Jue',name:'jueves'},
  {value:5,label:'Vie',name:'viernes'}, {value:6,label:'Sáb',name:'sábado'},
  {value:7,label:'Dom',name:'domingo'},
] as const;
export const validWorkoutTime = (value:unknown):value is string =>
  typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);

/** A schedule is a civil-week hint, not a notification or evidence of exercise.
 * It uses the profile's displayed local date. Unlike the reward calendar, it is
 * intentionally not a frozen UTC interval. DST cannot turn it into two sessions.
 */
export function validateWorkoutSchedule(value:unknown):asserts value is WeeklyWorkoutSchedule | undefined {
  if(value === undefined) return;
  invariant(value !== null && typeof value === 'object' && !Array.isArray(value),'Horario semanal inválido.');
  const s=value as Record<string,unknown>;
  invariant(Array.isArray(s.weekdays) && s.weekdays.length >= 1 && s.weekdays.length <= 7
    && s.weekdays.every(d=>Number.isInteger(d) && d >= 1 && d <= 7)
    && new Set(s.weekdays).size === s.weekdays.length,'Elegí días de la semana sin repetir.');
  invariant(s.time === null || validWorkoutTime(s.time),'Usá una hora de 00:00 a 23:59 o dejala vacía.');
}
export function civilWeekday(date:string):number {
  invariant(validDate(date),'Fecha inválida para planificar.');
  return new Date(date+'T12:00:00Z').getUTCDay() || 7;
}
export function addCivilDays(date:string,amount:number):string {
  invariant(validDate(date) && Number.isInteger(amount) && Math.abs(amount)<=3660,'Rango de fechas inválido.');
  const result=new Date(date+'T12:00:00Z');result.setUTCDate(result.getUTCDate()+amount);
  return result.toISOString().slice(0,10);
}
export interface WorkoutOccurrence {
  plan:WorkoutPlan; day:PlanDay; dayIndex:number; date:string|null; time:string|null;
  reason:'scheduled'|'flexible';
}
function completed(sessions:WorkoutSession[],planId:string,dayId:string,date:string) {
  // Stable day identity, never title matching (two days may have the same name).
  return sessions.some(s=>s.status==='completed' && s.planId===planId && s.planDayId===dayId && s.date===date);
}
export function scheduledWorkouts(plans:WorkoutPlan[],sessions:WorkoutSession[],date:string):WorkoutOccurrence[] {
  const weekday=civilWeekday(date),items:WorkoutOccurrence[]=[];
  for(const plan of plans) plan.days.forEach((day,dayIndex)=>{
    validateWorkoutSchedule(day.schedule);
    if(day.schedule?.weekdays.includes(weekday) && !completed(sessions,plan.id,day.id,date))
      items.push({plan,day,dayIndex,date,time:day.schedule.time,reason:'scheduled'});
  });
  // Stable sort retains user plan/day order when two times coincide.
  return items.sort((a,b)=>(a.time??'24:00').localeCompare(b.time??'24:00'));
}
export function nextWorkout(plans:WorkoutPlan[],sessions:WorkoutSession[],date:string):WorkoutOccurrence|null {
  invariant(validDate(date),'Fecha inválida para planificar.');
  // Include +7: a completed Monday occurrence must advance to next Monday.
  for(let offset=0;offset<=7;offset++) {
    const match=scheduledWorkouts(plans,sessions,addCivilDays(date,offset))[0];
    if(match) return match;
  }
  for(const plan of plans) {
    const flexible=plan.days.map((day,dayIndex)=>({day,dayIndex})).filter(x=>!x.day.schedule);
    if(!flexible.length) continue;
    const last=sessions.filter(s=>s.status==='completed' && s.planId===plan.id && s.date<=date && s.planDayId
      && flexible.some(x=>x.day.id===s.planDayId)).sort((a,b)=>(b.endedAt??'').localeCompare(a.endedAt??'') || b.id.localeCompare(a.id))[0];
    const previous=last ? flexible.findIndex(x=>x.day.id===last.planDayId) : -1;
    const chosen=flexible[(previous+1)%flexible.length];
    return {plan,...chosen,date:null,time:null,reason:'flexible'};
  }
  return null;
}
export function scheduleLabel(schedule:WeeklyWorkoutSchedule|undefined):string {
  validateWorkoutSchedule(schedule);
  if(!schedule) return 'Días flexibles · sin hora fija';
  const names=WEEKDAYS.filter(d=>schedule.weekdays.includes(d.value)).map(d=>d.label).join(' · ');
  return names+(schedule.time?' · '+schedule.time:' · sin hora fija');
}

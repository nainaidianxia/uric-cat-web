export type Kind = 'water' | 'uric' | 'weight' | 'exercise';
export type Entry = {id:string;kind:Kind;date:string;time:string;value:number;exerciseType?:string;note?:string;createdAt:string};
export type EntryInput = Omit<Entry,'id'|'createdAt'> & {id?:string};
export type Settings = {waterGoal:number|null;exerciseGoal:number|null;remindersEnabled:boolean;reminderStart:string;reminderEnd:string;reminderInterval:number;eveningTime:string;pausedDate:string|null;petPosition:{x:number;y:number}|null};
export type Database = {version:1;entries:Entry[];settings:Settings};
export type Result<T> = {ok:true;data:T}|{ok:false;error:string};
export type API = {
  read:()=>Promise<Result<Database>>;
  saveEntry:(input:EntryInput)=>Promise<Result<Database>>;
  deleteEntry:(id:string)=>Promise<Result<Database>>;
  saveSettings:(settings:Partial<Settings>)=>Promise<Result<Database>>;
  exportFile:(format:'json'|'csv')=>Promise<Result<boolean>>;
  importFile:()=>Promise<Result<Database|null>>;
  openPanel:()=>void;
  petHover:(inside:boolean)=>void;
  petDrag:(phase:'start'|'end')=>void;
  pauseReminders:()=>Promise<Result<Database>>;
  dismissBubble:()=>void;
  onChange:(fn:(data:Database)=>void)=>()=>void;
  onBubble:(fn:(message:string)=>void)=>()=>void;
  onError:(fn:(message:string)=>void)=>()=>void;
};
declare global {interface Window {cat:API}}
export const labels:Record<Kind,string>={water:'饮水',uric:'尿酸',weight:'体重',exercise:'运动'};
export const units:Record<Kind,string>={water:'mL',uric:'μmol/L',weight:'kg',exercise:'分钟'};
export const defaults:Settings={waterGoal:null,exerciseGoal:null,remindersEnabled:false,reminderStart:'09:00',reminderEnd:'21:00',reminderInterval:90,eveningTime:'20:30',pausedDate:null,petPosition:null};
export function localDate(d=new Date()):string {return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export function localTime(d=new Date()):string {return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}
export function validDate(x:unknown):x is string {if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x))return false;const d=new Date(`${x}T12:00:00`);return !isNaN(d.getTime())&&localDate(d)===x;}
export function validTime(x:unknown):x is string {return typeof x==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(x);}
export function minutes(time:string){return Number(time.slice(0,2))*60+Number(time.slice(3));}
export function validateInput(raw:unknown):EntryInput {
  if(!raw||typeof raw!=='object')throw Error('记录格式不正确');
  const x=raw as EntryInput;
  if(!Object.hasOwn(labels,x.kind))throw Error('请选择记录类型');
  if(!validDate(x.date)||x.date>localDate()||x.date<'1900-01-01')throw Error('请选择有效日期，不能晚于今天');
  if(!validTime(x.time))throw Error('请输入有效时间');
  const limits:Record<Kind,number>={water:10000,uric:3000,weight:600,exercise:1440};
  if(typeof x.value!=='number'||!Number.isFinite(x.value)||x.value<=0||x.value>limits[x.kind])throw Error(`请输入大于 0 且不超过 ${limits[x.kind]} 的${labels[x.kind]}数值`);
  if(x.kind==='exercise'&&(typeof x.exerciseType!=='string'||!x.exerciseType.trim()||x.exerciseType.length>40))throw Error('请填写运动类型（40 字以内）');
  if(x.note!==undefined&&(typeof x.note!=='string'||x.note.length>300))throw Error('备注最多 300 字');
  if(x.id!==undefined&&(typeof x.id!=='string'||x.id.length>100||!x.id))throw Error('记录编号不正确');
  return {kind:x.kind,date:x.date,time:x.time,value:Math.round(x.value*100)/100,...(x.id?{id:x.id}:{}),...(x.kind==='exercise'?{exerciseType:x.exerciseType!.trim()}:{}),...(x.note?{note:x.note.trim()}: {})};
}
export function validateSettings(raw:unknown):Settings {
  if(!raw||typeof raw!=='object')throw Error('设置格式不正确');const s=raw as Settings;
  for(const [v,max] of [[s.waterGoal,20000],[s.exerciseGoal,1440]] as const)if(v!==null&&(typeof v!=='number'||!Number.isFinite(v)||v<=0||v>max))throw Error('目标需为有效正数，或留空');
  if(typeof s.remindersEnabled!=='boolean'||!validTime(s.reminderStart)||!validTime(s.reminderEnd)||!validTime(s.eveningTime))throw Error('提醒时间不正确');
  if(minutes(s.reminderStart)>=minutes(s.reminderEnd))throw Error('提醒结束时间需要晚于开始时间');
  if(!Number.isInteger(s.reminderInterval)||s.reminderInterval<15||s.reminderInterval>720)throw Error('提醒间隔需为 15—720 分钟');
  if(s.pausedDate!==null&&!validDate(s.pausedDate))throw Error('暂停日期不正确');
  const p=s.petPosition;if(p!==null&&(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>100000||Math.abs(p.y)>100000))throw Error('窗口位置不正确');
  return {waterGoal:s.waterGoal,exerciseGoal:s.exerciseGoal,remindersEnabled:s.remindersEnabled,reminderStart:s.reminderStart,reminderEnd:s.reminderEnd,reminderInterval:s.reminderInterval,eveningTime:s.eveningTime,pausedDate:s.pausedDate,petPosition:p?{x:Math.round(p.x),y:Math.round(p.y)}:null};
}
export function validateDatabase(raw:unknown):Database {
  if(!raw||typeof raw!=='object')throw Error('备份格式不正确');const d=raw as Database;
  if(d.version!==1||!Array.isArray(d.entries)||d.entries.length>100000)throw Error('不支持的备份版本或记录数量');
  const ids=new Set<string>();const entries=d.entries.map(e=>{const input=validateInput(e);if(!input.id||ids.has(input.id)||typeof e.createdAt!=='string'||isNaN(Date.parse(e.createdAt)))throw Error('备份包含重复或无效记录');ids.add(input.id);return {...input,id:input.id,createdAt:e.createdAt};});
  return {version:1,entries,settings:validateSettings(d.settings)};
}
export function dayEntries(entries:Entry[],date:string){return entries.filter(e=>e.date===date).sort((a,b)=>a.time.localeCompare(b.time)||a.createdAt.localeCompare(b.createdAt));}
export function summary(entries:Entry[]){const total=(kind:Kind)=>{const found=entries.filter(e=>e.kind===kind);return found.length?Math.round(found.reduce((n,e)=>n+e.value,0)*100)/100:null;};const last=(kind:Kind)=>entries.filter(e=>e.kind===kind).at(-1)?.value??null;return {water:total('water'),exercise:total('exercise'),weight:last('weight'),uric:last('uric')};}
export function dateRange(days:number,end=localDate()){const d=new Date(`${end}T12:00:00`);return Array.from({length:days},(_,i)=>{const v=new Date(d);v.setDate(d.getDate()-days+1+i);return localDate(v);});}
export function csv(db:Database){const escape=(v:unknown)=>{let s=String(v??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};return '\uFEFF'+[['日期','时间','项目','数值','单位','运动类型','备注'],...db.entries.toSorted((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)).map(e=>[e.date,e.time,labels[e.kind],e.value,units[e.kind],e.exerciseType??'',e.note??''])].map(row=>row.map(escape).join(',')).join('\r\n');}

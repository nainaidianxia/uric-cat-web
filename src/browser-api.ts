import {defaults,validateDatabase,validateInput,validateSettings,csv,localDate,type Database,type API,type Result} from './shared';
import {ReminderClock} from './reminders';

const changes=new Set<(data:Database)=>void>();
const errors=new Set<(message:string)=>void>();
const bubbles=new Set<(message:string)=>void>();
const fresh=():Database=>({version:1,entries:[],settings:{...defaults}});
let opening:Promise<IDBDatabase>|undefined;
function openDatabase(){
 return opening??=new Promise<IDBDatabase>((resolve,reject)=>{
  const request=indexedDB.open('uric-cat-personal-v1',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('records');
  request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result);};
  request.onerror=()=>reject(Error('浏览器无法打开本地存储，请检查是否允许此网站保存数据。'));
  request.onblocked=()=>reject(Error('请关闭其他旧版本页面后重试。'));
 });
}
async function transaction(change?:(data:Database)=>Database):Promise<Database>{
 const db=await openDatabase();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('records',change?'readwrite':'readonly'),records=tx.objectStore('records');
  let result:Database,issue:unknown;
  const request=records.get('current');
  request.onsuccess=()=>{try{
   const current=request.result===undefined?fresh():validateDatabase(request.result);
   result=change?validateDatabase(change(current)):current;
   if(change){records.put(current,'backup');records.put(result,'current');}
  }catch(error){issue=error;tx.abort();}};
  tx.oncomplete=()=>resolve(result);
  tx.onabort=()=>reject(issue??Error('记录未保存：浏览器存储空间不足或访问被拒绝。原有记录保持不变。'));
  tx.onerror=()=>{issue??=Error('无法读写浏览器记录，请检查存储权限或导出备份。');};
 });
}
const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('uric-cat-updates'):null;
const report=(error:unknown)=>{for(const fn of errors)fn(error instanceof Error?error.message:'记录暂时无法读取');};
if(channel)channel.onmessage=()=>void transaction().then(data=>{for(const fn of changes)fn(data);}).catch(report);
async function result<T>(fn:()=>T|Promise<T>):Promise<Result<T>>{try{return {ok:true,data:await fn()};}catch(error){return {ok:false,error:error instanceof Error?error.message:'操作未完成，请重试'};}}
async function commit(change:(data:Database)=>Database){const data=await transaction(change);for(const fn of changes)fn(data);channel?.postMessage('updated');return data;}
function confirmRestore(count:number):Promise<boolean>{
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.className='modal';
  const title=document.createElement('h2');title.textContent='恢复这份备份？';
  const copy=document.createElement('p');copy.className='settings-description';copy.textContent=`将用备份中的 ${count} 条记录替换当前浏览器记录和设置。恢复前请先导出当前记录留存。`;
  const actions=document.createElement('div');actions.className='modal-actions';
  const cancel=document.createElement('button');cancel.textContent='取消';
  const accept=document.createElement('button');accept.textContent='恢复并替换';accept.className='primary';
  const finish=(ok:boolean)=>{dialog.close();dialog.remove();resolve(ok);};
  cancel.onclick=()=>finish(false);accept.onclick=()=>finish(true);dialog.oncancel=event=>{event.preventDefault();finish(false);};
  actions.append(cancel,accept);dialog.append(title,copy,actions);document.body.append(dialog);dialog.showModal();cancel.focus();
 });
}
function chooseFile():Promise<File|null>{return new Promise(resolve=>{
 const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.hidden=true;
 const finish=(file:File|null)=>{input.remove();resolve(file);};
 input.onchange=()=>finish(input.files?.[0]??null);input.addEventListener('cancel',()=>finish(null),{once:true});document.body.append(input);input.click();
});}
const subscribe=<T>(set:Set<(value:T)=>void>,fn:(value:T)=>void)=>{set.add(fn);return()=>{set.delete(fn);};};
window.cat={
 read:()=>result(()=>transaction()),
 saveEntry:raw=>result(()=>commit(db=>{const input=validateInput(raw);const old=input.id?db.entries.find(e=>e.id===input.id):undefined;if(input.id&&!old)throw Error('记录已不存在，请刷新后重试');const entry={...input,id:old?.id??crypto.randomUUID(),createdAt:old?.createdAt??new Date().toISOString()};return {...db,entries:old?db.entries.map(e=>e.id===entry.id?entry:e):[...db.entries,entry]};})),
 deleteEntry:id=>result(()=>commit(db=>{if(!db.entries.some(e=>e.id===id))throw Error('记录已不存在');return {...db,entries:db.entries.filter(e=>e.id!==id)};})),
 saveSettings:patch=>result(()=>commit(db=>({...db,settings:validateSettings({...db.settings,...patch,petPosition:null})}))),
 pauseReminders:()=>result(()=>commit(db=>({...db,settings:{...db.settings,pausedDate:localDate()}}))),
 exportFile:format=>result(async()=>{
  if(format!=='json'&&format!=='csv')throw Error('不支持的导出格式');const data=await transaction();
  const blob=new Blob([format==='json'?JSON.stringify(data,null,2):csv(data)],{type:format==='json'?'application/json':'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`尿酸监测猫-${localDate()}.${format}`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);return true;
 }),
 importFile:()=>result(async()=>{const file=await chooseFile();if(!file)return null;if(file.size>30*1024*1024)throw Error('备份不能超过 30 MB');let raw:unknown;try{raw=JSON.parse(await file.text());}catch{throw Error('无法读取 JSON 备份，请选择正确的文件');}const data=validateDatabase(raw);if(!await confirmRestore(data.entries.length))return null;return commit(()=>({...data,settings:{...data.settings,petPosition:null}}));}),
 onChange:fn=>subscribe(changes,fn),onError:fn=>subscribe(errors,fn),onBubble:fn=>subscribe(bubbles,fn),
 openPanel:()=>{},petHover:()=>{},petDrag:()=>{},dismissBubble:()=>{},
} satisfies API;

const clock=new ReminderClock();
document.addEventListener('visibilitychange',()=>clock.resume());
setInterval(()=>{if(document.visibilityState!=='visible')return;void transaction().then(db=>{
 for(const kind of clock.tick(new Date(),db.settings))for(const fn of bubbles)fn(kind==='water'?'休息一下，喝水后记一杯吧。':'今天过得怎么样？来看看今天的记录吧。');
}).catch(()=>{});},10000);

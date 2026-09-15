import {labels,type Kind} from './shared';

type ToolContext={registerTool:(tool:{name:string;title:string;description:string;inputSchema:object;annotations:object;execute:(input:unknown)=>Promise<unknown>},options:{signal:AbortSignal})=>void|Promise<void>};
export function registerRecordTool(start:(kind:Kind)=>void){
 const context=(document as Document & {modelContext?:ToolContext}).modelContext;
 if(!context?.registerTool)return()=>{};
 const lifecycle=new AbortController();
 try{void Promise.resolve(context.registerTool({
  name:'start_record_entry',title:'打开记录表单',
  description:'打开饮水、尿酸、体重或运动的录入表单。此操作不保存记录；请在可见表单中填写并确认保存。',
  inputSchema:{type:'object',properties:{kind:{type:'string',enum:['water','uric','weight','exercise']}},required:['kind'],additionalProperties:false},
  annotations:{readOnlyHint:false,untrustedContentHint:false},
  async execute(input){
   if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==1||!('kind'in input)||typeof input.kind!=='string'||!Object.hasOwn(labels,input.kind))throw Error('请选择有效的记录类型');
   start(input.kind as Kind);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   return {status:'form_opened',kind:input.kind,saved:false};
  },
 },{signal:lifecycle.signal})).catch(()=>{});}catch{}
 return()=>lifecycle.abort();
}

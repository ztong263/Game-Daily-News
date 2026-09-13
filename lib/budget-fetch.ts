const declined=new Set<string>();
const approvals=new Map<string,Promise<boolean>>();
const pending=new Map<string,Set<Promise<Response>>>();
export type BudgetSummary={id?:string;cost:number;used:number;extra:number;over:number;pending:number;approved:boolean};
export function resetBudgetDeclines(){declined.clear();}
export function showBudgetSummary(id:string,label:string,s:BudgetSummary){
 if(!s.approved&&s.over<=0)return;
 if(typeof window==="undefined")return;
 try{if(sessionStorage.getItem("budget-summary:"+id))return;sessionStorage.setItem("budget-summary:"+id,"1");}catch{}
 window.alert(`${label}结束。本次计入 $${s.cost.toFixed(3)}，本次新增超额 $${s.extra.toFixed(3)}。今天合计 $${s.used.toFixed(3)}，累计超出每日预算 $${s.over.toFixed(3)}。`+(s.pending>0?`其中 $${s.pending.toFixed(3)} 仍为待确认预留。`:"费用含估算，以实际账单为准。"));
}
export async function finishBudgetOperation(id:string,kind:"playback"|"question"){
 await Promise.allSettled([...(pending.get(id)||[])]);
 try{const r=await fetch("/api/budget/finish",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,kind})});if(r.ok)showBudgetSummary(id,kind==="playback"?"本次播报":"本次问答",await r.json());}catch{}
}
async function request(input:RequestInfo|URL,init?:RequestInit):Promise<Response>{
 const response=await fetch(input,init);if(response.status!==402)return response;
 const body=await response.clone().json();const b=body.budgetConfirmation;if(!b?.operation)return response;
 const op=b.operation,key=op.id;if(declined.has(key))return response;
 let approval=approvals.get(key);
 if(!approval){approval=(async()=>{
  const label=op.kind==="generation"?"生成这一份早报":op.kind==="playback"?"播放这一整期早报":"完成这一次问答";
  if(!window.confirm(body.error+`\n确认后允许${label}内的所有后续付费步骤，不再逐次询问。结束后汇总费用。`)){declined.add(key);return false;}
  const r=await fetch("/api/budget/approve",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(op)});return r.ok;
 })();approvals.set(key,approval);}
 try{return await approval?await fetch(input,init):response;}finally{approvals.delete(key);}
}
export function budgetFetch(input:RequestInfo|URL,init?:RequestInit):Promise<Response>{
 const id=new Headers(init?.headers).get("x-budget-operation");const promise=request(input,init);
 if(id){const set=pending.get(id)||new Set<Promise<Response>>();pending.set(id,set);set.add(promise);void promise.finally(()=>{set.delete(promise);if(!set.size)pending.delete(id);}).catch(()=>{});}
 return promise;
}

const declined=new Set<string>();
let approval:Promise<boolean>|null=null;
export function resetBudgetDeclines(){declined.clear();}
export async function budgetFetch(input:RequestInfo|URL,init?:RequestInit):Promise<Response>{
 const response=await fetch(input,init);if(response.status!==402)return response;
 const body=await response.clone().json();const b=body.budgetConfirmation;if(!b)return response;
 const key=b.day+":"+b.limit;if(declined.has(key))return response;
 if(!approval)approval=(async()=>{
  if(!window.confirm(body.error+"\n确认后仅增加到本次预计需要的额度；后续超出会再次询问。")){declined.add(key);return false;}
  const r=await fetch("/api/budget/approve",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({day:b.day,limit:b.limit})});return r.ok;
 })();
 let allowed=false;try{allowed=await approval;}finally{approval=null;}
 return allowed?fetch(input,init):response;
}

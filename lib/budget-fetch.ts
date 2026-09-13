const pending=new Map<string,Set<Promise<Response>>>();
export type BudgetSummary={id?:string;cost:number;used:number;extra:number;over:number;pending:number;approved:boolean};
// Compatibility for existing callers; the budget is now informational only.
export function resetBudgetDeclines(){}
export function showBudgetSummary(..._summary: [string,string,BudgetSummary]){
 void _summary;
 if(typeof window!=="undefined")window.dispatchEvent(new Event("budget-updated"));
}
export async function finishBudgetOperation(id:string,kind:"playback"|"question"){
 await Promise.allSettled([...(pending.get(id)||[])]);
 try{const r=await fetch("/api/budget/finish",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,kind})});if(r.ok)showBudgetSummary(id,kind,await r.json());}catch{}
}
export function budgetFetch(input:RequestInfo|URL,init?:RequestInit):Promise<Response>{
 const id=new Headers(init?.headers).get("x-budget-operation");const promise=fetch(input,init);
 if(id){const set=pending.get(id)||new Set<Promise<Response>>();pending.set(id,set);set.add(promise);void promise.finally(()=>{set.delete(promise);if(!set.size)pending.delete(id);}).catch(()=>{});}
 return promise;
}

import test from "node:test";
import assert from "node:assert/strict";
import {budgetFetch,resetBudgetDeclines} from "../lib/budget-fetch";
test("budget confirmation only retries after explicit approval and remembers cancellation",async()=>{
 const oldFetch=globalThis.fetch,oldWindow=Object.getOwnPropertyDescriptor(globalThis,"window");let approve=false,prompts=0,grants=0,requests=0;
 Object.defineProperty(globalThis,"window",{configurable:true,value:{confirm(){prompts++;return approve;}}});
 globalThis.fetch=async(url)=>{if(url==="/api/budget/approve"){grants++;return Response.json({ok:true});}requests++;return grants?Response.json({ok:true}):Response.json({error:"Confirm",budgetConfirmation:{day:"2026-09-13",limit:.6}},{status:402});};
 try{resetBudgetDeclines();assert.equal((await budgetFetch("/api/question")).status,402);await budgetFetch("/api/question");assert.equal(prompts,1);assert.equal(grants,0);approve=true;resetBudgetDeclines();assert.equal((await budgetFetch("/api/question")).status,200);assert.equal(grants,1);assert.equal(requests,4);}finally{globalThis.fetch=oldFetch;if(oldWindow)Object.defineProperty(globalThis,"window",oldWindow);else Reflect.deleteProperty(globalThis,"window");resetBudgetDeclines();}
});

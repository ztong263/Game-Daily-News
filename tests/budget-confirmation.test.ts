import test from "node:test";
import assert from "node:assert/strict";
import {budgetFetch,showBudgetSummary} from "../lib/budget-fetch";
test("budget does not prompt or retry requests; completion only refreshes settings",async()=>{
 const oldFetch=globalThis.fetch,oldWindow=Object.getOwnPropertyDescriptor(globalThis,"window");let requests=0,updates=0;
 Object.defineProperty(globalThis,"window",{configurable:true,value:{confirm(){throw Error("No confirmation allowed");},alert(){throw Error("No alert allowed");},dispatchEvent(){updates++;}}});
 globalThis.fetch=async()=>{requests++;return Response.json({error:"provider billing error"},{status:402});};
 try{
  assert.equal((await budgetFetch("/api/question")).status,402);assert.equal(requests,1);
  showBudgetSummary("one","Playback",{cost:1,used:2,extra:1,over:1.5,pending:0,approved:true});assert.equal(updates,1);
 }finally{globalThis.fetch=oldFetch;if(oldWindow)Object.defineProperty(globalThis,"window",oldWindow);else Reflect.deleteProperty(globalThis,"window");}
});

import test from "node:test";
import assert from "node:assert/strict";
import {createClient} from "@supabase/supabase-js";
import {DailyBudget,reserveEntry,totals,type Ledger} from "../lib/cloud/budget";
import {budgetFixture} from "./budget-fixture";
import {budgetOperation} from "../lib/cloud/budget-operation";
test("daily budget enforces generation reserve, total headroom, pending charges and idempotency",()=>{
 const l:Ledger={revision:0,entries:{}};
 reserveEntry(l,"one",.2,"generation");
 reserveEntry(l,"two",.26,"listening");assert.throws(()=>reserveEntry(l,"three",.02,"listening"));
 assert.throws(()=>reserveEntry(l,"one",.01,"listening"));assert.equal(totals(l).pending,.46);
 l.approvedLimit=.6;reserveEntry(l,"confirmed",.1,"generation");assert.equal(totals(l).used,.56);
});
test("approval covers all steps of only one operation and closing revokes further spending",async()=>{
 const old=globalThis.fetch,mock=budgetFixture();globalThis.fetch=async(i,init)=>{const r=mock(new URL(String(i)),init);if(!r)throw Error("Unexpected request");return r;};
 try{
  const db=createClient("https://fixture.supabase.co","test-only"),budget=new DailyBudget(db,"owner","2026-09-13"),op={id:"one",kind:"playback" as const};
  await budget.reserve(.46,"listening");
  await assert.rejects(budgetOperation.run(op,()=>budget.reserve(.03,"listening")));
  await budget.approveOperation(op);
  await budgetOperation.run(op,async()=>{await budget.reserve(.1,"listening","a");await budget.reserve(.2,"listening","b");});
  await assert.rejects(budgetOperation.run({id:"other",kind:"question"},()=>budget.reserve(.01,"listening")));
  const summary=await budget.finishOperation(op);assert.equal(summary.cost,.3);assert.equal(summary.approved,true);
  await assert.rejects(budgetOperation.run(op,()=>budget.reserve(.01,"listening")));
 }finally{globalThis.fetch=old;}
});
test("concurrent requests cannot overspend; settlement and new Sydney-day ledger are isolated",async()=>{
 const old=globalThis.fetch,mock=budgetFixture();globalThis.fetch=async(i,init)=>{const r=mock(new URL(String(i)),init);if(!r)throw Error("Unexpected request");return r;};
 try{
  const db=createClient("https://fixture.supabase.co","test-only"),a=new DailyBudget(db,"owner","2026-09-13");
  const results=await Promise.allSettled([a.reserve(.3,"listening","a"),a.reserve(.3,"listening","b")]);
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
  const id=(results.find(r=>r.status==="fulfilled") as PromiseFulfilledResult<string>).value;
  await a.settle(id,.1);await a.settle(id,0);assert.equal((await a.status()).used,.1);
  assert.equal((await new DailyBudget(db,"owner","2026-09-14").status()).used,0);
 }finally{globalThis.fetch=old;}
});

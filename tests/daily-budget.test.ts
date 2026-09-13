import test from "node:test";
import assert from "node:assert/strict";
import {createClient} from "@supabase/supabase-js";
import {DailyBudget,reserveEntry,totals,type Ledger} from "../lib/cloud/budget";
import {budgetFixture} from "./budget-fixture";
test("daily budget enforces generation reserve, total headroom, pending charges and idempotency",()=>{
 const l:Ledger={revision:0,entries:{}};
 reserveEntry(l,"one",.2,"generation");assert.throws(()=>reserveEntry(l,"two",.001,"generation"));
 reserveEntry(l,"two",.26,"listening");assert.throws(()=>reserveEntry(l,"three",.02,"listening"));
 assert.throws(()=>reserveEntry(l,"one",.01,"listening"));assert.equal(totals(l).pending,.46);
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

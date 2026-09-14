import test from "node:test";
import assert from "node:assert/strict";
import {preloadAll} from "../lib/realtime/preload";
test("whole-brief preparation waits for every download and bounds concurrency",async()=>{
 let running=0,maximum=0,done=0;
 await preloadAll(8,async()=>{running++;maximum=Math.max(maximum,running);await new Promise(r=>setTimeout(r,1));running--;},()=>false,n=>{done=n;});
 assert.equal(maximum,2);assert.equal(done,8);
});
test("cancel stops scheduling more synthesis and a failed preload never counts as ready",async()=>{
 let cancelled=false,calls=0;
 await preloadAll(8,async()=>{calls++;cancelled=true;},()=>cancelled,()=>{});assert.equal(calls,1);
 await assert.rejects(preloadAll(8,async()=>{throw Error("failed");},()=>false,()=>{}),/failed/);
});

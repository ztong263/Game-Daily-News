import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readdir,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {POST} from "../app/api/realtime/usage/route";
test("voice usage preserves token details and deduplicates responses",async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),"game-voice-usage-"));const original=process.env.DATA_DIR;process.env.DATA_DIR=directory;
 try{const payload={runId:crypto.randomUUID(),date:"2026-09-10",briefId:"test",responseId:"response-test",status:"completed",usage:{total_tokens:150,input_tokens:100,output_tokens:50,input_token_details:{text_tokens:80,audio_tokens:20,cached_tokens:10},output_token_details:{text_tokens:10,audio_tokens:40}}};
 const send=()=>POST(new Request("http://localhost/api/realtime/usage",{method:"POST",body:JSON.stringify(payload)}));
 assert.equal((await send()).status,200);assert.equal((await send()).status,200);
 const files=await readdir(path.join(directory,"telemetry/voice"));assert.equal(files.length,1);
 const saved=JSON.parse(await readFile(path.join(directory,"telemetry/voice",files[0]),"utf8"));assert.deepEqual(saved.usage,payload.usage);
 }finally{if(original===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=original;assert.ok(directory.startsWith(path.join(tmpdir(),"game-voice-usage-")));await rm(directory,{recursive:true,force:true});}
});

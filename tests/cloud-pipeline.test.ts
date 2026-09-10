import test from "node:test";
import assert from "node:assert/strict";
import {createClient} from "@supabase/supabase-js";
import {CloudPipeline} from "../lib/cloud/pipeline";
import {defaultPreferences} from "../lib/editorial/preferences";
import {PipelinePending,pipelineStorage} from "../lib/editorial/storage-context";
import {editorialResponse} from "../lib/editorial/response";
import {fingerprint} from "../lib/cloud/fingerprint";
test("background response resumes by id and completed checkpoints incur no new API calls",async()=>{
 const original=globalThis.fetch,key=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY="test-only";
 const cache=new Map<string,unknown>();let creates=0,retrieves=0;
 globalThis.fetch=async(input,init)=>{
  const url=new URL(String(input));
  if(url.hostname==="api.openai.com"){
   if(init?.method==="POST"){creates++;assert.equal(JSON.parse(String(init.body)).background,true);return Response.json({object:"response",id:"resp_test",status:"in_progress",output:[]});}
   retrieves++;return Response.json({object:"response",id:"resp_test",status:"completed",output:[{type:"message",content:[{type:"output_text",text:"Synthetic result",annotations:[]}]}]});
  }
  if(init?.method==="POST"){const b=JSON.parse(String(init.body));cache.set(b.cache_key,b.payload);return new Response(null,{status:201});}
  const name=url.searchParams.get("cache_key")!.slice(3);return Response.json(cache.has(name)?{payload:cache.get(name),expires_at:null}:null);
 };
 try{
  const storage=new CloudPipeline(createClient("https://fixture.supabase.co","test-only"),"owner","run",defaultPreferences);
  const request={model:"gpt-5.4-mini",input:"Synthetic fixture"};
  await assert.rejects(pipelineStorage.run(storage,()=>editorialResponse(request)),PipelinePending);
  const answer=await pipelineStorage.run(storage,()=>editorialResponse(request));assert.equal(answer.output_text,"Synthetic result");
  await pipelineStorage.run(storage,()=>editorialResponse(request));assert.equal(creates,1);assert.equal(retrieves,1);
  assert.equal(pipelineStorage.getStore(),undefined);
  for(const k of cache.keys())cache.set(k,{starting:true});
  await assert.rejects(storage.response(request),/UNCERTAIN_RESPONSE_START/);assert.equal(creates,1);
  assert.equal(fingerprint({a:1,b:2}),fingerprint({b:2,a:1}));
 }finally{globalThis.fetch=original;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});

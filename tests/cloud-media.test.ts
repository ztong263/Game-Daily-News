import test from "node:test";
import assert from "node:assert/strict";
import {createClient} from "@supabase/supabase-js";
import {CloudMedia} from "../lib/cloud/media";
import {cloudSession,cloudVoiceUsage} from "../lib/cloud/live";
import {budgetFixture} from "./budget-fixture";
test("cloud speech caches once, scopes downloads, records usage and keeps microphone manual",async()=>{
 const oldFetch=globalThis.fetch,oldKey=process.env.OPENAI_API_KEY,oldMode=process.env.EDITORIAL_MODE;
 process.env.OPENAI_API_KEY="test-only";process.env.EDITORIAL_MODE="production";
 const owner="11111111-1111-4111-8111-111111111111";
 const brief={schemaVersion:1,id:"fixture",version:"v1",date:"2026-09-10",timezone:"Australia/Sydney",generatedAt:"2026-09-10T00:00:00Z",locale:"zh-CN",title:"Fixture",items:[{id:"one",category:"industry",headline:"Fixture",summary:"Fixture",whyItMatters:"Fixture",userRelevance:"Fixture",sources:[{title:"Fixture",url:"https://example.com",publisher:"Fixture",publishedAt:null,kind:"primary"}],paragraphs:["Synthetic test narration"],uncertainty:null,design:null,workflow:null}],todaysSignal:{text:"Fixture",itemIds:[]},editorNote:""};
 let audioRow:{object_path:string;metadata:{text:string}}|null=null;let synthesis=0;let usage=0;let downloads=0;let available=true;
 const budgetMock=budgetFixture();
 globalThis.fetch=async(input,init)=>{
  const url=new URL(String(input));const method=init?.method||"GET";
  const budgetResult=budgetMock(url,init);if(budgetResult)return budgetResult;
  if(url.hostname==="api.openai.com"){
   if(url.pathname.endsWith("/audio/speech")){synthesis++;return new Response(new Uint8Array([1,2,3]));}
   assert.ok(init?.body instanceof FormData);const config=JSON.parse(String(init.body.get("session")));
   assert.equal(config.audio.input.turn_detection,null);return new Response("v=0\r\n");
  }
  if(url.pathname.endsWith("/gd_briefs")){assert.equal(url.searchParams.get("owner_id"),"eq."+owner);return Response.json({payload:brief});}
  if(url.pathname.endsWith("/gd_claim_speech"))return Response.json(available);
  if(url.pathname.endsWith("/gd_pipeline_cache")){assert.equal(url.searchParams.get("owner_id"),"eq."+owner);return Response.json({payload:{text:"Previously translated narration"}});}
  if(url.pathname.endsWith("/gd_audio")){
   if(method==="GET"){assert.equal(url.searchParams.get("owner_id"),"eq."+owner);return Response.json(audioRow);}
   audioRow=JSON.parse(String(init?.body));return new Response(null,{status:201});
  }
  if(url.pathname.endsWith("/gd_usage")){usage++;assert.equal(JSON.parse(String(init?.body)).owner_id,owner);return new Response(null,{status:201});}
  if(url.pathname.endsWith("/gd_jobs"))return method==="GET"?Response.json(null):new Response(null,{status:204});
  if(url.pathname.includes("/storage/v1/object/")){if(method==="GET"){downloads++;return new Response(new Uint8Array([1,2,3]));}return Response.json({Key:"fixture"});}
  throw Error("Unexpected test endpoint");
 };
 const media=new CloudMedia(createClient("https://fixture.supabase.co","test-only"),owner);
 try{
  const request={date:brief.date,version:"v1",index:0,language:"zh"};
  const first=await media.speech(request);assert.equal(first.cacheHit,false);
  assert.equal((await media.speech(request)).cacheHit,true);assert.equal(synthesis,1);assert.equal(usage,1);
  assert.equal((await media.download(first.url.split("key=")[1])).status,200);assert.equal(downloads,1);
  audioRow!.object_path="other-owner/audio.mp3";await assert.rejects(media.download(first.url.split("key=")[1]));assert.equal(downloads,1);
  audioRow=null;available=false;assert.equal((await media.speech(request)).pending,true);assert.equal(synthesis,1);
  await assert.rejects(media.speech({...request,version:"old"}));assert.equal(synthesis,1);
  assert.equal((await cloudSession(media,{...request,briefId:brief.id,sdp:"v=0"})).status,200);
  await cloudVoiceUsage(media,{runId:owner,date:brief.date,briefId:brief.id,responseId:"response",status:"completed",usage:{input_tokens:10,output_tokens:20,total_tokens:30}});assert.equal(usage,2);
  available=true;audioRow=null;
  const english=await media.speech({...request,language:"en"});
  assert.equal(english.text,"Previously translated narration");assert.equal(synthesis,2);
 }finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;if(oldMode===undefined)delete process.env.EDITORIAL_MODE;else process.env.EDITORIAL_MODE=oldMode;}
});

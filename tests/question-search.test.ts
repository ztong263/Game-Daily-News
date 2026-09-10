import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,writeFile,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {POST} from "../app/api/realtime/search/route";
test("question search verifies version, exposes source links and records actual usage",async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),"question-search-"));
 const original={DATA_DIR:process.env.DATA_DIR,OPENAI_API_KEY:process.env.OPENAI_API_KEY,EDITORIAL_MODE:process.env.EDITORIAL_MODE};const fetch=globalThis.fetch;
 Object.assign(process.env,{DATA_DIR:dir,OPENAI_API_KEY:"test-only",EDITORIAL_MODE:"production"});let calls=0;
 const brief={schemaVersion:1,id:"test",version:"v1",date:"2026-09-10",timezone:"Australia/Sydney",generatedAt:"2026-09-10T00:00:00Z",locale:"zh-CN",title:"Test",items:[{id:"one",category:"industry",headline:"Test",summary:"Test",whyItMatters:"Test",userRelevance:"Test",sources:[{title:"Source",url:"https://example.com",publisher:"Test",publishedAt:null,kind:"primary"}],paragraphs:["Test"],uncertainty:null,design:null,workflow:null}],todaysSignal:{text:"Test",itemIds:[]},editorNote:""};
 globalThis.fetch=async()=>{calls++;return Response.json({id:"r1",object:"response",model:"gpt-5.4-mini",status:"completed",usage:{input_tokens:100,output_tokens:50,total_tokens:150},output:[{type:"web_search_call",status:"completed"},{type:"message",role:"assistant",content:[{type:"output_text",text:"Verified result",annotations:[{type:"url_citation",title:"Official",url:"https://example.com",start_index:0,end_index:8}]}]}]});};
 const request=(version="v1")=>new Request("http://localhost/api/realtime/search",{method:"POST",body:JSON.stringify({date:brief.date,version,query:"latest update",language:"zh"})});
 try{
   await writeFile(path.join(dir,brief.date+".json"),JSON.stringify({status:"ready",brief}));
   assert.equal((await POST(request("old"))).status,409);assert.equal(calls,0);
   const result=await POST(request());assert.equal(result.status,200);assert.equal((await result.json()).sources[0].url,"https://example.com");
   const usage=JSON.parse((await readFile(path.join(dir,"telemetry","editorial.jsonl"),"utf8")).trim());assert.equal(usage.stage,"question-search");assert.equal(usage.totalTokens,150);assert.equal(usage.toolCalls,1);
   process.env.EDITORIAL_MODE="mock";assert.equal((await POST(request())).status,409);assert.equal(calls,1);
 }finally{globalThis.fetch=fetch;for(const [key,value] of Object.entries(original)){if(value===undefined)delete process.env[key];else process.env[key]=value;}assert.ok(dir.startsWith(path.join(tmpdir(),"question-search-")));await rm(dir,{recursive:true,force:true});}
});

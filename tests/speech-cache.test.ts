import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {POST,GET} from "../app/api/speech/route";
test("speech synthesizes once and serves persisted audio without another model call",async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),"game-speech-"));const original={dir:process.env.DATA_DIR,key:process.env.OPENAI_API_KEY,mode:process.env.EDITORIAL_MODE};const fetch=globalThis.fetch;
 process.env.DATA_DIR=dir;process.env.OPENAI_API_KEY="test-only";process.env.EDITORIAL_MODE="production";let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response(new Uint8Array([1,2,3]),{headers:{"Content-Type":"audio/mpeg"}});};
 const brief={schemaVersion:1,id:"test",version:"v1",date:"2026-09-10",timezone:"Australia/Sydney",generatedAt:"2026-09-10T00:00:00Z",locale:"zh-CN",title:"Test",items:[{id:"one",category:"industry",headline:"Test",summary:"Test",whyItMatters:"Test",userRelevance:"Test",sources:[{title:"Source",url:"https://example.com",publisher:"Test",publishedAt:null,kind:"primary"}],paragraphs:["Test narration"],uncertainty:null,design:null,workflow:null}],todaysSignal:{text:"Test",itemIds:[]},editorNote:""};
 const request=()=>new Request("http://localhost/api/speech",{method:"POST",body:JSON.stringify({date:brief.date,version:brief.version,index:0,language:"zh"})});
 try{await writeFile(path.join(dir,brief.date+".json"),JSON.stringify({brief,status:"ready"}));const first=await POST(request());assert.equal(first.status,200);assert.equal((await first.json()).cacheHit,false);
 const second=await POST(request());const data=await second.json();assert.equal(data.cacheHit,true);assert.equal(calls,1);assert.equal((await GET(new Request("http://localhost"+data.url))).status,200);assert.equal(calls,1);
 }finally{globalThis.fetch=fetch;for(const [key,value] of Object.entries({DATA_DIR:original.dir,OPENAI_API_KEY:original.key,EDITORIAL_MODE:original.mode})){if(value===undefined)delete process.env[key];else process.env[key]=value;}assert.ok(dir.startsWith(path.join(tmpdir(),"game-speech-")));await rm(dir,{recursive:true,force:true});}
});
